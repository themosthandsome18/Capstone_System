from django.core.management.base import BaseCommand

from api.models import HouseholdSanitationRecord
from api.seed_data import HOUSEHOLD_SANITATION_RECORDS


class Command(BaseCommand):
    help = "Remove bundled demo household sanitation records by seed household_code."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Actually delete the matching demo household rows.",
        )

    def handle(self, *args, **options):
        seed_codes = [
            row["household_code"]
            for row in HOUSEHOLD_SANITATION_RECORDS
            if row.get("household_code")
        ]
        queryset = HouseholdSanitationRecord.objects.filter(
            household_code__in=seed_codes,
        )
        count = queryset.count()

        if not options["confirm"]:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run: found {count} bundled demo household record(s). "
                    "Run again with --confirm to delete them."
                )
            )
            return

        deleted, _ = queryset.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted} bundled demo household record object(s)."
            )
        )
