"""Migration 0078: the owner-approved requirement list from the client paper
"Standard Requirements in Securing Sanitary Permit" (received 2026-11-18). Synthetic data only.
"""
import importlib

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.recorder import MigrationRecorder
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from api.models import (
    ROLE_SANITATION, SanitaryBusinessType, SanitaryEstablishment, SanitaryInspectionChecklistItem,
    SanitaryRequirement, UserProfile,
)
from api.seed_data import SANITARY_REQUIREMENTS, STANDARD_SANITARY_REQUIREMENTS
from api.test_sp_requirements_match_large import EMPTY_TYPES, SEED_TYPE_NAMES, build_production_shape

BEFORE = ("api", "0076_location_sitio_db_defaults")
STEP1 = ("api", "0077_sp_requirements_match_large")
TARGET = ("api", "0078_apply_client_requirement_list")
STOOL = "Stool Examination result (for food establishments only)"
REMOVED = "Certificate of Potability of Product Water"
OLD_PRC = "PRC License of MedTech/RadTech/Nurse/Doctor"
NEW_PRC = "PRC License of MedTech and RadTech"
STANDARD = list(STANDARD_SANITARY_REQUIREMENTS)
LARGE_SEED = {g["business_type"]: g["requirements"] for g in SANITARY_REQUIREMENTS if g["permit_size"] == "large"}

# The approved final list per type; SP and Large are identical.
APPROVED = {name: list(LARGE_SEED[name]) for name in SEED_TYPE_NAMES}
APPROVED["Water Refilling Station"] = [n for n in LARGE_SEED["Water Refilling Station"] if n != REMOVED]
APPROVED["Private Laboratory & Clinic"] = [
    NEW_PRC if n == OLD_PRC else n for n in LARGE_SEED["Private Laboratory & Clinic"]]
APPROVED["Food Establishment"] = STANDARD + [STOOL]
APPROVED["Ambulant Food Vendor"] = STANDARD + [STOOL]
APPROVED["Commercial Non Food"] = list(STANDARD)
TOUCHED = {"Water Refilling Station", "Private Laboratory & Clinic", *EMPTY_TYPES}


def migration_module():
    return importlib.import_module("api.migrations.0078_apply_client_requirement_list")


def type_names(apps, type_name, size):
    Requirement = apps.get_model("api", "SanitaryRequirement")
    return [r.requirement_name for r in Requirement.objects.filter(
        business_type__name=type_name, permit_size=size).order_by("id")]


def all_rows(apps):
    return list(apps.get_model("api", "SanitaryRequirement").objects.order_by("id").values())


