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
