"""Blanket retention regressions. Run with explicitly disposable settings.

LiveServer tests use actual authenticated loopback HTTP. PostgreSQL race tests
require an observed database lock wait and distinct handler connections.
"""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from unittest import skipUnless
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from django.contrib import admin
from django.contrib.auth.models import User
from django.core.exceptions import PermissionDenied
from django.db import connection, transaction
from django.db.backends.signals import connection_created
from django.db.models.deletion import Collector
from django.test import Client, LiveServerTestCase, RequestFactory, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    ActivityLog, Notification, SanitaryBusinessType, SanitaryComplaint,
    SanitaryEstablishment, SanitaryInspection, SanitaryInspectionChecklistItem,
    SanitaryPermitRenewal, UserProfile,
)
from .services.establishment_retention import (
    ESTABLISHMENT_RETENTION_CODE, ESTABLISHMENT_RETENTION_MESSAGE, EstablishmentDeletionProtected,
)


class RetentionFixture:
    retained_models = (SanitaryEstablishment, SanitaryInspection, SanitaryInspectionChecklistItem,
                       SanitaryPermitRenewal, SanitaryComplaint, ActivityLog, Notification)

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(username="synthetic_retention_staff", password="synthetic-local-only")
        UserProfile.objects.create(user=self.user, role="sanitation")
        self.token = Token.objects.create(user=self.user)
        self.kind = SanitaryBusinessType.objects.create(name="Synthetic retention cafe")
        self.record = SanitaryEstablishment.objects.create(
            business_name="Synthetic Retained Cafe", owner_name="Synthetic Owner", business_type=self.kind,
            barangay="Daungan", address="Exact synthetic address", contact_number="synthetic contact",
            latitude=14.187, longitude=121.735, user=self.user,
            permit_number="SYN-RETENTION", permit_issued_date="2026-01-01", permit_expiry_date="2026-12-31",
            enforcement_stage="warning", compliance_status="violation", permit_status="conditional",
            tracking_code_hash="a" * 64, tracking_code_issued_at="2026-10-28T00:00:00Z",
            tracking_code_issued_by=self.user, remarks="  Exact metadata retention  ",
        )
        self.unused = SanitaryEstablishment.objects.create(
            business_name="Synthetic Unused Cafe", owner_name="Synthetic Owner", business_type=self.kind,
            barangay="Daungan", address="Unused synthetic address", latitude=14.187, longitude=121.735,
        )
        self.inspection = SanitaryInspection.objects.create(
            establishment=self.record, inspector_name="Synthetic Inspector", inspection_date="2026-10-28",
            next_due_date="2027-01-28", findings="Exact findings", remarks="Exact inspection remarks",
            status_after_inspection="violation", photo_documentation="synthetic-photo-reference", is_draft=False,
        )
        SanitaryInspectionChecklistItem.objects.create(
            inspection=self.inspection, requirement_name="Synthetic checklist", is_complied=False, notes="Exact checklist notes",
        )
        SanitaryPermitRenewal.objects.create(
            establishment=self.record, renewal_id="SYN-RETENTION-R", permit_number="SYN-RETENTION",
            expiration_date="2026-12-31", submitted_requirements=["Synthetic certificate"],
            renewal_fee="750.25", remarks="Exact renewal remarks", photo_documentation="synthetic-renewal-reference",
        )
        SanitaryComplaint.objects.create(
            establishment=self.record, complaint_id="SYN-RETENTION-C", complainant_name="Synthetic reporter",
            category="Synthetic category", barangay="Daungan", reported_date="2026-10-28",
            description="Exact complaint description", action_taken="Exact action taken",
            latitude=14.187, longitude=121.735,
        )
        ActivityLog.objects.create(
            user=self.user, module="sanitation", action="update", record_type="SanitaryEnforcementStage",
            record_id=str(self.record.pk), record_label='{"previous_stage":"","new_stage":"warning"}',
        )
        ActivityLog.objects.create(
            user=self.user, module="sanitation", action="create", record_type="SanitaryEstablishment",
            record_id=str(self.record.pk), record_label="Synthetic Retained Cafe",
        )
        Notification.objects.create(
            title="Synthetic compliance notice", message="Exact compliance history", notification_type="violation_alert",
            module="sanitation", audience_type="user", recipient_user=self.user,
            related_model="SanitaryEstablishment", related_object_id=str(self.record.pk),
            action_url=f"/sanitation/establishments/{self.record.pk}",
        )
        self.url = f"/api/sanitation/establishments/{self.record.pk}/"

    def snapshot(self):
        # Compare every persisted column, including foreign keys, timestamps,
        # JSON requirements, ownership/tracking metadata and audit references.
        return {model.__name__: list(model.objects.order_by("pk").values()) for model in self.retained_models}

    def assert_contract(self, status, body):
        self.assertEqual(status, 409, body)
        self.assertEqual(body, {"code": ESTABLISHMENT_RETENTION_CODE, "detail": ESTABLISHMENT_RETENTION_MESSAGE})

    def inspection_payload(self):
        return {"establishment": self.record.pk, "inspection_date": "2026-10-28",
                "inspector_name": "Synthetic concurrent inspector", "status_after_inspection": "violation",
                "findings": "New retained findings", "remarks": "New retained remarks",
                "checklist_items": [{"requirement_name": "New synthetic checklist", "is_complied": False,
                                     "notes": "New retained note"}]}


