from unittest.mock import patch

from django.test import TestCase, override_settings

from .models import SanitaryEstablishment
from .test_sanitation_enforcement_issuance import IssuanceFixture


@override_settings(USE_SEED_DATA=False)
class ViolationPermitPreservationTests(IssuanceFixture, TestCase):
    def payload(self, **changes):
        return {
            "establishment": self.record.pk, "inspector_name": "Synthetic inspector",
            "inspection_date": "2026-10-18", "status_after_inspection": "violation",
            "findings": "Recorded violation finding", "remarks": "Inspection remarks",
            "checklist_items": [{"requirement_name": "Synthetic requirement", "is_complied": False}],
            **changes,
        }

    def assert_preserved(self, before):
        after = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        for key in before.keys() - {"compliance_status", "updated_at"}:
            self.assertEqual(after[key], before[key], key)
        self.assertEqual(after["compliance_status"], "violation")

    def test_web_mobile_final_violation_preserves_every_existing_permit_status(self):
        for url in ("/api/sanitation/inspections/", "/api/mobile/sanitation/inspections/"):
            for stage in ("", "nov_2"):
                for permit in ("active", "conditional", "renewal_due", "no_permit", "suspended"):
                    with self.subTest(url=url, stage=stage, permit=permit):
                        SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                            permit_status=permit, enforcement_stage=stage, compliance_status="good_standing",
                        )
                        before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
                        old_inspections = list(self.record.inspections.values())
                        with patch("api.services.notifications.notify_violation") as notify:
                            response = self.client.post(url, self.payload(), format="json")
                        self.assertEqual(response.status_code, 201, response.data)
                        self.assert_preserved(before)
                        notify.assert_called_once()
                        inspection = self.record.inspections.latest("pk")
                        self.assertEqual(inspection.status_after_inspection, "violation")
                        self.assertEqual(inspection.findings, "Recorded violation finding")
                        self.assertEqual(inspection.remarks, "Inspection remarks")
                        self.assertFalse(inspection.is_draft)
                        self.assertEqual(inspection.checklist_items.get().is_complied, False)
                        for old in old_inspections:
                            self.assertEqual(self.record.inspections.filter(pk=old["id"]).values().get(), old)
                        self.assertEqual(self.events().count(), 0)

    def test_web_put_patch_finalization_preserves_permit_and_notification(self):
        for method in ("put", "patch"):
            with self.subTest(method=method):
                SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                    permit_status="active", enforcement_stage="", compliance_status="good_standing",
                )
                created = self.client.post("/api/sanitation/inspections/", self.payload(is_draft=True), format="json")
                self.assertEqual(created.status_code, 201, created.data)
                before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
                url = f"/api/sanitation/inspections/{created.data['id']}/"
                with patch("api.services.notifications.notify_violation") as notify:
                    response = getattr(self.client, method)(url, self.payload(is_draft=False), format="json")
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assert_preserved(before)
                    notify.assert_called_once()
                    response = getattr(self.client, method)(url, self.payload(is_draft=False), format="json")
                    self.assertEqual(response.status_code, 200)
                    notify.assert_called_once()

    def test_manual_suspension_remains_effective_and_historical_blank_is_not_inferred(self):
        SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
            enforcement_stage="", permit_status="suspended",
        )
        before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        response = self.client.post("/api/sanitation/inspections/", self.payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assert_preserved(before)
        for previous, stage in (("", "warning"), ("warning", "nov_1"), ("nov_1", "nov_2"),
                                ("nov_2", "nov_3"), ("nov_3", "suspension")):
            self.assertEqual(self.issue(stage, previous).status_code, 200)
        response = self.client.post("/api/mobile/sanitation/inspections/", self.payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.record.refresh_from_db()
        self.assertEqual((self.record.enforcement_stage, self.record.permit_status), ("suspension", "suspended"))
        self.assertEqual(self.events().count(), 5)

    def test_other_inspection_mappings_are_unchanged(self):
        for result, expected in (("good_standing", "active"), ("upcoming", "renewal_due"),
                                 ("for_completion", "conditional")):
            with self.subTest(result=result):
                SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                    enforcement_stage="", permit_status="conditional",
                )
                response = self.client.post("/api/sanitation/inspections/", self.payload(status_after_inspection=result), format="json")
                self.assertEqual(response.status_code, 201)
                self.record.refresh_from_db()
                self.assertEqual(self.record.permit_status, expected)
                self.assertEqual(self.record.enforcement_stage, "")
