from datetime import timedelta

from django.db.models import Count, Max, Q, Sum
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import (
    BoatType,
    BOOKING_STATUS_ARRIVED,
    BOOKING_STATUS_NO_SHOW,
    BOOKING_STATUS_PENDING,
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
    SanitaryBusinessType,
    SanitaryRequirement,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryInspectionChecklistItem,
    HouseholdSanitationRecord,
)
from .seed_data import (
    INITIAL_FEEDBACK_ENTRIES,
    INITIAL_TOURISM_SETTINGS,
    INITIAL_TOURIST_RECORDS,
    REFERENCE_TABLES,
    SANITARY_BUSINESS_TYPES,
    SANITARY_REQUIREMENTS,
    SANITARY_ESTABLISHMENTS,
    SANITARY_INSPECTIONS,
    HOUSEHOLD_SANITATION_RECORDS,
)
from .serializers import (
    BoatTypeSerializer,
    CountrySerializer,
    FeedbackEntrySerializer,
    ItinerarySerializer,
    ProvinceSerializer,
    RegionSerializer,
    ResortSerializer,
    TourismSettingsSerializer,
    TouristRecordSerializer,
    TravelModeSerializer,
    VisitPurposeSerializer,
    SanitaryBusinessTypeSerializer,
    SanitaryEstablishmentSerializer,
    SanitaryInspectionSerializer,
    SanitaryInspectionCreateSerializer,
    HouseholdSanitationRecordSerializer,
)

ARRIVAL_FEE_PER_VISITOR = 300


REFERENCE_MODEL_CONFIG = {
    "countries": (Country, CountrySerializer, REFERENCE_TABLES["countries"]),
    "regions": (Region, RegionSerializer, REFERENCE_TABLES["regions"]),
    "provinces": (Province, ProvinceSerializer, REFERENCE_TABLES["provinces"]),
    "itineraries": (Itinerary, ItinerarySerializer, REFERENCE_TABLES["itineraries"]),
    "travelModes": (TravelMode, TravelModeSerializer, REFERENCE_TABLES["travel_modes"]),
    "boatTypes": (BoatType, BoatTypeSerializer, REFERENCE_TABLES["boat_types"]),
    "visitPurposes": (
        VisitPurpose,
        VisitPurposeSerializer,
        REFERENCE_TABLES["visit_purposes"],
    ),
    "resorts": (Resort, ResortSerializer, REFERENCE_TABLES["resorts"]),
}


def ensure_initial_reference_data():
    for model, _, rows in REFERENCE_MODEL_CONFIG.values():
        if model.objects.exists():
            continue

        model.objects.bulk_create(model(**row) for row in rows)


def ensure_initial_tourist_records():
    if TouristRecord.objects.exists():
        return

    TouristRecord.objects.bulk_create(
        TouristRecord(**record) for record in INITIAL_TOURIST_RECORDS
    )


def ensure_initial_feedback_entries():
    if FeedbackEntry.objects.exists():
        return

    FeedbackEntry.objects.bulk_create(
        FeedbackEntry(**entry) for entry in INITIAL_FEEDBACK_ENTRIES
    )


def ensure_default_settings():
    settings, _ = TourismSettings.objects.get_or_create(
        pk=1,
        defaults=INITIAL_TOURISM_SETTINGS,
    )
    return settings

def ensure_initial_data():
    ensure_initial_reference_data()
    ensure_initial_tourist_records()
    ensure_initial_feedback_entries()
    ensure_default_settings()
    ensure_initial_sanitation_data()
    ensure_initial_household_data()

def ensure_initial_sanitation_data():
    if SanitaryBusinessType.objects.exists():
        return

    business_type_lookup = {}

    for row in SANITARY_BUSINESS_TYPES:
        business_type = SanitaryBusinessType.objects.create(**row)
        business_type_lookup[business_type.name] = business_type

    for group in SANITARY_REQUIREMENTS:
        business_type = business_type_lookup.get(group["business_type"])

        if not business_type:
            continue

        for requirement_name in group["requirements"]:
            SanitaryRequirement.objects.create(
                business_type=business_type,
                permit_size=group["permit_size"],
                requirement_name=requirement_name,
                is_required=True,
            )

    establishment_lookup = {}

    for row in SANITARY_ESTABLISHMENTS:
        data = row.copy()
        business_type_name = data.pop("business_type")
        business_type = business_type_lookup.get(business_type_name)

        if not business_type:
            continue

        establishment = SanitaryEstablishment.objects.create(
            business_type=business_type,
            **data,
        )
        establishment_lookup[establishment.business_name] = establishment

    for row in SANITARY_INSPECTIONS:
        data = row.copy()
        business_name = data.pop("business_name")
        checklist = data.pop("checklist", [])

        establishment = establishment_lookup.get(business_name)

        if not establishment:
            continue

        inspection = SanitaryInspection.objects.create(
            establishment=establishment,
            **data,
        )

        for item in checklist:
            SanitaryInspectionChecklistItem.objects.create(
                inspection=inspection,
                **item,
            )