@override_settings(USE_SEED_DATA=False)
class EstablishmentRetentionTests(RetentionFixture, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Token " + self.token.key)

    def test_api_used_unused_and_authorized_roles_preserve_all_columns(self):
        for role in ("sanitation", "admin"):
            self.user.profile.role = role
            self.user.profile.save()
            for record in (self.record, self.unused):
                with self.subTest(role=role, used=record == self.record):
                    before = self.snapshot()
                    response = self.client.delete(f"/api/sanitation/establishments/{record.pk}/")
                    self.assert_contract(response.status_code, response.json())
                    self.assertEqual(self.snapshot(), before)

    def test_access_denials_and_missing_records_do_not_leak_policy(self):
        before = self.snapshot()
        for role in ("tourism", "tourist", "establishment"):
            self.user.profile.role = role
            self.user.profile.save()
            for pk in (self.record.pk, 999999):
                response = self.client.delete(f"/api/sanitation/establishments/{pk}/")
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json(), {"detail": "You do not have access to this module."})
        self.client.credentials()
        for pk in (self.record.pk, 999999):
            response = self.client.delete(f"/api/sanitation/establishments/{pk}/")
            self.assertEqual(response.status_code, 401)
            self.assertNotIn(ESTABLISHMENT_RETENTION_CODE, response.content.decode())
        self.user.profile.role = "sanitation"
        self.user.profile.save()
        self.client.credentials(HTTP_AUTHORIZATION="Token " + self.token.key)
        self.assertEqual(self.client.delete("/api/sanitation/establishments/999999/").status_code, 404)
        self.assertEqual(self.snapshot(), before)

    def assert_orm_blocked(self, operation):
        before = self.snapshot()
        with CaptureQueriesContext(connection) as queries:
            with self.assertRaisesMessage(EstablishmentDeletionProtected, ESTABLISHMENT_RETENTION_MESSAGE):
                # Collector.delete() uses atomic(savepoint=False). Isolate the
                # expected rejection so TestCase's outer transaction remains
                # readable for the full persisted-state assertions below.
                with transaction.atomic():
                    operation()
        mutations = [q["sql"] for q in queries if q["sql"].lstrip().upper().startswith(("DELETE ", "UPDATE "))]
        self.assertEqual(mutations, [], "Retention must reject before DELETE or SET_NULL")
        self.assertEqual(self.snapshot(), before)

    def test_instance_deletion_used_and_unused(self):
        for record in (self.record, self.unused):
            with self.subTest(pk=record.pk):
                self.assert_orm_blocked(record.delete)

    def test_queryset_base_manager_and_direct_bulk_script_shape(self):
        for manager in (SanitaryEstablishment.objects, SanitaryEstablishment._base_manager):
            for pk in (self.record.pk, self.unused.pk):
                with self.subTest(manager=manager.name, pk=pk):
                    self.assert_orm_blocked(manager.using("default").filter(pk=pk).delete)
        self.assert_orm_blocked(SanitaryEstablishment.objects.filter(business_name__startswith="Synthetic").delete)

    def test_mixed_batch_atomicity_in_both_orders(self):
        for order in ("pk", "-pk"):
            with self.subTest(order=order):
                self.assert_orm_blocked(SanitaryEstablishment.objects.order_by(order).delete)

    def test_collector_bulk_path_without_model_delete(self):
        def collected_delete():
            collector = Collector(using="default")
            collector.collect(SanitaryEstablishment.objects.all())
            collector.delete()
        self.assert_orm_blocked(collected_delete)

    def test_admin_single_bulk_and_direct_hooks(self):
        superuser = User.objects.create_superuser("synthetic_retention_admin", password="synthetic-local-only")
        browser = Client()
        browser.force_login(superuser)
        model_admin = admin.site._registry[SanitaryEstablishment]
        request = RequestFactory().get("/admin/")
        request.user = superuser
        self.assertFalse(model_admin.has_delete_permission(request, self.record))
        self.assertNotIn("delete_selected", model_admin.get_actions(request))
        before = self.snapshot()
        for method in ("get", "post"):
            response = getattr(browser, method)(f"/admin/api/sanitaryestablishment/{self.record.pk}/delete/", {"post": "yes"})
            self.assertEqual(response.status_code, 403)
            self.assertContains(response, ESTABLISHMENT_RETENTION_MESSAGE, status_code=403)
        response = browser.post("/admin/api/sanitaryestablishment/", {
            "action": "delete_selected", "_selected_action": [self.record.pk, self.unused.pk], "post": "yes",
        })
        self.assertContains(response, ESTABLISHMENT_RETENTION_MESSAGE, status_code=403)
        for operation in (lambda: model_admin.delete_model(request, self.record),
                          lambda: model_admin.delete_queryset(request, SanitaryEstablishment.objects.all())):
            with self.assertRaisesMessage(PermissionDenied, ESTABLISHMENT_RETENTION_MESSAGE):
                operation()
        self.assertEqual(self.snapshot(), before)


