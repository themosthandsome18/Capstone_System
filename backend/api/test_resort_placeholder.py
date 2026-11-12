"""Resort.is_placeholder: a resort that an import MADE UP is not a place, so it is marked, and the GIS map leaves it off.

What is tested here: which of the resorts that already exist the migration marks (only the ones that are certainly an import's, never a real resort,
and nothing is guessed); that all THREE importers mark what they make; that the server clears the mark when an admin gives the resort a coordinate that
is not the import's, and that no client can write it; and that the web's answers carry the key and the phone's do not.
"""
import importlib
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, Resort, UserProfile
from .services import placeholder_resorts as constants
from .services.online_booking import ReferenceResolver
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables

migration = importlib.import_module("api.migrations.0071_resort_is_placeholder")


def resort(pk, name, **extra):
    fields = dict(
        resort_name=name, type="Beach Resort", location="Mauban, Quezon", short_description="Written by the admin.", access="Boat",
        latitude=14.2, longitude=121.7, image_key="", with_mayors_permit=False,
    )
    fields.update(extra)
    return Resort.objects.create(resort_id=pk, **fields)


def marked(pk):
    return Resort.objects.get(pk=pk).is_placeholder


@override_settings(USE_SEED_DATA=False)
class MigrationMarksOnlyWhatIsCertainTests(TestCase):
    def setUp(self):
        ensure_test_reference_tables()
        Resort.objects.all().delete()

    def run_migration(self):
        migration.mark_import_placeholders(apps, None)

    def test_the_three_signatures_of_an_import_are_marked(self):
        resort(20, "Online Booking One", short_description=constants.ONLINE_BOOKING_DESCRIPTION, latitude=14.185, longitude=121.731)
        resort(16, "Others / Private Residence", short_description=constants.FALLBACK_DESCRIPTION, latitude=14.185, longitude=121.725)
        resort(21, "Monitoring Form One", short_description=constants.MONITORING_FORM_DESCRIPTION, latitude=14.185, longitude=121.731)

        self.run_migration()

        self.assertEqual([marked(20), marked(16), marked(21)], [True, True, True])

    def test_a_real_resort_an_admin_added_is_never_marked(self):
        resort(30, "Real Without Photo Or Permit", latitude=14.30, longitude=121.80)  # the original bug: real, no image_key, no permit
        resort(31, "Real With Everything", with_mayors_permit=True, image_key="real-one")

        self.run_migration()

        self.assertFalse(marked(30))
        self.assertFalse(marked(31))

    def test_a_real_resort_whose_coordinate_is_near_the_default_but_not_it_is_not_marked(self):
        # like the 16th resort of the local database: 14.185881, 121.73211 is close to the import's 14.185, 121.731 and is a place somebody chose
        resort(32, "Chosen Near The Middle", latitude=14.185881, longitude=121.73211)
        resort(33, "Chosen Near The Middle With The Import's Words", short_description=constants.ONLINE_BOOKING_DESCRIPTION, latitude=14.185881, longitude=121.73211)

        self.run_migration()

        self.assertFalse(marked(32))
        self.assertFalse(marked(33))  # the words of an import, but the admin has said where it is

    def test_an_imported_resort_an_admin_has_given_a_photo_or_a_permit_is_not_marked(self):
        resort(34, "Imported Then Photographed", short_description=constants.ONLINE_BOOKING_DESCRIPTION, latitude=14.185, longitude=121.731, image_key="now-real")
        resort(35, "Imported Then Permitted", short_description=constants.ONLINE_BOOKING_DESCRIPTION, latitude=14.185, longitude=121.731, with_mayors_permit=True)

        self.run_migration()

        self.assertFalse(marked(34))
        self.assertFalse(marked(35))

    def test_the_words_of_one_importer_with_the_coordinate_of_another_are_not_marked(self):
        resort(36, "Mixed", short_description=constants.FALLBACK_DESCRIPTION, latitude=14.185, longitude=121.731)  # the fallback's words, the other coordinate

        self.run_migration()

        self.assertFalse(marked(36))

    def test_a_resort_with_the_default_coordinate_and_words_of_its_own_is_not_guessed_to_be_one(self):
        resort(37, "Admin Typed The Middle Of Town", latitude=14.185, longitude=121.731)  # the default coordinate, the admin's own description

        self.run_migration()

        self.assertFalse(marked(37))

    def test_running_it_again_changes_nothing(self):
        resort(20, "Online Booking One", short_description=constants.ONLINE_BOOKING_DESCRIPTION, latitude=14.185, longitude=121.731)
        resort(30, "Real", latitude=14.30, longitude=121.80)

        self.run_migration()
        self.run_migration()

        self.assertEqual([marked(20), marked(30)], [True, False])

    def test_the_migration_holds_the_same_words_and_coordinates_as_the_constants(self):
        self.assertEqual(migration.SIGNATURES, constants.PLACEHOLDER_SIGNATURES)

    def test_a_new_resort_is_not_a_placeholder_unless_something_says_so(self):
        self.assertFalse(Resort._meta.get_field("is_placeholder").default)
        self.assertFalse(resort(40, "New").is_placeholder)


