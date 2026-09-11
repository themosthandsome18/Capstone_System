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
    target_users = User.objects.filter(
        is_active=True,
        profile__role__in=[ROLE_ADMIN, ROLE_SANITATION],
    ).distinct()

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

    notifications = []
    for user in target_users:
        user_role = getattr(getattr(user, "profile", None), "role", "")
        notification = Notification.objects.create(
            title=title,
            message=message,
            notification_type=NOTIFICATION_TYPE_VIOLATION_ALERT,
            severity=NOTIFICATION_SEVERITY_CRITICAL,
            module=NOTIFICATION_MODULE_SANITATION,
            audience_type=NOTIFICATION_AUDIENCE_USER,
            recipient_user=user,
            target_role=user_role,
            related_model="SanitaryEstablishment",
            related_object_id=str(establishment.id),
            action_url=f"/sanitation/establishments/{establishment.id}",
        )
        notifications.append(notification)

    return notifications
