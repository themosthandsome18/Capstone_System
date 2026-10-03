from django.db import migrations, models


TOURIST_BOAT_ID = 1


def flag_tourist_boat(apps, schema_editor):
    # The capacity/fare rule used to be decided by the boat's name. It now
    # reads this flag, so renaming a boat type cannot switch the rule off.
    BoatType = apps.get_model("api", "BoatType")
    BoatType.objects.filter(id=TOURIST_BOAT_ID).update(requires_capacity_fare=True)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0043_rename_day_tour_itinerary"),
    ]

    operations = [
        migrations.AddField(
            model_name="boattype",
            name="requires_capacity_fare",
            field=models.BooleanField(default=False),
        ),
        # Reversing drops the column, which takes the flag with it.
        migrations.RunPython(flag_tourist_boat, migrations.RunPython.noop),
    ]
