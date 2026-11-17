"""The online booking import's fallback resort ("Others / Private Residence"): found by a FLAG, never by an id.

The importer used to look for "the resort with id 16". That was right in the live database only because the fallback happens to be id 16 there; in
another database id 16 is some other resort an admin added (the local one has a real, active destination at 16), and every booking naming a resort
nobody had set up went into THAT one, silently. Now the resort is the one flagged Resort.is_fallback; when there is none, one is made at the next free id.

Here: the trap itself (another resort at id 16 is never touched), one fallback only (the smallest id if there are several, and a notice), the flag is
not cleared by anything an admin does (unlike is_placeholder), the migration that flags the one that already exists, and the preview, which says how
many rows go to the fallback, and which names they carry, before anything is imported.
"""
import importlib
import logging
import datetime
from io import BytesIO

from django.apps import apps
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, Resort, TouristRecord, UserProfile
from .services import placeholder_resorts as constants
from .services.online_booking import COLUMNS, ReferenceResolver, process_online_booking_workbook
from .test_resort_placeholder import resort
from .tests import ensure_test_reference_tables

migration = importlib.import_module("api.migrations.0074_resort_is_fallback")
FALLBACK_NAME = "Others / Private Residence"


def build_workbook(rows):
    book = Workbook()
    sheet = book.active
    sheet.title = "Form Responses 1"
    for offset, row in enumerate(rows):
        values = {
            "arrival_date": datetime.datetime(2026, 4, 2), "total_visitors": 2, "total_male": 1, "total_female": 1, "itinerary": "Overnight",
            "maubanin_count": 0, "special_group_count": 0, "foreigner_count": 2, "filipino_count": 0, "age_0_7": 0, "age_8_59": 2, "age_60_above": 0,
            "travel_mode": "Private Vehicle", "boat_type": "Public Boat", "visit_purpose": "Leisure", "consent": "Yes", "country": "United States",
            "contact_number": f"0917000{offset:04d}", **row,
        }
        for key, value in values.items():
            sheet.cell(row=3 + offset, column=COLUMNS[key], value=value)
    out = BytesIO()
    book.save(out)
    out.seek(0)
    return out


def make_row(name, resort_name):
    return {"full_name": name, "resort": resort_name}


