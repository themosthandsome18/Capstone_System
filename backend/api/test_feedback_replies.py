"""POST /api/mobile/tourism/feedback/replies/: has the office answered MY reviews?

A tourist has no account, so the key is the pass: the survey ID and the exact contact number, in the body (never in the address). The answer is the list of
the reviews that were written WITH that pass, each as exactly three things: id, destination_id, reply. Wrong or unknown is the same answer (no rows) and
is counted, per address, like the pass status. Only reviews written after FeedbackEntry.survey_id existed can be answered; older ones are never guessed
to belong to anybody. The people in these tests are made up.
"""
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache, caches
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, FeedbackEntry, Resort, TouristRecord, UserProfile
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables
from .throttles import FeedbackReplyRateThrottle, PassStatusRateThrottle
from .visit_support import CONTACT, arrived_visit, visit_fields

URL = "/api/mobile/tourism/feedback/replies/"
SUBMIT = "/api/mobile/tourism/feedback/"
OTHER_CONTACT = "09181112222"
LIMIT = 30
HOUR = 3600


def keys_in(value):
    found = set()
    if isinstance(value, dict):
        found |= set(value)
        for item in value.values():
            found |= keys_in(item)
    elif isinstance(value, list):
        for item in value:
            found |= keys_in(item)
    return found


