from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import HouseholdSanitationRecord, ROLE_SANITATION, UserProfile


@override_settings(USE_SEED_DATA=False)
class MobileHouseholdRemarksTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="local_household_inspector")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        self.payload = {
            "household_head": "Local Survey Household",
            "barangay": "Daungan",
            "address": "Test address",
            "male_count": 2,
            "female_count": 3,
            "toilet_type": "water_sealed",
            "water_level": "level_3",
            "water_source": "MWSS",
            "waste_disposal": "collected",
            "latitude": "14.19",
            "longitude": "121.73",
        }

    def test_update_without_remarks_preserves_existing_web_notes(self):
        record = HouseholdSanitationRecord.objects.create(
            household_code="HH-REMARKS-TEST",
            household_head="Before survey",
            barangay="Daungan",
            remarks="Existing web notes must survive the mobile survey.",
            latitude=14.19,
            longitude=121.73,
        )
        payload = {**self.payload, "household_code": record.household_code}
        self.assertNotIn("remarks", payload)
        response = self.client.post(
            "/api/mobile/sanitation/household-surveys/", payload, format="json"
        )
        self.assertEqual(response.status_code, 201)
        record.refresh_from_db()
        self.assertEqual(HouseholdSanitationRecord.objects.count(), 1)
        self.assertEqual(record.household_head, "Local Survey Household")
        self.assertEqual(record.total_members, 5)
        self.assertEqual(
            record.remarks, "Existing web notes must survive the mobile survey."
        )
        self.assertEqual(response.data["remarks"], record.remarks)

    def test_create_without_remarks_uses_empty_default(self):
        self.assertNotIn("remarks", self.payload)
        response = self.client.post(
            "/api/mobile/sanitation/household-surveys/", self.payload, format="json"
        )
        self.assertEqual(response.status_code, 201)
        record = HouseholdSanitationRecord.objects.get(
            household_code=response.data["household_code"]
        )
        self.assertEqual(record.remarks, "")
        self.assertEqual(response.data["remarks"], "")
