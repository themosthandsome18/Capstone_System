from rest_framework import serializers
from django.contrib.auth.models import User

from .models import (
    ActivityLog,
    Barangay,
    BoatType,
    Country,
    FeedbackEntry,
    Itinerary,
    Province,
    Region,
    Resort,
    TouristRecord,
    TravelMode,
    VisitPurpose,
    TOURIST_RECORD_COUNT_FIELDS,
    TOURIST_RECORD_REQUIRED_FIELDS,
    validate_tourist_record_values,
    SanitaryBusinessType,
    SanitaryRequirement,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryInspectionChecklistItem,
    SanitaryPermitRenewal,
    SanitaryComplaint,
    HouseholdSanitationRecord,
    UserProfile,
)


RELATED_FIELD_API_NAMES = {
    "country": "country_id",
    "region": "region_id",
    "province": "province_id",
    "itinerary": "itinerary_id",
    "resort": "resort_id",
    "travel_mode": "travel_mode_id",
    "boat_type": "boat_type_id",
    "visit_purpose": "visit_purpose_id",
}


class UserProfileSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = UserProfile
        fields = ["role", "role_label"]


class AuthUserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "is_superuser",
            "profile",
        ]

    def get_display_name(self, obj):
        return obj.get_full_name() or obj.username


class ActivityLogSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(source="get_action_display", read_only=True)
    module_label = serializers.CharField(source="get_module_display", read_only=True)
    user_display = serializers.SerializerMethodField()
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "username",
            "user_display",
            "module",
            "module_label",
            "action",
            "action_label",
            "record_type",
            "record_id",
            "record_label",
            "created_at",
        ]

    def get_user_display(self, obj):
        if not obj.user_id:
            return "Deleted user"

        return obj.user.get_full_name() or obj.user.username


class BarangaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Barangay
        fields = [
            "id",
            "name",
            "municipality",
            "province",
            "display_order",
            "is_active",
        ]


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ["id", "name", "type"]


class NamedReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ["id", "name"]


class RegionSerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = Region
        fields = ["id", "name", "code"]


class ProvinceSerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = Province
        fields = ["id", "name", "region_id", "code"]


class ItinerarySerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = Itinerary


class TravelModeSerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = TravelMode


class BoatTypeSerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = BoatType


class VisitPurposeSerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = VisitPurpose


class ResortSerializer(serializers.ModelSerializer):
    coordinates = serializers.SerializerMethodField()
    resort_name = serializers.SerializerMethodField()
    monthly_arrivals = serializers.SerializerMethodField()

    class Meta:
        model = Resort
        fields = [
            "resort_id",
            "resort_name",
            "with_mayors_permit",
            "type",
            "location",
            "short_description",
            "tourism_rating",
            "access",
            "itinerary_ids",
            "image_key",
            "monthly_arrivals",
            "latitude",
            "longitude",
            "coordinates",
        ]

    def get_coordinates(self, obj):
        return {
            "lat": obj.latitude,
            "lng": obj.longitude,
        }

    def get_resort_name(self, obj):
        return clean_resort_display_name(obj.resort_name)

    def get_monthly_arrivals(self, obj):
        return getattr(obj, "visitor_total", obj.monthly_arrivals) or 0


def clean_resort_display_name(name):
    cleaned = " ".join(str(name or "").split()).strip(" -/")
    while cleaned.endswith("(") or cleaned.endswith("["):
        cleaned = cleaned[:-1].rstrip()
    return cleaned or "Unnamed Destination"


class FeedbackEntrySerializer(serializers.ModelSerializer):
    destinationId = serializers.PrimaryKeyRelatedField(
        source="destination",
        queryset=Resort.objects.all(),
    )

    class Meta:
        model = FeedbackEntry
        fields = [
            "id",
            "destinationId",
            "reviewer",
            "rating",
            "status",
            "date",
            "title",
            "message",
            "reply",
        ]


