import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.core.management import call_command
from django.db import connection, transaction
from django.test import LiveServerTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.authtoken.models import Token

from .models import ROLE_ADMIN, ROLE_SANITATION, SanitaryEstablishment, SanitaryPermitRenewal
from .test_sanitation_enforcement_issuance import IssuanceFixture


@override_settings(USE_SEED_DATA=False)
class SuspensionProtectionTests(IssuanceFixture, TestCase):
    def suspend_fixture(self):
        SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
            enforcement_stage="suspension", permit_status="suspended",
        )
        self.record.refresh_from_db()

    def assert_suspended(self):
        self.record.refresh_from_db()
        self.assertEqual(self.record.enforcement_stage, "suspension")
        self.assertEqual(self.record.permit_status, "suspended")

    def test_both_roles_issue_suspension_atomically_and_retry_is_noop(self):
        for role in (ROLE_ADMIN, ROLE_SANITATION):
            with self.subTest(role=role):
                self.user.profile.role = role
                self.user.profile.save()
                SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                    enforcement_stage="nov_3", permit_status="conditional",
                )
                before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
                count = self.events().count()
                response = self.issue("suspension", "nov_3")
                self.assertEqual(response.status_code, 200, response.content)
                self.assert_suspended()
                after = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
                for key in before.keys() - {"enforcement_stage", "permit_status", "updated_at"}:
                    self.assertEqual(after[key], before[key], key)
                event = self.events().latest("pk")
                self.assertEqual(json.loads(event.record_label)["previous_stage"], "nov_3")
                self.assertEqual(json.loads(event.record_label)["new_stage"], "suspension")
                self.assertEqual(event.user_id, self.user.pk)
                response = self.issue("suspension", "suspension")
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.data["changed"])
                self.assertEqual(self.events().count(), count + 1)

    def test_suspension_cannot_be_skipped_reversed_cleared_or_issued_stale(self):
        for current in ("", "warning", "nov_1", "nov_2"):
            SanitaryEstablishment.objects.filter(pk=self.record.pk).update(enforcement_stage=current)
            self.assertEqual(self.issue("suspension", current).status_code, 400)
        self.suspend_fixture()
        for requested in ("", "warning", "nov_3"):
            self.assertEqual(self.issue(requested, "suspension").status_code, 400)
        self.assertEqual(self.issue("suspension", "nov_3").status_code, 409)
        self.assertEqual(self.events().count(), 0)

    def test_suspension_audit_failure_rolls_back_both_fields(self):
        SanitaryEstablishment.objects.filter(pk=self.record.pk).update(enforcement_stage="nov_3")
        before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        with patch("api.models.ActivityLog.objects.create", side_effect=RuntimeError("Synthetic audit failure")):
            with self.assertRaisesRegex(RuntimeError, "Synthetic audit failure"):
                self.issue("suspension", "nov_3")
        self.assertEqual(SanitaryEstablishment.objects.values().get(pk=self.record.pk), before)
        self.assertEqual(self.events().count(), 0)

    def test_web_mobile_inspections_preserve_suspension_and_findings(self):
        self.suspend_fixture()
        for url in ("/api/sanitation/inspections/", "/api/mobile/sanitation/inspections/"):
            for result in ("good_standing", "upcoming", "for_completion", "violation"):
                with self.subTest(url=url, result=result):
                    response = self.client.post(url, {
                        "establishment": self.record.pk, "inspector_name": "Synthetic inspector",
                        "inspection_date": "2026-10-18", "status_after_inspection": result,
                        "findings": "Keep finding", "remarks": "Keep inspection remarks",
                    }, format="json")
                    self.assertEqual(response.status_code, 201, response.data)
                    self.assert_suspended()
                    inspection = self.record.inspections.latest("pk")
                    self.assertEqual(inspection.findings, "Keep finding")
                    self.assertEqual(self.record.compliance_status, result)
                    self.assertEqual(self.record.permit_expiry_date, date(2026, 12, 31))

    def test_violation_notifications_still_fire(self):
        self.suspend_fixture()
        SanitaryEstablishment.objects.filter(pk=self.record.pk).update(compliance_status="good_standing")
        with patch("api.services.notifications.notify_violation") as notify:
            response = self.client.post("/api/sanitation/inspections/", {
                "establishment": self.record.pk, "inspector_name": "Synthetic inspector",
                "inspection_date": "2026-10-18", "status_after_inspection": "violation",
            }, format="json")
        self.assertEqual(response.status_code, 201)
        notify.assert_called_once()
        self.assert_suspended()

    def test_all_renewal_release_and_extension_actions_preserve_suspension(self):
        self.suspend_fixture()
        for index, payload in enumerate((
            {"action": "mark_released"}, {"stage": "released"},
            {"action": "advance_stage"}, {"action": "resolve_overdue"},
            {"action": "extend_validity"},
        )):
            with self.subTest(payload=payload):
                renewal = SanitaryPermitRenewal.objects.create(
                    renewal_id=f"SYNTHETIC-SUSP-{index}", establishment=self.record,
                    permit_number="SYNTHETIC-RELEASE", expiration_date=date(2026, 12, 31),
                    stage="approved",
                )
                response = self.client.patch(f"/api/sanitation/renewals/{renewal.pk}/", payload, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.assert_suspended()
                renewal.refresh_from_db()
                self.assertEqual(self.record.permit_expiry_date.year, 2027)
                if "stage" in payload or payload.get("action") in ("mark_released", "advance_stage"):
                    self.assertEqual(renewal.stage, "released")
                    self.assertEqual(renewal.payment_status, "paid")
                    self.assertIsNotNone(renewal.released_at)

    def test_general_put_patch_explicit_errors_and_unrelated_edits(self):
        self.suspend_fixture()
        detail = f"/api/sanitation/establishments/{self.record.pk}/"
        base = {"business_name": self.record.business_name, "owner_name": "Owner",
                "business_type": self.record.business_type_id, "barangay": "Daungan", "address": "Address"}
        for method in ("put", "patch"):
            for status in ("active", "conditional", "renewal_due", "no_permit"):
                with self.subTest(method=method, status=status):
                    before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
                    response = getattr(self.client, method)(detail, {**base, "permit_status": status}, format="json")
                    self.assertEqual(response.status_code, 400)
                    self.assertIn("permit_status", response.data)
                    self.assertEqual(SanitaryEstablishment.objects.values().get(pk=self.record.pk), before)
            response = getattr(self.client, method)(detail, {**base, "remarks": "Legitimate edit"}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assert_suspended()
            self.assertEqual(self.record.remarks, "Legitimate edit")

    def test_stale_full_and_field_scoped_saves_cannot_overwrite_suspension(self):
        for field_scoped in (False, True):
            SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                enforcement_stage="nov_3", permit_status="active",
            )
            stale = SanitaryEstablishment.objects.get(pk=self.record.pk)
            self.suspend_fixture()
            stale.remarks = "Stale legitimate edit"
            stale.save(**({"update_fields": ["remarks", "permit_status", "enforcement_stage"]} if field_scoped else {}))
            self.assert_suspended()
            self.assertEqual(self.record.remarks, "Stale legitimate edit")

    def test_permit_import_cannot_reactivate(self):
        from openpyxl import Workbook

        self.suspend_fixture()
        self.record.permit_number = "SP-7777-2026"
        self.record.save()
        with TemporaryDirectory(prefix="synthetic-sanitation-import-") as scratch:
            path = Path(scratch) / "synthetic.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "FOOD"
            sheet.append(["SP-7777-2026", None, "Imported owner", "Daungan", date(2026, 1, 1), None, None, "Imported cafe"])
            workbook.save(path)
            workbook.close()
            call_command("import_sanitary_permits", str(path), stdout=StringIO())
        self.assert_suspended()
        self.assertEqual(self.record.owner_name, "Imported owner")
        self.assertTrue(self.record.permit_renewals.exists())


@override_settings(USE_SEED_DATA=False, STORAGES={
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class SuspensionAdminTests(IssuanceFixture, TestCase):
    def test_admin_reactivation_errors_and_unrelated_edit_succeeds(self):
        self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        self.client.force_authenticate(None)
        self.client.force_login(self.user)
        SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
            enforcement_stage="suspension", permit_status="suspended",
        )
        url = reverse("admin:api_sanitaryestablishment_change", args=[self.record.pk])
        payload = {"business_name": "Synthetic issuance", "owner_name": "Owner",
                   "business_type": str(self.record.business_type_id), "permit_size": "sp",
                   "barangay": "Daungan", "address": "Address", "has_permit": "on",
                   "compliance_status": "violation", "permit_status": "active", "_save": "Save"}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Reinstatement is unavailable")
        self.record.refresh_from_db()
        self.assertEqual(self.record.permit_status, "suspended")
        payload.pop("permit_status")
        response = self.client.post(url, {**payload, "remarks": "Admin legitimate edit"})
        self.assertEqual(response.status_code, 302)
        self.record.refresh_from_db()
        self.assertEqual(self.record.remarks, "Admin legitimate edit")
        self.assertEqual(self.record.enforcement_stage, "suspension")
        self.assertEqual(self.record.permit_status, "suspended")


@skipUnless(connection.vendor == "postgresql", "Requires disposable PostgreSQL")
@override_settings(USE_SEED_DATA=False)
class SuspensionConcurrentHttpTests(IssuanceFixture, LiveServerTestCase):
    host = "127.0.0.1"

    def test_suspension_races_with_inspection_renewal_and_general_edit(self):
        token = Token.objects.create(user=self.user)
        renewal = SanitaryPermitRenewal.objects.create(
            renewal_id="SYNTHETIC-RACE", establishment=self.record,
            permit_number="SYNTHETIC-RELEASE", expiration_date=date(2026, 12, 31),
        )
        operations = [
            ("POST", "/api/sanitation/inspections/", {
                "establishment": self.record.pk, "inspector_name": "Synthetic race",
                "inspection_date": "2026-10-18", "status_after_inspection": "good_standing",
            }),
            ("PATCH", f"/api/sanitation/renewals/{renewal.pk}/", {"action": "mark_released"}),
            ("PATCH", f"/api/sanitation/establishments/{self.record.pk}/", {"permit_status": "active", "remarks": "Race edit"}),
        ]
        for method, path, payload in operations:
            with self.subTest(path=path):
                SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                    enforcement_stage="nov_3", permit_status="conditional",
                )
                count = self.events().count()
                barrier = Barrier(2)

                def send(args):
                    verb, endpoint, data = args
                    request = Request(self.live_server_url + endpoint, data=json.dumps(data).encode(),
                                      headers={"Content-Type": "application/json", "Authorization": f"Token {token.key}"}, method=verb)
                    barrier.wait(timeout=10)
                    try:
                        with urlopen(request, timeout=20) as response:
                            return response.status, json.loads(response.read())
                    except HTTPError as response:
                        return response.code, json.loads(response.read())

                with ThreadPoolExecutor(max_workers=2) as pool:
                    with transaction.atomic():
                        SanitaryEstablishment.objects.select_for_update().get(pk=self.record.pk)
                        futures = [pool.submit(send, args) for args in (
                            ("POST", self.url, {"stage": "suspension", "expected_previous_stage": "nov_3"}),
                            (method, path, payload),
                        )]
                        deadline = time.monotonic() + 10
                        waiting = 0
                        while time.monotonic() < deadline:
                            with connection.cursor() as cursor:
                                cursor.execute("SELECT pg_stat_clear_snapshot()")
                                cursor.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'")
                                waiting = cursor.fetchone()[0]
                            if waiting >= 2:
                                break
                            time.sleep(0.02)
                    results = [future.result(timeout=20) for future in futures]
                self.assertEqual(waiting, 2, results)
                self.assertEqual(results[0][0], 200, results)
                self.assertIn(results[1][0], (200, 201, 400), results)
                self.record.refresh_from_db()
                self.assertEqual((self.record.enforcement_stage, self.record.permit_status), ("suspension", "suspended"))
                self.assertEqual(self.events().count(), count + 1)
                self.assertEqual(json.loads(self.events().latest("pk").record_label)["new_stage"], "suspension")
                print(f"Suspension race {path}: 2 lock waiters; statuses {[r[0] for r in results]}; one enforcement event; suspension preserved")
