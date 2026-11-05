"""Renewal progression must not act as a financial confirmation."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ActivityLog, SanitaryBusinessType, SanitaryEstablishment, SanitaryPermitRenewal, UserProfile
from .serializers import SanitaryPermitRenewalSerializer
from .services.sanitation import advance_renewal_stage, resolve_overdue_renewal, sync_renewal_progress


@override_settings(USE_SEED_DATA=False)
class RenewalPaymentPreservationTests(TestCase):
    receipt = "  Historic receipt: OR-LEGACY / paid note kept exactly  "

    def setUp(self):
        self.user = get_user_model().objects.create_user("synthetic_renewal_inspector")
        UserProfile.objects.create(user=self.user, role="sanitation")
        token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Token " + token.key)
        kind = SanitaryBusinessType.objects.create(name="Synthetic renewal type")
        self.record = SanitaryEstablishment.objects.create(
            business_name="Synthetic renewal", owner_name="Synthetic owner",
            business_type=kind, barangay="Abo-abo", address="Synthetic address",
            enforcement_stage="suspension", permit_status="suspended",
        )

    def renewal(self, code="SYN-RENEWAL", stage="approved", payment="unpaid"):
        return SanitaryPermitRenewal.objects.create(
            establishment=self.record, renewal_id=code, permit_number=code,
            expiration_date=date(2027, 1, 1), stage=stage, payment_status=payment,
            renewal_fee=Decimal("753.21"), remarks=self.receipt,
        )

    def request(self, renewal, payload):
        return self.client.patch(f"/api/sanitation/renewals/{renewal.pk}/", payload, format="json")

    def assert_financials(self, renewal, payment):
        renewal.refresh_from_db()
        self.assertEqual(renewal.payment_status, payment)
        self.assertEqual(renewal.renewal_fee, Decimal("753.21"))
        self.assertEqual(renewal.remarks, self.receipt)

    def test_release_paths_preserve_each_legacy_payment_value(self):
        for payment in ("unpaid", "partial", "paid"):
            for index, payload in enumerate((
                {"action": "advance_stage"}, {"action": "mark_released"}, {"stage": "released"},
            )):
                with self.subTest(payment=payment, payload=payload):
                    renewal = self.renewal(f"SYN-{payment}-{index}", payment=payment)
                    response = self.request(renewal, payload)
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assert_financials(renewal, payment)
                    self.assertEqual(response.data["payment_status"], payment)
                    self.assertEqual(renewal.stage, "released")
                    self.assertEqual(renewal.progress, 100)
                    self.assertIsNotNone(renewal.released_at)
                    self.record.refresh_from_db()
                    self.assertEqual((self.record.permit_status, self.record.enforcement_stage), ("suspended", "suspension"))
                    self.assertEqual(self.record.permit_number, renewal.permit_number)
                    self.assertEqual(self.record.permit_issued_date, renewal.released_at)
                    self.assertEqual(self.record.permit_expiry_date, date(2028, 1, 1))
                    event = ActivityLog.objects.get(record_id=renewal.renewal_id, record_type="SanitaryPermitRenewal")
                    self.assertEqual(event.user_id, self.user.pk)

    def test_released_ordinary_edit_does_not_confirm_payment(self):
        for payment in ("unpaid", "partial", "paid"):
            with self.subTest(payment=payment):
                renewal = self.renewal(f"SYN-EDIT-{payment}", stage="released", payment=payment)
                response = self.request(renewal, {"submitted_requirements": ["Synthetic requirement"]})
                self.assertEqual(response.status_code, 200, response.data)
                self.assert_financials(renewal, payment)
                self.assertEqual(renewal.submitted_requirements, ["Synthetic requirement"])
                self.assertEqual(response.data["payment_status"], payment)

    def test_creation_at_released_stage_preserves_explicit_financial_values(self):
        response = self.client.post("/api/sanitation/renewals/", {
            "renewal_id": "SYN-CREATE", "establishment": self.record.pk,
            "permit_number": "SYN-CREATE", "expiration_date": "2027-01-01",
            "stage": "released", "payment_status": "partial", "renewal_fee": "753.21", "remarks": self.receipt,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        saved = SanitaryPermitRenewal.objects.get(pk=response.data["id"])
        self.assertEqual((saved.payment_status, saved.renewal_fee), ("partial", Decimal("753.21")))
        self.assertEqual(response.data["payment_status"], "partial")

    def test_explicit_reversal_survives_unrelated_released_edit(self):
        renewal = self.renewal(stage="released", payment="paid")
        self.assertEqual(self.request(renewal, {"action": "mark_unpaid"}).status_code, 200)
        self.assertEqual(self.request(renewal, {"inspection_status": "Synthetic reviewed"}).status_code, 200)
        self.assert_financials(renewal, "unpaid")

    def test_direct_sync_preserves_financials(self):
        renewal = self.renewal(stage="released", payment="partial")
        sync_renewal_progress(renewal)
        self.assert_financials(renewal, "partial")

    def test_stale_progression_instances_cannot_overwrite_newer_financials(self):
        for index, operation in enumerate((advance_renewal_stage, sync_renewal_progress, resolve_overdue_renewal)):
            with self.subTest(operation=operation.__name__):
                stale = self.renewal(f"SYN-STALE-{index}", stage="requirements_review")
                SanitaryPermitRenewal.objects.filter(pk=stale.pk).update(payment_status="partial", renewal_fee="999.99")
                operation(stale)
                saved = SanitaryPermitRenewal.objects.get(pk=stale.pk)
                self.assertEqual((saved.payment_status, saved.renewal_fee), ("partial", Decimal("999.99")))

    def test_stale_unrelated_serializer_edit_preserves_newer_financials(self):
        stale = self.renewal(stage="requirements_review")
        SanitaryPermitRenewal.objects.filter(pk=stale.pk).update(payment_status="partial", renewal_fee="999.99")
        serializer = SanitaryPermitRenewalSerializer(stale, data={"inspection_status": "Edited"}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        sync_renewal_progress(stale)
        saved = SanitaryPermitRenewal.objects.get(pk=stale.pk)
        self.assertEqual((saved.payment_status, saved.renewal_fee), ("partial", Decimal("999.99")))

    def test_payment_neutral_stage_order_and_explicit_payment_actions_remain(self):
        renewal = self.renewal(stage="inspection_scheduled")
        self.assertEqual(self.request(renewal, {"action": "advance_stage"}).status_code, 200)
        renewal.refresh_from_db()
        self.assertEqual((renewal.stage, renewal.payment_status), ("approved", "unpaid"))
        response = self.request(renewal, {"action": "mark_paid", "payment_method": "Cash", "or_number": "SYN-OR"})
        self.assertEqual(response.status_code, 200)
        renewal.refresh_from_db()
        self.assertEqual((renewal.stage, renewal.payment_status), ("approved", "paid"))
        self.assertIn("OR-LEGACY", renewal.remarks)
        self.assertIn("SYN-OR", renewal.remarks)

        legacy = self.renewal("SYN-LEGACY-PAID", stage="payment_pending")
        self.assertEqual(self.request(legacy, {"action": "mark_paid"}).status_code, 200)
        legacy.refresh_from_db()
        self.assertEqual((legacy.stage, legacy.payment_status, legacy.progress), ("approved", "paid", 83))

    def test_invalid_and_unauthorized_requests_preserve_all_columns_and_audits(self):
        renewal = self.renewal(stage="released", payment="partial")
        before = list(SanitaryPermitRenewal.objects.values())
        for payload in ({"stage": "invalid"}, {"renewal_fee": "not a number"}, {"payment_status": "invalid"}):
            with self.subTest(payload=payload):
                self.assertEqual(self.request(renewal, payload).status_code, 400)
                self.assertEqual(list(SanitaryPermitRenewal.objects.values()), before)
                self.assertFalse(ActivityLog.objects.exists())
        self.client.credentials()
        self.assertEqual(self.request(renewal, {"action": "mark_released"}).status_code, 401)
        self.assertEqual(list(SanitaryPermitRenewal.objects.values()), before)
