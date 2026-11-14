"""Household-resolved private photos; synthetic images and controlled storage only."""
import io
from unittest.mock import Mock, patch

from PIL import Image
from django.apps import apps
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from api.models import HouseholdSanitationRecord, UserProfile
from api.services.private_photos import MAX_BYTES, PrivatePhotoMissing, PrivatePhotoStore, PrivatePhotoUnavailable
from botocore.exceptions import ClientError, EndpointConnectionError


def image_bytes(kind='PNG', color='red', exif=False):
    output = io.BytesIO()
    image = Image.new('RGB', (12, 8), color)
    metadata = Image.Exif()
    if exif:
        metadata[270] = 'SYNTHETIC metadata must not escape'
    image.save(output, format=kind, exif=metadata)
    return output.getvalue()


class FakePrivateStore(PrivatePhotoStore):
    def __init__(self):
        super().__init__(dict(enabled=True, private_bucket_confirmed=True,
            endpoint_url='https://storage.example.invalid', bucket='private-fixtures',
            region='fixture-region', access_key='fixture-only', secret_key='fixture-only'))
        self.objects = {}
        self.fail_write = self.fail_delete = self.fail_read = False

    def write(self, key, data):
        # Model a provider that stores bytes but loses the acknowledgement.
        self.objects[key] = data
        if self.fail_write:
            raise PrivatePhotoUnavailable()

    def read(self, key):
        if self.fail_read:
            raise PrivatePhotoUnavailable()
        if key not in self.objects:
            raise PrivatePhotoMissing()
        return self.objects[key]

    def delete(self, key):
        if self.fail_delete:
            raise PrivatePhotoUnavailable()
        self.objects.pop(key, None)