@override_settings(USE_SEED_DATA=False)
class FallbackBase(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()


class TheTrapOfIdSixteenTests(FallbackBase):
    """Another resort at id 16 (an ordinary active destination an admin added) is never taken for the fallback."""

    def test_a_resort_at_id_16_is_not_the_fallback(self):
        other = resort(16, "ZZ Added By The Admin")

        found = ReferenceResolver(commit=True).resort("A Place Nobody Set Up")

        self.assertNotEqual(found.resort_id, 16)
        self.assertEqual(found.resort_id, 17)  # the next free id
        self.assertEqual(found.resort_name, FALLBACK_NAME)
        self.assertTrue(found.is_fallback)
        self.assertTrue(found.is_placeholder)
        untouched = Resort.objects.get(pk=16)
        self.assertEqual((untouched.resort_name, untouched.is_fallback, untouched.is_placeholder, untouched.short_description), (other.resort_name, False, False, other.short_description))

    def test_the_fallback_that_is_made_is_inactive(self):
        """It is a bucket for names that could not be matched, not a place anyone visits: not offered in the app or in the registration form."""
        found = ReferenceResolver(commit=True).resort("A Place Nobody Set Up")
        self.assertFalse(found.is_active)
        self.assertFalse(Resort.objects.get(pk=found.resort_id).is_active)
        self.assertFalse(ReferenceResolver(commit=False).resort("Another Unknown").is_active)  # also in the preview's stand-in

    def test_a_fallback_that_exists_keeps_whatever_active_state_it_has(self):
        """The importer does not switch an existing one on or off: it only finds it by its flag."""
        for active in (True, False):
            Resort.objects.all().delete()
            flagged = resort(7, "The Bucket", is_fallback=True, is_active=active)
            ReferenceResolver(commit=True).resort("Nobody Knows This")
            self.assertEqual(Resort.objects.get(pk=flagged.resort_id).is_active, active)

    def test_an_inactive_fallback_is_still_found_and_still_gets_the_rows(self):
        flagged = resort(7, "The Bucket", is_fallback=True, is_active=False)
        self.assertEqual(ReferenceResolver(commit=True).resort("Nobody Knows This").resort_id, flagged.resort_id)
        self.assertEqual(Resort.objects.count(), 1)  # no second one is made because the first is inactive

    def test_with_no_resorts_at_all_the_fallback_is_made_at_the_next_free_id_not_at_16(self):
        found = ReferenceResolver(commit=True).resort("Anything")
        self.assertEqual(found.resort_id, 1)
        self.assertFalse(Resort.objects.filter(pk=16).exists())

    def test_the_flagged_resort_is_used_wherever_its_id_is_and_id_16_is_left_alone(self):
        resort(16, "ZZ Added By The Admin")
        flagged = resort(7, "Whatever It Is Called Now", is_fallback=True)

        found = ReferenceResolver(commit=True).resort("Nobody Knows This")

        self.assertEqual(found.resort_id, flagged.resort_id)
        self.assertEqual(Resort.objects.count(), 2)  # none was made
        self.assertEqual(Resort.objects.get(pk=16).resort_name, "ZZ Added By The Admin")

    def test_a_renamed_fallback_is_still_the_fallback(self):
        """The reason for the flag: an admin renames it, and no second one is made."""
        flagged = resort(3, "Misc Bookings", is_fallback=True)
        resolver = ReferenceResolver(commit=True)
        self.assertEqual(resolver.resort("Unknown One").resort_id, flagged.resort_id)
        self.assertEqual(resolver.resort("Unknown Two").resort_id, flagged.resort_id)
        self.assertEqual(Resort.objects.count(), 1)

    def test_one_fallback_is_made_for_many_unknown_names(self):
        resolver = ReferenceResolver(commit=True)
        first = resolver.resort("Unknown One")
        second = resolver.resort("Unknown Two")
        self.assertEqual(first.resort_id, second.resort_id)
        self.assertEqual(Resort.objects.filter(is_fallback=True).count(), 1)

    def test_a_resort_that_exists_is_still_matched_by_its_name_first(self):
        real = resort(5, "Dona Choleng Camping Resort")
        resort(9, FALLBACK_NAME, is_fallback=True)
        self.assertEqual(ReferenceResolver(commit=True).resort("Dona Choleng Camping Resort").resort_id, real.resort_id)

    def test_a_dry_run_makes_nothing(self):
        resort(16, "ZZ Added By The Admin")
        before = Resort.objects.count()

        found = ReferenceResolver(commit=False).resort("Unknown")

        self.assertEqual(Resort.objects.count(), before)
        self.assertEqual((found.resort_id, found.is_fallback), (17, True))  # what would be made

    def test_nothing_in_the_importer_names_the_number_16(self):
        import inspect
        from .services import online_booking

        source = inspect.getsource(online_booking.ReferenceResolver)
        self.assertNotRegex(source, r"\b16\b")


class OnlyOneFallbackTests(FallbackBase):
    def test_if_there_are_two_the_smallest_id_is_used_and_a_notice_says_so(self):
        resort(9, "Second", is_fallback=True)
        resort(4, "First", is_fallback=True)

        with self.assertLogs("api.services.online_booking", level=logging.WARNING) as logs:
            resolver = ReferenceResolver(commit=True)
            found = resolver.resort("Nobody Knows This")  # it does not stop the import

        self.assertEqual(found.resort_id, 4)
        self.assertIn("ids 4, 9", resolver.fallback_notice)
        self.assertIn("the one with the smallest id, 4, is used", resolver.fallback_notice)
        self.assertTrue(any("marked as the fallback" in line for line in logs.output))

    def test_with_one_there_is_no_notice(self):
        resort(4, "Only", is_fallback=True)
        self.assertEqual(ReferenceResolver(commit=False).fallback_notice, "")

    def test_the_flag_cannot_be_on_two_by_the_importer(self):
        resolver = ReferenceResolver(commit=True)
        resolver.resort("A")
        ReferenceResolver(commit=True).resort("B")  # a later import finds the first one
        self.assertEqual(Resort.objects.filter(is_fallback=True).count(), 1)


class TheFlagIsNotClearedByAnAdminTests(FallbackBase):
    def setUp(self):
        super().setUp()
        user = User.objects.create(username="fallback_tourism")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.fallback = ReferenceResolver(commit=True).resort("Anything")
        self.other = resort(50, "A Real One")

    def patch(self, pk, **fields):
        return self.client.patch(f"/api/resorts/{pk}/", fields, format="json")

    def flagged(self, pk):
        return Resort.objects.get(pk=pk).is_fallback

    def test_a_real_coordinate_clears_the_placeholder_mark_but_not_the_fallback_flag(self):
        response = self.patch(self.fallback.resort_id, latitude=14.2501, longitude=121.8123)
        self.assertEqual(response.status_code, 200, response.content)
        saved = Resort.objects.get(pk=self.fallback.resort_id)
        self.assertFalse(saved.is_placeholder)  # the admin has said where it is: that is what is_placeholder is for
        self.assertTrue(saved.is_fallback)  # and what the resort is FOR does not change

    def test_a_rename_a_new_description_and_a_new_name_leave_it_flagged(self):
        response = self.patch(
            self.fallback.resort_id, resort_name="Private Homestays", short_description="Written by the admin.", type="Homestay", location="Elsewhere",
            access="Boat", latitude=14.3, longitude=121.8, with_mayors_permit=True, is_active=True,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(self.flagged(self.fallback.resort_id))

    def test_saving_it_deactivated_or_activated_leaves_it_flagged(self):
        for active in (False, True):
            self.assertEqual(self.patch(self.fallback.resort_id, is_active=active).status_code, 200)
            self.assertTrue(self.flagged(self.fallback.resort_id))

    def test_a_put_of_the_whole_resort_leaves_it_flagged(self):
        body = self.client.get(f"/api/resorts/{self.fallback.resort_id}/").json() if self.client.get(f"/api/resorts/{self.fallback.resort_id}/").status_code == 200 else None
        if body is None:
            self.skipTest("no detail GET on this route")
        body["latitude"], body["longitude"] = 14.26, 121.82
        self.assertIn(self.client.put(f"/api/resorts/{self.fallback.resort_id}/", body, format="json").status_code, (200, 405))
        self.assertTrue(self.flagged(self.fallback.resort_id))

    def test_a_client_cannot_clear_or_set_it(self):
        self.patch(self.fallback.resort_id, is_fallback=False)
        self.assertTrue(self.flagged(self.fallback.resort_id))
        self.patch(self.other.resort_id, is_fallback=True)
        self.assertFalse(self.flagged(self.other.resort_id))

    def test_a_new_resort_cannot_be_made_as_the_fallback(self):
        response = self.client.post(
            "/api/resorts/",
            {"resort_name": "Another Fallback", "type": "Beach Resort", "location": "Mauban", "short_description": "x", "access": "Boat", "latitude": 14.2, "longitude": 121.7, "is_fallback": True},
            format="json",
        )
        self.assertIn(response.status_code, (200, 201), response.content)
        self.assertFalse(Resort.objects.get(resort_name="Another Fallback").is_fallback)

    def test_the_answers_do_not_carry_the_flag(self):
        self.assertNotIn("is_fallback", self.client.get("/api/resorts/").json()[0])
        from .serializers import ResortSerializer

        self.assertNotIn("is_fallback", ResortSerializer().fields)


class TheMigrationFlagsTheOneThatExistsTests(FallbackBase):
    def run_migration(self):
        migration.flag_the_fallback(apps, None)

    def flagged_ids(self):
        return sorted(Resort.objects.filter(is_fallback=True).values_list("resort_id", flat=True))

    def test_the_resort_with_the_name_is_flagged_where_its_id_is(self):
        resort(16, FALLBACK_NAME)  # the live database
        resort(1, "Dona Choleng Camping Resort")
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [16])

    def test_it_is_not_the_id_that_decides(self):
        resort(2, FALLBACK_NAME)
        resort(16, "ZZ Added By The Admin")  # the local database: no fallback at all under that name
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [2])

    def test_where_nothing_has_the_name_nothing_is_flagged_and_nothing_fails(self):
        resort(16, "ZZ Added By The Admin")  # the local database
        resort(1, "Dona Choleng Camping Resort")
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [])

    def test_an_empty_table_does_not_fail(self):
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [])

    def test_run_again_it_changes_nothing(self):
        resort(16, FALLBACK_NAME)
        self.run_migration()
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [16])

    def test_once_one_is_flagged_no_other_is_flagged(self):
        resort(8, "Already The Fallback", is_fallback=True)
        resort(16, FALLBACK_NAME)
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [8])

    def test_when_the_name_is_on_two_only_the_smallest_id_is_flagged(self):
        resort(20, FALLBACK_NAME)
        resort(12, FALLBACK_NAME)
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [12])

    def test_the_name_has_to_be_exactly_it(self):
        resort(30, "others / private residence")
        resort(31, "Others / Private Residence ")
        resort(32, "Private Residence")
        self.run_migration()
        self.assertEqual(self.flagged_ids(), [])

    def test_it_holds_the_same_name_as_the_constant(self):
        self.assertEqual(migration.FALLBACK_RESORT_NAME, constants.FALLBACK_RESORT_NAME)
        self.assertEqual(constants.FALLBACK_RESORT_NAME, FALLBACK_NAME)

    def test_the_field_is_off_unless_something_turns_it_on(self):
        field = Resort._meta.get_field("is_fallback")
        self.assertFalse(field.default)
        self.assertFalse(resort(40, "New").is_fallback)


