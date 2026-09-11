from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
    NOTIFICATION_MODULE_SANITATION,
    NOTIFICATION_SEVERITY_CRITICAL,
    NOTIFICATION_SEVERITY_WARNING,
    NOTIFICATION_TYPE_INSPECTION_DUE,
    NOTIFICATION_TYPE_PERMIT_DUE,
    SANITARY_STATUS_VIOLATION,
    SanitaryEstablishment,
    SanitaryInspection,
)
from api.services.notifications import notify_staff_users


class Command(BaseCommand):
    help = "Evaluates upcoming and overdue permit and inspection due dates and creates staff notifications."

    def handle(self, *args, **options):
        today = timezone.localdate()
        permit_due_count = 0
        inspection_due_count = 0

        # a) PERMIT DUE: permit_expiry_date <= today+30 days, has_permit=True (catches upcoming and overdue)
        permit_window_end = today + timedelta(days=30)
        establishments_with_due_permits = SanitaryEstablishment.objects.filter(
            has_permit=True,
            permit_expiry_date__isnull=False,
            permit_expiry_date__lte=permit_window_end,
        )

        for establishment in establishments_with_due_permits:
            is_overdue = establishment.permit_expiry_date < today
            severity = NOTIFICATION_SEVERITY_CRITICAL if is_overdue else NOTIFICATION_SEVERITY_WARNING

            if is_overdue:
                title = f"Permit Expired: {establishment.business_name}"
                message = (
                    f"Sanitary permit for {establishment.business_name} EXPIRED on "
                    f"{establishment.permit_expiry_date}."
                )
            else:
                title = f"Permit Due: {establishment.business_name}"
                message = (
                    f"Sanitary permit for {establishment.business_name} expires on "
                    f"{establishment.permit_expiry_date}."
                )

            created = notify_staff_users(
                title=title,
                message=message,
                notification_type=NOTIFICATION_TYPE_PERMIT_DUE,
                severity=severity,
                module=NOTIFICATION_MODULE_SANITATION,
                related_model="SanitaryEstablishment",
                related_object_id=str(establishment.id),
                related_due_date=establishment.permit_expiry_date,
                action_url=f"/sanitation/establishments/{establishment.id}",
                check_idempotency=True,
            )
            permit_due_count += len(created)

        # b) INSPECTION DUE: next_due_date <= today+7 days,
        #    excluding establishments already in "violation" status (catches upcoming and overdue)
        inspection_window_end = today + timedelta(days=7)
        due_inspections = SanitaryInspection.objects.filter(
            next_due_date__isnull=False,
            next_due_date__lte=inspection_window_end,
        ).exclude(
            establishment__compliance_status=SANITARY_STATUS_VIOLATION,
        ).select_related("establishment")

        for inspection in due_inspections:
            establishment = inspection.establishment
            is_overdue = inspection.next_due_date < today
            severity = NOTIFICATION_SEVERITY_CRITICAL if is_overdue else NOTIFICATION_SEVERITY_WARNING

            if is_overdue:
                title = f"Inspection Overdue: {establishment.business_name}"
                message = (
                    f"Sanitary inspection for {establishment.business_name} is OVERDUE "
                    f"(was due on {inspection.next_due_date})."
                )
            else:
                title = f"Inspection Due: {establishment.business_name}"
                message = (
                    f"Sanitary inspection for {establishment.business_name} is due on "
                    f"{inspection.next_due_date}."
                )

            created = notify_staff_users(
                title=title,
                message=message,
                notification_type=NOTIFICATION_TYPE_INSPECTION_DUE,
                severity=severity,
                module=NOTIFICATION_MODULE_SANITATION,
                related_model="SanitaryEstablishment",
                related_object_id=str(establishment.id),
                related_due_date=inspection.next_due_date,
                action_url=f"/sanitation/establishments/{establishment.id}",
                check_idempotency=True,
            )
            inspection_due_count += len(created)

        self.stdout.write(
            f"Due notifications evaluation complete: {permit_due_count} permit_due and "
            f"{inspection_due_count} inspection_due notifications created."
        )
