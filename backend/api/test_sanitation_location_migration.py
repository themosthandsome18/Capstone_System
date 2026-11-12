from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class SanitationLocationMigrationTests(TransactionTestCase):
    def test_upgrade_reverse_and_reapply_preserve_legacy_location_and_sitio(self):
        old = [("api", "0070_establishment_front_photo")]
        new = [("api", "0071_sanitation_location_and_sitio")]
        executor = MigrationExecutor(connection)
        executor.migrate(old)
        try:
            apps = executor.loader.project_state(old).apps
            household = apps.get_model("api", "HouseholdSanitationRecord").objects.create(
                household_code="SYNTH-MIGRATION", household_head="Synthetic legacy",
                barangay="Daungan", sitio="  Unmapped legacy text  ", latitude=14.19, longitude=121.73,
            )
            business_type = apps.get_model("api", "SanitaryBusinessType").objects.create(name="Synthetic type")
            establishment = apps.get_model("api", "SanitaryEstablishment").objects.create(
                business_name="Synthetic legacy", owner_name="Synthetic owner", business_type=business_type,
                barangay="Daungan", address="Legacy address", latitude=14.2, longitude=None,
            )
            for cycle in range(2):
                executor = MigrationExecutor(connection)
                executor.migrate(new)
                apps = executor.loader.project_state(new).apps
                saved_household = apps.get_model("api", "HouseholdSanitationRecord").objects.get(pk=household.pk)
                saved_establishment = apps.get_model("api", "SanitaryEstablishment").objects.get(pk=establishment.pk)
                self.assertEqual((saved_household.latitude, saved_household.longitude, saved_household.sitio),
                                 (14.19, 121.73, "  Unmapped legacy text  "))
                self.assertEqual((saved_establishment.latitude, saved_establishment.longitude, saved_establishment.sitio),
                                 (14.2, None, ""))
                for record in (saved_household, saved_establishment):
                    self.assertEqual(record.location_source, "unknown")
                    self.assertEqual(record.sitio_source, "unknown")
                    for field in ("location_accuracy_m", "location_captured_at", "location_reported_mock", "sitio_reference_id"):
                        self.assertIsNone(getattr(record, field))
                self.assertEqual(apps.get_model("api", "Sitio").objects.count(), 0)
                if cycle == 0:
                    MigrationExecutor(connection).migrate(old)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
