from django.core.cache import caches
from rest_framework.exceptions import Throttled
from rest_framework.throttling import ScopedRateThrottle


class _FixedScopeRateThrottle(ScopedRateThrottle):
    """A ScopedRateThrottle with its scope fixed on the class.

    Function views made with @api_view cannot carry a `throttle_scope`
    attribute, so the scope is set here. Counts live in the "throttle" cache,
    a database cache shared by every server process, so a limit holds no
    matter which process serves a request. When `message` is set, a refused
    request gets it as the 429 detail.
    """

    fixed_scope = None
    message = None

    def __init__(self):
        self.cache = caches["throttle"]
        super().__init__()

    def _use_scope(self):
        self.scope = self.fixed_scope
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)

    def allow_request(self, request, view):
        self._use_scope()
        allowed = super(ScopedRateThrottle, self).allow_request(request, view)
        if not allowed and self.message:
            raise Throttled(wait=self.wait(), detail=self.message)
        return allowed


class EstablishmentClaimRateThrottle(_FixedScopeRateThrottle):
    fixed_scope = "establishment_claim"


class CommunityReportIpRateThrottle(_FixedScopeRateThrottle):
    """Public community reports per client address (every attempt counts)."""

    fixed_scope = "community_report_ip"
    message = (
        "Masyadong maraming report mula sa device na ito ngayong oras. "
        "Subukan muli mamaya. / Too many reports from this device this hour. "
        "Please try again later."
    )


class CommunityReportContactRateThrottle(_FixedScopeRateThrottle):
    """Public community reports per contact number, counted only when saved.

    The check runs before the view like any throttle, but a report is only
    recorded by `record_success` after it is actually created, so a
    submission rejected for a missing field does not use up the reporter's
    daily quota.
    """

    fixed_scope = "community_report_contact"
    message = (
        "Naabot na ang 5 report ngayong araw para sa contact number na ito. "
        "Subukan muli bukas. / This contact number has reached 5 reports "
        "today. Please try again tomorrow."
    )

    def get_cache_key(self, request, view):
        from .views.mobile import PH_MOBILE_NUMBER, normalize_contact_digits

        data = getattr(request, "data", {}) or {}
        contact = normalize_contact_digits(
            data.get("contact_number") or data.get("contact") or ""
        )
        if not PH_MOBILE_NUMBER.match(contact):
            return None  # the view rejects it; nothing to count
        return self.cache_format % {"scope": self.scope, "ident": contact}

    def allow_request(self, request, view):
        self._use_scope()
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        self.history = self.cache.get(self.key, [])
        self.now = self.timer()
        while self.history and self.history[-1] <= self.now - self.duration:
            self.history.pop()
        if len(self.history) >= self.num_requests:
            raise Throttled(wait=self.wait(), detail=self.message)
        return True

    @classmethod
    def record_success(cls, request):
        throttle = cls()
        throttle._use_scope()
        key = throttle.get_cache_key(request, None)
        if key is None:
            return
        now = throttle.timer()
        history = [
            stamp for stamp in throttle.cache.get(key, []) if stamp > now - throttle.duration
        ]
        history.insert(0, now)
        throttle.cache.set(key, history, throttle.duration)
