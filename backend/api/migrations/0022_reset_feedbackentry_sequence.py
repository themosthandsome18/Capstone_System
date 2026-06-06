from django.db import migrations


def reset_feedbackentry_sequence(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    schema_editor.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('api_feedbackentry', 'id'),
            COALESCE((SELECT MAX(id) FROM api_feedbackentry), 1),
            (SELECT COUNT(*) FROM api_feedbackentry) > 0
        );
        """
    )


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0021_sanitarycomplaint_mobile_report_fields"),
    ]

    operations = [
        migrations.RunPython(
            reset_feedbackentry_sequence,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
