from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0021_sanitarycomplaint_mobile_report_fields"),
    ]

    operations = [
        migrations.RunSQL(
            """
            SELECT setval(
                pg_get_serial_sequence('api_feedbackentry', 'id'),
                COALESCE((SELECT MAX(id) FROM api_feedbackentry), 1),
                (SELECT COUNT(*) FROM api_feedbackentry) > 0
            );
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
