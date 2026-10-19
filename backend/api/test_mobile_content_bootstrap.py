"""The `appContent` key of the public tourism bootstrap (Mobile App Content, Commit 3).

The fixed world below is built the same way on every run (explicit ids, fixed dates, the caches emptied),
so the bootstrap it produces is byte for byte the same on every run. The golden file next to it,
`bootstrap_golden/before_appcontent_5ded035.json`, is what the bootstrap of THIS world was on origin/main
(5ded035), BEFORE this key existed. It was taken from the old code before a line of the new code was written.
"""
from datetime import datetime, timezone as dt_timezone

from django.core.cache import cache

from .models import (
    BoatCapacityFare,
    Barangay,
    BoatType,
    Country,
    EmergencyContact,
    Itinerary,
    Notification,
    Province,
    Region,
    Resort,
    TourismThemeSetting,
    TravelMode,
    VisitPurpose,
)
from .seed_data import REFERENCE_TABLES

FIXED_MOMENT = datetime(2026, 10, 19, 8, 0, 0, tzinfo=dt_timezone.utc)
BOOTSTRAP = "/api/mobile/tourism/bootstrap/"


def build_fixed_world():
    """Every table the bootstrap reads (except the two content tables) is emptied and filled again with
    explicit ids and fixed values. Call inside a TestCase with USE_SEED_DATA off."""
    from .tests import ensure_test_reference_tables

    cache.clear()
    for model in (Resort, BoatCapacityFare, EmergencyContact, Notification, Barangay, Province, Region, Country,
                  Itinerary, TravelMode, BoatType, VisitPurpose):
        model.objects.all().delete()
    ensure_test_reference_tables()
    # the resorts with a fixed number of arrivals each (no visitor record, so no clock is read)
    for position, resort in enumerate(Resort.objects.order_by("resort_id")):
        resort.monthly_arrivals = 100 - position
        resort.save(update_fields=["monthly_arrivals"])
    Barangay.objects.create(id=1, name="Cagsiay I", display_order=1)
    Barangay.objects.create(id=2, name="Lual", display_order=2)
    BoatCapacityFare.objects.create(id=9001, name="1-2 pax (One-Way P1500, Two-way P2000)", display_order=1)
    BoatCapacityFare.objects.create(id=9002, name="3-5 pax (One-Way P2500, Two-way P3000)", display_order=2)
    EmergencyContact.objects.create(id=9101, name="Mauban Rescue", contact_numbers="0917-000-0001", icon="rescue", display_order=1)
    EmergencyContact.objects.create(id=9102, name="Mauban Police", contact_numbers="0917-000-0002", icon="police", display_order=2)
    advisory = Notification.objects.create(
        id=9201, title="Sea advisory", message="Boats may be delayed.", notification_type="public_advisory",
        severity="warning", module="tourism", audience_type="public",
    )
    Notification.objects.filter(pk=advisory.pk).update(created_at=FIXED_MOMENT)
    theme = TourismThemeSetting.load()
    TourismThemeSetting.objects.filter(pk=theme.pk).update(updated_at=FIXED_MOMENT)
    cache.clear()
    return {"resorts": Resort.objects.count()}
