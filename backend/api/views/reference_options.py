"""Registration options an admin can manage: add, rename, retire, bring back.

The four lists (itinerary, vehicle, boat, visit purpose) are choices that
records point at. They are NEVER deleted here: the foreign keys are PROTECT
and a choice with history is retired (is_active=False) instead, so it leaves
the dropdown of new registrations but stays on old records and in the reports.

Every change is written to the ActivityLog, the opposite of the no-show sweep
that changes records and leaves no trace.
"""
from functools import wraps

from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.db.models import Count, Max
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_UPDATE,
    MODULE_TOURISM,
    ROLE_ADMIN,
    BoatType,
    Itinerary,
    TouristRecord,
    TravelMode,
    VisitPurpose,
)
from api.permissions import get_user_role
from api.services.activity import log_activity
from api.services.tourism import MOBILE_REFERENCE_TABLES_CACHE_KEY

KINDS = {
    "itinerary": {"model": Itinerary, "fk": "itinerary", "label": "Travel itinerary", "lock": 7100001},
    "travel-mode": {"model": TravelMode, "fk": "travel_mode", "label": "Vehicle classification", "lock": 7100002},
    "boat-type": {"model": BoatType, "fk": "boat_type", "label": "Boat classification", "lock": 7100003},
    "visit-purpose": {"model": VisitPurpose, "fk": "visit_purpose", "label": "Visit purpose", "lock": 7100004},
}

NAME_MAX_LENGTH = 120
STAY_NIGHTS_MAX = 60  # a sanity bound; the column itself takes up to 32767
ID_RETRIES = 5


