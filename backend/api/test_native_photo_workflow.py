"""PostgreSQL workflow regressions with isolated fake storage only."""
import io
import threading
from unittest.mock import patch

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import DatabaseError, connection, transaction
from django.test import TransactionTestCase, override_settings

from api.models import (ActivityLog, NativePhotoAttempt, UserProfile, HouseholdSanitationRecord,
                        SanitaryBusinessType, SanitaryEstablishment)
from api.services import front_photos, native_photo_workflow as workflow
from api.services.household_photos import HOUSEHOLD_PHOTOS
from api.services.establishment_photos import ESTABLISHMENT_PHOTOS
from api.services.native_private_photos import NativeCreateOnlyStore, CreateResult, CreateOutcome, CreateDiagnostic
from api.test_household_front_photo import FakePrivateStore


def image_bytes():
    output = io.BytesIO()
    Image.new('RGB', (3, 2), 'red').save(output, 'PNG')
    return output.getvalue()


class FakeNativeStore(NativeCreateOnlyStore):
    def __init__(self):
        super().__init__(dict(enabled=True, private_bucket_confirmed=True, project_ref='a' * 20,
            endpoint_url='https://' + 'a' * 20 + '.supabase.co', bucket='synthetic-native',
            secret_key='sb_secret_offline_workflow_dummy'))
        self.objects, self.calls, self.deletes = {}, [], []
        self.mode, self.fixed_key, self.barrier = 'created', None, None
        self.lock = threading.Lock()
        self.backend_pids, self.inflight_observed = [], []

    def new_key(self, folder, owner_id, extension):
        return self.fixed_key or super().new_key(folder, owner_id, extension)

    def create(self, key, data, *, upsert=False):
        if upsert is not False:
            raise AssertionError('Overwrite forbidden')
        row = NativePhotoAttempt.objects.get(object_key=key, project_ref=self.project_ref, bucket=self.bucket)
        if row.state != 'IN_FLIGHT' or not connection.get_autocommit():
            raise AssertionError('IN_FLIGHT must be committed before provider call')
        with self.lock:
            self.calls.append(key)
            self.inflight_observed.append(row.state)
            self.backend_pids.append(connection.connection.get_backend_pid())
        if self.barrier:
            self.barrier.wait(timeout=15)
        with self.lock:
            if key in self.objects:
                return CreateResult(CreateOutcome.CONFLICT, CreateDiagnostic.EXISTING_PATH, 400)
            if self.mode in ('unavailable', 'authorization', 'safety'):
                outcomes = {'unavailable': (CreateOutcome.UNAVAILABLE, CreateDiagnostic.PROVIDER_UNAVAILABLE),
                    'authorization': (CreateOutcome.AUTHORIZATION_FAILURE, CreateDiagnostic.AUTHORIZATION_DENIED),
                    'safety': (CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.REDIRECT_REFUSED)}
                return CreateResult(*outcomes[self.mode], 403 if self.mode == 'authorization' else 503)
            self.objects[key] = data
            if self.mode == 'ambiguous':
                return CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.TRANSPORT_UNCERTAIN)
            if self.mode == 'interrupt':
                raise KeyboardInterrupt('synthetic interruption')
            return CreateResult(CreateOutcome.CREATED, CreateDiagnostic.ACKNOWLEDGED, 200)

    def delete(self, key):
        self.deletes.append(key)
        raise AssertionError('Fake native deletion forbidden')


class FakeLegacyStore(FakePrivateStore):
    def __init__(self):
        super().__init__()
        self.objects, self.deletes, self.writes = {}, [], []

    def write(self, key, data):
        self.writes.append(key)
        self.objects[key] = data

    def read(self, key):
        return self.objects[key]

    def delete(self, key):
        self.deletes.append(key)
        self.objects.pop(key, None)


