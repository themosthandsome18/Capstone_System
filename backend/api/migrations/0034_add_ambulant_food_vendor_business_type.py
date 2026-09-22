from django.db import migrations


NAME = "Ambulant Food Vendor"


def add_ambulant_food_vendor(apps, schema_editor):
    """Create the client-confirmed "Ambulant Food Vendor" business type.

    Only the type itself is created (monthly inspections). No requirements are
    added: the Sanitation Section has not yet provided the official requirement
    list or legal basis, so the requirement checklist stays empty for both SP
    and Large coverage until they do.

    Does nothing if a type with this name already exists (in any casing), so an
    existing row, its frequency and any requirements on it are left untouched.
    """
    SanitaryBusinessType = apps.get_model("api", "SanitaryBusinessType")

    if SanitaryBusinessType.objects.filter(name__iexact=NAME).exists():
        return

    SanitaryBusinessType.objects.create(name=NAME, inspection_frequency="monthly")


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0033_rename_public_boat_type"),
    ]

    operations = [
        # Reverse is a no-op: the row may be referenced by establishments by then.
        migrations.RunPython(add_ambulant_food_vendor, migrations.RunPython.noop),
    ]
