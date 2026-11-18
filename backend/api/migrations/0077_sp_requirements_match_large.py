from django.db import migrations

# Client decision: the business type decides the requirements, not SP/Large
# coverage. For these types (matched by exact NAME, never by id, since ids
# differ between databases) every 'large' requirement gets an 'sp' row too.
TYPE_NAMES = [
    "Water Refilling Station",
    "Agro-industrial Establishment (Poultry / Piggery Farm)",
    "Restaurant / Food Establishment",
    "Public Market Stall",
    "Drug Store",
    "Sub-contractor",
    "Resort / Picnic Ground",
    "Boatman",
    "Massage / Physical Therapy",
    "Funeral Parlor",
    "Burial Ground",
    "Private Laboratory & Clinic",
    "Karaoke / Video Bar / CSW",
]


def add_missing_sp_requirements(apps, schema_editor):
    """Add-only: create the missing 'sp' rows; never update, rename or delete a row.

    A type that does not exist is skipped, a type without 'large' rows gets
    nothing, 'large' rows are never touched, and an 'sp' row whose trimmed name
    already matches counts as present. Running it again adds nothing.
    """
    BusinessType = apps.get_model("api", "SanitaryBusinessType")
    Requirement = apps.get_model("api", "SanitaryRequirement")
    for business_type in BusinessType.objects.filter(name__in=TYPE_NAMES).order_by("name"):
        present = {
            name.strip()
            for name in Requirement.objects.filter(business_type=business_type, permit_size="sp")
            .values_list("requirement_name", flat=True)
        }
        for large in Requirement.objects.filter(business_type=business_type, permit_size="large").order_by("id"):
            if large.requirement_name.strip() in present:
                continue
            Requirement.objects.create(
                business_type=business_type,
                permit_size="sp",
                requirement_name=large.requirement_name,
                is_required=large.is_required,
            )
            present.add(large.requirement_name.strip())


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0076_location_sitio_db_defaults"),
    ]

    operations = [
        # Reverse is a deliberate no-op: once added, these names may be recorded
        # on inspections (checklist rows are matched by name), so they are kept.
        migrations.RunPython(add_missing_sp_requirements, migrations.RunPython.noop),
    ]
