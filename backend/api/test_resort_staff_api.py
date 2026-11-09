"""The accounts of a resort's staff: GET/POST resort-staff/ and PATCH resort-staff/<id>/. Never a delete.

Only the Tourism Office and the system admin; a resort's own staff cannot make a colleague. The password is kept hashed and is in no answer. A switched-off
account, and one whose password changed, loses its token. Passwords here are throw-away values of this file.
"""
import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_RESORT,
    ROLE_SANITATION,
    ROLE_TOURIST,
    ROLE_TOURISM,
    ActivityLog,
    Resort,
    TouristRecord,
    UserProfile,
)
from .test_destination_accuracy import arrive
from .test_destination_accuracy import make_resort as make_destination
from .test_resort_staff_role import client_of, make_user
from .tests import ensure_test_reference_tables

URL = "/api/resort-staff/"
GOOD = "Staff-pass-1"  # 8 or more
EXPECTED_KEYS = {
    "id", "username", "name", "resort", "is_active", "date_joined", "last_login", "created_by", "scan_count", "visitor_count", "scan_count_month",
    "visitor_count_month", "last_scan_at",
}


@override_settings(USE_SEED_DATA=False, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class Base(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.alpha = make_destination(1, "Cove Alpha")
        self.bravo = make_destination(2, "Cove Bravo")
        self.closed = make_destination(3, "Cove Closed", is_active=False)
        self.other = make_destination(4, "Others / Private Residence")
        self.kwebang = make_destination(5, "Kwebang Lampas")
        self.users = {
            "admin": make_user("boss", ROLE_ADMIN),
            "tourism": make_user("office", ROLE_TOURISM),
            "sanitation": make_user("inspector", ROLE_SANITATION),
            "resort": make_user("front.desk", ROLE_RESORT, resort=self.alpha),
            "establishment": make_user("owner", ROLE_ESTABLISHMENT),
            "tourist": make_user("visitor", ROLE_TOURIST),
        }

    def as_(self, who):
        return client_of(self.users[who])

    def post(self, who, **body):
        payload = {"resort_id": self.alpha.resort_id, "name": "Ana Reyes", "username": "ana.reyes", "password": GOOD, **body}
        return self.as_(who).post(URL, payload, format="json")

    def login(self, username, password):
        return APIClient().post("/api/auth/login/", {"username": username, "password": password}, format="json")

    def made(self, **body):
        response = self.post("tourism", **body)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()


class WhoMayTests(Base):
    def test_admin_and_tourism_may_do_all_three(self):
        for who in ("admin", "tourism"):
            self.assertEqual(self.as_(who).get(URL).status_code, 200, who)
        made = self.post("admin", username="by.admin")
        self.assertEqual(made.status_code, 201)
        made = self.post("tourism", username="by.tourism")
        self.assertEqual(made.status_code, 201)
        for who in ("admin", "tourism"):
            self.assertEqual(self.as_(who).patch(f"{URL}{made.json()['id']}/", {"is_active": True}, format="json").status_code, 200, who)

    def test_everybody_else_is_refused_in_all_three(self):
        target = self.users["resort"].pk
        before = User.objects.count()
        for who in ("sanitation", "resort", "establishment", "tourist"):
            self.assertEqual(self.as_(who).get(URL).status_code, 403, who)
            self.assertEqual(self.post(who, username=f"by.{who}").status_code, 403, who)
            self.assertEqual(self.as_(who).patch(f"{URL}{target}/", {"is_active": False}, format="json").status_code, 403, who)
        self.assertEqual(User.objects.count(), before, "nobody was made")
        self.assertTrue(User.objects.get(pk=target).is_active, "nobody was switched off")

    def test_a_resorts_own_staff_cannot_make_a_colleague(self):
        before = User.objects.count()
        response = self.post("resort", username="colleague.one")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="colleague.one").exists())
        self.assertEqual(User.objects.count(), before)
        # nor can they switch a colleague's account off, or change a password
        colleague = self.made(username="colleague.two")
        self.assertEqual(self.as_("resort").patch(f"{URL}{colleague['id']}/", {"password": "Another-pass-9"}, format="json").status_code, 403)

    def test_without_a_login_it_is_refused(self):
        client = APIClient()
        self.assertEqual(client.get(URL).status_code, 401)
        self.assertEqual(client.post(URL, {}, format="json").status_code, 401)
        self.assertEqual(client.patch(f"{URL}1/", {}, format="json").status_code, 401)


