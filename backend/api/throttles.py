import math

from django.core.cache import caches
from rest_framework.exceptions import Throttled
from rest_framework.throttling import ScopedRateThrottle

from .services import owner_throttle_history


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


class OwnerStatusRateThrottle(_FixedScopeRateThrottle):
    """Failed Establishment Portal lookups per client address.

    Only a code that is not found counts (the view calls `record_failure`),
    so owners who share a mobile-carrier address are not locked out by each
    other's valid checks, while codes still cannot be guessed at speed. Once
    the limit is reached, every request from the address is refused until
    the window passes, even one with a correct code.
    """

    fixed_scope = "owner_status_ip"
    message = "Too many attempts from this device. Please try again in an hour."

    def allow_request(self, request, view):
        self._use_scope()
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        self.now = self.timer()
        self.history = [
            stamp for stamp in owner_throttle_history.read_history(self.cache, self.key)
            if stamp > self.now - self.duration
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
        owner_throttle_history.record_failure(throttle.cache, key, throttle.duration, throttle.timer)


class PassStatusRateThrottle(OwnerStatusRateThrottle):
    """Failed lookups of a tourist's pass status (GET /api/mobile/tourism/records/status/) per client address.

    WHY: the survey ID is printed on the pass itself (it is the text of its QR), so it is not a secret. The contact number is the only thing left
    standing between a stranger and somebody's pass, and a lookup with no limit is a lookup that can be guessed at, over and over, at the speed of
    the network. So the guesses are limited.

    Made like OwnerStatusRateThrottle, the Establishment Portal's lookup by a private code, and for the same reason it counts only the lookups
    that FAIL (a number that does not match, or a survey ID that does not exist: the view calls `record_failure`). The app asks once for each
    pass every time it is opened, and an answer that is right costs nothing, so a tourist with three passes, opening the app all day, is never
    near the limit, and tourists who share a mobile-carrier address are not locked out by one another's right answers. Once the limit is reached
    every request from the address is refused until the hour has passed (the app keeps the last status it knew and asks again the next time).

    THE LIMIT, 30 failures an hour (settings: DEFAULT_THROTTLE_RATES["pass_status_ip"]):
      * the app itself fails only when a kept pass no longer exists on the server, for each such pass each time it is opened: 30 an hour is
        ten openings with three such passes, which is more than a tourist makes;
      * a stranger gets 30 guesses an hour (720 a day) from one address, against about a thousand million Philippine mobile numbers: years of
        guessing for one pass from one address, where without the limit it is minutes.
    """

    fixed_scope = "pass_status_ip"
    message = "Too many attempts from this device. Please try again in an hour."


class FeedbackReplyRateThrottle(OwnerStatusRateThrottle):
    """Failed lookups of "has the office answered my reviews" (POST /api/mobile/tourism/feedback/replies/) per client address.

    WHY: the same as PassStatusRateThrottle. The survey ID is printed on the pass, so it is no secret, and the contact number is the only thing left to
    guess; a lookup with no limit is a lookup that can be guessed at, over and over. So the guesses are limited.

    Made like PassStatusRateThrottle, and like it it counts only the lookups that FAIL (the view calls `record_failure`): the app asks once for each pass
    every time it is opened, and an answer that is right costs nothing. A request with a missing key guesses nothing and is not counted.

    ITS OWN COUNTER, not the one of the status lookup: they are two doors to the same guess, and each is counted at its own door.

    THE LIMIT, 30 failures an hour (settings: DEFAULT_THROTTLE_RATES["feedback_reply_ip"]), as the pass status: the app itself fails only for a kept
    review whose visit no longer exists on the server, which is rare, and a stranger gets 720 guesses a day from one address.
    """

    fixed_scope = "feedback_reply_ip"
    message = "Too many attempts from this device. Please try again in an hour."


class ReviewVisitRateThrottle(OwnerStatusRateThrottle):
    """Reviews posted with a survey ID and a contact number that do NOT make a visit (POST /api/mobile/tourism/feedback/), per client address.

    WHY: a review is taken only from someone whose visit at that place was scanned on arrival, and the server finds that out from the survey ID and
    the contact number in the post. The survey ID is printed on the pass, so it is not a secret; the contact number is the only thing left to guess.
    Without a limit this endpoint is a way to guess it, over and over, at the speed of the network (a right guess even writes a review under the
    owner's visit). So the guesses are limited.

    Made like PassStatusRateThrottle and OwnerStatusRateThrottle, and like them it counts only the attempts that FAIL (the view calls
    `record_failure`): a review that is taken costs nothing. It counts only a post that carries BOTH a survey ID and a contact number, because a post
    with one of them missing guesses nothing (an old copy of the app that does not send them is refused anyway). Once the limit is reached every
    post from the address is refused until the hour has passed, even a right one.

    ITS OWN COUNTER, not the one of the status lookup: the two are different doors to the same guess, and each is counted at its own door.

    THE LIMIT, 10 failures an hour (settings: DEFAULT_THROTTLE_RATES["review_visit_ip"]), tighter than the status lookup's 30 because the people on
    each side are different:
      * the app never lets a tourist get here without a pass that was scanned at this very place, and sends that pass's own survey ID and number, so a
        real tourist almost never fails; the one way is a pass the server has changed since the app last asked (the tourist was scanned, then the
        record was corrected), and that fails once, perhaps a few times in a row: 10 is plenty;
      * who fails here is nearly always somebody looking for a way in, and 10 an hour is 240 a day from one address, against about a thousand
        million Philippine mobile numbers.
    The cost of being strict is the same as for the lookups: a stranger on the same mobile-carrier address can use the allowance up for everybody
    on it, for an hour; the reviews that were refused are written again later, and nothing is lost.
    """

    fixed_scope = "review_visit_ip"
    message = "Too many attempts from this device. Please try again in an hour."


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
    message = "Too many reports from this device this hour. Please try again later."

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
        "This contact number has reached 5 reports today. "
        "Please try again tomorrow."
    )

    def get_cache_key(self, request, view):
        from .views.mobile import PH_MOBILE_NUMBER, normalize_contact_digits

        data = getattr(request, "data", {}) or {}
        if not hasattr(data, "get"):
            return None
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
