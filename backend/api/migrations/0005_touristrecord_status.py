from django.db import migrations, models


def seed_booking_statuses(apps, schema_editor):
    TouristRecord = apps.get_model("api", "TouristRecord")
    statuses_by_survey_id = {
        "SURV-2026-001": "arrived",
        "SURV-2026-002": "pending",
        "SURV-2026-003": "arrived",
        "SURV-2026-004": "no_show",
        "SURV-2026-005": "pending",
        "SURV-2026-006": "arrived",
        "SURV-2026-007": "arrived",
        "SURV-2026-008": "pending",
        "SURV-2026-009": "arrived",
        "SURV-2026-010": "arrived",
        "SURV-2026-011": "pending",
        "SURV-2026-012": "arrived",
    }

    for survey_id, status in statuses_by_survey_id.items():
        TouristRecord.objects.filter(survey_id=survey_id).update(status=status)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0004_touristrecord_foreign_keys"),
    ]

    operations = [
        migrations.AddField(
            model_name="touristrecord",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("arrived", "Arrived"),
                    ("no_show", "No-show"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(seed_booking_statuses, migrations.RunPython.noop),
    ]
