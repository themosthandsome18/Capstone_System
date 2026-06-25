import json
from datetime import timedelta
from urllib.parse import parse_qs, unquote, urlparse

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    COMPLAINT_PRIORITY_MEDIUM,
    COMPLAINT_STATUS_PENDING,
    COMPLAINT_STATUS_REJECTED,
    COMPLAINT_STATUS_RESOLVED,
    MODULE_SANITATION,
    MODULE_TOURISM,
    Barangay,
    BoatType,
    Country,
    FeedbackEntry,
    HouseholdSanitationRecord,
    Itinerary,
    Province,
    Region,
    Resort,
    SanitaryBusinessType,
    SanitaryComplaint,
    SanitaryEstablishment,
    SanitaryInspection,
    TravelMode,
    VisitPurpose,
)
from api.seeders import (
    ensure_initial_barangays,
    ensure_initial_household_data,
    ensure_initial_reference_data,
    ensure_initial_sanitation_data,
    generate_survey_id,
)
from api.serializers import (
    BarangaySerializer,
    FeedbackEntrySerializer,
    HouseholdSanitationRecordSerializer,
    ResortSerializer,
    SanitaryBusinessTypeSerializer,
    SanitaryComplaintSerializer,
    SanitaryInspectionCreateSerializer,
    SanitaryInspectionSerializer,
    TouristRecordSerializer,
)
from api.services.activity import log_activity
from api.services.sanitation import (
    generate_complaint_id,
    sync_establishment_after_inspection,
    with_establishment_rollups,
)
from api.services.tourism import build_reference_tables_payload


