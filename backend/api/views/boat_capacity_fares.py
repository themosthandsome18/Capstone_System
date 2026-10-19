"""The "Boat Capacity and Fare" tiers an admin can manage: add, rename, retire,
bring back, reorder.

A record keeps its tier as TEXT (TouristRecord.boat_capacity_fare), exactly as it
was when the record was saved. Nothing points at a tier by id. So:

* A tier is never deleted here (there is no DELETE endpoint): it is deactivated.
* A tier can be RENAMED. Renaming never touches a record: the record keeps the
  text it already holds (the form shows it as "(not in the list)"). So when
  records hold the old text, the rename needs a CONFIRMATION, as the rename of a
  registration option does: the client must send confirm_affected_records equal
  to the number the SERVER counted, or the answer is 409 confirm_required with
  that number. When no record holds the text, the rename goes through at once.
  The ActivityLog keeps the old name, the new name and how many records were left
  on the old text: it is the only trace of where they went.
* There is no "cannot deactivate the last one" guard: the field is optional on
  the form, so a list with no active tier is allowed.

Every write is written to the ActivityLog, inside the same transaction as the
write itself: no write without its trace, and no trace for a write that failed.

The rename. The check "how many records hold the old text" and the write of the
new name are ONE statement (an UPDATE that only matches while that number is still
exactly the one the server counted and the client confirmed), run inside one atomic
block under the advisory lock. The lock keeps two admins' writes in turn; it does
not stop a booking from being saved, because a booking does not take it. What the
single statement gives is that the count and the write cannot be separated by
anything: if a booking holding the old text is saved in the gap, the number no
longer matches, nothing is renamed, and the answer is 409 confirm_required with the
new number. What it cannot give, and nothing here can, is a promise about records
saved AFTER the rename: an app that was not yet updated keeps sending the old text.
That state is allowed on purpose.

NOTHING HERE WRITES TO TouristRecord. Records are only counted.
"""
from functools import wraps

from django.db import connection, transaction
from django.db.models import Count, IntegerField, Max, OuterRef, Subquery
from django.db.models.functions import Coalesce
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
from api.services.activity import LABEL_MAX, log_activity, shorten_label
from api.views.reference_options import _parse_confirmation, clean_name, name_key

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


def _rename_if_still_held_by(fare_id, old_name, new_name, expected):
    """Rename in ONE statement that only matches while exactly `expected` records
    hold the old text. -> the number of rows changed (0 = refused: the number
    changed in the meantime, or the tier is no longer called that)."""
    held = (
        TouristRecord.objects.filter(boat_capacity_fare=OuterRef("name"))
        .order_by()
        .values("boat_capacity_fare")
        .annotate(n=Count("pk"))
        .values("n")
    )
    return (
        BoatCapacityFare.objects.filter(pk=fare_id, name=old_name)
        .annotate(held_now=Coalesce(Subquery(held, output_field=IntegerField()), 0))
        .filter(held_now=expected)
        .update(name=new_name)
    )


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


LABEL_PREFIX = "Boat Capacity and Fare tier "


def _rename_note(old_name, new_name, held_by):
    """The part of the rename's log label after the prefix. The two names can be 160
    characters each, which with the rest would be more than the 255 the column holds
    (a 500 on PostgreSQL), so each is shortened to its share. The end of the sentence,
    how many records keep the old text, is what the label exists to say and stays whole."""
    template = "renamed: '{}' to '{}'; {} record(s) keep the old text (no record was changed)"
    overhead = len(LABEL_PREFIX) + len(template.format("", "", held_by))
    share = max((LABEL_MAX - overhead) // 2, 20)
    return template.format(shorten_label(old_name, share), shorten_label(new_name, share), held_by)


def _log(request, fare, action, text, record_id=None):
    log_activity(
        request,
        MODULE_TOURISM,
        action,
        fare,
        # (the reorder label lists every tier: the nine real ones make 439 characters)
        label=shorten_label(LABEL_PREFIX + text),
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

        # How many records hold the old text, counted HERE (never taken from the request).
        held_by = _count_holders(old_name)
        if held_by:
            confirmed = _parse_confirmation(request.data.get("confirm_affected_records"))
            if confirmed is None or confirmed != held_by:
                return _confirm_required(held_by)

        # The count and the write are this one statement (see the module note): it
        # renames only while the number is still exactly the one counted above.
        if not _rename_if_still_held_by(fare.pk, old_name, new_name, held_by):
            return _confirm_required(_count_holders(old_name))

        fare.refresh_from_db()
        _log(
            request,
            fare,
            ACTION_UPDATE,
            _rename_note(old_name, new_name, held_by),
        )
        count = _count_holders(new_name)
    return Response(_item(fare, count))


def _confirm_required(held_by):
    # Words for a person, not names of API fields: the front end reads `code` and
    # `record_count`, never this message.
    return _error(
        f"{held_by} record(s) hold the old text of this tier. Renaming the tier does not change "
        "them: they keep the old text, and it will show as (not in the list) in their own dropdown. "
        "The rename needs a confirmation.",
        http_status=status.HTTP_409_CONFLICT,
        code="confirm_required",
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
