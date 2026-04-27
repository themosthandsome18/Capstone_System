from django.core.exceptions import ValidationError
from django.db import models


TOURIST_RECORD_COUNT_FIELDS = [
    "foreigner_count",
    "filipino_count",
    "maubanin_count",
    "total_visitors",
    "total_male",
    "total_female",
    "special_group_count",
    "age_0_7",
    "age_8_59",
    "age_60_above",
]

TOURIST_RECORD_REQUIRED_FIELDS = [
    "full_name",
    "contact_number",
    "arrival_date",
    "country",
    "region",
    "province",
    "itinerary",
    "resort",
    "travel_mode",
    "boat_type",
    "visit_purpose",
]

BOOKING_STATUS_PENDING = "pending"
BOOKING_STATUS_ARRIVED = "arrived"
BOOKING_STATUS_NO_SHOW = "no_show"

BOOKING_STATUS_CHOICES = [
    (BOOKING_STATUS_PENDING, "Pending"),
    (BOOKING_STATUS_ARRIVED, "Arrived"),
    (BOOKING_STATUS_NO_SHOW, "No-show"),
]


def validate_tourist_record_values(values):
    errors = {}

    def add_error(field, message):
        errors.setdefault(field, []).append(message)

    for field in TOURIST_RECORD_REQUIRED_FIELDS:
        value = values.get(field)
        if value in (None, "", 0) or (
            isinstance(value, str) and not value.strip()
        ):
            add_error(field, "This field is required.")

    counts = {}
    for field in TOURIST_RECORD_COUNT_FIELDS:
        value = values.get(field, 0)
        if value in (None, ""):
            value = 0

        try:
            value = int(value)
        except (TypeError, ValueError):
            add_error(field, "Must be a whole number.")
            value = 0

        if value < 0:
            add_error(field, "Cannot be negative.")

        counts[field] = value

    total_visitors = counts["total_visitors"]
    visitor_classification_total = (
        counts["foreigner_count"]
        + counts["filipino_count"]
        + counts["maubanin_count"]
    )
    gender_total = counts["total_male"] + counts["total_female"]
    age_total = counts["age_0_7"] + counts["age_8_59"] + counts["age_60_above"]

    if total_visitors != visitor_classification_total:
        add_error(
            "total_visitors",
            "Must equal foreigner_count + filipino_count + maubanin_count.",
        )

    if total_visitors != gender_total:
        add_error("total_visitors", "Must equal total_male + total_female.")

    if total_visitors != age_total:
        add_error(
            "total_visitors",
            "Must equal age_0_7 + age_8_59 + age_60_above.",
        )

    if counts["special_group_count"] > total_visitors:
        add_error(
            "special_group_count",
            "Cannot be greater than total_visitors.",
        )

    return errors


class NamedReference(models.Model):
    id = models.PositiveIntegerField(primary_key=True)
    name = models.CharField(max_length=120)

    class Meta:
        abstract = True
        ordering = ["id"]

    def __str__(self):
        return self.name


class Country(NamedReference):
    type = models.CharField(max_length=20, default="local")

    class Meta(NamedReference.Meta):
        verbose_name_plural = "countries"


class Region(NamedReference):
    pass


class Province(NamedReference):
    pass


class Itinerary(NamedReference):
    class Meta(NamedReference.Meta):
        verbose_name_plural = "itineraries"


class TravelMode(NamedReference):
    pass


class BoatType(NamedReference):
    pass


class VisitPurpose(NamedReference):
    pass


class Resort(models.Model):
    resort_id = models.PositiveIntegerField(primary_key=True)
    resort_name = models.CharField(max_length=160)
    with_mayors_permit = models.BooleanField(default=False)
    type = models.CharField(max_length=80)
    location = models.CharField(max_length=220)
    short_description = models.TextField()
    tourism_rating = models.FloatField(default=0)
    access = models.CharField(max_length=80)
    itinerary_ids = models.JSONField(default=list)
    image_key = models.CharField(max_length=80, blank=True)
    monthly_arrivals = models.PositiveIntegerField(default=0)
    latitude = models.FloatField()
    longitude = models.FloatField()

    class Meta:
        ordering = ["resort_id"]

    def __str__(self):
        return self.resort_name