class ThePreviewSaysWhereTheRowsGoTests(FallbackBase):
    """The rows whose resort is not one we know go to the fallback. That was silent; it is now counted, and the names are given, before the import."""

    def setUp(self):
        super().setUp()
        self.known = resort(5, "Dona Choleng Camping Resort")

    def run_it(self, rows, commit=False):
        return process_online_booking_workbook(build_workbook(rows), commit=commit)

    def test_it_counts_the_rows_and_names_the_resorts_they_carry(self):
        result = self.run_it([
            make_row("A One", "Villa Unknown"), make_row("A Two", "Villa Unknown"), make_row("A Three", "Casa Nowhere"),
            make_row("A Four", "Dona Choleng Camping Resort"),
        ])
        self.assertEqual(result["valid_count"], 4, result["error_samples"])
        self.assertEqual(result["fallback_count"], 3)
        self.assertEqual(result["fallback_resort"], FALLBACK_NAME)
        self.assertEqual(result["fallback_samples"], [{"name": "Villa Unknown", "rows": 2}, {"name": "Casa Nowhere", "rows": 1}])
        self.assertEqual(result["fallback_notice"], "")

    def test_the_preview_changes_nothing(self):
        resorts, records = Resort.objects.count(), TouristRecord.objects.count()
        self.run_it([make_row("A One", "Villa Unknown")])
        self.assertEqual((Resort.objects.count(), TouristRecord.objects.count()), (resorts, records))

    def test_no_unknown_resort_is_zero_and_an_empty_list(self):
        result = self.run_it([make_row("A One", "Dona Choleng Camping Resort")])
        self.assertEqual((result["fallback_count"], result["fallback_samples"]), (0, []))

    def test_a_row_that_is_skipped_is_not_counted(self):
        bad = {**make_row("A Bad", "Villa Unknown"), "total_visitors": 9}  # 9 does not equal 1 male + 1 female
        result = self.run_it([bad, make_row("A Good", "Villa Unknown")])
        self.assertEqual(result["valid_count"], 1)
        self.assertEqual(result["fallback_count"], 1)

    def test_the_same_numbers_come_back_when_it_is_imported(self):
        rows = [make_row("A One", "Villa Unknown"), make_row("A Two", "Casa Nowhere")]
        preview = self.run_it(rows)
        done = self.run_it(rows, commit=True)
        self.assertEqual((done["fallback_count"], done["fallback_samples"]), (preview["fallback_count"], preview["fallback_samples"]))

    def test_the_names_are_listed_most_rows_first_then_by_name(self):
        result = self.run_it([make_row("A1", "Zeta"), make_row("A2", "Alpha"), make_row("A3", "Alpha"), make_row("A4", "Beta")])
        self.assertEqual([(item["name"], item["rows"]) for item in result["fallback_samples"]], [("Alpha", 2), ("Beta", 1), ("Zeta", 1)])

    def test_a_row_with_no_resort_named_is_said_so(self):
        result = self.run_it([make_row("A One", None)])
        self.assertEqual(result["fallback_samples"], [{"name": "(no resort named)", "rows": 1}])

    def test_the_notice_comes_with_the_preview_when_two_are_marked(self):
        resort(9, "Second", is_fallback=True)
        resort(4, "First", is_fallback=True)
        result = self.run_it([make_row("A One", "Villa Unknown")])
        self.assertIn("ids 4, 9", result["fallback_notice"])
        self.assertEqual(result["fallback_resort"], "First")

    def test_the_sheet_that_is_not_there_has_the_same_keys(self):
        book = Workbook()
        book.active.title = "Something Else"
        out = BytesIO()
        book.save(out)
        out.seek(0)
        result = process_online_booking_workbook(out)
        for key in ("fallback_count", "fallback_resort", "fallback_samples", "fallback_notice"):
            self.assertIn(key, result)


class TheRowsReallyGoWhereThePreviewSaidTests(FallbackBase):
    """The check of the report: with a real resort at id 16, the rows go to the fallback, and that resort is not touched."""

    def test_the_booking_lands_in_the_fallback_and_not_in_the_resort_at_16(self):
        other = resort(16, "ZZ Added By The Admin")
        rows = [make_row("Lands Elsewhere", "Villa Unknown"), make_row("Lands Elsewhere Too", "Casa Nowhere")]

        result = process_online_booking_workbook(build_workbook(rows), commit=True)

        self.assertEqual(result["imported_count"], 2, result)
        fallback = Resort.objects.get(is_fallback=True)
        self.assertNotEqual(fallback.resort_id, 16)
        self.assertEqual(TouristRecord.objects.filter(resort=fallback).count(), 2)
        self.assertEqual(TouristRecord.objects.filter(resort=other).count(), 0)
        self.assertEqual(Resort.objects.get(pk=16).resort_name, "ZZ Added By The Admin")
        self.assertFalse(fallback.is_active)
