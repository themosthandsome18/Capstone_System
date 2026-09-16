import logging
import os
import uuid
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class UploadValidationError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


class StorageServiceError(Exception):
    def __init__(self, message="Image upload failed. Storage service unavailable or full."):
        super().__init__(message)
        self.message = message


def validate_image_file(file):
    """
    Validates uploaded file size and image type.
    Rejects files exceeding 5MB or with non-image types/extensions.
    Returns normalized file extension.
    """
    if not file:
        raise UploadValidationError("No image file provided.")

    file_size = getattr(file, "size", 0)
    if file_size > MAX_FILE_SIZE_BYTES:
        raise UploadValidationError("File size exceeds 5MB limit.")

    safe_name = getattr(file, "name", "") or ""
    file_ext = os.path.splitext(safe_name)[1].lower()
    content_type = (getattr(file, "content_type", "") or "").lower()

    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")

    if not file_ext:
        if content_type in {"image/jpeg", "image/jpg"}:
            file_ext = ".jpg"
        elif content_type == "image/png":
            file_ext = ".png"
        elif content_type == "image/webp":
            file_ext = ".webp"
        else:
            raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")
    elif file_ext not in ALLOWED_EXTENSIONS:
        raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")

    return file_ext


def save_image_file(file, folder):
    """
    Validates the uploaded file, generates an unpredictable UUIDv4 filename,
    saves the file to default_storage, and returns its public URL.
    Raises UploadValidationError if validation fails.
    Raises StorageServiceError if storage backend fails.
    """
    file_ext = validate_image_file(file)
    filename = f"{folder}/{uuid.uuid4().hex}{file_ext}"

    try:
        saved_path = default_storage.save(filename, file)
        return default_storage.url(saved_path)
    except Exception as exc:
        logger.error(
            "Failed to save upload %s to storage: %s",
            filename,
            exc,
            exc_info=True,
        )
        raise StorageServiceError("Image upload failed. Storage service unavailable or full.") from exc
