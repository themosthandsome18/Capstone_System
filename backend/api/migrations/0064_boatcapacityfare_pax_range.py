"""min_pax and max_pax on a Boat Capacity and Fare tier, and fill them from the
name the tier already has.

"1-2 pax (One-Way P1500, Two-way P2000)" -> 1 and 2. Only the number range at the
START of the name is read. A name that does not begin that way ("21+ pax", a name
an admin typed in another shape) is left with both NULL: nothing is guessed, and
the LGU form asks for the two numbers when someone next edits that tier.

The name itself is never changed, and no TouristRecord is touched: a record keeps
the tier as text.

Reverse: drops the two columns (the backfilled numbers go with them).
"""
import re

from django.db import migrations, models

# digits, a dash (hyphen or en dash), digits, then the word pax
RANGE = re.compile(r"^\s*(\d+)\s*[-\u2013]\s*(\d+)\s*pax\b", re.IGNORECASE)
# PositiveSmallIntegerField tops out at 32767
LIMIT = 32767


def parse_range(name):
    """-> (min, max), or (None, None) when the name does not start with a usable range."""
    match = RANGE.match(name or "")
    if not match:
        return None, None
    low, high = int(match.group(1)), int(match.group(2))
    if low < 1 or high < low or high > LIMIT:
        return None, None
    return low, high


def backfill(apps, schema_editor):
    BoatCapacityFare = apps.get_model("api", "BoatCapacityFare")
    alias = schema_editor.connection.alias
    for fare in BoatCapacityFare.objects.using(alias).all():
        low, high = parse_range(fare.name)
        if low is not None:
            fare.min_pax, fare.max_pax = low, high
            fare.save(update_fields=["min_pax", "max_pax"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0063_sanitarycomplaint_location_provenance"),
    ]

    operations = [
        migrations.AddField(
            model_name="boatcapacityfare",
            name="min_pax",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="boatcapacityfare",
            name="max_pax",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
