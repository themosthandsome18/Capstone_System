"""The staff QR scanner: the history is the account's OWN scans, and the check-in no longer takes the counts.

History: the records THIS account checked in (checked_in_by = the caller), the latest scan first (by checked_in_at, not by updated_at), at most 40, the
`search` working inside that list. For every role. A record nobody checked in, a no-show, and a record someone else checked in are not in it.

Check-in: it records the arrival (status "arrived", checked_in_by, checked_in_at) and nothing else. The eight counts are IGNORED when sent (an older app
still sends them): the answer is still 200, and the record keeps the counts it had. The shape of the answer is as it was.
"""
from datetime import timedelta

from django.utils import timezone

from .models import TouristRecord
from .test_destination_accuracy import arrive
from .test_record_checked_in_by import RECORD_FIELDS
from .test_resort_staff_scope import ID_A, ID_B, NAME_A, NAME_B, RESORT_A, RESORT_B, ScannerScopeBase

COUNTS = ["total_visitors", "filipino_count", "foreigner_count", "total_male", "total_female", "age_0_7", "age_8_59", "age_60_above"]
ALL_WHO = ["admin", "tourism", "resort_a"]


def reload(survey_id):
    return TouristRecord.objects.get(pk=survey_id)


def scanned(survey_id, user, when):
    """The record as if `user` had checked it in at `when` (without the API, to set the moment exactly)."""
    TouristRecord.objects.filter(pk=survey_id).update(status="arrived", checked_in_by=user, checked_in_at=when)


