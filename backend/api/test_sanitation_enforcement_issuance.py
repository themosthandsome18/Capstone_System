import json
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.contrib.auth.models import User
from django.db import connection, transaction
from django.test import LiveServerTestCase, TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ActivityLog, ROLE_ADMIN, ROLE_SANITATION, SanitaryBusinessType,
    SanitaryEstablishment, UserProfile,
)


class IssuanceFixture:
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(username="synthetic_issuer")
        UserProfile.objects.create(user=self.user, role=ROLE_SANITATION)
        kind = SanitaryBusinessType.objects.create(name="Synthetic issuance cafe")
        self.record = SanitaryEstablishment.objects.create(
            business_name="Synthetic issuance", owner_name="Owner", business_type=kind,
            address="  Original address  ", barangay="Daungan", permit_status="conditional",
            compliance_status="violation", permit_number="SYNTHETIC-NOV",
            permit_expiry_date="2026-12-31", remarks="  Preserve exact  ",
        )
        self.url = f"/api/sanitation/establishments/{self.record.pk}/enforcement-stage/"
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def issue(self, stage="warning", previous=""):
        return self.client.post(self.url, {
            "stage": stage, "expected_previous_stage": previous,
        }, format="json")

    def events(self):
        return ActivityLog.objects.filter(record_type="SanitaryEnforcementStage")


