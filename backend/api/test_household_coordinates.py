from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import HouseholdSanitationRecord, ROLE_SANITATION, UserProfile
from .serializers import HouseholdSanitationRecordSerializer


@override_settings(USE_SEED_DATA=False)
class HouseholdCoordinateTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="coordinate_inspector")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        self.payload = {
            "household_head": "Unmapped household", "barangay": "Daungan",
            "toilet_type": "water_sealed", "water_level": "level_3",
            "waste_disposal": "collected", "remarks": "Original notes",
        }

    def create_model(self, **coordinates):
        return HouseholdSanitationRecord.objects.create(
            household_code="HH-COORD", **self.payload, **coordinates,
        )

    def assert_coordinates(self, record, expected):
        record.refresh_from_db()
        self.assertEqual((record.latitude, record.longitude), expected)

    def patch(self, record, data):
        response = self.client.patch(
            f"/api/households/records/{record.pk}/", data, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def test_web_create_without_coordinates_is_readable_as_unmapped(self):
        response = self.client.post("/api/households/records/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        record = HouseholdSanitationRecord.objects.get(pk=response.data["id"])
        self.assert_coordinates(record, (None, None))
        detail = self.client.get(f"/api/households/records/{record.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["coordinates"], {"lat": None, "lng": None})
        self.assertIsNone(detail.data["latitude"])
        self.assertIsNone(detail.data["longitude"])
        listing = self.client.get("/api/households/records/")
        self.assertEqual(listing.status_code, 200)
        self.assertIn(record.pk, [row["id"] for row in listing.data])

    def test_direct_model_create_without_coordinates_preserves_nulls(self):
        self.assert_coordinates(self.create_model(), (None, None))

    def test_historical_nulls_survive_unrelated_patch(self):
        record = self.create_model(latitude=14.19, longitude=121.73)
        HouseholdSanitationRecord.objects.filter(pk=record.pk).update(latitude=None, longitude=None)
        response = self.patch(record, {"remarks": "Changed notes"})
        self.assert_coordinates(record, (None, None))
        self.assertEqual(record.remarks, "Changed notes")
        self.assertEqual(response.data["coordinates"], {"lat": None, "lng": None})

    def test_valid_coordinates_survive_unrelated_patch(self):
        expected = (14.192345678, 121.734567891)
        record = self.create_model(latitude=expected[0], longitude=expected[1])
        self.patch(record, {"remarks": "Changed notes"})
        self.assert_coordinates(record, expected)

    def test_deliberate_coordinate_patch_persists_exact_values(self):
        record = self.create_model(latitude=14.19, longitude=121.73)
        expected = (14.213456789, 121.765432198)
        self.patch(record, {"latitude": expected[0], "longitude": expected[1]})
        self.assert_coordinates(record, expected)

    def test_serializer_accepts_zero_and_near_zero_without_replacement(self):
        for lat, lng in ((0, 0), (0.0001, -0.0001), (0, 121.73)):
            with self.subTest(latitude=lat, longitude=lng):
                serializer = HouseholdSanitationRecordSerializer(data={
                    **self.payload, "household_code": f"HH-ZERO-{lat}-{lng}",
                    "latitude": lat, "longitude": lng,
                })
                self.assertTrue(serializer.is_valid(), serializer.errors)
                self.assert_coordinates(serializer.save(), (lat, lng))

    def test_explicit_null_coordinate_patch_is_not_replaced(self):
        record = self.create_model(latitude=14.19, longitude=121.73)
        self.patch(record, {"latitude": None, "longitude": None})
        self.assert_coordinates(record, (None, None))

    def test_partial_coordinate_pair_is_not_fabricated(self):
        self.assert_coordinates(self.create_model(latitude=14.19), (14.19, None))

    def test_null_household_remains_in_dashboard_and_bootstraps(self):
        record = self.create_model(latitude=14.19, longitude=121.73)
        HouseholdSanitationRecord.objects.filter(pk=record.pk).update(latitude=None, longitude=None)
        for url in ("/api/households/dashboard/", "/api/households/bootstrap/",
                    "/api/mobile/sanitation/staff-bootstrap/"):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200, response.data)
                if "bootstrap" in url:
                    self.assertIn("Unmapped household", str(response.data))
                else:
                    self.assertEqual(response.data["summary"]["totalHouseholds"], 1)
        self.assertEqual(self.client.get("/api/sanitation/bootstrap/").status_code, 200)
