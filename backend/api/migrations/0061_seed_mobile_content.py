"""Put the text the mobile app has written in its code into the two tables of
Mobile App Content, letter for letter.

DATA ONLY. The texts are in seed_data/mobile_content_0061.json, which is made by
backend/tools/extract_mobile_content_seed.py FROM the Dart source
(mobile/lib/screens/tourism_screens.dart), never typed by hand. A test compares
every stored text with the Dart file.

Ten items (four pillars, four guides, two notices) and five blocks. Every
full_text is empty, so nothing in the app is tappable, as today. The two notices
are style "banner" and the rest "tile": the app draws each as it does today.
In the port guide the amounts are {fee_regular} and {fee_discounted}: the server
fills them in later, from the one constant the reports use. The amounts are not
stored here. The place of the Tourism Office is written once, in the block
`fee_office`, and the three texts that name it (the Boat Guide tile, the
Environmental Fee tile and the port guide) say {fee_office}.

Running this again, or after an admin has edited or added something, adds
nothing and changes nothing: an item is skipped when one with the same section
and title exists (capitals and spaces do not count), a block when its key exists.

Reverse: deletes the seeded blocks (by key) and the seeded items (by section and
exact title). An item added by hand stays, and so does one an admin has renamed.
"""
import json
import logging
from pathlib import Path

from django.db import migrations

logger = logging.getLogger(__name__)

SEED_FILE = Path(__file__).resolve().parent / "seed_data" / "mobile_content_0061.json"


def _key(value):
    """What "the same title" means: trimmed, inner spaces collapsed, lower case.
    Written out here so that this migration does not depend on application code
    that may change later."""
    return " ".join(str(value).split()).lower()


def _seed():
    with open(SEED_FILE, encoding="utf-8") as handle:
        return json.load(handle)


def add_content(apps, schema_editor):
    Item = apps.get_model("api", "MobileContentItem")
    Block = apps.get_model("api", "MobileContentBlock")
    alias = schema_editor.connection.alias if schema_editor else "default"
    seed = _seed()

    blocks = Block.objects.using(alias)
    have_keys = set(blocks.values_list("key", flat=True))
    for block in seed["blocks"]:
        if block["key"] in have_keys:
            logger.warning("0061 skipped block %r: it already exists", block["key"])
            continue
        blocks.create(**block)

    items = Item.objects.using(alias)
    existing = {(section, _key(title)) for section, title in items.values_list("section", "title")}
    for item in seed["items"]:
        marker = (item["section"], _key(item["title"]))
        if marker in existing:
            logger.warning("0061 skipped item %r: one with this title already exists", item["title"])
            continue
        items.create(**item)
        existing.add(marker)


def remove_content(apps, schema_editor):
    Item = apps.get_model("api", "MobileContentItem")
    Block = apps.get_model("api", "MobileContentBlock")
    alias = schema_editor.connection.alias if schema_editor else "default"
    seed = _seed()

    Block.objects.using(alias).filter(key__in=[b["key"] for b in seed["blocks"]]).delete()
    for item in seed["items"]:
        Item.objects.using(alias).filter(section=item["section"], title=item["title"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0060_mobile_content"),
    ]

    operations = [
        migrations.RunPython(add_content, remove_content),
    ]
