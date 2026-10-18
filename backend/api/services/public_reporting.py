"""Public receipts and immutable retry fingerprints; no reporter authentication."""

import hashlib
import json
from hmac import compare_digest

from django.db.models.deletion import ProtectedError
from django.db.models.signals import pre_delete

from api.models import ACTION_CREATE, MODULE_SANITATION, ActivityLog, SanitaryComplaint


FINGERPRINT_RECORD_TYPE = "SanitationPublicSubmission"
RETENTION_MESSAGE = "Public submission retry records cannot be permanently deleted. Staff may still process and resolve the complaint."


class PublicSubmissionDeletionProtected(ProtectedError):
    pass


def is_public_submission_digest(event):
    return event.module == MODULE_SANITATION and event.record_type == FINGERPRINT_RECORD_TYPE


def protect_public_submission_deletion(sender, instance, using, **kwargs):
    # Read persisted identity: unsaved/stale instance fields cannot bypass the
    # guard. pre_delete also covers QuerySet.delete() and ordinary ORM cascades.
    persisted = sender._base_manager.using(using).filter(pk=instance.pk)
    if sender is SanitaryComplaint:
        identifier = persisted.values_list("client_submission_id", flat=True).first()
        protected = bool(identifier and identifier.strip())
    else:
        protected = persisted.filter(module=MODULE_SANITATION, record_type=FINGERPRINT_RECORD_TYPE).exists()
    if protected:
        raise PublicSubmissionDeletionProtected(RETENTION_MESSAGE, [instance])


def register_public_submission_retention():
    for model in (ActivityLog, SanitaryComplaint):
        pre_delete.connect(
            protect_public_submission_deletion, sender=model, weak=False,
            dispatch_uid=f"sanitation.public_submission_retention.{model.__name__}",
        )


def normalize_contact(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return "0" + digits[2:] if digits.startswith("63") and len(digits) == 12 else digits


def submission_fingerprint(data, uploads):
    payload = {key: data[key] for key in (
        "complainant_name", "contact_number", "category", "barangay",
        "location_address", "description",
    )}
    # Missing and blank coordinates are equivalent; never compare model-generated
    # barangay centroids with what the resident actually supplied.
    for key in ("latitude", "longitude"):
        value = data.get(key)
        payload[key] = value if value is not None and abs(value) >= 0.0001 else None
    photos = []
    for upload in uploads:
        digest = hashlib.sha256()
        upload.seek(0)
        for chunk in upload.chunks():
            digest.update(chunk)
        upload.seek(0)
        photos.append(digest.hexdigest())
    payload["photos"] = photos
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def record_submission(complaint, fingerprint):
    # The existing audit table keeps the original digest even after staff edit the
    # complaint. No resident name/contact/body is copied into this event.
    ActivityLog.objects.create(
        user=None, module=MODULE_SANITATION, action=ACTION_CREATE,
        record_type=FINGERPRINT_RECORD_TYPE, record_id=str(complaint.pk),
        record_label=json.dumps({"v": 1, "sha256": fingerprint, "priority": complaint.priority},
                                separators=(",", ":")),
    )


def matching_submission(complaint, fingerprint):
    event = ActivityLog.objects.filter(
        module=MODULE_SANITATION, action=ACTION_CREATE,
        record_type=FINGERPRINT_RECORD_TYPE, record_id=str(complaint.pk),
    ).first()
    if event is None:
        # Pre-contract records have no original-payload proof. Do not infer it
        # from mutable staff records or disclose them to the ID's holder.
        return None
    try:
        proof = json.loads(event.record_label)
        if (proof.get("v") == 1 and proof.get("priority") in ("high", "medium", "low")
                and compare_digest(proof.get("sha256", ""), fingerprint)):
            return proof
    except (ValueError, TypeError, AttributeError):
        pass
    return None


def public_receipt(complaint, priority):
    return {
        "complaint_id": complaint.complaint_id,
        "status": "pending",  # submission acknowledgement, not live staff status
        "created_at": complaint.created_at.isoformat(),
        "priority": priority,  # installed Flutter otherwise mislabels high/low as medium
    }
