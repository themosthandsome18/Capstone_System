"""The ActivityLog labels of the two sanitation staff-account endpoints fit the column.

`ActivityLog.record_label` is varchar(255). The label of creating an inspector account (sanitation.py, the log
after `new_user.save()`) and of activating / deactivating one (the log after `staff_user.save()`) is built from
the full name and the username, and the view puts no limit on them beyond the model's 150 characters each: a
full name of 301 characters and a username of 150 make a label of 454 (creating) and 468 (deactivating), which
PostgreSQL refuses (a 500) AFTER the account has been saved, because these views have no transaction block.
SQLite does not enforce a length, so the length is checked here explicitly.
"""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import ACTION_CREATE, ACTION_UPDATE, ROLE_ADMIN, ROLE_SANITATION, ActivityLog, UserProfile

COLUMN = ActivityLog._meta.get_field("record_label").max_length
FIRST = "Fn" + "x" * 148     # 150 characters, the longest the model allows
LAST = "Ln" + "y" * 148      # 150
USERNAME = "un_" + "z" * 147  # 150


@override_settings(USE_SEED_DATA=False)
class StaffLabelLengthTests(TestCase):
    LIST = "/api/sanitation/staff/"

    def setUp(self):
        self.admin = User.objects.create_user(username="staff_label_admin", password="Staff@12345", is_staff=True)
        UserProfile.objects.create(user=self.admin, role=ROLE_ADMIN)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _logs(self):
        return ActivityLog.objects.filter(module="sanitation", record_type="User").order_by("pk")

    def _long_account(self):
        user = User.objects.create_user(username=USERNAME, password="Staff@12345", first_name=FIRST, last_name=LAST, is_staff=True)
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        return user

    def _names(self, user):
        row = User.objects.get(pk=user.pk)
        return row.first_name, row.last_name, row.username

    # -- the labels of ordinary names are exactly what they were ------------------------------------------

    def test_ordinary_labels_are_byte_for_byte_what_they_were(self):
        created = self.client.post(
            self.LIST, {"first_name": "Juan", "last_name": "Dela Cruz", "username": "jdc", "password": "secret123"}, format="json"
        )
        self.assertEqual(created.status_code, 201, created.content)
        pk = User.objects.get(username="jdc").pk
        self.assertEqual(self.client.patch(f"{self.LIST}{pk}/", {"is_active": False}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(f"{self.LIST}{pk}/", {"is_active": True}, format="json").status_code, 200)
        self.assertEqual(
            [(l.action, l.record_id, l.record_label) for l in self._logs()],
            [
                (ACTION_CREATE, str(pk), "Juan Dela Cruz (jdc)"),
                (ACTION_UPDATE, str(pk), "Juan Dela Cruz (jdc) - Deactivated"),
                (ACTION_UPDATE, str(pk), "Juan Dela Cruz (jdc) - Activated"),
            ],
        )

    # -- the worst cases --------------------------------------------------------------------------------------

    def test_the_longest_inspector_is_created_whole_and_the_label_fits_the_column(self):
        naive = f"{FIRST} {LAST} ({USERNAME})"
        self.assertEqual(len(naive), 454)       # the fixture: written in full the label is 454 ...
        self.assertGreater(len(naive), COLUMN)  # ... and does NOT fit
        response = self.client.post(
            self.LIST, {"first_name": FIRST, "last_name": LAST, "username": USERNAME, "password": "secret123"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)  # the account is created ...
        user = User.objects.get(username=USERNAME)
        self.assertEqual(self._names(user), (FIRST, LAST, USERNAME))  # ... with the names letter for letter, none of them shortened
        self.assertEqual((user.is_staff, user.is_active, user.profile.role), (True, True, ROLE_SANITATION))
        log = self._logs().get()  # ... and the audit event exists
        self.assertEqual((log.action, log.record_id, log.user), (ACTION_CREATE, str(user.pk), self.admin))
        self.assertLessEqual(len(log.record_label), COLUMN)  # explicitly: SQLite would accept any length
        self.assertTrue(log.record_label.startswith(FIRST[:40]), log.record_label)

    def test_deactivating_and_activating_the_longest_account_fit_and_change_no_name(self):
        user = self._long_account()
        before = self._names(user)
        self.assertEqual(before, (FIRST, LAST, USERNAME))  # the fixture: the account really has the longest names
        self.assertEqual(len(f"{FIRST} {LAST} ({USERNAME}) - Deactivated"), 468)  # the fixture: 468 written in full ...
        self.assertEqual(len(f"{FIRST} {LAST} ({USERNAME}) - Activated"), 466)     # ... and 466
        for target, word in ((False, "Deactivated"), (True, "Activated")):
            response = self.client.patch(f"{self.LIST}{user.pk}/", {"is_active": target}, format="json")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(User.objects.get(pk=user.pk).is_active, target)
        self.assertEqual(self._names(user), before)  # the real names in the database are untouched, letter for letter
        logs = list(self._logs())
        self.assertEqual([l.action for l in logs], [ACTION_UPDATE, ACTION_UPDATE])
        self.assertEqual([l.record_id for l in logs], [str(user.pk)] * 2)
        for log in logs:
            self.assertLessEqual(len(log.record_label), COLUMN)

    def test_changing_the_names_to_their_longest_saves_them_whole_and_logs_within_255(self):
        pk = User.objects.create_user(username="short_user", password="Staff@12345", first_name="A", last_name="B").pk
        UserProfile.objects.create(user_id=pk, role=ROLE_SANITATION)
        self.assertGreater(len(f"{FIRST} {LAST} (short_user) - Activated"), COLUMN)  # the fixture: 326 written in full, it does not fit
        response = self.client.patch(f"{self.LIST}{pk}/", {"first_name": FIRST, "last_name": LAST}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        row = User.objects.get(pk=pk)
        self.assertEqual((row.first_name, row.last_name, row.username), (FIRST, LAST, "short_user"))  # as typed, in full
        log = self._logs().get()
        self.assertLessEqual(len(log.record_label), COLUMN)

    def test_a_label_with_no_space_near_its_end_is_cut_at_exactly_the_column(self):
        """The cut steps back to a space only when one is near. Here the last space is early (the names are 60
        letters each), so the label is cut hard, and it must come out at the column, not one over."""
        first, last, username = "F" * 60, "L" * 60, "u" * 150
        naive_create = f"{first} {last} ({username})"
        self.assertEqual(len(naive_create), 274)
        self.assertLess(naive_create.rindex(" "), (COLUMN - 1) // 2)  # the fixture: the last space is in the first half, so no step back
        created = self.client.post(self.LIST, {"first_name": first, "last_name": last, "username": username, "password": "secret123"}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        pk = User.objects.get(username=username).pk
        deactivated = self.client.patch(f"{self.LIST}{pk}/", {"is_active": False}, format="json")
        self.assertEqual(deactivated.status_code, 200, deactivated.content)
        naive_update = f"{first} {last} ({username}) - Deactivated"
        self.assertLess(naive_update[:COLUMN - 1].rindex(" "), (COLUMN - 1) // 2)  # (and the same for the longer label)
        labels = [l.record_label for l in self._logs()]
        self.assertEqual(len(labels), 2)
        self.assertEqual([len(label) for label in labels], [COLUMN, COLUMN])  # exactly at the column: the room is used, not exceeded
        self.assertTrue(all(label.endswith("…") for label in labels))
        self.assertEqual(self._names(User.objects.get(pk=pk)), (first, last, username))

    # -- where the write and its trace sit is not changed -----------------------------------------------------------------

    def _watch(self, call):
        """Run `call` while recording, at the moment the view writes its audit event: how many transaction blocks
        are open beyond the ones the test itself is in, whether the account is already saved, and how many audit
        events exist."""
        from api.views import sanitation as views

        outside = len(connection.savepoint_ids)
        seen = []
        real = views.log_activity

        def spy(*args, **kwargs):
            seen.append((len(connection.savepoint_ids) - outside, User.objects.filter(username=USERNAME).exists(), self._logs().count()))
            return real(*args, **kwargs)

        with patch.object(views, "log_activity", spy):
            response = call()
        return response, seen

    def test_the_account_is_saved_first_and_the_event_is_written_in_the_same_place_as_before(self):
        response, seen = self._watch(
            lambda: self.client.post(self.LIST, {"first_name": FIRST, "last_name": LAST, "username": USERNAME, "password": "secret123"}, format="json")
        )
        self.assertEqual(response.status_code, 201)
        # no transaction block of its own (these views have none, today), the account already saved, no event yet
        self.assertEqual(seen, [(0, True, 0)])

    def test_when_the_log_fails_the_saved_account_stays_saved_as_it_always_did(self):
        """Documents how it is (there is no transaction block around the save and the log): not a behaviour wanted for
        its own sake. If a block is ever added, this test says so, and it is then a decision."""
        from api.views import sanitation as views

        with patch.object(views, "log_activity", side_effect=RuntimeError("the log is broken")), self.assertRaises(RuntimeError):
            self.client.post(self.LIST, {"first_name": "Ana", "last_name": "Lim", "username": "ana_l", "password": "secret123"}, format="json")
        self.assertTrue(User.objects.filter(username="ana_l").exists())
        self.assertEqual(self._logs().count(), 0)
