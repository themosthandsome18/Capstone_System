"""Household front photos: thin wrappers over the shared front-photo core."""
import logging

from django.db import transaction
from django.db.models.signals import pre_delete

from api.models import HouseholdFrontPhoto, HouseholdPhotoCleanup, HouseholdSanitationRecord
from api.services import front_photos
from api.services.front_photos import (  # noqa: F401  (re-exported names)
    MAX_EDGE, MAX_PIXELS, BoundedImageBuffer, validated_image,
)

logger = logging.getLogger(__name__)

# Historical names kept for callers and tests.
InvalidHouseholdPhoto = front_photos.InvalidFrontPhoto
HouseholdPhotoUpdateFailed = front_photos.FrontPhotoUpdateFailed

HOUSEHOLD_PHOTOS = front_photos.FrontPhotoKind(
    owner_model=HouseholdSanitationRecord,
    photo_model=HouseholdFrontPhoto,
    cleanup_model=HouseholdPhotoCleanup,
    owner_field='household',
    key_folder='households',
    logger=logger,
)


def retry_cleanup(receipt_id, store=None):
    """Retry only a ready journal entry, never a live or linked object."""
    return front_photos.retry_cleanup(HOUSEHOLD_PHOTOS, receipt_id, store)


def replace_household_photo(household_id, data, extension, store, *, native_development=False, actor=None):
    return front_photos.replace_front_photo(HOUSEHOLD_PHOTOS, household_id, data, extension, store,
                                            native_development=native_development, actor=actor)


def _household_deleting(sender, instance, using, **kwargs):
    key = HouseholdFrontPhoto.objects.using(using).filter(household_id=instance.pk).values_list('object_key', flat=True).first()
    if key:
        from api.services.native_photo_workflow import hold_deleted_owner
        if hold_deleted_owner(HOUSEHOLD_PHOTOS, instance.pk, key, using=using):
            return
        receipt = HouseholdPhotoCleanup.objects.using(using).create(object_key=key, ready=True)
        transaction.on_commit(lambda: retry_cleanup(receipt.pk), using=using)


def register_household_photo_cleanup():
    pre_delete.connect(_household_deleting, sender=HouseholdSanitationRecord,
                       dispatch_uid='household_private_front_photo_cleanup', weak=False)
