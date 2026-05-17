from pathlib import Path

from django.core.management.base import BaseCommand

from api.models import (
    BOOKING_STATUS_ARRIVED,
    BOOKING_STATUS_NO_SHOW,
    BOOKING_STATUS_PENDING,
)
from api.services.online_booking import process_online_booking_workbook


STATUS_CHOICES = (
    BOOKING_STATUS_PENDING,
    BOOKING_STATUS_ARRIVED,
    BOOKING_STATUS_NO_SHOW,
)


class Command(BaseCommand):
    help = "Import Tourism Office online booking registration Excel responses."

    def add_arguments(self, parser):
        parser.add_argument(
            "excel_path",
            type=str,
            help="Path to ONLINE BOOKING REGISTRATION 2025 (Responses).xlsx",
        )
        parser.add_argument(
            "--status",
            choices=STATUS_CHOICES,
            default=BOOKING_STATUS_PENDING,
            help="Booking status to assign to imported rows.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Import only the first N response rows. Useful for testing.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate rows without saving them.",
        )

    def handle(self, *args, **options):
        excel_path = Path(options["excel_path"])

        if not excel_path.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {excel_path}"))
            return

        with excel_path.open("rb") as file:
            result = process_online_booking_workbook(
                file,
                status=options["status"],
                limit=options["limit"],
                commit=not options["dry_run"],
            )

        action = "Validated" if options["dry_run"] else "Imported"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action}: {result['valid_count']}. "
                f"Created: {result['imported_count']}. "
                f"Updated: {result['updated_count']}. "
                f"Skipped: {result['skipped_count']}."
            )
        )

        for error in result["error_samples"]:
            self.stdout.write(
                self.style.WARNING(f"Row {error['row']}: {error['message']}")
            )
