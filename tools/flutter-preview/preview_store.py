"""In-memory private photo store for the preview process only (requires Django setup)."""
import threading


class RealStorageBlocked(RuntimeError):
    pass


class FakePrivatePhotoStore:
    """Same read/write/delete contract as PrivatePhotoStore; bytes stay in this process."""

    def __init__(self, private_photos):
        self._pp = private_photos
        self._lock = threading.Lock()
        self.objects = {}

    def write(self, key, data):
        self._pp.validate_key(key)
        with self._lock:
            self.objects[key] = bytes(data)

    def read(self, key):
        self._pp.validate_key(key)
        with self._lock:
            if key not in self.objects:
                raise self._pp.PrivatePhotoMissing()
            return self.objects[key]

    def delete(self, key):
        self._pp.validate_key(key)
        with self._lock:
            self.objects.pop(key, None)


def install_fake_store():
    """Route every private-photo lookup to the fake and make the real client unusable."""
    from api.services import private_photos
    from api.views import private_photos as photo_views

    store = FakePrivatePhotoStore(private_photos)
    attempts = []

    def blocked_client(self):
        attempts.append(1)
        raise RealStorageBlocked("Real private storage is disabled in the Flutter preview.")

    private_photos.PrivatePhotoStore._client = blocked_client
    private_photos.get_private_photo_store = lambda: store
    photo_views.get_private_photo_store = lambda: store
    return store, attempts
