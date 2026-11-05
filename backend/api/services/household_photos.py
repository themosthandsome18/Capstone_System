"""Bounded household image handling and compensating private-storage writes."""
import io
import logging
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from django.db import DatabaseError, transaction
from django.db.models.signals import pre_delete

from api.models import HouseholdFrontPhoto, HouseholdPhotoCleanup, HouseholdSanitationRecord
from api.services import private_photos

logger = logging.getLogger(__name__)
MAX_PIXELS = 12_000_000
MAX_EDGE = 8192


class InvalidHouseholdPhoto(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


class HouseholdPhotoUpdateFailed(Exception):
    def __init__(self, cleanup_pending=False):
        self.cleanup_pending = cleanup_pending


class BoundedImageBuffer(io.BytesIO):
    def write(self, data):
        if self.tell() + len(data) > private_photos.MAX_BYTES:
            raise InvalidHouseholdPhoto('Processed photo exceeds 5 MiB.', 413)
        return super().write(data)


def validated_image(upload):
    if upload.size > private_photos.MAX_BYTES:
        raise InvalidHouseholdPhoto('Photo exceeds 5 MiB.', 413)
    raw = upload.read(private_photos.MAX_BYTES + 1)
    if len(raw) > private_photos.MAX_BYTES:
        raise InvalidHouseholdPhoto('Photo exceeds 5 MiB.', 413)
    try:
        with Image.open(io.BytesIO(raw), formats=('JPEG', 'PNG')) as image:
            width, height = image.size
            if width < 1 or height < 1 or max(width, height) > MAX_EDGE or width * height > MAX_PIXELS:
                raise InvalidHouseholdPhoto('Photo dimensions exceed the safe decoding limit.')
            if getattr(image, 'n_frames', 1) != 1:
                raise InvalidHouseholdPhoto('Animated images are not supported.')
            kind = image.format
            image.verify()
        with Image.open(io.BytesIO(raw), formats=('JPEG', 'PNG')) as image:
            image.load()
            oriented = ImageOps.exif_transpose(image)
            converted = oriented.convert('RGB' if kind == 'JPEG' else 'RGBA')
            # A new pixel-only image excludes EXIF/GPS, text, comments and profiles.
            clean = Image.new(converted.mode, converted.size)
            clean.paste(converted)
            output = BoundedImageBuffer()
            clean.save(output, format=kind)
            return output.getvalue(), 'jpg' if kind == 'JPEG' else 'png'
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise InvalidHouseholdPhoto('A complete, valid JPEG or PNG is required.') from None


def retry_cleanup(receipt_id, store=None):
    """Retry only a ready journal entry, never a live or linked object.

    Failures leave a durable receipt and log its numeric id, never its key.
    """
    try:
        receipt = HouseholdPhotoCleanup.objects.filter(pk=receipt_id).first()
        if receipt is None:
            return True
        if not receipt.ready:
            return False
        if HouseholdFrontPhoto.objects.filter(object_key=receipt.object_key).exists():
            logger.error('Private household photo cleanup refused for linked receipt %s', receipt_id)
            return False
        store = store or private_photos.get_private_photo_store()
        store.delete(receipt.object_key)
        receipt.delete()
        return True
    except (DatabaseError, private_photos.PrivatePhotoUnavailable, private_photos.InvalidPrivatePhotoKey):
        logger.error('Private household photo cleanup pending for receipt %s', receipt_id)
        return False


def _compensate(receipt_id, store):
    try:
        HouseholdPhotoCleanup.objects.filter(pk=receipt_id).update(ready=True)
    except DatabaseError:
        logger.error('Private household photo receipt %s needs reconciliation', receipt_id)
        return False
    return retry_cleanup(receipt_id, store)


def replace_household_photo(household_id, data, extension, store):
    key = f'profile-photos/households/{household_id}/{uuid4().hex}.{extension}'
    # Persist before PUT: even an ambiguous provider failure has a receipt.
    receipt = HouseholdPhotoCleanup.objects.create(object_key=key)
    receipt_id = receipt.pk  # Model.delete() clears pk even if the surrounding transaction rolls back.
    pending = []
    try:
        store.write(key, data)
        with transaction.atomic():
            # Serialize replacements even when the household has no photo yet.
            HouseholdSanitationRecord.objects.select_for_update().get(pk=household_id)
            photo = HouseholdFrontPhoto.objects.filter(household_id=household_id).first()
            previous = photo.object_key if photo else None
            if photo is None:
                photo = HouseholdFrontPhoto(household_id=household_id)
            photo.object_key = key
            photo.save()
            if previous:
                old = HouseholdPhotoCleanup.objects.create(object_key=previous, ready=True)
                transaction.on_commit(lambda: pending.append(not retry_cleanup(old.pk, store)))
            receipt.delete()
    except (DatabaseError, HouseholdSanitationRecord.DoesNotExist, private_photos.PrivatePhotoUnavailable):
        raise HouseholdPhotoUpdateFailed(not _compensate(receipt_id, store)) from None
    return any(pending)


def _household_deleting(sender, instance, using, **kwargs):
    key = HouseholdFrontPhoto.objects.using(using).filter(household_id=instance.pk).values_list('object_key', flat=True).first()
    if key:
        receipt = HouseholdPhotoCleanup.objects.using(using).create(object_key=key, ready=True)
        transaction.on_commit(lambda: retry_cleanup(receipt.pk), using=using)


def register_household_photo_cleanup():
    pre_delete.connect(_household_deleting, sender=HouseholdSanitationRecord,
                       dispatch_uid='household_private_front_photo_cleanup', weak=False)