class TouristRecordSerializer(serializers.ModelSerializer):
    survey_id = serializers.CharField(max_length=30, required=False)
    country_id = serializers.PrimaryKeyRelatedField(
        source="country",
        queryset=Country.objects.all(),
    )
    region_id = serializers.PrimaryKeyRelatedField(
        source="region",
        queryset=Region.objects.all(),
    )
    province_id = serializers.PrimaryKeyRelatedField(
        source="province",
        queryset=Province.objects.all(),
    )
    itinerary_id = serializers.PrimaryKeyRelatedField(
        source="itinerary",
        queryset=Itinerary.objects.all(),
    )
    resort_id = serializers.PrimaryKeyRelatedField(
        source="resort",
        queryset=Resort.objects.all(),
    )
    travel_mode_id = serializers.PrimaryKeyRelatedField(
        source="travel_mode",
        queryset=TravelMode.objects.all(),
    )
    boat_type_id = serializers.PrimaryKeyRelatedField(
        source="boat_type",
        queryset=BoatType.objects.all(),
    )
    visit_purpose_id = serializers.PrimaryKeyRelatedField(
        source="visit_purpose",
        queryset=VisitPurpose.objects.all(),
    )

    class Meta:
        model = TouristRecord
        fields = [
            "survey_id",
            "submitted_at",
            "email",
            "consent_confirmed",
            "full_name",
            "contact_number",
            "country_id",
            "region_id",
            "province_id",
            "country_of_origin",
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
            "arrival_date",
            "itinerary_id",
            "resort_id",
            "travel_mode_id",
            "boat_type_id",
            "boat_capacity_fare",
            "parking_space",
            "visit_purpose_id",
            "status",
        ]

    def validate(self, attrs):
        if self.instance:
            attrs["survey_id"] = self.instance.survey_id

        if not self.instance and not attrs.get("total_visitors"):
            attrs["total_visitors"] = (
                attrs.get("foreigner_count", 0)
                + attrs.get("filipino_count", 0)
                + attrs.get("maubanin_count", 0)
            )

        values = self._merged_validation_values(attrs)
        errors = validate_tourist_record_values(values)
        if errors:
            raise serializers.ValidationError(self._api_error_keys(errors))

        return attrs

    def _merged_validation_values(self, attrs):
        values = {}

        for field in TOURIST_RECORD_REQUIRED_FIELDS:
            if field in RELATED_FIELD_API_NAMES:
                if field in attrs:
                    values[field] = attrs[field]
                elif self.instance:
                    values[field] = getattr(self.instance, f"{field}_id")
                else:
                    values[field] = None
            elif field in attrs:
                values[field] = attrs[field]
            elif self.instance:
                values[field] = getattr(self.instance, field)
            else:
                values[field] = None

        for field in TOURIST_RECORD_COUNT_FIELDS:
            if field in attrs:
                values[field] = attrs[field]
            elif self.instance:
                values[field] = getattr(self.instance, field)
            else:
                values[field] = 0

        return values

    def _api_error_keys(self, errors):
        return {
            RELATED_FIELD_API_NAMES.get(field, field): messages
            for field, messages in errors.items()
        }


# ============================================================
# SANITATION MODULE SERIALIZERS
# Business / Permit Side
# ============================================================


class SanitaryRequirementSerializer(serializers.ModelSerializer):
    business_type_name = serializers.CharField(
        source="business_type.name",
        read_only=True,
    )

    class Meta:
        model = SanitaryRequirement
        fields = [
            "id",
            "business_type",
            "business_type_name",
            "permit_size",
            "requirement_name",
            "is_required",
        ]


class SanitaryBusinessTypeSerializer(serializers.ModelSerializer):
    requirements = SanitaryRequirementSerializer(many=True, read_only=True)

    class Meta:
        model = SanitaryBusinessType
        fields = [
            "id",
            "name",
            "inspection_frequency",
            "description",
            "requirements",
        ]


