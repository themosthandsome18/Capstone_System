"""Provenance schema only. Positive fixtures are NOT legacy classification proof."""
from concurrent.futures import ThreadPoolExecutor
import json
import time
from uuid import uuid4
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, connections, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase, TransactionTestCase

from api.models import (HouseholdFrontPhoto, EstablishmentFrontPhoto, HouseholdSanitationRecord,
                        SanitaryEstablishment, SanitaryBusinessType, NativePhotoAttempt)


S3 = dict(storage_provider='S3', s3_endpoint='https://storage.synthetic.example.invalid/storage/v1/s3',
          s3_bucket='synthetic-s3-target', s3_region='ap-northeast-2')


class ProvenanceFixtures:
    def setUp(self):
        super().setUp()
        for name in ('boto3.session.Session', 'urllib.request.OpenerDirector.open'):
            guard = patch(name, side_effect=AssertionError('Provider operations forbidden'))
            guard.start()
            self.addCleanup(guard.stop)
        self.house = HouseholdSanitationRecord.objects.create(household_code='SYNTHETIC-PROVENANCE',
            household_head='Synthetic provenance household', barangay='Synthetic Barangay', sitio='Synthetic Sitio',
            latitude=14.1, longitude=121.7)
        self.other_house = HouseholdSanitationRecord.objects.create(household_code='SYNTHETIC-PROVENANCE-2',
            household_head='Other synthetic household', barangay='Synthetic Barangay')
        business = SanitaryBusinessType.objects.first() or SanitaryBusinessType.objects.create(name='Synthetic provenance type')
        self.establishment = SanitaryEstablishment.objects.create(business_name='Synthetic provenance establishment',
            owner_name='Synthetic owner', business_type=business, barangay='Synthetic Barangay',
            address='Synthetic address', sitio='Synthetic Sitio', latitude=14.2, longitude=121.8)

    def values(self, *, kind='household', owner=None, **changes):
        owner = owner or (self.house if kind == 'household' else self.establishment)
        folder = 'households' if kind == 'household' else 'establishments'
        values = {kind + '_id': owner.pk, 'object_key': f'profile-photos/{folder}/{owner.pk}/{uuid4().hex}.png'}
        values.update(changes)
        return values

    def attempt(self, *, kind='household', owner=None, state='LINKED'):
        values = self.values(kind=kind, owner=owner)
        return NativePhotoAttempt.objects.create(owner_kind=kind, owner_record_id=values[kind + '_id'],
            object_key=values['object_key'], project_ref='a' * 20, bucket='synthetic-native-target', state=state)


