"""POST /api/mobile/tourism/feedback/ takes a review only from someone who has really been to that place.

All four must be so: the survey ID names a TouristRecord, the contact number is that record's (compared by its digits), the record's resort is the
destination being reviewed, and the record's status is arrived (it was scanned on arrival). Anything else is a 403 with ONE message, so it is never
said which of the four failed. An archived record still counts (the archive is about the table, not about the arrival). The server says it, and not
only the app, because anyone can post here. The web's own POST /api/feedback/ has its own login and is not touched. The people here are made up.
"""
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.core.cache import cache, caches
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, FeedbackEntry, Resort, TouristRecord, UserProfile
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables
from .views.mobile import REVIEW_NEEDS_A_VISIT_MESSAGE
from .visit_support import CONTACT, arrived_visit, visit_fields

URL = "/api/mobile/tourism/feedback/"
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 64
MESSAGE = "You can only review a place you have visited: your visit there must be registered and scanned on arrival."


@override_settings(USE_SEED_DATA=False)
class ReviewNeedsAVisitTests(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()  # the limit on this endpoint has nothing left over from another test
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.beach = make_resort(1, "Beach One")
        self.cove = make_resort(2, "Cove Two")
        self.visit = arrived_visit(self.beach, "REV-0001")  # arrived at Beach One
        self.client = APIClient()  # nobody is logged in: the tourist has no account

    def review(self, destination=1, **fields):
        body = {"destination_id": destination, "reviewer": "A Visitor", "rating": 5, "message": "A made-up review.", **fields}
        return self.client.post(URL, body, format="json")

    def with_visit(self, destination=1, **overrides):
        fields = visit_fields(self.visit)
        fields.update(overrides)
        return self.review(destination, **fields)

    # -- the one that is taken -------------------------------------------------------------

    def test_a_visit_that_was_scanned_here_is_taken(self):
        response = self.with_visit()

        self.assertEqual(response.status_code, 201, response.content)
        entry = FeedbackEntry.objects.get()
        self.assertEqual(entry.destination_id, 1)
        self.assertEqual(entry.reviewer, "A Visitor")

    def test_an_archived_record_that_arrived_is_taken(self):
        TouristRecord.objects.filter(pk="REV-0001").update(is_archived=True)

        self.assertEqual(self.with_visit().status_code, 201)

    def test_the_survey_id_is_not_case_sensitive(self):
        for survey_id in ("rev-0001", "Rev-0001", " REV-0001 "):
            with self.subTest(survey_id=survey_id):
                self.assertEqual(self.with_visit(survey_id=survey_id).status_code, 201)

    def test_the_contact_number_is_compared_by_its_digits(self):
        for contact in ("09170000000", "+639170000000", "+63 917 000 0000", "0917-000-0000"):
            with self.subTest(contact=contact):
                self.assertEqual(self.with_visit(contact_number=contact).status_code, 201)

    def test_the_destination_may_be_sent_as_text_or_under_the_other_name_the_app_has_used(self):
        self.assertEqual(self.with_visit(destination="1").status_code, 201)
        body = {"destinationId": 1, "reviewer": "A Visitor", "rating": 4, "message": "Fine.", **visit_fields(self.visit)}
        self.assertEqual(self.client.post(URL, body, format="json").status_code, 201)

    def test_a_form_post_with_a_photo_is_taken_like_the_app_sends_it(self):
        storage = MagicMock()
        storage.save.side_effect = lambda name, _file: name
        storage.url.side_effect = lambda name: f"https://storage.test/{name}"
        with patch("api.services.upload.default_storage", storage):
            data = {"destination_id": "1", "reviewer": "A Visitor", "rating": "4", "message": "Nice.", **visit_fields(self.visit)}
            data["photo"] = [SimpleUploadedFile("p.jpg", JPEG, content_type="image/jpeg")]
            response = self.client.post(URL, data, format="multipart")

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(storage.save.called)

    # -- the ways it is refused: five cases, one message -------------------------------------

    def refusals(self):
        """Every way to fail the check, as (name, response). Each one fails by ONE thing only."""
        other_resort = arrived_visit(self.cove, "REV-0002")
        pending = arrived_visit(self.beach, "REV-0003", status="pending")
        cancelled = arrived_visit(self.beach, "REV-0004", status="no_show")
        return [
            ("no such record", self.with_visit(survey_id="REV-9999")),
            ("wrong number", self.with_visit(contact_number="09179999999")),
            ("another resort", self.review(1, **visit_fields(other_resort))),  # a visit at Cove Two, reviewing Beach One
            ("pending", self.review(1, **visit_fields(pending))),
            ("cancelled", self.review(1, **visit_fields(cancelled))),
            ("no survey id", self.review(1, contact_number=CONTACT)),
            ("no contact number", self.review(1, survey_id="REV-0001")),
            ("both blank", self.review(1, survey_id="  ", contact_number="  ")),
            ("a contact with no digits", self.with_visit(contact_number="not a number")),
            ("a partial number", self.with_visit(contact_number="0917000000")),
            ("nothing at all", self.review(1)),
        ]

    def test_every_way_of_failing_is_a_403(self):
        for name, response in self.refusals():
            with self.subTest(case=name):
                self.assertEqual(response.status_code, 403, response.content)

    def test_no_record_wrong_number_other_resort_pending_and_cancelled_are_each_refused(self):
        names = [name for name, _ in self.refusals()][:5]
        self.assertEqual(names, ["no such record", "wrong number", "another resort", "pending", "cancelled"])

    def test_the_message_is_the_same_for_all_of_them_so_it_never_says_which_failed(self):
        responses = self.refusals()
        first = responses[0][1].content
        for name, response in responses:
            with self.subTest(case=name):
                self.assertEqual(response.content, first)
        body = responses[0][1].json()
        self.assertEqual(body["detail"], MESSAGE)
        self.assertEqual(body["error"], MESSAGE)
        self.assertEqual(MESSAGE, REVIEW_NEEDS_A_VISIT_MESSAGE)

    def test_the_message_names_none_of_the_four_things(self):
        text = self.with_visit(contact_number="09179999999").content.decode().lower()
        for word in ("survey", "contact", "number", "pending", "arrived status", "wrong", "no such", "record"):
            self.assertNotIn(word, text)

    def test_a_refused_review_leaves_nothing_behind(self):
        self.refusals()

        self.assertEqual(FeedbackEntry.objects.count(), 0)
        self.beach.refresh_from_db()
        self.assertEqual(self.beach.tourism_rating, 0)

    def test_a_refused_review_with_photos_saves_no_photo(self):
        storage = MagicMock()
        with patch("api.services.upload.default_storage", storage):
            data = {"destination_id": "1", "reviewer": "A Visitor", "rating": "4", "message": "Nice.", "survey_id": "REV-9999", "contact_number": CONTACT}
            data["photo"] = [SimpleUploadedFile("p.jpg", JPEG, content_type="image/jpeg")]
            response = self.client.post(URL, data, format="multipart")

        self.assertEqual(response.status_code, 403)
        storage.save.assert_not_called()

    def test_a_visit_that_is_scanned_later_then_counts(self):
        pending = arrived_visit(self.beach, "REV-0005", status="pending")
        self.assertEqual(self.review(1, **visit_fields(pending)).status_code, 403)

        TouristRecord.objects.filter(pk="REV-0005").update(status="arrived")

        self.assertEqual(self.review(1, **visit_fields(pending)).status_code, 201)

    def test_a_visit_that_was_cancelled_after_arriving_stops_counting(self):
        TouristRecord.objects.filter(pk="REV-0001").update(status="no_show")

        self.assertEqual(self.with_visit().status_code, 403)

    # -- the web's own post is not this one -------------------------------------------------------

    def test_the_web_post_for_staff_is_not_touched(self):
        staff = User.objects.create(username="review_staff")
        UserProfile.objects.create(user=staff, role=ROLE_TOURISM)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=staff).key}")

        response = client.post(
            "/api/feedback/",
            {"destinationId": 2, "reviewer": "Staff Entry", "rating": 4, "title": "Entered by staff", "message": "Recorded by the office.", "date": "2099-06-01"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(FeedbackEntry.objects.filter(reviewer="Staff Entry").exists())
