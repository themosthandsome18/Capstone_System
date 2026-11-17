import time
from django.db import transaction
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_UPDATE,
    MODULE_TOURISM,
    FeedbackEntry,
    Resort,
    TourismThemeSetting,
    TouristRecord,
)
from api.permissions import administration_required, module_required
from api.seeders import (
    ensure_initial_reference_data,
    ensure_initial_tourism_data,
    generate_resort_id,
    generate_survey_id,
)
from api.serializers import (
    FeedbackEntrySerializer,
    ResortSerializer,
    TourismThemeReadSerializer,
    TourismThemeWriteSerializer,
    TOURIST_RECORD_EDIT_ONLY_FIELDS,
    TOURIST_RECORD_EDITABLE_FIELDS,
    TouristRecordEditSerializer,
    TouristRecordSerializer,
)
from api.services.activity import log_activity, tourist_record_edit_label
from api.services.notifications import notify_new_tourist_record, notify_safely
from api.services.destination_figures import destination_map_figures
from api.services.online_booking import (
    import_online_booking_workbook,
    preview_online_booking_workbook,
)
from api.services.tourism import (
    build_arrival_monitoring_export,
    build_arrival_monitoring_payload,
    build_booking_management_payload,
    build_dashboard_payload,
    build_reports_payload,
    build_tourist_records_payload,
    count_archived_records,
    get_reporting_year,
    read_tourism_theme,
    ReportParameterError,
    tourist_record_computed,
)
from api.services.upload import (
    absolute_media_url,
    StorageServiceError,
    UploadValidationError,
    save_image_file,
)


# Runs at most once a day (and again after any tourist record is written); see
# api/services/no_show.py. Imported here under its old name for its callers.
from api.services.no_show import sweep_no_shows as auto_update_no_show_bookings  # noqa: E402


def report_response(build, params):
    """A report payload, or 400 for a filter it cannot honour (never another year's data)."""
    try:
        return Response(build(params))
    except ReportParameterError as error:
        return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@module_required("tourism")
def arrival_monitoring_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return report_response(build_arrival_monitoring_payload, request.query_params)


@api_view(["GET"])
@module_required("tourism")
def arrival_monitoring_export(request):
    # Same parameters and records as arrival_monitoring_data, every row, in date order.
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return report_response(build_arrival_monitoring_export, request.query_params)


@api_view(["GET"])
@module_required("tourism")
def destination_figures(request):
    # The boxes under the GIS map; every number is worked out here (services/destination_figures.py), the web only writes them.
    ensure_initial_reference_data()
    return Response(destination_map_figures())


@api_view(["GET"])
@module_required("tourism")
def booking_management_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return report_response(build_booking_management_payload, request.query_params)


@api_view(["POST"])
@parser_classes([MultiPartParser])
@module_required("tourism")
def online_booking_import(request):
    # The Tourism Office does this, and so does the system admin: module_required("tourism") lets in exactly those two (preview and import alike).
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
    notify_safely(notify_new_tourist_record, record, actor=request.user)  # the one who added it is not told about it
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# A tourist record is never deleted (there is no DELETE here: the verb is refused with 405). It is archived instead: see
# tourist_record_archive / tourist_record_unarchive below.
#
# There is no PUT either (405): a whole-body write is the way every field of the tourist would be rewritten. PATCH may change only what
# TOURIST_RECORD_EDITABLE_FIELDS lists (the head count, the Length of Stay, the resort and the status) and refuses any other field named in the body
# with a 400, even when its value is the same. POST (a new record) is not affected: see tourist_record_list.
@api_view(["GET", "PATCH"])
@module_required("tourism")
def tourist_record_detail(request, survey_id):
    record = get_object_or_404(TouristRecord.objects.select_related("itinerary", "resort"), survey_id=survey_id)

    if request.method == "GET":
        # The record as it was, and what is worked out from it (Overnight and Same Day by sex, the fee): see tourist_record_computed.
        data = dict(TouristRecordSerializer(record).data)
        data["computed"] = tourist_record_computed(record)
        data["is_archived"] = record.is_archived  # read only: a PATCH cannot write it (see TOURIST_RECORD_EDITABLE_FIELDS), only archive / unarchive do
        return Response(data)

    sent = set(request.data.keys()) if hasattr(request.data, "keys") else set()
    wants_edit = sent & set(TOURIST_RECORD_EDIT_ONLY_FIELDS)
    # An archived record is not edited: the head count, the Length of Stay and the resort stay as they are until it is brought back. This is a 409, not
    # a 400: nothing is wrong with what was sent, it is the record's state. It is refused BEFORE anything is written, so a PATCH that names the status
    # together with one of them changes nothing at all, the status included. The status ALONE is allowed on an archived record: it is still counted
    # by every figure, so what really happened (arrived or not) must still be put right. A field that is not editable at all keeps its 400
    # (the serializer says so), so it is checked first.
    if record.is_archived and wants_edit and not (sent - set(TOURIST_RECORD_EDITABLE_FIELDS)):
        return Response(
            {
                "detail": (
                    "This record is archived, so its head count, length of stay and resort cannot be changed. "
                    "Bring it back to the table first (unarchive it), then change it. Its status can still be changed on its own."
                ),
                "fields": sorted(wants_edit),
            },
            status=status.HTTP_409_CONFLICT,
        )

    serializer = TouristRecordEditSerializer(record, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    before = _edit_snapshot(record)  # read BEFORE the save: save() changes this same object
    record = serializer.save()
    label = tourist_record_edit_label(record.survey_id, before, _edit_snapshot(record))
    if label:  # a PATCH that changes nothing logs nothing (as the archive does when it is done twice)
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_UPDATE,
            record,
            label=label,
            record_id=record.survey_id,
        )
    return Response(serializer.data)


