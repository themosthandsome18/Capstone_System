"""The role of the staff of a resort: ROLE_RESORT ("resort"), and UserProfile.resort.

The new role reaches NO module and none of the Administration pages: it is in neither MODULE_ROLES nor ADMINISTRATION_ROLES. It can log in and
get a token (the scanner is the only thing it will open, and that comes later). The default role of a profile is now the tourist, not the
Tourism Office. Logging in records last_login, for every role.
"""
from django.contrib.auth.models import User
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ROLE_ADMIN,
    ROLE_ESTABLISHMENT,
    ROLE_RESORT,
    ROLE_SANITATION,
    ROLE_TOURIST,
    ROLE_TOURISM,
    USER_ROLE_CHOICES,
    Resort,
    UserProfile,
)
from .permissions import ADMINISTRATION_ROLES, MODULE_ROLES, get_user_role, has_module_access

PASSWORD = "Resort-Test-9"  # (a throw-away value of this test file)
FIVE = [ROLE_ADMIN, ROLE_TOURISM, ROLE_SANITATION, ROLE_ESTABLISHMENT, ROLE_TOURIST]


def make_user(username, role, resort=None, **extra):
    user = User.objects.create_user(username=username, password=PASSWORD, **extra)
    UserProfile.objects.create(user=user, role=role, resort=resort)
    return user


def make_resort(pk, name):
    return Resort.objects.create(
        resort_id=pk, resort_name=name, type="Beach Resort", location="Mauban", short_description="d", access="Boat", latitude=14.2, longitude=121.7,
    )


def client_of(user):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


