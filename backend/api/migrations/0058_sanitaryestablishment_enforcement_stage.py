from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0057_householdsanitationrecord_address_fields")]

    operations = [
        migrations.AddField(
            model_name="sanitaryestablishment",
            name="enforcement_stage",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "Not recorded"),
                    ("warning", "Warning"),
                    ("nov_1", "Notice of Violation 1"),
                    ("nov_2", "Notice of Violation 2"),
                    ("nov_3", "Notice of Violation 3"),
                    ("suspension", "Suspension"),
                ],
                default="",
                max_length=30,
            ),
        ),
    ]