@override_settings(USE_SEED_DATA=False)
class FeedbackRepliesBase(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.beach = make_resort(1, "Beach One")
        self.cove = make_resort(2, "Cove Two")
        self.mine = arrived_visit(self.beach, "RPL-0001")  # my pass, with my number
        self.theirs = arrived_visit(self.beach, "RPL-0002")  # somebody else's pass at the SAME place
        TouristRecord.objects.filter(pk="RPL-0002").update(contact_number=OTHER_CONTACT)
        self.theirs.refresh_from_db()
        self.client = APIClient()

    def write_review(self, visit, destination=1, **fields):
        body = {"destination_id": destination, "reviewer": "A Visitor", "rating": 4, "message": "A made-up review.", **visit_fields(visit), **fields}
        response = APIClient().post(SUBMIT, body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return FeedbackEntry.objects.get(pk=response.json()["id"])

    def answer(self, entry, text):
        FeedbackEntry.objects.filter(pk=entry.pk).update(reply=text)

    def ask(self, reference="RPL-0001", contact=CONTACT, address="10.1.1.1", **extra):
        body = {"reference": reference, "contact": contact}
        body.update(extra)
        return self.client.post(URL, body, format="json", REMOTE_ADDR=address)


class WhatTheAnswerHoldsTests(FeedbackRepliesBase):
    def test_the_right_two_keys_give_my_reviews_with_the_office_s_answer(self):
        first = self.write_review(self.mine)
        second = self.write_review(self.mine)
        self.answer(first, "Thank you for coming!")

        response = self.ask()

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json(),
            {
                "rows": [
                    {"id": first.pk, "destination_id": 1, "reply": "Thank you for coming!"},
                    {"id": second.pk, "destination_id": 1, "reply": ""},
                ],
                "summary": {"total": 2},
            },
        )

    def test_each_row_has_exactly_three_fields(self):
        entry = self.write_review(self.mine, reviewer="Zacarias Quimbo", message="Call me on 09175550123.")
        self.answer(entry, "Thanks!")

        row = self.ask().json()["rows"][0]

        self.assertEqual(set(row), {"id", "destination_id", "reply"})

    def test_nothing_about_a_person_is_in_the_answer(self):
        entry = self.write_review(self.mine, reviewer="Zacarias Quimbo", message="Call me on 09175550123.")
        self.answer(entry, "Thanks!")

        text = self.ask().content.decode().lower()

        for secret in ("zacarias", "quimbo", "09175550123", CONTACT, "rpl-0001", "call me", "a visitor", "hidden", "@"):
            self.assertNotIn(secret.lower(), text, secret)

    def test_the_survey_id_is_not_case_sensitive_and_the_contact_is_compared_by_its_digits(self):
        self.write_review(self.mine)

        for reference, contact in (("rpl-0001", CONTACT), (" Rpl-0001 ", CONTACT), ("RPL-0001", "+639170000000"), ("RPL-0001", "0917-000-0000")):
            with self.subTest(reference=reference, contact=contact):
                self.assertEqual(self.ask(reference, contact).json()["summary"]["total"], 1)

    def test_a_visit_with_no_review_is_no_rows_and_is_not_a_failed_guess(self):
        with patch.object(FeedbackReplyRateThrottle, "record_failure") as counted:
            response = self.ask()

        self.assertEqual(response.json(), {"rows": [], "summary": {"total": 0}})
        counted.assert_not_called()

    def test_a_review_that_has_not_been_answered_has_an_empty_reply(self):
        entry = self.write_review(self.mine)

        self.assertEqual(self.ask().json()["rows"], [{"id": entry.pk, "destination_id": 1, "reply": ""}])

    def test_a_changed_answer_is_what_stands_now(self):
        entry = self.write_review(self.mine)
        self.answer(entry, "First answer.")
        self.assertEqual(self.ask().json()["rows"][0]["reply"], "First answer.")

        self.answer(entry, "A better answer.")

        self.assertEqual(self.ask().json()["rows"][0]["reply"], "A better answer.")


class OnlyMyReviewsTests(FeedbackRepliesBase):
    def test_never_the_review_of_somebody_else_even_at_the_same_destination(self):
        mine = self.write_review(self.mine)
        theirs = self.write_review(self.theirs)
        self.answer(theirs, "A private-looking answer for somebody else.")

        ids = [row["id"] for row in self.ask().json()["rows"]]

        self.assertEqual(ids, [mine.pk])
        self.assertNotIn(theirs.pk, ids)
        self.assertNotIn("somebody else", self.ask().content.decode())
        # and the other way round
        self.assertEqual([row["id"] for row in self.ask("RPL-0002", OTHER_CONTACT).json()["rows"]], [theirs.pk])

    def test_a_review_written_before_the_column_existed_is_never_given_to_anybody(self):
        old = FeedbackEntry.objects.create(destination=self.beach, reviewer="Old", rating=5, date="2026-10-01", title="t", message="m", reply="An old answer")
        self.assertIsNone(old.survey_id)
        mine = self.write_review(self.mine)

        for reference, contact in (("RPL-0001", CONTACT), ("RPL-0002", OTHER_CONTACT)):
            ids = [row["id"] for row in self.ask(reference, contact).json()["rows"]]
            self.assertNotIn(old.pk, ids)
        self.assertEqual([row["id"] for row in self.ask().json()["rows"]], [mine.pk])

    def test_a_review_of_the_same_destination_written_with_another_pass_of_mine_is_mine_only_through_that_pass(self):
        # one person, two passes: each pass answers for the reviews written with IT
        also_mine = arrived_visit(self.beach, "RPL-0003")
        first = self.write_review(self.mine)
        second = self.write_review(also_mine)

        self.assertEqual([row["id"] for row in self.ask("RPL-0001").json()["rows"]], [first.pk])
        self.assertEqual([row["id"] for row in self.ask("RPL-0003").json()["rows"]], [second.pk])

    def test_a_review_at_another_destination_with_my_other_pass_is_not_in_this_pass_s_answer(self):
        elsewhere = arrived_visit(self.cove, "RPL-0004")
        mine = self.write_review(self.mine)
        self.write_review(elsewhere, destination=2)

        self.assertEqual([row["id"] for row in self.ask().json()["rows"]], [mine.pk])

    def test_the_contact_number_is_checked_the_survey_id_alone_gives_nothing(self):
        self.write_review(self.mine)

        for contact in (OTHER_CONTACT, "09170000001", "917000000", "0000", "x"):
            with self.subTest(contact=contact):
                self.assertEqual(self.ask("RPL-0001", contact).json(), {"rows": [], "summary": {"total": 0}})

    def test_a_wrong_number_and_an_unknown_survey_id_give_the_same_answer(self):
        self.write_review(self.mine)

        wrong_number = self.ask("RPL-0001", OTHER_CONTACT)
        unknown = self.ask("NO-SUCH-PASS", CONTACT)

        self.assertEqual(wrong_number.status_code, unknown.status_code)
        self.assertEqual(wrong_number.json(), unknown.json())

    def test_the_other_person_s_number_gives_them_theirs_and_not_mine(self):
        mine = self.write_review(self.mine)
        theirs = self.write_review(self.theirs)

        self.assertEqual([r["id"] for r in self.ask("RPL-0001", OTHER_CONTACT).json()["rows"]], [])  # my pass, their number: nothing
        self.assertEqual([r["id"] for r in self.ask("RPL-0002", CONTACT).json()["rows"]], [])  # their pass, my number: nothing
        self.assertTrue(mine.pk and theirs.pk)

    def test_it_is_a_post_and_the_keys_in_the_address_are_not_read(self):
        self.write_review(self.mine)

        self.assertEqual(self.client.get(URL, {"reference": "RPL-0001", "contact": CONTACT}).status_code, 405)
        in_the_address = self.client.post(f"{URL}?reference=RPL-0001&contact={CONTACT}", {}, format="json")
        self.assertEqual(in_the_address.status_code, 400)  # the keys are in the body or nowhere

    def test_a_missing_key_is_refused_and_not_counted(self):
        with patch.object(FeedbackReplyRateThrottle, "record_failure") as counted:
            for body in ({}, {"reference": "RPL-0001"}, {"contact": CONTACT}, {"reference": "", "contact": ""}):
                with self.subTest(body=body):
                    self.assertEqual(self.client.post(URL, body, format="json").status_code, 400)
        counted.assert_not_called()


class TheSurveyIdIsKeptOnlyAfterTheCheckTests(FeedbackRepliesBase):
    def test_a_review_that_is_taken_keeps_the_survey_id_of_its_visit(self):
        entry = self.write_review(self.mine)

        self.assertEqual(entry.survey_id, "RPL-0001")

    def test_the_survey_id_kept_is_the_record_s_own_not_the_way_it_was_typed(self):
        entry = self.write_review(self.mine, survey_id=" rpl-0001 ")

        self.assertEqual(entry.survey_id, "RPL-0001")

    def test_a_review_that_is_refused_keeps_nothing(self):
        response = APIClient().post(SUBMIT, {"destination_id": 1, "reviewer": "x", "rating": 5, "message": "y", "survey_id": "RPL-0001", "contact_number": OTHER_CONTACT}, format="json")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(FeedbackEntry.objects.exists())

    def test_a_survey_id_sent_in_the_post_cannot_be_forced_onto_a_review(self):
        # the serializer does not list the column: what is kept is the visit that was CHECKED, never a value the sender chose for it
        entry = self.write_review(self.mine, extra_survey_id="RPL-0002")
        APIClient().post(SUBMIT, {"destination_id": 1, "reviewer": "x", "rating": 5, "message": "y", **visit_fields(self.mine), "id": 99999}, format="json")

        self.assertEqual(entry.survey_id, "RPL-0001")
        self.assertEqual(FeedbackEntry.objects.filter(survey_id="RPL-0002").count(), 0)


class NobodyIsShownTheSurveyIdTests(FeedbackRepliesBase):
    def test_it_is_in_no_answer(self):
        entry = self.write_review(self.mine)
        staff = User.objects.create(username="reply_staff")
        UserProfile.objects.create(user=staff, role=ROLE_TOURISM)
        web = APIClient()
        web.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=staff).key}")

        answers = {
            "web list": web.get("/api/feedback/").json(),
            "web detail": web.get(f"/api/feedback/{entry.pk}/").json(),
            "mobile destination": APIClient().get("/api/mobile/tourism/destinations/1/").json(),
            "mobile bootstrap": APIClient().get("/api/mobile/tourism/bootstrap/").json(),
            "the replies themselves": self.ask().json(),
        }
        submitted = APIClient().post(SUBMIT, {"destination_id": 1, "reviewer": "x", "rating": 5, "message": "y", **visit_fields(self.theirs)}, format="json").json()
        answers["the answer to the sender"] = submitted

        for name, body in answers.items():
            with self.subTest(answer=name):
                self.assertNotIn("survey_id", keys_in(body))
                self.assertNotIn("RPL-0001", str(body))
                self.assertNotIn("RPL-0002", str(body))


