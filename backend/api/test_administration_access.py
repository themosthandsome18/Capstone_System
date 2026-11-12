"""Who may use the tourism Administration pages: Settings (the theme), Registration Options (with Boat Capacity and Fare) and Mobile App
Content (with the Emergency Hotlines).

The Tourism Office (role "tourism", the account tourism_admin) and the system admin may. The tourist, the sanitation staff, the
establishment owner and any role that does not exist yet may not, and are refused by the endpoint itself, not only hidden in the sidebar.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import get_resolver
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_SANITATION,
    ROLE_TOURIST,
    ROLE_TOURISM,
    Resort,
    TouristRecord,
    UserProfile,
)
from .permissions import ADMINISTRATION_ROLES
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

# Every endpoint of the three pages, with a method the endpoint takes. An empty body is enough: the question is whether the role is let in
# (anything but 403), not whether the request is good.
ENDPOINTS = [
    ("put", "/api/tourism-theme/"),
    ("get", "/api/reference-options/countries/"),
    ("patch", "/api/reference-options/countries/1/"),
    ("post", "/api/reference-options/countries/1/deactivate/"),
    ("post", "/api/reference-options/countries/1/reactivate/"),
    ("get", "/api/boat-capacity-fares/"),
    ("post", "/api/boat-capacity-fares/reorder/"),
    ("patch", "/api/boat-capacity-fares/1/"),
    ("post", "/api/boat-capacity-fares/1/deactivate/"),
    ("post", "/api/boat-capacity-fares/1/reactivate/"),
    ("get", "/api/emergency-contacts/"),
    ("post", "/api/emergency-contacts/reorder/"),
    ("patch", "/api/emergency-contacts/1/"),
    ("post", "/api/emergency-contacts/1/deactivate/"),
    ("post", "/api/emergency-contacts/1/reactivate/"),
    ("get", "/api/mobile-content/blocks/"),
    ("patch", "/api/mobile-content/blocks/welcome/"),
    ("get", "/api/mobile-content/items/"),
    ("patch", "/api/mobile-content/items/1/"),
    ("post", "/api/mobile-content/items/1/deactivate/"),
    ("post", "/api/mobile-content/items/1/reactivate/"),
]

# The first part of the address of each page's endpoints, to find any endpoint of the three that the list above forgot.
PREFIXES = ("tourism-theme", "reference-options", "boat-capacity-fares", "emergency-contacts", "mobile-content")

IN = (ROLE_ADMIN, ROLE_TOURISM)
OUT = (ROLE_TOURIST, ROLE_SANITATION, ROLE_ESTABLISHMENT, "auditor")  # "auditor" is a role nobody has defined


@override_settings(USE_SEED_DATA=False)
class AdministrationAccessTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        self.clients = {}
        for role in IN + OUT:
            user = User.objects.create_user(username=f"adm_{role}", password="Password@123", email=f"{role}@test.local")
            UserProfile.objects.create(user=user, role=role)
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
            self.clients[role] = client

    def call(self, role, method, url):
        return getattr(self.clients[role], method)(url, {}, format="json")

    def test_the_tourism_office_and_the_system_admin_are_let_in_to_every_endpoint(self):
        for role in IN:
            for method, url in ENDPOINTS:
                with self.subTest(role=role, endpoint=f"{method.upper()} {url}"):
                    self.assertNotEqual(self.call(role, method, url).status_code, 403)

    def test_everyone_else_is_refused_by_every_endpoint(self):
        for role in OUT:
            for method, url in ENDPOINTS:
                with self.subTest(role=role, endpoint=f"{method.upper()} {url}"):
                    self.assertEqual(self.call(role, method, url).status_code, 403)

    def test_a_visitor_without_a_login_is_refused_by_every_endpoint(self):
        for method, url in ENDPOINTS:
            with self.subTest(endpoint=f"{method.upper()} {url}"):
                self.assertIn(getattr(APIClient(), method)(url, {}, format="json").status_code, (401, 403))

    def test_the_default_is_refusal_so_a_role_that_is_not_named_is_out(self):
        self.assertEqual(ADMINISTRATION_ROLES, {ROLE_ADMIN, ROLE_TOURISM})
        for role in OUT:
            self.assertNotIn(role, ADMINISTRATION_ROLES)
        # and the unknown role really reached the endpoints above as a logged-in user with a profile, so it was refused for its role
        self.assertEqual(UserProfile.objects.get(user__username="adm_auditor").role, "auditor")

    def test_the_list_above_has_every_endpoint_of_the_three_pages(self):
        found = set()

        def walk(patterns, prefix=""):
            for pattern in patterns:
                route = prefix + str(pattern.pattern)
                if hasattr(pattern, "url_patterns"):
                    walk(pattern.url_patterns, route)
                elif any(route.startswith("api/" + p) for p in PREFIXES):
                    found.add(route)

        walk(get_resolver().url_patterns)
        self.assertTrue(found)

        listed = {url.strip("/").replace("1", "<id>") for _method, url in ENDPOINTS}
        for route in found:
            shape = route.strip("/")
            for converter in ("<int:fare_id>", "<int:contact_id>", "<int:item_id>", "<int:option_id>"):
                shape = shape.replace(converter, "<id>")
            shape = shape.replace("<str:kind>", "countries").replace("<str:key>", "welcome")
            with self.subTest(route=route):
                self.assertIn(shape, listed)

    def test_what_was_not_opened_is_still_the_system_admin_s_alone(self):
        # only the administration pages are opened to the Tourism Office: the import of online bookings is not. (A record is deleted by nobody
        # now: DELETE is refused for the admin as for the Tourism Office, and the record stays. See test_record_archive.py.)
        tourism = self.clients[ROLE_TOURISM]
        self.assertEqual(tourism.post("/api/online-booking-import/", {}, format="multipart").status_code, 403)

        Resort.objects.all().delete()
        arrive(make_resort(1, "Delete Resort"), "ADM-1", 2)
        self.assertEqual(tourism.delete("/api/tourist-records/ADM-1/").status_code, 405)
        self.assertEqual(self.clients[ROLE_ADMIN].delete("/api/tourist-records/ADM-1/").status_code, 405)
        self.assertTrue(TouristRecord.objects.filter(pk="ADM-1").exists())