def admin_required(view):
    """Only the system admin. Not the tourism role: these choices decide what
    the reports count, so they are not for every staff member."""

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            return Response(
                {"detail": "Only the system admin can manage registration options."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return view(request, *args, **kwargs)

    return wrapped


def _kind(kind):
    try:
        return KINDS[kind]
    except KeyError:
        raise Http404("Unknown option kind.")


def clean_name(value):
    """A name as it is stored: trimmed, inner runs of spaces made one."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())


def name_key(value):
    """What 'the same name' means: the same without regard to capitals, to
    spaces at either end, or to how many spaces sit between words."""
    return clean_name(value).lower()


def _record_count(config, option):
    return TouristRecord.objects.filter(**{config["fk"]: option}).count()


def _item(config, option, record_count):
    model = config["model"]
    item = {
        "id": option.id,
        "name": option.name,
        "is_active": option.is_active,
        "record_count": record_count,
    }
    if model is Itinerary:
        item["stay_nights"] = option.stay_nights
    if model is BoatType:
        item["requires_capacity_fare"] = option.requires_capacity_fare
    return item


def _lock(config):
    """Serialise writers of one list, so that two admins adding at the same
    time cannot take the same id or both pass the same-name check. PostgreSQL
    only; SQLite already allows one writer at a time."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [config["lock"]])


def _name_taken(config, name, excluding=None):
    key = name_key(name)
    for option in config["model"].objects.all():
        if option.pk != excluding and name_key(option.name) == key:
            return True
    return False


def _bust_cache():
    # The mobile and web reference lists are cached for 15 minutes; a change
    # must show at once.
    cache.delete(MOBILE_REFERENCE_TABLES_CACHE_KEY)


def _log(request, config, option, text):
    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_CREATE if text.startswith("added") else ACTION_UPDATE,
        option,
        label=f"{config['label']} option {text}",
        record_id=option.pk,
    )


def _error(detail, http_status=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": detail, **extra}, status=http_status)


def _parse_stay_nights(value):
    """-> (ok, parsed). None clears it; otherwise a whole number 0..STAY_NIGHTS_MAX."""
    if value is None:
        return True, None
    if isinstance(value, bool) or not isinstance(value, int):
        return False, None
    if not 0 <= value <= STAY_NIGHTS_MAX:
        return False, None
    return True, value


def _parse_confirmation(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


@api_view(["GET", "POST"])
@admin_required
def reference_option_list(request, kind):
    config = _kind(kind)
    model = config["model"]

    if request.method == "GET":
        rows = model.objects.annotate(record_count=Count("tourist_records")).order_by("id")
        return Response([_item(config, row, row.record_count) for row in rows])

    # The id is never taken from the request: the server gives it.
    name = clean_name(request.data.get("name"))
    if not name:
        return _error("A name is required.", name=["This field is required."])
    if len(name) > NAME_MAX_LENGTH:
        return _error(f"The name is longer than {NAME_MAX_LENGTH} characters.")

    extra = {}
    if model is Itinerary:
        ok, stay_nights = _parse_stay_nights(request.data.get("stay_nights"))
        if not ok:
            return _error(f"stay_nights must be a whole number from 0 to {STAY_NIGHTS_MAX}, or empty.")
        extra["stay_nights"] = stay_nights
    if model is BoatType:
        flag = request.data.get("requires_capacity_fare", False)
        if not isinstance(flag, bool):
            return _error("requires_capacity_fare must be true or false.")
        extra["requires_capacity_fare"] = flag

    for attempt in range(ID_RETRIES):
        try:
            with transaction.atomic():
                _lock(config)
                if _name_taken(config, name):
                    return _error(
                        "Another option already has this name (capitals and spaces do not count).",
                        name=["Already used."],
                    )
                next_id = (model.objects.aggregate(top=Max("id"))["top"] or 0) + 1
                option = model.objects.create(id=next_id, name=name, **extra)
            break
        except IntegrityError:
            # Someone else took this id between reading the maximum and the
            # insert (only possible where the lock above is not available).
            if attempt == ID_RETRIES - 1:
                return _error("Could not give the option an id. Try again.", http_status=status.HTTP_409_CONFLICT)

    _log(request, config, option, f"added: '{option.name}'")
    _bust_cache()
    return Response(_item(config, option, 0), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@admin_required
def reference_option_detail(request, kind, option_id):
    config = _kind(kind)
    model = config["model"]

    with transaction.atomic():
        _lock(config)
        try:
            option = model.objects.get(pk=option_id)
        except model.DoesNotExist:
            raise Http404("No such option.")

        new_name = option.name
        if "name" in request.data:
            new_name = clean_name(request.data.get("name"))
            if not new_name:
                return _error("A name is required.", name=["This field is required."])
            if len(new_name) > NAME_MAX_LENGTH:
                return _error(f"The name is longer than {NAME_MAX_LENGTH} characters.")
            if _name_taken(config, new_name, excluding=option.pk):
                return _error(
                    "Another option already has this name (capitals and spaces do not count).",
                    name=["Already used."],
                )

        new_stay = None
        stay_given = model is Itinerary and "stay_nights" in request.data
        if stay_given:
            ok, new_stay = _parse_stay_nights(request.data.get("stay_nights"))
            if not ok:
                return _error(f"stay_nights must be a whole number from 0 to {STAY_NIGHTS_MAX}, or empty.")

        renamed = new_name != option.name
        stay_changed = stay_given and new_stay != option.stay_nights

        if not renamed and not stay_changed:
            return Response(_item(config, option, _record_count(config, option)))

        # An itinerary whose stay_nights is not set is still read BY ITS NAME
        # for the stay figures of the reports, so renaming it would change
        # those numbers. (Setting stay_nights in the same request is fine: the
        # reports then stop reading the name.)
        if renamed and model is Itinerary:
            effective_stay = new_stay if stay_given else option.stay_nights
            if effective_stay is None:
                return _error(
                    "This itinerary has no stay length set yet, so the reports still read how long "
                    "the stay is from its NAME. Renaming it would change the Same Day / Overnight "
                    "and average-stay figures. Set its stay length first, then rename it.",
                    http_status=status.HTTP_409_CONFLICT,
                    code="stay_not_set",
                )

        # A rename (or a new stay length) reaches every record that uses the
        # option and every report. The caller must have been told how many, and
        # the number is counted HERE, never taken from the request.
        affected = _record_count(config, option)
        confirmed = _parse_confirmation(request.data.get("confirm_affected_records"))
        if confirmed is None or confirmed != affected:
            return _error(
                "This change applies to every record that uses the option and to every report. "
                f"It affects {affected} record(s). Send confirm_affected_records: {affected} to continue.",
                http_status=status.HTTP_409_CONFLICT,
                code="confirmation_required",
                record_count=affected,
            )

        old_name = option.name
        old_stay = getattr(option, "stay_nights", None)
        option.name = new_name
        fields = ["name"]
        if stay_changed:
            option.stay_nights = new_stay
            fields.append("stay_nights")
        option.save(update_fields=fields)

    parts = []
    if renamed:
        parts.append(f"renamed: '{old_name}' to '{new_name}'")
    if stay_changed:
        parts.append(f"stay length of '{new_name}' changed from {old_stay} to {new_stay}")
    _log(request, config, option, "; ".join(parts) + f" ({affected} record(s))")
    _bust_cache()
    return Response(_item(config, option, affected))


def _set_active(request, kind, option_id, active):
    config = _kind(kind)
    model = config["model"]

    with transaction.atomic():
        _lock(config)
        try:
            option = model.objects.get(pk=option_id)
        except model.DoesNotExist:
            raise Http404("No such option.")

        if option.is_active == active:
            return Response(_item(config, option, _record_count(config, option)))

        if not active and not model.objects.filter(is_active=True).exclude(pk=option.pk).exists():
            return _error(
                "This is the last active option in the list. If it were retired there would be "
                "nothing to choose in a new registration. Add or bring back another option first.",
                http_status=status.HTTP_409_CONFLICT,
                code="last_active",
            )

        option.is_active = active
        option.save(update_fields=["is_active"])

    verb = "reactivated" if active else "deactivated"
    _log(request, config, option, f"{verb}: '{option.name}'")
    _bust_cache()
    return Response(_item(config, option, _record_count(config, option)))


@api_view(["POST"])
@admin_required
def reference_option_deactivate(request, kind, option_id):
    return _set_active(request, kind, option_id, False)


@api_view(["POST"])
@admin_required
def reference_option_reactivate(request, kind, option_id):
    return _set_active(request, kind, option_id, True)
