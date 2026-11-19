"""SP requirements match Large (client decision: business type, not SP/Large, decides requirements).

Migration 0077 only ADDS the missing 'sp' rows of the named seed types. Synthetic data only.
"""
import importlib

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from api.models import (
    ROLE_SANITATION, SanitaryBusinessType, SanitaryEstablishment, SanitaryInspectionChecklistItem,
    SanitaryRequirement, UserProfile,
)

# Frozen pre-0077 production shape, generated from `git show 5b2912e:backend/api/seed_data.py`
# (SANITARY_BUSINESS_TYPES and SANITARY_REQUIREMENTS). Do not edit by hand.
PRE_0077_STANDARD = ['Xerox copy of DTI/SEC/CDA',
 'Barangay Clearance of owner',
 'Chest X-ray Results (Owner & employees)',
 'CTC/Cedula of owner and employees',
 '1x1 picture of owner and employees',
 'Potability of Water Supply - Physical/Chemical Examination',
 'Potability of Water Supply - Microbiological Examination']
PRE_0077_TYPES = [('Water Refilling Station', 'monthly'),
 ('Agro-industrial Establishment (Poultry / Piggery Farm)', 'quarterly'),
 ('Restaurant / Food Establishment', 'quarterly'),
 ('Public Market Stall', 'quarterly'),
 ('Drug Store', 'annual'),
 ('Sub-contractor', 'quarterly'),
 ('Resort / Picnic Ground', 'annual'),
 ('Boatman', 'quarterly'),
 ('Massage / Physical Therapy', 'annual'),
 ('Funeral Parlor', 'annual'),
 ('Burial Ground', 'annual'),
 ('Private Laboratory & Clinic', 'annual'),
 ('Karaoke / Video Bar / CSW', 'annual')]
