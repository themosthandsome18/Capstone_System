from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from api.models import (
    MODULE_SANITATION,
    MODULE_TOURISM,
    ActivityLog,
    FeedbackEntry,
)
from api.permissions import get_user_role, module_required
from api.seeders import (
    ensure_initial_reference_data,
    ensure_initial_tourism_data,
)
from api.serializers import (
    ActivityLogSerializer,
    FeedbackEntrySerializer,
)
from api.services.tourism import (
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
    from api.views.tourism import auto_update_no_show_bookings
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()

    return Response(
        {
            "referenceTables": build_reference_tables_payload(),
            "touristRecords": [],
            "bookingManagement": build_booking_management_payload(),
            "feedbackEntries": FeedbackEntrySerializer(
                FeedbackEntry.objects.select_related("destination").all(),
                many=True,
            ).data,
            "arrivalMonitoring": build_arrival_monitoring_payload(),
            "dashboardData": build_dashboard_payload(),
            "reportData": build_reports_payload({"include_questions": True}),
        }
    )


@api_view(["GET"])
@module_required("tourism")
def reference_tables(request):
    ensure_initial_reference_data()
    return Response(build_reference_tables_payload())
