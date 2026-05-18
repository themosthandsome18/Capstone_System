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
        "questionAnswers": build_tourism_question_answers(params),
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
    date_from = params.get("from")
    date_to = params.get("to")

    arrived = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED
    ).select_related("itinerary", "province", "region", "country", "resort", "visit_purpose")
    all_records = TouristRecord.objects.select_related("itinerary", "resort")

    if date_from:
        arrived = arrived.filter(arrival_date__gte=date_from)
        all_records = all_records.filter(arrival_date__gte=date_from)

    if date_to:
        arrived = arrived.filter(arrival_date__lte=date_to)
        all_records = all_records.filter(arrival_date__lte=date_to)

    total_visitors = sum_visitors(arrived)
    top_resort = top_group(arrived, "resort__resort_name")
    previous_month, current_month = get_month_comparison()
    peak_month = get_peak_month()
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
    demand = get_recent_demand_signal()
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
            "visual": get_recent_demand_visual(),
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


def get_month_comparison():
    latest_date = TouristRecord.objects.aggregate(latest=Max("arrival_date"))["latest"]
    if not latest_date:
        return {"label": "Previous month", "total": 0}, {"label": "Current month", "total": 0}

    current_start = latest_date.replace(day=1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end.replace(day=1)

    current = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED,
        arrival_date__gte=current_start,
        arrival_date__lte=latest_date,
    )
    previous = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED,
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


def get_peak_month():
    monthly_data = {}
    records = TouristRecord.objects.filter(status=BOOKING_STATUS_ARRIVED)

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


def get_recent_demand_signal():
    latest_date = TouristRecord.objects.aggregate(latest=Max("arrival_date"))["latest"]
    if not latest_date:
        return "No recent arrival trend is available yet."

    recent_start = latest_date - timedelta(days=29)
    previous_start = recent_start - timedelta(days=30)
    previous_end = recent_start - timedelta(days=1)
    recent = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED,
        arrival_date__range=(recent_start, latest_date),
    )
    previous = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED,
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


def get_recent_demand_visual():
    latest_date = TouristRecord.objects.aggregate(latest=Max("arrival_date"))["latest"]
    if not latest_date:
        return {"type": "comparison", "items": []}

    recent_start = latest_date - timedelta(days=29)
    previous_start = recent_start - timedelta(days=30)
    previous_end = recent_start - timedelta(days=1)
    recent = TouristRecord.objects.filter(
        status=BOOKING_STATUS_ARRIVED,
        arrival_date__range=(recent_start, latest_date),
    )
    recent_top = top_group(recent, "resort__resort_name")
    previous_total = sum_visitors(
        TouristRecord.objects.filter(
            status=BOOKING_STATUS_ARRIVED,
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
