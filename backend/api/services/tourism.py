from datetime import timedelta

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone

from ..models import (
    BOOKING_STATUS_ARRIVED,
    BOOKING_STATUS_NO_SHOW,
    BOOKING_STATUS_PENDING,
    BoatType,
    Country,
    Itinerary,
    Province,
    Region,
    Resort,
    TouristRecord,
    TravelMode,
    VisitPurpose,
)
from ..serializers import (
    BoatTypeSerializer,
    CountrySerializer,
    ItinerarySerializer,
    ProvinceSerializer,
    RegionSerializer,
    ResortSerializer,
    TravelModeSerializer,
    VisitPurposeSerializer,
)


ARRIVAL_FEE_PER_VISITOR = 300


REFERENCE_TABLE_SERIALIZERS = {
    "countries": (Country, CountrySerializer),
    "regions": (Region, RegionSerializer),
    "provinces": (Province, ProvinceSerializer),
    "itineraries": (Itinerary, ItinerarySerializer),
    "travelModes": (TravelMode, TravelModeSerializer),
    "boatTypes": (BoatType, BoatTypeSerializer),
    "visitPurposes": (VisitPurpose, VisitPurposeSerializer),
    "resorts": (Resort, ResortSerializer),
}


def build_reference_tables_payload():
    payload = {}

    for payload_key, (model, serializer_class) in REFERENCE_TABLE_SERIALIZERS.items():
        payload[payload_key] = serializer_class(model.objects.all(), many=True).data

    return payload


