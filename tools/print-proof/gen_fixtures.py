"""Generate the stand-in server's fixtures for the print proof, read-only, from the
database the backend is configured for (backend/.env).

Run from the repository root with the backend's Python:
    backend/venv/Scripts/python.exe tools/print-proof/gen_fixtures.py

Writes tools/print-proof/fixtures/responses.json (git-ignored, never committed).

Everything is read inside a READ ONLY transaction that is rolled back; the two
writers the real bootstrap view also calls (initial-data seeding and the no-show
sweep) are not called. Visitor-level data is stripped: the bootstrap's booking
rows are emptied, tourist records and feedback are empty. Before anything is
written, the whole result is checked for visitor data (see fixture_guard.py); on
any match the script exits non-zero, names what matched and where, and writes
nothing.

--keep-booking-rows skips the stripping of booking rows. It exists only to prove
that the guard refuses: with it the script must exit non-zero and write nothing.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django  # noqa: E402

django.setup()

from django.db import connection, transaction  # noqa: E402
from rest_framework.renderers import JSONRenderer  # noqa: E402

from api.models import TouristRecord  # noqa: E402
from api.services.tourism import (  # noqa: E402
    REPORT_TYPES,
    build_arrival_monitoring_payload,
    build_booking_management_payload,
    build_dashboard_payload,
    build_reference_tables_payload,
    build_reports_payload,
    build_tourism_question_answers,
    get_cached_tourism_theme,
    get_reporting_years,
)

sys.path.insert(0, HERE)
from fixture_guard import find_visitor_data  # noqa: E402

OUT_DIR = os.path.join(HERE, "fixtures")
OUT = os.path.join(OUT_DIR, "responses.json")
YEARS = ("all", "2026", "2027")
keep_booking_rows = "--keep-booking-rows" in sys.argv[1:]


def render(data):
    return json.loads(JSONRenderer().render(data))


with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute("SET TRANSACTION READ ONLY")
    # Every visitor name, for the guard only: held in memory, never written.
    names = set()
    for full, first, last in TouristRecord.objects.values_list("full_name", "first_name", "last_name"):
        for name in (full, first, last):
            if name and len(name.strip()) >= 3:
                names.add(name.strip())

    reports = {}
    for year in YEARS:
        for report_type in REPORT_TYPES:
            reports[f"{report_type}|{year}"] = render(
                build_reports_payload({"year": year, "type": report_type, "include_questions": "false"})
            )
        reports[f"questions|{year}"] = render(build_tourism_question_answers({"year": year}))

    booking = render(build_booking_management_payload())
    if not keep_booking_rows:
        # Reports never reads booking rows; keep only the counts and the paging.
        booking["rows"] = []
    report_data = dict(reports["resort|all"])
    report_data["questionAnswers"] = reports["questions|all"]
    bootstrap = render({
        "referenceTables": build_reference_tables_payload(),
        "touristRecords": [],
        "bookingManagement": booking,
        "feedbackEntries": [],
        "arrivalMonitoring": build_arrival_monitoring_payload(),
        "dashboardData": build_dashboard_payload(),
        "reportData": report_data,
        "reportingYears": get_reporting_years(),
        "theme": get_cached_tourism_theme(),
    })
    transaction.set_rollback(True)

responses = {"bootstrap": bootstrap, "reports": reports}
problems = find_visitor_data(responses, names)
if problems:
    print("REFUSED: visitor data found; nothing was written.", file=sys.stderr)
    for section, pattern, count in problems:
        print(f"  {section}: {pattern} ({count} match{'es' if count != 1 else ''})", file=sys.stderr)
    sys.exit(2)

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as handle:
    json.dump(responses, handle)
print(f"Wrote {os.path.relpath(OUT, REPO)}: {len(reports)} report payloads and the bootstrap; visitor-data check clean.")
