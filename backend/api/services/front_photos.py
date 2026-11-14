"""Shared private front-photo handling: bounded decoding and compensating writes.

Used by household and establishment front photos. Each record type ("kind") has
its own one-to-one photo link and its own cleanup journal; object keys are always
server-generated under ``profile-photos/<folder>/<record id>/``.
"""
from dataclasses import dataclass
import io
import logging
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction

from api.services import private_photos

MAX_PIXELS = 12_000_000
MAX_EDGE = 8192


class InvalidFrontPhoto(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


class FrontPhotoUpdateFailed(Exception):
    def __init__(self, cleanup_pending=False):
        self.cleanup_pending = cleanup_pending


class NativeFrontPhotoUpdateFailed(FrontPhotoUpdateFailed):
    def __init__(self, outcome, attempt_id=None):
        super().__init__(cleanup_pending=True)
        allowed = {'CREATED_UNLINKED', 'CONFLICT', 'AMBIGUOUS', 'UNAVAILABLE', 'AUTHORIZATION_FAILURE', 'SAFETY_FAILURE'}
        self.outcome = outcome if type(outcome) is str and outcome in allowed else 'SAFETY_FAILURE'
        self.attempt_id = attempt_id


@dataclass(frozen=True)
class FrontPhotoKind:
    """One record type with a private front photo."""
    owner_model: type
    photo_model: type        # one-to-one link: <owner_field>, object_key
    cleanup_model: type      # durable receipts: object_key, ready
    owner_field: str         # e.g. "household", "establishment"
    key_folder: str          # e.g. "households", "establishments"
    logger: logging.Logger

    @property
    def key_prefix(self):
        return f'profile-photos/{self.key_folder}/'

    def new_key(self, owner_id, extension):
        return f'{self.key_prefix}{owner_id}/{uuid4().hex}.{extension}'


class BoundedImageBuffer(io.BytesIO):
    def write(self, data):
        if self.tell() + len(data) > private_photos.MAX_BYTES:
            raise InvalidFrontPhoto('Processed photo exceeds 5 MiB.', 413)
        return super().write(data)


def validated_image(upload):
    if upload.size > private_photos.MAX_BYTES:
        raise InvalidFrontPhoto('Photo exceeds 5 MiB.', 413)
    raw = upload.read(private_photos.MAX_BYTES + 1)
    if len(raw) > private_photos.MAX_BYTES:
        raise InvalidFrontPhoto('Photo exceeds 5 MiB.', 413)
    try:
        with Image.open(io.BytesIO(raw), formats=('JPEG', 'PNG')) as image:
            width, height = image.size
            if width < 1 or height < 1 or max(width, height) > MAX_EDGE or width * height > MAX_PIXELS:
                raise InvalidFrontPhoto('Photo dimensions exceed the safe decoding limit.')
            if getattr(image, 'n_frames', 1) != 1:
                raise InvalidFrontPhoto('Animated images are not supported.')
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
        raise InvalidFrontPhoto('A complete, valid JPEG or PNG is required.') from None


def retry_cleanup(kind, receipt_id, store=None):
    """Retry only a ready journal entry, never a live or linked object.

    Failures leave a durable receipt and log its numeric id, never its key.
    """
    try:
        with transaction.atomic():
            receipt = kind.cleanup_model.objects.select_for_update().filter(pk=receipt_id).first()
            if receipt is None:
                return True
            if not receipt.ready:
                return False
            from api.services.native_photo_workflow import lock_native_key, native_key_is_held
            lock_native_key(receipt.object_key)
            if native_key_is_held(receipt.object_key):
                return False
            if not receipt.object_key.startswith(kind.key_prefix):
                kind.logger.error('Private %s photo cleanup refused for out-of-namespace receipt %s',
                                  kind.owner_field, receipt_id)
                return False
            if kind.photo_model.objects.filter(object_key=receipt.object_key).exists():
                kind.logger.error('Private %s photo cleanup refused for linked receipt %s',
                                  kind.owner_field, receipt_id)
                return False
            store = store or private_photos.get_private_photo_store()
            store.delete(receipt.object_key)
            receipt.delete()
            return True
    except (DatabaseError, private_photos.PrivatePhotoUnavailable, private_photos.InvalidPrivatePhotoKey):
        kind.logger.error('Private %s photo cleanup pending for receipt %s', kind.owner_field, receipt_id)
        return False


def _compensate(kind, receipt_id, store):
    try:
        kind.cleanup_model.objects.filter(pk=receipt_id).update(ready=True)
    except DatabaseError:
        kind.logger.error('Private %s photo receipt %s needs reconciliation', kind.owner_field, receipt_id)
        return False
    return retry_cleanup(kind, receipt_id, store)


def replace_front_photo(kind, owner_id, data, extension, store, *, native_development=False, actor=None):
    """Write a new object, link it atomically, then retire the previous one.

    Returns True when cleanup of the previous object is still pending.
    """
    from api.services.native_photo_workflow import lock_native_key, native_key_is_held, replace_native_front_photo
    if native_development is not False:
        return replace_native_front_photo(kind, owner_id, data, extension, actor=actor,
                                          explicitly_selected=native_development)
    target = private_photos.s3_target(store)
    previous_photo = kind.photo_model.objects.filter(**{f'{kind.owner_field}_id': owner_id}).first()
    previous_key = previous_photo.object_key if previous_photo else None
    if previous_key and native_key_is_held(previous_key):
        raise FrontPhotoUpdateFailed(cleanup_pending=True)
    if previous_photo is not None:
        private_photos.require_s3_binding(previous_photo, target)
    key = kind.new_key(owner_id, extension)
    if native_key_is_held(key):
        raise FrontPhotoUpdateFailed(cleanup_pending=True)
    # Persist before PUT: even an ambiguous provider failure has a receipt.
    receipt = kind.cleanup_model.objects.create(object_key=key)
    receipt_id = receipt.pk  # Model.delete() clears pk even if the surrounding transaction rolls back.
    pending = []
    link = {f'{kind.owner_field}_id': owner_id}
    try:
        with transaction.atomic():
            lock_native_key(key)
            if native_key_is_held(key):
                raise private_photos.PrivatePhotoUnavailable()
            store.write(key, data)
        with transaction.atomic():
            # Serialize replacements even when the record has no photo yet.
            kind.owner_model.objects.select_for_update().only('pk').get(pk=owner_id)
            photo = kind.photo_model.objects.filter(**link).first()
            previous = photo.object_key if photo else None
            if photo is not None:
                private_photos.require_s3_binding(photo, target)
            if previous and native_key_is_held(previous):
                # Recheck under the parent lock: a native upload may have linked
                # while this legacy request was writing its S3 object.
                raise private_photos.PrivatePhotoUnavailable()
            if photo is None:
                photo = kind.photo_model(**link)
            photo.object_key = key
            photo.storage_provider = 'S3'
            photo.s3_endpoint, photo.s3_bucket, photo.s3_region = target
            photo.native_attempt = None
            photo.save()
            if previous:
                old = kind.cleanup_model.objects.create(object_key=previous, ready=True)
                transaction.on_commit(lambda: pending.append(not retry_cleanup(kind, old.pk, store)))
            receipt.delete()
    except (DatabaseError, ValidationError, kind.owner_model.DoesNotExist, private_photos.PrivatePhotoUnavailable):
        raise FrontPhotoUpdateFailed(not _compensate(kind, receipt_id, store)) from None
    return any(pending)