@api_view(["GET"])
@permission_classes([AllowAny])
def mobile_tourism_bootstrap(request):
    ensure_mobile_reference_data(include_barangays=True)

    destinations = get_mobile_top_destinations()

    return Response(
        {
            "referenceTables": build_reference_tables_payload(),
            "destinations": ResortSerializer(destinations, many=True).data,
            "featuredDestinations": ResortSerializer(destinations[:6], many=True).data,
            "barangays": BarangaySerializer(Barangay.objects.filter(is_active=True), many=True).data,
            "notifications": build_mobile_notifications(),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def mobile_destination_list(request):
    ensure_mobile_reference_data()

    destinations = get_mobile_destination_queryset()
    search = request.query_params.get("search", "").strip()
    destination_type = request.query_params.get("type", "").strip()

    if search:
        destinations = destinations.filter(
            Q(resort_name__icontains=search)
            | Q(location__icontains=search)
            | Q(short_description__icontains=search)
            | Q(type__icontains=search)
        )

    if destination_type:
        destinations = destinations.filter(type__iexact=destination_type)

    if not search and not destination_type:
        destinations = get_mobile_top_destinations()

    return Response(ResortSerializer(destinations, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def mobile_destination_detail(request, resort_id):
    ensure_mobile_reference_data()
    resort = get_object_or_404(
        get_mobile_destination_queryset(),
        resort_id=resort_id,
    )
    feedback = FeedbackEntry.objects.filter(destination=resort).order_by("-date", "-id")[:5]

    return Response(
        {
            "destination": ResortSerializer(resort).data,
            "recentFeedback": FeedbackEntrySerializer(feedback, many=True).data,
        }
    )


MOBILE_EXCLUDED_DESTINATION_NAMES = {
    "",
    ".",
    "+",
    "0.0",
    "A",
    "Day tour",
    "No resort",
    "Private Property",
    "Residence",
    "Transient",
    "Others / Private Residence",
}


def get_mobile_destination_queryset():
    from django.db.models import Count, Q
    from django.utils import timezone
    today = timezone.localdate()
    return Resort.objects.exclude(
        resort_name__in=MOBILE_EXCLUDED_DESTINATION_NAMES,
    ).exclude(resort_name__icontains="Kwebang").annotate(
        visitor_total=Count(
            "tourist_records",
            filter=Q(
                tourist_records__status="arrived",
                tourist_records__arrival_date__year=today.year,
                tourist_records__arrival_date__month=today.month
            )
        )
    )


def get_mobile_top_destinations(limit=10):
    destinations = (
        get_mobile_destination_queryset()
        .order_by("-visitor_total", "-monthly_arrivals", "-tourism_rating", "resort_name")
    )
    return list(destinations[:limit])


@api_view(["POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([AllowAny])
def mobile_tourist_registration(request):
    ensure_mobile_reference_data()

    data = normalize_mobile_visit_payload(request.data.copy())
    serializer = TouristRecordSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    record = serializer.save()

    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_CREATE,
        record,
        label=record.full_name,
        record_id=record.survey_id,
    )

    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([AllowAny])
def mobile_feedback_submit(request):
    ensure_mobile_reference_data()

    data = request.data.copy()
    destination_id = (
        data.get("destinationId")
        or data.get("destination_id")
        or data.get("resort_id")
    )
    data["destinationId"] = destination_id
    data["reviewer"] = data.get("reviewer") or data.get("full_name") or "Mobile User"
    data["date"] = data.get("date") or timezone.localdate().isoformat()
    data["title"] = data.get("title") or "Mobile tourism feedback"
    data["rating"] = parse_mobile_int(data.get("rating"), 5)
    data["status"] = data.get("status") or feedback_status_from_rating(data["rating"])
    data["message"] = append_sanitation_feedback(
        data.get("message") or data.get("comment") or "",
        data,
    )

    serializer = FeedbackEntrySerializer(data=data)
    serializer.is_valid(raise_exception=True)
    entry = serializer.save()

    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_CREATE,
        entry,
        label=entry.title,
        record_id=entry.pk,
    )

    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([AllowAny])
def mobile_sanitation_report_submit(request):
    ensure_mobile_barangays()

    data = request.data.copy()
    uploads = request.FILES.getlist("photo") or request.FILES.getlist("image")

    data["complaint_id"] = generate_complaint_id()
    data["complainant_name"] = (
        data.get("complainant_name") or data.get("full_name") or data.get("name") or ""
    )
    data["reported_date"] = data.get("reported_date") or timezone.localdate().isoformat()
    data["status"] = COMPLAINT_STATUS_PENDING
    data["priority"] = data.get("priority") or COMPLAINT_PRIORITY_MEDIUM
    data["category"] = data.get("category") or "Community sanitation concern"
    data["barangay"] = data.get("barangay") or "Unspecified"
    data["description"] = data.get("description") or data.get("message") or ""

    if uploads and not data.get("photo_documentation"):
        from django.core.files.storage import default_storage
        import time
        saved_urls = []
        for upload in uploads:
            filename = f"complaints/{int(time.time())}_{upload.name.replace(' ', '_')}"
            saved_path = default_storage.save(filename, upload)
            saved_urls.append(default_storage.url(saved_path))
        data["photo_documentation"] = ",".join(saved_urls)

    for field in ["latitude", "longitude"]:
        if data.get(field) in ("", None):
            data.pop(field, None)

    serializer = SanitaryComplaintSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    complaint = serializer.save()

    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_CREATE,
        complaint,
        label=complaint.category,
        record_id=complaint.complaint_id,
    )

    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def mobile_sanitation_report_history(request):
    ensure_mobile_barangays()

    contact = (request.query_params.get("contact") or "").strip()
    reference = (request.query_params.get("reference") or "").strip()

    if not contact and not reference:
        return Response(
            {"detail": "Enter a contact number or complaint ID."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    complaints = SanitaryComplaint.objects.all()

    if reference:
        complaints = complaints.filter(
            Q(complaint_id__iexact=reference)
            | Q(id=parse_mobile_int(reference, 0))
        )

    if contact:
        complaints = complaints.filter(contact_number__icontains=contact)

    complaints = complaints.order_by("-reported_date", "-id")[:30]

    return Response(
        {
            "rows": [
                serialize_mobile_sanitation_complaint(item)
                for item in complaints
            ],
            "summary": {
                "total": complaints.count(),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def mobile_sanitation_permit_verify(request):
    ensure_initial_sanitation_data()

    raw_code = (
        request.query_params.get("code")
        or request.query_params.get("permit_number")
        or request.query_params.get("reference")
        or ""
    )
    code = normalize_mobile_lookup_code(raw_code)

    if not code:
        return Response(
            {"detail": "Enter or scan a sanitary permit code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    query = Q(permit_number__iexact=code)
    numeric_id = parse_mobile_int(code, 0)
    if numeric_id:
        query |= Q(id=numeric_id)

    establishment = (
        SanitaryEstablishment.objects.select_related("business_type")
        .filter(query)
        .first()
    )

    if establishment is None:
        return Response(
            {
                "verified": False,
                "code": code,
                "detail": "No sanitary permit record matched this code.",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        {
            "verified": True,
            "code": code,
            "establishment": serialize_mobile_sanitation_establishment(
                establishment
            ),
            "permit": {
                "permit_number": establishment.permit_number,
                "permit_status": establishment.permit_status,
                "permit_status_label": establishment.get_permit_status_display(),
                "permit_issued_date": date_to_iso(
                    establishment.permit_issued_date
                ),
                "permit_expiry_date": date_to_iso(
                    establishment.permit_expiry_date
                ),
                "compliance_status": establishment.compliance_status,
                "compliance_status_label": (
                    establishment.get_compliance_status_display()
                ),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def mobile_sanitation_bootstrap(request):
    ensure_initial_sanitation_data()
    ensure_initial_household_data()
    ensure_mobile_barangays()

    establishments = with_establishment_rollups(
        SanitaryEstablishment.objects.select_related("business_type").all()
    )
    inspections = SanitaryInspection.objects.select_related(
        "establishment",
        "establishment__business_type",
    ).prefetch_related("checklist_items")[:25]
    household_records = HouseholdSanitationRecord.objects.all()
    complaints = SanitaryComplaint.objects.exclude(
        status__in=[COMPLAINT_STATUS_RESOLVED, COMPLAINT_STATUS_REJECTED]
    ).order_by("-reported_date", "-id")[:50]
    all_establishments = SanitaryEstablishment.objects.all()
    all_complaints = SanitaryComplaint.objects.all()

    return Response(
        {
            "businessTypes": SanitaryBusinessTypeSerializer(
                SanitaryBusinessType.objects.prefetch_related("requirements").all(),
                many=True,
            ).data,
            "establishments": [
                serialize_mobile_sanitation_establishment(item)
                for item in establishments
            ],
            "inspections": [
                serialize_mobile_sanitation_inspection(item) for item in inspections
            ],
            "dashboardData": {
                "summary": {
                    "totalEstablishments": all_establishments.count(),
                    "goodStanding": all_establishments.filter(
                        compliance_status="good_standing"
                    ).count(),
                    "forCompletion": all_establishments.filter(
                        compliance_status="for_completion"
                    ).count(),
                    "violators": all_establishments.filter(
                        compliance_status="violation"
                    ).count(),
                    "noPermit": all_establishments.filter(
                        permit_status="no_permit"
                    ).count(),
                }
            },
            "permitData": {
                "summary": {
                    "active": all_establishments.filter(
                        permit_status="active"
                    ).count(),
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
                "rows": [],
            },
            "complaintData": {
                "summary": {
                    "total": all_complaints.count(),
                    "pending": all_complaints.filter(
                        status=COMPLAINT_STATUS_PENDING
                    ).count(),
                    "open": all_complaints.exclude(
                        status__in=[
                            COMPLAINT_STATUS_RESOLVED,
                            COMPLAINT_STATUS_REJECTED,
                        ]
                    ).count(),
                },
                "rows": [
                    serialize_mobile_sanitation_complaint(item)
                    for item in complaints
                ],
            },
            "householdRecords": [
                serialize_mobile_household_record(item) for item in household_records
            ],
            "barangays": BarangaySerializer(
                Barangay.objects.filter(is_active=True),
                many=True,
            ).data,
            "notifications": build_mobile_sanitation_notifications(),
        }
    )


def serialize_mobile_sanitation_establishment(establishment):
    return {
        "id": establishment.id,
        "business_name": establishment.business_name,
        "owner_name": establishment.owner_name,
        "business_type": establishment.business_type_id,
        "business_type_name": establishment.business_type.name,
        "inspection_frequency": establishment.inspection_frequency,
        "permit_size": establishment.permit_size,
        "barangay": establishment.barangay,
        "address": establishment.address,
        "contact_number": establishment.contact_number,
        "has_permit": establishment.has_permit,
        "permit_number": establishment.permit_number,
        "permit_issued_date": date_to_iso(establishment.permit_issued_date),
        "permit_expiry_date": date_to_iso(establishment.permit_expiry_date),
        "compliance_status": establishment.compliance_status,
        "compliance_status_label": establishment.get_compliance_status_display(),
        "permit_status": establishment.permit_status,
        "permit_status_label": establishment.get_permit_status_display(),
        "latitude": establishment.latitude,
        "longitude": establishment.longitude,
        "open_complaints": getattr(establishment, "open_complaints_count", 0),
    }


def serialize_mobile_sanitation_inspection(inspection):
    establishment = inspection.establishment
    return {
        "id": inspection.id,
        "establishment": establishment.id,
        "establishment_name": establishment.business_name,
        "establishment_address": establishment.address,
        "business_type_name": establishment.business_type.name,
        "barangay": establishment.barangay,
        "inspector_name": inspection.inspector_name,
        "inspection_date": date_to_iso(inspection.inspection_date),
        "next_due_date": date_to_iso(inspection.next_due_date),
        "status_after_inspection": inspection.status_after_inspection,
        "status_after_inspection_label": (
            inspection.get_status_after_inspection_display()
        ),
    }


def serialize_mobile_sanitation_complaint(complaint):
    return {
        "id": complaint.id,
        "complaint_id": complaint.complaint_id,
        "category": complaint.category,
        "barangay": complaint.barangay,
        "reported_date": date_to_iso(complaint.reported_date),
        "status": complaint.status,
        "status_label": complaint.get_status_display(),
        "priority": complaint.priority,
        "description": complaint.description,
        "latitude": complaint.latitude,
        "longitude": complaint.longitude,
        "assigned_inspector": complaint.assigned_inspector,
        "inspection_scheduled_date": date_to_iso(
            complaint.inspection_scheduled_date
        ),
        "inspection_scheduled_time": (
            complaint.inspection_scheduled_time.strftime("%H:%M")
            if complaint.inspection_scheduled_time
            else ""
        ),
        "inspection_schedule_note": complaint.inspection_schedule_note,
        "inspection_notify_reporter": complaint.inspection_notify_reporter,
        "action_taken": complaint.action_taken,
        "resolved_date": date_to_iso(complaint.resolved_date),
    }


def serialize_mobile_household_record(record):
    return {
        "id": record.id,
        "household_code": record.household_code,
        "household_head": record.household_head,
        "barangay": record.barangay,
        "address": record.address,
        "male_count": record.male_count,
        "female_count": record.female_count,
        "toilet_type": record.toilet_type,
        "water_level": record.water_level,
        "water_source": record.water_source,
        "waste_disposal": record.waste_disposal,
        "status": record.status,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "last_survey_date": date_to_iso(record.last_survey_date),
    }


def date_to_iso(value):
    return value.isoformat() if value else ""


@api_view(["POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([AllowAny])
def mobile_sanitation_inspection_submit(request):
    ensure_initial_sanitation_data()

    data = request.data.copy()
    data["inspector_name"] = data.get("inspector_name") or data.get("inspector") or ""
    data["inspection_date"] = (
        data.get("inspection_date") or timezone.localdate().isoformat()
    )
    data["status_after_inspection"] = (
        data.get("status_after_inspection") or "good_standing"
    )
    data["is_draft"] = data.get("is_draft", False)
    upload = request.FILES.get("photo") or request.FILES.get("image")

    if upload and not data.get("photo_documentation"):
        from django.core.files.storage import default_storage
        import time
        filename = f"inspections/{int(time.time())}_{upload.name.replace(' ', '_')}"
        saved_path = default_storage.save(filename, upload)
        data["photo_documentation"] = default_storage.url(saved_path)

    serializer = SanitaryInspectionCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    inspection = serializer.save()
    sync_establishment_after_inspection(inspection)

    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_CREATE,
        inspection,
        label=str(inspection),
        record_id=inspection.pk,
    )

    return Response(
        SanitaryInspectionSerializer(inspection).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([AllowAny])
def mobile_household_survey_submit(request):
    ensure_mobile_barangays()

    data = request.data.copy()
    data["household_code"] = data.get("household_code") or generate_household_code()
    data["household_head"] = (
        data.get("household_head") or data.get("head") or data.get("full_name") or ""
    )
    data["barangay"] = data.get("barangay") or "Unspecified"
    data["male_count"] = parse_mobile_int(data.get("male_count"), 0)
    data["female_count"] = parse_mobile_int(data.get("female_count"), 0)
    data["toilet_type"] = data.get("toilet_type") or "water_sealed"
    data["water_level"] = data.get("water_level") or "level_3"
    data["waste_disposal"] = data.get("waste_disposal") or "collected"
    data["status"] = household_status_from_payload(data)
    data["last_survey_date"] = data.get("last_survey_date") or timezone.localdate().isoformat()

    for field in ["latitude", "longitude"]:
        if data.get(field) in ("", None):
            data.pop(field, None)

    household_code = data.get("household_code")
    instance = None
    if household_code:
        instance = HouseholdSanitationRecord.objects.filter(household_code=household_code).first()

    if instance:
        serializer = HouseholdSanitationRecordSerializer(instance, data=data, partial=True)
    else:
        serializer = HouseholdSanitationRecordSerializer(data=data)

    serializer.is_valid(raise_exception=True)
    record = serializer.save()

    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_CREATE,
        record,
        label=record.household_code,
        record_id=record.pk,
    )

    return Response(serializer.data, status=status.HTTP_201_CREATED)


def build_mobile_notifications():
    top_destination = next(iter(get_mobile_top_destinations(limit=1)), None)

    notifications = [
        {
            "id": "welcome",
            "type": "info",
            "title": "Welcome to Mauban",
            "message": "Start exploring local destinations, maps, and travel guides.",
        },
        {
            "id": "sanitation-reporting",
            "type": "sanitation",
            "title": "Community Reporting Available",
            "message": "Residents may submit sanitation concerns with location details.",
        },
    ]

    if top_destination:
        arrivals = getattr(
            top_destination,
            "visitor_total",
            top_destination.monthly_arrivals,
        )
        notifications.append(
            {
                "id": f"featured-{top_destination.resort_id}",
                "type": "tourism",
                "title": f"{top_destination.resort_name} is trending",
                "message": (
                    f"{arrivals} recorded visitor arrivals "
                    "in the tourism guide data."
                ),
            }
        )

    return notifications


def build_mobile_sanitation_notifications():
    today = timezone.localdate()
    expiring_permits = SanitaryEstablishment.objects.filter(
        permit_expiry_date__gte=today,
        permit_expiry_date__lte=today + timedelta(days=30),
    ).order_by("permit_expiry_date")[:3]
    open_complaints = SanitaryComplaint.objects.exclude(
        status__in=[COMPLAINT_STATUS_RESOLVED, COMPLAINT_STATUS_REJECTED]
    ).order_by("-reported_date", "-id")[:3]

    notifications = [
        {
            "id": "sanitation-dashboard",
            "type": "sanitation",
            "title": "Sanitary monitoring active",
            "message": "Review establishments, inspections, permits, reports, and household surveys.",
        }
    ]

    for complaint in open_complaints:
        notifications.append(
            {
                "id": f"complaint-{complaint.complaint_id}",
                "type": "warning",
                "title": complaint.category,
                "message": f"{complaint.barangay} - {complaint.get_status_display()}",
            }
        )

    for establishment in expiring_permits:
        notifications.append(
            {
                "id": f"permit-{establishment.id}",
                "type": "permit",
                "title": "Permit expiring soon",
                "message": f"{establishment.business_name} expires on {establishment.permit_expiry_date}.",
            }
        )

    return notifications


def generate_household_code():
    today = timezone.localdate()
    prefix = f"HH-{today:%Y%m%d}"
    count = HouseholdSanitationRecord.objects.filter(
        household_code__startswith=prefix,
    ).count()
    return f"{prefix}-{count + 1:04d}"


def household_status_from_payload(data):
    toilet_type = data.get("toilet_type")
    water_level = data.get("water_level")
    waste_disposal = data.get("waste_disposal")

    if toilet_type == "none" or waste_disposal in ["burned", "dumped"]:
        return "violation"

    if toilet_type == "pit_latrine" or water_level == "level_1":
        return "for_completion"

    return "good_standing"


def ensure_mobile_reference_data(include_barangays=False):
    if not Resort.objects.exists() or not Country.objects.exists():
        ensure_initial_reference_data()

    if include_barangays:
        ensure_mobile_barangays()


def ensure_mobile_barangays():
    if not Barangay.objects.exists():
        ensure_initial_barangays()


def normalize_mobile_lookup_code(value):
    text = str(value or "").strip()
    if not text:
        return ""

    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            for key in ["permit_number", "permitNumber", "code", "reference"]:
                candidate = str(payload.get(key) or "").strip()
                if candidate:
                    return candidate
    except (TypeError, ValueError):
        pass

    parsed = urlparse(text)
    if parsed.query:
        params = parse_qs(parsed.query)
        for key in ["permit_number", "permitNumber", "code", "reference", "q"]:
            if params.get(key):
                return unquote(params[key][0]).strip()

    for marker in ["permit_number=", "permitNumber=", "code=", "reference="]:
        if marker in text:
            return unquote(text.split(marker, 1)[1].split("&", 1)[0]).strip()

    return unquote(text).strip()


def normalize_mobile_visit_payload(data):
    data["survey_id"] = data.get("survey_id") or generate_survey_id()
    data["submitted_at"] = data.get("submitted_at") or timezone.now().isoformat()
    data["email"] = data.get("email") or ""
    data["consent_confirmed"] = data.get("consent_confirmed", True)
    data["full_name"] = data.get("full_name") or data.get("name") or ""
    data["contact_number"] = data.get("contact_number") or data.get("contact") or ""
    data["arrival_date"] = (
        data.get("arrival_date")
        or data.get("date")
        or timezone.localdate().isoformat()
    )
    data["country_id"] = data.get("country_id") or default_reference_id(
        Country,
        name__iexact="Philippines",
    )
    data["region_id"] = data.get("region_id") or default_reference_id(
        Region,
        name__icontains="CALABARZON",
    )
    data["province_id"] = data.get("province_id") or default_reference_id(
        Province,
        name__iexact="Quezon",
    )
    data["country_of_origin"] = data.get("country_of_origin") or "Philippines"
    data["itinerary_id"] = data.get("itinerary_id") or default_reference_id(Itinerary)
    data["resort_id"] = (
        data.get("resort_id")
        or data.get("destination_id")
        or default_reference_id(Resort)
    )
    data["travel_mode_id"] = data.get("travel_mode_id") or default_reference_id(
        TravelMode
    )
    data["boat_type_id"] = data.get("boat_type_id") or default_reference_id(BoatType)
    data["visit_purpose_id"] = data.get("visit_purpose_id") or default_reference_id(
        VisitPurpose
    )
    data["boat_capacity_fare"] = data.get("boat_capacity_fare") or ""
    data["parking_space"] = data.get("parking_space") or ""
    data["status"] = data.get("status") or "pending"

    normalize_mobile_counts(data)
    return data


def normalize_mobile_counts(data):
    foreigner_count = parse_mobile_int(data.get("foreigner_count"), 0)
    filipino_count = parse_mobile_int(data.get("filipino_count"), 0)
    maubanin_count = parse_mobile_int(data.get("maubanin_count"), 0)
    classification_total = foreigner_count + filipino_count
    total_visitors = parse_mobile_int(data.get("total_visitors"), classification_total)

    if total_visitors <= 0:
        total_visitors = classification_total or 1

    if classification_total <= 0:
        filipino_count = total_visitors
        foreigner_count = 0
        maubanin_count = 0
    elif not data.get("total_visitors"):
        total_visitors = classification_total
    elif classification_total != total_visitors:
        if foreigner_count + filipino_count + maubanin_count == total_visitors:
            filipino_count = filipino_count + maubanin_count
        else:
            filipino_count = max(0, total_visitors - foreigner_count)
        classification_total = foreigner_count + filipino_count

    total_male = parse_mobile_int(data.get("total_male"), 0)
    total_female = parse_mobile_int(data.get("total_female"), 0)

    if total_male + total_female <= 0:
        total_female = total_visitors
    elif total_male + total_female != total_visitors:
        total_female = max(0, total_visitors - total_male)

    age_0_7 = parse_mobile_int(data.get("age_0_7"), 0)
    age_8_59 = parse_mobile_int(data.get("age_8_59"), 0)
    age_60_above = parse_mobile_int(data.get("age_60_above"), 0)

    if age_0_7 + age_8_59 + age_60_above <= 0:
        age_8_59 = total_visitors
    elif age_0_7 + age_8_59 + age_60_above != total_visitors:
        age_8_59 = max(0, total_visitors - age_0_7 - age_60_above)

    data["foreigner_count"] = foreigner_count
    data["filipino_count"] = filipino_count
    data["maubanin_count"] = maubanin_count
    data["total_visitors"] = total_visitors
    data["total_male"] = total_male
    data["total_female"] = total_female
    data["special_group_count"] = parse_mobile_int(data.get("special_group_count"), 0)
    data["age_0_7"] = age_0_7
    data["age_8_59"] = age_8_59
    data["age_60_above"] = age_60_above


def default_reference_id(model, **filters):
    item = model.objects.filter(**filters).first() if filters else None
    item = item or model.objects.first()
    return item.pk if item else None


def parse_mobile_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def feedback_status_from_rating(rating):
    rating = parse_mobile_int(rating, 5)

    if rating >= 4:
        return FeedbackEntry.STATUS_POSITIVE
    if rating <= 2:
        return FeedbackEntry.STATUS_NEGATIVE
    return FeedbackEntry.STATUS_NEUTRAL


def append_sanitation_feedback(message, data):
    notes = []
    cleanliness_rating = data.get("cleanliness_rating")
    safety_rating = data.get("safety_rating")
    sanitation_comment = data.get("sanitation_comment")

    if cleanliness_rating:
        notes.append(f"cleanliness rating {cleanliness_rating}/5")

    if safety_rating:
        notes.append(f"safety/comfort rating {safety_rating}/5")

    if sanitation_comment:
        notes.append(f"sanitation note: {sanitation_comment}")

    base_message = message.strip() or "No written comment."

    if not notes:
        return base_message

    return f"{base_message}\n\nCleanliness feedback: {'; '.join(notes)}"
