"""Fail-closed isolation rules for the local Flutter preview backend.

Nothing here imports Django: the overrides must be in the process environment
before ``backend.settings`` is evaluated, because settings read the process
environment first and ``backend/.env`` (which may name remote PostgreSQL and
Supabase storage) only second.
"""
import os
from pathlib import Path
import secrets
import shutil
import stat
import sys
import tempfile
from urllib.parse import urlsplit

TEMP_PREFIX = "capstone-flutter-preview-"
OWNER_FILE = "owner.pid"
_REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
BIND_HOST = "127.0.0.1"
LOCAL_HOSTNAMES = ("127.0.0.1", "localhost")
DEFAULT_PORT = 8770
DEFAULT_APP_ORIGINS = ("http://localhost:3001", "http://127.0.0.1:3001")
SQLITE_ENGINE = "django.db.backends.sqlite3"
FILESYSTEM_STORAGE = "django.core.files.storage.FileSystemStorage"


class UnsafePreviewConfig(RuntimeError):
    """The preview would not be provably local and disposable."""


def make_temp_root():
    """New preview folder, stamped at once with the owning process id."""
    root = Path(tempfile.mkdtemp(prefix=TEMP_PREFIX)).resolve()
    (root / OWNER_FILE).write_text(str(os.getpid()), encoding="ascii")
    return root


def check_bind_host(host):
    if host != BIND_HOST:
        raise UnsafePreviewConfig(f"Preview binds only to {BIND_HOST}, not {host!r}.")
    return host


def check_origins(origins):
    origins = list(origins)
    if not origins:
        raise UnsafePreviewConfig("At least one local app origin is required.")
    for origin in origins:
        parts = urlsplit(origin)
        if (parts.scheme != "http" or parts.hostname not in LOCAL_HOSTNAMES
                or parts.path not in ("", "/") or parts.query or parts.username):
            raise UnsafePreviewConfig(f"Non-local app origin refused: {origin!r}")
    return origins


def preview_env(temp_root, app_origins=DEFAULT_APP_ORIGINS):
    """Environment overrides; every remote database/storage input is blanked."""
    temp_root = Path(temp_root)
    origins = check_origins(app_origins)
    blank = (
        "DATABASE_URL", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_SSLMODE",
        "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_ENDPOINT_URL", "AWS_S3_CUSTOM_DOMAIN",
        "SUPABASE_PROJECT_REF",
        "SANITATION_PRIVATE_PHOTOS_ENDPOINT", "SANITATION_PRIVATE_PHOTOS_BUCKET",
        "SANITATION_PRIVATE_PHOTOS_REGION", "SANITATION_PRIVATE_PHOTOS_ACCESS_KEY",
        "SANITATION_PRIVATE_PHOTOS_SECRET_KEY",
    )
    env = {name: "" for name in blank}
    env.update({
        "DJANGO_SETTINGS_MODULE": "backend.settings",
        "DB_ENGINE": "sqlite",
        "SQLITE_DB_PATH": str(temp_root / "preview.sqlite3"),
        "USE_S3_STORAGE": "False",
        "SANITATION_PRIVATE_PHOTOS_ENABLED": "False",
        "SANITATION_PRIVATE_PHOTOS_BUCKET_CONFIRMED_PRIVATE": "False",
        "USE_SEED_DATA": "False",
        "DEBUG": "True",
        "SECRET_KEY": "preview-only-" + secrets.token_hex(24),
        "TRACKING_CODE_KEY": "preview-only-" + secrets.token_hex(24),
        "ALLOWED_HOSTS": ",".join(LOCAL_HOSTNAMES),
        "CORS_ALLOW_ALL_ORIGINS": "False",
        "CORS_ALLOWED_ORIGINS": ",".join(origins),
    })
    return env


def _inside(path, root):
    try:
        Path(path).resolve().relative_to(Path(root).resolve())
        return True
    except ValueError:
        return False


