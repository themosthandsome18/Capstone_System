from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0056_seed_boat_capacity_fares")]

    operations = [
        migrations.AddField(
            model_name="householdsanitationrecord",
            name="house_number",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="householdsanitationrecord",
            name="sitio",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]