def ensure_initial_household_data():
    if HouseholdSanitationRecord.objects.exists():
        return

    HouseholdSanitationRecord.objects.bulk_create(
        HouseholdSanitationRecord(**record)
        for record in HOUSEHOLD_SANITATION_RECORDS
    )

def generate_survey_id():
    year = timezone.localdate().year
    prefix = f"SURV-{year}-"
    latest = (
        TouristRecord.objects.filter(survey_id__startswith=prefix)
        .order_by("-survey_id")
        .first()
    )

    next_number = 1
    if latest:
        try:
            next_number = int(latest.survey_id.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            next_number = TouristRecord.objects.count() + 1

    while True:
        survey_id = f"{prefix}{next_number:03d}"
        if not TouristRecord.objects.filter(survey_id=survey_id).exists():
            return survey_id
        next_number += 1


def generate_resort_id():
    latest_id = Resort.objects.aggregate(max_id=Max("resort_id"))["max_id"] or 0
    return latest_id + 1


@api_view(["GET"])
def health_check(request):
    return Response({"status": "ok"})


@api_view(["GET"])
def bootstrap_data(request):
    ensure_initial_data()
    records = TouristRecord.objects.all()
    settings = ensure_default_settings()

    return Response(
        {
            "referenceTables": build_reference_tables_payload(),
            "touristRecords": TouristRecordSerializer(records, many=True).data,
            "bookingManagement": build_booking_management_payload(),
            "feedbackEntries": FeedbackEntrySerializer(
                FeedbackEntry.objects.select_related("destination").all(),
                many=True,
            ).data,
            "settings": TourismSettingsSerializer(settings).data,
            "arrivalMonitoring": build_arrival_monitoring_payload(),
            "dashboardData": build_dashboard_payload(),
            "reportData": build_reports_payload(),
        }
    )


@api_view(["GET"])
def reference_tables(request):
    ensure_initial_reference_data()
    return Response(build_reference_tables_payload())


def build_reference_tables_payload():
    payload = {}

    for payload_key, (model, serializer_class, _) in REFERENCE_MODEL_CONFIG.items():
        payload[payload_key] = serializer_class(model.objects.all(), many=True).data

    return payload


def build_arrival_monitoring_payload():
    records = (
        TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
        .select_related("resort")
        .order_by("-arrival_date", "survey_id")
    )

    rows = []
    totals = {
        "totalArrivals": 0,
        "totalMale": 0,
        "totalFemale": 0,
        "overnight": 0,
        "sameDay": 0,
        "feesCollected": 0,
    }

    for record in records:
        same_day = record.total_visitors if record.total_visitors >= 5 else 0
        overnight = 0 if same_day else record.total_visitors
        fee_paid = record.total_visitors * ARRIVAL_FEE_PER_VISITOR

        totals["totalArrivals"] += record.total_visitors
        totals["totalMale"] += record.total_male
        totals["totalFemale"] += record.total_female
        totals["overnight"] += overnight
        totals["sameDay"] += same_day
        totals["feesCollected"] += fee_paid

        rows.append(
            {
                "survey_id": record.survey_id,
                "date": record.arrival_date.isoformat(),
                "group": record.full_name,
                "male": record.total_male,
                "female": record.total_female,
                "overnight": overnight,
                "sameDay": same_day,
                "resort": record.resort.resort_name,
                "feePaid": fee_paid,
            }
        )

    latest_arrival = records.first()

    return {
        "feePerVisitor": ARRIVAL_FEE_PER_VISITOR,
        "reportDate": latest_arrival.arrival_date.isoformat() if latest_arrival else None,
        "summary": totals,
        "rows": rows,
        "dailyTotals": {
            "male": totals["totalMale"],
            "female": totals["totalFemale"],
            "overnight": totals["overnight"],
            "sameDay": totals["sameDay"],
            "feesCollected": totals["feesCollected"],
        },
    }


def build_booking_management_payload(params=None):
    params = params or {}
    records = TouristRecord.objects.select_related("country", "resort").all()

    search = (params.get("search") or "").strip()
    status_filter = (params.get("status") or "").strip()
    resort_id = (params.get("resort_id") or "").strip()

    if search:
        records = records.filter(
            Q(survey_id__icontains=search)
            | Q(full_name__icontains=search)
            | Q(contact_number__icontains=search)
            | Q(country__name__icontains=search)
            | Q(resort__resort_name__icontains=search)
        )

    if status_filter:
        records = records.filter(status=status_filter)

    if resort_id:
        records = records.filter(resort_id=resort_id)

    rows = []
    for record in records:
        rows.append(
            {
                "survey_id": record.survey_id,
                "full_name": record.full_name,
                "contact_number": record.contact_number,
                "country_id": record.country_id,
                "country_name": record.country.name,
                "total_visitors": record.total_visitors,
                "arrival_date": record.arrival_date.isoformat(),
                "resort_id": record.resort_id,
                "resort_name": record.resort.resort_name,
                "status": record.status,
                "status_label": record.get_status_display(),
            }
        )

    all_records = TouristRecord.objects.all()

    return {
        "filters": {
            "search": search,
            "status": status_filter,
            "resort_id": resort_id,
        },
        "summary": {
            "verifiedEntries": all_records.count(),
            "pending": all_records.filter(status=BOOKING_STATUS_PENDING).count(),
            "arrived": all_records.filter(status=BOOKING_STATUS_ARRIVED).count(),
            "noShow": all_records.filter(status=BOOKING_STATUS_NO_SHOW).count(),
        },
        "rows": rows,
    }


def build_dashboard_payload():
    all_records = TouristRecord.objects.all()
    arrived_records = TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
    latest_date = all_records.aggregate(latest=Max("arrival_date"))["latest"]
    reporting_date = latest_date or timezone.localdate()
    week_start = reporting_date - timedelta(days=6)
    month_start = reporting_date.replace(day=1)

    def sum_visitors(queryset):
        return queryset.aggregate(total=Sum("total_visitors"))["total"] or 0

    today_records = arrived_records.filter(arrival_date=reporting_date)
    week_records = arrived_records.filter(arrival_date__range=(week_start, reporting_date))
    month_records = arrived_records.filter(arrival_date__gte=month_start)

    trend_labels = []
    trend_values = []
    for offset in range(6, -1, -1):
        day = reporting_date - timedelta(days=offset)
        trend_labels.append(day.strftime("%b %d"))
        trend_values.append(sum_visitors(arrived_records.filter(arrival_date=day)))

    classification = arrived_records.aggregate(
        filipino=Sum("filipino_count"),
        maubanin=Sum("maubanin_count"),
        foreign=Sum("foreigner_count"),
    )
    gender = arrived_records.aggregate(
        male=Sum("total_male"),
        female=Sum("total_female"),
    )

    day_tour = 0
    overnight = 0
    for record in arrived_records:
        if record.total_visitors >= 5:
            day_tour += record.total_visitors
        else:
            overnight += record.total_visitors

    duplicate_contacts = (
        all_records.exclude(contact_number="")
        .values("contact_number")
        .annotate(total=Count("survey_id"))
        .filter(total__gt=1)
        .count()
    )
    verified_entries = all_records.count()

    total_revenue = sum_visitors(arrived_records) * ARRIVAL_FEE_PER_VISITOR

    return {
        "reportingDate": reporting_date.isoformat(),
        "feePerVisitor": ARRIVAL_FEE_PER_VISITOR,
        "metrics": {
            "todayArrivals": sum_visitors(today_records),
            "weekArrivals": sum_visitors(week_records),
            "monthArrivals": sum_visitors(month_records),
            "totalRevenueCollected": total_revenue,
        },
        "trends": {
            "labels": trend_labels,
            "arrivals": trend_values,
        },
        "classification": {
            "filipino": classification["filipino"] or 0,
            "maubanin": classification["maubanin"] or 0,
            "foreign": classification["foreign"] or 0,
        },
        "gender": {
            "male": gender["male"] or 0,
            "female": gender["female"] or 0,
        },
        "stayType": {
            "dayTour": day_tour,
            "overnight": overnight,
        },
        "validation": {
            "verifiedEntries": verified_entries,
            "invalidEntries": 0,
            "duplicateEntries": duplicate_contacts,
        },
    }


def build_reports_payload(params=None):
    params = params or {}

    report_type = params.get("type", "resort")
    date_from = params.get("from")
    date_to = params.get("to")
    resort_id = params.get("resort_id")

    records = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED
    ).select_related("resort")

    if date_from:
        records = records.filter(arrival_date__gte=date_from)

    if date_to:
        records = records.filter(arrival_date__lte=date_to)

    if resort_id:
        records = records.filter(resort_id=resort_id)

    totals = {
        "visitors": 0,
        "revenue": 0,
    }

    rows = []

    if report_type == "daily":
        grouped = (
            records.values("arrival_date")
            .annotate(visitors=Sum("total_visitors"))
            .order_by("arrival_date")
        )

        for item in grouped:
            visitors = item["visitors"] or 0
            revenue = visitors * ARRIVAL_FEE_PER_VISITOR
            totals["visitors"] += visitors
            totals["revenue"] += revenue

            rows.append(
                {
                    "id": item["arrival_date"].isoformat(),
                    "name": item["arrival_date"].strftime("%b %d, %Y"),
                    "visitors": visitors,
                    "revenue": revenue,
                    "avg": round(revenue / visitors) if visitors else 0,
                }
            )

    elif report_type == "monthly":
        monthly_data = {}

        for record in records:
            key = record.arrival_date.strftime("%Y-%m")
            label = record.arrival_date.strftime("%B %Y")

            if key not in monthly_data:
                monthly_data[key] = {
                    "id": key,
                    "name": label,
                    "visitors": 0,
                    "revenue": 0,
                    "avg": 0,
                }

            monthly_data[key]["visitors"] += record.total_visitors

        for key in sorted(monthly_data.keys()):
            row = monthly_data[key]
            row["revenue"] = row["visitors"] * ARRIVAL_FEE_PER_VISITOR
            row["avg"] = (
                round(row["revenue"] / row["visitors"])
                if row["visitors"]
                else 0
            )

            totals["visitors"] += row["visitors"]
            totals["revenue"] += row["revenue"]
            rows.append(row)

    else:
        for resort in Resort.objects.order_by("resort_name"):
            if resort_id and str(resort.resort_id) != str(resort_id):
                continue

            resort_records = records.filter(resort=resort)
            visitors = resort_records.aggregate(total=Sum("total_visitors"))["total"] or 0
            revenue = visitors * ARRIVAL_FEE_PER_VISITOR

            totals["visitors"] += visitors
            totals["revenue"] += revenue

            rows.append(
                {
                    "id": resort.resort_id,
                    "resort_id": resort.resort_id,
                    "name": resort.resort_name,
                    "visitors": visitors,
                    "revenue": revenue,
                    "avg": round(revenue / visitors) if visitors else 0,
                }
            )

    return {
        "type": report_type,
        "filters": {
            "type": report_type,
            "from": date_from or "",
            "to": date_to or "",
            "resort_id": resort_id or "",
        },
        "feePerVisitor": ARRIVAL_FEE_PER_VISITOR,
        "rows": rows,
        "totals": {
            "visitors": totals["visitors"],
            "revenue": totals["revenue"],
            "avg": round(totals["revenue"] / totals["visitors"])
            if totals["visitors"]
            else 0,
        },
    }

