"""A destination photo reaches the client as a whole URL, even when the storage gave a bare path.

FileSystemStorage (the local disk) gives "/media/resorts/x.png"; S3 storage (live) gives a whole https URL. A bare path is useless to a
web page on another port or to a phone, so the API makes it whole from the request when it READS it. The database keeps what the storage
gave, so a destination does not carry the host it was saved from; a whole URL of this server's own media goes back to a path when it comes
back to be stored. A whole URL of any other host is never touched.
"""
import shutil
import tempfile

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_TOURISM, Resort, UserProfile
from .services.upload import absolute_media_url, relative_media_url
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables

PATH = "/media/resorts/43d9269e87cb4fa6810aa6e38b8961f0.png"
WHOLE = "http://testserver" + PATH
S3 = "https://abcd.supabase.co/storage/v1/object/public/media/resorts/aa11.png"


@override_settings(USE_SEED_DATA=False)
class DestinationPhotoUrlTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        user = User.objects.create_user(username="photo_tourism", password="Password@123", email="p@test.local")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.resort = make_resort(1, "Photo Beach", images=[PATH, S3])

    def stored(self):
        self.resort.refresh_from_db()
        return self.resort.images

    # -- reading ------------------------------------------------------------

    def test_a_bare_path_is_made_whole_and_a_whole_url_is_left_alone(self):
        images = self.client.get("/api/resorts/1/").json()["images"]
        self.assertEqual(images, [WHOLE, S3])

    def test_the_list_the_bootstrap_and_the_phone_answers_are_whole_too(self):
        self.assertEqual(self.client.get("/api/resorts/").json()[0]["images"], [WHOLE, S3])
        web = self.client.get("/api/bootstrap/").json()["referenceTables"]["resorts"][0]["images"]
        self.assertEqual(web, [WHOLE, S3])
        tables = self.client.get("/api/reference-tables/").json()["resorts"][0]["images"]
        self.assertEqual(tables, [WHOLE, S3])
        anonymous = APIClient()
        mobile = anonymous.get("/api/mobile/tourism/bootstrap/").json()
        self.assertEqual(mobile["destinations"][0]["images"], [WHOLE, S3])
        self.assertEqual(mobile["referenceTables"]["resorts"][0]["images"], [WHOLE, S3])
        self.assertEqual(anonymous.get("/api/mobile/tourism/destinations/").json()[0]["images"], [WHOLE, S3])
        self.assertEqual(anonymous.get("/api/mobile/tourism/destinations/1/").json()["destination"]["images"], [WHOLE, S3])

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_the_host_is_the_host_that_asks(self):
        answer = self.client.get("/api/resorts/1/", HTTP_HOST="192.168.1.9:8000").json()["images"]
        self.assertEqual(answer[0], "http://192.168.1.9:8000" + PATH)

    def test_nothing_that_is_not_a_path_is_changed(self):
        resort = make_resort(2, "Other Beach", images=["assets/destinations/x.jpg", "", "//cdn.example/x.png"])
        images = self.client.get(f"/api/resorts/{resort.resort_id}/").json()["images"]
        self.assertEqual(images, ["assets/destinations/x.jpg", "", "//cdn.example/x.png"])

    def test_a_destination_with_no_photos_has_an_empty_list(self):
        resort = make_resort(3, "Bare Beach")
        self.assertEqual(self.client.get(f"/api/resorts/{resort.resort_id}/").json()["images"], [])

    def test_the_database_is_not_touched_by_reading(self):
        self.client.get("/api/resorts/1/")
        self.assertEqual(self.stored(), [PATH, S3])

    # -- writing: the host does not get into the database -------------------

    def test_a_patch_that_sends_this_servers_whole_url_stores_the_path(self):
        response = self.client.patch("/api/resorts/1/", {"images": [WHOLE, S3]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.stored(), [PATH, S3])  # the host did not get in, the S3 URL is as it was
        self.assertEqual(response.json()["images"], [WHOLE, S3])

    def test_a_whole_url_of_another_host_is_stored_as_it_is(self):
        self.client.patch("/api/resorts/1/", {"images": [S3, "http://other.example/media/resorts/x.png"]}, format="json")
        self.assertEqual(self.stored(), [S3, "http://other.example/media/resorts/x.png"])

    def test_a_new_destination_with_a_whole_url_stores_the_path(self):
        data = {
            "resort_name": "New Photo Beach", "with_mayors_permit": True, "type": "Beach", "location": "Mauban",
            "short_description": "x", "access": "Boat", "latitude": 14.1, "longitude": 121.7, "itinerary_ids": [],
            "image_key": "", "images": [WHOLE],
        }
        response = self.client.post("/api/resorts/", data, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Resort.objects.get(resort_id=response.json()["resort_id"]).images, [PATH])
        self.assertEqual(response.json()["images"], [WHOLE])


class MediaUrlHelperTests(TestCase):
    def request(self, host="testserver"):
        from django.test import RequestFactory

        return RequestFactory().get("/", HTTP_HOST=host)

    def test_absolute(self):
        request = self.request()
        self.assertEqual(absolute_media_url(PATH, request), WHOLE)
        self.assertEqual(absolute_media_url(S3, request), S3)
        self.assertEqual(absolute_media_url("assets/x.jpg", request), "assets/x.jpg")
        self.assertEqual(absolute_media_url(PATH, None), PATH)  # no request: left as it is
        self.assertIsNone(absolute_media_url(None, request))

    def test_relative(self):
        request = self.request()
        self.assertEqual(relative_media_url(WHOLE, request), PATH)
        self.assertEqual(relative_media_url(S3, request), S3)
        self.assertEqual(relative_media_url(PATH, request), PATH)
        self.assertEqual(relative_media_url("http://testserver/other/x.png", request), "http://testserver/other/x.png")
        self.assertEqual(relative_media_url(WHOLE, None), WHOLE)


@override_settings(USE_SEED_DATA=False)
class UploadAnswerIsWholeTests(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        user = User.objects.create_user(username="photo_upload", password="Password@123", email="u@test.local")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")

    def test_the_upload_answers_with_a_whole_url(self):
        with override_settings(MEDIA_ROOT=self.media):
            image = SimpleUploadedFile("photo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, content_type="image/png")
            response = self.client.post("/api/resorts/upload-image/", {"image": image}, format="multipart")
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertTrue(body["url"].startswith("http://testserver/media/resorts/"), body)
        self.assertEqual(body["urls"], [body["url"]])
        self.assertTrue(body["url"].endswith(".png"))
