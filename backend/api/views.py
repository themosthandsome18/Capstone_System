from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.decorators import parser_classes

from .models import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_UPDATE,
    ActivityLog,
    FeedbackEntry,
    HouseholdSanitationRecord,
    MODULE_SANITATION,
    MODULE_TOURISM,
    ROLE_ADMIN,
    Resort,
    SanitaryBusinessType,
    SanitaryEstablishment,
    SanitaryInspection,
    TouristRecord,
)
from .permissions import get_user_role, module_required
from .seeders import (
    ensure_initial_data,
    ensure_initial_household_data,
    ensure_initial_reference_data,
    ensure_initial_sanitation_data,
    generate_resort_id,
    generate_survey_id,
)
from .serializers import (
    ActivityLogSerializer,
    FeedbackEntrySerializer,
    HouseholdSanitationRecordSerializer,
    ResortSerializer,
    SanitaryBusinessTypeSerializer,
    SanitaryEstablishmentSerializer,
    SanitaryInspectionCreateSerializer,
    SanitaryInspectionSerializer,
    TouristRecordSerializer,
)
from .services.activity import log_activity
from .services.household import build_household_dashboard_payload
from .services.online_booking import (
    import_online_booking_workbook,
    preview_online_booking_workbook,
)
from .services.sanitation import (
    build_sanitation_dashboard_payload,
    build_sanitation_permits_payload,
    build_sanitation_reports_payload,
    build_sanitation_submissions_payload,
    sync_establishment_after_inspection,
)
from .services.tourism import (
    build_arrival_monitoring_payload,
    build_booking_management_payload,
    build_dashboard_payload,
    build_reference_tables_payload,
    build_reports_payload,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "ok"})


@api_view(["GET"])
def activity_log_list(request):
    role = get_user_role(request.user)
    logs = ActivityLog.objects.select_related("user").all()

    if role == MODULE_TOURISM:
        logs = logs.filter(module=MODULE_TOURISM)
    elif role == MODULE_SANITATION:
        logs = logs.filter(module=MODULE_SANITATION)

    module_filter = request.query_params.get("module")
    action_filter = request.query_params.get("action")

    if module_filter:
        logs = logs.filter(module=module_filter)

    if action_filter:
        logs = logs.filter(action=action_filter)

    try:
        limit = min(int(request.query_params.get("limit", 100)), 250)
    except ValueError:
        limit = 100

    return Response(ActivityLogSerializer(logs[:limit], many=True).data)


@api_view(["GET"])
@module_required("tourism")
def bootstrap_data(request):
    ensure_initial_data()

    return Response(
        {
            "referenceTables": build_reference_tables_payload(),
            "touristRecords": TouristRecordSerializer(
                TouristRecord.objects.all(),
                many=True,
            ).data,
            "bookingManagement": build_booking_management_payload(),
            "feedbackEntries": FeedbackEntrySerializer(
                FeedbackEntry.objects.select_related("destination").all(),
                many=True,
            ).data,
            "arrivalMonitoring": build_arrival_monitoring_payload(),
            "dashboardData": build_dashboard_payload(),
            "reportData": build_reports_payload(),
        }
    )


@api_view(["GET"])
@module_required("tourism")
def reference_tables(request):
    ensure_initial_reference_data()
    return Response(build_reference_tables_payload())


@api_view(["GET"])
@module_required("tourism")
def arrival_monitoring_data(request):
    ensure_initial_data()
    return Response(build_arrival_monitoring_payload())


@api_view(["GET"])
@module_required("tourism")
def booking_management_data(request):
    ensure_initial_data()
    return Response(build_booking_management_payload(request.query_params))


