"""Destinations: every one reaches the app, arrivals are people, and a destination with no review has no rating.

The arrivals are the records' total_visitors added up (people), not a count of records; the rating is the average of the
reviews that count, and review_count says how many that is.
"""
from datetime import date

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import (
    BoatType,
    Country,
    FeedbackEntry,
    Itinerary,
    Province,
    Resort,
    TouristRecord,
    TravelMode,
    VisitPurpose,
)
from .serializers import ResortSerializer
from .tests import ensure_test_reference_tables
from .views.mobile import MOBILE_EXCLUDED_DESTINATION_NAMES

BOOTSTRAP = "/api/mobile/tourism/bootstrap/"


def make_resort(pk, name, **extra):
    return Resort.objects.create(
        resort_id=pk, resort_name=name, type="Beach Resort", location="Mauban", short_description="d",
        access="Boat", latitude=14.2, longitude=121.7, **extra,
    )


def arrive(resort, survey_id, people, when=None, status="arrived"):
    """One record of `people` people at `resort`. The default day is today, so it is in this month and this year."""
    quezon = Province.objects.get(name="Quezon")
    return TouristRecord.objects.create(
        survey_id=survey_id, full_name="Group", contact_number="09170000000",
        country=Country.objects.get(name="Philippines"), region=quezon.region, province=quezon,
        arrival_date=when or timezone.localdate(), resort=resort, itinerary=Itinerary.objects.first(),
        travel_mode=TravelMode.objects.first(), boat_type=BoatType.objects.first(),
        visit_purpose=VisitPurpose.objects.first(), total_visitors=people, filipino_count=people,
        total_male=people, age_8_59=people, status=status,
    )


def review(resort, rating, hidden=False):
    return FeedbackEntry.objects.create(
        destination=resort, reviewer="A. Reviewer", rating=rating, date=date(2026, 5, 1), title="t", message="m",
        is_hidden=hidden,
    )


@override_settings(USE_SEED_DATA=False)
class EveryDestinationReachesTheAppTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()

    def _bootstrap(self):
        return self.client.get(BOOTSTRAP).json()

    def test_all_fourteen_reach_the_app_not_the_first_ten(self):
        for pk in range(1, 15):
            make_resort(pk, f"Resort {pk:02d}")

        data = self._bootstrap()

        self.assertEqual(len(data["destinations"]), 14)
        self.assertEqual({d["resort_id"] for d in data["destinations"]}, set(range(1, 15)))

    def test_the_names_that_are_left_out_are_still_left_out(self):
        make_resort(1, "Real Resort")
        make_resort(2, "Others / Private Residence")
        make_resort(3, "Kwebang Lampas")
        make_resort(4, "Residence")

        data = self._bootstrap()

        self.assertEqual([d["resort_name"] for d in data["destinations"]], ["Real Resort"])
        self.assertIn("Others / Private Residence", MOBILE_EXCLUDED_DESTINATION_NAMES)
        # the web's list (referenceTables) is every destination, as before
        self.assertEqual(len(data["referenceTables"]["resorts"]), 4)

    def test_featured_is_six_and_the_registration_list_is_all_of_them(self):
        for pk in range(1, 13):
            make_resort(pk, f"Resort {pk:02d}")

        data = self._bootstrap()

        self.assertEqual(len(data["featuredDestinations"]), 6)
        # featured follows the people who arrived this year (here nobody: the newest first); the list of all keeps its own order
        self.assertEqual([d["resort_id"] for d in data["featuredDestinations"]], [12, 11, 10, 9, 8, 7])
        self.assertEqual({d["resort_id"] for d in data["featuredDestinations"]} <= {d["resort_id"] for d in data["destinations"]}, True)
        # the registration form lists bootstrap.destinations, so all twelve can be chosen there
        self.assertEqual(len(data["destinations"]), 12)

    def test_the_destination_list_endpoint_gives_all_of_them_too(self):
        for pk in range(1, 14):
            make_resort(pk, f"Resort {pk:02d}")

        listed = self.client.get("/api/mobile/tourism/destinations/").json()

        self.assertEqual(len(listed), 13)

    def test_a_new_resort_with_nothing_yet_still_reaches_the_app(self):
        for pk in range(1, 11):
            resort = make_resort(pk, f"Resort {pk:02d}", monthly_arrivals=500 - pk, tourism_rating=4.0)
            arrive(resort, f"OLD-{pk}", 3)
        make_resort(11, "Brand New Resort")  # no arrivals, no rating, a stored 0

        data = self._bootstrap()

        self.assertIn("Brand New Resort", [d["resort_name"] for d in data["destinations"]])