class MakingTests(Base):
    def test_the_account_is_a_resort_staff_of_the_right_resort_and_active(self):
        body = self.made(resort_id=self.bravo.resort_id, username="ben.cruz", name="Ben Cruz")
        user = User.objects.get(pk=body["id"])
        self.assertEqual(user.profile.role, ROLE_RESORT)
        self.assertEqual(user.profile.resort_id, self.bravo.resort_id)
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertEqual(user.first_name, "Ben Cruz")
        self.assertEqual(body["resort"], {"id": 2, "name": "Cove Bravo"})
        self.assertEqual(set(body), EXPECTED_KEYS)

    def test_the_password_is_kept_hashed_and_is_in_no_answer(self):
        body = self.made(username="hashed.one", password="Very-secret-77")
        user = User.objects.get(pk=body["id"])
        self.assertNotEqual(user.password, "Very-secret-77")
        self.assertTrue(user.password.startswith("md5$"), "stored through set_password, not as typed")
        self.assertTrue(user.check_password("Very-secret-77"))
        listed = self.as_("admin").get(URL)
        changed = self.as_("admin").patch(f"{URL}{body['id']}/", {"password": "Very-secret-88"}, format="json")
        for response in (body, listed.json(), changed.json()):
            text = json.dumps(response)
            self.assertNotIn("Very-secret", text)
            self.assertNotIn("password", text.lower())
            self.assertNotIn(user.password, text)

    def test_two_people_of_the_same_resort_each_have_their_own_account(self):
        self.made(username="ana.one")
        self.made(username="ana.two", name="Ana Two")
        self.assertEqual(UserProfile.objects.filter(resort=self.alpha, role=ROLE_RESORT).count(), 3)  # the two and the front desk of the fixture

    def test_the_making_is_in_the_activity_log_with_who_made_it(self):
        body = self.made(username="logged.one")
        log = ActivityLog.objects.filter(record_type="User", record_id=str(body["id"])).get()
        self.assertEqual((log.module, log.action), ("tourism", "create"))
        self.assertEqual(log.user_id, self.users["tourism"].pk)
        self.assertNotIn(GOOD, log.record_label)

    def test_every_rule_of_the_username(self):
        for bad in ("Ana.Reyes", "ana reyes", "ana_reyes", "ana!", "an", "", "   ", "a" * 151, "ana@x.com", "ána"):
            before = User.objects.count()
            response = self.post("tourism", username=bad)
            self.assertEqual(response.status_code, 400, repr(bad))
            self.assertEqual(response.json()["field"], "username", repr(bad))
            self.assertEqual(User.objects.count(), before, repr(bad))
        for good in ("abc", "ana.reyes", "front-desk.2", "a" * 150, "007"):
            self.assertEqual(self.post("tourism", username=good).status_code, 201, good)

    def test_a_username_that_is_the_same_in_another_case_is_refused(self):
        User.objects.create_user(username="Existing.User", password=GOOD)  # (made elsewhere, with a capital)
        response = self.post("tourism", username="existing.user")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "username")
        self.assertEqual(User.objects.filter(username__iexact="existing.user").count(), 1)
        self.made(username="fresh.one")
        self.assertEqual(self.post("tourism", username="fresh.one").status_code, 400)

    def test_the_username_of_any_existing_role_is_taken(self):
        self.assertEqual(self.post("tourism", username="boss").status_code, 400)

    def test_the_password_is_at_least_eight(self):
        self.assertEqual(self.post("tourism", username="p.seven", password="1234567").status_code, 400)
        self.assertEqual(self.post("tourism", username="p.empty", password="").status_code, 400)
        self.assertEqual(self.post("tourism", username="p.none", password=None).status_code, 400)
        self.assertEqual(self.post("tourism", username="p.number", password=12345678).status_code, 400)
        self.assertEqual(self.post("tourism", username="p.eight", password="12345678").status_code, 201)
        self.assertFalse(User.objects.filter(username__in=["p.seven", "p.empty", "p.none", "p.number"]).exists())

    def test_the_name_may_not_be_blank(self):
        for bad in ("", "   ", None):
            response = self.post("tourism", username="no.name", name=bad)
            self.assertEqual(response.status_code, 400, repr(bad))
            self.assertEqual(response.json()["field"], "name")
        self.assertFalse(User.objects.filter(username="no.name").exists())

    def test_the_resort_must_be_a_real_open_destination(self):
        for label, resort_id in (
            ("does not exist", 999),
            ("inactive", self.closed.resort_id),
            ("Others / Private Residence", self.other.resort_id),
            ("a Kwebang", self.kwebang.resort_id),
            ("missing", None),
            ("not a number", "abc"),
            ("empty", ""),
        ):
            before = User.objects.count()
            response = self.post("tourism", username="bad.resort", resort_id=resort_id)
            self.assertEqual(response.status_code, 400, label)
            self.assertEqual(response.json()["field"], "resort_id", label)
            self.assertEqual(User.objects.count(), before, label)

    def test_the_answer_of_making_is_the_same_shape_as_the_list(self):
        body = self.made(username="shape.one")
        listed = next(row for row in self.as_("admin").get(URL).json() if row["id"] == body["id"])
        self.assertEqual(listed["id"], body["id"])
        self.assertEqual(set(listed), set(body))
        self.assertEqual(body["scan_count"], 0)
        self.assertEqual(body["visitor_count"], 0)
        self.assertIsNone(body["last_scan_at"])
        self.assertIsNone(body["last_login"])
        self.assertEqual(body["created_by"], "office")


