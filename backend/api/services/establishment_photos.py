"""Establishment front photos: one current private photo per establishment.

Establishments are retained (never hard-deleted), so no deletion cleanup hook is needed.
Separate from inspection records and from household photos.
"""
import logging

from api.models import EstablishmentFrontPhoto, EstablishmentPhotoCleanup, SanitaryEstablishment
from api.services import front_photos

logger = logging.getLogger(__name__)

ESTABLISHMENT_PHOTOS = front_photos.FrontPhotoKind(
    owner_model=SanitaryEstablishment,
    photo_model=EstablishmentFrontPhoto,
    cleanup_model=EstablishmentPhotoCleanup,
    owner_field='establishment',
    key_folder='establishments',
    logger=logger,
)


def retry_cleanup(receipt_id, store=None):
    """Retry only a ready journal entry, never a live or linked object."""
    return front_photos.retry_cleanup(ESTABLISHMENT_PHOTOS, receipt_id, store)


def replace_establishment_photo(establishment_id, data, extension, store, *, native_development=False, actor=None):
    return front_photos.replace_front_photo(ESTABLISHMENT_PHOTOS, establishment_id, data, extension, store,
                                            native_development=native_development, actor=actor)
