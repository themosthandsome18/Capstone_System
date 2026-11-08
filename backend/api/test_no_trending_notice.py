"""The notifications of the tourism bootstrap are the public advisories the Tourism Office wrote, and nothing computed.

There used to be one more, "<resort> is trending", worked out while the bootstrap was built: it had no threshold, so it was sent even with no arrival at all
("0 recorded visitor arrivals in the tourism guide data."), and "tourism guide data" means nothing to a tourist. It is gone.
"""
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import (
    NOTIFICATION_AUDIENCE_PUBLIC,
    NOTIFICATION_TYPE_PUBLIC_ADVISORY,
    Notification,
    Resort,
)
from .test_destination_accuracy import BOOTSTRAP, arrive, make_resort
from .tests import ensure_test_reference_tables


def advisory(title, module="tourism", **extra):
    return Notification.objects.create(
        title=title, message=f"{title} message", notification_type=NOTIFICATION_TYPE_PUBLIC_ADVISORY, severity=extra.pop("severity", "info"),
        module=module, audience_type=NOTIFICATION_AUDIENCE_PUBLIC, is_active=extra.pop("is_active", True), **extra,
    )


@override_settings(USE_SEED_DATA=False)
class NoTrendingNoticeTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_test_reference_tables()
        Resort.objects.all().delete()
        Notification.objects.all().delete()

    def notifications(self):
        cache.clear()
        return self.client.get(BOOTSTRAP).json()["notifications"]

    def assert_no_trending(self, notices):
        for notice in notices:
            self.assertFalse(str(notice.get("id", "")).startswith("featured-"), notice)
            self.assertNotIn("trending", f"{notice.get('title', '')} {notice.get('message', '')}".lower())
            self.assertNotIn("tourism guide data", notice.get("message", "").lower())
            self.assertNotIn("recorded visitor arrivals", notice.get("message", "").lower())

    def test_with_destinations_and_no_arrival_at_all_there_is_no_trending_notice(self):
        make_resort(1, "Quiet Cove")
        make_resort(2, "Other Cove")
        self.assertEqual(self.notifications(), [])

    def test_with_arrivals_there_is_still_none(self):
        arrive(make_resort(1, "Busy Cove"), "T1", 40)
        arrive(make_resort(2, "Other Cove"), "T2", 3)
        self.assertEqual(self.notifications(), [])

    def test_with_many_destinations_and_a_clear_winner_there_is_none(self):
        for pk in range(1, 9):
            arrive(make_resort(pk, f"Cove {pk}"), f"M{pk}", pk * 10)
        self.assertEqual(self.notifications(), [])

    def test_with_no_destination_at_all_there_is_none(self):
        self.assertEqual(self.notifications(), [])

    def test_a_public_advisory_is_the_whole_list_and_nothing_is_added_to_it(self):
        arrive(make_resort(1, "Busy Cove"), "T1", 40)
        advisory("Sea advisory", severity="warning")
        notices = self.notifications()
        self.assertEqual([n["title"] for n in notices], ["Sea advisory"])
        self.assertEqual(notices[0]["severity"], "warning")
        self.assertEqual(set(notices[0]), {"id", "type", "title", "message", "severity", "created_at"})
        self.assert_no_trending(notices)

    def test_with_no_advisory_the_list_is_empty(self):
        make_resort(1, "Busy Cove")
        self.assertEqual(self.notifications(), [])

    def test_general_advisories_are_in_it_and_sanitation_ones_are_not(self):
        advisory("For tourism", module="tourism")
        advisory("For everyone", module="general")
        advisory("For sanitation", module="sanitation")
        self.assertEqual({n["title"] for n in self.notifications()}, {"For tourism", "For everyone"})

    def test_inactive_and_expired_advisories_are_not_in_it(self):
        advisory("Live")
        advisory("Switched off", is_active=False)
        advisory("Over", expires_at=timezone.now() - timedelta(days=1))
        advisory("Still running", expires_at=timezone.now() + timedelta(days=1))
        self.assertEqual({n["title"] for n in self.notifications()}, {"Live", "Still running"})

    def test_the_newest_advisory_is_first(self):
        first = advisory("Older")
        newer = advisory("Newer")
        self.assertGreaterEqual(newer.pk, first.pk)
        self.assertEqual([n["title"] for n in self.notifications()], ["Newer", "Older"])
