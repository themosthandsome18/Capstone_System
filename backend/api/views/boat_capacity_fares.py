"""The "Boat Capacity and Fare" tiers an admin can manage: add, rename, retire,
bring back, reorder.

A record keeps its tier as TEXT (TouristRecord.boat_capacity_fare), exactly as it
was when the record was saved. Nothing points at a tier by id. So:

* A tier is never deleted here (there is no DELETE endpoint): it is deactivated.
* A tier whose text some record holds is not RENAMED (409 text_in_use): the
  record would keep the old text and be left holding a text that is not in the
  list. The admin adds a new tier and deactivates the old one instead.
* There is no "cannot deactivate the last one" guard: the field is optional on
  the form, so a list with no active tier is allowed.

Every write is written to the ActivityLog, inside the same transaction as the
write itself: no write without its trace, and no trace for a write that failed.

The rename guard. The check "no record holds this text" and the write of the new
name are ONE statement (an UPDATE that only matches while no record holds the
text), run inside one atomic block under the advisory lock. The lock keeps two
admins' writes in turn; it does not stop a booking from being saved, because a
booking does not take it. What the single statement gives is that the check and
the write cannot be separated by anything: there is no moment "after counting,
before writing" for a booking to slip into. What it cannot give, and nothing here
can, is a promise about records saved AFTER the rename: an app that was not yet
updated keeps sending the old text. That state is allowed on purpose (the form
shows such a text as "not in the list").
"""
from functools import wraps

from django.db import connection, transaction
from django.db.models import Count, Exists, Max, OuterRef
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_UPDATE,
    MODULE_TOURISM,
    ROLE_ADMIN,
    BoatCapacityFare,
    TouristRecord,
)
from api.permissions import get_user_role
from api.services.activity import log_activity
from api.views.reference_options import clean_name, name_key

LOCK_ID = 7100006
ORDER_STEP = 10
NAME_MAX_LENGTH = BoatCapacityFare._meta.get_field("name").max_length  # 160, as on a record


