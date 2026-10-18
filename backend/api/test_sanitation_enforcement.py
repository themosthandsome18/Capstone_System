from datetime import date

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import (
    ROLE_ADMIN, ROLE_SANITATION, SanitaryBusinessType, SanitaryEstablishment,
    SanitaryInspection, SanitaryPermitRenewal, UserProfile,
)
from .serializers import SanitaryEstablishmentSerializer
from .services.sanitation import (
    resolve_overdue_renewal, sync_establishment_after_inspection,
    sync_establishment_after_renewal_release,
)


STAGES = [
    ("", "Not recorded"), ("warning", "Warning"),
    ("nov_1", "Notice of Violation 1"),
    ("nov_2", "Notice of Violation 2"),
    ("nov_3", "Notice of Violation 3"), ("suspension", "Suspension"),
]


@override_settings(USE_SEED_DATA=False)
class EnforcementContractTests(TestCase):
    url = "/api/sanitation/establishments/"

    def setUp(self):
        self.user = User.objects.create_user(username="enforcement_staff")
        UserProfile.objects.create(user=self.user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        kind = SanitaryBusinessType.objects.create(name="Synthetic cafe")
        self.payload = {
            "business_name": "Synthetic establishment", "owner_name": "Owner",
            "business_type": kind.pk, "barangay": "Daungan",
            "address": "Original address", "permit_size": "sp",
        }
        self.record = SanitaryEstablishment.objects.create(
            **{k: v for k, v in self.payload.items() if k != "business_type"},
            business_type=kind, enforcement_stage="nov_2",
            compliance_status="violation", permit_status="conditional",
            permit_number="SYNTHETIC-1", permit_issued_date=date(2026, 1, 1),
            permit_expiry_date=date(2026, 12, 31),
        )
        self.detail = f"{self.url}{self.record.pk}/"

    def snapshot(self):
        return SanitaryEstablishment.objects.filter(pk=self.record.pk).values().get()

    def test_all_values_and_labels_round_trip(self):
        field = SanitaryEstablishment._meta.get_field("enforcement_stage")
        self.assertEqual(list(field.choices), STAGES)
        for value, label in STAGES:
            with self.subTest(value=value):
                self.record.enforcement_stage = value
                self.record.full_clean()
                self.record.save(update_fields=["enforcement_stage"])
                self.record.refresh_from_db()
                data = SanitaryEstablishmentSerializer(self.record).data
                self.assertEqual(data["enforcement_stage"], value)
                self.assertEqual(data["enforcement_stage_label"], label)

    def test_unknown_model_choice_rejected(self):
        for value in ("nov_4", "invalid", "WARNING"):
            with self.subTest(value=value):
                self.record.enforcement_stage = value
                with self.assertRaises(ValidationError):
                    self.record.full_clean()

    def test_database_rejects_null(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            SanitaryEstablishment.objects.filter(pk=self.record.pk).update(
                enforcement_stage=None,
            )

    def test_serializer_read_only_and_explicit_input_rejection(self):
        serializer = SanitaryEstablishmentSerializer()
        self.assertTrue(serializer.fields["enforcement_stage"].read_only)
        self.assertTrue(serializer.fields["enforcement_stage_label"].read_only)
        for value in [v for v, _ in STAGES] + [None, "invalid"]:
            with self.subTest(value=value):
                serializer = SanitaryEstablishmentSerializer(
                    self.record, data={"enforcement_stage": value}, partial=True,
                )
                self.assertFalse(serializer.is_valid())
                self.assertIn("enforcement_stage", serializer.errors)

    def test_legacy_create_defaults_to_not_recorded(self):
        response = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["enforcement_stage"], "")
        self.assertEqual(response.data["enforcement_stage_label"], "Not recorded")
        created = SanitaryEstablishment.objects.get(pk=response.data["id"])
        self.assertEqual(created.enforcement_stage, "")
        self.assertEqual(created.compliance_status, "not_yet_inspected")
        self.assertEqual(created.permit_status, "active")

    def test_list_detail_bootstrap_and_permits_readback(self):
        for url in (self.url, self.detail, "/api/sanitation/bootstrap/",
                    "/api/sanitation/permits/"):
            with self.subTest(url=url):
                before = self.snapshot()
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200, response.data)
                data = response.data
                if isinstance(data, dict):
                    data = data.get("establishments", data.get("rows", data))
                row = data if isinstance(data, dict) else next(
                    row for row in data if row["id"] == self.record.pk
                )
                self.assertEqual(row["enforcement_stage"], "nov_2")
                self.assertEqual(row["enforcement_stage_label"], "Notice of Violation 2")
                self.assertEqual(self.snapshot(), before)

    def test_legacy_put_patch_preserve_stage_and_existing_values(self):
        for method, payload in (("patch", {"remarks": "Edited"}),
                                ("put", {**self.payload, "remarks": "Full edit"})):
            with self.subTest(method=method):
                before = self.snapshot()
                response = getattr(self.client, method)(self.detail, payload, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                after = self.snapshot()
                for key in before.keys() - {"remarks", "updated_at"}:
                    self.assertEqual(after[key], before[key], key)

    def test_all_stage_writes_blocked_for_staff_and_admin(self):
        admin = User.objects.create_user(username="enforcement_admin")
        UserProfile.objects.create(user=admin, role=ROLE_ADMIN)
        for user in (self.user, admin):
            self.client.force_authenticate(user)
            for value in [v for v, _ in STAGES] + [None, "invalid"]:
                for method in ("post", "put", "patch"):
                    with self.subTest(user=user.username, value=value, method=method):
                        before = self.snapshot()
                        count = SanitaryEstablishment.objects.count()
                        payload = {**self.payload, "enforcement_stage": value}
                        response = getattr(self.client, method)(
                            self.url if method == "post" else self.detail,
                            payload, format="json",
                        )
                        self.assertEqual(response.status_code, 400, response.data)
                        self.assertIn("enforcement_stage", response.data)
                        self.assertEqual(self.snapshot(), before)
                        self.assertEqual(SanitaryEstablishment.objects.count(), count)

    def test_unauthenticated_stage_write_cannot_mutate(self):
        self.client.force_authenticate(None)
        before = self.snapshot()
        response = self.client.patch(self.detail, {"enforcement_stage": "warning"}, format="json")
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.snapshot(), before)

    def test_display_label_cannot_mutate_stage(self):
        response = self.client.patch(self.detail, {
            "enforcement_stage_label": "Suspension", "remarks": "Unrelated",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.record.refresh_from_db()
        self.assertEqual(self.record.enforcement_stage, "nov_2")

    def test_violation_inspection_preserves_permit_and_enforcement_stage(self):
        inspection = SanitaryInspection.objects.create(
            establishment=self.record, inspector_name="Synthetic inspector",
            inspection_date=date(2026, 10, 18), status_after_inspection="violation",
            is_draft=True,
        )
        before = self.snapshot()
        sync_establishment_after_inspection(inspection)
        self.assertEqual(self.snapshot(), before)
        inspection.is_draft = False
        sync_establishment_after_inspection(inspection)
        self.record.refresh_from_db()
        self.assertEqual(self.record.permit_status, "conditional")
        self.assertEqual(self.record.compliance_status, "violation")
        self.assertEqual(self.record.enforcement_stage, "nov_2")
        self.assertEqual(self.record.permit_expiry_date, date(2026, 12, 31))

    def test_renewal_behavior_does_not_reset_stage(self):
        renewal = SanitaryPermitRenewal.objects.create(
            renewal_id="SYNTHETIC-RENEWAL", establishment=self.record,
            permit_number="SYNTHETIC-2", expiration_date=date(2026, 12, 31),
        )
        for action in (sync_establishment_after_renewal_release, resolve_overdue_renewal):
            with self.subTest(action=action.__name__):
                action(renewal)
                self.record.refresh_from_db()
                self.assertEqual(self.record.permit_status, "active")
                self.assertEqual(self.record.enforcement_stage, "nov_2")


@override_settings(
    USE_SEED_DATA=False,
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    },
)
class EnforcementAdminTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(
            username="synthetic_enforcement_admin", is_staff=True, is_superuser=True,
        )
        UserProfile.objects.create(user=user, role=ROLE_ADMIN)
        self.client.force_login(user)
        kind = SanitaryBusinessType.objects.create(name="Synthetic admin cafe")
        self.payload = {
            "business_name": "Synthetic admin establishment", "owner_name": "Owner",
            "business_type": str(kind.pk), "permit_size": "sp", "barangay": "Daungan",
            "address": "Original address", "has_permit": "on",
            "permit_status": "conditional", "compliance_status": "violation",
            "remarks": "Original remarks", "_save": "Save",
        }
        self.record = SanitaryEstablishment.objects.create(
            business_name=self.payload["business_name"], owner_name="Owner",
            business_type=kind, barangay="Daungan", address="Original address",
            permit_status="conditional", compliance_status="violation",
            remarks="Original remarks", enforcement_stage="nov_2",
        )
        self.add_url = reverse("admin:api_sanitaryestablishment_add")
        self.change_url = reverse("admin:api_sanitaryestablishment_change", args=[self.record.pk])

    def test_change_post_cannot_overwrite_stage_but_can_edit_remarks(self):
        # A successful POST must save legitimate edits while ignoring the forged
        # stage key. Before readonly_fields, this persists "suspension" instead.
        response = self.client.post(self.change_url, {
            **self.payload, "enforcement_stage": "suspension", "remarks": "Legitimate edit",
        })
        self.assertEqual(response.status_code, 302)
        self.record.refresh_from_db()
        self.assertEqual(self.record.enforcement_stage, "nov_2")
        self.assertEqual(self.record.remarks, "Legitimate edit")
        self.assertEqual(self.record.permit_status, "conditional")
        self.assertEqual(self.record.compliance_status, "violation")

    def test_add_post_cannot_assign_stage_but_can_create_establishment(self):
        response = self.client.post(self.add_url, {
            **self.payload, "business_name": "Synthetic new establishment",
            "enforcement_stage": "warning",
        })
        self.assertEqual(response.status_code, 302)
        created = SanitaryEstablishment.objects.get(business_name="Synthetic new establishment")
        self.assertEqual(created.enforcement_stage, "")
        self.assertEqual(created.address, "Original address")
        self.assertEqual(created.permit_status, "conditional")

    def test_both_forms_display_stage_without_an_editable_field(self):
        for url in (self.add_url, self.change_url):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                admin_form = response.context["adminform"]
                self.assertIn("enforcement_stage", admin_form.readonly_fields)
                self.assertNotIn("enforcement_stage", admin_form.form.fields)
                self.assertIn("remarks", admin_form.form.fields)
                self.assertNotContains(response, 'name="enforcement_stage"')

    def test_ordinary_change_without_stage_preserves_it(self):
        response = self.client.post(self.change_url, {
            **self.payload, "owner_name": "Edited owner",
        })
        self.assertEqual(response.status_code, 302)
        self.record.refresh_from_db()
        self.assertEqual(self.record.enforcement_stage, "nov_2")
        self.assertEqual(self.record.owner_name, "Edited owner")


class EnforcementMigrationTests(TransactionTestCase):
    def test_historical_records_are_preserved_without_inference(self):
        old = [("api", "0057_householdsanitationrecord_address_fields")]
        new = [("api", "0058_sanitaryestablishment_enforcement_stage")]
        executor = MigrationExecutor(connection)
        executor.migrate(old)
        try:
            apps = executor.loader.project_state(old).apps
            kind = apps.get_model("api", "SanitaryBusinessType").objects.create(name="History")
            model = apps.get_model("api", "SanitaryEstablishment")
            records = []
            for permit, compliance in (("suspended", "violation"), ("active", "good_standing"),
                                       ("no_permit", "not_yet_inspected")):
                record = model.objects.create(
                    business_name=f"History {permit}", owner_name="Historical owner",
                    business_type=kind, address="  Original ADDRESS / punctuation  ",
                    barangay="Daungan", permit_status=permit, compliance_status=compliance,
                    permit_expiry_date=date(2026, 12, 31), remarks="  Keep exact  ",
                )
                records.append(model.objects.filter(pk=record.pk).values().get())
            executor = MigrationExecutor(connection)
            executor.migrate(new)
            upgraded = executor.loader.project_state(new).apps.get_model("api", "SanitaryEstablishment")
            for before in records:
                after = upgraded.objects.filter(pk=before["id"]).values().get()
                self.assertEqual(after.pop("enforcement_stage"), "")
                self.assertEqual(after, before)
        finally:
            MigrationExecutor(connection).migrate(new)
