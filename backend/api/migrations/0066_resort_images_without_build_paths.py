"""Take the web's own build paths out of Resort.images.

The web page used to put a destination's BUILT-IN photo (a file of the web app, found by its image key) into the list of photos it showed
and edited, and Save sent that list back. So the build path of the file ("/static/media/<name>.<hash>.jpg", the name webpack gives it)
was written to the database. That is never a real photo: it is not on the server, it only exists while one build of the web is served,
and no phone can load it.

This removes every entry that STARTS WITH "/static/media/", and nothing else: a real upload ("/media/resorts/..."), a whole URL
(https://...), an asset name and any other text stay as they are, in the same order. A destination whose list has none of them is not
written. DATA ONLY: no column changes. Reverse: nothing to put back (the removed entries were never photos).
"""
import logging

from django.db import migrations

logger = logging.getLogger(__name__)

BUILD_PREFIX = "/static/media/"


def clean(apps, schema_editor):
    Resort = apps.get_model("api", "Resort")
    alias = schema_editor.connection.alias
    cleaned = 0
    for resort in Resort.objects.using(alias).all():
        images = resort.images
        if not isinstance(images, list):
            continue
        kept = [url for url in images if not (isinstance(url, str) and url.startswith(BUILD_PREFIX))]
        if len(kept) != len(images):
            resort.images = kept
            resort.save(update_fields=["images"])
            cleaned += 1
    logger.info("0066: removed build paths from the photos of %s destination(s)", cleaned)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0065_boatcapacityfare_pax_constraints"),
    ]

    operations = [
        migrations.RunPython(clean, migrations.RunPython.noop),
    ]
