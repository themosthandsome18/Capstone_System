"""Safety tests for the Flutter preview backend.

Run with the backend virtualenv from the repository root:
    backend\\venv\\Scripts\\python.exe -m unittest discover -s tools\\flutter-preview -v
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
import urllib.request

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent.parent / "backend"
sys.path.insert(0, str(HERE))

from preview_safety import (  # noqa: E402
    FILESYSTEM_STORAGE, OWNER_FILE, SQLITE_ENGINE, TEMP_PREFIX, UnsafePreviewConfig,
    check_bind_host, check_effective_settings, check_origins, cleanup_stale_folder,
    make_temp_root, preview_env, process_alive, read_owner, safe_cleanup,
)

ME = os.getpid()


def dead_pid():
    proc = subprocess.run([sys.executable, "-c", "import os; print(os.getpid())"],
                          capture_output=True, text=True, check=True)
    return int(proc.stdout.strip())


def make_junction(link, target):
    result = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)],
                            capture_output=True, text=True)
    return result.returncode == 0


def safe_settings(root):
    return SimpleNamespace(
        DATABASES={"default": {"ENGINE": SQLITE_ENGINE, "NAME": str(root / "preview.sqlite3")}},
        USE_S3_STORAGE=False,
        STORAGES={"default": {"BACKEND": FILESYSTEM_STORAGE}},
        AWS_ACCESS_KEY_ID="", AWS_SECRET_ACCESS_KEY="",
        MEDIA_ROOT=str(root / "media"),
        SANITATION_PRIVATE_PHOTOS={"enabled": False, "private_bucket_confirmed": False,
                                   "endpoint_url": "", "bucket": "", "access_key": "", "secret_key": ""},
        CORS_ALLOW_ALL_ORIGINS=False, CORS_ALLOWED_ORIGIN_REGEXES=[],
        CORS_ALLOWED_ORIGINS=["http://localhost:3001"],
        ALLOWED_HOSTS=["127.0.0.1", "localhost"],
    )


class PreviewSafetyTests(unittest.TestCase):
    def setUp(self):
        self.root = make_temp_root()
        self.addCleanup(self._remove_root)

    def _remove_root(self):
        if self.root.exists():
            (self.root / OWNER_FILE).write_text(str(ME))
            safe_cleanup(self.root, expected_owner=ME)

    def test_safe_settings_pass(self):
        summary = check_effective_settings(safe_settings(self.root), self.root)
        self.assertEqual(summary["engine"], SQLITE_ENGINE)

    def test_unsafe_effective_settings_are_refused(self):
        cases = {
            "postgres": lambda s: s.DATABASES["default"].update(ENGINE="django.db.backends.postgresql"),
            "sqlite outside temp": lambda s: s.DATABASES["default"].update(NAME=str(HERE / "x.sqlite3")),
            "in-memory sqlite": lambda s: s.DATABASES["default"].update(NAME="file:memdb?mode=memory"),
            "extra alias": lambda s: s.DATABASES.update(other={"ENGINE": SQLITE_ENGINE}),
            "db host": lambda s: s.DATABASES["default"].update(HOST="db.example.invalid"),
            "db password": lambda s: s.DATABASES["default"].update(PASSWORD="x"),
            "s3 flag": lambda s: setattr(s, "USE_S3_STORAGE", True),
            "s3 backend": lambda s: s.STORAGES.update(default={"BACKEND": "storages.backends.s3.S3Storage"}),
            "aws key": lambda s: setattr(s, "AWS_ACCESS_KEY_ID", "AKIA-fake"),
            "media outside": lambda s: setattr(s, "MEDIA_ROOT", str(HERE / "media")),
            "private enabled": lambda s: s.SANITATION_PRIVATE_PHOTOS.update(enabled=True),
            "private secret": lambda s: s.SANITATION_PRIVATE_PHOTOS.update(secret_key="x"),
            "private endpoint": lambda s: s.SANITATION_PRIVATE_PHOTOS.update(endpoint_url="https://x.invalid"),
            "cors all": lambda s: setattr(s, "CORS_ALLOW_ALL_ORIGINS", True),
            "cors regex": lambda s: setattr(s, "CORS_ALLOWED_ORIGIN_REGEXES", [r".*"]),
            "cors remote": lambda s: setattr(s, "CORS_ALLOWED_ORIGINS", ["https://capstone.example"]),
            "hosts remote": lambda s: setattr(s, "ALLOWED_HOSTS", ["127.0.0.1", "0.0.0.0"]),
            "hosts wildcard": lambda s: setattr(s, "ALLOWED_HOSTS", ["*"]),
        }
        for label, mutate in cases.items():
            with self.subTest(label):
                settings = safe_settings(self.root)
                mutate(settings)
                with self.assertRaises(UnsafePreviewConfig):
                    check_effective_settings(settings, self.root)

    def test_bind_host_is_loopback_only(self):
        self.assertEqual(check_bind_host("127.0.0.1"), "127.0.0.1")
        for host in ("0.0.0.0", "", "::", "localhost", "192.168.1.5"):
            with self.subTest(host), self.assertRaises(UnsafePreviewConfig):
                check_bind_host(host)

    def test_app_origins_must_be_local_http(self):
        check_origins(["http://localhost:3001", "http://127.0.0.1:3001"])
        for origin in ("*", "http://192.168.1.5:3001", "https://localhost:3001",
                       "http://localhost.evil.example:3001", "http://user@localhost:3001", ""):
            with self.subTest(origin), self.assertRaises(UnsafePreviewConfig):
                check_origins([origin])
        with self.assertRaises(UnsafePreviewConfig):
            check_origins([])

    def test_env_overrides_blank_remote_inputs(self):
        env = preview_env(self.root)
        self.assertEqual(env["DB_ENGINE"], "sqlite")
        self.assertEqual(Path(env["SQLITE_DB_PATH"]).parent, self.root)
        for key in ("DATABASE_URL", "DB_HOST", "DB_USER", "DB_PASSWORD", "AWS_ACCESS_KEY_ID",
                    "AWS_SECRET_ACCESS_KEY", "SANITATION_PRIVATE_PHOTOS_SECRET_KEY",
                    "SANITATION_PRIVATE_PHOTOS_ENDPOINT", "SUPABASE_PROJECT_REF"):
            self.assertEqual(env[key], "", key)
        self.assertEqual(env["USE_S3_STORAGE"], "False")
        self.assertEqual(env["SANITATION_PRIVATE_PHOTOS_ENABLED"], "False")
        self.assertEqual(env["CORS_ALLOW_ALL_ORIGINS"], "False")
        self.assertEqual(env["ALLOWED_HOSTS"], "127.0.0.1,localhost")
        self.assertTrue(env["SECRET_KEY"].startswith("preview-only-"))
        self.assertNotEqual(env["SECRET_KEY"], preview_env(self.root)["SECRET_KEY"])

    def test_new_folder_records_owner(self):
        self.assertEqual(read_owner(self.root), ME)

    def test_cleanup_only_deletes_preview_temp_folders(self):
        outside = HERE / (TEMP_PREFIX + "not-temp")
        unprefixed = Path(tempfile.mkdtemp(prefix="unrelated-"))
        (unprefixed / OWNER_FILE).write_text(str(ME))
        self.addCleanup(lambda: shutil.rmtree(unprefixed, ignore_errors=True))
        nested = self.root / (TEMP_PREFIX + "nested")
        nested.mkdir()
        (nested / OWNER_FILE).write_text(str(ME))
        for target in (outside, unprefixed, nested, Path(tempfile.gettempdir())):
            with self.subTest(str(target)), self.assertRaises(UnsafePreviewConfig):
                safe_cleanup(target, expected_owner=ME)
        self.assertTrue(unprefixed.exists() and nested.exists())
        with self.assertRaises(UnsafePreviewConfig):
            safe_cleanup(self.root, expected_owner=ME + 1)
        safe_cleanup(self.root, expected_owner=ME)
        self.assertFalse(self.root.exists())

    def test_stale_cleanup_skips_active_and_unknown_owners(self):
        with self.assertRaises(UnsafePreviewConfig):  # owner is this running process
            cleanup_stale_folder(self.root)
        (self.root / OWNER_FILE).unlink()
        with self.assertRaises(UnsafePreviewConfig):  # owner unknown
            cleanup_stale_folder(self.root)
        (self.root / OWNER_FILE).write_text("not-a-pid")
        with self.assertRaises(UnsafePreviewConfig):
            cleanup_stale_folder(self.root)
        self.assertTrue(self.root.exists())
        (self.root / OWNER_FILE).write_text(str(dead_pid()))
        cleanup_stale_folder(self.root)
        self.assertFalse(self.root.exists())

    def test_process_alive(self):
        self.assertTrue(process_alive(ME))
        self.assertFalse(process_alive(dead_pid()))

    @unittest.skipUnless(sys.platform == "win32", "Windows junctions")
    def test_junctions_are_never_followed_or_deleted_through(self):
        victim = Path(tempfile.mkdtemp(prefix="victim-"))
        (victim / "keep.txt").write_text("must survive")
        (victim / OWNER_FILE).write_text(str(dead_pid()))
        self.addCleanup(lambda: shutil.rmtree(victim, ignore_errors=True))
        top = Path(tempfile.gettempdir()) / f"{TEMP_PREFIX}junction-{ME}"
        if not make_junction(top, victim):
            self.skipTest("mklink /J unavailable")
        self.addCleanup(lambda: os.path.lexists(top) and os.rmdir(top))
        for action in (lambda: cleanup_stale_folder(top), lambda: safe_cleanup(top, expected_owner=ME)):
            with self.assertRaises(UnsafePreviewConfig):
                action()
        inner = self.root / "media"
        self.assertTrue(make_junction(inner, victim))
        self.addCleanup(lambda: os.path.lexists(inner) and os.rmdir(inner))
        (self.root / OWNER_FILE).write_text(str(dead_pid()))
        with self.assertRaises(UnsafePreviewConfig):
            cleanup_stale_folder(self.root)
        with self.assertRaises(UnsafePreviewConfig):
            safe_cleanup(self.root, expected_owner=read_owner(self.root))
        self.assertTrue((victim / "keep.txt").exists())
        os.rmdir(inner)


class LauncherProcessTests(unittest.TestCase):
    """End-to-end checks of the real launcher process."""

    def run_launcher(self, *args, extra_env=None):
        env = dict(os.environ)
        env.update(extra_env or {})
        return subprocess.run(
            [sys.executable, str(HERE / "run_backend.py"), *args],
            capture_output=True, text=True, env=env, timeout=600)

    def test_hostile_environment_is_overridden_before_settings(self):
        before = set(Path(tempfile.gettempdir()).glob(TEMP_PREFIX + "*"))
        result = self.run_launcher("--check-only", extra_env={
            "DB_ENGINE": "postgresql",
            "DATABASE_URL": "postgres://user:pass@db.example.invalid:5432/prod",
            "DB_HOST": "db.example.invalid", "DB_USER": "postgres.fake", "DB_PASSWORD": "fake",
            "USE_S3_STORAGE": "True", "AWS_ACCESS_KEY_ID": "fake", "AWS_SECRET_ACCESS_KEY": "fake",
            "SANITATION_PRIVATE_PHOTOS_ENABLED": "True",
            "SANITATION_PRIVATE_PHOTOS_BUCKET_CONFIRMED_PRIVATE": "True",
            "SANITATION_PRIVATE_PHOTOS_ACCESS_KEY": "fake", "SANITATION_PRIVATE_PHOTOS_SECRET_KEY": "fake",
            "CORS_ALLOW_ALL_ORIGINS": "True", "ALLOWED_HOSTS": "*",
        })
        self.assertEqual(result.returncode, 0, result.stderr[-2000:])
        report = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(report["engine"], SQLITE_ENGINE)
        database = Path(report["database"])
        self.assertTrue(database.parent.name.startswith(TEMP_PREFIX))
        self.assertEqual(database.parent.parent, Path(tempfile.gettempdir()).resolve())
        self.assertEqual(report["real_private_storage_attempts"], 0)
        self.assertEqual(report["seed"]["household_photos"], 2)
        self.assertEqual(set(Path(tempfile.gettempdir()).glob(TEMP_PREFIX + "*")), before,
                         "temp folder was not cleaned up")

    def test_non_local_origin_is_refused_before_django(self):
        result = self.run_launcher("--check-only", "--app-origin", "http://192.168.1.5:3001")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Non-local app origin refused", result.stderr)

    def test_privileged_or_invalid_port_is_refused(self):
        result = self.run_launcher("--check-only", "--port", "80")
        self.assertEqual(result.returncode, 2)

    def test_cleanup_stale_removes_only_dead_preview_folders(self):
        stale = make_temp_root()
        (stale / "preview.sqlite3").write_bytes(b"stale")
        (stale / OWNER_FILE).write_text(str(dead_pid()))
        active = make_temp_root()  # owned by this running test process
        self.addCleanup(lambda: active.exists() and safe_cleanup(active, expected_owner=ME))
        unrelated = Path(tempfile.mkdtemp(prefix="unrelated-preview-"))
        self.addCleanup(lambda: shutil.rmtree(unrelated, ignore_errors=True))
        result = self.run_launcher("--cleanup-stale")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(stale.exists())
        self.assertTrue(active.exists(), "an active preview folder was deleted")
        self.assertTrue(unrelated.exists())

    @unittest.skipUnless(sys.platform == "win32", "Windows console Ctrl+C")
    def test_graceful_ctrl_c_deletes_database_and_folder(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        logdir = Path(tempfile.mkdtemp(prefix="preview-log-"))
        self.addCleanup(lambda: shutil.rmtree(logdir, ignore_errors=True))
        log = logdir / "out.log"
        hidden = subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW, wShowWindow=0)
        with open(log, "w") as out:
            proc = subprocess.Popen(
                [sys.executable, str(HERE / "run_backend.py"), "--port", str(port)],
                stdout=out, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NEW_CONSOLE, startupinfo=hidden)
        self.addCleanup(lambda: proc.poll() is None and proc.kill())
        status = None
        for _ in range(240):
            try:
                url = f"http://127.0.0.1:{port}/api/__preview__/status/"
                with urllib.request.urlopen(url, timeout=2) as response:
                    status = json.loads(response.read())
                break
            except OSError:
                time.sleep(1)
        self.assertIsNotNone(status, log.read_text(errors="replace")[-2000:])
        folder = Path(status["database_file"]).parent
        self.assertTrue((folder / "preview.sqlite3").exists())
        sender = ("import ctypes,sys;k=ctypes.WinDLL('kernel32');k.FreeConsole();"
                  "assert k.AttachConsole(int(sys.argv[1]));k.SetConsoleCtrlHandler(None,True);"
                  "assert k.GenerateConsoleCtrlEvent(0,0)")
        subprocess.run([sys.executable, "-c", sender, str(proc.pid)], check=True,
                       creationflags=subprocess.CREATE_NEW_CONSOLE, startupinfo=hidden)
        self.assertEqual(proc.wait(timeout=60), 0, log.read_text(errors="replace")[-2000:])
        self.assertFalse(folder.exists(), "Ctrl+C left the preview folder behind")

    def test_preview_route_and_fake_store_absent_from_normal_backend(self):
        root = make_temp_root()
        self.addCleanup(lambda: root.exists() and safe_cleanup(root, expected_owner=ME))
        env = dict(os.environ)
        env.update(preview_env(root))  # safe database only; no launcher, no fake store
        code = "\n".join([
            "import django", "django.setup()",
            "from django.urls import resolve, Resolver404",
            "from api.services import private_photos as p",
            "try:", "    resolve('/api/__preview__/status/'); print('ROUTE-PRESENT')",
            "except Resolver404:", "    print('ROUTE-ABSENT')",
            "f = p.get_private_photo_store",
            "print('STORE-' + f.__module__ + '.' + f.__name__)",
        ])
        result = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env,
                                capture_output=True, text=True, timeout=300)
        self.assertIn("ROUTE-ABSENT", result.stdout, result.stderr[-1500:])
        self.assertIn("STORE-api.services.private_photos.get_private_photo_store", result.stdout)


if __name__ == "__main__":
    unittest.main()