class SanitaryEstablishmentSerializer(serializers.ModelSerializer):
    business_type_name = serializers.CharField(
        source="business_type.name",
        read_only=True,
    )
    inspection_frequency = serializers.CharField(read_only=True)
    compliance_status_label = serializers.CharField(
        source="get_compliance_status_display",
        read_only=True,
    )
    permit_status_label = serializers.CharField(
        source="get_permit_status_display",
        read_only=True,
    )
    permit_size_label = serializers.CharField(
        source="get_permit_size_display",
        read_only=True,
    )
    coordinates = serializers.SerializerMethodField()
    risk_score = serializers.SerializerMethodField()
    risk_level = serializers.SerializerMethodField()
    open_complaints = serializers.SerializerMethodField()

    class Meta:
        model = SanitaryEstablishment
        fields = [
            "id",
            "business_name",
            "owner_name",
            "business_type",
            "business_type_name",
            "inspection_frequency",
            "permit_size",
            "permit_size_label",
            "barangay",
            "address",
            "contact_number",
            "has_permit",
            "permit_number",
            "permit_issued_date",
            "permit_expiry_date",
            "compliance_status",
            "compliance_status_label",
            "permit_status",
            "permit_status_label",
            "latitude",
            "longitude",
            "coordinates",
            "risk_score",
            "risk_level",
            "open_complaints",
            "remarks",
            "created_at",
            "updated_at",
        ]

    def get_coordinates(self, obj):
        return {
            "lat": obj.latitude,
            "lng": obj.longitude,
        }

    def get_open_complaints(self, obj):
        cached_count = getattr(obj, "_serializer_open_complaints_count", None)
        if cached_count is not None:
            return cached_count

        annotated_count = getattr(obj, "open_complaints_count", None)
        if annotated_count is not None:
            count = annotated_count
        else:
            prefetched_complaints = getattr(obj, "_prefetched_objects_cache", {}).get(
                "complaints"
            )
            if prefetched_complaints is not None:
                count = sum(
                    1
                    for complaint in prefetched_complaints
                    if complaint.status not in ["resolved", "rejected"]
                )
            else:
                count = obj.complaints.exclude(
                    status__in=["resolved", "rejected"]
                ).count()

        obj._serializer_open_complaints_count = count
        return count

    def get_risk_score(self, obj):
        score = 0

        if obj.compliance_status == "violation":
            score += 40
        elif obj.compliance_status == "for_completion":
            score += 25
        elif obj.compliance_status == "upcoming":
            score += 10

        if obj.permit_status in ["suspended", "no_permit"]:
            score += 30
        elif obj.permit_status == "renewal_due":
            score += 15

        if not obj.has_permit:
            score += 25

        score += min(self.get_open_complaints(obj) * 15, 45)
        return min(score, 100)

    def get_risk_level(self, obj):
        score = self.get_risk_score(obj)

        if score >= 70:
            return "High Risk"
        if score >= 35:
            return "Medium Risk"
        return "Low Risk"


class SanitaryInspectionChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SanitaryInspectionChecklistItem
        fields = [
            "id",
            "requirement_name",
            "is_complied",
            "notes",
        ]


class SanitaryInspectionSerializer(serializers.ModelSerializer):
    establishment_name = serializers.CharField(
        source="establishment.business_name",
        read_only=True,
    )
    establishment_address = serializers.CharField(
        source="establishment.address",
        read_only=True,
    )
    business_type_name = serializers.CharField(
        source="establishment.business_type.name",
        read_only=True,
    )
    permit_size = serializers.CharField(
        source="establishment.permit_size",
        read_only=True,
    )
    barangay = serializers.CharField(
        source="establishment.barangay",
        read_only=True,
    )
    status_after_inspection_label = serializers.CharField(
        source="get_status_after_inspection_display",
        read_only=True,
    )
    checklist_items = SanitaryInspectionChecklistItemSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = SanitaryInspection
        fields = [
            "id",
            "establishment",
            "establishment_name",
            "establishment_address",
            "business_type_name",
            "permit_size",
            "barangay",
            "inspector_name",
            "inspection_date",
            "next_due_date",
            "findings",
            "remarks",
            "status_after_inspection",
            "status_after_inspection_label",
            "photo_documentation",
            "is_draft",
            "checklist_items",
            "created_at",
            "updated_at",
        ]


class SanitaryPermitRenewalSerializer(serializers.ModelSerializer):
    establishment_name = serializers.CharField(
        source="establishment.business_name",
        read_only=True,
    )
    owner_name = serializers.CharField(
        source="establishment.owner_name",
        read_only=True,
    )
    business_type_name = serializers.CharField(
        source="establishment.business_type.name",
        read_only=True,
    )
    barangay = serializers.CharField(source="establishment.barangay", read_only=True)
    stage_label = serializers.CharField(source="get_stage_display", read_only=True)
    payment_status_label = serializers.CharField(
        source="get_payment_status_display",
        read_only=True,
    )

    class Meta:
        model = SanitaryPermitRenewal
        fields = [
            "id",
            "renewal_id",
            "establishment",
            "establishment_name",
            "owner_name",
            "business_type_name",
            "barangay",
            "permit_number",
            "permit_type",
            "expiration_date",
            "stage",
            "stage_label",
            "progress",
            "renewal_fee",
            "payment_status",
            "payment_status_label",
            "submitted_requirements",
            "inspection_status",
            "photo_documentation",
            "remarks",
            "released_at",
            "created_at",
            "updated_at",
        ]


