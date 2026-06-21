from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_UPDATE,
    MODULE_SANITATION,
    Barangay,
    HouseholdSanitationRecord,
    SanitaryBusinessType,
    SanitaryComplaint,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryPermitRenewal,
)
from api.permissions import module_required
from api.seeders import (
    ensure_initial_barangays,
    ensure_initial_household_data,
    ensure_initial_sanitation_data,
)
from api.serializers import (
    BarangaySerializer,
    HouseholdSanitationRecordSerializer,
    SanitaryBusinessTypeSerializer,
    SanitaryComplaintSerializer,
    SanitaryEstablishmentSerializer,
    SanitaryInspectionCreateSerializer,
    SanitaryInspectionSerializer,
    SanitaryPermitRenewalSerializer,
)
from api.services.activity import log_activity
from api.services.household import build_household_dashboard_payload
from api.services.sanitation import (
    advance_renewal_stage,
    build_sanitation_complaints_payload,
    build_sanitation_dashboard_payload,
    build_sanitation_permits_payload,
    build_sanitation_renewals_payload,
    build_sanitation_reports_payload,
    build_sanitation_submissions_payload,
    generate_complaint_id,
    generate_renewal_id,
    sync_establishment_after_inspection,
    sync_renewal_progress,
    with_establishment_rollups,
)


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
                with_establishment_rollups(
                    SanitaryEstablishment.objects.select_related("business_type").all()
                ),
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
            "permitData": None,
            "renewalData": None,
            "complaintData": None,
            "submissionData": None,
            "reportData": None,
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
        establishments = with_establishment_rollups(
            SanitaryEstablishment.objects.select_related("business_type").all()
        )
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
        establishment_id_value = establishment.pk
        establishment.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            establishment,
            label=establishment_label,
            record_id=establishment_id_value,
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
        inspection_id_value = inspection.pk
        inspection.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            inspection,
            label=inspection_label,
            record_id=inspection_id_value,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = SanitaryInspectionCreateSerializer(
        inspection,
        data=request.data,
        partial=request.method == "PATCH",
    )
    serializer.is_valid(raise_exception=True)
    inspection = serializer.save()
    sync_establishment_after_inspection(inspection)
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


@api_view(["GET", "POST"])
@module_required("sanitation")
def sanitation_renewal_list(request):
    ensure_initial_sanitation_data()

    if request.method == "GET":
        return Response(build_sanitation_renewals_payload(request.query_params))

    data = request.data.copy()
    if not data.get("renewal_id"):
        data["renewal_id"] = generate_renewal_id()

    serializer = SanitaryPermitRenewalSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    renewal = serializer.save()
    sync_renewal_progress(renewal)
    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_CREATE,
        renewal,
        label=renewal.establishment.business_name,
        record_id=renewal.renewal_id,
    )

    return Response(
        SanitaryPermitRenewalSerializer(renewal).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@module_required("sanitation")
def sanitation_renewal_detail(request, renewal_id):
    renewal = get_object_or_404(SanitaryPermitRenewal, pk=renewal_id)

    if request.method == "GET":
        return Response(SanitaryPermitRenewalSerializer(renewal).data)

    if request.method == "DELETE":
        label = renewal.establishment.business_name
        record_id_value = renewal.renewal_id
        renewal.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            renewal,
            label=label,
            record_id=record_id_value,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    action = request.data.get("action")
    if action == "advance_stage":
        renewal = advance_renewal_stage(renewal)
    elif action == "mark_released":
        renewal.stage = "released"
        renewal = sync_renewal_progress(renewal)
    else:
        serializer = SanitaryPermitRenewalSerializer(
            renewal,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        renewal = serializer.save()
        sync_renewal_progress(renewal)

    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_UPDATE,
        renewal,
        label=renewal.establishment.business_name,
        record_id=renewal.renewal_id,
    )
    return Response(SanitaryPermitRenewalSerializer(renewal).data)


@api_view(["GET", "POST"])
@module_required("sanitation")
def sanitation_complaint_list(request):
    ensure_initial_sanitation_data()

    if request.method == "GET":
        return Response(build_sanitation_complaints_payload(request.query_params))

    data = request.data.copy()
    if not data.get("complaint_id"):
        data["complaint_id"] = generate_complaint_id()

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

    return Response(
        SanitaryComplaintSerializer(complaint).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@module_required("sanitation")
def sanitation_complaint_detail(request, complaint_id):
    complaint = get_object_or_404(SanitaryComplaint, pk=complaint_id)

    if request.method == "GET":
        return Response(SanitaryComplaintSerializer(complaint).data)

    if request.method == "DELETE":
        label = complaint.category
        record_id_value = complaint.complaint_id
        complaint.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            complaint,
            label=label,
            record_id=record_id_value,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data.copy()
    if data.get("status") == "resolved" and not data.get("resolved_date"):
        data["resolved_date"] = timezone.localdate().isoformat()

    serializer = SanitaryComplaintSerializer(
        complaint,
        data=data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    complaint = serializer.save()
    log_activity(
        request,
        MODULE_SANITATION,
        ACTION_UPDATE,
        complaint,
        label=complaint.category,
        record_id=complaint.complaint_id,
    )
    return Response(SanitaryComplaintSerializer(complaint).data)


@api_view(["GET"])
@module_required("sanitation")
def sanitation_submission_data(request):
    return Response(build_sanitation_submissions_payload(request.query_params))


@api_view(["GET"])
@module_required("sanitation")
def sanitation_report_data(request):
    return Response(build_sanitation_reports_payload(request.query_params))


def get_household_records_queryset(params=None):
    params = params or {}
    records = HouseholdSanitationRecord.objects.all()
    barangay = (params.get("barangay") or "").strip()
    status_filter = (params.get("status") or "").strip()
    search = (params.get("search") or "").strip()

    if barangay and barangay != "all":
        records = records.filter(barangay__iexact=barangay)

    if status_filter and status_filter != "all":
        records = records.filter(status=status_filter)

    if search:
        records = records.filter(
            Q(household_code__icontains=search)
            | Q(household_head__icontains=search)
            | Q(barangay__icontains=search)
            | Q(address__icontains=search)
            | Q(water_source__icontains=search)
            | Q(remarks__icontains=search)
        )

    return records


@api_view(["GET"])
@module_required("sanitation")
def household_barangay_list(request):
    ensure_initial_barangays()
    barangays = Barangay.objects.filter(is_active=True)
    return Response(BarangaySerializer(barangays, many=True).data)


@api_view(["GET"])
@module_required("sanitation")
def household_bootstrap_data(request):
    ensure_initial_household_data()

    records = get_household_records_queryset(request.query_params)
    barangays = Barangay.objects.filter(is_active=True)

    return Response(
        {
            "barangays": BarangaySerializer(barangays, many=True).data,
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
        records = get_household_records_queryset(request.query_params)
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
        record_id_value = record.pk
        record.delete()
        log_activity(
            request,
            MODULE_SANITATION,
            ACTION_DELETE,
            record,
            label=record_label,
            record_id=record_id_value,
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
