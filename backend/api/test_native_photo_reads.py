"""Fake native transport and real loopback HTTP; no provider operations."""
import io
from unittest.mock import Mock, patch
from django.test import SimpleTestCase, LiveServerTestCase, override_settings
from api import test_photo_source_reads as fixtures
from api import test_native_private_photos as adapter_fixtures
from api.models import NativePhotoAttempt
from api.services.native_private_photos import NativeCreateOnlyStore
from api.services.private_photos import PrivatePhotoMissing, PrivatePhotoUnavailable, MAX_BYTES

@override_settings(SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT=True)
class NativeReadHTTPTests(LiveServerTestCase):
    host = '127.0.0.1'
    allow_loopback_http = True
    user = fixtures.PhotoSourceHTTPTests.user
    request = fixtures.PhotoSourceHTTPTests.request
    url = fixtures.PhotoSourceHTTPTests.url
    setUp = fixtures.PhotoSourceHTTPTests.setUp

    def native_link(self, kind, owner):
        key = kind.new_key(owner.pk, 'png')
        attempt = NativePhotoAttempt.objects.create(owner_kind=kind.owner_field, owner_record_id=owner.pk,
            object_key=key, project_ref=self.native.project_ref, bucket=self.native.bucket, state='LINKED')
        return kind.photo_model.objects.create(**{kind.owner_field+'_id':owner.pk}, object_key=key,
            storage_provider='NATIVE', native_attempt=attempt)

    def verify_read(self, kind, owner):
        photo = self.native_link(kind, owner)
        before = kind.owner_model.objects.values().get(pk=owner.pk)
        with patch('api.services.native_private_photos.get_native_create_only_store', return_value=self.native), \
             patch.object(self.native, 'read', create=True, return_value=fixtures.image_bytes()) as read, \
             patch.object(self.legacy, 'read') as s3:
            result = self.request(self.url(kind,owner), token=self.token)
            print('NATIVE_READ_HTTP',kind.owner_field,result[0],result[2]==fixtures.image_bytes(),flush=True)
            self.assertEqual(result[0],200)
            self.assertEqual(result[2],fixtures.image_bytes())
            self.assertEqual(result[1]['Cache-Control'],'private, no-store')
            self.assertEqual(result[1]['X-Content-Type-Options'],'nosniff')
            self.assertEqual(result[1]['Cross-Origin-Resource-Policy'],'same-origin')
            read.assert_called_once_with(photo.object_key)
            s3.assert_not_called()
        self.assertEqual(kind.owner_model.objects.values().get(pk=owner.pk),before)
        self.assertEqual(self.native.deletes,[])

    def test_household_authenticated_read(self): self.verify_read(*self.cases[0])
    def test_establishment_authenticated_read(self): self.verify_read(*self.cases[1])

    def test_authorization_disabled_and_wrong_targets(self):
        for kind,owner in self.cases:
            photo=self.native_link(kind,owner)
            with patch('api.services.native_private_photos.get_native_create_only_store',return_value=self.native), \
                 patch.object(self.native,'read',create=True) as read, patch.object(self.legacy,'read') as s3:
                url=self.url(kind,owner)
                self.assertEqual(self.request(url)[0],401)
                tourist=self.user('denied-native-'+kind.owner_field,'tourism')
                from rest_framework.authtoken.models import Token
                token=Token.objects.create(user=tourist).key
                self.assertEqual(self.request(url,token=token)[0],403)
                self.assertEqual(self.request(url+'?key=other',token=self.token)[0],400)
                with override_settings(SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT=False), \
                     patch('api.services.native_private_photos.get_native_create_only_store') as disabled_factory:
                    self.assertEqual(self.request(url,token=self.token)[0],503)
                    disabled_factory.assert_not_called()
                for field,value in (('project_ref','b'*20),('bucket','other-private'),('state','AMBIGUOUS'),('object_key',kind.new_key(owner.pk,'png'))):
                    row=photo.native_attempt
                    old=getattr(row,field)
                    setattr(row,field,value); row.save()
                    self.assertEqual(self.request(url,token=self.token)[0],503)
                    setattr(row,field,old); row.save()
                read.assert_not_called(); s3.assert_not_called()

    def test_missing_and_transport_failure_private_responses(self):
        for kind,owner in self.cases:
            self.native_link(kind,owner)
            for error,code in ((PrivatePhotoMissing(),404),(PrivatePhotoUnavailable(),503)):
                with patch('api.services.native_private_photos.get_native_create_only_store',return_value=self.native), \
                     patch.object(self.native,'read',create=True,side_effect=error):
                    result=self.request(self.url(kind,owner),token=self.token)
                    self.assertEqual(result[0],code)
                    self.assertNotIn(b'supabase',result[2]); self.assertNotIn(b'sb_secret',result[2])
                    self.assertEqual(result[1]['Cache-Control'],'private, no-store')

