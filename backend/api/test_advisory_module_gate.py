"""Who may write an advisory of which module (notifications/public/).

    admin      -> tourism, sanitation, general
    tourism    -> tourism only
    sanitation -> sanitation only

"general" is the admin's alone: it is sent to the users of BOTH apps, so an office that could write it could reach the other office's users.
Reading (GET) and the bootstrap are not touched by this.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    NOTIFICATION_AUDIENCE_PUBLIC,
    NOTIFICATION_TYPE_PUBLIC_ADVISORY,
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_SANITATION,
    ROLE_TOURISM,
    Notification,
    UserProfile,
)

URL = "/api/notifications/public/"
MODULES = ["tourism", "sanitation", "general"]
ALLOWED = {
    ROLE_ADMIN: {"tourism", "sanitation", "general"},
    ROLE_TOURISM: {"tourism"},
    ROLE_SANITATION: {"sanitation"},
}


class AdvisoryModuleGateTests(TestCase):
    def setUp(self):
        self.tokens = {}
        for role in (ROLE_ADMIN, ROLE_TOURISM, ROLE_SANITATION, ROLE_ESTABLISHMENT):
            user = User.objects.create_user(username=f"gate_{role}", password="Password@123", email=f"gate_{role}@test.local")
            UserProfile.objects.create(user=user, role=role)
            self.tokens[role] = Token.objects.create(user=user).key

    def as_role(self, role):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {self.tokens[role]}")
        return client

    def advisory(self, module, title=None):
        return Notification.objects.create(
            title=title or f"A {module} advisory", message="m", notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY, severity="info",
            module=module, audience_type=NOTIFICATION_AUDIENCE_PUBLIC, is_active=True,
        )

    def post(self, role, module):
        return self.as_role(role).post(URL, {"title": f"{role} writes {module}", "message": "m", "module": module}, format="json")

    # ---- POST: which module each role may create ----
    def test_post_the_whole_matrix(self):
        for role, allowed in ALLOWED.items():
            for module in MODULES:
                with self.subTest(role=role, module=module):
                    before = Notification.objects.count()
                    response = self.post(role, module)
                    if module in allowed:
                        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                        self.assertEqual(response.data["module"], module)
                        self.assertEqual(Notification.objects.count(), before + 1)
                    else:
                        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                        self.assertEqual(Notification.objects.count(), before, "nothing was written")

    def test_tourism_cannot_create_a_general_advisory(self):
        response = self.post(ROLE_TOURISM, "general")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Notification.objects.filter(module="general").exists())

    def test_sanitation_cannot_create_a_general_or_tourism_advisory(self):
        for module in ("general", "tourism"):
            self.assertEqual(self.post(ROLE_SANITATION, module).status_code, status.HTTP_403_FORBIDDEN, module)
        self.assertEqual(Notification.objects.count(), 0)

    def test_the_admin_may_write_every_module(self):
        for module in MODULES:
            self.assertEqual(self.post(ROLE_ADMIN, module).status_code, status.HTTP_201_CREATED, module)

    def test_an_establishment_still_cannot_write_at_all(self):
        for module in MODULES:
            self.assertEqual(self.post(ROLE_ESTABLISHMENT, module).status_code, status.HTTP_403_FORBIDDEN, module)

    def test_without_a_login_it_is_still_401(self):
        response = APIClient().post(URL, {"title": "t", "message": "m", "module": "tourism"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_a_module_that_does_not_exist_is_still_a_400_not_a_403(self):
        response = self.post(ROLE_TOURISM, "nonsense")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_default_severity_still_applies(self):
        response = self.as_role(ROLE_TOURISM).post(URL, {"title": "t", "message": "m", "module": "tourism"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["severity"], "info")

    # ---- PATCH: the advisory of another module is not there for you ----
    def patch(self, role, advisory, body):
        return self.as_role(role).patch(f"{URL}{advisory.pk}/", body, format="json")

    def test_patch_the_whole_matrix_of_the_advisory_s_current_module(self):
        for role, allowed in ALLOWED.items():
            for module in MODULES:
                with self.subTest(role=role, module=module):
                    advisory = self.advisory(module)
                    response = self.patch(role, advisory, {"title": "Edited"})
                    advisory.refresh_from_db()
                    if module in allowed:
                        self.assertEqual(response.status_code, status.HTTP_200_OK)
                        self.assertEqual(advisory.title, "Edited")
                    else:
                        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
                        self.assertNotEqual(advisory.title, "Edited", "not edited")

    def test_the_404_is_the_same_answer_as_for_an_advisory_that_does_not_exist(self):
        other = self.advisory("sanitation")
        real = self.patch(ROLE_TOURISM, other, {"title": "x"})
        missing = self.as_role(ROLE_TOURISM).patch(f"{URL}999999/", {"title": "x"}, format="json")
        self.assertEqual((real.status_code, real.data), (missing.status_code, missing.data), "an office cannot tell that the other has one")

    def test_tourism_cannot_edit_a_general_advisory_either(self):
        advisory = self.advisory("general")
        self.assertEqual(self.patch(ROLE_TOURISM, advisory, {"title": "x"}).status_code, status.HTTP_404_NOT_FOUND)

    # ---- PATCH: moving an advisory to a module that is not yours ----
    def test_patch_the_whole_matrix_of_moving_to_another_module(self):
        for role, allowed in ALLOWED.items():
            for start in sorted(allowed):
                for target in MODULES:
                    with self.subTest(role=role, start=start, target=target):
                        advisory = self.advisory(start)
                        response = self.patch(role, advisory, {"module": target})
                        advisory.refresh_from_db()
                        if target in allowed:
                            self.assertEqual(response.status_code, status.HTTP_200_OK)
                            self.assertEqual(advisory.module, target)
                        else:
                            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                            self.assertEqual(advisory.module, start, "it did not move")

    def test_tourism_cannot_turn_its_advisory_into_a_general_one(self):
        advisory = self.advisory("tourism")
        response = self.patch(ROLE_TOURISM, advisory, {"module": "general"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        advisory.refresh_from_db()
        self.assertEqual(advisory.module, "tourism")

    def test_a_patch_that_names_its_own_module_is_fine(self):
        advisory = self.advisory("tourism")
        self.assertEqual(self.patch(ROLE_TOURISM, advisory, {"module": "tourism", "title": "Same"}).status_code, status.HTTP_200_OK)

    def test_deactivating_and_expiring_own_advisory_still_works(self):
        advisory = self.advisory("sanitation")
        response = self.patch(ROLE_SANITATION, advisory, {"is_active": False})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        advisory.refresh_from_db()
        self.assertFalse(advisory.is_active)

    # ---- the messages say nothing of the inside ----
    def test_the_messages_name_no_field_and_no_role(self):
        refusals = [
            self.post(ROLE_TOURISM, "sanitation"),
            self.patch(ROLE_TOURISM, self.advisory("tourism"), {"module": "sanitation"}),
            self.patch(ROLE_TOURISM, self.advisory("sanitation"), {"title": "x"}),
        ]
        for response in refusals:
            text = str(response.data.get("detail", "")).lower()
            self.assertTrue(text, "there is a message")
            for word in ("module", "role", "admin", "tourism", "sanitation", "profile", "permission_classes", "audience"):
                self.assertNotIn(word, text, f"{word!r} in {text!r}")

    # ---- reading is as it was ----
    def test_staff_still_read_every_advisory_and_the_public_only_the_active_ones(self):
        self.advisory("tourism", "T")
        self.advisory("sanitation", "S")
        self.advisory("general", "G")
        inactive = self.advisory("sanitation", "Hidden")
        inactive.is_active = False
        inactive.save()
        for role in (ROLE_ADMIN, ROLE_TOURISM, ROLE_SANITATION):
            titles = {item["title"] for item in self.as_role(role).get(URL).json()["results"]}
            self.assertEqual(titles, {"T", "S", "G", "Hidden"}, role)
        public = {item["title"] for item in APIClient().get(URL).json()["results"]}
        self.assertEqual(public, {"T", "S", "G"})
