"""Loopback React build + NORMAL Django routes + disposable PostgreSQL. Fake storage only.

Create stop.txt in the printed evidence directory to stop and verify integrity.
control.json accepts only fake failure mode and a synthetic delay; never credentials.
"""
import io
import json
import mimetypes
import os
from pathlib import Path
import socket
import sys
import tempfile
import time
import types
from unittest.mock import patch
from wsgiref.simple_server import make_server
import release_support as base


def main():
    root = Path(tempfile.mkdtemp(prefix='capstone-household-e2e-release-browser-'))
    report = {'mode': 'OFFLINE_BROWSER', 'status': 'RUNNING'}
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
            from django.core.handlers.wsgi import WSGIHandler
            from django.contrib.auth import get_user_model
            from api.models import UserProfile, HouseholdSanitationRecord, SanitaryEstablishment, SanitaryBusinessType, NativePhotoAttempt
            from api.services import native_private_photos as native
            from PIL import Image
            settings.SANITATION_NATIVE_PHOTO_DEVELOPMENT = False
            settings.SANITATION_NATIVE_PHOTO_READ_DEVELOPMENT = False
            settings.SANITATION_PHOTO_WRITE_PROVIDER = 'NATIVE'
            settings.SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED = True
            settings.SANITATION_NATIVE_PHOTO_READS_ENABLED = True
            settings.SANITATION_NATIVE_PRIVATE_PHOTOS = dict(enabled=True, private_bucket_confirmed=True,
                project_ref='a'*20, endpoint_url='https://'+'a'*20+'.supabase.co',
                bucket='offline-only', secret_key='sb_secret_OFFLINE_DUMMY')
            urls = types.ModuleType('household_e2e_urls')
            urls.urlpatterns = [path('api/', include('api.urls'))]
            sys.modules[urls.__name__] = urls
            user = get_user_model().objects.create_user(username='photo-local-staff', password='Synthetic-local-only-42')
            UserProfile.objects.create(user=user, role='sanitation')
            house = HouseholdSanitationRecord.objects.create(household_code='PHOTO-LOCAL', household_head='Synthetic Photo Household', barangay='Daungan')
            business = SanitaryBusinessType.objects.first() or SanitaryBusinessType.objects.create(name='Synthetic business')
            est = SanitaryEstablishment.objects.create(business_name='Synthetic Photo Establishment', owner_name='Synthetic owner',
                business_type=business, barangay='Daungan', address='Synthetic address')
            owners = [(HouseholdSanitationRecord, house.pk), (SanitaryEstablishment, est.pk)]
            before = [model.objects.values().get(pk=pk) for model, pk in owners]
            for name, color, fmt in [('a.png','red','PNG'), ('b.png','blue','PNG'), ('c.jpg','green','JPEG')]:
                Image.new('RGB', (100, 60), color).save(root / name, fmt)
            (root / 'invalid.txt').write_text('not an image')
            (root / 'large.png').write_bytes(b'\x89PNG\r\n\x1a\n' + bytes(5*1024*1024))
            (root / 'control.json').write_text('{}')
            objects, requests, http = {}, [], []
            class Transport:
                def open(self, request, timeout):
                    from urllib.parse import urlsplit
                    target = urlsplit(request.full_url)
                    assert target.netloc == 'a'*20+'.supabase.co'
                    assert request.method in ('POST', 'GET')
                    prefix = '/storage/v1/object/' + ('authenticated/' if request.method == 'GET' else '') + 'offline-only/'
                    assert target.path.startswith(prefix)
                    key = target.path[len(prefix):]; native.validate_key(key)
                    requests.append({'method': request.method, 'key': key})
                    if request.method == 'POST':
                        assert request.get_header('X-upsert') == 'false'
                        control = json.loads((root / 'control.json').read_text())
                        time.sleep(min(float(control.get('delay', 0)), 5))
                        if control.get('mode') == 'unavailable': return base.Response(503, b'{}')
                        if key in objects: return base.Response(409, b'{"error":"Duplicate"}')
                        objects[key] = request.data
                        if control.get('mode') == 'ambiguous': raise TimeoutError('synthetic timeout')
                        return base.Response(200, json.dumps({'Key':'offline-only/'+key}).encode())
                    if key not in objects: return base.Response(404, b'{}')
                    return base.Response(200, objects[key], 'image/png' if key.endswith('.png') else 'image/jpeg')
            django_app = WSGIHandler()
            build = (base.REPO / 'frontend/build').resolve()
            def app(environ, start):
                requested = environ.get('PATH_INFO', '/')
                if requested.startswith('/api/'):
                    def capture(status, headers, exc_info=None):
                        http.append({'method':environ['REQUEST_METHOD'], 'path':requested, 'status':status[:3]})
                        return start(status, headers, exc_info)
                    return django_app(environ, capture)
                file = (build / requested.lstrip('/')).resolve()
                if not file.is_relative_to(build) or not file.is_file(): file = build / 'index.html'
                start('200 OK', [('Content-Type', mimetypes.guess_type(str(file))[0] or 'application/octet-stream')])
                return [file.read_bytes()]
            with patch.object(native.urllib.request, 'build_opener', return_value=Transport()), \
                 patch('boto3.session.Session', side_effect=AssertionError('S3 forbidden')):
                server = make_server('127.0.0.1', 0, app, handler_class=base.Quiet)
                server.timeout = .5
                report['url'] = 'http://127.0.0.1:' + str(server.server_port)
                base.save(root, report)
                print('LOCAL_URL=' + report['url'], flush=True)
                print('EVIDENCE=' + str(root), flush=True)
                while not (root / 'stop.txt').exists(): server.handle_request()
                server.server_close()
            report.update(status='PASS', requests=requests, http=http, native_deletes=0,
                non_photo_unchanged=before == [model.objects.values().get(pk=pk) for model, pk in owners],
                attempts=list(NativePhotoAttempt.objects.values('owner_kind','owner_record_id','state','object_key')))
    finally:
        from django.db import connections
        connections.close_all(); cluster.stop()
        report['postgres_stopped'] = not cluster.started
        base.save(root, report)
    return 0


if __name__ == '__main__': raise SystemExit(main())
