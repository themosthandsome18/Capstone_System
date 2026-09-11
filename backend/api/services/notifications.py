from django.contrib.auth import get_user_model

from ..models import (
    NOTIFICATION_AUDIENCE_USER,
    NOTIFICATION_MODULE_SANITATION,
    NOTIFICATION_SEVERITY_CRITICAL,
    NOTIFICATION_TYPE_VIOLATION_ALERT,
    Notification,
    ROLE_ADMIN,
    ROLE_SANITATION,
)

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
):
    """
    Creates one Notification per currently-active user matching the specified roles.
    If check_idempotency is True, skips creation for any user where a Notification
    already exists with the exact same (recipient_user, notification_type, related_object_id, related_due_date).
    """
    target_users = User.objects.filter(
        is_active=True,
        profile__role__in=roles,
    ).distinct()

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
