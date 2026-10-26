"""Owner-only atomic history operations compatible with Django DatabaseCache.

This serializes failure recording, not admission. Shared cache eviction remains
outside this helper's contract. No tracking code is accepted or stored here.
"""
import base64
import io
import math
import pickle
from datetime import UTC, datetime

from django.conf import settings
from django.core.cache.backends.db import DatabaseCache
from django.core.exceptions import ImproperlyConfigured
from django.db import DatabaseError, connections, models, router, transaction
from django.utils.connection import ConnectionDoesNotExist
from django.utils.timezone import now as timezone_now
from rest_framework.exceptions import APIException


class OwnerHistoryUnavailable(APIException):
    status_code = 503
    default_detail = "Owner lookup is temporarily unavailable. Please try again later."
    default_code = "owner_lookup_unavailable"


class _PrimitiveUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        raise ValueError("Non-primitive history")


def _context(cache, key):
    if type(cache) is not DatabaseCache:
        raise ValueError("Unsupported cache")
    alias = router.db_for_write(cache.cache_model_class)
    connection = connections[alias]
    if connection.vendor not in {"postgresql", "sqlite"}:
        raise ValueError("Unsupported database")
    return alias, connection, connection.ops.quote_name(cache._table), cache.make_and_validate_key(key)


def _encode(cache, history):
    return base64.b64encode(pickle.dumps(history, cache.pickle_protocol)).decode("latin1")


def _expiry(cache, connection, duration):
    expiry = datetime.fromtimestamp(cache.get_backend_timeout(duration), tz=UTC if settings.USE_TZ else None)
    return connection.ops.adapt_datetimefield_value(expiry.replace(microsecond=0))


def _history(connection, row):
    if row is None:
        return []
    value, expires = row
    expression = models.Expression(output_field=models.DateTimeField())
    for converter in connection.ops.get_db_converters(expression) + expression.get_db_converters(connection):
        expires = converter(expires, expression, connection)
    if not isinstance(expires, datetime):
        raise ValueError("Invalid expiry")
    if expires < timezone_now():
        return []
    value = connection.ops.process_clob(value)
    stream = io.BytesIO(base64.b64decode(value.encode(), validate=True))
    history = _PrimitiveUnpickler(stream).load()
    if stream.read() or type(history) is not list or any(
        type(stamp) not in (int, float) or not math.isfinite(stamp) for stamp in history
    ):
        raise ValueError("Invalid history")
    return history


_FAILURES = (DatabaseError, ConnectionDoesNotExist, ImproperlyConfigured, ValueError, TypeError,
             pickle.UnpicklingError, EOFError, OverflowError, AttributeError)


def read_history(cache, key):
    """Read the writer database; never delete an expired row from admission."""
    try:
        _, connection, table, key = _context(cache, key)
        q = connection.ops.quote_name
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT {q('value')}, {q('expires')} FROM {table} WHERE {q('cache_key')} = %s", [key])
            return _history(connection, cursor.fetchone())
    except _FAILURES:
        raise OwnerHistoryUnavailable() from None


def _timeouts(cursor):
    previous = {}
    for name, cap in (("lock_timeout", 2000), ("statement_timeout", 5000)):
        cursor.execute("SELECT setting FROM pg_settings WHERE name = %s", [name])
        old = int(cursor.fetchone()[0])  # pg_settings expresses these in ms.
        previous[name] = old
        cursor.execute("SELECT set_config(%s, %s, true)", [name, str(min(old, cap) if old else cap)])
    return previous


def record_failure(cache, key, duration, timer):
    try:
        alias, connection, table, key = _context(cache, key)
        q = connection.ops.quote_name
        with transaction.atomic(using=alias):
            with connection.cursor() as cursor:
                previous = _timeouts(cursor) if connection.vendor == "postgresql" else {}
                # Also establishes SQLite's write transaction before the read.
                cursor.execute(
                    f"INSERT INTO {table} ({q('cache_key')}, {q('value')}, {q('expires')}) "
                    f"VALUES (%s, %s, %s) ON CONFLICT ({q('cache_key')}) DO NOTHING",
                    [key, _encode(cache, []), _expiry(cache, connection, duration)],
                )
                lock = " FOR UPDATE" if connection.vendor == "postgresql" else ""
                cursor.execute(f"SELECT {q('value')}, {q('expires')} FROM {table} WHERE {q('cache_key')} = %s{lock}", [key])
                row = cursor.fetchone()
                if row is None:
                    raise ValueError("History disappeared")
                now = timer()
                history = [stamp for stamp in _history(connection, row) if stamp > now - duration]
                history.insert(0, now)
                cursor.execute(
                    f"UPDATE {table} SET {q('value')} = %s, {q('expires')} = %s WHERE {q('cache_key')} = %s",
                    [_encode(cache, history), _expiry(cache, connection, duration), key],
                )
                if cursor.rowcount != 1:
                    raise ValueError("History not updated")
                # Avoid changing limits in a caller's enclosing transaction.
                for name, old in previous.items():
                    cursor.execute("SELECT set_config(%s, %s, true)", [name, str(old)])
    except _FAILURES:
        # The atomic context has rolled back before DRF constructs the 503.
        raise OwnerHistoryUnavailable() from None