@override_settings(USE_SEED_DATA=False)
class EstablishmentRetentionHTTPTests(RetentionFixture, LiveServerTestCase):
    host = "127.0.0.1"

    def http(self, method, path, payload=None, authenticated=True):
        headers = {"Content-Type": "application/json"}
        if authenticated:
            headers["Authorization"] = "Token " + self.token.key
        request = Request(self.live_server_url + path, method=method, headers=headers,
                          data=None if payload is None else json.dumps(payload).encode())
        try:
            response = build_opener(ProxyHandler({})).open(request, timeout=20)
        except HTTPError as error:
            response = error
        with response:
            return response.code, json.load(response)

    def test_real_http_contract_auth_creation_edit_and_inspection(self):
        before = self.snapshot()
        for record in (self.record, self.unused):
            self.assert_contract(*self.http("DELETE", f"/api/sanitation/establishments/{record.pk}/"))
        status, body = self.http("DELETE", self.url, authenticated=False)
        self.assertEqual(status, 401, body)
        self.user.profile.role = "tourism"
        self.user.profile.save()
        denied, body = self.http("DELETE", self.url)
        self.assertEqual(denied, 403, body)
        self.user.profile.role = "sanitation"
        self.user.profile.save()
        self.assertEqual(self.snapshot(), before)
        created, body = self.http("POST", "/api/sanitation/establishments/", {
            "business_name": "Synthetic HTTP Created Cafe", "owner_name": "Synthetic Owner",
            "business_type": self.kind.pk, "barangay": "Daungan", "address": "Synthetic HTTP address",
            "latitude": 14.187, "longitude": 121.735,
        })
        self.assertEqual(created, 201, body)
        created_id = body["id"]
        edited, body = self.http("PATCH", f"/api/sanitation/establishments/{created_id}/", {"remarks": "Edited over real HTTP"})
        self.assertEqual(edited, 200, body)
        self.assertEqual(SanitaryEstablishment.objects.get(pk=created_id).remarks, "Edited over real HTTP")
        inspected, body = self.http("POST", "/api/sanitation/inspections/", self.inspection_payload())
        self.assertEqual(inspected, 201, body)
        new = SanitaryInspection.objects.get(pk=body["id"])
        self.assertEqual(new.establishment_id, self.record.pk)
        self.assertEqual(new.findings, "New retained findings")
        self.assertEqual(new.checklist_items.get().notes, "New retained note")
        for model in self.retained_models:
            for row in before[model.__name__]:
                after = model.objects.values().get(pk=row["id"])
                for field, value in row.items():
                    if model is SanitaryEstablishment and row["id"] == self.record.pk and field == "updated_at":
                        continue
                    self.assertEqual(after[field], value, (model.__name__, field))
        print(json.dumps({"runtime": "actual_loopback_http", "delete_used_unused": [409, 409],
                          "anonymous": status, "wrong_role": denied, "create": created, "edit": edited,
                          "inspection": inspected, "old_values_and_links_preserved": True}), flush=True)

    @skipUnless(connection.vendor == "postgresql", "Requires isolated disposable PostgreSQL")
    def test_delete_during_real_inspection_request(self):
        self.assert_concurrent_retention("inspection")

    @skipUnless(connection.vendor == "postgresql", "Requires isolated disposable PostgreSQL")
    def test_delete_during_real_enforcement_request(self):
        self.assert_concurrent_retention("enforcement")

    def assert_concurrent_retention(self, operation):
        before = self.snapshot()
        handler_pids = set()
        def remember_connection(sender, connection, **kwargs):
            if connection.vendor == "postgresql":
                handler_pids.add(connection.connection.get_backend_pid())
        connection_created.connect(remember_connection, weak=False)
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                with transaction.atomic():
                    SanitaryEstablishment.objects.select_for_update().get(pk=self.record.pk)
                    if operation == "inspection":
                        pending = pool.submit(self.http, "POST", "/api/sanitation/inspections/", self.inspection_payload())
                    else:
                        pending = pool.submit(self.http, "POST", self.url + "enforcement-stage/",
                                              {"stage": "nov_1", "expected_previous_stage": "warning"})
                    deadline = time.monotonic() + 10
                    waiter = None
                    while time.monotonic() < deadline:
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT pg_stat_clear_snapshot()")
                            cursor.execute("SELECT pid FROM pg_stat_activity WHERE datname = current_database() "
                                           "AND pg_backend_pid() = ANY(pg_blocking_pids(pid))")
                            waiter = cursor.fetchone()
                        if waiter:
                            break
                        time.sleep(0.02)
                    self.assertIsNotNone(waiter, "Real HTTP writer must overlap an observed PostgreSQL lock wait")
                    deletion = pool.submit(self.http, "DELETE", self.url).result(timeout=15)
                    self.assert_contract(*deletion)
                    self.assertEqual(self.snapshot(), before)
                result, body = pending.result(timeout=20)
                self.assertEqual(result, 201 if operation == "inspection" else 200, body)
            self.assertGreaterEqual(len(handler_pids), 2, handler_pids)
            self.assertIn(waiter[0], handler_pids)
        finally:
            connection_created.disconnect(remember_connection)
        for model in self.retained_models:
            for row in before[model.__name__]:
                after = model.objects.values().get(pk=row["id"])
                for field, value in row.items():
                    if model is SanitaryEstablishment and row["id"] == self.record.pk:
                        if field == "updated_at" or (operation == "enforcement" and field == "enforcement_stage"):
                            continue
                    self.assertEqual(after[field], value, (model.__name__, field))
        self.record.refresh_from_db()
        if operation == "inspection":
            self.assertEqual(self.record.inspections.count(), 2)
            new = self.record.inspections.exclude(pk=self.inspection.pk).get()
            self.assertEqual(new.findings, "New retained findings")
            self.assertEqual(new.checklist_items.get().notes, "New retained note")
        else:
            self.assertEqual(self.record.enforcement_stage, "nov_1")
            event = ActivityLog.objects.filter(record_type="SanitaryEnforcementStage").latest("pk")
            self.assertEqual(event.record_id, str(self.record.pk))
            self.assertEqual(json.loads(event.record_label)["new_stage"], "nov_1")
        print(json.dumps({"concurrent_operation": operation, "delete_http": deletion[0], "operation_http": result,
                          "distinct_handler_postgres_pids": sorted(handler_pids), "observed_lock_wait_pid": waiter[0],
                          "all_existing_values_and_relationships_retained": True,
                          "inspections": self.record.inspections.count(), "stage": self.record.enforcement_stage}), flush=True)
