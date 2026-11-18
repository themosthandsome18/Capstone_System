"""Real loopback HTTP + PostgreSQL row-lock proof; test-only development routes."""
from concurrent.futures import ThreadPoolExecutor
import io
import json
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image, PngImagePlugin
from django.db import connection, transaction
from django.test import LiveServerTestCase, override_settings
from django.urls import include, path
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from unittest.mock import patch

from api.models import NativePhotoAttempt
from api.services import front_photos, native_photo_workflow as workflow
from api.services.household_photos import HOUSEHOLD_PHOTOS
from api.services.establishment_photos import ESTABLISHMENT_PHOTOS
from api import test_native_photo_workflow as fixtures
from api.views import private_photos as photo_views


def development_view(kind):
    @transaction.non_atomic_requests
    @api_view(['GET', 'PUT'])
    @parser_classes([MultiPartParser])
    @permission_classes([IsAuthenticated])
    def view(request, owner_id):
        def replace(pk, data, extension, legacy):
            return front_photos.replace_front_photo(kind, pk, data, extension, None,
                native_development=True, actor=request.user)
        return photo_views._front_photo(request, owner_model=kind.owner_model, owner_id=owner_id,
            photo_model=kind.photo_model, owner_field=kind.owner_field, replace=replace)
    return view


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def review_fixture(request):
    if request.method == 'GET':
        return Response(workflow.list_unresolved_attempts(request.user, limit=10))
    try:
        return Response(workflow.review_attempt(request.user, request.data['attempt_id'],
            expected_revision=request.data['expected_revision']))
    except workflow.NativeTransitionRejected:
        return Response({'detail': 'Stale or invalid review.'}, status=409)


urlpatterns = [path('dev/household/<int:owner_id>/front-photo/', development_view(HOUSEHOLD_PHOTOS)),
               path('dev/establishment/<int:owner_id>/front-photo/', development_view(ESTABLISHMENT_PHOTOS)),
               path('dev/native-attempts/', review_fixture), path('api/', include('api.urls'))]
image_bytes = fixtures.image_bytes


