from django.contrib import admin

from .models import (
    BoatType,
    Country,
    Itinerary,
    FeedbackEntry,
    Province,
    Region,
    Resort,
    TourismSettings,
    TouristRecord,
    TouristStat,
    TravelMode,
    VisitPurpose,
    SanitaryBusinessType,
    SanitaryRequirement,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryInspectionChecklistItem,
    HouseholdSanitationRecord,
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


@admin.register(TourismSettings)
class TourismSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "municipality_name",
        "province",
        "tourism_office_contact",
        "tourism_office_email",
        "updated_at",
    )


@admin.register(TouristRecord)
class TouristRecordAdmin(admin.ModelAdmin):
    list_display = (
        "survey_id",
        "full_name",
        "arrival_date",
        "total_visitors",
        "resort",
        "country",
        "status",
    )
    search_fields = ("survey_id", "full_name", "email", "contact_number")
    list_filter = ("arrival_date", "country", "resort", "status")

# =======================================================
#  Sanitations
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
    list_filter = ("status_after_inspection", "inspection_date", "next_due_date", "is_draft")
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
    
admin.site.register(TouristStat)
