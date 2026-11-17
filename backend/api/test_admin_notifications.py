"""The Tourism module's notifications for the staff: a visit was registered, a review was sent.

Who is told: the system admin and the Tourism Office, equally, ONE ROW EACH (so taking one off a person's list takes nothing off another's). Nobody else:
not sanitation, not a resort's staff, not a tourist. Where the news comes from: the phone's registration, a record that staff add on the web, and a
review from the phone. NOT from the Excel import (it saves with bulk_create and calls nothing here). What a notice says: the survey ID and the name of
the resort, never a person. The people in these tests are made up.
"""
import datetime
from io import BytesIO

from django.contrib.auth.models import User
from django.core.cache import cache, caches
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    NOTIFICATION_TYPE_NEW_FEEDBACK,
    NOTIFICATION_TYPE_NEW_REGISTRATION,
    ROLE_ADMIN,
    ROLE_RESORT,
    ROLE_SANITATION,
    ROLE_TOURISM,
    ROLE_TOURIST,
    FeedbackEntry,
    Notification,
    Resort,
    TouristRecord,
    UserProfile,
)
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables
from .visit_support import arrived_visit, visit_fields

VISITOR_NAME = "Zacarias Quimbo"
VISITOR_EMAIL = "zacarias.quimbo@example.test"
VISITOR_CONTACT = "09175550123"


def make_user(name, role):
    user = User.objects.create(username=name, email=f"{name}@staff.test")  # no password: nobody logs in here, a token is used
    if role:
        UserProfile.objects.create(user=user, role=role)
    return user


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
    return client


@override_settings(USE_SEED_DATA=False)
class AdminNotificationsBase(TestCase):
    def setUp(self):
        cache.clear()
        caches["throttle"].clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        Notification.objects.all().delete()
        self.beach = make_resort(1, "Beach One")
        self.admin = make_user("notif_admin", ROLE_ADMIN)
        self.admin_two = make_user("notif_admin_two", ROLE_ADMIN)
        self.tourism = make_user("notif_tourism", ROLE_TOURISM)
        self.sanitation = make_user("notif_sanitation", ROLE_SANITATION)
        self.resort_staff = make_user("notif_resort", ROLE_RESORT)
        self.tourist = make_user("notif_tourist", ROLE_TOURIST)
        self.no_profile = make_user("notif_noprofile", None)
        self.inactive_admin = make_user("notif_inactive_admin", ROLE_ADMIN)
        User.objects.filter(pk=self.inactive_admin.pk).update(is_active=False)

    def tourism_notices(self, **filters):
        return Notification.objects.filter(module="tourism", **filters)

    def register_from_phone(self, **fields):
        body = {
            "full_name": VISITOR_NAME, "email": VISITOR_EMAIL, "contact_number": VISITOR_CONTACT, "arrival_date": "2026-06-01",
            "resort_id": self.beach.resort_id, "total_visitors": 2, "filipino_count": 2, "total_male": 1, "total_female": 1, "age_8_59": 2,
            **fields,
        }
        return APIClient().post("/api/mobile/tourism/register-visit/", body, format="json")