@api_view(["POST"])
@parser_classes([MultiPartParser])
@module_required("tourism")
def online_booking_import(request):
    if get_user_role(request.user) != ROLE_ADMIN:
        return Response(
            {"detail": "Only the system admin can import online booking files."},
            status=status.HTTP_403_FORBIDDEN,
        )

    upload = request.FILES.get("file")

    if not upload:
        return Response(
            {"detail": "Excel file is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    action = request.data.get("action", "preview")
    status_value = request.data.get("status", "pending")

    try:
        limit = int(request.data.get("limit") or 0)
    except ValueError:
        limit = 0

    if action == "import":
        result = import_online_booking_workbook(
            upload,
            status=status_value,
            limit=limit,
        )
    else:
        result = preview_online_booking_workbook(
            upload,
            status=status_value,
            limit=limit,
        )

    return Response(result)


@api_view(["GET", "POST"])
@module_required("tourism")
def tourist_record_list(request):
    ensure_initial_data()

    if request.method == "GET":
        return Response(
            TouristRecordSerializer(
                TouristRecord.objects.all(),
                many=True,
            ).data
        )

    data = request.data.copy()
    if not data.get("survey_id"):
        data["survey_id"] = generate_survey_id()

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


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("tourism")
def tourist_record_detail(request, survey_id):
    record = get_object_or_404(TouristRecord, survey_id=survey_id)

    if request.method == "GET":
        return Response(TouristRecordSerializer(record).data)

    if request.method == "DELETE":
        if get_user_role(request.user) != ROLE_ADMIN:
            return Response(
                {"detail": "Only the system admin can delete tourist records."},
                status=status.HTTP_403_FORBIDDEN,
            )

        record_label = record.full_name
        record_id = record.survey_id
        record.delete()
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_DELETE,
            record,
            label=record_label,
            record_id=record_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data.copy()
    data["survey_id"] = record.survey_id
    serializer = TouristRecordSerializer(
        record,
        data=data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    record = serializer.save()
    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_UPDATE,
        record,
        label=record.full_name,
        record_id=record.survey_id,
    )
    return Response(serializer.data)


@api_view(["GET"])
@module_required("tourism")
def dashboard_data(request):
    ensure_initial_data()
    return Response(build_dashboard_payload())


@api_view(["GET"])
@module_required("tourism")
def reports_data(request):
    ensure_initial_data()
    return Response(build_reports_payload(request.query_params))


@api_view(["GET", "POST"])
@module_required("tourism")
def resort_list(request):
    ensure_initial_reference_data()

    if request.method == "GET":
        return Response(ResortSerializer(Resort.objects.all(), many=True).data)

    data = request.data.copy()
    if not data.get("resort_id"):
        data["resort_id"] = generate_resort_id()

    serializer = ResortSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    resort = serializer.save()
    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_CREATE,
        resort,
        label=resort.resort_name,
        record_id=resort.resort_id,
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("tourism")
def resort_detail(request, resort_id):
    resort = get_object_or_404(Resort, resort_id=resort_id)

    if request.method == "GET":
        return Response(ResortSerializer(resort).data)

    if request.method == "DELETE":
        resort_label = resort.resort_name
        resort_id_value = resort.resort_id
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
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_DELETE,
            resort,
            label=resort_label,
            record_id=resort_id_value,
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
    resort = serializer.save()
    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_UPDATE,
        resort,
        label=resort.resort_name,
        record_id=resort.resort_id,
    )
    return Response(serializer.data)


@api_view(["GET", "POST"])
@module_required("tourism")
def feedback_list(request):
    ensure_initial_data()

    if request.method == "GET":
        feedback = FeedbackEntry.objects.select_related("destination").all()
        return Response(FeedbackEntrySerializer(feedback, many=True).data)

    serializer = FeedbackEntrySerializer(data=request.data)
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


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("tourism")
def feedback_detail(request, feedback_id):
    entry = get_object_or_404(FeedbackEntry, pk=feedback_id)

    if request.method == "GET":
        return Response(FeedbackEntrySerializer(entry).data)

    if request.method == "DELETE":
        entry_label = entry.title
        entry_id = entry.pk
        entry.delete()
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_DELETE,
            entry,
            label=entry_label,
            record_id=entry_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = FeedbackEntrySerializer(
        entry,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    entry = serializer.save()
    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_UPDATE,
        entry,
        label=entry.title,
        record_id=entry.pk,
    )
    return Response(serializer.data)


@api_view(["GET"])
@module_required("sanitation")
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
@module_required("sanitation")
def sanitation_dashboard_data(request):
    return Response(build_sanitation_dashboard_payload())


@api_view(["GET"])
@module_required("sanitation")
def sanitation_business_type_list(request):
    ensure_initial_sanitation_data()

    business_types = SanitaryBusinessType.objects.prefetch_related("requirements").all()
    return Response(SanitaryBusinessTypeSerializer(business_types, many=True).data)


@api_view(["GET", "POST"])
@module_required("sanitation")
def sanitation_establishment_list(request):
    ensure_initial_sanitation_data()

    if request.method == "GET":
        establishments = SanitaryEstablishment.objects.select_related(
            "business_type"
        ).all()
        return Response(SanitaryEstablishmentSerializer(establishments, many=True).data)

    serializer = SanitaryEstablishmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    establishment = serializer.save()
    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_CREATE,
        establishment,
        label=establishment.business_name,
        record_id=establishment.pk,
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("sanitation")
def sanitation_establishment_detail(request, establishment_id):
    establishment = get_object_or_404(SanitaryEstablishment, pk=establishment_id)

    if request.method == "GET":
        return Response(SanitaryEstablishmentSerializer(establishment).data)

    if request.method == "DELETE":
        establishment_label = establishment.business_name
        establishment_id = establishment.pk
        establishment.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            establishment,
            label=establishment_label,
            record_id=establishment_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = SanitaryEstablishmentSerializer(
        establishment,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    establishment = serializer.save()
    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_UPDATE,
        establishment,
        label=establishment.business_name,
        record_id=establishment.pk,
    )
    return Response(serializer.data)


@api_view(["GET", "POST"])
@module_required("sanitation")
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


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("sanitation")
def sanitation_inspection_detail(request, inspection_id):
    inspection = get_object_or_404(SanitaryInspection, pk=inspection_id)

    if request.method == "GET":
        return Response(SanitaryInspectionSerializer(inspection).data)

    if request.method == "DELETE":
        inspection_label = str(inspection)
        inspection_id = inspection.pk
        inspection.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            inspection,
            label=inspection_label,
            record_id=inspection_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = SanitaryInspectionCreateSerializer(
        inspection,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    inspection = serializer.save()
    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_UPDATE,
        inspection,
        label=str(inspection),
        record_id=inspection.pk,
    )

    return Response(SanitaryInspectionSerializer(inspection).data)


@api_view(["GET"])
@module_required("sanitation")
def sanitation_permit_data(request):
    return Response(build_sanitation_permits_payload(request.query_params))


@api_view(["GET"])
@module_required("sanitation")
def sanitation_submission_data(request):
    return Response(build_sanitation_submissions_payload(request.query_params))


@api_view(["GET"])
@module_required("sanitation")
def sanitation_report_data(request):
    return Response(build_sanitation_reports_payload(request.query_params))


@api_view(["GET"])
@module_required("sanitation")
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
@module_required("sanitation")
def household_dashboard_data(request):
    return Response(build_household_dashboard_payload())


@api_view(["GET", "POST"])
@module_required("sanitation")
def household_record_list(request):
    ensure_initial_household_data()

    if request.method == "GET":
        records = HouseholdSanitationRecord.objects.all()
        return Response(HouseholdSanitationRecordSerializer(records, many=True).data)

    serializer = HouseholdSanitationRecordSerializer(data=request.data)
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


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("sanitation")
def household_record_detail(request, household_id):
    record = get_object_or_404(HouseholdSanitationRecord, pk=household_id)

    if request.method == "GET":
        return Response(HouseholdSanitationRecordSerializer(record).data)

    if request.method == "DELETE":
        record_label = record.household_code
        record_id = record.pk
        record.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            record,
            label=record_label,
            record_id=record_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = HouseholdSanitationRecordSerializer(
        record,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    record = serializer.save()
    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_UPDATE,
        record,
        label=record.household_code,
        record_id=record.pk,
    )

    return Response(serializer.data)
