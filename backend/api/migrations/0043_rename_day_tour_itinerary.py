from django.db import migrations


ITINERARY_ID = 2
OLD_NAME = "Day Tour"
NEW_NAME = "Same Day"


def rename_itinerary(apps, from_name, to_name):
    # Only the lookup row changes. Tourist records point at the id, so they
    # follow the new name without being touched. Matching on the current name
    # makes this a no-op when the row is missing or already renamed.
    Itinerary = apps.get_model("api", "Itinerary")
    Itinerary.objects.filter(id=ITINERARY_ID, name__iexact=from_name).update(name=to_name)


def forwards(apps, schema_editor):
    rename_itinerary(apps, OLD_NAME, NEW_NAME)


def backwards(apps, schema_editor):
    rename_itinerary(apps, NEW_NAME, OLD_NAME)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0042_merge_20261003_1821"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