@api_view(["GET"])
def arrival_monitoring_data(request):
    ensure_initial_data()
    return Response(build_arrival_monitoring_payload())


@api_view(["GET"])
def booking_management_data(request):
    ensure_initial_data()
    return Response(build_booking_management_payload(request.query_params))


@api_view(["GET", "POST"])
def tourist_record_list(request):
    ensure_initial_data()

    if request.method == "GET":
        records = TouristRecord.objects.all()
        return Response(TouristRecordSerializer(records, many=True).data)

    data = request.data.copy()
    if not data.get("survey_id"):
        data["survey_id"] = generate_survey_id()

    serializer = TouristRecordSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def tourist_record_detail(request, survey_id):
    record = get_object_or_404(TouristRecord, survey_id=survey_id)

    if request.method == "GET":
        return Response(TouristRecordSerializer(record).data)

    if request.method == "DELETE":
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data.copy()
    data["survey_id"] = record.survey_id
    serializer = TouristRecordSerializer(
        record,
        data=data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
def dashboard_data(request):
    ensure_initial_data()
    return Response(build_dashboard_payload())


@api_view(["GET"])
def reports_data(request):
    ensure_initial_data()
    return Response(build_reports_payload(request.query_params))


@api_view(["GET", "POST"])
def resort_list(request):
    ensure_initial_reference_data()

    if request.method == "GET":
        return Response(ResortSerializer(Resort.objects.all(), many=True).data)

    data = request.data.copy()
    if not data.get("resort_id"):
        data["resort_id"] = generate_resort_id()

    serializer = ResortSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def resort_detail(request, resort_id):
    resort = get_object_or_404(Resort, resort_id=resort_id)

    if request.method == "GET":
        return Response(ResortSerializer(resort).data)

    if request.method == "DELETE":
        try:
            resort.delete()
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "This destination is linked to tourist records and cannot "
                        "be deleted."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data.copy()
    data["resort_id"] = resort.resort_id
    serializer = ResortSerializer(
        resort,
        data=data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "POST"])
