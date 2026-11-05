"""The authenticated inspector must own a mobile inspection's attribution."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ActivityLog,
    ROLE_SANITATION,
    SanitaryBusinessType,
    SanitaryEstablishment,
    SanitaryInspection,
    UserProfile,
)


@override_settings(USE_SEED_DATA=False)
class MobileInspectionAttributionTests(TestCase):
    def test_client_cannot_attribute_alices_inspection_to_bob(self):
        users = get_user_model()
        alice = users.objects.create_user(
            "synthetic_alice", first_name="Alice", last_name="Inspector",
        )
        bob = users.objects.create_user(
            "synthetic_bob", first_name="Bob", last_name="Inspector",
        )
        for inspector in (alice, bob):
            UserProfile.objects.create(user=inspector, role=ROLE_SANITATION)
        business_type = SanitaryBusinessType.objects.create(name="Synthetic business type")
        establishment = SanitaryEstablishment.objects.create(
            business_name="Synthetic establishment", owner_name="Synthetic owner",
            business_type=business_type, barangay="Abo-abo", address="Synthetic address",
        )
        client = APIClient()
        token = Token.objects.create(user=alice)
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = client.post("/api/mobile/sanitation/inspections/", {
            "establishment": establishment.pk,
            "inspector_name": bob.get_full_name(),
            "inspection_date": "2026-11-01",
            "status_after_inspection": "good_standing",
        }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        inspection = SanitaryInspection.objects.get(pk=response.data["id"])
        audit = ActivityLog.objects.get(
            module="sanitation", action="create", record_type="SanitaryInspection",
            record_id=str(inspection.pk),
        )
        self.assertEqual(response.wsgi_request.user.pk, alice.pk)
        self.assertEqual(audit.user_id, alice.pk)
        print("ATTRIBUTION_EVIDENCE " + json.dumps({
            "http_status": response.status_code,
            "response": response.data,
            "stored_inspector_name": inspection.inspector_name,
            "authenticated_actor": response.wsgi_request.user.username,
            "audit_actor": audit.user.username,
            "expected_inspector_name": alice.get_full_name(),
        }, default=str), flush=True)
        self.assertEqual(inspection.inspector_name, alice.get_full_name())


@override_settings(USE_SEED_DATA=False)
class MobileInspectionAttributionCompatibilityTests(TestCase):
    def setUp(self):
        self.alice = get_user_model().objects.create_user(
            "synthetic_alice", first_name="Alice", last_name="Inspector",
        )
        UserProfile.objects.create(user=self.alice, role=ROLE_SANITATION)
        self.token = Token.objects.create(user=self.alice)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        business_type = SanitaryBusinessType.objects.create(name="Synthetic business type")
        self.establishment = SanitaryEstablishment.objects.create(
            business_name="Synthetic establishment", owner_name="Synthetic owner",
            business_type=business_type, barangay="Abo-abo", address="Synthetic address",
        )
        historical = SanitaryInspection.objects.create(
            establishment=self.establishment, inspector_name="Historical Bob",
            inspection_date="2025-01-01", findings="Historical findings",
        )
        self.historical = SanitaryInspection.objects.values().get(pk=historical.pk)

    def submit(self, identity=None, format="json"):
        return self.client.post("/api/mobile/sanitation/inspections/", {
            "establishment": self.establishment.pk,
            "inspection_date": "2026-11-01",
            "status_after_inspection": "good_standing",
            "findings": "Synthetic findings", "remarks": "Synthetic remarks",
            "next_due_date": "2026-12-01",
            "checklist_items": [],
            **(identity or {}),
        }, format=format)

    def assert_attributed(self, response, expected):
        self.assertEqual(response.status_code, 201, response.data)
        inspection = SanitaryInspection.objects.get(pk=response.data["id"])
        self.assertEqual(response.data["inspector_name"], expected)
        self.assertEqual(inspection.inspector_name, expected)
        self.assertEqual(inspection.findings, "Synthetic findings")
        self.assertEqual(inspection.remarks, "Synthetic remarks")
        self.assertEqual(inspection.status_after_inspection, "good_standing")
        self.assertEqual(str(inspection.next_due_date), "2026-12-01")
        self.assertFalse(inspection.is_draft)
        self.assertEqual(list(inspection.checklist_items.all()), [])
        self.assertEqual(
            SanitaryInspection.objects.values().get(pk=self.historical["id"]),
            self.historical,
        )

    def test_omitted_name_uses_authenticated_full_name(self):
        self.assert_attributed(self.submit(), "Alice Inspector")

    def test_legacy_alias_cannot_override_authenticated_identity(self):
        self.assert_attributed(self.submit({"inspector": "Bob Inspector"}), "Alice Inspector")

    def test_ordinary_matching_name_is_preserved(self):
        self.assert_attributed(self.submit({"inspector_name": "Alice Inspector"}), "Alice Inspector")

    def test_whitespace_full_name_falls_back_to_username(self):
        self.alice.first_name = "  "
        self.alice.last_name = " "
        self.alice.save()
        self.assert_attributed(self.submit({"inspector_name": "Bob Inspector"}), "synthetic_alice")

    def test_full_name_is_trimmed(self):
        self.alice.first_name = "  Alice"
        self.alice.last_name = "Inspector  "
        self.alice.save()
        self.assert_attributed(self.submit(), "Alice Inspector")

    def test_multipart_submission_uses_authenticated_identity(self):
        self.assert_attributed(self.submit({"inspector_name": "Bob Inspector"}, format="multipart"), "Alice Inspector")

    def test_admin_role_remains_authorized(self):
        self.alice.profile.role = "admin"
        self.alice.profile.save()
        self.assert_attributed(self.submit(), "Alice Inspector")

    def test_unauthenticated_request_is_rejected_without_creating_inspection(self):
        self.client.credentials()
        self.assertEqual(self.submit().status_code, 401)
        self.assertEqual(SanitaryInspection.objects.count(), 1)

    def test_unauthorized_role_is_rejected_without_creating_inspection(self):
        self.alice.profile.role = "tourism"
        self.alice.profile.save()
        self.assertEqual(self.submit().status_code, 403)
        self.assertEqual(SanitaryInspection.objects.count(), 1)

    def test_missing_profile_is_rejected_without_creating_inspection(self):
        self.alice.profile.delete()
        self.assertEqual(self.submit().status_code, 403)
        self.assertEqual(SanitaryInspection.objects.count(), 1)

    def test_inactive_account_is_rejected_without_creating_inspection(self):
        self.alice.is_active = False
        self.alice.save()
        self.assertEqual(self.submit().status_code, 401)
        self.assertEqual(SanitaryInspection.objects.count(), 1)