@override_settings(USE_SEED_DATA=False)
class ArrivalsArePeopleTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Counted Resort")

    def _figures(self):
        for item in self.client.get(BOOTSTRAP).json()["destinations"]:
            if item["resort_id"] == 1:
                return item
        self.fail("the resort is not in the bootstrap")

    def test_the_month_is_the_people_in_the_records_not_the_number_of_records(self):
        arrive(self.resort, "P-1", 6)
        arrive(self.resort, "P-2", 4)

        item = self._figures()

        self.assertEqual(item["monthly_arrivals"], 10)  # two records, ten people

    def test_the_year_includes_earlier_months_and_the_month_does_not(self):
        today = timezone.localdate()
        if today.month == 1:
            self.skipTest("in January there is no earlier month in the same year")
        arrive(self.resort, "Y-1", 5)
        arrive(self.resort, "Y-2", 7, when=date(today.year, today.month - 1, 15))

        item = self._figures()

        self.assertEqual(item["monthly_arrivals"], 5)
        self.assertEqual(item["yearly_arrivals"], 12)

    def test_last_year_is_in_neither(self):
        arrive(self.resort, "L-1", 9, when=date(timezone.localdate().year - 1, 6, 10))

        item = self._figures()

        self.assertEqual((item["monthly_arrivals"], item["yearly_arrivals"]), (0, 0))

    def test_only_arrived_records_count(self):
        arrive(self.resort, "S-1", 4)
        arrive(self.resort, "S-2", 8, status="pending")
        arrive(self.resort, "S-3", 2, status="no_show")

        item = self._figures()

        self.assertEqual((item["monthly_arrivals"], item["yearly_arrivals"]), (4, 4))

    def test_another_resorts_people_are_not_added(self):
        other = make_resort(2, "Another Resort")
        arrive(self.resort, "O-1", 3)
        arrive(other, "O-2", 50)

        self.assertEqual(self._figures()["monthly_arrivals"], 3)

    def test_the_web_list_and_the_one_resort_say_the_same_as_the_app(self):
        arrive(self.resort, "W-1", 6)
        arrive(self.resort, "W-2", 4)

        one = ResortSerializer(self.resort).data  # not annotated: worked out for this one resort
        from .services.tourism import build_reference_tables_payload

        listed = [r for r in build_reference_tables_payload()["resorts"] if r["resort_id"] == 1][0]

        for key in ("monthly_arrivals", "yearly_arrivals", "review_count"):
            with self.subTest(key=key):
                self.assertEqual(one[key], listed[key])
        self.assertEqual((one["monthly_arrivals"], one["yearly_arrivals"]), (10, 10))

    def test_the_figures_are_not_taken_from_what_a_client_sends(self):
        payload = ResortSerializer(self.resort).data
        data = dict(payload)
        data.update({"monthly_arrivals": 999, "yearly_arrivals": 999, "tourism_rating": 5.0, "review_count": 9})
        serializer = ResortSerializer(self.resort, data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.resort.refresh_from_db()
        after = ResortSerializer(self.resort).data

        self.assertEqual((after["monthly_arrivals"], after["yearly_arrivals"], after["review_count"]), (0, 0, 0))
        self.assertEqual(self.resort.tourism_rating, 0)  # the rating is read-only: only the reviews set it


@override_settings(USE_SEED_DATA=False)
class RatingNeedsAReviewTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Reviewed Resort", tourism_rating=4.8)  # a rating written by hand

    def _item(self):
        return ResortSerializer(Resort.objects.get(pk=1)).data

    def test_without_a_review_the_count_is_zero_and_so_is_the_rating_the_app_gets(self):
        # the first review's save recalculates; with none the rating is what was written by hand, and the count says there is no review
        self.assertEqual(self._item()["review_count"], 0)

    def test_a_review_sets_the_rating_and_the_count(self):
        review(self.resort, 5)

        item = self._item()

        self.assertEqual((item["review_count"], item["tourism_rating"]), (1, 5.0))

    def test_two_reviews_average_and_count_two(self):
        review(self.resort, 5)
        review(self.resort, 3)

        item = self._item()

        self.assertEqual((item["review_count"], item["tourism_rating"]), (2, 4.0))

    def test_a_hidden_review_is_not_counted(self):
        review(self.resort, 4)
        review(self.resort, 1, hidden=True)

        item = self._item()

        self.assertEqual((item["review_count"], item["tourism_rating"]), (1, 4.0))

    def test_all_reviews_hidden_is_no_review_and_a_rating_of_zero(self):
        entry = review(self.resort, 4)
        entry.is_hidden = True
        entry.save()

        item = self._item()

        self.assertEqual((item["review_count"], item["tourism_rating"]), (0, 0.0))

    def test_a_destination_whose_only_review_was_deleted_goes_back_to_no_rating(self):
        # the app writes "No ratings yet" from a rating of 0 (mobile/test/destination_labels_test.dart); the server sends 0.0, with a count of 0
        entry = review(self.resort, 5)
        entry.delete()

        item = [d for d in self.client.get(BOOTSTRAP).json()["destinations"] if d["resort_id"] == 1][0]

        self.assertEqual((item["tourism_rating"], item["review_count"]), (0.0, 0))

    def test_each_destination_counts_its_own_reviews(self):
        other = make_resort(2, "Other Resort")
        review(self.resort, 5)
        review(other, 2)
        review(other, 2)

        by_id = {d["resort_id"]: d for d in self.client.get(BOOTSTRAP).json()["destinations"]}

        self.assertEqual((by_id[1]["review_count"], by_id[1]["tourism_rating"]), (1, 5.0))
        self.assertEqual((by_id[2]["review_count"], by_id[2]["tourism_rating"]), (2, 2.0))


@override_settings(USE_SEED_DATA=False)
class InactiveDestinationTests(TestCase):
    """An inactive destination is out of the app's list and out of the registration form, and stays everywhere else."""

    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.active = make_resort(1, "Open Resort")
        self.closed = make_resort(2, "Closed Resort", is_active=False)

    def _bootstrap(self):
        return self.client.get(BOOTSTRAP).json()

    def test_a_new_destination_is_active(self):
        self.assertIs(make_resort(3, "Brand New").is_active, True)

    def test_it_is_not_in_the_apps_destinations_so_not_in_the_registration_form(self):
        data = self._bootstrap()

        # the registration form lists bootstrap.destinations (mobile/lib/screens/tourism_screens.dart)
        self.assertEqual([d["resort_id"] for d in data["destinations"]], [1])
        self.assertEqual([d["resort_id"] for d in data["featuredDestinations"]], [1])

    def test_it_is_not_in_the_resorts_of_the_reference_tables_the_app_gets(self):
        resorts = self._bootstrap()["referenceTables"]["resorts"]

        self.assertEqual([r["resort_id"] for r in resorts], [1])

    def test_it_is_not_in_the_destination_list_or_detail_of_the_app(self):
        listed = self.client.get("/api/mobile/tourism/destinations/").json()

        self.assertEqual([d["resort_id"] for d in listed], [1])
        self.assertEqual(self.client.get("/api/mobile/tourism/destinations/2/").status_code, 404)
        self.assertEqual(self.client.get("/api/mobile/tourism/destinations/1/").status_code, 200)

    def test_it_is_still_on_the_web_marked_inactive(self):
        from .services.tourism import build_reference_tables_payload

        web = {r["resort_id"]: r for r in build_reference_tables_payload()["resorts"]}

        self.assertEqual(sorted(web), [1, 2])
        self.assertIs(web[2]["is_active"], False)
        self.assertIs(web[1]["is_active"], True)

    def test_the_records_that_name_it_keep_it(self):
        record = arrive(self.closed, "KEEP-1", 4)

        record.refresh_from_db()

        self.assertEqual(record.resort_id, 2)
        self.assertEqual(Resort.objects.get(pk=2).is_active, False)
        self.assertEqual(TouristRecord.objects.filter(resort=self.closed).count(), 1)

    def test_being_inactive_deletes_nothing_and_it_can_be_made_active_again(self):
        self.assertTrue(Resort.objects.filter(pk=2).exists())
        Resort.objects.filter(pk=2).update(is_active=True)

        self.assertEqual(sorted(d["resort_id"] for d in self._bootstrap()["destinations"]), [1, 2])

    def test_the_status_is_saved_through_the_serializer_both_ways(self):
        data = dict(ResortSerializer(self.active).data)
        data["is_active"] = False
        serializer = ResortSerializer(self.active, data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.active.refresh_from_db()
        self.assertIs(self.active.is_active, False)

        data["is_active"] = True
        serializer = ResortSerializer(self.active, data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.active.refresh_from_db()
        self.assertIs(self.active.is_active, True)

    def test_it_does_not_count_among_the_featured_or_the_trending(self):
        arrive(self.closed, "TREND-1", 500)  # the most arrivals of any, but inactive
        arrive(self.active, "TREND-2", 2)

        data = self._bootstrap()

        self.assertEqual(data["destinations"][0]["resort_id"], 1)
        trending = [n for n in data["notifications"] if str(n.get("id", "")).startswith("featured-")]
        for note in trending:
            self.assertNotEqual(note["id"], "featured-2")
