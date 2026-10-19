"""What the public bootstrap sends of Mobile App Content: the texts with their {placeholders} filled in.

The direction is always constant -> text. The amounts of the entrance fee are read from the one constant the
reports use (services/tourism.py) at the moment the bootstrap is built; nothing here reads an amount OUT of a
stored text, and nothing here writes to the database.

* {fee_regular}, {fee_discounted}: the amounts, written as the app wrote them ("₱80").
* {fee_office}: the text of the `fee_office` block (the place where the fee is paid).
* {name}: NOT filled here. It is the visitor's name, which only the app knows; it travels as it is written.
* A {placeholder} this module does not know is left as it is written. The admin API refuses to store one, so
  it can only get here by a way around the API; the bootstrap must not break on it.

A text is filled in ONE pass over what was stored. What is put in is never read again, so a place for
payment that itself contains "{fee_regular}" reaches the visitor as that text, not as an amount.

A text whose fee placeholder cannot be filled (the place of payment is missing or blank) is not sent at all:
`Unfillable` is raised, and whoever builds the payload leaves that item or block out. A visitor must never read
"{fee_office}".
"""
import logging
import re

from api.models import MobileContentBlock, MobileContentItem
from api.services import tourism as tourism_services

logger = logging.getLogger(__name__)

# One definition, shared with the admin API that decides what may be stored (views/mobile_content.py).
PLACEHOLDER = re.compile(r"\{[^{}]*\}")
FEE_PLACEHOLDERS = ("fee_regular", "fee_discounted", "fee_office")

PESO = "₱"


class Unfillable(Exception):
    """A fee placeholder in a text has nothing to be filled with."""

    def __init__(self, name):
        super().__init__(name)
        self.name = name


def fee_values(office_text):
    """-> {placeholder: text} for the three fee placeholders, from the constants as they are NOW.
    `office_text` is the body of the `fee_office` block, or None when there is no such block."""
    return {
        "fee_regular": f"{PESO}{tourism_services.REGULAR_ENTRANCE_FEE}",
        "fee_discounted": f"{PESO}{tourism_services.DISCOUNTED_ENTRANCE_FEE}",
        "fee_office": (office_text or "").strip() or None,
    }


def fill(text, values):
    """`text` with every {placeholder} named in `values` replaced, in one pass.

    A name that is not in `values` stays as written. A name whose value is None raises Unfillable."""

    def replace(found):
        name = found.group()[1:-1]
        if name not in values:
            return found.group()
        value = values[name]
        if value is None:
            raise Unfillable(name)
        return value

    return PLACEHOLDER.sub(replace, text)


# -- the key `appContent` of the public tourism bootstrap ----------------------------------------------------------

# The fields of each block the app shows (the others stay empty). The `fee_office` block is NOT sent: its text is
# already put in the texts that name it, so sending it too would invite the app to fill it in a second time.
# A test keeps this equal to what the admin API lets an admin edit.
SHOWN_FIELDS = {
    MobileContentBlock.KEY_WELCOME: ("title", "subtitle"),
    MobileContentBlock.KEY_WHY_VISIT: ("title", "subtitle", "body"),
    MobileContentBlock.KEY_TRAVEL_GUIDE: ("title",),
    MobileContentBlock.KEY_PORT_GUIDE: ("title", "body"),
}
SECTIONS = (MobileContentItem.SECTION_WHY_VISIT, MobileContentItem.SECTION_TRAVEL_GUIDE)


def _item_payload(item, values):
    full_text = fill(item.full_text, values)
    return {
        "id": item.pk,
        "icon": item.icon,
        "title": fill(item.title, values),
        "short_text": fill(item.short_text, values),
        "full_text": full_text,
        "style": item.style,
        # decided here, once: the app does not work it out from the text
        "tappable": bool(item.full_text.strip()),
    }


def build_app_content():
    """-> the `appContent` of the bootstrap: {"blocks": {...}, "sections": {"why_visit": [...], "travel_guide": [...]}}.

    Active items only, in the order an admin set (position, then id). Two SELECTs and nothing else: no write, no
    cache (an admin's edit is in the next bootstrap). A block or an item whose fee placeholder cannot be filled
    is left out and logged (its key / id, never its text), so that a visitor never reads "{fee_office}" and the
    app shows what it has written in its own code instead."""
    blocks = {block.key: block for block in MobileContentBlock.objects.all()}
    office = blocks.get(MobileContentBlock.KEY_FEE_OFFICE)
    values = fee_values(office.body if office else None)

    sent_blocks = {}
    for key, fields in SHOWN_FIELDS.items():
        block = blocks.get(key)
        if block is None:
            logger.warning("mobile content: block %r is not in the table, so it is not sent", key)
            continue
        try:
            sent_blocks[key] = {field: fill(getattr(block, field), values) for field in fields}
        except Unfillable as why:
            logger.warning("mobile content: block %r left out, {%s} cannot be filled in", key, why.name)

    sent_items = {section: [] for section in SECTIONS}
    for item in MobileContentItem.objects.filter(is_active=True):  # (section, display_order, id): the model's own order
        if item.section not in sent_items:
            continue
        try:
            sent_items[item.section].append(_item_payload(item, values))
        except Unfillable as why:
            logger.warning("mobile content: item %s left out, {%s} cannot be filled in", item.pk, why.name)

    return {"blocks": sent_blocks, "sections": sent_items}
