"""A tourist record is never deleted: it is ARCHIVED, which only takes it off the Record Management table, and can be undone.

The data is the tourist's, who has already paid. An archived record is still counted by EVERY figure (the cards, the dashboard, Analytics, the
exports, the mobile app): only the table, and only in its default "Active" view, leaves it out. Four promises are tested here:
  1. there is no way to delete one: not in the API (DELETE is refused), not in the Django admin (not even for a superuser), not on the screen;
  2. archiving changes no number anywhere (checked before and after, on the same data);
  3. unarchive brings it back; the table has three views (Active, the default; Archived; All) and says how many are archived;
  4. admin and Tourism Office may archive; every other role gets 403.
"""
import re
from datetime import timedelta
from pathlib import Path

from django.contrib.admin.sites import site as admin_site
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .admin import TouristRecordAdmin
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
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

IN = (ROLE_ADMIN, ROLE_TOURISM)
OUT = (ROLE_RESORT, ROLE_TOURIST, ROLE_SANITATION, ROLE_ESTABLISHMENT)
FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src" / "tourism"


def table_ids(response):
    return sorted(row["survey_id"] for row in response.json()["rows"])


@override_settings(USE_SEED_DATA=False)
class ArchiveBase(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Archive Resort")
        today = timezone.localdate()
        # one of each status, so that the cards, the dashboard and the reports have something to count
        arrive(self.resort, "AR-ARRIVED", 4, when=today, status="arrived")
        arrive(self.resort, "AR-PENDING", 3, when=today, status="pending")
        arrive(self.resort, "AR-CANCELLED", 2, when=today - timedelta(days=1), status="no_show")
        arrive(self.resort, "AR-OTHER", 5, when=today, status="arrived")
        self.clients = {}
        self.users = {}
        for role in IN + OUT + ("superuser",):
            user = User.objects.create(username=f"arc_{role}", email=f"{role}@test.local")  # no password: a token is the login, and hashing 7 passwords per test is slow
            UserProfile.objects.create(user=user, role=ROLE_ADMIN if role == "superuser" else role)
            if role == "superuser":
                user.is_staff = True
                user.is_superuser = True
                user.save()
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
            self.clients[role] = client
            self.users[role] = user
        self.admin = self.clients[ROLE_ADMIN]

    def archive(self, survey_id, client=None):
        return (client or self.admin).post(f"/api/tourist-records/{survey_id}/archive/")

    def unarchive(self, survey_id, client=None):
        return (client or self.admin).post(f"/api/tourist-records/{survey_id}/unarchive/")

    def table(self, **params):
        return self.admin.get("/api/booking-management/", params)


class NoWayToDeleteTests(ArchiveBase):
    def test_the_api_refuses_delete_for_everybody_and_the_record_stays(self):
        for role in IN + OUT:
            with self.subTest(role=role):
                response = self.clients[role].delete("/api/tourist-records/AR-ARRIVED/")
                self.assertIn(response.status_code, (403, 405))
                self.assertTrue(TouristRecord.objects.filter(pk="AR-ARRIVED").exists())
        self.assertEqual(self.admin.delete("/api/tourist-records/AR-ARRIVED/").status_code, 405)
        self.assertEqual(self.clients[ROLE_TOURISM].delete("/api/tourist-records/AR-ARRIVED/").status_code, 405)
        self.assertEqual(TouristRecord.objects.count(), 4)
        self.assertFalse(ActivityLog.objects.filter(action="delete", record_type="TouristRecord").exists())

    def test_the_detail_view_takes_get_put_and_patch_only(self):
        response = self.admin.options("/api/tourist-records/AR-ARRIVED/")
        allowed = sorted(method.strip() for method in response["Allow"].split(","))
        self.assertEqual(allowed, ["GET", "OPTIONS", "PATCH", "PUT"])

    def test_the_django_admin_cannot_delete_a_record_even_for_a_superuser(self):
        model_admin = TouristRecordAdmin(TouristRecord, admin_site)
        request = RequestFactory().get("/admin/")
        request.user = self.users["superuser"]
        self.assertTrue(request.user.is_superuser)
        self.assertFalse(model_admin.has_delete_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request, TouristRecord.objects.get(pk="AR-ARRIVED")))
        self.assertNotIn("delete_selected", model_admin.get_actions(request))

    @override_settings(
        STORAGES={
            "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        }
    )
    def test_the_django_admin_pages_refuse_a_delete_with_a_superuser_logged_in(self):
        self.client.force_login(self.users["superuser"])
        url = "/admin/api/touristrecord/AR-ARRIVED/delete/"
        self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.post(url, {"post": "yes"}).status_code, 403)
        # the bulk action: delete_selected is not an action any more, so nothing is deleted
        self.client.post(
            "/admin/api/touristrecord/",
            {"action": "delete_selected", "_selected_action": ["AR-ARRIVED"], "post": "yes"},
        )
        self.assertEqual(TouristRecord.objects.count(), 4)

    def test_the_screen_has_no_delete_code(self):
        page = (FRONTEND / "pages" / "BookingManagement.js").read_text(encoding="utf-8")
        context = (FRONTEND / "context" / "TourismDataContext.js").read_text(encoding="utf-8")
        api = (FRONTEND / "services" / "tourismApi.js").read_text(encoding="utf-8")
        self.assertNotIn("FiTrash2", page)
        self.assertNotIn("deleteRecord", page + context)
        self.assertNotIn("deleteTouristRecord", page + context + api)
        self.assertNotIn("delete-record-confirm", page)


