"""The name of a destination can be written, on POST and on PATCH, and is read cleaned.

resort_name used to be a SerializerMethodField: read-only. A rename was thrown away without a word, and a NEW destination was saved with no
name at all and then shown as "Unnamed Destination". It is a required, writable field now; what is read is still cleaned for display.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, Resort, UserProfile
from .serializers import NAME_REQUIRED_MESSAGE, ResortSerializer
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables


def body(**extra):
    data = {
        "with_mayors_permit": True,
        "type": "Beach Resort",
        "location": "Mauban, Quezon",
        "short_description": "A beach.",
        "access": "Boat",
        "latitude": 14.2,
        "longitude": 121.7,
        "itinerary_ids": [],
        "images": [],
        "image_key": "",
    }
    data.update(extra)
    return data


@override_settings(USE_SEED_DATA=False)
class DestinationNameIsWritableTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create_user(username="dest_name_tourism", password="Password@123", email="dn@test.local")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.resort = make_resort(1, "Dona Choleng Camping Resort")

    def test_a_new_destination_is_saved_with_the_name_that_was_sent(self):
        response = self.client.post("/api/resorts/", body(resort_name="Brand New Beach"), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        saved = Resort.objects.get(resort_id=response.json()["resort_id"])
        self.assertEqual(saved.resort_name, "Brand New Beach")  # not blank
        self.assertEqual(response.json()["resort_name"], "Brand New Beach")

    def test_a_new_destination_without_a_name_is_refused(self):
        before = Resort.objects.count()
        response = self.client.post("/api/resorts/", body(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["resort_name"], [NAME_REQUIRED_MESSAGE])
        self.assertEqual(Resort.objects.count(), before)

    def test_a_name_of_only_spaces_or_blank_or_null_is_refused(self):
        before = Resort.objects.count()
        for value in ("", "   ", "\t \n", None):
            with self.subTest(value=value):
                response = self.client.post("/api/resorts/", body(resort_name=value), format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["resort_name"], [NAME_REQUIRED_MESSAGE])
        self.assertEqual(Resort.objects.count(), before)

    def test_a_patch_changes_the_name_in_the_database_and_the_answer_is_the_new_name(self):
        response = self.client.patch("/api/resorts/1/", {"resort_name": "Dona Choleng K7Q"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["resort_name"], "Dona Choleng K7Q")
        self.resort.refresh_from_db()
        self.assertEqual(self.resort.resort_name, "Dona Choleng K7Q")

    def test_a_patch_with_the_whole_form_changes_the_name_and_the_permit_together(self):
        response = self.client.patch(
            "/api/resorts/1/", body(resort_name="Dona Choleng K7Q", with_mayors_permit=False, is_active=True), format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.resort.refresh_from_db()
        self.assertEqual(self.resort.resort_name, "Dona Choleng K7Q")
        self.assertFalse(self.resort.with_mayors_permit)

    def test_a_patch_that_leaves_the_name_out_keeps_it(self):
        response = self.client.patch("/api/resorts/1/", {"location": "Elsewhere"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.resort.refresh_from_db()
        self.assertEqual(self.resort.resort_name, "Dona Choleng Camping Resort")

    def test_a_patch_to_a_blank_name_is_refused_and_changes_nothing(self):
        for value in ("", "   "):
            with self.subTest(value=value):
                response = self.client.patch("/api/resorts/1/", {"resort_name": value}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["resort_name"], [NAME_REQUIRED_MESSAGE])
                self.resort.refresh_from_db()
                self.assertEqual(self.resort.resort_name, "Dona Choleng Camping Resort")

    def test_a_name_longer_than_the_column_is_refused(self):
        response = self.client.patch("/api/resorts/1/", {"resort_name": "x" * 161}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("resort_name", response.json())

    def test_the_name_is_stored_as_typed_but_trimmed(self):
        response = self.client.patch("/api/resorts/1/", {"resort_name": "  Spaced Out Beach  "}, format="json")
        self.assertEqual(response.status_code, 200)
        self.resort.refresh_from_db()
        self.assertEqual(self.resort.resort_name, "Spaced Out Beach")


class DestinationNameIsStillReadCleanedTests(TestCase):
    def test_a_destination_with_no_name_reads_as_unnamed(self):
        resort = Resort.objects.create(resort_id=9, resort_name="", type="t", location="l", short_description="d", access="a", latitude=1, longitude=1)
        self.assertEqual(ResortSerializer(resort).data["resort_name"], "Unnamed Destination")

    def test_the_cleaning_on_reading_is_unchanged(self):
        cases = {
            "  Aguho   Playa  - ": "Aguho Playa",
            "Villa (": "Villa",
            "Resort [": "Resort",
            "   ": "Unnamed Destination",
            "Plain Beach": "Plain Beach",
        }
        for index, (stored, shown) in enumerate(cases.items(), start=100):
            with self.subTest(stored=stored):
                resort = Resort.objects.create(
                    resort_id=index, resort_name=stored, type="t", location="l", short_description="d", access="a", latitude=1, longitude=1
                )
                self.assertEqual(ResortSerializer(resort).data["resort_name"], shown)

    def test_what_is_stored_is_not_cleaned_only_what_is_read(self):
        # the name is written as typed; the cleaning is only for showing it
        resort = Resort.objects.create(
            resort_id=77, resort_name="Odd (", type="t", location="l", short_description="d", access="a", latitude=1, longitude=1
        )
        resort.refresh_from_db()
        self.assertEqual(resort.resort_name, "Odd (")
        self.assertEqual(ResortSerializer(resort).data["resort_name"], "Odd")