class TheNewRoleTests(TestCase):
    def test_it_is_a_role_with_a_label(self):
        self.assertEqual(ROLE_RESORT, "resort")
        self.assertIn((ROLE_RESORT, "Resort Staff"), USER_ROLE_CHOICES)
        self.assertEqual(UserProfile._meta.get_field("role").max_length >= len(ROLE_RESORT), True)
        user = make_user("staff", ROLE_RESORT)
        self.assertEqual(user.profile.get_role_display(), "Resort Staff")

    def test_it_is_in_no_module_and_not_among_the_administration_roles(self):
        for roles in MODULE_ROLES.values():
            self.assertNotIn(ROLE_RESORT, roles)
        self.assertNotIn(ROLE_RESORT, ADMINISTRATION_ROLES)
        user = make_user("staff", ROLE_RESORT)
        self.assertFalse(has_module_access(user, "tourism"))
        self.assertFalse(has_module_access(user, "sanitation"))
        self.assertEqual(get_user_role(user), ROLE_RESORT)

    def test_module_required_refuses_it_in_tourism(self):
        response = client_of(make_user("staff", ROLE_RESORT)).get("/api/tourist-records/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "You do not have access to this module.")

    def test_module_required_refuses_it_in_sanitation(self):
        response = client_of(make_user("staff", ROLE_RESORT)).get("/api/sanitation/inspectors/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "You do not have access to this module.")

    def test_administration_required_refuses_it(self):
        response = client_of(make_user("staff", ROLE_RESORT)).get("/api/emergency-contacts/")
        self.assertEqual(response.status_code, 403)

    def test_the_staff_of_a_resort_can_log_in_and_get_a_token(self):
        make_user("staff", ROLE_RESORT)
        response = APIClient().post("/api/auth/login/", {"username": "staff", "password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["token"])
        self.assertEqual(response.json()["user"]["profile"]["role"], ROLE_RESORT)
        # ... and the token works for what any account may do (who am I)
        token = response.json()["token"]
        me = APIClient()
        me.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(me.get("/api/auth/me/").status_code, 200)

    def test_the_existing_roles_are_decided_as_before(self):
        expected = {
            ROLE_ADMIN: (True, True),
            ROLE_TOURISM: (True, False),
            ROLE_SANITATION: (False, True),
            ROLE_ESTABLISHMENT: (False, False),
            ROLE_TOURIST: (False, False),
        }
        for role, (tourism, sanitation) in expected.items():
            user = make_user(f"user-{role}", role)
            self.assertEqual(has_module_access(user, "tourism"), tourism, role)
            self.assertEqual(has_module_access(user, "sanitation"), sanitation, role)
        self.assertEqual(MODULE_ROLES, {"tourism": {ROLE_ADMIN, ROLE_TOURISM}, "sanitation": {ROLE_ADMIN, ROLE_SANITATION}})
        self.assertEqual(ADMINISTRATION_ROLES, frozenset({ROLE_ADMIN, ROLE_TOURISM}))

    def test_the_five_roles_are_still_there_in_their_order(self):
        self.assertEqual([code for code, _ in USER_ROLE_CHOICES], FIVE + [ROLE_RESORT])


class TheDefaultRoleTests(TestCase):
    def test_a_profile_made_without_a_role_is_a_tourist_not_the_tourism_office(self):
        user = User.objects.create_user(username="nobody", password=PASSWORD)
        profile = UserProfile.objects.create(user=user)
        profile.refresh_from_db()
        self.assertEqual(profile.role, ROLE_TOURIST)
        self.assertEqual(UserProfile._meta.get_field("role").default, ROLE_TOURIST)
        self.assertFalse(has_module_access(user, "tourism"))
        self.assertFalse(has_module_access(user, "sanitation"))

    def test_an_explicit_role_is_kept(self):
        for role in FIVE + [ROLE_RESORT]:
            user = User.objects.create_user(username=f"u-{role}", password=PASSWORD)
            self.assertEqual(UserProfile.objects.create(user=user, role=role).role, role)


class TheResortOfAProfileTests(TestCase):
    def test_many_profiles_can_point_to_the_same_resort(self):
        resort = make_resort(1, "Sample Cove")
        users = [make_user(f"staff{n}", ROLE_RESORT, resort=resort) for n in range(5)]
        self.assertEqual(resort.staff_profiles.count(), 5)
        self.assertEqual({u.profile.resort_id for u in users}, {1})

    def test_the_resort_is_not_required(self):
        user = make_user("staff", ROLE_RESORT)
        self.assertIsNone(user.profile.resort)
        other = make_user("clerk", ROLE_TOURISM)
        self.assertIsNone(other.profile.resort)
        self.assertTrue(UserProfile._meta.get_field("resort").null)
        self.assertTrue(UserProfile._meta.get_field("resort").blank)

    def test_two_resorts_each_have_their_own_staff(self):
        a, b = make_resort(1, "Cove A"), make_resort(2, "Cove B")
        make_user("a1", ROLE_RESORT, resort=a)
        make_user("a2", ROLE_RESORT, resort=a)
        make_user("b1", ROLE_RESORT, resort=b)
        self.assertEqual(a.staff_profiles.count(), 2)
        self.assertEqual(b.staff_profiles.count(), 1)

    def test_a_resort_that_goes_leaves_its_staff_with_no_resort_and_does_not_delete_them(self):
        resort = make_resort(1, "Sample Cove")
        user = make_user("staff", ROLE_RESORT, resort=resort)
        resort.delete()
        user.profile.refresh_from_db()
        self.assertIsNone(user.profile.resort)
        self.assertTrue(User.objects.filter(pk=user.pk).exists())

    def test_the_owner_of_a_resort_is_a_different_thing_and_is_untouched(self):
        resort = make_resort(1, "Sample Cove")
        owner = make_user("owner", ROLE_ESTABLISHMENT)
        resort.user = owner
        resort.save()
        staff = make_user("staff", ROLE_RESORT, resort=resort)
        resort.refresh_from_db()
        self.assertEqual(resort.user_id, owner.pk)
        self.assertEqual(list(resort.staff_profiles.values_list("user_id", flat=True)), [staff.pk])


class LastLoginTests(TestCase):
    def login(self, username, password=PASSWORD):
        return APIClient().post("/api/auth/login/", {"username": username, "password": password}, format="json")

    def test_logging_in_records_when_for_every_role(self):
        for role in FIVE + [ROLE_RESORT]:
            user = make_user(f"user-{role}", role)
            self.assertIsNone(user.last_login, role)
            self.assertEqual(self.login(user.username).status_code, 200, role)
            user.refresh_from_db()
            self.assertIsNotNone(user.last_login, role)

    def test_each_login_moves_it_forward(self):
        user = make_user("staff", ROLE_RESORT)
        self.login("staff")
        user.refresh_from_db()
        first = user.last_login
        self.login("staff")
        user.refresh_from_db()
        self.assertGreaterEqual(user.last_login, first)
        self.assertIsNotNone(first)

    def test_a_refused_login_records_nothing(self):
        user = make_user("staff", ROLE_RESORT)
        self.assertEqual(self.login("staff", "wrong-password").status_code, 401)
        user.refresh_from_db()
        self.assertIsNone(user.last_login)

    def test_an_inactive_account_records_nothing(self):
        user = make_user("gone", ROLE_RESORT)
        user.is_active = False
        user.save()
        self.assertEqual(self.login("gone").status_code, 401)
        user.refresh_from_db()
        self.assertIsNone(user.last_login)

    def test_the_alias_of_the_sanitation_account_records_it_for_the_account_that_signed_in(self):
        user = make_user("sanitation_admin", ROLE_SANITATION)
        self.assertEqual(self.login("sanitary_admin").status_code, 200)
        user.refresh_from_db()
        self.assertIsNotNone(user.last_login)


class TheMigrationTests(TransactionTestCase):
    """0067 changes the default, adds a choice and a field: no row that exists is touched."""

    BEFORE = [("api", "0066_resort_images_without_build_paths")]
    AFTER = [("api", "0067_resort_staff_role")]

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_the_rows_that_exist_keep_their_role_and_get_no_resort(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.BEFORE)
        old = executor.loader.project_state(self.BEFORE).apps
        user_model, profile_model = old.get_model("auth", "User"), old.get_model("api", "UserProfile")
        profile_model.objects.all().delete()
        roles = ["admin", "tourism", "sanitation", "establishment", "tourist"]
        made = {}
        for number, role in enumerate(roles):
            user = user_model.objects.create(username=f"old-{number}", password="x")
            made[user.pk] = profile_model.objects.create(user=user, role=role).role
        self.assertEqual(len(made), 5)  # the fixture: five rows, one of every role

        executor = MigrationExecutor(connection)
        executor.migrate(self.AFTER)
        new = executor.loader.project_state(self.AFTER).apps
        profile_after = new.get_model("api", "UserProfile")
        after = {p.user_id: p.role for p in profile_after.objects.all()}
        self.assertEqual(after, made)  # not one role moved, and none became "tourist" or "tourism"
        self.assertEqual(profile_after.objects.exclude(resort=None).count(), 0)
        self.assertEqual(profile_after._meta.get_field("role").default, "tourist")

    def test_it_is_one_migration_that_follows_0066_and_does_only_the_three_things(self):
        import importlib

        migration = importlib.import_module("api.migrations.0067_resort_staff_role").Migration
        self.assertEqual(migration.dependencies, [("api", "0066_resort_images_without_build_paths")])
        kinds = sorted(type(operation).__name__ for operation in migration.operations)
        self.assertEqual(kinds, ["AddField", "AlterField", "AlterField"])  # the new field; the new choice (of the role and of the role a notice is for)
        fields = sorted((operation.model_name, operation.name) for operation in migration.operations)
        self.assertEqual(fields, [("notification", "target_role"), ("userprofile", "resort"), ("userprofile", "role")])