class ArchiveActionTests(ArchiveBase):
    def test_archive_sets_the_flag_the_time_and_the_user(self):
        response = self.archive("AR-ARRIVED")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["is_archived"], True)
        record = TouristRecord.objects.get(pk="AR-ARRIVED")
        self.assertTrue(record.is_archived)
        self.assertIsNotNone(record.archived_at)
        self.assertEqual(record.archived_by, self.users[ROLE_ADMIN])

    def test_unarchive_brings_it_back_and_clears_who_and_when(self):
        self.archive("AR-ARRIVED")
        response = self.unarchive("AR-ARRIVED")
        self.assertEqual(response.status_code, 200)
        record = TouristRecord.objects.get(pk="AR-ARRIVED")
        self.assertFalse(record.is_archived)
        self.assertIsNone(record.archived_at)
        self.assertIsNone(record.archived_by)

    def test_who_and_when_come_from_the_server_not_from_the_request(self):
        before = timezone.now()
        self.admin.post(
            "/api/tourist-records/AR-ARRIVED/archive/",
            {"archived_by": self.users[ROLE_TOURISM].pk, "archived_at": "2001-01-01T00:00:00Z"},
            format="json",
        )
        record = TouristRecord.objects.get(pk="AR-ARRIVED")
        self.assertEqual(record.archived_by, self.users[ROLE_ADMIN])
        self.assertGreaterEqual(record.archived_at, before)

    def test_a_patch_cannot_archive_or_unarchive(self):
        self.admin.patch("/api/tourist-records/AR-ARRIVED/", {"is_archived": True}, format="json")
        self.assertFalse(TouristRecord.objects.get(pk="AR-ARRIVED").is_archived)
        self.archive("AR-ARRIVED")
        self.admin.patch("/api/tourist-records/AR-ARRIVED/", {"is_archived": False, "status": "arrived"}, format="json")
        self.assertTrue(TouristRecord.objects.get(pk="AR-ARRIVED").is_archived)

    def test_doing_it_twice_changes_nothing_and_logs_once(self):
        self.archive("AR-ARRIVED")
        first = TouristRecord.objects.get(pk="AR-ARRIVED").archived_at
        self.archive("AR-ARRIVED")
        self.assertEqual(TouristRecord.objects.get(pk="AR-ARRIVED").archived_at, first)
        self.assertEqual(ActivityLog.objects.filter(record_id="AR-ARRIVED", action="update").count(), 1)

    def test_it_writes_to_the_activity_log_with_the_survey_id_and_no_visitor_name(self):
        self.archive("AR-ARRIVED")
        self.unarchive("AR-ARRIVED")
        logs = list(ActivityLog.objects.filter(record_id="AR-ARRIVED").order_by("id"))
        self.assertEqual([log.action for log in logs], ["update", "update"])
        self.assertEqual(logs[0].record_type, "TouristRecord")
        self.assertEqual(logs[0].user, self.users[ROLE_ADMIN])
        self.assertIn("archived", logs[0].record_label)
        self.assertIn("unarchived", logs[1].record_label)
        for log in logs:
            self.assertIn("AR-ARRIVED", log.record_label)
            self.assertNotIn("Group", log.record_label)  # the name the test record carries

    def test_an_unknown_record_is_404(self):
        self.assertEqual(self.archive("NOPE").status_code, 404)
        self.assertEqual(self.unarchive("NOPE").status_code, 404)

    def test_it_does_not_move_the_record_in_the_table(self):
        before = TouristRecord.objects.get(pk="AR-ARRIVED").updated_at
        self.archive("AR-ARRIVED")
        self.assertEqual(TouristRecord.objects.get(pk="AR-ARRIVED").updated_at, before)

    def test_it_is_a_post_only(self):
        for method in ("get", "put", "patch", "delete"):
            with self.subTest(method=method):
                self.assertEqual(getattr(self.admin, method)("/api/tourist-records/AR-ARRIVED/archive/").status_code, 405)