@override_settings(USE_SEED_DATA=False)
class HouseholdFrontPhotoTests(TransactionTestCase):
    def setUp(self):
        self.store = FakePrivateStore()
        for target in ('api.services.private_photos.get_private_photo_store',
                       'api.views.private_photos.get_private_photo_store'):
            mock = patch(target, return_value=self.store)
            mock.start()
            self.addCleanup(mock.stop)
        self.client = APIClient()
        self.staff = self.user('photo-inspector', 'sanitation')
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.staff).key)
        self.house = HouseholdSanitationRecord.objects.create(
            household_code='PHOTO-SYNTHETIC', household_head='Synthetic household',
            barangay='Alitap', remarks='  keep exact  ', male_count=3,
            latitude=14.1, longitude=121.7)
        self.url = f'/api/households/records/{self.house.pk}/front-photo/'

    def user(self, name, role, **kwargs):
        user = User.objects.create_user(username=name, **kwargs)
        if role is not None:
            UserProfile.objects.create(user=user, role=role)
        return user

    def upload(self, data=None, **extra):
        photo = SimpleUploadedFile('front.png', image_bytes() if data is None else data,
                                   content_type='image/png')
        return self.client.put(self.url, {'photo': photo, **extra}, format='multipart')

    def linked_key(self):
        return apps.get_model('api', 'HouseholdFrontPhoto').objects.get(household=self.house).object_key

    def cleanup_rows(self):
        return apps.get_model('api', 'HouseholdPhotoCleanup').objects.all()

    def test_upload_retrieve_and_headers_without_exposing_keys(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'has_front_photo': True, 'cleanup_pending': False})
        key = self.linked_key()
        self.assertRegex(key, rf'^profile-photos/households/{self.house.pk}/[0-9a-f]{{32}}\.png$')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, self.store.objects[key])
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')

    def test_jpeg_is_decoded_and_metadata_removed(self):
        self.assertEqual(self.upload(image_bytes('JPEG', exif=True)).status_code, 200)
        response = self.client.get(self.url)
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        with Image.open(io.BytesIO(response.content)) as image:
            self.assertEqual(dict(image.getexif()), {})
            self.assertEqual(image.size, (12, 8))

    def test_replacement_is_immutable_and_removes_previous_object(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.assertEqual(self.upload(image_bytes(color='blue')).status_code, 200)
        self.assertNotEqual(self.linked_key(), old)
        self.assertNotIn(old, self.store.objects)
        self.assertEqual(len(self.store.objects), 1)
        self.assertFalse(self.cleanup_rows().exists())

    def test_unrelated_web_and_mobile_edits_preserve_photo_and_coordinates(self):
        self.assertEqual(self.upload().status_code, 200)
        key = self.linked_key()
        detail = self.url.removesuffix('front-photo/')
        self.assertEqual(self.client.patch(detail, {'remarks': '  new  '}, format='json').status_code, 200)
        response = self.client.post('/api/mobile/sanitation/household-surveys/',
                                    {'household_code': self.house.household_code, 'household_head': self.house.household_head,
                                     'barangay': self.house.barangay, 'male_count': 4}, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        self.assertEqual(self.linked_key(), key)
        self.house.refresh_from_db()
        self.assertEqual((self.house.latitude, self.house.longitude, self.house.remarks), (14.1, 121.7, '  new  '))
        self.assertNotIn('object_key', self.client.get(detail).json())

    def test_permissions_upload_and_read(self):
        for role in ('tourism', 'tourist', 'establishment', 'unknown', None):
            with self.subTest(role=role):
                user = self.user('denied-' + str(role), role, is_staff=True)
                self.client.force_authenticate(user=user)
                self.assertEqual(self.upload().status_code, 403)
                self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertFalse(self.store.objects)

    def test_admin_and_superuser_allowed(self):
        for user in (self.user('admin-photo', 'admin'), self.user('root-photo', None, is_superuser=True)):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.upload().status_code, 200)
            self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_anonymous_invalid_token_and_inactive_denied(self):
        for credential in (None, 'Token invalid-synthetic'):
            self.client.credentials(HTTP_AUTHORIZATION=credential or '')
            self.assertEqual(self.upload().status_code, 401)
            self.assertEqual(self.client.get(self.url).status_code, 401)
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get(user=self.staff).key)
        self.assertEqual(self.upload().status_code, 401)

    def test_absent_household_and_absent_photo(self):
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.url = '/api/households/records/999999/front-photo/'
        self.assertEqual(self.upload().status_code, 404)
        self.assertFalse(self.store.objects)

    def test_caller_keys_fields_and_multiple_files_rejected(self):
        self.assertEqual(self.upload(object_key='untrusted').status_code, 400)
        self.assertEqual(self.client.get(self.url + '?key=untrusted').status_code, 400)
        self.assertEqual(self.client.put(self.url, {}, format='multipart').status_code, 400)
        files = [SimpleUploadedFile('x.png', image_bytes()), SimpleUploadedFile('y.png', image_bytes())]
        self.assertEqual(self.client.put(self.url, {'photo': files}, format='multipart').status_code, 400)
        self.assertFalse(self.store.objects)

    def test_cross_household_lookup_cannot_select_another_photo(self):
        self.assertEqual(self.upload().status_code, 200)
        other = HouseholdSanitationRecord.objects.create(household_code='OTHER-PHOTO', household_head='Other', barangay='Alitap')
        url = f'/api/households/records/{other.pk}/front-photo/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url, {'key': self.linked_key()}).status_code, 400)

    def test_malformed_signature_only_truncated_and_webp_rejected(self):
        for data in (b'not an image', b'\x89PNG\r\n\x1a\ninvalid', image_bytes('JPEG')[:80], image_bytes('WEBP')):
            with self.subTest(length=len(data)):
                self.assertEqual(self.upload(data).status_code, 400)
        self.assertFalse(self.store.objects)

    def test_oversized_image_rejected_without_mutation(self):
        self.assertEqual(self.upload(b'x' * (MAX_BYTES + 1)).status_code, 413)
        self.assertFalse(self.store.objects)

    def test_excessive_pixel_count_and_animation_rejected(self):
        with patch('PIL.Image.open') as opened:
            opened.return_value.__enter__.return_value.size = (10000, 10000)
            self.assertEqual(self.upload().status_code, 400)
        output = io.BytesIO()
        Image.new('RGB', (2, 2), 'red').save(output, format='PNG', save_all=True,
                                          append_images=[Image.new('RGB', (2, 2), 'blue')])
        self.assertEqual(self.upload(output.getvalue()).status_code, 400)

    def test_failed_write_preserves_original_and_compensates_partial_write(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.store.fail_write = True
        self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.linked_key(), old)
        self.assertTrue(set(self.store.objects) == {old}, 'Only the original object should remain.')
        self.assertFalse(self.cleanup_rows().exists())

    def test_database_failure_preserves_original_and_cleans_new_object(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        model = apps.get_model('api', 'HouseholdFrontPhoto')
        with patch.object(model, 'save', side_effect=DatabaseError('synthetic DB failure')):
            self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.linked_key(), old)
        self.assertTrue(set(self.store.objects) == {old}, 'Only the original object should remain.')

    def test_cleanup_failure_is_journaled_and_reported_without_keys(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.store.fail_delete = True
        with self.assertLogs('api.services.household_photos', level='ERROR') as logs:
            response = self.upload(image_bytes(color='blue'))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['cleanup_pending'])
        self.assertNotEqual(self.linked_key(), old)
        self.assertEqual(self.cleanup_rows().get().object_key, old)
        self.assertTrue(self.cleanup_rows().get().ready)
        self.assertNotIn(old, ' '.join(logs.output))
        from api.services.household_photos import retry_cleanup
        self.store.fail_delete = False
        self.assertTrue(retry_cleanup(self.cleanup_rows().get().pk, self.store))
        self.assertEqual(len(self.store.objects), 1)

    def test_database_rollback_after_receipt_delete_still_compensates(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        model = apps.get_model('api', 'HouseholdPhotoCleanup')
        original = model.delete
        def fail_after_delete(instance, *args, **kwargs):
            original(instance, *args, **kwargs)
            raise DatabaseError('synthetic failure after receipt deletion')
        with patch.object(model, 'delete', fail_after_delete):
            self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.linked_key(), old)
        self.assertTrue(set(self.store.objects) == {old}, 'Only the original object should remain.')

    def test_failed_write_and_cleanup_keeps_original_and_pending_receipt(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.store.fail_write = self.store.fail_delete = True
        response = self.upload()
        self.assertEqual(response.status_code, 503)
        self.assertTrue(response.json()['cleanup_pending'])
        self.assertEqual(self.linked_key(), old)
        self.assertEqual(self.cleanup_rows().count(), 1)

    def test_disabled_configuration_fails_closed_without_mutation(self):
        with patch('api.services.private_photos.get_private_photo_store', side_effect=PrivatePhotoUnavailable()):
            self.assertEqual(self.upload().status_code, 503)
        self.assertFalse(self.store.objects)

    def test_provider_read_failure_is_private_503(self):
        self.assertEqual(self.upload().status_code, 200)
        self.store.fail_read = True
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response['Cache-Control'], 'private, no-store')

    def test_household_deletion_cleans_its_photo(self):
        self.assertEqual(self.upload().status_code, 200)
        detail = self.url.removesuffix('front-photo/')
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.assertFalse(self.store.objects)
        self.assertFalse(self.cleanup_rows().exists())

    def test_cleanup_never_deletes_linked_or_live_upload_objects(self):
        self.assertEqual(self.upload().status_code, 200)
        model = apps.get_model('api', 'HouseholdPhotoCleanup')
        receipt = model.objects.create(object_key=self.linked_key(), ready=True)
        from api.services.household_photos import retry_cleanup
        with self.assertLogs('api.services.household_photos', level='ERROR'):
            self.assertFalse(retry_cleanup(receipt.pk, self.store))
        receipt.ready = False
        receipt.save(update_fields=['ready'])
        self.assertFalse(retry_cleanup(receipt.pk, self.store))
        self.assertEqual(len(self.store.objects), 1)


