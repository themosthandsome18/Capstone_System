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

from api.models import (
    PERMIT_STATUS_SUSPENDED,
    RENEWAL_STAGE_RELEASED,
    SanitaryEstablishment,
    SanitaryPermitRenewal,
    SanitaryRequirement,
)

logger = logging.getLogger(__name__)

# Digits and capitals without 0/O, 1/I and L, which are easy to misread.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_PREFIX = "MBN"
BODY_LENGTH = 8

_BODY = re.compile(f"[{ALPHABET}]{{{BODY_LENGTH}}}")
_GENERATE_ATTEMPTS = 5


NOT_CONFIGURED_MESSAGE = (
    "Tracking codes are not configured on the server (TRACKING_CODE_KEY is not "
    "set). / Hindi pa naka-set ang tracking code sa server."
)

RENEWAL_NOTICE_DAYS = 60
REQUIREMENTS_BRING_TO_RENEWAL = "Dalhin sa renewal"
REQUIREMENTS_NOT_CONFIGURED = "Wala pang naka-set na requirements"


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


def find_establishment_by_code(typed):
    """The establishment whose current code this is, or None.

    A malformed or empty code is hashed and looked up like any other (it can
    never match), so every wrong code takes the same path. One indexed query.
    Raises TrackingCodeNotConfigured.
    """
    key = tracking_code_key()
    if key is None:
        raise TrackingCodeNotConfigured()
    digest = hash_tracking_code(normalize_tracking_code(typed), key)
    try:
        return SanitaryEstablishment.objects.select_related("business_type").get(
            tracking_code_hash=digest
        )
    except SanitaryEstablishment.DoesNotExist:
        return None


def owner_status_payload(establishment, today):
    """What the owner sees in the Establishment Portal, and nothing more.

    No owner, contact, address, location, remarks, inspections, inspectors or
    complaints. A past expiry date shows as "expired" whatever the stored
    permit_status (which is left unchanged).
    """
    expiry = establishment.permit_expiry_date
    days_left = (expiry - today).days if expiry else None
    is_expired = days_left is not None and days_left < 0

    if is_expired:
        permit_status, permit_status_label = "expired", "Expired"
    else:
        permit_status = establishment.permit_status
        permit_status_label = establishment.get_permit_status_display()

    renewal_notice = None
    if days_left == 0:
        renewal_notice = (
            "Mag-e-expire ang iyong sanitary permit ngayong araw. Mag-renew sa "
            "Sanitary Office. / Your sanitary permit expires today. Please renew "
            "at the Sanitary Office."
        )
    elif days_left is not None and 0 < days_left <= RENEWAL_NOTICE_DAYS:
        plural = "s" if days_left != 1 else ""
        renewal_notice = (
            f"Mag-e-expire ang iyong sanitary permit sa loob ng {days_left} araw. "
            "Mag-renew sa Sanitary Office. / Your sanitary permit expires in "
            f"{days_left} day{plural}. Please renew at the Sanitary Office."
        )

    requirements, requirements_note = owner_requirements_checklist(establishment)

    return {
        "business_name": establishment.business_name,
        "business_type": establishment.business_type.name,
        "barangay": establishment.barangay,
        "permit_number": establishment.permit_number.strip() or None,
        "permit_status": permit_status,
        "permit_status_label": permit_status_label,
        "permit_expiry_date": expiry.isoformat() if expiry else None,
        "days_left": days_left,
        "is_expired": is_expired,
        "renewal_notice": renewal_notice,
        "expired_notice": (
            "Expired na ang iyong sanitary permit. Mag-renew sa Sanitary Office. / "
            "Your sanitary permit has expired. Please renew at the Sanitary Office."
            if is_expired
            else None
        ),
        "suspended_notice": (
            "Makipag-ugnayan sa Sanitary Office. / Please contact the Sanitary Office."
            if establishment.permit_status == PERMIT_STATUS_SUSPENDED
            else None
        ),
        "requirements": requirements,
        "requirements_note": requirements_note,
    }


def configured_requirement_names(establishment):
    """The requirement names for the business type and permit size, picked as
    the web renewal screen does: the size's own list, else the whole type's."""
    rows = list(
        SanitaryRequirement.objects.filter(
            business_type_id=establishment.business_type_id
        ).values_list("permit_size", "requirement_name")
    )
    names = [name for size, name in rows if size == establishment.permit_size]
    if not names:
        names = [name for _, name in rows]
    return _unique_names(names)


def owner_requirements_checklist(establishment):
    """([{name, submitted}], note).

    Against the newest renewal that is not released yet, each requirement is
    submitted (True) or missing (False). Without such a renewal nothing is
    judged: submitted is None and the note says to bring them to the renewal.
    """
    required = configured_requirement_names(establishment)
    renewal = (
        SanitaryPermitRenewal.objects.filter(establishment_id=establishment.pk)
        .exclude(stage=RENEWAL_STAGE_RELEASED)
        .order_by("-created_at", "-id")
        .first()
    )

    if renewal is None:
        items = [{"name": name, "submitted": None} for name in required]
        note = REQUIREMENTS_BRING_TO_RENEWAL if items else REQUIREMENTS_NOT_CONFIGURED
        return items, note

    raw = renewal.submitted_requirements
    submitted = _unique_names(raw if isinstance(raw, list) else [])
    submitted_keys = {name.lower() for name in submitted}
    required_keys = {name.lower() for name in required}
    items = [{"name": name, "submitted": name.lower() in submitted_keys} for name in required]
    # Something submitted that is no longer configured is still listed.
    items += [
        {"name": name, "submitted": True}
        for name in submitted
        if name.lower() not in required_keys
    ]
    return items, (None if items else REQUIREMENTS_NOT_CONFIGURED)


def _unique_names(names):
    seen = set()
    unique = []
    for name in names:
        name = " ".join(str(name).split())
        if name and name.lower() not in seen:
            seen.add(name.lower())
            unique.append(name)
    return unique


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