def check_effective_settings(settings, temp_root):
    """Validate the settings Django actually evaluated; raise on anything unsafe."""
    problems = []
    databases = getattr(settings, "DATABASES", {})
    if set(databases) != {"default"}:
        problems.append(f"unexpected database aliases {sorted(databases)}")
    default = databases.get("default", {})
    if default.get("ENGINE") != SQLITE_ENGINE:
        problems.append(f"database engine is {default.get('ENGINE')!r}, not SQLite")
    name = str(default.get("NAME", ""))
    if not name or name.startswith("file:") or not _inside(name, temp_root):
        problems.append(f"SQLite file {name!r} is not inside the disposable preview folder")
    for key in ("HOST", "USER", "PASSWORD"):
        if default.get(key):
            problems.append(f"database {key} is set")
    if getattr(settings, "USE_S3_STORAGE", False):
        problems.append("USE_S3_STORAGE is enabled")
    backend = getattr(settings, "STORAGES", {}).get("default", {}).get("BACKEND")
    if backend != FILESYSTEM_STORAGE:
        problems.append(f"default file storage is {backend!r}")
    if getattr(settings, "AWS_ACCESS_KEY_ID", "") or getattr(settings, "AWS_SECRET_ACCESS_KEY", ""):
        problems.append("public-media storage credentials are present")
    media_root = getattr(settings, "MEDIA_ROOT", "")
    if not media_root or not _inside(media_root, temp_root):
        problems.append(f"MEDIA_ROOT {str(media_root)!r} is outside the preview folder")
    private = getattr(settings, "SANITATION_PRIVATE_PHOTOS", {}) or {}
    if private.get("enabled") or private.get("private_bucket_confirmed"):
        problems.append("real private photo storage is enabled")
    for key in ("endpoint_url", "bucket", "access_key", "secret_key"):
        if private.get(key):
            problems.append(f"private photo storage {key} is set")
    if getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False):
        problems.append("CORS allows all origins")
    if getattr(settings, "CORS_ALLOWED_ORIGIN_REGEXES", None):
        problems.append("CORS origin regexes are set")
    try:
        check_origins(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
    except UnsafePreviewConfig as error:
        problems.append(str(error))
    hosts = set(getattr(settings, "ALLOWED_HOSTS", []))
    if not hosts or not hosts <= set(LOCAL_HOSTNAMES):
        problems.append(f"ALLOWED_HOSTS {sorted(hosts)} is not local-only")
    if problems:
        raise UnsafePreviewConfig("Refusing to start preview: " + "; ".join(problems))
    return {"engine": default["ENGINE"], "database": str(Path(name).resolve()),
            "media_root": str(Path(media_root).resolve())}


def is_link_or_reparse_point(path):
    """True for symlinks, junctions and any other Windows reparse point (never followed)."""
    info = os.lstat(path)
    return (stat.S_ISLNK(info.st_mode)
            or bool(getattr(info, "st_file_attributes", 0) & _REPARSE_POINT))


def process_alive(pid):
    """Conservative liveness check: anything uncertain counts as alive."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.restype = wintypes.HANDLE
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ctypes.get_last_error() != 87  # ERROR_INVALID_PARAMETER: no such process
        try:
            code = wintypes.DWORD()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return True
            return code.value == 259  # STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)  # POSIX only; on Windows os.kill would terminate the process.
    except ProcessLookupError:
        return False
    except OSError:
        return True
    return True


def read_owner(path):
    try:
        text = (Path(path) / OWNER_FILE).read_text(encoding="ascii").strip()
        return int(text) if text.isdigit() else None
    except (OSError, ValueError):
        return None


def _check_preview_folder(path):
    """Refuse anything that is not a plain, link-free preview folder directly in temp."""
    path = Path(os.path.abspath(path))
    temp = Path(tempfile.gettempdir()).resolve()
    if not path.name.startswith(TEMP_PREFIX) or path.parent.resolve() != temp:
        raise UnsafePreviewConfig(f"Refusing to delete {str(path)!r}: not a preview temp folder")
    if not os.path.lexists(path) or is_link_or_reparse_point(path) or not path.is_dir():
        raise UnsafePreviewConfig(f"Refusing to delete {str(path)!r}: link, reparse point or not a folder")
    for current, dirs, files in os.walk(path, followlinks=False):
        for name in dirs + files:
            if is_link_or_reparse_point(os.path.join(current, name)):
                raise UnsafePreviewConfig(
                    f"Refusing to delete {str(path)!r}: contains a link or reparse point")
    return path


def safe_cleanup(path, *, expected_owner):
    """Delete a preview folder owned by ``expected_owner`` (normally this process)."""
    path = _check_preview_folder(path)
    if read_owner(path) != expected_owner:
        raise UnsafePreviewConfig(f"Refusing to delete {str(path)!r}: not owned by process {expected_owner}")
    shutil.rmtree(path)


def cleanup_stale_folder(path):
    """Delete a leftover preview folder only when its recorded owner has exited."""
    path = _check_preview_folder(path)
    owner = read_owner(path)
    if owner is None:
        raise UnsafePreviewConfig(f"Skipping {str(path)!r}: owner unknown")
    if process_alive(owner):
        raise UnsafePreviewConfig(f"Skipping {str(path)!r}: preview process {owner} is still running")
    shutil.rmtree(path)
