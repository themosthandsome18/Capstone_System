from django.db import migrations


# SURV-2026-013 is a United States tourist (country id 2, 4 visitors). The
# form used to require a Philippine region and province for every record, so
# it was saved with region id 9 "Region VI - Western Visayas" and province
# id 42 "Guimaras", and the origin figures counted it as 4 visitors from
# Guimaras. Region and province are optional for a foreign country since
# 0046, so this clears both; the origin figures then count it under its
# country. Its country and head counts are not touched.
SURVEY_ID = "SURV-2026-013"
OLD_REGION_ID = 9
OLD_PROVINCE_ID = 42


def clear_origin(apps, schema_editor):
    # Matches the record and its current values, so it does nothing if they
    # have already changed.
    TouristRecord = apps.get_model("api", "TouristRecord")
    TouristRecord.objects.filter(
        survey_id=SURVEY_ID,
        region_id=OLD_REGION_ID,
        province_id=OLD_PROVINCE_ID,
    ).update(region_id=None, province_id=None)


def restore_origin(apps, schema_editor):
    TouristRecord = apps.get_model("api", "TouristRecord")
    TouristRecord.objects.filter(
        survey_id=SURVEY_ID,
        region_id__isnull=True,
        province_id__isnull=True,
    ).update(region_id=OLD_REGION_ID, province_id=OLD_PROVINCE_ID)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0046_touristrecord_optional_region_province"),
    ]

    operations = [
        migrations.RunPython(clear_origin, restore_origin),
    ]
