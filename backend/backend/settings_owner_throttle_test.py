"""Self-managed disposable test runner; never loads .env or production settings.

Run: python -m backend.settings_owner_throttle_test [--sqlite] [test labels]
Run --guard-check for connection-free rejection tests. Ordinary manage.py usage
is deliberately refused. Temporary clusters are stopped but never deleted.
"""
import ctypes
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured

_OWNER = None


def _listener_pids(port):
    if os.name != "nt":
        raise ImproperlyConfigured("This disposable runner requires Windows listener attestation")
    # Windows IP Helper TCP_TABLE_OWNER_PID_LISTENER, IPv4. No network traffic.
    api = ctypes.windll.iphlpapi.GetExtendedTcpTable
    size = ctypes.c_ulong(0)
    result = api(None, ctypes.byref(size), False, socket.AF_INET, 3, 0)
    if result != 122:
        raise ImproperlyConfigured("Cannot size listener ownership table")
    buffer = ctypes.create_string_buffer(size.value)
    if api(buffer, ctypes.byref(size), False, socket.AF_INET, 3, 0) != 0:
        raise ImproperlyConfigured("Cannot inspect listener ownership")
    count = ctypes.c_ulong.from_buffer(buffer).value
    rows = []
    for index in range(count):
        row = (ctypes.c_ulong * 6).from_buffer(buffer, 4 + index * 24)
        if socket.ntohs(row[2] & 0xffff) == port:
            rows.append((socket.inet_ntoa(int(row[1]).to_bytes(4, "little")), row[5]))
    return rows


