from django.contrib.auth.models import User
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from .models import HouseholdSanitationRecord, ROLE_SANITATION, UserProfile
from .serializers import HouseholdSanitationRecordSerializer


@override_settings(USE_SEED_DATA=False)
class HouseholdAddressTests(TestCase):
    address = "  Lot 7, Sitio Original ? do not split  "
    url = "/api/households/records/"
    mobile_url = "/api/mobile/sanitation/household-surveys/"

    def setUp(self):
        user = User.objects.create_user(username="address_inspector")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        self.payload = {
            "household_head": "Address household", "barangay": "Daungan",
            "address": self.address, "toilet_type": "water_sealed",
            "water_level": "level_3", "waste_disposal": "collected",
        }
        self.record = HouseholdSanitationRecord.objects.create(
            household_code="HH-ADDRESS", **self.payload,
            house_number="12-A", sitio="Mabini",
        )
        self.detail = f"{self.url}{self.record.pk}/"

    def assert_stored(self, house_number="12-A", sitio="Mabini"):
        self.record.refresh_from_db()
        self.assertEqual(self.record.house_number, house_number)
        self.assertEqual(self.record.sitio, sitio)
        self.assertEqual(self.record.address, self.address)
        self.assertEqual(self.record.barangay, "Daungan")

    def test_new_creation_web_and_mobile(self):
        for url in (self.url, self.mobile_url):
            with self.subTest(url=url):
                response = self.client.post(url, {
                    **self.payload, "house_number": "12-A", "sitio": "Mabini",
                }, format="json")
                self.assertEqual(response.status_code, 201, response.data)
                record = HouseholdSanitationRecord.objects.get(pk=response.data["id"])
                self.assertEqual((record.house_number, record.sitio), ("12-A", "Mabini"))

    def test_legacy_creation_web_and_mobile(self):
        for url in (self.url, self.mobile_url):
            with self.subTest(url=url):
                response = self.client.post(url, self.payload, format="json")
                self.assertEqual(response.status_code, 201, response.data)
                record = HouseholdSanitationRecord.objects.get(pk=response.data["id"])
                self.assertEqual((record.house_number, record.sitio), ("", ""))
                # Existing serializer whitespace handling is unchanged on creation.
                self.assertEqual(record.address, self.address.strip())

    def test_readback_serializer_api_and_mobile_bootstrap(self):
        self.assertEqual(HouseholdSanitationRecordSerializer(self.record).data["address"], self.address)
        for url in (self.detail, self.url, "/api/households/bootstrap/",
                    "/api/mobile/sanitation/staff-bootstrap/"):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200, response.data)
                data = response.data
                if isinstance(data, dict) and "householdRecords" in data:
                    data = data["householdRecords"]
                elif isinstance(data, dict) and "records" in data:
                    data = data["records"]
                row = data if isinstance(data, dict) else next(r for r in data if r["id"] == self.record.pk)
                self.assertEqual(row["house_number"], "12-A")
                self.assertEqual(row["sitio"], "Mabini")
                self.assertEqual(row["address"], self.address)

    def test_patch_omission_and_independent_clearing(self):
        response = self.client.patch(self.detail, {"remarks": "Changed"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_stored()
        for field in ("house_number", "sitio"):
            response = self.client.patch(self.detail, {field: ""}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assert_stored("", "" if field == "sitio" else "Mabini")

    def test_put_omission_and_independent_clearing(self):
        # Full-update required fields supplied; address and new fields omitted.
        payload = {k: v for k, v in self.payload.items() if k != "address"}
        payload["household_code"] = self.record.household_code
        response = self.client.put(self.detail, payload, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_stored()
        for field in ("house_number", "sitio"):
            response = self.client.put(self.detail, {**payload, field: ""}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assert_stored("", "" if field == "sitio" else "Mabini")

    def test_legacy_mobile_post_update_preserves_omitted_values(self):
        payload = {k: v for k, v in self.payload.items() if k != "address"}
        response = self.client.post(self.mobile_url, {
            **payload, "household_code": self.record.household_code,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assert_stored()

    def test_structured_update_preserves_historical_address(self):
        response = self.client.patch(self.detail, {
            "house_number": "B-9", "sitio": "New Sitio",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_stored("B-9", "New Sitio")

    def test_null_and_overlength_rejected_on_create_and_updates(self):
        for field in ("house_number", "sitio"):
            for value in (None, "x" * 121):
                for method, url, payload in (
                    ("post", self.url, self.payload),
                    ("post", self.mobile_url, self.payload),
                    ("patch", self.detail, {}),
                    ("put", self.detail, {**self.payload, "household_code": "HH-ADDRESS"}),
                    ("post", self.mobile_url, {**self.payload, "household_code": "HH-ADDRESS"}),
                ):
                    with self.subTest(field=field, value=value, method=method, url=url):
                        response = getattr(self.client, method)(url, {**payload, field: value}, format="json")
                        self.assertEqual(response.status_code, 400, response.data)
                        self.assertIn(field, response.data)
                        self.assert_stored()

    def test_blank_and_120_character_boundary(self):
        for value in ("", "x" * 120):
            serializer = HouseholdSanitationRecordSerializer(self.record, data={
                "house_number": value, "sitio": value,
            }, partial=True)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            serializer.save()
            self.assert_stored(value, value)


class HouseholdAddressMigrationTests(TransactionTestCase):
    def test_additive_migration_preserves_historical_address(self):
        old = [("api", "0056_seed_boat_capacity_fares")]
        new = [("api", "0057_householdsanitationrecord_address_fields")]
        executor = MigrationExecutor(connection)
        executor.migrate(old)
        try:
            historical = executor.loader.project_state(old).apps.get_model("api", "HouseholdSanitationRecord")
            address = "  House 7, Sitio Unknown / original punctuation  "
            record = historical.objects.create(household_code="HH-HISTORY", household_head="Historical", barangay="Daungan", address=address)
            executor = MigrationExecutor(connection)
            executor.migrate(new)
            upgraded = executor.loader.project_state(new).apps.get_model("api", "HouseholdSanitationRecord").objects.get(pk=record.pk)
            self.assertEqual(upgraded.address, address)
            self.assertEqual(upgraded.barangay, "Daungan")
            self.assertEqual((upgraded.house_number, upgraded.sitio), ("", ""))
        finally:
            MigrationExecutor(connection).migrate(new)
