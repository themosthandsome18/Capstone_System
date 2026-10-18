from django.contrib import admin
from django import forms
from django.db import transaction
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseForbidden

from .services.public_reporting import (
    PublicSubmissionDeletionProtected, RETENTION_MESSAGE, is_public_submission_digest,
)

from .models import (
    ActivityLog,
    Barangay,
    BoatType,
    Country,
    FeedbackEntry,
    HouseholdSanitationRecord,
    Itinerary,
    Province,
    Region,
    Resort,
    ResortMonthlyArrival,
    SanitaryBusinessType,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryInspectionChecklistItem,
    SanitaryRequirement,
    TouristRecord,
    TouristStat,
    TravelMode,
    UserProfile,
    VisitPurpose,
)


@admin.register(Country, Region, Province, Itinerary, TravelMode, BoatType, VisitPurpose)
class NamedReferenceAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(Resort)
class ResortAdmin(admin.ModelAdmin):
    list_display = (
        "resort_id",
        "resort_name",
        "type",
        "with_mayors_permit",
        "monthly_arrivals",
        "tourism_rating",
    )
    search_fields = ("resort_name", "location", "type")
    list_filter = ("type", "with_mayors_permit", "access")


@admin.register(FeedbackEntry)
class FeedbackEntryAdmin(admin.ModelAdmin):
    list_display = ("reviewer", "destination", "rating", "status", "date")
    search_fields = ("reviewer", "title", "message")
    list_filter = ("status", "rating", "destination", "date")


@admin.register(TouristRecord)
class TouristRecordAdmin(admin.ModelAdmin):
    list_display = (
        "survey_id",
        "full_name",
        "arrival_date",
        "total_visitors",
        "resort",
        "country",
        "region",
        "province",
        "status",
    )
    search_fields = (
        "survey_id",
        "full_name",
        "email",
        "contact_number",
        "country_of_origin",
        "parking_space",
    )
    list_filter = (
        "arrival_date",
        "country",
        "region",
        "province",
        "resort",
        "status",
        "consent_confirmed",
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role")
    search_fields = ("user__username", "user__first_name", "user__last_name")
    list_filter = ("role",)


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "user",
        "module",
        "action",
        "record_type",
        "record_label",
    )
    search_fields = (
        "user__username",
        "record_type",
        "record_id",
        "record_label",
    )
    list_filter = ("module", "action", "created_at")
    readonly_fields = (
        "user",
        "module",
        "action",
        "record_type",
        "record_id",
        "record_label",
        "created_at",
    )

    def delete_view(self, request, object_id, extra_context=None):
        obj = self.get_object(request, object_id)
        if (obj is not None and super().has_delete_permission(request, obj)
                and is_public_submission_digest(obj)):
            return HttpResponseForbidden(RETENTION_MESSAGE)
        return super().delete_view(request, object_id, extra_context)

    def get_deleted_objects(self, objs, request):
        deletable, counts, permissions, protected = super().get_deleted_objects(objs, request)
        if any(is_public_submission_digest(obj) for obj in objs):
            protected.append(RETENTION_MESSAGE)
        return deletable, counts, permissions, protected

    def delete_model(self, request, obj):
        try:
            super().delete_model(request, obj)
        except PublicSubmissionDeletionProtected as error:
            raise PermissionDenied(RETENTION_MESSAGE) from error

    def delete_queryset(self, request, queryset):
        try:
            super().delete_queryset(request, queryset)
        except PublicSubmissionDeletionProtected as error:
            raise PermissionDenied(RETENTION_MESSAGE) from error


@admin.register(Barangay)
class BarangayAdmin(admin.ModelAdmin):
    list_display = ("name", "municipality", "province", "display_order", "is_active")
    search_fields = ("name", "municipality", "province")
    list_filter = ("is_active", "municipality", "province")


# =======================================================
# Sanitation
# =======================================================


@admin.register(SanitaryBusinessType)
class SanitaryBusinessTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "inspection_frequency")
    search_fields = ("name",)
    list_filter = ("inspection_frequency",)


@admin.register(SanitaryRequirement)
class SanitaryRequirementAdmin(admin.ModelAdmin):
    list_display = ("business_type", "permit_size", "requirement_name", "is_required")
    search_fields = ("requirement_name", "business_type__name")
    list_filter = ("business_type", "permit_size", "is_required")


class SanitaryEstablishmentAdminForm(forms.ModelForm):
    class Meta:
        model = SanitaryEstablishment
        fields = "__all__"

    def clean(self):
        cleaned = super().clean()
        if self.instance.pk:
            using = self.instance._state.db
            with transaction.atomic(using=using):
                current = SanitaryEstablishment.objects.using(using).select_for_update().filter(pk=self.instance.pk).first()
                if (current is not None and current.enforcement_stage == "suspension"
                        and "permit_status" in self.data
                        and self.data["permit_status"] != "suspended"):
                    raise forms.ValidationError(
                        "Reinstatement is unavailable for enforcement-suspended permits."
                    )
        return cleaned


@admin.register(SanitaryEstablishment)
class SanitaryEstablishmentAdmin(admin.ModelAdmin):
    form = SanitaryEstablishmentAdminForm
    readonly_fields = ("enforcement_stage",)

    def get_readonly_fields(self, request, obj=None):
        if obj is not None and obj.enforcement_stage == "suspension":
            return self.readonly_fields + ("permit_status",)
        return self.readonly_fields

    list_display = (
        "business_name",
        "owner_name",
        "business_type",
        "permit_size",
        "barangay",
        "has_permit",
        "permit_status",
        "compliance_status",
    )
    search_fields = ("business_name", "owner_name", "barangay", "permit_number")
    list_filter = (
        "business_type",
        "permit_size",
        "barangay",
        "has_permit",
        "permit_status",
        "compliance_status",
    )


class SanitaryInspectionChecklistItemInline(admin.TabularInline):
    model = SanitaryInspectionChecklistItem
    extra = 0


@admin.register(SanitaryInspection)
class SanitaryInspectionAdmin(admin.ModelAdmin):
    list_display = (
        "establishment",
        "inspector_name",
        "inspection_date",
        "next_due_date",
        "status_after_inspection",
        "is_draft",
    )
    search_fields = ("establishment__business_name", "inspector_name", "findings")
    list_filter = (
        "status_after_inspection",
        "inspection_date",
        "next_due_date",
        "is_draft",
    )
    inlines = [SanitaryInspectionChecklistItemInline]


@admin.register(SanitaryInspectionChecklistItem)
class SanitaryInspectionChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("inspection", "requirement_name", "is_complied")
    search_fields = ("requirement_name", "inspection__establishment__business_name")
    list_filter = ("is_complied",)


@admin.register(HouseholdSanitationRecord)
class HouseholdSanitationRecordAdmin(admin.ModelAdmin):
    list_display = (
        "household_code",
        "household_head",
        "barangay",
        "total_members",
        "toilet_type",
        "water_level",
        "waste_disposal",
        "status",
        "last_survey_date",
    )
    search_fields = (
        "household_code",
        "household_head",
        "barangay",
        "address",
    )
    list_filter = (
        "barangay",
        "toilet_type",
        "water_level",
        "waste_disposal",
        "status",
    )


@admin.register(ResortMonthlyArrival)
class ResortMonthlyArrivalAdmin(admin.ModelAdmin):
    list_display = ("resort", "year", "month", "total_arrivals")
    search_fields = ("resort__resort_name",)
    list_filter = ("year", "month", "resort")


admin.site.register(TouristStat)
