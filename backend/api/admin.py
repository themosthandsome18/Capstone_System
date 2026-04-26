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


admin.site.register(TouristStat)
