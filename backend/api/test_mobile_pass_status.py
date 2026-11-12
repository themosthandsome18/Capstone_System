"""GET /api/mobile/tourism/records/status/ : where a tourist's own pass stands now.

A copy of the pass is kept on the phone, with the status it had when it was made ("pending"). This is how the app finds out that the tourist has
since been scanned. It is a public lookup of one's own record, made the way the sanitation report history is: BOTH the survey ID on the pass and the
exact contact number are required, a wrong number and an unknown record answer the same, and the answer holds only what is needed (the status, when
it was checked in, the destination): no name, no email, no contact number. The people in these tests are made up.
"""
import json
from datetime import timedelta

from django.core.cache import cache, caches
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Resort, TouristRecord
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

URL = "/api/mobile/tourism/records/status/"
CONTACT = "09170000000"
EMAIL = "pass.owner@example.test"
NAME_WORD = "Group"  # the full name the test records carry
EMPTY = {"rows": [], "summary": {"total": 0}}


@override_settings(USE_SEED_DATA=False)
class PassStatusTests(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()  # the limit on this endpoint has nothing left over from another test
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(7, "Status Beach")
        arrive(self.resort, "SURV-2026-0001", 3, status="pending")
        arrive(self.resort, "SURV-2026-0002", 2, status="arrived")
        arrive(self.resort, "SURV-2026-0003", 4, status="no_show")
        self.when = (timezone.now() - timedelta(hours=2)).replace(microsecond=0)  # no microseconds: their digits could spell part of a number the tests look for
        TouristRecord.objects.filter(pk="SURV-2026-0002").update(checked_in_at=self.when)
        TouristRecord.objects.update(email=EMAIL)  # so that a leak of it can be seen

    def ask(self, **params):
        return self.client.get(URL, params)  # no login: the tourist has no account

    # -- both keys are required -------------------------------------------------

    def test_no_keys_is_400_with_a_plain_message(self):
        response = self.ask()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "Enter both the contact number and the survey ID from your pass."})

    def test_the_survey_id_alone_is_400(self):
        self.assertEqual(self.ask(reference="SURV-2026-0002").status_code, 400)

    def test_the_contact_number_alone_is_400(self):
        self.assertEqual(self.ask(contact=CONTACT).status_code, 400)

    def test_a_blank_key_counts_as_missing(self):
        self.assertEqual(self.ask(reference="  ", contact=CONTACT).status_code, 400)
        self.assertEqual(self.ask(reference="SURV-2026-0002", contact="   ").status_code, 400)

    # -- a wrong number and an unknown record are not told apart ---------------------

    def test_a_wrong_number_and_an_unknown_record_give_the_same_answer(self):
        wrong_number = self.ask(reference="SURV-2026-0002", contact="09179999999")
        no_such_record = self.ask(reference="SURV-2026-9999", contact=CONTACT)
        no_such_record_and_number = self.ask(reference="SURV-2026-9999", contact="09179999999")

        self.assertEqual(wrong_number.status_code, 200)
        self.assertEqual(wrong_number.status_code, no_such_record.status_code)
        self.assertEqual(wrong_number.content, no_such_record.content)
        self.assertEqual(wrong_number.content, no_such_record_and_number.content)
        self.assertEqual(wrong_number.json(), EMPTY)

    def test_a_partial_number_matches_nothing(self):
        self.assertEqual(self.ask(reference="SURV-2026-0002", contact="0917000000").json(), EMPTY)
        self.assertEqual(self.ask(reference="SURV-2026-0002", contact="170000000").json(), EMPTY)

    def test_a_contact_with_no_digits_matches_nothing(self):
        self.assertEqual(self.ask(reference="SURV-2026-0002", contact="not a number").json(), EMPTY)

    # -- the right two give the real status ---------------------------------------

    def test_a_pending_pass_says_pending_and_was_not_checked_in(self):
        row = self.ask(reference="SURV-2026-0001", contact=CONTACT).json()["rows"][0]
        self.assertEqual(row["status"], "pending")
        self.assertIsNone(row["checked_in_at"])

    def test_a_scanned_pass_says_arrived_and_when(self):
        response = self.ask(reference="SURV-2026-0002", contact=CONTACT)
        self.assertEqual(response.status_code, 200)
        row = response.json()["rows"][0]
        self.assertEqual(row["status"], "arrived")
        self.assertEqual(row["checked_in_at"], self.when.isoformat())
        self.assertEqual(response.json()["summary"], {"total": 1})

    def test_a_pass_that_was_not_used_says_no_show(self):
        self.assertEqual(self.ask(reference="SURV-2026-0003", contact=CONTACT).json()["rows"][0]["status"], "no_show")

    def test_it_follows_the_record_the_moment_it_changes(self):
        self.assertEqual(self.ask(reference="SURV-2026-0001", contact=CONTACT).json()["rows"][0]["status"], "pending")
        TouristRecord.objects.filter(pk="SURV-2026-0001").update(status="arrived", checked_in_at=timezone.now())
        row = self.ask(reference="SURV-2026-0001", contact=CONTACT).json()["rows"][0]
        self.assertEqual(row["status"], "arrived")
        self.assertIsNotNone(row["checked_in_at"])

    def test_the_destination_is_named(self):
        row = self.ask(reference="SURV-2026-0002", contact=CONTACT).json()["rows"][0]
        self.assertEqual(row["destination_id"], 7)
        self.assertEqual(row["destination_name"], "Status Beach")

    def test_the_survey_id_is_not_case_sensitive(self):
        for reference in ("surv-2026-0002", "Surv-2026-0002", " SURV-2026-0002 "):
            with self.subTest(reference=reference):
                self.assertEqual(self.ask(reference=reference, contact=CONTACT).json()["summary"], {"total": 1})

    def test_the_contact_number_is_compared_by_its_digits(self):
        # the pass keeps the number as the server answered it (+63 form); the record keeps its own form
        for contact in ("09170000000", "+639170000000", "+63 917 000 0000", "0917-000-0000", "63 917 000 0000"):
            with self.subTest(contact=contact):
                self.assertEqual(self.ask(reference="SURV-2026-0002", contact=contact).json()["summary"], {"total": 1})

    def test_a_record_stored_with_the_plus_63_form_matches_the_09_form(self):
        TouristRecord.objects.filter(pk="SURV-2026-0002").update(contact_number="+639170000000")
        self.assertEqual(self.ask(reference="SURV-2026-0002", contact="09170000000").json()["summary"], {"total": 1})

    def test_an_archived_record_still_answers(self):
        TouristRecord.objects.filter(pk="SURV-2026-0002").update(is_archived=True)
        self.assertEqual(self.ask(reference="SURV-2026-0002", contact=CONTACT).json()["rows"][0]["status"], "arrived")

    # -- what the answer holds ---------------------------------------------------------

    def test_the_answer_holds_exactly_four_things(self):
        row = self.ask(reference="SURV-2026-0002", contact=CONTACT).json()["rows"][0]
        self.assertEqual(set(row), {"status", "checked_in_at", "destination_id", "destination_name"})

    def test_there_is_no_name_no_email_and_no_contact_number_in_any_answer(self):
        for params in (
            {"reference": "SURV-2026-0002", "contact": CONTACT},
            {"reference": "SURV-2026-0001", "contact": CONTACT},
            {"reference": "SURV-2026-0003", "contact": "+639170000000"},
            {"reference": "SURV-2026-0002", "contact": "09179999999"},
            {"reference": "SURV-2026-9999", "contact": CONTACT},
            {"reference": "SURV-2026-0002"},
        ):
            with self.subTest(params=params):
                text = self.ask(**params).content.decode()
                self.assertNotIn(NAME_WORD, text)
                self.assertNotIn(EMAIL, text)
                self.assertNotIn("example.test", text)
                self.assertNotIn("917", text)  # no part of the number
                self.assertNotIn("0000000", text)
                self.assertNotIn("SURV-2026-0002", text)  # the survey ID is not echoed either: the app already has it
                for key in ("full_name", "first_name", "last_name", "email", "contact_number", "survey_id"):
                    self.assertNotIn(key, json.dumps(json.loads(text)))

    def test_a_record_with_a_name_in_every_field_still_leaks_none_of_it(self):
        TouristRecord.objects.filter(pk="SURV-2026-0002").update(
            first_name="Marisol", last_name="Dela Cruzzz", full_name="Marisol Dela Cruzzz", email="marisol.private@example.test", parking_space="Plate ZZZ-999"
        )
        text = self.ask(reference="SURV-2026-0002", contact=CONTACT).content.decode()
        for secret in ("Marisol", "Cruzzz", "marisol.private", "ZZZ-999"):
            self.assertNotIn(secret, text)

    # -- who may ask ---------------------------------------------------------------------

    def test_it_needs_no_login(self):
        self.assertEqual(self.client.get(URL, {"reference": "SURV-2026-0002", "contact": CONTACT}).status_code, 200)

    def test_it_only_reads(self):
        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(URL, {"reference": "SURV-2026-0002", "contact": CONTACT})
                self.assertEqual(response.status_code, 405)
        self.assertEqual(TouristRecord.objects.get(pk="SURV-2026-0002").status, "arrived")
