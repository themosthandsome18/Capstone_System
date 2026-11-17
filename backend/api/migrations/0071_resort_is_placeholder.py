from django.db import migrations, models

# A resort that an import made up (see api/services/placeholder_resorts.py, which holds these and which a test holds equal to this copy): the
# description an importer writes, and the coordinate it gives with it. A migration does not import app code, so they are written here too.
SIGNATURES = {
    "Imported from Tourism Office online booking responses.": (14.185, 121.731),
    "Fallback destination for private residences, homestays, and other non-resort locations.": (14.185, 121.725),
    "Imported from client monitoring form.": (14.185, 121.731),
}


def mark_import_placeholders(apps, schema_editor):
    """Marks the resorts that already exist and that an import made up.

    ALL of these must be so, or the resort is left alone (it is not guessed to be a placeholder): its description is exactly one an importer
    writes, it has no image_key, it has no mayor's permit, and its coordinate is exactly the one that importer gives with that description.
    A real resort that an admin added has its own description and a coordinate the admin chose; one an admin gave exact coordinates to has
    left the default. Resorts that do not fit are not touched.
    """
    Resort = apps.get_model("api", "Resort")
    for description, (latitude, longitude) in SIGNATURES.items():
        Resort.objects.filter(
            short_description=description,
            image_key="",
            with_mayors_permit=False,
            latitude=latitude,
            longitude=longitude,
        ).update(is_placeholder=True)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0070_touristrecord_archive"),
    ]

    operations = [
        migrations.AddField(
            model_name="resort",
            name="is_placeholder",
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.RunPython(mark_import_placeholders, migrations.RunPython.noop),
    ]
