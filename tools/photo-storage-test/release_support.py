"""Test-only isolation helpers shared by release_offline.py and release_preview.py.

Standalone: imports no probe script, no production settings and no URL module.
Every caller owns a new loopback PostgreSQL cluster, retained after shutdown.
No provider access, credential prompt or secret handling exists in this module.
"""
import json
from pathlib import Path
import secrets
import socket
import subprocess
import sys
from wsgiref.simple_server import WSGIRequestHandler

REPO = Path(__file__).resolve().parents[2]
PG = Path('C:/Program Files/PostgreSQL/17/bin')
ROLE, DATABASE = 'household_e2e_test', 'household_e2e_disposable'
LEAF = '0075_merge_production_and_photos'


class Stop(Exception):
    pass


def require(condition):
    if not condition:
        raise Stop('Safety check failed')


def save(root, report):
    # Only caller-created, allowlisted structural values reach this report.
    path = root / 'report.json'
    path.write_text(json.dumps(report, indent=2), encoding='utf-8')


class Cluster:
    def __init__(self, root):
        self.root, self.data, self.started = root, root / 'pgdata', False
        require(root.name.startswith('capstone-household-e2e-') and not self.data.exists())
        (root / 'empty.pgpass').write_text('')
        self.env = {'SystemRoot': 'C:\\Windows', 'TEMP': str(root), 'TMP': str(root),
                    'PATH': str(PG) + ';C:\\Windows\\System32',
                    'PGSERVICEFILE': str(root / 'no-services'), 'PGPASSFILE': str(root / 'empty.pgpass')}
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        require(self.port != 5432)

    def command(self, program, *args):
        subprocess.run([str(PG / program), *map(str, args)], env=self.env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=60)

    def start(self):
        self.command('initdb.exe', '-D', self.data, '-U', ROLE, '-A', 'trust', '--encoding=UTF8', '--no-locale')
        with (self.data / 'postgresql.conf').open('a') as target:
            target.write(f"\nlisten_addresses='127.0.0.1'\nport={self.port}\nmax_connections=20\n")
        self.command('pg_ctl.exe', '-D', self.data, '-l', self.root / 'postgres.log', '-w', 'start')
        self.started = True
        import psycopg2
        conn = psycopg2.connect(host='127.0.0.1', hostaddr='127.0.0.1', port=self.port,
            user=ROLE, dbname='postgres', password='', passfile=str(self.root / 'empty.pgpass'),
            sslmode='disable', connect_timeout=5)
        try:
            conn.autocommit = True
            with conn.cursor() as cursor:
                self.identity(cursor, 'postgres')
                cursor.execute("SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')")
                require(cursor.fetchone()[0] == 0)
                cursor.execute('CREATE DATABASE ' + DATABASE)
        finally:
            conn.close()

    def identity(self, cursor, name=DATABASE):
        cursor.execute("SELECT current_database(), current_user, host(inet_server_addr()), inet_server_port(), current_setting('data_directory'), current_setting('listen_addresses')")
        row = cursor.fetchone()
        require(row[:4] == (name, ROLE, '127.0.0.1', self.port))
        require(Path(row[4]).resolve() == self.data.resolve() and row[5] == '127.0.0.1')
        pid = (self.data / 'postmaster.pid').read_text().splitlines()
        require(Path(pid[1]).resolve() == self.data.resolve() and int(pid[3]) == self.port)

    def stop(self):
        if self.started:
            self.command('pg_ctl.exe', '-D', self.data, '-m', 'fast', '-w', 'stop')
            self.started = False


class Response:
    """Fake provider response for the offline transport. Never a real reply."""
    def __init__(self, code, data, mime='application/json'):
        self.code, self.data = code, data
        self.headers = {'Content-Type': mime, 'Content-Length': str(len(data))}

    def read(self, limit):
        return self.data[:limit]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class Quiet(WSGIRequestHandler):
    def log_message(self, *args):
        pass

    def get_stderr(self):
        # wsgiref catches BaseException too: never print its raw traceback.
        class Discard:
            def write(self, value):
                return len(value)

            def flush(self):
                pass
        return Discard()


