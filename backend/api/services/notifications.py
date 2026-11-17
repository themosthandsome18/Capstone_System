import logging
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.db import transaction

from ..models import (
    NOTIFICATION_AUDIENCE_USER,
    NOTIFICATION_MODULE_SANITATION,
    NOTIFICATION_MODULE_TOURISM,
    NOTIFICATION_SEVERITY_CRITICAL,
    NOTIFICATION_SEVERITY_INFO,
    NOTIFICATION_TYPE_NEW_FEEDBACK,
    NOTIFICATION_TYPE_NEW_REGISTRATION,
    NOTIFICATION_TYPE_VIOLATION_ALERT,
    Notification,
    ROLE_ADMIN,
    ROLE_SANITATION,
    ROLE_TOURISM,
)

logger = logging.getLogger(__name__)

# Who is told about the Tourism module's news: the system admin and the Tourism Office, equally. Nobody else (not sanitation, not a resort's staff).
TOURISM_NOTICE_ROLES = (ROLE_ADMIN, ROLE_TOURISM)

User = get_user_model()


def notify_staff_users(
    title,
    message,
    notification_type,
    severity,
    module,
    related_model="",
    related_object_id="",
    related_due_date=None,
    action_url="",
    roles=(ROLE_ADMIN, ROLE_SANITATION),
    check_idempotency=False,
    exclude_user=None,
):
    """
    Creates one Notification per currently-active user matching the specified roles, except `exclude_user` (the person who did the thing: nobody is
    told about what they did themselves).
    If check_idempotency is True, skips creation for any user where a Notification
    already exists with the exact same (recipient_user, notification_type, related_object_id, related_due_date).
    """
    target_users = User.objects.filter(
        is_active=True,
        profile__role__in=roles,
    ).distinct()
    if exclude_user is not None and getattr(exclude_user, "pk", None) is not None:
        target_users = target_users.exclude(pk=exclude_user.pk)

    notifications = []
    for user in target_users:
        if check_idempotency:
            filter_kwargs = {
                "recipient_user": user,
                "notification_type": notification_type,
                "related_object_id": str(related_object_id),
            }
            if related_due_date is not None:
                filter_kwargs["related_due_date"] = related_due_date

            if Notification.objects.filter(**filter_kwargs).exists():
                continue

        user_role = getattr(getattr(user, "profile", None), "role", "")
        notification = Notification.objects.create(
            title=title,
            message=message,
            notification_type=notification_type,
            severity=severity,
            module=module,
            audience_type=NOTIFICATION_AUDIENCE_USER,
            recipient_user=user,
            target_role=user_role,
            related_model=related_model,
            related_object_id=str(related_object_id),
            related_due_date=related_due_date,
            action_url=action_url,
        )
        notifications.append(notification)

    return notifications


def notify_violation(establishment, inspection=None):
    """
    Creates one Notification per currently-active user with role
    'admin' and one per currently-active user with role
    'sanitation'. notification_type='violation_alert',
    severity='critical', module='sanitation',
    related_model='SanitaryEstablishment',
    related_object_id=str(establishment.id),
    action_url=f'/sanitation/establishments/{establishment.id}'.
    Title/message should name the establishment and reference the
    inspection if provided.
    """
    title = f"Sanitary Violation: {establishment.business_name}"

    if inspection:
        inspection_date = getattr(inspection, "inspection_date", None)
        date_str = f" dated {inspection_date}" if inspection_date else ""
        findings_str = f" Findings: {inspection.findings}." if getattr(inspection, "findings", "") else ""
        message = (
            f"A sanitary violation was recorded for {establishment.business_name} "
            f"during inspection (ID: {inspection.id}{date_str}).{findings_str}"
        )
    else:
        message = (
            f"A sanitary violation was recorded for {establishment.business_name}."
        )

    return notify_staff_users(
        title=title,
        message=message,
        notification_type=NOTIFICATION_TYPE_VIOLATION_ALERT,
        severity=NOTIFICATION_SEVERITY_CRITICAL,
        module=NOTIFICATION_MODULE_SANITATION,
        related_model="SanitaryEstablishment",
        related_object_id=str(establishment.id),
        action_url=f"/sanitation/establishments/{establishment.id}",
        check_idempotency=False,
    )


# ---------------------------------------------------------------------------------------------------------------------------------------------------
# The Tourism module's two pieces of news. They are made by the code that SAVES a record or a review from the phone or by staff on the web: a call
# written in that view, never a post_save signal. That is how the Excel import is kept out of it: it saves with bulk_create, which sends no signal, and
# it does not call these, so importing thousands of rows makes no notice (the one who imports is looking at the result).
#
# What a notice SAYS is the survey ID and the name of the resort, never a person: the title and the message are read in a list that any of the
# staff sees, and that is no place for a visitor's name, email or number. The place to read the person is the record itself, which the notice opens.
# ---------------------------------------------------------------------------------------------------------------------------------------------------


def notify_new_tourist_record(record, actor=None):
    """One notice, for each admin and each Tourism Office user, that a visit was registered (from the phone, or added by staff on the web).
    `actor` is the staff user who added it on the web: THEY are not told about their own work, the others are. From the phone there is no actor, so
    everyone is told."""
    resort = record.resort.resort_name if record.resort_id else "a destination"
    when = f" on {record.arrival_date:%d %b %Y}" if getattr(record, "arrival_date", None) else ""
    return notify_staff_users(
        title="New tourist registration",
        message=f"A visit to {resort}{when} was registered (survey {record.survey_id}).",
        notification_type=NOTIFICATION_TYPE_NEW_REGISTRATION,
        severity=NOTIFICATION_SEVERITY_INFO,
        module=NOTIFICATION_MODULE_TOURISM,
        related_model="TouristRecord",
        related_object_id=str(record.survey_id),
        action_url=f"/tourist-data?openSurveyId={quote(str(record.survey_id), safe='')}",
        roles=TOURISM_NOTICE_ROLES,
        exclude_user=actor,
    )


def notify_new_feedback(entry):
    """One notice, for each admin and each Tourism Office user, that a review was sent from the phone."""
    resort = entry.destination.resort_name if entry.destination_id else "a destination"
    return notify_staff_users(
        title="New review",
        message=f"A {entry.rating}-star review was sent for {resort}.",
        notification_type=NOTIFICATION_TYPE_NEW_FEEDBACK,
        severity=NOTIFICATION_SEVERITY_INFO,
        module=NOTIFICATION_MODULE_TOURISM,
        related_model="FeedbackEntry",
        related_object_id=str(entry.pk),
        action_url=f"/feedback?openFeedbackId={entry.pk}",
        roles=TOURISM_NOTICE_ROLES,
    )


def notify_safely(make_notices, subject, **extra):
    """Runs one of the two above for something that has ALREADY been saved. A notice that cannot be made never undoes or fails what was being saved
    (a registration or a review is worth more than its notice): the failure is logged, in a savepoint so a database error does not break the request's
    own transaction, and the caller carries on."""
    try:
        with transaction.atomic():
            return make_notices(subject, **extra)
    except Exception:  # noqa: BLE001 - a notice must never fail the save it follows
        logger.exception("Could not make the notice for %r", subject)
        return []
