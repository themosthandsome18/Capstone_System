"""Source-aware regression gates: real loopback HTTP, PostgreSQL and fake stores."""
import json
import io
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from PIL import Image
from django.db import DatabaseError, connection, transaction
from django.test import LiveServerTestCase, override_settings
from rest_framework.authtoken.models import Token

from api.models import NativePhotoAttempt
from api.services import front_photos, native_photo_workflow as workflow
from api.services.household_photos import HOUSEHOLD_PHOTOS
from api.services.establishment_photos import ESTABLISHMENT_PHOTOS
from api import test_native_photo_workflow as fixtures
from api import test_native_photo_workflow_http as http_fixtures

image_bytes = fixtures.image_bytes


@override_settings(USE_SEED_DATA=False, SANITATION_NATIVE_PHOTO_DEVELOPMENT=False)
class PhotoSourceHTTPTests(LiveServerTestCase):
    host = '127.0.0.1'
    allow_loopback_http = True
    user = fixtures.NativePhotoWorkflowTests.user
    request = http_fixtures.NativePhotoHTTPTests.request

    def setUp(self):
        fixtures.NativePhotoWorkflowTests.setUp(self)
        self.token = Token.objects.create(user=self.staff).key
        for target in ('api.services.private_photos.get_private_photo_store',
                       'api.views.private_photos.get_private_photo_store'):
            mocked = patch(target, return_value=self.legacy)
            mocked.start()
            self.addCleanup(mocked.stop)
        self.cases = ((HOUSEHOLD_PHOTOS, self.house), (ESTABLISHMENT_PHOTOS, self.establishment))

    def url(self, kind, owner):
        prefix = 'households/records' if kind == HOUSEHOLD_PHOTOS else 'sanitation/establishments'
        return f'/api/{prefix}/{owner.pk}/front-photo/'

    def link(self, kind, owner):
        return kind.photo_model.objects.get(**{kind.owner_field + '_id': owner.pk})

    def proven_fixture(self, kind, owner):
        # Positive evidence: this test itself writes these exact fake-target bytes.
        key = kind.new_key(owner.pk, 'png')
        self.legacy.write(key, image_bytes())
        return kind.photo_model.objects.create(**{kind.owner_field + '_id': owner.pk}, object_key=key,
            storage_provider='S3', s3_endpoint=self.legacy.options['endpoint_url'],
            s3_bucket=self.legacy.options['bucket'], s3_region=self.legacy.options['region'])

    def receipt(self, kind, owner, key, state='CONFLICT'):
        return NativePhotoAttempt.objects.create(owner_kind=kind.owner_field, owner_record_id=owner.pk,
            project_ref='a' * 20, bucket='unrelated-synthetic-native-target', object_key=key,
            state=state, diagnostic='EXISTING_PATH' if state == 'CONFLICT' else 'TRANSPORT_UNCERTAIN')

    def conflict_read(self, kind, owner):
        before_owner = kind.owner_model.objects.filter(pk=owner.pk).values().get()
        photo = self.proven_fixture(kind, owner)
        before_link = kind.photo_model.objects.values().get(pk=photo.pk)
        before = self.request(self.url(kind, owner), token=self.token)
        self.receipt(kind, owner, photo.object_key)
        after = self.request(self.url(kind, owner), token=self.token)
        print(json.dumps({'source_read': kind.owner_field, 'before_conflict': before[0],
            'after_conflict': after[0], 'exact_bytes_before': before[2] == image_bytes(),
            'exact_bytes_after': after[2] == image_bytes()}), flush=True)
        self.assertEqual((before[0], after[0]), (200, 200))
        for code, headers, content in (before, after):
            self.assertEqual(content, image_bytes())
            self.assertEqual(headers['Cache-Control'], 'private, no-store')
            self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
            self.assertEqual(headers['Cross-Origin-Resource-Policy'], 'same-origin')
        self.assertEqual(kind.photo_model.objects.values().get(pk=photo.pk), before_link)
        self.assertEqual(kind.owner_model.objects.filter(pk=owner.pk).values().get(), before_owner)
        self.assertEqual(self.native.deletes + self.legacy.deletes, [])

    def test_household_s3_read_survives_native_conflict(self):
        self.conflict_read(*self.cases[0])

    def test_establishment_s3_read_survives_native_conflict(self):
        self.conflict_read(*self.cases[1])

    def test_s3_creation_and_replacement_persist_exact_target(self):
        for kind, owner in self.cases:
            before = kind.owner_model.objects.filter(pk=owner.pk).values().get()
            old_key = None
            for _ in range(2):
                self.assertEqual(self.request(self.url(kind, owner), token=self.token,
                    method='PUT', photo=image_bytes())[0], 200)
                photo = self.link(kind, owner)
                self.assertEqual(photo.storage_provider, 'S3')
                self.assertEqual((photo.s3_endpoint, photo.s3_bucket, photo.s3_region),
                    tuple(self.legacy.options[name] for name in ('endpoint_url', 'bucket', 'region')))
                self.assertIsNone(photo.native_attempt_id)
                response = self.request(self.url(kind, owner), token=self.token)
                self.assertEqual(response[0], 200)
                self.assertEqual(response[2], self.legacy.objects[photo.object_key])
                with Image.open(io.BytesIO(response[2])) as saved, Image.open(io.BytesIO(image_bytes())) as original:
                    self.assertEqual(saved.convert('RGB').tobytes(), original.tobytes())
                    self.assertEqual(saved.size, original.size)
                if old_key:
                    self.assertNotEqual(photo.object_key, old_key)
                    self.assertNotIn(old_key, self.legacy.objects)
                old_key = photo.object_key
            self.assertEqual(kind.owner_model.objects.filter(pk=owner.pk).values().get(), before)

    def test_unknown_and_target_mismatch_never_read_storage(self):
        for kind, owner in self.cases:
            photo = self.proven_fixture(kind, owner)
            with patch.object(self.legacy, 'read') as read:
                for field, value in (('s3_endpoint', 'https://unrelated.example.invalid'),
                                     ('s3_bucket', 'different-private-target'), ('s3_region', 'other-region')):
                    original = getattr(photo, field)
                    setattr(photo, field, value)
                    photo.save()
                    self.assertEqual(self.request(self.url(kind, owner), token=self.token)[0], 503)
                    setattr(photo, field, original)
                photo.storage_provider = 'UNKNOWN'
                photo.s3_endpoint = photo.s3_bucket = photo.s3_region = None
                photo.save()
                self.receipt(kind, owner, photo.object_key, 'AMBIGUOUS')
                self.assertEqual(self.request(self.url(kind, owner), token=self.token)[0], 503)
                read.assert_not_called()

    def test_s3_binding_with_inconsistent_owner_key_fails_closed(self):
        for kind, owner in self.cases:
            photo = self.proven_fixture(kind, owner)
            photo.object_key = kind.new_key(owner.pk + 999, 'png')
            photo.save()
            self.legacy.objects[photo.object_key] = image_bytes()
            with patch.object(self.legacy, 'read') as read:
                self.assertEqual(self.request(self.url(kind, owner), token=self.token)[0], 503)
                read.assert_not_called()

    def test_invalid_store_target_rejected_before_any_write(self):
        original = dict(self.legacy.options)
        for field, value in (('endpoint_url', 'https://user:secret@example.invalid'),
                             ('endpoint_url', ''), ('bucket', '../other'), ('region', ''),
                             ('endpoint_url', 'https://storage.example.invalid\n')):
            for kind, owner in self.cases:
                with self.subTest(field=field, kind=kind.owner_field):
                    self.legacy.options = {**original, field: value}
                    self.assertEqual(self.request(self.url(kind, owner), token=self.token,
                        method='PUT', photo=image_bytes())[0], 503)
                    self.assertFalse(kind.photo_model.objects.filter(**{kind.owner_field + '_id': owner.pk}).exists())
                    self.assertEqual(self.legacy.writes, [])
                    self.assertFalse(kind.cleanup_model.objects.exists())
        self.legacy.options = original

    def test_failed_link_rolls_back_provenance_and_keeps_previous_photo(self):
        for kind, owner in self.cases:
            photo = self.proven_fixture(kind, owner)
            before = kind.photo_model.objects.values().get(pk=photo.pk)
            real_save = kind.photo_model.save
            def fail_after_save(instance, *args, **kwargs):
                real_save(instance, *args, **kwargs)
                raise DatabaseError('Synthetic post-save transaction failure')
            with patch.object(kind.photo_model, 'save', fail_after_save):
                self.assertEqual(self.request(self.url(kind, owner), token=self.token,
                    method='PUT', photo=image_bytes())[0], 503)
            self.assertEqual(kind.photo_model.objects.values().get(pk=photo.pk), before)
            self.assertEqual(self.request(self.url(kind, owner), token=self.token)[2], image_bytes())

    def test_native_reference_linked_atomically_and_no_s3_fallback(self):
        for kind, owner in self.cases:
            with override_settings(SANITATION_NATIVE_PHOTO_DEVELOPMENT=True):
                front_photos.replace_front_photo(kind, owner.pk, image_bytes(), 'png', None,
                    native_development=True, actor=self.staff)
            photo = self.link(kind, owner)
            row = NativePhotoAttempt.objects.get(owner_kind=kind.owner_field, owner_record_id=owner.pk)
            self.assertEqual((photo.storage_provider, photo.native_attempt_id), ('NATIVE', row.pk))
            self.assertEqual((row.state, row.object_key), ('LINKED', photo.object_key))
            self.assertEqual((photo.s3_endpoint, photo.s3_bucket, photo.s3_region), (None, None, None))
            # Even an available same-key S3 object must not become a fallback.
            self.legacy.objects[photo.object_key] = image_bytes()
            with patch.object(self.legacy, 'read') as read:
                self.assertEqual(self.request(self.url(kind, owner), token=self.token)[0], 503)
                read.assert_not_called()
        self.assertEqual(self.native.deletes, [])

    def test_conflict_and_ambiguous_read_permission_never_authorizes_cleanup(self):
        for kind, owner in self.cases:
            for state in ('CONFLICT', 'AMBIGUOUS'):
                key = kind.new_key(owner.pk, 'png')
                self.legacy.objects[key] = image_bytes()
                self.receipt(kind, owner, key, state)
                cleanup = kind.cleanup_model.objects.create(object_key=key, ready=True)
                self.assertFalse(front_photos.retry_cleanup(kind, cleanup.pk, self.legacy))
                self.assertIn(key, self.legacy.objects)
                self.assertTrue(kind.cleanup_model.objects.filter(pk=cleanup.pk).exists())
        self.assertEqual(self.native.deletes + self.legacy.deletes, [])

    def test_unknown_or_different_target_replacement_has_no_storage_side_effects(self):
        for kind, owner in self.cases:
            photo = self.proven_fixture(kind, owner)
            for provider in ('S3', 'UNKNOWN'):
                photo.storage_provider = provider
                photo.s3_endpoint = self.legacy.options['endpoint_url'] if provider == 'S3' else None
                photo.s3_region = self.legacy.options['region'] if provider == 'S3' else None
                photo.s3_bucket = 'unrelated-bucket' if provider == 'S3' else None
                photo.save()
                before = kind.photo_model.objects.values().get(pk=photo.pk)
                writes, objects = list(self.legacy.writes), dict(self.legacy.objects)
                self.assertEqual(self.request(self.url(kind, owner), token=self.token,
                    method='PUT', photo=image_bytes())[0], 503)
                self.assertEqual(kind.photo_model.objects.values().get(pk=photo.pk), before)
                self.assertEqual(self.legacy.writes, writes)
                self.assertEqual(self.legacy.objects, objects)
        self.assertEqual(self.native.deletes + self.legacy.deletes, [])

    def s3_race(self, kind, owner, *, replacement=False):
        url = self.url(kind, owner)
        if replacement:
            self.assertEqual(self.request(url, token=self.token, method='PUT', photo=image_bytes())[0], 200)
        before = kind.owner_model.objects.filter(pk=owner.pk).values().get()
        barrier, pids, observations = threading.Barrier(2), [], []
        real_write = self.legacy.write
        def overlap(key, data):
            pids.append(connection.connection.get_backend_pid())
            real_write(key, data)
            barrier.wait(timeout=15)
        with patch.object(self.legacy, 'write', side_effect=overlap), ThreadPoolExecutor(max_workers=2) as pool:
            with transaction.atomic():
                kind.owner_model.objects.select_for_update().only('pk').get(pk=owner.pk)
                locker = connection.connection.get_backend_pid()
                futures = [pool.submit(self.request, url, token=self.token, method='PUT', photo=image_bytes()) for _ in range(2)]
                def blocked(rows):
                    graph = {pid: blockers for pid, wait, blockers, query in rows}
                    def reaches(pid, seen):
                        if pid == locker:
                            return True
                        return pid not in seen and any(reaches(other, seen | {pid}) for other in graph.get(pid, []))
                    return len(rows) == 2 and all(wait == 'Lock' and reaches(pid, set())
                        and kind.owner_model._meta.db_table in query and 'FOR UPDATE' in query
                        for pid, wait, blockers, query in rows)
                deadline = time.monotonic() + 12
                while time.monotonic() < deadline:
                    if len(pids) == 2:
                        with connection.cursor() as cursor:
                            cursor.execute('SELECT pg_stat_clear_snapshot()')
                            cursor.execute('SELECT pid,wait_event_type,pg_blocking_pids(pid),query FROM pg_stat_activity WHERE pid=ANY(%s)', [pids])
                            observations = cursor.fetchall()
                        if blocked(observations):
                            break
                    time.sleep(0.05)
                self.assertTrue(blocked(observations), repr(observations))
            results = [future.result(timeout=20) for future in futures]
        self.assertEqual([result[0] for result in results], [200, 200])
        photo = self.link(kind, owner)
        self.assertEqual(photo.storage_provider, 'S3')
        self.assertIsNone(photo.native_attempt_id)
        self.assertEqual((photo.s3_endpoint, photo.s3_bucket, photo.s3_region),
            tuple(self.legacy.options[name] for name in ('endpoint_url', 'bucket', 'region')))
        self.assertEqual(set(self.legacy.objects), {photo.object_key})
        self.assertFalse(kind.cleanup_model.objects.exists())
        read = self.request(url, token=self.token)
        self.assertEqual(read[0], 200)
        self.assertEqual(read[2], self.legacy.objects[photo.object_key])
        self.assertEqual(kind.owner_model.objects.filter(pk=owner.pk).values().get(), before)
        self.assertEqual(self.native.deletes, [])
        print(json.dumps({'s3_http_race': kind.owner_field, 'replacement': replacement,
            'verified_lock_waiters': len(observations), 'statuses': [result[0] for result in results],
            'current_links': 1, 'stored_objects': 1, 'cleanup_receipts': 0}), flush=True)

    def test_household_s3_overlapping_first_uploads(self):
        self.s3_race(*self.cases[0])

    def test_establishment_s3_overlapping_first_uploads(self):
        self.s3_race(*self.cases[1])

    def test_household_s3_overlapping_replacements(self):
        self.s3_race(*self.cases[0], replacement=True)

    def test_establishment_s3_overlapping_replacements(self):
        self.s3_race(*self.cases[1], replacement=True)
