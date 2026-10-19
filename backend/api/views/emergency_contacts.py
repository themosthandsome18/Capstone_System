"""Emergency contacts an admin can manage: add, edit, deactivate, bring back, reorder.

These are the hotlines and help desks the mobile app lists for tourists. A
contact is NEVER deleted here (there is no DELETE endpoint): it is deactivated
instead, so there is a trail in the ActivityLog and it can be brought back.

Unlike the registration options there is no "cannot deactivate the last one"
guard. With no active contact the app falls back to the written list in its
own code, which is the right behaviour: emergency numbers must not disappear.

The mobile bootstrap reads the contacts on every request (they are not cached),
so nothing here has to clear a cache.
"""
from functools import wraps

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import connection, transaction
from django.db.models import Max
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_UPDATE,
    MODULE_TOURISM,
    ROLE_ADMIN,
    EmergencyContact,
)
from api.permissions import get_user_role
from api.services.activity import LABEL_MAX, log_activity, shorten_label
from api.views.reference_options import clean_name, name_key

LOCK_ID = 7100005
ORDER_STEP = 10
ICONS = {code for code, _label in EmergencyContact.ICON_CHOICES}
LIMITS = {"name": 160, "contact_numbers": 300, "email": 254}
EDITABLE = ("name", "contact_numbers", "email", "description", "icon")


