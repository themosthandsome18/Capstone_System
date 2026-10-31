"""Private-photo foundation tests. Fixture route exists ONLY in this test URLConf."""
import base64
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from botocore.exceptions import ClientError, EndpointConnectionError
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, LiveServerTestCase, override_settings
from django.urls import path
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.test import APIClient

from api.models import ROLE_ADMIN, ROLE_SANITATION, UserProfile
from api.services.private_photos import (
    MAX_BYTES, InvalidPrivatePhotoKey, PrivatePhotoMissing, PrivatePhotoStore,
    PrivatePhotoUnavailable, get_private_photo_store, validate_key,
)
from api.views.private_photos import private_photo_response

KEY = 'profile-photos/establishments/1/' + 'a' * 32 + '.png'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z8sAAAAASUVORK5CYII=')
OPTIONS = dict(enabled=True, private_bucket_confirmed=True, endpoint_url='https://storage.example.invalid',
               bucket='private-fixtures', region='fixture-region', access_key='fixture-only', secret_key='fixture-only')


@api_view(['GET'])
@permission_classes([AllowAny])
def fixture_view(request):
    # Server-owned fixture association: query parameters never select objects.
    return private_photo_response(request, resolved_key=KEY)


urlpatterns = [path('fixture/profile-photo/', fixture_view)]