def configure(cluster, report):
    sys.path.insert(0, str(REPO / 'backend'))
    from django.conf import settings
    require(not settings.configured)
    settings.configure(SECRET_KEY=secrets.token_hex(32), DEBUG=False, USE_TZ=True,
        ALLOWED_HOSTS=['127.0.0.1'], ROOT_URLCONF='household_e2e_urls', MIDDLEWARE=[],
        INSTALLED_APPS=['django.contrib.auth', 'django.contrib.contenttypes', 'rest_framework', 'rest_framework.authtoken', 'api'],
        DATABASES={'default': {'ENGINE': 'django.db.backends.postgresql', 'HOST': '127.0.0.1',
            'PORT': str(cluster.port), 'NAME': DATABASE, 'USER': ROLE, 'PASSWORD': '',
            'OPTIONS': {'hostaddr': '127.0.0.1', 'passfile': str(cluster.root / 'empty.pgpass'), 'sslmode': 'disable'}}},
        CACHES={name: {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': name} for name in ('default', 'throttle')},
        USE_SEED_DATA=False, USE_S3_STORAGE=False, SANITATION_PRIVATE_PHOTOS={'enabled': False},
        SANITATION_NATIVE_PHOTO_DEVELOPMENT=True, SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT=True,
        TRACKING_CODE_KEY=secrets.token_hex(32), DEFAULT_AUTO_FIELD='django.db.models.BigAutoField',
        REST_FRAMEWORK={'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.TokenAuthentication'],
            'NUM_PROXIES': 1, 'DEFAULT_THROTTLE_RATES': {'community_report_contact': '5/day', 'community_report_ip': '20/hour', 'owner_status_ip': '20/hour'}},
        MEDIA_URL='/media/', STATIC_URL='/static/', MEDIA_ROOT=str(cluster.root / 'media'),
        LOGGING_CONFIG=None, STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}})
    import django
    django.setup()
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor
    with connection.cursor() as cursor:
        cluster.identity(cursor)
        cursor.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
        require(cursor.fetchone()[0] == 0)
    executor = MigrationExecutor(connection)
    require(executor.loader.graph.leaf_nodes('api') == [('api', LEAF)])
    targets = [('api', LEAF), ('auth', '0012_alter_user_first_name_max_length'), ('authtoken', '0004_alter_tokenproxy_options')]
    plan = executor.migration_plan(targets)
    require(all(not reverse for migration, reverse in plan))
    report['migration_plan'] = [app.app_label + '.' + app.name for app, reverse in plan]
    save(cluster.root, report)
    executor.migrate(targets)
    from api.models import HouseholdSanitationRecord, SanitaryEstablishment, HouseholdFrontPhoto, NativePhotoAttempt, SanitaryComplaint, TouristRecord
    from django.contrib.auth import get_user_model
    require(all(model.objects.count() == 0 for model in (HouseholdSanitationRecord, SanitaryEstablishment, HouseholdFrontPhoto, NativePhotoAttempt, SanitaryComplaint, TouristRecord, get_user_model())))
    report['empty_operational_tables'] = True
    with connection.cursor() as cursor:
        cluster.identity(cursor)
        cursor.execute('SELECT version()')
        report['postgres_version'] = cursor.fetchone()[0]
        report['constraints'] = {model._meta.db_table: sorted(connection.introspection.get_constraints(cursor, model._meta.db_table)) for model in (HouseholdFrontPhoto, NativePhotoAttempt)}
    report['migration_leaf'] = LEAF
    report['database'] = {'host': '127.0.0.1', 'port': cluster.port, 'name': DATABASE, 'role': ROLE, 'data_directory': str(cluster.data)}