@override_settings(USE_SEED_DATA=False)
class TheThreeImportersMarkWhatTheyMakeTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()

    def test_the_online_booking_fallback_is_marked(self):
        found = ReferenceResolver(commit=True).resort("A Place Nobody Set Up")

        self.assertEqual((found.resort_id, found.resort_name), (16, "Others / Private Residence"))
        saved = Resort.objects.get(pk=16)
        self.assertTrue(saved.is_placeholder)
        self.assertEqual((saved.latitude, saved.longitude), constants.FALLBACK_COORDINATES)
        self.assertEqual(saved.short_description, constants.FALLBACK_DESCRIPTION)

    def test_the_online_booking_resort_made_for_a_new_name_is_marked(self):
        # the importer makes one for a name when the fallback cannot be made
        with patch.object(Resort.objects, "get_or_create", side_effect=RuntimeError("no fallback")):
            found = ReferenceResolver(commit=True).resort("A Brand New Name")

        saved = Resort.objects.get(pk=found.resort_id)
        self.assertEqual(saved.resort_name, "A Brand New Name")
        self.assertTrue(saved.is_placeholder)
        self.assertEqual((saved.latitude, saved.longitude), constants.ONLINE_BOOKING_COORDINATES)
        self.assertEqual(saved.short_description, constants.ONLINE_BOOKING_DESCRIPTION)

    def test_the_monitoring_form_command_marks_the_resorts_it_makes(self):
        from openpyxl import Workbook

        book = Workbook()
        sheet = book.active
        sheet.title = "Summary Resort Arrivals"
        sheet.append(["RESORT", "JANUARY", "FEBRUARY"])
        sheet.append(["Monitored Beach", 10, 12])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "monitoring.xlsx"
            book.save(path)
            call_command("import_tourism_excel", str(path), "--year", "2025", verbosity=0)

        saved = Resort.objects.get(resort_name="Monitored Beach")
        self.assertTrue(saved.is_placeholder)
        self.assertEqual((saved.latitude, saved.longitude), constants.MONITORING_FORM_COORDINATES)
        self.assertEqual(saved.short_description, constants.MONITORING_FORM_DESCRIPTION)

    def test_what_an_importer_makes_is_exactly_what_the_migration_would_mark(self):
        ReferenceResolver(commit=True).resort("Anything")
        Resort.objects.filter(pk=16).update(is_placeholder=False)

        migration.mark_import_placeholders(apps, None)

        self.assertTrue(marked(16))

    def test_an_importer_does_not_mark_a_resort_that_already_exists(self):
        real = resort(5, "Dona Choleng Camping Resort")
        found = ReferenceResolver(commit=True).resort("Dona Choleng Camping Resort")

        self.assertEqual(found.resort_id, real.resort_id)
        self.assertFalse(marked(5))


