"""GET /api/tourist-records/<survey_id>/ : the record, plus `computed` (Overnight and Same Day by sex, and the entrance fee) and `created_at`.

The figures are not counted in the view or the serializer: they come from stay_counts and entrance_fee, the places that already work them out,
so they must agree with the rows of Arrival Monitoring, which come from the same two.
"""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ROLE_TOURISM,
    BoatType,
    Country,
    Itinerary,
    Province,
    Resort,
    TouristRecord,
    TravelMode,
    UserProfile,
    VisitPurpose,
)
from .services.tourism import (
    DISCOUNTED_ENTRANCE_FEE,
    REGULAR_ENTRANCE_FEE,
    build_arrival_monitoring_payload,
    entrance_fee,
)
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables

DAY = "2026-04-02"

# The keys the record had before this change.
OLD_KEYS = {
    "survey_id", "submitted_at", "email", "consent_confirmed", "first_name", "last_name", "full_name", "contact_number",
    "country_id", "region_id", "province_id", "country_of_origin", "foreigner_count", "filipino_count", "maubanin_count",
    "total_visitors", "total_male", "total_female", "special_group_count", "age_0_7", "age_8_59", "age_60_above",
    "discounted_count", "arrival_date", "itinerary_id", "resort_id", "travel_mode_id", "boat_type_id", "boat_capacity_fare",
    "parking_space", "visit_purpose_id", "status",
}


