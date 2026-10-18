"""Put the nine "Boat Capacity and Fare" tiers the web form and the mobile app
have written in their code into the table.

DATA ONLY. The text is the one both clients have today, letter for letter,
INCLUDING the amounts written without a comma ("P1500", "P2000"): it is not
tidied here, because records already hold exactly this text, and a record keeps
the tier as text (TouristRecord.boat_capacity_fare). The copies are
frontend/src/tourism/pages/BookingManagement.js and mobile/lib/utils/helpers.dart.

A tier whose name already exists (capitals and spaces do not count, the same
comparison the Excel import uses) is left alone and logged: running this again,
or after an admin has added the same tier, adds nothing and changes nothing.

Reverse: deletes those nine rows (matched by their exact name) and nothing else.
A row added by hand stays.
"""
import logging

from django.db import migrations

logger = logging.getLogger(__name__)

# In the order of the dropdown. Do not "fix" the commas.
TIERS = [
    "1-2 pax (One-Way P1500, Two-way P2000)",
    "3-4 pax (One-Way P2000, Two-way P2,500)",
    "5-6 pax (One-Way P2,500, Two-way P3,000)",
    "7-8 pax (One-Way P3,000, Two-way P3,500)",
    "9-10 pax (One-Way P3,500, Two-way P4,000)",
    "11-12 pax (One-Way P4,000, Two-way P4,500)",
    "13-14 pax (One-Way P4,500, Two-way P5,000)",
    "15-17 pax (One-Way P5,000, Two-way P5,500)",
    "18-20 pax (One-Way P5,500, Two-way P6,000)",
]
# gaps between the orders, so a tier can be put between two later
FIRST_ORDER = 10
STEP = 10


def _key(value):
    """What "the same name" means: the import's own comparison
    (online_booking.normalize_key): trimmed, inner spaces collapsed, lower case.
    Written out here so that this migration does not depend on application code
    that may change later."""
    return " ".join(str(value).split()).lower()


def add_tiers(apps, schema_editor):
    BoatCapacityFare = apps.get_model("api", "BoatCapacityFare")
    alias = schema_editor.connection.alias if schema_editor else "default"
    rows = BoatCapacityFare.objects.using(alias)

    existing = {_key(name) for name in rows.values_list("name", flat=True)}
    for index, name in enumerate(TIERS):
        if _key(name) in existing:
            logger.warning("0056 skipped %r: a tier with this name already exists", name)
            continue
        rows.create(name=name, display_order=FIRST_ORDER + index * STEP)
        existing.add(_key(name))


def remove_tiers(apps, schema_editor):
    BoatCapacityFare = apps.get_model("api", "BoatCapacityFare")
    alias = schema_editor.connection.alias if schema_editor else "default"
    BoatCapacityFare.objects.using(alias).filter(name__in=TIERS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0055_boat_capacity_fare"),
    ]

    operations = [
        migrations.RunPython(add_tiers, remove_tiers),
    ]