class SanitaryComplaintSerializer(serializers.ModelSerializer):
    establishment_name = serializers.CharField(
        source="establishment.business_name",
        read_only=True,
    )
    business_type_name = serializers.CharField(
        source="establishment.business_type.name",
        read_only=True,
    )
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    priority_label = serializers.CharField(
        source="get_priority_display",
        read_only=True,
    )

    class Meta:
        model = SanitaryComplaint
        fields = [
            "id",
            "complaint_id",
            "establishment",
            "establishment_name",
            "business_type_name",
            "complainant_name",
            "contact_number",
            "category",
            "barangay",
            "reported_date",
            "status",
            "status_label",
            "priority",
            "priority_label",
            "description",
            "photo_documentation",
            "latitude",
            "longitude",
            "assigned_inspector",
            "inspection_scheduled_date",
            "inspection_scheduled_time",
            "inspection_schedule_note",
            "inspection_notify_reporter",
            "action_taken",
            "resolved_date",
            "created_at",
            "updated_at",
        ]


class SanitaryInspectionCreateSerializer(serializers.ModelSerializer):
    checklist_items = SanitaryInspectionChecklistItemSerializer(
        many=True,
        required=False,
    )

    class Meta:
        model = SanitaryInspection
        fields = [
            "id",
            "establishment",
            "inspector_name",
            "inspection_date",
            "next_due_date",
            "findings",
            "remarks",
            "status_after_inspection",
            "photo_documentation",
            "is_draft",
            "checklist_items",
        ]

    def create(self, validated_data):
        checklist_items = validated_data.pop("checklist_items", [])
        inspection = SanitaryInspection.objects.create(**validated_data)

        for item in checklist_items:
            SanitaryInspectionChecklistItem.objects.create(
                inspection=inspection,
                **item,
            )

        return inspection

    def update(self, instance, validated_data):
        checklist_items = validated_data.pop("checklist_items", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.save()

        if checklist_items is not None:
            instance.checklist_items.all().delete()

            for item in checklist_items:
                SanitaryInspectionChecklistItem.objects.create(
                    inspection=instance,
                    **item,
                )

        return instance


# ============================================================
# HOUSEHOLD SANITATION SERIALIZER
# ============================================================


class HouseholdSanitationRecordSerializer(serializers.ModelSerializer):
    toilet_type_label = serializers.CharField(
        source="get_toilet_type_display",
        read_only=True,
    )
    water_level_label = serializers.CharField(
        source="get_water_level_display",
        read_only=True,
    )
    waste_disposal_label = serializers.CharField(
        source="get_waste_disposal_display",
        read_only=True,
    )
    status_label = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    total_members = serializers.IntegerField(read_only=True)
    coordinates = serializers.SerializerMethodField()
    risk_score = serializers.SerializerMethodField()
    risk_level = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdSanitationRecord
        fields = [
            "id",
            "household_code",
            "household_head",
            "barangay",
            "address",
            "male_count",
            "female_count",
            "total_members",
            "toilet_type",
            "toilet_type_label",
            "water_level",
            "water_level_label",
            "water_source",
            "waste_disposal",
            "waste_disposal_label",
            "status",
            "status_label",
            "latitude",
            "longitude",
            "coordinates",
            "risk_score",
            "risk_level",
            "remarks",
            "last_survey_date",
            "created_at",
            "updated_at",
        ]

    def get_coordinates(self, obj):
        return {
            "lat": obj.latitude,
            "lng": obj.longitude,
        }

    def get_risk_score(self, obj):
        score = 0

        if obj.status == "violation":
            score += 35
        elif obj.status == "for_completion":
            score += 20

        if obj.toilet_type == "none":
            score += 30
        elif obj.toilet_type == "pit_latrine":
            score += 15

        if obj.water_level == "level_1":
            score += 20

        if obj.waste_disposal in ["burned", "dumped"]:
            score += 20

        return min(score, 100)

    def get_risk_level(self, obj):
        score = self.get_risk_score(obj)

        if score >= 70:
            return "High Risk"
        if score >= 35:
            return "Medium Risk"
        return "Low Risk"