PRE_0077_REQUIREMENTS = {'Water Refilling Station': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                    'Barangay Clearance of owner',
                                    'Chest X-ray Results (Owner & employees)',
                                    'CTC/Cedula of owner and employees',
                                    '1x1 picture of owner and employees',
                                    'Potability of Water Supply - Physical/Chemical Examination',
                                    'Potability of Water Supply - Microbiological Examination',
                                    'Certificate of Potability of Product Water',
                                    'DOH Operational Permit Certificate',
                                    'Certificate of 40-hour Training Course (Owner)'],
                             'large': ['Xerox copy of DTI/SEC/CDA',
                                       'Barangay Clearance of owner',
                                       'Chest X-ray Results (Owner & employees)',
                                       'CTC/Cedula of owner and employees',
                                       '1x1 picture of owner and employees',
                                       'Potability of Water Supply - Physical/Chemical Examination',
                                       'Potability of Water Supply - Microbiological Examination',
                                       'Certificate of Potability of Product Water',
                                       'DOH Operational Permit Certificate',
                                       'Certificate of 40-hour Training Course (Owner)',
                                       'Water Safety Plan',
                                       'NWRB Water Permit Certificate']},
 'Agro-industrial Establishment (Poultry / Piggery Farm)': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                                                   'Barangay Clearance of owner',
                                                                   'Chest X-ray Results (Owner & employees)',
                                                                   'CTC/Cedula of owner and employees',
                                                                   '1x1 picture of owner and employees',
                                                                   'Potability of Water Supply - '
                                                                   'Physical/Chemical Examination',
                                                                   'Potability of Water Supply - '
                                                                   'Microbiological Examination',
                                                                   'DENR-EMB ECC or CNC'],
                                                            'large': ['Xerox copy of DTI/SEC/CDA',
                                                                      'Barangay Clearance of owner',
                                                                      'Chest X-ray Results (Owner & '
                                                                      'employees)',
                                                                      'CTC/Cedula of owner and employees',
                                                                      '1x1 picture of owner and employees',
                                                                      'Potability of Water Supply - '
                                                                      'Physical/Chemical Examination',
                                                                      'Potability of Water Supply - '
                                                                      'Microbiological Examination',
                                                                      'DENR-EMB ECC or CNC',
                                                                      'Waste Water Treatment Facility']},
 'Restaurant / Food Establishment': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                            'Barangay Clearance of owner',
                                            'Chest X-ray Results (Owner & employees)',
                                            'CTC/Cedula of owner and employees',
                                            '1x1 picture of owner and employees',
                                            'Potability of Water Supply - Physical/Chemical Examination',
                                            'Potability of Water Supply - Microbiological Examination',
                                            'Stool Examination result (for food establishments only)'],
                                     'large': ['Xerox copy of DTI/SEC/CDA',
                                               'Barangay Clearance of owner',
                                               'Chest X-ray Results (Owner & employees)',
                                               'CTC/Cedula of owner and employees',
                                               '1x1 picture of owner and employees',
                                               'Potability of Water Supply - Physical/Chemical Examination',
                                               'Potability of Water Supply - Microbiological Examination',
                                               'Stool Examination result (for food establishments only)']},
 'Public Market Stall': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                'Barangay Clearance of owner',
                                'Chest X-ray Results (Owner & employees)',
                                'CTC/Cedula of owner and employees',
                                '1x1 picture of owner and employees',
                                'Potability of Water Supply - Physical/Chemical Examination',
                                'Potability of Water Supply - Microbiological Examination',
                                'Stool Examination result (for food establishments only)'],
                         'large': ['Xerox copy of DTI/SEC/CDA',
                                   'Barangay Clearance of owner',
                                   'Chest X-ray Results (Owner & employees)',
                                   'CTC/Cedula of owner and employees',
                                   '1x1 picture of owner and employees',
                                   'Potability of Water Supply - Physical/Chemical Examination',
                                   'Potability of Water Supply - Microbiological Examination',
                                   'Stool Examination result (for food establishments only)']},
 'Drug Store': {'sp': ['Xerox copy of DTI/SEC/CDA',
                       'Barangay Clearance of owner',
                       'Chest X-ray Results (Owner & employees)',
                       'CTC/Cedula of owner and employees',
                       '1x1 picture of owner and employees',
                       'Potability of Water Supply - Physical/Chemical Examination',
                       'Potability of Water Supply - Microbiological Examination',
                       'DOH License to Operate'],
                'large': ['Xerox copy of DTI/SEC/CDA',
                          'Barangay Clearance of owner',
                          'Chest X-ray Results (Owner & employees)',
                          'CTC/Cedula of owner and employees',
                          '1x1 picture of owner and employees',
                          'Potability of Water Supply - Physical/Chemical Examination',
                          'Potability of Water Supply - Microbiological Examination',
                          'DOH License to Operate',
                          'PRC License of Pharmacist']},
 'Sub-contractor': {'sp': ['Xerox copy of DTI/SEC/CDA',
                           'Barangay Clearance of owner',
                           'Chest X-ray Results (Owner & employees)',
                           'CTC/Cedula of owner and employees',
                           '1x1 picture of owner and employees',
                           'Potability of Water Supply - Physical/Chemical Examination',
                           'Potability of Water Supply - Microbiological Examination',
                           'Physical Examination of all Employees',
                           'Scope of Work',
                           'Full-time First Aider (1-60 employees)'],
                    'large': ['Xerox copy of DTI/SEC/CDA',
                              'Barangay Clearance of owner',
                              'Chest X-ray Results (Owner & employees)',
                              'CTC/Cedula of owner and employees',
                              '1x1 picture of owner and employees',
                              'Potability of Water Supply - Physical/Chemical Examination',
                              'Potability of Water Supply - Microbiological Examination',
                              'Physical Examination of all Employees',
                              'Scope of Work',
                              'Full-time First Aider (1-60 employees)',
                              'Full-time First Aider and Part-Time OH Nurse (61-99 employees)',
                              'Part-Time OH Physician and Dentist, Full-time OH Nurse, and First Aider '
                              '(100-199 employees)',
                              'Part-Time OH Physician and Dentist, Full-time OH Nurse, and First Aider '
                              '(200-600 employees)',
                              'Full-time OH Physician and Dentist, Full-time OH Nurse, and First Aider '
                              '(601-2000 employees)']},
 'Resort / Picnic Ground': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                   'Barangay Clearance of owner',
                                   'Chest X-ray Results (Owner & employees)',
                                   'CTC/Cedula of owner and employees',
                                   '1x1 picture of owner and employees',
                                   'Potability of Water Supply - Physical/Chemical Examination',
                                   'Potability of Water Supply - Microbiological Examination',
                                   'Trained Lifeguard',
                                   'First Aid Kit'],
                            'large': ['Xerox copy of DTI/SEC/CDA',
                                      'Barangay Clearance of owner',
                                      'Chest X-ray Results (Owner & employees)',
                                      'CTC/Cedula of owner and employees',
                                      '1x1 picture of owner and employees',
                                      'Potability of Water Supply - Physical/Chemical Examination',
                                      'Potability of Water Supply - Microbiological Examination',
                                      'Trained Lifeguard',
                                      'Life Saving Equipment',
                                      'First Aid Kit',
                                      'Waste Water Treatment Facility']},
 'Boatman': {'sp': ['Xerox copy of DTI/SEC/CDA',
                    'Barangay Clearance of owner',
                    'Chest X-ray Results (Owner & employees)',
                    'CTC/Cedula of owner and employees',
                    '1x1 picture of owner and employees',
                    'Potability of Water Supply - Physical/Chemical Examination',
                    'Potability of Water Supply - Microbiological Examination',
                    'Life Vest',
                    'MARINA Certificate of License of Boatman'],
             'large': ['Xerox copy of DTI/SEC/CDA',
                       'Barangay Clearance of owner',
                       'Chest X-ray Results (Owner & employees)',
                       'CTC/Cedula of owner and employees',
                       '1x1 picture of owner and employees',
                       'Potability of Water Supply - Physical/Chemical Examination',
                       'Potability of Water Supply - Microbiological Examination',
                       'Life Vest',
                       'MARINA Certificate of License of Boatman',
                       'First Aid Kit']},
 'Massage / Physical Therapy': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                       'Barangay Clearance of owner',
                                       'Chest X-ray Results (Owner & employees)',
                                       'CTC/Cedula of owner and employees',
                                       '1x1 picture of owner and employees',
                                       'Potability of Water Supply - Physical/Chemical Examination',
                                       'Potability of Water Supply - Microbiological Examination',
                                       'License of Physical Therapist',
                                       'NC2 Certification of Massage Therapist',
                                       'Hepa B Screening'],
                                'large': ['Xerox copy of DTI/SEC/CDA',
                                          'Barangay Clearance of owner',
                                          'Chest X-ray Results (Owner & employees)',
                                          'CTC/Cedula of owner and employees',
                                          '1x1 picture of owner and employees',
                                          'Potability of Water Supply - Physical/Chemical Examination',
                                          'Potability of Water Supply - Microbiological Examination',
                                          'License of Physical Therapist',
                                          'NC2 Certification of Massage Therapist',
                                          'Hepa B Screening']},
 'Funeral Parlor': {'sp': ['Xerox copy of DTI/SEC/CDA',
                           'Barangay Clearance of owner',
                           'Chest X-ray Results (Owner & employees)',
                           'CTC/Cedula of owner and employees',
                           '1x1 picture of owner and employees',
                           'Potability of Water Supply - Physical/Chemical Examination',
                           'Potability of Water Supply - Microbiological Examination',
                           'License of Embalmer'],
                    'large': ['Xerox copy of DTI/SEC/CDA',
                              'Barangay Clearance of owner',
                              'Chest X-ray Results (Owner & employees)',
                              'CTC/Cedula of owner and employees',
                              '1x1 picture of owner and employees',
                              'Potability of Water Supply - Physical/Chemical Examination',
                              'Potability of Water Supply - Microbiological Examination',
                              'License of Embalmer',
                              'DOH License to Operate Certificate']},
 'Burial Ground': {'sp': ['Xerox copy of DTI/SEC/CDA',
                          'Barangay Clearance of owner',
                          'Chest X-ray Results (Owner & employees)',
                          'CTC/Cedula of owner and employees',
                          '1x1 picture of owner and employees',
                          'Potability of Water Supply - Physical/Chemical Examination',
                          'Potability of Water Supply - Microbiological Examination',
                          'Operational Clearance from DOH Regional Office'],
                   'large': ['Xerox copy of DTI/SEC/CDA',
                             'Barangay Clearance of owner',
                             'Chest X-ray Results (Owner & employees)',
                             'CTC/Cedula of owner and employees',
                             '1x1 picture of owner and employees',
                             'Potability of Water Supply - Physical/Chemical Examination',
                             'Potability of Water Supply - Microbiological Examination',
                             'Operational Clearance from DOH Regional Office']},
 'Private Laboratory & Clinic': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                        'Barangay Clearance of owner',
                                        'Chest X-ray Results (Owner & employees)',
                                        'CTC/Cedula of owner and employees',
                                        '1x1 picture of owner and employees',
                                        'Potability of Water Supply - Physical/Chemical Examination',
                                        'Potability of Water Supply - Microbiological Examination',
                                        'DOH License to Operate Certificate',
                                        'PRC License of MedTech/RadTech/Nurse/Doctor'],
                                 'large': ['Xerox copy of DTI/SEC/CDA',
                                           'Barangay Clearance of owner',
                                           'Chest X-ray Results (Owner & employees)',
                                           'CTC/Cedula of owner and employees',
                                           '1x1 picture of owner and employees',
                                           'Potability of Water Supply - Physical/Chemical Examination',
                                           'Potability of Water Supply - Microbiological Examination',
                                           'DOH License to Operate Certificate',
                                           'PRC License of MedTech/RadTech/Nurse/Doctor',
                                           'Hepa B Screening or anti Hepa B Vaccination',
                                           'Special Waste Facility and MOA with Service Provider']},
 'Karaoke / Video Bar / CSW': {'sp': ['Xerox copy of DTI/SEC/CDA',
                                      'Barangay Clearance of owner',
                                      'Chest X-ray Results (Owner & employees)',
                                      'CTC/Cedula of owner and employees',
                                      '1x1 picture of owner and employees',
                                      'Potability of Water Supply - Physical/Chemical Examination',
                                      'Potability of Water Supply - Microbiological Examination',
                                      'Hepa B Screening',
                                      'Regular Smear'],
                               'large': ['Xerox copy of DTI/SEC/CDA',
                                         'Barangay Clearance of owner',
                                         'Chest X-ray Results (Owner & employees)',
                                         'CTC/Cedula of owner and employees',
                                         '1x1 picture of owner and employees',
                                         'Potability of Water Supply - Physical/Chemical Examination',
                                         'Potability of Water Supply - Microbiological Examination',
                                         'Hepa B Screening',
                                         'Regular Smear',
                                         'NSO Birth Certificate']}}

