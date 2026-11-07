"""Name-based interim inspection evidence: authenticated HTTP and persisted state."""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token

from api.models import (
    ActivityLog, Notification, SanitaryBusinessType, SanitaryEstablishment,
    SanitaryInspection, SanitaryInspectionChecklistItem, SanitaryRequirement,
    UserProfile,
)


@override_settings(USE_SEED_DATA=False)
class InspectionEvidenceHTTPTests(LiveServerTestCase):
    host = "127.0.0.1"
    mobile = "/api/mobile/sanitation/inspections/"
    web = "/api/sanitation/inspections/"

    def setUp(self):
        self.tokens = {}
        for role in ("sanitation", "admin", "tourist"):
            user = User.objects.create_user(username="synthetic_evidence_" + role,
                                           first_name="Synthetic", last_name="Inspector")
            UserProfile.objects.update_or_create(user=user, defaults={"role": role})
            self.tokens[role] = Token.objects.create(user=user).key
        self.kind = SanitaryBusinessType.objects.create(name="Synthetic configured")
        self.other = SanitaryBusinessType.objects.create(name="Synthetic other")
        self.empty = SanitaryBusinessType.objects.create(name="Synthetic unconfigured")
        for kind, size, name, required in (
            (self.kind, "sp", "Required A", True),
            (self.kind, "sp", "Required B", True),
            (self.kind, "sp", "Optional C", False),
            (self.kind, "large", "Large only", True),
            (self.other, "sp", "Other category", True),
        ):
            SanitaryRequirement.objects.create(business_type=kind, permit_size=size,
                                              requirement_name=name, is_required=required)
        self.establishment = self.est()

    def est(self, kind=None, size="sp"):
        return SanitaryEstablishment.objects.create(
            business_type=kind or self.kind, permit_size=size,
            business_name="Synthetic evidence " + str(SanitaryEstablishment.objects.count()),
            owner_name="Synthetic", address="Synthetic", barangay="Daungan")

    @staticmethod
    def item(name="Required A", complied=False):
        return {"requirement_name": name, "is_complied": complied, "notes": "Synthetic"}

    def payload(self, items=None, **extra):
        return dict(establishment=self.establishment.pk, inspector_name="Spoofed name",
                    inspection_date=timezone.localdate().isoformat(),
                    status_after_inspection="for_completion", is_draft=False,
                    checklist_items=items if items is not None else [self.item()], **extra)

    def request(self, path, body, method="POST", role="sanitation"):
        headers = {"Content-Type": "application/json"}
        if role:
            headers["Authorization"] = "Token " + self.tokens[role]
        req = Request(self.live_server_url + path, data=json.dumps(body).encode(),
                      headers=headers, method=method)
        try:
            response = urlopen(req, timeout=15)
        except HTTPError as error:
            response = error
        raw = response.read()
        return response.status, json.loads(raw) if raw.startswith((b"{", b"[")) else None

    @staticmethod
    def snapshot():
        return {m.__name__: list(m.objects.order_by("pk").values()) for m in (
            SanitaryInspection, SanitaryInspectionChecklistItem, SanitaryEstablishment,
            Notification, ActivityLog)}

    def reject(self, path, body, method="POST", expected=400, role="sanitation"):
        before = self.snapshot()
        code, response = self.request(path, body, method, role)
        self.assertEqual(code, expected, response)
        self.assertEqual(self.snapshot(), before)

    def create(self, **changes):
        body = self.payload()
        body.update(changes)
        code, response = self.request(self.web, body)
        self.assertEqual(code, 201, response)
        return response["id"]

    def test_configured_empty_final_rejected_mobile_and_web(self):
        for path in (self.mobile, self.web):
            self.reject(path, {**self.payload([]), "status_after_inspection": "good_standing"})

    def test_omitted_observations_are_not_a_finalization_bypass(self):
        body = self.payload()
        body.pop("checklist_items")
        self.reject(self.mobile, body)
        code, response = self.request(self.web, {**body, "is_draft": True})
        self.assertEqual(code, 201, response)

    def test_invented_wrong_category_and_size_rejected(self):
        for path in (self.mobile, self.web):
            for name in ("Invented", "Other category", "Large only"):
                self.reject(path, self.payload([self.item(name)]))

    def test_duplicate_count_cannot_exceed_catalogue_multiplicity(self):
        self.reject(self.mobile, self.payload([self.item(), self.item()]))

    def test_distinct_ids_with_same_wire_name_preserve_multiplicity(self):
        # Exact duplicates are constrained by today's catalogue schema. Distinct
        # stored names can still collide after existing DRF whitespace trimming.
        second = SanitaryRequirement.objects.create(business_type=self.kind,
            permit_size="sp", requirement_name=" Required A ", is_required=False)
        self.assertNotEqual(second.pk, SanitaryRequirement.objects.get(
            business_type=self.kind, requirement_name="Required A").pk)
        code, response = self.request(self.mobile, self.payload([
            self.item(), self.item(" Required A ", True)]))
        self.assertEqual(code, 201, response)
        saved = list(SanitaryInspectionChecklistItem.objects.filter(
            inspection_id=response["id"]).order_by("id").values_list("requirement_name", "is_complied"))
        self.assertEqual(saved, [("Required A", False), ("Required A", True)])
        self.reject(self.mobile, self.payload([self.item()] * 3))

    def test_partial_observations_optional_and_false_do_not_grade_status(self):
        for name in ("Required A", "Optional C"):
            code, response = self.request(self.mobile, {
                **self.payload([self.item(name, False)]), "status_after_inspection": "good_standing"})
            self.assertEqual(code, 201, response)
            self.assertEqual(response["status_after_inspection"], "good_standing")
            self.assertEqual(response["inspector_name"], "Synthetic Inspector")

    def test_unconfigured_empty_final_and_incomplete_draft_preserved(self):
        self.establishment = self.est(self.empty)
        self.create(checklist_items=[])
        self.establishment = self.est()
        self.create(checklist_items=[], is_draft=True)
        self.assertEqual(SanitaryInspection.objects.count(), 2)

    def test_incomplete_draft_accepts_partial_but_not_invented_evidence(self):
        self.create(checklist_items=[self.item()], is_draft=True)
        self.reject(self.web, {**self.payload([self.item("Invented")]), "is_draft": True})

    def test_draft_finalization_uses_effective_existing_evidence(self):
        pk = self.create(checklist_items=[], is_draft=True)
        path = self.web + str(pk) + "/"
        self.reject(path, {"is_draft": False, "status_after_inspection": "good_standing"}, "PATCH")
        code, result = self.request(path, {"is_draft": False, "status_after_inspection": "for_completion",
                                          "checklist_items": [self.item()]}, "PATCH")
        self.assertEqual(code, 200, result)

    def test_draft_finalization_still_requires_explicit_inspector_selected_status(self):
        pk = self.create(is_draft=True)
        self.reject(self.web + str(pk) + "/", {"is_draft": False}, "PATCH")

    def test_put_patch_and_reassignment_revalidate_evidence(self):
        pk = self.create()
        path = self.web + str(pk) + "/"
        self.reject(path, {"checklist_items": [self.item("Invented")]}, "PATCH")
        self.reject(path, {**self.payload([self.item("Large only")])}, "PUT")
        self.reject(path, {"establishment": self.est(self.other).pk}, "PATCH")
        self.reject(path, {"checklist_items": []}, "PATCH")

    def test_status_change_validates_existing_evidence_but_metadata_preserves_history(self):
        pk = self.create()
        SanitaryRequirement.objects.filter(business_type=self.kind, requirement_name="Required A").delete()
        path = self.web + str(pk) + "/"
        code, response = self.request(path, {"remarks": "Historical metadata edit"}, "PATCH")
        self.assertEqual(code, 200, response)
        self.assertEqual(response["checklist_items"][0]["requirement_name"], "Required A")
        self.reject(path, {"status_after_inspection": "for_completion"}, "PATCH")
        self.reject(path, {"status_after_inspection": "violation"}, "PATCH")

    def test_valid_violation_creates_expected_notifications_and_audit(self):
        code, response = self.request(self.mobile, {**self.payload(), "status_after_inspection": "violation"})
        self.assertEqual(code, 201, response)
        self.establishment.refresh_from_db()
        self.assertEqual(self.establishment.compliance_status, "violation")
        self.assertEqual(Notification.objects.count(), 2)
        self.assertEqual(ActivityLog.objects.count(), 1)

    def test_authentication_role_and_unsupported_status_rejections_have_no_writes(self):
        self.reject(self.mobile, self.payload(), expected=401, role=None)
        self.reject(self.mobile, self.payload(), expected=403, role="tourist")
        self.reject(self.web, {**self.payload(), "status_after_inspection": "invented"})

    def test_audit_failure_rolls_back_mobile_and_web_creation(self):
        for path, target in ((self.mobile, "api.views.mobile.log_activity"),
                             (self.web, "api.views.sanitation.log_activity")):
            with patch(target, side_effect=RuntimeError("Synthetic audit failure")):
                self.reject(path, {**self.payload(), "status_after_inspection": "violation"}, expected=500)

    def test_notification_failure_rolls_back_finalization(self):
        pk = self.create(is_draft=True)
        with patch("api.services.notifications.notify_violation", side_effect=RuntimeError("Synthetic notification failure")):
            self.reject(self.web + str(pk) + "/", {"is_draft": False,
                "status_after_inspection": "violation"}, "PATCH", expected=500)
