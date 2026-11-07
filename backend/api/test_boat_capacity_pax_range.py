"""min_pax and max_pax on a Boat Capacity and Fare tier (step 1 of tying the tier
to Total Visitors): the migration's backfill, the rule for the pair, the tier API,
and the two payloads. Nothing here touches the admin wizard or the mobile app."""
import importlib

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    PAX_ORDER_MESSAGE,
    PAX_PAIR_MESSAGE,
    ROLE_ADMIN,
    ROLE_TOURIST,
    ROLE_TOURISM,
    BoatCapacityFare,
    BoatType,
    Country,
    Itinerary,
    Province,
    Region,
    Resort,
    TouristRecord,
    TravelMode,
    UserProfile,
    VisitPurpose,
    pax_range_error,
)
from .tests import ensure_test_reference_tables

SEED = importlib.import_module("api.migrations.0056_seed_boat_capacity_fares")
EXPECTED = [(1, 2), (3, 4), (5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 17), (18, 20)]


def client_for(role, username):
    user = User.objects.create_user(username=username, password="Staff@12345")
    UserProfile.objects.create(user=user, role=role)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
    return client


class PaxBackfillMigrationTests(TransactionTestCase):
    BEFORE = [("api", "0063_sanitarycomplaint_location_provenance")]
    AFTER = [("api", "0065_boatcapacityfare_pax_constraints")]

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def _run(self, names):
        executor = MigrationExecutor(connection)
        executor.migrate(self.BEFORE)
        old = executor.loader.project_state(self.BEFORE).apps.get_model("api", "BoatCapacityFare")
        old.objects.all().delete()
        for index, name in enumerate(names):
            old.objects.create(name=name, display_order=index + 1)
        executor = MigrationExecutor(connection)
        executor.migrate(self.AFTER)
        new = executor.loader.project_state(self.AFTER).apps.get_model("api", "BoatCapacityFare")
        return {row.name: (row.min_pax, row.max_pax) for row in new.objects.all()}

    def test_the_nine_tiers_get_the_right_min_and_max(self):
        got = self._run(SEED.TIERS)
        self.assertEqual([got[name] for name in SEED.TIERS], EXPECTED)

    def test_a_name_that_cannot_be_read_is_left_null_not_guessed(self):
        odd = [
            "21+ pax (One-Way P6,000, Two-way P6,500)",
            "Special charter",
            "0-2 pax (free)",
            "5-3 pax (backwards)",
            "3 pax (no range)",
        ]
        got = self._run(odd + ["1-2 pax (One-Way P1500, Two-way P2000)"])
        for name in odd:
            self.assertEqual(got[name], (None, None), name)
        self.assertEqual(got["1-2 pax (One-Way P1500, Two-way P2000)"], (1, 2))

    def test_the_names_are_not_changed(self):
        got = self._run(SEED.TIERS)
        self.assertEqual(set(got), set(SEED.TIERS))


class PaxRuleTests(TestCase):
    def test_the_rule(self):
        self.assertIsNone(pax_range_error(None, None))
        self.assertIsNone(pax_range_error(1, 1))
        self.assertIsNone(pax_range_error(3, 4))
        self.assertEqual(pax_range_error(3, None), PAX_PAIR_MESSAGE)
        self.assertEqual(pax_range_error(None, 4), PAX_PAIR_MESSAGE)
        self.assertEqual(pax_range_error(0, 2), "The smallest number of people must be 1 or more.")
        self.assertEqual(pax_range_error(5, 4), PAX_ORDER_MESSAGE)

    def test_the_model_refuses_what_the_rule_refuses(self):
        for low, high in ((3, None), (None, 4), (0, 2), (5, 4)):
            with self.subTest(low=low, high=high):
                with self.assertRaises(ValidationError):
                    BoatCapacityFare(name="t", min_pax=low, max_pax=high).full_clean()
        BoatCapacityFare(name="t", min_pax=1, max_pax=2).full_clean()
        BoatCapacityFare(name="t").full_clean()

    def test_the_database_refuses_it_too_as_a_safety_net(self):
        for low, high in ((3, None), (5, 4), (0, 2)):
            with self.subTest(low=low, high=high):
                with self.assertRaises(IntegrityError), transaction.atomic():
                    BoatCapacityFare.objects.create(name=f"x{low}{high}", min_pax=low, max_pax=high)