# Owner's read-only production inventory before 0077 (sp, large).
PRODUCTION_INVENTORY = {
    "Agro-industrial Establishment (Poultry / Piggery Farm)": (8, 9), "Boatman": (9, 10), "Burial Ground": (8, 8),
    "Drug Store": (8, 9), "Funeral Parlor": (8, 9), "Karaoke / Video Bar / CSW": (9, 10),
    "Massage / Physical Therapy": (10, 10), "Private Laboratory & Clinic": (9, 11), "Public Market Stall": (8, 8),
    "Resort / Picnic Ground": (9, 11), "Restaurant / Food Establishment": (8, 8), "Sub-contractor": (10, 14),
    "Water Refilling Station": (10, 12),
}

BEFORE = ("api", "0076_location_sitio_db_defaults")
TARGET = ("api", "0077_sp_requirements_match_large")
EMPTY_TYPES = ("Food Establishment", "Commercial Non Food", "Ambulant Food Vendor")
SEED_TYPE_NAMES = [name for name, _ in PRE_0077_TYPES]
# The exact rows the migration must add on the production shape (Large minus SP, per type).
EXPECTED_ADDED = {
    "Agro-industrial Establishment (Poultry / Piggery Farm)": ["Waste Water Treatment Facility"],
    "Boatman": ["First Aid Kit"],
    "Drug Store": ["PRC License of Pharmacist"],
    "Funeral Parlor": ["DOH License to Operate Certificate"],
    "Karaoke / Video Bar / CSW": ["NSO Birth Certificate"],
    "Private Laboratory & Clinic": ["Hepa B Screening or anti Hepa B Vaccination",
                                    "Special Waste Facility and MOA with Service Provider"],
    "Resort / Picnic Ground": ["Life Saving Equipment", "Waste Water Treatment Facility"],
    "Sub-contractor": [
        "Full-time First Aider and Part-Time OH Nurse (61-99 employees)",
        "Part-Time OH Physician and Dentist, Full-time OH Nurse, and First Aider (100-199 employees)",
        "Part-Time OH Physician and Dentist, Full-time OH Nurse, and First Aider (200-600 employees)",
        "Full-time OH Physician and Dentist, Full-time OH Nurse, and First Aider (601-2000 employees)",
    ],
    "Water Refilling Station": ["Water Safety Plan", "NWRB Water Permit Certificate"],
}


