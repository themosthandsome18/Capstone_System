"""Next-request reference freshness after supported admin/API writes."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import Client, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from .models import Itinerary, UserProfile
from .services.tourism import STATIC_REFERENCE_TABLE_SERIALIZERS


class ReferenceTableFreshnessTests(TransactionTestCase):
    """Use committed writes and real request handlers, without mocked payloads."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.observations = []
        user = get_user_model().objects.create_user(
            username="synthetic-reference-admin",
            password=None,
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.update_or_create(user=user, defaults={"role": "admin"})
        self.web = APIClient()
        self.web.force_authenticate(user=user)
        self.mobile = APIClient()
        self.admin = Client()
        self.admin.force_login(user)
        Itinerary.objects.create(
            id=990001, name="SYNTHETIC CONTROL OPTION", stay_nights=1
        )
        self.option = Itinerary.objects.create(
            id=990002, name="SYNTHETIC REFERENCE OPTION", stay_nights=2
        )

    def _request_references(self, label):
        tables = [
            model._meta.db_table
            for model, _ in STATIC_REFERENCE_TABLE_SERIALIZERS.values()
        ]
        with CaptureQueriesContext(connection) as web_queries:
            web = self.web.get("/api/reference-tables/")
        self.assertEqual(web.status_code, 200)
        with CaptureQueriesContext(connection) as mobile_queries:
            mobile = self.mobile.get("/api/mobile/tourism/bootstrap/")
        self.assertEqual(mobile.status_code, 200)
        web_rows = web.json()["itineraries"]
        mobile_rows = mobile.json()["referenceTables"]["itineraries"]
        self.observations.append({
            "request": label,
            "database": list(Itinerary.objects.order_by("id").values(
                "id", "name", "is_active", "stay_nights"
            )),
            "web_itineraries": web_rows,
            "mobile_itineraries": mobile_rows,
            "queries": {
                side: {
                    "total": len(queries),
                    "selects_mentioning_reference_tables": sum(
                        query["sql"].lstrip().upper().startswith("SELECT")
                        and any(table in query["sql"] for table in tables)
                        for query in queries
                    ),
                }
                for side, queries in (
                    ("web", web_queries), ("mobile", mobile_queries)
                )
            },
        })
        return web_rows, mobile_rows

    def _warm_requests(self):
        web, mobile = self._request_references("before write")
        self.assertTrue(next(row for row in web if row["id"] == self.option.pk)["is_active"])
        self.assertIn(self.option.pk, [row["id"] for row in mobile])

    def _admin_deactivate(self):
        response = self.admin.post(
            f"/admin/api/itinerary/{self.option.pk}/change/",
            {
                "id": str(self.option.pk),
                "name": self.option.name,
                "stay_nights": "2",
                "_save": "Save",
                # A missing checkbox is an ordinary admin form's false value.
            },
        )
        self.assertEqual(response.status_code, 302)
        self.option.refresh_from_db()
        self.assertFalse(self.option.is_active)

    def test_admin_deactivation_updates_next_web_reference_response(self):
        self._warm_requests()
        self._admin_deactivate()
        web, _ = self._request_references("after admin deactivation")
        row = next(row for row in web if row["id"] == self.option.pk)
        self.assertEqual(
            row["is_active"], self.option.is_active,
            "Web active status must match the committed admin write.",
        )

    def test_admin_deactivation_updates_next_mobile_bootstrap(self):
        self._warm_requests()
        self._admin_deactivate()
        _, mobile = self._request_references("after admin deactivation")
        self.assertNotIn(
            self.option.pk, [row["id"] for row in mobile],
            "The next mobile request must not offer a retired itinerary.",
        )

    def test_admin_add_inactive_option_appears_in_next_complete_web_list(self):
        self._warm_requests()
        new_id = 990099
        response = self.admin.post(
            "/admin/api/itinerary/add/",
            {
                "id": str(new_id),
                "name": "SYNTHETIC INACTIVE ADMIN OPTION",
                "stay_nights": "0",
                "_save": "Save",
            },
        )
        self.assertEqual(response.status_code, 302)
        created = Itinerary.objects.get(pk=new_id)
        self.assertFalse(created.is_active)
        web, mobile = self._request_references("after admin add inactive")
        self.assertNotIn(new_id, [row["id"] for row in mobile])
        self.assertIn(
            new_id, [row["id"] for row in web],
            "The complete web list must include newly added inactive options.",
        )
        row = next(row for row in web if row["id"] == new_id)
        self.assertEqual(row["is_active"], created.is_active)
        self.assertEqual(row["stay_nights"], created.stay_nights)

    def test_reference_option_api_writes_keep_both_response_contracts_fresh(self):
        self._warm_requests()
        created = self.web.post(
            "/api/reference-options/itinerary/",
            {"name": "SYNTHETIC API OPTION", "stay_nights": 1},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        pk = created.json()["id"]
        web, mobile = self._request_references("after API create")
        self.assertIn(pk, [row["id"] for row in web])
        self.assertIn(pk, [row["id"] for row in mobile])

        updated = self.web.patch(
            f"/api/reference-options/itinerary/{pk}/",
            {
                "name": "SYNTHETIC API RENAMED",
                "stay_nights": 3,
                "confirm_affected_records": 0,
            },
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        web, mobile = self._request_references("after API rename and stay change")
        row = next(row for row in web if row["id"] == pk)
        self.assertEqual(row["name"], "SYNTHETIC API RENAMED")
        self.assertEqual(row["stay_nights"], 3)
        self.assertEqual(
            next(row for row in mobile if row["id"] == pk),
            {"id": pk, "name": "SYNTHETIC API RENAMED"},
        )

        retired = self.web.post(f"/api/reference-options/itinerary/{pk}/deactivate/")
        self.assertEqual(retired.status_code, 200)
        web, mobile = self._request_references("after API deactivation")
        self.assertFalse(next(row for row in web if row["id"] == pk)["is_active"])
        self.assertNotIn(pk, [row["id"] for row in mobile])

        restored = self.web.post(f"/api/reference-options/itinerary/{pk}/reactivate/")
        self.assertEqual(restored.status_code, 200)
        web, mobile = self._request_references("after API reactivation")
        self.assertTrue(next(row for row in web if row["id"] == pk)["is_active"])
        self.assertIn(pk, [row["id"] for row in mobile])
        self.assertTrue(all(set(row) == {"id", "name"} for row in mobile))
