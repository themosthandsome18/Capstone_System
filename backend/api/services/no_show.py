"""The no-show sweep: pending bookings whose arrival date has passed become no-shows.

Which bookings qualify depends only on today's date and on the bookings
themselves. So the sweep runs at most once a day, recorded in the cache under
a key that names the day, plus once more whenever a tourist record is written
(a booking saved today with a past date must still flip on the next request,
as it always has). Interim: a scheduled daily task would be the better home.
"""
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

from ..models import BOOKING_STATUS_NO_SHOW, BOOKING_STATUS_PENDING, TouristRecord

SWEEP_CACHE_KEY_PREFIX = "tourism_no_show_sweep"


def _sweep_key(day):
    return f"{SWEEP_CACHE_KEY_PREFIX}:{day.isoformat()}"


def _seconds_until_midnight():
    now = timezone.localtime()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((midnight - now).total_seconds()), 1)


def sweep_no_shows():
    """Flip past-dated pending bookings to no-show, unless today's sweep has run.

    Fails toward sweeping: a cache miss, restart, eviction or a cache error
    means the sweep runs. The marker expires at midnight, and the key names the
    day, so a new day always sweeps.
    """
    today = timezone.localdate()
    key = _sweep_key(today)

    try:
        if cache.get(key):
            return
    except Exception:
        pass

    TouristRecord.objects.filter(
        status=BOOKING_STATUS_PENDING,
        arrival_date__lt=today,
    ).update(status=BOOKING_STATUS_NO_SHOW)

    try:
        cache.set(key, True, timeout=_seconds_until_midnight())
    except Exception:
        pass


def mark_no_show_sweep_needed():
    """Make the next request sweep again: a tourist record has been written."""
    try:
        cache.delete(_sweep_key(timezone.localdate()))
    except Exception:
        pass
