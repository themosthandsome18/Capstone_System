"""Renewal PATCH business writes and their audit entry must commit together."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TransactionTestCase, override_settings

from .models import ActivityLog, SanitaryEstablishment, SanitaryPermitRenewal, UserProfile
from . import test_renewal_payment_preservation as payment_tests


@override_settings(USE_SEED_DATA=False)
class RenewalAuditAtomicityTests(TransactionTestCase):
    # Reuse only the synthetic fixture/helpers, without inheriting its test methods.
    setUp = payment_tests.RenewalPaymentPreservationTests.setUp
    renewal = payment_tests.RenewalPaymentPreservationTests.renewal
    request = payment_tests.RenewalPaymentPreservationTests.request
    receipt = payment_tests.RenewalPaymentPreservationTests.receipt

    def snapshot(self):
        return (
            list(SanitaryPermitRenewal.objects.order_by("pk").values()),
            list(SanitaryEstablishment.objects.order_by("pk").values()),
            list(ActivityLog.objects.order_by("pk").values()),
        )

    def test_ordinary_edit_rolls_back_when_audit_insert_fails(self):
        row = self.renewal(payment="partial")
        before = self.snapshot()
        self.client.raise_request_exception = False
        with patch("api.services.activity.ActivityLog.objects.create", side_effect=IntegrityError("Synthetic audit failure")):
            response = self.request(row, {"inspection_status": "Synthetic edit before audit failure"})
        row.refresh_from_db()
        print("AUDIT_FAILURE_EVIDENCE", {"http": response.status_code,
              "stored_inspection_status": row.inspection_status,
              "edit_persisted": row.inspection_status == "Synthetic edit before audit failure",
              "audit_count": ActivityLog.objects.count()}, flush=True)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.snapshot(), before)

    def test_audit_failure_rolls_back_related_writes_for_each_patch_action(self):
        self.client.raise_request_exception = False
        for index, payload in enumerate((
            {"action": "advance_stage"}, {"action": "mark_released"}, {"stage": "released"},
            {"action": "resolve_overdue"}, {"action": "extend_validity"},
            {"action": "mark_paid", "or_number": "SYN-NEW-OR"}, {"action": "mark_unpaid"},
        )):
            with self.subTest(payload=payload):
                row = self.renewal(f"SYN-FAIL-{index}", payment="partial")
                before = self.snapshot()
                with patch("api.views.sanitation.log_activity", side_effect=RuntimeError("Synthetic audit failure")):
                    response = self.request(row, payload)
                self.assertEqual(response.status_code, 500)
                self.assertEqual(self.snapshot(), before)

    def test_audit_insert_then_failure_rolls_back_the_audit_too(self):
        row = self.renewal()
        before = self.snapshot()
        from .services.activity import log_activity

        def insert_then_fail(*args, **kwargs):
            log_activity(*args, **kwargs)
            raise RuntimeError("Synthetic failure after audit insert")

        self.client.raise_request_exception = False
        with patch("api.views.sanitation.log_activity", side_effect=insert_then_fail):
            response = self.request(row, {"action": "mark_released"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.snapshot(), before)

    def test_successful_edit_and_release_commit_with_authenticated_audit(self):
        row = self.renewal(payment="partial")
        for payload in ({"submitted_requirements": ["Synthetic requirement"]}, {"action": "mark_released"}):
            response = self.request(row, payload)
            self.assertEqual(response.status_code, 200, response.data)
        row.refresh_from_db()
        self.record.refresh_from_db()
        self.assertEqual(row.submitted_requirements, ["Synthetic requirement"])
        self.assertEqual(row.stage, "released")
        self.assertEqual((row.payment_status, str(row.renewal_fee), row.remarks), ("partial", "753.21", self.receipt))
        self.assertEqual(self.record.permit_number, row.permit_number)
        self.assertEqual(self.record.permit_issued_date, row.released_at)
        self.assertEqual((self.record.permit_status, self.record.enforcement_stage), ("suspended", "suspension"))
        events = ActivityLog.objects.filter(record_id=row.renewal_id, record_type="SanitaryPermitRenewal")
        self.assertEqual(events.count(), 2)
        self.assertEqual(set(events.values_list("user_id", "action", "module")), {(self.user.pk, "update", "sanitation")})

    def test_invalid_unauthorized_and_unsupported_put_do_not_write(self):
        row = self.renewal()
        before = self.snapshot()
        self.assertEqual(self.request(row, {"stage": "invalid", "inspection_status": "Must not persist"}).status_code, 400)
        self.assertEqual(self.client.put(f"/api/sanitation/renewals/{row.pk}/", {}, format="json").status_code, 405)
        self.assertEqual(self.snapshot(), before)
        self.client.credentials()
        self.assertEqual(self.request(row, {"action": "mark_released"}).status_code, 401)
        outsider = get_user_model().objects.create_user("synthetic_no_sanitation_access")
        UserProfile.objects.create(user=outsider, role="tourism")
        self.client.force_authenticate(user=outsider)
        self.assertEqual(self.request(row, {"action": "mark_released"}).status_code, 403)
        self.assertEqual(self.snapshot(), before)
