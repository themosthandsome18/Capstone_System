from django.conf import settings
from django.core.management import call_command
from django.db import migrations


def create_throttle_cache_table(apps, schema_editor):
    """Create the DatabaseCache table behind the "throttle" cache alias.

    Render's build command runs `migrate` but not build.sh, so the table the
    establishment-claim rate limit stores its counts in has to come from a
    migration. `createcachetable` is given this one table name only, so no
    other table is created, and it does nothing if the table already exists.
    No rows are read or written.
    """
    table = settings.CACHES["throttle"]["LOCATION"]
    call_command(
        "createcachetable",
        table,
        database=schema_editor.connection.alias,
        verbosity=0,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0036_set_client_inspection_frequencies"),
    ]

    operations = [
        # Reverse is a no-op: the cache table holds only short-lived counters.
        migrations.RunPython(create_throttle_cache_table, migrations.RunPython.noop),
    ]
