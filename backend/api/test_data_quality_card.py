"""The Data Quality card of Analytics: two honest counts of RECORDS, and nothing else.

  * Possible duplicates: the records that share the same name, contact number, arrival date and resort with at least one other record. Three identical
    records are 3, not 1.
  * Incomplete records: no name, or no contact number, or zero visitors counted. Nothing else.

Pending and cancelled are not counted: a visitor who is still to come, or did not come, says nothing about the data. The record set is as it always was
(every record of the selected year and dates, any status, archived included): it is the same set every other count of the system uses.
"""
from datetime import date

from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Resort, TouristRecord
from .services.tourism import build_tourism_question_answers, get_validation
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

DAY = date(2026, 5, 4)


@override_settings(USE_SEED_DATA=False)
class DataQualityCardTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Quality Resort")
        self.other = make_resort(2, "Other Resort")
        self.n = 0

    def record(self, resort=None, when=DAY, status="arrived", name="Ana Cruz", contact="09171234567", people=2, **extra):
        """One complete record of its own, unless `extra` or the arguments say otherwise. Each gets a number of its own, so that two of them are not
        duplicates of each other unless the test makes them so."""
        self.n += 1
        record = arrive(resort or self.resort, f"DQ-{self.n:03d}", people, when=when, status=status)
        TouristRecord.objects.filter(pk=record.pk).update(full_name=name, contact_number=contact, **extra)
        return record

    def card(self, **params):
        params.setdefault("year", "2026")
        item = next(q for q in build_tourism_question_answers(params) if q["id"] == "validation")
        counts = {entry["label"]: entry["value"] for entry in item["visual"]["items"]}
        return item, counts["Possible duplicates"], counts["Incomplete records"]

    # -- the card says only what it counts ------------------------------------------------------------------------------------------------

    def test_it_has_two_counts_and_says_what_each_one_is(self):
        item, duplicates, incomplete = self.card()
        self.assertEqual(item["visual"]["type"], "counts")
        self.assertEqual([entry["label"] for entry in item["visual"]["items"]], ["Possible duplicates", "Incomplete records"])
        for entry in item["visual"]["items"]:
            self.assertTrue(entry["note"])  # what the number means
        self.assertIn("same name, contact number, arrival date and resort", item["answer"])
        self.assertIn("no name, no contact number, or no visitors counted", item["answer"])
        self.assertEqual((duplicates, incomplete), (0, 0))

    def test_the_question_says_what_the_card_holds(self):
        item, _, _ = self.card()
        self.assertEqual(item["question"], "How many tourist records look like duplicates, or are missing a name, a contact number or a visitor count?")
        self.assertNotRegex(item["question"], r"(?i)pending|cancel|status|validation")

    # -- pending and cancelled are NOT counted --------------------------------------------------------------------------------------------

    def test_pending_and_cancelled_are_not_counted(self):
        for status in ("pending", "pending", "no_show", "no_show", "no_show", "arrived"):
            self.record(status=status, contact=f"09{self.n:09d}")  # complete, and different from each other
        item, duplicates, incomplete = self.card()
        self.assertEqual((duplicates, incomplete), (0, 0))
        self.assertNotRegex(item["answer"], r"(?i)pending|cancel|no[- ]show")
        self.assertEqual({entry["label"] for entry in item["visual"]["items"]}, {"Possible duplicates", "Incomplete records"})

    def test_a_pending_and_a_cancelled_record_that_are_also_incomplete_count_as_incomplete_but_not_for_their_status(self):
        self.record(status="pending", name="")
        self.record(status="no_show", contact="")
        _, duplicates, incomplete = self.card()
        self.assertEqual((duplicates, incomplete), (0, 2))

    # -- duplicates: records, not groups ----------------------------------------------------------------------------------------------------

    def test_three_identical_records_are_three_not_one(self):
        for _ in range(3):
            self.record()
        _, duplicates, _ = self.card()
        self.assertEqual(duplicates, 3)

    def test_the_records_of_every_group_are_added_and_a_record_of_its_own_is_not_counted(self):
        for _ in range(3):
            self.record(name="Ana Cruz")
        for _ in range(2):
            self.record(name="Ben Reyes", contact="09170000002")
        self.record(name="Cora Lim", contact="09170000003")  # alone
        _, duplicates, _ = self.card()
        self.assertEqual(duplicates, 5)

    def test_a_pair_is_two(self):
        self.record()
        self.record()
        self.assertEqual(self.card()[1], 2)

    def test_every_part_of_the_basis_matters(self):
        """Same name, contact, date AND resort: one of them different and they are not duplicates."""
        base = dict(name="Ana Cruz", contact="09171234567")
        self.record(**base)
        self.record(when=date(2026, 5, 5), **base)  # another day
        self.record(resort=self.other, **base)  # another resort
        self.record(name="Ana Cruz Jr", contact="09171234567")  # another name
        self.record(name="Ana Cruz", contact="09179999999")  # another contact number
        self.assertEqual(self.card()[1], 0)

    def test_a_record_with_no_contact_number_is_never_matched_as_a_duplicate(self):
        self.record(contact="")
        self.record(contact="")
        _, duplicates, incomplete = self.card()
        self.assertEqual(duplicates, 0)
        self.assertEqual(incomplete, 2)  # they are incomplete, though

    # -- incomplete: the three things, and nothing else -----------------------------------------------------------------------------------

    def test_it_counts_a_blank_name_a_blank_contact_and_zero_visitors(self):
        self.record(name="", contact="09170000001")
        self.record(contact="")
        r = self.record(contact="09170000003")
        TouristRecord.objects.filter(pk=r.pk).update(total_visitors=0)
        _, _, incomplete = self.card()
        self.assertEqual(incomplete, 3)

    def test_a_record_with_two_of_the_three_missing_is_one_record(self):
        self.record(name="", contact="")
        self.assertEqual(self.card()[2], 1)

    def test_nothing_else_makes_a_record_incomplete(self):
        """No email, no country of origin, no parking, no boat fare, no region or province, a zero in the other counts: not looked at."""
        r = self.record()
        TouristRecord.objects.filter(pk=r.pk).update(
            email="", country_of_origin="", parking_space="", boat_capacity_fare="", region=None, province=None,
            special_group_count=0, discounted_count=0, maubanin_count=0, foreigner_count=0, age_0_7=0, age_60_above=0,
        )
        self.assertEqual(self.card()[2], 0)

    def test_the_old_conditions_that_could_never_be_true_are_gone(self):
        """total_male and total_female are not nullable (default 0): checking them for NULL could not find anything, and made the check look wider."""
        import inspect

        source = inspect.getsource(get_validation)
        self.assertNotIn("isnull", source)
        self.assertFalse(TouristRecord._meta.get_field("total_male").null)
        self.assertFalse(TouristRecord._meta.get_field("total_female").null)

    # -- the set of records is as it was ------------------------------------------------------------------------------------------------------

    def test_archived_and_every_status_are_still_in_the_set(self):
        for status, archived in (("arrived", False), ("pending", False), ("no_show", True), ("arrived", True)):
            self.record(status=status, name="", is_archived=archived, contact=f"09{self.n:09d}")
        _, _, incomplete = self.card()
        self.assertEqual(incomplete, 4)  # the archived and the pending and the cancelled ones are counted, as in every other figure

    def test_duplicates_across_an_archived_and_a_live_record_count_both(self):
        self.record()
        self.record(is_archived=True)
        self.assertEqual(self.card()[1], 2)

    def test_the_year_and_the_dates_still_select_the_records(self):
        self.record(name="")
        self.record(name="", when=date(2025, 5, 4))
        self.assertEqual(self.card(year="2026")[2], 1)
        self.assertEqual(self.card(year="all")[2], 2)
        self.assertEqual(self.card(year="2026", **{"from": "2026-05-05"})[2], 0)
        self.assertEqual(self.card(year="2026", to="2026-05-04")[2], 1)

    def test_the_resort_filter_is_not_applied(self):
        """As for every insight of this page: the year and the dates are followed, the resort is not (said by the answer's own words)."""
        self.record(name="")
        self.record(name="", resort=self.other)
        self.assertEqual(self.card(resort_id=str(self.resort.resort_id))[2], 2)

    # -- the answer's words --------------------------------------------------------------------------------------------------------------------

    def test_the_answer_is_grammatical_for_one_and_for_many(self):
        self.record(name="", contact="09170000011")
        answer = get_validation(TouristRecord.objects.all())[0]
        self.assertIn("0 records look like duplicates", answer)
        self.assertIn("1 is incomplete", answer)
        self.record(name="", contact="09170000012")
        self.assertIn("2 are incomplete", get_validation(TouristRecord.objects.all())[0])
        for _ in range(2):
            self.record(name="Ana Cruz")
        answer = get_validation(TouristRecord.objects.all())[0]
        self.assertIn("2 records look like duplicates", answer)
        self.assertIn("All records of the selected year and dates are counted, whatever their status.", answer)
        TouristRecord.objects.all().delete()
        self.record(name="X", contact="09170000009")
        self.assertIn("0 records look like duplicates", get_validation(TouristRecord.objects.all())[0])

    def test_the_visual_is_the_same_two_counts_as_the_answer(self):
        for _ in range(2):
            self.record()
        self.record(name="")
        answer, visual = get_validation(TouristRecord.objects.all())
        by_label = {entry["label"]: entry["value"] for entry in visual["items"]}
        self.assertEqual(by_label, {"Possible duplicates": 2, "Incomplete records": 1})
        self.assertIn("2 records look like duplicates", answer)
        self.assertIn("1 is incomplete", answer)
