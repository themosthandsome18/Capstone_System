"""GET /api/activity-logs/ is for staff only.

The tourism and sanitation staff read their own module's logs, the system admin reads all of them, and every other role (the tourist, the
establishment owner, one that does not exist yet) is refused with nothing of the logs in the answer. The page is shared by the two modules.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ACTION_CREATE,
    MODULE_SANITATION,
    MODULE_TOURISM,
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_SANITATION,
    ROLE_TOURIST,
    ROLE_TOURISM,
    ActivityLog,
    UserProfile,
)

URL = "/api/activity-logs/"


class ActivityLogPermissionTests(TestCase):
    def setUp(self):
        self.clients = {}
        for role in (ROLE_ADMIN, ROLE_TOURISM, ROLE_SANITATION, ROLE_TOURIST, ROLE_ESTABLISHMENT, "auditor"):
            user = User.objects.create_user(username=f"log_{role}", password="Password@123", email=f"{role}@test.local")
            UserProfile.objects.create(user=user, role=role)
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
            self.clients[role] = client
        staff = User.objects.get(username="log_admin")
        for i in range(3):
            ActivityLog.objects.create(user=staff, module=MODULE_TOURISM, action=ACTION_CREATE, record_type="Resort", record_id=str(i), record_label=f"Tourism log {i}")
        for i in range(2):
            ActivityLog.objects.create(user=staff, module=MODULE_SANITATION, action=ACTION_CREATE, record_type="Household", record_id=str(i), record_label=f"Sanitation log {i}")

    def labels(self, response):
        return sorted(row["record_label"] for row in response.json())

    # -- refused -----------------------------------------------------------

    def test_a_tourist_is_403_and_nothing_of_the_logs_is_in_the_answer(self):
        response = self.clients[ROLE_TOURIST].get(URL)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(set(response.json()), {"detail"})
        self.assertNotIn("Tourism log", response.content.decode())
        self.assertNotIn("Sanitation log", response.content.decode())
        self.assertNotIn("log_admin", response.content.decode())  # no username of the staff either

    def test_a_tourist_is_refused_whatever_is_asked_for(self):
        for query in ("?module=tourism", "?module=sanitation", "?action=create", "?limit=250", "?module=tourism&action=create&limit=1"):
            with self.subTest(query=query):
                response = self.clients[ROLE_TOURIST].get(URL + query)
                self.assertEqual(response.status_code, 403)
                self.assertNotIn("record_label", response.content.decode())

    def test_the_establishment_owner_is_403_too(self):
        response = self.clients[ROLE_ESTABLISHMENT].get(URL)

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("record_label", response.content.decode())

    def test_a_role_that_does_not_exist_yet_is_403(self):
        response = self.clients["auditor"].get(URL)

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("record_label", response.content.decode())

    def test_without_a_token_it_is_401(self):
        response = APIClient().get(URL)

        self.assertEqual(response.status_code, 401)
        self.assertNotIn("record_label", response.content.decode())

    def test_a_bad_token_is_401(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Token not-a-real-key")

        self.assertEqual(client.get(URL).status_code, 401)

    # -- let in, as before -----------------------------------------------------

    def test_tourism_staff_read_the_tourism_logs_only(self):
        response = self.clients[ROLE_TOURISM].get(URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.labels(response), ["Tourism log 0", "Tourism log 1", "Tourism log 2"])
        self.assertEqual({row["module"] for row in response.json()}, {MODULE_TOURISM})

    def test_tourism_staff_cannot_ask_for_the_sanitation_logs(self):
        response = self.clients[ROLE_TOURISM].get(URL + "?module=sanitation")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_sanitation_staff_read_the_sanitation_logs_only(self):
        response = self.clients[ROLE_SANITATION].get(URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.labels(response), ["Sanitation log 0", "Sanitation log 1"])
        self.assertEqual({row["module"] for row in response.json()}, {MODULE_SANITATION})

    def test_sanitation_staff_cannot_ask_for_the_tourism_logs(self):
        response = self.clients[ROLE_SANITATION].get(URL + "?module=tourism")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_the_admin_reads_all_of_them_and_may_pick_a_module(self):
        everything = self.clients[ROLE_ADMIN].get(URL)
        sanitation = self.clients[ROLE_ADMIN].get(URL + "?module=sanitation")

        self.assertEqual(everything.status_code, 200)
        self.assertEqual(len(everything.json()), 5)
        self.assertEqual({row["module"] for row in everything.json()}, {MODULE_TOURISM, MODULE_SANITATION})
        self.assertEqual(len(sanitation.json()), 2)

    def test_the_filters_still_work_for_staff(self):
        response = self.clients[ROLE_TOURISM].get(URL + "?action=create&limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 2)

    def test_what_staff_get_is_the_same_shape_as_before(self):
        row = self.clients[ROLE_TOURISM].get(URL).json()[0]

        self.assertEqual(
            set(row),
            {"id", "username", "user_display", "module", "module_label", "action", "action_label", "record_type", "record_id", "record_label", "created_at"},
        )