class ClientListMigrationTests(TransactionTestCase):
    def prepare_step1(self):
        """Production shape after 0077: the seed types with SP == Large, three empty types."""
        executor = MigrationExecutor(connection)
        executor.migrate([BEFORE])
        apps = executor.loader.project_state([BEFORE]).apps
        # Test databases run every migration first; restore the production shape.
        apps.get_model("api", "SanitaryRequirement").objects.filter(business_type__name__in=EMPTY_TYPES).delete()
        build_production_shape(apps)
        executor = MigrationExecutor(connection)
        executor.migrate([STEP1])
        return executor.loader.project_state([STEP1]).apps

    def finish(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_final_lists_both_sizes_ids_kept_and_idempotent(self):
        try:
            apps = self.prepare_step1()
            after_step1 = all_rows(apps)
            old_prc_ids = sorted(r["id"] for r in after_step1 if r["requirement_name"] == OLD_PRC)
            executor = MigrationExecutor(connection)
            executor.migrate([TARGET])
            apps = executor.loader.project_state([TARGET]).apps
            for type_name, approved in APPROVED.items():
                for size in ("sp", "large"):
                    with self.subTest(type=type_name, size=size):
                        got = type_names(apps, type_name, size)
                        self.assertEqual(sorted(got), sorted(approved))
                        self.assertEqual(len(got), len(set(got)))
            BusinessType = apps.get_model("api", "SanitaryBusinessType")
            untouched_ids = set(BusinessType.objects.exclude(name__in=TOUCHED).values_list("id", flat=True))
            final = all_rows(apps)
            self.assertEqual([r for r in final if r["business_type_id"] in untouched_ids],
                             [r for r in after_step1 if r["business_type_id"] in untouched_ids])
            self.assertEqual(sorted(r["id"] for r in final if r["requirement_name"] == NEW_PRC), old_prc_ids)
            self.assertFalse(any(r["requirement_name"] in (REMOVED, OLD_PRC) for r in final))
            self.assertTrue(all(r["is_required"] for r in final))
            migration_module().apply_client_requirement_list(apps, None)
            self.assertEqual(all_rows(apps), final)
        finally:
            self.finish()

    def assert_aborts(self, make_offending, expected_text, cleanup):
        try:
            apps = self.prepare_step1()
            make_offending(apps)
            before = all_rows(apps)
            with self.assertRaises(Exception) as caught:
                MigrationExecutor(connection).migrate([TARGET])
            self.assertIn(expected_text, str(caught.exception))
            self.assertEqual(all_rows(apps), before)
            self.assertFalse(MigrationRecorder(connection).migration_qs.filter(
                app="api", name=TARGET[1]).exists())
        finally:
            cleanup(MigrationExecutor(connection).loader.project_state([STEP1]).apps)
            self.finish()

    def make_inspection(self, apps, type_name, draft):
        Establishment = apps.get_model("api", "SanitaryEstablishment")
        Inspection = apps.get_model("api", "SanitaryInspection")
        establishment = Establishment.objects.create(
            business_name="Synthetic guard", owner_name="Synthetic", permit_size="sp", barangay="Abo-abo",
            address="Synthetic", business_type=apps.get_model("api", "SanitaryBusinessType").objects.get(name=type_name))
        return establishment, Inspection.objects.create(
            establishment=establishment, inspector_name="Synthetic", inspection_date="2026-11-01", is_draft=draft)

    def drop_guard_data(self, apps):
        for model in ("SanitaryInspectionChecklistItem", "SanitaryInspection", "SanitaryPermitRenewal",
                      "SanitaryEstablishment"):
            apps.get_model("api", model).objects.all().delete()

    def test_draft_checklist_with_removed_name_aborts(self):
        def offend(apps):
            _, inspection = self.make_inspection(apps, "Water Refilling Station", draft=True)
            apps.get_model("api", "SanitaryInspectionChecklistItem").objects.create(
                inspection=inspection, requirement_name=REMOVED)
        self.assert_aborts(offend, "checklist", self.drop_guard_data)

    def test_final_checklist_with_old_prc_name_in_other_spacing_aborts(self):
        def offend(apps):
            _, inspection = self.make_inspection(apps, "Private Laboratory & Clinic", draft=False)
            apps.get_model("api", "SanitaryInspectionChecklistItem").objects.create(
                inspection=inspection, requirement_name="  " + OLD_PRC + " ")
        self.assert_aborts(offend, "checklist", self.drop_guard_data)

    def test_renewal_naming_removed_item_in_other_case_aborts(self):
        def offend(apps):
            establishment, _ = self.make_inspection(apps, "Water Refilling Station", draft=False)
            apps.get_model("api", "SanitaryPermitRenewal").objects.create(
                renewal_id="SYN-RN-1", establishment=establishment, permit_number="SYN-1",
                expiration_date="2027-01-01", submitted_requirements=["Scope of Work", REMOVED.lower()])
        self.assert_aborts(offend, "renewal", self.drop_guard_data)

    def test_existing_rename_target_aborts(self):
        def offend(apps):
            BusinessType = apps.get_model("api", "SanitaryBusinessType")
            apps.get_model("api", "SanitaryRequirement").objects.create(
                business_type=BusinessType.objects.get(name="Private Laboratory & Clinic"),
                permit_size="sp", requirement_name=NEW_PRC)

        def cleanup(apps):
            apps.get_model("api", "SanitaryRequirement").objects.filter(requirement_name=NEW_PRC).delete()
        self.assert_aborts(offend, "already exists", cleanup)

    def test_missing_old_row_that_changes_the_result_aborts(self):
        def offend(apps):
            apps.get_model("api", "SanitaryRequirement").objects.filter(requirement_name=OLD_PRC).delete()

        def cleanup(apps):
            lab = apps.get_model("api", "SanitaryBusinessType").objects.get(name="Private Laboratory & Clinic")
            for size in ("sp", "large"):
                apps.get_model("api", "SanitaryRequirement").objects.create(
                    business_type=lab, permit_size=size, requirement_name=OLD_PRC)
        self.assert_aborts(offend, "approved list", cleanup)


@override_settings(USE_SEED_DATA=False)
class ClientListHTTPTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user("synthetic_list_inspector", first_name="Synthetic",
                                                    last_name="Inspector")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        # Production shape for these two types before 0078: present and empty.
        for name in ("Food Establishment", "Ambulant Food Vendor"):
            business_type, _ = SanitaryBusinessType.objects.get_or_create(name=name)
            business_type.requirements.all().delete()

    def post_inspection(self, type_name, size):
        establishment = SanitaryEstablishment.objects.create(
            business_name=f"Synthetic {type_name} {size}", owner_name="Synthetic", permit_size=size,
            business_type=SanitaryBusinessType.objects.get(name=type_name), barangay="Abo-abo", address="Synthetic")
        return self.client.post("/api/mobile/sanitation/inspections/", {
            "establishment": establishment.pk, "inspection_date": "2026-11-19", "next_due_date": "2026-12-19",
            "status_after_inspection": "for_completion", "findings": "", "remarks": "",
            "checklist_items": [{"requirement_name": "Barangay Clearance of owner", "is_complied": True, "notes": ""},
                                {"requirement_name": STOOL, "is_complied": False, "notes": ""}],
        }, format="json")

    def test_food_types_get_standard_and_stool_in_api_and_mobile_save(self):
        for type_name in ("Food Establishment", "Ambulant Food Vendor"):
            with self.subTest(type=type_name):
                refused = self.post_inspection(type_name, "sp")
                self.assertEqual(refused.status_code, 400)
                self.assertEqual(set(refused.data), {"checklist_items"}, refused.data)
        migration_module().apply_client_requirement_list(global_apps, None)
        payload = self.client.get("/api/sanitation/business-types/").json()
        for type_name in ("Food Establishment", "Ambulant Food Vendor"):
            row = next(t for t in payload if t["name"] == type_name)
            for size in ("sp", "large"):
                with self.subTest(type=type_name, size=size):
                    names = [r["requirement_name"] for r in row["requirements"] if r["permit_size"] == size]
                    self.assertEqual(sorted(names), sorted(APPROVED[type_name]))
                    saved = self.post_inspection(type_name, size)
                    self.assertEqual(saved.status_code, 201, saved.data)
                    self.assertEqual(sorted(SanitaryInspectionChecklistItem.objects.filter(
                        inspection_id=saved.data["id"]).values_list("requirement_name", flat=True)),
                        sorted(["Barangay Clearance of owner", STOOL]))
        self.assertFalse(SanitaryRequirement.objects.filter(requirement_name=STOOL,
                                                            business_type__name="Commercial Non Food").exists())