def migration_module():
    return importlib.import_module("api.migrations.0077_sp_requirements_match_large")


def build_production_shape(apps, types=None):
    """The 13 seed types with their seed rows for both sizes, plus the three empty types."""
    BusinessType = apps.get_model("api", "SanitaryBusinessType")
    Requirement = apps.get_model("api", "SanitaryRequirement")
    wanted = set(types or SEED_TYPE_NAMES)
    by_name = {}
    for type_name, frequency in PRE_0077_TYPES:
        if type_name in wanted:
            by_name[type_name], _ = BusinessType.objects.get_or_create(
                name=type_name, defaults={"inspection_frequency": frequency})
    for type_name, sizes in PRE_0077_REQUIREMENTS.items():
        if type_name in wanted:
            for size, requirement_names in sizes.items():
                for name in requirement_names:
                    Requirement.objects.create(business_type=by_name[type_name],
                                               permit_size=size, requirement_name=name)
    if types is None:
        for name in EMPTY_TYPES:
            BusinessType.objects.get_or_create(name=name)
    return by_name


def names(apps, type_name, size):
    Requirement = apps.get_model("api", "SanitaryRequirement")
    return [r.requirement_name for r in Requirement.objects.filter(
        business_type__name=type_name, permit_size=size).order_by("id")]