class NativeReadAdapterTests(SimpleTestCase):
    def setUp(self):
        self.store=NativeCreateOnlyStore(adapter_fixtures.options())
        self.opener=Mock()
        mocked=patch('api.services.native_private_photos.urllib.request.build_opener',return_value=self.opener)
        mocked.start(); self.addCleanup(mocked.stop)

    def response(self,status=200,data=None,mime='image/png',length=None):
        response=Mock()
        response.__enter__=Mock(return_value=response); response.__exit__=Mock(return_value=False)
        response.code=status
        data=fixtures.image_bytes() if data is None else data
        response.headers={'Content-Type':mime,'Content-Length':str(len(data) if length is None else length)}
        response.read.return_value=data
        self.opener.open.return_value=response
        return response

    def test_wire_contract_exact_bytes_and_bounded_body(self):
        response=self.response()
        self.assertEqual(self.store.read(adapter_fixtures.KEY),fixtures.image_bytes())
        request=self.opener.open.call_args.args[0]
        self.assertEqual(request.method,'GET')
        self.assertEqual(request.full_url,adapter_fixtures.ENDPOINT+'/storage/v1/object/authenticated/'+adapter_fixtures.BUCKET+'/'+adapter_fixtures.KEY)
        self.assertEqual(request.get_header('Apikey'),adapter_fixtures.SECRET)
        self.assertIsNone(request.get_header('Authorization'))
        response.read.assert_called_once_with(MAX_BYTES+1)

    def test_bad_responses_fail_closed(self):
        for status,data,mime,length in ((302,b'x','image/png',1),(403,b'x','image/png',1),
            (500,b'x','image/png',1),(206,b'x','image/png',1),(200,b'x','text/html',1),
            (200,b'x','image/png',1),(200,fixtures.image_bytes(),'image/jpeg',None),
            (200,b'x'*(MAX_BYTES+1),'image/png',MAX_BYTES+1),
            (200,fixtures.image_bytes(),'image/png',1)):
            with self.subTest(status=status,mime=mime):
                self.response(status,data,mime,length)
                with self.assertRaises(PrivatePhotoUnavailable): self.store.read(adapter_fixtures.KEY)
        self.response(404,b'not found')
        with self.assertRaises(PrivatePhotoMissing): self.store.read(adapter_fixtures.KEY)

    def test_redirect_and_exception_never_expose_detail(self):
        from api.services.native_private_photos import NativeRedirectRefused
        for error in (NativeRedirectRefused(),OSError(adapter_fixtures.SECRET)):
            self.opener.open.side_effect=error
            with self.assertRaises(PrivatePhotoUnavailable) as caught: self.store.read(adapter_fixtures.KEY)
            self.assertNotIn(adapter_fixtures.SECRET,str(caught.exception))

    def test_invalid_key_never_reaches_transport(self):
        from api.services.private_photos import InvalidPrivatePhotoKey
        with self.assertRaises(InvalidPrivatePhotoKey): self.store.read('../other')
        self.opener.open.assert_not_called()
