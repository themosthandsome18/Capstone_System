from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .seeders import ensure_initial_reference_data
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
    ROLE_SANITATION,
    ROLE_TOURISM,
    Province,
    Region,
    Resort,
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


class BookingManagementApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="tourism_admin",
            password="Tourism@123",
        )
        UserProfile.objects.create(user=self.user, role=ROLE_TOURISM)
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_booking_management_returns_summary_and_rows(self):
        response = self.client.get("/api/booking-management/")

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


class MobilePublicApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

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
            arrival_date="2026-06-02",
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
        )

        response = self.client.get("/api/mobile/tourism/bootstrap/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_destination = response.json()["destinations"][0]
        self.assertEqual(first_destination["resort_name"], "Orlan Beach Resort")
        self.assertEqual(first_destination["monthly_arrivals"], 5000)

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