class FrozenFixtureTests(SimpleTestCase):
    def test_frozen_fixture_equals_the_production_inventory(self):
        self.assertEqual({name: (len(sizes["sp"]), len(sizes["large"]))
                          for name, sizes in PRE_0077_REQUIREMENTS.items()}, PRODUCTION_INVENTORY)
        self.assertEqual(len(EMPTY_TYPES), 3)
        self.assertFalse(set(EMPTY_TYPES) & set(PRE_0077_REQUIREMENTS))


class SpMatchesLargeMigrationTests(TransactionTestCase):
    def test_production_shape_gains_only_the_missing_sp_rows(self):
        executor = MigrationExecutor(connection)
        executor.migrate([BEFORE])
        try:
            apps = executor.loader.project_state([BEFORE]).apps
            # Test databases run every migration first (0078 fills the three empty types
            # and has a no-op reverse); restore the production shape where they are empty.
            apps.get_model("api", "SanitaryRequirement").objects.filter(business_type__name__in=EMPTY_TYPES).delete()
            build_production_shape(apps)
            BusinessType = apps.get_model("api", "SanitaryBusinessType")
            Requirement = apps.get_model("api", "SanitaryRequirement")
            # A type outside the named list must never be touched.
            unlisted = BusinessType.objects.create(name="Synthetic Unlisted Type")
            Requirement.objects.create(business_type=unlisted, permit_size="large", requirement_name="Large only")
            large_before = list(Requirement.objects.filter(permit_size="large").order_by("id").values())
            sp_before = list(Requirement.objects.filter(permit_size="sp").order_by("id").values())
            self.assertEqual((len(sp_before), len(large_before)), (114, 130))

            executor = MigrationExecutor(connection)
            executor.migrate([TARGET])
            apps = executor.loader.project_state([TARGET]).apps
            Requirement = apps.get_model("api", "SanitaryRequirement")

            self.assertEqual(list(Requirement.objects.filter(permit_size="large").order_by("id").values()), large_before)
            sp_after = list(Requirement.objects.filter(permit_size="sp").order_by("id").values())
            self.assertEqual(sp_after[:len(sp_before)], sp_before)          # existing SP rows unchanged, same ids
            for type_name in SEED_TYPE_NAMES:
                with self.subTest(type=type_name):
                    sp, large = names(apps, type_name, "sp"), names(apps, type_name, "large")
                    self.assertEqual(sorted(sp), sorted(large))
                    self.assertEqual(len(sp), len(set(sp)))
                    added = [n for n in sp if n not in [r["requirement_name"] for r in sp_before
                                                        if r["business_type_id"] == BusinessType.objects.get(name=type_name).pk]]
                    self.assertEqual(added, EXPECTED_ADDED.get(type_name, []))
            self.assertEqual(len(sp_after) - len(sp_before), 15)
            for type_name in EMPTY_TYPES:
                self.assertEqual(Requirement.objects.filter(business_type__name=type_name).count(), 0)
            self.assertEqual(names(apps, "Synthetic Unlisted Type", "sp"), [])

            # Idempotent: running the migration function again adds nothing.
            migration_module().add_missing_sp_requirements(apps, None)
            self.assertEqual(Requirement.objects.count(), len(sp_after) + len(large_before))
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())

    def test_migration_is_data_only_and_reverse_is_a_no_op(self):
        migration = MigrationExecutor(connection).loader.disk_migrations[TARGET]
        self.assertEqual(migration.dependencies, [BEFORE])
        self.assertEqual([type(op).__name__ for op in migration.operations], ["RunPython"])
        self.assertIs(migration.operations[0].reverse_code, migration_module().migrations.RunPython.noop)