@override_settings(ROOT_URLCONF=__name__, SANITATION_NATIVE_PHOTO_DEVELOPMENT=True, USE_SEED_DATA=False)
class NativePhotoHTTPTests(LiveServerTestCase):
    host = '127.0.0.1'
    allow_loopback_http = True
    user = fixtures.NativePhotoWorkflowTests.user
    upload = fixtures.NativePhotoWorkflowTests.upload
    current_key = fixtures.NativePhotoWorkflowTests.current_key
    seed_legacy = fixtures.NativePhotoWorkflowTests.seed_legacy

    def setUp(self):
        fixtures.NativePhotoWorkflowTests.setUp(self)
        for name in ('api.services.private_photos.get_private_photo_store', 'api.views.private_photos.get_private_photo_store'):
            mock = patch(name, return_value=self.legacy)
            mock.start()
            self.addCleanup(mock.stop)
        self.token = Token.objects.create(user=self.staff).key
        self.admin_token = Token.objects.create(user=self.admin).key

    def request(self, path, *, token=None, method='GET', photo=None, data=None):
        headers = {}
        if token:
            headers['Authorization'] = 'Token ' + token
        body = None
        if photo is not None:
            boundary = 'synthetic-native-http-boundary'
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="front.png"\r\n'
                    'Content-Type: image/png\r\n\r\n').encode() + photo + f'\r\n--{boundary}--\r\n'.encode()
            headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
        elif data is not None:
            body = json.dumps(data).encode()
            headers['Content-Type'] = 'application/json'
        try:
            response = urlopen(Request(self.live_server_url + path, data=body, headers=headers, method=method), timeout=20)
        except HTTPError as error:
            response = error
        with response:
            return response.code, dict(response.headers), response.read()

    def url(self, kind, owner):
        return f'/dev/{kind.owner_field}/{owner.pk}/front-photo/'

    def test_actual_conflict_and_ambiguous_http_keep_links_with_zero_deletes(self):
        old = self.seed_legacy(HOUSEHOLD_PHOTOS, self.house)
        self.native.fixed_key = HOUSEHOLD_PHOTOS.new_key(self.house.pk, 'png')
        self.native.objects[self.native.fixed_key] = b'pre-existing-object'
        code, headers, body = self.request(self.url(HOUSEHOLD_PHOTOS, self.house), token=self.token, method='PUT', photo=image_bytes())
        self.assertEqual(code, 409)
        self.assertEqual(json.loads(body)['photo_outcome'], 'CONFLICT')
        self.native.fixed_key = None
        self.native.mode = 'ambiguous'
        code, _, body = self.request(self.url(HOUSEHOLD_PHOTOS, self.house), token=self.token, method='PUT', photo=image_bytes())
        self.assertEqual(code, 503)
        self.assertEqual(json.loads(body)['photo_outcome'], 'AMBIGUOUS')
        self.assertEqual(self.current_key(HOUSEHOLD_PHOTOS, self.house), old)
        self.assertEqual(self.native.deletes + self.legacy.deletes, [])
        self.assertEqual(headers['Cache-Control'], 'private, no-store')

    def test_original_routes_do_not_select_native_even_when_setting_enabled(self):
        code, _, _ = self.request(f'/api/households/records/{self.house.pk}/front-photo/',
                                 token=self.token, method='PUT', photo=image_bytes())
        self.assertEqual(code, 200)
        self.assertFalse(self.native.calls)
        self.assertFalse(NativePhotoAttempt.objects.exists())
        self.assertEqual(len(self.legacy.writes), 1)

    def test_authorization_validation_metadata_removal_and_native_read_fail_closed(self):
        url = self.url(HOUSEHOLD_PHOTOS, self.house)
        self.assertEqual(self.request(url, method='PUT', photo=image_bytes())[0], 401)
        tourist = self.user('native-http-tourism', 'tourism')
        token = Token.objects.create(user=tourist).key
        self.assertEqual(self.request(url, token=token, method='PUT', photo=image_bytes())[0], 403)
        self.assertEqual(self.request(url, token=self.token, method='PUT', photo=b'invalid')[0], 400)
        self.assertFalse(self.native.calls)
        markers = PngImagePlugin.PngInfo()
        markers.add_text('GPS', 'synthetic-private-metadata')
        output = io.BytesIO()
        Image.new('RGB', (3, 2), 'blue').save(output, 'PNG', pnginfo=markers)
        self.assertEqual(self.request(url, token=self.token, method='PUT', photo=output.getvalue())[0], 200)
        payload = next(iter(self.native.objects.values()))
        with Image.open(io.BytesIO(payload)) as clean:
            self.assertNotIn('GPS', clean.info)
        code, headers, body = self.request(url, token=self.token)
        self.assertEqual(code, 503)
        self.assertEqual(headers['Cache-Control'], 'private, no-store')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertNotIn(b'profile-photos/', body)

    def test_operator_review_actual_http_is_authorized_and_idempotent(self):
        self.native.mode = 'ambiguous'
        self.request(self.url(HOUSEHOLD_PHOTOS, self.house), token=self.token, method='PUT', photo=image_bytes())
        row = NativePhotoAttempt.objects.get()
        self.assertEqual(self.request('/dev/native-attempts/', token=self.token)[0], 403)
        payload = {'attempt_id': str(row.pk), 'expected_revision': row.revision}
        self.assertEqual(self.request('/dev/native-attempts/', token=self.token, method='POST', data=payload)[0], 403)
        first = self.request('/dev/native-attempts/', token=self.admin_token, method='POST', data=payload)
        second = self.request('/dev/native-attempts/', token=self.admin_token, method='POST', data=payload)
        self.assertEqual((first[0], second[0]), (200, 200))
        self.assertEqual(json.loads(first[2])['revision'], json.loads(second[2])['revision'])
        self.assertEqual(json.loads(second[2])['state'], 'AMBIGUOUS')
        self.assertEqual(self.native.deletes, [])

    def race(self, kind, owner, *, replacement=False):
        if replacement:
            self.upload(kind, owner)
        before = kind.owner_model.objects.filter(pk=owner.pk).values().get()
        existing_count = len(self.native.objects)
        self.native.barrier = threading.Barrier(2)
        observations = []
        with ThreadPoolExecutor(max_workers=2) as pool:
            with transaction.atomic():
                kind.owner_model.objects.select_for_update().get(pk=owner.pk)
                locker = connection.connection.get_backend_pid()
                futures = [pool.submit(self.request, self.url(kind, owner), token=self.token, method='PUT', photo=image_bytes()) for _ in range(2)]
                def parent_lock_proven(rows):
                    graph = {pid: blockers for pid, wait, blockers, query in rows}
                    def reaches_owner(pid, seen):
                        if pid == locker:
                            return True
                        if pid in seen:
                            return False
                        return any(reaches_owner(other, seen | {pid}) for other in graph.get(pid, []))
                    return (len(rows) == 2 and all(wait == 'Lock' and reaches_owner(pid, set())
                        and kind.owner_model._meta.db_table in query and 'FOR UPDATE' in query
                        for pid, wait, blockers, query in rows))
                deadline = time.monotonic() + 12
                while time.monotonic() < deadline:
                    with self.native.lock:
                        pids = list(self.native.backend_pids[-2:])
                    if len(pids) == 2:
                        with connection.cursor() as cursor:
                            cursor.execute('SELECT pg_stat_clear_snapshot()')
                            cursor.execute('SELECT pid,wait_event_type,pg_blocking_pids(pid),query FROM pg_stat_activity WHERE pid = ANY(%s)', [pids])
                            observations = cursor.fetchall()
                        if parent_lock_proven(observations):
                            break
                    time.sleep(0.05)
                self.assertEqual(len(observations), 2, 'Both independent HTTP connections must reach the parent lock')
                self.assertTrue(parent_lock_proven(observations), repr(observations))
            responses = [future.result(timeout=20) for future in futures]
        self.native.barrier = None
        self.assertEqual([item[0] for item in responses], [200, 200])
        self.assertEqual(kind.photo_model.objects.filter(**{f'{kind.owner_field}_id': owner.pk}).count(), 1)
        rows = NativePhotoAttempt.objects.filter(owner_kind=kind.owner_field, owner_record_id=owner.pk)
        self.assertEqual(rows.filter(state='LINKED').count(), 1)
        self.assertEqual(rows.filter(state='RETIRED_HELD').count(), 2 if replacement else 1)
        current = self.current_key(kind, owner)
        self.assertEqual(rows.get(state='LINKED').object_key, current)
        self.assertIn(current, self.native.objects)
        self.assertEqual(len(self.native.objects), existing_count + 2)
        self.assertEqual(self.native.deletes + self.legacy.deletes, [])
        self.assertEqual(kind.owner_model.objects.filter(pk=owner.pk).values().get(), before)
        print(json.dumps({'native_http_race': kind.owner_field, 'replacement': replacement,
                          'overlapping_requests': 2, 'verified_lock_waiters': len(observations),
                          'parent_locker': locker, 'wait_graph': [{'pid': pid, 'blocked_by': blockers}
                              for pid, wait, blockers, query in observations], 'current_links': 1, 'delete_calls': 0}))

    def test_household_overlapping_first_uploads(self):
        self.race(HOUSEHOLD_PHOTOS, self.house)

    def test_establishment_overlapping_first_uploads(self):
        self.race(ESTABLISHMENT_PHOTOS, self.establishment)

    def test_household_overlapping_replacements(self):
        self.race(HOUSEHOLD_PHOTOS, self.house, replacement=True)

    def test_establishment_overlapping_replacements(self):
        self.race(ESTABLISHMENT_PHOTOS, self.establishment, replacement=True)

    def key_fence_race(self, *, deleting):
        target = (self.seed_legacy(HOUSEHOLD_PHOTOS, self.house) if deleting else
                  HOUSEHOLD_PHOTOS.new_key(self.house.pk, 'png'))
        self.native.fixed_key = target
        self.native.objects = self.legacy.objects
        entered, release = threading.Event(), threading.Event()
        blocking_pids, events, observed = [], [], []
        operation = self.legacy.delete if deleting else self.legacy.write
        def paused(key, *args):
            if key == target:
                blocking_pids.append(connection.connection.get_backend_pid())
                entered.set()
                if not release.wait(timeout=15):
                    raise AssertionError('Fence release was not signaled')
            result = operation(key, *args)
            if key == target:
                events.append('legacy-finished')
            return result
        native_create = self.native.create
        def observe_create(*args, **kwargs):
            result = native_create(*args, **kwargs)
            events.append('native-' + result.outcome.value)
            return result
        with patch.object(self.legacy, 'delete' if deleting else 'write', side_effect=paused), \
                patch.object(self.native, 'create', side_effect=observe_create), \
                ThreadPoolExecutor(max_workers=2) as pool:
            key_patch = patch.object(front_photos.FrontPhotoKind, 'new_key', return_value=target) if not deleting else None
            if key_patch:
                key_patch.start()
            try:
                legacy = pool.submit(self.request, f'/api/households/records/{self.house.pk}/front-photo/',
                    token=self.token, method='PUT', photo=image_bytes())
                self.assertTrue(entered.wait(timeout=10))
                native = pool.submit(self.request, self.url(HOUSEHOLD_PHOTOS, self.house),
                    token=self.token, method='PUT', photo=image_bytes())
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_stat_clear_snapshot()')
                        cursor.execute("SELECT pid,pg_blocking_pids(pid) FROM pg_stat_activity WHERE wait_event_type='Lock' AND %s=ANY(pg_blocking_pids(pid)) AND query LIKE '%%pg_advisory_xact_lock%%'", [blocking_pids[0]])
                        observed = cursor.fetchall()
                    if observed:
                        break
                    time.sleep(0.05)
                self.assertTrue(observed, 'Native registration must wait until the legacy mutation finishes')
                self.assertFalse(self.native.calls)
            finally:
                release.set()
                if key_patch:
                    key_patch.stop()
            responses = [legacy.result(timeout=20), native.result(timeout=20)]
        self.assertEqual([result[0] for result in responses], [200, 200 if deleting else 409])
        self.assertEqual(events[0], 'legacy-finished')
        self.assertIn(target, self.native.objects)
        self.assertEqual(self.native.deletes, [])
        if deleting:
            self.assertEqual(events, ['legacy-finished', 'native-CREATED'])
            self.assertEqual(self.current_key(HOUSEHOLD_PHOTOS, self.house), target)
            self.assertEqual(NativePhotoAttempt.objects.get().state, 'LINKED')
        else:
            self.assertEqual(NativePhotoAttempt.objects.get().state, 'CONFLICT')
            self.assertEqual(self.legacy.deletes, [])
        print(json.dumps({'key_fence': 'legacy-delete' if deleting else 'legacy-write',
                          'verified_advisory_waiters': len(observed), 'native_delete_calls': 0}))

    def test_native_registration_waits_for_overlapping_legacy_write(self):
        self.key_fence_race(deleting=False)

    def test_native_registration_waits_for_overlapping_legacy_cleanup(self):
        self.key_fence_race(deleting=True)
