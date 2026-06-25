from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_UPDATE,
    MODULE_TOURISM,
    ROLE_ADMIN,
    FeedbackEntry,
    Resort,
    TouristRecord,
)
from api.permissions import get_user_role, module_required
from api.seeders import (
    ensure_initial_reference_data,
    ensure_initial_tourism_data,
    generate_resort_id,
    generate_survey_id,
)
from api.serializers import (
    FeedbackEntrySerializer,
    ResortSerializer,
    TouristRecordSerializer,
)
from api.services.activity import log_activity
from api.services.online_booking import (
    import_online_booking_workbook,
    preview_online_booking_workbook,
)
from api.services.tourism import (
    build_arrival_monitoring_payload,
    build_booking_management_payload,
    build_dashboard_payload,
    build_reports_payload,
    build_tourist_records_payload,
)


def auto_update_no_show_bookings():
    from django.utils import timezone
    from api.models import BOOKING_STATUS_PENDING, BOOKING_STATUS_NO_SHOW
    TouristRecord.objects.filter(
        status=BOOKING_STATUS_PENDING,
        arrival_date__lt=timezone.localdate()
    ).update(status=BOOKING_STATUS_NO_SHOW)


@api_view(["GET"])
@module_required("tourism")
def arrival_monitoring_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return Response(build_arrival_monitoring_payload(request.query_params))


@api_view(["GET"])
@module_required("tourism")
def booking_management_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
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
    ensure_initial_tourism_data()

    if request.method == "GET":
        return Response(build_tourist_records_payload())

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
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return Response(build_dashboard_payload(request.query_params))


@api_view(["GET"])
@module_required("tourism")
def reports_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
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
    ensure_initial_tourism_data()

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
