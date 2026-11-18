"""Establishment-resolved private front photos; synthetic images and controlled storage only."""
import io
from unittest.mock import patch

from PIL import Image
from django.apps import apps
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from django.db.models.deletion import ProtectedError
from django.test import TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from api.models import (
    HouseholdSanitationRecord, SanitaryBusinessType, SanitaryEstablishment, SanitaryInspection,
    UserProfile,
)
from api.services.private_photos import MAX_BYTES, PrivatePhotoUnavailable
from api.test_household_front_photo import FakePrivateStore, image_bytes


def gps_jpeg():
    """JPEG carrying EXIF text and a GPS IFD that must never be stored."""
    output = io.BytesIO()
    metadata = Image.Exif()
    metadata[270] = 'SYNTHETIC establishment description'
    metadata[0x8825] = {1: 'N', 2: (14.0, 11.0, 6.0), 3: 'E', 4: (121.0, 43.0, 52.0)}
    Image.new('RGB', (12, 8), 'green').save(output, format='JPEG', exif=metadata)
    return output.getvalue()


@override_settings(USE_SEED_DATA=False)
class EstablishmentFrontPhotoTests(TransactionTestCase):
    def setUp(self):
        self.store = FakePrivateStore()
        for target in ('api.services.private_photos.get_private_photo_store',
                       'api.views.private_photos.get_private_photo_store'):
            mock = patch(target, return_value=self.store)
            mock.start()
            self.addCleanup(mock.stop)
        self.client = APIClient()
        self.staff = self.user('establishment-photo-inspector', 'sanitation')
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.staff).key)
        business_type = SanitaryBusinessType.objects.order_by('pk').first() or \
            SanitaryBusinessType.objects.create(name='Synthetic Food Establishment')
        self.establishment = SanitaryEstablishment.objects.create(
            business_name='Synthetic Carinderia', owner_name='Synthetic Owner',
            business_type=business_type, barangay='Alitap', address='1 Synthetic Street',
            latitude=14.1, longitude=121.7)
        self.url = f'/api/sanitation/establishments/{self.establishment.pk}/front-photo/'

    # helpers -----------------------------------------------------------------
    def user(self, name, role, **kwargs):
        user = User.objects.create_user(username=name, **kwargs)
        if role is not None:
            UserProfile.objects.create(user=user, role=role)
        return user

    def upload(self, data=None, url=None, **extra):
        photo = SimpleUploadedFile('front.png', image_bytes() if data is None else data,
                                   content_type='image/png')
        return self.client.put(url or self.url, {'photo': photo, **extra}, format='multipart')

    def photo_model(self):
        return apps.get_model('api', 'EstablishmentFrontPhoto')

    def cleanup_rows(self):
        return apps.get_model('api', 'EstablishmentPhotoCleanup').objects.all()

    def linked_key(self, establishment=None):
        return self.photo_model().objects.get(establishment=establishment or self.establishment).object_key

    # behaviour ----------------------------------------------------------------
    def test_upload_retrieve_and_headers_without_exposing_keys(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'has_front_photo': True, 'cleanup_pending': False})
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        key = self.linked_key()
        self.assertRegex(key, rf'^profile-photos/establishments/{self.establishment.pk}/[0-9a-f]{{32}}\.png$')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, self.store.objects[key])
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        detail = self.client.get(f'/api/sanitation/establishments/{self.establishment.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertNotIn('profile-photos', detail.content.decode())

    def test_absent_photo_and_absent_establishment(self):
        self.assertEqual(self.client.get(self.url).status_code, 404)
        missing = '/api/sanitation/establishments/999999/front-photo/'
        self.assertEqual(self.client.get(missing).status_code, 404)
        self.assertEqual(self.upload(url=missing).status_code, 404)
        self.assertFalse(self.store.objects)

    def test_jpeg_exif_and_gps_metadata_removed(self):
        self.assertEqual(self.upload(gps_jpeg()).status_code, 200)
        response = self.client.get(self.url)
        self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.assertNotIn(b'SYNTHETIC establishment description', response.content)
        with Image.open(io.BytesIO(response.content)) as image:
            self.assertEqual(dict(image.getexif()), {})
            self.assertEqual(image.getexif().get_ifd(0x8825), {})
            self.assertEqual(image.size, (12, 8))

    def test_replacement_is_immutable_and_removes_previous_object(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.assertEqual(self.upload(image_bytes(color='blue')).status_code, 200)
        self.assertNotEqual(self.linked_key(), old)
        self.assertNotIn(old, self.store.objects)
        self.assertEqual(len(self.store.objects), 1)
        self.assertFalse(self.cleanup_rows().exists())

    def test_sanitation_owner_tourism_tourist_and_profileless_roles_denied(self):
        for role in ('establishment', 'tourism', 'tourist', 'resort', None):
            with self.subTest(role=role):
                other = self.user(f'denied-{role}', role)
                self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=other).key)
                self.assertEqual(self.upload().status_code, 403)
                self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertFalse(self.store.objects)
        self.assertFalse(self.photo_model().objects.exists())

    def test_linked_owner_account_is_still_denied(self):
        owner = self.user('synthetic-owner', 'establishment')
        self.establishment.user = owner
        self.establishment.save(update_fields=['user'])
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=owner).key)
        self.assertEqual(self.upload().status_code, 403)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_admin_and_superuser_allowed(self):
        admin = self.user('photo-admin', 'admin')
        superuser = User.objects.create_superuser('photo-root', 'root@example.invalid', 'x')
        for account in (admin, superuser):
            with self.subTest(account=account.username):
                self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=account).key)
                self.assertEqual(self.upload().status_code, 200)
                self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_anonymous_invalid_token_and_inactive_denied(self):
        for credentials in ({}, {'HTTP_AUTHORIZATION': 'Token invalid'}):
            with self.subTest(credentials=bool(credentials)):
                self.client.credentials(**credentials)
                self.assertEqual(self.upload().status_code, 401)
                self.assertEqual(self.client.get(self.url).status_code, 401)
        inactive = self.user('inactive-inspector', 'sanitation', is_active=False)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=inactive).key)
        self.assertEqual(self.upload().status_code, 401)
        self.assertFalse(self.store.objects)

    def test_caller_keys_extra_fields_query_and_multiple_files_rejected(self):
        self.assertEqual(self.upload(object_key='profile-photos/establishments/1/' + 'a' * 32 + '.png').status_code, 400)
        self.assertEqual(self.client.get(self.url + '?key=untrusted').status_code, 400)
        self.assertEqual(self.client.put(self.url, {}, format='multipart').status_code, 400)
        files = [SimpleUploadedFile(f'{n}.png', image_bytes(), content_type='image/png') for n in 'ab']
        self.assertEqual(self.client.put(self.url, {'photo': files}, format='multipart').status_code, 400)
        self.assertFalse(self.store.objects)

    def test_record_id_substitution_cannot_select_another_photo(self):
        self.assertEqual(self.upload().status_code, 200)
        other = SanitaryEstablishment.objects.create(
            business_name='Synthetic Bakery', owner_name='Other Owner',
            business_type=self.establishment.business_type, barangay='Polo', address='2 Synthetic Street')
        url = f'/api/sanitation/establishments/{other.pk}/front-photo/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url, {'key': self.linked_key()}).status_code, 400)

    def test_invalid_type_malformed_and_oversized_rejected_without_mutation(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        gif = io.BytesIO()
        Image.new('RGB', (4, 4)).save(gif, format='GIF')
        webp = io.BytesIO()
        Image.new('RGB', (4, 4)).save(webp, format='WEBP')
        for label, data in {'text': b'not an image', 'png signature only': b'\x89PNG\r\n\x1a\n',
                            'truncated png': image_bytes()[:30], 'gif': gif.getvalue(),
                            'webp': webp.getvalue()}.items():
            with self.subTest(label):
                self.assertEqual(self.upload(data).status_code, 400)
        self.assertEqual(self.upload(b'x' * (MAX_BYTES + 1)).status_code, 413)
        self.assertEqual(self.linked_key(), old)
        self.assertEqual(set(self.store.objects), {old})

    def test_failed_write_preserves_original_and_compensates_partial_write(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.store.fail_write = True
        self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.linked_key(), old)
        self.assertEqual(set(self.store.objects), {old})
        self.assertFalse(self.cleanup_rows().exists())

    def test_database_failure_preserves_original_and_cleans_new_object(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        with patch.object(self.photo_model(), 'save', side_effect=DatabaseError('synthetic DB failure')):
            self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.linked_key(), old)
        self.assertEqual(set(self.store.objects), {old})

    def test_cleanup_failure_is_journaled_retryable_and_never_logs_keys(self):
        self.assertEqual(self.upload().status_code, 200)
        old = self.linked_key()
        self.store.fail_delete = True
        with self.assertLogs('api.services.establishment_photos', level='ERROR') as logs:
            response = self.upload(image_bytes(color='blue'))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['cleanup_pending'])
        self.assertEqual(self.cleanup_rows().get().object_key, old)
        self.assertNotIn(old, ' '.join(logs.output))
        from api.services.establishment_photos import retry_cleanup
        self.store.fail_delete = False
        self.assertTrue(retry_cleanup(self.cleanup_rows().get().pk, self.store))
        self.assertEqual(len(self.store.objects), 1)

    def test_cleanup_never_deletes_linked_or_live_upload_objects(self):
        self.assertEqual(self.upload().status_code, 200)
        model = apps.get_model('api', 'EstablishmentPhotoCleanup')
        receipt = model.objects.create(object_key=self.linked_key(), ready=True)
        from api.services.establishment_photos import retry_cleanup
        with self.assertLogs('api.services.establishment_photos', level='ERROR'):
            self.assertFalse(retry_cleanup(receipt.pk, self.store))
        receipt.ready = False
        receipt.save(update_fields=['ready'])
        self.assertFalse(retry_cleanup(receipt.pk, self.store))
        self.assertEqual(len(self.store.objects), 1)

    def test_cross_kind_cleanup_never_deletes_another_kinds_photo(self):
        house = HouseholdSanitationRecord.objects.create(
            household_code='PHOTO-CROSS', household_head='Synthetic household', barangay='Alitap')
        self.assertEqual(self.upload(url=f'/api/households/records/{house.pk}/front-photo/').status_code, 200)
        self.assertEqual(self.upload().status_code, 200)
        house_key = apps.get_model('api', 'HouseholdFrontPhoto').objects.get(household=house).object_key
        est_key = self.linked_key()
        from api.services.establishment_photos import retry_cleanup as establishment_cleanup
        from api.services.household_photos import retry_cleanup as household_cleanup
        stray = self.cleanup_rows().model.objects.create(object_key=house_key, ready=True)
        with self.assertLogs('api.services.establishment_photos', level='ERROR'):
            self.assertFalse(establishment_cleanup(stray.pk, self.store))
        stray_house = apps.get_model('api', 'HouseholdPhotoCleanup').objects.create(object_key=est_key, ready=True)
        with self.assertLogs('api.services.household_photos', level='ERROR'):
            self.assertFalse(household_cleanup(stray_house.pk, self.store))
        self.assertIn(house_key, self.store.objects)
        self.assertIn(est_key, self.store.objects)

    def test_disabled_storage_and_provider_read_failure_fail_closed(self):
        with patch('api.services.private_photos.get_private_photo_store', side_effect=PrivatePhotoUnavailable()):
            self.assertEqual(self.upload().status_code, 503)
        self.assertFalse(self.store.objects)
        self.assertEqual(self.upload().status_code, 200)
        self.store.fail_read = True
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response['Cache-Control'], 'private, no-store')

    def test_household_photos_inspections_and_establishment_record_unaffected(self):
        house = HouseholdSanitationRecord.objects.create(
            household_code='PHOTO-ISOLATION', household_head='Synthetic household', barangay='Alitap')
        house_url = f'/api/households/records/{house.pk}/front-photo/'
        self.assertEqual(self.upload(url=house_url).status_code, 200)
        house_key = apps.get_model('api', 'HouseholdFrontPhoto').objects.get(household=house).object_key
        before = self.client.get(f'/api/sanitation/establishments/{self.establishment.pk}/').json()
        self.assertEqual(self.upload().status_code, 200)
        self.assertEqual(self.upload(image_bytes(color='blue')).status_code, 200)
        self.assertIn(house_key, self.store.objects)
        self.assertEqual(self.client.get(house_url).content, self.store.objects[house_key])
        self.assertFalse(apps.get_model('api', 'HouseholdPhotoCleanup').objects.exists())
        self.assertFalse(SanitaryInspection.objects.exists())
        after = self.client.get(f'/api/sanitation/establishments/{self.establishment.pk}/').json()
        self.assertEqual(before, after)

    def test_establishment_retention_keeps_photo_link(self):
        self.assertEqual(self.upload().status_code, 200)
        with self.assertRaises(ProtectedError):
            self.establishment.delete()
        self.assertTrue(self.photo_model().objects.filter(establishment=self.establishment).exists())
