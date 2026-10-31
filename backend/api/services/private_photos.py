"""Read-only private storage. No default_storage, public URLs or caller URLs."""
import re
from contextlib import suppress
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings

MAX_BYTES = 5 * 1024 * 1024
KEY = re.compile(r"profile-photos/(?:establishments|households)/[1-9][0-9]{0,18}/[0-9a-f]{32}\.(?:jpg|png)", re.ASCII)


class PrivatePhotoUnavailable(Exception):
    pass


class PrivatePhotoMissing(Exception):
    pass


class InvalidPrivatePhotoKey(Exception):
    pass


def validate_key(key):
    if not isinstance(key, str) or not KEY.fullmatch(key):
        raise InvalidPrivatePhotoKey()
    return key


class PrivatePhotoStore:
    """Constructed only from explicit private configuration; never stores URLs."""
    def __init__(self, options):
        options = options or {}
        required = ('endpoint_url', 'bucket', 'region', 'access_key', 'secret_key')
        if (options.get('enabled') is not True
                or options.get('private_bucket_confirmed') is not True
                or any(not isinstance(options.get(name), str) or not options[name].strip() for name in required)):
            raise PrivatePhotoUnavailable()
        try:
            endpoint = urlsplit(options['endpoint_url'])
        except ValueError:
            raise PrivatePhotoUnavailable() from None
        if (endpoint.scheme != 'https' or not endpoint.hostname
                or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment
                or endpoint.path not in ('', '/', '/storage/v1/s3')):
            raise PrivatePhotoUnavailable()
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', options['bucket']):
            raise PrivatePhotoUnavailable()
        self.options = dict(options)

    def url(self, key):
        # Deliberately disallow even signed URLs: retrieval stays authenticated.
        raise PrivatePhotoUnavailable()

    def _client(self):
        return boto3.session.Session(
            aws_access_key_id=self.options['access_key'],
            aws_secret_access_key=self.options['secret_key'],
            region_name=self.options['region'],
        ).client('s3', endpoint_url=self.options['endpoint_url'],
                 config=Config(signature_version='s3v4', connect_timeout=5,
                               read_timeout=10, retries={'mode': 'standard', 'total_max_attempts': 2},
                               s3={'addressing_style': 'path'}))

    def read(self, key):
        validate_key(key)
        body = None
        client = None
        try:
            client = self._client()
            result = client.get_object(Bucket=self.options['bucket'], Key=key)
            body = result['Body']
            if result['ContentLength'] > MAX_BYTES:
                raise PrivatePhotoUnavailable()
            data = body.read(MAX_BYTES + 1)
            if not data or len(data) > MAX_BYTES or len(data) != result['ContentLength']:
                raise PrivatePhotoUnavailable()
            signature = b'\x89PNG\r\n\x1a\n' if key.endswith('.png') else b'\xff\xd8\xff'
            if not data.startswith(signature):
                raise PrivatePhotoUnavailable()
            return data
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') in ('NoSuchKey', 'NotFound', '404'):
                raise PrivatePhotoMissing() from None
            raise PrivatePhotoUnavailable() from None
        except (BotoCoreError, OSError, KeyError, TypeError, ValueError):
            raise PrivatePhotoUnavailable() from None
        finally:
            if body is not None:
                with suppress(BotoCoreError, OSError):
                    body.close()
            if client is not None:
                with suppress(BotoCoreError, OSError):
                    client.close()


def get_private_photo_store():
    return PrivatePhotoStore(getattr(settings, 'SANITATION_PRIVATE_PHOTOS', None))
