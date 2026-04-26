from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TouristRecord",
            fields=[
                (
                    "survey_id",
                    models.CharField(max_length=30, primary_key=True, serialize=False),
                ),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("full_name", models.CharField(max_length=120)),
                ("contact_number", models.CharField(blank=True, max_length=40)),
                ("country_id", models.PositiveIntegerField(default=0)),
                ("region_id", models.PositiveIntegerField(default=0)),
                ("province_id", models.PositiveIntegerField(default=0)),
                ("foreigner_count", models.PositiveIntegerField(default=0)),
                ("filipino_count", models.PositiveIntegerField(default=0)),
                ("maubanin_count", models.PositiveIntegerField(default=0)),
                ("total_visitors", models.PositiveIntegerField(default=0)),
                ("total_male", models.PositiveIntegerField(default=0)),
                ("total_female", models.PositiveIntegerField(default=0)),
                ("special_group_count", models.PositiveIntegerField(default=0)),
                ("age_0_7", models.PositiveIntegerField(default=0)),
                ("age_8_59", models.PositiveIntegerField(default=0)),
                ("age_60_above", models.PositiveIntegerField(default=0)),
                ("arrival_date", models.DateField()),
                ("itinerary_id", models.PositiveIntegerField(default=0)),
                ("resort_id", models.PositiveIntegerField(default=0)),
                ("travel_mode_id", models.PositiveIntegerField(default=0)),
                ("boat_type_id", models.PositiveIntegerField(default=0)),
                ("visit_purpose_id", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-arrival_date", "survey_id"],
            },
        ),
    ]