def build_arrival_monitoring_payload():
    records = (
        TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
        .select_related("itinerary", "resort")
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
        overnight, same_day = get_stay_counts(record)
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
                "itinerary": record.itinerary.name,
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
    records = TouristRecord.objects.select_related(
        "country",
        "region",
        "province",
        "resort",
    ).all()

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
                "region_id": record.region_id,
                "region_name": record.region.name,
                "province_id": record.province_id,
                "province_name": record.province.name,
                "country_of_origin": record.country_of_origin,
                "total_visitors": record.total_visitors,
                "arrival_date": record.arrival_date.isoformat(),
                "resort_id": record.resort_id,
                "resort_name": record.resort.resort_name,
                "parking_space": record.parking_space,
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
    arrived_records = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED
    ).select_related("itinerary", "province", "resort")
    latest_date = all_records.aggregate(latest=Max("arrival_date"))["latest"]
    reporting_date = latest_date or timezone.localdate()
    week_start = reporting_date - timedelta(days=6)
    month_start = reporting_date.replace(day=1)

    today_records = arrived_records.filter(arrival_date=reporting_date)
    week_records = arrived_records.filter(arrival_date__range=(week_start, reporting_date))
    month_records = arrived_records.filter(arrival_date__gte=month_start)
    pending_for_date = all_records.filter(
        status=BOOKING_STATUS_PENDING,
        arrival_date=reporting_date,
    ).count()
    no_show_count = all_records.filter(status=BOOKING_STATUS_NO_SHOW).count()

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
        record_overnight, record_same_day = get_stay_counts(record)
        day_tour += record_same_day
        overnight += record_overnight

    duplicate_contacts = (
        all_records.exclude(contact_number="")
        .values("contact_number")
        .annotate(total=Count("survey_id"))
        .filter(total__gt=1)
        .count()
    )
    verified_entries = all_records.count()

    total_revenue = sum_visitors(arrived_records) * ARRIVAL_FEE_PER_VISITOR
    top_resort = (
        month_records.values("resort__resort_name")
        .annotate(visitors=Sum("total_visitors"))
        .order_by("-visitors", "resort__resort_name")
        .first()
    )
    top_origin = (
        month_records.values("province__name")
        .annotate(visitors=Sum("total_visitors"))
        .order_by("-visitors", "province__name")
        .first()
    )
    total_bookings = all_records.count()

    return {
        "reportingDate": reporting_date.isoformat(),
        "feePerVisitor": ARRIVAL_FEE_PER_VISITOR,
        "metrics": {
            "todayArrivals": sum_visitors(today_records),
            "weekArrivals": sum_visitors(week_records),
            "monthArrivals": sum_visitors(month_records),
            "totalRevenueCollected": total_revenue,
            "pendingForReportingDate": pending_for_date,
            "noShowRate": round((no_show_count / total_bookings) * 100, 1)
            if total_bookings
            else 0,
            "topResortThisMonth": top_resort["resort__resort_name"]
            if top_resort
            else "No arrivals yet",
            "topOriginThisMonth": top_origin["province__name"]
            if top_origin
            else "No arrivals yet",
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
    ).select_related("province", "resort", "travel_mode", "visit_purpose")

    if report_type == "no_show":
        records = TouristRecord.objects.filter(
            status=BOOKING_STATUS_NO_SHOW
        ).select_related("province", "resort", "travel_mode", "visit_purpose")

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
                round(row["revenue"] / row["visitors"]) if row["visitors"] else 0
            )

            totals["visitors"] += row["visitors"]
            totals["revenue"] += row["revenue"]
            rows.append(row)

    elif report_type == "origin":
        grouped = (
            records.values("province__name")
            .annotate(visitors=Sum("total_visitors"))
            .order_by("-visitors", "province__name")
        )

        for item in grouped:
            visitors = item["visitors"] or 0
            revenue = visitors * ARRIVAL_FEE_PER_VISITOR
            totals["visitors"] += visitors
            totals["revenue"] += revenue
            rows.append(
                {
                    "id": item["province__name"] or "Unspecified",
                    "name": item["province__name"] or "Unspecified",
                    "visitors": visitors,
                    "revenue": revenue,
                    "avg": round(revenue / visitors) if visitors else 0,
                }
            )

    elif report_type == "purpose":
        grouped = (
            records.values("visit_purpose__name")
            .annotate(visitors=Sum("total_visitors"))
            .order_by("-visitors", "visit_purpose__name")
        )

        for item in grouped:
            visitors = item["visitors"] or 0
            revenue = visitors * ARRIVAL_FEE_PER_VISITOR
            totals["visitors"] += visitors
            totals["revenue"] += revenue
            rows.append(
                {
                    "id": item["visit_purpose__name"] or "Unspecified",
                    "name": item["visit_purpose__name"] or "Unspecified",
                    "visitors": visitors,
                    "revenue": revenue,
                    "avg": round(revenue / visitors) if visitors else 0,
                }
            )

    elif report_type == "transport":
        grouped = (
            records.values("travel_mode__name")
            .annotate(visitors=Sum("total_visitors"))
            .order_by("-visitors", "travel_mode__name")
        )

        for item in grouped:
            visitors = item["visitors"] or 0
            revenue = visitors * ARRIVAL_FEE_PER_VISITOR
            totals["visitors"] += visitors
            totals["revenue"] += revenue
            rows.append(
                {
                    "id": item["travel_mode__name"] or "Unspecified",
                    "name": item["travel_mode__name"] or "Unspecified",
                    "visitors": visitors,
                    "revenue": revenue,
                    "avg": round(revenue / visitors) if visitors else 0,
                }
            )

    elif report_type == "no_show":
        grouped = (
            records.values("resort__resort_name")
            .annotate(visitors=Sum("total_visitors"))
            .order_by("-visitors", "resort__resort_name")
        )

        for item in grouped:
            visitors = item["visitors"] or 0
            totals["visitors"] += visitors
            rows.append(
                {
                    "id": item["resort__resort_name"] or "Unspecified",
                    "name": item["resort__resort_name"] or "Unspecified",
                    "visitors": visitors,
                    "revenue": 0,
                    "avg": 0,
                }
            )

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


def sum_visitors(queryset):
    return queryset.aggregate(total=Sum("total_visitors"))["total"] or 0


def get_stay_counts(record):
    itinerary_name = (record.itinerary.name if record.itinerary_id else "").lower()

    if "day" in itinerary_name or "same" in itinerary_name:
        return 0, record.total_visitors

    return record.total_visitors, 0
