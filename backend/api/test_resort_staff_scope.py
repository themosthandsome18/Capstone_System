"""The staff QR scanner (lookup, check-in, history) for the staff of a resort: their own resort and no other.

admin and tourism are as they always were (every record). A "resort" account sees, finds and checks in the records of ITS resort only; an account not linked to a
resort gets nothing; the tourist and the establishment owner are refused, as before. What is said to a resort's staff about a booking of another resort names no
visitor and no resort.
"""
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import (
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_RESORT,
    ROLE_TOURIST,
    ROLE_TOURISM,
    ActivityLog,
    Resort,
    TouristRecord,
)
from .test_destination_accuracy import arrive
from .test_destination_accuracy import make_resort as make_destination
from .test_resort_staff_role import client_of, make_user
from .tests import ensure_test_reference_tables

LOOKUP = "/api/mobile/tourism/records/lookup/"
CHECK_IN = "/api/mobile/tourism/records/check-in/"
HISTORY = "/api/mobile/tourism/records/history/"
NOT_YOURS = "This booking is not for your resort."

ID_A, ID_B = "SURV-2026-10001", "SURV-2026-20002"
NAME_A, NAME_B = "Ana Reyes", "Ben Cruz"
PHONE_A, PHONE_B = "0917-111-1111", "0918-222-2222"
MAIL_A, MAIL_B = "ana.reyes@example.test", "ben.cruz@example.test"
RESORT_A, RESORT_B = "Cove Alpha", "Cove Bravo"


