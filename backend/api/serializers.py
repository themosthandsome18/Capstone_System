from rest_framework import serializers

from .models import (
    BoatType,
    Country,
    FeedbackEntry,
    Itinerary,
    Province,
    Region,
    Resort,
    TourismSettings,
    TouristRecord,
    TravelMode,
    VisitPurpose,
    TOURIST_RECORD_COUNT_FIELDS,
    TOURIST_RECORD_REQUIRED_FIELDS,
    validate_tourist_record_values,
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


class ProvinceSerializer(NamedReferenceSerializer):
    class Meta(NamedReferenceSerializer.Meta):
        model = Province


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


class TourismSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TourismSettings
        fields = [
            "municipality_name",
            "province",
            "tourism_office_contact",
            "tourism_office_email",
            "api_base_url",
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
            "email",
            "full_name",
            "contact_number",
            "country_id",
            "region_id",
            "province_id",
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
