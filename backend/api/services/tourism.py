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
DEFAULT_TOURISM_REPORTING_YEAR = str(timezone.now().year)
TOURISM_REPORTING_YEAR_CHOICES = ("2024", "2025", "2026")
ALL_TOURISM_REPORTING_YEARS = "all"


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


TOURIST_RECORD_PAYLOAD_FIELDS = [
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


def build_reference_tables_payload():
    payload = {}

    for payload_key, (model, serializer_class) in REFERENCE_TABLE_SERIALIZERS.items():
        payload[payload_key] = serializer_class(model.objects.all(), many=True).data

    return payload


def build_tourist_records_payload(queryset=None):
    queryset = queryset or TouristRecord.objects.all()
    rows = []

    for record in queryset.values(*TOURIST_RECORD_PAYLOAD_FIELDS):
        submitted_at = record["submitted_at"]
        arrival_date = record["arrival_date"]
        rows.append(
            {
                **record,
                "submitted_at": submitted_at.isoformat() if submitted_at else None,
                "arrival_date": arrival_date.isoformat() if arrival_date else None,
            }
        )

    return rows


def parse_positive_int(value, default):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    return parsed if parsed > 0 else default


def get_reporting_year(params=None):
    params = params or {}
    raw_year = str(
        params.get("year", DEFAULT_TOURISM_REPORTING_YEAR) or ""
    ).strip()

    if raw_year.lower() == ALL_TOURISM_REPORTING_YEARS:
        return ALL_TOURISM_REPORTING_YEARS

    if raw_year in TOURISM_REPORTING_YEAR_CHOICES:
        return raw_year

    return DEFAULT_TOURISM_REPORTING_YEAR


def apply_reporting_year(queryset, reporting_year):
    if reporting_year == ALL_TOURISM_REPORTING_YEARS:
        return queryset

    return queryset.filter(arrival_date__year=int(reporting_year))


def build_arrival_monitoring_payload(params=None):
    params = params or {}
    reporting_year = get_reporting_year(params)
    date_from = (params.get("from") or "").strip()
    date_to = (params.get("to") or "").strip()

    records = apply_reporting_year(
        TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED),
        reporting_year,
    ).select_related("itinerary", "resort")

    if date_from:
        records = records.filter(arrival_date__gte=date_from)

    if date_to:
        records = records.filter(arrival_date__lte=date_to)

    records = records.order_by("-arrival_date", "survey_id")

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
        "filters": {
            "year": reporting_year,
            "from": date_from,
            "to": date_to,
        },
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
    reporting_year = get_reporting_year(params)
    records = apply_reporting_year(TouristRecord.objects.all(), reporting_year)

    search = (params.get("search") or "").strip()
    status_filter = (params.get("status") or "").strip()
    resort_id = (params.get("resort_id") or "").strip()
    region_id = (params.get("region_id") or "").strip()
    province_id = (params.get("province_id") or "").strip()
    date_from = (params.get("from") or "").strip()
    date_to = (params.get("to") or "").strip()
    page = parse_positive_int(params.get("page"), 1)
    page_size = min(parse_positive_int(params.get("page_size"), 10), 100)

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

    if region_id:
        records = records.filter(region_id=region_id)

    if province_id:
        records = records.filter(province_id=province_id)

    if date_from:
        records = records.filter(arrival_date__gte=date_from)

    if date_to:
        records = records.filter(arrival_date__lte=date_to)

    filtered_count = records.count()
    total_pages = max(1, (filtered_count + page_size - 1) // page_size)
    page = min(page, total_pages)
    offset = (page - 1) * page_size
    records = records.order_by("-arrival_date", "survey_id")
    page_records = records[offset : offset + page_size]

    status_labels = dict(TouristRecord._meta.get_field("status").choices)
    rows = [
        {
            "survey_id": record["survey_id"],
            "submitted_at": (
                record["submitted_at"].isoformat()
                if record["submitted_at"]
                else None
            ),
            "email": record["email"],
            "consent_confirmed": record["consent_confirmed"],
            "full_name": record["full_name"],
            "contact_number": record["contact_number"],
            "country_id": record["country_id"],
            "country_name": record["country__name"],
            "region_id": record["region_id"],
            "region_name": record["region__name"],
            "province_id": record["province_id"],
            "province_name": record["province__name"],
            "country_of_origin": record["country_of_origin"],
            "foreigner_count": record["foreigner_count"],
            "filipino_count": record["filipino_count"],
            "maubanin_count": record["maubanin_count"],
            "total_visitors": record["total_visitors"],
            "total_male": record["total_male"],
            "total_female": record["total_female"],
            "special_group_count": record["special_group_count"],
            "age_0_7": record["age_0_7"],
            "age_8_59": record["age_8_59"],
            "age_60_above": record["age_60_above"],
            "arrival_date": record["arrival_date"].isoformat(),
            "itinerary_id": record["itinerary_id"],
            "itinerary_name": record["itinerary__name"],
            "resort_id": record["resort_id"],
            "resort_name": record["resort__resort_name"],
            "travel_mode_id": record["travel_mode_id"],
            "travel_mode_name": record["travel_mode__name"],
            "boat_type_id": record["boat_type_id"],
            "boat_type_name": record["boat_type__name"],
            "boat_capacity_fare": record["boat_capacity_fare"],
            "parking_space": record["parking_space"],
            "visit_purpose_id": record["visit_purpose_id"],
            "visit_purpose_name": record["visit_purpose__name"],
            "status": record["status"],
            "status_label": status_labels.get(record["status"], record["status"]),
        }
        for record in page_records.values(
            "survey_id",
            "submitted_at",
            "email",
            "consent_confirmed",
            "full_name",
            "contact_number",
            "country_id",
            "country__name",
            "region_id",
            "region__name",
            "province_id",
            "province__name",
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
            "itinerary__name",
            "resort_id",
            "resort__resort_name",
            "travel_mode_id",
            "travel_mode__name",
            "boat_type_id",
            "boat_type__name",
            "boat_capacity_fare",
            "parking_space",
            "visit_purpose_id",
            "visit_purpose__name",
            "status",
        )
    ]

    summary_records = apply_reporting_year(
        TouristRecord.objects.all(),
        reporting_year,
    )
    summary = summary_records.aggregate(
        verifiedEntries=Count("survey_id"),
        pending=Count("survey_id", filter=Q(status=BOOKING_STATUS_PENDING)),
        arrived=Count("survey_id", filter=Q(status=BOOKING_STATUS_ARRIVED)),
        noShow=Count("survey_id", filter=Q(status=BOOKING_STATUS_NO_SHOW)),
    )

    return {
        "filters": {
            "year": reporting_year,
            "search": search,
            "status": status_filter,
            "resort_id": resort_id,
            "region_id": region_id,
            "province_id": province_id,
            "from": date_from,
            "to": date_to,
        },
        "summary": {
            "verifiedEntries": summary["verifiedEntries"],
            "pending": summary["pending"],
            "arrived": summary["arrived"],
            "noShow": summary["noShow"],
        },
        "pagination": {
            "page": page,
            "pageSize": page_size,
            "total": filtered_count,
            "totalPages": total_pages,
            "hasPrevious": page > 1,
            "hasNext": page < total_pages,
            "showingStart": offset + 1 if filtered_count else 0,
            "showingEnd": min(offset + page_size, filtered_count),
        },
        "rows": rows,
    }


def build_dashboard_payload(params=None):
    reporting_year = get_reporting_year(params)
    all_records = apply_reporting_year(TouristRecord.objects.all(), reporting_year)
    arrived_records = apply_reporting_year(
        TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED),
        reporting_year,
    )
    latest_date = all_records.aggregate(latest=Max("arrival_date"))["latest"]
    reporting_date = latest_date or timezone.localdate()
    week_start = reporting_date - timedelta(days=6)
    month_start = reporting_date.replace(day=1)

    month_records = arrived_records.filter(arrival_date__gte=month_start)

    record_summary = all_records.aggregate(
        total_bookings=Count("survey_id"),
        pending_for_date=Count(
            "survey_id",
            filter=Q(
                status=BOOKING_STATUS_PENDING,
                arrival_date=reporting_date,
            ),
        ),
        no_show_count=Count(
            "survey_id",
            filter=Q(status=BOOKING_STATUS_NO_SHOW),
        ),
    )
    arrived_summary = arrived_records.aggregate(
        today_arrivals=Sum(
            "total_visitors",
            filter=Q(arrival_date=reporting_date),
        ),
        week_arrivals=Sum(
            "total_visitors",
            filter=Q(arrival_date__range=(week_start, reporting_date)),
        ),
        month_arrivals=Sum(
            "total_visitors",
            filter=Q(arrival_date__gte=month_start),
        ),
        total_arrivals=Sum("total_visitors"),
        filipino=Sum("filipino_count"),
        maubanin=Sum("maubanin_count"),
        foreign=Sum("foreigner_count"),
        male=Sum("total_male"),
        female=Sum("total_female"),
    )

    trend_labels = []
    trend_values = []
    trend_values_by_date = {
        item["arrival_date"]: item["total"] or 0
        for item in arrived_records.filter(
            arrival_date__range=(week_start, reporting_date),
        )
        .values("arrival_date")
        .annotate(total=Sum("total_visitors"))
    }
    for offset in range(6, -1, -1):
        day = reporting_date - timedelta(days=offset)
        trend_labels.append(day.strftime("%b %d"))
        trend_values.append(trend_values_by_date.get(day, 0))

    day_tour = 0
    overnight = 0
    for item in (
        arrived_records.values("itinerary__name")
        .annotate(total=Sum("total_visitors"))
    ):
        itinerary_name = (item["itinerary__name"] or "").lower()
        if "day" in itinerary_name or "same" in itinerary_name:
            day_tour += item["total"] or 0
        else:
            overnight += item["total"] or 0

    duplicate_contacts = (
        all_records.exclude(contact_number="")
        .values("contact_number")
        .annotate(total=Count("survey_id"))
        .filter(total__gt=1)
        .count()
    )

    total_arrivals = arrived_summary["total_arrivals"] or 0
    total_revenue = total_arrivals * ARRIVAL_FEE_PER_VISITOR
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
    total_bookings = record_summary["total_bookings"] or 0
    no_show_count = record_summary["no_show_count"] or 0

    return {
        "filters": {
            "year": reporting_year,
        },
        "reportingDate": reporting_date.isoformat(),
        "feePerVisitor": ARRIVAL_FEE_PER_VISITOR,
        "metrics": {
            "todayArrivals": arrived_summary["today_arrivals"] or 0,
            "weekArrivals": arrived_summary["week_arrivals"] or 0,
            "monthArrivals": arrived_summary["month_arrivals"] or 0,
            "totalRevenueCollected": total_revenue,
            "pendingForReportingDate": record_summary["pending_for_date"] or 0,
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
            "filipino": arrived_summary["filipino"] or 0,
            "maubanin": arrived_summary["maubanin"] or 0,
            "foreign": arrived_summary["foreign"] or 0,
        },
        "gender": {
            "male": arrived_summary["male"] or 0,
            "female": arrived_summary["female"] or 0,
        },
        "stayType": {
            "dayTour": day_tour,
            "overnight": overnight,
        },
        "validation": {
            "verifiedEntries": total_bookings,
            "invalidEntries": 0,
            "duplicateEntries": duplicate_contacts,
        },
    }