def _edit_snapshot(record):
    """The values a PATCH may change, as an Activity Log label names them: the Length of Stay and the resort by name, the rest as they are."""
    snapshot = {
        field: getattr(record, field)
        for field in (
            "total_visitors", "foreigner_count", "filipino_count", "maubanin_count", "total_male", "total_female",
            "age_0_7", "age_8_59", "age_60_above", "special_group_count", "discounted_count",
        )
    }
    snapshot["status"] = record.get_status_display()
    snapshot["itinerary"] = record.itinerary.name
    snapshot["resort"] = record.resort.resort_name
    snapshot["boat_capacity_fare"] = record.boat_capacity_fare
    return snapshot


def _set_archived(request, survey_id, archived):
    """Take a record off the Record Management table (archived=True) or put it back. In one transaction, with the row locked.

    Only the table changes: every count, report and export reads the record as before. Who and when come from request.user and the server's
    clock. Doing it twice changes nothing and logs nothing. The ActivityLog label holds the survey id only, no visitor name.

    It writes the archive columns alone (update_fields), so updated_at and the order of the table do not move.

    The answer carries the new "N archived" for the year in ?year= (as the table asks for it), so the screen can change at once and settle on
    the server's word without reading the whole list again.
    """
    try:
        get_reporting_year(request.query_params)  # a bad ?year= is refused before anything is written
    except ReportParameterError as error:
        return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        record = get_object_or_404(TouristRecord.objects.select_for_update(), survey_id=survey_id)
        if record.is_archived == archived:
            return Response(_archive_state(record, request))
        record.is_archived = archived
        record.archived_at = timezone.now() if archived else None
        record.archived_by = request.user if archived else None
        record.save(update_fields=["is_archived", "archived_at", "archived_by"])
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_UPDATE,
            record,
            label=f"Record {'archived' if archived else 'brought back (unarchived)'}: {record.survey_id}",
            record_id=record.survey_id,
        )
    return Response(_archive_state(record, request))


def _archive_state(record, request):
    return {
        "survey_id": record.survey_id,
        "is_archived": record.is_archived,
        "archived_at": record.archived_at,
        "archivedCount": count_archived_records(request.query_params),
    }


@api_view(["POST"])
@module_required("tourism")
def tourist_record_archive(request, survey_id):
    return _set_archived(request, survey_id, True)


@api_view(["POST"])
@module_required("tourism")
def tourist_record_unarchive(request, survey_id):
    return _set_archived(request, survey_id, False)


@api_view(["GET"])
@module_required("tourism")
def dashboard_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return report_response(build_dashboard_payload, request.query_params)


@api_view(["GET"])
@module_required("tourism")
def reports_data(request):
    ensure_initial_tourism_data()
    auto_update_no_show_bookings()
    return report_response(build_reports_payload, request.query_params)


@api_view(["GET", "POST"])
@module_required("tourism")
def resort_list(request):
    ensure_initial_reference_data()

    if request.method == "GET":
        return Response(ResortSerializer(Resort.objects.all(), many=True, context={"request": request, "include_placeholder": True}).data)

    data = request.data.copy()
    if not data.get("resort_id"):
        data["resort_id"] = generate_resort_id()

    serializer = ResortSerializer(data=data, context={"request": request, "include_placeholder": True})
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