class ArchiveAnswerTests(ArchiveBase):
    """The answer carries the new "N archived" (for the year asked), so the screen settles on it without reading the whole list again."""

    def test_the_answer_has_the_record_and_the_new_count(self):
        answer = self.archive("AR-ARRIVED").json()
        self.assertEqual(answer["survey_id"], "AR-ARRIVED")
        self.assertTrue(answer["is_archived"])
        self.assertEqual(answer["archivedCount"], 1)
        self.assertEqual(self.archive("AR-PENDING").json()["archivedCount"], 2)
        self.assertEqual(self.unarchive("AR-ARRIVED").json()["archivedCount"], 1)
        self.assertFalse(self.unarchive("AR-ARRIVED").json()["is_archived"])  # twice: the same answer, the same count

    def test_the_count_in_the_answer_is_the_one_the_table_shows(self):
        self.archive("AR-ARRIVED")
        answer = self.archive("AR-PENDING").json()
        self.assertEqual(answer["archivedCount"], self.table().json()["archivedCount"])

    def test_the_count_is_for_the_year_asked(self):
        old = arrive(self.resort, "AR-OLD", 1, when=timezone.localdate().replace(year=2020), status="arrived")
        self.archive(old.pk)
        this_year = str(timezone.localdate().year)
        self.assertEqual(self.admin.post("/api/tourist-records/AR-ARRIVED/archive/", {"year": this_year}).json()["archivedCount"], 1)
        self.assertEqual(self.admin.post("/api/tourist-records/AR-ARRIVED/archive/?year=2020").json()["archivedCount"], 1)
        self.assertEqual(self.admin.post("/api/tourist-records/AR-ARRIVED/archive/?year=all").json()["archivedCount"], 2)
        self.assertEqual(self.table(year="all").json()["archivedCount"], 2)

    def test_a_bad_year_is_a_400_and_nothing_is_written(self):
        response = self.admin.post("/api/tourist-records/AR-ARRIVED/archive/?year=banana")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(TouristRecord.objects.get(pk="AR-ARRIVED").is_archived)
        self.assertFalse(ActivityLog.objects.filter(record_id="AR-ARRIVED").exists())


