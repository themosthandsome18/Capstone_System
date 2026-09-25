from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
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


class EstablishmentClaimSecurityTests(TestCase):
    """Establishment claims are matched by permit number only and never overwrite an owner."""

    REGISTER_URL = "/api/auth/register-establishment/"

    def setUp(self):
        self.client = APIClient()
        self.btype = SanitaryBusinessType.objects.create(
            name="Claim Test Bakery",
            inspection_frequency="monthly",
        )
        self.owner = User.objects.create_user(username="original_owner", password="Owner@12345")
        UserProfile.objects.create(user=self.owner, role=ROLE_ESTABLISHMENT)
        self.claimed = SanitaryEstablishment.objects.create(
            business_name="Claimed Bakery",
            owner_name="Original Owner",
            business_type=self.btype,
            barangay="Poblacion",
            address="1 Claimed St",
            permit_number="SP-2026-CLAIMED",
            user=self.owner,
        )
        self.unclaimed = SanitaryEstablishment.objects.create(
            business_name="Unclaimed Bakery",
            owner_name="Nobody Yet",
            business_type=self.btype,
            barangay="Poblacion",
            address="2 Open St",
            permit_number="SP-2026-OPEN",
        )

    def test_claiming_already_linked_permit_is_rejected_and_writes_nothing(self):
        users_before = User.objects.count()
        profiles_before = UserProfile.objects.count()
        tokens_before = Token.objects.count()

        response = self.client.post(
            self.REGISTER_URL,
            {
                "username": "attacker",
                "password": "Attacker@123",
                "permit_number": "sp-2026-claimed",  # case-insensitive match must still be blocked
                "business_name": "Claimed Bakery",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("already has a linked account", response.json()["detail"])
        self.assertNotIn("token", response.json())
        self.assertEqual(User.objects.count(), users_before)
        self.assertEqual(UserProfile.objects.count(), profiles_before)
        self.assertEqual(Token.objects.count(), tokens_before)
        self.assertFalse(User.objects.filter(username="attacker").exists())
        self.claimed.refresh_from_db()
        self.assertEqual(self.claimed.user_id, self.owner.id)

    def test_business_name_alone_cannot_claim_an_establishment(self):
        response = self.client.post(
            self.REGISTER_URL,
            {
                "username": "name_only",
                "password": "NameOnly@123",
                "business_name": "Unclaimed Bakery",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("establishment", response.json())
        self.unclaimed.refresh_from_db()
        self.assertIsNone(self.unclaimed.user_id)
        self.claimed.refresh_from_db()
        self.assertEqual(self.claimed.user_id, self.owner.id)

    def test_business_name_of_claimed_establishment_cannot_take_it_over(self):
        response = self.client.post(
            self.REGISTER_URL,
            {
                "username": "name_takeover",
                "password": "Takeover@123",
                "business_name": "Claimed Bakery",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("establishment", response.json())
        self.claimed.refresh_from_db()
        self.assertEqual(self.claimed.user_id, self.owner.id)

    def test_valid_permit_for_unclaimed_establishment_still_links(self):
        response = self.client.post(
            self.REGISTER_URL,
            {
                "username": "legit_owner",
                "password": "Legit@12345",
                "permit_number": "SP-2026-OPEN",
                "contact_number": "09170000000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_user = User.objects.get(username="legit_owner")
        self.assertEqual(new_user.profile.role, ROLE_ESTABLISHMENT)
        self.unclaimed.refresh_from_db()
        self.assertEqual(self.unclaimed.user_id, new_user.id)
        self.assertEqual(self.unclaimed.contact_number, "09170000000")
        self.assertEqual(response.json()["establishment"]["id"], self.unclaimed.id)

    def test_second_claim_of_same_permit_is_rejected_after_first_succeeds(self):
        first = self.client.post(
            self.REGISTER_URL,
            {"username": "first_claim", "password": "First@12345", "permit_number": "SP-2026-OPEN"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        users_after_first = User.objects.count()

        second = self.client.post(
            self.REGISTER_URL,
            {"username": "second_claim", "password": "Second@12345", "permit_number": "SP-2026-OPEN"},
            format="json",
        )

        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(User.objects.count(), users_after_first)
        self.unclaimed.refresh_from_db()
        self.assertEqual(self.unclaimed.user.username, "first_claim")

    def test_missing_or_unknown_permit_creates_unlinked_account(self):
        for username, extra in (
            ("no_permit", {}),
            ("unknown_permit", {"permit_number": "SP-DOES-NOT-EXIST"}),
        ):
            with self.subTest(username=username):
                response = self.client.post(
                    self.REGISTER_URL,
                    {"username": username, "password": "Unlinked@123", **extra},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertNotIn("establishment", response.json())
                self.assertFalse(
                    SanitaryEstablishment.objects.filter(user__username=username).exists()
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
                "category": "Improper waste disposal",
                "barangay": "Poblacion",
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

    def test_mobile_sanitation_report_history_filters_by_contact(self):
        self.client.post(
            "/api/mobile/sanitation/reports/",
            {
                "complainant_name": "Resident Reporter",
                "contact_number": "09170000000",
                "category": "Unsafe water source",
                "barangay": "Poblacion",
                "description": "Water source needs inspection.",
            },
            format="json",
        )

        response = self.client.get(
            "/api/mobile/sanitation/reports/history/",
            {"contact": "09170000000"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "pending")
        self.assertIn("status_label", rows[0])

    def test_mobile_sanitation_permit_verify_by_permit_number(self):
        bootstrap = self.client.get("/api/mobile/sanitation/bootstrap/").json()
        permit_number = next(
            item["permit_number"]
            for item in bootstrap["establishments"]
            if item["permit_number"]
        )

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
                "category": "Solid Waste",
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
                    "category": "Solid Waste",
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

    def test_seed_and_importer_use_the_new_name(self):
        from .services.online_booking import normalize_boat_type

        self.assertEqual(REFERENCE_TABLES["boat_types"][0], {"id": 1, "name": self.NEW})
        self.assertEqual(normalize_boat_type(self.OLD), self.NEW)
        self.assertEqual(normalize_boat_type("Public Boat"), self.NEW)
        self.assertEqual(normalize_boat_type("  public boat (sabang)  "), self.NEW)
        self.assertEqual(normalize_boat_type(""), self.NEW)
        # Other boat types are untouched
        self.assertEqual(
            normalize_boat_type("Private Boat"),
            "Private Boat (Rates depend on the capacity)",
        )
        self.assertEqual(
            normalize_boat_type("Boat provided by resort"),
            "Boat Provided by Resort (As confirmed by both guests and resort)",
        )


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
