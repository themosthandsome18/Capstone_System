"""Who received the visitor: TouristRecord.checked_in_by and checked_in_at.

Set by the check-in of the staff QR scanner, for every role that may use it (admin, tourism, resort), and replaced by the last check-in when it is done again.
Null for a record nobody has checked in, and untouched by a check-in that is refused. For counting only: no answer of the scanner carries them, and the
ActivityLog entry of the check-in is still written.
"""
from datetime import timedelta

from django.utils import timezone

from .models import ActivityLog, TouristRecord
from .test_resort_staff_scope import CHECK_IN, HISTORY, ID_A, ID_B, LOOKUP, NAME_A, ScannerScopeBase

NEW = {"checked_in_by", "checked_in_by_id", "checked_in_at"}

# The fields of an answer, as they were before these two columns (the serializer is the one that decides, and it was not touched).
RECORD_FIELDS = {
    "survey_id", "submitted_at", "email", "consent_confirmed", "first_name", "last_name", "full_name", "contact_number", "country_id", "region_id",
    "province_id", "country_of_origin", "foreigner_count", "filipino_count", "maubanin_count", "total_visitors", "total_male", "total_female",
    "special_group_count", "age_0_7", "age_8_59", "age_60_above", "discounted_count", "arrival_date", "itinerary_id", "resort_id", "travel_mode_id",
    "boat_type_id", "boat_capacity_fare", "parking_space", "visit_purpose_id", "status", "created_at",
}
LOOKUP_EXTRA = {"resort_name", "region_name", "province_name", "country_name", "itinerary_name", "travel_mode_name", "boat_type_name", "visit_purpose_name"}
HISTORY_EXTRA = {"resort_name", "region_name", "province_name"}


def reload(survey_id):
    return TouristRecord.objects.get(pk=survey_id)


class CheckedInByTests(ScannerScopeBase):
    def test_a_record_nobody_checked_in_has_neither(self):
        for survey in (ID_A, ID_B):
            record = reload(survey)
            self.assertIsNone(record.checked_in_by)
            self.assertIsNone(record.checked_in_at)

    def test_looking_at_it_does_not_set_them(self):
        self.lookup("admin", ID_A)
        self.history("admin")
        self.assertIsNone(reload(ID_A).checked_in_by)
        self.assertIsNone(reload(ID_A).checked_in_at)

    def test_after_a_check_in_both_are_set_to_the_user_and_the_moment_for_every_role(self):
        for who, survey in (("admin", ID_B), ("tourism", ID_A), ("resort_a", ID_A), ("resort_b", ID_B)):
            TouristRecord.objects.filter(pk=survey).update(status="pending", checked_in_by=None, checked_in_at=None)
            before = timezone.now()
            response = self.check_in(who, survey)
            after = timezone.now()
            self.assertEqual(response.status_code, 200, who)
            record = reload(survey)
            self.assertEqual(record.checked_in_by_id, self.users[who].pk, who)
            self.assertIsNotNone(record.checked_in_at, who)
            self.assertTrue(before - timedelta(seconds=1) <= record.checked_in_at <= after + timedelta(seconds=1), f"{who}: {record.checked_in_at}")
            self.assertEqual(record.status, "arrived", who)

    def test_a_check_in_done_again_is_replaced_by_the_last(self):
        self.check_in("resort_a", ID_A)
        first = reload(ID_A)
        self.assertEqual(first.checked_in_by_id, self.users["resort_a"].pk)
        self.check_in("resort_a2", ID_A)  # another person of the same resort
        second = reload(ID_A)
        self.assertEqual(second.checked_in_by_id, self.users["resort_a2"].pk, "the last one to receive them is the one on record")
        self.assertGreaterEqual(second.checked_in_at, first.checked_in_at)
        self.check_in("admin", ID_A)  # and the office after them
        third = reload(ID_A)
        self.assertEqual(third.checked_in_by_id, self.users["admin"].pk)
        self.assertGreaterEqual(third.checked_in_at, second.checked_in_at)

    def test_the_same_person_again_moves_the_moment_forward(self):
        self.check_in("resort_a", ID_A)
        TouristRecord.objects.filter(pk=ID_A).update(checked_in_at=timezone.now() - timedelta(days=2))
        old = reload(ID_A).checked_in_at
        self.check_in("resort_a", ID_A)
        self.assertGreater(reload(ID_A).checked_in_at, old + timedelta(days=1))

    def test_a_refused_check_in_sets_nothing_and_replaces_nothing(self):
        # another resort's booking, never checked in
        self.assertEqual(self.check_in("resort_a", ID_B).status_code, 404)
        self.assertIsNone(reload(ID_B).checked_in_by)
        self.assertIsNone(reload(ID_B).checked_in_at)
        # the same, for a booking that WAS checked in by someone: the refused attempt leaves the real one
        self.check_in("resort_b", ID_B)
        recorded = reload(ID_B)
        self.assertEqual(self.check_in("resort_a", ID_B).status_code, 404)
        again = reload(ID_B)
        self.assertEqual((again.checked_in_by_id, again.checked_in_at), (recorded.checked_in_by_id, recorded.checked_in_at))
        self.assertEqual(again.checked_in_by_id, self.users["resort_b"].pk)

    def test_the_accounts_that_are_refused_set_nothing(self):
        for who in ("unlinked", "tourist", "establishment"):
            self.assertEqual(self.check_in(who, ID_A).status_code, 403, who)
        self.assertIsNone(reload(ID_A).checked_in_by)
        self.assertIsNone(reload(ID_A).checked_in_at)

    def test_a_record_that_does_not_exist_changes_nothing(self):
        self.assertEqual(self.check_in("admin", "NO-SUCH-ID").status_code, 404)
        self.assertEqual(TouristRecord.objects.exclude(checked_in_by=None).count(), 0)

    def test_the_count_of_who_received_how_many_can_be_made_from_the_column(self):
        self.check_in("resort_a", ID_A)
        self.check_in("resort_a2", ID_A)
        self.check_in("resort_b", ID_B)
        TouristRecord.objects.filter(pk=ID_A).update(checked_in_by=self.users["resort_a"])
        counts = {user.username: user.checked_in_records.count() for user in self.users.values() if user.checked_in_records.exists()}
        self.assertEqual(counts, {"scan_resort_a": 1, "scan_resort_b": 1})

    def test_a_person_who_goes_leaves_the_record_with_no_one_and_does_not_delete_it(self):
        self.check_in("resort_a", ID_A)
        self.users["resort_a"].delete()
        record = reload(ID_A)
        self.assertIsNone(record.checked_in_by)
        self.assertEqual(record.status, "arrived")

    def test_the_activity_log_is_still_written(self):
        logs = ActivityLog.objects.count()
        self.check_in("resort_a", ID_A)
        self.assertEqual(ActivityLog.objects.count(), logs + 1)
        log = ActivityLog.objects.latest("id")
        self.assertEqual((log.user_id, log.record_id, log.record_label), (self.users["resort_a"].pk, ID_A, f"Verified check-in for {NAME_A}"))
        self.assertEqual((log.module, log.action, log.record_type), ("tourism", "update", "TouristRecord"))


