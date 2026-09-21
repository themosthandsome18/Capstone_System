from django.db import migrations


OLD_NAME = "Public Boat (P100/ride/head) Sabang Port Only"
NEW_NAME = "Public Boat"


def _rename(apps, source_name, target_name):
    """Rename the one BoatType row named exactly `source_name` to `target_name`.

    Only that row is touched (same id, so TouristRecords keep pointing at it).
    Skips with a warning if the target name is already taken, so no duplicate
    is ever created, and does nothing if the source row does not exist.
    """
    BoatType = apps.get_model("api", "BoatType")

    source_rows = list(BoatType.objects.filter(name=source_name))
    if not source_rows:
        return

    if BoatType.objects.filter(name=target_name).exists():
        print(
            f"\n  WARNING: BoatType named '{target_name}' already exists; "
            f"leaving '{source_name}' unchanged."
        )
        return

    if len(source_rows) > 1:
        print(
            f"\n  WARNING: {len(source_rows)} BoatType rows are named '{source_name}'; "
            "not renaming to avoid an ambiguous change."
        )
        return

    BoatType.objects.filter(pk=source_rows[0].pk).update(name=target_name)


def rename_public_boat_forward(apps, schema_editor):
    _rename(apps, OLD_NAME, NEW_NAME)


def rename_public_boat_reverse(apps, schema_editor):
    _rename(apps, NEW_NAME, OLD_NAME)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0032_alter_notification_target_role_and_more"),
    ]

    operations = [
        migrations.RunPython(rename_public_boat_forward, rename_public_boat_reverse),
    ]