class NewRegistrationTests(AdminNotificationsBase):
    def test_a_registration_from_the_phone_is_told_to_the_admin_and_the_tourism_office_one_row_each(self):
        response = self.register_from_phone()

        self.assertEqual(response.status_code, 201, response.content)
        rows = self.tourism_notices(notification_type=NOTIFICATION_TYPE_NEW_REGISTRATION)
        self.assertEqual(rows.count(), 3)  # two admins and the Tourism Office: one each
        self.assertCountEqual([row.recipient_user_id for row in rows], [self.admin.pk, self.admin_two.pk, self.tourism.pk])
        self.assertEqual(len({row.pk for row in rows}), 3)  # three rows, not one shared by three
        self.assertTrue(all(row.audience_type == "user" and not row.is_read for row in rows))

    def add_on_the_web(self, user):
        from .models import BoatType, Country, Itinerary, Province, TravelMode, VisitPurpose

        quezon = Province.objects.get(name="Quezon")
        body = {
            "full_name": VISITOR_NAME, "contact_number": VISITOR_CONTACT, "arrival_date": "2026-06-01", "resort_id": self.beach.resort_id,
            "country_id": Country.objects.get(name="Philippines").id, "region_id": quezon.region_id, "province_id": quezon.id,
            "itinerary_id": Itinerary.objects.first().id, "travel_mode_id": TravelMode.objects.first().id, "boat_type_id": BoatType.objects.first().id,
            "visit_purpose_id": VisitPurpose.objects.first().id,
            "total_visitors": 1, "filipino_count": 1, "total_male": 1, "age_8_59": 1,
        }
        response = client_for(user).post("/api/tourist-records/", body, format="json")
        self.assertEqual(response.status_code, 201, response.content)

    def told(self):
        return {row.recipient_user_id for row in self.tourism_notices(notification_type=NOTIFICATION_TYPE_NEW_REGISTRATION)}

    def test_when_the_tourism_office_adds_a_record_it_is_not_told_but_the_admins_are(self):
        self.add_on_the_web(self.tourism)

        self.assertEqual(self.told(), {self.admin.pk, self.admin_two.pk})  # the one who added it has no row
        self.assertFalse(self.tourism_notices(recipient_user=self.tourism).exists())

    def test_when_an_admin_adds_a_record_that_admin_is_not_told_but_the_tourism_office_is(self):
        self.add_on_the_web(self.admin)

        self.assertEqual(self.told(), {self.admin_two.pk, self.tourism.pk})  # not the admin who added it; the other admin and the office are
        self.assertFalse(self.tourism_notices(recipient_user=self.admin).exists())

    def test_with_one_admin_and_one_tourism_user_the_other_one_alone_is_told(self):
        User.objects.filter(pk=self.admin_two.pk).update(is_active=False)

        self.add_on_the_web(self.tourism)
        self.assertEqual(self.told(), {self.admin.pk})

        Notification.objects.all().delete()
        self.add_on_the_web(self.admin)
        self.assertEqual(self.told(), {self.tourism.pk})

    def test_from_the_phone_nobody_made_it_so_everyone_is_told(self):
        self.register_from_phone()

        self.assertEqual(self.told(), {self.admin.pk, self.admin_two.pk, self.tourism.pk})

    def test_the_notice_names_the_survey_and_the_resort_and_opens_that_record(self):
        self.register_from_phone()
        record = TouristRecord.objects.get()
        row = self.tourism_notices(recipient_user=self.admin).get()

        self.assertEqual(row.title, "New tourist registration")
        self.assertIn(record.survey_id, row.message)
        self.assertIn("Beach One", row.message)
        self.assertEqual((row.related_model, row.related_object_id), ("TouristRecord", record.survey_id))
        self.assertEqual(row.action_url, f"/tourist-data?openSurveyId={record.survey_id}")
        self.assertEqual(row.severity, "info")

    def test_no_name_email_or_contact_is_in_the_notice(self):
        self.register_from_phone()

        for row in self.tourism_notices():
            text = " ".join([row.title, row.message, row.action_url, row.related_object_id]).lower()
            for secret in (VISITOR_NAME, "zacarias", "quimbo", VISITOR_EMAIL, VISITOR_CONTACT, "0917555", "555 0123"):
                self.assertNotIn(secret.lower(), text, f"{secret!r} is in the notice")

    def test_nobody_else_is_told(self):
        self.register_from_phone()

        told = set(self.tourism_notices().values_list("recipient_user_id", flat=True))
        for user in (self.sanitation, self.resort_staff, self.tourist, self.no_profile, self.inactive_admin):
            self.assertNotIn(user.pk, told, user.username)
        self.assertFalse(Notification.objects.filter(recipient_user__in=[self.sanitation, self.resort_staff, self.tourist, self.no_profile]).exists())

    def test_a_registration_that_is_refused_makes_no_notice(self):
        response = self.register_from_phone(arrival_date="not a date")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.tourism_notices().exists())

    def test_a_registration_is_kept_even_if_its_notice_cannot_be_made(self):
        from unittest.mock import patch

        with patch("api.services.notifications.notify_staff_users", side_effect=RuntimeError("the notice failed")):
            response = self.register_from_phone()

        self.assertEqual(response.status_code, 201, response.content)  # the registration is worth more than its notice
        self.assertEqual(TouristRecord.objects.count(), 1)

    def test_without_a_resort_the_notice_still_reads_well(self):
        from .services.notifications import notify_new_tourist_record

        record = TouristRecord(survey_id="NOTE-0009", arrival_date=datetime.date(2026, 6, 1))  # not saved: only what the notice reads

        notify_new_tourist_record(record)

        row = self.tourism_notices(recipient_user=self.admin).get()
        self.assertIn("a destination", row.message)