class FeedbackEntry(models.Model):
    STATUS_POSITIVE = "positive"
    STATUS_NEUTRAL = "neutral"
    STATUS_NEGATIVE = "negative"

    STATUS_CHOICES = [
        (STATUS_POSITIVE, "Positive"),
        (STATUS_NEUTRAL, "Neutral"),
        (STATUS_NEGATIVE, "Negative"),
    ]

    destination = models.ForeignKey(
        Resort,
        on_delete=models.CASCADE,
        related_name="feedback_entries",
    )
    reviewer = models.CharField(max_length=120)
    rating = models.PositiveSmallIntegerField(default=5)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_POSITIVE,
    )
    date = models.DateField()
    title = models.CharField(max_length=160)
    message = models.TextField()
    reply = models.TextField(blank=True)

    class Meta:
        ordering = ["-date", "id"]

    def __str__(self):
        return f"{self.reviewer} - {self.destination}"


class TourismSettings(models.Model):
    municipality_name = models.CharField(max_length=120, default="Municipality of Mauban")
    province = models.CharField(max_length=120, default="Quezon")
    tourism_office_contact = models.CharField(max_length=80, default="+63 42 XXX XXXX")
    tourism_office_email = models.EmailField(default="tourism@mauban.gov.ph")
    api_base_url = models.URLField(default="https://api.mauban-tourism.gov.ph/v1")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "tourism settings"

    def __str__(self):
        return self.municipality_name


class TouristStat(models.Model):
    total_arrivals = models.IntegerField()
    monthly_visits = models.IntegerField()
    top_destinations = models.IntegerField()
    satisfaction = models.FloatField()


class TouristRecord(models.Model):
    survey_id = models.CharField(max_length=30, primary_key=True)
    email = models.EmailField(blank=True)
    full_name = models.CharField(max_length=120)
    contact_number = models.CharField(max_length=40, blank=True)
    country = models.ForeignKey(
        Country,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    province = models.ForeignKey(
        Province,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    foreigner_count = models.PositiveIntegerField(default=0)
    filipino_count = models.PositiveIntegerField(default=0)
    maubanin_count = models.PositiveIntegerField(default=0)
    total_visitors = models.PositiveIntegerField(default=0)
    total_male = models.PositiveIntegerField(default=0)
    total_female = models.PositiveIntegerField(default=0)
    special_group_count = models.PositiveIntegerField(default=0)
    age_0_7 = models.PositiveIntegerField(default=0)
    age_8_59 = models.PositiveIntegerField(default=0)
    age_60_above = models.PositiveIntegerField(default=0)
    arrival_date = models.DateField()
    itinerary = models.ForeignKey(
        Itinerary,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    resort = models.ForeignKey(
        Resort,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    travel_mode = models.ForeignKey(
        TravelMode,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    boat_type = models.ForeignKey(
        BoatType,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    visit_purpose = models.ForeignKey(
        VisitPurpose,
        on_delete=models.PROTECT,
        related_name="tourist_records",
    )
    status = models.CharField(
        max_length=20,
        choices=BOOKING_STATUS_CHOICES,
        default=BOOKING_STATUS_PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-arrival_date", "survey_id"]

    def __str__(self):
        return f"{self.survey_id} - {self.full_name}"

    def clean(self):
        values = {
            "full_name": self.full_name,
            "contact_number": self.contact_number,
            "arrival_date": self.arrival_date,
            "country": self.country_id,
            "region": self.region_id,
            "province": self.province_id,
            "itinerary": self.itinerary_id,
            "resort": self.resort_id,
            "travel_mode": self.travel_mode_id,
            "boat_type": self.boat_type_id,
            "visit_purpose": self.visit_purpose_id,
        }

        for field in TOURIST_RECORD_COUNT_FIELDS:
            values[field] = getattr(self, field)

        errors = validate_tourist_record_values(values)
        if errors:
            raise ValidationError(errors)