class FrontPhotoProvenanceTests(ProvenanceFixtures, TestCase):
    def test_legacy_defaults_remain_unknown_without_provider_binding(self):
        for model, kind in ((HouseholdFrontPhoto, 'household'), (EstablishmentFrontPhoto, 'establishment')):
            row = model.objects.create(**self.values(kind=kind))
            row.refresh_from_db()
            self.assertEqual(row.storage_provider, 'UNKNOWN')
            self.assertEqual((row.s3_endpoint, row.s3_bucket, row.s3_region, row.native_attempt_id), (None, None, None, None))

    def test_matching_journal_is_not_automatic_classification(self):
        attempt = self.attempt()
        row = HouseholdFrontPhoto.objects.create(**self.values(object_key=attempt.object_key))
        self.assertEqual(row.storage_provider, 'UNKNOWN')
        self.assertIsNone(row.native_attempt_id)

    def test_explicit_complete_s3_snapshot_persists_for_both_kinds(self):
        for model, kind in ((HouseholdFrontPhoto, 'household'), (EstablishmentFrontPhoto, 'establishment')):
            row = model.objects.create(**self.values(kind=kind, **S3))
            row.refresh_from_db()
            for field, value in S3.items():
                self.assertEqual(getattr(row, field), value)
            self.assertIsNone(row.native_attempt_id)

    def test_s3_compatible_region_identifiers_are_not_limited_to_aws_names(self):
        row = HouseholdFrontPhoto.objects.create(**self.values(**S3))
        for region in ('ap-northeast-2', 'auto', 'fixture-region'):
            row.s3_region = region
            row.save()
            row.refresh_from_db()
            self.assertEqual(row.s3_region, region)

    def test_native_binding_requires_matching_owner_key_kind_and_linked_state(self):
        attempt = self.attempt()
        for model, values in (
                (HouseholdFrontPhoto, self.values(owner=self.other_house, object_key=attempt.object_key)),
                (HouseholdFrontPhoto, self.values()),
                (EstablishmentFrontPhoto, self.values(kind='establishment', object_key=attempt.object_key))):
            with self.assertRaises(ValidationError):
                model.objects.create(**values, storage_provider='NATIVE', native_attempt=attempt)
        for state in ('PREPARED', 'IN_FLIGHT', 'CREATED_UNLINKED', 'CONFLICT', 'AMBIGUOUS', 'RETIRED_HELD'):
            candidate = self.attempt(state=state)
            with self.assertRaises(ValidationError):
                HouseholdFrontPhoto.objects.create(**self.values(object_key=candidate.object_key),
                    storage_provider='NATIVE', native_attempt=candidate)

    def test_valid_native_links_are_protected_and_store_no_s3_target(self):
        for model, kind in ((HouseholdFrontPhoto, 'household'), (EstablishmentFrontPhoto, 'establishment')):
            attempt = self.attempt(kind=kind)
            row = model.objects.create(**self.values(kind=kind, object_key=attempt.object_key),
                storage_provider='NATIVE', native_attempt=attempt)
            row.refresh_from_db()
            self.assertEqual(row.native_attempt_id, attempt.pk)
            self.assertEqual((row.s3_endpoint, row.s3_bucket, row.s3_region), (None, None, None))
            with self.assertRaises(ProtectedError):
                attempt.delete()
            self.assertFalse(attempt.deletion_authorized)

    def test_contradictory_or_incomplete_shapes_fail_model_validation(self):
        attempt = self.attempt()
        cases = ({'s3_endpoint': S3['s3_endpoint']}, {'storage_provider': 'other'},
                 {'storage_provider': 'NATIVE'}, {'storage_provider': 'S3'},
                 dict(S3, s3_region=None), dict(S3, s3_bucket=''),
                 dict(S3, native_attempt=attempt),
                 {'storage_provider': 'NATIVE', 'native_attempt': attempt, 's3_bucket': 'synthetic-extra'})
        for changes in cases:
            with self.subTest(fields=list(changes)), self.assertRaises(ValidationError):
                HouseholdFrontPhoto.objects.create(**self.values(**changes))

    def test_credential_bearing_endpoints_are_rejected_before_insert(self):
        for endpoint in ('https://dummy-user:dummy-secret@storage.example.invalid',
                         'https://storage.example.invalid?token=dummy-secret',
                         'https://storage.example.invalid/#dummy-secret',
                         'http://storage.example.invalid', 'https://storage.example.invalid:65536'):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValidationError):
                HouseholdFrontPhoto.objects.create(**self.values(**dict(S3, s3_endpoint=endpoint)))
        self.assertFalse(HouseholdFrontPhoto.objects.exists())

    def test_database_rejects_invalid_shapes_and_credential_syntax(self):
        for model, kind in ((HouseholdFrontPhoto, 'household'), (EstablishmentFrontPhoto, 'establishment')):
            row = model.objects.create(**self.values(kind=kind))
            cases = ({'storage_provider': 'S3'}, {'storage_provider': 'NATIVE'}, {'storage_provider': 'INVALID'},
                     {'s3_bucket': 'stray-target'}, dict(S3, s3_region=None), dict(S3, s3_bucket=''),
                     dict(S3, s3_endpoint='https://dummy-user:dummy-secret@storage.example.invalid'),
                     dict(S3, s3_endpoint='https://storage.example.invalid?token=dummy-secret'),
                     dict(S3, s3_endpoint='https://storage.example.invalid:65536'))
            for changes in cases:
                columns = ', '.join(connection.ops.quote_name(name) + '=%s' for name in changes)
                with self.subTest(kind=kind, fields=list(changes)), self.assertRaises(IntegrityError), transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute('UPDATE ' + connection.ops.quote_name(model._meta.db_table) + ' SET ' + columns + ' WHERE id=%s',
                            [*changes.values(), row.pk])
            row.refresh_from_db()
            self.assertEqual(row.storage_provider, 'UNKNOWN')

    def test_bulk_native_binding_and_unvalidated_updates_are_blocked(self):
        attempt = self.attempt()
        row = HouseholdFrontPhoto(**self.values(object_key=attempt.object_key), storage_provider='NATIVE', native_attempt=attempt)
        with self.assertRaises(ValidationError):
            HouseholdFrontPhoto.objects.bulk_create([row])
        plain = HouseholdFrontPhoto.objects.create(**self.values())
        with self.assertRaises(ValidationError):
            HouseholdFrontPhoto.objects.filter(pk=plain.pk).update(**S3)
        with self.assertRaises(ValidationError):
            HouseholdFrontPhoto.objects.filter(pk=plain.pk).update(object_key=attempt.object_key)

    def test_partial_save_cannot_omit_changed_binding_values(self):
        row = HouseholdFrontPhoto.objects.create(**self.values())
        for field, value in S3.items():
            setattr(row, field, value)
        with self.assertRaises(ValidationError):
            row.save(update_fields=['storage_provider'])
        row.refresh_from_db()
        self.assertEqual(row.storage_provider, 'UNKNOWN')

    def test_native_reference_is_unique_within_each_link_table(self):
        for model, kind in ((HouseholdFrontPhoto, 'household'), (EstablishmentFrontPhoto, 'establishment')):
            attempt = self.attempt(kind=kind)
            model.objects.create(**self.values(kind=kind, object_key=attempt.object_key),
                storage_provider='NATIVE', native_attempt=attempt)
            with connection.cursor() as cursor:
                constraints = connection.introspection.get_constraints(cursor, model._meta.db_table)
            self.assertTrue(any(info['unique'] and info['columns'] == ['native_attempt_id'] for info in constraints.values()))
            self.assertTrue(model._meta.get_field('native_attempt').unique)

    def test_existing_nonphoto_fields_are_unchanged(self):
        before_house = HouseholdSanitationRecord.objects.filter(pk=self.house.pk).values().get()
        before_establishment = SanitaryEstablishment.objects.filter(pk=self.establishment.pk).values().get()
        HouseholdFrontPhoto.objects.create(**self.values(**S3))
        EstablishmentFrontPhoto.objects.create(**self.values(kind='establishment', **S3))
        self.assertEqual(HouseholdSanitationRecord.objects.filter(pk=self.house.pk).values().get(), before_house)
        self.assertEqual(SanitaryEstablishment.objects.filter(pk=self.establishment.pk).values().get(), before_establishment)


