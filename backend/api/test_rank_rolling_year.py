"""The two lists of the Home (featuredDestinations, hiddenGems) are ranked by the people who ARRIVED in the last 365 days (rolling_total),
not by the calendar year: on 1 January nothing starts again from 0 and the lists do not move for no real reason.

What a card SHOWS is still "this year" (yearly_arrivals): only the ranking moved. The clock is fixed in every test.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Resort
from .services.destination_figures import ROLLING_DAYS, annotate_destination_figures
from .test_destination_accuracy import BOOTSTRAP, arrive, make_resort
from .tests import ensure_test_reference_tables


def ids(items):
    return [item["resort_id"] for item in items]


@override_settings(USE_SEED_DATA=False)
class RankByRollingYearTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.counter = 0
        self.today = date(2026, 6, 15)
        self.clock = patch("api.services.destination_figures.timezone.localdate", side_effect=lambda: self.today)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def get(self, today=None):
        if today:
            self.today = today
        cache.clear()
        return self.client.get(BOOTSTRAP).json()

    def arrive(self, pk, people, when, status="arrived"):
        self.counter += 1
        return arrive(Resort.objects.get(pk=pk), f"S{self.counter}", people, when=when, status=status)

    def resorts(self, count):
        for pk in range(1, count + 1):
            make_resort(pk, f"Resort {pk:02d}")

    def rolling(self, pk, today=None):
        return annotate_destination_figures(Resort.objects.filter(pk=pk), today or self.today).get().rolling_total

    # ---- the window: 365 days, today included ----
    def test_a_record_of_11_months_ago_is_counted(self):
        self.resorts(2)
        self.arrive(1, 50, date(2025, 7, 15))  # 335 days ago, and in the PREVIOUS calendar year
        self.arrive(2, 10, date(2026, 6, 2))
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"])[:2], [1, 2], "50 people 11 months ago beat 10 this month")
        self.assertEqual(self.rolling(1), 50)

    def test_a_record_of_13_months_ago_is_not_counted(self):
        self.resorts(2)
        self.arrive(1, 50, date(2025, 5, 15))  # 396 days ago
        self.arrive(2, 10, date(2026, 6, 2))
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"])[:2], [2, 1])
        self.assertEqual(self.rolling(1), 0)

    def test_the_window_is_365_days_today_included(self):
        self.resorts(4)
        self.arrive(1, 1, self.today)  # today
        self.arrive(2, 1, self.today - timedelta(days=ROLLING_DAYS - 1))  # the 365th day: in
        self.arrive(3, 1, self.today - timedelta(days=ROLLING_DAYS))  # one day too old: out
        self.arrive(4, 1, self.today + timedelta(days=1))  # tomorrow: not yet
        self.assertEqual(ROLLING_DAYS, 365)
        self.assertEqual([self.rolling(pk) for pk in (1, 2, 3, 4)], [1, 1, 0, 0])

    def test_pending_and_no_show_are_not_counted(self):
        self.resorts(3)
        self.arrive(1, 9, date(2026, 5, 1), status="pending")
        self.arrive(2, 9, date(2026, 5, 1), status="no_show")
        self.arrive(3, 1, date(2026, 5, 1))
        self.assertEqual([self.rolling(pk) for pk in (1, 2, 3)], [0, 0, 1])
        self.assertEqual(ids(self.get()["featuredDestinations"])[0], 3)

    # ---- the main test: 31 December and 1 January ----
    def build_the_year(self):
        """Eight resorts; resort n arrived (9-n)*10 people in each of three months of 2026 (never on 1 January 2026, which leaves the window on
        1 January 2027). The LOWER the id the MORE people, the opposite of the tie-break (newest id first), so a ranking that starts again at 0
        on 1 January would flip: the order is the same on both days only if nothing restarts."""
        self.resorts(8)
        for pk in range(1, 9):
            for month in (3, 7, 11):
                self.arrive(pk, (9 - pk) * 10, date(2026, month, 10))
        # a record of the last days of December, to show the year-end really is crossed by the data
        self.arrive(8, 5, date(2026, 12, 30))

    def test_the_lists_are_the_same_on_31_december_and_on_1_january(self):
        self.build_the_year()
        dec31 = self.get(date(2026, 12, 31))
        jan1 = self.get(date(2027, 1, 1))
        self.assertEqual(ids(dec31["featuredDestinations"]), [1, 2, 3, 4, 5, 6])
        self.assertEqual(ids(jan1["featuredDestinations"]), ids(dec31["featuredDestinations"]))
        self.assertEqual(ids(jan1["hiddenGems"]), ids(dec31["hiddenGems"]))
        self.assertEqual(ids(dec31["hiddenGems"]), [8, 7])
        # and what a card shows DID start again: it is the calendar year
        self.assertEqual({d["yearly_arrivals"] for d in jan1["destinations"]}, {0})
        self.assertTrue(any(d["yearly_arrivals"] > 0 for d in dec31["destinations"]))

    def test_the_lists_do_not_move_on_any_day_across_the_year_end(self):
        self.build_the_year()
        reference = self.get(date(2026, 12, 25))
        for day in range(26, 32):
            data = self.get(date(2026, 12, day))
            self.assertEqual(ids(data["featuredDestinations"]), ids(reference["featuredDestinations"]), f"{day} December")
        for day in range(1, 8):
            data = self.get(date(2027, 1, day))
            self.assertEqual(ids(data["featuredDestinations"]), ids(reference["featuredDestinations"]), f"{day} January")
            self.assertEqual(ids(data["hiddenGems"]), ids(reference["hiddenGems"]), f"{day} January")

    # ---- what the card shows is not touched ----
    def test_yearly_arrivals_in_the_payload_is_still_the_calendar_year(self):
        self.resorts(2)
        self.arrive(1, 50, date(2025, 7, 15))  # last calendar year, inside the 365 days
        self.arrive(2, 10, date(2026, 6, 2))
        figures = {d["resort_id"]: d["yearly_arrivals"] for d in self.get()["destinations"]}
        self.assertEqual(figures, {1: 0, 2: 10})
        self.assertNotIn("rolling_total", self.get()["featuredDestinations"][0], "the ranking figure is not sent")
        self.assertNotIn("rolling_arrivals", self.get()["featuredDestinations"][0])

    def test_the_items_keep_their_shape(self):
        self.build_the_year()
        data = self.get(date(2026, 12, 31))
        keys = set(data["destinations"][0])
        for item in data["featuredDestinations"] + data["hiddenGems"]:
            self.assertEqual(set(item), keys)

    # ---- the lists ----
    def test_no_resort_is_in_both_lists(self):
        self.build_the_year()
        for day in (date(2026, 12, 31), date(2027, 1, 1)):
            data = self.get(day)
            self.assertEqual(set(ids(data["featuredDestinations"])) & set(ids(data["hiddenGems"])), set())

    def test_hidden_gems_are_the_fewest_of_the_window_first(self):
        self.resorts(9)
        for pk in range(1, 10):
            self.arrive(pk, pk, date(2025, 8, 1))  # all in the previous calendar year
        data = self.get()
        self.assertEqual(ids(data["featuredDestinations"]), [9, 8, 7, 6, 5, 4])
        self.assertEqual(ids(data["hiddenGems"]), [1, 2, 3])
        self.assertEqual({d["yearly_arrivals"] for d in data["destinations"]}, {0})
