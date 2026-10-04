from django.db import migrations
from django.db.models import F
from django.db.models.functions import Least


def _age_only():
    # The suggestion 0048 backfilled.
    return F("age_0_7") + F("age_60_above")


def _with_special_needs():
    # The suggestion now: children, seniors and special needs, capped at the
    # number of people present (one person can be both a senior and special
    # needs, which would otherwise count them twice).
    return Least(
        F("age_0_7") + F("age_60_above") + F("special_group_count"),
        F("total_visitors"),
    )


def include_special_needs(apps, schema_editor):
    # Only records still holding the age-only suggestion; a count staff have
    # set by hand is left alone.
    TouristRecord = apps.get_model("api", "TouristRecord")
    TouristRecord.objects.filter(discounted_count=_age_only()).update(
        discounted_count=_with_special_needs()
    )


def back_to_age_only(apps, schema_editor):
    # Records holding the new suggestion go back to the age-only one. A count
    # staff set by hand that happens to equal the new suggestion cannot be told
    # apart and is reverted too.
    TouristRecord = apps.get_model("api", "TouristRecord")
    TouristRecord.objects.filter(discounted_count=_with_special_needs()).exclude(
        discounted_count=_age_only()
    ).update(discounted_count=_age_only())


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0048_touristrecord_discounted_count"),
    ]

    operations = [
        migrations.RunPython(include_special_needs, back_to_age_only),
    ]
