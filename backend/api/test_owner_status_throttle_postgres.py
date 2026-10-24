"""Test A only: real HTTP / DatabaseCache lost-failure reproduction.

Run with python -m backend.settings_owner_throttle_test [test labels]; the
runner owns the disposable cluster. Original RED evidence (before the fix):
PostgreSQL PIDs 4640/11788 both read
zero failures; two completed writes and two HTTP 404s retained one failure
(AssertionError 1 != 2, exit 1). The sequential control passed, exit 0.
"""
import json
import re
import threading
import time
from datetime import timedelta
import uuid
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from django.core.cache import caches
from django.core.cache.backends.db import DatabaseCache
from django.db import connection, transaction
from django.test import LiveServerTestCase, SimpleTestCase, override_settings
from django.utils import timezone
from .services import owner_throttle_history as history_store
from django.urls import path

from .throttles import OwnerStatusRateThrottle
from .views.mobile import mobile_sanitation_establishment_status

urlpatterns = [path("api/mobile/sanitation/establishment-status/",
                    mobile_sanitation_establishment_status)]


# Ordinary discovery sees no database-using test classes. Only the attested
# runner may register them, before DiscoverRunner calculates database aliases.
def _register_owned_suite(owner):
    import sys
    from django.core.exceptions import ImproperlyConfigured
    runner = sys.modules.get("backend.settings_owner_throttle_test")
    if runner is None or getattr(runner, "_OWNER", None) is not owner or owner is None:
        raise ImproperlyConfigured("Use python -m backend.settings_owner_throttle_test")
    owner.attest()
    class OwnerThrottlePostgresTests(LiveServerTestCase):
        host = "127.0.0.1"

        @classmethod
        def setUpClass(cls):
            db = connection.settings_dict
            if (connection.vendor != "postgresql" or db["HOST"] != "127.0.0.1"
                    or not re.fullmatch(r"test_owner_throttle_[a-f0-9]{12}", db["NAME"])):
                raise RuntimeError("Disposable PostgreSQL test database required")
            super().setUpClass()

        def setUp(self):
            self.cache = caches["throttle"]
            self.key = "owner-test-" + uuid.uuid4().hex
            self.assertIsInstance(self.cache, DatabaseCache)
            # Isolate this run's key only; keep the real address-derived key suffix.
            original = OwnerStatusRateThrottle.get_cache_key
            prefix = self.key
            self.key_patch = patch.object(
                OwnerStatusRateThrottle, "get_cache_key",
                lambda throttle, request, view: prefix + ":" + original(throttle, request, view),
            )
            self.key_patch.start()
            self.addCleanup(self.key_patch.stop)
            self.key += ":throttle_owner_status_ip_127.0.0.1"
            self.assertIsNone(self.cache.get(self.key))
            self.addCleanup(self.cache.delete, self.key)

        def post(self, code="SYNTHETIC-INVALID", address="127.0.0.1"):
            request = Request(self.live_server_url + "/api/mobile/sanitation/establishment-status/",
                              data=json.dumps({"code": code}).encode(),
                              headers={"Content-Type": "application/json", "X-Forwarded-For": address}, method="POST")
            try:
                response = build_opener(ProxyHandler({})).open(request, timeout=15)
            except HTTPError as error:
                response = error
            with response:
                body = json.load(response)
                return response.status, response.headers.get("Cache-Control"), body

        def test_sequential_control(self):
            results = [self.post() for _ in range(21)]
            self.assertEqual([r[0] for r in results], [404] * 20 + [429])
            self.assertTrue(all(r[1] == "no-store" for r in results))
            count = len(self.cache.get(self.key, []))
            print(json.dumps({"scenario": "sequential", "statuses": [r[0] for r in results],
                              "failures": count, "no_store": True}), flush=True)
            self.assertEqual(count, 20)

        def seed(self, stamps, expired=False):
            self.cache.set(self.key, stamps, 3600)
            if expired:
                with connection.cursor() as cursor:
                    cursor.execute('UPDATE api_throttle_cache SET expires = %s WHERE cache_key = %s',
                                   [timezone.now() - timedelta(seconds=1), self.cache.make_key(self.key)])

        def race(self, initial):
            if initial == "existing":
                self.seed([time.time()])
            elif initial == "expired":
                self.seed([time.time() - 7200], expired=True)
            barrier = threading.Barrier(2, timeout=5)
            locked, release = threading.Event(), threading.Event()
            mutex = threading.Lock()
            results, errors, pids, blockers = [], [], [], []
            original = history_store.record_failure

            def instrumented(cache, key, duration, timer):
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid()")
                    pids.append(cursor.fetchone()[0])
                barrier.wait()

                def observe(execute, sql, params, many, context):
                    result = execute(sql, params, many, context)
                    if sql.endswith(" FOR UPDATE"):
                        with mutex:
                            first = not locked.is_set()
                            if first:
                                locked.set()
                        if first and not release.wait(5):
                            raise RuntimeError("HARNESS: release missing")
                    return result
                with connection.execute_wrapper(observe):
                    return original(cache, key, duration, timer)

            def send():
                try:
                    results.append(self.post())
                except Exception as error:
                    errors.append(repr(error))

            with patch.object(history_store, "record_failure", side_effect=instrumented):
                threads = [threading.Thread(target=send) for _ in range(2)]
                try:
                    for thread in threads:
                        thread.start()
                    self.assertTrue(locked.wait(6), "HARNESS: no row lock")
                    deadline = time.monotonic() + 1.5
                    while time.monotonic() < deadline:
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT pid, pg_blocking_pids(pid) FROM pg_stat_activity WHERE pid = ANY(%s)", [pids])
                            blockers = [(pid, blocked_by) for pid, blocked_by in cursor.fetchall()
                                        if any(other in pids for other in blocked_by)]
                        if blockers:
                            break
                        time.sleep(0.01)
                    self.assertTrue(blockers, "HARNESS: no observed PostgreSQL blocker")
                finally:
                    release.set()
                    barrier.abort()
                    for thread in threads:
                        thread.join(20)
            self.assertFalse(any(t.is_alive() for t in threads))
            self.assertEqual(errors, [])
            self.assertEqual(len(set(pids)), 2)
            self.assertEqual(sorted(r[0] for r in results), [404, 404], results)
            self.assertTrue(all(r[1] == "no-store" for r in results))
            count = len(self.cache.get(self.key, []))
            print(json.dumps({"scenario": initial, "pids": pids, "blocking": blockers,
                              "statuses": [r[0] for r in results], "stored_failures": count}), flush=True)
            self.assertEqual(count, 3 if initial == "existing" else 2)

        def test_concurrent_failure_records(self):
            self.race("absent")

        def test_concurrent_existing_key(self):
            self.race("existing")

        def test_concurrent_expired_key(self):
            self.race("expired")

        def assert_unavailable(self, result):
            self.assertEqual(result, (503, "no-store", {
                "detail": "Owner lookup is temporarily unavailable. Please try again later."}))

        def test_write_error_rolls_back_placeholder_and_existing_history(self):
            original = history_store.record_failure
            def failing(*args):
                def reject(execute, sql, params, many, context):
                    if sql.startswith('UPDATE '):
                        # A real PostgreSQL statement error, not mocked persistence.
                        return execute("SELECT 1/0", None, False, context)
                    return execute(sql, params, many, context)
                with connection.execute_wrapper(reject):
                    return original(*args)
            for existing in (False, True):
                with self.subTest(existing=existing):
                    if existing:
                        self.seed([time.time()])
                    before = self.cache.get(self.key)
                    with patch.object(history_store, "record_failure", side_effect=failing):
                        self.assert_unavailable(self.post())
                    self.assertEqual(self.cache.get(self.key), before)

        def test_lock_timeout_is_controlled(self):
            self.seed([time.time()])
            results, errors = [], []
            def send():
                try:
                    results.append(self.post())
                except Exception as exc:
                    errors.append(repr(exc))
            thread = threading.Thread(target=send)
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute('SELECT value FROM api_throttle_cache WHERE cache_key = %s FOR UPDATE',
                                   [self.cache.make_key(self.key)])
                started = time.monotonic()
                thread.start()
                thread.join(8)
                alive = thread.is_alive()
            thread.join(20)
            self.assertFalse(alive, "HARNESS: lock timeout did not finish")
            self.assertEqual(errors, [])
            self.assertEqual(len(results), 1)
            self.assert_unavailable(results[0])
            self.assertLess(time.monotonic() - started, 8)
            self.assertEqual(len(self.cache.get(self.key)), 1)

        def test_expired_admission_read_does_not_delete_refreshed_history(self):
            self.seed([time.time() - 7200], expired=True)
            read, release = threading.Event(), threading.Event()
            errors, values = [], []
            original = history_store._history
            def hold(conn, row):
                if threading.current_thread().name == "expired-reader":
                    read.set()
                    if not release.wait(5):
                        raise RuntimeError("HARNESS: read release missing")
                return original(conn, row)
            def reader():
                try:
                    values.append(history_store.read_history(caches["throttle"], self.key))
                except Exception as exc:
                    errors.append(repr(exc))
                finally:
                    connection.close()
            with patch.object(history_store, "_history", side_effect=hold):
                thread = threading.Thread(target=reader, name="expired-reader")
                thread.start()
                try:
                    self.assertTrue(read.wait(5))
                    self.assertEqual(self.post()[0], 404)
                finally:
                    release.set()
                    thread.join(10)
            self.assertFalse(thread.is_alive())
            self.assertEqual(errors, [])
            self.assertEqual(values, [[]])
            self.assertEqual(len(self.cache.get(self.key)), 1)

        def test_malformed_live_history_fails_closed(self):
            for value in ({"bad": 1}, [True], [float("nan")], ["bad"]):
                with self.subTest(value=value):
                    self.cache.set(self.key, value, 3600)
                    self.assert_unavailable(self.post())
            with connection.cursor() as cursor:
                cursor.execute('UPDATE api_throttle_cache SET value = %s WHERE cache_key = %s',
                               ["not base64!", self.cache.make_key(self.key)])
            self.assert_unavailable(self.post())

        def test_unsupported_cache_and_vendor_fail_closed(self):
            with override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
                                          "throttle": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}):
                self.assert_unavailable(self.post())
            with patch.object(type(connection._connections[connection._alias]), "vendor", "unsupported"):
                self.assert_unavailable(self.post())

        def test_key_version_and_cache_encoding(self):
            from django.conf import settings
            config = {**settings.CACHES, "throttle": {**settings.CACHES["throttle"],
                      "KEY_PREFIX": "owner-compat", "VERSION": 7}}
            with override_settings(CACHES=config):
                cache = caches["throttle"]
                self.assertEqual(self.post()[0], 404)
                self.assertEqual(len(cache.get(self.key)), 1)
                self.assertEqual(cache.make_key(self.key), "owner-compat:7:" + self.key)
                with connection.cursor() as cursor:
                    cursor.execute('SELECT COUNT(*) FROM api_throttle_cache WHERE cache_key = %s',
                                   [cache.make_key(self.key)])
                    self.assertEqual(cursor.fetchone()[0], 1)
                cache.delete(self.key)

        def test_rolling_window_pruning(self):
            now = time.time()
            self.seed([now - 10, now - 7200])
            self.assertEqual(self.post()[0], 404)
            self.assertEqual(len(self.cache.get(self.key)), 2)

        def test_stricter_timeouts_preserved_and_outer_limits_restored(self):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '100ms'")
                    cursor.execute("SET LOCAL statement_timeout = '200ms'")
                history_store.record_failure(self.cache, self.key, 3600, time.time)
                with connection.cursor() as cursor:
                    cursor.execute("SELECT current_setting('lock_timeout'), current_setting('statement_timeout')")
                    self.assertEqual(cursor.fetchone(), ('100ms', '200ms'))

        def test_success_exemption_and_address_isolation(self):
            from .models import SanitaryBusinessType, SanitaryEstablishment
            from .services.tracking_codes import hash_tracking_code
            from django.conf import settings
            business = SanitaryBusinessType.objects.create(name="Synthetic owner test")
            SanitaryEstablishment.objects.create(business_type=business, business_name="Synthetic",
                owner_name="Synthetic", barangay="Synthetic", address="Synthetic",
                tracking_code_hash=hash_tracking_code("22223333", settings.TRACKING_CODE_KEY))
            for _ in range(25):
                result = self.post("MBN-2222-3333")
                self.assertEqual(result[0:2], (200, "no-store"))
            self.assertIsNone(self.cache.get(self.key))
            for _ in range(20):
                self.assertEqual(self.post()[0], 404)
            self.assertEqual(self.post("MBN-2222-3333")[0], 429)
            self.assertEqual(self.post("MBN-2222-3333", "192.0.2.9")[0], 200)


    class OwnerAliasFailureTests(SimpleTestCase):
        def test_unknown_router_alias_returns_generic_no_store_503(self):
            with patch.object(history_store.router, "db_for_write", return_value="synthetic-secret-alias"):
                response = self.client.post("/api/mobile/sanitation/establishment-status/",
                                            data=json.dumps({"code": "SYNTHETIC-INVALID"}),
                                            content_type="application/json")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response["Cache-Control"], "no-store")
            self.assertEqual(response.json(), {
                "detail": "Owner lookup is temporarily unavailable. Please try again later."})
            self.assertNotIn("synthetic-secret-alias", response.content.decode())

        def test_recording_unknown_router_alias_is_translated(self):
            with patch.object(history_store.router, "db_for_write", return_value="synthetic-secret-alias"):
                with self.assertRaises(history_store.OwnerHistoryUnavailable) as failure:
                    history_store.record_failure(caches["throttle"], "synthetic-key", 3600, time.time)
            self.assertEqual(str(failure.exception),
                             "Owner lookup is temporarily unavailable. Please try again later.")

    globals().update(OwnerThrottlePostgresTests=OwnerThrottlePostgresTests,
                     OwnerAliasFailureTests=OwnerAliasFailureTests)
    globals()["_registered_owner"] = owner


def load_tests(loader, tests, pattern):
    from django.core.exceptions import ImproperlyConfigured
    owner = globals().get("_registered_owner")
    if owner is None:
        raise ImproperlyConfigured(
            "Isolated PostgreSQL suite requires python -m backend.settings_owner_throttle_test; "
            "ordinary discovery is refused before database setup")
    owner.attest()
    return tests