class HistoryIsOwnScansTests(ScannerScopeBase):
    def test_it_shows_only_the_records_the_caller_checked_in(self):
        for who, survey in (("admin", ID_A), ("tourism", ID_B)):
            self.assertEqual(self.check_in(who, survey).status_code, 200)
        self.assertEqual(self.ids(self.history("admin")), [ID_A])
        self.assertEqual(self.ids(self.history("tourism")), [ID_B])
        self.assertEqual(self.history("admin").json()["count"], 1)

    def test_the_same_for_admin_tourism_and_resort(self):
        for who in ALL_WHO:
            TouristRecord.objects.filter(pk=ID_A).update(status="pending", checked_in_by=None, checked_in_at=None)
            self.assertEqual(self.ids(self.history(who)), [], who)  # nothing scanned yet
            self.check_in(who, ID_A)
            self.assertEqual(self.ids(self.history(who)), [ID_A], who)

    def test_a_record_checked_in_by_someone_else_of_the_same_resort_is_not_there(self):
        self.check_in("resort_a", ID_A)
        self.assertEqual(self.ids(self.history("resort_a")), [ID_A])
        self.assertEqual(self.ids(self.history("resort_a2")), [])  # a colleague of the same resort scanned nothing
        self.assertEqual(self.history("resort_a2").json(), {"count": 0, "records": []})

    def test_a_record_checked_in_by_someone_else_is_not_there_for_admin_and_tourism_either(self):
        self.check_in("resort_a", ID_A)
        for who in ("admin", "tourism"):
            self.assertEqual(self.ids(self.history(who)), [], who)

    def test_the_last_check_in_of_a_record_is_the_one_that_counts(self):
        self.check_in("resort_a", ID_A)
        self.check_in("admin", ID_A)
        self.assertEqual(self.ids(self.history("admin")), [ID_A])
        self.assertEqual(self.ids(self.history("resort_a")), [])

    def test_a_record_nobody_checked_in_is_not_there(self):
        for who in ALL_WHO:
            self.assertEqual(self.ids(self.history(who)), [], who)  # the two bookings of the setUp are pending
        self.assertEqual(reload(ID_A).status, "pending")

    def test_a_no_show_is_not_there(self):
        arrive(self.a, "SURV-2026-NOSHOW", 2, status="no_show")
        for who in ALL_WHO:
            self.assertNotIn("SURV-2026-NOSHOW", self.ids(self.history(who)), who)
        # not even when it is looked at, and not when it has someone's name in checked_in_by without a moment
        TouristRecord.objects.filter(pk="SURV-2026-NOSHOW").update(checked_in_by=self.users["admin"])
        self.assertNotIn("SURV-2026-NOSHOW", self.ids(self.history("admin")))

    def test_the_latest_scan_comes_first_by_the_moment_of_the_scan(self):
        now = timezone.now()
        arrive(self.a, "SURV-2026-OLD", 1)
        arrive(self.a, "SURV-2026-MID", 1)
        arrive(self.a, "SURV-2026-NEW", 1)
        user = self.users["admin"]
        scanned("SURV-2026-OLD", user, now - timedelta(hours=3))
        scanned("SURV-2026-NEW", user, now - timedelta(minutes=1))
        scanned("SURV-2026-MID", user, now - timedelta(hours=1))
        order = [row["survey_id"] for row in self.history("admin").json()["records"]]
        self.assertEqual(order, ["SURV-2026-NEW", "SURV-2026-MID", "SURV-2026-OLD"])

    def test_it_is_not_ordered_by_when_the_record_was_last_updated(self):
        now = timezone.now()
        arrive(self.a, "SURV-2026-FIRST", 1)
        arrive(self.a, "SURV-2026-SECOND", 1)
        user = self.users["admin"]
        scanned("SURV-2026-FIRST", user, now - timedelta(hours=2))  # scanned first...
        scanned("SURV-2026-SECOND", user, now - timedelta(hours=1))  # ...and second
        # ...but the FIRST one was edited afterwards, so it is the one updated last
        TouristRecord.objects.filter(pk="SURV-2026-FIRST").update(updated_at=now + timedelta(days=1))
        order = [row["survey_id"] for row in self.history("admin").json()["records"]]
        self.assertEqual(order, ["SURV-2026-SECOND", "SURV-2026-FIRST"])

    def test_the_search_works_inside_the_own_list(self):
        self.check_in("admin", ID_A)
        self.check_in("admin", ID_B)
        self.assertEqual(self.ids(self.history("admin", search="Ana")), [ID_A])
        self.assertEqual(self.ids(self.history("admin", search=ID_B)), [ID_B])
        self.assertEqual(self.ids(self.history("admin", search=RESORT_B)), [ID_B])
        self.assertEqual(self.ids(self.history("admin", search=NAME_A.split()[1])), [ID_A])
        self.assertEqual(self.history("admin", search="nobody-at-all").json(), {"count": 0, "records": []})

    def test_the_search_does_not_reach_the_records_of_others(self):
        self.check_in("resort_a", ID_A)  # the admin scanned nothing
        for search in (NAME_A, "Ana", ID_A, RESORT_A):
            self.assertEqual(self.history("admin", search=search).json(), {"count": 0, "records": []}, search)
            self.assertEqual(self.history("resort_a2", search=search).json(), {"count": 0, "records": []}, search)

    def test_it_is_at_most_40_for_every_role(self):
        now = timezone.now()
        for who in ALL_WHO:
            for number in range(45):
                survey = f"SURV-2026-{who[:3].upper()}{number:04d}"
                arrive(self.a, survey, 1)
                scanned(survey, self.users[who], now - timedelta(minutes=number))
            rows = self.history(who).json()["records"]
            self.assertEqual(len(rows), 40, who)
            self.assertEqual(rows[0]["survey_id"], f"SURV-2026-{who[:3].upper()}0000", who)  # the latest of the 45
            self.assertEqual(self.history(who).json()["count"], 40, who)

    def test_the_resort_a_resort_staff_sends_is_ignored_and_the_office_may_still_choose(self):
        self.check_in("resort_a", ID_A)
        for sent in (self.b.resort_id, 999, "abc", ""):
            self.assertEqual(self.ids(self.history("resort_a", resort_id=sent)), [ID_A], f"resort_id={sent!r}")
        self.check_in("admin", ID_B)
        self.assertEqual(self.ids(self.history("admin", resort_id=self.b.resort_id)), [ID_B])
        self.assertEqual(self.ids(self.history("admin", resort_id=self.a.resort_id)), [])

    def test_the_rows_have_the_same_fields_as_before(self):
        self.check_in("admin", ID_A)
        row = self.history("admin").json()["records"][0]
        self.assertEqual(set(row), RECORD_FIELDS | {"resort_name", "region_name", "province_name"})
        self.assertEqual(row["resort_name"], RESORT_A)

    def test_an_account_not_linked_to_a_resort_is_still_refused(self):
        self.assertEqual(self.history("unlinked").status_code, 403)


