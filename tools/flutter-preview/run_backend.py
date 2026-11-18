"""Disposable, loopback-only Django backend for previewing the Flutter app in Chrome.

Run with the backend virtualenv, from the repository root:

    backend\\venv\\Scripts\\python.exe tools\\flutter-preview\\run_backend.py

Each run creates a fresh SQLite database in a new temp folder, seeds synthetic
records, serves http://127.0.0.1:<port>/api/ and deletes the folder on exit.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE.parent.parent / "backend"
sys.path.insert(0, str(HERE))

from preview_safety import (  # noqa: E402
    BIND_HOST, DEFAULT_APP_ORIGINS, DEFAULT_PORT, TEMP_PREFIX, UnsafePreviewConfig, check_bind_host,
    check_effective_settings, check_origins, cleanup_stale_folder, make_temp_root, preview_env,
    safe_cleanup,
)


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--app-origin", action="append", dest="origins",
                        help="Local Flutter web origin allowed by CORS (repeatable).")
    parser.add_argument("--check-only", action="store_true",
                        help="Validate, migrate and seed, print a JSON summary, then exit.")
    parser.add_argument("--keep", action="store_true",
                        help="Keep the temp folder on exit (for debugging).")
    parser.add_argument("--cleanup-stale", action="store_true",
                        help="Delete leftover preview temp folders (after a forced stop) and exit. "
                             "Folders of running previews or of unknown ownership are skipped.")
    return parser.parse_args(argv)


def cleanup_stale():
    removed = 0
    for folder in Path(tempfile.gettempdir()).glob(TEMP_PREFIX + "*"):
        try:
            cleanup_stale_folder(folder)
            removed += 1
            print(f"Removed {folder}")
        except (OSError, UnsafePreviewConfig) as error:
            print(f"Skipped {folder}: {error}", file=sys.stderr)
    print(f"{removed} stale preview folder(s) removed.")
    return 0


def _register_status_route(summary, store, attempts, port):
    from django.http import JsonResponse
    from django.urls import path
    import api.urls

    def status(_request):
        from django.conf import settings
        return JsonResponse({
            "preview": True,
            "bind": f"{BIND_HOST}:{port}",
            "database_engine": settings.DATABASES["default"]["ENGINE"],
            "database_file": summary["database"],
            "fake_private_photos": len(store.objects),
            "real_private_storage_attempts": len(attempts),
        })

    api.urls.urlpatterns.append(path("__preview__/status/", status))


def _enable_ctrl_c():
    """A parent process can leave Ctrl+C ignored; re-enable it so Ctrl+C runs cleanup."""
    if sys.platform == "win32":
        import ctypes
        ctypes.WinDLL("kernel32").SetConsoleCtrlHandler(None, False)


def main(argv=None):
    args = parse_args(argv)
    _enable_ctrl_c()
    if args.cleanup_stale:
        return cleanup_stale()
    check_bind_host(BIND_HOST)
    origins = check_origins(args.origins or DEFAULT_APP_ORIGINS)
    if not 1024 <= args.port <= 65535:
        raise UnsafePreviewConfig("Choose a port between 1024 and 65535.")

    temp_root = make_temp_root()
    try:
        # Must happen before Django (and backend.settings) is imported.
        os.environ.update(preview_env(temp_root, origins))
        sys.path.insert(0, str(BACKEND_DIR))

        import django
        django.setup()
        from django.conf import settings
        from django.core.management import call_command

        settings.MEDIA_ROOT = str(temp_root / "media")
        summary = check_effective_settings(settings, temp_root)

        from preview_store import install_fake_store
        from seed import seed

        store, attempts = install_fake_store()
        call_command("migrate", interactive=False, verbosity=0)
        seeded = seed(store)
        report = {"api": f"http://{BIND_HOST}:{args.port}/api", **summary, "seed": seeded}
        if args.check_only:
            report["real_private_storage_attempts"] = len(attempts)
            print(json.dumps(report))
            return 0

        _register_status_route(summary, store, attempts, args.port)
        print("Flutter preview backend (synthetic data, disposable SQLite, fake private photos)")
        print(f"  API:      {report['api']}")
        print(f"  Status:   {report['api']}/__preview__/status/")
        print(f"  Database: {summary['database']}")
        print(f"  Login:    {seeded['username']} (synthetic preview password, see README)")
        print("  Stop with Ctrl+C; the temp folder is deleted on exit.", flush=True)
        call_command("runserver", f"{BIND_HOST}:{args.port}", "--noreload")
        return 0
    finally:
        try:
            from django.db import connections
            connections.close_all()
        except Exception:
            pass
        if args.keep:
            print(f"Kept preview folder: {temp_root}")
        else:
            try:
                safe_cleanup(temp_root, expected_owner=os.getpid())
            except (OSError, UnsafePreviewConfig) as error:
                print(f"Could not fully remove {temp_root}: {error}", file=sys.stderr)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except UnsafePreviewConfig as error:
        print(error, file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(0)
