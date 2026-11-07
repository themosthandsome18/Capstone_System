"""`featuredDestinations` and `hiddenGems` of the public tourism bootstrap: both follow the people who ARRIVED THIS YEAR (yearly_total).

featured: most arrived this year first, then the better rating, then the newest resort_id; six.
hiddenGems: not featured; fewest arrived this year first, then fewest visible reviews, then the newest resort_id; six.
The month does not matter (it starts again at 0 for everybody) and monthly_arrivals (seeded demo data) is never used.
The clock is fixed at 15 June 2026, so "last month" and "last year" are real months and years.
"""
from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Resort
from .test_destination_accuracy import BOOTSTRAP, arrive, make_resort, review
from .tests import ensure_test_reference_tables
from .views.mobile import MOBILE_EXCLUDED_DESTINATION_NAMES

TODAY = date(2026, 6, 15)
THIS_MONTH = date(2026, 6, 2)
LAST_MONTH = date(2026, 5, 10)  # this year, not this month: the one that used to be lost
EARLY_THIS_YEAR = date(2026, 1, 20)
LAST_YEAR = date(2025, 6, 10)


def ids(items):
    return [item["resort_id"] for item in items]


@override_settings(USE_SEED_DATA=False)
class ListsByYearlyTotalTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        clock = patch("api.services.destination_figures.timezone.localdate", return_value=TODAY)
        clock.start()
        self.addCleanup(clock.stop)
        self.counter = 0

    def get(self):
        cache.clear()
        return self.client.get(BOOTSTRAP).json()

    def arrive(self, resort, people, when=THIS_MONTH, status="arrived"):
        self.counter += 1
        return arrive(resort, f"S{self.counter}", people, when=when, status=status)

    def world(self, count=14):
        """`count` resorts, ids 1..count; resort n has n people this year (spread over the year), so the featured six are the highest ids."""
        for pk in range(1, count + 1):
            self.arrive(make_resort(pk, f"Resort {pk:02d}"), pk, when=LAST_MONTH if pk % 2 else THIS_MONTH)

    # ---- the two lists follow the year ----
    def test_featured_the_most_arrived_this_year_comes_first(self):
        self.world()
        self.assertEqual(ids(self.get()["featuredDestinations"]), [14, 13, 12, 11, 10, 9])

    def test_hidden_gems_the_least_arrived_this_year_comes_first(self):
        self.world()
        self.assertEqual(ids(self.get()["hiddenGems"]), [1, 2, 3, 4, 5, 6])

    def test_no_resort_is_in_both_lists(self):
        self.world()
        data = self.get()
        self.assertEqual(len(data["hiddenGems"]), 6)
        self.assertEqual(set(ids(data["featuredDestinations"])) & set(ids(data["hiddenGems"])), set())

    def test_monthly_arrivals_changes_nothing_in_either_list(self):
        self.world()
        before = self.get()
        for pk in range(1, 15):
            Resort.objects.filter(pk=pk).update(monthly_arrivals=(15 - pk) * 1000)  # the reverse of the real people
        after = self.get()
        self.assertEqual(ids(after["featuredDestinations"]), ids(before["featuredDestinations"]))
        self.assertEqual(ids(after["hiddenGems"]), ids(before["hiddenGems"]))
        self.assertEqual(ids(after["featuredDestinations"]), [14, 13, 12, 11, 10, 9])

    # ---- what counts ----
    def test_pending_and_no_show_are_not_counted(self):
        for pk in (1, 2, 3):
            make_resort(pk, f"Resort {pk}")
        self.arrive(Resort.objects.get(pk=1), 9, status="pending")
        self.arrive(Resort.objects.get(pk=2), 9, status="no_show")
        self.arrive(Resort.objects.get(pk=3), 1)
        data = self.get()
        self.assertEqual({d["resort_id"]: d["yearly_arrivals"] for d in data["destinations"]}, {1: 0, 2: 0, 3: 1})
        self.assertEqual(ids(data["featuredDestinations"])[0], 3)

    def test_a_record_of_last_year_is_not_counted(self):
        make_resort(1, "Old")
        make_resort(2, "New")
        self.arrive(Resort.objects.get(pk=1), 50, when=LAST_YEAR)
        self.arrive(Resort.objects.get(pk=2), 1, when=THIS_MONTH)
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"]), [2, 1])
        self.assertEqual({d["resort_id"]: d["yearly_arrivals"] for d in data["destinations"]}, {1: 0, 2: 1})

    def test_a_record_of_last_month_this_year_IS_counted(self):
        make_resort(1, "Spring")
        make_resort(2, "Now")
        self.arrive(Resort.objects.get(pk=1), 30, when=LAST_MONTH)
        self.arrive(Resort.objects.get(pk=2), 5, when=THIS_MONTH)
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"]), [1, 2])  # the old monthly figure had 1 at 0 and last
        self.assertEqual({d["resort_id"]: d["yearly_arrivals"] for d in data["destinations"]}, {1: 30, 2: 5})

    def test_a_record_from_january_counts_in_june(self):
        make_resort(1, "January")
        self.arrive(Resort.objects.get(pk=1), 7, when=EARLY_THIS_YEAR)
        self.assertEqual(self.get()["destinations"][0]["yearly_arrivals"], 7)

    # ---- ties ----
    def test_featured_ties_go_to_the_better_rating_then_the_newest(self):
        for pk in range(1, 9):
            make_resort(pk, f"Resort {pk}")  # nobody arrived: a tie on the year
        Resort.objects.filter(pk=2).update(tourism_rating=4.5)
        Resort.objects.filter(pk=1).update(tourism_rating=4.9)
        for pk in range(1, 9):
            Resort.objects.filter(pk=pk).update(monthly_arrivals=pk * 1000)  # seeded: must not break the tie, 2 and 1 still lead
        # the better rating first (1, then 2), then the rest by the newest resort_id
        self.assertEqual(ids(self.get()["featuredDestinations"]), [1, 2, 8, 7, 6, 5])

    def test_hidden_gems_ties_go_to_fewer_reviews_then_the_newest(self):
        for pk in range(1, 7):
            self.arrive(make_resort(pk, f"Top {pk}"), 100 + pk)
        make_resort(10, "Alpha Cove")
        make_resort(11, "Bravo Cove")
        make_resort(12, "Charlie Cove")
        reviewed = make_resort(13, "Reviewed")
        hidden_only = make_resort(14, "HiddenReview")
        review(reviewed, 4)
        review(hidden_only, 4, hidden=True)
        for pk in (10, 11, 12, 13, 14):
            Resort.objects.filter(pk=pk).update(monthly_arrivals=(20 - pk) * 1000)  # seeded: must not break the tie
        # nobody arrived in these five: 14 (its only review is hidden), 12, 11, 10 by the newest, the reviewed one last
        self.assertEqual(ids(self.get()["hiddenGems"]), [14, 12, 11, 10, 13])

    # ---- the filters and the size ----
    def test_inactive_and_excluded_are_not_in_hidden_gems(self):
        self.world(8)
        make_resort(20, "Gone Resort", is_active=False)
        make_resort(21, "Others / Private Residence")
        make_resort(22, "Kwebang Lampas")
        self.assertIn("Others / Private Residence", MOBILE_EXCLUDED_DESTINATION_NAMES)
        data = self.get()
        for pk in (20, 21, 22):
            self.assertNotIn(pk, ids(data["hiddenGems"]))
            self.assertNotIn(pk, ids(data["featuredDestinations"]))
        self.assertEqual(len(data["hiddenGems"]), 2)  # 8 active: 6 featured, 2 left

    def test_a_new_resort_with_no_arrivals_is_first_in_hidden_gems(self):
        self.world(8)
        make_resort(30, "Brand New")
        self.assertEqual(self.get()["hiddenGems"][0]["resort_id"], 30)

    def test_a_much_visited_resort_is_not_a_hidden_gem_and_is_featured(self):
        self.world(9)
        self.arrive(Resort.objects.get(pk=1), 5000, when=LAST_MONTH)
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"])[0], 1)
        self.assertNotIn(1, ids(data["hiddenGems"]))

    def test_at_most_six_in_each(self):
        self.world(20)
        data = self.get()
        self.assertEqual((len(data["featuredDestinations"]), len(data["hiddenGems"])), (6, 6))

    def test_fewer_than_six_left_is_fine(self):
        self.world(8)
        self.assertEqual(len(self.get()["hiddenGems"]), 2)

    def test_when_everything_is_featured_the_list_is_empty(self):
        self.world(6)
        self.assertEqual(self.get()["hiddenGems"], [])

    # ---- the shape ----
    def test_an_item_has_the_shape_of_a_featured_item(self):
        self.world()
        data = self.get()
        keys = set(data["featuredDestinations"][0])
        self.assertIn("yearly_arrivals", keys)  # the real yearly figure is in the payload already: no new field
        by_id = {d["resort_id"]: d for d in data["destinations"]}
        for item in data["hiddenGems"] + data["featuredDestinations"]:
            self.assertEqual(set(item), keys)
            self.assertEqual(item, by_id[item["resort_id"]])  # the same resort through the same serializer is the same item
