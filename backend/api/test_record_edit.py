"""PATCH /api/tourist-records/<id>/ : what a tourist record may change, and what is written down when it does.

The data is the tourist's. A record may change only its head count, its Length of Stay, its resort and its status (the quick Arrived / Cancelled
switch of Record Management is a PATCH of the status alone, and must keep working). Every other field named in a PATCH is REFUSED with a 400
that names it, even when its value is the one the record has: it is never ignored. There is no PUT (405). POST (a new record) and the import are not
touched here: they keep every field.

The Activity Log says WHAT changed (the old value and the new, by the survey id and not the visitor's name).
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
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
    Country,
    Itinerary,
    Province,
    Resort,
    TouristRecord,
    TravelMode,
    BoatType,
    VisitPurpose,
    UserProfile,
)
from .serializers import TOURIST_RECORD_EDITABLE_FIELDS, TouristRecordSerializer
from .services.activity import LABEL_MAX, tourist_record_edit_label
from .services.tourism import entrance_fee, tourist_record_computed
from .test_destination_accuracy import make_resort
from .tests import ensure_test_reference_tables

URL = "/api/tourist-records/EDIT-1/"
IN = (ROLE_ADMIN, ROLE_TOURISM)
OUT = (ROLE_RESORT, ROLE_TOURIST, ROLE_SANITATION, ROLE_ESTABLISHMENT)

# the head count of EDIT-1: 4 people, 3 male and 1 female, 3 Filipino and 1 foreigner, 2 of them 8-59, 1 child, 1 senior; 1 pays the discounted fee
HEAD_COUNT = dict(
    total_visitors=4, foreigner_count=1, filipino_count=3, maubanin_count=1, total_male=3, total_female=1,
    age_0_7=1, age_8_59=2, age_60_above=1, special_group_count=0, discounted_count=1,
)
# the same group with one person fewer (3 people), and the discounted count lowered with it
THREE_PEOPLE = dict(
    total_visitors=3, foreigner_count=1, filipino_count=2, maubanin_count=1, total_male=2, total_female=1,
    age_0_7=1, age_8_59=1, age_60_above=1, special_group_count=0, discounted_count=1,
)


@override_settings(USE_SEED_DATA=False)
class RecordEditBase(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Old Resort")
        self.other_resort = make_resort(2, "New Resort")
        self.long_stay = Itinerary.objects.create(id=9101, name="5 Nights and above", stay_nights=5)
        self.short_stay = Itinerary.objects.create(id=9102, name="2 Nights", stay_nights=2)
        quezon = Province.objects.get(name="Quezon")
        self.record = TouristRecord.objects.create(
            survey_id="EDIT-1", first_name="Zelda", last_name="Quimpo", full_name="Zelda Quimpo", email="zelda@example.com",
            contact_number="+639171234567", country=Country.objects.get(name="Philippines"), region=quezon.region, province=quezon,
            arrival_date="2026-05-01", resort=self.resort, itinerary=self.long_stay, travel_mode=TravelMode.objects.first(),
            boat_type=BoatType.objects.first(), visit_purpose=VisitPurpose.objects.first(), status="pending", **HEAD_COUNT,
        )
        self.clients, self.users = {}, {}
        for role in IN + OUT:
            user = User.objects.create(username=f"edit_{role}", email=f"{role}@test.local")
            UserProfile.objects.create(user=user, role=role)
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
            self.clients[role], self.users[role] = client, user
        self.admin = self.clients[ROLE_ADMIN]

    def reload(self):
        return TouristRecord.objects.get(pk="EDIT-1")

    def logs(self):
        return list(ActivityLog.objects.filter(record_id="EDIT-1", action="update").values_list("record_label", flat=True))


class WhatMayChangeTests(RecordEditBase):
    def test_the_three_are_set_and_really_change(self):
        body = {**THREE_PEOPLE, "itinerary_id": self.short_stay.id, "resort_id": self.other_resort.resort_id}

        response = self.admin.patch(URL, body, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        record = self.reload()
        self.assertEqual(
            (record.total_visitors, record.itinerary_id, record.resort_id),
            (3, self.short_stay.id, self.other_resort.resort_id),
        )
        self.assertEqual((record.filipino_count, record.total_male, record.age_0_7, record.discounted_count), (2, 2, 1, 1))
        self.assertEqual(response.json()["total_visitors"], 3)  # the answer is the record as it is now
        self.assertEqual(response.json()["resort_id"], self.other_resort.resort_id)

    def test_the_whole_head_count_can_be_changed_not_only_the_total(self):
        body = dict(
            total_visitors=5, foreigner_count=2, filipino_count=3, maubanin_count=2, total_male=2, total_female=3,
            age_0_7=0, age_8_59=4, age_60_above=1, special_group_count=2, discounted_count=3,
        )

        self.assertEqual(self.admin.patch(URL, body, format="json").status_code, 200)

        record = self.reload()
        for field, value in body.items():
            self.assertEqual(getattr(record, field), value, field)

    def test_the_figures_that_are_worked_out_follow(self):
        self.admin.patch(URL, {**THREE_PEOPLE, "itinerary_id": self.short_stay.id}, format="json")

        computed = tourist_record_computed(TouristRecord.objects.select_related("itinerary").get(pk="EDIT-1"))

        self.assertEqual(computed["fee"]["total"], entrance_fee(3, 1))  # (3 - 1) x 80 + 1 x 64: nothing was stored, so nothing was left old
        self.assertEqual(computed["overnight"]["total"], 2 * 3)  # 2 nights x (2 male + 1 female)
        self.assertEqual(computed["sameDay"]["total"], 3 * 3)

    def test_a_patch_that_names_only_one_of_the_three_leaves_the_rest(self):
        self.assertEqual(self.admin.patch(URL, {"resort_id": self.other_resort.resort_id}, format="json").status_code, 200)
        record = self.reload()
        self.assertEqual((record.resort_id, record.itinerary_id, record.total_visitors), (self.other_resort.resort_id, self.long_stay.id, 4))

    def test_an_arrived_record_can_be_changed(self):
        TouristRecord.objects.filter(pk="EDIT-1").update(status="arrived")
        self.assertEqual(self.admin.patch(URL, {"itinerary_id": self.short_stay.id}, format="json").status_code, 200)
        self.assertEqual(self.reload().itinerary_id, self.short_stay.id)

    def test_the_status_flip_still_works(self):
        for target in ("arrived", "no_show", "pending", "arrived"):
            with self.subTest(target=target):
                response = self.admin.patch(URL, {"status": target}, format="json")
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()["status"], target)
                self.assertEqual(self.reload().status, target)

    def test_a_bad_status_is_a_400(self):
        response = self.admin.patch(URL, {"status": "teleported"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.json())

    def test_the_tourism_office_may_too(self):
        self.assertEqual(self.clients[ROLE_TOURISM].patch(URL, {"resort_id": self.other_resort.resort_id}, format="json").status_code, 200)

    def test_an_empty_patch_is_fine_and_changes_nothing(self):
        before = self.reload().total_visitors
        self.assertEqual(self.admin.patch(URL, {}, format="json").status_code, 200)
        self.assertEqual(self.reload().total_visitors, before)
        self.assertEqual(self.logs(), [])


class WhatIsRefusedTests(RecordEditBase):
    # (field, a value that is NOT the record's own)
    CLOSED = [
        ("first_name", "Other"), ("last_name", "Other"), ("full_name", "Other Person"), ("email", "other@example.com"),
        ("contact_number", "+639170000000"), ("country_id", 1), ("region_id", 1), ("province_id", 1), ("arrival_date", "2026-06-01"),
        ("travel_mode_id", 1), ("boat_type_id", 1), ("visit_purpose_id", 1), ("boat_capacity_fare", "Other"), ("parking_space", "Lot 9"),
        ("consent_confirmed", False), ("country_of_origin", "Elsewhere"), ("submitted_at", "2026-01-01T00:00:00Z"),
        ("survey_id", "EDIT-2"), ("created_at", "2001-01-01T00:00:00Z"), ("is_archived", True), ("checked_in_by", 1), ("no_such_field", "x"),
    ]

    def test_each_one_is_a_400_that_names_it_and_nothing_is_written(self):
        before = TouristRecord.objects.filter(pk="EDIT-1").values().get()
        for field, value in self.CLOSED:
            with self.subTest(field=field):
                response = self.admin.patch(URL, {field: value}, format="json")
                self.assertEqual(response.status_code, 400, (field, response.content))
                self.assertEqual(list(response.json()), [field])
                self.assertIn("cannot be changed here", response.json()[field][0])
        self.assertEqual(TouristRecord.objects.filter(pk="EDIT-1").values().get(), before)
        self.assertEqual(self.logs(), [])

    def test_the_name_the_email_and_the_arrival_date_say_so(self):
        response = self.admin.patch(URL, {"full_name": "X", "email": "x@x.com", "arrival_date": "2026-06-01"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(sorted(response.json()), ["arrival_date", "email", "full_name"])  # every refused field is named, not only the first
        record = self.reload()
        self.assertEqual((record.full_name, record.email, str(record.arrival_date)), ("Zelda Quimpo", "zelda@example.com", "2026-05-01"))

    def test_a_closed_field_with_the_value_the_record_already_has_is_still_refused(self):
        for field, value in (("email", "zelda@example.com"), ("first_name", "Zelda"), ("arrival_date", "2026-05-01"), ("survey_id", "EDIT-1")):
            with self.subTest(field=field):
                response = self.admin.patch(URL, {field: value}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())

    def test_a_closed_field_next_to_an_allowed_one_refuses_the_whole_patch(self):
        response = self.admin.patch(URL, {"resort_id": self.other_resort.resort_id, "email": "x@x.com"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(list(response.json()), ["email"])
        self.assertEqual(self.reload().resort_id, self.resort.resort_id)  # the allowed half was not applied either
        self.assertEqual(self.logs(), [])

    def test_the_old_whole_body_is_refused(self):
        body = dict(TouristRecordSerializer(self.reload()).data)
        response = self.admin.patch(URL, body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("total_visitors", response.json())  # only the closed ones are named
        self.assertIn("email", response.json())

    def test_the_list_of_fields_is_exactly_this(self):
        self.assertEqual(
            set(TOURIST_RECORD_EDITABLE_FIELDS),
            {
                "foreigner_count", "filipino_count", "maubanin_count", "total_visitors", "total_male", "total_female", "age_0_7", "age_8_59",
                "age_60_above", "special_group_count", "discounted_count", "itinerary_id", "resort_id", "status",
            },
        )
        # and everything else the record's serializer has is closed
        closed = set(TouristRecordSerializer().fields) - set(TOURIST_RECORD_EDITABLE_FIELDS)
        self.assertEqual(
            closed,
            {
                "survey_id", "submitted_at", "email", "consent_confirmed", "first_name", "last_name", "full_name", "contact_number",
                "country_id", "region_id", "province_id", "country_of_origin", "arrival_date", "travel_mode_id", "boat_type_id",
                "boat_capacity_fare", "parking_space", "visit_purpose_id", "created_at",
            },
        )

    def test_there_is_no_put(self):
        body = dict(TouristRecordSerializer(self.reload()).data)
        self.assertEqual(self.admin.put(URL, body, format="json").status_code, 405)
        self.assertEqual(self.admin.delete(URL).status_code, 405)

    def test_a_new_record_still_takes_every_field(self):
        """POST is not narrowed: the same serializer, with the name and the rest."""
        body = dict(TouristRecordSerializer(self.reload()).data)
        body.pop("created_at")
        body["survey_id"] = "EDIT-NEW"
        body["first_name"], body["last_name"], body["full_name"] = "New", "Person", "New Person"
        response = self.admin.post("/api/tourist-records/", body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(TouristRecord.objects.get(pk="EDIT-NEW").full_name, "New Person")


class DiscountedAndHeadCountTests(RecordEditBase):
    def test_a_discounted_count_above_the_new_head_count_is_refused_in_words(self):
        response = self.admin.patch(URL, {**THREE_PEOPLE, "discounted_count": 4}, format="json")

        self.assertEqual(response.status_code, 400)
        message = response.json()["discounted_count"][0]
        self.assertIn("(4)", message)
        self.assertIn("(3)", message)
        self.assertIn("not changed for you", message)
        self.assertEqual((self.reload().total_visitors, self.reload().discounted_count), (4, 1))  # nothing was lowered or written

    def test_a_smaller_head_count_that_leaves_the_old_discounted_count_too_big_is_refused_not_lowered(self):
        TouristRecord.objects.filter(pk="EDIT-1").update(discounted_count=4)
        two = dict(total_visitors=2, foreigner_count=0, filipino_count=2, maubanin_count=0, total_male=1, total_female=1, age_0_7=0, age_8_59=2, age_60_above=0)

        response = self.admin.patch(URL, two, format="json")  # discounted_count is not sent: the 4 the record has would be left as it is

        self.assertEqual(response.status_code, 400)
        self.assertIn("discounted_count", response.json())
        self.assertEqual((self.reload().total_visitors, self.reload().discounted_count), (4, 4))

    def test_lowering_both_together_is_fine(self):
        two = dict(total_visitors=2, foreigner_count=0, filipino_count=2, maubanin_count=0, total_male=1, total_female=1, age_0_7=0, age_8_59=2, age_60_above=0, discounted_count=1)
        self.assertEqual(self.admin.patch(URL, two, format="json").status_code, 200)
        self.assertEqual((self.reload().total_visitors, self.reload().discounted_count), (2, 1))

    def test_the_total_must_equal_each_of_its_splits(self):
        cases = {
            "nationality": {"filipino_count": 5},  # 5 + 1 foreigner is 6, not 4
            "gender": {"total_male": 4},  # 4 + 1 female is 5, not 4
            "age": {"age_60_above": 2},  # 1 + 2 + 2 is 5, not 4
        }
        for name, body in cases.items():
            with self.subTest(name):
                response = self.admin.patch(URL, body, format="json")
                self.assertEqual(response.status_code, 400, response.content)
                self.assertIn("total_visitors", response.json())
        self.assertEqual(self.reload().total_visitors, 4)

    def test_the_other_rules_of_the_head_count_still_run(self):
        for name, body in {
            "maubanin above the Filipino": {"maubanin_count": 4},
            "special needs above the total": {"special_group_count": 5},
            "negative": {"total_male": -1},
            "not a number": {"age_0_7": "many"},
        }.items():
            with self.subTest(name):
                self.assertEqual(self.admin.patch(URL, body, format="json").status_code, 400)
        self.assertEqual(TouristRecord.objects.filter(pk="EDIT-1").values(*HEAD_COUNT).get(), HEAD_COUNT)

    def test_a_resort_or_a_stay_that_does_not_exist_is_a_400(self):
        self.assertEqual(self.admin.patch(URL, {"resort_id": 99999}, format="json").status_code, 400)
        self.assertEqual(self.admin.patch(URL, {"itinerary_id": 99999}, format="json").status_code, 400)

    def test_no_rule_ties_the_stay_to_the_resort_yet(self):
        """Left out on purpose (a later change): any resort with any length of stay is accepted, as in the web, the app and the backend."""
        self.assertEqual(self.admin.patch(URL, {"resort_id": self.other_resort.resort_id, "itinerary_id": self.short_stay.id}, format="json").status_code, 200)


class ActivityLogTests(RecordEditBase):
    def test_it_says_what_changed_with_the_old_and_the_new(self):
        body = {**THREE_PEOPLE, "itinerary_id": self.short_stay.id, "resort_id": self.other_resort.resort_id}

        self.admin.patch(URL, body, format="json")

        (label,) = self.logs()
        self.assertTrue(label.startswith("Record EDIT-1 edited: "), label)
        self.assertIn("pax 4 → 3", label)
        self.assertIn("length of stay 5 Nights and above → 2 Nights", label)
        self.assertIn("resort Old Resort → New Resort", label)
        self.assertIn("Filipinos 3 → 2", label)
        self.assertIn("male 3 → 2", label)
        self.assertIn("age 8-59 2 → 1", label)
        self.assertNotIn("foreigners", label)  # foreigner_count did not change: only what changed is named
        self.assertNotIn("discounted", label)
        self.assertNotIn("Maubanin", label)

    def test_the_three_come_first(self):
        self.admin.patch(URL, {**THREE_PEOPLE, "itinerary_id": self.short_stay.id, "resort_id": self.other_resort.resort_id}, format="json")
        (label,) = self.logs()
        self.assertLess(label.index("pax"), label.index("length of stay"))
        self.assertLess(label.index("length of stay"), label.index("resort"))
        self.assertLess(label.index("resort"), label.index("Filipinos"))

    def test_it_is_the_survey_id_and_not_the_visitors_name(self):
        self.admin.patch(URL, {**THREE_PEOPLE}, format="json")
        (label,) = self.logs()
        self.assertIn("EDIT-1", label)
        for private in ("Zelda", "Quimpo", "zelda@example.com", "+639171234567"):
            self.assertNotIn(private, label)

    def test_it_is_written_once_by_the_one_who_did_it_in_the_tourism_module(self):
        self.clients[ROLE_TOURISM].patch(URL, {"resort_id": self.other_resort.resort_id}, format="json")
        rows = ActivityLog.objects.filter(record_id="EDIT-1", action="update")
        self.assertEqual(rows.count(), 1)
        row = rows.get()
        self.assertEqual((row.user, row.module, row.record_type), (self.users[ROLE_TOURISM], "tourism", "TouristRecord"))

    def test_a_status_flip_is_named_with_the_words_the_screen_uses(self):
        self.admin.patch(URL, {"status": "no_show"}, format="json")
        self.assertEqual(self.logs(), ["Record EDIT-1 edited: status Pending → Cancelled"])

    def test_a_patch_that_changes_nothing_logs_nothing(self):
        self.admin.patch(URL, {"status": "pending", "resort_id": self.resort.resort_id, "total_visitors": 4}, format="json")
        self.assertEqual(self.logs(), [])

    def test_the_old_value_is_read_before_the_save(self):
        self.admin.patch(URL, {"resort_id": self.other_resort.resort_id}, format="json")
        self.admin.patch(URL, {"resort_id": self.resort.resort_id}, format="json")
        self.assertEqual(
            sorted(self.logs()),
            sorted(["Record EDIT-1 edited: resort Old Resort → New Resort", "Record EDIT-1 edited: resort New Resort → Old Resort"]),
        )

    def test_a_label_that_is_too_long_is_cut_with_an_ellipsis_and_does_not_fail(self):
        Resort.objects.filter(pk=self.resort.pk).update(resort_name="R" * 160)
        Resort.objects.filter(pk=self.other_resort.pk).update(resort_name="S" * 160)
        Itinerary.objects.filter(pk=self.long_stay.pk).update(name="L" * 120)
        Itinerary.objects.filter(pk=self.short_stay.pk).update(name="T" * 120)
        everything = dict(
            total_visitors=9, foreigner_count=4, filipino_count=5, maubanin_count=4, total_male=5, total_female=4, age_0_7=3, age_8_59=3,
            age_60_above=3, special_group_count=3, discounted_count=3, status="arrived",
            itinerary_id=self.short_stay.id, resort_id=self.other_resort.resort_id,
        )

        response = self.admin.patch(URL, everything, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        (label,) = self.logs()
        self.assertLessEqual(len(label), LABEL_MAX)
        self.assertTrue(label.endswith("…"), label)
        self.assertTrue(label.startswith("Record EDIT-1 edited: pax 4 → 9"), label)  # the three that matter are at the front, so the cut loses the least

    def test_the_label_helper_alone(self):
        before = dict(total_visitors=12, itinerary="5 Nights and above", resort="A", status="Pending", discounted_count=0)
        after = dict(total_visitors=9, itinerary="2 Nights", resort="A", status="Pending", discounted_count=0)
        self.assertEqual(
            tourist_record_edit_label("S-1", before, after),
            "Record S-1 edited: pax 12 → 9, length of stay 5 Nights and above → 2 Nights",
        )
        self.assertEqual(tourist_record_edit_label("S-1", before, before), "")

    def test_a_refused_patch_logs_nothing(self):
        self.admin.patch(URL, {"full_name": "X"}, format="json")
        self.admin.patch(URL, {**THREE_PEOPLE, "discounted_count": 9}, format="json")
        self.assertEqual(self.logs(), [])


class WhoMayTests(RecordEditBase):
    def test_every_other_role_is_403_and_nothing_changes(self):
        before = TouristRecord.objects.filter(pk="EDIT-1").values().get()
        for role in OUT:
            with self.subTest(role=role):
                response = self.clients[role].patch(URL, {**THREE_PEOPLE, "resort_id": self.other_resort.resort_id}, format="json")
                self.assertEqual(response.status_code, 403, role)
        self.assertEqual(TouristRecord.objects.filter(pk="EDIT-1").values().get(), before)
        self.assertEqual(self.logs(), [])

    def test_a_refused_role_is_403_before_the_fields_are_looked_at(self):
        self.assertEqual(self.clients[ROLE_SANITATION].patch(URL, {"email": "x@x.com"}, format="json").status_code, 403)

    def test_without_a_login_it_is_refused(self):
        response = APIClient().patch(URL, {"resort_id": self.other_resort.resort_id}, format="json")
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.reload().resort_id, self.resort.resort_id)

    def test_a_record_that_does_not_exist_is_404(self):
        self.assertEqual(self.admin.patch("/api/tourist-records/NOPE/", {"status": "arrived"}, format="json").status_code, 404)


class ArchivedRecordTests(RecordEditBase):
    """An archived record is still counted by every figure, but it is not EDITED: the head count, the Length of Stay and the resort are refused with a
    409 (the record's state, not wrong data), and the refusal comes before anything is written. Its status alone may still be put right, because what
    really happened (arrived or not) still counts."""

    def logs(self):
        """Only what an EDIT wrote: archive and unarchive write their own 'Record archived' / 'brought back' lines (as action update too)."""
        return [label for label in super().logs() if " edited: " in label]

    def archive(self):
        self.assertEqual(self.admin.post("/api/tourist-records/EDIT-1/archive/").status_code, 200)
        self.assertTrue(self.reload().is_archived)

    def unarchive(self):
        self.assertEqual(self.admin.post("/api/tourist-records/EDIT-1/unarchive/").status_code, 200)
        self.assertFalse(self.reload().is_archived)

    def row(self):
        return TouristRecord.objects.filter(pk="EDIT-1").values().get()

    # -- the GET says it ------------------------------------------------------------------------------------------------------------------

    def test_the_get_says_whether_it_is_archived(self):
        self.assertIs(self.admin.get(URL).json()["is_archived"], False)
        self.archive()
        self.assertIs(self.admin.get(URL).json()["is_archived"], True)
        self.unarchive()
        self.assertIs(self.admin.get(URL).json()["is_archived"], False)

    def test_it_is_read_only_a_patch_cannot_write_it(self):
        for value in (True, False):
            response = self.admin.patch(URL, {"is_archived": value}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(list(response.json()), ["is_archived"])
        self.assertFalse(self.reload().is_archived)
        self.archive()
        response = self.admin.patch(URL, {"is_archived": False}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.reload().is_archived)

    # -- what is refused -------------------------------------------------------------------------------------------------------------------

    def test_each_of_the_three_alone_is_a_409_and_nothing_changes(self):
        self.archive()
        before = self.row()
        cases = {
            "head count": dict(THREE_PEOPLE),
            "the total only": {"total_visitors": 4},
            "a single count": {"maubanin_count": 0},
            "length of stay": {"itinerary_id": self.short_stay.id},
            "resort": {"resort_id": self.other_resort.resort_id},
        }
        for name, body in cases.items():
            with self.subTest(name):
                response = self.admin.patch(URL, body, format="json")
                self.assertEqual(response.status_code, 409, (name, response.content))
                message = response.json()["detail"]
                self.assertIn("archived", message)
                self.assertIn("unarchive", message)
                self.assertEqual(response.json()["fields"], sorted(body))
        self.assertEqual(self.row(), before)
        self.assertEqual(self.logs(), [])

    def test_every_field_of_the_head_count_is_refused_one_by_one(self):
        self.archive()
        before = self.row()
        for field in ("foreigner_count", "filipino_count", "maubanin_count", "total_visitors", "total_male", "total_female", "age_0_7", "age_8_59",
                      "age_60_above", "special_group_count", "discounted_count"):
            with self.subTest(field):
                self.assertEqual(self.admin.patch(URL, {field: HEAD_COUNT[field]}, format="json").status_code, 409)
        self.assertEqual(self.row(), before)

    def test_the_status_together_with_the_head_count_is_a_409_and_NOTHING_is_saved_not_even_the_status(self):
        self.archive()
        before = self.row()
        for name, extra in {
            "the head count": dict(THREE_PEOPLE),
            "the length of stay": {"itinerary_id": self.short_stay.id},
            "the resort": {"resort_id": self.other_resort.resort_id},
            "all three": {**THREE_PEOPLE, "itinerary_id": self.short_stay.id, "resort_id": self.other_resort.resort_id},
        }.items():
            with self.subTest(name):
                response = self.admin.patch(URL, {"status": "arrived", **extra}, format="json")
                self.assertEqual(response.status_code, 409, response.content)
                self.assertEqual(response.json()["fields"], sorted(extra))  # the status is not what is refused: it is named by nothing
                self.assertEqual(self.row(), before)  # every column as it was: the status did not get through either
                self.assertEqual(self.reload().status, "pending")
        self.assertEqual(self.logs(), [])

    def test_a_refusal_writes_no_log_and_does_not_touch_updated_at(self):
        self.archive()
        stamp = self.reload().updated_at
        self.admin.patch(URL, {"total_visitors": 4, "status": "arrived"}, format="json")
        self.assertEqual(self.reload().updated_at, stamp)
        self.assertEqual(self.logs(), [])

    def test_a_closed_field_is_still_a_400_that_names_it_not_a_409(self):
        self.archive()
        for body in ({"email": "x@x.com"}, {"first_name": "X", "total_visitors": 4}, {"is_archived": False, "resort_id": self.other_resort.resort_id}):
            with self.subTest(body):
                response = self.admin.patch(URL, body, format="json")
                self.assertEqual(response.status_code, 400, response.content)
                self.assertNotIn("detail", response.json())
                self.assertTrue(set(response.json()) <= set(body))

    def test_an_empty_patch_on_an_archived_record_is_fine(self):
        self.archive()
        self.assertEqual(self.admin.patch(URL, {}, format="json").status_code, 200)

    def test_the_other_roles_are_still_403_first(self):
        self.archive()
        for role in OUT:
            with self.subTest(role=role):
                self.assertEqual(self.clients[role].patch(URL, {"total_visitors": 4}, format="json").status_code, 403)

    # -- what is allowed -------------------------------------------------------------------------------------------------------------------

    def test_the_status_alone_is_allowed_and_really_changes(self):
        self.archive()
        for target in ("arrived", "no_show", "pending", "arrived"):
            with self.subTest(target=target):
                response = self.admin.patch(URL, {"status": target}, format="json")
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()["status"], target)
                self.assertEqual(self.reload().status, target)
        self.assertTrue(self.reload().is_archived)  # putting the status right does not bring the record back
        self.assertEqual(len(self.logs()), 4)

    def test_the_status_flip_is_logged_for_an_archived_record_as_for_any_other(self):
        self.archive()
        self.admin.patch(URL, {"status": "arrived"}, format="json")
        self.assertEqual(self.logs(), ["Record EDIT-1 edited: status Pending → Arrived"])

    def test_the_status_and_the_unchanged_head_count_is_still_refused(self):
        """Even the values the record already has: naming a field of the head count on an archived record is the refusal, as a closed field is (a
        PATCH is for what changes)."""
        self.archive()
        response = self.admin.patch(URL, {"status": "arrived", "total_visitors": 4}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.reload().status, "pending")

    # -- and after it is brought back, all of it works --------------------------------------------------------------------------------------

    def test_everything_works_again_after_it_is_brought_back(self):
        self.archive()
        self.assertEqual(self.admin.patch(URL, {"resort_id": self.other_resort.resort_id}, format="json").status_code, 409)
        self.unarchive()

        response = self.admin.patch(URL, {**THREE_PEOPLE, "itinerary_id": self.short_stay.id, "resort_id": self.other_resort.resort_id, "status": "arrived"}, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        record = self.reload()
        self.assertEqual(
            (record.total_visitors, record.itinerary_id, record.resort_id, record.status),
            (3, self.short_stay.id, self.other_resort.resort_id, "arrived"),
        )

    def test_each_of_the_three_alone_works_after_unarchive(self):
        self.archive()
        self.unarchive()
        self.assertEqual(self.admin.patch(URL, dict(THREE_PEOPLE), format="json").status_code, 200)
        self.assertEqual(self.admin.patch(URL, {"itinerary_id": self.short_stay.id}, format="json").status_code, 200)
        self.assertEqual(self.admin.patch(URL, {"resort_id": self.other_resort.resort_id}, format="json").status_code, 200)
        self.assertEqual(self.admin.patch(URL, {"status": "no_show"}, format="json").status_code, 200)
        self.assertEqual(len(self.logs()), 4)

    def test_archive_and_unarchive_themselves_are_not_affected(self):
        self.archive()
        self.archive()  # twice is fine (it logs nothing the second time)
        self.unarchive()
        self.unarchive()
