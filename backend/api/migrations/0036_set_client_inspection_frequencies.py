from django.db import migrations


# Inspection frequencies from the client's form, keyed by business-type NAME
# (never by id, which differs between databases). Commercial Non Food and
# Drug Store are "Depends" on the form and are deliberately not listed.
CLIENT_INSPECTION_FREQUENCIES = {
    "Restaurant / Food Establishment": "quarterly",
    "Public Market Stall": "quarterly",
    "Food Establishment": "quarterly",
    "Sub-contractor": "quarterly",
    "Boatman": "quarterly",
    "Agro-industrial Establishment (Poultry / Piggery Farm)": "quarterly",
    "Resort / Picnic Ground": "annual",
    "Karaoke / Video Bar / CSW": "annual",
    "Funeral Parlor": "annual",
    "Burial Ground": "annual",
    # Public Places, per the client's classification.
    "Private Laboratory & Clinic": "annual",
    "Massage / Physical Therapy": "annual",
    "Water Refilling Station": "monthly",
    "Ambulant Food Vendor": "monthly",
}


def set_client_inspection_frequencies(apps, schema_editor):
    """Only touches inspection_frequency, and only on rows that differ.

    A name that does not exist is skipped, and running this again changes
    nothing, so it is safe on any database.
    """
    SanitaryBusinessType = apps.get_model("api", "SanitaryBusinessType")

    for name, frequency in CLIENT_INSPECTION_FREQUENCIES.items():
        business_type = SanitaryBusinessType.objects.filter(name=name).first()
        if business_type is None or business_type.inspection_frequency == frequency:
            continue

        print(
            f"\n  inspection_frequency: {name}: "
            f"{business_type.inspection_frequency} -> {frequency}",
            end="",
        )
        SanitaryBusinessType.objects.filter(pk=business_type.pk).update(
            inspection_frequency=frequency
        )


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0035_add_not_yet_inspected_compliance_status"),
    ]

    operations = [
        # Reverse is a no-op: the previous values are not guessed.
        migrations.RunPython(set_client_inspection_frequencies, migrations.RunPython.noop),
    ]
