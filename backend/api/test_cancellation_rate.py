"""The Dashboard's Cancellation Rate: of the bookings that are FINISHED (the visitor came, or did not), how many did not come.

    noShowRate = cancelled / (arrived + cancelled) x 100, one decimal.

A booking still to come (pending) is on neither side: it can be neither, and counting it in the whole made the rate fall whenever more bookings were made
for the future, with nothing changed in the cancelling. The records are the same set as every other count (the selected year, archived included). With
nothing finished yet there is no rate: None ("nothing to say"), never 0, which would say that nobody cancelled.
"""
from datetime import date

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Resort, TouristRecord
from .services.tourism import build_dashboard_payload
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

YEAR = timezone.localdate().year
DAY = date(YEAR, 3, 10)


@override_settings(USE_SEED_DATA=False)
class CancellationRateTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Rate Resort")
        self.n = 0

    def add(self, status, count=1, archived=False, when=DAY):
        for _ in range(count):
            self.n += 1
            record = arrive(self.resort, f"CR-{self.n:03d}", 2, when=when, status=status)
            if archived:
                TouristRecord.objects.filter(pk=record.pk).update(is_archived=True)

    def rate(self, **params):
        params.setdefault("year", str(YEAR))
        return build_dashboard_payload(params)["metrics"]["noShowRate"]

    # -- the bug: the pending ----------------------------------------------------------------------------------------------------------------

    def test_the_example_of_the_report_15_cancelled_20_arrived_30_pending_is_42_9_not_23_1(self):
        self.add("no_show", 15)
        self.add("arrived", 20)
        self.add("pending", 30)
        self.assertEqual(self.rate(), 42.9)  # 15 / 35; the old formula gave 15 / 65 = 23.1

    def test_the_pending_are_not_in_the_whole_however_many_there_are(self):
        self.add("arrived", 1)
        self.add("no_show", 1)
        self.assertEqual(self.rate(), 50.0)
        for more in (1, 5, 50):
            self.add("pending", more)
            self.assertEqual(self.rate(), 50.0, f"after {more} more pending")

    def test_more_bookings_for_the_future_do_not_move_the_rate(self):
        """The bug itself: the rate used to fall when bookings were made for later, with no change in the cancelling."""
        self.add("arrived", 8)
        self.add("no_show", 2)
        before = self.rate()
        self.add("pending", 40, when=date(YEAR, 12, 28))
        self.assertEqual(before, 20.0)
        self.assertEqual(self.rate(), before)

    def test_a_pending_booking_that_becomes_cancelled_counts_from_then_on(self):
        self.add("arrived", 3)
        self.add("pending", 1)
        self.assertEqual(self.rate(), 0.0)
        TouristRecord.objects.filter(status="pending").update(status="no_show")
        self.assertEqual(self.rate(), 25.0)  # 1 / 4

    # -- the same set of records as every other count ---------------------------------------------------------------------------------------

    def test_archived_records_are_counted_on_both_sides(self):
        self.add("arrived", 3)
        self.add("no_show", 1, archived=True)
        self.assertEqual(self.rate(), 25.0)  # leaving the archived one out would give 0.0
        self.add("arrived", 2, archived=True)
        self.assertEqual(self.rate(), 16.7)  # 1 / 6

    def test_only_the_selected_year(self):
        self.add("arrived", 3)
        self.add("no_show", 1)
        self.add("no_show", 6, when=date(YEAR - 1, 5, 5))
        self.assertEqual(self.rate(), 25.0)
        self.assertEqual(self.rate(year=str(YEAR - 1)), 100.0)

    # -- nothing finished yet ----------------------------------------------------------------------------------------------------------------

    def test_no_records_at_all_is_none_not_zero(self):
        self.assertIsNone(self.rate())

    def test_only_pending_is_none_not_zero(self):
        self.add("pending", 7)
        self.assertIsNone(self.rate())

    def test_a_year_with_no_records_is_none(self):
        self.add("arrived", 2)
        self.assertIsNone(self.rate(year=str(YEAR - 3)))

    def test_a_real_zero_is_zero_not_none(self):
        """Bookings finished and none cancelled: 0.0 (a number), which is a different thing from "nothing to say"."""
        self.add("arrived", 4)
        value = self.rate()
        self.assertEqual(value, 0.0)
        self.assertIsNotNone(value)

    # -- the form of the number, as it was --------------------------------------------------------------------------------------------------

    def test_one_decimal_and_a_number(self):
        for cancelled, arrived, expected in ((1, 2, 33.3), (2, 1, 66.7), (1, 7, 12.5), (3, 0, 100.0), (1, 5, 16.7), (2, 3, 40.0)):
            with self.subTest(cancelled=cancelled, arrived=arrived):
                TouristRecord.objects.all().delete()
                self.add("no_show", cancelled)
                self.add("arrived", arrived)
                value = self.rate()
                self.assertEqual(value, expected)
                self.assertIsInstance(value, float)
                self.assertEqual(value, round(value, 1))

    def test_the_other_figures_of_the_card_row_are_untouched(self):
        self.add("arrived", 2)
        self.add("no_show", 1)
        self.add("pending", 4)
        metrics = build_dashboard_payload({"year": str(YEAR)})["metrics"]
        for key in ("todayArrivals", "weekArrivals", "monthArrivals", "totalRevenueCollected", "pendingForReportingDate", "topResortThisMonth", "topOriginThisMonth"):
            self.assertIn(key, metrics)
        self.assertEqual(metrics["totalRevenueCollected"], 2 * 2 * 80)  # the two arrived, two people each, at 80