def build_reports_payload(params=None):
    params = params or {}

    report_type = params.get("type", "resort")
    reporting_year = get_reporting_year(params)
    date_from = params.get("from")
    date_to = params.get("to")
    resort_id = params.get("resort_id")
    include_questions = params.get("include_questions", True)
    if isinstance(include_questions, str):
        include_questions = include_questions.lower() not in {"0", "false", "no"}

    records = apply_reporting_year(
        TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED),
        reporting_year,
    ).select_related("province", "resort", "travel_mode", "visit_purpose")

    if report_type == "no_show":
        records = apply_reporting_year(
            TouristRecord.objects.filter(status=BOOKING_STATUS_NO_SHOW),
            reporting_year,
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
        resort_queryset = Resort.objects.order_by("resort_name")
        resort_totals = {
            item["resort_id"]: item["visitors"] or 0
            for item in records.values("resort_id")
            .annotate(visitors=Sum("total_visitors"))
        }

        if resort_id:
            resort_queryset = resort_queryset.filter(resort_id=resort_id)
        else:
            resort_queryset = resort_queryset.filter(resort_id__in=resort_totals.keys())

        for resort in resort_queryset:
            visitors = resort_totals.get(resort.resort_id, 0)

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

        if not resort_id:
            rows.sort(key=lambda row: (-row["visitors"], row["name"]))

    return {
        "type": report_type,
        "filters": {
            "year": reporting_year,
            "type": report_type,
            "from": date_from or "",
            "to": date_to or "",
            "resort_id": resort_id or "",
        },
        "feePerVisitor": ARRIVAL_FEE_PER_VISITOR,
        "rows": rows,
        "questionAnswers": build_tourism_question_answers(params)
        if include_questions
        else [],
        "totals": {
            "visitors": totals["visitors"],
            "revenue": totals["revenue"],
            "avg": round(totals["revenue"] / totals["visitors"])
            if totals["visitors"]
            else 0,
        },
    }


def build_tourism_question_answers(params=None):
    params = params or {}
    reporting_year = get_reporting_year(params)
    date_from = params.get("from")
    date_to = params.get("to")

    arrived = apply_reporting_year(
        TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED),
        reporting_year,
    ).select_related("itinerary", "province", "region", "country", "resort", "visit_purpose")
    all_records = apply_reporting_year(
        TouristRecord.objects.select_related("itinerary", "resort"),
        reporting_year,
    )

    if date_from:
        arrived = arrived.filter(arrival_date__gte=date_from)
        all_records = all_records.filter(arrival_date__gte=date_from)

    if date_to:
        arrived = arrived.filter(arrival_date__lte=date_to)
        all_records = all_records.filter(arrival_date__lte=date_to)

    total_visitors = sum_visitors(arrived)
    top_resort = top_group(arrived, "resort__resort_name")
    previous_month, current_month = get_month_comparison(arrived)
    peak_month = get_peak_month(arrived)
    classification = arrived.aggregate(
        filipino=Sum("filipino_count"),
        maubanin=Sum("maubanin_count"),
        foreign=Sum("foreigner_count"),
    )
    same_day = 0
    overnight = 0
    stay_nights_total = 0
    overnight_by_resort = {}

    for record in arrived:
        record_overnight, record_same_day = get_stay_counts(record)
        same_day += record_same_day
        overnight += record_overnight
        nights = estimate_stay_nights(record)
        stay_nights_total += nights * record.total_visitors

        if nights > 0:
            resort_name = record.resort.resort_name
            overnight_by_resort[resort_name] = (
                overnight_by_resort.get(resort_name, 0) + record.total_visitors
            )

    top_overnight_resort = max(
        overnight_by_resort.items(),
        key=lambda item: item[1],
        default=("", 0),
    )
    top_origin = first_non_empty(
        [
            top_group(arrived, "province__name"),
            top_group(arrived, "region__name"),
            top_group(arrived, "country__name"),
        ]
    )
    top_purpose = top_group(arrived, "visit_purpose__name")
    demand = get_recent_demand_signal(arrived)
    validation = get_validation_summary(all_records)
    average_stay = round(stay_nights_total / total_visitors, 1) if total_visitors else 0

    return [
        {
            "id": "top_resort",
            "question": "Which resort or tourist destination receives the highest number of tourist arrivals within a selected date range?",
            "answer": format_top_answer(top_resort, total_visitors, "visitors"),
            "visual": build_share_visual(top_resort["name"], top_resort["total"], total_visitors),
        },
        {
            "id": "month_compare",
            "question": "How do tourist arrivals this month compare with the previous month?",
            "answer": format_month_comparison(previous_month, current_month),
            "visual": {
                "type": "comparison",
                "items": [
                    {"label": previous_month["label"], "value": previous_month["total"]},
                    {"label": current_month["label"], "value": current_month["total"]},
                ],
            },
        },
        {
            "id": "peak_month",
            "question": "Which month or season records the highest number of tourist arrivals in Mauban?",
            "answer": format_top_answer(peak_month, peak_month.get("total", 0), "visitors"),
            "visual": build_share_visual(peak_month["name"], peak_month["total"], peak_month.get("total", 0)),
        },
        {
            "id": "classification",
            "question": "What is the breakdown of tourists by visitor classification: Filipino, foreigner, and Maubanin?",
            "answer": (
                f"Filipino: {classification['filipino'] or 0}, "
                f"Foreigner: {classification['foreign'] or 0}, "
                f"Maubanin: {classification['maubanin'] or 0}."
            ),
            "visual": {
                "type": "stack",
                "items": [
                    {"label": "Filipino", "value": classification["filipino"] or 0},
                    {"label": "Foreigner", "value": classification["foreign"] or 0},
                    {"label": "Maubanin", "value": classification["maubanin"] or 0},
                ],
            },
        },
        {
            "id": "stay_type",
            "question": "How many tourists are same-day visitors compared to overnight or multi-day visitors?",
            "answer": f"Same-day visitors: {same_day}; overnight or multi-day visitors: {overnight}.",
            "visual": {
                "type": "split",
                "items": [
                    {"label": "Same-day", "value": same_day},
                    {"label": "Overnight / multi-day", "value": overnight},
                ],
            },
        },
        {
            "id": "overnight_resort",
            "question": "Which resort or destination records the highest number of overnight stays?",
            "answer": (
                f"{top_overnight_resort[0]} has the highest overnight demand with "
                f"{top_overnight_resort[1]} visitors."
                if top_overnight_resort[0]
                else "No overnight stays are recorded yet."
            ),
            "visual": build_share_visual(top_overnight_resort[0], top_overnight_resort[1], overnight),
        },
        {
            "id": "average_stay",
            "question": "What is the average length of stay of tourists based on recorded arrival and stay data?",
            "answer": f"The estimated average stay is {average_stay} night(s) per visitor based on itinerary labels.",
            "visual": {
                "type": "metric",
                "label": "Average stay",
                "value": average_stay,
                "unit": "night(s)",
            },
        },
        {
            "id": "top_origin",
            "question": "Which province, region, or country contributes the highest number of tourist arrivals?",
            "answer": format_top_answer(top_origin, total_visitors, "visitors"),
            "visual": build_share_visual(top_origin["name"], top_origin["total"], total_visitors),
        },
        {
            "id": "visit_purpose",
            "question": "What are the most common visit purposes of tourists, such as leisure, business, or other purposes?",
            "answer": format_top_answer(top_purpose, total_visitors, "visitors"),
            "visual": build_share_visual(top_purpose["name"], top_purpose["total"], total_visitors),
        },
        {
            "id": "high_demand",
            "question": "Which resorts or destinations may experience high visitor demand based on recent arrival trends?",
            "answer": demand,
            "visual": get_recent_demand_visual(arrived),
        },
        {
            "id": "validation",
            "question": "Which tourist records need validation due to pending status, no-show status, duplicate entries, or incomplete information?",
            "answer": validation,
            "visual": get_validation_visual(all_records),
        },
    ]