@override_settings(SANITATION_NATIVE_PHOTO_DEVELOPMENT=True, USE_SEED_DATA=False)
class NativePhotoWorkflowTests(TransactionTestCase):
    def setUp(self):
        self.native = FakeNativeStore()
        self.factory = patch.object(workflow, 'get_native_create_only_store', return_value=self.native)
        self.factory.start()
        self.addCleanup(self.factory.stop)
        targets = ['boto3.session.Session']
        if not getattr(self, 'allow_loopback_http', False):
            targets.append('urllib.request.OpenerDirector.open')
        for target in targets:
            guard = patch(target, side_effect=AssertionError('Real provider forbidden'))
            guard.start()
            self.addCleanup(guard.stop)
        self.staff = self.user('native-synthetic-staff', 'sanitation')
        self.admin = self.user('native-synthetic-admin', 'admin')
        self.house = HouseholdSanitationRecord.objects.create(household_code='NATIVE-SYNTHETIC',
            household_head='Synthetic native household', barangay='Synthetic Barangay', sitio='Synthetic Sitio',
            remarks='  Preserve exact  ', latitude=14.1, longitude=121.7)
        business = SanitaryBusinessType.objects.first() or SanitaryBusinessType.objects.create(name='Synthetic native business')
        self.establishment = SanitaryEstablishment.objects.create(business_name='Synthetic native establishment',
            owner_name='Synthetic owner', business_type=business, barangay='Synthetic Barangay',
            address='Synthetic address', sitio='Synthetic Sitio', latitude=14.2, longitude=121.8)
        self.legacy = FakeLegacyStore()

    def user(self, name, role=None, **kwargs):
        user = get_user_model().objects.create_user(username=name, **kwargs)
        if role:
            UserProfile.objects.create(user=user, role=role)
        return user

    def upload(self, kind=HOUSEHOLD_PHOTOS, owner=None):
        owner = owner or self.house
        return front_photos.replace_front_photo(kind, owner.pk, image_bytes(), 'png', None,
                                                native_development=True, actor=self.staff)

    def current_key(self, kind, owner):
        return kind.photo_model.objects.get(**{f'{kind.owner_field}_id': owner.pk}).object_key

    def seed_legacy(self, kind, owner):
        key = kind.new_key(owner.pk, 'png')
        kind.photo_model.objects.create(**{f'{kind.owner_field}_id': owner.pk, 'object_key': key},
            storage_provider='S3', s3_endpoint=self.legacy.options['endpoint_url'],
            s3_bucket=self.legacy.options['bucket'], s3_region=self.legacy.options['region'])
        self.legacy.objects[key] = b'original'
        return key

    def test_conflict_preserves_existing_object_link_and_all_nonphoto_fields(self):
        for kind, owner in ((HOUSEHOLD_PHOTOS, self.house), (ESTABLISHMENT_PHOTOS, self.establishment)):
            before = kind.owner_model.objects.filter(pk=owner.pk).values().get()
            original = self.seed_legacy(kind, owner)
            self.native.fixed_key = kind.new_key(owner.pk, 'png')
            self.native.objects[self.native.fixed_key] = b'pre-existing-native-object'
            with self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed) as caught:
                self.upload(kind, owner)
            self.assertEqual(caught.exception.outcome, 'CONFLICT')
            self.assertEqual(self.current_key(kind, owner), original)
            self.assertEqual(self.native.objects[self.native.fixed_key], b'pre-existing-native-object')
            self.assertEqual(NativePhotoAttempt.objects.get(pk=caught.exception.attempt_id).state, 'CONFLICT')
            self.assertEqual(kind.owner_model.objects.filter(pk=owner.pk).values().get(), before)
        self.assertEqual(self.native.deletes + self.legacy.deletes, [])

    def test_ambiguous_upload_retains_object_and_uncertain_attempt(self):
        original = self.seed_legacy(HOUSEHOLD_PHOTOS, self.house)
        self.native.mode = 'ambiguous'
        with self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed) as caught:
            self.upload()
        row = NativePhotoAttempt.objects.get(pk=caught.exception.attempt_id)
        self.assertEqual(row.state, 'AMBIGUOUS')
        self.assertEqual(self.current_key(HOUSEHOLD_PHOTOS, self.house), original)
        self.assertIn(row.object_key, self.native.objects)
        self.assertEqual(self.native.deletes, [])

    def test_created_links_and_commits_all_audit_transitions(self):
        before = HouseholdSanitationRecord.objects.filter(pk=self.house.pk).values().get()
        self.assertFalse(self.upload())
        row = NativePhotoAttempt.objects.get()
        self.assertEqual((row.state, row.revision), ('LINKED', 3))
        self.assertEqual(row.object_key, self.current_key(HOUSEHOLD_PHOTOS, self.house))
        self.assertIn(row.object_key, self.native.objects)
        self.assertEqual(self.native.inflight_observed, ['IN_FLIGHT'])
        self.assertEqual(ActivityLog.objects.filter(record_type=workflow.AUDIT_TYPE, record_id=str(row.pk)).count(), 4)
        self.assertEqual(HouseholdSanitationRecord.objects.filter(pk=self.house.pk).values().get(), before)

    def test_db_link_failure_keeps_created_unlinked_and_old_link(self):
        original = self.seed_legacy(HOUSEHOLD_PHOTOS, self.house)
        with patch.object(HOUSEHOLD_PHOTOS.photo_model, 'save', side_effect=DatabaseError('synthetic failure')), \
                self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed):
            self.upload()
        row = NativePhotoAttempt.objects.get()
        self.assertEqual((row.state, row.diagnostic), ('CREATED_UNLINKED', 'LINK_FAILED'))
        self.assertEqual(self.current_key(HOUSEHOLD_PHOTOS, self.house), original)
        self.assertIn(row.object_key, self.native.objects)
        self.assertEqual(self.native.deletes, [])

    def test_interruption_leaves_committed_inflight_evidence(self):
        self.native.mode = 'interrupt'
        with self.assertRaises(KeyboardInterrupt):
            self.upload()
        row = NativePhotoAttempt.objects.get()
        self.assertEqual(row.state, 'IN_FLIGHT')
        self.assertIn(row.object_key, self.native.objects)
        report = workflow.review_attempt(self.admin, row.pk, expected_revision=row.revision)
        self.assertEqual(report['state'], 'IN_FLIGHT')
        self.assertTrue(report['provider_confirmation_required'])
        self.assertEqual(self.native.deletes, [])

    def test_replacement_retires_native_only_with_new_link_commit(self):
        self.upload()
        first = NativePhotoAttempt.objects.get()
        self.assertTrue(self.upload())
        first.refresh_from_db()
        self.assertEqual(first.state, 'RETIRED_HELD')
        self.assertEqual(NativePhotoAttempt.objects.filter(state='LINKED').count(), 1)
        self.assertEqual(len(self.native.objects), 2)
        self.assertEqual(self.native.deletes, [])

    def test_rollback_does_not_retire_previous_native_photo(self):
        self.upload()
        first = NativePhotoAttempt.objects.get()
        with patch.object(HOUSEHOLD_PHOTOS.photo_model, 'save', side_effect=DatabaseError('synthetic rollback')), \
                self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed):
            self.upload()
        first.refresh_from_db()
        self.assertEqual(first.state, 'LINKED')
        self.assertEqual(self.current_key(HOUSEHOLD_PHOTOS, self.house), first.object_key)
        self.assertEqual(NativePhotoAttempt.objects.filter(state='CREATED_UNLINKED').count(), 1)

    def test_error_outcomes_are_distinct_and_never_compensated(self):
        for mode, state in (('unavailable', 'UNAVAILABLE'), ('authorization', 'AUTHORIZATION_FAILURE'), ('safety', 'SAFETY_FAILURE')):
            self.native.mode = mode
            with self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed) as caught:
                self.upload()
            self.assertEqual(NativePhotoAttempt.objects.get(pk=caught.exception.attempt_id).state, state)
        self.assertFalse(HOUSEHOLD_PHOTOS.photo_model.objects.exists())
        self.assertEqual(self.native.deletes, [])

    def test_invalid_transitions_and_stale_revisions_are_rejected(self):
        self.native.mode = 'ambiguous'
        with self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed):
            self.upload()
        row = NativePhotoAttempt.objects.get()
        for expected, state in ((row.revision - 1, 'LINKED'), (row.revision, 'LINKED'), (row.revision, 'CLOSED_WITHOUT_DELETION')):
            with self.assertRaises(workflow.NativeTransitionRejected):
                workflow._transition(row.pk, expected, state)
        row.refresh_from_db()
        self.assertEqual(row.state, 'AMBIGUOUS')

    def test_review_is_bounded_idempotent_and_preserves_uncertainty(self):
        self.native.mode = 'ambiguous'
        with self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed):
            self.upload()
        row = NativePhotoAttempt.objects.get()
        first = workflow.review_attempt(self.admin, row.pk, expected_revision=row.revision)
        second = workflow.review_attempt(self.admin, row.pk, expected_revision=row.revision)
        self.assertEqual(first['revision'], second['revision'])
        self.assertEqual(first['state'], 'AMBIGUOUS')
        self.assertEqual(ActivityLog.objects.filter(record_type=workflow.REVIEW_TYPE).count(), 1)
        self.assertEqual(len(workflow.list_unresolved_attempts(self.admin, limit=1)), 1)
        self.assertNotIn('object_key', first)
        self.assertNotIn('bucket', first)
        self.assertFalse(first['deletion_authorized'])
        for limit in (0, 101, True):
            with self.assertRaises(ValueError):
                workflow.list_unresolved_attempts(self.admin, limit=limit)

    def test_unauthorized_review_and_listing_are_denied(self):
        for user in (None, self.staff, self.user('synthetic-tourism', 'tourism'),
                     self.user('synthetic-django-staff', is_staff=True),
                     self.user('synthetic-inactive-admin', 'admin', is_active=False)):
            with self.assertRaises(PermissionDenied):
                workflow.list_unresolved_attempts(user)
            with self.assertRaises(PermissionDenied):
                workflow.review_attempt(user, '00000000-0000-0000-0000-000000000000', expected_revision=0)

    def test_development_selection_and_autocommit_are_required(self):
        with override_settings(SANITATION_NATIVE_PHOTO_DEVELOPMENT=False), \
                self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed):
            self.upload()
        with transaction.atomic(), self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed):
            self.upload()
        self.assertFalse(NativePhotoAttempt.objects.exists())
        self.assertFalse(self.native.calls)

    def test_legacy_retry_cannot_delete_any_journaled_native_key(self):
        self.upload()
        row = NativePhotoAttempt.objects.get()
        receipt = HOUSEHOLD_PHOTOS.cleanup_model.objects.create(object_key=row.object_key, ready=True)
        self.assertFalse(front_photos.retry_cleanup(HOUSEHOLD_PHOTOS, receipt.pk, self.legacy))
        self.assertEqual(self.legacy.deletes, [])
        self.assertTrue(HOUSEHOLD_PHOTOS.cleanup_model.objects.filter(pk=receipt.pk).exists())

    def test_legacy_write_cannot_replace_native_link_even_after_flag_disabled(self):
        self.upload()
        key = self.current_key(HOUSEHOLD_PHOTOS, self.house)
        with override_settings(SANITATION_NATIVE_PHOTO_DEVELOPMENT=False), \
                self.assertRaises(front_photos.FrontPhotoUpdateFailed):
            front_photos.replace_front_photo(HOUSEHOLD_PHOTOS, self.house.pk, image_bytes(), 'png', self.legacy)
        self.assertEqual(self.current_key(HOUSEHOLD_PHOTOS, self.house), key)
        self.assertEqual(self.legacy.writes + self.legacy.deletes, [])

    def test_deleting_owner_holds_native_object_and_journal(self):
        self.upload()
        row = NativePhotoAttempt.objects.get()
        self.house.delete()
        row.refresh_from_db()
        self.assertEqual(row.state, 'RETIRED_HELD')
        self.assertIn(row.object_key, self.native.objects)
        self.assertEqual(self.native.deletes, [])

    def test_concurrent_review_cannot_allow_linking_from_a_stale_revision(self):
        original = self.native.create
        def create_and_review(key, data, **kwargs):
            result = original(key, data, **kwargs)
            row = NativePhotoAttempt.objects.get(object_key=key)
            workflow.review_attempt(self.admin, row.pk, expected_revision=row.revision)
            return result
        with patch.object(self.native, 'create', side_effect=create_and_review), \
                self.assertRaises(front_photos.NativeFrontPhotoUpdateFailed) as caught:
            self.upload()
        self.assertEqual(caught.exception.outcome, 'AMBIGUOUS')
        row = NativePhotoAttempt.objects.get()
        self.assertEqual(row.state, 'IN_FLIGHT')
        self.assertFalse(HOUSEHOLD_PHOTOS.photo_model.objects.exists())
        self.assertIn(row.object_key, self.native.objects)
        self.assertEqual(self.native.deletes, [])

    def test_native_error_response_outcome_is_allowlisted(self):
        error = front_photos.NativeFrontPhotoUpdateFailed('synthetic-sensitive-provider-message')
        self.assertEqual(error.outcome, 'SAFETY_FAILURE')
