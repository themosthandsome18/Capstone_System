# Merge migration: joins the independent household front-photo branch
# (0063_household_front_photo) with the main graph leaf. No schema operations.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0063_household_front_photo'),
        ('api', '0068_tourist_record_checked_in_by'),
    ]

    operations = []