@override_settings(USE_SEED_DATA=False)
class TheServerClearsTheMarkWhenTheAdminSaysWhereItIsTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create(username="placeholder_tourism")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.placeholder = resort(
            16, "Others / Private Residence", short_description=constants.FALLBACK_DESCRIPTION, latitude=14.185, longitude=121.725, is_placeholder=True
        )

    def patch(self, **fields):
        return self.client.patch(f"/api/resorts/{self.placeholder.resort_id}/", fields, format="json")

    def test_a_real_coordinate_makes_it_a_place_and_not_a_placeholder(self):
        response = self.patch(latitude=14.2501, longitude=121.8123)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(marked(16))
        self.assertFalse(response.json()["is_placeholder"])

    def test_a_real_coordinate_in_either_value_alone_is_enough(self):
        self.patch(latitude=14.2501)  # only the latitude changed: the pair is no longer the import's

        self.assertFalse(marked(16))

    def test_saving_something_else_leaves_it_a_placeholder(self):
        response = self.patch(resort_name="Others / Private Residence (renamed)", short_description="Edited.")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(marked(16))

    def test_saving_the_import_s_own_coordinate_leaves_it_a_placeholder(self):
        self.patch(latitude=14.185, longitude=121.725)
        self.assertTrue(marked(16))

        self.patch(latitude=14.185, longitude=121.731)  # another of the import's pairs: still nobody has said where it is
        self.assertTrue(marked(16))

    def test_a_put_with_the_whole_resort_and_a_real_coordinate_clears_it(self):
        body = self.client.get(f"/api/resorts/{self.placeholder.resort_id}/").json()
        body.update(latitude=14.26, longitude=121.82)

        response = self.client.put(f"/api/resorts/{self.placeholder.resort_id}/", body, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(marked(16))

    def test_a_client_cannot_write_the_mark_either_way(self):
        self.patch(is_placeholder=False)
        self.assertTrue(marked(16))  # it cannot be switched off by hand

        real = resort(50, "Real")
        self.client.patch("/api/resorts/50/", {"is_placeholder": True}, format="json")
        self.assertFalse(marked(50))  # nor on

    def test_a_resort_the_admin_adds_is_not_a_placeholder_whatever_it_says(self):
        response = self.client.post(
            "/api/resorts/",
            {"resort_name": "Added By The Admin", "type": "Beach Resort", "location": "Mauban", "short_description": "Real.", "access": "Boat",
             "latitude": 14.2, "longitude": 121.7, "is_placeholder": True},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(marked(response.json()["resort_id"]))
        self.assertFalse(response.json()["is_placeholder"])

    def test_a_real_resort_stays_not_a_placeholder_when_saved_with_the_import_s_coordinate(self):
        real = resort(51, "Real One")

        self.client.patch("/api/resorts/51/", {"latitude": 14.185, "longitude": 121.731}, format="json")

        self.assertFalse(marked(51))  # the mark is only ever cleared by a save, never set by one


@override_settings(USE_SEED_DATA=False)
class TheWebSeesTheKeyAndThePhoneDoesNotTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create(username="placeholder_web")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.web = APIClient()
        self.web.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.real = resort(1, "Real Beach")
        self.fake = resort(16, "Others / Private Residence", short_description=constants.FALLBACK_DESCRIPTION, latitude=14.185, longitude=121.725, is_placeholder=True)

    @staticmethod
    def keys_in(value):
        found = set()
        if isinstance(value, dict):
            found |= set(value)
            for item in value.values():
                found |= TheWebSeesTheKeyAndThePhoneDoesNotTests.keys_in(item)
        elif isinstance(value, list):
            for item in value:
                found |= TheWebSeesTheKeyAndThePhoneDoesNotTests.keys_in(item)
        return found

    def test_the_web_list_of_resorts_carries_it(self):
        rows = {row["resort_id"]: row for row in self.web.get("/api/resorts/").json()}

        self.assertEqual((rows[1]["is_placeholder"], rows[16]["is_placeholder"]), (False, True))

    def test_the_web_bootstrap_and_reference_tables_carry_it(self):
        bootstrap = self.web.get("/api/bootstrap/").json()
        rows = {row["resort_id"]: row for row in bootstrap["referenceTables"]["resorts"]}
        self.assertEqual((rows[1]["is_placeholder"], rows[16]["is_placeholder"]), (False, True))

        tables = {row["resort_id"]: row for row in self.web.get("/api/reference-tables/").json()["resorts"]}
        self.assertEqual((tables[1]["is_placeholder"], tables[16]["is_placeholder"]), (False, True))

    def test_the_web_detail_carries_it(self):
        self.assertTrue(self.web.get("/api/resorts/16/").json()["is_placeholder"])

    def test_nothing_the_phone_is_given_carries_the_key(self):
        anonymous = APIClient()
        bootstrap = anonymous.get("/api/mobile/tourism/bootstrap/").json()
        self.assertNotIn("is_placeholder", self.keys_in(bootstrap))
        self.assertTrue(bootstrap["destinations"] or bootstrap["featuredDestinations"] or bootstrap["referenceTables"]["resorts"])

        for url in ("/api/mobile/tourism/destinations/", "/api/mobile/tourism/destinations/1/"):
            with self.subTest(url=url):
                self.assertNotIn("is_placeholder", self.keys_in(anonymous.get(url).json()))

    def test_the_phone_still_gets_every_key_it_had(self):
        before = {"resort_id", "resort_name", "with_mayors_permit", "type", "location", "short_description", "tourism_rating", "access",
                  "itinerary_ids", "image_key", "is_active", "monthly_arrivals", "yearly_arrivals", "review_count", "latitude", "longitude",
                  "coordinates", "images"}
        row = APIClient().get("/api/mobile/tourism/bootstrap/").json()["referenceTables"]["resorts"][0]

        self.assertEqual(set(row), before)