class PrivatePhotoStorageTests(SimpleTestCase):
    def test_missing_configuration_never_uses_default_storage_or_creates_client(self):
        with patch('boto3.session.Session') as session, patch('django.core.files.storage.default_storage.open') as public:
            for config in (None, {}, {'enabled': True}, {**OPTIONS, 'enabled': False},
                           {**OPTIONS, 'private_bucket_confirmed': False}):
                with self.subTest(configured=bool(config)), override_settings(SANITATION_PRIVATE_PHOTOS=config):
                    with self.assertRaises(PrivatePhotoUnavailable):
                        get_private_photo_store()
            session.assert_not_called()
            public.assert_not_called()

    def test_each_private_setting_is_required_even_when_public_storage_exists(self):
        for name in ('endpoint_url', 'bucket', 'region', 'access_key', 'secret_key'):
            with self.subTest(setting=name), self.assertRaises(PrivatePhotoUnavailable):
                PrivatePhotoStore({**OPTIONS, name: ''})

    def test_endpoint_and_bucket_constraints(self):
        for endpoint in ('http://storage.example.invalid', 'https://user:password@example.invalid',
                         'https://example.invalid/public', 'https://example.invalid?key=x', 'https://['):
            with self.subTest(endpoint=endpoint), self.assertRaises(PrivatePhotoUnavailable):
                PrivatePhotoStore({**OPTIONS, 'endpoint_url': endpoint})
        with self.assertRaises(PrivatePhotoUnavailable):
            PrivatePhotoStore({**OPTIONS, 'bucket': '../media'})

    def test_invalid_keys_are_rejected_before_storage_access(self):
        store = PrivatePhotoStore(OPTIONS)
        for key in ('../x', KEY + '/x', KEY + '?token=x', '/' + KEY, KEY.replace('/', '\\'),
                    KEY.replace('/1/', '/01/'), KEY.replace('.png', '.svg'), 'https://example.invalid/x',
                    KEY.replace('establishments', 'complaints'), KEY + '\n', None):
            with self.subTest(key=key), patch.object(store, '_client') as client:
                with self.assertRaises(InvalidPrivatePhotoKey):
                    store.read(key)
                client.assert_not_called()
        self.assertEqual(validate_key(KEY.replace('establishments', 'households')), KEY.replace('establishments', 'households'))

    def test_urls_are_unconditionally_disabled(self):
        with self.assertRaises(PrivatePhotoUnavailable):
            PrivatePhotoStore(OPTIONS).url(KEY)

    def test_s3_client_has_explicit_credentials_endpoint_and_bounded_retries(self):
        with patch('boto3.session.Session') as session:
            PrivatePhotoStore(OPTIONS)._client()
            self.assertEqual(session.call_args.kwargs['aws_access_key_id'], OPTIONS['access_key'])
            kwargs = session.return_value.client.call_args.kwargs
            self.assertEqual(kwargs['endpoint_url'], OPTIONS['endpoint_url'])
            self.assertEqual(kwargs['config'].signature_version, 's3v4')
            self.assertEqual(kwargs['config'].retries['total_max_attempts'], 2)

    def test_success_reads_bytes_closes_resources_and_never_generates_url(self):
        store = PrivatePhotoStore(OPTIONS)
        body = io.BytesIO(PNG)
        client = Mock()
        client.get_object.return_value = {'Body': body, 'ContentLength': len(PNG)}
        with patch.object(store, '_client', return_value=client):
            self.assertEqual(store.read(KEY), PNG)
        client.get_object.assert_called_once_with(Bucket='private-fixtures', Key=KEY)
        client.generate_presigned_url.assert_not_called()
        client.close.assert_called_once()
        self.assertTrue(body.closed)

    def test_missing_and_denied_objects_have_distinct_safe_errors(self):
        for code, expected in (('NoSuchKey', PrivatePhotoMissing), ('AccessDenied', PrivatePhotoUnavailable),
                               ('NoSuchBucket', PrivatePhotoUnavailable)):
            client = Mock()
            client.get_object.side_effect = ClientError({'Error': {'Code': code, 'Message': 'sensitive-provider-detail'}}, 'GetObject')
            with patch.object(PrivatePhotoStore, '_client', return_value=client), self.assertRaises(expected) as caught:
                PrivatePhotoStore(OPTIONS).read(KEY)
            self.assertNotIn('sensitive-provider-detail', str(caught.exception))

    def test_jpeg_and_body_read_failure(self):
        client = Mock()
        jpeg = b'\xff\xd8\xfffixture-image'
        client.get_object.return_value = {'Body': io.BytesIO(jpeg), 'ContentLength': len(jpeg)}
        with patch.object(PrivatePhotoStore, '_client', return_value=client):
            self.assertEqual(PrivatePhotoStore(OPTIONS).read(KEY.replace('.png', '.jpg')), jpeg)
        body = Mock()
        body.read.side_effect = OSError('provider detail')
        client.get_object.return_value = {'Body': body, 'ContentLength': len(PNG)}
        with patch.object(PrivatePhotoStore, '_client', return_value=client), self.assertRaises(PrivatePhotoUnavailable):
            PrivatePhotoStore(OPTIONS).read(KEY)
        body.close.assert_called_once()

    def test_invalid_or_oversized_objects_and_read_failures_are_closed(self):
        for data, length in ((b'<html>not an image', 18), (PNG, MAX_BYTES + 1),
                             (PNG, len(PNG) + 1), (b'', 0), (PNG + b'x' * MAX_BYTES, MAX_BYTES)):
            body = io.BytesIO(data)
            client = Mock()
            client.get_object.return_value = {'Body': body, 'ContentLength': length}
            with patch.object(PrivatePhotoStore, '_client', return_value=client), self.assertRaises(PrivatePhotoUnavailable):
                PrivatePhotoStore(OPTIONS).read(KEY)
            self.assertTrue(body.closed)
        with patch.object(PrivatePhotoStore, '_client', side_effect=EndpointConnectionError(endpoint_url='https://fixture.invalid')):
            with self.assertRaises(PrivatePhotoUnavailable):
                PrivatePhotoStore(OPTIONS).read(KEY)