@override_settings(USE_SEED_DATA=False)
class ArrivalRecordDetailTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create_user(username="record_detail_tourism", password="Password@123", email="rd@test.local")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.resort = make_resort(1, "Detail Resort")
        self.stays = {}

    def stay(self, nights):
        if nights not in self.stays:
            name = "Same Day" if nights == 0 else f"{nights} Nights"
            self.stays[nights] = Itinerary.objects.create(id=9900 + nights, name=name, stay_nights=nights)
        return self.stays[nights]

    def record(self, survey_id, nights, male, female, discounted=0, **extra):
        quezon = Province.objects.get(name="Quezon")
        people = male + female
        fields = dict(
            survey_id=survey_id, full_name="Group", contact_number="09170000000", first_name="A", last_name="B",
            country=Country.objects.get(name="Philippines"), region=quezon.region, province=quezon,
            arrival_date=DAY, resort=self.resort, itinerary=self.stay(nights), travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(), visit_purpose=VisitPurpose.objects.first(), total_visitors=people,
            filipino_count=people, total_male=male, total_female=female, age_8_59=people, discounted_count=discounted,
            status="arrived",
        )
        fields.update(extra)
        return TouristRecord.objects.create(**fields)

    def detail(self, survey_id):
        response = self.client.get(f"/api/tourist-records/{survey_id}/")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def arrival_row(self, survey_id):
        rows = {r["survey_id"]: r for r in build_arrival_monitoring_payload({"date": DAY})["rows"]}
        return rows[survey_id]

    # -- the worked example ----------------------------------------------------

    def test_2_nights_2_men_and_4_women(self):
        self.record("RD-1", 2, 2, 4)

        computed = self.detail("RD-1")["computed"]

        self.assertEqual(computed["overnight"], {"male": 4, "female": 8, "total": 12})
        self.assertEqual(computed["sameDay"], {"male": 6, "female": 12, "total": 18})

    def test_same_day_has_no_overnight(self):
        self.record("RD-2", 0, 3, 5)

        computed = self.detail("RD-2")["computed"]

        self.assertEqual(computed["overnight"], {"male": 0, "female": 0, "total": 0})
        self.assertEqual(computed["sameDay"], {"male": 3, "female": 5, "total": 8})  # one day each: the people

    def test_a_length_of_stay_with_no_nights_set_counts_as_0_nights(self):
        quezon_stay = Itinerary.objects.create(id=9990, name="Weekend 2 Days", stay_nights=None)  # the name is never read
        self.record("RD-3", 0, 2, 2, itinerary=quezon_stay)

        computed = self.detail("RD-3")["computed"]

        self.assertEqual(computed["overnight"]["total"], 0)
        self.assertEqual(computed["sameDay"]["total"], 4)

    # -- the parts add up to the whole, and the whole is what Arrival Monitoring says ---

    EXAMPLES = [
        ("EX-1", 1, 3, 0),
        ("EX-2", 3, 2, 5),
        ("EX-3", 5, 0, 7),
        ("EX-4", 2, 6, 1),
        ("EX-5", 0, 4, 4),
    ]

    def test_the_totals_are_the_totals_the_rows_of_arrival_monitoring_had(self):
        for survey_id, nights, male, female in self.EXAMPLES:
            self.record(survey_id, nights, male, female)

        for survey_id, nights, male, female in self.EXAMPLES:
            with self.subTest(example=survey_id):
                computed = self.detail(survey_id)["computed"]
                row = self.arrival_row(survey_id)
                self.assertEqual(computed["overnight"]["total"], row["overnight"])
                self.assertEqual(computed["sameDay"]["total"], row["sameDay"])

    def test_the_parts_add_up_to_the_total(self):
        for survey_id, nights, male, female in self.EXAMPLES:
            self.record(survey_id, nights, male, female)

        for survey_id, nights, male, female in self.EXAMPLES:
            with self.subTest(example=survey_id):
                computed = self.detail(survey_id)["computed"]
                for kind in ("overnight", "sameDay"):
                    self.assertEqual(computed[kind]["male"] + computed[kind]["female"], computed[kind]["total"], kind)

    def test_the_sums_of_every_record_are_the_summary_of_arrival_monitoring(self):
        for survey_id, nights, male, female in self.EXAMPLES:
            self.record(survey_id, nights, male, female)
        summary = build_arrival_monitoring_payload({"date": DAY})["summary"]

        overnight = sum(self.detail(e[0])["computed"]["overnight"]["total"] for e in self.EXAMPLES)
        same_day = sum(self.detail(e[0])["computed"]["sameDay"]["total"] for e in self.EXAMPLES)

        self.assertEqual((overnight, same_day), (summary["overnight"], summary["sameDay"]))

    def test_same_day_minus_overnight_is_the_number_of_people_of_each_sex(self):
        for survey_id, nights, male, female in self.EXAMPLES:
            self.record(survey_id, nights, male, female)

        for survey_id, nights, male, female in self.EXAMPLES:
            with self.subTest(example=survey_id):
                computed = self.detail(survey_id)["computed"]
                self.assertEqual(computed["sameDay"]["male"] - computed["overnight"]["male"], male)
                self.assertEqual(computed["sameDay"]["female"] - computed["overnight"]["female"], female)
                self.assertEqual(computed["sameDay"]["total"] - computed["overnight"]["total"], male + female)

    # -- the fee -------------------------------------------------------------------

    def test_the_fee_with_discounted_visitors(self):
        self.record("FEE-1", 1, 4, 2, discounted=2)  # 6 people, 2 at the discounted rate

        fee = self.detail("FEE-1")["computed"]["fee"]

        self.assertEqual(fee["regularCount"], 4)
        self.assertEqual(fee["discountedCount"], 2)
        self.assertEqual((fee["regularRate"], fee["discountedRate"]), (80, 64))
        self.assertEqual(fee["total"], 4 * 80 + 2 * 64)
        # and it is the figure the row of Arrival Monitoring has for the same record
        self.assertEqual(fee["total"], self.arrival_row("FEE-1")["feePaid"])
        self.assertEqual(fee["total"], fee["regularCount"] * fee["regularRate"] + fee["discountedCount"] * fee["discountedRate"])
        # each line comes to its own amount, and the two lines are the total
        self.assertEqual((fee["regularTotal"], fee["discountedTotal"]), (320, 128))
        self.assertEqual(fee["regularTotal"] + fee["discountedTotal"], fee["total"])

    def test_the_fee_with_nobody_discounted(self):
        self.record("FEE-2", 1, 3, 2)

        fee = self.detail("FEE-2")["computed"]["fee"]

        self.assertEqual((fee["regularCount"], fee["discountedCount"]), (5, 0))
        self.assertEqual((fee["regularTotal"], fee["discountedTotal"]), (400, 0))
        self.assertEqual(fee["total"], 5 * 80)
        self.assertEqual(fee["total"], self.arrival_row("FEE-2")["feePaid"])

    def test_everybody_discounted(self):
        self.record("FEE-3", 1, 1, 2, discounted=3)

        fee = self.detail("FEE-3")["computed"]["fee"]

        self.assertEqual((fee["regularCount"], fee["discountedCount"], fee["total"]), (0, 3, 3 * 64))
        self.assertEqual((fee["regularTotal"], fee["discountedTotal"]), (0, 192))

    def test_the_two_rates_are_the_constants_of_the_service(self):
        self.record("FEE-4", 1, 1, 1)

        fee = self.detail("FEE-4")["computed"]["fee"]

        self.assertEqual((fee["regularRate"], fee["discountedRate"]), (REGULAR_ENTRANCE_FEE, DISCOUNTED_ENTRANCE_FEE))
        self.assertEqual((REGULAR_ENTRANCE_FEE, DISCOUNTED_ENTRANCE_FEE), (80, 64))

    # -- they come from the one place, not from a copy -----------------------------

    def test_the_figures_come_through_stay_counts_not_a_copy_of_its_rule(self):
        self.record("SRC-1", 2, 2, 4)
        calls = []

        def stand_in(nights, male, female):
            calls.append((nights, male, female))
            return 1000 + male, 2000 + female  # a rule that no real calculation would give

        with patch("api.services.tourism.stay_counts", side_effect=stand_in):
            computed = self.detail("SRC-1")["computed"]

        self.assertEqual(sorted(calls), sorted([(2, 2, 0), (2, 0, 4), (2, 2, 4)]))  # the men, the women, and both
        self.assertEqual(computed["overnight"], {"male": 1002, "female": 1000, "total": 1002})
        self.assertEqual(computed["sameDay"], {"male": 2000, "female": 2004, "total": 2004})

    def test_the_fee_comes_through_entrance_fee(self):
        self.record("SRC-2", 1, 2, 2, discounted=1)

        with patch("api.services.tourism.entrance_fee", return_value=12345) as stand_in:
            fee = self.detail("SRC-2")["computed"]["fee"]

        # the total, and each of the two lines: all three from entrance_fee, not from a multiplication of the view's own
        self.assertEqual(sorted(call.args for call in stand_in.call_args_list), sorted([(4, 1), (3, 0), (1, 1)]))
        self.assertEqual((fee["total"], fee["regularTotal"], fee["discountedTotal"]), (12345, 12345, 12345))

    # -- the record itself ---------------------------------------------------------

    def test_the_record_keeps_every_key_it_had_and_gains_created_at_and_computed(self):
        self.record("KEY-1", 1, 1, 1)

        data = self.detail("KEY-1")

        self.assertEqual(set(data), OLD_KEYS | {"created_at", "computed"})
        self.assertEqual(set(data["computed"]), {"overnight", "sameDay", "fee"})
        self.assertEqual(set(data["computed"]["overnight"]), {"male", "female", "total"})
        self.assertEqual(set(data["computed"]["sameDay"]), {"male", "female", "total"})
        self.assertEqual(
            set(data["computed"]["fee"]),
            {"total", "regularCount", "regularRate", "regularTotal", "discountedCount", "discountedRate", "discountedTotal"},
        )

    def test_created_at_is_the_time_the_record_was_made(self):
        record = self.record("CRE-1", 1, 1, 1)

        data = self.detail("CRE-1")

        self.assertIsNotNone(data["created_at"])
        self.assertEqual(timezone.datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")), record.created_at)

    def test_created_at_is_there_when_submitted_at_is_not(self):
        self.record("CRE-2", 1, 1, 1, submitted_at=None)

        data = self.detail("CRE-2")

        self.assertIsNone(data["submitted_at"])
        self.assertIsNotNone(data["created_at"])  # "Registered on" has a date either way

    def test_blank_names_and_no_submitted_at_do_not_break_it(self):
        self.record("BLANK-1", 2, 1, 1, first_name="", last_name="", full_name="", email="", contact_number="", submitted_at=None)

        response = self.client.get("/api/tourist-records/BLANK-1/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual((data["first_name"], data["last_name"], data["full_name"], data["submitted_at"]), ("", "", "", None))
        self.assertEqual(data["computed"]["overnight"]["total"], 4)

    def test_created_at_cannot_be_written(self):
        self.record("RO-1", 1, 1, 1)
        before = TouristRecord.objects.get(pk="RO-1").created_at
        body = {k: v for k, v in self.detail("RO-1").items() if k != "computed"}
        body["created_at"] = "2001-01-01T00:00:00Z"

        self.client.put("/api/tourist-records/RO-1/", body, format="json")

        self.assertEqual(TouristRecord.objects.get(pk="RO-1").created_at, before)

    # -- what did not change -------------------------------------------------------

    def test_a_record_that_does_not_exist_is_404(self):
        self.assertEqual(self.client.get("/api/tourist-records/NOPE/").status_code, 404)

    def test_without_a_login_it_is_refused(self):
        self.record("AUTH-1", 1, 1, 1)

        response = APIClient().get("/api/tourist-records/AUTH-1/")

        self.assertIn(response.status_code, (401, 403))

    def test_the_list_of_records_does_not_carry_computed(self):
        self.record("LIST-1", 1, 1, 1)

        rows = self.client.get("/api/tourist-records/").json()

        self.assertTrue(rows)
        rows = rows if isinstance(rows, list) else rows.get("rows", rows.get("records", []))
        self.assertTrue(all("computed" not in row for row in rows))

    def test_arrival_monitoring_rows_are_as_they_were(self):
        self.record("AM-1", 2, 2, 4)

        row = self.arrival_row("AM-1")

        self.assertEqual(set(row), {"survey_id", "date", "group", "male", "female", "itinerary", "overnight", "sameDay", "resort", "feePaid"})
        self.assertEqual((row["overnight"], row["sameDay"]), (12, 18))

    def test_one_record_costs_a_fixed_number_of_queries(self):
        self.record("Q-1", 3, 2, 2)
        self.record("Q-2", 3, 2, 2)

        with self.assertNumQueries(3):  # the login's token and user, then the record with its Length of Stay in one
            self.detail("Q-1")
