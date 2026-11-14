"""Opt-in native Storage create-only uploads, never an active-route default.

This is deliberately NOT the write/read/delete interface used by front_photos.
No result, including CREATED, grants deletion ownership. Configuration and bucket
privacy are server-controlled assertions, not independently verified metadata.
"""
from dataclasses import dataclass
from enum import Enum
import json
import re
import ssl
import threading
import urllib.error
import urllib.request
from uuid import uuid4

from django.conf import settings

from api.services.private_photos import MAX_BYTES, InvalidPrivatePhotoKey, validate_key

MAX_RESPONSE_BYTES = 4096


class CreateOutcome(str, Enum):
    CREATED = 'CREATED'
    CONFLICT = 'CONFLICT'
    AMBIGUOUS = 'AMBIGUOUS'
    UNAVAILABLE = 'UNAVAILABLE'
    AUTHORIZATION_FAILURE = 'AUTHORIZATION_FAILURE'
    SAFETY_FAILURE = 'SAFETY_FAILURE'


class CreateDiagnostic(str, Enum):
    ACKNOWLEDGED = 'ACKNOWLEDGED'
    EXISTING_PATH = 'EXISTING_PATH'
    INVALID_REQUEST = 'INVALID_REQUEST'
    KEY_REUSE = 'KEY_REUSE'
    TRANSPORT_UNCERTAIN = 'TRANSPORT_UNCERTAIN'
    PROVIDER_UNCERTAIN = 'PROVIDER_UNCERTAIN'
    PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE'
    AUTHORIZATION_DENIED = 'AUTHORIZATION_DENIED'
    REDIRECT_REFUSED = 'REDIRECT_REFUSED'
    RESPONSE_BOUND = 'RESPONSE_BOUND'
    ACKNOWLEDGMENT_MISMATCH = 'ACKNOWLEDGMENT_MISMATCH'


@dataclass(frozen=True)
class CreateResult:
    outcome: CreateOutcome
    diagnostic: CreateDiagnostic
    http_status: int | None = None

    @property
    def deletion_authorized(self):
        return False


class NativePhotoConfigurationError(Exception):
    """Separate from PrivatePhotoUnavailable: never triggers legacy cleanup."""
    def __init__(self):
        super().__init__('Native private-photo configuration is disabled or invalid.')


class NativeRedirectRefused(Exception):
    def __init__(self):
        super().__init__('Native private-photo redirect refused.')


class RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise NativeRedirectRefused()


class NativeCreateOnlyStore:
    def __init__(self, options=None):
        if not isinstance(options, dict):
            raise NativePhotoConfigurationError()
        required = ('project_ref', 'endpoint_url', 'bucket', 'secret_key')
        if (options.get('enabled') is not True or options.get('private_bucket_confirmed') is not True
                or any(type(options.get(name)) is not str for name in required)):
            raise NativePhotoConfigurationError()
        project, endpoint, bucket, secret = (options[name] for name in required)
        if (not re.fullmatch(r'[a-z0-9]{20}', project, re.ASCII)
                or endpoint != f'https://{project}.supabase.co'
                or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', bucket, re.ASCII)
                or not re.fullmatch(r'sb_secret_[A-Za-z0-9_-]+', secret, re.ASCII)):
            raise NativePhotoConfigurationError()
        self._endpoint, self._bucket, self._secret = endpoint, bucket, secret
        self._project_ref = project
        self._attempted = set()
        self._lock = threading.Lock()

    @property
    def project_ref(self):
        return self._project_ref

    @property
    def bucket(self):
        return self._bucket

    @staticmethod
    def new_key(folder, owner_id, extension):
        if (folder not in ('households', 'establishments')
                or type(owner_id) is not int or not 1 <= owner_id < 10**19
                or extension not in ('jpg', 'png')):
            raise InvalidPrivatePhotoKey()
        return validate_key(f'profile-photos/{folder}/{owner_id}/{uuid4().hex}.{extension}')

    def create(self, key, data, *, upsert=False):
        """Attempt once; callers retain their key/receipt for later reconciliation.

        Keys must be generated/resolved by trusted server code. In-memory reuse
        protection cannot detect another process or a pre-existing remote object
        if the provider silently violates create-only semantics.
        """
        try:
            validate_key(key)
        except InvalidPrivatePhotoKey:
            return CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.INVALID_REQUEST)
        signature = b'\x89PNG\r\n\x1a\n' if key.endswith('.png') else b'\xff\xd8\xff'
        if (upsert is not False or not isinstance(data, bytes) or not data
                or len(data) > MAX_BYTES or not data.startswith(signature)):
            return CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.INVALID_REQUEST)
        with self._lock:
            if key in self._attempted:
                return CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.KEY_REUSE)
            self._attempted.add(key)
        # No environment proxy, provider SDK retries, redirects or fallback path.
        # Build immediately before use so importing/configuring this adapter is inert.
        try:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}), RejectRedirects(),
                urllib.request.HTTPSHandler(context=ssl.create_default_context()))
            request = urllib.request.Request(
                self._endpoint + '/storage/v1/object/' + self._bucket + '/' + key,
                data=data, method='POST', headers={
                    'apikey': self._secret, 'x-upsert': 'false',
                    'Content-Type': 'image/png' if key.endswith('.png') else 'image/jpeg',
                    'Cache-Control': 'private, no-store',
                })
            try:
                response = opener.open(request, timeout=15)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                status = response.code
                body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                return CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.RESPONSE_BOUND, status)
            if 300 <= status < 400:
                return CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.REDIRECT_REFUSED, status)
            if status in (401, 403):
                return CreateResult(CreateOutcome.AUTHORIZATION_FAILURE, CreateDiagnostic.AUTHORIZATION_DENIED, status)
            if status in (404, 405, 413, 415, 429, 501):
                return CreateResult(CreateOutcome.UNAVAILABLE, CreateDiagnostic.PROVIDER_UNAVAILABLE, status)
            try:
                parsed = json.loads(body)
            except (ValueError, UnicodeError):
                parsed = None
            if not isinstance(parsed, dict):
                return CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.PROVIDER_UNCERTAIN, status)
            if status in (400, 409):
                codes = (parsed.get('error'), parsed.get('code'))
                if any(type(code) is str and code in (
                        'Duplicate', 'AlreadyExists', 'AssetAlreadyExists', 'ResourceAlreadyExists') for code in codes):
                    return CreateResult(CreateOutcome.CONFLICT, CreateDiagnostic.EXISTING_PATH, status)
            if status in (200, 201):
                if ('Key' in parsed and parsed['Key'] != self._bucket + '/' + key):
                    return CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.ACKNOWLEDGMENT_MISMATCH, status)
                if parsed.get('error') or parsed.get('code'):
                    return CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.PROVIDER_UNCERTAIN, status)
                return CreateResult(CreateOutcome.CREATED, CreateDiagnostic.ACKNOWLEDGED, status)
            return CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.PROVIDER_UNCERTAIN, status)
        except NativeRedirectRefused:
            return CreateResult(CreateOutcome.SAFETY_FAILURE, CreateDiagnostic.REDIRECT_REFUSED)
        except Exception:
            # Never return/log provider bodies, headers, URLs or exception text.
            # Even a pre-send transport failure is conservatively uncertain.
            return CreateResult(CreateOutcome.AMBIGUOUS, CreateDiagnostic.TRANSPORT_UNCERTAIN)


def get_native_create_only_store():
    """Explicit future entrypoint; no default enablement or S3 config inheritance."""
    return NativeCreateOnlyStore(getattr(settings, 'SANITATION_NATIVE_PRIVATE_PHOTOS', None))
