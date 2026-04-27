from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_touristrecord"),
    ]

    operations = [
        migrations.CreateModel(
            name="BoatType",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
            ],
            options={
                "ordering": ["id"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="Country",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("type", models.CharField(default="local", max_length=20)),
            ],
            options={
                "verbose_name_plural": "countries",
                "ordering": ["id"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="Itinerary",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
            ],
            options={
                "verbose_name_plural": "itineraries",
                "ordering": ["id"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="Province",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
            ],
            options={
                "ordering": ["id"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="Region",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
            ],
            options={
                "ordering": ["id"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="Resort",
            fields=[
                (
                    "resort_id",
                    models.PositiveIntegerField(primary_key=True, serialize=False),
                ),
                ("resort_name", models.CharField(max_length=160)),
                ("with_mayors_permit", models.BooleanField(default=False)),
                ("type", models.CharField(max_length=80)),
                ("location", models.CharField(max_length=220)),
                ("short_description", models.TextField()),
                ("tourism_rating", models.FloatField(default=0)),
                ("access", models.CharField(max_length=80)),
                ("itinerary_ids", models.JSONField(default=list)),
                ("image_key", models.CharField(blank=True, max_length=80)),
                ("monthly_arrivals", models.PositiveIntegerField(default=0)),
                ("latitude", models.FloatField()),
                ("longitude", models.FloatField()),
            ],
            options={
                "ordering": ["resort_id"],
            },
        ),
        migrations.CreateModel(
            name="TravelMode",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
            ],
            options={
                "ordering": ["id"],
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="VisitPurpose",
            fields=[
                ("id", models.PositiveIntegerField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
            ],
            options={
                "ordering": ["id"],
                "abstract": False,
            },
        ),
    ]