def admin_required(view):
    """Only the system admin. Not the tourism role."""

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            return Response(
                {"detail": "Only the system admin can manage emergency contacts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return view(request, *args, **kwargs)

    return wrapped


def _error(detail, http_status=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": detail, **extra}, status=http_status)


def _item(contact):
    return {
        "id": contact.id,
        "name": contact.name,
        "contact_numbers": contact.contact_numbers,
        "email": contact.email,
        "description": contact.description,
        "icon": contact.icon,
        "display_order": contact.display_order,
        "is_active": contact.is_active,
    }


def _lock():
    """Serialise writers, so two admins cannot both pass the same-name check.
    PostgreSQL only; SQLite already allows one writer at a time."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [LOCK_ID])


def _name_taken(name, excluding=None):
    key = name_key(name)
    for contact in EmergencyContact.objects.all():
        if contact.pk != excluding and name_key(contact.name) == key:
            return True
    return False


LABEL_PREFIX = "Emergency contact "
NAME_SHARE = 60  # how much of a contact's name a log label carries (the name can be 160)


def _edit_note(changes):
    """The "edited: ..." part of the label of an edit. `changes` is [(field, old, new)].
    A description has no limit and a name or a list of numbers is long, so each old and
    new value is shortened to its share of the 255 the column holds (a longer label is a
    500 on PostgreSQL). Values of ordinary length are not touched."""
    fixed = sum(len(f"{field}: '' to ''") for field, _old, _new in changes) + 2 * (len(changes) - 1)
    overhead = len(LABEL_PREFIX) + len("'' ") + NAME_SHARE + len("edited: ") + fixed
    share = max((LABEL_MAX - overhead) // (2 * len(changes)), 12)
    return "edited: " + "; ".join(
        f"{field}: '{shorten_label(old, share)}' to '{shorten_label(new, share)}'" for field, old, new in changes
    )


def _log(request, contact, text):
    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_CREATE if text.startswith("added") else ACTION_UPDATE,
        contact,
        label=shorten_label(f"{LABEL_PREFIX}'{shorten_label(contact.name, NAME_SHARE)}' {text}"),
        record_id=contact.pk,
    )


def _text(data, field, required=False):
    """-> (error, value). Text fields are trimmed; a non-string is an error."""
    value = data.get(field)
    if value is None:
        value = ""
    if not isinstance(value, str):
        return f"{field} must be text.", None
    value = clean_name(value) if field == "name" else value.strip()
    if required and not value:
        return f"{field} is required.", None
    if field in LIMITS and len(value) > LIMITS[field]:
        return f"{field} is longer than {LIMITS[field]} characters.", None
    if field == "email" and value:
        try:
            validate_email(value)
        except DjangoValidationError:
            return "email is not a valid address.", None
    return None, value


def _validate(data, fields, creating):
    """-> (error response or None, cleaned values) for the named fields."""
    cleaned = {}
    for field in fields:
        if field == "icon":
            value = data.get("icon", EmergencyContact.ICON_OTHER if creating else None)
            if not isinstance(value, str) or value not in ICONS:
                return _error(
                    "icon must be one of: " + ", ".join(sorted(ICONS)) + ".",
                    icon=["Not a valid icon."],
                ), None
            cleaned["icon"] = value
            continue
        error, value = _text(data, field, required=field in ("name", "contact_numbers"))
        if error:
            return _error(error, **{field: [error]}), None
        cleaned[field] = value
    return None, cleaned


_DUPLICATE = "Another contact already has this name (capitals and spaces do not count)."


@api_view(["GET", "POST"])
@admin_required
def emergency_contact_list(request):
    if request.method == "GET":
        return Response([_item(contact) for contact in EmergencyContact.objects.all()])

    problem, values = _validate(request.data, EDITABLE, creating=True)
    if problem:
        return problem

    with transaction.atomic():
        _lock()
        if _name_taken(values["name"]):
            return _error(_DUPLICATE, name=["Already used."])
        top = EmergencyContact.objects.aggregate(top=Max("display_order"))["top"]
        contact = EmergencyContact.objects.create(
            display_order=(top or 0) + ORDER_STEP, is_active=True, **values
        )

    _log(request, contact, f"added: '{shorten_label(contact.name, NAME_SHARE)}'")
    return Response(_item(contact), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@admin_required
def emergency_contact_detail(request, contact_id):
    # Only the editable fields are read. is_active and display_order have their
    # own endpoints and are ignored here.
    fields = [field for field in EDITABLE if field in request.data]

    with transaction.atomic():
        _lock()
        try:
            contact = EmergencyContact.objects.get(pk=contact_id)
        except EmergencyContact.DoesNotExist:
            raise Http404("No such contact.")

        problem, values = _validate(request.data, fields, creating=False)
        if problem:
            return problem
        if "name" in values and _name_taken(values["name"], excluding=contact.pk):
            return _error(_DUPLICATE, name=["Already used."])

        changes = [
            (field, getattr(contact, field), value)
            for field, value in values.items()
            if getattr(contact, field) != value
        ]
        if not changes:
            return Response(_item(contact))
        for field, value in values.items():
            setattr(contact, field, value)
        contact.save(update_fields=list(values))

    _log(request, contact, _edit_note(changes))
    return Response(_item(contact))


def _set_active(request, contact_id, active):
    with transaction.atomic():
        _lock()
        try:
            contact = EmergencyContact.objects.get(pk=contact_id)
        except EmergencyContact.DoesNotExist:
            raise Http404("No such contact.")
        if contact.is_active == active:
            return Response(_item(contact))
        contact.is_active = active
        contact.save(update_fields=["is_active"])

    _log(request, contact, "brought back (active)" if active else "deactivated")
    return Response(_item(contact))


@api_view(["POST"])
@admin_required
def emergency_contact_deactivate(request, contact_id):
    return _set_active(request, contact_id, False)


@api_view(["POST"])
@admin_required
def emergency_contact_reactivate(request, contact_id):
    return _set_active(request, contact_id, True)


@api_view(["POST"])
@admin_required
def emergency_contact_reorder(request):
    """The body is {"ids": [...]}: ALL the existing ids, in the new order.
    Anything else (missing, extra, repeated, unknown id) is refused before a
    single row is written."""
    ids = request.data.get("ids") if hasattr(request.data, "get") else request.data
    if not isinstance(ids, list) or any(isinstance(i, bool) or not isinstance(i, int) for i in ids):
        return _error("ids must be a list of contact ids.")

    with transaction.atomic():
        _lock()
        existing = {contact.pk: contact for contact in EmergencyContact.objects.all()}
        if len(set(ids)) != len(ids) or set(ids) != set(existing):
            return _error(
                "ids must list every existing contact exactly once, with no other id."
            )
        for position, contact_id in enumerate(ids, start=1):
            contact = existing[contact_id]
            contact.display_order = position * ORDER_STEP
            contact.save(update_fields=["display_order"])
        ordered = [existing[contact_id] for contact_id in ids]
        if ordered:
            log_activity(
                request,
                MODULE_TOURISM,
                ACTION_UPDATE,
                ordered[0],
                label=shorten_label("Emergency contacts reordered: " + ", ".join(f"'{c.name}'" for c in ordered)),
                record_id="reorder",
            )
    return Response([_item(contact) for contact in ordered])
