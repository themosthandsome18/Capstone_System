"""Web inspection authorship is account-derived and immutable during edits."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ActivityLog, SanitaryBusinessType, SanitaryEstablishment, SanitaryInspection, UserProfile


@override_settings(USE_SEED_DATA=False)
class WebInspectionAttributionTests(TestCase):
    def setUp(self):
        self.alice = get_user_model().objects.create_user(
            "synthetic_web_alice", first_name="Alice", last_name="Inspector",
        )
        self.bob = get_user_model().objects.create_user(
            "synthetic_web_bob", first_name="Bob", last_name="Inspector",
        )
        for user in (self.alice, self.bob):
            UserProfile.objects.create(user=user, role="sanitation")
        self.client = APIClient()
        token = Token.objects.create(user=self.alice)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        kind = SanitaryBusinessType.objects.create(name="Synthetic web type")
        self.record = SanitaryEstablishment.objects.create(
            business_name="Synthetic web establishment", owner_name="Synthetic owner",
            business_type=kind, barangay="Abo-abo", address="Synthetic address",
        )
        self.historical = SanitaryInspection.objects.create(
            establishment=self.record, inspector_name="Historical Bob", is_draft=True,
            inspection_date="2025-01-01", findings="Historical findings",
        )
        self.before = SanitaryInspection.objects.values().get(pk=self.historical.pk)

    def payload(self, **changes):
        return {
            "establishment": self.record.pk, "inspection_date": "2026-11-01",
            "status_after_inspection": "good_standing", "inspector_name": self.bob.get_full_name(),
            "findings": "Synthetic findings", "remarks": "Synthetic remarks",
            "next_due_date": "2026-12-01",
            "checklist_items": [{"requirement_name": "Synthetic requirement", "is_complied": True}],
            **changes,
        }

    def audit(self, inspection, action):
        event = ActivityLog.objects.get(
            module="sanitation", action=action, record_type="SanitaryInspection",
            record_id=str(inspection.pk),
        )
        self.assertEqual(event.user_id, self.alice.pk)
        return event

    def test_creation_cannot_claim_bobs_identity(self):
        response = self.client.post("/api/sanitation/inspections/", self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        inspection = SanitaryInspection.objects.get(pk=response.data["id"])
        event = self.audit(inspection, "create")
        self.assertEqual(SanitaryInspection.objects.values().get(pk=self.historical.pk), self.before)
        print("WEB_CREATE_EVIDENCE " + json.dumps({
            "http_status": response.status_code, "response_name": response.data["inspector_name"],
            "stored_name": inspection.inspector_name, "actor": self.alice.username,
            "audit_actor": event.user.username,
        }), flush=True)
        self.assertEqual(inspection.inspector_name, self.alice.get_full_name())

    def assert_edit_preserves_attribution(self, method):
        url = f"/api/sanitation/inspections/{self.historical.pk}/"
        response = getattr(self.client, method)(url, self.payload(), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.historical.refresh_from_db()
        event = self.audit(self.historical, "update")
        print("WEB_EDIT_EVIDENCE " + json.dumps({
            "method": method, "http_status": response.status_code,
            "response_name": response.data["inspector_name"], "stored_name": self.historical.inspector_name,
            "original_name": self.before["inspector_name"], "audit_actor": event.user.username,
        }), flush=True)
        self.assertEqual(self.historical.inspector_name, self.before["inspector_name"])
        self.assertEqual(response.data["inspector_name"], self.before["inspector_name"])
        self.assertEqual(self.historical.findings, "Synthetic findings")
        self.assertEqual(self.historical.remarks, "Synthetic remarks")
        self.assertEqual(str(self.historical.next_due_date), "2026-12-01")
        self.assertEqual(list(self.historical.checklist_items.values_list(
            "requirement_name", "is_complied")), [("Synthetic requirement", True)])

    def test_patch_cannot_overwrite_original_attribution(self):
        self.assert_edit_preserves_attribution("patch")

    def test_put_cannot_overwrite_original_attribution(self):
        self.assert_edit_preserves_attribution("put")

    def test_creation_without_name_uses_authenticated_name(self):
        payload = self.payload()
        payload.pop("inspector_name")
        response = self.client.post("/api/sanitation/inspections/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["inspector_name"], "Alice Inspector")

    def test_blank_account_name_falls_back_to_username(self):
        self.alice.first_name = "  "
        self.alice.last_name = " "
        self.alice.save()
        response = self.client.post("/api/sanitation/inspections/", self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["inspector_name"], self.alice.username)

    def test_admin_creation_is_attributed_to_admin_not_submitted_name(self):
        self.alice.profile.role = "admin"
        self.alice.profile.save()
        self.test_creation_cannot_claim_bobs_identity()

    def test_admin_edit_also_retains_original_author(self):
        self.alice.profile.role = "admin"
        self.alice.profile.save()
        self.assert_edit_preserves_attribution("patch")

    def test_put_without_name_preserves_blank_historical_name(self):
        self.historical.inspector_name = ""
        self.historical.save(update_fields=["inspector_name"])
        payload = self.payload()
        payload.pop("inspector_name")
        response = self.client.put(
            f"/api/sanitation/inspections/{self.historical.pk}/", payload, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.historical.refresh_from_db()
        self.assertEqual(self.historical.inspector_name, "")

    def test_other_inspector_edit_preserves_author_but_audits_editor(self):
        token = Token.objects.create(user=self.bob)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.patch(
            f"/api/sanitation/inspections/{self.historical.pk}/",
            {"remarks": "Bob's permitted edit", "inspector_name": "Another name"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.historical.refresh_from_db()
        self.assertEqual(self.historical.inspector_name, "Historical Bob")
        self.assertEqual(self.historical.remarks, "Bob's permitted edit")
        event = ActivityLog.objects.get(record_type="SanitaryInspection", action="update")
        self.assertEqual(event.user_id, self.bob.pk)

    def test_malformed_name_input_is_ignored_on_edit(self):
        response = self.client.patch(
            f"/api/sanitation/inspections/{self.historical.pk}/",
            {"inspector_name": {"untrusted": "object"}, "remarks": "Valid edit"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.historical.refresh_from_db()
        self.assertEqual(self.historical.inspector_name, "Historical Bob")
        self.assertEqual(self.historical.remarks, "Valid edit")

    def test_ordinary_matching_name_and_multipart_creation_remain_valid(self):
        payload = self.payload(inspector_name="Alice Inspector")
        payload.pop("checklist_items")
        response = self.client.post("/api/sanitation/inspections/", payload, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["inspector_name"], "Alice Inspector")

    def test_unauthenticated_requests_remain_blocked(self):
        self.client.credentials()
        self.assert_denied(401)

    def test_unrelated_role_requests_remain_blocked(self):
        self.alice.profile.role = "tourism"
        self.alice.profile.save()
        self.assert_denied(403)

    def assert_denied(self, expected):
        for method in ("post", "patch", "put"):
            with self.subTest(method=method):
                url = "/api/sanitation/inspections/"
                if method != "post":
                    url += f"{self.historical.pk}/"
                response = getattr(self.client, method)(url, self.payload(), format="json")
                self.assertEqual(response.status_code, expected, response.data)
                self.assertEqual(SanitaryInspection.objects.count(), 1)
                self.assertEqual(SanitaryInspection.objects.values().get(pk=self.historical.pk), self.before)
                self.assertFalse(ActivityLog.objects.filter(record_type="SanitaryInspection").exists())
