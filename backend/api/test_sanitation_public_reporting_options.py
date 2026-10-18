from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Barangay
from .services.sanitation import COMMUNITY_REPORT_CATEGORY_PRIORITIES


@override_settings(USE_SEED_DATA=False)
class PublicReportingOptionsTests(TestCase):
    def test_unauthenticated_bootstrap_exposes_server_categories_and_active_barangays_only(self):
        cache.clear()
        self.addCleanup(cache.clear)
        Barangay.objects.create(name="Synthetic active barangay")
        Barangay.objects.create(name="Synthetic inactive barangay", is_active=False)
        response = APIClient().get("/api/mobile/sanitation/bootstrap/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["reportCategories"], list(COMMUNITY_REPORT_CATEGORY_PRIORITIES))
        self.assertEqual([item["name"] for item in body["barangays"]], ["Synthetic active barangay"])
        for key in ("establishments", "inspections", "householdRecords"):
            self.assertEqual(body[key], [])
        self.assertEqual(body["complaintData"], {"summary": {}, "rows": []})