def feedback_list(request):
    ensure_initial_data()

    if request.method == "GET":
        feedback = FeedbackEntry.objects.select_related("destination").all()
        return Response(FeedbackEntrySerializer(feedback, many=True).data)

    serializer = FeedbackEntrySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def feedback_detail(request, feedback_id):
    entry = get_object_or_404(FeedbackEntry, pk=feedback_id)

    if request.method == "GET":
        return Response(FeedbackEntrySerializer(entry).data)

    if request.method == "DELETE":
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = FeedbackEntrySerializer(
        entry,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "PATCH"])
def settings_data(request):
    settings_obj = ensure_default_settings()

    if request.method == "GET":
        return Response(TourismSettingsSerializer(settings_obj).data)

    serializer = TourismSettingsSerializer(
        settings_obj,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ============================================================
# SANITATION MODULE API
# Business / Permit Side
# ============================================================

def get_status_label_map():
    return {
        "good_standing": "Good Standing",
        "upcoming": "Upcoming",
        "for_completion": "For Completion",
        "violation": "Violation",
        "no_permit": "No Permit",
    }


def build_sanitation_dashboard_payload():
    ensure_initial_sanitation_data()

    establishments = SanitaryEstablishment.objects.select_related("business_type").all()

    total = establishments.count()
    good = establishments.filter(compliance_status="good_standing").count()
    upcoming = establishments.filter(compliance_status="upcoming").count()
    for_completion = establishments.filter(compliance_status="for_completion").count()
    violation = establishments.filter(compliance_status="violation").count()
    no_permit = establishments.filter(compliance_status="no_permit").count()

    by_type = []
    for business_type in SanitaryBusinessType.objects.order_by("name"):
        type_establishments = establishments.filter(business_type=business_type)

        by_type.append(
            {
                "id": business_type.id,
                "name": business_type.name,
                "inspection_frequency": business_type.inspection_frequency,
                "total": type_establishments.count(),
                "sp": type_establishments.filter(permit_size="sp").count(),
                "large": type_establishments.filter(permit_size="large").count(),
                "good_standing": type_establishments.filter(
                    compliance_status="good_standing"
                ).count(),
                "for_completion": type_establishments.filter(
                    compliance_status="for_completion"
                ).count(),
                "upcoming": type_establishments.filter(
                    compliance_status="upcoming"
                ).count(),
                "violation": type_establishments.filter(
                    compliance_status="violation"
                ).count(),
                "no_permit": type_establishments.filter(
                    compliance_status="no_permit"
                ).count(),
            }
        )

    recent = establishments.order_by("-updated_at")[:6]

    return {
        "summary": {
            "totalEstablishments": total,
            "goodStanding": good,
            "upcoming": upcoming,
            "forCompletion": for_completion,
            "violators": violation,
            "noPermit": no_permit,
            "complianceRate": round((good / total) * 100) if total else 0,
        },
        "distribution": {
            "goodStanding": good,
            "upcoming": upcoming,
            "forCompletion": for_completion,
            "violation": violation,
            "noPermit": no_permit,
        },
        "byType": by_type,
        "recentActivity": SanitaryEstablishmentSerializer(recent, many=True).data,
    }


def build_sanitation_submissions_payload(params=None):
    ensure_initial_sanitation_data()

    params = params or {}
    search = (params.get("search") or "").strip()
    status_filter = (params.get("status") or "").strip()

    establishments = SanitaryEstablishment.objects.select_related("business_type").all()

    if search:
        establishments = establishments.filter(
            Q(business_name__icontains=search)
            | Q(owner_name__icontains=search)
            | Q(business_type__name__icontains=search)
            | Q(barangay__icontains=search)
            | Q(permit_number__icontains=search)
        )

    if status_filter and status_filter != "all":
        establishments = establishments.filter(compliance_status=status_filter)

    rows = []
    status_label_map = get_status_label_map()

    for establishment in establishments:
        rows.append(
            {
                "id": establishment.id,
                "business_name": establishment.business_name,
                "owner_name": establishment.owner_name,
                "business_type": establishment.business_type.name,
                "permit_size": establishment.permit_size,
                "permit_size_label": establishment.get_permit_size_display(),
                "barangay": establishment.barangay,
                "date_submitted": (
                    establishment.permit_issued_date.isoformat()
                    if establishment.permit_issued_date
                    else ""
                ),
                "compliance_status": establishment.compliance_status,
                "compliance_status_label": status_label_map.get(
                    establishment.compliance_status,
                    establishment.compliance_status,
                ),
                "permit_status": establishment.permit_status,
                "permit_status_label": establishment.get_permit_status_display(),
            }
        )

    all_establishments = SanitaryEstablishment.objects.all()

    return {
        "filters": {
            "search": search,
            "status": status_filter or "all",
        },
        "summary": {
            "all": all_establishments.count(),
            "goodStanding": all_establishments.filter(
                compliance_status="good_standing"
            ).count(),
            "forCompletion": all_establishments.filter(
                compliance_status="for_completion"
            ).count(),
            "upcoming": all_establishments.filter(
                compliance_status="upcoming"
            ).count(),
            "violators": all_establishments.filter(
                compliance_status="violation"
            ).count(),
            "noPermit": all_establishments.filter(
                compliance_status="no_permit"
            ).count(),
        },
        "rows": rows,
    }


def build_sanitation_reports_payload(params=None):
    ensure_initial_sanitation_data()

    params = params or {}
    business_type_id = params.get("business_type_id")
    barangay = params.get("barangay")

    establishments = SanitaryEstablishment.objects.select_related("business_type").all()

    if business_type_id:
        establishments = establishments.filter(business_type_id=business_type_id)

    if barangay:
        establishments = establishments.filter(barangay=barangay)

    total = establishments.count()
    good = establishments.filter(compliance_status="good_standing").count()
    upcoming = establishments.filter(compliance_status="upcoming").count()
    for_completion = establishments.filter(compliance_status="for_completion").count()
    violators = establishments.filter(compliance_status="violation").count()
    no_permit = establishments.filter(compliance_status="no_permit").count()

    by_type = []

    for business_type in SanitaryBusinessType.objects.order_by("name"):
        type_establishments = establishments.filter(business_type=business_type)
        type_total = type_establishments.count()

        if not type_total:
            continue

        by_type.append(
            {
                "id": business_type.id,
                "name": business_type.name,
                "inspection_frequency": business_type.inspection_frequency,
                "total": type_total,
                "withPermit": type_establishments.filter(has_permit=True).count(),
                "withoutPermit": type_establishments.filter(has_permit=False).count(),
                "sp": type_establishments.filter(permit_size="sp").count(),
                "large": type_establishments.filter(permit_size="large").count(),
                "goodStanding": type_establishments.filter(
                    compliance_status="good_standing"
                ).count(),
                "forCompletion": type_establishments.filter(
                    compliance_status="for_completion"
                ).count(),
                "upcoming": type_establishments.filter(
                    compliance_status="upcoming"
                ).count(),
                "violators": type_establishments.filter(
                    compliance_status="violation"
                ).count(),
                "noPermit": type_establishments.filter(
                    compliance_status="no_permit"
                ).count(),
            }
        )

    return {
        "filters": {
            "business_type_id": business_type_id or "",
            "barangay": barangay or "",
        },
        "summary": {
            "totalEstablishments": total,
            "goodStanding": good,
            "upcoming": upcoming,
            "forCompletion": for_completion,
            "violators": violators,
            "noPermit": no_permit,
            "complianceRate": round((good / total) * 100) if total else 0,
        },
        "byType": by_type,
    }


def build_sanitation_permits_payload(params=None):
    ensure_initial_sanitation_data()

    params = params or {}
    search = (params.get("search") or "").strip()
    permit_status = (params.get("permit_status") or "").strip()

    establishments = SanitaryEstablishment.objects.select_related("business_type").all()

    if search:
        establishments = establishments.filter(
            Q(business_name__icontains=search)
            | Q(owner_name__icontains=search)
            | Q(business_type__name__icontains=search)
            | Q(barangay__icontains=search)
        )

    if permit_status and permit_status != "all":
        establishments = establishments.filter(permit_status=permit_status)

    all_establishments = SanitaryEstablishment.objects.all()

    return {
        "summary": {
            "active": all_establishments.filter(permit_status="active").count(),
            "renewalDue": all_establishments.filter(
                permit_status="renewal_due"
            ).count(),
            "conditional": all_establishments.filter(
                permit_status="conditional"
            ).count(),
            "suspended": all_establishments.filter(
                permit_status="suspended"
            ).count(),
            "noPermit": all_establishments.filter(
                permit_status="no_permit"
            ).count(),
        },
        "rows": SanitaryEstablishmentSerializer(establishments, many=True).data,
    }


@api_view(["GET"])
def sanitation_bootstrap_data(request):
    ensure_initial_sanitation_data()

    return Response(
        {
            "businessTypes": SanitaryBusinessTypeSerializer(
                SanitaryBusinessType.objects.prefetch_related("requirements").all(),
                many=True,
            ).data,
            "establishments": SanitaryEstablishmentSerializer(
                SanitaryEstablishment.objects.select_related("business_type").all(),
                many=True,
            ).data,
            "inspections": SanitaryInspectionSerializer(
                SanitaryInspection.objects.select_related(
                    "establishment",
                    "establishment__business_type",
                ).prefetch_related("checklist_items"),
                many=True,
            ).data,
            "dashboardData": build_sanitation_dashboard_payload(),
            "permitData": build_sanitation_permits_payload(),
            "submissionData": build_sanitation_submissions_payload(),
            "reportData": build_sanitation_reports_payload(),
        }
    )


@api_view(["GET"])
def sanitation_dashboard_data(request):
    return Response(build_sanitation_dashboard_payload())


@api_view(["GET"])
def sanitation_business_type_list(request):
    ensure_initial_sanitation_data()

    business_types = SanitaryBusinessType.objects.prefetch_related("requirements").all()
    return Response(SanitaryBusinessTypeSerializer(business_types, many=True).data)


@api_view(["GET", "POST"])
def sanitation_establishment_list(request):
    ensure_initial_sanitation_data()

    if request.method == "GET":
        establishments = SanitaryEstablishment.objects.select_related(
            "business_type"
        ).all()
        return Response(SanitaryEstablishmentSerializer(establishments, many=True).data)

    serializer = SanitaryEstablishmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def sanitation_establishment_detail(request, establishment_id):
    establishment = get_object_or_404(SanitaryEstablishment, pk=establishment_id)

    if request.method == "GET":
        return Response(SanitaryEstablishmentSerializer(establishment).data)

    if request.method == "DELETE":
        establishment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = SanitaryEstablishmentSerializer(
        establishment,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "POST"])
