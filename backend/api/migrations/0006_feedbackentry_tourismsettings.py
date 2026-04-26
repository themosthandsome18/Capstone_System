import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_touristrecord_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="TourismSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "municipality_name",
                    models.CharField(default="Municipality of Mauban", max_length=120),
                ),
                ("province", models.CharField(default="Quezon", max_length=120)),
                (
                    "tourism_office_contact",
                    models.CharField(default="+63 42 XXX XXXX", max_length=80),
                ),
                (
                    "tourism_office_email",
                    models.EmailField(default="tourism@mauban.gov.ph", max_length=254),
                ),
                (
                    "api_base_url",
                    models.URLField(default="https://api.mauban-tourism.gov.ph/v1"),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name_plural": "tourism settings",
            },
        ),
        migrations.CreateModel(
            name="FeedbackEntry",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("reviewer", models.CharField(max_length=120)),
                ("rating", models.PositiveSmallIntegerField(default=5)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("positive", "Positive"),
                            ("neutral", "Neutral"),
                            ("negative", "Negative"),
                        ],
                        default="positive",
                        max_length=20,
                    ),
                ),
                ("date", models.DateField()),
                ("title", models.CharField(max_length=160)),
                ("message", models.TextField()),
                ("reply", models.TextField(blank=True)),
                (
                    "destination",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="feedback_entries",
                        to="api.resort",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "id"],
            },
        ),
    ]
