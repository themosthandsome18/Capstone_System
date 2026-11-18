"""Explicit private native-photo configuration; no public-media inheritance."""


def native_photo_settings(config):
    uploads = config('SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED', default=False, cast=bool)
    reads = config('SANITATION_NATIVE_PHOTO_READS_ENABLED', default=False, cast=bool)
    return {
        'SANITATION_PHOTO_WRITE_PROVIDER': config('SANITATION_PHOTO_WRITE_PROVIDER', default='S3'),
        'SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED': uploads,
        'SANITATION_NATIVE_PHOTO_READS_ENABLED': reads,
        'SANITATION_NATIVE_PRIVATE_PHOTOS': {
            'enabled': uploads or reads,
            'private_bucket_confirmed': config('SANITATION_NATIVE_PHOTOS_BUCKET_CONFIRMED_PRIVATE', default=False, cast=bool),
            'project_ref': config('SANITATION_NATIVE_PHOTOS_PROJECT_REF', default=''),
            'endpoint_url': config('SANITATION_NATIVE_PHOTOS_ENDPOINT', default=''),
            'bucket': config('SANITATION_NATIVE_PHOTOS_BUCKET', default=''),
            'secret_key': config('SANITATION_NATIVE_PHOTOS_SECRET_KEY', default=''),
        },
    }
