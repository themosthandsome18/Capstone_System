from django.contrib import admin

from .models import (
    ActivityLog,
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


@admin.register(SanitaryEstablishment)
class SanitaryEstablishmentAdmin(admin.ModelAdmin):
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