class TheAnswersAreAsTheyWereTests(ScannerScopeBase):
    def assert_no_new_field(self, body, where):
        self.assertFalse(NEW & set(body), f"{where}: {NEW & set(body)}")

    def test_lookup_has_the_same_fields_as_before(self):
        for who in ("admin", "tourism", "resort_a"):
            body = self.lookup(who, ID_A).json()
            self.assertEqual(set(body), RECORD_FIELDS | LOOKUP_EXTRA, who)
            self.assert_no_new_field(body, who)
        self.check_in("resort_a", ID_A)  # also after the record carries them
        self.assertEqual(set(self.lookup("admin", ID_A).json()), RECORD_FIELDS | LOOKUP_EXTRA)

    def test_check_in_has_the_same_fields_as_before(self):
        for who, survey in (("admin", ID_A), ("tourism", ID_B), ("resort_b", ID_B)):
            body = self.check_in(who, survey).json()
            self.assertEqual(set(body), {"message", "record"}, who)
            self.assertEqual(set(body["record"]), RECORD_FIELDS | {"resort_name"}, who)
            self.assert_no_new_field(body["record"], who)

    def test_history_has_the_same_fields_as_before(self):
        self.check_in("resort_a", ID_A)
        for who in ("admin", "tourism", "resort_a"):
            body = self.history(who).json()
            self.assertEqual(set(body), {"count", "records"}, who)
            for row in body["records"]:
                self.assertEqual(set(row), RECORD_FIELDS | HISTORY_EXTRA, who)
                self.assert_no_new_field(row, who)

    def test_the_list_of_the_web_has_the_same_fields_too(self):
        self.check_in("resort_a", ID_A)
        body = self.as_("admin").get("/api/tourist-records/").json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        self.assertTrue(rows)  # the fixture
        for row in rows:
            self.assert_no_new_field(row, "tourist-records")
