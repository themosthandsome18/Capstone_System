from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0020_sanitation_performance_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="sanitarycomplaint",
            name="photo_documentation",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="sanitarycomplaint",
            name="latitude",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="sanitarycomplaint",
            name="longitude",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
