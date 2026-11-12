"""The limit on POST /api/mobile/tourism/feedback/ for reviews whose survey ID and contact number do not make a visit (ReviewVisitRateThrottle).

A review is taken only from someone whose visit was scanned on arrival, and the server finds that out from the survey ID and the contact number. The
survey ID is printed on the pass, so it is not a secret; the contact number is the only thing left to guess, and without a limit the endpoint is a way
to guess it. The attempts that FAIL are counted per client address: 10 an hour (tighter than the status lookup's 30: a real tourist almost never fails
here). A review that is taken costs nothing, and a post with a key missing guesses nothing and is not counted.

Nothing here depends on the real clock or on what another test left in the cache: the counters are emptied before each test, and the throttle's clock
is a number the test moves by hand. The people here are made up.
"""
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache, caches
from django.test import TestCase, override_settings

from .models import FeedbackEntry, Resort
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables
from .throttles import ReviewVisitRateThrottle
from .visit_support import arrived_visit, visit_fields

URL = "/api/mobile/tourism/feedback/"
STATUS_URL = "/api/mobile/tourism/records/status/"
LIMIT = 10
HOUR = 3600
FIRST = "10.1.1.1"
OTHER = "10.2.2.2"
CONTACT = "09170000000"
MESSAGE = "You can only review a place you have visited: your visit there must be registered and scanned on arrival."


