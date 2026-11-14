"""Database/validation contract only; never uploads, links or deletes objects."""
from uuid import UUID, uuid4
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from api.models import HouseholdSanitationRecord, NativePhotoAttempt
from api.services.native_private_photos import CreateDiagnostic, NativeCreateOnlyStore


class NativePhotoAttemptTests(TestCase):
    def setUp(self):
        for target in ('boto3.session.Session', 'urllib.request.OpenerDirector.open'):
            guard = patch(target, side_effect=AssertionError('Provider operations forbidden'))
            guard.start()
            self.addCleanup(guard.stop)

    def values(self, **changes):
        values = dict(owner_kind='household', owner_record_id=1, project_ref='a' * 20,
                      bucket='synthetic-journal', object_key=f'profile-photos/households/1/{uuid4().hex}.png')
        values.update(changes)
        return values

    def rejected_by_database(self, **changes):
        with self.assertRaises(IntegrityError), transaction.atomic():
            NativePhotoAttempt.objects.create(**self.values(**changes))

    def test_pre_upload_defaults_are_durable_but_never_prove_absence(self):
        attempt = NativePhotoAttempt.objects.create(**self.values())
        attempt.refresh_from_db()
        self.assertIsInstance(attempt.pk, UUID)
        self.assertEqual(attempt.state, NativePhotoAttempt.State.PREPARED)
        self.assertEqual(attempt.revision, 0)
        self.assertIsNone(attempt.reviewed_by_id)
        self.assertIsNone(attempt.reviewed_at)
        self.assertIsNotNone(attempt.created_at)
        self.assertIsNotNone(attempt.updated_at)
        self.assertFalse(attempt.deletion_authorized)

    def test_every_state_persists_without_deletion_authority(self):
        for state in NativePhotoAttempt.State.values:
            attempt = NativePhotoAttempt(**self.values(state=state))
            attempt.full_clean()
            attempt.save()
            attempt.refresh_from_db()
            self.assertEqual(attempt.state, state)
            self.assertFalse(attempt.deletion_authorized)

    def test_duplicate_exact_storage_target_is_rejected(self):
        values = self.values()
        NativePhotoAttempt.objects.create(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            NativePhotoAttempt.objects.create(**values)
        self.assertEqual(NativePhotoAttempt.objects.count(), 1)

    def test_same_relative_key_in_distinct_targets_is_not_conflated(self):
        values = self.values()
        NativePhotoAttempt.objects.create(**values)
        NativePhotoAttempt.objects.create(**(values | {'project_ref': 'b' * 20}))
        NativePhotoAttempt.objects.create(**(values | {'bucket': 'other-synthetic-journal'}))
        self.assertEqual(NativePhotoAttempt.objects.count(), 3)

    def test_nonpositive_owner_ids_are_rejected_by_database(self):
        for value in (0, -1):
            with self.subTest(value=value):
                self.rejected_by_database(owner_record_id=value)

    def test_negative_revision_is_rejected_by_database(self):
        self.rejected_by_database(revision=-1)

    def test_invalid_state_and_owner_kind_are_rejected_by_database(self):
        self.rejected_by_database(state='DELETE_ALLOWED')
        self.rejected_by_database(owner_kind='complaint')

    def test_diagnostic_is_an_allowlist_not_a_message_field(self):
        self.rejected_by_database(diagnostic='arbitrary-private-provider-detail')
        for diagnostic in NativePhotoAttempt.Diagnostic.values:
            attempt = NativePhotoAttempt(**self.values(diagnostic=diagnostic))
            attempt.full_clean()
            attempt.save()
        self.assertTrue({value.value for value in CreateDiagnostic} <= set(NativePhotoAttempt.Diagnostic.values))

    def test_invalid_storage_project_and_bucket_are_rejected_by_database(self):
        for changes in ({'project_ref': 'wrong'}, {'project_ref': 'a' * 19 + '\n'},
                        {'bucket': '../other'}, {'bucket': 'valid-name\n'}):
            with self.subTest(fields=list(changes)):
                self.rejected_by_database(**changes)

    def test_key_shape_and_owner_identity_are_enforced_by_database(self):
        for key in ('../other', 'profile-photos/households/2/' + 'a' * 32 + '.png',
                    'profile-photos/establishments/1/' + 'a' * 32 + '.png',
                    'profile-photos/households/1/' + 'a' * 32 + '.png\n',
                    'profile-photos/households/01/' + 'a' * 32 + '.png'):
            with self.subTest(key=key):
                self.rejected_by_database(object_key=key)

    def test_model_validation_rejects_bad_values_before_insert(self):
        for changes in ({'owner_record_id': 0}, {'revision': -1}, {'state': 'wrong'},
                        {'diagnostic': 'not-allowlisted'}, {'owner_kind': 'wrong'},
                        {'project_ref': 'wrong'}, {'bucket': '../other'}, {'object_key': 'wrong'}):
            with self.subTest(fields=list(changes)), self.assertRaises(ValidationError):
                NativePhotoAttempt(**self.values(**changes)).full_clean()

    def test_real_generated_keys_fit_for_both_kinds_and_largest_database_id(self):
        for kind, folder in (('household', 'households'), ('establishment', 'establishments')):
            for extension in ('jpg', 'png'):
                key = NativeCreateOnlyStore.new_key(folder, 9223372036854775807, extension)
                self.assertLessEqual(len(key), NativePhotoAttempt._meta.get_field('object_key').max_length)
                attempt = NativePhotoAttempt(**self.values(owner_kind=kind, owner_record_id=9223372036854775807,
                                                          bucket='b' * 63, object_key=key))
                attempt.full_clean()
                attempt.save()

    def test_snapshot_has_no_owner_fk_and_survives_household_deletion(self):
        self.assertFalse(NativePhotoAttempt._meta.get_field('owner_record_id').is_relation)
        house = HouseholdSanitationRecord.objects.create(household_code='NATIVE-JOURNAL-OWNER',
            household_head='Synthetic journal household', barangay='Synthetic Barangay')
        attempt = NativePhotoAttempt.objects.create(**self.values(owner_record_id=house.pk,
            object_key=NativeCreateOnlyStore.new_key('households', house.pk, 'png')))
        owner_id = house.pk
        house.delete()
        attempt.refresh_from_db()
        self.assertEqual(attempt.owner_record_id, owner_id)

    def test_nonexistent_owner_snapshot_is_retained_for_each_kind(self):
        for kind, folder in (('household', 'households'), ('establishment', 'establishments')):
            attempt = NativePhotoAttempt.objects.create(**self.values(owner_kind=kind, owner_record_id=99999999,
                object_key=NativeCreateOnlyStore.new_key(folder, 99999999, 'jpg')))
            self.assertTrue(NativePhotoAttempt.objects.filter(pk=attempt.pk).exists())

    def test_review_attribution_requires_a_timestamp(self):
        user = get_user_model().objects.create_user(username='synthetic-journal-reviewer')
        self.rejected_by_database(reviewed_by=user)

    def test_deleted_reviewer_does_not_remove_attempt_or_review_timestamp(self):
        user = get_user_model().objects.create_user(username='synthetic-journal-former-reviewer')
        reviewed_at = timezone.now()
        attempt = NativePhotoAttempt.objects.create(**self.values(reviewed_by=user, reviewed_at=reviewed_at))
        user.delete()
        attempt.refresh_from_db()
        self.assertIsNone(attempt.reviewed_by_id)
        self.assertEqual(attempt.reviewed_at, reviewed_at)

    def test_invalid_bulk_update_leaves_existing_attempt_unchanged(self):
        attempt = NativePhotoAttempt.objects.create(**self.values())
        for changes in ({'state': 'wrong'}, {'revision': -1}, {'owner_record_id': 2}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                NativePhotoAttempt.objects.filter(pk=attempt.pk).update(**changes)
        attempt.refresh_from_db()
        self.assertEqual((attempt.state, attempt.revision, attempt.owner_record_id), ('PREPARED', 0, 1))

    def test_interrupted_attempts_survive_reload_without_becoming_absent_or_closed(self):
        for state in ('PREPARED', 'IN_FLIGHT', 'AMBIGUOUS'):
            attempt = NativePhotoAttempt.objects.create(**self.values(state=state, diagnostic='INTERRUPTED'))
            reloaded = NativePhotoAttempt.objects.get(pk=attempt.pk)
            self.assertEqual(reloaded.state, state)
            self.assertEqual(reloaded.diagnostic, 'INTERRUPTED')
            self.assertFalse(reloaded.deletion_authorized)

    def test_actual_database_indexes_and_constraints_exist(self):
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, NativePhotoAttempt._meta.db_table)
        for name in ('native_attempt_target_unique', 'native_attempt_owner_positive', 'native_attempt_revision_nonneg',
                     'native_attempt_owner_kind', 'native_attempt_state', 'native_attempt_diagnostic', 'native_attempt_project',
                     'native_attempt_bucket', 'native_attempt_owner_key', 'native_attempt_review_timestamp'):
            self.assertIn(name, constraints)
        for name in ('native_attempt_state_created', 'native_attempt_owner_created'):
            self.assertTrue(constraints[name]['index'])

    def test_active_photo_modules_do_not_reference_journal(self):
        import inspect
        from api.services import front_photos, household_photos, establishment_photos, native_private_photos
        from api.views import private_photos
        for module in (front_photos, household_photos, establishment_photos, native_private_photos, private_photos):
            self.assertNotIn('NativePhotoAttempt', inspect.getsource(module))