@override_settings(USE_SEED_DATA=False)
class EnforcementIssuanceTests(IssuanceFixture, TestCase):
    def test_allowed_roles(self):
        for role in (ROLE_ADMIN, ROLE_SANITATION):
            with self.subTest(role=role):
                self.user.profile.role = role
                self.user.profile.save()
                SanitaryEstablishment.objects.filter(pk=self.record.pk).update(enforcement_stage="")
                response = self.issue()
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.data["enforcement_stage"], "warning")

    def test_unauthorized_roles_and_public(self):
        for role in ("tourism", "tourist", "establishment"):
            with self.subTest(role=role):
                self.user.profile.role = role
                self.user.profile.save()
                self.assertEqual(self.issue().status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.issue().status_code, (401, 403))
        self.record.refresh_from_db()
        self.assertEqual(self.record.enforcement_stage, "")
        self.assertEqual(self.events().count(), 0)

    def test_sequence_and_atomic_audit_preserve_unrelated_fields(self):
        previous = ""
        before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        for stage in ("warning", "nov_1", "nov_2", "nov_3"):
            response = self.issue(stage, previous)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertTrue(response.data["changed"])
            event = self.events().latest("pk")
            self.assertEqual(event.record_id, str(self.record.pk))
            self.assertEqual(event.user_id, self.user.pk)
            self.assertEqual(event.module, "sanitation")
            self.assertEqual(event.action, "update")
            self.assertEqual(json.loads(event.record_label), {
                "previous_stage": previous, "new_stage": stage, "actor_id": self.user.pk,
            })
            self.assertIsNotNone(event.created_at)
            self.assertEqual(response.data["event_id"], event.pk)
            previous = stage
        after = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        for key in before.keys() - {"enforcement_stage", "updated_at"}:
            self.assertEqual(after[key], before[key], key)
        self.assertEqual(self.events().count(), 4)

    def test_skipping_reversal_clearing_and_invalid_input(self):
        for current, requested in (("", "nov_1"), ("warning", "nov_2"),
                                   ("nov_2", "warning"), ("nov_3", "nov_1"),
                                   ("nov_1", ""), ("", None), ("", "invalid")):
            with self.subTest(current=current, requested=requested):
                SanitaryEstablishment.objects.filter(pk=self.record.pk).update(enforcement_stage=current)
                self.assertEqual(self.issue(requested, current).status_code, 400)
                self.record.refresh_from_db()
                self.assertEqual(self.record.enforcement_stage, current)
        self.assertEqual(self.events().count(), 0)

    def test_suspension_cannot_be_issued_before_nov_3(self):
        for current in ("", "warning", "nov_1", "nov_2"):
            SanitaryEstablishment.objects.filter(pk=self.record.pk).update(enforcement_stage=current)
            response = self.issue("suspension", current)
            self.assertEqual(response.status_code, 400)
            self.assertIn("stage", response.data)
            self.record.refresh_from_db()
            self.assertEqual(self.record.permit_status, "conditional")
        self.assertEqual(self.events().count(), 0)

    def test_same_stage_noop_does_not_save_or_log(self):
        self.assertEqual(self.issue().status_code, 200)
        before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        response = self.issue("warning", "warning")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["changed"])
        self.assertIsNone(response.data["event_id"])
        self.assertEqual(self.events().count(), 1)
        self.assertEqual(SanitaryEstablishment.objects.values().get(pk=self.record.pk), before)

    def test_stale_expected_stage_conflicts_even_for_same_target(self):
        self.assertEqual(self.issue().status_code, 200)
        response = self.issue("warning", "")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "stale_enforcement_stage")
        self.assertEqual(self.events().count(), 1)

    def test_required_fields_and_expected_value_validation(self):
        for payload in ({}, {"stage": "warning"}, {"expected_previous_stage": ""},
                        {"stage": "warning", "expected_previous_stage": None},
                        {"stage": "warning", "expected_previous_stage": "unknown"}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 400)
        self.assertEqual(self.events().count(), 0)

    def test_actor_timestamp_and_other_fields_cannot_be_supplied(self):
        response = self.client.post(self.url, {
            "stage": "warning", "expected_previous_stage": "", "actor_id": 999,
            "created_at": "2000-01-01", "permit_status": "active",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.events().count(), 0)

    def test_audit_failure_rolls_back_stage_and_timestamp(self):
        before = SanitaryEstablishment.objects.values().get(pk=self.record.pk)
        with patch("api.models.ActivityLog.objects.create", side_effect=RuntimeError("Synthetic audit failure")):
            with self.assertRaisesRegex(RuntimeError, "Synthetic audit failure"):
                self.issue()
        self.assertEqual(SanitaryEstablishment.objects.values().get(pk=self.record.pk), before)
        self.assertEqual(self.events().count(), 0)

    def test_not_found_and_post_only(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)
        self.assertEqual(self.client.post(
            "/api/sanitation/establishments/999999/enforcement-stage/",
            {"stage": "warning", "expected_previous_stage": ""}, format="json",
        ).status_code, 404)


@skipUnless(connection.vendor == "postgresql", "Requires disposable PostgreSQL; SQLite is not row-lock proof")
@override_settings(USE_SEED_DATA=False)
class EnforcementConcurrentHttpTests(IssuanceFixture, LiveServerTestCase):
    host = "127.0.0.1"

    def test_simultaneous_http_requests_create_one_event_and_one_conflict(self):
        token = Token.objects.create(user=self.user)
        barrier = Barrier(2)

        def send():
            request = Request(self.live_server_url + self.url, data=json.dumps({
                "stage": "warning", "expected_previous_stage": "",
            }).encode(), headers={
                "Content-Type": "application/json", "Authorization": f"Token {token.key}",
            }, method="POST")
            barrier.wait(timeout=10)
            try:
                with urlopen(request, timeout=20) as response:
                    return response.status, json.loads(response.read())
            except HTTPError as response:
                return response.code, json.loads(response.read())

        with ThreadPoolExecutor(max_workers=2) as pool:
            # Hold this row until both actual HTTP handlers are waiting for its
            # PostgreSQL lock, proving overlap rather than merely rapid replay.
            with transaction.atomic():
                SanitaryEstablishment.objects.select_for_update().get(pk=self.record.pk)
                futures = [pool.submit(send) for _ in range(2)]
                deadline = time.monotonic() + 10
                waiting = 0
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_stat_clear_snapshot()")
                        cursor.execute("""
                            SELECT count(*) FROM pg_stat_activity
                            WHERE datname = current_database() AND pid <> pg_backend_pid()
                              AND wait_event_type = 'Lock'
                        """)
                        waiting = cursor.fetchone()[0]
                    if waiting >= 2:
                        break
                    time.sleep(0.02)
            results = [future.result(timeout=20) for future in futures]
        self.assertEqual(waiting, 2, f"Both HTTP requests must overlap on the PostgreSQL row lock; {results}")
        self.assertEqual(sorted(code for code, _ in results), [200, 409], results)
        self.record.refresh_from_db()
        self.assertEqual(self.record.enforcement_stage, "warning")
        self.assertEqual(self.events().count(), 1)
        event = self.events().get()
        self.assertEqual(json.loads(event.record_label)["previous_stage"], "")
        self.assertEqual(event.user_id, self.user.pk)
        print("PostgreSQL HTTP concurrency: 2 waiting handlers; statuses [200, 409]; 1 audit event")