class FrontPhotoBindingConcurrencyTests(ProvenanceFixtures, TransactionTestCase):
    def test_overlapping_cross_kind_binding_is_serialized_and_rejects_wrong_owner(self):
        attempt = self.attempt()
        def bind(model, kind):
            try:
                model.objects.create(**self.values(kind=kind, object_key=attempt.object_key),
                    storage_provider='NATIVE', native_attempt_id=attempt.pk)
                return 'BOUND'
            except ValidationError:
                return 'REJECTED'
            finally:
                connections['default'].close()
        observed = []
        with ThreadPoolExecutor(max_workers=2) as pool:
            with transaction.atomic():
                NativePhotoAttempt.objects.select_for_update().get(pk=attempt.pk)
                locker = connection.connection.get_backend_pid()
                futures = [pool.submit(bind, model, kind) for model, kind in (
                    (HouseholdFrontPhoto, 'household'), (EstablishmentFrontPhoto, 'establishment'))]
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_stat_clear_snapshot()')
                        cursor.execute("SELECT pid,pg_blocking_pids(pid) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%%api_nativephotoattempt%%FOR UPDATE%%'")
                        observed = cursor.fetchall()
                    graph = dict(observed)
                    def reaches_owner(pid, seen):
                        return pid == locker or (pid not in seen and any(reaches_owner(parent, seen | {pid}) for parent in graph.get(pid, [])))
                    if len(observed) == 2 and all(reaches_owner(pid, set()) for pid, _ in observed):
                        break
                    time.sleep(0.05)
                self.assertEqual(len(observed), 2)
                self.assertTrue(all(reaches_owner(pid, set()) for pid, _ in observed))
            self.assertEqual(sorted(future.result(timeout=10) for future in futures), ['BOUND', 'REJECTED'])
        self.assertEqual(HouseholdFrontPhoto.objects.filter(native_attempt_id=attempt.pk).count(), 1)
        self.assertFalse(EstablishmentFrontPhoto.objects.filter(native_attempt_id=attempt.pk).exists())
        print(json.dumps({'provenance_binding_waiters': len(observed), 'compatible_links': 1, 'incompatible_bindings_rejected': 1}))
