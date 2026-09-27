import math

from django.core.cache import caches
from rest_framework.exceptions import Throttled
from rest_framework.throttling import ScopedRateThrottle


class _MessageOnlyThrottled(Throttled):
    """A 429 whose detail is exactly `detail`.

    DRF's Throttled appends an English "Expected available in N seconds." to
    the detail when given a wait; here the wait goes only to the Retry-After
    header, so the reporter sees just the bilingual message.
    """

    def __init__(self, wait, detail):
        super().__init__(wait=None, detail=detail)
        self.wait = None if wait is None else math.ceil(wait)


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
            raise _MessageOnlyThrottled(wait=self.wait(), detail=self.message)
        return allowed


class EstablishmentClaimRateThrottle(_FixedScopeRateThrottle):
    fixed_scope = "establishment_claim"


class OwnerStatusRateThrottle(_FixedScopeRateThrottle):
    """Failed Establishment Portal lookups per client address.

    Only a code that is not found counts (the view calls `record_failure`),
    so owners who share a mobile-carrier address are not locked out by each
    other's valid checks, while codes still cannot be guessed at speed. Once
    the limit is reached, every request from the address is refused until
    the window passes, even one with a correct code.
    """

    fixed_scope = "owner_status_ip"
    message = (
        "Masyadong maraming pagsubok mula sa device na ito. Subukan muli "
        "pagkalipas ng isang oras. / Too many attempts from this device. "
        "Please try again in an hour."
    )

    def allow_request(self, request, view):
        self._use_scope()
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        self.now = self.timer()
        self.history = [
            stamp for stamp in self.cache.get(self.key, []) if stamp > self.now - self.duration
        ]
        if len(self.history) >= self.num_requests:
            raise _MessageOnlyThrottled(wait=self.wait(), detail=self.message)
        return True

    @classmethod
    def record_failure(cls, request):
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


def _is_resend_of_saved_report(request):
    """True when this request resends a form whose report was already saved.

    Such a request creates nothing (the view returns the saved report), so it
    must not count toward, or be blocked by, the report limits.
    """
    from .views.mobile import (
        community_report_submission_id,
        find_existing_community_report,
    )

    submission_id = community_report_submission_id(request)
    return bool(submission_id) and find_existing_community_report(submission_id) is not None


class CommunityReportIpRateThrottle(_FixedScopeRateThrottle):
    """Public community reports per client address (every attempt counts,
    except resends of an already-saved report)."""

    fixed_scope = "community_report_ip"
    message = (
        "Masyadong maraming report mula sa device na ito ngayong oras. "
        "Subukan muli mamaya. / Too many reports from this device this hour. "
        "Please try again later."
    )

    def allow_request(self, request, view):
        if _is_resend_of_saved_report(request):
            return True
        return super().allow_request(request, view)


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
        if _is_resend_of_saved_report(request):
            return True
        self._use_scope()
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        self.history = self.cache.get(self.key, [])
        self.now = self.timer()
        while self.history and self.history[-1] <= self.now - self.duration:
            self.history.pop()
        if len(self.history) >= self.num_requests:
            raise _MessageOnlyThrottled(wait=self.wait(), detail=self.message)
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