class ListTests(Base):
    def test_every_resort_account_is_listed_active_or_not_and_nothing_else(self):
        off = self.made(username="switched.off")
        self.as_("admin").patch(f"{URL}{off['id']}/", {"is_active": False}, format="json")
        rows = self.as_("tourism").get(URL).json()
        self.assertEqual({row["username"] for row in rows}, {"front.desk", "switched.off"})
        self.assertEqual({row["is_active"] for row in rows}, {True, False})
        self.assertTrue(all(set(row) == EXPECTED_KEYS for row in rows))

    def test_created_by_is_the_username_of_who_made_it_or_null(self):
        self.made(username="made.here")  # by "office"
        rows = {row["username"]: row for row in self.as_("admin").get(URL).json()}
        self.assertEqual(rows["made.here"]["created_by"], "office")
        self.assertIsNone(rows["front.desk"]["created_by"], "made some other way (the fixture): nobody is named")

    def test_last_login_is_null_until_the_person_signs_in_and_then_the_moment(self):
        self.made(username="signs.in", password="Signs-in-123")
        row = next(r for r in self.as_("admin").get(URL).json() if r["username"] == "signs.in")
        self.assertIsNone(row["last_login"])
        self.assertEqual(self.login("signs.in", "Signs-in-123").status_code, 200)
        row = next(r for r in self.as_("admin").get(URL).json() if r["username"] == "signs.in")
        self.assertIsNotNone(row["last_login"])

    def test_the_counts_of_what_each_one_received(self):
        ana = User.objects.get(pk=self.made(username="ana.counts")["id"])
        ben = User.objects.get(pk=self.made(username="ben.counts")["id"])
        now = timezone.now()
        last_month = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(minutes=5)
        plan = [("S-1", 4, ana, now - timedelta(minutes=1)), ("S-2", 6, ana, now - timedelta(minutes=2)), ("S-3", 10, ana, last_month), ("S-4", 3, ben, now)]
        for survey, people, who, when in plan:
            arrive(self.alpha, survey, people, status="arrived")
            TouristRecord.objects.filter(pk=survey).update(checked_in_by=who, checked_in_at=when)
        arrive(self.alpha, "S-5", 50)  # nobody received them: counts for no one
        rows = {row["username"]: row for row in self.as_("admin").get(URL).json()}
        a, b = rows["ana.counts"], rows["ben.counts"]
        self.assertEqual((a["scan_count"], a["visitor_count"]), (3, 20))
        self.assertEqual((a["scan_count_month"], a["visitor_count_month"]), (2, 10), "last month is not in this month")
        self.assertEqual((b["scan_count"], b["visitor_count"], b["scan_count_month"], b["visitor_count_month"]), (1, 3, 1, 3))
        self.assertIsNotNone(a["last_scan_at"])
        from django.utils.dateparse import parse_datetime

        self.assertLess(abs(parse_datetime(a["last_scan_at"]) - (now - timedelta(minutes=1))), timedelta(seconds=2), "the latest of the three")
        self.assertEqual(rows["front.desk"]["scan_count"], 0)
        self.assertEqual(rows["front.desk"]["visitor_count"], 0)
        self.assertIsNone(rows["front.desk"]["last_scan_at"])

    def test_the_counts_do_not_grow_with_the_number_of_accounts(self):
        def queries():
            client = self.as_("admin")
            with CaptureQueriesContext(connection) as captured:
                self.assertEqual(client.get(URL).status_code, 200)
            return len(captured)

        for n in range(2):
            self.made(username=f"few.{n}")
        few = queries()
        for n in range(12):
            user = User.objects.get(pk=self.made(username=f"many.{n}")["id"])
            arrive(self.alpha, f"M-{n}", 2)
            TouristRecord.objects.filter(pk=f"M-{n}").update(checked_in_by=user, checked_in_at=timezone.now())
        self.assertEqual(queries(), few, "the same number of queries with 14 more accounts and their records")