class _OwnedCluster:
    def __init__(self):
        self.creator = os.getpid()
        self.root = Path(tempfile.mkdtemp(prefix="capstone-owner-owned-" )).resolve()
        self.data = self.root / "data"
        self.process = None
        self.log = None
        self.port = None
        self.password = secrets.token_urlsafe(32)
        self.name = "owner_throttle_" + secrets.token_hex(6)
        self.executable = Path("C:/Program Files/PostgreSQL/17/bin/postgres.exe").resolve(strict=True)

    def start(self):
        password_file = self.root / "init-password"
        password_file.write_text(self.password, encoding="utf-8")
        try:
            subprocess.run([str(self.executable.with_name("initdb.exe")), "-D", str(self.data),
                            "-U", "throttle_test", "--auth=scram-sha-256", "--encoding=UTF8",
                            "--no-locale", "--pwfile=" + str(password_file)],
                           check=True, timeout=60, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        finally:
            # Redact this invocation's temporary secret; do not remove directories.
            password_file.write_text("", encoding="utf-8")
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            self.port = reservation.getsockname()[1]
        self.log = (self.root / "postgres.log").open("wb")
        self.process = subprocess.Popen(
            [str(self.executable), "-D", str(self.data), "-h", "127.0.0.1", "-p", str(self.port)],
            stdout=self.log, stderr=self.log, creationflags=subprocess.CREATE_NO_WINDOW)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise ImproperlyConfigured("Owned PostgreSQL exited before attestation")
            try:
                self.attest()
                print(json.dumps({"owned_cluster": str(self.root), "pid": self.process.pid,
                                  "port": self.port, "listener": "127.0.0.1",
                                  "creator_pid": self.creator}), flush=True)
                return
            except (ImproperlyConfigured, OSError, ValueError, IndexError):
                time.sleep(0.05)
        raise ImproperlyConfigured("Owned PostgreSQL identity could not be established")

    def attest(self):
        if self is not _OWNER or self.creator != os.getpid() or self.process is None or self.process.poll() is not None:
            raise ImproperlyConfigured("No live PostgreSQL process owned by this invocation")
        if self.data.resolve() != self.root / "data" or self.root.resolve() != self.root:
            raise ImproperlyConfigured("Cluster path identity changed")
        lines = (self.data / "postmaster.pid").read_text().splitlines()
        if (int(lines[0]) != self.process.pid or Path(lines[1]).resolve() != self.data
                or int(lines[3]) != self.port or lines[5] != "127.0.0.1"
                or lines[7].strip() != "ready"):
            raise ImproperlyConfigured("Postmaster identity mismatch")
        if _listener_pids(self.port) != [("127.0.0.1", self.process.pid)]:
            raise ImproperlyConfigured("Listener is not exclusively owned by launched PostgreSQL")

    def authorize(self, params):
        self.attest()
        if (params.get("host") != "127.0.0.1" or str(params.get("port")) != str(self.port)
                or params.get("user") != "throttle_test" or params.get("password") != self.password
                or params.get("dbname") not in {"postgres", self.name, "test_" + self.name}
                or params.get("service") or params.get("hostaddr")):
            raise ImproperlyConfigured("Connection does not match owned cluster launch context")

    def stop(self):
        if self.process is not None and self.process.poll() is None:
            self.attest()
            subprocess.run([str(self.executable.with_name("pg_ctl.exe")), "-D", str(self.data),
                            "-m", "fast", "-w", "stop"], check=True, timeout=25,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW)
            self.process.wait(timeout=10)
        if self.log:
            self.log.close()
        print(json.dumps({"cluster_stopped": self.process is None or self.process.poll() is not None,
                          "retained_directory": str(self.root)}), flush=True)


def _authorize(params):
    if _OWNER is None:
        raise ImproperlyConfigured("Use the self-managed owner test runner; external targets are refused")
    _OWNER.authorize(params)


def _guard_check():
    from django.db.backends.postgresql.base import DatabaseWrapper
    calls = []
    original = DatabaseWrapper.get_new_connection
    def guarded(wrapper, params):
        _authorize(params)
        return original(wrapper, params)
    with patch.object(DatabaseWrapper.Database, "connect", side_effect=lambda **kw: calls.append(kw)):
        try:
            guarded(None, {"host": "127.0.0.1", "port": "5432",
                           "dbname": "owner_throttle_123456abcdef", "user": "throttle_test"})
        except ImproperlyConfigured:
            pass
        else:
            raise AssertionError("Unowned target accepted")
    assert not calls
    print("PASS: unverified localhost rejected before driver connect (0 calls)")


def _discovery_guard_check():
    """Exercise the ordinary project settings/runner with all DB access trapped."""
    import importlib
    from contextlib import ExitStack
    from django.db.backends.postgresql.base import DatabaseWrapper as Pg
    from django.db.backends.sqlite3.base import DatabaseWrapper as Sqlite
    from django.db.backends.base.creation import BaseDatabaseCreation
    from django.core.management.commands.migrate import Command as Migrate
    from django.test.runner import DiscoverRunner

    values = {"SECRET_KEY": "synthetic-guard-only", "TRACKING_CODE_KEY": "synthetic-guard-only",
              "DATABASE_URL": "", "DB_ENGINE": "postgresql", "DB_HOST": "127.0.0.1",
              "DB_PORT": "5432", "DB_NAME": "owner_throttle_123456abcdef",
              "DB_USER": "synthetic", "DB_PASSWORD": "synthetic", "DEBUG": False,
              "USE_SEED_DATA": False, "USE_S3_STORAGE": False}
    def config(instance, name, default=None, **kwargs):
        return values.get(name, default)
    with ExitStack() as stack:
        traps = [stack.enter_context(patch.object(target, name,
                 side_effect=AssertionError("Unsafe database lifecycle reached")))
                 for target, name in ((Pg.Database, "connect"), (Sqlite.Database, "connect"),
                                      (BaseDatabaseCreation, "create_test_db"), (Migrate, "handle"))]
        stack.enter_context(patch("decouple.RepositoryEnv", return_value={}))
        stack.enter_context(patch("decouple.Config.__call__", config))
        os.environ["DJANGO_SETTINGS_MODULE"] = "backend.settings"
        import django
        django.setup()
        runner = DiscoverRunner(verbosity=0, interactive=False)
        label = "api.test_owner_status_throttle_postgres"
        suite = runner.build_suite([label])
        if runner.get_databases(suite):
            raise AssertionError("Unowned suite requested database aliases")
        original_setup = runner.setup_databases
        def empty_setup(**kwargs):
            if kwargs.get("aliases"):
                raise AssertionError("Database setup requested for unowned suite")
            return original_setup(**kwargs)
        with patch.object(runner, "setup_databases", side_effect=empty_setup), \
                patch.object(runner, "run_checks"):
            failures = runner.run_tests([label])
        if failures != 1:
            raise AssertionError("Unsafe discovery must report one explicit failure")
        try:
            importlib.import_module("backend.settings_owner_throttle_test")
        except ImproperlyConfigured:
            pass
        else:
            raise AssertionError("Direct dedicated settings import accepted")
        if any(trap.call_count for trap in traps):
            raise AssertionError("Unsafe path attempted database access")
        print("PASS: ordinary project discovery refused; aliases=0; driver connections=0; "
              "database creations=0; migrations=0; direct settings import refused")


SECRET_KEY = "synthetic-owner-throttle-test-only"
TRACKING_CODE_KEY = "synthetic-owner-throttle-hmac-only"
DEBUG = False
USE_SEED_DATA = False
USE_S3_STORAGE = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
INSTALLED_APPS = [
    "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "rest_framework", "rest_framework.authtoken", "api",
]
MIDDLEWARE = []
ROOT_URLCONF = "api.test_owner_status_throttle_postgres"
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "throttle": {"BACKEND": "django.core.cache.backends.db.DatabaseCache",
                 "LOCATION": "api_throttle_cache"},
}
REST_FRAMEWORK = {"NUM_PROXIES": 1, "DEFAULT_THROTTLE_RATES": {"owner_status_ip": "20/hour"}}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "Asia/Manila"
STATIC_URL = "/static/"
MEDIA_URL = "/media/"