@override_settings(USE_SEED_DATA=False)
class TheLimitTests(FeedbackRepliesBase):
    def setUp(self):
        super().setUp()
        self.clock = [1_800_000_000.0]
        patcher = patch.object(FeedbackReplyRateThrottle, "timer", staticmethod(lambda: self.clock[0]))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(lambda: caches["throttle"].clear())

    def guess_wrong(self, times, address="10.1.1.1"):
        return [self.ask("RPL-0001", f"0918000{index:04d}", address).status_code for index in range(times)]

    def test_the_limit_is_thirty_failures_an_hour(self):
        self.assertEqual(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["feedback_reply_ip"], "30/hour")

    def test_thirty_wrong_guesses_are_answered_and_the_thirty_first_is_refused(self):
        codes = self.guess_wrong(LIMIT + 1)

        self.assertEqual(codes[:LIMIT], [200] * LIMIT)
        self.assertEqual(codes[LIMIT], 429)

    def test_after_the_limit_even_the_right_number_is_refused_until_the_hour_has_passed(self):
        self.write_review(self.mine)
        self.guess_wrong(LIMIT)

        refused = self.ask()
        self.assertEqual(refused.status_code, 429)
        self.assertEqual(refused.json(), {"detail": "Too many attempts from this device. Please try again in an hour."})

        self.clock[0] += HOUR - 1
        self.assertEqual(self.ask().status_code, 429)
        self.clock[0] += 2
        self.assertEqual(self.ask().status_code, 200)

    def test_right_answers_cost_nothing(self):
        self.write_review(self.mine)

        codes = [self.ask().status_code for _ in range(LIMIT * 2)]

        self.assertEqual(set(codes), {200})

    def test_the_count_is_for_each_address(self):
        self.guess_wrong(LIMIT)

        self.assertEqual(self.ask(address="10.2.2.2").status_code, 200)

    def test_it_has_its_own_counter_apart_from_the_pass_status(self):
        self.guess_wrong(LIMIT)

        # the pass status door is not shut by guesses made at this one
        status_url = "/api/mobile/tourism/records/status/"
        self.assertEqual(self.client.get(status_url, {"reference": "RPL-0001", "contact": CONTACT}, REMOTE_ADDR="10.1.1.1").status_code, 200)
        self.assertEqual(PassStatusRateThrottle.fixed_scope, "pass_status_ip")
        self.assertEqual(FeedbackReplyRateThrottle.fixed_scope, "feedback_reply_ip")
