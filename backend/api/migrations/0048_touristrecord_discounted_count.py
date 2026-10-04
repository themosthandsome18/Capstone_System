from django.db import migrations, models
from django.db.models import F


def backfill_discounted_count(apps, schema_editor):
    # Existing records get the same suggestion the web form makes for a new
    # one: children aged 0-7 plus seniors aged 60 and above. Staff can raise
    # it afterwards for anyone aged 8-59 who also qualifies.
    TouristRecord = apps.get_model("api", "TouristRecord")
    TouristRecord.objects.update(discounted_count=F("age_0_7") + F("age_60_above"))


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0047_clear_surv_2026_013_origin"),
    ]

    operations = [
        migrations.AddField(
            model_name="touristrecord",
            name="discounted_count",
            # db_default keeps DEFAULT 0 on the column, so the old instance,
            # which still serves while Render runs migrate, can insert records.
            field=models.PositiveIntegerField(default=0, db_default=0),
        ),
        # Reversing drops the column, which takes the backfilled values with it.
        migrations.RunPython(backfill_discounted_count, migrations.RunPython.noop),
    ]
