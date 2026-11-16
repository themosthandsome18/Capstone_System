"""POST and GET on /api/mobile/tourism/records/status/.

The app now asks with a POST, so that the contact number is in the body and not in the address (which is written to the server's access log). The GET
STAYS: build 9 of the mobile app is installed on phones and asks with a GET; a 405 would stop the passes on those phones from updating, silently.
These tests are the guard for that: the GET still works, the two answer the same, and the limit runs on both. The people here are made up.
"""
import json
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache, caches
from django.test import TestCase, override_settings

from .models import Resort
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables
from .throttles import PassStatusRateThrottle

URL = "/api/mobile/tourism/records/status/"
CONTACT = "09170000000"
LIMIT = 30
ADDRESS = "10.3.3.3"
EMPTY = {"rows": [], "summary": {"total": 0}}


@override_settings(USE_SEED_DATA=False)
class PassStatusMethodTests(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(7, "Method Beach")
        arrive(self.resort, "SURV-2026-0001", 3, status="pending")
        arrive(self.resort, "SURV-2026-0002", 2, status="arrived")
        self.clock = [1_800_000_000.0]
        patcher = patch.object(PassStatusRateThrottle, "timer", staticmethod(lambda: self.clock[0]))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(lambda: caches["throttle"].clear())

    def get(self, reference, contact=CONTACT, address=ADDRESS):
        return self.client.get(URL, {"reference": reference, "contact": contact}, REMOTE_ADDR=address)

    def post(self, reference, contact=CONTACT, address=ADDRESS):
        return self.client.post(
            URL, data=json.dumps({"reference": reference, "contact": contact}), content_type="application/json", REMOTE_ADDR=address
        )

    # -- both work ---------------------------------------------------------------------

    def test_a_post_with_the_right_survey_id_and_number_answers(self):
        response = self.post("SURV-2026-0002")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "arrived")
        self.assertEqual(rows[0]["destination_name"], "Method Beach")

    def test_a_get_with_the_right_survey_id_and_number_still_answers_this_is_what_build_9_asks(self):
        response = self.get("SURV-2026-0002")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "arrived")

    def test_a_form_post_answers_too(self):
        response = self.client.post(URL, {"reference": "SURV-2026-0002", "contact": CONTACT}, REMOTE_ADDR=ADDRESS)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["rows"]), 1)

    def test_the_two_give_the_same_answer_for_a_right_pair_a_wrong_number_an_unknown_pass_and_a_number_written_another_way(self):
        cases = [
            ("SURV-2026-0002", CONTACT),
            ("surv-2026-0002", CONTACT),  # the survey ID is not case sensitive
            ("SURV-2026-0002", "+639170000000"),  # the number is compared by its digits
            ("SURV-2026-0001", CONTACT),
            ("SURV-2026-0002", "09180000000"),  # a wrong number
            ("SURV-9999-0000", CONTACT),  # a pass that does not exist
        ]
        for reference, contact in cases:
            with self.subTest(reference=reference, contact=contact):
                got, posted = self.get(reference, contact), self.post(reference, contact)
                self.assertEqual(got.status_code, posted.status_code)
                self.assertEqual(got.json(), posted.json())
        self.assertEqual(self.get("SURV-2026-0002", "09180000000").json(), EMPTY)

    def test_the_two_refuse_a_missing_key_the_same_way(self):
        message = {"detail": "Enter both the contact number and the survey ID from your pass."}
        for params in ({}, {"reference": "SURV-2026-0002"}, {"contact": CONTACT}, {"reference": "  ", "contact": CONTACT}):
            with self.subTest(params=params):
                got = self.client.get(URL, params, REMOTE_ADDR=ADDRESS)
                posted = self.client.post(URL, data=json.dumps(params), content_type="application/json", REMOTE_ADDR=ADDRESS)
                self.assertEqual((got.status_code, got.json()), (400, message))
                self.assertEqual((posted.status_code, posted.json()), (400, message))

    def test_a_post_does_not_read_the_query_string_and_a_get_does_not_read_a_body(self):
        # the contact number in the address of a POST is not what is asked with: only the body is
        response = self.client.post(f"{URL}?reference=SURV-2026-0002&contact={CONTACT}", data=json.dumps({}), content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_the_answer_holds_the_same_four_things_by_either_method(self):
        for response in (self.get("SURV-2026-0002"), self.post("SURV-2026-0002")):
            self.assertEqual(set(response.json()["rows"][0]), {"status", "checked_in_at", "destination_id", "destination_name"})

    def test_other_methods_are_still_refused(self):
        self.assertEqual(self.client.put(URL, data="{}", content_type="application/json").status_code, 405)
        self.assertEqual(self.client.delete(URL).status_code, 405)

    # -- the limit runs on both -------------------------------------------------------------

    def guess_wrong(self, ask, times, address=ADDRESS):
        return [ask("SURV-2026-0001", f"0918000{index:04d}", address).status_code for index in range(times)]

    def test_the_limit_runs_on_a_post(self):
        self.assertEqual(set(self.guess_wrong(self.post, LIMIT)), {200})
        self.assertEqual(self.post("SURV-2026-0002", CONTACT).status_code, 429)  # even the right number, until the hour has passed

    def test_the_limit_runs_on_a_get(self):
        self.assertEqual(set(self.guess_wrong(self.get, LIMIT)), {200})
        self.assertEqual(self.get("SURV-2026-0002", CONTACT).status_code, 429)

    def test_the_failures_of_the_two_methods_are_one_count(self):
        # a stranger cannot double the guesses by alternating: the same address, the same counter
        self.guess_wrong(self.get, LIMIT // 2)
        self.guess_wrong(self.post, LIMIT - LIMIT // 2)
        self.assertEqual(self.get("SURV-2026-0002", CONTACT).status_code, 429)
        self.assertEqual(self.post("SURV-2026-0002", CONTACT).status_code, 429)

    def test_a_right_answer_by_either_method_costs_nothing(self):
        for _ in range(LIMIT + 5):
            self.assertEqual(self.post("SURV-2026-0002").status_code, 200)
            self.assertEqual(self.get("SURV-2026-0002").status_code, 200)

    def test_the_limit_is_still_thirty_an_hour_and_the_view_still_carries_the_throttle(self):
        from .views.mobile import mobile_tourist_record_status

        self.assertEqual(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["pass_status_ip"], "30/hour")
        self.assertIn(PassStatusRateThrottle, mobile_tourist_record_status.cls.throttle_classes)
        self.assertEqual(set(mobile_tourist_record_status.cls.http_method_names) & {"get", "post"}, {"get", "post"})
