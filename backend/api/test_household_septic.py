from itertools import product

from django.db import connection, models
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase

from .models import HouseholdSanitationRecord
from .serializers import HouseholdSanitationRecordSerializer


class HouseholdSepticTests(TestCase):
    def payload(self, **changes):
        return {
            "household_code": f"HH-H1A-{HouseholdSanitationRecord.objects.count()}",
            "household_head": "Local household",
            "barangay": "Daungan",
            "toilet_type": "water_sealed",
            "water_level": "level_3",
            "waste_disposal": "collected",
            "latitude": 14.19,
            "longitude": 121.73,
            **changes,
        }

    def save_payload(self, instance=None, partial=False, **changes):
        data = changes if instance else self.payload(**changes)
        serializer = HouseholdSanitationRecordSerializer(instance, data=data, partial=partial)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        record = serializer.save()
        record.refresh_from_db()
        return record, serializer

    def test_field_contract(self):
        self.assertIn("septic_tank_type", HouseholdSanitationRecordSerializer().fields)
        field = HouseholdSanitationRecord._meta.get_field("septic_tank_type")
        self.assertIsInstance(field, models.CharField)
        self.assertEqual(field.max_length, 30)
        self.assertTrue(field.null)
        self.assertTrue(field.blank)
        self.assertFalse(field.has_default())
        self.assertEqual(list(field.choices), [
            ("septic_tank", "Septic tank"),
            ("bottomless", "Bottomless"),
            ("vault_sealed", "Vault-sealed"),
        ])

    def test_all_valid_values_persist_for_both_applicable_toilets(self):
        for toilet, septic in product(("water_sealed", "pour_flush"),
                                      ("bottomless", "vault_sealed")):
            with self.subTest(toilet=toilet, septic=septic):
                record, serializer = self.save_payload(toilet_type=toilet, septic_tank_type=septic)
                self.assertEqual(serializer.data.get("septic_tank_type"), septic)
                self.assertEqual(record.septic_tank_type, septic)

    def test_unknown_value_rejected(self):
        serializer = HouseholdSanitationRecordSerializer(data=self.payload(septic_tank_type="unknown"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("septic_tank_type", serializer.errors)

    def test_old_clients_can_omit_septic(self):
        for toilet in ("water_sealed", "pour_flush"):
            record, serializer = self.save_payload(toilet_type=toilet)
            self.assertIn("septic_tank_type", serializer.data)
            self.assertIsNone(record.septic_tank_type)

    def test_explicit_blank_or_null_accepted(self):
        for value in (None, ""):
            record, serializer = self.save_payload(septic_tank_type=value)
            self.assertIn("septic_tank_type", serializer.data)
            self.assertEqual(record.septic_tank_type, value)

    def test_inapplicable_create_clears_supplied_value(self):
        for toilet in ("pit_latrine", "none"):
            record, serializer = self.save_payload(toilet_type=toilet, septic_tank_type="bottomless")
            self.assertIn("septic_tank_type", serializer.data)
            self.assertIsNone(record.septic_tank_type)

    def test_toilet_change_clears_stale_value(self):
        for toilet in ("pit_latrine", "none"):
            for supplied in ({}, {"septic_tank_type": "vault_sealed"}):
                with self.subTest(toilet=toilet, supplied=supplied):
                    record = HouseholdSanitationRecord.objects.create(**self.payload(septic_tank_type="septic_tank"))
                    record, serializer = self.save_payload(record, partial=True, toilet_type=toilet, **supplied)
                    self.assertIn("septic_tank_type", serializer.data)
                    self.assertIsNone(record.septic_tank_type)

    def test_unrelated_patch_and_full_update_preserve_value(self):
        for toilet, partial in product(("water_sealed", "pour_flush"), (True, False)):
            record, _ = self.save_payload(toilet_type=toilet, septic_tank_type="bottomless")
            data = {"remarks": "Updated notes"}
            if not partial:
                data.update(self.payload(household_code=record.household_code, toilet_type=toilet))
            record, serializer = self.save_payload(record, partial=partial, **data)
            self.assertEqual(serializer.data.get("septic_tank_type"), "bottomless")
            self.assertEqual(record.septic_tank_type, "bottomless")
            self.assertEqual(record.remarks, "Updated notes")

    def test_unrelated_patch_clears_legacy_inapplicable_value(self):
        self.assertIn("septic_tank_type", HouseholdSanitationRecordSerializer().fields)
        for toilet in ("pit_latrine", "none"):
            record, _ = self.save_payload(toilet_type=toilet)
            HouseholdSanitationRecord.objects.filter(pk=record.pk).update(septic_tank_type="bottomless")
            record.refresh_from_db()
            record, _ = self.save_payload(record, partial=True, remarks="Updated")
            self.assertIsNone(record.septic_tank_type)

    def test_high_scoring_pit_latrine_is_for_completion(self):
        record, _ = self.save_payload(toilet_type="pit_latrine", status="good_standing")
        self.assertEqual(record.status, "for_completion")

    def test_none_is_violation(self):
        record, _ = self.save_payload(toilet_type="none", status="good_standing")
        self.assertEqual(record.status, "violation")

    def test_status_matrix_preserves_existing_outcomes_except_pit_good(self):
        for toilet, water, waste in product(
            ("water_sealed", "pour_flush", "pit_latrine", "none"),
            ("level_3", "level_2", "level_1", "none"),
            ("collected", "composted", "burned", "dumped"),
        ):
            with self.subTest(toilet=toilet, water=water, waste=waste):
                score = {"water_sealed": 3, "pour_flush": 2, "pit_latrine": 1, "none": 0}[toilet]
                score += {"level_3": 3, "level_2": 2, "level_1": 1, "none": 0}[water]
                score += {"collected": 3, "composted": 2, "burned": 1, "dumped": 0}[waste]
                expected = "good_standing" if score >= 7 else "for_completion" if score >= 4 else "violation"
                if toilet == "none" or water == "none" or waste == "dumped":
                    expected = "violation"
                if toilet == "pit_latrine" and expected == "good_standing":
                    expected = "for_completion"
                record = HouseholdSanitationRecord.objects.create(**self.payload(
                    toilet_type=toilet, water_level=water, waste_disposal=waste))
                record.refresh_from_db()
                self.assertEqual(record.status, expected)


class HouseholdSepticLegacyTests(TestCase):
    def legacy(self, toilet="water_sealed", septic="septic_tank"):
        return HouseholdSanitationRecord.objects.create(
            household_code=f"HH-LEGACY-{HouseholdSanitationRecord.objects.count()}",
            household_head="Legacy household", barangay="Daungan",
            toilet_type=toilet, septic_tank_type=septic,
            latitude=14.19, longitude=121.73,
        )

    def patch(self, record, data):
        return HouseholdSanitationRecordSerializer(record, data=data, partial=True)

    def test_new_deprecated_value_rejected(self):
        serializer = HouseholdSanitationRecordSerializer(data={
            "household_code": "HH-NEW", "household_head": "New", "barangay": "Daungan",
            "toilet_type": "water_sealed", "septic_tank_type": "septic_tank",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("septic_tank_type", serializer.errors)

    def test_explicit_deprecated_replacement_rejected(self):
        for stored in ("septic_tank", "bottomless", "vault_sealed", None, ""):
            with self.subTest(stored=stored):
                record = self.legacy(septic=stored)
                serializer = self.patch(record, {"septic_tank_type": "septic_tank"})
                self.assertFalse(serializer.is_valid())
                self.assertIn("septic_tank_type", serializer.errors)
                record.refresh_from_db()
                self.assertEqual(record.septic_tank_type, stored)

    def test_stored_legacy_serializes(self):
        self.assertEqual(HouseholdSanitationRecordSerializer(self.legacy()).data["septic_tank_type"], "septic_tank")

    def test_unrelated_and_same_toilet_patch_preserve_legacy(self):
        for toilet in ("water_sealed", "pour_flush"):
            for extra in ({}, {"toilet_type": toilet}):
                record = self.legacy(toilet)
                serializer = self.patch(record, {"address": "Changed address", **extra})
                self.assertTrue(serializer.is_valid(), serializer.errors)
                serializer.save()
                record.refresh_from_db()
                self.assertEqual(record.septic_tank_type, "septic_tank")
                self.assertEqual(record.address, "Changed address")

    def test_applicable_transition_requires_approved_replacement(self):
        for old, new in (("water_sealed", "pour_flush"), ("pour_flush", "water_sealed")):
            for extra in ({}, {"septic_tank_type": None}, {"septic_tank_type": ""}):
                with self.subTest(old=old, extra=extra):
                    record = self.legacy(old)
                    serializer = self.patch(record, {"toilet_type": new, **extra})
                    self.assertFalse(serializer.is_valid())
                    self.assertIn("septic_tank_type", serializer.errors)
                    record.refresh_from_db()
                    self.assertEqual(record.toilet_type, old)
                    self.assertEqual(record.septic_tank_type, "septic_tank")

    def test_approved_replacements_succeed_with_or_without_transition(self):
        for old, new, septic in product(
            ("water_sealed", "pour_flush"), ("water_sealed", "pour_flush"),
            ("bottomless", "vault_sealed"),
        ):
            record = self.legacy(old)
            serializer = self.patch(record, {"toilet_type": new, "septic_tank_type": septic})
            self.assertTrue(serializer.is_valid(), serializer.errors)
            serializer.save()
            record.refresh_from_db()
            self.assertEqual((record.toilet_type, record.septic_tank_type), (new, septic))

    def test_inapplicable_transition_clears_legacy(self):
        for toilet in ("pit_latrine", "none"):
            record = self.legacy()
            serializer = self.patch(record, {"toilet_type": toilet})
            self.assertTrue(serializer.is_valid(), serializer.errors)
            serializer.save()
            record.refresh_from_db()
            self.assertIsNone(record.septic_tank_type)

    def test_unknown_replacement_rejected(self):
        serializer = self.patch(self.legacy(), {"septic_tank_type": "unknown"})
        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["septic_tank_type"][0].code, "invalid_choice")

    def test_non_deprecated_values_preserved_on_applicable_transition(self):
        for septic in (None, "", "bottomless", "vault_sealed"):
            record = self.legacy(septic=septic)
            serializer = self.patch(record, {"toilet_type": "pour_flush"})
            self.assertTrue(serializer.is_valid(), serializer.errors)
            serializer.save()
            record.refresh_from_db()
            self.assertEqual(record.septic_tank_type, septic)


class HouseholdSepticMigrationTests(TransactionTestCase):
    def test_existing_row_migrates_without_fabricated_septic_value(self):
        executor = MigrationExecutor(connection)
        leaves = executor.loader.graph.leaf_nodes()
        before = [("api", "0040_sanitaryestablishment_tracking_code")]
        try:
            executor.migrate(before)
            old_model = executor.loader.project_state(before).apps.get_model("api", "HouseholdSanitationRecord")
            old = old_model.objects.create(household_code="HH-LEGACY", household_head="Legacy", barangay="Daungan")
            executor = MigrationExecutor(connection)
            executor.migrate(leaves)
            new_model = executor.loader.project_state(leaves).apps.get_model("api", "HouseholdSanitationRecord")
            self.assertIn("septic_tank_type", [field.name for field in new_model._meta.fields])
            migrated = new_model.objects.get(pk=old.pk)
            self.assertIsNone(migrated.septic_tank_type)
            self.assertEqual(migrated.household_head, "Legacy")
        finally:
            MigrationExecutor(connection).migrate(leaves)
