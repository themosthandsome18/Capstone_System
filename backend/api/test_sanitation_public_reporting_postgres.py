"""Run explicitly with sanitized settings and a disposable PostgreSQL cluster.

Uses actual concurrent loopback HTTP requests and observes a PostgreSQL lock wait,
not SQLite, mocked responses, or staggered sequential requests.
"""

import json
import threading
import time
from unittest import skipUnless
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from django.contrib.auth.models import User
from django.core.cache import caches
from django.db import IntegrityError, connection, transaction
from django.test import LiveServerTestCase, override_settings

from .models import ActivityLog, Barangay, SanitaryComplaint
from .services.public_reporting import FINGERPRINT_RECORD_TYPE, record_submission


@skipUnless(connection.vendor == "postgresql", "Requires explicitly isolated PostgreSQL")
@override_settings(USE_SEED_DATA=False)
class PublicReportingPostgresTests(LiveServerTestCase):
    host = "127.0.0.1"

    def setUp(self):
        caches["throttle"].clear()
        Barangay.objects.create(name="Daungan")
        self.payload = {
            "complainant_name": "Synthetic PostgreSQL Resident",
            "contact_number": "09171234567", "category": "Severe Sewage Overflow",
            "barangay": "Daungan", "location_address": "Purok 3",
            "description": "Synthetic concurrency report", "client_submission_id": "pg-simultaneous-1",
        }

    def post(self, payload=None):
        request = Request(
            self.live_server_url + "/api/mobile/sanitation/reports/",
            data=json.dumps(self.payload if payload is None else payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            response = build_opener(ProxyHandler({})).open(request, timeout=20)
        except HTTPError as error:
            response = error
        with response:
            return response.code, json.load(response)

    def assert_race(self, different):
        barrier = threading.Barrier(2)
        results, errors, backend_pids, lock_waits = [], [], [], []
        original_create = SanitaryComplaint.objects.create

        def simultaneous_insert(**kwargs):
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                backend_pids.append(cursor.fetchone()[0])
            barrier.wait(timeout=10)
            return original_create(**kwargs)

        def persist_and_observe_wait(complaint, fingerprint):
            record_submission(complaint, fingerprint)
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_stat_clear_snapshot()")
                    cursor.execute("""
                        SELECT pid, wait_event_type FROM pg_stat_activity
                        WHERE datname = current_database() AND pid <> pg_backend_pid()
                          AND wait_event_type = 'Lock'
                          AND query LIKE 'INSERT INTO "api_sanitarycomplaint"%'
                    """)
                    waiting = cursor.fetchall()
                if waiting:
                    lock_waits.extend(waiting)
                    return
                time.sleep(0.02)
            raise AssertionError("No concurrent INSERT lock wait observed")

        def send(payload):
            try:
                results.append(self.post(payload))
            except Exception as error:
                errors.append(repr(error))

        second = {**self.payload, "description": "Different private report"} if different else self.payload
        with patch.object(SanitaryComplaint.objects, "create", side_effect=simultaneous_insert), \
                patch("api.views.mobile.record_submission", side_effect=persist_and_observe_wait):
            threads = [threading.Thread(target=send, args=(payload,)) for payload in (self.payload, second)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=25)
            self.assertFalse(any(thread.is_alive() for thread in threads))

        self.assertEqual(errors, [])
        self.assertEqual(len(set(backend_pids)), 2, backend_pids)
        self.assertTrue(lock_waits)
        self.assertEqual(sorted(code for code, _ in results), [201, 409] if different else [200, 201], results)
        self.assertEqual(SanitaryComplaint.objects.filter(client_submission_id=self.payload["client_submission_id"]).count(), 1)
        complaint = SanitaryComplaint.objects.get()
        events = ActivityLog.objects.filter(record_type=FINGERPRINT_RECORD_TYPE, record_id=str(complaint.pk))
        self.assertEqual(events.count(), 1)
        receipt = next(body for code, body in results if code == 201)
        self.assertEqual(set(receipt), {"complaint_id", "status", "created_at", "priority"})
        if different:
            conflict = next(body for code, body in results if code == 409)
            self.assertEqual(set(conflict), {"code", "detail"})
            self.assertNotIn(complaint.complaint_id, str(conflict))
            self.assertNotIn(complaint.description, str(conflict))
        else:
            self.assertEqual(results[0][1], results[1][1])
        # A later HTTP retry proves the digest survived the first transaction.
        winner_payload = {**self.payload, "description": complaint.description}
        self.assertEqual(self.post(winner_payload), (200, receipt))
        self.assertEqual(events.count(), 1)
        print(json.dumps({"scenario": "conflicting" if different else "identical",
                          "http_statuses": sorted(code for code, _ in results),
                          "distinct_postgresql_connections": len(set(backend_pids)),
                          "insert_lock_wait_observed": True, "complaints": 1, "digests": 1,
                          "subsequent_retry": 200}))

    def test_simultaneous_identical_payloads(self):
        self.assert_race(different=False)

    def test_simultaneous_conflicting_payloads(self):
        self.assert_race(different=True)

    def test_http_digest_failure_leaves_no_partial_complaint(self):
        with patch("api.views.mobile.record_submission", side_effect=RuntimeError("Synthetic digest failure")):
            code, body = self.post()
        self.assertEqual(code, 500)
        self.assertNotIn("Synthetic digest failure", str(body))
        self.assertEqual(SanitaryComplaint.objects.count(), 0)
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_digest_has_durable_database_uniqueness(self):
        """RED until a schema-backed uniqueness contract is approved."""
        self.assertEqual(self.post()[0], 201)
        event = ActivityLog.objects.get(record_type=FINGERPRINT_RECORD_TYPE)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ActivityLog.objects.create(
                    user=None, module=event.module, action=event.action,
                    record_type=event.record_type, record_id=event.record_id,
                    record_label=event.record_label,
                )

    def test_admin_delete_cannot_break_a_saved_retry(self):
        """RED: readonly_fields alone does not prevent deleting the digest."""
        first = self.post()
        self.assertEqual(first[0], 201)
        event = ActivityLog.objects.get(record_type=FINGERPRINT_RECORD_TYPE)
        user = User.objects.create_superuser(username="synthetic_digest_admin", password=None)
        self.client.force_login(user)
        deleted = self.client.post(f"/admin/api/activitylog/{event.pk}/delete/", {"post": "yes"})
        self.assertIn(deleted.status_code, (302, 403))
        retry = self.post()
        print(json.dumps({"scenario": "admin_digest_deletion", "admin_status": deleted.status_code,
                          "digest_retained": ActivityLog.objects.filter(pk=event.pk).exists(),
                          "retry_status": retry[0], "complaints": SanitaryComplaint.objects.count()}))
        self.assertTrue(ActivityLog.objects.filter(pk=event.pk).exists())
        self.assertEqual(retry, (200, first[1]))
