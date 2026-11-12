"""The limit on GET /api/mobile/tourism/records/status/ (PassStatusRateThrottle).

The survey ID is printed on the pass, so it is not a secret; the contact number is the only thing left to guess, and without a limit it could be
guessed at, over and over. The lookups that FAIL are counted per client address: 30 an hour. A right answer costs nothing, so the app, which asks
once for each pass every time it is opened, never comes near it. The people here are made up.

Nothing here depends on the real clock or on what another test left in the cache: the counters are emptied before each test, and the throttle's
clock is a number the test moves by hand.
"""
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache, caches
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Resort
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables
from .throttles import PassStatusRateThrottle

URL = "/api/mobile/tourism/records/status/"
CONTACT = "09170000000"
LIMIT = 30
HOUR = 3600
FIRST_ADDRESS = "10.1.1.1"
OTHER_ADDRESS = "10.2.2.2"


@override_settings(USE_SEED_DATA=False)
class PassStatusThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()  # nothing left over from another test
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(7, "Throttle Beach")
        for number in (1, 2, 3):
            arrive(self.resort, f"SURV-2026-000{number}", 2, status="arrived")
        self.clock = [1_800_000_000.0]  # the throttle's clock: moved by the test, never by the real time
        patcher = patch.object(PassStatusRateThrottle, "timer", staticmethod(lambda: self.clock[0]))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(lambda: caches["throttle"].clear())

    def ask(self, reference, contact=CONTACT, address=FIRST_ADDRESS):
        return self.client.get(URL, {"reference": reference, "contact": contact}, REMOTE_ADDR=address)

    def guess_wrong(self, times, address=FIRST_ADDRESS):
        """`times` lookups that fail: a number that is not the owner's. Returns their status codes."""
        return [self.ask("SURV-2026-0001", f"0918000{index:04d}", address).status_code for index in range(times)]

    # -- the limit ---------------------------------------------------------------------

    def test_the_limit_is_thirty_failures_an_hour(self):
        # the number is a decision, kept here so that changing it is seen
        self.assertEqual(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["pass_status_ip"], "30/hour")

    def test_thirty_wrong_guesses_are_answered_and_the_thirty_first_is_refused(self):
        codes = self.guess_wrong(LIMIT + 1)

        self.assertEqual(codes[:LIMIT], [200] * LIMIT)
        self.assertEqual(codes[LIMIT], 429)

    def test_after_the_limit_even_the_right_number_is_refused_until_the_hour_has_passed(self):
        self.guess_wrong(LIMIT)

        refused = self.ask("SURV-2026-0002")
        self.assertEqual(refused.status_code, 429)
        self.assertEqual(refused.json(), {"detail": "Too many attempts from this device. Please try again in an hour."})
        self.assertTrue(refused.headers.get("Retry-After"))

        self.clock[0] += HOUR - 1
        self.assertEqual(self.ask("SURV-2026-0002").status_code, 429)  # not yet
        self.clock[0] += 2  # now more than an hour since the guesses
        self.assertEqual(self.ask("SURV-2026-0002").status_code, 200)

    def test_a_refused_request_says_nothing_about_the_record(self):
        self.guess_wrong(LIMIT)

        text = self.ask("SURV-2026-0002").content.decode()

        self.assertNotIn("arrived", text)
        self.assertNotIn("Throttle Beach", text)

    def test_the_guesses_of_one_address_do_not_stop_another(self):
        self.guess_wrong(LIMIT + 5, address=FIRST_ADDRESS)

        self.assertEqual(self.ask("SURV-2026-0002", address=FIRST_ADDRESS).status_code, 429)
        self.assertEqual(self.ask("SURV-2026-0002", address=OTHER_ADDRESS).status_code, 200)

    def test_an_unknown_survey_id_counts_like_a_wrong_number(self):
        codes = [self.ask(f"SURV-2026-9{index:03d}").status_code for index in range(LIMIT + 1)]

        self.assertEqual(codes[:LIMIT], [200] * LIMIT)
        self.assertEqual(codes[LIMIT], 429)

    # -- what the app does is not touched by it -------------------------------------------

    def test_ordinary_use_of_the_app_never_comes_near_the_limit(self):
        # three passes, asked about once each every time the app is opened, the app opened 40 times in the hour: 120 right answers
        for opening in range(40):
            for number in (1, 2, 3):
                response = self.ask(f"SURV-2026-000{number}")
                self.assertEqual(response.status_code, 200, f"opening {opening}, pass {number}")
                self.assertEqual(response.json()["summary"], {"total": 1})
        # ...and the full allowance of failures is still there
        self.assertEqual(self.guess_wrong(LIMIT), [200] * LIMIT)

    def test_right_answers_between_the_failures_do_not_use_up_the_allowance(self):
        for index in range(LIMIT - 1):
            self.assertEqual(self.ask("SURV-2026-0001", f"0918000{index:04d}").status_code, 200)
            self.assertEqual(self.ask("SURV-2026-0002").status_code, 200)
        self.assertEqual(self.ask("SURV-2026-0001", "09189999999").status_code, 200)  # the thirtieth failure
        self.assertEqual(self.ask("SURV-2026-0002").status_code, 429)  # now it is full

    def test_a_tourist_whose_three_kept_passes_are_all_gone_from_the_server_has_ten_openings_an_hour(self):
        # the worst the app itself can do: every kept pass fails each time the app is opened (3 failures an opening)
        for opening in range(10):
            for number in (1, 2, 3):
                self.assertEqual(self.ask(f"SURV-2026-70{opening}{number}").status_code, 200, f"opening {opening}, pass {number}")
        self.assertEqual(self.ask("SURV-2026-7999").status_code, 429)

    def test_a_request_with_a_missing_key_guesses_nothing_and_is_not_counted(self):
        for _ in range(LIMIT * 3):
            self.assertEqual(self.client.get(URL, {"reference": "SURV-2026-0001"}, REMOTE_ADDR=FIRST_ADDRESS).status_code, 400)
            self.assertEqual(self.client.get(URL, {"contact": CONTACT}, REMOTE_ADDR=FIRST_ADDRESS).status_code, 400)
        self.assertEqual(self.guess_wrong(LIMIT), [200] * LIMIT)

    def test_the_failures_older_than_an_hour_are_forgotten_a_few_at_a_time(self):
        self.guess_wrong(10)
        self.clock[0] += HOUR // 2
        self.guess_wrong(LIMIT - 10)  # 30 inside the hour: full
        self.assertEqual(self.ask("SURV-2026-0002").status_code, 429)

        self.clock[0] += HOUR // 2 + 1  # the first ten are now an hour old; the other twenty are not
        self.assertEqual(self.ask("SURV-2026-0002").status_code, 200)
        self.assertEqual(self.guess_wrong(9), [200] * 9)  # up to 29 inside the hour again...
        self.assertEqual(self.ask("SURV-2026-0001", "09180000000").status_code, 200)  # the thirtieth
        self.assertEqual(self.ask("SURV-2026-0002").status_code, 429)

    # -- the throttle is on this endpoint and not on the others ---------------------------------

    def test_the_endpoint_carries_the_throttle(self):
        from .views.mobile import mobile_tourist_record_status

        self.assertIn(PassStatusRateThrottle, mobile_tourist_record_status.cls.throttle_classes)

    def test_the_other_public_lookups_are_not_touched_by_these_guesses(self):
        self.guess_wrong(LIMIT + 1)

        # the sanitation report history is a different lookup, with its own limits: it is not refused because of these
        response = self.client.get("/api/mobile/sanitation/reports/history/", {"contact": CONTACT, "reference": "X"}, REMOTE_ADDR=FIRST_ADDRESS)
        self.assertNotEqual(response.status_code, 429)
