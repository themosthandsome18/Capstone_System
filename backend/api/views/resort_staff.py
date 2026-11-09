"""The accounts of the staff of a resort: list, make, switch off and on, change the password. Never delete.

Who may: the Tourism Office and the system admin (ADMINISTRATION_ROLES), nobody else; a resort's own staff cannot make a colleague. It follows the
sanitation accounts (sanitation/staff/): the same shape of an answer, the same way of keeping a password (set_password, at least 8 characters here),
the same switching off and on, with a line in the ActivityLog for each. A switched-off account, and an account whose password changed, loses its
auth token, so a phone that has it is put out and has to sign in again.

Only accounts whose role is "resort" are reached here: any other id is a 404, not a 403 (nothing says that such an account exists).
"""
import re

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_UPDATE,
    MODULE_TOURISM,
    ROLE_RESORT,
    ActivityLog,
    Resort,
    UserProfile,
)
from api.permissions import administration_required
from api.services.activity import log_activity, shorten_label
from api.views.mobile import MOBILE_EXCLUDED_DESTINATION_NAMES

admin_required = administration_required("Only the Tourism Office and the system admin can manage the accounts of a resort's staff.")

USERNAME_RE = re.compile(r"^[a-z0-9.\-]{3,150}$")
PASSWORD_MIN = 8
NAME_MAX = 150


def _error(detail, field=None, http_status=status.HTTP_400_BAD_REQUEST):
    body = {"detail": detail}
    if field:
        body["field"] = field
    return Response(body, status=http_status)


def _month_start():
    now = timezone.localtime()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _staff_queryset():
    """Every account whose role is resort, with the counts of what it received, in ONE query (the join is on the one relation checked_in_records)."""
    this_month = Q(checked_in_records__checked_in_at__gte=_month_start())
    return (
        User.objects.filter(profile__role=ROLE_RESORT)
        .select_related("profile", "profile__resort")
        .annotate(
            scan_count=Count("checked_in_records"),
            visitor_count=Coalesce(Sum("checked_in_records__total_visitors"), 0),
            scan_count_month=Count("checked_in_records", filter=this_month),
            visitor_count_month=Coalesce(Sum("checked_in_records__total_visitors", filter=this_month), 0),
            last_scan_at=Max("checked_in_records__checked_in_at"),
        )
        .order_by("-date_joined", "-id")
    )


def _creators(user_ids):
    """{user id: username of who made the account}, from the ActivityLog of the making: one query. Absent for an account made some other way."""
    logs = (
        ActivityLog.objects.filter(
            module=MODULE_TOURISM, action=ACTION_CREATE, record_type="User", record_id__in=[str(pk) for pk in user_ids]
        )
        .select_related("user")
        .order_by("id")
    )
    made = {}
    for log in logs:
        made[int(log.record_id)] = log.user.username if log.user_id else None
    return made


def _rows(users):
    users = list(users)
    made = _creators([user.pk for user in users])
    rows = []
    for user in users:
        resort = user.profile.resort
        rows.append(
            {
                "id": user.pk,
                "username": user.username,
                "name": user.get_full_name() or user.username,
                "resort": {"id": resort.resort_id, "name": resort.resort_name} if resort else None,
                "is_active": user.is_active,
                "date_joined": user.date_joined,
                "last_login": user.last_login,
                "created_by": made.get(user.pk),
                "scan_count": user.scan_count,
                "visitor_count": user.visitor_count,
                "scan_count_month": user.scan_count_month,
                "visitor_count_month": user.visitor_count_month,
                "last_scan_at": user.last_scan_at,
            }
        )
    return rows


def _row(user_id):
    return _rows(_staff_queryset().filter(pk=user_id))[0]


def _is_real_destination(resort):
    name = resort.resort_name or ""
    return resort.is_active and name not in MOBILE_EXCLUDED_DESTINATION_NAMES and "kwebang" not in name.lower()


@api_view(["GET", "POST"])
@admin_required
def resort_staff_list(request):
    if request.method == "GET":
        return Response(_rows(_staff_queryset()))

    data = request.data
    raw_resort = data.get("resort_id")
    name = str(data.get("name") or "").strip()
    username = str(data.get("username") or "").strip()
    password = data.get("password")
    password = password if isinstance(password, str) else ""

    try:
        resort = Resort.objects.filter(pk=int(raw_resort)).first() if raw_resort not in (None, "") else None
    except (TypeError, ValueError):
        resort = None
    if resort is None or not _is_real_destination(resort):
        return _error("Choose a destination that is open to visitors.", "resort_id")
    if not name:
        return _error("Name is required.", "name")
    if len(name) > NAME_MAX:
        return _error(f"Name can have at most {NAME_MAX} characters.", "name")
    if not username:
        return _error("Username is required.", "username")
    if not USERNAME_RE.match(username):
        return _error("Username can have only lower-case letters, numbers, dots and hyphens, 3 to 150 characters.", "username")
    if User.objects.filter(username__iexact=username).exists():
        return _error("This username is already in use.", "username")
    if len(password) < PASSWORD_MIN:
        return _error(f"Password must be at least {PASSWORD_MIN} characters long.", "password")

    try:
        with transaction.atomic():
            new_user = User(username=username, first_name=name, is_staff=False, is_active=True)
            new_user.set_password(password)
            new_user.save()
            UserProfile.objects.update_or_create(user=new_user, defaults={"role": ROLE_RESORT, "resort": resort})
    except IntegrityError:
        return _error("This username is already in use.", "username")

    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_CREATE,
        new_user,
        label=shorten_label(f"{name} ({username}) - resort staff of {resort.resort_name}"),
        record_id=new_user.pk,
    )
    return Response(_row(new_user.pk), status=status.HTTP_201_CREATED)


def _truthy(value):
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "t", "yes")
    return bool(value)


@api_view(["PATCH"])
@admin_required
def resort_staff_detail(request, user_id):
    user = _staff_queryset().filter(pk=user_id).first()
    if user is None:
        return _error("Not found.", http_status=status.HTTP_404_NOT_FOUND)

    data = request.data
    has_active = "is_active" in data
    has_password = "password" in data
    if not has_active and not has_password:
        return _error("Send is_active, password, or both.")

    new_password = None
    if has_password:
        value = data.get("password")
        if not isinstance(value, str) or len(value) < PASSWORD_MIN:
            return _error(f"Password must be at least {PASSWORD_MIN} characters long.", "password")
        new_password = value

    notes = []
    sign_out = False
    if has_active:
        active = _truthy(data.get("is_active"))
        if active != user.is_active:
            notes.append("Activated" if active else "Deactivated")
        user.is_active = active
        sign_out = sign_out or not active
    if new_password is not None:
        user.set_password(new_password)
        notes.append("Password changed")
        sign_out = True

    with transaction.atomic():
        user.save()
        if sign_out:
            # The phone that has this token is put out; the person signs in again (with the new password, or not at all when switched off).
            Token.objects.filter(user=user).delete()

    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_UPDATE,
        user,
        label=shorten_label(f"{user.get_full_name() or user.username} ({user.username}) - {', '.join(notes) or 'No change'}"),
        record_id=user.pk,
    )
    return Response(_row(user.pk))
