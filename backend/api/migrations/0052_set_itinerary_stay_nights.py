"""Set Itinerary.stay_nights for the itineraries the LGU approved a length for.

DATA ONLY: no column is added. Run the mapping below, by NAME and id together;
a row whose name does not match its id is skipped and reported, never guessed.

  id 1  Overnight                      = 1 night
  id 2  Same Day                       = 0 (same day)
  id 3  2 Nights                       = 2
  id 4  3 Nights                       = 3
  id 5  4 Nights                       = 4
  id 6  5 Nights and above             = 5
  id 7  6 Nights                       = 6   (the name reading gave 1: that is the fix)
  id 8  Que                            = not set
  id 9  Island Hopping Circuit         = not set
  id 10 Beach and Resort Day Tour      = 0 (same day)
  id 11 Heritage and Lighthouse Stop   = not set
  id 12 Eco Adventure Trail            = not set

"Not set" stays NULL, so the reports keep reading the name of those rows, as
before. A row that already has a stay_nights is left alone (an admin may have
set it). Re-running changes nothing more.

Reverse: every stay_nights goes back to NULL, as it was before this migration.
"""
import sys

from django.db import migrations

# (id, name, stay_nights) ; None = leave it not set
MAPPING = [
    (1, "Overnight", 1),
    (2, "Same Day", 0),
    (3, "2 Nights", 2),
    (4, "3 Nights", 3),
    (5, "4 Nights", 4),
    (6, "5 Nights and above", 5),
    (7, "6 Nights", 6),
    (8, "Que", None),
    (9, "Island Hopping Circuit", None),
    (10, "Beach and Resort Day Tour", 0),
    (11, "Heritage and Lighthouse Stop", None),
    (12, "Eco Adventure Trail", None),
]


def _key(text):
    return " ".join(str(text).split()).lower()


def set_stay_nights(apps, schema_editor):
    Itinerary = apps.get_model("api", "Itinerary")
    alias = schema_editor.connection.alias if schema_editor else "default"
    rows = Itinerary.objects.using(alias)
    notes = []

    for pk, name, nights in MAPPING:
        row = rows.filter(pk=pk).first()
        if row is None:
            if rows.exists():
                notes.append(f"id {pk} ({name}): no such row, skipped")
            continue
        if _key(row.name) != _key(name):
            notes.append(f"id {pk}: the name is {row.name!r}, expected {name!r}, skipped")
            continue
        if nights is None:
            continue
        # only a row that is not set yet: never overwrite what an admin set
        rows.filter(pk=pk, stay_nights__isnull=True).update(stay_nights=nights)

    if notes:
        sys.stdout.write("0052 set_itinerary_stay_nights: " + "; ".join(notes) + "\n")


def clear_stay_nights(apps, schema_editor):
    Itinerary = apps.get_model("api", "Itinerary")
    alias = schema_editor.connection.alias if schema_editor else "default"
    Itinerary.objects.using(alias).update(stay_nights=None)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0051_reference_options_active_and_stay"),
    ]

    operations = [
        migrations.RunPython(set_stay_nights, clear_stay_nights),
    ]