class NewFeedbackTests(AdminNotificationsBase):
    def review(self, **fields):
        visit = arrived_visit(self.beach, "NOTE-0001")
        body = {"destination_id": 1, "reviewer": VISITOR_NAME, "rating": 4, "message": f"Lovely place, call me on {VISITOR_CONTACT}.", **visit_fields(visit), **fields}
        return APIClient().post("/api/mobile/tourism/feedback/", body, format="json")

    def test_a_review_from_the_phone_is_told_to_the_admin_and_the_tourism_office_one_row_each(self):
        response = self.review()

        self.assertEqual(response.status_code, 201, response.content)
        rows = self.tourism_notices(notification_type=NOTIFICATION_TYPE_NEW_FEEDBACK)
        self.assertEqual(rows.count(), 3)
        self.assertCountEqual([row.recipient_user_id for row in rows], [self.admin.pk, self.admin_two.pk, self.tourism.pk])

    def test_the_notice_names_the_stars_and_the_resort_and_opens_that_review(self):
        self.review()
        entry = FeedbackEntry.objects.get()
        row = self.tourism_notices(recipient_user=self.tourism).get()

        self.assertEqual(row.title, "New review")
        self.assertIn("4-star", row.message)
        self.assertIn("Beach One", row.message)
        self.assertEqual((row.related_model, row.related_object_id), ("FeedbackEntry", str(entry.pk)))
        self.assertEqual(row.action_url, f"/feedback?openFeedbackId={entry.pk}")

    def test_neither_the_typed_name_nor_the_comment_is_in_the_notice(self):
        self.review()

        for row in self.tourism_notices():
            text = " ".join([row.title, row.message, row.action_url]).lower()
            for secret in (VISITOR_NAME, "zacarias", "quimbo", VISITOR_CONTACT, "lovely place", "call me"):
                self.assertNotIn(secret.lower(), text, f"{secret!r} is in the notice")

    def test_a_review_that_is_refused_makes_no_notice(self):
        visit = arrived_visit(self.beach, "NOTE-0002")
        response = APIClient().post(
            "/api/mobile/tourism/feedback/",
            {"destination_id": 1, "reviewer": "x", "rating": 5, "message": "y", "survey_id": "NOT-A-VISIT", "contact_number": visit.contact_number},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.tourism_notices().exists())

    def test_a_review_added_by_staff_on_the_web_is_not_this_news(self):
        body = {"destinationId": 1, "reviewer": "Staff", "rating": 5, "date": "2026-06-01", "title": "T", "message": "M"}
        response = client_for(self.tourism).post("/api/feedback/", body, format="json")

        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(self.tourism_notices(notification_type=NOTIFICATION_TYPE_NEW_FEEDBACK).exists())

    def test_nobody_else_is_told(self):
        self.review()

        self.assertFalse(Notification.objects.filter(recipient_user__in=[self.sanitation, self.resort_staff, self.tourist, self.no_profile, self.inactive_admin]).exists())


