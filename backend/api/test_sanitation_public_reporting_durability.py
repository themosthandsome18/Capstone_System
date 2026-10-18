from datetime import date
import json

from django.contrib.auth.models import User
from django.core.cache import caches
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models.deletion import ProtectedError
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from .models import ActivityLog, Barangay, ROLE_SANITATION, SanitaryComplaint, UserProfile
from .services.public_reporting import FINGERPRINT_RECORD_TYPE


@override_settings(USE_SEED_DATA=False, STORAGES={
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class PublicReportingDeletionTests(TestCase):
    def setUp(self):
        caches["throttle"].clear()
        Barangay.objects.create(name="Daungan")
        self.api = APIClient()
        self.payload = dict(
            complainant_name="Synthetic Resident", contact_number="09171234567",
            category="Improper Garbage Disposal", barangay="Daungan",
            location_address="Purok 3", description="Synthetic concern",
            client_submission_id="durability-form-1",
        )
        created = self.api.post("/api/mobile/sanitation/reports/", self.payload, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.receipt = created.json()
        self.complaint = SanitaryComplaint.objects.get()
        self.digest = ActivityLog.objects.get(record_type=FINGERPRINT_RECORD_TYPE)
        self.ordinary = ActivityLog.objects.create(
            module="sanitation", action="create", record_type="OtherSanitationEvent",
            record_id=str(self.complaint.pk), record_label="Synthetic ordinary audit",
        )
        self.legacy = SanitaryComplaint.objects.create(
            complaint_id="LEGACY-SYNTHETIC", complainant_name="Legacy resident",
            category="Other Sanitation Concern", barangay="Daungan",
            reported_date=date(2026, 1, 1), description="Historical value",
        )
        self.admin_user = User.objects.create_superuser(username="synthetic_durability_admin", password=None)
        self.client.force_login(self.admin_user)

    def assert_blocked(self, operation):
        with self.assertRaises(ProtectedError), transaction.atomic():
            operation()

    def test_complaint_instance_delete_is_blocked(self):
        self.assert_blocked(self.complaint.delete)

    def test_complaint_queryset_delete_is_blocked(self):
        self.assert_blocked(lambda: SanitaryComplaint.objects.filter(pk=self.complaint.pk).delete())

    def test_digest_instance_delete_is_blocked(self):
        self.assert_blocked(self.digest.delete)

    def test_digest_queryset_delete_is_blocked(self):
        self.assert_blocked(lambda: ActivityLog.objects.filter(pk=self.digest.pk).delete())

    def test_mixed_audit_queryset_preserves_the_entire_batch(self):
        selected = [self.ordinary.pk, self.digest.pk]
        self.assert_blocked(lambda: ActivityLog.objects.filter(pk__in=selected).delete())
        self.assertEqual(ActivityLog.objects.filter(pk__in=selected).count(), 2)

    def test_mixed_complaint_queryset_preserves_the_entire_batch(self):
        selected = [self.legacy.pk, self.complaint.pk]
        self.assert_blocked(lambda: SanitaryComplaint.objects.filter(pk__in=selected).delete())
        self.assertEqual(SanitaryComplaint.objects.filter(pk__in=selected).count(), 2)

    def test_admin_single_deletion_has_an_explicit_error(self):
        response = self.client.post(f"/admin/api/activitylog/{self.digest.pk}/delete/", {"post": "yes"})
        self.assertEqual(response.status_code, 403)
        self.assertContains(response, "Public submission retry records cannot be permanently deleted", status_code=403)
        self.assertTrue(ActivityLog.objects.filter(pk=self.digest.pk).exists())

    def test_admin_bulk_deletion_preserves_mixed_selection(self):
        selected = [self.digest.pk, self.ordinary.pk]
        response = self.client.post("/admin/api/activitylog/", {
            "action": "delete_selected", "_selected_action": selected, "post": "yes",
        })
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Public submission retry records cannot be permanently deleted")
        self.assertEqual(ActivityLog.objects.filter(pk__in=selected).count(), 2)

    def test_staff_delete_is_private_409_and_updates_still_work(self):
        user = User.objects.create_user(username="synthetic_durability_staff")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.api.force_authenticate(user)
        url = f"/api/sanitation/complaints/{self.complaint.pk}/"
        denied = self.api.delete(url)
        self.assertEqual(denied.status_code, 409)
        self.assertEqual(denied.json()["code"], "public_submission_retained")
        for changes in (
            {"status": "investigating", "assigned_inspector": "Synthetic inspector",
             "inspection_scheduled_date": "2026-10-20", "inspection_scheduled_time": "09:00",
             "inspection_schedule_note": "Synthetic schedule"},
            {"status": "resolved", "action_taken": "Synthetic resolution"},
        ):
            changed = self.api.patch(url, changes, format="json")
            self.assertEqual(changed.status_code, 200, changed.content)
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.status, "resolved")
        self.assertIsNotNone(self.complaint.resolved_date)
        self.assertEqual(self.complaint.assigned_inspector, "Synthetic inspector")
        self.assertEqual(self.complaint.inspection_scheduled_date.isoformat(), "2026-10-20")
        self.assertEqual(self.complaint.action_taken, "Synthetic resolution")
        retry = APIClient().post("/api/mobile/sanitation/reports/", self.payload, format="json")
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json(), self.receipt)

    def test_unrelated_admin_and_orm_deletion_still_work(self):
        ordinary_pk = self.ordinary.pk
        response = self.client.post(f"/admin/api/activitylog/{ordinary_pk}/delete/", {"post": "yes"})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(ActivityLog.objects.filter(pk=ordinary_pk).exists())
        legacy_pk = self.legacy.pk
        self.legacy.delete()
        self.assertFalse(SanitaryComplaint.objects.filter(pk=legacy_pk).exists())
        extra = dict(module="sanitation", action="create", record_type="OtherSanitationEvent",
                     record_id=str(self.complaint.pk), record_label="Synthetic ordinary audit")
        ordinary_pks = [ActivityLog.objects.create(**extra).pk for _ in range(2)]
        ActivityLog.objects.filter(pk__in=ordinary_pks).delete()
        self.assertFalse(ActivityLog.objects.filter(pk__in=ordinary_pks).exists())
        ordinary_pks = [ActivityLog.objects.create(**extra).pk for _ in range(2)]
        response = self.client.post("/admin/api/activitylog/", {
            "action": "delete_selected", "_selected_action": ordinary_pks, "post": "yes",
        })
        self.assertEqual(response.status_code, 302)
        self.assertFalse(ActivityLog.objects.filter(pk__in=ordinary_pks).exists())

    def test_unique_digest_scope_does_not_depend_on_action(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ActivityLog.objects.create(
                module=self.digest.module, action="update", record_type=self.digest.record_type,
                record_id=self.digest.record_id, record_label=self.digest.record_label,
            )
        # The same textual identity is allowed for unrelated audit event types.
        ActivityLog.objects.create(module="sanitation", action="create", record_type="OtherEvent",
                                   record_id=self.digest.record_id, record_label="Synthetic audit")

    def test_legacy_identified_complaint_without_digest_is_retained_unchanged(self):
        self.legacy.client_submission_id = "historical-unproven-identifier"
        self.legacy.save()
        before = SanitaryComplaint.objects.filter(pk=self.legacy.pk).values().get()
        self.assert_blocked(self.legacy.delete)
        self.assertEqual(SanitaryComplaint.objects.filter(pk=self.legacy.pk).values().get(), before)
        self.assertFalse(ActivityLog.objects.filter(record_type=FINGERPRINT_RECORD_TYPE,
                                                  record_id=str(self.legacy.pk)).exists())

    def test_stale_in_memory_fields_cannot_bypass_deletion_guards(self):
        self.complaint.client_submission_id = None
        self.digest.record_type = "OtherSanitationEvent"
        self.assert_blocked(self.complaint.delete)
        self.assert_blocked(self.digest.delete)


class PublicDigestMigrationTests(TransactionTestCase):
    old_target = [("api", "0058_sanitaryestablishment_enforcement_stage")]
    new_target = [("api", "0059_activitylog_public_digest_uniqueness")]

    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.old_target)
        apps = executor.loader.project_state(self.old_target).apps
        self.Log = apps.get_model("api", "ActivityLog")
        self.Complaint = apps.get_model("api", "SanitaryComplaint")
        self.complaint = self.Complaint.objects.create(
            complaint_id="MIGRATION-SYNTHETIC", client_submission_id="migration-form",
            category="Other Sanitation Concern", barangay="Daungan",
            description="Original historical description", reported_date=date(2026, 1, 1),
        )
        self.proof = json.dumps({"v": 1, "sha256": "a" * 64, "priority": "low"})

    def event(self, **changes):
        return self.Log.objects.create(**{
            "module": "sanitation", "action": "create", "record_type": FINGERPRINT_RECORD_TYPE,
            "record_id": str(self.complaint.pk), "record_label": self.proof, **changes,
        })

    def upgrade(self):
        MigrationExecutor(connection).migrate(self.new_target)

    def assert_not_applied(self):
        applied = MigrationExecutor(connection).loader.applied_migrations
        self.assertNotIn(self.new_target[0], applied)
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, "api_activitylog")
        self.assertNotIn("uniq_sanitation_public_digest", constraints)

    def tearDown(self):
        # Historical migration models clean only disposable test fixtures; normal
        # application models remain subject to the deletion guards.
        self.Log.objects.filter(record_type=FINGERPRINT_RECORD_TYPE).delete()
        self.upgrade()
        super().tearDown()

    def test_duplicate_preflight_fails_without_data_or_schema_changes(self):
        first, second = self.event(), self.event()
        before = list(self.Log.objects.order_by("pk").values())
        with self.assertRaises(RuntimeError) as error:
            self.upgrade()
        self.assertIn(str(first.pk), str(error.exception))
        self.assertIn(str(second.pk), str(error.exception))
        self.assertIn("duplicate_identity", str(error.exception))
        self.assertEqual(list(self.Log.objects.order_by("pk").values()), before)
        self.assert_not_applied()

    def test_malformed_and_orphan_preflight_never_repairs_history_or_exposes_payload(self):
        for changes in (
            {"record_id": "sensitive resident text"}, {"record_id": "999999999"},
            {"record_label": "sensitive invalid JSON"}, {"action": "update"},
            {"record_label": json.dumps({"v": 1, "sha256": "bad", "priority": "low"})},
            {"record_label": "[]"},
        ):
            with self.subTest(changes=changes):
                event = self.event(**changes)
                original = self.Log.objects.filter(pk=event.pk).values().get()
                with self.assertRaises(RuntimeError) as error:
                    self.upgrade()
                message = str(error.exception)
                self.assertIn(f"event_pks=[{event.pk}]", message)
                self.assertNotIn("sensitive", message)
                self.assertNotIn("migration-form", message)
                self.assertEqual(self.Log.objects.filter(pk=event.pk).values().get(), original)
                self.assert_not_applied()
                self.Log.objects.filter(pk=event.pk).delete()
        self.complaint.client_submission_id = None
        self.complaint.save()
        event = self.event()
        before = self.Complaint.objects.filter(pk=self.complaint.pk).values().get()
        with self.assertRaises(RuntimeError) as error:
            self.upgrade()
        self.assertIn("missing_submission_identity", str(error.exception))
        self.assertEqual(self.Complaint.objects.filter(pk=self.complaint.pk).values().get(), before)
        self.assertTrue(self.Log.objects.filter(pk=event.pk).exists())
        self.assert_not_applied()

    def test_valid_and_legacy_history_are_unchanged_and_unique_constraint_is_added(self):
        self.event()
        self.Complaint.objects.create(
            complaint_id="LEGACY-MIGRATION", category="Other Sanitation Concern",
            barangay="Daungan", description="Preserve without guessing a digest",
            reported_date=date(2026, 1, 1),
        )
        before_logs = list(self.Log.objects.order_by("pk").values())
        before_complaints = list(self.Complaint.objects.order_by("pk").values())
        self.upgrade()
        self.assertEqual(list(self.Log.objects.order_by("pk").values()), before_logs)
        self.assertEqual(list(self.Complaint.objects.order_by("pk").values()), before_complaints)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.event()
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, "api_activitylog")
        self.assertTrue(constraints["uniq_sanitation_public_digest"]["unique"])
