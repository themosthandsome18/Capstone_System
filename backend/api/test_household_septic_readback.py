from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import HouseholdSanitationRecord, UserProfile


@override_settings(USE_SEED_DATA=False)
class HouseholdSepticReadbackTests(TestCase):
    staff_url = "/api/mobile/sanitation/staff-bootstrap/"
    public_url = "/api/mobile/sanitation/bootstrap/"

    @classmethod
    def setUpTestData(cls):
        cls.records = []
        for index, (toilet, septic) in enumerate([
            ("water_sealed", "septic_tank"),
            ("pour_flush", "vault_sealed"),
            ("water_sealed", None),
            ("pit_latrine", None),
            ("pour_flush", "bottomless"),
        ]):
            cls.records.append(HouseholdSanitationRecord.objects.create(
                household_code=f"HH-H2A-{index}",
                household_head=f"Private H2A household {index}",
                barangay="Daungan",
                address=f"H2A address {index}",
                male_count=2,
                female_count=3,
                toilet_type=toilet,
                septic_tank_type=septic,
                water_level="level_2",
                water_source="Existing custom source",
                waste_disposal="collected",
                latitude=14.19,
                longitude=121.73,
                last_survey_date=date(2026, 9, 30),
                remarks="Preserve existing notes",
            ))

    def client_for(self, role):
        user = User.objects.create_user(username=f"h2a_{role}")
        UserProfile.objects.create(user=user, role=role)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        return client

    def assert_staff_readback(self, role):
        before = list(HouseholdSanitationRecord.objects.order_by("pk").values())
        response = self.client_for(role).get(self.staff_url)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(set(payload), {
            "establishments", "inspections", "complaintData", "householdRecords", "notifications",
        })
        rows = {row["id"]: row for row in payload["householdRecords"]}
        self.assertEqual(set(rows), {record.pk for record in self.records})
        for record in self.records:
            with self.subTest(role=role, household=record.household_code):
                self.assertEqual(rows[record.pk], {
                    "id": record.pk,
                    "household_code": record.household_code,
                    "household_head": record.household_head,
                    "barangay": record.barangay,
                    "address": record.address,
                    "male_count": record.male_count,
                    "female_count": record.female_count,
                    "toilet_type": record.toilet_type,
                    "septic_tank_type": record.septic_tank_type,
                    "water_level": record.water_level,
                    "water_source": record.water_source,
                    "waste_disposal": record.waste_disposal,
                    "status": record.status,
                    "latitude": record.latitude,
                    "longitude": record.longitude,
                    "last_survey_date": "2026-09-30",
                })
        self.assertEqual(list(HouseholdSanitationRecord.objects.order_by("pk").values()), before)

    def test_sanitation_reads_stored_values_and_preserves_existing_fields(self):
        self.assert_staff_readback("sanitation")

    def test_admin_reads_stored_values_and_preserves_existing_fields(self):
        self.assert_staff_readback("admin")

    def test_anonymous_cannot_read_staff_households(self):
        self.assertEqual(APIClient().get(self.staff_url).status_code, 401)

    def test_other_roles_cannot_read_staff_households(self):
        for role in ("tourism", "tourist", "establishment"):
            with self.subTest(role=role):
                self.assertEqual(self.client_for(role).get(self.staff_url).status_code, 403)

    def test_public_bootstrap_never_exposes_households_even_with_staff_token(self):
        for client in (APIClient(), self.client_for("sanitation")):
            response = client.get(self.public_url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["householdRecords"], [])
            body = response.content.decode()
            self.assertNotIn("septic_tank_type", body)
            for record in self.records:
                self.assertNotIn(record.household_code, body)
                self.assertNotIn(record.household_head, body)
