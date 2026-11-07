from django.db import migrations, models


class Migration(migrations.Migration):
    # Parallel to the unmerged 0063_household_front_photo; a later integration
    # must add an empty merge migration depending on both distinct 0063 leaves.
    dependencies = [("api", "0062_resort_is_active")]

    operations = [
        migrations.AddField(
            model_name="sanitarycomplaint",
            name="location_source",
            field=models.CharField(
                choices=[("unknown", "Unknown"), ("reporter_provided", "Reporter-provided"),
                         ("staff_provided", "Staff-provided"), ("barangay_approximate", "Barangay approximation")],
                default="unknown", editable=False, max_length=24,
            ),
        ),
    ]
