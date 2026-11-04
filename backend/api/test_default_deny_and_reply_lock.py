"""An account that has no profile has NO role, and no role reaches no module. It used to be made a member of the tourism staff on its first
request. The superuser alone stays the system admin.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ROLE_ADMIN, ROLE_TOURIST, ROLE_TOURISM, UserProfile
from .permissions import get_user_role
from .tests import ensure_test_reference_tables


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
    return client


@override_settings(USE_SEED_DATA=False)
class NoProfileMeansNoRoleTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()

    def test_an_account_with_no_profile_has_no_role(self):
        user = User.objects.create_user(username="no_profile", password="Password@123")

        self.assertFalse(UserProfile.objects.filter(user=user).exists())
        self.assertEqual(get_user_role(user), "")

    def test_it_is_403_on_a_tourism_endpoint_not_200(self):
        user = User.objects.create_user(username="no_profile", password="Password@123")

        for url in ("/api/dashboard/", "/api/reference-tables/", "/api/booking-management/", "/api/arrival-monitoring/", "/api/destination-figures/"):
            with self.subTest(url=url):
                self.assertEqual(client_for(user).get(url).status_code, 403)

    def test_it_is_403_on_the_administration_pages_and_the_activity_logs_too(self):
        user = User.objects.create_user(username="no_profile", password="Password@123")

        for url in ("/api/boat-capacity-fares/", "/api/emergency-contacts/", "/api/mobile-content/blocks/", "/api/reference-options/countries/", "/api/activity-logs/"):
            with self.subTest(url=url):
                self.assertEqual(client_for(user).get(url).status_code, 403)

    def test_it_is_403_on_the_sanitation_module_too(self):
        user = User.objects.create_user(username="no_profile", password="Password@123")

        self.assertEqual(client_for(user).get("/api/sanitation/bootstrap/").status_code, 403)

    def test_a_refused_request_creates_no_profile(self):
        user = User.objects.create_user(username="no_profile", password="Password@123")

        client_for(user).get("/api/dashboard/")

        self.assertFalse(UserProfile.objects.filter(user=user).exists())

    def test_the_login_gives_it_the_tourist_role_which_reaches_nothing(self):
        User.objects.create_user(username="no_profile", password="Password@123")

        response = APIClient().post("/api/auth/login/", {"username": "no_profile", "password": "Password@123"}, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(UserProfile.objects.get(user__username="no_profile").role, ROLE_TOURIST)
        token = response.json()["token"]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(client.get("/api/dashboard/").status_code, 403)

    def test_a_superuser_with_no_profile_is_still_the_system_admin(self):
        user = User.objects.create_superuser(username="root", password="Password@123", email="root@test.local")

        self.assertFalse(UserProfile.objects.filter(user=user).exists())
        self.assertEqual(get_user_role(user), ROLE_ADMIN)
        self.assertEqual(UserProfile.objects.get(user=user).role, ROLE_ADMIN)
        self.assertEqual(client_for(user).get("/api/dashboard/").status_code, 200)

    def test_an_account_that_has_a_profile_keeps_its_role(self):
        user = User.objects.create_user(username="staff", password="Password@123")
        UserProfile.objects.create(user=user, role=ROLE_TOURISM)

        self.assertEqual(get_user_role(user), ROLE_TOURISM)
        self.assertEqual(client_for(user).get("/api/dashboard/").status_code, 200)

    def test_nobody_logged_in_has_no_role(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertEqual(get_user_role(AnonymousUser()), "")
        self.assertEqual(get_user_role(None), "")
