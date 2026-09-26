from django.core.cache import caches
from rest_framework.throttling import ScopedRateThrottle


class EstablishmentClaimRateThrottle(ScopedRateThrottle):
    """ScopedRateThrottle for the establishment registration/claim endpoint.

    Function views made with @api_view cannot carry a `throttle_scope`
    attribute, so the scope is fixed here. Counts live in the "throttle"
    cache, a database cache shared by every server process, so the limit
    holds no matter which process serves a request.
    """

    fixed_scope = "establishment_claim"

    def __init__(self):
        self.cache = caches["throttle"]
        super().__init__()

    def allow_request(self, request, view):
        self.scope = self.fixed_scope
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super(ScopedRateThrottle, self).allow_request(request, view)