class SpMatchesLargeFunctionTests(TestCase):
    def test_trimmed_name_counts_as_present_and_is_required_is_copied(self):
        wrs = SanitaryBusinessType.objects.create(name="Water Refilling Station")
        SanitaryRequirement.objects.create(business_type=wrs, permit_size="large", requirement_name="Water Safety Plan")
        SanitaryRequirement.objects.create(business_type=wrs, permit_size="sp", requirement_name=" Water Safety Plan ")
        SanitaryRequirement.objects.create(business_type=wrs, permit_size="large", requirement_name="Optional Synthetic",
                                           is_required=False)
        migration_module().add_missing_sp_requirements(global_apps, None)
        self.assertEqual(sorted(SanitaryRequirement.objects.filter(business_type=wrs, permit_size="sp")
                                .values_list("requirement_name", "is_required")),
                         [(" Water Safety Plan ", True), ("Optional Synthetic", False)])


@override_settings(USE_SEED_DATA=False)
class SpRequirementsHTTPTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user("synthetic_sp_inspector", first_name="Synthetic", last_name="Inspector")
        UserProfile.objects.create(user=user, role=ROLE_SANITATION)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
        self.types = build_production_shape(global_apps, types=["Water Refilling Station", "Sub-contractor"])

    def sp_names(self, payload, type_name):
        row = next(t for t in payload if t["name"] == type_name)
        return [r["requirement_name"] for r in row["requirements"] if r["permit_size"] == "sp"], \
               [r["requirement_name"] for r in row["requirements"] if r["permit_size"] == "large"]

    def test_business_types_api_returns_the_full_list_for_sp(self):
        migration_module().add_missing_sp_requirements(global_apps, None)
        response = self.client.get("/api/sanitation/business-types/")
        self.assertEqual(response.status_code, 200)
        sp, large = self.sp_names(response.json(), "Water Refilling Station")
        self.assertIn("NWRB Water Permit Certificate", sp)
        self.assertIn("Water Safety Plan", sp)
        self.assertEqual(sorted(sp), sorted(large))
        sp, large = self.sp_names(response.json(), "Sub-contractor")
        ranges = ["Full-time First Aider (1-60 employees)"] + EXPECTED_ADDED["Sub-contractor"]
        self.assertEqual([name for name in sp if name in ranges], ranges)
        self.assertEqual(sorted(sp), sorted(large))

    def test_mobile_inspection_accepts_a_newly_added_sp_name(self):
        establishment = SanitaryEstablishment.objects.create(
            business_name="Synthetic WRS", owner_name="Synthetic owner", permit_size="sp",
            business_type=self.types["Water Refilling Station"], barangay="Abo-abo", address="Synthetic address")
        payload = {
            "establishment": establishment.pk, "inspection_date": "2026-11-18",
            "status_after_inspection": "for_completion", "findings": "", "remarks": "",
            "next_due_date": "2026-12-18",
            "checklist_items": [{"requirement_name": "Water Safety Plan", "is_complied": True, "notes": ""}],
        }
        before = self.client.post("/api/mobile/sanitation/inspections/", payload, format="json")
        # Today's SP catalogue lacks the name, and that is the only reason for the refusal.
        self.assertEqual(before.status_code, 400)
        self.assertEqual(set(before.data), {"checklist_items"}, before.data)
        self.assertIn("unknown, inapplicable", str(before.data["checklist_items"]))
        migration_module().add_missing_sp_requirements(global_apps, None)
        after = self.client.post("/api/mobile/sanitation/inspections/", payload, format="json")
        self.assertEqual(after.status_code, 201, after.data)
        self.assertEqual(list(SanitaryInspectionChecklistItem.objects.filter(inspection_id=after.data["id"])
                              .values_list("requirement_name", "is_complied")), [("Water Safety Plan", True)])