@override_settings(USE_SEED_DATA=False, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])  # (a quick hasher: eight accounts per test)
class ScannerScopeBase(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()  # (the reference tables bring resorts of their own)
        self.a = make_destination(1, RESORT_A)
        self.b = make_destination(2, RESORT_B)
        for resort, survey, name, phone, mail in ((self.a, ID_A, NAME_A, PHONE_A, MAIL_A), (self.b, ID_B, NAME_B, PHONE_B, MAIL_B)):
            arrive(resort, survey, 4, status="pending")
            first, last = name.split()
            TouristRecord.objects.filter(pk=survey).update(full_name=name, first_name=first, last_name=last, contact_number=phone, email=mail)
        self.users = {
            "admin": make_user("scan_admin", ROLE_ADMIN),
            "tourism": make_user("scan_tourism", ROLE_TOURISM),
            "resort_a": make_user("scan_resort_a", ROLE_RESORT, resort=self.a),
            "resort_a2": make_user("scan_resort_a2", ROLE_RESORT, resort=self.a),
            "resort_b": make_user("scan_resort_b", ROLE_RESORT, resort=self.b),
            "unlinked": make_user("scan_unlinked", ROLE_RESORT),
            "tourist": make_user("scan_tourist", ROLE_TOURIST),
            "establishment": make_user("scan_establishment", ROLE_ESTABLISHMENT),
        }

    def as_(self, who):
        return client_of(self.users[who])

    def lookup(self, who, query):
        return self.as_(who).get(LOOKUP, {"query": query})

    def check_in(self, who, survey_id, **extra):
        return self.as_(who).post(CHECK_IN, {"survey_id": survey_id, **extra}, format="json")

    def history(self, who, **params):
        return self.as_(who).get(HISTORY, params)

    def ids(self, response):
        return sorted(row["survey_id"] for row in response.json()["records"])

    def assert_says_nothing_of_anyone(self, response):
        """No visitor, no other resort, no record: the text of the answer holds none of it."""
        text = response.content.decode()
        for secret in (NAME_A, NAME_B, "Reyes", "Cruz", PHONE_A, PHONE_B, MAIL_A, MAIL_B, RESORT_A, RESORT_B, ID_A, ID_B):
            self.assertNotIn(secret, text, secret)


class LookupTests(ScannerScopeBase):
    def test_a_resort_finds_a_booking_of_its_own_resort(self):
        response = self.lookup("resort_a", ID_A)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["survey_id"], ID_A)
        self.assertEqual(response.json()["resort_name"], RESORT_A)

    def test_a_resort_is_refused_a_booking_of_another_resort_with_the_one_message(self):
        response = self.lookup("resort_a", ID_B)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"error": NOT_YOURS})
        self.assert_says_nothing_of_anyone(response)

    def test_the_same_with_the_id_in_lower_case_in_a_qr_json_and_in_a_url(self):
        for query in (ID_B.lower(), '{"survey_id": "%s"}' % ID_B, "https://example.test/scan?survey_id=%s" % ID_B, "#" + ID_B):
            response = self.lookup("resort_a", query)
            self.assertEqual(response.status_code, 404, query)
            self.assertEqual(response.json(), {"error": NOT_YOURS}, query)

    def test_a_name_or_a_number_of_another_resort_finds_nothing(self):
        for query in (NAME_B, "Ben", "Cruz", "ben cruz", PHONE_B, "0918-222", "2222", MAIL_B, "ben.cruz", "20002", "2026-20002"):
            response = self.lookup("resort_a", query)
            self.assertEqual(response.status_code, 404, query)
            body = response.json()
            self.assertNotIn("survey_id", body, query)
            self.assertNotIn("resort_name", body, query)
            text = response.content.decode()
            for secret in (RESORT_B, MAIL_B, PHONE_B, ID_B):
                self.assertNotIn(secret, text.replace(query, ""), f"{query} -> {secret}")  # (what the person typed may be echoed; nothing else)
            self.assertNotEqual(body.get("error"), NOT_YOURS, f"{query}: a name or a number must not say that such a visitor exists elsewhere")

    def test_a_name_or_a_number_of_its_own_resort_is_found(self):
        for query in (NAME_A, "Ana", "Reyes", PHONE_A, "0917-111", MAIL_A, "10001"):
            response = self.lookup("resort_a", query)
            self.assertEqual(response.status_code, 200, query)
            self.assertEqual(response.json()["survey_id"], ID_A, query)

    def test_each_resort_finds_only_its_own(self):
        self.assertEqual(self.lookup("resort_b", ID_B).status_code, 200)
        self.assertEqual(self.lookup("resort_b", ID_A).json(), {"error": NOT_YOURS})
        self.assertEqual(self.lookup("resort_b", NAME_B).json()["survey_id"], ID_B)

    def test_two_accounts_of_the_same_resort_see_the_same(self):
        self.assertEqual(self.lookup("resort_a", ID_A).json(), self.lookup("resort_a2", ID_A).json())

    def test_a_booking_that_does_not_exist_is_the_usual_not_found(self):
        response = self.lookup("resort_a", "NO-SUCH-ID")
        self.assertEqual(response.status_code, 404)
        self.assertIn("No visitor registration found", response.json()["error"])

    def test_an_account_not_linked_to_a_resort_gets_403_even_for_nothing_to_find(self):
        for query in (ID_A, ID_B, NAME_A, "anything"):
            self.assertEqual(self.lookup("unlinked", query).status_code, 403, query)

    def test_admin_and_tourism_find_everything_and_get_the_same_shape(self):
        for who in ("admin", "tourism"):
            for survey, resort in ((ID_A, RESORT_A), (ID_B, RESORT_B)):
                response = self.lookup(who, survey)
                self.assertEqual(response.status_code, 200, who)
                self.assertEqual(response.json()["resort_name"], resort)
            self.assertEqual(self.lookup(who, NAME_B).json()["survey_id"], ID_B)
        own = self.lookup("resort_a", ID_A).json()
        self.assertEqual(set(own), set(self.lookup("admin", ID_A).json()), "the same fields, the same names")
        self.assertEqual(own, self.lookup("admin", ID_A).json())

    def test_the_tourist_and_the_establishment_are_still_refused(self):
        for who in ("tourist", "establishment"):
            response = self.lookup(who, ID_A)
            self.assertEqual(response.status_code, 403, who)
            self.assertEqual(response.json()["detail"], "Only tourism staff and administrators can look up visitor records.")

    def test_without_a_login_it_is_still_refused(self):
        from rest_framework.test import APIClient

        self.assertEqual(APIClient().get(LOOKUP, {"query": ID_A}).status_code, 401)


