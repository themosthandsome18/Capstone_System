"""The dashboard's classification carries the Maubanin count: a SUBSET of the Filipino count, in the same year filter, never added on top of it."""
from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Resort, TouristRecord
from .services.tourism import build_dashboard_payload
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables


@override_settings(USE_SEED_DATA=False)
class ClassificationMaubaninTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Classification Resort")
        clock = patch("django.utils.timezone.localdate", return_value=date(2026, 11, 11))
        clock.start()
        self.addCleanup(clock.stop)
        self.counter = 0

    def record(self, filipino, maubanin, foreign=0, when=date(2026, 5, 1), status="arrived"):
        self.counter += 1
        rec = arrive(self.resort, f"MAU-{self.counter:04d}", filipino + foreign, when=when, status=status)
        TouristRecord.objects.filter(pk=rec.pk).update(filipino_count=filipino, maubanin_count=maubanin, foreigner_count=foreign)
        return rec

    def classification(self, year="2026"):
        return build_dashboard_payload({"year": year})["classification"]

    def test_the_payload_carries_the_maubanin_count(self):
        self.record(filipino=10, maubanin=4)
        self.record(filipino=5, maubanin=1, foreign=2)

        classification = self.classification()

        self.assertEqual(classification["maubanin"], 5)
        self.assertEqual(classification["filipino"], 15)
        self.assertEqual(classification["foreign"], 2)

    def test_maubanin_is_not_added_on_top_of_filipino_or_foreign(self):
        self.record(filipino=10, maubanin=10, foreign=3)

        classification = self.classification()

        self.assertEqual(classification["filipino"], 10)
        self.assertEqual(classification["foreign"], 3)
        self.assertEqual(classification["filipino"] + classification["foreign"], 13)

    def test_it_is_zero_when_there_is_no_maubanin(self):
        self.record(filipino=7, maubanin=0)

        self.assertEqual(self.classification()["maubanin"], 0)

    def test_it_is_zero_with_no_records_at_all(self):
        self.assertEqual(self.classification()["maubanin"], 0)

    def test_it_follows_the_same_year_and_status_filter_as_domestic(self):
        self.record(filipino=10, maubanin=4, when=date(2026, 5, 1))
        self.record(filipino=20, maubanin=9, when=date(2025, 5, 1))
        self.record(filipino=8, maubanin=8, when=date(2026, 6, 1), status="pending")

        self.assertEqual((self.classification("2026")["filipino"], self.classification("2026")["maubanin"]), (10, 4))
        self.assertEqual((self.classification("2025")["filipino"], self.classification("2025")["maubanin"]), (20, 9))
        self.assertEqual((self.classification("all")["filipino"], self.classification("all")["maubanin"]), (30, 13))

    def test_it_never_exceeds_domestic_in_any_year(self):
        for filipino, maubanin, when in ((10, 10, date(2026, 1, 1)), (3, 0, date(2026, 2, 1)), (8, 5, date(2025, 3, 1)), (6, 6, date(2024, 4, 1))):
            self.record(filipino=filipino, maubanin=maubanin, when=when)

        for year in ("2024", "2025", "2026", "all"):
            with self.subTest(year=year):
                classification = self.classification(year)
                self.assertLessEqual(classification["maubanin"], classification["filipino"])
