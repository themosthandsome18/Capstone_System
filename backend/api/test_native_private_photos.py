"""Offline-only contract for the unconnected native create-only adapter."""
import importlib
import io
import json
import logging
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from api.services import private_photos

SECRET = 'sb_secret_offline_adapter_sentinel'
PROJECT = 'a' * 20
ENDPOINT = f'https://{PROJECT}.supabase.co'
BUCKET = 'synthetic-private'
KEY = 'profile-photos/households/1/' + 'a' * 32 + '.png'
PNG = b'\x89PNG\r\n\x1a\nsynthetic'


def options(**changes):
    return dict(enabled=True, private_bucket_confirmed=True, project_ref=PROJECT,
                endpoint_url=ENDPOINT, bucket=BUCKET, secret_key=SECRET) | changes


class Response:
    def __init__(self, status=200, body=b'{}'):
        self.code, self.body, self.closed, self.limit = status, body, False, None

    def read(self, limit):
        self.limit = limit
        return self.body[:limit]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.closed = True


class NativePrivatePhotoTests(SimpleTestCase):
    def setUp(self):
        self.native = importlib.import_module('api.services.native_private_photos')
        for name in ('socket.getaddrinfo', 'socket.socket.connect', 'subprocess.Popen'):
            guard = patch(name, side_effect=AssertionError('External access forbidden'))
            guard.start()
            self.addCleanup(guard.stop)
        self.opener = Mock()
        opener_patch = patch.object(self.native.urllib.request, 'build_opener', return_value=self.opener)
        opener_patch.start()
        self.addCleanup(opener_patch.stop)
        self.store = self.native.NativeCreateOnlyStore(options())

    def outcome(self, status, body=b'{}', **kwargs):
        response = Response(status, body)
        self.opener.open.return_value = response
        result = self.store.create(KEY, PNG, **kwargs)
        self.assertTrue(response.closed)
        self.assertEqual(response.limit, self.native.MAX_RESPONSE_BYTES + 1)
        return result

    def test_first_create_is_typed_acknowledgment_not_deletion_ownership(self):
        result = self.outcome(200)
        self.assertEqual(result.outcome, self.native.CreateOutcome.CREATED)
        self.assertEqual(result.http_status, 200)
        self.assertFalse(result.deletion_authorized)
        self.assertNotIsInstance(result, Exception)

    def test_existing_path_conflict_preserves_object_and_never_deletes(self):
        existing = {KEY: b'original'}
        def send(request, timeout):
            self.assertEqual(request.get_header('X-upsert'), 'false')
            candidate = request.full_url.split(BUCKET + '/', 1)[1]
            if candidate in existing and request.get_header('X-upsert') != 'true':
                return Response(400, b'{"error":"Duplicate","message":"' + SECRET.encode() + b'"}')
            existing[candidate] = request.data
            return Response()
        self.opener.open.side_effect = send
        result = self.store.create(KEY, PNG)
        self.assertEqual(result.outcome, self.native.CreateOutcome.CONFLICT)
        self.assertEqual(existing[KEY], b'original')
        self.assertFalse(result.deletion_authorized)
        self.assertFalse(hasattr(self.store, 'delete'))
        self.assertFalse(hasattr(self.store, 'write'))

    def test_same_instance_reuse_is_rejected_before_misbehaving_provider_can_overwrite(self):
        objects = {}
        def overwrite(request, timeout):
            objects[KEY] = request.data
            return Response()
        self.opener.open.side_effect = overwrite
        self.assertEqual(self.store.create(KEY, PNG).outcome, self.native.CreateOutcome.CREATED)
        result = self.store.create(KEY, PNG + b'different')
        self.assertEqual(result.outcome, self.native.CreateOutcome.SAFETY_FAILURE)
        self.assertEqual(result.diagnostic, self.native.CreateDiagnostic.KEY_REUSE)
        self.assertEqual(objects[KEY], PNG)
        self.opener.open.assert_called_once()

    def test_lost_acknowledgment_is_ambiguous_without_delete_or_retry(self):
        objects = {}
        def timeout(request, timeout):
            objects[KEY] = request.data
            raise TimeoutError(SECRET)
        self.opener.open.side_effect = timeout
        result = self.store.create(KEY, PNG)
        self.assertEqual(result.outcome, self.native.CreateOutcome.AMBIGUOUS)
        self.assertIn(KEY, objects)
        self.assertFalse(result.deletion_authorized)
        self.opener.open.assert_called_once()

    def test_authorization_failures_are_distinct(self):
        for status in (401, 403):
            self.store = self.native.NativeCreateOnlyStore(options())
            self.assertEqual(self.outcome(status).outcome, self.native.CreateOutcome.AUTHORIZATION_FAILURE)

    def test_server_and_unknown_responses_are_ambiguous(self):
        for status, body in ((500, b'{}'), (503, b'{}'), (202, b'{}'), (400, b'{}'),
                             (409, b'{}'), (200, b'not-json'), (200, b'[]')):
            self.store = self.native.NativeCreateOnlyStore(options())
            self.assertEqual(self.outcome(status, body).outcome, self.native.CreateOutcome.AMBIGUOUS)

    def test_known_request_rejections_are_unavailable(self):
        for status in (404, 405, 413, 415, 429, 501):
            self.store = self.native.NativeCreateOnlyStore(options())
            self.assertEqual(self.outcome(status).outcome, self.native.CreateOutcome.UNAVAILABLE)

    def test_conflicts_require_explicit_allowlisted_provider_code(self):
        for code in ('Duplicate', 'AlreadyExists', 'AssetAlreadyExists', 'ResourceAlreadyExists'):
            self.store = self.native.NativeCreateOnlyStore(options())
            body = json.dumps({'code': code}).encode()
            self.assertEqual(self.outcome(409, body).outcome, self.native.CreateOutcome.CONFLICT)

    def test_provider_http_errors_use_the_same_classification(self):
        from urllib.error import HTTPError
        self.opener.open.side_effect = HTTPError(ENDPOINT, 400, SECRET, {}, io.BytesIO(b'{"error":"Duplicate"}'))
        result = self.store.create(KEY, PNG)
        self.assertEqual(result.outcome, self.native.CreateOutcome.CONFLICT)
        self.assertNotIn(SECRET, repr(result))

    def test_endpoint_project_bucket_and_credentials_fail_closed(self):
        changes = ({'endpoint_url': 'http://' + PROJECT + '.supabase.co'},
                   {'endpoint_url': 'https://' + 'b' * 20 + '.supabase.co'},
                   {'endpoint_url': ENDPOINT + '/storage/v1/s3'},
                   {'endpoint_url': ENDPOINT + '?key=x'}, {'endpoint_url': ENDPOINT + ':443'},
                   {'project_ref': 'wrong'}, {'bucket': '../other'}, {'bucket': 'x/y'},
                   {'secret_key': 'S3-dummy'}, {'private_bucket_confirmed': False}, {'enabled': False})
        for change in changes:
            value = options()
            value.update(change)
            with self.subTest(field=next(iter(change))), self.assertRaises(self.native.NativePhotoConfigurationError) as caught:
                self.native.NativeCreateOnlyStore(value)
            self.assertNotIn(SECRET, str(caught.exception))
        self.opener.open.assert_not_called()

    def test_generated_keys_are_valid_distinct_and_strictly_server_scoped(self):
        for folder in ('households', 'establishments'):
            keys = {self.store.new_key(folder, 1, 'png') for _ in range(8)}
            self.assertEqual(len(keys), 8)
            for key in keys:
                self.assertEqual(private_photos.validate_key(key), key)
        for args in (('complaints', 1, 'png'), ('households', True, 'png'),
                     ('households', 0, 'png'), ('households', 10**19, 'png'), ('households', 1, 'svg')):
            with self.assertRaises(private_photos.InvalidPrivatePhotoKey):
                self.store.new_key(*args)

    def test_unusable_payloads_keys_and_upsert_are_rejected_without_http(self):
        for key, payload, upsert in ((KEY, PNG, True), ('../other', PNG, False),
                                    (KEY, b'bad', False), (KEY, b'', False),
                                    (KEY, PNG + b'x' * private_photos.MAX_BYTES, False)):
            result = self.store.create(key, payload, upsert=upsert)
            self.assertEqual(result.outcome, self.native.CreateOutcome.SAFETY_FAILURE)
        self.opener.open.assert_not_called()

    def test_actual_wire_contract_and_no_credential_repr(self):
        self.outcome(201)
        request = self.opener.open.call_args.args[0]
        self.assertEqual(request.method, 'POST')
        self.assertEqual(request.full_url, ENDPOINT + '/storage/v1/object/' + BUCKET + '/' + KEY)
        self.assertEqual(request.get_header('Apikey'), SECRET)
        self.assertEqual(request.get_header('X-upsert'), 'false')
        self.assertEqual(request.get_header('Content-type'), 'image/png')
        self.assertEqual(request.get_header('Cache-control'), 'private, no-store')
        self.assertEqual(self.opener.open.call_args.kwargs, {'timeout': 15})
        self.assertNotIn(SECRET, repr(self.store))

    def test_redirect_response_is_a_safety_failure(self):
        self.assertEqual(self.outcome(307).outcome, self.native.CreateOutcome.SAFETY_FAILURE)
        with self.assertRaises(self.native.NativeRedirectRefused) as caught:
            self.native.RejectRedirects().redirect_request(None, None, 307, None, None, SECRET)
        self.assertNotIn(SECRET, str(caught.exception))

    def test_redirect_handler_exception_is_ambiguous_safety_failure_no_retry(self):
        self.opener.open.side_effect = self.native.NativeRedirectRefused()
        result = self.store.create(KEY, PNG)
        self.assertEqual(result.outcome, self.native.CreateOutcome.SAFETY_FAILURE)
        self.assertEqual(result.diagnostic, self.native.CreateDiagnostic.REDIRECT_REFUSED)
        self.assertFalse(result.deletion_authorized)
        self.opener.open.assert_called_once()

    def test_oversized_response_is_ambiguous_and_closed(self):
        result = self.outcome(200, b'x' * (self.native.MAX_RESPONSE_BYTES + 1))
        self.assertEqual(result.outcome, self.native.CreateOutcome.AMBIGUOUS)

    def test_no_provider_messages_or_secret_in_results_and_logs(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        root = logging.getLogger()
        root.addHandler(handler)
        self.addCleanup(root.removeHandler, handler)
        for body in (SECRET.encode(), json.dumps({'error': SECRET, 'message': SECRET}).encode()):
            self.store = self.native.NativeCreateOnlyStore(options())
            result = self.outcome(400, body)
            self.assertNotIn(SECRET, repr(result))
        self.assertNotIn(SECRET, stream.getvalue())

    def test_default_factory_remains_disabled_and_existing_factory_is_s3(self):
        with override_settings(SANITATION_NATIVE_PRIVATE_PHOTOS=None), \
                self.assertRaises(self.native.NativePhotoConfigurationError):
            self.native.get_native_create_only_store()
        with override_settings(SANITATION_NATIVE_PRIVATE_PHOTOS=options(),
                               SANITATION_PRIVATE_PHOTOS={'enabled': False}), \
                self.assertRaises(private_photos.PrivatePhotoUnavailable):
            private_photos.get_private_photo_store()

    def test_native_factory_is_not_referenced_by_active_photo_modules(self):
        import inspect
        from api.services import front_photos, household_photos, establishment_photos
        from api.views import private_photos as views
        for module in (front_photos, household_photos, establishment_photos, views):
            self.assertNotIn('native_private_photos', inspect.getsource(module))

    def test_contradictory_acknowledgment_is_rejected_without_cleanup(self):
        result = self.outcome(200, b'{"Key":"other-bucket/other-object"}')
        self.assertEqual(result.outcome, self.native.CreateOutcome.SAFETY_FAILURE)
        self.assertEqual(result.diagnostic, self.native.CreateDiagnostic.ACKNOWLEDGMENT_MISMATCH)
        self.assertFalse(result.deletion_authorized)

    def test_ambiguous_key_cannot_be_retried_in_same_instance(self):
        self.opener.open.side_effect = OSError(SECRET)
        first = self.store.create(KEY, PNG)
        second = self.store.create(KEY, PNG)
        self.assertEqual(first.outcome, self.native.CreateOutcome.AMBIGUOUS)
        self.assertEqual(second.diagnostic, self.native.CreateDiagnostic.KEY_REUSE)
        self.opener.open.assert_called_once()

    def test_jpeg_and_exact_payload_limit(self):
        self.opener.open.return_value = Response()
        key = KEY.replace('.png', '.jpg')
        payload = b'\xff\xd8\xff' + b'x' * (private_photos.MAX_BYTES - 3)
        self.assertEqual(self.store.create(key, payload).outcome, self.native.CreateOutcome.CREATED)
        self.assertEqual(self.opener.open.call_args.args[0].get_header('Content-type'), 'image/jpeg')

    def test_transport_disables_proxies_and_uses_verified_tls_and_redirect_guard(self):
        import ssl
        import urllib.request
        self.outcome(200)
        handlers = self.native.urllib.request.build_opener.call_args.args
        proxy = next(handler for handler in handlers if isinstance(handler, urllib.request.ProxyHandler))
        tls = next(handler for handler in handlers if isinstance(handler, urllib.request.HTTPSHandler))
        self.assertEqual(proxy.proxies, {})
        self.assertTrue(any(isinstance(handler, self.native.RejectRedirects) for handler in handlers))
        self.assertTrue(tls._context.check_hostname)
        self.assertEqual(tls._context.verify_mode, ssl.CERT_REQUIRED)
