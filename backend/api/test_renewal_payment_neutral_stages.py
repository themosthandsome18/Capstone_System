"""Payment-neutral advancement, with readable and actionable legacy stages."""
from datetime import date
from unittest.mock import patch

from django.test import TestCase, override_settings

from . import test_renewal_payment_preservation as payment_tests
from .models import ActivityLog, SanitaryEstablishment, SanitaryPermitRenewal
from .services.sanitation import sync_renewal_progress


@override_settings(USE_SEED_DATA=False)
class PaymentNeutralRenewalStageTests(TestCase):
    setUp = payment_tests.RenewalPaymentPreservationTests.setUp
    renewal = payment_tests.RenewalPaymentPreservationTests.renewal
    request = payment_tests.RenewalPaymentPreservationTests.request
    assert_financials = payment_tests.RenewalPaymentPreservationTests.assert_financials
    receipt = payment_tests.RenewalPaymentPreservationTests.receipt

    def test_inspection_advances_directly_to_approved_without_payment(self):
        row = self.renewal(stage="inspection_scheduled")
        with patch("api.views.sanitation.mark_renewal_paid", side_effect=AssertionError("Must not confirm payment")):
            response = self.request(row, {"action": "advance_stage"})
        self.assertEqual(response.status_code, 200, response.data)
        row.refresh_from_db()
        print("PAYMENT_NEUTRAL_RED_EVIDENCE", {"http": response.status_code,
              "stage": row.stage, "progress": row.progress, "payment": row.payment_status}, flush=True)
        self.assertEqual((row.stage, response.data["stage_label"], row.progress), ("approved", "Approved", 83))
        self.assert_financials(row, "unpaid")
        self.assertIsNone(row.released_at)

    def test_full_active_sequence_preserves_each_payment_value_and_audits(self):
        transitions = (("application_filed", 33), ("requirements_review", 50),
                       ("inspection_scheduled", 67), ("approved", 83), ("released", 100))
        for payment in ("unpaid", "partial", "paid"):
            with self.subTest(payment=payment):
                row = self.renewal(f"SYN-SEQUENCE-{payment}", stage="notice_sent", payment=payment)
                for expected_stage, progress in transitions:
                    response = self.request(row, {"action": "advance_stage"})
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assert_financials(row, payment)
                    self.assertEqual((row.stage, row.progress), (expected_stage, progress))
                    self.assertEqual((response.data["stage"], response.data["progress"]), (expected_stage, progress))
                    if expected_stage != "released":
                        self.assertIsNone(row.released_at)
                events = ActivityLog.objects.filter(record_id=row.renewal_id, record_type="SanitaryPermitRenewal")
                self.assertEqual(events.count(), 5)
                self.assertEqual(set(events.values_list("user_id", flat=True)), {self.user.pk})
                self.record.refresh_from_db()
                self.assertEqual(self.record.permit_number, row.permit_number)
                self.assertEqual(self.record.permit_issued_date, row.released_at)
                self.assertEqual(self.record.permit_expiry_date, date(2028, 1, 1))
                self.assertEqual((self.record.permit_status, self.record.enforcement_stage), ("suspended", "suspension"))

    def test_legacy_payment_pending_is_readable_and_needs_one_advance(self):
        untouched = self.renewal("SYN-UNTOUCHED", stage="payment_pending")
        historical = SanitaryPermitRenewal.objects.values().get(pk=untouched.pk)
        for payment in ("unpaid", "partial", "paid"):
            with self.subTest(payment=payment):
                row = self.renewal(f"SYN-LEGACY-{payment}", stage="payment_pending", payment=payment)
                SanitaryPermitRenewal.objects.filter(pk=row.pk).update(progress=71)
                before = SanitaryPermitRenewal.objects.values().get(pk=row.pk)
                response = self.client.get(f"/api/sanitation/renewals/{row.pk}/")
                self.assertEqual(response.status_code, 200)
                self.assertEqual((response.data["stage_label"], response.data["progress"]), ("Payment Pending", 71))
                listing = self.client.get("/api/sanitation/renewals/?stage=payment_pending")
                self.assertEqual(listing.status_code, 200)
                self.assertIn(row.pk, [item["id"] for item in listing.data["rows"]])
                self.assertEqual(SanitaryPermitRenewal.objects.values().get(pk=row.pk), before)
                self.assertFalse(ActivityLog.objects.filter(record_id=row.renewal_id).exists())
                response = self.request(row, {"action": "advance_stage"})
                self.assertEqual(response.status_code, 200, response.data)
                self.assert_financials(row, payment)
                self.assertEqual((row.stage, row.progress), ("approved", 83))
                self.assertIsNone(row.released_at)
                self.assertEqual(ActivityLog.objects.filter(record_id=row.renewal_id).count(), 1)
        self.assertEqual(SanitaryPermitRenewal.objects.values().get(pk=untouched.pk), historical)

    def test_sync_progress_uses_six_stages_without_rewriting_legacy_stage(self):
        for stage, progress in (("notice_sent", 17), ("application_filed", 33), ("requirements_review", 50),
                                ("inspection_scheduled", 67), ("approved", 83), ("released", 100),
                                ("payment_pending", 71), ("lapsed", 8)):
            with self.subTest(stage=stage):
                row = self.renewal("SYN-SYNC-" + stage, stage=stage, payment="partial")
                sync_renewal_progress(row)
                self.assert_financials(row, "partial")
                self.assertEqual((row.stage, row.progress), (stage, progress))

    def test_new_api_record_and_lapsed_restart_use_current_progress(self):
        response = self.client.post("/api/sanitation/renewals/", {
            "renewal_id": "SYN-NEW-NEUTRAL", "establishment": self.record.pk,
            "permit_number": "SYN-NEW", "expiration_date": "2027-01-01",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data["stage"], response.data["progress"]), ("notice_sent", 17))
        row = self.renewal("SYN-LAPSED", stage="lapsed", payment="partial")
        response = self.request(row, {"action": "advance_stage"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_financials(row, "partial")
        self.assertEqual((row.stage, row.progress), ("application_filed", 33))
        self.assertIsNone(row.released_at)

    def test_repeated_release_advance_preserves_recorded_release_date(self):
        row = self.renewal(stage="released", payment="partial")
        SanitaryPermitRenewal.objects.filter(pk=row.pk).update(released_at=date(2025, 6, 4), progress=100)
        response = self.request(row, {"action": "advance_stage"})
        self.assertEqual(response.status_code, 200)
        self.assert_financials(row, "partial")
        self.assertEqual((row.stage, row.progress, row.released_at), ("released", 100, date(2025, 6, 4)))
        self.record.refresh_from_db()
        self.assertEqual(self.record.permit_issued_date, date(2025, 6, 4))

    def test_audit_failure_rolls_back_new_and_legacy_advance(self):
        self.client.raise_request_exception = False
        for stage in ("inspection_scheduled", "payment_pending"):
            with self.subTest(stage=stage):
                row = self.renewal("SYN-ROLLBACK-" + stage, stage=stage)
                before = SanitaryPermitRenewal.objects.values().get(pk=row.pk)
                establishment = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
                audits = list(ActivityLog.objects.values())
                with patch("api.views.sanitation.log_activity", side_effect=RuntimeError("Synthetic audit failure")):
                    response = self.request(row, {"action": "advance_stage"})
                self.assertEqual(response.status_code, 500)
                self.assertEqual(SanitaryPermitRenewal.objects.values().get(pk=row.pk), before)
                self.assertEqual(SanitaryEstablishment.objects.values().get(pk=self.record.pk), establishment)
                self.assertEqual(list(ActivityLog.objects.values()), audits)
