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

    # -- the share of the busiest place, Least visited, and the places with none -----------------

    def test_the_busiest_place_share_is_its_arrivals_over_the_total_as_a_whole_number(self):
        self.arrive(make_resort(1, "A"), 6)
        self.arrive(make_resort(2, "B"), 3)
        self.arrive(make_resort(3, "C"), 1)  # 6 of 10

        self.assertEqual(self.figures()["mostVisitedSharePercent"], 60)

    def test_the_share_is_the_busiest_over_the_total_and_not_an_average(self):
        self.arrive(make_resort(1, "A"), 5)
        self.arrive(make_resort(2, "B"), 5)
        self.arrive(make_resort(3, "C"), 5)
        self.arrive(make_resort(4, "D"), 5)  # 5 of 20 is 25; an average of the places' shares would be 25 too, so the next test separates them

        self.assertEqual(self.figures()["mostVisitedSharePercent"], 25)

    def test_the_share_of_a_single_visited_place_is_100(self):
        self.arrive(make_resort(1, "A"), 4)
        make_resort(2, "B")

        self.assertEqual(self.figures()["mostVisitedSharePercent"], 100)

    def test_the_share_rounds_half_up_not_to_even(self):
        self.arrive(make_resort(1, "A"), 5)
        self.arrive(make_resort(2, "B"), 3)  # 5 of 8 is 62.5: 63, not 62

        self.assertEqual(self.figures()["mostVisitedSharePercent"], 63)

    def test_the_share_is_none_at_a_zero_total(self):
        make_resort(1, "A")
        self.arrive(make_resort(2, "B"), 40, when=LAST_YEAR_DAY)

        self.assertIsNone(self.figures()["mostVisitedSharePercent"])

    def test_the_share_is_none_with_no_destination(self):
        self.assertIsNone(self.figures()["mostVisitedSharePercent"])

    def test_least_visited_is_the_fewest_people_among_the_places_that_have_some(self):
        self.arrive(make_resort(1, "Alpha"), 9)
        self.arrive(make_resort(2, "Bravo"), 2)
        self.arrive(make_resort(3, "Charlie"), 5)
        make_resort(4, "Delta")  # none: not the least visited, it has no visit

        self.assertEqual(self.figures()["leastVisited"], {"resort_id": 2, "name": "Bravo", "arrivals": 2})

    def test_least_visited_ignores_a_place_with_zero(self):
        self.arrive(make_resort(1, "Alpha"), 9)
        make_resort(2, "Zero One")
        make_resort(3, "Zero Two")

        self.assertEqual(self.figures()["leastVisited"]["resort_id"], 1)
        self.assertGreater(self.figures()["leastVisited"]["arrivals"], 0)

    def test_least_visited_counts_people_not_records(self):
        a, b = make_resort(1, "A"), make_resort(2, "B")
        self.arrive(a, 1)
        self.arrive(a, 1)
        self.arrive(a, 1)  # three records, 3 people
        self.arrive(b, 2)  # one record, 2 people: fewer people, so it is the least

        self.assertEqual(self.figures()["leastVisited"], {"resort_id": 2, "name": "B", "arrivals": 2})

    def test_least_visited_tie_gives_the_smaller_resort_id_whatever_the_order(self):
        for pk in (9, 4, 6):
            self.arrive(make_resort(pk, f"R{pk}"), 3)
        self.arrive(make_resort(1, "Busy"), 20)

        self.assertEqual(self.figures()["leastVisited"], {"resort_id": 4, "name": "R4", "arrivals": 3})

    def test_least_visited_is_the_most_visited_when_only_one_place_has_arrivals(self):
        self.arrive(make_resort(1, "Only"), 7)

        figures = self.figures()

        self.assertEqual(figures["leastVisited"], figures["mostVisited"])

    def test_least_visited_is_none_when_nobody_has_arrivals(self):
        make_resort(1, "A")
        self.arrive(make_resort(2, "B"), 40, status="no_show")

        self.assertIsNone(self.figures()["leastVisited"])

    def test_least_visited_is_none_with_no_destination(self):
        self.assertIsNone(self.figures()["leastVisited"])

    def test_places_with_no_arrivals_counts_the_ones_a_tourist_could_go_to_that_nobody_has_visited(self):
        self.arrive(make_resort(1, "A"), 4)
        make_resort(2, "B")
        make_resort(3, "C")

        self.assertEqual(self.figures()["placesWithNoArrivals"], 2)

    def test_places_with_no_arrivals_is_0_when_every_place_has_some(self):
        self.arrive(make_resort(1, "A"), 4)
        self.arrive(make_resort(2, "B"), 1)

        self.assertEqual(self.figures()["placesWithNoArrivals"], 0)

    def test_places_with_no_arrivals_is_every_place_when_nobody_has_arrived(self):
        make_resort(1, "A")
        make_resort(2, "B")
        make_resort(3, "C")

        self.assertEqual(self.figures()["placesWithNoArrivals"], 3)

    def test_places_with_no_arrivals_leaves_out_inactive_places_and_placeholders(self):
        self.arrive(make_resort(1, "A"), 4)
        make_resort(2, "Real With None")
        make_resort(3, "Switched Off", is_active=False)
        make_resort(4, "Made Up By An Import", is_placeholder=True)

        self.assertEqual(self.figures()["placesWithNoArrivals"], 1)

    def test_a_placeholder_with_arrivals_still_counts_in_the_total_and_can_be_the_busiest(self):
        self.arrive(make_resort(1, "Real"), 2)
        self.arrive(make_resort(2, "Made Up", is_placeholder=True), 8)  # people did arrive: they are in the Year view, so here too

        figures = self.figures()

        self.assertEqual(figures["arrivalsThisYear"], 10)
        self.assertEqual(figures["mostVisited"]["resort_id"], 2)
        self.assertEqual(figures["mostVisitedSharePercent"], 80)

    # -- the endpoint -----------------------------------------------------------

    def test_the_year_is_sent_and_a_visitor_without_a_login_gets_no_figures(self):
        self.assertEqual(self.figures()["year"], THIS_YEAR)

        response = APIClient().get("/api/destination-figures/")

        self.assertIn(response.status_code, (401, 403))