class PaxApiTests(TestCase):
    LIST = "/api/boat-capacity-fares/"
    NAME = "Alpha 1-2 pax (One-Way P1000)"

    def setUp(self):
        BoatCapacityFare.objects.all().delete()
        self.tier = BoatCapacityFare.objects.create(name=self.NAME, display_order=10, min_pax=1, max_pax=2)
        self.admin = client_for(ROLE_ADMIN, "pax_admin")
        self.tourism = client_for(ROLE_TOURISM, "pax_tourism")
        self.tourist = client_for(ROLE_TOURIST, "pax_tourist")

    def _patch(self, client, body):
        return client.patch(f"{self.LIST}{self.tier.pk}/", body, format="json")

    def _stored(self):
        self.tier.refresh_from_db()
        return self.tier.min_pax, self.tier.max_pax

    def test_the_list_carries_both_numbers(self):
        item = self.admin.get(self.LIST).json()[0]
        self.assertEqual((item["min_pax"], item["max_pax"]), (1, 2))

    def test_tourism_can_write_both_numbers_and_tourist_gets_403(self):
        response = self._patch(self.tourism, {"min_pax": 3, "max_pax": 4})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self._stored(), (3, 4))
        created = self.tourism.post(self.LIST, {"name": "Bravo", "min_pax": 5, "max_pax": 6}, format="json")
        self.assertEqual(created.status_code, 201)
        before = self._stored()
        self.assertEqual(self._patch(self.tourist, {"min_pax": 9, "max_pax": 9}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.tourist.post(self.LIST, {"name": "Nope", "min_pax": 1, "max_pax": 1}, format="json").status_code, 403)
        self.assertEqual(self._stored(), before)
        self.assertFalse(BoatCapacityFare.objects.filter(name="Nope").exists())

    def test_a_min_without_a_max_is_refused(self):
        response = self._patch(self.admin, {"min_pax": 3, "max_pax": None})
        self.assertEqual(response.status_code, 400)
        self.assertIn("max_pax", response.json())
        self.assertEqual(self._stored(), (1, 2))
        created = self.admin.post(self.LIST, {"name": "Only min", "min_pax": 3}, format="json")
        self.assertEqual(created.status_code, 400)
        self.assertFalse(BoatCapacityFare.objects.filter(name="Only min").exists())

    def test_a_max_below_the_min_is_refused(self):
        response = self._patch(self.admin, {"min_pax": 5, "max_pax": 4})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["max_pax"], [PAX_ORDER_MESSAGE])
        self.assertEqual(self._stored(), (1, 2))

    def test_a_max_sent_alone_is_checked_against_the_stored_min(self):
        self.assertEqual(self._patch(self.admin, {"max_pax": 0}).status_code, 400)
        self.assertEqual(self._stored(), (1, 2))
        self.assertEqual(self._patch(self.admin, {"max_pax": 6}).status_code, 200)
        self.assertEqual(self._stored(), (1, 6))

    def test_zero_text_decimals_and_booleans_are_refused(self):
        bodies = (
            {"min_pax": 0, "max_pax": 2},
            {"min_pax": "a", "max_pax": 2},
            {"min_pax": True, "max_pax": 2},
            {"min_pax": 1.5, "max_pax": 2},
        )
        for body in bodies:
            with self.subTest(body=body):
                self.assertEqual(self._patch(self.admin, body).status_code, 400)
        self.assertEqual(self._stored(), (1, 2))

    def test_the_name_alone_still_works_and_keeps_the_range(self):
        response = self._patch(self.admin, {"name": "Alpha renamed 1-2 pax"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._stored(), (1, 2))

    def test_a_tier_can_still_be_added_without_a_range(self):
        response = self.admin.post(self.LIST, {"name": "No range yet"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual((response.json()["min_pax"], response.json()["max_pax"]), (None, None))

    def test_a_refused_rename_leaves_the_range_alone_too(self):
        ensure_test_reference_tables()
        TouristRecord.objects.create(
            survey_id="PAX-001",
            full_name="Pax Test",
            contact_number="09170000000",
            country=Country.objects.first(),
            region=Region.objects.first(),
            province=Province.objects.first(),
            arrival_date="2026-04-02",
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            boat_capacity_fare=self.NAME,
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=2,
            filipino_count=2,
            total_male=1,
            total_female=1,
            age_8_59=2,
            status="arrived",
        )
        # a record holds the old text, so the rename needs a confirmation: 409
        response = self._patch(self.admin, {"name": "Alpha renamed", "min_pax": 7, "max_pax": 8})
        self.assertEqual(response.status_code, 409)
        self.tier.refresh_from_db()
        self.assertEqual((self.tier.name, self.tier.min_pax, self.tier.max_pax), (self.NAME, 1, 2))
        # confirmed: both go through
        response = self._patch(
            self.admin,
            {"name": "Alpha renamed", "min_pax": 7, "max_pax": 8, "confirm_affected_records": 1},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.tier.refresh_from_db()
        self.assertEqual((self.tier.name, self.tier.min_pax, self.tier.max_pax), ("Alpha renamed", 7, 8))


class PaxPayloadTests(TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        BoatCapacityFare.objects.all().delete()
        BoatCapacityFare.objects.create(name="Alpha 1-2 pax", display_order=1, min_pax=1, max_pax=2)
        BoatCapacityFare.objects.create(name="Odd tier", display_order=2)
        self.staff = client_for(ROLE_TOURISM, "pax_payload")

    def test_the_mobile_payload_has_name_min_and_max(self):
        rows = APIClient().get("/api/mobile/tourism/bootstrap/").json()["referenceTables"]["boatCapacityFares"]
        self.assertEqual(
            rows,
            [
                {"name": "Alpha 1-2 pax", "min_pax": 1, "max_pax": 2},
                {"name": "Odd tier", "min_pax": None, "max_pax": None},
            ],
        )
        for row in rows:
            self.assertNotIn("id", row)

    def test_the_web_payload_has_them_beside_the_name(self):
        rows = self.staff.get("/api/reference-tables/").json()["boatCapacityFares"]
        self.assertEqual(
            [(r["name"], r["min_pax"], r["max_pax"]) for r in rows],
            [("Alpha 1-2 pax", 1, 2), ("Odd tier", None, None)],
        )
        bootstrap = self.staff.get("/api/bootstrap/").json()["referenceTables"]["boatCapacityFares"]
        self.assertEqual([(r["min_pax"], r["max_pax"]) for r in bootstrap], [(1, 2), (None, None)])
