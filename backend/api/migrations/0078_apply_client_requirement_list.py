from django.db import migrations

# Owner-approved requirement list from the client paper "Standard Requirements in
# Securing Sanitary Permit" (signed by the Sanitation Inspector II, received
# 2026-11-18). See docs/sanitation/sanitary-permit-requirements-source.md.
# Business types are matched by exact NAME, never by id. SP and Large are the same.
STANDARD = [
    "Xerox copy of DTI/SEC/CDA",
    "Barangay Clearance of owner",
    "Chest X-ray Results (Owner & employees)",
    "CTC/Cedula of owner and employees",
    "1x1 picture of owner and employees",
    "Potability of Water Supply - Physical/Chemical Examination",
    "Potability of Water Supply - Microbiological Examination",
]
STOOL = "Stool Examination result (for food establishments only)"
SIZES = ("sp", "large")

ADDITIONS = {
    "Food Establishment": STANDARD + [STOOL],
    "Ambulant Food Vendor": STANDARD + [STOOL],
    "Commercial Non Food": list(STANDARD),
}
DELETIONS = {"Water Refilling Station": ["Certificate of Potability of Product Water"]}
RENAMES = {
    "Private Laboratory & Clinic": {
        "PRC License of MedTech/RadTech/Nurse/Doctor": "PRC License of MedTech and RadTech",
    },
}
# The complete approved list of every type this migration touches (both sizes).
APPROVED = {
    **ADDITIONS,
    "Water Refilling Station": STANDARD + [
        "DOH Operational Permit Certificate",
        "Certificate of 40-hour Training Course (Owner)",
        "Water Safety Plan",
        "NWRB Water Permit Certificate",
    ],
    "Private Laboratory & Clinic": STANDARD + [
        "DOH License to Operate Certificate",
        "PRC License of MedTech and RadTech",
        "Hepa B Screening or anti Hepa B Vaccination",
        "Special Waste Facility and MOA with Service Provider",
    ],
}


class ClientRequirementListAbort(RuntimeError):
    """Raised before anything is committed; the migration's transaction rolls back."""


def _key(name):
    # The same normalization the permit-renewal view uses for requirement names.
    return " ".join(str(name).split()).lower()


def _check_references(apps, retired):
    """No inspection checklist row or renewal may still use a name that goes away."""
    ChecklistItem = apps.get_model("api", "SanitaryInspectionChecklistItem")
    Renewal = apps.get_model("api", "SanitaryPermitRenewal")
    problems = []
    used = [name for name in ChecklistItem.objects.values_list("requirement_name", flat=True).distinct()
            if _key(name) in retired]
    if used:
        count = ChecklistItem.objects.filter(requirement_name__in=used).count()
        problems.append(f"{count} inspection checklist row(s) use a name being deleted or renamed")
    renewals = sum(
        1 for submitted in Renewal.objects.values_list("submitted_requirements", flat=True)
        if isinstance(submitted, list) and any(_key(item) in retired for item in submitted)
    )
    if renewals:
        problems.append(f"{renewals} permit renewal(s) list a name being deleted or renamed")
    return problems


def apply_client_requirement_list(apps, schema_editor):
    BusinessType = apps.get_model("api", "SanitaryBusinessType")
    Requirement = apps.get_model("api", "SanitaryRequirement")
    types = {t.name: t for t in BusinessType.objects.filter(name__in=APPROVED)}  # absent types are skipped

    retired = {_key(n) for name, names in DELETIONS.items() if name in types for n in names}
    retired |= {_key(old) for name, pairs in RENAMES.items() if name in types for old in pairs}
    problems = _check_references(apps, retired)
    for name, pairs in RENAMES.items():
        if name not in types:
            continue
        for old, new in pairs.items():
            for size in SIZES:
                rows = Requirement.objects.filter(business_type=types[name], permit_size=size)
                if (any(_key(r.requirement_name) == _key(old) for r in rows)
                        and any(_key(r.requirement_name) == _key(new) for r in rows)):
                    problems.append(f'{name} ({size}): rename target "{new}" already exists')
    if problems:
        raise ClientRequirementListAbort("Migration 0078 aborted, nothing changed: " + "; ".join(problems))

    for name, wanted in ADDITIONS.items():
        if name not in types:
            continue
        for size in SIZES:
            present = {_key(n) for n in Requirement.objects.filter(
                business_type=types[name], permit_size=size).values_list("requirement_name", flat=True)}
            for requirement_name in wanted:
                if _key(requirement_name) not in present:
                    Requirement.objects.create(business_type=types[name], permit_size=size,
                                               requirement_name=requirement_name, is_required=True)
                    present.add(_key(requirement_name))
    for name, names in DELETIONS.items():
        if name in types:
            for row in Requirement.objects.filter(business_type=types[name]):
                if _key(row.requirement_name) in {_key(n) for n in names}:
                    row.delete()
    for name, pairs in RENAMES.items():
        if name in types:
            for row in Requirement.objects.filter(business_type=types[name]):
                for old, new in pairs.items():
                    if _key(row.requirement_name) == _key(old):
                        row.requirement_name = new
                        row.save(update_fields=["requirement_name"])

    # Every touched type must now hold exactly the approved list, or nothing is kept.
    mismatches = []
    for name, approved in APPROVED.items():
        if name not in types:
            continue
        for size in SIZES:
            got = sorted(_key(n) for n in Requirement.objects.filter(
                business_type=types[name], permit_size=size).values_list("requirement_name", flat=True))
            if got != sorted(_key(n) for n in approved):
                mismatches.append(f"{name} ({size})")
    if mismatches:
        raise ClientRequirementListAbort(
            "Migration 0078 aborted, nothing changed: the result would differ from the approved list for "
            + ", ".join(mismatches) + ". Inspect these rows instead of guessing.")


class Migration(migrations.Migration):
    atomic = True

    dependencies = [
        ("api", "0077_sp_requirements_match_large"),
    ]

    operations = [
        # Reverse is a deliberate no-op: restoring a deleted or renamed name could
        # contradict inspections recorded after this migration (rows match by name).
        migrations.RunPython(apply_client_requirement_list, migrations.RunPython.noop),
    ]
