"""`hiddenGems` of the public tourism bootstrap: the destinations the featured list does not show, the least visited first.

Not featured; then people this month (visitor_total) fewest first, visible reviews fewest first, newest resort_id first, name A-Z; six at most.
monthly_arrivals (seeded demo data) is never used.
"""
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Resort
from .test_destination_accuracy import BOOTSTRAP, arrive, make_resort, review
from .tests import ensure_test_reference_tables
from .views.mobile import MOBILE_EXCLUDED_DESTINATION_NAMES


def ids(items):
    return [item["resort_id"] for item in items]


@override_settings(USE_SEED_DATA=False)
class HiddenGemsTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()

    def get(self):
        cache.clear()
        return self.client.get(BOOTSTRAP).json()

    def world(self, count=14):
        """`count` resorts, ids 1..count; resort n has n visitors this month, so the featured six are the highest ids."""
        for pk in range(1, count + 1):
            resort = make_resort(pk, f"Resort {pk:02d}")
            arrive(resort, f"S{pk}", pk)

    def test_no_resort_is_in_both_lists(self):
        self.world()
        data = self.get()
        self.assertEqual(len(data["hiddenGems"]), 6)
        self.assertEqual(set(ids(data["featuredDestinations"])) & set(ids(data["hiddenGems"])), set())

    def test_featured_is_the_most_visited_six_and_the_gems_are_the_next_least_visited(self):
        self.world()
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"]), [14, 13, 12, 11, 10, 9])
        self.assertEqual(ids(data["hiddenGems"]), [1, 2, 3, 4, 5, 6])

    def test_inactive_and_excluded_are_not_in_hidden_gems(self):
        self.world(8)
        make_resort(20, "Gone Resort", is_active=False)
        make_resort(21, "Others / Private Residence")
        make_resort(22, "Kwebang Lampas")
        self.assertIn("Others / Private Residence", MOBILE_EXCLUDED_DESTINATION_NAMES)
        data = self.get()
        for pk in (20, 21, 22):
            self.assertNotIn(pk, ids(data["hiddenGems"]))
        self.assertEqual(len(data["hiddenGems"]), 2)  # 8 active: 6 featured, 2 left

    def test_a_new_resort_with_no_visitors_is_first(self):
        self.world(8)
        make_resort(30, "Brand New")
        data = self.get()
        self.assertEqual(data["hiddenGems"][0]["resort_id"], 30)

    def test_a_much_visited_resort_is_not_a_hidden_gem(self):
        self.world(9)
        arrive(Resort.objects.get(pk=1), "BIG", 5000)
        data = self.get()
        self.assertIn(1, ids(data["featuredDestinations"]))
        self.assertNotIn(1, ids(data["hiddenGems"]))

    def test_at_most_six(self):
        self.world(20)
        self.assertEqual(len(self.get()["hiddenGems"]), 6)

    def test_fewer_than_six_left_is_fine(self):
        self.world(8)
        self.assertEqual(len(self.get()["hiddenGems"]), 2)

    def test_when_everything_is_featured_the_list_is_empty(self):
        self.world(6)
        self.assertEqual(self.get()["hiddenGems"], [])

    def test_ties_break_by_reviews_then_newest_id_then_name(self):
        # six featured with many visitors, then six with 0 visitors to be ordered by the tie-breakers
        for pk in range(1, 7):
            arrive(make_resort(pk, f"Top {pk}"), f"T{pk}", 100 + pk)
        make_resort(10, "Zeta")
        make_resort(11, "Alpha")
        make_resort(12, "Beta")
        d = make_resort(13, "Reviewed")  # one visible review: after the unreviewed
        e = make_resort(14, "HiddenReview")  # its only review is hidden: counts as none
        review(d, 4)
        review(e, 4, hidden=True)
        data = self.get()
        # 0 visitors, 0 reviews: ids 14 (hidden review only), 12, 11, 10 by newest id; the reviewed one (13) last
        self.assertEqual(ids(data["hiddenGems"]), [14, 12, 11, 10, 13])
        # resort_id is the primary key, so two resorts never tie on it: the name (A-Z) is a last key that cannot decide anything

    def test_monthly_arrivals_decides_nothing(self):
        self.world(10)
        for pk in range(1, 11):
            Resort.objects.filter(pk=pk).update(monthly_arrivals=(11 - pk) * 1000)  # the reverse of the real visitors
        data = self.get()
        self.assertEqual(ids(data["hiddenGems"]), [1, 2, 3, 4])

    def test_an_item_has_the_shape_of_a_featured_item(self):
        self.world()
        data = self.get()
        self.assertEqual(set(data["hiddenGems"][0].keys()), set(data["featuredDestinations"][0].keys()))
        for item in data["hiddenGems"]:
            self.assertEqual(set(item.keys()), set(data["featuredDestinations"][0].keys()))
        # the same resort through the same serializer is the same item
        by_id = {d["resort_id"]: d for d in data["destinations"]}
        for item in data["hiddenGems"]:
            self.assertEqual(item, by_id[item["resort_id"]])

    def test_the_featured_list_is_not_changed_by_it(self):
        self.world()
        data = self.get()
        self.assertEqual(data["featuredDestinations"], data["destinations"][:6])
