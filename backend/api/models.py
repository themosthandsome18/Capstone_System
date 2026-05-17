from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


ROLE_ADMIN = "admin"
ROLE_TOURISM = "tourism"
ROLE_SANITATION = "sanitation"

USER_ROLE_CHOICES = [
    (ROLE_ADMIN, "System Admin"),
    (ROLE_TOURISM, "Tourism Office"),
    (ROLE_SANITATION, "Sanitary Section"),
]

MODULE_TOURISM = "tourism"
MODULE_SANITATION = "sanitation"

MODULE_CHOICES = [
    (MODULE_TOURISM, "Tourism"),
    (MODULE_SANITATION, "Sanitation"),
]

ACTION_CREATE = "create"
ACTION_UPDATE = "update"
ACTION_DELETE = "delete"

ACTIVITY_ACTION_CHOICES = [
    (ACTION_CREATE, "Create"),
    (ACTION_UPDATE, "Update"),
    (ACTION_DELETE, "Delete"),
]


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(
        max_length=20,
        choices=USER_ROLE_CHOICES,
        default=ROLE_TOURISM,
    )

    class Meta:
        ordering = ["user__username"]

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"


class ActivityLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activity_logs",
    )
    module = models.CharField(max_length=20, choices=MODULE_CHOICES)
    action = models.CharField(max_length=20, choices=ACTIVITY_ACTION_CHOICES)
    record_type = models.CharField(max_length=80)
    record_id = models.CharField(max_length=80, blank=True)
    record_label = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        actor = self.user.username if self.user_id else "Deleted user"
        return f"{actor} {self.action} {self.record_label}"


# Tourism models
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
    code = models.CharField(max_length=10, blank=True)


class Province(NamedReference):
    region = models.ForeignKey(
        Region,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="provinces",
    )
    code = models.CharField(max_length=10, blank=True)


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


class TouristStat(models.Model):
    total_arrivals = models.IntegerField()
    monthly_visits = models.IntegerField()
    top_destinations = models.IntegerField()
    satisfaction = models.FloatField()


