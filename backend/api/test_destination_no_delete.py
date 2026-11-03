"""A destination is never deleted: DELETE /api/resorts/<id>/ is always refused, with a 405 and a message, before anything is touched.

Inactive is the end of a destination (it leaves the app and the registration form, and nothing is removed). Without this a destination with no
tourist record could be deleted, and its reviews and its monthly history went with it (CASCADE); one with records was refused only afterwards,
by PROTECT, with a 409.
"""
import inspect
import re

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ROLE_TOURISM,
    ActivityLog,
    FeedbackEntry,
    Resort,
    ResortMonthlyArrival,
    TouristRecord,
    UserProfile,
)
from .tests import ensure_test_reference_tables
from .test_destination_accuracy import arrive, make_resort, review
from .views import tourism as tourism_views

MESSAGE = "Destinations are never deleted. Set the destination to Inactive instead."


@override_settings(USE_SEED_DATA=False)
class DestinationsAreNeverDeletedTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create_user(username="no_delete_tourism", password="Password@123", email="nd@test.local")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.free = make_resort(1, "Free Resort")  # no tourist record
        self.held = make_resort(2, "Held Resort")  # has a tourist record

    def delete(self, resort_id, client=None):
        return (client or self.client).delete(f"/api/resorts/{resort_id}/")

    # -- a destination with NO tourist record --------------------------------

    def test_delete_of_a_destination_with_no_record_is_405(self):
        response = self.delete(1)

        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json(), {"detail": MESSAGE})

    def test_it_is_still_there_afterwards(self):
        self.delete(1)

        self.assertTrue(Resort.objects.filter(pk=1).exists())
        self.assertEqual(Resort.objects.count(), 2)
        self.assertEqual(self.client.get("/api/resorts/1/").status_code, 200)

    def test_its_reviews_are_not_deleted(self):
        review(self.free, 5)
        review(self.free, 3)
        review(self.free, 1, hidden=True)

        self.delete(1)

        self.assertEqual(FeedbackEntry.objects.filter(destination=self.free).count(), 3)
        self.assertEqual(FeedbackEntry.objects.filter(destination=self.free, is_hidden=False).count(), 2)
        self.free.refresh_from_db()
        self.assertEqual(self.free.tourism_rating, 4.0)  # the average of the two that count, untouched

    def test_its_monthly_history_is_not_deleted_either(self):
        ResortMonthlyArrival.objects.create(resort=self.free, year=2025, month=3, total_arrivals=120)

        self.delete(1)

        self.assertEqual(ResortMonthlyArrival.objects.filter(resort=self.free).count(), 1)

    # -- a destination WITH tourist records ----------------------------------

    def test_delete_of_a_destination_with_records_is_405_too_not_409(self):
        arrive(self.held, "ND-1", 4)

        response = self.delete(2)

        self.assertEqual(response.status_code, 405)  # refused before PROTECT is reached (it would have been a 409)
        self.assertNotEqual(response.status_code, 409)
        self.assertEqual(response.json(), {"detail": MESSAGE})

    def test_its_records_and_the_destination_stay(self):
        arrive(self.held, "ND-2", 4)
        arrive(self.held, "ND-3", 6)
        review(self.held, 5)

        self.delete(2)

        self.assertTrue(Resort.objects.filter(pk=2).exists())
        self.assertEqual(TouristRecord.objects.filter(resort=self.held).count(), 2)
        self.assertEqual(FeedbackEntry.objects.filter(destination=self.held).count(), 1)

    # -- always, whatever the id and whatever the state ----------------------

    def test_a_destination_that_does_not_exist_is_refused_the_same_way(self):
        response = self.delete(999)

        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json(), {"detail": MESSAGE})

    def test_an_inactive_destination_is_refused_too_and_stays_inactive(self):
        Resort.objects.filter(pk=1).update(is_active=False)

        response = self.delete(1)

        self.assertEqual(response.status_code, 405)
        self.assertIs(Resort.objects.get(pk=1).is_active, False)

    def test_nothing_is_written_to_the_activity_log(self):
        before = ActivityLog.objects.filter(action="delete").count()

        self.delete(1)
        self.delete(2)

        self.assertEqual(ActivityLog.objects.filter(action="delete").count(), before)

    def test_without_a_login_it_is_still_refused_and_nothing_is_deleted(self):
        response = self.delete(1, client=APIClient())

        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(Resort.objects.filter(pk=1).exists())

    # -- the way out: Inactive -----------------------------------------------

    def test_inactive_is_the_way_and_it_deletes_nothing(self):
        review(self.free, 5)

        response = self.client.patch("/api/resorts/1/", {"is_active": False}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["is_active"], False)
        self.assertTrue(Resort.objects.filter(pk=1).exists())
        self.assertEqual(FeedbackEntry.objects.filter(destination=self.free).count(), 1)

    def test_get_put_and_patch_of_a_destination_still_work(self):
        self.assertEqual(self.client.get("/api/resorts/1/").status_code, 200)
        patched = self.client.patch("/api/resorts/1/", {"short_description": "New words."}, format="json")
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(Resort.objects.get(pk=1).short_description, "New words.")

    def test_the_list_endpoint_has_no_delete(self):
        self.assertEqual(self.client.delete("/api/resorts/").status_code, 405)
        self.assertEqual(Resort.objects.count(), 2)

    # -- the code itself ------------------------------------------------------

    def test_the_view_never_calls_delete_on_a_resort(self):
        source = inspect.getsource(tourism_views)
        view = source[source.index("def resort_detail") : source.index("def resort_image_upload")]
        code = "\n".join(line for line in view.splitlines() if not line.strip().startswith("#"))  # the code, not the comments
        self.assertNotRegex(code, r"\.delete\(")
        self.assertNotIn("ProtectedError", source)
        self.assertIn("HTTP_405_METHOD_NOT_ALLOWED", view)
        # and the refusal comes first, before the destination is looked up
        self.assertLess(view.index("HTTP_405_METHOD_NOT_ALLOWED"), view.index("get_object_or_404"))
        self.assertIsNotNone(re.search(r"Inactive instead", source))