def admin_required(view):
    """Only the system admin. Not the tourism role."""

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            return Response(
                {"detail": "Only the system admin can manage boat capacity and fare tiers."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return view(request, *args, **kwargs)

    return wrapped


def _error(detail, http_status=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": detail, **extra}, status=http_status)


def _lock():
    """Put the admin writers in turn, so that two of them cannot both pass the
    same-name check. PostgreSQL only; SQLite already allows one writer at a time."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [LOCK_ID])


# -- reading the records that hold a text ---------------------------------------


def _holder_counts():
    """{text: number of records holding exactly that text}, ONE grouped query.
    order_by() clears the model's default ordering, which would otherwise join
    the GROUP BY and split the groups."""
    rows = (
        TouristRecord.objects.exclude(boat_capacity_fare="")
        .order_by()
        .values("boat_capacity_fare")
        .annotate(n=Count("pk"))
    )
    return {row["boat_capacity_fare"]: row["n"] for row in rows}


def _count_holders(name):
    """How many records hold exactly this text (the early, friendly check)."""
    return TouristRecord.objects.filter(boat_capacity_fare=name).count()


def _rename_unless_held(fare_id, old_name, new_name):
    """Rename in ONE statement that only matches while no record holds the old
    text. -> the number of rows changed (0 = refused: held, or no longer there)."""
    held = Exists(TouristRecord.objects.filter(boat_capacity_fare=OuterRef("name")))
    return BoatCapacityFare.objects.filter(pk=fare_id, name=old_name).filter(~held).update(name=new_name)


def _item(fare, record_count):
    return {
        "id": fare.id,
        "name": fare.name,
        "display_order": fare.display_order,
        "is_active": fare.is_active,
        "record_count": record_count,
    }


def _name_taken(name, excluding=None):
    key = name_key(name)  # the Excel import's own comparison
    for fare in BoatCapacityFare.objects.all():
        if fare.pk != excluding and name_key(fare.name) == key:
            return True
    return False


def _log(request, fare, action, text, record_id=None):
    log_activity(
        request,
        MODULE_TOURISM,
        action,
        fare,
        label=f"Boat Capacity and Fare tier {text}",
        record_id=fare.pk if record_id is None else record_id,
    )


def _clean_name(value):
    """-> (error, name). Trimmed, inner runs of spaces made one."""
    if not isinstance(value, str):
        return "name must be text.", None
    name = clean_name(value)
    if not name:
        return "A name is required.", None
    if len(name) > NAME_MAX_LENGTH:
        return f"The name is longer than {NAME_MAX_LENGTH} characters.", None
    return None, name


_DUPLICATE = "Another tier already has this name (capitals and spaces do not count)."


# -- the endpoints -------------------------------------------------------------


@api_view(["GET", "POST"])
@admin_required
def boat_capacity_fare_list(request):
    if request.method == "GET":
        counts = _holder_counts()
        return Response([_item(f, counts.get(f.name, 0)) for f in BoatCapacityFare.objects.all()])

    error, name = _clean_name(request.data.get("name"))
    if error:
        return _error(error, name=[error])

    with transaction.atomic():
        _lock()
        if _name_taken(name):
            return _error(_DUPLICATE, name=["Already used."])
        top = BoatCapacityFare.objects.aggregate(top=Max("display_order"))["top"]
        fare = BoatCapacityFare.objects.create(name=name, display_order=(top or 0) + ORDER_STEP, is_active=True)
        _log(request, fare, ACTION_CREATE, f"added: '{fare.name}'")
        count = _count_holders(fare.name)  # records may already hold this text
    return Response(_item(fare, count), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@admin_required
def boat_capacity_fare_detail(request, fare_id):
    # Only the name can be edited. is_active and display_order have their own endpoints.
    error, new_name = _clean_name(request.data.get("name"))
    if error:
        return _error(error, name=[error])

    with transaction.atomic():
        _lock()
        try:
            fare = BoatCapacityFare.objects.get(pk=fare_id)
        except BoatCapacityFare.DoesNotExist:
            raise Http404("No such tier.")
        old_name = fare.name

        if new_name == old_name:
            return Response(_item(fare, _count_holders(old_name)))
        if _name_taken(new_name, excluding=fare.pk):
            return _error(_DUPLICATE, name=["Already used."])

        held_by = _count_holders(old_name)
        if held_by:
            return _in_use(old_name, held_by)

        # The check and the write are this one statement (see the module note).
        if not _rename_unless_held(fare.pk, old_name, new_name):
            return _in_use(old_name, _count_holders(old_name))

        fare.refresh_from_db()
        _log(request, fare, ACTION_UPDATE, f"renamed: '{old_name}' to '{new_name}' (no record held the old text)")
        count = _count_holders(new_name)
    return Response(_item(fare, count))


def _in_use(name, held_by):
    return _error(
        f"The text of this tier is saved on {held_by} record(s), so it cannot be renamed: "
        "those records would keep the old text. Add a new tier with the new wording and "
        "deactivate this one.",
        http_status=status.HTTP_409_CONFLICT,
        code="text_in_use",
        record_count=held_by,
    )


def _set_active(request, fare_id, active):
    with transaction.atomic():
        _lock()
        try:
            fare = BoatCapacityFare.objects.get(pk=fare_id)
        except BoatCapacityFare.DoesNotExist:
            raise Http404("No such tier.")
        if fare.is_active != active:
            fare.is_active = active
            fare.save(update_fields=["is_active"])
            _log(
                request,
                fare,
                ACTION_UPDATE,
                f"brought back (active): '{fare.name}'" if active else f"deactivated: '{fare.name}'",
            )
        count = _count_holders(fare.name)
    return Response(_item(fare, count))


@api_view(["POST"])
@admin_required
def boat_capacity_fare_deactivate(request, fare_id):
    return _set_active(request, fare_id, False)


@api_view(["POST"])
@admin_required
def boat_capacity_fare_reactivate(request, fare_id):
    return _set_active(request, fare_id, True)


@api_view(["POST"])
@admin_required
def boat_capacity_fare_reorder(request):
    """The body is {"ids": [...]}: ALL the existing ids, in the new order. Anything
    else is refused BEFORE a single row is written."""
    ids = request.data.get("ids") if hasattr(request.data, "get") else None
    if not isinstance(ids, list) or not ids or any(isinstance(i, bool) or not isinstance(i, int) for i in ids):
        return _error("ids must be a non-empty list of tier ids.")

    with transaction.atomic():
        _lock()
        existing = {fare.pk: fare for fare in BoatCapacityFare.objects.all()}
        if len(set(ids)) != len(ids) or set(ids) != set(existing):
            return _error("ids must list every existing tier exactly once, with no other id.")

        ordered = [existing[fare_id] for fare_id in ids]
        for position, fare in enumerate(ordered, start=1):
            fare.display_order = position * ORDER_STEP
        BoatCapacityFare.objects.bulk_update(ordered, ["display_order"])
        _log(
            request,
            ordered[0],
            ACTION_UPDATE,
            "reordered: " + ", ".join(f"'{fare.name}'" for fare in ordered),
            record_id="reorder",
        )
        counts = _holder_counts()
    return Response([_item(fare, counts.get(fare.name, 0)) for fare in ordered])