class TheExcelImportMakesNoNotice(AdminNotificationsBase):
    def workbook(self, rows):
        from openpyxl import Workbook

        from .services.online_booking import COLUMNS

        book = Workbook()
        sheet = book.active
        sheet.title = "Form Responses 1"
        for offset, row in enumerate(rows):
            values = {
                "arrival_date": datetime.datetime(2026, 4, 2), "resort": "Beach One", "total_visitors": 2, "total_male": 1, "total_female": 1,
                "itinerary": "Overnight", "maubanin_count": 0, "special_group_count": 0, "foreigner_count": 2, "filipino_count": 0,
                "age_0_7": 0, "age_8_59": 2, "age_60_above": 0, "travel_mode": "Private Vehicle", "boat_type": "Public Boat",
                "visit_purpose": "Leisure", "consent": "Yes", **row,
            }
            for key, value in values.items():
                sheet.cell(row=3 + offset, column=COLUMNS[key], value=value)
        out = BytesIO()
        book.save(out)
        out.seek(0)
        out.name = "bookings.xlsx"
        return out

    def test_importing_many_bookings_makes_no_notice_at_all(self):
        rows = [
            {"full_name": f"Imported Guest {n}", "contact_number": f"091700001{n:02d}", "country": "Philippines", "arrival_date": datetime.datetime(2026, 4, 2)}
            for n in range(1, 13)
        ]
        response = client_for(self.admin).post("/api/online-booking-import/", {"file": self.workbook(rows), "action": "import"}, format="multipart")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["valid_count"], 12, response.json().get("error_samples"))
        self.assertEqual(TouristRecord.objects.count(), 12)  # the records ARE there
        self.assertEqual(Notification.objects.count(), 0)  # and not one notice

    def test_a_registration_after_an_import_still_makes_its_notices(self):
        self.test_importing_many_bookings_makes_no_notice_at_all()

        self.register_from_phone()

        self.assertEqual(Notification.objects.count(), 3)