DESTINATION_DELETE_REFUSED = (
    "Destinations are never deleted. Set the destination to Inactive instead."
)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@module_required("tourism")
def resort_detail(request, resort_id):
    # A destination is never deleted: Inactive is its end. This is answered before the destination is even looked up, so nothing
    # reaches resort.delete(): not for a destination with no records, and not for one with records (which PROTECT would have
    # refused only afterwards, with a 409).
    if request.method == "DELETE":
        return Response(
            {"detail": DESTINATION_DELETE_REFUSED},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    resort = get_object_or_404(Resort, resort_id=resort_id)

    if request.method == "GET":
        return Response(ResortSerializer(resort, context={"request": request, "include_placeholder": True}).data)

    data = request.data.copy()
    data["resort_id"] = resort.resort_id
    serializer = ResortSerializer(
        resort,
        data=data,
        partial=request.method == "PATCH",
        context={"request": request, "include_placeholder": True},
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


@api_view(["POST"])
@parser_classes([MultiPartParser])
@module_required("tourism")
def resort_image_upload(request):
    files = (
        request.FILES.getlist("image")
        or request.FILES.getlist("images")
        or request.FILES.getlist("photo")
        or request.FILES.getlist("photos")
        or request.FILES.getlist("file")
    )
    if not files:
        single = (
            request.FILES.get("image")
            or request.FILES.get("photo")
            or request.FILES.get("file")
        )
        if single:
            files = [single]

    if not files:
        return Response(
            {"detail": "No image file provided."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    urls = []
    try:
        for file in files:
            urls.append(save_image_file(file, "resorts"))
    except UploadValidationError as val_err:
        return Response(
            {"error": val_err.message, "detail": val_err.message},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except StorageServiceError as stor_err:
        return Response(
            {"error": stor_err.message, "detail": stor_err.message},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # A whole URL, so that the form can show the photo it just uploaded before the destination is saved. What is stored is made a path
    # again by the serializer (ResortSerializer.validate_images), so the database does not keep this host.
    urls = [absolute_media_url(url, request) for url in urls]
    return Response(
        {
            "url": urls[0] if urls else None,
            "urls": urls,
        },
        status=status.HTTP_201_CREATED,
    )


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


def _feedback_moderation_label(entry, what):
    """A label for the activity log that says WHICH review it was: every
    review sent from the app has the same title, so the title says nothing."""
    return f"Review {what}: {entry.destination.resort_name}, {entry.date}"


@api_view(["POST"])
@module_required("tourism")
def feedback_hide(request, feedback_id):
    """Hide a review from the public and from the destination's rating.

    Who and when are set HERE, from request.user and the server's clock, never
    from the request body. Hiding a hidden review changes nothing (the first
    who / when stay).

    It must be entry.save(), NOT QuerySet.update(): the save sends post_save,
    which recalculates the destination's rating. update() sends no signal and
    the old stars would stay.
    """
    entry = get_object_or_404(
        FeedbackEntry.objects.select_related("destination"), pk=feedback_id
    )

    if not entry.is_hidden:
        entry.is_hidden = True
        entry.hidden_at = timezone.now()
        entry.hidden_by = request.user
        entry.save(update_fields=["is_hidden", "hidden_at", "hidden_by"])
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_UPDATE,
            entry,
            label=_feedback_moderation_label(entry, "hidden"),
            record_id=entry.pk,
        )

    return Response(FeedbackEntrySerializer(entry).data)


@api_view(["POST"])
@module_required("tourism")
def feedback_unhide(request, feedback_id):
    """Show a hidden review again. As with hide: entry.save(), not update(),
    so that the rating is recalculated."""
    entry = get_object_or_404(
        FeedbackEntry.objects.select_related("destination"), pk=feedback_id
    )

    if entry.is_hidden:
        entry.is_hidden = False
        entry.hidden_at = None
        entry.hidden_by = None
        entry.save(update_fields=["is_hidden", "hidden_at", "hidden_by"])
        log_activity(
            request,
            MODULE_TOURISM,
            ACTION_UPDATE,
            entry,
            label=_feedback_moderation_label(entry, "shown again"),
            record_id=entry.pk,
        )

    return Response(FeedbackEntrySerializer(entry).data)


@api_view(["GET", "PUT"])
@permission_classes([AllowAny])
def tourism_theme(request):
    # Public read: the Flutter app calls its bootstrap before login and the
    # login page works with no token. The colour is not sensitive; the read
    # shape never includes updated_by or any username.
    if request.method == "GET":
        return Response(read_tourism_theme())

    return update_tourism_theme(request)


@module_required("tourism")
@administration_required("Only the Tourism Office and the system admin can change the tourism theme.")
def update_tourism_theme(request):
    serializer = TourismThemeWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    setting = TourismThemeSetting.load()
    for field, value in serializer.validated_data.items():
        setattr(setting, field, value)
    setting.updated_by = request.user
    setting.save()

    log_activity(
        request,
        MODULE_TOURISM,
        ACTION_UPDATE,
        setting,
        label=f"Tourism theme {setting.primary_color}",
        record_id=setting.pk,
    )
    return Response(TourismThemeReadSerializer(setting).data)
