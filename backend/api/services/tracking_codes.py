"""Owners' private tracking codes for the Establishment Portal.

A code looks like MBN-7KQ4-XP2M. The permit number is public (it is posted in
the shop); the tracking code is private, printed once on the Owner's Slip, and
only its HMAC-SHA256 is stored. The HMAC is keyed, so the stored digests are
useless without TRACKING_CODE_KEY, and deterministic, so a typed code is found
with one indexed lookup.
"""

import hashlib
import hmac
import logging
import re
import secrets

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from api.models import SanitaryEstablishment

logger = logging.getLogger(__name__)

# Digits and capitals without 0/O, 1/I and L, which are easy to misread.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_PREFIX = "MBN"
BODY_LENGTH = 8

_BODY = re.compile(f"[{ALPHABET}]{{{BODY_LENGTH}}}")
_GENERATE_ATTEMPTS = 5


class TrackingCodeNotConfigured(Exception):
    """TRACKING_CODE_KEY is missing and DEBUG is off."""


def tracking_code_key():
    """The HMAC key, SECRET_KEY under DEBUG only, or None when not configured."""
    key = getattr(settings, "TRACKING_CODE_KEY", "")
    if key:
        return key
    if settings.DEBUG:
        return settings.SECRET_KEY
    return None


def warn_if_tracking_code_key_missing():
    if not getattr(settings, "TRACKING_CODE_KEY", "") and not settings.DEBUG:
        logger.warning(
            "TRACKING_CODE_KEY is not set: owners' tracking codes cannot be "
            "issued or checked (those endpoints answer 503)."
        )


def new_tracking_code():
    body = "".join(secrets.choice(ALPHABET) for _ in range(BODY_LENGTH))
    return f"{CODE_PREFIX}-{body[:4]}-{body[4:]}"


def normalize_tracking_code(value):
    """The 8-character body of a typed code, or "" when it is not a code.

    Case, spaces and dashes do not matter, and the MBN prefix is optional.
    """
    text = re.sub(r"[\s-]+", "", str(value or "")).upper()
    if len(text) == len(CODE_PREFIX) + BODY_LENGTH and text.startswith(CODE_PREFIX):
        text = text[len(CODE_PREFIX):]
    return text if _BODY.fullmatch(text) else ""


def hash_tracking_code(body, key):
    return hmac.new(key.encode(), body.encode(), hashlib.sha256).hexdigest()


def issue_tracking_code(establishment_id, user):
    """Give the establishment a new code and return (establishment, code).

    The old code stops working at once. The row is locked while it is
    replaced; if two staff print at the same moment, the last slip wins.
    Raises SanitaryEstablishment.DoesNotExist and TrackingCodeNotConfigured.
    """
    key = tracking_code_key()
    if key is None:
        raise TrackingCodeNotConfigured()

    for _ in range(_GENERATE_ATTEMPTS):
        code = new_tracking_code()
        digest = hash_tracking_code(normalize_tracking_code(code), key)
        try:
            with transaction.atomic():
                establishment = (
                    SanitaryEstablishment.objects.select_for_update()
                    .select_related("business_type")
                    .get(pk=establishment_id)
                )
                establishment.tracking_code_hash = digest
                establishment.tracking_code_issued_at = timezone.now()
                establishment.tracking_code_issued_by = user
                # Not updated_at: printing a slip does not edit the record.
                establishment.save(
                    update_fields=[
                        "tracking_code_hash",
                        "tracking_code_issued_at",
                        "tracking_code_issued_by",
                    ]
                )
            return establishment, code
        except IntegrityError:
            # Another establishment already has this code; draw again.
            continue
    raise RuntimeError("Could not draw an unused tracking code.")
