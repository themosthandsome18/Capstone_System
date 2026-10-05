import json
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Count, Max, Q
from django.test import TestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .seeders import ensure_initial_reference_data
from .seed_data import INITIAL_TOURIST_RECORDS, REFERENCE_TABLES
from .models import (
    ACTION_UPDATE,
    BOOKING_STATUS_ARRIVED,
    MODULE_TOURISM,
    ActivityLog,
    Barangay,
    BoatType,
    Country,
    FeedbackEntry,
    HouseholdSanitationRecord,
    Itinerary,
    Notification,
    NOTIFICATION_AUDIENCE_PUBLIC,
    NOTIFICATION_MODULE_GENERAL,
    NOTIFICATION_MODULE_SANITATION,
    NOTIFICATION_MODULE_TOURISM,
    NOTIFICATION_TYPE_PUBLIC_ADVISORY,
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_SANITATION,
    ROLE_TOURIST,
    ROLE_TOURISM,
    Province,
    Region,
    Resort,
    SanitaryBusinessType,
    SanitaryComplaint,
    SanitaryEstablishment,
    SanitaryInspection,
    TouristRecord,
    TravelMode,
    UserProfile,
    VisitPurpose,
)


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_login_returns_token_and_role(self):
        user = User.objects.create_user(
            username="tourism_admin",
            password="Tourism@123",
        )
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)

        response = self.client.post(
            "/api/auth/login/",
            {"username": "tourism_admin", "password": "Tourism@123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.json())
        self.assertEqual(response.json()["user"]["profile"]["role"], ROLE_TOURISM)

    def test_sanitation_user_cannot_access_tourism_endpoint(self):
        user = User.objects.create_user(
            username="sanitation_admin",
            password="Sanitation@123",
        )
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.get("/api/booking-management/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_tourist_registration_assigns_tourist_role(self):
        payload = {
            "full_name": "Maria Tourist",
            "email": "maria.tourist@example.com",
            "password": "SecurePassword@123",
            "contact_number": "09171234567",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["user"]["profile"]["role"], ROLE_TOURIST)
        self.assertEqual(response.json()["user"]["profile"]["role_label"], "Tourist")

        created_user = User.objects.get(username="maria.tourist@example.com")
        self.assertEqual(created_user.profile.role, ROLE_TOURIST)

    def test_tourist_cannot_access_staff_tourism_endpoints(self):
        tourist_user = User.objects.create_user(
            username="registered_tourist",
            password="Password@123",
        )
        UserProfile.objects.create(user=tourist_user, role=ROLE_TOURIST)
        token = Token.objects.create(user=tourist_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        # 1. Staff Booking Management Web API
        resp_booking = self.client.get("/api/booking-management/")
        self.assertEqual(resp_booking.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp_booking.json()["detail"], "You do not have access to this module.")

        # 2. Staff-only Mobile Tourism Record Lookup
        resp_lookup = self.client.get("/api/mobile/tourism/records/lookup/?query=SURV-2026-00001")
        self.assertEqual(resp_lookup.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp_lookup.json()["detail"], "Only tourism staff and administrators can look up visitor records.")

    def test_tourism_staff_retains_access_to_staff_tourism_endpoints(self):
        staff_user = User.objects.create_user(
            username="tourism_staff_member",
            password="Password@123",
        )
        UserProfile.objects.create(user=staff_user, role=ROLE_TOURISM)
        token = Token.objects.create(user=staff_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        # 1. Staff Booking Management Web API
        resp_booking = self.client.get("/api/booking-management/")
        self.assertEqual(resp_booking.status_code, status.HTTP_200_OK)

        # 2. Staff-only Mobile Tourism Record Lookup (access granted through permission boundary, returns 404 for missing query)
        resp_lookup = self.client.get("/api/mobile/tourism/records/lookup/?query=NONEXISTENT_ID")
        self.assertNotEqual(resp_lookup.status_code, status.HTTP_403_FORBIDDEN)


class RemovedEstablishmentRegistrationTests(TestCase):
    """The establishment username/password registration is gone; owners use
    the Establishment Portal with the code on their Owner's Slip."""

    def test_both_registration_routes_are_404_and_create_nothing(self):
        users_before = User.objects.count()
        for url in (
            "/api/auth/register-establishment/",
            "/api/mobile/sanitation/register-establishment/",
        ):
            response = APIClient().post(
                url,
                {"username": "would_be_owner", "password": "Owner@12345", "permit_number": "SP-1"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, url)
        self.assertEqual(User.objects.count(), users_before)

    def test_the_shared_login_still_signs_in_an_existing_establishment_account(self):
        # Existing establishment users, their rows and tokens are left alone.
        user = User.objects.create_user(username="old_owner", password="Owner@12345")
        UserProfile.objects.create(user=user, role=ROLE_ESTABLISHMENT)

        response = APIClient().post(
            "/api/auth/login/", {"username": "old_owner", "password": "Owner@12345"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.json()["user"]["profile"]["role"], ROLE_ESTABLISHMENT)


def ensure_test_barangays():
    """The 40 official Mauban barangays, as seeded into api_barangay."""
    from .seed_data import MAUBAN_BARANGAYS

    for index, name in enumerate(MAUBAN_BARANGAYS, start=1):
        Barangay.objects.get_or_create(
            name=name, defaults={"display_order": index, "is_active": True}
        )


def ensure_test_reference_tables():
    if not Country.objects.exists():
        Country.objects.bulk_create([Country(**c) for c in REFERENCE_TABLES["countries"]], ignore_conflicts=True)
    if not Region.objects.exists():
        Region.objects.bulk_create([Region(**r) for r in REFERENCE_TABLES["regions"]], ignore_conflicts=True)
    if not Province.objects.exists():
        reg_calabarzon = Region.objects.filter(code="04").first() or Region.objects.first()
        reg_ncr = Region.objects.filter(code="13").first() or reg_calabarzon
        provinces = []
        for p in REFERENCE_TABLES["provinces"]:
            reg = reg_ncr if p["name"] == "Metro Manila" else reg_calabarzon
            provinces.append(Province(id=p["id"], name=p["name"], region=reg))
        Province.objects.bulk_create(provinces, ignore_conflicts=True)
    if not Itinerary.objects.exists():
        Itinerary.objects.bulk_create([Itinerary(**it) for it in REFERENCE_TABLES["itineraries"]], ignore_conflicts=True)
    if not TravelMode.objects.exists():
        TravelMode.objects.bulk_create([TravelMode(**tm) for tm in REFERENCE_TABLES["travel_modes"]], ignore_conflicts=True)
    if not BoatType.objects.exists():
        BoatType.objects.bulk_create([BoatType(**bt) for bt in REFERENCE_TABLES["boat_types"]], ignore_conflicts=True)
    if not VisitPurpose.objects.exists():
        VisitPurpose.objects.bulk_create([VisitPurpose(**vp) for vp in REFERENCE_TABLES["visit_purposes"]], ignore_conflicts=True)
    if not Resort.objects.exists():
        Resort.objects.bulk_create([Resort(**res) for res in REFERENCE_TABLES["resorts"]], ignore_conflicts=True)


class SanitaryEstablishmentRecordsApiTests(TestCase):
    """The server contract the Establishment Records Register/Edit form relies on."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="records_sanitation", password="Password@123"
        )
        UserProfile.objects.create(user=self.user, role=ROLE_SANITATION)
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        self.market_stall = SanitaryBusinessType.objects.create(
            name="Public Market Stall", inspection_frequency="monthly"
        )
        self.karaoke = SanitaryBusinessType.objects.create(
            name="Karaoke / Video Bar / CSW", inspection_frequency="monthly"
        )

    def create_permitted_establishment(self):
        return SanitaryEstablishment.objects.create(
            business_name="Existing Bakery",
            owner_name="Juan Dela Cruz",
            business_type=self.market_stall,
            permit_size="large",
            barangay="Daungan",
            address="12 Rizal St",
            contact_number="09171234567",
            has_permit=True,
            permit_number="LG-2026-007",
            permit_issued_date="2026-02-01",
            permit_expiry_date="2026-12-31",
            compliance_status="for_completion",
            permit_status="conditional",
            latitude=14.191234,
            longitude=121.735678,
            remarks="Existing remarks",
        )

    def test_registration_payload_creates_establishment_with_no_permit_on_record(self):
        # Exactly what the Register New Establishment form sends.
        response = self.client.post(
            "/api/sanitation/establishments/",
            {
                "business_name": "New Sari-Sari Store",
                "owner_name": "Ana Reyes",
                "business_type": self.market_stall.id,
                "barangay": "Daungan",
                "address": "1 Test St",
                "contact_number": "09170000000",
                "latitude": 14.188,
                "longitude": 121.732,
                "has_permit": False,
                "permit_number": "",
                "permit_issued_date": None,
                "permit_expiry_date": None,
                "compliance_status": "no_permit",
                "permit_status": "no_permit",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        created = SanitaryEstablishment.objects.get(pk=response.data["id"])
        self.assertFalse(created.has_permit)
        self.assertEqual(created.permit_number, "")
        self.assertIsNone(created.permit_issued_date)
        self.assertIsNone(created.permit_expiry_date)
        self.assertEqual(created.compliance_status, "no_permit")
        self.assertEqual(created.permit_status, "no_permit")
        self.assertEqual(created.business_type_id, self.market_stall.id)
        # Not asked for at registration: the model defaults apply.
        self.assertEqual(created.permit_size, "sp")
        self.assertEqual(created.remarks, "")
        self.assertEqual(created.latitude, 14.188)
        self.assertEqual(created.longitude, 121.732)
        # The internal record id is not a permit number.
        self.assertNotEqual(str(created.pk), created.permit_number)

    def test_patch_of_profile_fields_preserves_permit_location_and_coverage(self):
        establishment = self.create_permitted_establishment()

        response = self.client.patch(
            f"/api/sanitation/establishments/{establishment.id}/",
            {"contact_number": "09990000000", "address": "99 New Address"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        establishment.refresh_from_db()
        self.assertEqual(establishment.contact_number, "09990000000")
        self.assertEqual(establishment.address, "99 New Address")
        self.assertTrue(establishment.has_permit)
        self.assertEqual(establishment.permit_number, "LG-2026-007")
        self.assertEqual(str(establishment.permit_issued_date), "2026-02-01")
        self.assertEqual(str(establishment.permit_expiry_date), "2026-12-31")
        self.assertEqual(establishment.compliance_status, "for_completion")
        self.assertEqual(establishment.permit_status, "conditional")
        self.assertEqual(establishment.permit_size, "large")
        self.assertEqual(establishment.latitude, 14.191234)
        self.assertEqual(establishment.longitude, 121.735678)
        self.assertEqual(establishment.remarks, "Existing remarks")
        self.assertEqual(establishment.business_type_id, self.market_stall.id)

    def test_patch_of_business_type_keeps_the_real_type_id_and_permit_data(self):
        establishment = self.create_permitted_establishment()

        response = self.client.patch(
            f"/api/sanitation/establishments/{establishment.id}/",
            {"business_type": self.karaoke.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["business_type"], self.karaoke.id)
        self.assertEqual(response.data["business_type_name"], "Karaoke / Video Bar / CSW")
        establishment.refresh_from_db()
        self.assertEqual(establishment.business_type_id, self.karaoke.id)
        self.assertEqual(establishment.permit_number, "LG-2026-007")
        self.assertEqual(establishment.permit_size, "large")
        self.assertEqual(establishment.compliance_status, "for_completion")

    def test_patch_with_null_permit_dates_left_untouched_keeps_them_null(self):
        # Mirrors a production record holding a permit but no recorded dates.
        establishment = self.create_permitted_establishment()
        SanitaryEstablishment.objects.filter(pk=establishment.pk).update(
            permit_issued_date=None, permit_expiry_date=None
        )

        response = self.client.patch(
            f"/api/sanitation/establishments/{establishment.id}/",
            {"owner_name": "Maria Dela Cruz"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        establishment.refresh_from_db()
        self.assertEqual(establishment.owner_name, "Maria Dela Cruz")
        self.assertIsNone(establishment.permit_issued_date)
        self.assertIsNone(establishment.permit_expiry_date)


class BookingManagementApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = User.objects.create_user(
            username="tourism_admin",
            password="Tourism@123",
        )
        UserProfile.objects.create(user=cls.user, role=ROLE_TOURISM)
        cls.token = Token.objects.create(user=cls.user)

        ensure_test_reference_tables()
        TouristRecord.objects.bulk_create(
            [TouristRecord(**record) for record in INITIAL_TOURIST_RECORDS],
            ignore_conflicts=True,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        from unittest.mock import patch
        import datetime
        self.localdate_patcher = patch("django.utils.timezone.localdate", return_value=datetime.date(2026, 4, 1))
        self.mock_localdate = self.localdate_patcher.start()

    def tearDown(self):
        self.localdate_patcher.stop()

    def test_booking_management_returns_summary_and_rows(self):
        response = self.client.get("/api/booking-management/", {"page_size": 20})

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.json()
        self.assertEqual(data["summary"]["verifiedEntries"], 12)
        self.assertEqual(data["summary"]["pending"], 4)
        self.assertEqual(data["summary"]["arrived"], 7)
        self.assertEqual(data["summary"]["noShow"], 1)
        self.assertEqual(len(data["rows"]), 12)

        first_row = data["rows"][0]
        self.assertIn("country_name", first_row)
        self.assertIn("resort_name", first_row)
        self.assertIn("status_label", first_row)

    def test_booking_management_filters_by_search_and_status(self):
        response = self.client.get(
            "/api/booking-management/",
            {"search": "Ethan", "status": "pending"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["survey_id"], "SURV-2026-002")
        self.assertEqual(rows[0]["status"], "pending")

    def test_booking_status_can_be_updated(self):
        self.client.get("/api/booking-management/")

        response = self.client.patch(
            "/api/tourist-records/SURV-2026-002/",
            {"status": BOOKING_STATUS_ARRIVED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], BOOKING_STATUS_ARRIVED)
        self.assertEqual(
            TouristRecord.objects.get(survey_id="SURV-2026-002").status,
            BOOKING_STATUS_ARRIVED,
        )
        self.assertTrue(
            ActivityLog.objects.filter(
                action=ACTION_UPDATE,
                module=MODULE_TOURISM,
                record_id="SURV-2026-002",
                user=self.user,
            ).exists()
        )


    def _record_payload(self, **overrides):
        region = Region.objects.first()
        province = Province.objects.first() or Province.objects.create(
            id=9001, name="Quezon", region=region
        )
        payload = {
            "first_name": "Maria",
            "last_name": "Reyes",
            "full_name": "Maria Reyes",
            "email": "maria@example.com",
            "consent_confirmed": True,
            "contact_number": "+639171234567",
            "country_id": Country.objects.first().id,
            "region_id": region.id,
            "province_id": province.id,
            "country_of_origin": "",
            "resort_id": Resort.objects.first().resort_id,
            "itinerary_id": Itinerary.objects.first().id,
            "travel_mode_id": TravelMode.objects.first().id,
            "boat_type_id": BoatType.objects.first().id,
            "boat_capacity_fare": "",
            "parking_space": "",
            "visit_purpose_id": VisitPurpose.objects.first().id,
            "arrival_date": "2026-04-01",
            "filipino_count": 3,
            "foreigner_count": 1,
            "total_visitors": 4,
            "total_male": 2,
            "total_female": 2,
            "special_group_count": 0,
            "age_0_7": 0,
            "age_8_59": 4,
            "age_60_above": 0,
            "status": "pending",
        }
        payload.update(overrides)
        return payload

    def test_maubanin_count_above_filipino_or_total_is_rejected(self):
        for value in (4, 5, 99):  # 4 = total head count, still > filipino_count (3)
            response = self.client.post(
                "/api/tourist-records/",
                self._record_payload(maubanin_count=value),
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, value)
            self.assertIn("maubanin_count", response.json())
            self.assertIn(
                "cannot be greater than the Filipino count",
                str(response.json()["maubanin_count"]),
            )
        self.assertFalse(TouristRecord.objects.filter(email="maria@example.com").exists())

    def test_valid_maubanin_count_is_saved_without_changing_totals(self):
        response = self.client.post(
            "/api/tourist-records/",
            self._record_payload(maubanin_count=2),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = TouristRecord.objects.get(email="maria@example.com")
        self.assertEqual(record.maubanin_count, 2)
        self.assertEqual(record.filipino_count, 3)
        self.assertEqual(record.foreigner_count, 1)
        self.assertEqual(record.total_visitors, 4)

    def test_maubanin_count_equal_to_filipino_count_is_allowed(self):
        response = self.client.post(
            "/api/tourist-records/",
            self._record_payload(maubanin_count=3),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

    def test_omitted_maubanin_count_saves_zero(self):
        response = self.client.post(
            "/api/tourist-records/",
            self._record_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(
            TouristRecord.objects.get(email="maria@example.com").maubanin_count, 0
        )

    def test_updating_maubanin_count_above_filipino_count_is_rejected(self):
        response = self.client.post(
            "/api/tourist-records/",
            self._record_payload(maubanin_count=1),
            format="json",
        )
        survey_id = response.json()["survey_id"]

        bad = self.client.patch(
            f"/api/tourist-records/{survey_id}/", {"maubanin_count": 4}, format="json"
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        good = self.client.patch(
            f"/api/tourist-records/{survey_id}/", {"maubanin_count": 3}, format="json"
        )
        self.assertEqual(good.status_code, status.HTTP_200_OK, good.content)
        self.assertEqual(good.json()["maubanin_count"], 3)

    def test_maubanin_count_is_not_added_on_top_of_filipino_in_dashboard(self):
        TouristRecord.objects.all().delete()
        response = self.client.post(
            "/api/tourist-records/",
            self._record_payload(maubanin_count=3, status="arrived"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

        dashboard = self.client.get("/api/dashboard/", {"year": "all"})
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        classification = dashboard.json()["classification"]
        # Maubanin is a subset of Filipino: Domestic must equal filipino_count (3), not 3 + 3.
        self.assertEqual(classification["filipino"], 3)
        self.assertEqual(classification["foreign"], 1)


class MobilePublicApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        ensure_test_barangays()
        ensure_test_reference_tables()
        cls.btype, _ = SanitaryBusinessType.objects.get_or_create(
            name="Food Establishment",
            defaults={"inspection_frequency": "quarterly"},
        )
        cls.establishment, _ = SanitaryEstablishment.objects.get_or_create(
            permit_number="LG-2026-001",
            defaults={
                "business_name": "Test Mobile Establishment",
                "owner_name": "Test Owner",
                "business_type": cls.btype,
                "barangay": "Poblacion",
                "address": "123 Main St",
                "has_permit": True,
                "compliance_status": "good_standing",
                "permit_status": "active",
            },
        )
        cls.sanitation_user = User.objects.create_user(
            username="test_mobile_sanitation_inspector",
            password="Password@123",
            email="inspector@test.local",
        )
        UserProfile.objects.create(user=cls.sanitation_user, role=ROLE_SANITATION)
        cls.sanitation_token = Token.objects.create(user=cls.sanitation_user)

    def setUp(self):
        self.client = APIClient()
        from unittest.mock import patch
        import datetime
        self.localdate_patcher = patch("django.utils.timezone.localdate", return_value=datetime.date(2026, 4, 1))
        self.mock_localdate = self.localdate_patcher.start()

    def tearDown(self):
        self.localdate_patcher.stop()

    def test_mobile_bootstrap_is_public(self):
        response = self.client.get("/api/mobile/tourism/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn("destinations", data)
        self.assertIn("referenceTables", data)
        self.assertIn("barangays", data)

    def test_mobile_bootstrap_shows_ranked_mauban_destinations_only(self):
        response = self.client.get("/api/mobile/tourism/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        destinations = response.json()["destinations"]
        names = [destination["resort_name"] for destination in destinations]

        self.assertLessEqual(len(destinations), 10)
        self.assertIn("Dona Choleng Camping Resort", names)
        self.assertLess(len(destinations), Resort.objects.count())
        self.assertTrue(all(not name.endswith("(") for name in names))

    def test_mobile_bootstrap_prioritizes_high_visitor_destinations(self):
        ensure_initial_reference_data()
        TouristRecord.objects.create(
            survey_id="MOB-TOP-0001",
            full_name="High Visitor Group",
            contact_number="09170000000",
            country=Country.objects.first(),
            region=Region.objects.first(),
            province=Province.objects.first(),
            arrival_date="2026-04-02",
            resort=Resort.objects.get(resort_name="Orlan Beach Resort"),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=5000,
            filipino_count=5000,
            total_male=2500,
            total_female=2500,
            age_8_59=5000,
            status="arrived",
        )

        response = self.client.get("/api/mobile/tourism/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_destination = response.json()["destinations"][0]
        self.assertEqual(first_destination["resort_name"], "Orlan Beach Resort")
        self.assertEqual(first_destination["monthly_arrivals"], 1)

    def test_mobile_tourist_registration_creates_booking_record(self):
        response = self.client.post(
            "/api/mobile/tourism/register-visit/",
            {
                "full_name": "Mobile Tourist",
                "contact_number": "09171234567",
                "arrival_date": "2026-06-01",
                "total_visitors": 2,
                "filipino_count": 2,
                "total_male": 1,
                "total_female": 1,
                "age_8_59": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            TouristRecord.objects.filter(full_name="Mobile Tourist").exists()
        )

    def test_mobile_tourist_registration_accepts_full_web_record_fields(self):
        ensure_initial_reference_data()
        self.client.get("/api/mobile/tourism/bootstrap/")
        resort = Resort.objects.first()
        country = Country.objects.first()
        region = Region.objects.first()
        province = Province.objects.first()
        if province is None:
            province = Province.objects.create(id=1, name="Quezon", region=region)
        itinerary = Itinerary.objects.first()
        travel_mode = TravelMode.objects.first()
        boat_type = BoatType.objects.first()
        purpose = VisitPurpose.objects.first()

        response = self.client.post(
            "/api/mobile/tourism/register-visit/",
            {
                "full_name": "Complete Mobile Tourist",
                "email": "complete@example.com",
                "consent_confirmed": True,
                "contact_number": "09171234567",
                "country_id": country.id,
                "region_id": region.id,
                "province_id": province.id,
                "country_of_origin": "Philippines",
                "arrival_date": "2026-06-01",
                "resort_id": resort.resort_id,
                "itinerary_id": itinerary.id,
                "travel_mode_id": travel_mode.id,
                "boat_type_id": boat_type.id,
                "boat_capacity_fare": "20 pax / PHP 150",
                "parking_space": "Municipal parking",
                "visit_purpose_id": purpose.id,
                "total_visitors": 3,
                "filipino_count": 2,
                "maubanin_count": 1,
                "foreigner_count": 0,
                "total_male": 1,
                "total_female": 2,
                "special_group_count": 1,
                "age_0_7": 1,
                "age_8_59": 2,
                "age_60_above": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        record = TouristRecord.objects.get(full_name="Complete Mobile Tourist")
        self.assertEqual(record.country_of_origin, "Philippines")
        self.assertEqual(record.boat_capacity_fare, "20 pax / PHP 150")
        self.assertEqual(record.parking_space, "Municipal parking")
        self.assertEqual(record.special_group_count, 1)
        self.assertEqual(record.age_0_7, 1)

    def test_mobile_feedback_creates_feedback_entry(self):
        self.client.get("/api/mobile/tourism/bootstrap/")
        resort = Resort.objects.first()

        response = self.client.post(
            "/api/mobile/tourism/feedback/",
            {
                "destination_id": resort.resort_id,
                "reviewer": "Mobile Reviewer",
                "rating": 5,
                "message": "Clean and organized.",
                "cleanliness_rating": 5,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            FeedbackEntry.objects.filter(reviewer="Mobile Reviewer").exists()
        )

    def test_mobile_sanitation_report_creates_complaint(self):
        response = self.client.post(
            "/api/mobile/sanitation/reports/",
            {
                "complainant_name": "Resident Reporter",
                "contact_number": "09170000000",
                "category": "Improper Garbage Disposal",
                "barangay": "Daungan",
                "location_address": "Walkway beside the plaza",
                "description": "Garbage pile near the walkway.",
                "latitude": 14.186,
                "longitude": 121.73,
                "photo_documentation": "sample-photo.jpg",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        complaint = SanitaryComplaint.objects.get(
            complainant_name="Resident Reporter"
        )
        self.assertEqual(complaint.photo_documentation, "sample-photo.jpg")
        self.assertEqual(complaint.status, "pending")

    def test_mobile_sanitation_report_history_needs_contact_and_complaint_id(self):
        submitted = self.client.post(
            "/api/mobile/sanitation/reports/",
            {
                "complainant_name": "Resident Reporter",
                "contact_number": "09170000000",
                "category": "Contaminated Water Source",
                "barangay": "Daungan",
                "location_address": "Deep well, Purok 2",
                "description": "Water source needs inspection.",
            },
            format="json",
        )

        response = self.client.get(
            "/api/mobile/sanitation/reports/history/",
            {"contact": "09170000000", "reference": submitted.json()["complaint_id"]},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "pending")
        self.assertIn("status_label", rows[0])

    def test_mobile_sanitation_permit_verify_by_permit_number(self):
        # Permit numbers are no longer listed publicly; use the known record.
        permit_number = self.establishment.permit_number

        response = self.client.get(
            "/api/mobile/sanitation/permits/verify/",
            {"code": permit_number},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data["verified"])
        self.assertEqual(data["permit"]["permit_number"], permit_number)

    def test_mobile_sanitation_bootstrap_is_public(self):
        response = self.client.get("/api/mobile/sanitation/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn("establishments", data)
        self.assertIn("businessTypes", data)
        self.assertIn("householdRecords", data)
        self.assertIn("barangays", data)

    def test_mobile_sanitation_inspection_creates_establishment_inspection(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.sanitation_token.key}")
        self.client.get("/api/mobile/sanitation/bootstrap/")
        establishment = SanitaryEstablishment.objects.first()

        response = self.client.post(
            "/api/mobile/sanitation/inspections/",
            {
                "establishment": establishment.id,
                "inspector_name": "Mobile Inspector",
                "inspection_date": "2026-06-03",
                "next_due_date": "2026-07-03",
                "findings": "All inspected.",
                "remarks": "For monitoring.",
                "status_after_inspection": "good_standing",
                "checklist_items": [
                    {
                        "requirement_name": "Proper waste disposal system",
                        "is_complied": True,
                        "notes": "",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            SanitaryInspection.objects.filter(
                inspector_name="Mobile Inspector",
                establishment=establishment,
            ).exists()
        )

    def test_mobile_household_survey_creates_household_record(self):
        sanitation_user = User.objects.create_user(
            username="test_mobile_survey_sanitation",
            password="Password@123",
            email="mobile_survey_sanitation@test.local",
        )
        UserProfile.objects.create(user=sanitation_user, role=ROLE_SANITATION)
        token = Token.objects.create(user=sanitation_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.post(
            "/api/mobile/sanitation/household-surveys/",
            {
                "household_head": "Mobile Household",
                "barangay": "Poblacion",
                "address": "Sample Street",
                "male_count": 2,
                "female_count": 3,
                "toilet_type": "none",
                "water_level": "level_1",
                "water_source": "Deep well",
                "waste_disposal": "dumped",
                "remarks": "Needs follow-up inspection.",
                "latitude": 14.186,
                "longitude": 121.73,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        record = HouseholdSanitationRecord.objects.get(
            household_head="Mobile Household"
        )
        self.assertTrue(record.household_code.startswith("HH-"))
        self.assertEqual(record.total_members, 5)
        self.assertEqual(record.status, "violation")


class NotificationViolationTriggerTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create active admin user
        self.admin_user = User.objects.create_user(
            username="notif_test_admin",
            password="Password@123",
            email="admin@test.local",
        )
        UserProfile.objects.create(user=self.admin_user, role=ROLE_ADMIN)

        # Create active sanitation user
        self.sanitation_user = User.objects.create_user(
            username="notif_test_sanitation",
            password="Password@123",
            email="sanitation@test.local",
        )
        UserProfile.objects.create(user=self.sanitation_user, role=ROLE_SANITATION)

        # Authenticate client as sanitation user
        self.token = Token.objects.create(user=self.sanitation_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        # Create test business type and establishment in good_standing
        self.btype = SanitaryBusinessType.objects.create(
            name="Violation Test Bakery",
            inspection_frequency="monthly",
        )
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Sweet Treats Bakery",
            owner_name="Baker Bob",
            business_type=self.btype,
            barangay="Poblacion",
            address="100 Rizal St",
            compliance_status="good_standing",
            permit_status="active",
        )

    def test_inspection_violation_triggers_notifications_and_prevents_duplicates(self):
        # 1. Submit a SanitaryInspection with status_after_inspection="violation" via the actual view
        response = self.client.post(
            "/api/sanitation/inspections/",
            {
                "establishment": self.establishment.id,
                "inspector_name": "Inspector Test",
                "inspection_date": "2026-09-11",
                "status_after_inspection": "violation",
                "findings": "Pest infestation and improper food storage",
                "remarks": "Immediate closure order recommended",
                "checklist_items": [
                    {"requirement_name": "Sanitary Permit", "is_complied": True},
                    {"requirement_name": "Pest Control", "is_complied": False},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        inspection_id = response.json()["id"]

        # a) Assert exactly one Notification exists for the admin user and one for the sanitation user,
        #    both with notification_type="violation_alert"
        admin_notifs = Notification.objects.filter(recipient_user=self.admin_user)
        self.assertEqual(admin_notifs.count(), 1)
        admin_notif = admin_notifs.first()
        self.assertEqual(admin_notif.notification_type, "violation_alert")
        self.assertEqual(admin_notif.severity, "critical")
        self.assertEqual(admin_notif.module, "sanitation")
        self.assertIn("Sweet Treats Bakery", admin_notif.title)

        sanitation_notifs = Notification.objects.filter(recipient_user=self.sanitation_user)
        self.assertEqual(sanitation_notifs.count(), 1)
        sanitation_notif = sanitation_notifs.first()
        self.assertEqual(sanitation_notif.notification_type, "violation_alert")
        self.assertEqual(sanitation_notif.severity, "critical")
        self.assertEqual(sanitation_notif.module, "sanitation")
        self.assertIn("Sweet Treats Bakery", sanitation_notif.title)

        # b) Assert related_object_id matches the establishment's id
        self.assertEqual(admin_notif.related_object_id, str(self.establishment.id))
        self.assertEqual(sanitation_notif.related_object_id, str(self.establishment.id))
        self.assertEqual(admin_notif.related_model, "SanitaryEstablishment")
        self.assertEqual(sanitation_notif.related_model, "SanitaryEstablishment")
        self.assertEqual(admin_notif.action_url, f"/sanitation/establishments/{self.establishment.id}")

        # Refresh establishment to verify its compliance_status is now "violation"
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "violation")

        # c) Calling sync_establishment_after_inspection again with the establishment
        #    already in "violation" status does NOT create additional notifications (no duplicates)
        inspection = SanitaryInspection.objects.get(id=inspection_id)
        from api.services.sanitation import sync_establishment_after_inspection

        sync_establishment_after_inspection(inspection)

        # Assert notification count has NOT increased
        self.assertEqual(Notification.objects.filter(recipient_user=self.admin_user).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient_user=self.sanitation_user).count(), 1)
        self.assertEqual(
            Notification.objects.filter(related_object_id=str(self.establishment.id)).count(),
            2,
        )


class NotificationStaffApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # User A (Admin)
        self.user_a = User.objects.create_user(
            username="notif_api_user_a",
            password="Password@123",
            email="user_a@test.local",
        )
        UserProfile.objects.create(user=self.user_a, role=ROLE_ADMIN)
        self.token_a = Token.objects.create(user=self.user_a)

        # User B (Sanitation)
        self.user_b = User.objects.create_user(
            username="notif_api_user_b",
            password="Password@123",
            email="user_b@test.local",
        )
        UserProfile.objects.create(user=self.user_b, role=ROLE_SANITATION)
        self.token_b = Token.objects.create(user=self.user_b)

        # Create notifications for User A: mix of read/unread and modules
        self.notif_a1 = Notification.objects.create(
            title="User A Sanitation Unread",
            message="Message A1",
            notification_type="violation_alert",
            severity="critical",
            module="sanitation",
            audience_type="user",
            recipient_user=self.user_a,
            is_read=False,
            action_url="/sanitation/establishments/1",
        )
        self.notif_a2 = Notification.objects.create(
            title="User A Tourism Unread",
            message="Message A2",
            notification_type="permit_due",
            severity="warning",
            module="tourism",
            audience_type="user",
            recipient_user=self.user_a,
            is_read=False,
            action_url="/tourism/resorts/1",
        )
        self.notif_a3 = Notification.objects.create(
            title="User A General Read",
            message="Message A3",
            notification_type="system",
            severity="info",
            module="general",
            audience_type="user",
            recipient_user=self.user_a,
            is_read=True,
            read_at=timezone.now(),
            action_url="/general/announcements/1",
        )

        # Create notifications for User B: mix of read/unread and modules
        self.notif_b1 = Notification.objects.create(
            title="User B Sanitation Unread",
            message="Message B1",
            notification_type="violation_alert",
            severity="critical",
            module="sanitation",
            audience_type="user",
            recipient_user=self.user_b,
            is_read=False,
            action_url="/sanitation/establishments/2",
        )
        self.notif_b2 = Notification.objects.create(
            title="User B Tourism Read",
            message="Message B2",
            notification_type="inspection_due",
            severity="warning",
            module="tourism",
            audience_type="user",
            recipient_user=self.user_b,
            is_read=True,
            read_at=timezone.now(),
            action_url="/tourism/resorts/2",
        )

    def test_notification_endpoints_lifecycle(self):
        # Authenticate as User A
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token_a.key}")

        # b) Hits GET /api/notifications/ as user A:
        #    Asserts: only user A's notifications are returned, unread_count matches (2),
        #    and user B's notifications never appear.
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["unread_count"], 2)
        results = data["results"]
        self.assertEqual(len(results), 3)

        result_ids = {r["id"] for r in results}
        self.assertEqual(result_ids, {self.notif_a1.id, self.notif_a2.id, self.notif_a3.id})
        self.assertNotIn(self.notif_b1.id, result_ids)
        self.assertNotIn(self.notif_b2.id, result_ids)

        # Test filter: ?unread_only=true
        res_unread = self.client.get("/api/notifications/?unread_only=true")
        self.assertEqual(res_unread.status_code, status.HTTP_200_OK)
        data_unread = res_unread.json()
        self.assertEqual(data_unread["unread_count"], 2)  # unread_count unchanged by filter
        self.assertEqual(len(data_unread["results"]), 2)
        self.assertEqual({r["id"] for r in data_unread["results"]}, {self.notif_a1.id, self.notif_a2.id})

        # Test filter: ?module=sanitation
        res_module = self.client.get("/api/notifications/?module=sanitation")
        self.assertEqual(res_module.status_code, status.HTTP_200_OK)
        data_module = res_module.json()
        self.assertEqual(data_module["unread_count"], 2)
        self.assertEqual(len(data_module["results"]), 1)
        self.assertEqual(data_module["results"][0]["id"], self.notif_a1.id)

        # c) Hits PATCH /api/notifications/<id>/read/ on one of user A's notifications
        #    and asserts is_read/read_at are set, and unread_count drops by 1 on a follow-up GET.
        patch_res = self.client.patch(f"/api/notifications/{self.notif_a1.id}/read/")
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.notif_a1.refresh_from_db()
        self.assertTrue(self.notif_a1.is_read)
        self.assertIsNotNone(self.notif_a1.read_at)

        # Follow-up GET: unread_count should now be 1
        res_after_read = self.client.get("/api/notifications/")
        self.assertEqual(res_after_read.status_code, status.HTTP_200_OK)
        self.assertEqual(res_after_read.json()["unread_count"], 1)

        # d) Attempts PATCH /api/notifications/<id>/read/ on one of user B's
        #    notification IDs while authenticated as user A, and asserts it returns 404 (not 403)
        cross_res = self.client.patch(f"/api/notifications/{self.notif_b1.id}/read/")
        self.assertEqual(cross_res.status_code, status.HTTP_404_NOT_FOUND)
        self.notif_b1.refresh_from_db()
        self.assertFalse(self.notif_b1.is_read)
        self.assertIsNone(self.notif_b1.read_at)

        # e) Hits POST /api/notifications/mark-all-read/ as user A and
        #    asserts all of user A's notifications are now read and user B's are untouched.
        mark_all_res = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(mark_all_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mark_all_res.json()["updated_count"], 1)  # only notif_a2 was unread

        # All of User A's notifications are now read
        self.assertEqual(
            Notification.objects.filter(recipient_user=self.user_a, is_read=False).count(),
            0,
        )
        self.notif_a2.refresh_from_db()
        self.assertTrue(self.notif_a2.is_read)
        self.assertIsNotNone(self.notif_a2.read_at)

        # User B's notifications remain untouched (notif_b1 still unread)
        self.notif_b1.refresh_from_db()
        self.assertFalse(self.notif_b1.is_read)
        self.assertIsNone(self.notif_b1.read_at)
        self.assertEqual(
            Notification.objects.filter(recipient_user=self.user_b, is_read=False).count(),
            1,
        )


class NotificationDueDateScanningTests(TestCase):
    def setUp(self):
        # Create active admin user
        self.admin_user = User.objects.create_user(
            username="notif_scan_admin",
            password="Password@123",
            email="admin_scan@test.local",
        )
        UserProfile.objects.create(user=self.admin_user, role=ROLE_ADMIN)

        # Create active sanitation user
        self.sanitation_user = User.objects.create_user(
            username="notif_scan_sanitation",
            password="Password@123",
            email="sanitation_scan@test.local",
        )
        UserProfile.objects.create(user=self.sanitation_user, role=ROLE_SANITATION)

        # Business type
        self.btype = SanitaryBusinessType.objects.create(
            name="Due Date Bakery",
            inspection_frequency="monthly",
        )

        # a) Creates an establishment with permit_expiry_date = today + 10 days, has_permit=True
        self.today = timezone.localdate()
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Sunshine Bakery",
            owner_name="Sunny Day",
            business_type=self.btype,
            barangay="Poblacion",
            address="123 Sunny St",
            compliance_status="good_standing",
            permit_status="active",
            has_permit=True,
            permit_expiry_date=self.today + timedelta(days=10),
        )

    def test_due_date_scanning_lifecycle_and_idempotency(self):
        # b) Calls the command (call_command('evaluate_due_notifications')),
        #    asserts exactly one permit_due notification was created for each of the two users,
        #    with related_due_date matching.
        call_command("evaluate_due_notifications")

        admin_notifs = Notification.objects.filter(
            recipient_user=self.admin_user,
            notification_type="permit_due",
        )
        self.assertEqual(admin_notifs.count(), 1)
        admin_notif = admin_notifs.first()
        self.assertEqual(admin_notif.related_due_date, self.today + timedelta(days=10))
        self.assertEqual(admin_notif.related_object_id, str(self.establishment.id))
        self.assertEqual(admin_notif.severity, "warning")
        self.assertEqual(admin_notif.module, "sanitation")

        sanit_notifs = Notification.objects.filter(
            recipient_user=self.sanitation_user,
            notification_type="permit_due",
        )
        self.assertEqual(sanit_notifs.count(), 1)
        sanit_notif = sanit_notifs.first()
        self.assertEqual(sanit_notif.related_due_date, self.today + timedelta(days=10))
        self.assertEqual(sanit_notif.related_object_id, str(self.establishment.id))

        # c) Calls the command AGAIN immediately and asserts no new notifications were created
        #    (still exactly 1 each) — proves idempotency.
        call_command("evaluate_due_notifications")
        self.assertEqual(
            Notification.objects.filter(
                recipient_user=self.admin_user,
                notification_type="permit_due",
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                recipient_user=self.sanitation_user,
                notification_type="permit_due",
            ).count(),
            1,
        )

        # d) Changes the establishment's permit_expiry_date to a new date (simulating a renewal)
        #    and calls the command again — asserts a NEW notification is created (proves idempotency
        #    is keyed to the due date value, not just existence).
        new_expiry_date = self.today + timedelta(days=20)
        self.establishment.permit_expiry_date = new_expiry_date
        self.establishment.save()

        call_command("evaluate_due_notifications")

        admin_notifs_after = Notification.objects.filter(
            recipient_user=self.admin_user,
            notification_type="permit_due",
        )
        self.assertEqual(admin_notifs_after.count(), 2)
        admin_due_dates = set(admin_notifs_after.values_list("related_due_date", flat=True))
        self.assertEqual(admin_due_dates, {self.today + timedelta(days=10), new_expiry_date})

        sanit_notifs_after = Notification.objects.filter(
            recipient_user=self.sanitation_user,
            notification_type="permit_due",
        )
        self.assertEqual(sanit_notifs_after.count(), 2)

        # e) Creates a SanitaryInspection with next_due_date = today + 3 days on an establishment
        #    with compliance_status NOT "violation", calls the command, and asserts an inspection_due
        #    notification was created for each staff user.
        inspection_due_date = self.today + timedelta(days=3)
        SanitaryInspection.objects.create(
            establishment=self.establishment,
            next_due_date=inspection_due_date,
            inspector_name="Inspector Valid",
            inspection_date=self.today,
            status_after_inspection="good_standing",
        )

        call_command("evaluate_due_notifications")

        admin_insp_notifs = Notification.objects.filter(
            recipient_user=self.admin_user,
            notification_type="inspection_due",
            related_object_id=str(self.establishment.id),
        )
        self.assertEqual(admin_insp_notifs.count(), 1)
        self.assertEqual(admin_insp_notifs.first().related_due_date, inspection_due_date)

        sanit_insp_notifs = Notification.objects.filter(
            recipient_user=self.sanitation_user,
            notification_type="inspection_due",
            related_object_id=str(self.establishment.id),
        )
        self.assertEqual(sanit_insp_notifs.count(), 1)
        self.assertEqual(sanit_insp_notifs.first().related_due_date, inspection_due_date)

        # f) Creates a second inspection with next_due_date = today + 3 days but on an
        #    establishment with compliance_status="violation", and asserts NO inspection_due
        #    notification is created for that one (violation already covers it).
        est_violation = SanitaryEstablishment.objects.create(
            business_name="Violating Cafe",
            owner_name="Bad Actor",
            business_type=self.btype,
            barangay="Poblacion",
            address="456 Danger Rd",
            compliance_status="violation",
            permit_status="revoked",
        )
        SanitaryInspection.objects.create(
            establishment=est_violation,
            next_due_date=inspection_due_date,
            inspector_name="Inspector Strict",
            inspection_date=self.today,
            status_after_inspection="violation",
        )

        call_command("evaluate_due_notifications")

        self.assertEqual(
            Notification.objects.filter(
                related_object_id=str(est_violation.id),
                notification_type="inspection_due",
            ).count(),
            0,
        )

        # g) Overdue Permit: establishment with permit_expiry_date = today - 5 days, has_permit=True
        expired_date = self.today - timedelta(days=5)
        est_expired = SanitaryEstablishment.objects.create(
            business_name="Expired Permit Diner",
            owner_name="Late Larry",
            business_type=self.btype,
            barangay="Poblacion",
            address="789 Overdue Ave",
            compliance_status="good_standing",
            permit_status="active",
            has_permit=True,
            permit_expiry_date=expired_date,
        )

        call_command("evaluate_due_notifications")

        admin_expired_notifs = Notification.objects.filter(
            recipient_user=self.admin_user,
            notification_type="permit_due",
            related_object_id=str(est_expired.id),
        )
        self.assertEqual(admin_expired_notifs.count(), 1)
        admin_expired = admin_expired_notifs.first()
        self.assertEqual(admin_expired.severity, "critical")
        self.assertEqual(admin_expired.related_due_date, expired_date)
        self.assertIn("EXPIRED", admin_expired.message)

        sanit_expired_notifs = Notification.objects.filter(
            recipient_user=self.sanitation_user,
            notification_type="permit_due",
            related_object_id=str(est_expired.id),
        )
        self.assertEqual(sanit_expired_notifs.count(), 1)
        sanit_expired = sanit_expired_notifs.first()
        self.assertEqual(sanit_expired.severity, "critical")
        self.assertEqual(sanit_expired.related_due_date, expired_date)

        # h) Overdue Inspection: inspection with next_due_date = today - 2 days on a non-violation establishment
        overdue_insp_date = self.today - timedelta(days=2)
        est_overdue_insp = SanitaryEstablishment.objects.create(
            business_name="Overdue Inspection Cafe",
            owner_name="Forgetful Fred",
            business_type=self.btype,
            barangay="Poblacion",
            address="321 Tardy Rd",
            compliance_status="good_standing",
            permit_status="active",
        )
        SanitaryInspection.objects.create(
            establishment=est_overdue_insp,
            next_due_date=overdue_insp_date,
            inspector_name="Inspector Check",
            inspection_date=self.today - timedelta(days=30),
            status_after_inspection="good_standing",
        )

        call_command("evaluate_due_notifications")

        admin_overdue_insp = Notification.objects.filter(
            recipient_user=self.admin_user,
            notification_type="inspection_due",
            related_object_id=str(est_overdue_insp.id),
        )
        self.assertEqual(admin_overdue_insp.count(), 1)
        admin_oi = admin_overdue_insp.first()
        self.assertEqual(admin_oi.severity, "critical")
        self.assertEqual(admin_oi.related_due_date, overdue_insp_date)
        self.assertIn("OVERDUE", admin_oi.message)

        sanit_overdue_insp = Notification.objects.filter(
            recipient_user=self.sanitation_user,
            notification_type="inspection_due",
            related_object_id=str(est_overdue_insp.id),
        )
        self.assertEqual(sanit_overdue_insp.count(), 1)
        sanit_oi = sanit_overdue_insp.first()
        self.assertEqual(sanit_oi.severity, "critical")
        self.assertEqual(sanit_oi.related_due_date, overdue_insp_date)

        # i) Confirm the original in-window (future due date) cases still have severity="warning" (not critical)
        self.assertEqual(admin_notif.severity, "warning")
        self.assertEqual(sanit_notif.severity, "warning")
        self.assertEqual(admin_insp_notifs.first().severity, "warning")
        self.assertEqual(sanit_insp_notifs.first().severity, "warning")


class NotificationPublicAdvisoryApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(
            username="notif_pub_admin",
            password="Password@123",
            email="pub_admin@test.local",
        )
        UserProfile.objects.create(user=self.admin_user, role=ROLE_ADMIN)
        self.admin_token = Token.objects.create(user=self.admin_user)

        self.tourism_user = User.objects.create_user(
            username="notif_pub_tourism",
            password="Password@123",
            email="pub_tourism@test.local",
        )
        UserProfile.objects.create(user=self.tourism_user, role=ROLE_TOURISM)
        self.tourism_token = Token.objects.create(user=self.tourism_user)

        self.sanitation_user = User.objects.create_user(
            username="notif_pub_sanit",
            password="Password@123",
            email="pub_sanit@test.local",
        )
        UserProfile.objects.create(user=self.sanitation_user, role=ROLE_SANITATION)
        self.sanitation_token = Token.objects.create(user=self.sanitation_user)

        self.establishment_user = User.objects.create_user(
            username="notif_pub_est",
            password="Password@123",
            email="pub_est@test.local",
        )
        UserProfile.objects.create(user=self.establishment_user, role=ROLE_ESTABLISHMENT)
        self.establishment_token = Token.objects.create(user=self.establishment_user)

    def test_establishment_role_cannot_post_advisory(self):
        """a) Asserts a user with role 'establishment' gets 403 on POST."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.establishment_token.key}")
        response = self.client.post(
            "/api/notifications/public/",
            {
                "title": "Establishment Advisory",
                "message": "Should not be allowed",
                "module": "general",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            Notification.objects.filter(title="Establishment Advisory").count(),
            0,
        )

    def test_tourism_role_can_create_advisory(self):
        """b) Asserts a user with role 'tourism' CAN create an advisory."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")
        payload = {
            "title": "Storm Warning Advisory",
            "message": "Heavy rains expected. Tourism activities suspended.",
            "module": "tourism",
            "severity": "warning",
        }
        response = self.client.post(
            "/api/notifications/public/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertEqual(data["title"], payload["title"])
        self.assertEqual(data["message"], payload["message"])
        self.assertEqual(data["module"], "tourism")
        self.assertEqual(data["severity"], "warning")
        self.assertEqual(data["notification_type"], "public_advisory")
        self.assertTrue(data["is_active"])

        # Responses must NOT include recipient_user, target_role, is_read, read_at
        self.assertNotIn("recipient_user", data)
        self.assertNotIn("target_role", data)
        self.assertNotIn("is_read", data)
        self.assertNotIn("read_at", data)

        # Confirm in DB
        advisory = Notification.objects.get(title=payload["title"])
        self.assertEqual(advisory.audience_type, "public")
        self.assertEqual(advisory.notification_type, "public_advisory")
        self.assertIsNone(advisory.recipient_user)
        self.assertEqual(advisory.target_role, "")
        self.assertTrue(advisory.is_active)

    def test_unauthenticated_get_only_sees_active_non_expired(self):
        """
        c) Asserts an unauthenticated GET only sees is_active=True, non-expired advisories
        (create one expired, one inactive, one valid — confirm only the valid one appears).
        """
        now = timezone.now()

        valid_advisory = Notification.objects.create(
            title="Valid Advisory",
            message="Valid message",
            notification_type="public_advisory",
            audience_type="public",
            module="general",
            is_active=True,
            expires_at=now + timedelta(days=2),
        )
        expired_advisory = Notification.objects.create(
            title="Expired Advisory",
            message="Expired message",
            notification_type="public_advisory",
            audience_type="public",
            module="general",
            is_active=True,
            expires_at=now - timedelta(days=2),
        )
        inactive_advisory = Notification.objects.create(
            title="Inactive Advisory",
            message="Inactive message",
            notification_type="public_advisory",
            audience_type="public",
            module="general",
            is_active=False,
            expires_at=now + timedelta(days=2),
        )

        self.client.credentials()  # Unauthenticated
        response = self.client.get("/api/notifications/public/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], valid_advisory.id)
        self.assertEqual(results[0]["title"], "Valid Advisory")

        # Also confirm an establishment user gets the same public view
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.establishment_token.key}")
        est_response = self.client.get("/api/notifications/public/")
        self.assertEqual(est_response.status_code, status.HTTP_200_OK)
        self.assertIn("results", est_response.data)
        est_results = est_response.data["results"]
        self.assertEqual(len(est_results), 1)
        self.assertEqual(est_results[0]["id"], valid_advisory.id)

    def test_authenticated_admin_get_sees_all_advisories(self):
        """
        d) Asserts an authenticated admin GET sees all three (active, inactive, and expired)
        in the management view.
        """
        now = timezone.now()

        valid = Notification.objects.create(
            title="Active Valid Advisory",
            message="Valid",
            notification_type="public_advisory",
            audience_type="public",
            module="sanitation",
            is_active=True,
            expires_at=now + timedelta(days=5),
        )
        expired = Notification.objects.create(
            title="Expired Advisory",
            message="Expired",
            notification_type="public_advisory",
            audience_type="public",
            module="tourism",
            is_active=True,
            expires_at=now - timedelta(days=1),
        )
        inactive = Notification.objects.create(
            title="Inactive Advisory",
            message="Inactive",
            notification_type="public_advisory",
            audience_type="public",
            module="general",
            is_active=False,
            expires_at=now + timedelta(days=10),
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        response = self.client.get("/api/notifications/public/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        results = response.data["results"]
        self.assertEqual(len(results), 3)
        returned_ids = {item["id"] for item in results}
        self.assertEqual(returned_ids, {valid.id, expired.id, inactive.id})

        # Test module filter for staff
        tourism_resp = self.client.get("/api/notifications/public/?module=tourism")
        self.assertEqual(tourism_resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", tourism_resp.data)
        self.assertEqual(len(tourism_resp.data["results"]), 1)
        self.assertEqual(tourism_resp.data["results"][0]["id"], expired.id)

    def test_patch_deactivates_without_deleting(self):
        """
        e) Asserts PATCH with is_active=False removes it from the public
        unauthenticated view but the row still exists in the DB
        (query it directly to confirm it wasn't deleted).
        """
        advisory = Notification.objects.create(
            title="Water Quality Advisory",
            message="Boil water advisory in effect",
            notification_type="public_advisory",
            audience_type="public",
            module="sanitation",
            is_active=True,
        )

        # Authenticated staff (sanitation) deactivates it
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.sanitation_token.key}")
        patch_resp = self.client.patch(
            f"/api/notifications/public/{advisory.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertFalse(patch_resp.data["is_active"])

        # Row still exists in DB
        advisory.refresh_from_db()
        self.assertFalse(advisory.is_active)
        self.assertTrue(Notification.objects.filter(id=advisory.id).exists())

        # Unauthenticated GET no longer sees it
        self.client.credentials()
        get_resp = self.client.get("/api/notifications/public/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", get_resp.data)
        ids = [item["id"] for item in get_resp.data["results"]]
        self.assertNotIn(advisory.id, ids)

    def test_patch_non_public_advisory_returns_404(self):
        """
        f) Asserts PATCH on a non-public_advisory notification id (e.g. one
        created by notify_violation) returns 404, not 200 — this
        endpoint must not be able to edit staff notifications.
        """
        staff_notif = Notification.objects.create(
            title="Internal Violation Warning",
            message="Internal alert for inspector",
            notification_type="violation_alert",
            audience_type="user",
            recipient_user=self.admin_user,
            module="sanitation",
            is_active=True,
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")
        patch_resp = self.client.patch(
            f"/api/notifications/public/{staff_notif.id}/",
            {"title": "Tampered Title", "is_active": False},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_404_NOT_FOUND)

        staff_notif.refresh_from_db()
        self.assertEqual(staff_notif.title, "Internal Violation Warning")
        self.assertTrue(staff_notif.is_active)

    def test_user_without_profile_gets_403(self):
        """Asserts a user with no profile gets 403 on POST."""
        user_no_profile = User.objects.create_user(
            username="user_no_profile",
            password="Password@123",
            email="no_profile@test.local",
        )
        token = Token.objects.create(user=user_no_profile)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post(
            "/api/notifications/public/",
            {"title": "Test", "message": "Test", "module": "general"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MobileSanitationAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create active admin user
        self.admin_user = User.objects.create_user(
            username="test_admin_auth",
            password="Password@123",
            email="admin_auth@test.local",
        )
        UserProfile.objects.create(user=self.admin_user, role=ROLE_ADMIN)

        # Create active sanitation user
        self.sanitation_user = User.objects.create_user(
            username="test_sanitation_auth",
            password="Password@123",
            email="sanitation_auth@test.local",
        )
        UserProfile.objects.create(user=self.sanitation_user, role=ROLE_SANITATION)
        self.sanitation_token = Token.objects.create(user=self.sanitation_user)

        # Create active establishment user
        self.establishment_user = User.objects.create_user(
            username="test_establishment_auth",
            password="Password@123",
            email="establishment_auth@test.local",
        )
        UserProfile.objects.create(user=self.establishment_user, role=ROLE_ESTABLISHMENT)
        self.establishment_token = Token.objects.create(user=self.establishment_user)

        # Create test establishment
        self.btype = SanitaryBusinessType.objects.create(
            name="Auth Test Business",
            inspection_frequency="monthly",
        )
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Auth Test Establishment",
            owner_name="Test Owner",
            business_type=self.btype,
            barangay="Poblacion",
            address="123 Test St",
            compliance_status="good_standing",
            permit_status="active",
        )

        self.inspection_payload = {
            "establishment": self.establishment.id,
            "inspector_name": "Inspector Auth",
            "inspection_date": "2026-09-11",
            "next_due_date": "2026-10-11",
            "findings": "All compliant.",
            "remarks": "Regular inspection.",
            "status_after_inspection": "good_standing",
            "checklist_items": [
                {"requirement_name": "Sanitary Permit", "is_complied": True, "notes": ""}
            ],
        }

        self.survey_payload = {
            "household_head": "Auth Test Household",
            "barangay": "Poblacion",
            "address": "Zone 1",
            "male_count": 2,
            "female_count": 2,
            "toilet_type": "water_sealed",
            "water_level": "level_3",
            "water_source": "MWSS",
            "waste_disposal": "collected",
            "remarks": "Normal condition.",
            "latitude": "14.186",
            "longitude": "121.73",
        }

    def test_unauthenticated_post_returns_401_with_zero_db_writes(self):
        self.client.credentials()  # No auth
        initial_inspections = SanitaryInspection.objects.count()
        initial_surveys = HouseholdSanitationRecord.objects.count()

        # 1. Inspection endpoint
        resp_insp = self.client.post(
            "/api/mobile/sanitation/inspections/",
            self.inspection_payload,
            format="json",
        )
        self.assertEqual(resp_insp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(SanitaryInspection.objects.count(), initial_inspections)

        # 2. Household survey endpoint
        resp_surv = self.client.post(
            "/api/mobile/sanitation/household-surveys/",
            self.survey_payload,
            format="json",
        )
        self.assertEqual(resp_surv.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(HouseholdSanitationRecord.objects.count(), initial_surveys)

    def test_establishment_role_post_returns_403_with_zero_db_writes(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.establishment_token.key}")
        initial_inspections = SanitaryInspection.objects.count()
        initial_surveys = HouseholdSanitationRecord.objects.count()

        # 1. Inspection endpoint
        resp_insp = self.client.post(
            "/api/mobile/sanitation/inspections/",
            self.inspection_payload,
            format="json",
        )
        self.assertEqual(resp_insp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("detail", resp_insp.json())
        self.assertEqual(SanitaryInspection.objects.count(), initial_inspections)

        # 2. Household survey endpoint
        resp_surv = self.client.post(
            "/api/mobile/sanitation/household-surveys/",
            self.survey_payload,
            format="json",
        )
        self.assertEqual(resp_surv.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("detail", resp_surv.json())
        self.assertEqual(HouseholdSanitationRecord.objects.count(), initial_surveys)

    def test_sanitation_role_post_succeeds_201(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.sanitation_token.key}")
        initial_inspections = SanitaryInspection.objects.count()
        initial_surveys = HouseholdSanitationRecord.objects.count()

        # 1. Inspection endpoint
        resp_insp = self.client.post(
            "/api/mobile/sanitation/inspections/",
            self.inspection_payload,
            format="json",
        )
        self.assertEqual(resp_insp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SanitaryInspection.objects.count(), initial_inspections + 1)
        self.assertTrue(
            SanitaryInspection.objects.filter(inspector_name="Inspector Auth").exists()
        )

        # 2. Household survey endpoint
        resp_surv = self.client.post(
            "/api/mobile/sanitation/household-surveys/",
            self.survey_payload,
            format="json",
        )
        self.assertEqual(resp_surv.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HouseholdSanitationRecord.objects.count(), initial_surveys + 1)
        self.assertTrue(
            HouseholdSanitationRecord.objects.filter(household_head="Auth Test Household").exists()
        )


class MobileTourismAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Explicit reference models needed for TouristRecord
        self.country, _ = Country.objects.get_or_create(id=991, defaults={"name": "Philippines"})
        self.region, _ = Region.objects.get_or_create(id=991, defaults={"name": "CALABARZON", "code": "04"})
        self.province, _ = Province.objects.get_or_create(id=991, defaults={"name": "Quezon", "region": self.region, "code": "QUE"})
        self.itinerary, _ = Itinerary.objects.get_or_create(id=991, defaults={"name": "Day Tour"})
        self.travel_mode, _ = TravelMode.objects.get_or_create(id=991, defaults={"name": "Private"})
        self.boat_type, _ = BoatType.objects.get_or_create(id=991, defaults={"name": "Motorized"})
        self.visit_purpose, _ = VisitPurpose.objects.get_or_create(id=991, defaults={"name": "Pleasure / Vacation"})
        self.resort, _ = Resort.objects.get_or_create(
            resort_id=991,
            defaults={
                "resort_name": "Test Auth Resort",
                "type": "beach",
                "location": "Mauban",
                "short_description": "Test",
                "access": "boat",
                "latitude": 14.18,
                "longitude": 121.73,
            },
        )

        # Admin user
        self.admin_user = User.objects.create_user(
            username="test_tourism_admin_auth",
            password="Password@123",
            email="admin_tourism_auth@test.local",
        )
        UserProfile.objects.create(user=self.admin_user, role=ROLE_ADMIN)
        self.admin_token = Token.objects.create(user=self.admin_user)

        # Tourism user
        self.tourism_user = User.objects.create_user(
            username="test_tourism_staff_auth",
            password="Password@123",
            email="staff_tourism_auth@test.local",
        )
        UserProfile.objects.create(user=self.tourism_user, role=ROLE_TOURISM)
        self.tourism_token = Token.objects.create(user=self.tourism_user)

        # Sanitation user
        self.sanitation_user = User.objects.create_user(
            username="test_sanitation_role_auth",
            password="Password@123",
            email="sanitation_role_auth@test.local",
        )
        UserProfile.objects.create(user=self.sanitation_user, role=ROLE_SANITATION)
        self.sanitation_token = Token.objects.create(user=self.sanitation_user)

        # Establishment user
        self.establishment_user = User.objects.create_user(
            username="test_establishment_role_auth",
            password="Password@123",
            email="establishment_role_auth@test.local",
        )
        UserProfile.objects.create(user=self.establishment_user, role=ROLE_ESTABLISHMENT)
        self.establishment_token = Token.objects.create(user=self.establishment_user)

        # Test Tourist Record with sensitive PII
        self.tourist_name = "Jane Sensitive Tourist"
        self.tourist_email = "jane.sensitive@privatemail.local"
        self.tourist_phone = "09179988776"
        self.survey_id = "MOB-SEC-2026-99"

        self.record = TouristRecord.objects.create(
            survey_id=self.survey_id,
            first_name="Jane",
            last_name="Sensitive Tourist",
            full_name=self.tourist_name,
            email=self.tourist_email,
            contact_number=self.tourist_phone,
            country=self.country,
            region=self.region,
            province=self.province,
            arrival_date=timezone.localdate(),
            resort=self.resort,
            itinerary=self.itinerary,
            travel_mode=self.travel_mode,
            boat_type=self.boat_type,
            visit_purpose=self.visit_purpose,
            total_visitors=2,
            filipino_count=2,
            foreigner_count=0,
            total_male=1,
            total_female=1,
            age_8_59=2,
            status="pending",
        )

        self.check_in_payload = {
            "survey_id": self.survey_id,
            "status": "arrived",
            "total_visitors": 2,
            "filipino_count": 2,
            "foreigner_count": 0,
            "total_male": 1,
            "total_female": 1,
            "age_8_59": 2,
        }

    def test_unauthenticated_requests_return_401_and_contain_no_tourist_pii(self):
        self.client.credentials()  # No auth

        # 1. Lookup endpoint
        resp_lookup = self.client.get(
            f"/api/mobile/tourism/records/lookup/?query={self.survey_id}"
        )
        self.assertEqual(resp_lookup.status_code, status.HTTP_401_UNAUTHORIZED)
        lookup_body = resp_lookup.content.decode("utf-8")
        self.assertNotIn(self.tourist_name, lookup_body)
        self.assertNotIn(self.tourist_email, lookup_body)
        self.assertNotIn(self.tourist_phone, lookup_body)

        # 2. Check-in endpoint
        resp_checkin = self.client.post(
            "/api/mobile/tourism/records/check-in/",
            self.check_in_payload,
            format="json",
        )
        self.assertEqual(resp_checkin.status_code, status.HTTP_401_UNAUTHORIZED)
        checkin_body = resp_checkin.content.decode("utf-8")
        self.assertNotIn(self.tourist_name, checkin_body)
        self.assertNotIn(self.tourist_email, checkin_body)
        self.assertNotIn(self.tourist_phone, checkin_body)

        # Verify zero DB mutation on record status
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, "pending")

        # 3. History endpoint
        resp_history = self.client.get(
            f"/api/mobile/tourism/records/history/?search={self.survey_id}"
        )
        self.assertEqual(resp_history.status_code, status.HTTP_401_UNAUTHORIZED)
        history_body = resp_history.content.decode("utf-8")
        self.assertNotIn(self.tourist_name, history_body)
        self.assertNotIn(self.tourist_email, history_body)
        self.assertNotIn(self.tourist_phone, history_body)

    def test_disallowed_roles_return_403_with_zero_db_mutation(self):
        for role_name, token in [
            ("establishment", self.establishment_token),
            ("sanitation", self.sanitation_token),
        ]:
            self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

            # 1. Lookup
            resp_lookup = self.client.get(
                f"/api/mobile/tourism/records/lookup/?query={self.survey_id}"
            )
            self.assertEqual(
                resp_lookup.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Role {role_name} should be rejected with 403 on lookup",
            )
            self.assertIn("detail", resp_lookup.json())

            # 2. Check-in
            resp_checkin = self.client.post(
                "/api/mobile/tourism/records/check-in/",
                self.check_in_payload,
                format="json",
            )
            self.assertEqual(
                resp_checkin.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Role {role_name} should be rejected with 403 on check-in",
            )
            self.assertIn("detail", resp_checkin.json())
            self.record.refresh_from_db()
            self.assertEqual(self.record.status, "pending")

            # 3. History
            resp_history = self.client.get(
                f"/api/mobile/tourism/records/history/?search={self.survey_id}"
            )
            self.assertEqual(
                resp_history.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Role {role_name} should be rejected with 403 on history",
            )
            self.assertIn("detail", resp_history.json())

    def test_tourism_and_admin_roles_succeed(self):
        # 1. Test tourism role succeeds on lookup, check-in, and history
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")

        resp_lookup = self.client.get(
            f"/api/mobile/tourism/records/lookup/?query={self.survey_id}"
        )
        self.assertEqual(resp_lookup.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_lookup.json()["survey_id"], self.survey_id)
        self.assertEqual(resp_lookup.json()["full_name"], self.tourist_name)

        resp_checkin = self.client.post(
            "/api/mobile/tourism/records/check-in/",
            self.check_in_payload,
            format="json",
        )
        self.assertEqual(resp_checkin.status_code, status.HTTP_200_OK)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, BOOKING_STATUS_ARRIVED)

        resp_history = self.client.get(
            f"/api/mobile/tourism/records/history/?search={self.survey_id}"
        )
        self.assertEqual(resp_history.status_code, status.HTTP_200_OK)
        records = resp_history.json().get("records", [])
        self.assertTrue(any(r["survey_id"] == self.survey_id for r in records))

        # 2. Test admin role also succeeds
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        resp_admin_lookup = self.client.get(
            f"/api/mobile/tourism/records/lookup/?query={self.survey_id}"
        )
        self.assertEqual(resp_admin_lookup.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_admin_lookup.json()["survey_id"], self.survey_id)


class MobileBootstrapNotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # 1. Active public advisories
        self.tourism_advisory = Notification.objects.create(
            title="Tourism Advisory Test",
            message="Active public advisory for tourists",
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            module=NOTIFICATION_MODULE_TOURISM,
            is_active=True,
        )
        self.sanitation_advisory = Notification.objects.create(
            title="Sanitation Advisory Test",
            message="Active public advisory for sanitation",
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            module=NOTIFICATION_MODULE_SANITATION,
            is_active=True,
        )

        # 2. Inactive advisory and expired advisory
        self.inactive_advisory = Notification.objects.create(
            title="Inactive Advisory",
            message="Should not appear in bootstrap",
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            module=NOTIFICATION_MODULE_TOURISM,
            is_active=False,
        )
        self.expired_advisory = Notification.objects.create(
            title="Expired Advisory",
            message="Should not appear in bootstrap",
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            module=NOTIFICATION_MODULE_TOURISM,
            is_active=True,
            expires_at=now - timedelta(days=1),
        )

    def test_mobile_tourism_bootstrap_dynamic_advisories(self):
        resp = self.client.get("/api/mobile/tourism/bootstrap/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        notifications = resp.json().get("notifications", [])
        notif_ids = [n["id"] for n in notifications]

        # Includes active tourism advisory
        self.assertIn(f"advisory-{self.tourism_advisory.id}", notif_ids)

        # Does NOT include sanitation advisory, inactive advisory, or expired advisory
        self.assertNotIn(f"advisory-{self.sanitation_advisory.id}", notif_ids)
        self.assertNotIn(f"advisory-{self.inactive_advisory.id}", notif_ids)
        self.assertNotIn(f"advisory-{self.expired_advisory.id}", notif_ids)

    def test_mobile_sanitation_bootstrap_dynamic_advisories(self):
        resp = self.client.get("/api/mobile/sanitation/bootstrap/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        notifications = resp.json().get("notifications", [])
        notif_ids = [n["id"] for n in notifications]

        # Includes active sanitation advisory
        self.assertIn(f"advisory-{self.sanitation_advisory.id}", notif_ids)

        # Does NOT include tourism-only advisory, inactive advisory, or expired advisory
        self.assertNotIn(f"advisory-{self.tourism_advisory.id}", notif_ids)
        self.assertNotIn(f"advisory-{self.inactive_advisory.id}", notif_ids)
        self.assertNotIn(f"advisory-{self.expired_advisory.id}", notif_ids)


class NotificationWebhookCronTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/notifications/evaluate-due/"
        self.secret = "super_secret_cron_key_987"

    @patch("api.views.notifications.config")
    def test_post_without_key_returns_403(self, mock_config):
        mock_config.side_effect = lambda key, default="": self.secret if key == "CRON_SECRET_KEY" else default
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json()["detail"], "Invalid or missing cron key.")

    @patch("api.views.notifications.config")
    def test_post_with_invalid_key_returns_403(self, mock_config):
        mock_config.side_effect = lambda key, default="": self.secret if key == "CRON_SECRET_KEY" else default
        resp = self.client.post(self.url, HTTP_X_CRON_KEY="wrong_secret")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json()["detail"], "Invalid or missing cron key.")

    @patch("api.views.notifications.config")
    def test_post_with_valid_key_triggers_evaluation_and_returns_200(self, mock_config):
        mock_config.side_effect = lambda key, default="": self.secret if key == "CRON_SECRET_KEY" else default

        # Test with X-Cron-Key header
        resp1 = self.client.post(self.url, HTTP_X_CRON_KEY=self.secret)
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)
        self.assertEqual(resp1.json()["status"], "success")
        self.assertEqual(resp1.json()["message"], "Due notifications evaluated.")

        # Test with Authorization Bearer header
        resp2 = self.client.post(self.url, HTTP_AUTHORIZATION=f"Bearer {self.secret}")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(resp2.json()["status"], "success")
        self.assertEqual(resp2.json()["message"], "Due notifications evaluated.")

    @patch("api.views.notifications.config")
    def test_post_when_unconfigured_returns_503(self, mock_config):
        mock_config.side_effect = lambda key, default="": "" if key == "CRON_SECRET_KEY" else default
        resp = self.client.post(self.url, HTTP_X_CRON_KEY="some_key")
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(resp.json()["detail"], "Cron trigger is not configured on this server.")


class SanitaryStaffApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Admin user
        self.admin = User.objects.create_user(
            username="sanitary_superadmin",
            password="Password@123",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin, role=ROLE_ADMIN)
        self.admin_token, _ = Token.objects.get_or_create(user=self.admin)

        # Existing staff inspector
        self.inspector = User.objects.create_user(
            username="inspector_santos",
            password="Password@123",
            first_name="Maria",
            last_name="Santos",
            email="maria.santos@mauban.gov.ph",
            is_staff=True,
            is_active=True,
        )
        UserProfile.objects.create(user=self.inspector, role=ROLE_SANITATION)
        self.inspector_token, _ = Token.objects.get_or_create(user=self.inspector)

        # Tourist user
        self.tourist = User.objects.create_user(
            username="tourist_guest",
            password="Password@123",
        )
        UserProfile.objects.create(user=self.tourist, role=ROLE_TOURISM)
        self.tourist_token, _ = Token.objects.get_or_create(user=self.tourist)

    def test_get_staff_list(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        response = self.client.get("/api/v1/sanitation/staff/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in response.json()]
        self.assertIn("inspector_santos", usernames)

    def test_create_staff_success(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        payload = {
            "first_name": "Juan",
            "last_name": "Dela Cruz",
            "username": "inspector_juan",
            "password": "SecurePassword@123",
            "email": "juan.cruz@mauban.gov.ph",
        }
        response = self.client.post("/api/v1/sanitation/staff/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["username"], "inspector_juan")
        self.assertEqual(data["first_name"], "Juan")
        self.assertEqual(data["last_name"], "Dela Cruz")
        self.assertEqual(data["role"], ROLE_SANITATION)
        self.assertTrue(data["is_active"])

        # Check in DB
        created_user = User.objects.get(username="inspector_juan")
        self.assertTrue(created_user.check_password("SecurePassword@123"))
        self.assertTrue(created_user.is_staff)
        self.assertEqual(created_user.profile.role, ROLE_SANITATION)

    def test_create_staff_validation_errors(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        # Missing fields
        resp = self.client.post("/api/v1/sanitation/staff/", {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Password too short
        resp = self.client.post("/api/v1/sanitation/staff/", {
            "first_name": "Test",
            "last_name": "User",
            "username": "test_short",
            "password": "123",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("at least 6 characters", resp.json()["detail"])

        # Duplicate username
        resp = self.client.post("/api/v1/sanitation/staff/", {
            "first_name": "Maria",
            "last_name": "Santos",
            "username": "inspector_santos",
            "password": "Password@123",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already in use", resp.json()["detail"])

    def test_toggle_staff_status(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        # Deactivate
        resp = self.client.patch(
            f"/api/v1/sanitation/staff/{self.inspector.pk}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.json()["is_active"])
        self.inspector.refresh_from_db()
        self.assertFalse(self.inspector.is_active)

        # Reactivate
        resp = self.client.patch(
            f"/api/v1/sanitation/staff/{self.inspector.pk}/",
            {"is_active": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["is_active"])
        self.inspector.refresh_from_db()
        self.assertTrue(self.inspector.is_active)

    def test_prevent_self_deactivation(self):
        # Admin cannot deactivate self if admin user was targeted
        admin_profile = self.admin.profile
        admin_profile.role = ROLE_SANITATION
        admin_profile.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        resp = self.client.patch(
            f"/api/v1/sanitation/staff/{self.admin.pk}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot deactivate your own", resp.json()["detail"])

    def test_unauthorized_access(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourist_token.key}")
        resp = self.client.get("/api/v1/sanitation/staff/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


from django.core.files.uploadedfile import SimpleUploadedFile
from api.services.upload import (
    MAX_FILE_SIZE_BYTES,
    StorageServiceError,
    UploadValidationError,
    save_image_file,
    validate_image_file,
)


class SecureUploadTests(TestCase):
    def setUp(self):
        ensure_test_barangays()
        self.client = APIClient()
        self.tourism_user = User.objects.create_user(
            username="tourism_staff_upload",
            password="Password@123",
            is_staff=True,
        )
        UserProfile.objects.create(user=self.tourism_user, role=ROLE_TOURISM)
        self.tourism_token, _ = Token.objects.get_or_create(user=self.tourism_user)

        self.inspector_user = User.objects.create_user(
            username="inspector_upload",
            password="Password@123",
            is_staff=True,
        )
        UserProfile.objects.create(user=self.inspector_user, role=ROLE_SANITATION)
        self.inspector_token, _ = Token.objects.get_or_create(user=self.inspector_user)

    def test_validate_image_file_valid_types(self):
        jpg_file = SimpleUploadedFile("photo.jpg", b"fake jpg content", content_type="image/jpeg")
        self.assertEqual(validate_image_file(jpg_file), ".jpg")

        upper_jpg = SimpleUploadedFile("PHOTO.JPG", b"fake jpg content", content_type="image/jpeg")
        self.assertEqual(validate_image_file(upper_jpg), ".jpg")

        jpeg_file = SimpleUploadedFile("photo.JPEG", b"fake jpeg content", content_type="image/jpeg")
        self.assertEqual(validate_image_file(jpeg_file), ".jpg")

        png_file = SimpleUploadedFile("photo.png", b"fake png content", content_type="image/png")
        self.assertEqual(validate_image_file(png_file), ".png")

        webp_file = SimpleUploadedFile("photo.webp", b"fake webp content", content_type="image/webp")
        self.assertEqual(validate_image_file(webp_file), ".webp")

        heic_file = SimpleUploadedFile("photo.heic", b"fake heic content", content_type="image/heic")
        self.assertEqual(validate_image_file(heic_file), ".heic")

        heif_file = SimpleUploadedFile("photo.HEIF", b"fake heif content", content_type="image/heif")
        self.assertEqual(validate_image_file(heif_file), ".heic")

        octet_jpg = SimpleUploadedFile("photo.jpg", b"fake binary", content_type="application/octet-stream")
        self.assertEqual(validate_image_file(octet_jpg), ".jpg")

        octet_no_ext = SimpleUploadedFile("camera_raw", b"fake binary", content_type="application/octet-stream")
        self.assertEqual(validate_image_file(octet_no_ext), ".jpg")

    def test_validate_image_file_oversized(self):
        large_content = b"0" * (MAX_FILE_SIZE_BYTES + 1)
        oversized = SimpleUploadedFile("big.jpg", large_content, content_type="image/jpeg")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_image_file(oversized)
        self.assertEqual(str(ctx.exception), "File size exceeds 5MB limit.")

    def test_validate_image_file_disallowed_type(self):
        pdf_file = SimpleUploadedFile("doc.pdf", b"%PDF-1.4...", content_type="application/pdf")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_image_file(pdf_file)
        self.assertEqual(str(ctx.exception), "Only JPG, PNG, and WebP images are allowed.")

        exe_file = SimpleUploadedFile("malware.exe", b"MZ...", content_type="image/jpeg")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_image_file(exe_file)
        self.assertEqual(str(ctx.exception), "Only JPG, PNG, and WebP images are allowed.")

    def test_save_image_file_generates_uuid_name(self):
        test_file = SimpleUploadedFile("my vacation photo.JPG", b"sample-bytes", content_type="image/jpeg")
        url = save_image_file(test_file, "resorts")
        self.assertIn("resorts/", url)
        self.assertNotIn("my vacation photo", url)
        self.assertTrue(url.endswith(".jpg"))

    def test_save_image_file_storage_error_raises_503_exception(self):
        test_file = SimpleUploadedFile("photo.png", b"sample-bytes", content_type="image/png")
        with patch("api.services.upload.default_storage.save", side_effect=IOError("Storage quota exceeded")):
            with self.assertRaises(StorageServiceError) as ctx:
                save_image_file(test_file, "resorts")
            self.assertEqual(str(ctx.exception), "Image upload failed. Storage service unavailable or full.")

    def test_resort_image_upload_endpoint_success(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")
        test_file = SimpleUploadedFile("resort_view.png", b"image-content", content_type="image/png")
        response = self.client.post("/api/resorts/upload-image/", {"image": test_file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("url", response.json())
        self.assertIn("resorts/", response.json()["url"])

    def test_resort_image_upload_endpoint_oversized_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")
        oversized = SimpleUploadedFile("huge.png", b"0" * (MAX_FILE_SIZE_BYTES + 1), content_type="image/png")
        response = self.client.post("/api/resorts/upload-image/", {"image": oversized}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["error"], "File size exceeds 5MB limit.")

    def test_resort_image_upload_endpoint_invalid_type_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")
        bad_file = SimpleUploadedFile("document.pdf", b"pdf-data", content_type="application/pdf")
        response = self.client.post("/api/resorts/upload-image/", {"image": bad_file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["error"], "Only JPG, PNG, and WebP images are allowed.")

    def test_resort_image_upload_endpoint_storage_failure_503(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tourism_token.key}")
        test_file = SimpleUploadedFile("resort.jpg", b"image-data", content_type="image/jpeg")
        with patch("api.services.upload.default_storage.save", side_effect=Exception("S3 Connection Timeout")):
            response = self.client.post("/api/resorts/upload-image/", {"image": test_file}, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertEqual(response.json()["error"], "Image upload failed. Storage service unavailable or full.")

    def test_mobile_sanitation_report_upload_validation(self):
        bad_file = SimpleUploadedFile("evidence.pdf", b"pdf-data", content_type="application/pdf")
        response = self.client.post(
            "/api/mobile/sanitation/reports/",
            {
                "complainant_name": "Upload Tester",
                "contact_number": "09171234567",
                "category": "Improper Garbage Disposal",
                "barangay": "Daungan",
                "location_address": "Creek bank, Purok 1",
                "description": "Garbage dump near creek",
                "photo": bad_file,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["error"], "Only JPG, PNG, and WebP images are allowed.")

    def test_mobile_sanitation_report_storage_failure_503(self):
        good_file = SimpleUploadedFile("trash.jpg", b"image-data", content_type="image/jpeg")
        with patch("api.services.upload.default_storage.save", side_effect=Exception("S3 Storage Bucket Full")):
            response = self.client.post(
                "/api/mobile/sanitation/reports/",
                {
                    "complainant_name": "Upload Tester",
                    "contact_number": "09171234567",
                    "category": "Improper Garbage Disposal",
                    "barangay": "Daungan",
                "location_address": "Creek bank, Purok 1",
                    "description": "Garbage dump near creek",
                    "photo": good_file,
                },
                format="multipart",
            )
            self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertEqual(response.json()["error"], "Image upload failed. Storage service unavailable or full.")


class PublicBoatRenameMigrationTests(TestCase):
    OLD = "Public Boat (P100/ride/head) Sabang Port Only"
    NEW = "Public Boat"

    def setUp(self):
        import importlib

        self.migration = importlib.import_module(
            "api.migrations.0033_rename_public_boat_type"
        )

    def _forward(self):
        from io import StringIO
        from contextlib import redirect_stdout
        from django.apps import apps

        out = StringIO()
        with redirect_stdout(out):
            self.migration.rename_public_boat_forward(apps, None)
        return out.getvalue()

    def _reverse(self):
        from io import StringIO
        from contextlib import redirect_stdout
        from django.apps import apps

        out = StringIO()
        with redirect_stdout(out):
            self.migration.rename_public_boat_reverse(apps, None)
        return out.getvalue()

    def test_renames_only_the_old_public_boat_row_and_keeps_its_id(self):
        BoatType.objects.create(id=901, name=self.OLD)
        BoatType.objects.create(id=902, name="Private Boat (Rates depend on the capacity)")
        BoatType.objects.create(id=903, name="2.0")

        self._forward()

        self.assertEqual(BoatType.objects.get(id=901).name, self.NEW)
        self.assertEqual(
            BoatType.objects.get(id=902).name,
            "Private Boat (Rates depend on the capacity)",
        )
        self.assertEqual(BoatType.objects.get(id=903).name, "2.0")
        self.assertEqual(BoatType.objects.count(), 3)

    def test_skips_with_warning_when_public_boat_already_exists(self):
        BoatType.objects.create(id=901, name=self.OLD)
        BoatType.objects.create(id=902, name=self.NEW)

        output = self._forward()

        self.assertIn("WARNING", output)
        self.assertEqual(BoatType.objects.get(id=901).name, self.OLD)
        self.assertEqual(BoatType.objects.get(id=902).name, self.NEW)
        self.assertEqual(BoatType.objects.filter(name=self.NEW).count(), 1)
        self.assertEqual(BoatType.objects.count(), 2)

    def test_does_nothing_when_old_row_is_absent(self):
        BoatType.objects.create(id=901, name="Speedboat")

        self._forward()

        self.assertEqual(list(BoatType.objects.values_list("name", flat=True)), ["Speedboat"])

    def test_reverse_restores_the_old_name(self):
        BoatType.objects.create(id=901, name=self.OLD)
        self._forward()
        self.assertEqual(BoatType.objects.get(id=901).name, self.NEW)

        self._reverse()

        self.assertEqual(BoatType.objects.get(id=901).name, self.OLD)
        self.assertEqual(BoatType.objects.count(), 1)

    def test_reverse_skips_when_old_name_already_exists(self):
        BoatType.objects.create(id=901, name=self.OLD)
        BoatType.objects.create(id=902, name=self.NEW)

        output = self._reverse()

        self.assertIn("WARNING", output)
        self.assertEqual(BoatType.objects.get(id=901).name, self.OLD)
        self.assertEqual(BoatType.objects.get(id=902).name, self.NEW)



class _ProductionBoatRows:
    """The seven boat rows production has before 0045, plus record helpers."""

    PRIVATE_OLD = "Private Boat (Rates depend on the capacity)"
    FARE = "1-2 pax (One-Way P1500, Two-way P2000)"
    PRODUCTION_ROWS = {
        1: "Public Boat",
        2: PRIVATE_OLD,
        3: "Boat Provided by Resort (As confirmed by both guests and resort)",
        4: "2.0",
        5: "Motorized Banca",
        6: "Speedboat",
        7: "Passenger Boat",
    }
    # Sheet text, old wording and new, and the row each must land on.
    IMPORT_CELLS = {
        "Public Boat": 1,
        "  public boat (sabang)  ": 1,
        "Tourist Boat": 1,
        "": 1,
        "Private Boat": 2,
        PRIVATE_OLD: 2,
        "passenger boat": 2,
        "Boat provided by resort": 2,
        "Boat Provided by Resort (As confirmed by both guests and resort)": 2,
    }

    def setUp(self):
        ensure_test_reference_tables()
        BoatType.objects.all().delete()
        for boat_id, name in self.PRODUCTION_ROWS.items():
            BoatType.objects.create(id=boat_id, name=name)

    def _record(self, survey_id, boat_type_id, fare=""):
        return TouristRecord.objects.create(
            survey_id=survey_id,
            full_name="Boat Test Group",
            contact_number="09170000000",
            country=Country.objects.first(),
            region=Region.objects.first(),
            province=Province.objects.first(),
            arrival_date="2026-04-02",
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type_id=boat_type_id,
            boat_capacity_fare=fare,
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=4,
            filipino_count=4,
            total_male=2,
            total_female=2,
            age_8_59=4,
            status="arrived",
        )

    def _run(self, function):
        from io import StringIO
        from contextlib import redirect_stdout
        from django.apps import apps

        out = StringIO()
        with redirect_stdout(out):
            function(apps, None)
        return out.getvalue()

    def _names(self):
        return dict(BoatType.objects.values_list("id", "name"))

    def _resolve(self, cells):
        from .services.online_booking import ReferenceResolver, resolve_boat_type

        resolver = ReferenceResolver(commit=False)
        return {cell: resolve_boat_type(resolver, cell) for cell in cells}

    def assert_import_lands_on_rows_1_and_2(self):
        rows_before = BoatType.objects.count()

        resolved = self._resolve(self.IMPORT_CELLS)

        self.assertEqual({cell: item.id for cell, item in resolved.items()}, self.IMPORT_CELLS)
        self.assertTrue(all(not item._state.adding for item in resolved.values()))
        self.assertEqual(BoatType.objects.count(), rows_before)


class BoatCapacityFareFlagTests(_ProductionBoatRows, TestCase):
    """0044 puts the capacity-fare rule on the row; the import maps by id."""

    def setUp(self):
        import importlib

        super().setUp()
        self.flag_migration = importlib.import_module(
            "api.migrations.0044_boattype_requires_capacity_fare"
        )

    def test_flag_migration_sets_only_the_tourist_boat(self):
        self._run(self.flag_migration.flag_tourist_boat)

        self.assertEqual(
            list(BoatType.objects.filter(requires_capacity_fare=True).values_list("id", flat=True)),
            [1],
        )
        self.assertEqual(self._names(), self.PRODUCTION_ROWS)

    def test_import_maps_old_and_new_names_while_the_old_names_are_stored(self):
        self.assert_import_lands_on_rows_1_and_2()

    def test_import_still_creates_a_row_for_unrecognised_text(self):
        item = self._resolve(["3.0"])["3.0"]

        self.assertTrue(item._state.adding)
        self.assertEqual(item.name, "3.0")

    def test_reference_payload_exposes_the_flag(self):
        from .serializers import BoatTypeSerializer

        self._run(self.flag_migration.flag_tourist_boat)

        data = BoatTypeSerializer(BoatType.objects.filter(id__in=[1, 2]), many=True).data
        self.assertEqual(
            [dict(row) for row in data],
            [
                {"id": 1, "name": "Public Boat", "requires_capacity_fare": True},
                {"id": 2, "name": self.PRIVATE_OLD, "requires_capacity_fare": False},
            ],
        )


class BoatTypeConsolidationTests(_ProductionBoatRows, TestCase):
    """0045 renames ids 1 and 2 and removes the other rows."""

    def setUp(self):
        import importlib

        super().setUp()
        self.migration = importlib.import_module("api.migrations.0045_consolidate_boat_types")

    def test_forwards_renames_moves_the_passenger_record_and_deletes_the_rest(self):
        public = self._record("SURV-BOAT-001", 1, self.FARE)
        moved = self._record("SURV-BOAT-002", 7, self.FARE)
        private = self._record("SURV-BOAT-003", 2)

        self._run(self.migration.forwards)

        self.assertEqual(self._names(), {1: "Tourist Boat", 2: "Passenger Boat"})
        moved.refresh_from_db()
        self.assertEqual(moved.boat_type_id, 2)
        self.assertEqual(moved.boat_capacity_fare, self.FARE)
        public.refresh_from_db()
        self.assertEqual((public.boat_type_id, public.boat_capacity_fare), (1, self.FARE))
        private.refresh_from_db()
        self.assertEqual(private.boat_type_id, 2)

    def test_forwards_is_a_no_op_when_run_again(self):
        self._record("SURV-BOAT-001", 7, self.FARE)
        self._run(self.migration.forwards)

        self._run(self.migration.forwards)

        self.assertEqual(self._names(), {1: "Tourist Boat", 2: "Passenger Boat"})
        self.assertEqual(TouristRecord.objects.get().boat_type_id, 2)

    def test_forwards_keeps_a_row_that_still_has_records(self):
        self._record("SURV-BOAT-001", 5)

        output = self._run(self.migration.forwards)

        self.assertIn("WARNING", output)
        self.assertEqual(
            self._names(),
            {1: "Tourist Boat", 2: "Passenger Boat", 5: "Motorized Banca"},
        )
        self.assertEqual(TouristRecord.objects.get().boat_type_id, 5)

    def test_forwards_leaves_rows_whose_name_does_not_match(self):
        BoatType.objects.filter(id=4).update(name="Something Else")

        self._run(self.migration.forwards)

        self.assertEqual(
            self._names(),
            {1: "Tourist Boat", 2: "Passenger Boat", 4: "Something Else"},
        )

    def test_backwards_restores_names_and_rows_but_not_the_moved_record(self):
        self._record("SURV-BOAT-001", 7, self.FARE)
        self._run(self.migration.forwards)

        self._run(self.migration.backwards)

        self.assertEqual(self._names(), self.PRODUCTION_ROWS)
        record = TouristRecord.objects.get()
        self.assertEqual((record.boat_type_id, record.boat_capacity_fare), (2, self.FARE))

    def test_import_maps_old_and_new_names_after_the_rename(self):
        self._run(self.migration.forwards)

        self.assert_import_lands_on_rows_1_and_2()

    def test_import_creates_a_row_for_2_0_again_once_it_is_deleted(self):
        self._run(self.migration.forwards)

        item = self._resolve(["2.0"])["2.0"]

        self.assertTrue(item._state.adding)
        self.assertEqual(item.name, "2.0")

    def test_seed_matches_the_consolidated_rows(self):
        self.assertEqual(
            REFERENCE_TABLES["boat_types"],
            [
                {"id": 1, "name": "Tourist Boat", "requires_capacity_fare": True},
                {"id": 2, "name": "Passenger Boat", "requires_capacity_fare": False},
            ],
        )
        self.assertTrue(
            all(record["boat_type_id"] in (1, 2) for record in INITIAL_TOURIST_RECORDS)
        )


class ForeignOriginTests(TestCase):
    """Region and province are required for a Philippine record only, and a
    foreign record without them is counted under its country."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        user = User.objects.create_user(username="origin_admin", password="Origin@123")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        cls.token = Token.objects.create(user=user)
        ensure_test_reference_tables()
        cls.philippines = Country.objects.get(name="Philippines")
        cls.united_states = Country.objects.get(name="United States")
        cls.calabarzon = Region.objects.get(name__icontains="CALABARZON")
        cls.quezon = Province.objects.get(name="Quezon")

    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def _web_payload(self, **overrides):
        payload = {
            "first_name": "Ana",
            "last_name": "Cruz",
            "full_name": "Ana Cruz",
            "email": "ana@example.com",
            "contact_number": "+639171234567",
            "country_id": self.philippines.id,
            "region_id": self.calabarzon.id,
            "province_id": self.quezon.id,
            "country_of_origin": "",
            "resort_id": Resort.objects.first().resort_id,
            "itinerary_id": Itinerary.objects.first().id,
            "travel_mode_id": TravelMode.objects.first().id,
            "boat_type_id": BoatType.objects.first().id,
            "visit_purpose_id": VisitPurpose.objects.first().id,
            "arrival_date": "2026-04-01",
            "filipino_count": 0,
            "foreigner_count": 2,
            "total_visitors": 2,
            "total_male": 1,
            "total_female": 1,
            "age_8_59": 2,
            "status": "pending",
        }
        payload.update(overrides)
        return payload

    def _record(self, survey_id, country, province=None, region=None, visitors=1):
        return TouristRecord.objects.create(
            survey_id=survey_id,
            full_name="Origin Group",
            contact_number=f"0917{survey_id[-7:]}",
            country=country,
            region=region,
            province=province,
            arrival_date="2026-04-02",
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=visitors,
            foreigner_count=visitors,
            total_male=visitors,
            age_8_59=visitors,
            status="arrived",
        )

    # --- validation ---------------------------------------------------------

    def test_philippine_record_still_requires_region_and_province(self):
        for missing in ({"region_id": None, "province_id": None}, {"region_id": "", "province_id": ""}):
            with self.subTest(missing=missing):
                response = self.client.post(
                    "/api/tourist-records/", self._web_payload(**missing), format="json"
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("region_id", response.json())
                self.assertIn("province_id", response.json())

        payload = self._web_payload()
        del payload["region_id"], payload["province_id"]
        response = self.client.post("/api/tourist-records/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TouristRecord.objects.count(), 0)

    def test_foreign_record_saves_with_no_region_or_province(self):
        response = self.client.post(
            "/api/tourist-records/",
            self._web_payload(
                country_id=self.united_states.id, region_id=None, province_id=None
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.json())
        record = TouristRecord.objects.get()
        self.assertEqual((record.region_id, record.province_id), (None, None))
        self.assertEqual(record.country_id, self.united_states.id)

    def test_country_stays_required(self):
        response = self.client.post(
            "/api/tourist-records/",
            self._web_payload(country_id=None, region_id=None, province_id=None),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("country_id", response.json())

    def test_rule_follows_the_country_type_not_its_name(self):
        renamed = Country.objects.create(id=950, name="Republika ng Pilipinas", type="local")
        untyped_default = Country.objects.create(id=951, name="Canada")

        for country in (renamed, untyped_default):
            with self.subTest(country=country.name):
                response = self.client.post(
                    "/api/tourist-records/",
                    self._web_payload(country_id=country.id, region_id=None, province_id=None),
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("region_id", response.json())

    # --- origin groupings ---------------------------------------------------

    def _seed_origins(self):
        self._record("ORIGIN-0000001", self.philippines, self.quezon, self.calabarzon, visitors=2)
        self._record("ORIGIN-0000002", self.united_states, visitors=5)

    def test_dashboard_top_origin_reports_the_country(self):
        from .services.tourism import build_dashboard_payload

        self._seed_origins()

        metrics = build_dashboard_payload({"year": "2026"})["metrics"]

        self.assertEqual(metrics["topOriginThisMonth"], "United States")

    def test_origin_report_groups_a_record_without_province_under_its_country(self):
        from .services.tourism import build_reports_payload

        self._seed_origins()

        rows = build_reports_payload(
            {"type": "origin", "year": "2026", "include_questions": "false"}
        )["rows"]

        self.assertEqual(
            [(row["name"], row["visitors"]) for row in rows],
            [("United States", 5), ("Quezon", 2)],
        )

    def test_analytics_top_origin_and_top_six_report_the_country(self):
        from .services.tourism import build_tourism_question_answers

        self._seed_origins()

        answers = {item["id"]: item for item in build_tourism_question_answers({"year": "2026"})}
        top_origin = answers["top_origin"]

        self.assertTrue(top_origin["answer"].startswith("United States leads with 5 visitors"))
        self.assertEqual(
            [(item["label"], item["value"]) for item in top_origin["visual"]["items"]],
            [("United States", 5), ("Quezon", 2)],
        )

    # --- mobile -------------------------------------------------------------

    def _mobile_payload(self, **overrides):
        payload = {
            "first_name": "Ana",
            "last_name": "Cruz",
            "contact_number": "+639171234500",
            "arrival_date": "2026-04-01",
            "resort_id": Resort.objects.first().resort_id,
            "filipino_count": 0,
            "foreigner_count": 2,
            "total_visitors": 2,
            "total_male": 1,
            "total_female": 1,
            "age_8_59": 2,
        }
        payload.update(overrides)
        return payload

    def test_mobile_foreign_record_without_region_is_not_given_quezon(self):
        response = APIClient().post(
            "/api/mobile/tourism/register-visit/",
            self._mobile_payload(country_id=self.united_states.id),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = TouristRecord.objects.get()
        self.assertEqual((record.region_id, record.province_id), (None, None))
        self.assertEqual(record.country_of_origin, "")

    def test_mobile_philippine_record_still_defaults_to_calabarzon_quezon(self):
        response = APIClient().post(
            "/api/mobile/tourism/register-visit/",
            self._mobile_payload(country_id=self.philippines.id),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = TouristRecord.objects.get()
        self.assertEqual((record.region_id, record.province_id), (self.calabarzon.id, self.quezon.id))
        self.assertEqual(record.country_of_origin, "Philippines")

    def test_mobile_payload_from_the_current_app_still_saves(self):
        # The installed APK always sends a region and province, even for a
        # foreign country. That must keep working; the values are kept.
        response = APIClient().post(
            "/api/mobile/tourism/register-visit/",
            self._mobile_payload(
                country_id=self.united_states.id,
                region_id=self.calabarzon.id,
                province_id=self.quezon.id,
                country_of_origin="Philippines",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = TouristRecord.objects.get()
        self.assertEqual((record.region_id, record.province_id), (self.calabarzon.id, self.quezon.id))

    # --- Excel import -------------------------------------------------------

    def _import(self, rows):
        import datetime
        from io import BytesIO
        from openpyxl import Workbook
        from .services.online_booking import COLUMNS, process_online_booking_workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Form Responses 1"
        for offset, row in enumerate(rows):
            values = {
                "arrival_date": datetime.datetime(2026, 4, 2),
                "resort": Resort.objects.first().resort_name,
                "total_visitors": 2,
                "total_male": 1,
                "total_female": 1,
                "itinerary": "Overnight",
                "maubanin_count": 0,
                "special_group_count": 0,
                "foreigner_count": 2,
                "filipino_count": 0,
                "age_0_7": 0,
                "age_8_59": 2,
                "age_60_above": 0,
                "travel_mode": "Private Vehicle",
                "boat_type": "Public Boat",
                "visit_purpose": "Leisure",
                "consent": "Yes",
                **row,
            }
            for key, value in values.items():
                sheet.cell(row=3 + offset, column=COLUMNS[key], value=value)
        file_obj = BytesIO()
        workbook.save(file_obj)
        file_obj.seek(0)
        return process_online_booking_workbook(file_obj, commit=True)

    def test_import_no_longer_forces_quezon_onto_a_foreign_record(self):
        result = self._import(
            [
                {"full_name": "Foreign Guest", "contact_number": "09170000001", "country": "United States"},
                {"full_name": "New Country Guest", "contact_number": "09170000002", "country": "Canada"},
                {"full_name": "Local Guest", "contact_number": "09170000003", "country": "Philippines"},
            ]
        )

        self.assertEqual(result["valid_count"], 3, result["error_samples"])
        by_guest = {record.full_name: record for record in TouristRecord.objects.all()}
        for guest in ("Foreign Guest", "New Country Guest"):
            with self.subTest(guest=guest):
                record = by_guest[guest]
                self.assertEqual((record.region_id, record.province_id), (None, None))
        self.assertEqual(Country.objects.get(name="Canada").type, "foreign")
        local = by_guest["Local Guest"]
        self.assertEqual((local.region_id, local.province_id), (self.calabarzon.id, self.quezon.id))


class ClearSurv2026013OriginMigrationTests(TestCase):
    """0047 clears the Philippine region and province forced onto SURV-2026-013."""

    def setUp(self):
        import importlib

        ensure_test_reference_tables()
        self.migration = importlib.import_module("api.migrations.0047_clear_surv_2026_013_origin")
        self.western_visayas, _ = Region.objects.get_or_create(
            id=9, defaults={"name": "Region VI - Western Visayas"}
        )
        self.guimaras, _ = Province.objects.get_or_create(
            id=42, defaults={"name": "Guimaras", "region": self.western_visayas}
        )
        self.united_states = Country.objects.get(name="United States")
        self.target = self._record("SURV-2026-013", self.united_states)
        self.other = self._record("SURV-2026-099", self.united_states)

    def _record(self, survey_id, country):
        return TouristRecord.objects.create(
            survey_id=survey_id,
            full_name="Origin Group",
            contact_number="09170000000",
            country=country,
            region=self.western_visayas,
            province=self.guimaras,
            arrival_date="2026-10-27",
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=4,
            filipino_count=4,
            total_male=2,
            total_female=2,
            age_8_59=4,
            status="pending",
        )

    def _run(self, function):
        from django.apps import apps

        function(apps, None)

    def _origin(self, record):
        record.refresh_from_db()
        return (record.country_id, record.region_id, record.province_id, record.total_visitors)

    def test_forward_clears_only_that_record_and_keeps_its_country_and_counts(self):
        self._run(self.migration.clear_origin)

        self.assertEqual(self._origin(self.target), (self.united_states.id, None, None, 4))
        self.assertEqual(self._origin(self.other), (self.united_states.id, 9, 42, 4))

    def test_forward_does_nothing_once_the_values_have_changed(self):
        TouristRecord.objects.filter(pk="SURV-2026-013").update(province=Province.objects.get(id=1))

        self._run(self.migration.clear_origin)

        self.assertEqual(self._origin(self.target), (self.united_states.id, 9, 1, 4))

    def test_reverse_restores_the_exact_ids(self):
        self._run(self.migration.clear_origin)

        self._run(self.migration.restore_origin)

        self.assertEqual(self._origin(self.target), (self.united_states.id, 9, 42, 4))
        self.assertEqual(self._origin(self.other), (self.united_states.id, 9, 42, 4))


class AnalyticsPercentageTests(TestCase):
    """The Analytics answers divide by the year's visitor total.

    Three records of 6, 3 and 1 visitors (total 10): no single record's head
    count equals the total, so an answer that divides by one record instead
    of the total is wrong whichever record the loop ends on.
    """

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        quezon = Province.objects.get(name="Quezon")
        resorts = list(Resort.objects.order_by("resort_id")[:2])
        purposes = list(VisitPurpose.objects.order_by("id")[:2])
        cls.main_resort, cls.main_purpose = resorts[0], purposes[0]
        rows = [
            # survey_id, visitors, itinerary, resort, purpose, country, province
            ("PCT-0001", 6, "Overnight", resorts[0], purposes[0], "Philippines", quezon),
            ("PCT-0002", 3, "2 Nights", resorts[0], purposes[1], "Philippines", quezon),
            ("PCT-0003", 1, "Same Day", resorts[1], purposes[0], "United States", None),
        ]
        for survey_id, visitors, itinerary, resort, purpose, country, province in rows:
            TouristRecord.objects.create(
                survey_id=survey_id,
                full_name="Percentage Group",
                contact_number=f"0917000{survey_id[-4:]}",
                country=Country.objects.get(name=country),
                region=province.region if province else None,
                province=province,
                arrival_date="2026-04-02",
                resort=resort,
                itinerary=Itinerary.objects.get(name=itinerary),
                travel_mode=TravelMode.objects.first(),
                boat_type=BoatType.objects.first(),
                visit_purpose=purpose,
                total_visitors=visitors,
                filipino_count=visitors,
                total_male=visitors,
                age_8_59=visitors,
                status="arrived",
            )

    def setUp(self):
        from .services.tourism import build_tourism_question_answers

        self.answers = {
            item["id"]: item for item in build_tourism_question_answers({"year": "2026"})
        }

    def test_top_resort_percentage_is_of_the_year_total(self):
        self.assertEqual(
            self.answers["top_resort"]["answer"],
            f"{self.main_resort.resort_name} leads with 9 visitors, equal to 90.0% of the selected total.",
        )

    def test_top_origin_percentage_is_of_the_year_total(self):
        self.assertEqual(
            self.answers["top_origin"]["answer"],
            "Quezon leads with 9 visitors, equal to 90.0% of the selected total.",
        )

    def test_visit_purpose_percentage_is_of_the_year_total(self):
        self.assertEqual(
            self.answers["visit_purpose"]["answer"],
            f"{self.main_purpose.name} leads with 7 visitors, equal to 70.0% of the selected total.",
        )

    def test_average_stay_divides_nights_by_the_year_total(self):
        # 6 x 1 night + 3 x 2 nights + 1 x 0 (same day) = 12 nights / 10 visitors.
        self.assertEqual(self.answers["average_stay"]["visual"]["value"], 1.2)
        self.assertIn("1.2 night(s) per visitor", self.answers["average_stay"]["answer"])


class EntranceFeeRateTests(TestCase):
    """Every fee and revenue figure is head count x PHP 80 (no fee is stored).

    Two arrived records of 3 and 2 visitors on Apr 2, a no-show of 5 on Apr 2
    (counted nowhere), and a pending record of 4 on Apr 3 (counted only by
    Reports, which exclude no-shows but not pending bookings).
    """

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        quezon = Province.objects.get(name="Quezon")
        resort = Resort.objects.order_by("resort_id").first()
        rows = [
            ("FEE-0001", 3, "2026-04-02", "arrived"),
            ("FEE-0002", 2, "2026-04-02", "arrived"),
            ("FEE-0003", 5, "2026-04-02", "no_show"),
            ("FEE-0004", 4, "2026-04-03", "pending"),
        ]
        for survey_id, visitors, arrival_date, booking_status in rows:
            TouristRecord.objects.create(
                survey_id=survey_id,
                full_name="Fee Group",
                contact_number=f"0917000{survey_id[-4:]}",
                country=Country.objects.get(name="Philippines"),
                region=quezon.region,
                province=quezon,
                arrival_date=arrival_date,
                resort=resort,
                itinerary=Itinerary.objects.first(),
                travel_mode=TravelMode.objects.first(),
                boat_type=BoatType.objects.first(),
                visit_purpose=VisitPurpose.objects.first(),
                total_visitors=visitors,
                filipino_count=visitors,
                total_male=visitors,
                age_8_59=visitors,
                status=booking_status,
            )

    def test_the_rate_is_80_per_visitor(self):
        from .services.tourism import DISCOUNTED_ENTRANCE_FEE, REGULAR_ENTRANCE_FEE

        self.assertEqual((REGULAR_ENTRANCE_FEE, DISCOUNTED_ENTRANCE_FEE), (80, 64))

    def test_arrival_monitoring_fee_paid_and_fees_collected(self):
        from .services.tourism import build_arrival_monitoring_payload

        payload = build_arrival_monitoring_payload({"date": "2026-04-02"})

        self.assertEqual(
            sorted((row["survey_id"], row["feePaid"]) for row in payload["rows"]),
            [("FEE-0001", 240), ("FEE-0002", 160)],
        )
        self.assertEqual(payload["summary"]["feesCollected"], 400)
        self.assertEqual(payload["dailyTotals"]["feesCollected"], 400)
        self.assertEqual(payload["feePerVisitor"], 80)

    def test_dashboard_total_revenue_collected(self):
        from .services.tourism import build_dashboard_payload

        payload = build_dashboard_payload({"year": "2026"})

        self.assertEqual(payload["metrics"]["totalRevenueCollected"], 400)

    def test_daily_report_revenue_and_average_per_visitor(self):
        from .services.tourism import build_reports_payload

        payload = build_reports_payload(
            {"type": "daily", "year": "2026", "include_questions": "false"}
        )

        self.assertEqual(
            [(row["id"], row["visitors"], row["revenue"], row["avg"]) for row in payload["rows"]],
            [("2026-04-02", 5, 400, 80), ("2026-04-03", 4, 320, 80)],
        )
        self.assertEqual(payload["totals"], {"visitors": 9, "male": 9, "female": 0, "revenue": 720, "avg": 80})


class DiscountedEntranceFeeTests(TestCase):
    """fee = (visitors - discounted) x 80 + discounted x 64, per record and per group.

    Mixed records, so a group that used the wrong discounted count would be off:
      A arrived Apr 2: 4 visitors, 3 discounted, resort 1, purpose 1 -> 272
      B arrived Apr 2: 5 visitors, 0 discounted, resort 1, purpose 2 -> 400
      C arrived Apr 2: 2 visitors, 2 discounted, resort 2, purpose 1 -> 128
      D pending Apr 3: 3 visitors, 1 discounted, resort 2, purpose 2 -> 224
      E no-show Apr 2: 6 visitors, 6 discounted (counted nowhere)
    """

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        cls.quezon = Province.objects.get(name="Quezon")
        cls.resorts = list(Resort.objects.order_by("resort_id")[:2])
        cls.purposes = list(VisitPurpose.objects.order_by("id")[:2])
        rows = [
            ("DSC-0001", "arrived", "2026-04-02", 4, 3, 0, 0),
            ("DSC-0002", "arrived", "2026-04-02", 5, 0, 0, 1),
            ("DSC-0003", "arrived", "2026-04-02", 2, 2, 1, 0),
            ("DSC-0004", "pending", "2026-04-03", 3, 1, 1, 1),
            ("DSC-0005", "no_show", "2026-04-02", 6, 6, 0, 0),
        ]
        for survey_id, booking_status, arrival_date, visitors, discounted, resort, purpose in rows:
            cls._record(survey_id, booking_status, arrival_date, visitors, discounted, resort, purpose)

    @classmethod
    def _record(cls, survey_id, booking_status, arrival_date, visitors, discounted, resort=0, purpose=0):
        return TouristRecord.objects.create(
            survey_id=survey_id,
            full_name="Discount Group",
            contact_number=f"0917000{survey_id[-4:]}",
            country=Country.objects.get(name="Philippines"),
            region=cls.quezon.region,
            province=cls.quezon,
            arrival_date=arrival_date,
            resort=cls.resorts[resort],
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=cls.purposes[purpose],
            total_visitors=visitors,
            filipino_count=visitors,
            total_male=visitors,
            age_8_59=visitors,
            discounted_count=discounted,
            status=booking_status,
        )

    # --- the helper ---------------------------------------------------------

    def test_fee_helper(self):
        from .services.tourism import entrance_fee

        self.assertEqual(entrance_fee(5, 0), 400)  # all regular
        self.assertEqual(entrance_fee(3, 3), 192)  # all discounted
        self.assertEqual(entrance_fee(4, 3), 272)  # mixed
        self.assertEqual(entrance_fee(0, 0), 0)  # nobody

    # --- validation ---------------------------------------------------------

    def _web_payload(self, **overrides):
        payload = {
            "first_name": "Ana",
            "last_name": "Cruz",
            "full_name": "Ana Cruz",
            "email": "ana@example.com",
            "contact_number": "+639171234567",
            "country_id": Country.objects.get(name="Philippines").id,
            "region_id": self.quezon.region_id,
            "province_id": self.quezon.id,
            "resort_id": self.resorts[0].resort_id,
            "itinerary_id": Itinerary.objects.first().id,
            "travel_mode_id": TravelMode.objects.first().id,
            "boat_type_id": BoatType.objects.first().id,
            "visit_purpose_id": self.purposes[0].id,
            "arrival_date": "2026-05-01",
            "filipino_count": 3,
            "foreigner_count": 0,
            "total_visitors": 3,
            "total_male": 3,
            "total_female": 0,
            "age_8_59": 3,
            "status": "pending",
        }
        payload.update(overrides)
        return payload

    def _client(self):
        user = User.objects.create_user(username="fee_admin", password="Fee@12345")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        return client

    def test_discounted_count_above_total_visitors_is_rejected(self):
        response = self._client().post(
            "/api/tourist-records/", self._web_payload(discounted_count=4), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.json()["discounted_count"],
            ["Discounted count cannot be greater than the total number of visitors."],
        )

    def test_discounted_count_equal_to_total_visitors_is_allowed(self):
        response = self._client().post(
            "/api/tourist-records/", self._web_payload(discounted_count=3), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.json())
        self.assertEqual(response.json()["discounted_count"], 3)

    # --- totals -------------------------------------------------------------

    def test_dashboard_total_revenue_collected(self):
        from .services.tourism import build_dashboard_payload

        # A + B + C: 11 visitors, 5 discounted -> 6 x 80 + 5 x 64.
        self.assertEqual(
            build_dashboard_payload({"year": "2026"})["metrics"]["totalRevenueCollected"], 800
        )

    def test_arrival_monitoring_fee_paid_and_fees_collected(self):
        from .services.tourism import build_arrival_monitoring_payload

        payload = build_arrival_monitoring_payload({"date": "2026-04-02"})

        self.assertEqual(
            sorted((row["survey_id"], row["feePaid"]) for row in payload["rows"]),
            [("DSC-0001", 272), ("DSC-0002", 400), ("DSC-0003", 128)],
        )
        self.assertEqual(payload["summary"]["feesCollected"], 800)

    def _report(self, report_type):
        from .services.tourism import build_reports_payload

        return build_reports_payload(
            {"type": report_type, "year": "2026", "include_questions": "false"}
        )

    def test_daily_report_uses_each_days_discounted_count(self):
        payload = self._report("daily")

        self.assertEqual(
            [(row["id"], row["visitors"], row["revenue"], row["avg"]) for row in payload["rows"]],
            [("2026-04-02", 11, 800, 73), ("2026-04-03", 3, 224, 75)],
        )
        self.assertEqual(payload["totals"], {"visitors": 14, "male": 14, "female": 0, "revenue": 1024, "avg": 73})

    def test_monthly_report_uses_the_months_discounted_count(self):
        payload = self._report("monthly")

        # April: 14 visitors, 6 discounted -> 8 x 80 + 6 x 64.
        self.assertEqual(
            [(row["id"], row["visitors"], row["revenue"]) for row in payload["rows"]],
            [("2026-04", 14, 1024)],
        )

    def test_purpose_report_uses_each_purposes_discounted_count(self):
        payload = self._report("purpose")

        # Purpose 2 (B + D): 8 visitors, 1 discounted. Purpose 1 (A + C): 6 visitors, 5 discounted.
        self.assertEqual(
            [(row["name"], row["visitors"], row["revenue"], row["avg"]) for row in payload["rows"]],
            [(self.purposes[1].name, 8, 624, 78), (self.purposes[0].name, 6, 400, 67)],
        )

    def test_resort_report_uses_each_resorts_discounted_count(self):
        payload = self._report("resort")

        # Resort 1 (A + B): 9 visitors, 3 discounted. Resort 2 (C + D): 5 visitors, 3 discounted.
        self.assertEqual(
            [(row["resort_id"], row["visitors"], row["revenue"], row["avg"]) for row in payload["rows"]],
            [(self.resorts[0].resort_id, 9, 672, 75), (self.resorts[1].resort_id, 5, 352, 70)],
        )
        self.assertEqual(payload["totals"]["revenue"], 1024)

    # --- other writers ------------------------------------------------------

    def test_mobile_payload_without_discounted_count_saves_zero(self):
        # Today's APK does not know the field.
        response = APIClient().post(
            "/api/mobile/tourism/register-visit/",
            {
                "first_name": "Ana",
                "last_name": "Cruz",
                "contact_number": "+639171234599",
                "arrival_date": "2026-05-01",
                "resort_id": self.resorts[0].resort_id,
                "filipino_count": 3,
                "foreigner_count": 0,
                "total_visitors": 3,
                "total_male": 2,
                "total_female": 1,
                "age_0_7": 1,
                "age_8_59": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(TouristRecord.objects.get(contact_number__endswith="1234599").discounted_count, 0)

    def test_excel_import_saves_zero(self):
        ForeignOriginTests._import(
            self,
            [
                {
                    "full_name": "Imported Guest",
                    "contact_number": "09170009999",
                    "country": "Philippines",
                    "age_0_7": 1,
                    "age_8_59": 1,
                }
            ],
        )

        self.assertEqual(TouristRecord.objects.get(full_name="Imported Guest").discounted_count, 0)

    def test_migration_backfills_children_plus_seniors(self):
        import importlib
        from django.apps import apps

        migration = importlib.import_module("api.migrations.0048_touristrecord_discounted_count")
        record = self._record("DSC-0006", "arrived", "2026-04-05", 5, 0)
        TouristRecord.objects.filter(pk=record.pk).update(age_0_7=2, age_8_59=2, age_60_above=1)

        migration.backfill_discounted_count(apps, None)

        record.refresh_from_db()
        self.assertEqual(record.discounted_count, 3)


class DiscountedCountSpecialNeedsMigrationTests(TestCase):
    """0049 moves records still on the age-only suggestion to the new one."""

    def setUp(self):
        import importlib

        ensure_test_reference_tables()
        self.migration = importlib.import_module(
            "api.migrations.0049_discounted_count_includes_special_needs"
        )

    def _record(self, survey_id, visitors, age_0_7, age_60_above, special, discounted):
        quezon = Province.objects.get(name="Quezon")
        return TouristRecord.objects.create(
            survey_id=survey_id,
            full_name="Special Needs Group",
            contact_number=f"0917000{survey_id[-4:]}",
            country=Country.objects.get(name="Philippines"),
            region=quezon.region,
            province=quezon,
            arrival_date="2026-04-02",
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=visitors,
            filipino_count=visitors,
            total_male=visitors,
            age_0_7=age_0_7,
            age_60_above=age_60_above,
            age_8_59=visitors - age_0_7 - age_60_above,
            special_group_count=special,
            discounted_count=discounted,
            status="arrived",
        )

    def _run(self, function):
        from django.apps import apps

        function(apps, None)

    def _discounted(self):
        return dict(TouristRecord.objects.values_list("survey_id", "discounted_count"))

    def test_forward_adds_special_needs_capped_and_keeps_manual_counts(self):
        # Age-only 2, plus 1 special needs -> 3.
        self._record("SPN-0001", 5, 1, 1, 1, 2)
        # 3 visitors, 2 seniors who are also special needs: 2 + 2 = 4, capped at 3.
        self._record("SPN-0002", 3, 0, 2, 2, 2)
        # Staff set 4 by hand (age-only would be 1): left alone.
        self._record("SPN-0003", 5, 1, 0, 1, 4)
        # Nothing to add: unchanged.
        self._record("SPN-0004", 2, 0, 0, 0, 0)

        self._run(self.migration.include_special_needs)

        self.assertEqual(
            self._discounted(),
            {"SPN-0001": 3, "SPN-0002": 3, "SPN-0003": 4, "SPN-0004": 0},
        )

    def test_reverse_returns_to_the_age_only_value(self):
        self._record("SPN-0001", 5, 1, 1, 1, 2)
        self._record("SPN-0002", 3, 0, 2, 2, 2)
        self._record("SPN-0003", 5, 1, 0, 1, 4)
        self._run(self.migration.include_special_needs)

        self._run(self.migration.back_to_age_only)

        self.assertEqual(self._discounted(), {"SPN-0001": 2, "SPN-0002": 2, "SPN-0003": 4})


class ArrivalMonitoringViewsTests(TestCase):
    """Month ranges, the capped table, and the complete date-ordered export.

    305 arrived records spread over September 2026 (one visitor each), two
    arrived in October, and a pending September record that is never counted.
    """

    SEPTEMBER = {"year": "2026", "from": "2026-09-01", "to": "2026-09-30"}

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        quezon = Province.objects.get(name="Quezon")
        common = dict(
            full_name="Arrival Group",
            contact_number="09170000000",
            country=Country.objects.get(name="Philippines"),
            region=quezon.region,
            province=quezon,
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=1,
            filipino_count=1,
            total_male=1,
            age_8_59=1,
        )
        records = [
            TouristRecord(
                survey_id=f"ARR-{index:04d}",
                arrival_date=f"2026-09-{(index % 30) + 1:02d}",
                status="arrived",
                **common,
            )
            for index in range(305)
        ]
        records += [
            TouristRecord(survey_id="ARR-OCT-1", arrival_date="2026-10-01", status="arrived", **common),
            TouristRecord(survey_id="ARR-OCT-2", arrival_date="2026-10-31", status="arrived", **common),
            TouristRecord(survey_id="ARR-PEND", arrival_date="2026-09-15", status="pending", **common),
        ]
        TouristRecord.objects.bulk_create(records)

    def test_table_is_capped_but_counts_every_record(self):
        from .services.tourism import build_arrival_monitoring_payload

        payload = build_arrival_monitoring_payload(self.SEPTEMBER)

        self.assertEqual(len(payload["rows"]), 300)
        self.assertEqual(payload["rowCount"], 305)
        self.assertEqual(payload["summary"]["totalArrivals"], 305)

    def test_export_returns_every_row_in_date_order(self):
        from .services.tourism import build_arrival_monitoring_export

        payload = build_arrival_monitoring_export(self.SEPTEMBER)
        dates = [row["date"] for row in payload["rows"]]

        self.assertEqual(payload["rowCount"], 305)
        self.assertEqual(len(payload["rows"]), 305)
        self.assertEqual(dates, sorted(dates))
        self.assertEqual((dates[0], dates[-1]), ("2026-09-01", "2026-09-30"))
        self.assertEqual(
            {row["survey_id"] for row in payload["rows"]},
            {f"ARR-{index:04d}" for index in range(305)},
        )

    def test_month_range_selects_only_that_month(self):
        from .services.tourism import build_arrival_monitoring_payload

        october = build_arrival_monitoring_payload(
            {"year": "2026", "from": "2026-10-01", "to": "2026-10-31"}
        )

        self.assertEqual(october["rowCount"], 2)
        self.assertEqual(sorted(row["survey_id"] for row in october["rows"]), ["ARR-OCT-1", "ARR-OCT-2"])

    def test_a_range_with_a_different_year_returns_nothing(self):
        from .services.tourism import build_arrival_monitoring_payload

        payload = build_arrival_monitoring_payload({**self.SEPTEMBER, "year": "2025"})

        self.assertEqual(payload["rowCount"], 0)

    def test_export_endpoint(self):
        user = User.objects.create_user(username="arrival_admin", password="Arrival@123")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")

        response = client.get("/api/arrival-monitoring/export/", self.SEPTEMBER)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["rowCount"], 305)
        self.assertEqual(len(response.json()["rows"]), 305)
        self.assertEqual(APIClient().get("/api/arrival-monitoring/export/").status_code, 401)


class NoShowSweepTests(TestCase):
    """The no-show sweep runs at most once a day, plus after any record write."""

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        cls.quezon = Province.objects.get(name="Quezon")

    def setUp(self):
        from django.core.cache import cache

        cache.clear()

    def _record(self, survey_id, arrival_date, booking_status="pending"):
        return TouristRecord(
            survey_id=survey_id,
            full_name="Sweep Group",
            contact_number="09170000000",
            country=Country.objects.get(name="Philippines"),
            region=self.quezon.region,
            province=self.quezon,
            arrival_date=arrival_date,
            resort=Resort.objects.first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=1,
            filipino_count=1,
            total_male=1,
            age_8_59=1,
            status=booking_status,
        )

    def _insert_without_signal(self, *records):
        # bulk_create sends no post_save, so it does not ask for a new sweep.
        TouristRecord.objects.bulk_create(records)

    def _status(self, survey_id):
        return TouristRecord.objects.get(pk=survey_id).status

    def _days(self, offset):
        return timezone.localdate() + timedelta(days=offset)

    def test_past_dated_pending_booking_becomes_no_show(self):
        from .services.no_show import sweep_no_shows

        self._insert_without_signal(
            self._record("SWP-PAST", self._days(-1)),
            self._record("SWP-TODAY", self._days(0)),
            self._record("SWP-FUTURE", self._days(3)),
            self._record("SWP-ARRIVED", self._days(-1), "arrived"),
        )

        sweep_no_shows()

        self.assertEqual(self._status("SWP-PAST"), "no_show")
        self.assertEqual(self._status("SWP-TODAY"), "pending")
        self.assertEqual(self._status("SWP-FUTURE"), "pending")
        self.assertEqual(self._status("SWP-ARRIVED"), "arrived")

    def test_first_request_of_the_day_sweeps_and_a_second_does_not(self):
        from .services.no_show import sweep_no_shows

        self._insert_without_signal(self._record("SWP-1", self._days(-1)))
        sweep_no_shows()
        self.assertEqual(self._status("SWP-1"), "no_show")

        self._insert_without_signal(self._record("SWP-2", self._days(-1)))
        with CaptureQueriesContext(connection) as queries:
            sweep_no_shows()

        self.assertEqual(len(queries), 0)
        self.assertEqual(self._status("SWP-2"), "pending")

    def test_a_new_day_sweeps_again(self):
        from .services import no_show

        no_show.sweep_no_shows()
        self._insert_without_signal(self._record("SWP-1", self._days(0)))

        tomorrow = self._days(1)
        tomorrow_noon = timezone.localtime().replace(
            year=tomorrow.year, month=tomorrow.month, day=tomorrow.day, hour=12
        )
        with patch.object(no_show.timezone, "localdate", return_value=tomorrow), patch.object(
            no_show.timezone, "localtime", return_value=tomorrow_noon
        ):
            no_show.sweep_no_shows()

        self.assertEqual(self._status("SWP-1"), "no_show")

    def test_saving_a_record_today_makes_the_next_request_sweep(self):
        from .services.no_show import sweep_no_shows

        sweep_no_shows()
        self._record("SWP-SAVED", self._days(-2)).save()

        sweep_no_shows()

        self.assertEqual(self._status("SWP-SAVED"), "no_show")

    def test_an_import_makes_the_next_request_sweep(self):
        from .services.no_show import sweep_no_shows

        sweep_no_shows()
        ForeignOriginTests._import(
            self,
            [{"full_name": "Imported Past Guest", "contact_number": "09170001111", "country": "Philippines"}],
        )

        sweep_no_shows()

        self.assertEqual(TouristRecord.objects.get(full_name="Imported Past Guest").status, "no_show")

    def test_a_cache_failure_sweeps_instead_of_skipping(self):
        from .services import no_show

        self._insert_without_signal(self._record("SWP-1", self._days(-1)))

        with patch.object(no_show.cache, "get", side_effect=RuntimeError("cache down")), patch.object(
            no_show.cache, "set", side_effect=RuntimeError("cache down")
        ):
            no_show.sweep_no_shows()

        self.assertEqual(self._status("SWP-1"), "no_show")

    def test_the_marker_expires_at_midnight(self):
        from .services import no_show

        late = timezone.localtime().replace(hour=23, minute=59, second=30, microsecond=0)
        with patch.object(no_show.timezone, "localtime", return_value=late):
            self.assertEqual(no_show._seconds_until_midnight(), 30)

    def test_a_second_get_of_a_page_does_not_write(self):
        user = User.objects.create_user(username="sweep_admin", password="Sweep@123")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")

        client.get("/api/dashboard/")
        with CaptureQueriesContext(connection) as queries:
            response = client.get("/api/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            [q["sql"] for q in queries if q["sql"].lstrip().upper().startswith("UPDATE")]
        )


class QuestionAnswersDeduplicationTests(TestCase):
    """The de-duplicated question answers equal the old, separate computations.

    The oracle below is the code that was replaced: a separate query for each
    leader and its top 6, and separate text and chart functions for the demand
    and validation answers.
    """

    AFFECTED = ("top_resort", "top_origin", "visit_purpose", "high_demand", "validation")

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        cls.quezon = Province.objects.get(name="Quezon")
        cls.resorts = list(Resort.objects.order_by("resort_id")[:2])
        cls.purposes = list(VisitPurpose.objects.order_by("id")[:2])
        cls.us = Country.objects.get(name="United States")

    def _record(self, survey_id, day, visitors, resort=0, purpose=0, booking_status="arrived",
                foreign=False, full_name="Group", contact="09170000000"):
        return TouristRecord(
            survey_id=survey_id,
            full_name=full_name,
            contact_number=contact,
            country=self.us if foreign else Country.objects.get(name="Philippines"),
            region=None if foreign else self.quezon.region,
            province=None if foreign else self.quezon,
            arrival_date=day,
            resort=self.resorts[resort],
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=self.purposes[purpose],
            total_visitors=visitors,
            filipino_count=visitors,
            total_male=visitors,
            age_8_59=visitors,
            status=booking_status,
        )

    # --- the oracle: the replaced code --------------------------------------

    def _old(self, params):
        from .services import tourism as t

        reporting_year = t.get_reporting_year(params)
        arrived = t.apply_reporting_year(
            TouristRecord.objects.exclude(status="no_show"), reporting_year
        )
        records = t.apply_reporting_year(TouristRecord.objects.all(), reporting_year)
        if params.get("from"):
            arrived = arrived.filter(arrival_date__gte=params["from"])
            records = records.filter(arrival_date__gte=params["from"])
        if params.get("to"):
            arrived = arrived.filter(arrival_date__lte=params["to"])
            records = records.filter(arrival_date__lte=params["to"])
        total = t.sum_visitors(arrived)

        def ranking(field, queryset):
            top = t.top_group(queryset, field)
            return (
                t.format_top_answer(top, total, "visitors"),
                [{"label": r["name"], "value": r["total"]} for r in t.top_n_groups(queryset, field, limit=6)],
            )

        def demand_signal():
            latest = arrived.aggregate(latest=Max("arrival_date"))["latest"]
            if not latest:
                return "No recent arrival trend is available yet."
            recent_start = latest - timedelta(days=29)
            previous = arrived.filter(arrival_date__range=(recent_start - timedelta(days=30), recent_start - timedelta(days=1)))
            recent_top = t.top_group(arrived.filter(arrival_date__range=(recent_start, latest)), "resort__resort_name")
            growth = recent_top["total"] - t.sum_visitors(previous.filter(resort__resort_name=recent_top["name"]))
            if not recent_top["name"]:
                return "No recent high-demand resort is available yet."
            return (
                f"{recent_top['name']} shows the strongest recent demand with "
                f"{recent_top['total']} visitors in the latest 30-day window "
                f"({growth:+d} versus the previous 30 days)."
            )

        def demand_visual():
            latest = arrived.aggregate(latest=Max("arrival_date"))["latest"]
            if not latest:
                return {"type": "comparison", "items": []}
            recent_start = latest - timedelta(days=29)
            recent_top = t.top_group(arrived.filter(arrival_date__range=(recent_start, latest)), "resort__resort_name")
            previous_total = t.sum_visitors(arrived.filter(
                arrival_date__range=(recent_start - timedelta(days=30), recent_start - timedelta(days=1)),
                resort__resort_name=recent_top["name"],
            ))
            return {"type": "comparison", "items": [
                {"label": "Previous 30 days", "value": previous_total},
                {"label": "Latest 30 days", "value": recent_top["total"]},
            ]}

        def counts():
            return (
                records.filter(status="pending").count(),
                records.filter(status="no_show").count(),
                records.exclude(contact_number="").values("full_name", "contact_number", "arrival_date", "resort_id")
                .annotate(total=Count("survey_id")).filter(total__gt=1).count(),
                records.filter(Q(full_name="") | Q(contact_number="") | Q(total_visitors=0)
                               | Q(total_male__isnull=True) | Q(total_female__isnull=True)).count(),
            )

        pending, no_show, duplicates, incomplete = counts()
        resort_answer, resort_items = ranking("resort__resort_name", arrived)
        origin_answer, origin_items = ranking("origin", t.with_origin(arrived))
        purpose_answer, purpose_items = ranking("visit_purpose__name", arrived)
        return {
            "top_resort": (resort_answer, {"type": "ranking", "items": resort_items}),
            "top_origin": (origin_answer, {"type": "ranking", "items": origin_items}),
            "visit_purpose": (purpose_answer, {"type": "ranking", "items": purpose_items}),
            "high_demand": (demand_signal(), demand_visual()),
            "validation": (
                f"Needs review: {pending} pending, {no_show} no-show, "
                f"{duplicates} possible duplicates, and {incomplete} incomplete records.",
                {"type": "stack", "items": [
                    {"label": "Pending", "value": pending},
                    {"label": "No-show", "value": no_show},
                    {"label": "Duplicates", "value": duplicates},
                    {"label": "Incomplete", "value": incomplete},
                ]},
            ),
        }

    def _new(self, params):
        from .services.tourism import build_tourism_question_answers

        answers = {item["id"]: item for item in build_tourism_question_answers(params)}
        return {key: (answers[key]["answer"], answers[key]["visual"]) for key in self.AFFECTED}

    def _assert_same(self, params):
        self.assertEqual(self._new(params), self._old(params))

    # --- cases ----------------------------------------------------------------

    def test_same_with_no_records(self):
        self._assert_same({"year": "2026"})

    def test_same_with_mixed_records(self):
        TouristRecord.objects.bulk_create([
            self._record("QA-01", "2026-09-10", 5, resort=0, purpose=0),
            self._record("QA-02", "2026-09-20", 3, resort=1, purpose=1),
            self._record("QA-03", "2026-08-05", 2, resort=0, purpose=0, foreign=True),
            self._record("QA-04", "2026-09-25", 4, resort=1, purpose=1, booking_status="pending"),
            self._record("QA-05", "2026-09-15", 6, resort=0, booking_status="no_show"),
            self._record("QA-06", "2026-09-10", 1, resort=0, purpose=1),  # duplicate of QA-01's key
            self._record("QA-07", "2026-09-01", 2, resort=1, contact=""),  # incomplete
            self._record("QA-08", "2026-07-30", 3, resort=1, purpose=0),  # previous 30-day window
        ])

        for params in (
            {"year": "2026"},
            {"year": "all"},
            {"year": "2026", "from": "2026-09-01", "to": "2026-09-30"},
            {"year": "2026", "from": "2026-12-01", "to": "2026-12-31"},
        ):
            with self.subTest(params=params):
                self._assert_same(params)

    def test_same_with_a_tie(self):
        TouristRecord.objects.bulk_create([
            self._record("QA-11", "2026-09-10", 4, resort=0, purpose=0),
            self._record("QA-12", "2026-09-11", 4, resort=1, purpose=1),
        ])

        self._assert_same({"year": "2026"})

    def test_question_answers_run_17_queries(self):
        from .services.tourism import build_tourism_question_answers

        TouristRecord.objects.bulk_create([self._record("QA-21", "2026-09-10", 2)])
        with CaptureQueriesContext(connection) as queries:
            build_tourism_question_answers({"year": "2026"})

        self.assertEqual(len(queries), 17)


class ReportsMaleFemaleTests(TestCase):
    """Every report tab carries male and female, summed in its existing query."""

    TABS = ("daily", "monthly", "yearly", "resort", "origin", "purpose", "transport", "no_show")
    # Queries per tab without the question answers; the male and female sums
    # must not add one.
    QUERIES = {
        "daily": 1, "monthly": 1, "yearly": 1, "resort": 2,
        "origin": 1, "purpose": 1, "transport": 1, "no_show": 1,
    }

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        cls.quezon = Province.objects.get(name="Quezon")
        cls.us = Country.objects.get(name="United States")
        cls.resorts = list(Resort.objects.order_by("resort_id")[:2])
        cls.purposes = list(VisitPurpose.objects.order_by("id")[:2])
        cls.modes = list(TravelMode.objects.order_by("id")[:2])
        TouristRecord.objects.bulk_create([
            cls._record("MF-01", "2026-08-10", 3, 2, resort=0, purpose=0, mode=0),
            cls._record("MF-02", "2026-09-05", 1, 3, resort=1, purpose=1, mode=1, foreign=True),
            cls._record("MF-03", "2026-09-05", 2, 0, resort=0, purpose=1, mode=0, booking_status="pending"),
            cls._record("MF-04", "2026-09-20", 0, 4, resort=1, purpose=0, mode=1, booking_status="no_show"),
            # A pending advance booking in a second year, shaped like SURV-2026-011.
            cls._record("MF-05", "2027-09-21", 2, 2, resort=0, purpose=0, mode=0,
                        booking_status="pending", discounted=1),
        ])

    @classmethod
    def _record(cls, survey_id, day, male, female, resort, purpose, mode,
                booking_status="arrived", foreign=False, discounted=0):
        visitors = male + female
        return TouristRecord(
            survey_id=survey_id,
            full_name="Group",
            contact_number="09170000000",
            country=cls.us if foreign else Country.objects.get(name="Philippines"),
            region=None if foreign else cls.quezon.region,
            province=None if foreign else cls.quezon,
            arrival_date=day,
            resort=cls.resorts[resort],
            itinerary=Itinerary.objects.first(),
            travel_mode=cls.modes[mode],
            boat_type=BoatType.objects.first(),
            visit_purpose=cls.purposes[purpose],
            total_visitors=visitors,
            foreigner_count=visitors if foreign else 0,
            filipino_count=0 if foreign else visitors,
            total_male=male,
            total_female=female,
            discounted_count=discounted,
            age_8_59=visitors,
            status=booking_status,
        )

    def _report(self, report_type, year="2026"):
        from .services.tourism import build_reports_payload

        return build_reports_payload({"type": report_type, "year": year, "include_questions": "false"})

    def test_each_tab_reports_male_and_female(self):
        r0, r1 = (resort.resort_name for resort in self.resorts)
        p0, p1 = (purpose.name for purpose in self.purposes)
        m0, m1 = (mode.name for mode in self.modes)
        # (name, male, female, visitors) per row, then the totals. No-show
        # counts only MF-04; every other tab counts MF-01 to MF-03 (pending included).
        expected = {
            "daily": ([("Aug 10, 2026", 3, 2, 5), ("Sep 05, 2026", 3, 3, 6)], (6, 5, 11)),
            "monthly": ([("August 2026", 3, 2, 5), ("September 2026", 3, 3, 6)], (6, 5, 11)),
            "yearly": ([("2026", 6, 5, 11)], (6, 5, 11)),
            "resort": ([(r0, 5, 2, 7), (r1, 1, 3, 4)], (6, 5, 11)),
            "origin": ([("Quezon", 5, 2, 7), ("United States", 1, 3, 4)], (6, 5, 11)),
            "purpose": ([(p1, 3, 3, 6), (p0, 3, 2, 5)], (6, 5, 11)),
            "transport": ([(m0, 5, 2, 7), (m1, 1, 3, 4)], (6, 5, 11)),
            "no_show": ([(r1, 0, 4, 4)], (0, 4, 4)),
        }
        for report_type, (rows, totals) in expected.items():
            with self.subTest(report_type=report_type):
                payload = self._report(report_type)
                self.assertEqual(
                    [(row["name"], row["male"], row["female"], row["visitors"]) for row in payload["rows"]],
                    rows,
                )
                self.assertEqual(
                    (payload["totals"]["male"], payload["totals"]["female"], payload["totals"]["visitors"]),
                    totals,
                )

    def test_male_plus_female_equals_visitors_on_every_row_and_total(self):
        for report_type in self.TABS:
            with self.subTest(report_type=report_type):
                payload = self._report(report_type)
                self.assertTrue(payload["rows"])
                for row in payload["rows"]:
                    self.assertEqual(row["male"] + row["female"], row["visitors"], row)
                totals = payload["totals"]
                self.assertEqual(totals["male"] + totals["female"], totals["visitors"])
                self.assertEqual(totals["male"], sum(row["male"] for row in payload["rows"]))
                self.assertEqual(totals["female"], sum(row["female"] for row in payload["rows"]))

    def test_yearly_tab_gives_one_row_per_year(self):
        payload = self._report("yearly", year="all")

        # 2026: MF-01 to MF-03, 11 visitors, none discounted -> 11 x 80.
        # 2027: MF-05 alone, 4 visitors, 1 discounted -> 3 x 80 + 64.
        self.assertEqual(
            [(row["id"], row["name"], row["male"], row["female"], row["visitors"], row["revenue"])
             for row in payload["rows"]],
            [(2026, "2026", 6, 5, 11, 880), (2027, "2027", 2, 2, 4, 304)],
        )
        totals = payload["totals"]
        self.assertEqual(
            (totals["male"], totals["female"], totals["visitors"], totals["revenue"]), (8, 7, 15, 1184)
        )
        self.assertEqual(totals["male"] + totals["female"], totals["visitors"])

    def test_yearly_tab_respects_the_year_filter(self):
        for year, expected in (
            ("2026", [(2026, 11)]), ("2027", [(2027, 4)]), ("2025", []), ("all", [(2026, 11), (2027, 4)]),
        ):
            with self.subTest(year=year):
                payload = self._report("yearly", year=year)
                self.assertEqual([(row["id"], row["visitors"]) for row in payload["rows"]], expected)

    def test_2027_returns_only_the_2027_record_on_every_visitor_tab(self):
        r0 = self.resorts[0].resort_name
        expected = {
            "daily": [("Sep 21, 2027", 2, 2, 4, 304)],
            "monthly": [("September 2027", 2, 2, 4, 304)],
            "yearly": [("2027", 2, 2, 4, 304)],
            "resort": [(r0, 2, 2, 4, 304)],
            "origin": [("Quezon", 2, 2, 4, 304)],
            "purpose": [(self.purposes[0].name, 2, 2, 4, 304)],
            "transport": [(self.modes[0].name, 2, 2, 4, 304)],
            "no_show": [],
        }
        for report_type, rows in expected.items():
            with self.subTest(report_type=report_type):
                payload = self._report(report_type, year="2027")
                self.assertEqual(
                    [(r["name"], r["male"], r["female"], r["visitors"], r["revenue"]) for r in payload["rows"]],
                    rows,
                )
                self.assertEqual(payload["filters"]["year"], "2027")

    def test_query_count_per_tab(self):
        for report_type in self.TABS:
            with self.subTest(report_type=report_type):
                with CaptureQueriesContext(connection) as queries:
                    self._report(report_type)
                self.assertEqual(len(queries), self.QUERIES[report_type])


class ReportingYearTests(TestCase):
    """The year filters come from the data; a bad year or report type is a 400."""

    REPORT_ENDPOINTS = (
        "/api/reports/",
        "/api/dashboard/",
        "/api/arrival-monitoring/",
        "/api/arrival-monitoring/export/",
        "/api/booking-management/",
    )

    @classmethod
    def setUpTestData(cls):
        ensure_test_reference_tables()
        cls.quezon = Province.objects.get(name="Quezon")

    def _record(self, survey_id, day, visitors=2):
        return TouristRecord.objects.create(
            survey_id=survey_id,
            full_name="Group",
            contact_number="09170000000",
            country=Country.objects.get(name="Philippines"),
            region=self.quezon.region,
            province=self.quezon,
            arrival_date=day,
            resort=Resort.objects.order_by("resort_id").first(),
            itinerary=Itinerary.objects.first(),
            travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(),
            visit_purpose=VisitPurpose.objects.first(),
            total_visitors=visitors,
            filipino_count=visitors,
            total_male=visitors,
            age_8_59=visitors,
            status="arrived",
        )

    def _client(self):
        user = User.objects.create_user(username="years_admin", password="Years@12345")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        return client

    def test_no_records_still_lists_the_current_year(self):
        from .services.tourism import current_reporting_year, get_reporting_years

        self.assertEqual(get_reporting_years(), [current_reporting_year()])

    def test_years_come_from_the_data_newest_first(self):
        from .services.tourism import current_reporting_year, get_reporting_years

        self._record("RY-01", "2027-09-21")
        self._record("RY-02", "2024-03-01")
        self._record("RY-03", "2024-11-30")

        expected = sorted({"2027", "2024", current_reporting_year()}, reverse=True)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(get_reporting_years(), expected)
        self.assertEqual(len(queries), 1)

    def test_bootstrap_sends_the_reporting_years(self):
        from .services.tourism import get_reporting_years

        self._record("RY-01", "2027-09-21")
        response = self._client().get("/api/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["reportingYears"], get_reporting_years())
        self.assertIn("2027", response.json()["reportingYears"])

    def test_a_missing_year_is_the_current_year(self):
        from .services.tourism import current_reporting_year, get_reporting_year

        for params in ({}, {"year": ""}, {"year": "  "}):
            with self.subTest(params=params):
                self.assertEqual(get_reporting_year(params), current_reporting_year())

    def test_a_junk_year_is_rejected_on_every_report_endpoint(self):
        self._record("RY-01", "2026-09-21")
        client = self._client()
        for year in ("2027x", "abcd", "20", "02026", "２０２６", "-2026", "all-years"):
            for endpoint in self.REPORT_ENDPOINTS:
                with self.subTest(year=year, endpoint=endpoint):
                    response = client.get(endpoint, {"year": year, "date": "all"})
                    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                    self.assertIn("Unknown year", response.json()["detail"])
                    self.assertNotIn("rows", response.json())

    def test_every_report_tab_rejects_a_junk_year(self):
        from .services.tourism import REPORT_TYPES, ReportParameterError, build_reports_payload

        for report_type in REPORT_TYPES:
            with self.subTest(report_type=report_type):
                with self.assertRaises(ReportParameterError):
                    build_reports_payload({"type": report_type, "year": "2027x", "include_questions": "false"})

    def test_an_unknown_report_type_is_rejected_not_answered_with_resorts(self):
        self._record("RY-01", "2026-09-21")
        client = self._client()

        response = client.get("/api/reports/", {"type": "boat", "year": "2026"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Unknown report type "boat"', response.json()["detail"])
        self.assertNotIn("rows", response.json())

    def test_no_report_type_is_still_the_resort_report(self):
        from .services.tourism import build_reports_payload

        self._record("RY-01", "2026-09-21")

        payload = build_reports_payload({"year": "2026", "include_questions": "false"})

        self.assertEqual(payload["type"], "resort")
        self.assertEqual(len(payload["rows"]), 1)


class MobileFeedbackPhotoUploadTests(TestCase):
    """Feedback with photos, posted the way the mobile app's _multipartPost sends it."""

    URL = "/api/mobile/tourism/feedback/"
    JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 64

    def setUp(self):
        ensure_test_reference_tables()
        self.client = APIClient()
        self.resort = Resort.objects.first()

        from unittest.mock import MagicMock

        self.storage = MagicMock()
        self.storage.save.side_effect = lambda name, _file: name
        self.storage.url.side_effect = lambda name: f"https://storage.test/{name}"
        patcher = patch("api.services.upload.default_storage", self.storage)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _fields(self):
        # Same string fields as ApiService.submitFeedback
        return {
            "destination_id": str(self.resort.resort_id),
            "reviewer": "Mobile Tester",
            "rating": "4",
            "message": "Nice place",
            "cleanliness_rating": "5",
            "sanitation_comment": "Clean",
        }

    def _photo(self, index=0, name=None, content=None, content_type="image/jpeg"):
        return SimpleUploadedFile(
            name or f"report_1700000000000_{index}.jpg",
            content if content is not None else self.JPEG,
            content_type=content_type,
        )

    def _post(self, photos):
        data = self._fields()
        data["photo"] = photos  # one 'photo' part per image, like the app
        return self.client.post(self.URL, data, format="multipart")

    def test_one_photo_is_uploaded_and_urls_are_stored(self):
        response = self._post([self._photo(0)])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        photos = response.json()["photos"]
        self.assertEqual(len(photos), 1)
        self.assertRegex(photos[0], r"^https://storage\.test/feedback/[0-9a-f]{32}\.jpg$")
        entry = FeedbackEntry.objects.get(reviewer="Mobile Tester")
        self.assertEqual(entry.photos, photos)
        self.assertNotIn("report_1700000000000", photos[0])  # storage name is a UUID, not the client's

    def test_two_photos_are_uploaded(self):
        png = self._photo(
            1,
            "report_1700000000000_1.png",
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * 32,
            content_type="image/png",
        )
        response = self._post([self._photo(0), png])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        photos = response.json()["photos"]
        self.assertEqual(len(photos), 2)
        self.assertEqual(len(set(photos)), 2)
        self.assertTrue(photos[1].endswith(".png"))
        self.assertEqual(self.storage.save.call_count, 2)

    def test_five_photos_allowed_six_rejected(self):
        ok = self._post([self._photo(i) for i in range(5)])
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.content)
        self.assertEqual(len(ok.json()["photos"]), 5)

        self.storage.save.reset_mock()
        too_many = self._post([self._photo(i) for i in range(6)])
        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("maximum of 5 photos", too_many.json()["detail"])
        self.storage.save.assert_not_called()

    def test_feedback_without_photos_still_works(self):
        as_json = self.client.post(self.URL, self._fields(), format="json")
        self.assertEqual(as_json.status_code, status.HTTP_201_CREATED, as_json.content)
        self.assertEqual(as_json.json()["photos"], [])

        as_multipart = self.client.post(self.URL, self._fields(), format="multipart")
        self.assertEqual(as_multipart.status_code, status.HTTP_201_CREATED, as_multipart.content)
        self.assertEqual(as_multipart.json()["photos"], [])
        self.storage.save.assert_not_called()

    def test_json_body_with_photo_url_list_still_works(self):
        payload = self._fields()
        payload["photos"] = ["https://storage.test/feedback/existing.jpg"]
        response = self.client.post(self.URL, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.json()["photos"], ["https://storage.test/feedback/existing.jpg"])

    def test_non_image_file_is_rejected_with_clear_400(self):
        response = self._post([self._photo(name="notes.txt", content=b"hello", content_type="text/plain")])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "Only JPG, PNG, and WebP images are allowed.")
        self.assertFalse(FeedbackEntry.objects.filter(reviewer="Mobile Tester").exists())
        self.storage.save.assert_not_called()

    def test_file_that_is_not_really_an_image_is_rejected(self):
        response = self._post([self._photo(name="photo.jpg", content=b"%PDF-1.4 not an image at all")])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "The uploaded file is not a valid image.")
        self.storage.save.assert_not_called()

    def test_generic_octet_stream_is_not_accepted_as_an_image(self):
        octet = "application/octet-stream"
        # no image extension -> rejected even though the bytes look like a JPEG
        no_ext = self._post([self._photo(name="camera_raw", content_type=octet)])
        self.assertEqual(no_ext.status_code, status.HTTP_400_BAD_REQUEST)
        # image extension but arbitrary bytes -> rejected
        junk = self._post([self._photo(name="photo.jpg", content=b"MZ\x90\x00 arbitrary binary", content_type=octet)])
        self.assertEqual(junk.status_code, status.HTTP_400_BAD_REQUEST)
        self.storage.save.assert_not_called()

        # a real JPEG named .jpg but sent as octet-stream (some Android clients) is still fine
        real = self._post([self._photo(name="photo.jpg", content_type=octet)])
        self.assertEqual(real.status_code, status.HTTP_201_CREATED, real.content)

    def test_oversized_photo_is_rejected(self):
        big = self._photo(content=b"\xff\xd8\xff" + b"0" * (5 * 1024 * 1024))
        response = self._post([big])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "File size exceeds 5MB limit.")
        self.storage.save.assert_not_called()

    def test_one_bad_photo_stores_nothing(self):
        bad = self._photo(1, name="notes.txt", content=b"x", content_type="text/plain")
        response = self._post([self._photo(0), bad])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.storage.save.assert_not_called()
        self.assertFalse(FeedbackEntry.objects.filter(reviewer="Mobile Tester").exists())

    def test_valid_photo_larger_than_django_memory_threshold_is_accepted(self):
        # Uploads over 2.5 MB are spooled to a temp file by Django. Real phone photos are often
        # 2.5-5 MB, so this must work (copying request.data used to crash on such files).
        photo = self._photo(content=self.JPEG + b"\x00" * (3 * 1024 * 1024))
        response = self._post([photo])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(len(response.json()["photos"]), 1)
        self.storage.save.assert_called_once()

    def test_storage_failure_returns_503_and_no_entry(self):
        self.storage.save.side_effect = IOError("Storage quota exceeded")
        response = self._post([self._photo(0)])

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("Image upload failed", response.json()["detail"])
        self.assertFalse(FeedbackEntry.objects.filter(reviewer="Mobile Tester").exists())


class AmbulantFoodVendorBusinessTypeTests(TestCase):
    """Migration 0034: the client-confirmed Ambulant Food Vendor type, with no requirements yet."""

    NAME = "Ambulant Food Vendor"

    def setUp(self):
        import importlib

        self.migration = importlib.import_module(
            "api.migrations.0034_add_ambulant_food_vendor_business_type"
        )

    def _run_migration(self):
        from django.apps import apps

        self.migration.add_ambulant_food_vendor(apps, None)

    def _ambulant(self):
        return SanitaryBusinessType.objects.get(name=self.NAME)

    def test_type_exists_with_monthly_inspections(self):
        ambulant = self._ambulant()
        self.assertEqual(ambulant.inspection_frequency, "monthly")
        self.assertEqual(ambulant.description, "")

    def test_type_has_no_requirements_for_sp_or_large(self):
        ambulant = self._ambulant()
        self.assertEqual(ambulant.requirements.count(), 0)
        for permit_size in ("sp", "large"):
            self.assertFalse(ambulant.requirements.filter(permit_size=permit_size).exists())

    def test_running_again_does_not_duplicate_or_change_the_row(self):
        before = self._ambulant()
        self._run_migration()
        self.assertEqual(SanitaryBusinessType.objects.filter(name__iexact=self.NAME).count(), 1)
        self.assertEqual(self._ambulant().pk, before.pk)

    def test_existing_row_in_other_casing_is_left_untouched(self):
        SanitaryBusinessType.objects.filter(name=self.NAME).delete()
        existing = SanitaryBusinessType.objects.create(
            name="ambulant food vendor", inspection_frequency="quarterly"
        )

        self._run_migration()

        self.assertEqual(SanitaryBusinessType.objects.filter(name__iexact=self.NAME).count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.name, "ambulant food vendor")
        self.assertEqual(existing.inspection_frequency, "quarterly")

    def test_seed_requirement_sync_adds_no_requirements_for_sp_or_large(self):
        from .seed_data import SANITARY_REQUIREMENTS
        from .seeders import sync_sanitary_business_types_and_requirements

        self.assertFalse(
            any(group["business_type"] == self.NAME for group in SANITARY_REQUIREMENTS)
        )

        sync_sanitary_business_types_and_requirements()

        ambulant = self._ambulant()
        self.assertEqual(ambulant.inspection_frequency, "monthly")
        self.assertEqual(ambulant.requirements.count(), 0)

    def test_bootstrap_offers_the_type_with_no_requirements(self):
        client = APIClient()
        user = User.objects.create_user(username="ambulant_staff", password="Password@123")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")

        response = client.get("/api/sanitation/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ambulant = [t for t in response.json()["businessTypes"] if t["name"] == self.NAME]
        self.assertEqual(len(ambulant), 1)
        self.assertEqual(ambulant[0]["inspection_frequency"], "monthly")
        self.assertEqual(ambulant[0]["requirements"], [])

    def test_establishment_registered_as_sp_or_large_gets_no_requirements(self):
        client = APIClient()
        user = User.objects.create_user(username="ambulant_register", password="Password@123")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        ambulant = self._ambulant()

        for permit_size in ("sp", "large"):
            response = client.post(
                "/api/sanitation/establishments/",
                {
                    "business_name": f"Ambulant Vendor {permit_size}",
                    "owner_name": "Ana Reyes",
                    "business_type": ambulant.id,
                    "permit_size": permit_size,
                    "barangay": "Daungan",
                    "address": "1 Test St",
                    "contact_number": "09170000000",
                    "latitude": 14.188,
                    "longitude": 121.732,
                    "has_permit": False,
                    "permit_number": "",
                    "permit_issued_date": None,
                    "permit_expiry_date": None,
                    "compliance_status": "no_permit",
                    "permit_status": "no_permit",
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
            created = SanitaryEstablishment.objects.get(pk=response.data["id"])
            self.assertEqual(created.business_type_id, ambulant.id)
            self.assertEqual(created.permit_size, permit_size)

        self.assertEqual(ambulant.requirements.count(), 0)


class InspectionDraftIsolationTests(TestCase):
    """A draft is work in progress, so it must not touch live records.

    Saving a draft must leave the establishment's compliance and permit status
    alone and raise no violation notification. Finalizing that same draft
    applies the result exactly once.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(
            username="draft_test_admin",
            password="Password@123",
            email="draft-admin@test.local",
        )
        UserProfile.objects.create(user=self.admin_user, role=ROLE_ADMIN)

        self.sanitation_user = User.objects.create_user(
            username="draft_test_sanitation",
            password="Password@123",
            email="draft-sanitation@test.local",
        )
        UserProfile.objects.create(user=self.sanitation_user, role=ROLE_SANITATION)

        self.token = Token.objects.create(user=self.sanitation_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        self.btype = SanitaryBusinessType.objects.create(
            name="Draft Test Cafe",
            inspection_frequency="monthly",
        )
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Draft Street Cafe",
            owner_name="Owner Ana",
            business_type=self.btype,
            barangay="Poblacion",
            address="12 Quezon St",
            compliance_status="good_standing",
            permit_status="active",
        )

    def violation_payload(self, is_draft):
        return {
            "establishment": self.establishment.id,
            "inspector_name": "Inspector Test",
            "inspection_date": "2026-09-11",
            "status_after_inspection": "violation",
            "findings": "Draft in progress",
            "is_draft": is_draft,
            "checklist_items": [
                {"requirement_name": "Pest Control", "is_complied": False},
            ],
        }

    def notification_count(self):
        return Notification.objects.filter(
            recipient_user__in=[self.admin_user, self.sanitation_user]
        ).count()

    def assertEstablishmentUntouched(self):
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "good_standing")
        self.assertEqual(self.establishment.permit_status, "active")
        self.assertEqual(self.notification_count(), 0)

    def test_saving_a_draft_leaves_the_establishment_alone(self):
        response = self.client.post(
            "/api/sanitation/inspections/",
            self.violation_payload(is_draft=True),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.json()["is_draft"])
        self.assertEstablishmentUntouched()

    def test_updating_a_draft_leaves_the_establishment_alone(self):
        created = self.client.post(
            "/api/sanitation/inspections/",
            self.violation_payload(is_draft=True),
            format="json",
        )
        inspection_id = created.json()["id"]

        payload = self.violation_payload(is_draft=True)
        payload["findings"] = "Still drafting"
        response = self.client.put(
            f"/api/sanitation/inspections/{inspection_id}/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEstablishmentUntouched()

    def test_mobile_draft_leaves_the_establishment_alone(self):
        response = self.client.post(
            "/api/mobile/sanitation/inspections/",
            self.violation_payload(is_draft=True),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEstablishmentUntouched()

    def test_finalizing_a_draft_applies_it_once(self):
        created = self.client.post(
            "/api/sanitation/inspections/",
            self.violation_payload(is_draft=True),
            format="json",
        )
        inspection_id = created.json()["id"]
        self.assertEstablishmentUntouched()

        response = self.client.put(
            f"/api/sanitation/inspections/{inspection_id}/",
            self.violation_payload(is_draft=False),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "violation")
        self.assertEqual(self.establishment.permit_status, "suspended")
        self.assertEqual(
            Notification.objects.filter(recipient_user=self.admin_user).count(), 1
        )
        self.assertEqual(
            Notification.objects.filter(recipient_user=self.sanitation_user).count(), 1
        )

    def test_a_final_inspection_still_applies_immediately(self):
        response = self.client.post(
            "/api/sanitation/inspections/",
            self.violation_payload(is_draft=False),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "violation")
        self.assertEqual(self.establishment.permit_status, "suspended")
        self.assertEqual(
            Notification.objects.filter(recipient_user=self.admin_user).count(), 1
        )


class InspectionNextDueDateTests(TestCase):
    """The next due date follows the business type's inspection frequency.

    annual -> +1 year, quarterly -> +3 months, monthly -> +1 month. An
    unrecognised frequency yields no suggestion rather than a silent monthly
    one, and a date sent by the client always wins.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="due_date_sanitation",
            password="Password@123",
            email="due@test.local",
        )
        UserProfile.objects.create(user=self.user, role=ROLE_SANITATION)
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def establishment_with(self, frequency, name):
        btype = SanitaryBusinessType.objects.create(
            name=f"Due Date {name}",
            inspection_frequency=frequency,
        )
        return SanitaryEstablishment.objects.create(
            business_name=f"Due Date {name} Shop",
            owner_name="Owner",
            business_type=btype,
            barangay="Poblacion",
            address="1 Main St",
            compliance_status="good_standing",
            permit_status="active",
        )

    def post_inspection(self, establishment, **extra):
        payload = {
            "establishment": establishment.id,
            "inspector_name": "Inspector Test",
            "inspection_date": "2026-03-15",
            "status_after_inspection": "good_standing",
        }
        payload.update(extra)
        return self.client.post(
            "/api/sanitation/inspections/", payload, format="json"
        )

    def test_annual_adds_one_year(self):
        establishment = self.establishment_with("annual", "Annual")
        response = self.post_inspection(establishment)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["next_due_date"], "2027-03-15")

    def test_quarterly_adds_three_months(self):
        establishment = self.establishment_with("quarterly", "Quarterly")
        response = self.post_inspection(establishment)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["next_due_date"], "2026-06-15")

    def test_monthly_adds_one_month(self):
        establishment = self.establishment_with("monthly", "Monthly")
        response = self.post_inspection(establishment)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["next_due_date"], "2026-04-15")

    def test_unknown_frequency_suggests_nothing(self):
        establishment = self.establishment_with("monthly", "Unknown")
        SanitaryBusinessType.objects.filter(
            pk=establishment.business_type_id
        ).update(inspection_frequency="fortnightly")

        response = self.post_inspection(establishment)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.json()["next_due_date"])

    def test_explicit_next_due_date_wins(self):
        establishment = self.establishment_with("annual", "Explicit")
        response = self.post_inspection(establishment, next_due_date="2026-05-01")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["next_due_date"], "2026-05-01")

    def test_a_draft_is_not_given_a_due_date(self):
        establishment = self.establishment_with("annual", "Draft")
        response = self.post_inspection(establishment, is_draft=True)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.json()["next_due_date"])

    def test_month_end_rolls_back_to_a_real_date(self):
        establishment = self.establishment_with("monthly", "MonthEnd")
        response = self.post_inspection(
            establishment, inspection_date="2026-01-31"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["next_due_date"], "2026-02-28")


class SanitationInspectorListTests(TestCase):
    """The inspector picker needs names only, and only to sanitation staff.

    It must expose no contact details, must list active sanitation and admin
    accounts, and must be closed to every other role.
    """

    ENDPOINT = "/api/sanitation/inspectors/"

    def setUp(self):
        self.client = APIClient()

        self.sanitation_user = self.make_user(
            "insp_list_sanitation", ROLE_SANITATION, first="Ana", last="Reyes"
        )
        self.admin_user = self.make_user(
            "insp_list_admin", ROLE_ADMIN, first="Ben", last="Cruz"
        )
        self.nameless_user = self.make_user("insp_list_nameless", ROLE_SANITATION)
        self.inactive_user = self.make_user(
            "insp_list_inactive", ROLE_SANITATION, first="Old", last="Staff"
        )
        self.inactive_user.is_active = False
        self.inactive_user.save(update_fields=["is_active"])

        self.tourism_user = self.make_user("insp_list_tourism", ROLE_TOURISM)
        self.tourist_user = self.make_user("insp_list_tourist", ROLE_TOURIST)
        self.establishment_user = self.make_user(
            "insp_list_establishment", ROLE_ESTABLISHMENT
        )

    def make_user(self, username, role, first="", last=""):
        user = User.objects.create_user(
            username=username,
            password="Password@123",
            email=f"{username}@test.local",
            first_name=first,
            last_name=last,
        )
        UserProfile.objects.create(user=user, role=role)
        return user

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_sanitation_staff_can_list_inspectors(self):
        self.authenticate(self.sanitation_user)
        response = self.client.get(self.ENDPOINT)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [row["name"] for row in response.json()]
        self.assertIn("Ana Reyes", names)
        self.assertIn("Ben Cruz", names)

    def test_only_id_and_name_are_exposed(self):
        self.authenticate(self.sanitation_user)
        response = self.client.get(self.ENDPOINT)

        for row in response.json():
            self.assertEqual(set(row.keys()), {"id", "name"})

        body = response.content.decode()
        self.assertNotIn("@test.local", body)
        self.assertNotIn("date_joined", body)

    def test_an_account_without_a_name_falls_back_to_its_username(self):
        self.authenticate(self.sanitation_user)
        response = self.client.get(self.ENDPOINT)

        names = [row["name"] for row in response.json()]
        self.assertIn("insp_list_nameless", names)

    def test_inactive_accounts_are_excluded(self):
        self.authenticate(self.sanitation_user)
        response = self.client.get(self.ENDPOINT)

        names = [row["name"] for row in response.json()]
        self.assertNotIn("Old Staff", names)

    def test_other_roles_are_refused(self):
        for user in [
            self.tourism_user,
            self.tourist_user,
            self.establishment_user,
        ]:
            with self.subTest(user=user.username):
                self.authenticate(user)
                response = self.client.get(self.ENDPOINT)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_refused(self):
        self.client.credentials()
        response = self.client.get(self.ENDPOINT)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_the_endpoint_is_read_only(self):
        self.authenticate(self.sanitation_user)
        response = self.client.post(self.ENDPOINT, {"name": "New"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class InspectionStatusRequiredTests(TestCase):
    """A finished inspection must say what it found.

    Silently defaulting a missing status to good_standing recorded a
    compliance judgement nobody made, so a final inspection without one is now
    rejected. Drafts are still work in progress and may omit it.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="status_required_sanitation",
            password="Password@123",
            email="status@test.local",
        )
        UserProfile.objects.create(user=self.user, role=ROLE_SANITATION)
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        self.btype = SanitaryBusinessType.objects.create(
            name="Status Required Cafe",
            inspection_frequency="monthly",
        )
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Status Required Shop",
            owner_name="Owner",
            business_type=self.btype,
            barangay="Poblacion",
            address="1 Main St",
            compliance_status="upcoming",
            permit_status="renewal_due",
        )

    def payload(self, **extra):
        data = {
            "establishment": self.establishment.id,
            "inspector_name": "Inspector Test",
            "inspection_date": "2026-03-15",
        }
        data.update(extra)
        return data

    def post(self, endpoint, **extra):
        return self.client.post(endpoint, self.payload(**extra), format="json")

    def test_web_final_without_status_is_rejected(self):
        response = self.post("/api/sanitation/inspections/", is_draft=False)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status_after_inspection", response.json())

        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "upcoming")
        self.assertEqual(SanitaryInspection.objects.count(), 0)

    def test_mobile_final_without_status_is_rejected(self):
        response = self.post("/api/mobile/sanitation/inspections/", is_draft=False)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(SanitaryInspection.objects.count(), 0)

    def test_a_final_inspection_defaults_to_nothing_when_the_key_is_absent(self):
        # No is_draft key at all: the serializer still treats it as final.
        response = self.client.post(
            "/api/sanitation/inspections/", self.payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_draft_may_omit_the_status(self):
        response = self.post("/api/sanitation/inspections/", is_draft=True)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.json()["is_draft"])

    def test_a_final_with_a_status_is_accepted(self):
        response = self.post(
            "/api/sanitation/inspections/",
            is_draft=False,
            status_after_inspection="violation",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "violation")

    def test_the_mobile_client_still_works_because_it_always_sends_one(self):
        # Mirrors the payload the distributed APK sends.
        response = self.client.post(
            "/api/mobile/sanitation/inspections/",
            self.payload(
                next_due_date="2026-04-15",
                findings="",
                remarks="",
                status_after_inspection="good_standing",
                is_draft=False,
                checklist_items=[],
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_finalizing_a_draft_without_a_status_is_rejected(self):
        created = self.post("/api/sanitation/inspections/", is_draft=True)
        inspection_id = created.json()["id"]

        response = self.client.put(
            f"/api/sanitation/inspections/{inspection_id}/",
            self.payload(is_draft=False),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class NotYetInspectedStatusTests(TestCase):
    """An establishment nobody has inspected must not claim Good Standing.

    The new `not_yet_inspected` status is its own bucket: it is never counted
    as compliant, and the first finalized inspection replaces it with whatever
    the inspector actually found.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="nyi_sanitation",
            password="Password@123",
            email="nyi@test.local",
        )
        UserProfile.objects.create(user=self.user, role=ROLE_SANITATION)
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        self.btype = SanitaryBusinessType.objects.create(
            name="Not Yet Inspected Cafe",
            inspection_frequency="monthly",
        )

    def make_establishment(self, name, **extra):
        return SanitaryEstablishment.objects.create(
            business_name=name,
            owner_name="Owner",
            business_type=self.btype,
            barangay="Poblacion",
            address="1 Main St",
            **extra,
        )

    def test_a_new_establishment_starts_not_yet_inspected(self):
        establishment = self.make_establishment("Brand New Shop")

        self.assertEqual(establishment.compliance_status, "not_yet_inspected")
        self.assertEqual(
            establishment.get_compliance_status_display(), "Not Yet Inspected"
        )

    def test_the_status_is_a_valid_choice(self):
        field = SanitaryEstablishment._meta.get_field("compliance_status")
        values = [value for value, _ in field.choices]

        self.assertIn("not_yet_inspected", values)
        self.assertEqual(field.default, "not_yet_inspected")

    def test_an_explicit_status_still_wins(self):
        establishment = self.make_establishment(
            "Explicit Shop", compliance_status="violation"
        )

        self.assertEqual(establishment.compliance_status, "violation")

    def test_it_is_not_mapped_to_a_permit_status(self):
        from api.services.sanitation import PERMIT_STATUS_BY_COMPLIANCE

        self.assertNotIn("not_yet_inspected", PERMIT_STATUS_BY_COMPLIANCE)

    def test_the_status_counts_give_it_its_own_bucket(self):
        from api.services.sanitation import get_establishment_status_counts

        self.make_establishment("Never Seen One")
        self.make_establishment("Never Seen Two")
        self.make_establishment("Compliant One", compliance_status="good_standing")

        counts = get_establishment_status_counts(
            SanitaryEstablishment.objects.all()
        )

        self.assertEqual(counts["not_yet_inspected"], 2)
        self.assertEqual(counts["good"], 1)
        self.assertEqual(counts["total"], 3)

    def test_the_compliance_rate_ignores_never_inspected_records(self):
        from api.services.sanitation import build_sanitation_question_answers

        self.make_establishment("Compliant", compliance_status="good_standing")
        self.make_establishment("Violator", compliance_status="violation")
        self.make_establishment("Never Inspected")

        answers = build_sanitation_question_answers(
            SanitaryEstablishment.objects.all()
        )
        rate = next(
            item for item in answers if item["id"] == "compliance_rate"
        )

        # 1 of the 2 inspected establishments, not 1 of 3.
        self.assertIn("50.0", rate["answer"])

    def test_the_first_final_inspection_replaces_the_status(self):
        establishment = self.make_establishment("Freshly Inspected")
        self.assertEqual(establishment.compliance_status, "not_yet_inspected")

        response = self.client.post(
            "/api/sanitation/inspections/",
            {
                "establishment": establishment.id,
                "inspector_name": "Inspector Test",
                "inspection_date": "2026-03-15",
                "status_after_inspection": "for_completion",
                "is_draft": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        establishment.refresh_from_db()
        self.assertEqual(establishment.compliance_status, "for_completion")

    def test_a_draft_leaves_it_not_yet_inspected(self):
        establishment = self.make_establishment("Draft Only")

        response = self.client.post(
            "/api/sanitation/inspections/",
            {
                "establishment": establishment.id,
                "inspector_name": "Inspector Test",
                "inspection_date": "2026-03-15",
                "is_draft": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        establishment.refresh_from_db()
        self.assertEqual(establishment.compliance_status, "not_yet_inspected")


class NotYetInspectedMigrationTests(TransactionTestCase):
    """Migration 0035 changes the column definition, not the data.

    A default only applies to rows created afterwards, so every establishment
    that already carries a status must come through the migration unchanged.
    """

    migrate_from = [("api", "0034_add_ambulant_food_vendor_business_type")]
    migrate_to = [("api", "0035_add_not_yet_inspected_compliance_status")]

    def test_existing_rows_keep_their_status_across_the_migration(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        executor.loader.build_graph()

        old_apps = executor.loader.project_state(self.migrate_from).apps
        BusinessType = old_apps.get_model("api", "SanitaryBusinessType")
        Establishment = old_apps.get_model("api", "SanitaryEstablishment")

        btype = BusinessType.objects.create(
            name="Migration Proof Type", inspection_frequency="monthly"
        )
        existing = {
            "good_standing": None,
            "upcoming": None,
            "for_completion": None,
            "violation": None,
            "no_permit": None,
        }
        for value in existing:
            record = Establishment.objects.create(
                business_name=f"Migration Proof {value}",
                owner_name="Owner",
                business_type=btype,
                barangay="Poblacion",
                address="1 Main St",
                compliance_status=value,
            )
            existing[value] = record.pk

        before = dict(
            Establishment.objects.values_list("pk", "compliance_status")
        )

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        executor.loader.build_graph()

        new_apps = executor.loader.project_state(self.migrate_to).apps
        MigratedEstablishment = new_apps.get_model("api", "SanitaryEstablishment")
        after = dict(
            MigratedEstablishment.objects.values_list("pk", "compliance_status")
        )

        # Not one row changed.
        self.assertEqual(before, after)
        for value, pk in existing.items():
            self.assertEqual(after[pk], value)

        # Only rows created after the migration pick up the new default.
        fresh = MigratedEstablishment.objects.create(
            business_name="Created After Migration",
            owner_name="Owner",
            business_type_id=btype.pk,
            barangay="Poblacion",
            address="1 Main St",
        )
        self.assertEqual(fresh.compliance_status, "not_yet_inspected")


class ClientInspectionFrequencyMigrationTests(TestCase):
    """Migration 0036: inspection frequencies per the client's form, keyed by name."""

    # Production values before this migration (public bootstrap, read-only).
    PRODUCTION_BEFORE = {
        "Water Refilling Station": "monthly",
        "Agro-industrial Establishment (Poultry / Piggery Farm)": "quarterly",
        "Sub-contractor": "annual",
        "Restaurant / Food Establishment": "monthly",
        "Massage / Physical Therapy": "quarterly",
        "Public Market Stall": "monthly",
        "Food Establishment": "monthly",
        "Commercial Non Food": "monthly",
        "Drug Store": "annual",
        "Resort / Picnic Ground": "quarterly",
        "Boatman": "annual",
        "Funeral Parlor": "annual",
        "Burial Ground": "annual",
        "Private Laboratory & Clinic": "annual",
        "Karaoke / Video Bar / CSW": "monthly",
        "Ambulant Food Vendor": "monthly",
    }

    EXPECTED = {
        "Restaurant / Food Establishment": "quarterly",
        "Public Market Stall": "quarterly",
        "Food Establishment": "quarterly",
        "Sub-contractor": "quarterly",
        "Boatman": "quarterly",
        "Agro-industrial Establishment (Poultry / Piggery Farm)": "quarterly",
        "Resort / Picnic Ground": "annual",
        "Karaoke / Video Bar / CSW": "annual",
        "Funeral Parlor": "annual",
        "Burial Ground": "annual",
        "Private Laboratory & Clinic": "annual",
        "Massage / Physical Therapy": "annual",
        "Water Refilling Station": "monthly",
        "Ambulant Food Vendor": "monthly",
        # "Depends" on the client's form: unchanged.
        "Commercial Non Food": "monthly",
        "Drug Store": "annual",
    }

    def setUp(self):
        import importlib

        self.migration = importlib.import_module(
            "api.migrations.0036_set_client_inspection_frequencies"
        )
        for name, frequency in self.PRODUCTION_BEFORE.items():
            SanitaryBusinessType.objects.update_or_create(
                name=name,
                defaults={"inspection_frequency": frequency, "description": f"{name} notes"},
            )

    def _run_migration(self):
        from django.apps import apps

        self.migration.set_client_inspection_frequencies(apps, None)

    def _frequencies(self):
        return dict(SanitaryBusinessType.objects.values_list("name", "inspection_frequency"))

    def test_sets_the_client_frequencies(self):
        self._run_migration()
        frequencies = self._frequencies()
        for name, frequency in self.EXPECTED.items():
            self.assertEqual(frequencies[name], frequency, name)

    def test_running_again_changes_nothing(self):
        self._run_migration()
        first = self._frequencies()
        self._run_migration()
        self.assertEqual(self._frequencies(), first)

    def test_depends_types_and_unlisted_types_are_untouched(self):
        SanitaryBusinessType.objects.create(name="Future Type", inspection_frequency="quarterly")
        SanitaryBusinessType.objects.filter(name="Drug Store").update(inspection_frequency="quarterly")

        self._run_migration()

        frequencies = self._frequencies()
        self.assertEqual(frequencies["Future Type"], "quarterly")
        self.assertEqual(frequencies["Drug Store"], "quarterly")
        self.assertEqual(frequencies["Commercial Non Food"], "monthly")

    def test_only_inspection_frequency_changes(self):
        before = {
            row["name"]: row
            for row in SanitaryBusinessType.objects.values("id", "name", "description")
        }
        self._run_migration()
        after = {
            row["name"]: row
            for row in SanitaryBusinessType.objects.values("id", "name", "description")
        }
        self.assertEqual(before, after)

    def test_missing_names_are_skipped_without_failing(self):
        SanitaryBusinessType.objects.filter(name__in=["Boatman", "Funeral Parlor"]).delete()

        self._run_migration()

        frequencies = self._frequencies()
        self.assertNotIn("Boatman", frequencies)
        self.assertNotIn("Funeral Parlor", frequencies)
        self.assertEqual(frequencies["Sub-contractor"], "quarterly")

    def test_reverse_is_a_noop(self):
        from django.db.migrations import RunPython

        operation = self.migration.Migration.operations[0]
        self.assertIs(operation.reverse_code, RunPython.noop)

    def test_seed_data_agrees_with_the_client_frequencies(self):
        # The optional seeder (USE_SEED_DATA) update_or_creates frequencies from
        # seed_data; if it disagreed it would silently undo this migration.
        from .seed_data import SANITARY_BUSINESS_TYPES

        for row in SANITARY_BUSINESS_TYPES:
            expected = self.migration.CLIENT_INSPECTION_FREQUENCIES.get(row["name"])
            if expected is not None:
                self.assertEqual(row["inspection_frequency"], expected, row["name"])


class EstablishmentPermitNumberTests(TestCase):
    """Recording an existing sanitary permit number when registering an establishment."""

    LIST_URL = "/api/sanitation/establishments/"

    def setUp(self):
        self.client = APIClient()
        staff = User.objects.create_user(username="permit_staff", password="Password@123")
        UserProfile.objects.create(user=staff, role=ROLE_SANITATION)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=staff).key}")
        self.btype = SanitaryBusinessType.objects.create(
            name="Permit Test Store", inspection_frequency="annual"
        )

    def _payload(self, **overrides):
        payload = {
            "business_name": "Permit Test Store",
            "owner_name": "Ana Reyes",
            "business_type": self.btype.id,
            "barangay": "Daungan",
            "address": "5 Pier Rd",
            "compliance_status": "not_yet_inspected",
            "has_permit": False,
            "permit_number": "",
            "permit_issued_date": None,
            "permit_expiry_date": None,
            "permit_status": "no_permit",
        }
        payload.update(overrides)
        return payload

    def _with_permit(self, number="SP-2026-777", **overrides):
        return self._payload(
            has_permit=True,
            permit_number=number,
            permit_issued_date="2026-03-01",
            permit_expiry_date="2027-03-01",
            permit_status="active",
            **overrides,
        )

    def test_registering_with_a_permit_stores_it_trimmed_and_not_yet_inspected(self):
        response = self.client.post(self.LIST_URL, self._with_permit("  SP-2026-777  "), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = SanitaryEstablishment.objects.get(pk=response.json()["id"])
        self.assertEqual(record.permit_number, "SP-2026-777")
        self.assertTrue(record.has_permit)
        self.assertEqual(record.permit_status, "active")
        self.assertEqual(str(record.permit_expiry_date), "2027-03-01")
        self.assertEqual(record.compliance_status, "not_yet_inspected")

    def test_registering_without_a_permit_is_unchanged(self):
        response = self.client.post(self.LIST_URL, self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        record = SanitaryEstablishment.objects.get(pk=response.json()["id"])
        self.assertFalse(record.has_permit)
        self.assertEqual(record.permit_number, "")
        self.assertIsNone(record.permit_issued_date)
        self.assertEqual(record.permit_status, "no_permit")

    def test_many_records_may_have_no_permit_number(self):
        for name in ("First Store", "Second Store"):
            response = self.client.post(self.LIST_URL, self._payload(business_name=name), format="json")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

    def test_duplicate_permit_number_is_rejected_ignoring_case_and_spaces(self):
        self.client.post(self.LIST_URL, self._with_permit("SP-2026-777"), format="json")
        count_before = SanitaryEstablishment.objects.count()

        response = self.client.post(
            self.LIST_URL,
            self._with_permit("  sp-2026-777 ", business_name="Copy Store"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already recorded", " ".join(response.json()["permit_number"]))
        self.assertEqual(SanitaryEstablishment.objects.count(), count_before)

    def test_editing_a_record_to_another_records_permit_number_is_rejected(self):
        self.client.post(self.LIST_URL, self._with_permit("SP-2026-777"), format="json")
        other = self.client.post(
            self.LIST_URL, self._payload(business_name="Other Store"), format="json"
        ).json()

        response = self.client.patch(
            f"{self.LIST_URL}{other['id']}/", {"permit_number": "SP-2026-777"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_record_keeps_its_own_permit_number_when_edited(self):
        created = self.client.post(self.LIST_URL, self._with_permit(), format="json").json()

        response = self.client.patch(
            f"{self.LIST_URL}{created['id']}/",
            {"permit_number": "SP-2026-777", "remarks": "Checked"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)


class PublicPermitVerifyExposureTests(TestCase):
    """Exploit: permits/verify/ must only confirm a permit, by permit number."""

    URL = "/api/mobile/sanitation/permits/verify/"
    ALLOWED = {
        "verified": None,
        "establishment": {"business_name", "business_type_name", "barangay", "permit_number"},
        "permit": {
            "permit_number",
            "permit_status",
            "permit_status_label",
            "permit_issued_date",
            "permit_expiry_date",
        },
    }

    def setUp(self):
        btype = SanitaryBusinessType.objects.create(name="Verify Type", inspection_frequency="annual")
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Verify Bakery",
            owner_name="Hidden Owner Person",
            business_type=btype,
            barangay="Daungan",
            address="77 Private Lane",
            contact_number="09179998877",
            has_permit=True,
            permit_number="SP-2026-900",
            permit_issued_date="2026-01-05",
            permit_expiry_date="2027-01-05",
            permit_status="active",
            latitude=14.1911,
            longitude=121.7311,
        )

    def _verify(self, code):
        return APIClient().get(self.URL, {"code": code})

    def test_lookup_by_business_name_fails(self):
        self.assertEqual(self._verify("Verify Bakery").status_code, status.HTTP_404_NOT_FOUND)

    def test_lookup_by_establishment_id_fails(self):
        response = self._verify(str(self.establishment.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_permit_number_matches_trimmed_and_case_insensitive(self):
        response = self._verify("  sp-2026-900 ")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["verified"])
        self.assertEqual(response.json()["permit"]["permit_number"], "SP-2026-900")

    def test_response_keys_are_exactly_the_allowed_set(self):
        data = self._verify("SP-2026-900").json()
        self.assertEqual(set(data), set(self.ALLOWED))
        self.assertEqual(set(data["establishment"]), self.ALLOWED["establishment"])
        self.assertEqual(set(data["permit"]), self.ALLOWED["permit"])

    def test_no_owner_contact_address_or_coordinates(self):
        body = self._verify("SP-2026-900").content.decode("utf-8")
        for secret in ("Hidden Owner Person", "09179998877", "77 Private Lane", "14.1911", "121.7311"):
            self.assertFalse(secret in body, f"{secret!r} leaked")

    def test_not_found_response_reveals_nothing(self):
        response = self._verify("SP-0000-000")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(set(response.json()), {"verified", "detail"})


class PublicReportHistoryExposureTests(TestCase):
    """Exploit: report history must return only the caller's own report."""

    URL = "/api/mobile/sanitation/reports/history/"

    def setUp(self):
        self.mine = SanitaryComplaint.objects.create(
            complaint_id="SAN-HIST-0001",
            complainant_name="Reporter One",
            contact_number="0917 123 4567",
            category="Improper waste disposal",
            barangay="Poblacion",
            reported_date="2026-09-01",
            description="Mine",
        )
        self.other = SanitaryComplaint.objects.create(
            complaint_id="SAN-HIST-0002",
            complainant_name="Reporter Two",
            contact_number="09179990000",
            category="Unsafe water source",
            barangay="Daungan",
            reported_date="2026-09-02",
            description="Someone else's report",
        )

    def _history(self, **params):
        return APIClient().get(self.URL, params)

    def test_partial_contact_returns_nothing(self):
        response = self._history(contact="0917")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("rows", response.json())

    def test_partial_contact_with_a_reference_returns_nothing(self):
        response = self._history(contact="0917", reference="SAN-HIST-0001")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["rows"], [])

    def test_wrong_reference_returns_nothing(self):
        response = self._history(contact="09171234567", reference="SAN-HIST-0002")
        self.assertEqual(response.json()["rows"], [])

    def test_reference_alone_returns_nothing(self):
        response = self._history(reference="SAN-HIST-0001")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contact number and the complaint ID", response.json()["detail"])

    def test_the_correct_pair_returns_only_that_report(self):
        for contact in ("09171234567", "+63 917 123 4567", "0917-123-4567"):
            response = self._history(contact=contact, reference="san-hist-0001")
            rows = response.json()["rows"]
            self.assertEqual([row["complaint_id"] for row in rows], ["SAN-HIST-0001"], contact)
            self.assertEqual(response.json()["summary"]["total"], 1)


class SanitationStaffBootstrapTests(TestCase):
    """The staff-only home for the records the public bootstrap used to expose."""

    URL = "/api/mobile/sanitation/staff-bootstrap/"

    def setUp(self):
        btype = SanitaryBusinessType.objects.create(name="Staff Type", inspection_frequency="annual")
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Staff Only Store",
            owner_name="Owner Staffview",
            business_type=btype,
            barangay="Daungan",
            address="1 Staff St",
            contact_number="09170001234",
            permit_number="SP-2026-321",
        )
        SanitaryComplaint.objects.create(
            complaint_id="SAN-STAFF-0001",
            complainant_name="Complainant",
            contact_number="09170005555",
            category="Improper waste disposal",
            barangay="Daungan",
            reported_date="2026-09-01",
            description="Staff-only complaint",
        )
        HouseholdSanitationRecord.objects.create(
            household_code="HH-STAFF-0001",
            household_head="Household Staffview",
            barangay="Daungan",
        )

    def _client_for(self, role):
        user = User.objects.create_user(username=f"staffboot_{role}", password="Password@123")
        UserProfile.objects.create(user=user, role=role)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        return client

    def test_anonymous_is_rejected(self):
        self.assertEqual(APIClient().get(self.URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_sanitation_roles_are_forbidden(self):
        for role in (ROLE_TOURISM, ROLE_TOURIST, ROLE_ESTABLISHMENT):
            response = self._client_for(role).get(self.URL)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, role)

    def test_sanitation_and_admin_get_the_staff_records(self):
        for role in (ROLE_SANITATION, ROLE_ADMIN):
            response = self._client_for(role).get(self.URL)
            self.assertEqual(response.status_code, status.HTTP_200_OK, role)
            data = response.json()
            self.assertEqual(
                set(data),
                {"establishments", "inspections", "complaintData", "householdRecords", "notifications"},
            )
            self.assertEqual(data["establishments"][0]["owner_name"], "Owner Staffview")
            self.assertEqual(data["establishments"][0]["permit_number"], "SP-2026-321")
            self.assertEqual(set(data["complaintData"]), {"summary", "rows"})
            self.assertEqual(data["complaintData"]["rows"][0]["complaint_id"], "SAN-STAFF-0001")
            self.assertEqual(data["householdRecords"][0]["household_head"], "Household Staffview")

    def test_shapes_match_the_existing_mobile_serializers(self):
        data = self._client_for(ROLE_SANITATION).get(self.URL).json()
        self.assertEqual(
            set(data["establishments"][0]),
            {
                "id", "business_name", "owner_name", "business_type", "business_type_name",
                "inspection_frequency", "permit_size", "barangay", "address", "contact_number",
                "has_permit", "permit_number", "permit_issued_date", "permit_expiry_date",
                "compliance_status", "compliance_status_label", "permit_status",
                "permit_status_label", "latitude", "longitude", "open_complaints",
            },
        )
        self.assertEqual(set(data["complaintData"]["summary"]), {"total", "pending", "open"})


class PublicSanitationBootstrapExposureTests(TestCase):
    """Exploit: the anonymous sanitation bootstrap must expose no staff records."""

    URL = "/api/mobile/sanitation/bootstrap/"
    SECRETS = (
        "Owner Publicleak",
        "09170007777",
        "SP-2026-LEAK",
        "9 Leak Street",
        "Complaint Publicleak",
        "09170008888",
        "Household Publicleak",
        "Inspector Publicleak",
        "14.1987",
        "121.7412",
        "14.1765",
        "121.7234",
    )

    def setUp(self):
        from django.core.cache import cache

        cache.clear()  # business types and barangays are cached for 15 minutes
        self.btype = SanitaryBusinessType.objects.create(name="Leak Type", inspection_frequency="annual")
        establishment = SanitaryEstablishment.objects.create(
            business_name="Leak Store",
            owner_name="Owner Publicleak",
            business_type=self.btype,
            barangay="Daungan",
            address="9 Leak Street",
            contact_number="09170007777",
            has_permit=True,
            permit_number="SP-2026-LEAK",
            permit_expiry_date=timezone.localdate() + timedelta(days=10),
            latitude=14.1987,
            longitude=121.7412,
        )
        SanitaryInspection.objects.create(
            establishment=establishment,
            inspector_name="Inspector Publicleak",
            inspection_date=timezone.localdate(),
        )
        SanitaryComplaint.objects.create(
            complaint_id="SAN-LEAK-0001",
            complainant_name="Complaint Publicleak",
            contact_number="09170008888",
            category="Improper waste disposal",
            barangay="Daungan",
            reported_date=timezone.localdate(),
            description="Leak test",
        )
        HouseholdSanitationRecord.objects.create(
            household_code="HH-LEAK-0001",
            household_head="Household Publicleak",
            barangay="Daungan",
            latitude=14.1765,
            longitude=121.7234,
        )
        self.advisory = Notification.objects.create(
            title="Boil water advisory",
            message="Public advisory",
            notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY,
            audience_type=NOTIFICATION_AUDIENCE_PUBLIC,
            module=NOTIFICATION_MODULE_SANITATION,
            is_active=True,
        )

    def test_no_staff_record_values_are_exposed(self):
        body = APIClient().get(self.URL).content.decode("utf-8")
        for secret in self.SECRETS + ("Leak Store", "SAN-LEAK-0001", "HH-LEAK-0001"):
            self.assertFalse(secret in body, f"{secret!r} leaked")
        # No permit-expiry notice (it named the establishment and its expiry).
        self.assertFalse("permit-" in body, "permit-expiry notice leaked")
        self.assertFalse("expires on" in body, "permit-expiry notice leaked")

    def test_record_keys_are_present_but_empty_for_old_apks(self):
        data = APIClient().get(self.URL).json()
        self.assertEqual(
            set(data),
            {
                "businessTypes",
                "establishments",
                "inspections",
                "complaintData",
                "householdRecords",
                "barangays",
                "notifications",
            },
        )
        self.assertEqual(data["establishments"], [])
        self.assertEqual(data["inspections"], [])
        self.assertEqual(data["complaintData"], {"summary": {}, "rows": []})
        self.assertEqual(data["householdRecords"], [])

    def test_public_data_is_kept(self):
        data = APIClient().get(self.URL).json()
        self.assertIn("Leak Type", [item["name"] for item in data["businessTypes"]])
        self.assertIsInstance(data["barangays"], list)
        self.assertEqual(
            [item["id"] for item in data["notifications"]], [f"advisory-{self.advisory.id}"]
        )


class ThrottleSettingsTests(TestCase):
    """General throttle settings."""

    def test_login_is_not_throttled(self):
        client = APIClient()
        statuses = {
            client.post(
                "/api/auth/login/", {"username": "nobody", "password": "wrong"}, format="json"
            ).status_code
            for _ in range(12)
        }
        self.assertNotIn(status.HTTP_429_TOO_MANY_REQUESTS, statuses)

    def test_throttle_uses_a_cache_shared_across_processes(self):
        from django.conf import settings

        self.assertEqual(
            settings.CACHES["throttle"]["BACKEND"],
            "django.core.cache.backends.db.DatabaseCache",
        )


@override_settings(TRACKING_CODE_KEY="test-tracking-code-key")
class ThrottleCacheTableMigrationTests(TransactionTestCase):
    """Render runs `migrate` but not build.sh, so a migration must create the
    throttle cache table; without it every throttled request would fail with 500."""

    TABLE = "api_throttle_cache"
    BEFORE = [("api", "0036_set_client_inspection_frequencies")]

    def tearDown(self):
        # Leave the table in place for other tests whatever happened here.
        call_command("createcachetable", self.TABLE, verbosity=0)

    def _tables(self):
        return connection.introspection.table_names()

    def test_migrate_creates_the_table_and_throttled_requests_never_return_500(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.BEFORE)
        with connection.cursor() as cursor:
            cursor.execute(f"DROP TABLE IF EXISTS {self.TABLE}")
        self.assertNotIn(self.TABLE, self._tables())

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

        self.assertIn(self.TABLE, self._tables())

        client = APIClient(raise_request_exception=False)
        statuses = [
            client.post(
                "/api/mobile/sanitation/establishment-status/",
                {"code": "MBN-2222-2222"},
                format="json",
            ).status_code
            for _ in range(21)
        ]
        self.assertTrue(all(code < 500 for code in statuses), statuses)
        self.assertEqual(statuses[-1], status.HTTP_429_TOO_MANY_REQUESTS)


class CommunityReportIdentityTests(TestCase):
    """Client decision: anonymous community reports are not accepted."""

    URL = "/api/mobile/sanitation/reports/"

    def setUp(self):
        ensure_test_barangays()

    def _payload(self, **overrides):
        payload = {
            "complainant_name": "Juana Reporter",
            "contact_number": "0917 123 4567",
            "category": "Severe Sewage Overflow",
            "priority": "low",
            "barangay": "Daungan",
            "location_address": "Corner of Rizal St.",
            "description": "The septic tank is leaking at the corner.",
            "latitude": 14.19,
            "longitude": 121.73,
        }
        payload.update(overrides)
        return payload

    def _post(self, **overrides):
        return APIClient().post(self.URL, self._payload(**overrides), format="json")

    def test_missing_name_is_rejected(self):
        response = self._post(complainant_name="  ")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "Please enter your name.")
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_missing_contact_is_rejected(self):
        response = self._post(contact_number="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.json()["detail"], "Please enter a valid mobile number (e.g. 09171234567)."
        )
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_invalid_contact_is_rejected(self):
        for contact in ("12345", "0817 123 4567", "0917123456", "091712345678", "abc"):
            response = self._post(contact_number=contact)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, contact)
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_anonymous_flag_with_blank_name_is_rejected(self):
        response = self._post(complainant_name="", is_anonymous=True, anonymous=True)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_anonymous_flag_is_ignored_when_identity_is_given(self):
        response = self._post(is_anonymous=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            SanitaryComplaint.objects.get().complainant_name, "Juana Reporter"
        )

    def test_valid_report_is_saved_with_its_category_urgency(self):
        for contact in ("09171234567", "+63 917 123 4567"):
            SanitaryComplaint.objects.all().delete()
            response = self._post(contact_number=contact)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
            complaint = SanitaryComplaint.objects.get()
            self.assertEqual(complaint.complainant_name, "Juana Reporter")
            self.assertEqual(complaint.contact_number, "09171234567")
            # Urgency comes from the category, never from what the client sends.
            self.assertEqual(complaint.priority, "high")
            self.assertEqual(response.json()["priority"], "high")


class CommunityReportUrgencyTests(TestCase):
    """The server, not the reporter, decides urgency from the category."""

    URL = "/api/mobile/sanitation/reports/"

    def setUp(self):
        ensure_test_barangays()

    def _post(self, **overrides):
        payload = {
            "complainant_name": "Juana Reporter",
            "contact_number": "09171234567",
            "category": "Improper Garbage Disposal",
            "barangay": "Daungan",
            "location_address": "Purok 3",
            "description": "Garbage is piling up.",
        }
        payload.update(overrides)
        return APIClient().post(self.URL, payload, format="json")

    def test_client_urgency_is_ignored_for_a_standard_category(self):
        response = self._post(priority="high", urgency="urgent")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(SanitaryComplaint.objects.get().priority, "medium")

    def test_each_group_gets_its_urgency(self):
        expected = {
            "Contaminated Water Source": "high",
            "Hazardous / Medical Waste": "high",
            "Severe Sewage Overflow": "high",
            "Pest & Rodents Infestation": "medium",
            "Other Sanitation Concern": "low",
        }
        for index, (category, priority) in enumerate(expected.items()):
            response = self._post(
                category=category, priority="low" if priority != "low" else "high",
                contact_number=f"091700000{index:02d}",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, category)
            self.assertEqual(response.json()["priority"], priority, category)

    def test_unknown_category_is_rejected(self):
        response = self._post(category="Something Else")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.json()["detail"].lower())
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_missing_category_is_rejected(self):
        response = self._post(category="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(SanitaryComplaint.objects.exists())


class CommunityReportRateLimitTests(TestCase):
    """Server-side limits on public community reports (the device counter can be reset)."""

    URL = "/api/mobile/sanitation/reports/"

    def setUp(self):
        ensure_test_barangays()
        from django.core.cache import caches

        caches["throttle"].clear()

    def _post(self, client=None, remote_addr="127.0.0.1", **overrides):
        payload = {
            "complainant_name": "Juana Reporter",
            "contact_number": "09171234567",
            "category": "Improper Garbage Disposal",
            "barangay": "Daungan",
            "location_address": "Purok 3",
            "description": "Garbage is piling up.",
        }
        payload.update(overrides)
        return (client or APIClient()).post(
            self.URL, payload, format="json", REMOTE_ADDR=remote_addr
        )

    def test_sixth_report_from_the_same_contact_in_a_day_is_refused(self):
        for index in range(5):
            response = self._post()
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, index)

        response = self._post(contact_number="+63 917 123 4567")
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(
            response.json()["detail"],
            "This contact number has reached 5 reports today. Please try again tomorrow.",
        )
        self.assertEqual(SanitaryComplaint.objects.count(), 5)

    def test_a_different_contact_still_succeeds(self):
        for _ in range(5):
            self._post()
        response = self._post(contact_number="09179998888")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_rejected_reports_do_not_use_up_the_contact_quota(self):
        for _ in range(3):
            self.assertEqual(
                self._post(category="Not A Category").status_code,
                status.HTTP_400_BAD_REQUEST,
            )
        for index in range(5):
            self.assertEqual(self._post().status_code, status.HTTP_201_CREATED, index)

    def test_more_than_twenty_reports_an_hour_from_one_address_is_refused(self):
        for index in range(20):
            response = self._post(contact_number=f"091700{index:05d}")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, index)

        response = self._post(contact_number="09179990000")
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(
            response.json()["detail"],
            "Too many reports from this device this hour. Please try again later.",
        )

        other_address = self._post(contact_number="09179990001", remote_addr="10.0.0.2")
        self.assertEqual(other_address.status_code, status.HTTP_201_CREATED)


class CommunityReportAddressTests(TestCase):
    """The reporter's typed location is its own required field."""

    URL = "/api/mobile/sanitation/reports/"

    def setUp(self):
        ensure_test_barangays()

    def _post(self, **overrides):
        payload = {
            "complainant_name": "Juana Reporter",
            "contact_number": "09171234567",
            "category": "Improper Garbage Disposal",
            "barangay": "Daungan",
            "location_address": "  Corner of Rizal St.  ",
            "description": "Garbage is piling up.",
        }
        payload.update(overrides)
        return APIClient().post(self.URL, payload, format="json")

    def test_missing_address_is_rejected(self):
        for value in ("", "   "):
            response = self._post(location_address=value)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, repr(value))
            detail = response.json()["detail"]
            self.assertEqual(detail, "Please enter the location or address of the problem.")
        # The field left out entirely.
        response = APIClient().post(
            self.URL,
            {
                "complainant_name": "Juana Reporter",
                "contact_number": "09171234567",
                "category": "Improper Garbage Disposal",
                "barangay": "Daungan",
                "description": "Garbage is piling up.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_address_is_saved_to_its_field_and_description_is_unchanged(self):
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        complaint = SanitaryComplaint.objects.get()
        self.assertEqual(complaint.location_address, "Corner of Rizal St.")
        self.assertEqual(complaint.description, "Garbage is piling up.")
        self.assertEqual(response.json()["location_address"], "Corner of Rizal St.")


class CommunityReportRateLimitMessageTests(TestCase):
    """429s carry only the bilingual text; the wait is in Retry-After."""

    URL = "/api/mobile/sanitation/reports/"

    def setUp(self):
        ensure_test_barangays()
        from django.core.cache import caches

        caches["throttle"].clear()

    def _post(self, contact, remote_addr="127.0.0.1"):
        return APIClient().post(
            self.URL,
            {
                "complainant_name": "Juana Reporter",
                "contact_number": contact,
                "category": "Improper Garbage Disposal",
                "barangay": "Daungan",
                "location_address": "Purok 3",
                "description": "Garbage is piling up.",
            },
            format="json",
            REMOTE_ADDR=remote_addr,
        )

    def test_contact_limit_detail_is_exactly_the_bilingual_message(self):
        from .throttles import CommunityReportContactRateThrottle

        for _ in range(5):
            self._post("09171234567")
        response = self._post("09171234567")

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.json()["detail"], CommunityReportContactRateThrottle.message)
        self.assertGreater(int(response["Retry-After"]), 0)

    def test_ip_limit_detail_is_exactly_the_bilingual_message(self):
        from .throttles import CommunityReportIpRateThrottle

        for index in range(20):
            self._post(f"091700{index:05d}", remote_addr="10.9.9.9")
        response = self._post("09179990000", remote_addr="10.9.9.9")

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.json()["detail"], CommunityReportIpRateThrottle.message)
        self.assertGreater(int(response["Retry-After"]), 0)


def _community_report_payload(**overrides):
    payload = {
        "complainant_name": "Juana Reporter",
        "contact_number": "09171234567",
        "category": "Improper Garbage Disposal",
        "barangay": "Daungan",
        "location_address": "Purok 3",
        "description": "Garbage is piling up.",
    }
    payload.update(overrides)
    return payload


class CommunityReportIdempotencyTests(TestCase):
    """Resending the same form (e.g. after a timeout) never creates a second report."""

    URL = "/api/mobile/sanitation/reports/"
    SID = "7f1c2a9e-4b3d-4e8f-9a1b-2c3d4e5f6a7b"

    def setUp(self):
        ensure_test_barangays()
        from django.core.cache import caches

        caches["throttle"].clear()

    def _post(self, **overrides):
        return APIClient().post(self.URL, _community_report_payload(**overrides), format="json")

    def test_same_id_twice_creates_one_report_and_returns_it(self):
        first = self._post(client_submission_id=self.SID)
        second = self._post(client_submission_id=self.SID)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.content)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(SanitaryComplaint.objects.count(), 1)
        self.assertEqual(SanitaryComplaint.objects.get().client_submission_id, self.SID)

    def test_a_new_id_creates_a_new_report(self):
        self._post(client_submission_id=self.SID)
        response = self._post(client_submission_id="another-form-fill-0001")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SanitaryComplaint.objects.count(), 2)

    def test_missing_id_is_still_accepted(self):
        for _ in range(2):
            self.assertEqual(self._post().status_code, status.HTTP_201_CREATED)
        self.assertEqual(SanitaryComplaint.objects.count(), 2)
        self.assertTrue(
            all(value is None for value in SanitaryComplaint.objects.values_list("client_submission_id", flat=True))
        )

    def test_resending_is_not_blocked_when_the_contact_is_at_its_limit(self):
        for index in range(5):
            response = self._post(client_submission_id=f"fill-{index}")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, index)
        self.assertEqual(self._post(client_submission_id="fill-5").status_code, 429)

        resend = self._post(client_submission_id="fill-4")
        self.assertEqual(resend.status_code, status.HTTP_200_OK, resend.content)
        self.assertEqual(SanitaryComplaint.objects.count(), 5)

    def test_resending_does_not_use_up_the_ip_limit(self):
        self._post(client_submission_id=self.SID)
        for _ in range(25):
            self.assertEqual(
                self._post(client_submission_id=self.SID).status_code, status.HTTP_200_OK
            )
        response = self._post(client_submission_id="fresh", contact_number="09179998888")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class _LargePhotoMixin:
    """Photos bigger than Django's in-memory upload limit (2.5 MB).

    Such a photo is spooled to a temporary file, and a request with one used to
    fail with 500 "cannot pickle 'BufferedRandom' instances" (APK 1.0.3 on a
    real phone, 2026-09-27) because the view deep-copied request.data.
    """

    LARGE = 3 * 1024 * 1024
    JPEG_HEAD = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    PNG_HEAD = b"\x89PNG\r\n\x1a\n"

    def setUp(self):
        from unittest.mock import MagicMock

        self.storage = MagicMock()
        self.storage.save.side_effect = lambda name, _file: name
        self.storage.url.side_effect = lambda name: f"https://storage.test/{name}"
        patcher = patch("api.services.upload.default_storage", self.storage)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _photo(self, head, size, name, content_type):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return SimpleUploadedFile(name, head + b"\x00" * (size - len(head)), content_type=content_type)


class CommunityReportLargePhotoTests(_LargePhotoMixin, TestCase):
    URL = "/api/mobile/sanitation/reports/"
    SID = "0d6f3b0e-2f4a-4c1d-8e5b-9a7c6b5d4e3f"

    def setUp(self):
        super().setUp()
        ensure_test_barangays()
        from django.core.cache import caches

        caches["throttle"].clear()

    def _post(self, photo, **overrides):
        # Same shape as ApiService._multipartPost: string fields plus one
        # 'photo' part per image.
        data = _community_report_payload(client_submission_id=self.SID, **overrides)
        data["photo"] = [photo]
        return APIClient().post(self.URL, data, format="multipart")

    def _assert_saved_with_photo(self, response, filename_suffix):
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        complaint = SanitaryComplaint.objects.get()
        self.assertEqual(complaint.client_submission_id, self.SID)
        self.assertTrue(complaint.photo_documentation.endswith(filename_suffix))
        self.assertEqual(self.storage.save.call_count, 1)

    def test_a_large_jpeg_is_saved(self):
        photo = self._photo(self.JPEG_HEAD, self.LARGE, "report_1700000000000_0.jpg", "image/jpeg")
        self._assert_saved_with_photo(self._post(photo), ".jpg")

    def test_a_large_png_is_saved(self):
        photo = self._photo(self.PNG_HEAD, self.LARGE, "report_1700000000000_0.png", "image/png")
        self._assert_saved_with_photo(self._post(photo), ".png")

    def test_a_small_photo_is_still_saved(self):
        photo = self._photo(self.JPEG_HEAD, 200 * 1024, "report_1700000000000_0.jpg", "image/jpeg")
        self._assert_saved_with_photo(self._post(photo), ".jpg")

    def test_resending_a_large_photo_returns_the_saved_report(self):
        make = lambda: self._photo(self.JPEG_HEAD, self.LARGE, "report_1700000000000_0.jpg", "image/jpeg")
        first = self._post(make())
        second = self._post(make())

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.content)
        self.assertEqual(second.json()["complaint_id"], first.json()["complaint_id"])
        self.assertEqual(SanitaryComplaint.objects.count(), 1)
        self.assertEqual(self.storage.save.call_count, 1)

    def test_an_unexpected_error_does_not_leak_exception_text(self):
        photo = self._photo(self.JPEG_HEAD, 200 * 1024, "report_1700000000000_0.jpg", "image/jpeg")
        with patch("api.views.mobile.generate_complaint_id", side_effect=RuntimeError("secret internals")):
            response = self._post(photo)

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertNotIn("secret internals", response.content.decode())
        self.assertEqual(SanitaryComplaint.objects.count(), 0)


class InspectionLargePhotoTests(_LargePhotoMixin, TestCase):
    """The staff inspection endpoint copied request.data the same way."""

    def setUp(self):
        super().setUp()
        user = User.objects.create_user(username="large_photo_inspector", password="Password@123")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        btype = SanitaryBusinessType.objects.create(name="Large Photo Cafe", inspection_frequency="monthly")
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Large Photo Shop",
            owner_name="Owner",
            business_type=btype,
            barangay="Daungan",
            address="1 Main St",
        )

    def test_a_large_inspection_photo_is_saved(self):
        photo = self._photo(self.JPEG_HEAD, self.LARGE, "inspection.jpg", "image/jpeg")
        response = self.client.post(
            "/api/mobile/sanitation/inspections/",
            {
                "establishment": str(self.establishment.id),
                "inspector_name": "Inspector Test",
                "inspection_date": "2026-09-27",
                "status_after_inspection": "good_standing",
                "is_draft": "false",
                "photo": photo,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        inspection = SanitaryInspection.objects.get()
        self.assertTrue(inspection.photo_documentation.endswith(".jpg"))


class CommunityReportConcurrentSubmitTests(TransactionTestCase):
    """Two requests with the same id arriving together still make one report."""

    URL = "/api/mobile/sanitation/reports/"
    SID = "concurrent-fill-0001"

    def setUp(self):
        ensure_test_barangays()
        from django.core.cache import caches

        caches["throttle"].clear()

    def test_concurrent_duplicates_create_exactly_one_row(self):
        import threading

        from django.db import connections

        barrier = threading.Barrier(2)
        results = []
        errors = []

        # Both requests pass the "already submitted?" check before either
        # saves, then both insert: the losing insert must turn into a 200 for
        # the winner's report, not a second row or a 500.
        #
        # The second insert is started 0.5 s after the first. SQLite's
        # in-memory test database answers truly simultaneous writes with
        # "database table is locked" instead of waiting; PostgreSQL makes the
        # second insert wait for the first and then raises IntegrityError,
        # which is exactly the path this staggering exercises.
        import time

        from api.views import mobile as mobile_views

        real_lookup = mobile_views.find_existing_community_report

        def lookup_after_both_arrive(submission_id):
            found = real_lookup(submission_id)
            if found is None:
                try:
                    order = barrier.wait(timeout=10)
                except threading.BrokenBarrierError:
                    order = 0
                if order == 1:
                    time.sleep(0.5)
            return found

        def send():
            try:
                client = APIClient(raise_request_exception=False)
                response = client.post(
                    self.URL,
                    _community_report_payload(client_submission_id=self.SID),
                    format="json",
                )
                results.append((response.status_code, response.json().get("complaint_id")))
            except Exception as exc:  # pragma: no cover - reported below
                errors.append(repr(exc))
            finally:
                connections.close_all()

        with patch.object(
            mobile_views, "find_existing_community_report", side_effect=lookup_after_both_arrive
        ):
            threads = [threading.Thread(target=send) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=30)

        self.assertEqual(errors, [])
        self.assertEqual(sorted(code for code, _ in results), [200, 201], results)
        self.assertEqual(len({complaint_id for _, complaint_id in results}), 1, results)
        self.assertEqual(SanitaryComplaint.objects.filter(client_submission_id=self.SID).count(), 1)
        self.assertEqual(SanitaryComplaint.objects.count(), 1)


class CommunityReportDuplicateInsideTransactionTests(TestCase):
    """The duplicate path must work when the request runs inside an outer
    transaction (ATOMIC_REQUESTS, or a caller's atomic block).

    On PostgreSQL a failed INSERT aborts the whole transaction unless it ran
    in its own savepoint; the lookup that follows would then fail with
    "current transaction is aborted" and the request would return 500.
    """

    URL = "/api/mobile/sanitation/reports/"
    SID = "outer-atomic-0001"

    def setUp(self):
        ensure_test_barangays()
        from django.core.cache import caches

        caches["throttle"].clear()

    def test_forced_duplicate_inside_an_outer_atomic_block_returns_200(self):
        import itertools

        from django.db import transaction

        from api.views import mobile as mobile_views

        existing = SanitaryComplaint.objects.create(
            complaint_id="SAN-OUTER-0001",
            complainant_name="Juana Reporter",
            contact_number="09171234567",
            category="Improper Garbage Disposal",
            barangay="Daungan",
            location_address="Purok 3",
            reported_date="2026-09-27",
            description="Saved by the first request.",
            client_submission_id=self.SID,
        )

        # The IP throttle, the contact throttle and the view's own check all
        # "miss" the saved report (as when two requests race), so the insert
        # runs and fails on the unique id. The lookup after that is real.
        real_lookup = mobile_views.find_existing_community_report
        calls = itertools.count()

        def racing_lookup(submission_id):
            return None if next(calls) < 3 else real_lookup(submission_id)

        with patch.object(mobile_views, "find_existing_community_report", side_effect=racing_lookup):
            with transaction.atomic():
                response = APIClient(raise_request_exception=False).post(
                    self.URL,
                    _community_report_payload(client_submission_id=self.SID),
                    format="json",
                )
                # The outer transaction is still usable afterwards.
                rows = SanitaryComplaint.objects.filter(client_submission_id=self.SID).count()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content[:300])
        self.assertEqual(response.json()["complaint_id"], existing.complaint_id)
        self.assertEqual(rows, 1)


class CommunityReportBarangayTests(TestCase):
    """Reports must name an active official Mauban barangay."""

    URL = "/api/mobile/sanitation/reports/"

    def setUp(self):
        from django.core.cache import caches

        caches["throttle"].clear()
        ensure_test_barangays()

    def _post(self, barangay):
        return APIClient().post(
            self.URL, _community_report_payload(barangay=barangay), format="json"
        )

    def test_a_name_that_is_not_a_mauban_barangay_is_rejected(self):
        for name in ("Poblacion", "Cagsiay", "", "Unspecified"):
            response = self._post(name)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, name)
            detail = response.json()["detail"].lower()
            self.assertIn("barangay", detail)
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_an_inactive_barangay_is_rejected(self):
        Barangay.objects.filter(name="Daungan").update(is_active=False)
        self.assertEqual(self._post("Daungan").status_code, status.HTTP_400_BAD_REQUEST)

    def test_case_and_spacing_are_ignored_and_the_official_spelling_is_saved(self):
        response = self._post("  cagsiay   ii ")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(SanitaryComplaint.objects.get().barangay, "Cagsiay II")
        self.assertEqual(response.json()["barangay"], "Cagsiay II")

    def test_the_official_list_is_the_forty_mauban_barangays(self):
        from .seed_data import MAUBAN_BARANGAYS

        self.assertEqual(len(MAUBAN_BARANGAYS), 40)
        self.assertNotIn("Poblacion", MAUBAN_BARANGAYS)


# --- Owner's tracking code (Establishment Portal, step 1) -------------------

TRACKING_TEST_KEY = "test-tracking-code-key"
TRACKING_CODE_PATTERN = r"^MBN-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$"


def _tracking_hash(code, key=TRACKING_TEST_KEY):
    """The expected stored digest, computed independently of the service."""
    import hashlib
    import hmac

    body = code.replace("MBN-", "").replace("-", "")
    return hmac.new(key.encode(), body.encode(), hashlib.sha256).hexdigest()


class TrackingCodeFormatTests(TestCase):
    def test_generated_codes_use_the_unambiguous_alphabet(self):
        from .services.tracking_codes import ALPHABET, new_tracking_code

        self.assertEqual(len(ALPHABET), 31)
        for character in "0O1IL":
            self.assertNotIn(character, ALPHABET)
        codes = {new_tracking_code() for _ in range(300)}
        self.assertGreater(len(codes), 295)
        for code in codes:
            self.assertRegex(code, TRACKING_CODE_PATTERN)

    def test_codes_are_accepted_in_any_case_with_or_without_dashes_or_spaces(self):
        from .services.tracking_codes import normalize_tracking_code

        for typed in (
            "MBN-2ABC-3DEF",
            "mbn-2abc-3def",
            "MBN2ABC3DEF",
            " mbn 2abc 3def ",
            "Mbn - 2aBc - 3dEf",
            "2ABC3DEF",
            "2abc-3def",
        ):
            self.assertEqual(normalize_tracking_code(typed), "2ABC3DEF", typed)

    def test_malformed_codes_normalize_to_nothing(self):
        from .services.tracking_codes import normalize_tracking_code

        for typed in (None, "", "   ", "MBN-2ABC-3DE", "MBN-2ABC-3DEFG", "MBN-2ABC-3DE0",
                      "MBN-2ABC-3DEO", "MBN-2ABC-3DE1", "MBN-2ABC-3DEI", "MBN-2ABC-3DEL",
                      "XYZ-2ABC-3DEF", "MBN-2ABC-3DE!"):
            self.assertEqual(normalize_tracking_code(typed), "", typed)


@override_settings(TRACKING_CODE_KEY=TRACKING_TEST_KEY)
class TrackingCodeGenerateTests(TestCase):
    """POST /api/sanitation/establishments/<id>/tracking-code/ (staff only)."""

    def setUp(self):
        self.btype = SanitaryBusinessType.objects.create(
            name="Tracking Code Carinderia", inspection_frequency="monthly"
        )
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Aling Nena Carinderia",
            owner_name="Nena Santos",
            business_type=self.btype,
            barangay="Daungan",
            address="Purok 1",
            contact_number="09171234567",
            permit_number="SP-2026-0101",
        )
        self.staff = self._user("tracking_staff", ROLE_SANITATION, first_name="Maria", last_name="Santos")
        self.admin = self._user("tracking_admin", ROLE_ADMIN)

    def _user(self, username, role, **names):
        user = User.objects.create_user(username=username, password="Password@123", **names)
        UserProfile.objects.create(user=user, role=role)
        return user

    def _client(self, user=None):
        client = APIClient()
        if user is not None:
            token, _ = Token.objects.get_or_create(user=user)
            client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return client

    def _url(self, establishment_id=None):
        return f"/api/sanitation/establishments/{establishment_id or self.establishment.id}/tracking-code/"

    def _generate(self, user=None):
        return self._client(user or self.staff).post(self._url())

    def test_staff_get_a_code_and_the_slip_details_once(self):
        response = self._generate()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response["Cache-Control"], "no-store")
        body = response.json()
        self.assertRegex(body["tracking_code"], TRACKING_CODE_PATTERN)
        self.assertEqual(
            body["establishment"],
            {
                "id": self.establishment.id,
                "business_name": "Aling Nena Carinderia",
                "permit_number": "SP-2026-0101",
                "business_type_name": "Tracking Code Carinderia",
                "barangay": "Daungan",
            },
        )
        self.assertTrue(body["issued_at"])
        self.assertEqual(body["issued_by"], "Maria Santos")

    def test_only_the_hash_is_stored(self):
        code = self._generate().json()["tracking_code"]

        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.tracking_code_hash, _tracking_hash(code))
        self.assertEqual(len(self.establishment.tracking_code_hash), 64)
        body = code.replace("MBN-", "").replace("-", "")
        row = SanitaryEstablishment.objects.filter(pk=self.establishment.pk).values().get()
        for value in row.values():
            self.assertNotIn(body, str(value))
            self.assertNotIn(code, str(value))

    def test_who_and_when_are_recorded(self):
        before = timezone.now()
        self._generate()

        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.tracking_code_issued_by, self.staff)
        self.assertGreaterEqual(self.establishment.tracking_code_issued_at, before)

    def test_a_new_code_replaces_the_old_one(self):
        first = self._generate().json()["tracking_code"]
        second = self._generate(self.admin).json()["tracking_code"]

        self.assertNotEqual(first, second)
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.tracking_code_hash, _tracking_hash(second))
        self.assertNotEqual(self.establishment.tracking_code_hash, _tracking_hash(first))
        self.assertEqual(self.establishment.tracking_code_issued_by, self.admin)

    def test_the_activity_log_records_the_issue_but_not_the_code(self):
        code = self._generate().json()["tracking_code"]

        log = ActivityLog.objects.get(record_type="SanitaryEstablishment", action=ACTION_UPDATE)
        self.assertEqual(log.user, self.staff)
        self.assertEqual(log.record_id, str(self.establishment.id))
        self.assertIn("tracking code", log.record_label.lower())
        body = code.replace("MBN-", "").replace("-", "")
        self.assertNotIn(body, log.record_label)

    def test_printing_a_slip_does_not_reorder_the_records(self):
        updated_at = SanitaryEstablishment.objects.get(pk=self.establishment.pk).updated_at
        self._generate()
        self.assertEqual(SanitaryEstablishment.objects.get(pk=self.establishment.pk).updated_at, updated_at)

    def test_non_staff_cannot_generate(self):
        tourism = self._user("tracking_tourism", ROLE_TOURISM)
        owner = self._user("tracking_owner", ROLE_ESTABLISHMENT)
        tourist = self._user("tracking_tourist", ROLE_TOURIST)

        self.assertIn(self._client().post(self._url()).status_code, (401, 403))
        for user in (tourism, owner, tourist):
            self.assertEqual(self._generate(user).status_code, status.HTTP_403_FORBIDDEN, user.username)
        self.establishment.refresh_from_db()
        self.assertIsNone(self.establishment.tracking_code_hash)
        self.assertIsNone(self.establishment.tracking_code_issued_at)

    def test_only_post_is_allowed(self):
        response = self._client(self.staff).get(self._url())
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_an_unknown_establishment_is_404(self):
        response = self._client(self.staff).post(self._url(establishment_id=999999))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_records_show_when_a_slip_was_issued_but_never_the_hash(self):
        self._generate()
        self.establishment.refresh_from_db()
        digest = self.establishment.tracking_code_hash
        client = self._client(self.staff)

        detail = client.get(f"/api/sanitation/establishments/{self.establishment.id}/").json()
        self.assertTrue(detail["tracking_code_issued_at"])
        self.assertEqual(detail["tracking_code_issued_by_name"], "Maria Santos")
        for url in (
            f"/api/sanitation/establishments/{self.establishment.id}/",
            "/api/sanitation/establishments/",
            "/api/sanitation/bootstrap/",
            "/api/mobile/sanitation/staff-bootstrap/",
            "/api/mobile/sanitation/bootstrap/",
        ):
            text = client.get(url).content.decode()
            self.assertNotIn(digest, text, url)
            self.assertNotIn("tracking_code_hash", text, url)

    def test_a_record_without_a_slip_says_so(self):
        detail = self._client(self.staff).get(f"/api/sanitation/establishments/{self.establishment.id}/").json()
        self.assertIsNone(detail["tracking_code_issued_at"])
        self.assertEqual(detail["tracking_code_issued_by_name"], "")

    def test_the_code_fields_cannot_be_written_through_the_record(self):
        self._generate()
        self.establishment.refresh_from_db()
        digest = self.establishment.tracking_code_hash
        issued_at = self.establishment.tracking_code_issued_at

        response = self._client(self.admin).patch(
            f"/api/sanitation/establishments/{self.establishment.id}/",
            {
                "tracking_code_hash": "0" * 64,
                "tracking_code_issued_at": "2020-01-01T00:00:00Z",
                "tracking_code_issued_by": self.admin.id,
                "remarks": "edited",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.remarks, "edited")
        self.assertEqual(self.establishment.tracking_code_hash, digest)
        self.assertEqual(self.establishment.tracking_code_issued_at, issued_at)
        self.assertEqual(self.establishment.tracking_code_issued_by, self.staff)

    def test_a_hash_collision_draws_a_new_code(self):
        other = SanitaryEstablishment.objects.create(
            business_name="Other", owner_name="O", business_type=self.btype,
            barangay="Daungan", address="Purok 2",
        )
        other.tracking_code_hash = _tracking_hash("MBN-2222-2222")
        other.save()

        with patch(
            "api.services.tracking_codes.new_tracking_code",
            side_effect=["MBN-2222-2222", "MBN-3333-3333"],
        ):
            response = self._generate()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.json()["tracking_code"], "MBN-3333-3333")
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.tracking_code_hash, _tracking_hash("MBN-3333-3333"))

    @override_settings(TRACKING_CODE_KEY="", DEBUG=False)
    def test_without_a_key_in_production_it_is_503_and_nothing_is_stored(self):
        response = self._generate()

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("not configured", response.json()["detail"])
        self.establishment.refresh_from_db()
        self.assertIsNone(self.establishment.tracking_code_hash)
        # The rest of the records still work.
        detail = self._client(self.staff).get(f"/api/sanitation/establishments/{self.establishment.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)

    @override_settings(TRACKING_CODE_KEY="", DEBUG=True)
    def test_in_debug_the_secret_key_stands_in(self):
        from django.conf import settings

        code = self._generate().json()["tracking_code"]
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.tracking_code_hash, _tracking_hash(code, settings.SECRET_KEY))

    @override_settings(TRACKING_CODE_KEY="", DEBUG=False)
    def test_a_missing_key_is_warned_about_at_startup(self):
        from .services.tracking_codes import warn_if_tracking_code_key_missing

        with self.assertLogs("api.services.tracking_codes", level="WARNING") as logs:
            warn_if_tracking_code_key_missing()
        self.assertIn("TRACKING_CODE_KEY", logs.output[0])

    @override_settings(DEBUG=False)
    def test_no_warning_when_the_key_is_set(self):
        from .services.tracking_codes import warn_if_tracking_code_key_missing

        with self.assertNoLogs("api.services.tracking_codes", level="WARNING"):
            warn_if_tracking_code_key_missing()


@override_settings(TRACKING_CODE_KEY=TRACKING_TEST_KEY)
class EstablishmentStatusTests(TestCase):
    """POST /api/mobile/sanitation/establishment-status/ (public, by tracking code)."""

    URL = "/api/mobile/sanitation/establishment-status/"
    CODE = "MBN-7KQ4-XP2M"
    KEYS = {
        "business_name",
        "business_type",
        "barangay",
        "permit_number",
        "permit_status",
        "permit_status_label",
        "permit_expiry_date",
        "days_left",
        "is_expired",
        "renewal_notice",
        "expired_notice",
        "suspended_notice",
        "requirements",
        "requirements_note",
    }
    NOT_FOUND = "Tracking code not found. Check the code on your Owner's Slip."

    def setUp(self):
        from django.core.cache import caches

        from .models import SanitaryRequirement

        caches["throttle"].clear()
        self.today = timezone.localdate()
        self.btype = SanitaryBusinessType.objects.create(
            name="Status Carinderia", inspection_frequency="monthly"
        )
        for size, name in (
            ("sp", "Health Certificate"),
            ("sp", "Water Potability Test"),
            ("large", "Pest Control Contract"),
        ):
            SanitaryRequirement.objects.create(
                business_type=self.btype, permit_size=size, requirement_name=name
            )
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Aling Nena Carinderia",
            owner_name="Nena Santos",
            business_type=self.btype,
            barangay="Daungan",
            address="Purok 1, Rizal St.",
            contact_number="09171234567",
            permit_number="SP-2026-0101",
            permit_issued_date=self.today - timedelta(days=200),
            permit_expiry_date=self.today + timedelta(days=165),
            permit_status="active",
            compliance_status="good_standing",
            remarks="Inspector notes: grease trap",
            latitude=14.19,
            longitude=121.73,
        )
        self._set_code(self.establishment, self.CODE)

    def _set_code(self, establishment, code):
        establishment.tracking_code_hash = _tracking_hash(code)
        establishment.save()

    def _post(self, code, ip="10.0.0.1"):
        return APIClient().post(self.URL, {"code": code}, format="json", REMOTE_ADDR=ip)

    def _status(self, **changes):
        SanitaryEstablishment.objects.filter(pk=self.establishment.pk).update(**changes)
        response = self._post(self.CODE)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        return response.json()

    # -- what is returned ------------------------------------------------------

    def test_the_answer_has_exactly_the_public_keys(self):
        from .models import SanitaryComplaint

        SanitaryInspection.objects.create(
            establishment=self.establishment,
            inspector_name="Inspector Juan",
            inspection_date=self.today,
            status_after_inspection="good_standing",
            remarks="Secret inspection note",
        )
        SanitaryComplaint.objects.create(
            complaint_id="CMP-2026-9001", establishment=self.establishment,
            complainant_name="Complainer Pedro", contact_number="09998887777",
            category="Improper Garbage Disposal", barangay="Daungan",
            description="Complaint text", reported_date=self.today,
        )
        other = SanitaryEstablishment.objects.create(
            business_name="Other Shop", owner_name="Other Owner", business_type=self.btype,
            barangay="Daungan", address="Purok 9",
        )
        self._set_code(other, "MBN-2222-3333")

        response = self._post(self.CODE)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response["Cache-Control"], "no-store")
        body = response.json()
        self.assertEqual(set(body), self.KEYS)
        self.assertEqual(body["business_name"], "Aling Nena Carinderia")
        self.assertEqual(body["business_type"], "Status Carinderia")
        self.assertEqual(body["barangay"], "Daungan")
        self.assertEqual(body["permit_number"], "SP-2026-0101")
        self.assertEqual(body["permit_status"], "active")
        self.assertEqual(body["permit_status_label"], "Active")
        text = response.content.decode()
        for private in (
            "Nena Santos", "09171234567", "Purok 1", "14.19", "121.73", "grease trap",
            "Inspector Juan", "Secret inspection note", "Complainer Pedro", "09998887777",
            "Complaint text", "CMP-2026-9001", "Other Shop", "Other Owner",
            self.establishment.tracking_code_hash,
        ):
            self.assertNotIn(private, text, private)
        for key in ("owner", "contact", "address", "latitude", "longitude", "remarks",
                    "inspection", "inspector", "complaint", "id", "user"):
            self.assertNotIn(key, body)

    def test_the_code_may_be_typed_in_any_case_with_or_without_dashes_or_spaces(self):
        for typed in ("MBN-7KQ4-XP2M", "mbn-7kq4-xp2m", "MBN7KQ4XP2M", " mbn 7kq4 xp2m ",
                      "7kq4-xp2m", "7KQ4XP2M", "Mbn - 7Kq4 - xP2m"):
            response = self._post(typed)
            self.assertEqual(response.status_code, status.HTTP_200_OK, typed)
            self.assertEqual(response.json()["business_name"], "Aling Nena Carinderia")

    def test_form_encoded_bodies_work_too(self):
        response = APIClient().post(self.URL, {"code": "mbn-7kq4-xp2m"}, REMOTE_ADDR="10.0.0.1")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    # -- not found ---------------------------------------------------------------

    def test_wrong_empty_malformed_and_replaced_codes_get_the_same_404(self):
        self._set_code(self.establishment, "MBN-9WWW-8XXX")  # the old code is replaced

        bodies = set()
        for typed in (self.CODE, "MBN-2222-2222", "", "   ", "MBN-0000-OOOO", "hello",
                      "MBN-7KQ4-XP2", "SP-2026-0101", None):
            response = self._post(typed)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, typed)
            self.assertEqual(response["Cache-Control"], "no-store")
            bodies.add(response.content)
        missing = APIClient().post(self.URL, {}, format="json", REMOTE_ADDR="10.0.0.1")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        bodies.add(missing.content)

        self.assertEqual(len(bodies), 1)
        self.assertEqual(json.loads(bodies.pop()), {"detail": self.NOT_FOUND})

    def test_a_bad_format_still_computes_the_hmac_and_queries(self):
        with patch("api.services.tracking_codes.hash_tracking_code",
                   wraps=__import__("api.services.tracking_codes", fromlist=["x"]).hash_tracking_code) as spy:
            self._post("not a code at all")
            self._post("")
        self.assertEqual(spy.call_count, 2)

    def test_the_lookup_is_one_query(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as queries:
            self._post("MBN-2222-2222")
        lookups = [q["sql"] for q in queries.captured_queries if "api_sanitaryestablishment" in q["sql"]]
        self.assertEqual(len(lookups), 1, lookups)
        self.assertIn("tracking_code_hash", lookups[0])

    def test_only_post_is_allowed(self):
        response = APIClient().get(self.URL, {"code": self.CODE})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    # -- limits and configuration --------------------------------------------------

    def test_the_21st_request_in_an_hour_from_one_address_is_refused(self):
        statuses = [self._post("MBN-2222-2222").status_code for _ in range(20)]
        self.assertEqual(set(statuses), {status.HTTP_404_NOT_FOUND})

        refused = self._post(self.CODE)
        self.assertEqual(refused.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(refused["Cache-Control"], "no-store")
        self.assertTrue(int(refused["Retry-After"]) > 0)
        detail = refused.json()["detail"]
        self.assertEqual(detail, "Too many attempts from this device. Please try again in an hour.")
        self.assertNotIn("Expected available", detail)

        # Another address is not affected.
        self.assertEqual(self._post(self.CODE, ip="10.0.0.2").status_code, status.HTTP_200_OK)

    def test_successful_lookups_do_not_count(self):
        # Owners behind one mobile-carrier address must not lock each other out.
        statuses = [self._post(self.CODE).status_code for _ in range(25)]
        self.assertEqual(statuses, [status.HTTP_200_OK] * 25)

        for _ in range(19):
            self.assertEqual(self._post("MBN-2222-2222").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self._post(self.CODE).status_code, status.HTTP_200_OK)
        self.assertEqual(self._post("MBN-2222-2222").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self._post(self.CODE).status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_once_refused_every_request_from_that_address_is_refused(self):
        for _ in range(20):
            self._post("MBN-2222-2222")
        for typed in (self.CODE, "MBN-2222-2222", ""):
            self.assertEqual(self._post(typed).status_code, status.HTTP_429_TOO_MANY_REQUESTS, typed)

    @override_settings(TRACKING_CODE_KEY="", DEBUG=False)
    def test_without_a_key_in_production_it_is_503(self):
        response = self._post(self.CODE)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("not configured", response.json()["detail"])
        self.assertEqual(response["Cache-Control"], "no-store")

    # -- expiry ----------------------------------------------------------------------

    def test_a_permit_well_before_expiry(self):
        body = self._status()
        self.assertEqual(body["permit_expiry_date"], (self.today + timedelta(days=165)).isoformat())
        self.assertEqual(body["days_left"], 165)
        self.assertFalse(body["is_expired"])
        self.assertIsNone(body["renewal_notice"])
        self.assertIsNone(body["expired_notice"])

    def test_sixty_days_left_shows_the_renewal_notice(self):
        body = self._status(permit_expiry_date=self.today + timedelta(days=60))
        self.assertEqual(body["days_left"], 60)
        self.assertEqual(
            body["renewal_notice"],
            "Your sanitary permit expires in 60 days. Please renew at the Sanitary Office.",
        )
        self.assertIsNone(body["expired_notice"])

    def test_sixty_one_days_left_shows_no_notice(self):
        body = self._status(permit_expiry_date=self.today + timedelta(days=61))
        self.assertIsNone(body["renewal_notice"])

    def test_expiring_today_is_not_expired_yet(self):
        body = self._status(permit_expiry_date=self.today)
        self.assertEqual(body["days_left"], 0)
        self.assertFalse(body["is_expired"])
        self.assertEqual(body["permit_status"], "active")
        self.assertEqual(
            body["renewal_notice"],
            "Your sanitary permit expires today. Please renew at the Sanitary Office.",
        )
        self.assertIsNone(body["expired_notice"])

    def test_a_past_date_is_expired_whatever_the_stored_status(self):
        body = self._status(permit_expiry_date=self.today - timedelta(days=1), permit_status="active")

        self.assertEqual(body["days_left"], -1)
        self.assertTrue(body["is_expired"])
        self.assertEqual(body["permit_status"], "expired")
        self.assertEqual(body["permit_status_label"], "Expired")
        self.assertIsNone(body["renewal_notice"])
        self.assertEqual(
            body["expired_notice"],
            "Your sanitary permit has expired. Please renew at the Sanitary Office.",
        )
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.permit_status, "active")  # stored field unchanged

    def test_no_expiry_date(self):
        body = self._status(permit_expiry_date=None)
        self.assertIsNone(body["permit_expiry_date"])
        self.assertIsNone(body["days_left"])
        self.assertFalse(body["is_expired"])
        self.assertIsNone(body["renewal_notice"])
        self.assertIsNone(body["expired_notice"])

    def test_days_left_use_the_manila_date(self):
        from datetime import datetime, timezone as dt_timezone

        # 2026-03-01 17:00 UTC is already 2026-03-02 in Manila.
        SanitaryEstablishment.objects.filter(pk=self.establishment.pk).update(
            permit_expiry_date="2026-03-12"
        )
        with patch("django.utils.timezone.now",
                   return_value=datetime(2026, 3, 1, 17, 0, tzinfo=dt_timezone.utc)):
            body = self._post(self.CODE).json()
        self.assertEqual(body["days_left"], 10)

    # -- suspended / no permit ---------------------------------------------------------

    def test_suspended_adds_only_the_contact_notice(self):
        body = self._status(permit_status="suspended", compliance_status="violation")

        self.assertEqual(body["permit_status"], "suspended")
        self.assertEqual(body["permit_status_label"], "Suspended")
        self.assertEqual(body["suspended_notice"], "Please contact the Sanitary Office.")
        self.assertNotIn("violation", response_text := json.dumps(body))
        self.assertNotIn("grease", response_text)

    def test_not_suspended_has_no_suspended_notice(self):
        self.assertIsNone(self._status()["suspended_notice"])

    def test_no_permit_number_is_null(self):
        body = self._status(permit_number="", has_permit=False, permit_status="no_permit",
                            permit_expiry_date=None, permit_issued_date=None)
        self.assertIsNone(body["permit_number"])
        self.assertEqual(body["permit_status"], "no_permit")
        self.assertEqual(body["permit_status_label"], "No Permit")
        self.assertIsNone(body["days_left"])

    # -- requirements checklist ------------------------------------------------------------

    def _renewal(self, stage="requirements_review", submitted=(), renewal_id="REN-1", days=0):
        from .models import SanitaryPermitRenewal

        renewal = SanitaryPermitRenewal.objects.create(
            renewal_id=renewal_id,
            establishment=self.establishment,
            permit_number="SP-2026-0101",
            expiration_date=self.today + timedelta(days=30),
            stage=stage,
            submitted_requirements=list(submitted),
        )
        if days:
            SanitaryPermitRenewal.objects.filter(pk=renewal.pk).update(
                created_at=timezone.now() - timedelta(days=days)
            )
        return renewal

    def test_the_newest_unreleased_renewal_marks_submitted_and_missing(self):
        self._renewal(renewal_id="REN-OLD", submitted=["Health Certificate", "Water Potability Test"], days=40)
        self._renewal(renewal_id="REN-NEW", submitted=["health certificate "])
        self._renewal(renewal_id="REN-DONE", stage="released", submitted=[])

        body = self._status()

        self.assertEqual(
            body["requirements"],
            [
                {"name": "Health Certificate", "submitted": True},
                {"name": "Water Potability Test", "submitted": False},
            ],
        )
        self.assertIsNone(body["requirements_note"])

    def test_a_large_permit_uses_the_large_requirements(self):
        self._renewal(submitted=["Pest Control Contract"])
        body = self._status(permit_size="large")
        self.assertEqual(body["requirements"], [{"name": "Pest Control Contract", "submitted": True}])

    def test_a_submitted_item_that_is_no_longer_configured_is_still_listed(self):
        self._renewal(submitted=["Old Barangay Clearance"])
        names = [item["name"] for item in self._status()["requirements"]]
        self.assertEqual(names, ["Health Certificate", "Water Potability Test", "Old Barangay Clearance"])

    def test_without_an_open_renewal_the_list_is_neutral(self):
        self._renewal(stage="released", submitted=["Health Certificate"])

        body = self._status()

        self.assertEqual(
            body["requirements"],
            [
                {"name": "Health Certificate", "submitted": None},
                {"name": "Water Potability Test", "submitted": None},
            ],
        )
        self.assertEqual(body["requirements_note"], "Bring at renewal")

    def test_a_type_without_requirements_says_so(self):
        from .models import SanitaryRequirement

        SanitaryRequirement.objects.all().delete()
        body = self._status()
        self.assertEqual(body["requirements"], [])
        self.assertEqual(body["requirements_note"], "No requirements set yet")

        self._renewal()
        body = self._status()
        self.assertEqual(body["requirements"], [])
        self.assertEqual(body["requirements_note"], "No requirements set yet")

    def test_a_size_without_its_own_list_falls_back_to_the_type_list(self):
        from .models import SanitaryRequirement

        SanitaryRequirement.objects.filter(permit_size="large").delete()
        body = self._status(permit_size="large")
        self.assertEqual(
            [item["name"] for item in body["requirements"]],
            ["Health Certificate", "Water Potability Test"],
        )


class TourismThemeSettingTests(TestCase):
    def setUp(self):
        from .models import TourismThemeSetting

        self.Model = TourismThemeSetting

    def test_load_creates_the_row_once_and_returns_the_same_row(self):
        self.assertEqual(self.Model.objects.count(), 0)
        first = self.Model.load()
        second = self.Model.load()
        self.assertEqual(first.pk, 1)
        self.assertEqual(second.pk, first.pk)
        self.assertEqual(self.Model.objects.count(), 1)

    def test_saving_a_second_instance_does_not_create_a_second_row(self):
        self.Model.load()
        self.Model(primary_color="#123456").save()
        self.assertEqual(self.Model.objects.count(), 1)
        self.assertEqual(self.Model.load().primary_color, "#123456")

    def test_defaults_are_the_original_green(self):
        setting = self.Model.load()
        self.assertEqual(setting.primary_color, "#2FA34A")
        self.assertTrue(setting.mobile_follows_web)
        self.assertEqual(setting.mobile_primary_color, "")
        self.assertEqual(
            setting.saved_colors,
            [{"hex": "#2FA34A", "label": "Original (Green)"}],
        )

    def test_lowercase_hex_is_stored_uppercase(self):
        setting = self.Model.load()
        setting.primary_color = "#ff8800"
        setting.mobile_primary_color = "#00aabb"
        setting.saved_colors = [{"hex": "#abcdef", "label": "Test"}]
        setting.save()
        setting.refresh_from_db()
        self.assertEqual(setting.primary_color, "#FF8800")
        self.assertEqual(setting.mobile_primary_color, "#00AABB")
        self.assertEqual(setting.saved_colors, [{"hex": "#ABCDEF", "label": "Test"}])

    def test_primary_color_must_be_a_six_digit_hex(self):
        from django.core.exceptions import ValidationError

        setting = self.Model.load()
        for bad in ["2FA34A", "#2FA34", "#2FA34AA", "#GGGGGG", "", "red"]:
            setting.primary_color = bad
            with self.assertRaises(ValidationError, msg=bad):
                setting.full_clean()
        setting.primary_color = "#2fa34a"
        setting.full_clean()

    def test_mobile_primary_color_accepts_empty_and_rejects_malformed(self):
        from django.core.exceptions import ValidationError

        setting = self.Model.load()
        setting.mobile_primary_color = ""
        setting.full_clean()
        setting.mobile_primary_color = "#12345"
        with self.assertRaises(ValidationError):
            setting.full_clean()
        setting.mobile_primary_color = "#A1B2C3"
        setting.full_clean()


class TourismThemeApiTests(TestCase):
    URL = "/api/tourism-theme/"
    READ_KEYS = {"primary_color", "mobile_follows_web", "mobile_primary_color", "saved_colors", "updated_at"}

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.anon = APIClient()

    def _client_for(self, username, role, is_staff=True):
        user = User.objects.create_user(username=username, password="pass-12345", is_staff=is_staff)
        UserProfile.objects.create(user=user, role=role)
        token = Token.objects.create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return user, client

    def _admin(self):
        return self._client_for("theme_admin", ROLE_ADMIN)

    def _put(self, client, **payload):
        body = {"primary_color": "#FF8800", **payload}
        return client.put(self.URL, body, format="json")

    # --- read -------------------------------------------------------------

    def test_unauthenticated_get_returns_the_public_keys(self):
        response = self.anon.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.json().keys()), self.READ_KEYS)
        self.assertEqual(response.json()["primary_color"], "#2FA34A")

    def test_read_never_exposes_updated_by_or_a_username(self):
        admin, client = self._admin()
        self.assertEqual(self._put(client).status_code, status.HTTP_200_OK)
        for response in (self.anon.get(self.URL), client.get(self.URL)):
            body = response.json()
            self.assertNotIn("updated_by", body)
            self.assertNotIn(admin.username, response.content.decode())

    # --- write gate -------------------------------------------------------

    def test_anonymous_put_is_forbidden(self):
        self.assertEqual(self._put(self.anon).status_code, status.HTTP_403_FORBIDDEN)

    def test_tourism_staff_cannot_write_even_with_is_staff(self):
        _, client = self._client_for("tourism_staff", ROLE_TOURISM, is_staff=True)
        self.assertEqual(self._put(client).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.anon.get(self.URL).json()["primary_color"], "#2FA34A")

    def test_sanitation_staff_cannot_write(self):
        _, client = self._client_for("sanitation_staff", ROLE_SANITATION, is_staff=True)
        self.assertEqual(self._put(client).status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_write_and_updated_by_is_set(self):
        from .models import TourismThemeSetting

        admin, client = self._admin()
        response = self._put(client, mobile_follows_web=False, mobile_primary_color="#00aabb")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["primary_color"], "#FF8800")
        setting = TourismThemeSetting.load()
        self.assertEqual(setting.updated_by, admin)
        self.assertFalse(setting.mobile_follows_web)
        self.assertEqual(setting.mobile_primary_color, "#00AABB")

    # --- validation -------------------------------------------------------

    def test_primary_color_is_required_and_must_be_hex(self):
        _, client = self._admin()
        self.assertEqual(client.put(self.URL, {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        for bad in ["FF8800", "#FF880", "#FF88000", "#GG8800", "", "orange"]:
            response = self._put(client, primary_color=bad)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
            self.assertIn("primary_color", response.json())

    def test_mobile_primary_color_accepts_empty_and_rejects_malformed(self):
        _, client = self._admin()
        self.assertEqual(self._put(client, mobile_primary_color="").status_code, status.HTTP_200_OK)
        response = self._put(client, mobile_primary_color="#12345")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mobile_primary_color", response.json())

    def test_saved_colors_rejects_malformed_payloads(self):
        _, client = self._admin()
        green = {"hex": "#2FA34A", "label": "Original (Green)"}
        bad_payloads = {
            "not a list": {"hex": "#112233", "label": "x"},
            "too many": [green] + [{"hex": f"#1122{i:02d}", "label": f"c{i}"} for i in range(12)],
            "extra key": [green, {"hex": "#112233", "label": "x", "note": "y"}],
            "missing label": [green, {"hex": "#112233"}],
            "entry not an object": [green, "#112233"],
            "bad hex": [green, {"hex": "#11223", "label": "x"}],
            "hex not a string": [green, {"hex": 112233, "label": "x"}],
            "empty label": [green, {"hex": "#112233", "label": ""}],
            "blank label": [green, {"hex": "#112233", "label": "   "}],
            "label too long": [green, {"hex": "#112233", "label": "x" * 41}],
            "label not a string": [green, {"hex": "#112233", "label": 7}],
        }
        for name, saved in bad_payloads.items():
            response = self._put(client, saved_colors=saved)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, name)
            self.assertIn("saved_colors", response.json(), name)
        ok = self._put(client, saved_colors=[green, {"hex": "#112233", "label": "x" * 40}])
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

    def test_original_green_is_restored_when_omitted(self):
        _, client = self._admin()
        response = self._put(client, saved_colors=[{"hex": "#ff8800", "label": "Orange"}])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json()["saved_colors"],
            [{"hex": "#2FA34A", "label": "Original (Green)"}, {"hex": "#FF8800", "label": "Orange"}],
        )
        self.assertEqual(self.anon.get(self.URL).json()["saved_colors"][0]["hex"], "#2FA34A")

    def test_green_given_in_lowercase_is_not_duplicated(self):
        _, client = self._admin()
        response = self._put(client, saved_colors=[{"hex": "#2fa34a", "label": "Green"}])
        self.assertEqual(response.json()["saved_colors"], [{"hex": "#2FA34A", "label": "Green"}])

    def test_twelve_colours_without_green_is_rejected(self):
        _, client = self._admin()
        saved = [{"hex": f"#1122{i:02d}", "label": f"c{i}"} for i in range(12)]
        response = self._put(client, saved_colors=saved)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("saved_colors", response.json())

    # --- cache ------------------------------------------------------------

    def test_a_write_invalidates_the_cache(self):
        self.assertEqual(self.anon.get(self.URL).json()["primary_color"], "#2FA34A")
        _, client = self._admin()
        self.assertEqual(self._put(client, primary_color="#123ABC").status_code, status.HTTP_200_OK)
        self.assertEqual(self.anon.get(self.URL).json()["primary_color"], "#123ABC")

    def test_a_cache_hit_runs_no_queries(self):
        from .services.tourism import get_cached_tourism_theme

        get_cached_tourism_theme()
        with self.assertNumQueries(0):
            get_cached_tourism_theme()

    # --- bootstrap wiring -------------------------------------------------

    def test_both_bootstrap_endpoints_include_the_theme(self):
        _, client = self._admin()
        self.assertEqual(self._put(client, primary_color="#AA5500").status_code, status.HTTP_200_OK)

        web = client.get("/api/bootstrap/")
        self.assertEqual(web.status_code, status.HTTP_200_OK)
        self.assertEqual(web.json()["theme"]["primary_color"], "#AA5500")
        self.assertEqual(set(web.json()["theme"].keys()), self.READ_KEYS)

        mobile = self.anon.get("/api/mobile/tourism/bootstrap/")
        self.assertEqual(mobile.status_code, status.HTTP_200_OK)
        self.assertEqual(mobile.json()["theme"]["primary_color"], "#AA5500")
        self.assertNotIn("updated_by", mobile.json()["theme"])