class SwitchingTests(Base):
    def setUp(self):
        super().setUp()
        self.body = self.made(username="switch.me", password="Switch-me-123")
        self.id = self.body["id"]
        self.old_token = self.login("switch.me", "Switch-me-123").json()["token"]

    def with_token(self, token):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        return client

    def patch(self, **body):
        return self.as_("admin").patch(f"{URL}{self.id}/", body, format="json")

    def test_the_token_works_before(self):
        self.assertEqual(self.with_token(self.old_token).get("/api/auth/me/").status_code, 200)

    def test_switching_off_takes_the_token_and_the_old_token_is_refused(self):
        response = self.patch(is_active=False)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])
        self.assertFalse(Token.objects.filter(key=self.old_token).exists())
        self.assertEqual(self.with_token(self.old_token).get("/api/auth/me/").status_code, 401)

    def test_a_switched_off_account_cannot_sign_in_and_one_brought_back_can(self):
        self.patch(is_active=False)
        self.assertEqual(self.login("switch.me", "Switch-me-123").status_code, 401)
        response = self.patch(is_active=True)
        self.assertTrue(response.json()["is_active"])
        again = self.login("switch.me", "Switch-me-123")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(self.with_token(again.json()["token"]).get("/api/auth/me/").status_code, 200)

    def test_changing_the_password_takes_the_token_and_the_new_password_is_the_one(self):
        response = self.patch(password="Brand-new-pass-5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.with_token(self.old_token).get("/api/auth/me/").status_code, 401)
        self.assertEqual(self.login("switch.me", "Switch-me-123").status_code, 401, "the old password no longer works")
        self.assertEqual(self.login("switch.me", "Brand-new-pass-5").status_code, 200)
        self.assertNotIn("Brand-new", json.dumps(response.json()))

    def test_both_at_once(self):
        response = self.patch(is_active=False, password="Both-at-once-5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.with_token(self.old_token).get("/api/auth/me/").status_code, 401)
        self.assertEqual(self.login("switch.me", "Both-at-once-5").status_code, 401, "still switched off")

    def test_a_short_password_changes_nothing_and_keeps_the_token(self):
        for bad in ("1234567", "", None, 12345678):
            self.assertEqual(self.patch(password=bad).status_code, 400, repr(bad))
        self.assertEqual(self.with_token(self.old_token).get("/api/auth/me/").status_code, 200)
        self.assertEqual(self.login("switch.me", "Switch-me-123").status_code, 200)

    def test_nothing_to_change_is_a_400_and_keeps_the_token(self):
        self.assertEqual(self.patch().status_code, 400)
        self.assertEqual(self.patch(name="Someone Else", username="someone.else").status_code, 400)
        self.assertEqual(self.with_token(self.old_token).get("/api/auth/me/").status_code, 200)
        user = User.objects.get(pk=self.id)
        self.assertEqual((user.username, user.first_name), ("switch.me", "Ana Reyes"))

    def test_the_text_true_and_false_are_understood(self):
        self.assertFalse(self.patch(is_active="false").json()["is_active"])
        self.assertTrue(self.patch(is_active="true").json()["is_active"])

    def test_each_change_is_in_the_activity_log(self):
        self.patch(is_active=False)
        self.patch(password="Logged-pass-123")
        labels = list(ActivityLog.objects.filter(record_type="User", record_id=str(self.id), action="update").values_list("record_label", flat=True))
        self.assertEqual(len(labels), 2)
        self.assertTrue(any("Deactivated" in label for label in labels))
        self.assertTrue(any("Password changed" in label for label in labels))
        self.assertFalse(any("Logged-pass" in label for label in labels), "no password in the log")
        self.assertEqual(ActivityLog.objects.filter(record_id=str(self.id), action="update").first().user_id, self.users["admin"].pk)

    def test_an_account_that_is_not_a_resort_staff_is_a_404_and_is_not_touched(self):
        for who in ("tourism", "admin", "sanitation", "establishment", "tourist"):
            user = self.users[who]
            token = Token.objects.get_or_create(user=user)[0].key
            response = self.as_("admin").patch(f"{URL}{user.pk}/", {"is_active": False, "password": "Hijack-pass-123"}, format="json")
            self.assertEqual(response.status_code, 404, who)
            user.refresh_from_db()
            self.assertTrue(user.is_active, who)
            self.assertFalse(user.check_password("Hijack-pass-123"), who)
            self.assertTrue(Token.objects.filter(key=token).exists(), who)
        self.assertEqual(self.as_("admin").patch(f"{URL}99999/", {"is_active": False}, format="json").status_code, 404)


class NoDeleteTests(Base):
    def test_nothing_deletes(self):
        target = self.users["resort"].pk
        for who in ("admin", "tourism"):
            client = self.as_(who)
            self.assertEqual(client.delete(URL).status_code, 405, who)
            self.assertEqual(client.delete(f"{URL}{target}/").status_code, 405, who)
            self.assertEqual(client.put(f"{URL}{target}/", {"is_active": False}, format="json").status_code, 405, who)
            self.assertEqual(client.get(f"{URL}{target}/").status_code, 405, who)
            self.assertEqual(client.post(f"{URL}{target}/", {}, format="json").status_code, 405, who)
        self.assertTrue(User.objects.filter(pk=target).exists())
        self.assertTrue(UserProfile.objects.filter(user_id=target, role=ROLE_RESORT).exists())