# A direct settings import must fail before Django's database-creation lifecycle.
if __name__ != "__main__":
    raise ImproperlyConfigured("Run python -m backend.settings_owner_throttle_test")


def main():
    global _OWNER, DATABASES
    # libpq environment (notably PGHOSTADDR/PGSERVICE) must never redirect an
    # explicitly configured loopback connection or inject connection options.
    for name in list(os.environ):
        if name.upper().startswith("PG"):
            del os.environ[name]
    if "--discovery-guard-check" in sys.argv:
        _discovery_guard_check()
        return 0
    if "--guard-check" in sys.argv:
        _guard_check()
        return 0
    sqlite = "--sqlite" in sys.argv
    labels = [arg for arg in sys.argv[1:] if arg != "--sqlite"]
    if not labels:
        labels = ["api.test_owner_status_throttle_postgres"]
    from django.db.backends.postgresql.base import DatabaseWrapper
    from django.db.backends.utils import CursorWrapper
    original_connect = DatabaseWrapper.get_new_connection
    original_execute = CursorWrapper.execute
    original_executemany = CursorWrapper.executemany

    def connect(wrapper, params):
        _authorize(params)
        return original_connect(wrapper, params)

    def guard_cursor(cursor):
        if cursor.db.vendor == "postgresql":
            _authorize(cursor.db.get_connection_params())

    def execute(cursor, sql, params=None):
        guard_cursor(cursor)
        return original_execute(cursor, sql, params)

    def executemany(cursor, sql, params):
        guard_cursor(cursor)
        return original_executemany(cursor, sql, params)

    try:
        if sqlite:
            DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
        else:
            _OWNER = _OwnedCluster()
            _OWNER.start()
            DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql",
                "HOST": "127.0.0.1", "PORT": str(_OWNER.port), "NAME": _OWNER.name,
                "USER": "throttle_test", "PASSWORD": _OWNER.password, "CONN_MAX_AGE": 0,
                "OPTIONS": {"connect_timeout": 5, "sslmode": "disable"},
                "TEST": {"NAME": "test_" + _OWNER.name}}}
        sys.modules["backend.settings_owner_throttle_test"] = sys.modules[__name__]
        os.environ["DJANGO_SETTINGS_MODULE"] = "backend.settings_owner_throttle_test"
        with patch.object(DatabaseWrapper, "get_new_connection", connect), \
                patch.object(CursorWrapper, "execute", execute), \
                patch.object(CursorWrapper, "executemany", executemany):
            import django
            django.setup()
            if not sqlite:
                from api.test_owner_status_throttle_postgres import _register_owned_suite
                _register_owned_suite(_OWNER)
            from django.test.runner import DiscoverRunner
            return int(bool(DiscoverRunner(verbosity=1, interactive=False).run_tests(labels)))
    finally:
        from django.db import connections
        if os.environ.get("DJANGO_SETTINGS_MODULE") == "backend.settings_owner_throttle_test":
            connections.close_all()
        if _OWNER:
            _OWNER.stop()


if __name__ == "__main__":
    raise SystemExit(main())
