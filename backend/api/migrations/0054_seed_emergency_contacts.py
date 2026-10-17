"""Put the four hotlines the mobile app has written in its code into the table.

DATA ONLY. The text is the app's own, word for word, in the app's order
(mobile/lib/screens/tourism_screens.dart, ProfilePage, "Emergency Hotlines &
Helpdesk"). Where the app shows "numbers • email" in one line, the number and
the email are kept apart here (contact_numbers and email), so the app can put
them together again as before.

A row that already has the same name is left alone: running this again, or
after an admin has edited the contacts, adds nothing and changes nothing.

Reverse: deletes those four rows (matched by name and category) and nothing
else.
"""
from django.db import migrations

# (name, contact_numbers, email, category) in the order the app shows them
CONTACTS = [
    ("Mauban MDRRMO / Rescue 24/7", "0998-598-8422 / (042) 784-0123", "", "rescue"),
    ("Mauban Municipal Police (PNP)", "0998-598-5777 / (042) 784-0200", "", "police"),
    ("Coast Guard Sub-Station Mauban", "0917-842-7643", "", "coast_guard"),
    ("Mauban Tourism Information Desk", "(042) 784-0555", "tourism@mauban.gov.ph", "desk"),
]
# gaps between the orders, so a contact can be put between two later
FIRST_ORDER = 10
STEP = 10


def add_contacts(apps, schema_editor):
    EmergencyContact = apps.get_model("api", "EmergencyContact")
    alias = schema_editor.connection.alias if schema_editor else "default"
    rows = EmergencyContact.objects.using(alias)

    for index, (name, numbers, email, category) in enumerate(CONTACTS):
        if rows.filter(name=name).exists():
            continue
        rows.create(
            name=name,
            contact_numbers=numbers,
            email=email,
            category=category,
            display_order=FIRST_ORDER + index * STEP,
        )


def remove_contacts(apps, schema_editor):
    EmergencyContact = apps.get_model("api", "EmergencyContact")
    alias = schema_editor.connection.alias if schema_editor else "default"
    rows = EmergencyContact.objects.using(alias)

    for name, _numbers, _email, category in CONTACTS:
        rows.filter(name=name, category=category).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0053_emergency_contact"),
    ]

    operations = [
        migrations.RunPython(add_contacts, remove_contacts),
    ]