def sum_visitors(queryset):
    return queryset.aggregate(total=Sum("total_visitors"))["total"] or 0


def get_stay_counts(record):
    itinerary_name = (record.itinerary.name if record.itinerary_id else "").lower()

    if "day" in itinerary_name or "same" in itinerary_name:
        return 0, record.total_visitors

    return record.total_visitors, 0


def estimate_stay_nights(record):
    itinerary_name = (record.itinerary.name if record.itinerary_id else "").lower()

    if "day" in itinerary_name or "same" in itinerary_name:
        return 0

    if "2" in itinerary_name:
        return 2

    if "3" in itinerary_name:
        return 3

    if "4" in itinerary_name:
        return 4

    if "5" in itinerary_name:
        return 5

    return 1


def top_group(queryset, group_field):
    item = (
        queryset.values(group_field)
        .annotate(total=Sum("total_visitors"))
        .order_by("-total", group_field)
        .first()
    )

    if not item:
        return {"name": "", "total": 0}

    return {"name": item.get(group_field) or "Unspecified", "total": item["total"] or 0}


def first_non_empty(items):
    for item in items:
        if item.get("name"):
            return item
    return {"name": "", "total": 0}


def format_top_answer(item, denominator, unit):
    if not item.get("name"):
        return "No matching records are available yet."

    percentage = round((item["total"] / denominator) * 100, 1) if denominator else 0
    return f"{item['name']} leads with {item['total']} {unit}, equal to {percentage}% of the selected total."


