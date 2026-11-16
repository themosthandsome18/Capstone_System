"""Offline-only release checks. Reuse verified disposable-cluster isolation."""
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import types
from unittest.mock import patch
import release_support as base


def main():
    root = Path(tempfile.mkdtemp(prefix='capstone-household-e2e-release-'))
    report = {'mode': 'OFFLINE_ONLY', 'status': 'BLOCKED'}
    for name in list(os.environ):
        if name.startswith(('PG', 'DJANGO', 'AWS_', 'SUPABASE', 'SANITATION_', 'DB_')) or name == 'DATABASE_URL':
            os.environ.pop(name, None)
    cluster = base.Cluster(root)
    original = socket.socket.connect
    def connect(sock, address):
        if address[0] != '127.0.0.1':
            raise AssertionError('External network forbidden')
        return original(sock, address)
    try:
        with patch.object(socket.socket, 'connect', connect):
            cluster.start(); base.configure(cluster, report)
            from django.conf import settings
            from django.urls import path, include
            from django.core.management import call_command
            from django.test.runner import DiscoverRunner
            urls = types.ModuleType('household_e2e_urls')
            urls.urlpatterns = [path('api/', include('api.urls'))]
            sys.modules[urls.__name__] = urls
            settings.ALLOWED_HOSTS = ['127.0.0.1', 'testserver']
            settings.SANITATION_NATIVE_PHOTO_DEVELOPMENT = False
            settings.SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT = False
            call_command('check')
            call_command('makemigrations', 'api', check=True, dry_run=True, verbosity=1)
            labels = sys.argv[1:] or ['api.test_photo_release', 'api.test_household_front_photo',
                'api.test_establishment_front_photo', 'api.test_private_photos', 'api.test_native_private_photos',
                'api.test_native_photo_attempt', 'api.test_front_photo_provenance', 'api.test_native_photo_workflow',
                'api.test_native_photo_workflow_http', 'api.test_photo_source_reads', 'api.test_native_photo_reads']
            failures = DiscoverRunner(verbosity=1, interactive=False).run_tests(labels)
            report.update(status='PASS' if failures == 0 else 'FAIL', failures=failures, labels=labels)
    finally:
        from django.db import connections
        connections.close_all()
        cluster.stop(); report['postgres_stopped'] = not cluster.started
        (root / 'report.json').write_text(json.dumps(report, indent=2))
        print('Evidence directory:', root)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
