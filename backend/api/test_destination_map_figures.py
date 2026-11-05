"""GET /api/destination-figures/ : the boxes under the GIS map (Active in the app, Arrivals this year, Most visited this year).

Every number comes from destination_figures.py, the one place that adds up the people of a destination, so the year's total must be the
Year view's total of Arrival Monitoring, which is added up by another function.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, Resort, UserProfile
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

THIS_YEAR = timezone.localdate().year
LAST_YEAR_DAY = f"{THIS_YEAR - 1}-06-15"
EARLY_DAY = f"{THIS_YEAR}-01-02"


@override_settings(USE_SEED_DATA=False)
class DestinationMapFiguresTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create_user(username="map_figures_tourism", password="Password@123", email="mf@test.local")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.n = 0

    def arrive(self, resort, people, **kwargs):
        self.n += 1
        return arrive(resort, f"MF-{self.n}", people, **kwargs)

    def figures(self):
        response = self.client.get("/api/destination-figures/")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def year_view_total(self):
        response = self.client.get(f"/api/arrival-monitoring/?date=all&year={THIS_YEAR}")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["summary"]["totalArrivals"]

    # -- Arrivals this year is the Year view's total ----------------------------

    def test_matches_the_year_view_in_one_destination(self):
        a = make_resort(1, "A")
        self.arrive(a, 3)
        self.arrive(a, 4, when=EARLY_DAY)

        self.assertEqual(self.figures()["arrivalsThisYear"], 7)
        self.assertEqual(self.figures()["arrivalsThisYear"], self.year_view_total())

    def test_matches_the_year_view_across_destinations_and_ignores_other_years_and_other_statuses(self):
        a, b, c = make_resort(1, "A"), make_resort(2, "B"), make_resort(3, "C")
        self.arrive(a, 5)
        self.arrive(b, 8, when=EARLY_DAY)
        self.arrive(c, 2)
        self.arrive(a, 40, when=LAST_YEAR_DAY)  # another year
        self.arrive(b, 30, status="no_show")  # did not arrive
        self.arrive(c, 20, status="pending")

        self.assertEqual(self.figures()["arrivalsThisYear"], 15)
        self.assertEqual(self.figures()["arrivalsThisYear"], self.year_view_total())

    def test_matches_the_year_view_with_an_inactive_destination_and_with_nothing_at_all(self):
        self.assertEqual(self.figures()["arrivalsThisYear"], self.year_view_total())  # no destination, no record: 0 and 0
        self.assertEqual(self.figures()["arrivalsThisYear"], 0)

        a, b = make_resort(1, "A"), make_resort(2, "B", is_active=False)
        self.arrive(a, 6)
        self.arrive(b, 9)  # still people who arrived: the Year view counts them, so this does

        self.assertEqual(self.figures()["arrivalsThisYear"], 15)
        self.assertEqual(self.figures()["arrivalsThisYear"], self.year_view_total())

    def test_counts_people_not_records(self):
        a = make_resort(1, "A")
        self.arrive(a, 12)  # one record of twelve people

        figures = self.figures()

        self.assertEqual(figures["arrivalsThisYear"], 12)  # not 1
        self.assertEqual(figures["mostVisited"]["arrivals"], 12)

    # -- Active in the app ------------------------------------------------------

    def test_active_of_all_when_every_destination_is_active(self):
        for pk in (1, 2, 3):
            make_resort(pk, f"R{pk}")

        figures = self.figures()

        self.assertEqual((figures["activeCount"], figures["totalCount"]), (3, 3))

    def test_active_is_right_when_some_are_inactive(self):
        make_resort(1, "A")
        make_resort(2, "B", is_active=False)
        make_resort(3, "C")
        make_resort(4, "D", is_active=False)
        make_resort(5, "E", is_active=False)

        figures = self.figures()

        self.assertEqual((figures["activeCount"], figures["totalCount"]), (2, 5))

    # -- Most visited this year -------------------------------------------------

    def test_most_visited_is_the_destination_with_the_most_people_and_how_many(self):
        a, b = make_resort(1, "Alpha"), make_resort(2, "Bravo")
        self.arrive(a, 3)
        self.arrive(a, 3)  # two records, 6 people
        self.arrive(b, 5)  # one record, 5 people: more records does not win, more people does

        self.assertEqual(self.figures()["mostVisited"], {"resort_id": 1, "name": "Alpha", "arrivals": 6})

    def test_most_visited_is_none_when_every_destination_has_0(self):
        a, b = make_resort(1, "A"), make_resort(2, "B")
        self.arrive(a, 40, when=LAST_YEAR_DAY)  # not this year
        self.arrive(b, 30, status="no_show")  # did not arrive

        figures = self.figures()

        self.assertIsNone(figures["mostVisited"])
        self.assertEqual(figures["arrivalsThisYear"], 0)

    def test_most_visited_is_none_with_no_destination(self):
        self.assertIsNone(self.figures()["mostVisited"])

    def test_a_tie_gives_the_smaller_resort_id_whatever_the_order_they_were_made_in(self):
        high = make_resort(9, "Nine")
        low = make_resort(4, "Four")
        mid = make_resort(6, "Six")
        for resort in (high, low, mid):
            self.arrive(resort, 7)

        self.assertEqual(self.figures()["mostVisited"], {"resort_id": 4, "name": "Four", "arrivals": 7})

    def test_a_tie_is_only_between_the_ones_that_are_level_at_the_top(self):
        self.arrive(make_resort(1, "One"), 3)
        self.arrive(make_resort(8, "Eight"), 9)
        self.arrive(make_resort(5, "Five"), 9)

        self.assertEqual(self.figures()["mostVisited"]["resort_id"], 5)

    # -- the endpoint -----------------------------------------------------------

    def test_the_year_is_sent_and_a_visitor_without_a_login_gets_no_figures(self):
        self.assertEqual(self.figures()["year"], THIS_YEAR)

        response = APIClient().get("/api/destination-figures/")

        self.assertIn(response.status_code, (401, 403))