def get_month_comparison(arrived_records=None):
    if arrived_records is None:
        arrived_records = TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
    latest_date = arrived_records.aggregate(latest=Max("arrival_date"))["latest"]
    if not latest_date:
        return {"label": "Previous month", "total": 0}, {"label": "Current month", "total": 0}

    current_start = latest_date.replace(day=1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end.replace(day=1)

    current = arrived_records.filter(
        arrival_date__gte=current_start,
        arrival_date__lte=latest_date,
    )
    previous = arrived_records.filter(
        arrival_date__gte=previous_start,
        arrival_date__lte=previous_end,
    )

    return (
        {"label": previous_start.strftime("%B %Y"), "total": sum_visitors(previous)},
        {"label": current_start.strftime("%B %Y"), "total": sum_visitors(current)},
    )


def format_month_comparison(previous, current):
    difference = current["total"] - previous["total"]
    direction = "higher" if difference >= 0 else "lower"
    return (
        f"{current['label']} has {current['total']} visitors, which is "
        f"{abs(difference)} {direction} than {previous['label']} ({previous['total']})."
    )


def get_peak_month(arrived_records=None):
    monthly_data = {}
    records = (
        arrived_records
        if arrived_records is not None
        else TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
    )

    for record in records:
        key = record.arrival_date.strftime("%Y-%m")
        monthly_data.setdefault(
            key,
            {"name": record.arrival_date.strftime("%B %Y"), "total": 0},
        )
        monthly_data[key]["total"] += record.total_visitors

    if not monthly_data:
        return {"name": "", "total": 0}

    return max(monthly_data.values(), key=lambda item: item["total"])


def get_recent_demand_signal(arrived_records=None):
    if arrived_records is None:
        arrived_records = TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
    latest_date = arrived_records.aggregate(latest=Max("arrival_date"))["latest"]
    if not latest_date:
        return "No recent arrival trend is available yet."

    recent_start = latest_date - timedelta(days=29)
    previous_start = recent_start - timedelta(days=30)
    previous_end = recent_start - timedelta(days=1)
    recent = arrived_records.filter(
        arrival_date__range=(recent_start, latest_date),
    )
    previous = arrived_records.filter(
        arrival_date__range=(previous_start, previous_end),
    )
    recent_top = top_group(recent, "resort__resort_name")
    previous_total = sum_visitors(previous.filter(resort__resort_name=recent_top["name"]))
    growth = recent_top["total"] - previous_total

    if not recent_top["name"]:
        return "No recent high-demand resort is available yet."

    return (
        f"{recent_top['name']} shows the strongest recent demand with "
        f"{recent_top['total']} visitors in the latest 30-day window "
        f"({growth:+d} versus the previous 30 days)."
    )


def get_recent_demand_visual(arrived_records=None):
    if arrived_records is None:
        arrived_records = TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)
    latest_date = arrived_records.aggregate(latest=Max("arrival_date"))["latest"]
    if not latest_date:
        return {"type": "comparison", "items": []}

    recent_start = latest_date - timedelta(days=29)
    previous_start = recent_start - timedelta(days=30)
    previous_end = recent_start - timedelta(days=1)
    recent = arrived_records.filter(
        arrival_date__range=(recent_start, latest_date),
    )
    recent_top = top_group(recent, "resort__resort_name")
    previous_total = sum_visitors(
        arrived_records.filter(
            arrival_date__range=(previous_start, previous_end),
            resort__resort_name=recent_top["name"],
        )
    )

    return {
        "type": "comparison",
        "items": [
            {"label": "Previous 30 days", "value": previous_total},
            {"label": "Latest 30 days", "value": recent_top["total"]},
        ],
    }