class TheBellsEndpointsTests(AdminNotificationsBase):
    """The four endpoints under /api/notifications/ as the Tourism bell uses them (the list asked for module=tourism)."""

    def setUp(self):
        super().setUp()
        self.register_from_phone()  # three rows: admin, admin_two, tourism
        # an admin also has sanitation notices of their own: the Tourism bell must not show them, count them or read them
        self.sanitation_notice = Notification.objects.create(
            title="Permit Due: Some Store", message="m", notification_type="permit_due", severity="warning", module="sanitation",
            audience_type="user", recipient_user=self.admin,
        )
        self.mine = self.tourism_notices(recipient_user=self.admin).get()
        self.others = self.tourism_notices().exclude(recipient_user=self.admin)

    def list_for(self, user, **params):
        return client_for(user).get("/api/notifications/", {"module": "tourism", **params})

    def test_the_admin_and_the_tourism_office_each_read_their_own_notices(self):
        for user in (self.admin, self.tourism):
            with self.subTest(user=user.username):
                response = self.list_for(user)

                self.assertEqual(response.status_code, 200, response.content)
                body = response.json()
                self.assertEqual([row["title"] for row in body["results"]], ["New tourist registration"])
                self.assertEqual(body["module_unread_count"], 1)
        self.assertEqual(self.list_for(self.admin).json()["results"][0]["id"], self.mine.pk)

    def test_the_tourism_list_leaves_out_the_admin_s_sanitation_notices_and_counts_only_its_own(self):
        body = self.list_for(self.admin).json()

        self.assertEqual(body["module_unread_count"], 1)  # not 2
        self.assertEqual(body["unread_count"], 2)  # the old figure, over every module, is as it was
        self.assertNotIn("Permit Due: Some Store", [row["title"] for row in body["results"]])

    def test_the_newest_is_first(self):
        client_for(self.admin)  # make sure the user exists
        second = Notification.objects.create(
            title="Later", message="m", notification_type=NOTIFICATION_TYPE_NEW_FEEDBACK, severity="info", module="tourism",
            audience_type="user", recipient_user=self.admin,
        )

        titles = [row["title"] for row in self.list_for(self.admin).json()["results"]]

        self.assertEqual(titles[0], second.title)

    def test_every_other_role_is_refused_the_tourism_notifications_with_403(self):
        for user in (self.sanitation, self.resort_staff, self.tourist, self.no_profile):
            with self.subTest(user=user.username):
                client = client_for(user)

                self.assertEqual(client.get("/api/notifications/", {"module": "tourism"}).status_code, 403)
                self.assertEqual(client.post("/api/notifications/mark-all-read/?module=tourism").status_code, 403)

    def test_nobody_logged_in_is_refused(self):
        self.assertEqual(APIClient().get("/api/notifications/", {"module": "tourism"}).status_code, 401)

    def test_a_role_that_is_refused_reads_nothing_even_without_the_module(self):
        for user in (self.sanitation, self.resort_staff, self.tourist):
            with self.subTest(user=user.username):
                response = client_for(user).get("/api/notifications/")

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["results"], [])  # they are not given a row of the Tourism module

    def test_pressing_a_notice_makes_it_read(self):
        response = client_for(self.admin).patch(f"/api/notifications/{self.mine.pk}/read/")

        self.assertEqual(response.status_code, 200)
        self.mine.refresh_from_db()
        self.assertTrue(self.mine.is_read)
        self.assertIsNotNone(self.mine.read_at)
        self.assertEqual(self.list_for(self.admin).json()["module_unread_count"], 0)
        # the other people's rows were not touched
        self.assertFalse(self.others.filter(is_read=True).exists())

    def test_mark_all_as_read_marks_the_tourism_notices_only_and_only_the_person_s_own(self):
        response = client_for(self.admin).post("/api/notifications/mark-all-read/?module=tourism")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated_count"], 1)
        self.mine.refresh_from_db()
        self.sanitation_notice.refresh_from_db()
        self.assertTrue(self.mine.is_read)
        self.assertFalse(self.sanitation_notice.is_read)  # the admin has not seen that one in the Tourism bell
        self.assertFalse(self.others.filter(is_read=True).exists())

    def test_mark_all_without_a_module_is_as_it_always_was(self):
        response = client_for(self.admin).post("/api/notifications/mark-all-read/")

        self.assertEqual(response.json()["updated_count"], 2)

    def test_the_x_deletes_the_person_s_own_row_and_only_that(self):
        response = client_for(self.admin).delete(f"/api/notifications/{self.mine.pk}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Notification.objects.filter(pk=self.mine.pk).exists())
        self.assertEqual(self.others.count(), 2)  # the other admin's and the Tourism Office's rows are still there
        self.assertEqual(self.list_for(self.tourism).json()["module_unread_count"], 1)
        self.assertEqual(self.list_for(self.admin_two).json()["module_unread_count"], 1)
        self.assertTrue(Notification.objects.filter(pk=self.sanitation_notice.pk).exists())  # and the admin's other notice

    def test_somebody_else_s_row_cannot_be_deleted_marked_read_or_seen(self):
        theirs = self.others.get(recipient_user=self.tourism)

        client = client_for(self.admin)
        self.assertEqual(client.delete(f"/api/notifications/{theirs.pk}/").status_code, 404)
        self.assertEqual(client.patch(f"/api/notifications/{theirs.pk}/read/").status_code, 404)
        theirs.refresh_from_db()
        self.assertFalse(theirs.is_read)
        self.assertEqual(self.others.count(), 2)

    def test_a_role_with_no_right_to_the_module_cannot_delete_a_row_of_it_either(self):
        for user in (self.sanitation, self.resort_staff, self.tourist):
            with self.subTest(user=user.username):
                self.assertIn(client_for(user).delete(f"/api/notifications/{self.mine.pk}/").status_code, (403, 404))
                self.assertTrue(Notification.objects.filter(pk=self.mine.pk).exists())

    def test_a_row_that_is_not_there_is_404_and_nobody_logged_in_is_401(self):
        self.assertEqual(client_for(self.admin).delete("/api/notifications/999999/").status_code, 404)
        self.assertEqual(APIClient().delete(f"/api/notifications/{self.mine.pk}/").status_code, 401)

    def test_the_public_never_gets_a_staff_notice(self):
        body = APIClient().get("/api/mobile/tourism/bootstrap/").json()
        public = APIClient().get("/api/notifications/public/").json()

        self.assertEqual(body["notifications"], [])
        self.assertEqual(public["results"], [])
