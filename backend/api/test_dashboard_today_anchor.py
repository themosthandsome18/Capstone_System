"""The dashboard's "today", "this week", "this month" and its seven-day trend hang from the real day, not from the newest arrival_date.

The clock is fixed (Wed 11 Nov 2026) so the answer is the same whatever day this runs. Only the date of the anchor changes; what is counted
(arrived records, the sum of total_visitors) does not.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Resort
from .services.tourism import build_dashboard_payload
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

TODAY = date(2026, 11, 11)


@override_settings(USE_SEED_DATA=False)
class DashboardAnchoredToTodayTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Anchor Resort")
        clock = patch("django.utils.timezone.localdate", return_value=TODAY)
        clock.start()
        self.addCleanup(clock.stop)
        self.counter = 0

    def arrive(self, people, when, status="arrived"):
        self.counter += 1
        return arrive(self.resort, f"ANC-{self.counter:04d}", people, when=when, status=status)

    def payload(self, year="2026"):
        return build_dashboard_payload({"year": year})

    # ---- the anchor is today, whatever is booked ahead ----
    def test_reporting_date_is_today_even_with_a_booking_in_the_future(self):
        self.arrive(3, TODAY)
        self.arrive(4, TODAY + timedelta(days=4), status="pending")
        self.arrive(2, TODAY + timedelta(days=30), status="arrived")

        self.assertEqual(self.payload()["reportingDate"], "2026-11-11")

    def test_a_future_booking_does_not_pull_the_window_forward(self):
        self.arrive(5, TODAY)
        self.arrive(9, TODAY + timedelta(days=4), status="pending")

        trends = self.payload()["trends"]

        self.assertEqual(trends["labels"][-1], "Nov 11")
        self.assertNotIn("Nov 15", trends["labels"])
        self.assertEqual(trends["arrivals"][-1], 5)

    def test_the_trend_is_seven_days_and_the_last_one_is_today(self):
        trends = self.payload()["trends"]

        self.assertEqual(len(trends["labels"]), 7)
        self.assertEqual(len(trends["arrivals"]), 7)
        self.assertEqual(trends["labels"], ["Nov 05", "Nov 06", "Nov 07", "Nov 08", "Nov 09", "Nov 10", "Nov 11"])

    def test_the_trend_is_seven_days_with_no_records_at_all(self):
        self.assertEqual(self.payload()["trends"]["labels"][-1], "Nov 11")

    def test_the_window_edges_today_and_six_days_ago_are_in_and_seven_days_ago_is_out(self):
        self.arrive(1, TODAY)
        self.arrive(2, TODAY - timedelta(days=6))
        self.arrive(4, TODAY - timedelta(days=7))

        payload = self.payload()

        self.assertEqual(payload["trends"]["arrivals"], [2, 0, 0, 0, 0, 0, 1])
        self.assertEqual(payload["metrics"]["weekArrivals"], 3)
        self.assertEqual(payload["metrics"]["todayArrivals"], 1)

    def test_this_month_is_the_month_of_the_real_date(self):
        self.arrive(6, date(2026, 11, 1))
        self.arrive(7, date(2026, 10, 31))

        self.assertEqual(self.payload()["metrics"]["monthArrivals"], 6)

    def test_only_arrived_people_are_counted_and_pending_for_today_is_today_only(self):
        self.arrive(3, TODAY, status="arrived")
        self.arrive(8, TODAY, status="pending")
        self.arrive(5, TODAY + timedelta(days=1), status="pending")

        payload = self.payload()

        self.assertEqual(payload["trends"]["arrivals"][-1], 3)
        self.assertEqual(payload["metrics"]["todayArrivals"], 3)
        self.assertEqual(payload["metrics"]["pendingForReportingDate"], 1)

    def test_an_arrived_record_dated_after_today_is_not_this_month_so_far(self):
        future = make_resort(2, "Future Resort")
        self.arrive(3, TODAY)
        # arrived, but dated later this same month and in the next month: both are after today
        arrive(future, "ANC-FUT-1", 50, when=date(2026, 11, 20))
        arrive(future, "ANC-FUT-2", 40, when=date(2026, 12, 2))

        payload = self.payload()

        self.assertEqual(payload["metrics"]["monthArrivals"], 3)
        self.assertEqual(payload["metrics"]["topResortThisMonth"], "Anchor Resort")
        # the year totals still count them
        self.assertEqual(payload["classification"]["filipino"], 3 + 50 + 40)

    def test_a_future_arrived_record_does_not_make_its_origin_the_top_origin_of_the_month(self):
        from .models import Country, TouristRecord

        self.arrive(3, TODAY)
        far = arrive(self.resort, "ANC-FUT-3", 90, when=date(2026, 11, 25))
        TouristRecord.objects.filter(pk=far.pk).update(
            country=Country.objects.get(name="United States"), province=None, region=None,
        )

        payload = self.payload()

        self.assertNotEqual(payload["metrics"]["topOriginThisMonth"], "United States")
        self.assertEqual(payload["metrics"]["monthArrivals"], 3)

    def test_today_itself_is_still_in_the_month(self):
        self.arrive(4, TODAY)
        self.arrive(1, date(2026, 11, 1))

        self.assertEqual(self.payload()["metrics"]["monthArrivals"], 5)

    # ---- the year does not move the anchor; a past year just says so ----
    def test_current_year_only_flag_follows_the_selected_year(self):
        for year, flagged in (("2026", False), ("all", False), ("2025", True), ("2024", True)):
            with self.subTest(year=year):
                payload = self.payload(year)
                self.assertIs(payload["currentYearOnly"], flagged)
                self.assertEqual(payload["currentYear"], "2026")

    def test_the_live_figures_ignore_the_year_and_the_totals_follow_it(self):
        self.arrive(7, date(2025, 8, 3))
        self.arrive(5, TODAY)

        past = self.payload("2025")
        current = self.payload("2026")

        self.assertEqual(past["reportingDate"], "2026-11-11")
        # the live figures are the same whichever year is selected: the date window decides
        for payload in (past, current):
            self.assertEqual(payload["metrics"]["todayArrivals"], 5)
            self.assertEqual(payload["metrics"]["weekArrivals"], 5)
            self.assertEqual(payload["metrics"]["monthArrivals"], 5)
            self.assertEqual(payload["trends"]["arrivals"][-1], 5)
            self.assertEqual(payload["metrics"]["topResortThisMonth"], "Anchor Resort")
        # the totals follow the selected year
        self.assertEqual(past["classification"]["filipino"], 7)
        self.assertEqual(current["classification"]["filipino"], 5)

    def test_pending_today_counts_every_pending_booking_of_today_whatever_the_year(self):
        self.arrive(2, TODAY, status="pending")

        self.assertEqual(self.payload("2025")["metrics"]["pendingForReportingDate"], 1)
        self.assertEqual(self.payload("2026")["metrics"]["pendingForReportingDate"], 1)


JANUARY_3 = date(2027, 1, 3)


@override_settings(USE_SEED_DATA=False)
class FirstWeekOfJanuaryTests(TestCase):
    """On 3 January the seven days are 28 Dec .. 3 Jan: the December days belong to the year before and must still be counted."""

    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.december = make_resort(1, "December Resort")
        self.january = make_resort(2, "January Resort")
        clock = patch("django.utils.timezone.localdate", return_value=JANUARY_3)
        clock.start()
        self.addCleanup(clock.stop)
        arrive(self.december, "JAN-0001", 6, when=date(2026, 12, 29))
        arrive(self.december, "JAN-0002", 2, when=date(2026, 12, 31))
        arrive(self.january, "JAN-0003", 3, when=date(2027, 1, 2))
        arrive(self.january, "JAN-0004", 1, when=JANUARY_3)
        arrive(self.december, "JAN-0005", 4, when=date(2026, 12, 27))  # one day before the window
        arrive(self.december, "JAN-0006", 9, when=date(2026, 12, 30), status="pending")  # not arrived

    def payload(self, year):
        return build_dashboard_payload({"year": year})

    def test_the_trend_reaches_back_into_december_with_the_right_counts(self):
        for year in ("2027", "all"):
            with self.subTest(year=year):
                trends = self.payload(year)["trends"]
                self.assertEqual(trends["labels"], ["Dec 28", "Dec 29", "Dec 30", "Dec 31", "Jan 01", "Jan 02", "Jan 03"])
                self.assertEqual(trends["arrivals"], [0, 6, 0, 2, 0, 3, 1])

    def test_the_week_counts_the_december_days_too(self):
        metrics = self.payload("2027")["metrics"]

        self.assertEqual(metrics["weekArrivals"], 12)
        self.assertEqual(metrics["todayArrivals"], 1)

    def test_this_month_is_january_only_and_its_top_resort_is_january_s(self):
        metrics = self.payload("2027")["metrics"]

        self.assertEqual(metrics["monthArrivals"], 4)
        self.assertEqual(metrics["topResortThisMonth"], "January Resort")

    def test_the_totals_stay_filtered_by_the_selected_year(self):
        self.assertEqual(self.payload("2027")["classification"]["filipino"], 4)
        self.assertEqual(self.payload("2026")["classification"]["filipino"], 6 + 2 + 4)
        self.assertEqual(self.payload("all")["classification"]["filipino"], 6 + 2 + 3 + 1 + 4)

    def test_a_past_year_selected_in_january_still_has_the_same_live_figures(self):
        trends = self.payload("2026")["trends"]

        self.assertEqual(trends["arrivals"], [0, 6, 0, 2, 0, 3, 1])
        self.assertIs(self.payload("2026")["currentYearOnly"], True)