@override_settings(ROOT_URLCONF=__name__, USE_SEED_DATA=False)
class PrivatePhotoAccessTests(TestCase):
    def account(self, name, role=None, **flags):
        user = User.objects.create_user(name, **flags)
        if role is not None:
            UserProfile.objects.create(user=user, role=role)
        Token.objects.create(user=user)
        return user

    def test_anonymous_other_roles_and_is_staff_alone_never_reach_storage(self):
        client = APIClient()
        for index, role in enumerate((None, 'tourism', 'tourist', 'establishment', 'unknown')):
            user = self.account('denied' + str(index), role, is_staff=True)
            client.credentials(HTTP_AUTHORIZATION='Token ' + user.auth_token.key)
            before = list(UserProfile.objects.values())
            with patch('api.views.private_photos.get_private_photo_store') as storage:
                self.assertEqual(client.get('/fixture/profile-photo/').status_code, 403)
                storage.assert_not_called()
            self.assertEqual(list(UserProfile.objects.values()), before)
        client.credentials()
        with patch('api.views.private_photos.get_private_photo_store') as storage:
            self.assertEqual(client.get('/fixture/profile-photo/').status_code, 401)
            storage.assert_not_called()

    def test_authorized_roles_get_fixture_without_public_url(self):
        for index, (role, flags) in enumerate(((ROLE_SANITATION, {}), (ROLE_ADMIN, {}), (None, {'is_superuser': True}))):
            user = self.account('allowed' + str(index), role, **flags)
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION='Token ' + user.auth_token.key)
            with patch('api.views.private_photos.get_private_photo_store') as storage:
                storage.return_value.read.return_value = PNG
                response = client.get('/fixture/profile-photo/?key=../../other-object')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, PNG)
                self.assertEqual(response['Content-Type'], 'image/png')
                self.assertEqual(response['Cache-Control'], 'private, no-store')
                self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
                storage.return_value.read.assert_called_once_with(KEY)
                storage.return_value.url.assert_not_called()

    def test_inactive_superuser_is_denied_before_storage(self):
        user = self.account('inactive', ROLE_ADMIN, is_superuser=True, is_active=False)
        from django.test import RequestFactory
        request = RequestFactory().get('/fixture/profile-photo/')
        request.user = user
        with patch('api.views.private_photos.get_private_photo_store') as storage:
            self.assertEqual(private_photo_response(request, resolved_key=KEY).status_code, 401)
            storage.assert_not_called()

    def test_failure_responses_disclose_no_provider_details(self):
        user = self.account('sanitation', ROLE_SANITATION)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Token ' + user.auth_token.key)
        for error, code in ((PrivatePhotoMissing(), 404), (InvalidPrivatePhotoKey(), 404), (PrivatePhotoUnavailable(), 503)):
            with patch('api.views.private_photos.get_private_photo_store', side_effect=error):
                response = client.get('/fixture/profile-photo/')
                self.assertEqual(response.status_code, code)
                self.assertEqual(response['Cache-Control'], 'private, no-store')
        with override_settings(SANITATION_PRIVATE_PHOTOS={}):
            self.assertEqual(client.get('/fixture/profile-photo/').status_code, 503)


@override_settings(ROOT_URLCONF=__name__, USE_SEED_DATA=False)
class PrivatePhotoHTTPTests(LiveServerTestCase):
    host = '127.0.0.1'

    def test_real_authenticated_http_with_private_fixture_storage(self):
        with TemporaryDirectory(prefix='capstone-private-fixture-') as folder:
            root = Path(folder)
            fixture = root / KEY
            fixture.parent.mkdir(parents=True)
            fixture.write_bytes(PNG)

            class FixtureStorage:
                def read(self, key):
                    validate_key(key)
                    try:
                        return (root / key).read_bytes()
                    except FileNotFoundError:
                        raise PrivatePhotoMissing() from None

            def http(token=None):
                headers = {'Authorization': 'Token ' + token} if token else {}
                try:
                    with urlopen(Request(self.live_server_url + '/fixture/profile-photo/', headers=headers), timeout=10) as result:
                        return result.status, result.read(), result.headers
                except HTTPError as error:
                    return error.code, error.read(), error.headers

            users = []
            for index, role in enumerate((ROLE_SANITATION, ROLE_ADMIN, 'tourism')):
                user = User.objects.create_user('http_fixture_' + str(index), is_staff=True)
                UserProfile.objects.create(user=user, role=role)
                users.append(Token.objects.create(user=user).key)
            with patch('api.views.private_photos.get_private_photo_store', return_value=FixtureStorage()):
                for token, expected in ((None, 401), (users[0], 200), (users[1], 200), (users[2], 403)):
                    code, content, headers = http(token)
                    self.assertEqual(code, expected)
                    if code == 200:
                        self.assertEqual(content, PNG)
                        self.assertEqual(headers['Cache-Control'], 'private, no-store')
                    print(json.dumps({'local_private_photo_http': code, 'fixture_bytes_verified': code == 200}), flush=True)
                fixture.unlink()
                self.assertEqual(http(users[0])[0], 404)
            with override_settings(SANITATION_PRIVATE_PHOTOS={}):
                self.assertEqual(http(users[0])[0], 503)
            with patch('api.views.private_photos.get_private_photo_store', side_effect=PrivatePhotoUnavailable()):
                self.assertEqual(http(users[0])[0], 503)
            print('Local private-photo HTTP: missing=404, unconfigured=503, storage failure=503', flush=True)