def get_validation_summary(records):
    pending = records.filter(status=BOOKING_STATUS_PENDING).count()
    no_show = records.filter(status=BOOKING_STATUS_NO_SHOW).count()
    duplicates = (
        records.exclude(contact_number="")
        .values("full_name", "contact_number", "arrival_date", "resort_id")
        .annotate(total=Count("survey_id"))
        .filter(total__gt=1)
        .count()
    )
    incomplete = records.filter(
        Q(full_name="")
        | Q(contact_number="")
        | Q(total_visitors=0)
        | Q(total_male__isnull=True)
        | Q(total_female__isnull=True)
    ).count()

    return (
        f"Needs review: {pending} pending, {no_show} no-show, "
        f"{duplicates} possible duplicates, and {incomplete} incomplete records."
    )


def get_validation_visual(records):
    pending = records.filter(status=BOOKING_STATUS_PENDING).count()
    no_show = records.filter(status=BOOKING_STATUS_NO_SHOW).count()
    duplicates = (
        records.exclude(contact_number="")
        .values("full_name", "contact_number", "arrival_date", "resort_id")
        .annotate(total=Count("survey_id"))
        .filter(total__gt=1)
        .count()
    )
    incomplete = records.filter(
        Q(full_name="")
        | Q(contact_number="")
        | Q(total_visitors=0)
        | Q(total_male__isnull=True)
        | Q(total_female__isnull=True)
    ).count()

    return {
        "type": "stack",
        "items": [
            {"label": "Pending", "value": pending},
            {"label": "No-show", "value": no_show},
            {"label": "Duplicates", "value": duplicates},
            {"label": "Incomplete", "value": incomplete},
        ],
    }


def build_share_visual(label, value, total):
    return {
        "type": "share",
        "label": label or "No data",
        "value": value or 0,
        "total": total or 0,
        "percentage": round(((value or 0) / total) * 100, 1) if total else 0,
    }
