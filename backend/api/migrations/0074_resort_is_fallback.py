from django.db import migrations, models

# The name the fallback resort has been made with (api/services/placeholder_resorts.py holds it too, and a test holds the two copies equal: a migration
# does not import app code).
FALLBACK_RESORT_NAME = "Others / Private Residence"


def flag_the_fallback(apps, schema_editor):
    """Flags the resort the online booking import has been using as its fallback, so that it can be found by the flag and not by an id.

    The resort named exactly "Others / Private Residence" (in the live database, the one with id 16). Where there is none (the local database), nothing
    is flagged: the importer makes one when it first needs it. Only ONE is flagged, the one with the smallest id, if the name is on more than one. Run
    again, it changes nothing: once a resort is flagged, none is flagged.
    """
    Resort = apps.get_model("api", "Resort")
    if Resort.objects.filter(is_fallback=True).exists():
        return
    fallback = Resort.objects.filter(resort_name=FALLBACK_RESORT_NAME).order_by("resort_id").first()
    if fallback is not None:
        Resort.objects.filter(pk=fallback.pk).update(is_fallback=True)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0073_feedbackentry_survey_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="resort",
            name="is_fallback",
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.RunPython(flag_the_fallback, migrations.RunPython.noop),
    ]