class CheckInIgnoresTheCountsTests(ScannerScopeBase):
    SENT = {
        "total_visitors": 77, "filipino_count": 70, "foreigner_count": 7, "total_male": 40, "total_female": 37, "age_0_7": 5, "age_8_59": 60,
        "age_60_above": 12,
    }

    def counts(self, survey_id):
        return {name: getattr(reload(survey_id), name) for name in COUNTS}

    def test_the_counts_that_are_sent_are_ignored_and_the_check_in_is_still_200(self):
        for who in ALL_WHO:
            TouristRecord.objects.filter(pk=ID_A).update(status="pending", checked_in_by=None, checked_in_at=None)
            before = self.counts(ID_A)
            response = self.check_in(who, ID_A, status="arrived", **self.SENT)
            self.assertEqual(response.status_code, 200, who)
            self.assertEqual(self.counts(ID_A), before, who)
            for name, sent in self.SENT.items():
                self.assertNotEqual(getattr(reload(ID_A), name), sent, f"{who}: {name} must not take the number that was sent")

    def test_each_count_alone_is_ignored(self):
        before = self.counts(ID_A)
        for name, value in self.SENT.items():
            response = self.check_in("resort_a", ID_A, **{name: value})
            self.assertEqual(response.status_code, 200, name)
            self.assertEqual(self.counts(ID_A), before, name)

    def test_nonsense_counts_are_ignored_too_and_not_refused(self):
        before = self.counts(ID_A)
        for junk in ("abc", -5, None, "", 10**9, 3.7, [1], {"a": 1}):
            response = self.check_in("admin", ID_A, total_visitors=junk, age_0_7=junk)
            self.assertEqual(response.status_code, 200, repr(junk))
            self.assertEqual(self.counts(ID_A), before, repr(junk))

    def test_the_arrival_is_recorded_all_the_same(self):
        before = timezone.now() - timedelta(seconds=2)
        response = self.check_in("resort_a", ID_A, **self.SENT)
        self.assertEqual(response.status_code, 200)
        record = reload(ID_A)
        self.assertEqual(record.status, "arrived")
        self.assertEqual(record.checked_in_by_id, self.users["resort_a"].pk)
        self.assertGreaterEqual(record.checked_in_at, before)
        self.assertLessEqual(record.checked_in_at, timezone.now() + timedelta(seconds=2))

    def test_a_check_in_with_no_counts_at_all_is_the_same(self):
        before = self.counts(ID_A)
        response = self.check_in("admin", ID_A)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.counts(ID_A), before)
        self.assertEqual(reload(ID_A).status, "arrived")

    def test_the_shape_of_the_answer_is_as_it_was(self):
        for who in ALL_WHO:
            body = self.check_in(who, ID_A, **self.SENT).json()
            self.assertEqual(set(body), {"message", "record"}, who)
            self.assertEqual(body["message"], "Tourist successfully checked in and recorded!", who)
            self.assertEqual(set(body["record"]), RECORD_FIELDS | {"resort_name"}, who)
            self.assertEqual(body["record"]["status"], "arrived", who)

    def test_the_answer_carries_the_counts_the_record_has_not_the_ones_sent(self):
        before = self.counts(ID_A)
        record = self.check_in("admin", ID_A, **self.SENT).json()["record"]
        for name in COUNTS:
            self.assertEqual(record[name], before[name], name)

    def test_a_booking_of_another_resort_is_still_refused_and_nothing_changes(self):
        before = self.counts(ID_B)
        response = self.check_in("resort_a", ID_B, **self.SENT)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.counts(ID_B), before)
        self.assertIsNone(reload(ID_B).checked_in_by)
