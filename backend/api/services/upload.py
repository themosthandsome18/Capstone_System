import logging
import os
import uuid
from django.conf import settings
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/x-png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/octet-stream",
    "application/octet-stream",
    "binary/octet-stream",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
OCTET_STREAM_TYPES = {"image/octet-stream", "application/octet-stream", "binary/octet-stream"}
HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"hevm", b"hevs", b"mif1", b"msf1"}


class UploadValidationError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


class StorageServiceError(Exception):
    def __init__(self, message="Image upload failed. Storage service unavailable or full."):
        super().__init__(message)
        self.message = message


def looks_like_image(file):
    """Checks the file's first bytes for a JPEG, PNG, WebP or HEIC/HEIF signature."""
    try:
        head = file.read(16)
        file.seek(0)
    except Exception:
        return False

    if head.startswith(b"\xff\xd8\xff"):
        return True
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return True
    if head[4:8] == b"ftyp" and head[8:12] in HEIC_BRANDS:
        return True
    return False


def validate_image_file(file, strict=False):
    """
    Validates uploaded file size and image type.
    Rejects files exceeding 5MB or with non-image types/extensions.
    Supports JPEG, JPG, PNG, WEBP, and HEIC/HEIF with case-insensitive extensions
    and fallback for octet-stream binaries.
    Returns normalized file extension.

    strict=True (used for public feedback uploads) additionally refuses to guess:
    a generic octet-stream upload is only accepted with a real image extension, and
    the file content must start with a known image signature.
    """
    if not file:
        raise UploadValidationError("No image file provided.")

    file_size = getattr(file, "size", 0)
    if file_size > MAX_FILE_SIZE_BYTES:
        raise UploadValidationError("File size exceeds 5MB limit.")

    safe_name = getattr(file, "name", "") or ""
    file_ext = os.path.splitext(safe_name)[1].lower().strip()
    content_type = (getattr(file, "content_type", "") or "").lower().strip()

    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")

    if strict:
        if content_type in OCTET_STREAM_TYPES and file_ext not in ALLOWED_EXTENSIONS:
            raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")
        if not looks_like_image(file):
            raise UploadValidationError("The uploaded file is not a valid image.")

    if not file_ext:
        if content_type in {"image/jpeg", "image/jpg", "image/pjpeg"}:
            file_ext = ".jpg"
        elif content_type in {"image/png", "image/x-png"}:
            file_ext = ".png"
        elif content_type == "image/webp":
            file_ext = ".webp"
        elif content_type in {"image/heic", "image/heif"}:
            file_ext = ".heic"
        elif content_type in {"application/octet-stream", "binary/octet-stream", "image/octet-stream"}:
            file_ext = ".jpg"
        else:
            raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")
    elif file_ext not in ALLOWED_EXTENSIONS:
        raise UploadValidationError("Only JPG, PNG, and WebP images are allowed.")

    if file_ext == ".jpeg":
        file_ext = ".jpg"
    elif file_ext == ".heif":
        file_ext = ".heic"

    return file_ext


def save_image_file(file, folder, strict=False):
    """
    Validates the uploaded file, generates an unpredictable UUIDv4 filename,
    saves the file to default_storage, and returns its public URL.
    Raises UploadValidationError if validation fails.
    Raises StorageServiceError if storage backend fails.
    """
    file_ext = validate_image_file(file, strict=strict)
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


def absolute_media_url(url, request):
    """A path the storage gave without a host ("/media/resorts/x.png", what FileSystemStorage does) becomes a whole URL on the host
    that is asking. A whole URL (what S3 storage gives) is left as it is, and so is anything that is not a path (an asset name).

    It is done when the URL is READ, never when it is stored: the database keeps what the storage gave, so a destination does not
    carry the host it was saved from (127.0.0.1 here, a LAN address for a phone)."""
    if request is None or not isinstance(url, str):
        return url
    if url.startswith("/") and not url.startswith("//"):
        return request.build_absolute_uri(url)
    return url


def relative_media_url(url, request):
    """The other way, when a URL comes back to be stored: a whole URL that points at THIS server's own media goes back to the path it
    was made from, so the database stays free of the host. A URL of any other host (S3) is left alone."""
    if request is None or not isinstance(url, str) or not url.startswith(("http://", "https://")):
        return url
    prefix = request.build_absolute_uri(settings.MEDIA_URL)
    if url.startswith(prefix):
        return settings.MEDIA_URL + url[len(prefix):]
    return url
