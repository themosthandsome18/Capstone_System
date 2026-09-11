from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
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
    Notification,
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_SANITATION,
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


