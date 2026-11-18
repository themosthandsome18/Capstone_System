"""Normal production URL contracts, real loopback HTTP, fake native transport."""
import io
from unittest.mock import patch
from PIL import Image
from django.test import LiveServerTestCase, SimpleTestCase, override_settings
from api import test_photo_source_reads as fixtures
from api.models import NativePhotoAttempt
from api.services.native_private_photos import NativeCreateOnlyStore
from backend.photo_settings import native_photo_settings


class ConfigurationTests(SimpleTestCase):
    def test_defaults_and_independent_flags(self):
        def read(values):
            return native_photo_settings(lambda name, default=None, **kwargs: values.get(name, default))
        defaults = read({})
        self.assertEqual(defaults['SANITATION_PHOTO_WRITE_PROVIDER'], 'S3')
        self.assertFalse(defaults['SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED'])
        self.assertFalse(defaults['SANITATION_NATIVE_PHOTO_READS_ENABLED'])
        self.assertFalse(defaults['SANITATION_NATIVE_PRIVATE_PHOTOS']['enabled'])
        result = read({'SANITATION_NATIVE_PHOTO_READS_ENABLED': True})
        self.assertFalse(result['SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED'])
        self.assertTrue(result['SANITATION_NATIVE_PRIVATE_PHOTOS']['enabled'])


@override_settings(SANITATION_PHOTO_WRITE_PROVIDER='NATIVE',
    SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED=True, SANITATION_NATIVE_PHOTO_READS_ENABLED=True,
    SANITATION_NATIVE_PHOTO_DEVELOPMENT=False, SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT=False)
class ProductionRouteTests(LiveServerTestCase):
    host = '127.0.0.1'
    allow_loopback_http = True
    user = fixtures.PhotoSourceHTTPTests.user
    request = fixtures.PhotoSourceHTTPTests.request
    url = fixtures.PhotoSourceHTTPTests.url
    link = fixtures.PhotoSourceHTTPTests.link

    def setUp(self):
        fixtures.PhotoSourceHTTPTests.setUp(self)
        self.read_patch = patch.object(self.native, 'read', side_effect=lambda key: self.native.objects[key])
        # FakeNativeStore inherits the real read method; no live transport is used.
        self.read_patch.start()
        self.addCleanup(self.read_patch.stop)
        read_factory = patch('api.services.native_private_photos.get_native_create_only_store', return_value=self.native)
        read_factory.start(); self.addCleanup(read_factory.stop)

    def test_normal_routes_create_replace_read_and_read_only_rollback(self):
        image = io.BytesIO(); Image.new('RGB', (3, 2), 'blue').save(image, 'PNG')
        for kind, owner in self.cases:
            before = kind.owner_model.objects.values().get(pk=owner.pk)
            url = self.url(kind, owner)
            statuses = []
            for data in (fixtures.image_bytes(), image.getvalue()):
                statuses.append(self.request(url, token=self.token, method='PUT', photo=data)[0])
                self.assertEqual(statuses[-1], 200)
                photo = self.link(kind, owner)
                self.assertEqual(photo.storage_provider, 'NATIVE')
                self.assertEqual(photo.native_attempt.state, 'LINKED')
                self.assertEqual(photo.native_attempt.owner_record_id, owner.pk)
                self.assertEqual(photo.native_attempt.owner_kind, kind.owner_field)
            rows = NativePhotoAttempt.objects.filter(owner_kind=kind.owner_field, owner_record_id=owner.pk)
            self.assertEqual(sorted(rows.values_list('state', flat=True)), ['LINKED', 'RETIRED_HELD'])
            with override_settings(SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED=False):
                result = self.request(url, token=self.token)
                self.assertEqual(result[0], 200)
                self.assertEqual(result[2], self.native.objects[photo.object_key])
                self.assertEqual(result[1]['Cache-Control'], 'private, no-store')
                self.assertEqual(result[1]['X-Content-Type-Options'], 'nosniff')
                self.assertEqual(result[1]['Content-Type'], 'image/png')
                self.assertEqual(self.request(url, token=self.token, method='PUT', photo=fixtures.image_bytes())[0], 503)
            self.assertEqual(kind.owner_model.objects.values().get(pk=owner.pk), before)
            print('NORMAL_ROUTE', kind.owner_field, statuses, 'GET', result[0], 'exact_bytes=True', flush=True)
        self.assertEqual(self.native.deletes + self.legacy.writes, [])

    def test_failed_replacement_preserves_previous_link(self):
        for kind, owner in self.cases:
            url = self.url(kind, owner)
            self.native.mode = 'created'
            self.assertEqual(self.request(url, token=self.token, method='PUT', photo=fixtures.image_bytes())[0], 200)
            before = self.link(kind, owner).object_key
            for mode in ('ambiguous', 'unavailable'):
                self.native.mode = mode
                result = self.request(url, token=self.token, method='PUT', photo=fixtures.image_bytes())
                self.assertEqual(result[0], 503)
                self.assertEqual(self.link(kind, owner).object_key, before)
                self.assertEqual(self.request(url, token=self.token)[2], self.native.objects[before])
            self.assertEqual(self.native.deletes, [])

    def test_authorization_and_invalid_selection_never_reach_provider(self):
        from rest_framework.authtoken.models import Token
        denied = Token.objects.create(user=self.user('release-tourism', 'tourism')).key
        for kind, owner in self.cases:
            url = self.url(kind, owner)
            for method in ('GET', 'PUT'):
                kwargs = {'method': method, 'photo': fixtures.image_bytes()} if method == 'PUT' else {}
                self.assertEqual(self.request(url, **kwargs)[0], 401)
                self.assertEqual(self.request(url, token=denied, **kwargs)[0], 403)
            for provider in ('', 'native', 'INVALID'):
                with override_settings(SANITATION_PHOTO_WRITE_PROVIDER=provider):
                    self.assertEqual(self.request(url, token=self.token, method='PUT', photo=fixtures.image_bytes())[0], 503)
        self.assertEqual(self.native.calls + self.legacy.writes, [])

    def test_incomplete_configuration_has_no_s3_fallback(self):
        from api.services.native_private_photos import NativePhotoConfigurationError
        for options in (None, {}, {'enabled': True}):
            with patch('api.services.native_photo_workflow.get_native_create_only_store',
                       side_effect=lambda: NativeCreateOnlyStore(options)):
                for kind, owner in self.cases:
                    result = self.request(self.url(kind, owner), token=self.token, method='PUT', photo=fixtures.image_bytes())
                    self.assertEqual(result[0], 503)
                    self.assertNotIn(b'sb_secret', result[2])
        self.assertEqual(self.native.calls + self.legacy.writes, [])