class WhoMayArchiveTests(ArchiveBase):
    def test_admin_and_the_tourism_office_may_archive_and_unarchive(self):
        for role in IN:
            with self.subTest(role=role):
                self.assertEqual(self.archive("AR-ARRIVED", self.clients[role]).status_code, 200)
                self.assertEqual(self.unarchive("AR-ARRIVED", self.clients[role]).status_code, 200)

    def test_every_other_role_is_refused_with_403_and_nothing_changes(self):
        for role in OUT:
            with self.subTest(role=role):
                self.assertEqual(self.archive("AR-ARRIVED", self.clients[role]).status_code, 403)
                self.assertFalse(TouristRecord.objects.get(pk="AR-ARRIVED").is_archived)
        self.archive("AR-ARRIVED")
        for role in OUT:
            with self.subTest(role=role, what="unarchive"):
                self.assertEqual(self.unarchive("AR-ARRIVED", self.clients[role]).status_code, 403)
                self.assertTrue(TouristRecord.objects.get(pk="AR-ARRIVED").is_archived)

    def test_somebody_not_logged_in_is_refused(self):
        self.assertIn(APIClient().post("/api/tourist-records/AR-ARRIVED/archive/").status_code, (401, 403))


class TableViewsTests(ArchiveBase):
    ALL = ["AR-ARRIVED", "AR-CANCELLED", "AR-OTHER", "AR-PENDING"]
    NOT_ARRIVED = ["AR-CANCELLED", "AR-OTHER", "AR-PENDING"]

    def test_the_default_is_active_and_shows_what_was_shown_before(self):
        self.assertEqual(table_ids(self.table()), self.ALL)
        self.assertEqual(self.table().json()["filters"]["archived"], "active")
        self.assertEqual(self.table().json()["archivedCount"], 0)

    def test_active_leaves_the_archived_one_out(self):
        self.archive("AR-ARRIVED")
        self.assertEqual(table_ids(self.table()), self.NOT_ARRIVED)
        self.assertEqual(table_ids(self.table(archived="active")), self.NOT_ARRIVED)

    def test_archived_shows_only_the_archived_ones(self):
        self.archive("AR-ARRIVED")
        self.archive("AR-PENDING")
        self.assertEqual(table_ids(self.table(archived="archived")), ["AR-ARRIVED", "AR-PENDING"])

    def test_all_shows_everything(self):
        self.archive("AR-ARRIVED")
        self.assertEqual(table_ids(self.table(archived="all")), self.ALL)

    def test_an_unknown_value_falls_back_to_active(self):
        self.archive("AR-ARRIVED")
        self.assertEqual(table_ids(self.table(archived="whatever")), self.NOT_ARRIVED)

    def test_rows_say_whether_they_are_archived(self):
        self.archive("AR-ARRIVED")
        rows = {row["survey_id"]: row for row in self.table(archived="all").json()["rows"]}
        self.assertTrue(rows["AR-ARRIVED"]["is_archived"])
        self.assertIsNotNone(rows["AR-ARRIVED"]["archived_at"])
        self.assertFalse(rows["AR-PENDING"]["is_archived"])
        self.assertIsNone(rows["AR-PENDING"]["archived_at"])

    def test_unarchive_puts_it_back_in_the_table(self):
        self.archive("AR-ARRIVED")
        self.unarchive("AR-ARRIVED")
        self.assertEqual(table_ids(self.table()), self.ALL)
        self.assertEqual(table_ids(self.table(archived="archived")), [])

    def test_the_archived_count_is_exact_and_follows_archive_and_unarchive(self):
        self.assertEqual(self.table().json()["archivedCount"], 0)
        self.archive("AR-ARRIVED")
        self.assertEqual(self.table().json()["archivedCount"], 1)
        self.archive("AR-PENDING")
        self.assertEqual(self.table().json()["archivedCount"], 2)
        self.assertEqual(self.table(archived="all").json()["archivedCount"], 2)  # the same whichever view is open
        self.unarchive("AR-ARRIVED")
        self.assertEqual(self.table().json()["archivedCount"], 1)
        self.unarchive("AR-PENDING")
        self.assertEqual(self.table().json()["archivedCount"], 0)

    def test_the_search_and_the_status_filter_work_inside_each_view(self):
        self.archive("AR-ARRIVED")
        self.assertEqual(table_ids(self.table(status="arrived")), ["AR-OTHER"])
        self.assertEqual(table_ids(self.table(status="arrived", archived="all")), ["AR-ARRIVED", "AR-OTHER"])
        self.assertEqual(table_ids(self.table(search="AR-ARRIVED")), [])
        self.assertEqual(table_ids(self.table(search="AR-ARRIVED", archived="archived")), ["AR-ARRIVED"])


