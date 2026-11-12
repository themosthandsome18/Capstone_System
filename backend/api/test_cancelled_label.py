"""A booking that did not happen is SHOWN as "Cancelled", and still STORED as "no_show".

Since 2026-11-12 people see "Cancelled" (the person who checks the system asked for it). The stored value was not renamed, so the data already in the
database is untouched. Two promises are tested here:
  1. no word "No-show" is written in any text a person can read (the backend text, and the source of the web and mobile screens);
  2. the value in the database is still "no_show".
"""
import re
from pathlib import Path

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings

from .models import BOOKING_STATUS_CHOICES, BOOKING_STATUS_NO_SHOW, Resort, TouristRecord
from .services.no_show import sweep_no_shows
from .services.tourism import get_validation
from .test_destination_accuracy import arrive, make_resort
from .tests import ensure_test_reference_tables

REPO = Path(__file__).resolve().parents[2]
# A quoted string or JSX text that holds the words "no show" / "no-show" / "No-show" (not no_show and not noShow, which are names).
VISIBLE_WORDS = re.compile(r"""["'`>][^"'`<>\n]*\bno[- ]show""", re.IGNORECASE)


def source_files(folder, suffixes):
    for path in sorted((REPO / folder).rglob("*")):
        if path.suffix not in suffixes or not path.is_file():
            continue
        name = path.name
        parts = set(path.parts)
        if parts & {"node_modules", "build", ".dart_tool", "migrations", "__pycache__", ".venv"}:
            continue
        if ".test." in name or name.endswith("_test.dart") or name.startswith("test_") or name in {"tests.py", "seed_data.py"}:
            continue
        yield path


def visible_lines(path):
    in_docstring = False
    for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        code = line.strip()
        if path.suffix == ".py":
            quotes = code.count('"""')
            was_inside = in_docstring
            if quotes % 2:
                in_docstring = not in_docstring
            if was_inside or quotes:
                continue  # a docstring is not on a screen
        if code.startswith(("//", "#", "/*", "*", "///", "<!--")):
            continue  # a comment is not on a screen
        if VISIBLE_WORDS.search(line):
            yield number, code


@override_settings(USE_SEED_DATA=False)
class CancelledIsShownNoShowIsStoredTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        self.resort = make_resort(1, "Label Resort")

    def test_the_stored_value_is_still_no_show(self):
        self.assertEqual(BOOKING_STATUS_NO_SHOW, "no_show")
        self.assertIn(("no_show", "Cancelled"), BOOKING_STATUS_CHOICES)
        arrive(self.resort, "LBL-1", 3, status="no_show")
        with connection.cursor() as cursor:
            cursor.execute("SELECT status FROM api_touristrecord WHERE survey_id = %s", ["LBL-1"])
            self.assertEqual(cursor.fetchone()[0], "no_show")

    def test_the_sweep_still_writes_no_show(self):
        from datetime import timedelta
        from django.utils import timezone

        record = arrive(self.resort, "LBL-2", 3, when=timezone.localdate() - timedelta(days=3), status="pending")
        sweep_no_shows()
        with connection.cursor() as cursor:
            cursor.execute("SELECT status FROM api_touristrecord WHERE survey_id = %s", [record.pk])
            self.assertEqual(cursor.fetchone()[0], "no_show")

    def test_the_label_a_person_reads_is_cancelled(self):
        record = arrive(self.resort, "LBL-3", 3, status="no_show")
        self.assertEqual(TouristRecord.objects.get(pk=record.pk).get_status_display(), "Cancelled")

    def test_the_validation_answer_and_chart_say_cancelled(self):
        arrive(self.resort, "LBL-4", 3, status="no_show")
        answer, visual = get_validation(TouristRecord.objects.all())
        self.assertIn("1 cancelled", answer)
        self.assertNotRegex(answer, r"(?i)no[- ]show")
        self.assertEqual([item["label"] for item in visual["items"]], ["Pending", "Cancelled", "Duplicates", "Incomplete"])


class NoNoShowWordOnAnyScreenTests(TestCase):
    def test_backend_text(self):
        found = [(str(p.relative_to(REPO)), n, c) for p in source_files("backend/api", {".py"}) for n, c in visible_lines(p)]
        self.assertEqual(found, [])

    def test_web_screens(self):
        found = [(str(p.relative_to(REPO)), n, c) for p in source_files("frontend/src", {".js", ".jsx"}) for n, c in visible_lines(p)]
        self.assertEqual(found, [])

    def test_mobile_screens(self):
        found = [(str(p.relative_to(REPO)), n, c) for p in source_files("mobile/lib", {".dart"}) for n, c in visible_lines(p)]
        self.assertEqual(found, [])