class PrivatePhotoWriteAdapterTests(SimpleTestCase):
    def setUp(self):
        self.store = PrivatePhotoStore(dict(enabled=True, private_bucket_confirmed=True,
            endpoint_url='https://storage.example.invalid', bucket='synthetic-private',
            region='synthetic-region', access_key='synthetic-only', secret_key='synthetic-only'))
        self.key = 'profile-photos/households/1/' + 'a' * 32 + '.png'

    def test_put_and_delete_use_explicit_private_bucket_and_close_client(self):
        client = Mock()
        data = image_bytes()
        with patch.object(self.store, '_client', return_value=client):
            self.store.write(self.key, data)
            self.store.delete(self.key)
        client.put_object.assert_called_once_with(Bucket='synthetic-private', Key=self.key, Body=data,
            ContentType='image/png', CacheControl='private, no-store')
        client.delete_object.assert_called_once_with(Bucket='synthetic-private', Key=self.key)
        self.assertEqual(client.close.call_count, 2)
        client.generate_presigned_url.assert_not_called()

    def test_write_rejects_invalid_bytes_before_opening_client(self):
        with patch.object(self.store, '_client') as client:
            for data in (b'bad', b'', b'x' * (MAX_BYTES + 1)):
                with self.assertRaises(PrivatePhotoUnavailable):
                    self.store.write(self.key, data)
        client.assert_not_called()

    def test_write_provider_errors_are_sanitized_and_client_closed(self):
        client = Mock()
        client.put_object.side_effect = EndpointConnectionError(endpoint_url='https://synthetic.invalid')
        with patch.object(self.store, '_client', return_value=client):
            with self.assertRaises(PrivatePhotoUnavailable) as error:
                self.store.write(self.key, image_bytes())
        self.assertEqual(str(error.exception), '')
        client.close.assert_called_once()

    def test_delete_missing_is_idempotent_but_denial_is_not_success(self):
        client = Mock()
        with patch.object(self.store, '_client', return_value=client):
            client.delete_object.side_effect = ClientError({'Error': {'Code': 'NoSuchKey'}}, 'DeleteObject')
            self.store.delete(self.key)
            client.delete_object.side_effect = ClientError({'Error': {'Code': 'AccessDenied'}}, 'DeleteObject')
            with self.assertRaises(PrivatePhotoUnavailable):
                self.store.delete(self.key)
        self.assertEqual(client.close.call_count, 2)