class ArchiveChangesNoNumberTests(ArchiveBase):
    """The same data, asked before and after archiving records: every figure is identical. Only the table (rows, pagination, the archived
    count and the view named in the filters) may differ."""

    def figures(self):
        out = {}
        out["cards"] = self.table(archived="all").json()["summary"]
        out["dashboard"] = self.admin.get("/api/dashboard/").json()
        for tab in ("daily", "monthly", "yearly", "resort", "origin", "purpose", "transport", "boat", "no_show"):
            out[f"report-{tab}"] = self.admin.get("/api/reports/", {"type": tab, "year": "all"}).json()
        out["insights"] = self.admin.get("/api/reports/", {"type": "daily", "year": "all", "include_questions": "true"}).json()
        out["arrival"] = self.admin.get("/api/arrival-monitoring/").json()
        out["arrival-export"] = self.admin.get("/api/arrival-monitoring/export/").json()
        out["destination-figures"] = self.admin.get("/api/destination-figures/").json()
        out["mobile"] = self.admin.get("/api/mobile/tourism/bootstrap/").json().get("destinations")
        out["records-list"] = sorted(record["survey_id"] for record in self.admin.get("/api/tourist-records/").json())
        out["counts"] = {
            "all": TouristRecord.objects.count(),
            "arrived": TouristRecord.objects.filter(status="arrived").count(),
            "visitors": sum(TouristRecord.objects.values_list("total_visitors", flat=True)),
        }
        return out

    def test_every_figure_is_the_same_before_and_after_archiving_records(self):
        before = self.figures()
        self.assertGreaterEqual(before["cards"]["verifiedEntries"], 4)
        self.archive("AR-ARRIVED")
        self.archive("AR-CANCELLED")
        after = self.figures()
        self.assertEqual(before.keys(), after.keys())
        for key in before:
            with self.subTest(figure=key):
                self.assertEqual(before[key], after[key])

    def test_the_three_cards_the_dashboard_and_analytics_do_not_move(self):
        cards_before = self.table().json()["summary"]
        dashboard_before = self.admin.get("/api/dashboard/").json()["metrics"]
        resort_before = self.admin.get("/api/reports/", {"type": "resort", "year": "all"}).json()
        no_show_before = self.admin.get("/api/reports/", {"type": "no_show", "year": "all"}).json()

        self.archive("AR-ARRIVED")
        self.archive("AR-CANCELLED")

        self.assertEqual(self.table().json()["summary"], cards_before)  # even with the table in its default Active view
        self.assertEqual(self.admin.get("/api/dashboard/").json()["metrics"], dashboard_before)
        self.assertEqual(self.admin.get("/api/reports/", {"type": "resort", "year": "all"}).json(), resort_before)
        self.assertEqual(self.admin.get("/api/reports/", {"type": "no_show", "year": "all"}).json(), no_show_before)
        self.assertEqual(cards_before["verifiedEntries"], 4)
        self.assertEqual(cards_before["arrived"], 2)
        self.assertEqual(cards_before["noShow"], 1)

    def test_nothing_but_the_table_reads_the_archive(self):
        # the only code that looks at is_archived is the table query, the archive action and the model/admin: no other query was touched
        api = Path(__file__).resolve().parent
        readers = set()
        for path in sorted(api.rglob("*.py")):
            relative = str(path.relative_to(api)).replace("\\", "/")
            if relative.startswith("migrations/") or relative.startswith("test") or "/test" in relative:
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                if re.search(r"\bis_archived\b", line) and not line.lstrip().startswith("#"):
                    readers.add(relative)
        self.assertEqual(sorted(readers), ["admin.py", "models.py", "services/tourism.py", "views/tourism.py"])
        source = (api / "services" / "tourism.py").read_text(encoding="utf-8")
        self.assertEqual(len(re.findall(r"is_archived=False", source)), 1)