@override_settings(USE_SEED_DATA=False)
class ReviewVisitThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()  # nothing left over from another test
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.beach = make_resort(1, "Throttle Beach")
        self.visit = arrived_visit(self.beach, "THR-0001")
        self.clock = [1_800_000_000.0]  # the throttle's clock: moved by the test, never by the real time
        patcher = patch.object(ReviewVisitRateThrottle, "timer", staticmethod(lambda: self.clock[0]))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(lambda: caches["throttle"].clear())

    def post(self, address=FIRST, **fields):
        body = {"destination_id": 1, "reviewer": "A Visitor", "rating": 5, "message": "A made-up review.", **fields}
        return self.client.post(URL, body, format="json", REMOTE_ADDR=address)

    def right(self, address=FIRST):
        return self.post(address, **visit_fields(self.visit))

    def guess(self, times, address=FIRST):
        """`times` posts that name a visit and are wrong: the right survey ID with a number that is not the owner's. Their status codes."""
        return [self.post(address, survey_id="THR-0001", contact_number=f"0918000{index:04d}").status_code for index in range(times)]

    # -- the limit ---------------------------------------------------------------------

    def test_the_limit_is_ten_failures_an_hour(self):
        self.assertEqual(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["review_visit_ip"], "10/hour")

    def test_the_limit_is_tighter_than_the_status_lookup_s(self):
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertLess(int(rates["review_visit_ip"].split("/")[0]), int(rates["pass_status_ip"].split("/")[0]))

    def test_ten_wrong_guesses_are_refused_by_the_check_and_the_eleventh_by_the_limit(self):
        codes = self.guess(LIMIT + 1)

        self.assertEqual(codes[:LIMIT], [403] * LIMIT)  # the check says no, ten times
        self.assertEqual(codes[LIMIT], 429)  # then the limit

    def test_after_the_limit_even_the_right_pair_is_refused_until_the_hour_has_passed(self):
        self.guess(LIMIT)

        refused = self.right()
        self.assertEqual(refused.status_code, 429)
        self.assertEqual(refused.json(), {"detail": "Too many attempts from this device. Please try again in an hour."})
        self.assertTrue(refused.headers.get("Retry-After"))
        self.assertEqual(FeedbackEntry.objects.count(), 0)

        self.clock[0] += HOUR - 1
        self.assertEqual(self.right().status_code, 429)  # not yet
        self.clock[0] += 2
        self.assertEqual(self.right().status_code, 201)

    def test_a_limited_post_says_nothing_about_the_visit(self):
        self.guess(LIMIT)

        text = self.right().content.decode().lower()

        self.assertNotIn("visit", text)
        self.assertNotIn("scanned", text)
        self.assertNotIn(MESSAGE.lower(), text)

    def test_the_guesses_of_one_address_do_not_stop_another(self):
        self.guess(LIMIT + 3, address=FIRST)

        self.assertEqual(self.right(address=FIRST).status_code, 429)
        self.assertEqual(self.right(address=OTHER).status_code, 201)

    def test_every_way_of_failing_with_both_keys_counts(self):
        arrived_visit(self.beach, "THR-0002", status="pending")
        other = make_resort(2, "Other Beach")
        arrived_visit(other, "THR-0003")
        cases = [
            {"survey_id": "THR-9999", "contact_number": CONTACT},  # no such record
            {"survey_id": "THR-0001", "contact_number": "09189999999"},  # wrong number
            {"survey_id": "THR-0002", "contact_number": CONTACT},  # pending
            {"survey_id": "THR-0003", "contact_number": CONTACT},  # a visit at another place
            {"survey_id": "THR-0001", "contact_number": "0917000000"},  # a partial number
        ]
        for round_ in range(2):  # 5 + 5 = 10
            for case in cases:
                self.assertEqual(self.post(**case).status_code, 403, f"round {round_}: {case}")

        self.assertEqual(self.post(survey_id="THR-9999", contact_number=CONTACT).status_code, 429)

    # -- what the app does is not touched by it ---------------------------------------------

    def test_reviews_that_are_taken_never_use_up_the_allowance(self):
        for _ in range(25):
            self.assertEqual(self.right().status_code, 201)

        self.assertEqual(self.guess(LIMIT), [403] * LIMIT)  # the whole allowance is still there
        self.assertEqual(self.right().status_code, 429)

    def test_right_posts_between_the_failures_do_not_use_up_the_allowance(self):
        for index in range(LIMIT - 1):
            self.assertEqual(self.post(survey_id="THR-0001", contact_number=f"0918000{index:04d}").status_code, 403)
            self.assertEqual(self.right().status_code, 201)
        self.assertEqual(self.post(survey_id="THR-0001", contact_number="09189999999").status_code, 403)  # the tenth failure

        self.assertEqual(self.right().status_code, 429)

    def test_a_tourist_whose_pass_the_server_changed_fails_once_or_a_few_times_and_is_never_near_it(self):
        # the app sent a scanned pass, but the record was corrected since: three posts in a row refused by the check, then they stop
        from .models import TouristRecord

        TouristRecord.objects.filter(pk="THR-0001").update(status="pending")

        for _ in range(3):
            self.assertEqual(self.right().status_code, 403)

        TouristRecord.objects.filter(pk="THR-0001").update(status="arrived")  # scanned again
        self.assertEqual(self.right().status_code, 201)

    def test_a_post_with_a_key_missing_guesses_nothing_and_is_not_counted(self):
        for _ in range(LIMIT * 4):
            self.assertEqual(self.post(contact_number=CONTACT).status_code, 403)  # no survey ID
            self.assertEqual(self.post(survey_id="THR-0001").status_code, 403)  # no contact number
            self.assertEqual(self.post().status_code, 403)  # neither (an old copy of the app)
            self.assertEqual(self.post(survey_id="THR-0001", contact_number="not a number").status_code, 403)  # no digits

        self.assertEqual(self.guess(LIMIT), [403] * LIMIT)  # the allowance was not touched

    def test_the_failures_older_than_an_hour_are_forgotten_a_few_at_a_time(self):
        self.guess(4)
        self.clock[0] += HOUR // 2
        self.guess(LIMIT - 4)  # ten inside the hour: full
        self.assertEqual(self.right().status_code, 429)

        self.clock[0] += HOUR // 2 + 1  # the first four are now an hour old; the other six are not
        self.assertEqual(self.right().status_code, 201)
        self.assertEqual(self.guess(3), [403] * 3)  # up to nine inside the hour again...
        self.assertEqual(self.post(survey_id="THR-0001", contact_number="09180000000").status_code, 403)  # the tenth
        self.assertEqual(self.right().status_code, 429)

    # -- its own counter, and only on this door ---------------------------------------------------

    def test_the_status_lookup_has_its_own_counter(self):
        # 30 failed status lookups fill the status door, and leave the review door open
        for index in range(30):
            self.client.get(STATUS_URL, {"reference": "THR-0001", "contact": f"0918000{index:04d}"}, REMOTE_ADDR=FIRST)
        self.assertEqual(self.client.get(STATUS_URL, {"reference": "THR-0001", "contact": CONTACT}, REMOTE_ADDR=FIRST).status_code, 429)

        self.assertEqual(self.right().status_code, 201)

    def test_the_review_guesses_do_not_stop_the_status_lookup(self):
        self.guess(LIMIT + 1)

        response = self.client.get(STATUS_URL, {"reference": "THR-0001", "contact": CONTACT}, REMOTE_ADDR=FIRST)

        self.assertEqual(response.status_code, 200)

    def test_the_endpoint_carries_the_throttle(self):
        from .views.mobile import mobile_feedback_submit

        self.assertIn(ReviewVisitRateThrottle, mobile_feedback_submit.cls.throttle_classes)

    def test_the_web_post_for_staff_has_no_such_limit(self):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token
        from rest_framework.test import APIClient

        from .models import ROLE_TOURISM, UserProfile

        staff = User.objects.create(username="throttle_staff")
        UserProfile.objects.create(user=staff, role=ROLE_TOURISM)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=staff).key}")
        self.guess(LIMIT + 1)

        response = client.post(
            "/api/feedback/",
            {"destinationId": 1, "reviewer": "Staff Entry", "rating": 4, "title": "Entered by staff", "message": "Recorded.", "date": "2099-06-01"},
            format="json",
            REMOTE_ADDR=FIRST,
        )

        self.assertEqual(response.status_code, 201, response.content)