def sanitation_inspection_list(request):
    ensure_initial_sanitation_data()

    if request.method == "GET":
        inspections = SanitaryInspection.objects.select_related(
            "establishment",
            "establishment__business_type",
        ).prefetch_related("checklist_items")
        return Response(SanitaryInspectionSerializer(inspections, many=True).data)

    serializer = SanitaryInspectionCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    inspection = serializer.save()

    establishment = inspection.establishment
    establishment.compliance_status = inspection.status_after_inspection

    if inspection.status_after_inspection == "good_standing":
        establishment.permit_status = "active"
    elif inspection.status_after_inspection == "upcoming":
        establishment.permit_status = "renewal_due"
    elif inspection.status_after_inspection == "for_completion":
        establishment.permit_status = "conditional"
    elif inspection.status_after_inspection == "violation":
        establishment.permit_status = "suspended"

    establishment.save()

    return Response(
        SanitaryInspectionSerializer(inspection).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def sanitation_inspection_detail(request, inspection_id):
    inspection = get_object_or_404(SanitaryInspection, pk=inspection_id)

    if request.method == "GET":
        return Response(SanitaryInspectionSerializer(inspection).data)

    if request.method == "DELETE":
        inspection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = SanitaryInspectionCreateSerializer(
        inspection,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    inspection = serializer.save()

    return Response(SanitaryInspectionSerializer(inspection).data)


@api_view(["GET"])
def sanitation_permit_data(request):
    return Response(build_sanitation_permits_payload(request.query_params))


@api_view(["GET"])
def sanitation_submission_data(request):
    return Response(build_sanitation_submissions_payload(request.query_params))


@api_view(["GET"])
def sanitation_report_data(request):
    return Response(build_sanitation_reports_payload(request.query_params))

# ============================================================
# HOUSEHOLD SANITATION API
# ============================================================

def build_household_dashboard_payload():
    ensure_initial_household_data()

    records = HouseholdSanitationRecord.objects.all()
    total = records.count()

    with_sanitary_facility = records.exclude(toilet_type="none").count()
    with_water_access = records.filter(
        water_level__in=["level_2", "level_3"]
    ).count()
    at_risk = records.filter(status="violation").count()

    risk_by_barangay = []
    for barangay in records.values_list("barangay", flat=True).distinct():
        barangay_records = records.filter(barangay=barangay)
        violation_count = barangay_records.filter(status="violation").count()

        risk_by_barangay.append(
            {
                "barangay": barangay,
                "total": barangay_records.count(),
                "atRisk": violation_count,
                "forCompletion": barangay_records.filter(
                    status="for_completion"
                ).count(),
                "goodStanding": barangay_records.filter(
                    status="good_standing"
                ).count(),
            }
        )

    toilet_distribution = {
        "waterSealed": records.filter(toilet_type="water_sealed").count(),
        "pourFlush": records.filter(toilet_type="pour_flush").count(),
        "pitLatrine": records.filter(toilet_type="pit_latrine").count(),
        "none": records.filter(toilet_type="none").count(),
    }

    waste_distribution = {
        "collected": records.filter(waste_disposal="collected").count(),
        "composted": records.filter(waste_disposal="composted").count(),
        "burned": records.filter(waste_disposal="burned").count(),
        "dumped": records.filter(waste_disposal="dumped").count(),
    }

    water_distribution = {
        "level1": records.filter(water_level="level_1").count(),
        "level2": records.filter(water_level="level_2").count(),
        "level3": records.filter(water_level="level_3").count(),
    }

    return {
        "summary": {
            "totalHouseholds": total,
            "withSanitaryFacility": with_sanitary_facility,
            "sanitaryFacilityCoverage": round(
                (with_sanitary_facility / total) * 100
            )
            if total
            else 0,
            "withWaterAccess": with_water_access,
            "waterAccessCoverage": round((with_water_access / total) * 100)
            if total
            else 0,
            "atRiskHouseholds": at_risk,
        },
        "riskByBarangay": risk_by_barangay,
        "toiletDistribution": toilet_distribution,
        "wasteDistribution": waste_distribution,
        "waterDistribution": water_distribution,
    }


@api_view(["GET"])
def household_bootstrap_data(request):
    ensure_initial_household_data()

    records = HouseholdSanitationRecord.objects.all()

    return Response(
        {
            "householdRecords": HouseholdSanitationRecordSerializer(
                records,
                many=True,
            ).data,
            "householdDashboardData": build_household_dashboard_payload(),
        }
    )


@api_view(["GET"])
def household_dashboard_data(request):
    return Response(build_household_dashboard_payload())


@api_view(["GET", "POST"])
def household_record_list(request):
    ensure_initial_household_data()

    if request.method == "GET":
        records = HouseholdSanitationRecord.objects.all()
        return Response(
            HouseholdSanitationRecordSerializer(records, many=True).data
        )

    serializer = HouseholdSanitationRecordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()

    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def household_record_detail(request, household_id):
    record = get_object_or_404(HouseholdSanitationRecord, pk=household_id)

    if request.method == "GET":
        return Response(HouseholdSanitationRecordSerializer(record).data)

    if request.method == "DELETE":
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = HouseholdSanitationRecordSerializer(
        record,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()

    return Response(serializer.data)