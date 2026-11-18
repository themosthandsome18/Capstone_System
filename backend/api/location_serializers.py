"""Shared write contracts for sanitation record locations and optional Sitios."""
import math

from django.db import router, transaction
from rest_framework import serializers

from .models import Sitio


LOCATION_FIELDS = (
    "location_source", "location_accuracy_m", "location_captured_at", "location_reported_mock",
)


class LocationCaptureSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=("manual", "device_reported"))
    accuracy_m = serializers.FloatField(required=False)
    captured_at = serializers.DateTimeField(required=False)
    reported_mock = serializers.BooleanField(required=False, allow_null=True)

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({key: "Unknown capture field." for key in unknown})
            accuracy = data.get("accuracy_m")
            if isinstance(accuracy, bool):
                raise serializers.ValidationError({"accuracy_m": "A numeric accuracy is required."})
            mock = data.get("reported_mock")
            if mock is not None and not isinstance(mock, bool):
                raise serializers.ValidationError({"reported_mock": "Use a boolean or null."})
        return super().to_internal_value(data)

    def validate(self, attrs):
        # Nested serializers inherit partial=True from PATCH. Capture is still
        # an explicit complete claim, so its method cannot be omitted.
        if "method" not in attrs:
            raise serializers.ValidationError({"method": "A capture method is required."})
        if attrs["method"] == "manual":
            if set(attrs) != {"method"}:
                raise serializers.ValidationError("Manual locations cannot carry device capture metadata.")
        else:
            if "accuracy_m" not in attrs or "captured_at" not in attrs:
                raise serializers.ValidationError("Device-reported capture requires accuracy_m and captured_at.")
            if not math.isfinite(attrs["accuracy_m"]) or attrs["accuracy_m"] < 0:
                raise serializers.ValidationError({"accuracy_m": "Use a finite nonnegative accuracy in metres."})
        return attrs


class SanitationLocationSerializer(serializers.ModelSerializer):
    location_source = serializers.CharField(read_only=True)
    location_accuracy_m = serializers.FloatField(read_only=True, allow_null=True)
    location_captured_at = serializers.DateTimeField(read_only=True, allow_null=True)
    location_reported_mock = serializers.BooleanField(read_only=True, allow_null=True)
    location_capture = LocationCaptureSerializer(required=False, write_only=True)
    sitio_source = serializers.CharField(read_only=True)
    sitio_reference = serializers.PrimaryKeyRelatedField(
        queryset=Sitio.objects.all(), required=False, allow_null=True,
    )

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            protected = set((*LOCATION_FIELDS, "sitio_source")) & set(data)
            if protected:
                raise serializers.ValidationError({key: "This field is server-controlled." for key in protected})
            for field in ("latitude", "longitude"):
                value = data.get(field)
                if isinstance(value, bool) or (isinstance(value, str) and not value.strip()):
                    raise serializers.ValidationError({field: "A numeric coordinate or explicit null is required."})
        return super().to_internal_value(data)

    def _validate_coordinates(self, attrs, instance):
        coordinate_write = "latitude" in attrs or "longitude" in attrs
        capture = attrs.get("location_capture")
        if not coordinate_write and capture is None:
            return
        latitude = attrs.get("latitude", getattr(instance, "latitude", None))
        longitude = attrs.get("longitude", getattr(instance, "longitude", None))
        if capture is not None and ("latitude" not in attrs or "longitude" not in attrs
                                    or latitude is None or longitude is None):
            raise serializers.ValidationError({"location_capture": "Capture must include both numeric coordinates."})
        if latitude is None or longitude is None:
            if not ("latitude" in attrs and "longitude" in attrs and latitude is None and longitude is None):
                raise serializers.ValidationError({
                    "coordinates": "Supply a complete coordinate pair, or explicitly set both coordinates to null.",
                })
            return
        for field, value, bound in (("latitude", latitude, 90), ("longitude", longitude, 180)):
            if not math.isfinite(value) or not -bound <= value <= bound:
                raise serializers.ValidationError({field: f"A finite coordinate between {-bound} and {bound} is required."})

    def _sitio_updates(self, attrs, instance, *, lock=False):
        barangay = attrs.get("barangay", getattr(instance, "barangay", ""))
        old_text = getattr(instance, "sitio", "")
        old_reference = getattr(instance, "sitio_reference_id", None)
        if "sitio_reference" in attrs and attrs["sitio_reference"] is not None:
            references = Sitio.objects.select_related("barangay")
            if lock:
                references = references.select_for_update()
            reference = references.filter(pk=attrs["sitio_reference"].pk).first()
            if (reference is None or not reference.is_active or not reference.barangay.is_active
                    or reference.barangay.name != barangay):
                raise serializers.ValidationError({"sitio_reference": "Choose an active Sitio belonging to this Barangay."})
            if "sitio" in attrs and attrs["sitio"] != reference.name:
                raise serializers.ValidationError({"sitio": "The text must match the configured Sitio selection."})
            return {"sitio_reference": reference, "sitio": reference.name, "sitio_source": "configured"}
        if "sitio_reference" not in attrs:
            if "sitio" not in attrs or attrs["sitio"] == old_text:
                if old_reference and barangay != getattr(instance, "barangay", ""):
                    raise serializers.ValidationError({"sitio_reference": "Clear or replace the Sitio when changing Barangay."})
                return {}
        text = attrs.get("sitio", old_text)
        return {"sitio_reference": None, "sitio": text, "sitio_source": "manual" if text else "unknown"}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        self._validate_coordinates(attrs, self.instance)
        self._sitio_updates(attrs, self.instance)
        return attrs

    def _prepare_location(self, attrs, instance):
        self._validate_coordinates(attrs, instance)
        updates = self._sitio_updates(attrs, instance, lock=True)
        capture = attrs.pop("location_capture", None)
        previous = (getattr(instance, "latitude", None), getattr(instance, "longitude", None))
        pair = (attrs.get("latitude", previous[0]), attrs.get("longitude", previous[1]))
        clearing = "latitude" in attrs and "longitude" in attrs and pair == (None, None)
        if capture is not None or pair != previous or clearing:
            updates.update(location_source="unknown", location_accuracy_m=None,
                           location_captured_at=None, location_reported_mock=None)
            if capture is not None:
                updates["location_source"] = capture["method"]
                if capture["method"] == "device_reported":
                    updates.update(location_accuracy_m=capture["accuracy_m"],
                                   location_captured_at=capture["captured_at"],
                                   location_reported_mock=capture.get("reported_mock"))
        return {**attrs, **updates}

    def create(self, validated_data):
        using = router.db_for_write(self.Meta.model)
        with transaction.atomic(using=using):
            return super().create(self._prepare_location(validated_data, None))

    def update(self, instance, validated_data):
        using = instance._state.db or router.db_for_write(type(instance), instance=instance)
        with transaction.atomic(using=using):
            current = type(instance).objects.using(using).select_for_update().get(pk=instance.pk)
            return super().update(current, self._prepare_location(validated_data, current))


def sanitation_location_details(record):
    """Additive staff-mobile read fields. Capture claims remain device-reported."""
    return {
        "location_source": record.location_source,
        "location_accuracy_m": record.location_accuracy_m,
        "location_captured_at": serializers.DateTimeField().to_representation(record.location_captured_at),
        "location_reported_mock": record.location_reported_mock,
        "sitio": record.sitio,
        "sitio_reference": record.sitio_reference_id,
        "sitio_source": record.sitio_source,
    }