class TouristRecord(models.Model):
    survey_id = models.CharField(max_length=30, primary_key=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    email = models.EmailField(blank=True)
    consent_confirmed = models.BooleanField(default=True)
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
    country_of_origin = models.CharField(max_length=120, blank=True)
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
    boat_capacity_fare = models.CharField(max_length=160, blank=True)
    parking_space = models.CharField(max_length=220, blank=True)
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


class ResortMonthlyArrival(models.Model):
    resort = models.ForeignKey(
        Resort,
        on_delete=models.CASCADE,
        related_name="historical_monthly_arrivals",
    )
    year = models.PositiveIntegerField(default=2025)
    month = models.PositiveIntegerField()
    total_arrivals = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("resort", "year", "month")
        ordering = ["year", "month", "resort__resort_name"]

    def __str__(self):
        return (
            f"{self.resort.resort_name} - "
            f"{self.month}/{self.year}: {self.total_arrivals}"
        )


# ============================================================
# SANITATION MODULE MODELS
# Business / Permit Side
# ============================================================

SANITARY_PERMIT_SIZE_SP = "sp"
SANITARY_PERMIT_SIZE_LARGE = "large"

SANITARY_PERMIT_SIZE_CHOICES = [
    (SANITARY_PERMIT_SIZE_SP, "SP"),
    (SANITARY_PERMIT_SIZE_LARGE, "Large"),
]

SANITARY_FREQUENCY_MONTHLY = "monthly"
SANITARY_FREQUENCY_QUARTERLY = "quarterly"

SANITARY_FREQUENCY_CHOICES = [
    (SANITARY_FREQUENCY_MONTHLY, "Monthly"),
    (SANITARY_FREQUENCY_QUARTERLY, "Quarterly"),
]

SANITARY_STATUS_GOOD = "good_standing"
SANITARY_STATUS_UPCOMING = "upcoming"
SANITARY_STATUS_FOR_COMPLETION = "for_completion"
SANITARY_STATUS_VIOLATION = "violation"
SANITARY_STATUS_NO_PERMIT = "no_permit"

SANITARY_STATUS_CHOICES = [
    (SANITARY_STATUS_GOOD, "Good Standing"),
    (SANITARY_STATUS_UPCOMING, "Upcoming"),
    (SANITARY_STATUS_FOR_COMPLETION, "For Completion"),
    (SANITARY_STATUS_VIOLATION, "Violation"),
    (SANITARY_STATUS_NO_PERMIT, "No Permit"),
]

PERMIT_STATUS_ACTIVE = "active"
PERMIT_STATUS_RENEWAL_DUE = "renewal_due"
PERMIT_STATUS_CONDITIONAL = "conditional"
PERMIT_STATUS_SUSPENDED = "suspended"
PERMIT_STATUS_NO_PERMIT = "no_permit"

PERMIT_STATUS_CHOICES = [
    (PERMIT_STATUS_ACTIVE, "Active"),
    (PERMIT_STATUS_RENEWAL_DUE, "Active - Renewal Due"),
    (PERMIT_STATUS_CONDITIONAL, "Conditional"),
    (PERMIT_STATUS_SUSPENDED, "Suspended"),
    (PERMIT_STATUS_NO_PERMIT, "No Permit"),
]


class SanitaryBusinessType(models.Model):
    name = models.CharField(max_length=160, unique=True)
    inspection_frequency = models.CharField(
        max_length=20,
        choices=SANITARY_FREQUENCY_CHOICES,
        default=SANITARY_FREQUENCY_MONTHLY,
    )
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class SanitaryRequirement(models.Model):
    business_type = models.ForeignKey(
        SanitaryBusinessType,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    permit_size = models.CharField(
        max_length=20,
        choices=SANITARY_PERMIT_SIZE_CHOICES,
    )
    requirement_name = models.CharField(max_length=180)
    is_required = models.BooleanField(default=True)

    class Meta:
        ordering = ["business_type__name", "permit_size", "requirement_name"]
        unique_together = ("business_type", "permit_size", "requirement_name")

    def __str__(self):
        return (
            f"{self.business_type} - "
            f"{self.get_permit_size_display()} - "
            f"{self.requirement_name}"
        )


class SanitaryEstablishment(models.Model):
    business_name = models.CharField(max_length=180)
    owner_name = models.CharField(max_length=160)
    business_type = models.ForeignKey(
        SanitaryBusinessType,
        on_delete=models.PROTECT,
        related_name="establishments",
    )
    permit_size = models.CharField(
        max_length=20,
        choices=SANITARY_PERMIT_SIZE_CHOICES,
        default=SANITARY_PERMIT_SIZE_SP,
    )
    barangay = models.CharField(max_length=120)
    address = models.CharField(max_length=240)
    contact_number = models.CharField(max_length=60, blank=True)

    has_permit = models.BooleanField(default=True)
    permit_number = models.CharField(max_length=80, blank=True)
    permit_issued_date = models.DateField(null=True, blank=True)
    permit_expiry_date = models.DateField(null=True, blank=True)

    compliance_status = models.CharField(
        max_length=30,
        choices=SANITARY_STATUS_CHOICES,
        default=SANITARY_STATUS_GOOD,
    )
    permit_status = models.CharField(
        max_length=30,
        choices=PERMIT_STATUS_CHOICES,
        default=PERMIT_STATUS_ACTIVE,
    )

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["business_name"]

    def __str__(self):
        return self.business_name

    @property
    def inspection_frequency(self):
        return self.business_type.inspection_frequency


class SanitaryInspection(models.Model):
    establishment = models.ForeignKey(
        SanitaryEstablishment,
        on_delete=models.CASCADE,
        related_name="inspections",
    )
    inspector_name = models.CharField(max_length=160)
    inspection_date = models.DateField()
    next_due_date = models.DateField(null=True, blank=True)

    findings = models.TextField(blank=True)
    remarks = models.TextField(blank=True)

    status_after_inspection = models.CharField(
        max_length=30,
        choices=SANITARY_STATUS_CHOICES,
        default=SANITARY_STATUS_GOOD,
    )

    photo_documentation = models.CharField(max_length=255, blank=True)
    is_draft = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-inspection_date", "establishment__business_name"]

    def __str__(self):
        return f"{self.establishment.business_name} - {self.inspection_date}"


class SanitaryInspectionChecklistItem(models.Model):
    inspection = models.ForeignKey(
        SanitaryInspection,
        on_delete=models.CASCADE,
        related_name="checklist_items",
    )
    requirement_name = models.CharField(max_length=180)
    is_complied = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["requirement_name"]

    def __str__(self):
        return f"{self.inspection} - {self.requirement_name}"


# ============================================================
# HOUSEHOLD SANITATION MODULE MODELS
# ============================================================

HOUSEHOLD_WATER_LEVEL_1 = "level_1"
HOUSEHOLD_WATER_LEVEL_2 = "level_2"
HOUSEHOLD_WATER_LEVEL_3 = "level_3"

HOUSEHOLD_WATER_LEVEL_CHOICES = [
    (HOUSEHOLD_WATER_LEVEL_1, "Level I"),
    (HOUSEHOLD_WATER_LEVEL_2, "Level II"),
    (HOUSEHOLD_WATER_LEVEL_3, "Level III"),
]

HOUSEHOLD_TOILET_WATER_SEALED = "water_sealed"
HOUSEHOLD_TOILET_POUR_FLUSH = "pour_flush"
HOUSEHOLD_TOILET_PIT_LATRINE = "pit_latrine"
HOUSEHOLD_TOILET_NONE = "none"

HOUSEHOLD_TOILET_CHOICES = [
    (HOUSEHOLD_TOILET_WATER_SEALED, "Water-Sealed"),
    (HOUSEHOLD_TOILET_POUR_FLUSH, "Pour-Flush"),
    (HOUSEHOLD_TOILET_PIT_LATRINE, "Pit Latrine"),
    (HOUSEHOLD_TOILET_NONE, "None"),
]

HOUSEHOLD_WASTE_COLLECTED = "collected"
HOUSEHOLD_WASTE_COMPOSTED = "composted"
HOUSEHOLD_WASTE_BURNED = "burned"
HOUSEHOLD_WASTE_DUMPED = "dumped"

HOUSEHOLD_WASTE_CHOICES = [
    (HOUSEHOLD_WASTE_COLLECTED, "Collected by LGU"),
    (HOUSEHOLD_WASTE_COMPOSTED, "Composted"),
    (HOUSEHOLD_WASTE_BURNED, "Burned"),
    (HOUSEHOLD_WASTE_DUMPED, "Dumped"),
]

HOUSEHOLD_STATUS_GOOD = "good_standing"
HOUSEHOLD_STATUS_FOR_COMPLETION = "for_completion"
HOUSEHOLD_STATUS_VIOLATION = "violation"

HOUSEHOLD_STATUS_CHOICES = [
    (HOUSEHOLD_STATUS_GOOD, "Good Standing"),
    (HOUSEHOLD_STATUS_FOR_COMPLETION, "For Completion"),
    (HOUSEHOLD_STATUS_VIOLATION, "Violation"),
]


class HouseholdSanitationRecord(models.Model):
    household_code = models.CharField(max_length=30, unique=True)
    household_head = models.CharField(max_length=160)
    barangay = models.CharField(max_length=120)
    address = models.CharField(max_length=240, blank=True)

    male_count = models.PositiveIntegerField(default=0)
    female_count = models.PositiveIntegerField(default=0)

    toilet_type = models.CharField(
        max_length=30,
        choices=HOUSEHOLD_TOILET_CHOICES,
        default=HOUSEHOLD_TOILET_WATER_SEALED,
    )
    water_level = models.CharField(
        max_length=30,
        choices=HOUSEHOLD_WATER_LEVEL_CHOICES,
        default=HOUSEHOLD_WATER_LEVEL_3,
    )
    water_source = models.CharField(max_length=120, blank=True)

    waste_disposal = models.CharField(
        max_length=30,
        choices=HOUSEHOLD_WASTE_CHOICES,
        default=HOUSEHOLD_WASTE_COLLECTED,
    )

    status = models.CharField(
        max_length=30,
        choices=HOUSEHOLD_STATUS_CHOICES,
        default=HOUSEHOLD_STATUS_GOOD,
    )

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    remarks = models.TextField(blank=True)
    last_survey_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["barangay", "household_head"]

    def __str__(self):
        return f"{self.household_code} - {self.household_head}"

    @property
    def total_members(self):
        return self.male_count + self.female_count
