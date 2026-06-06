from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0022_reset_feedbackentry_sequence"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sanitarybusinesstype",
            name="inspection_frequency",
            field=models.CharField(
                choices=[
                    ("monthly", "Monthly"),
                    ("quarterly", "Quarterly"),
                    ("annual", "Annual"),
                ],
                default="monthly",
                max_length=20,
            ),
        ),
    ]