class CheckInTests(ScannerScopeBase):
    def test_a_resort_checks_in_a_booking_of_its_own_resort(self):
        response = self.check_in("resort_a", ID_A, total_visitors=4)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["record"]["survey_id"], ID_A)
        self.assertEqual(TouristRecord.objects.get(pk=ID_A).status, "arrived")

    def test_a_booking_of_another_resort_is_refused_with_the_one_message_and_is_not_changed(self):
        before = TouristRecord.objects.get(pk=ID_B)
        logs = ActivityLog.objects.count()
        response = self.check_in("resort_a", ID_B, total_visitors=99, filipino_count=99)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"error": NOT_YOURS})
        self.assert_says_nothing_of_anyone(response)
        after = TouristRecord.objects.get(pk=ID_B)
        self.assertEqual((after.status, after.total_visitors, after.filipino_count, after.updated_at), (before.status, before.total_visitors, before.filipino_count, before.updated_at))
        self.assertEqual(after.status, "pending")
        self.assertEqual(ActivityLog.objects.count(), logs, "nothing was logged for a check-in that did not happen")

    def test_the_id_in_another_case_does_not_get_round_it(self):
        response = self.check_in("resort_a", ID_B.lower())
        self.assertEqual(response.status_code, 404)
        self.assertEqual(TouristRecord.objects.get(pk=ID_B).status, "pending")

    def test_an_account_not_linked_to_a_resort_gets_403_and_changes_nothing(self):
        for survey in (ID_A, ID_B):
            self.assertEqual(self.check_in("unlinked", survey).status_code, 403, survey)
            self.assertEqual(TouristRecord.objects.get(pk=survey).status, "pending")

    def test_admin_and_tourism_check_in_any_booking(self):
        self.assertEqual(self.check_in("admin", ID_B).status_code, 200)
        self.assertEqual(self.check_in("tourism", ID_A).status_code, 200)
        self.assertEqual({r.status for r in TouristRecord.objects.all()}, {"arrived"})

    def test_the_tourist_and_the_establishment_are_still_refused_and_change_nothing(self):
        for who in ("tourist", "establishment"):
            response = self.check_in(who, ID_A)
            self.assertEqual(response.status_code, 403, who)
            self.assertEqual(response.json()["detail"], "Only tourism staff and administrators can check in tourists.")
        self.assertEqual(TouristRecord.objects.get(pk=ID_A).status, "pending")

    def test_the_activity_log_names_who_checked_in(self):
        self.check_in("resort_a", ID_A)
        log = ActivityLog.objects.latest("id")
        self.assertEqual(log.user_id, self.users["resort_a"].pk)
        self.assertEqual(log.record_id, ID_A)

    def test_the_answer_has_the_same_shape_as_for_admin(self):
        admin_keys = set(self.check_in("admin", ID_A).json())
        TouristRecord.objects.filter(pk=ID_A).update(status="pending")
        resort = self.check_in("resort_a", ID_A).json()
        self.assertEqual(set(resort), admin_keys)
        self.assertEqual(set(resort["record"]), set(self.check_in("admin", ID_B).json()["record"]))


class HistoryTests(ScannerScopeBase):
    """What is left of the old rules of the history after it became the account's OWN scans (the new rules are in test_scanner_history_own.py)."""

    def test_an_account_not_linked_to_a_resort_gets_403(self):
        self.assertEqual(self.history("unlinked").status_code, 403)
        self.assertEqual(self.history("unlinked", resort_id=self.a.resort_id).status_code, 403)

    def test_the_tourist_and_the_establishment_are_still_refused(self):
        for who in ("tourist", "establishment"):
            response = self.history(who)
            self.assertEqual(response.status_code, 403, who)
            self.assertEqual(response.json()["detail"], "Only tourism staff and administrators can view tourist history.")

    def test_the_answer_is_still_a_count_and_the_records(self):
        self.check_in("resort_a", ID_A)
        self.assertEqual(set(self.history("resort_a").json()), {"count", "records"})
