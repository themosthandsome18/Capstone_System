from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from ..models import (
    PERMIT_STATUS_ACTIVE,
    PERMIT_STATUS_CONDITIONAL,
    PERMIT_STATUS_NO_PERMIT,
    PERMIT_STATUS_RENEWAL_DUE,
    PERMIT_STATUS_SUSPENDED,
    COMPLAINT_PRIORITY_HIGH,
    COMPLAINT_STATUS_INVESTIGATING,
    COMPLAINT_STATUS_PENDING,
    COMPLAINT_STATUS_REJECTED,
    COMPLAINT_STATUS_RESOLVED,
    HOUSEHOLD_STATUS_FOR_COMPLETION,
    HOUSEHOLD_STATUS_VIOLATION,
    HOUSEHOLD_TOILET_NONE,
    HOUSEHOLD_WASTE_BURNED,
    HOUSEHOLD_WASTE_DUMPED,
    HOUSEHOLD_WATER_LEVEL_1,
    RENEWAL_PAYMENT_PAID,
    RENEWAL_PAYMENT_PARTIAL,
    RENEWAL_PAYMENT_UNPAID,
    RENEWAL_STAGE_APPLICATION_FILED,
    RENEWAL_STAGE_APPROVED,
    RENEWAL_STAGE_INSPECTION_SCHEDULED,
    RENEWAL_STAGE_LAPSED,
    RENEWAL_STAGE_NOTICE_SENT,
    RENEWAL_STAGE_PAYMENT_PENDING,
    RENEWAL_STAGE_RELEASED,
    RENEWAL_STAGE_REQUIREMENTS_REVIEW,
    SANITARY_STATUS_FOR_COMPLETION,
    SANITARY_STATUS_GOOD,
    SANITARY_STATUS_NO_PERMIT,
    SANITARY_STATUS_UPCOMING,
    SANITARY_STATUS_VIOLATION,
    SanitaryBusinessType,
    SanitaryComplaint,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryPermitRenewal,
    HouseholdSanitationRecord,
)
from ..seeders import ensure_initial_sanitation_data
from ..serializers import (
    SanitaryComplaintSerializer,
    SanitaryEstablishmentSerializer,
    SanitaryInspectionSerializer,
    SanitaryPermitRenewalSerializer,
    HouseholdSanitationRecordSerializer,
)


STATUS_LABELS = {
    SANITARY_STATUS_GOOD: "Good Standing",
    SANITARY_STATUS_UPCOMING: "Upcoming",
    SANITARY_STATUS_FOR_COMPLETION: "For Completion",
    SANITARY_STATUS_VIOLATION: "Violation",
    SANITARY_STATUS_NO_PERMIT: "No Permit",
}

PERMIT_STATUS_BY_COMPLIANCE = {
    SANITARY_STATUS_GOOD: PERMIT_STATUS_ACTIVE,
    SANITARY_STATUS_UPCOMING: PERMIT_STATUS_RENEWAL_DUE,
    SANITARY_STATUS_FOR_COMPLETION: PERMIT_STATUS_CONDITIONAL,
    SANITARY_STATUS_VIOLATION: PERMIT_STATUS_SUSPENDED,
}

RENEWAL_STAGE_ORDER = [
    RENEWAL_STAGE_NOTICE_SENT,
    RENEWAL_STAGE_APPLICATION_FILED,
    RENEWAL_STAGE_REQUIREMENTS_REVIEW,
    RENEWAL_STAGE_INSPECTION_SCHEDULED,
    RENEWAL_STAGE_PAYMENT_PENDING,
    RENEWAL_STAGE_APPROVED,
    RENEWAL_STAGE_RELEASED,
]

RENEWAL_STAGE_PROGRESS = {
    RENEWAL_STAGE_NOTICE_SENT: 14,
    RENEWAL_STAGE_APPLICATION_FILED: 29,
    RENEWAL_STAGE_REQUIREMENTS_REVIEW: 43,
    RENEWAL_STAGE_INSPECTION_SCHEDULED: 57,
    RENEWAL_STAGE_PAYMENT_PENDING: 71,
    RENEWAL_STAGE_APPROVED: 86,
    RENEWAL_STAGE_RELEASED: 100,
    RENEWAL_STAGE_LAPSED: 8,
}


def build_sanitation_dashboard_payload():
    ensure_initial_sanitation_data()

    establishments = SanitaryEstablishment.objects.select_related("business_type").all()

    total = establishments.count()
    good = establishments.filter(compliance_status=SANITARY_STATUS_GOOD).count()
    upcoming = establishments.filter(compliance_status=SANITARY_STATUS_UPCOMING).count()
    for_completion = establishments.filter(
        compliance_status=SANITARY_STATUS_FOR_COMPLETION
    ).count()
    violation = establishments.filter(compliance_status=SANITARY_STATUS_VIOLATION).count()
    no_permit = establishments.filter(compliance_status=SANITARY_STATUS_NO_PERMIT).count()

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
                    compliance_status=SANITARY_STATUS_GOOD
                ).count(),
                "for_completion": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_FOR_COMPLETION
                ).count(),
                "upcoming": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_UPCOMING
                ).count(),
                "violation": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_VIOLATION
                ).count(),
                "no_permit": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_NO_PERMIT
                ).count(),
            }
        )

    recent = establishments.order_by("-updated_at")[:6]
    today = timezone.localdate()
    renewal_alerts = (
        SanitaryPermitRenewal.objects.select_related(
            "establishment",
            "establishment__business_type",
        )
        .filter(
            Q(expiration_date__lte=today + timedelta(days=30))
            | Q(stage__in=[RENEWAL_STAGE_PAYMENT_PENDING, RENEWAL_STAGE_LAPSED])
        )
        .exclude(stage=RENEWAL_STAGE_RELEASED)
        .order_by("expiration_date")[:6]
    )
    complaint_alerts = (
        SanitaryComplaint.objects.select_related(
            "establishment",
            "establishment__business_type",
        )
        .filter(status__in=[COMPLAINT_STATUS_PENDING, COMPLAINT_STATUS_INVESTIGATING])
        .order_by("-reported_date")[:6]
    )
    upcoming_inspections = (
        SanitaryInspection.objects.select_related(
            "establishment",
            "establishment__business_type",
        )
        .filter(next_due_date__gte=today)
        .order_by("next_due_date")[:6]
    )

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
        "alerts": {
            "renewals": SanitaryPermitRenewalSerializer(renewal_alerts, many=True).data,
            "complaints": SanitaryComplaintSerializer(complaint_alerts, many=True).data,
            "upcomingInspections": SanitaryInspectionSerializer(
                upcoming_inspections,
                many=True,
            ).data,
        },
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
                "compliance_status_label": STATUS_LABELS.get(
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
                compliance_status=SANITARY_STATUS_GOOD
            ).count(),
            "forCompletion": all_establishments.filter(
                compliance_status=SANITARY_STATUS_FOR_COMPLETION
            ).count(),
            "upcoming": all_establishments.filter(
                compliance_status=SANITARY_STATUS_UPCOMING
            ).count(),
            "violators": all_establishments.filter(
                compliance_status=SANITARY_STATUS_VIOLATION
            ).count(),
            "noPermit": all_establishments.filter(
                compliance_status=SANITARY_STATUS_NO_PERMIT
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
    good = establishments.filter(compliance_status=SANITARY_STATUS_GOOD).count()
    upcoming = establishments.filter(compliance_status=SANITARY_STATUS_UPCOMING).count()
    for_completion = establishments.filter(
        compliance_status=SANITARY_STATUS_FOR_COMPLETION
    ).count()
    violators = establishments.filter(compliance_status=SANITARY_STATUS_VIOLATION).count()
    no_permit = establishments.filter(compliance_status=SANITARY_STATUS_NO_PERMIT).count()

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
                    compliance_status=SANITARY_STATUS_GOOD
                ).count(),
                "forCompletion": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_FOR_COMPLETION
                ).count(),
                "upcoming": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_UPCOMING
                ).count(),
                "violators": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_VIOLATION
                ).count(),
                "noPermit": type_establishments.filter(
                    compliance_status=SANITARY_STATUS_NO_PERMIT
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
        "complaints": build_complaint_summary(),
        "requirementTracker": build_requirement_tracker(establishments),
        "inspectionSchedule": build_inspection_schedule(),
        "riskHotspots": build_barangay_hotspots(establishments),
        "renewalAlerts": build_renewal_alert_summary(),
        "needsAttention": build_needs_attention_list(establishments),
        "questionAnswers": build_adviser_sanitation_questions(establishments),
    }


def build_sanitation_complaints_payload(params=None):
    ensure_initial_sanitation_data()

    params = params or {}
    search = (params.get("search") or "").strip()
    status_filter = (params.get("status") or "").strip()
    priority_filter = (params.get("priority") or "").strip()
    barangay_filter = (params.get("barangay") or "").strip()

    complaints = SanitaryComplaint.objects.select_related(
        "establishment",
        "establishment__business_type",
    ).all()

    if search:
        complaints = complaints.filter(
            Q(complaint_id__icontains=search)
            | Q(establishment__business_name__icontains=search)
            | Q(complainant_name__icontains=search)
            | Q(category__icontains=search)
            | Q(barangay__icontains=search)
        )

    if status_filter and status_filter != "all":
        complaints = complaints.filter(status=status_filter)

    if priority_filter and priority_filter != "all":
        complaints = complaints.filter(priority=priority_filter)

    if barangay_filter and barangay_filter != "all":
        complaints = complaints.filter(barangay=barangay_filter)

    all_complaints = SanitaryComplaint.objects.all()

    return {
        "filters": {
            "search": search,
            "status": status_filter or "all",
            "priority": priority_filter or "all",
            "barangay": barangay_filter or "all",
        },
        "summary": {
            "total": all_complaints.count(),
            "pending": all_complaints.filter(status=COMPLAINT_STATUS_PENDING).count(),
            "investigating": all_complaints.filter(
                status=COMPLAINT_STATUS_INVESTIGATING
            ).count(),
            "resolved": all_complaints.filter(status=COMPLAINT_STATUS_RESOLVED).count(),
            "rejected": all_complaints.filter(status=COMPLAINT_STATUS_REJECTED).count(),
            "highPriority": all_complaints.filter(
                priority=COMPLAINT_PRIORITY_HIGH
            ).count(),
        },
        "byCategory": grouped_counts(all_complaints, "category"),
        "byBarangay": grouped_counts(all_complaints, "barangay"),
        "barangays": sorted(set(SanitaryComplaint.objects.values_list("barangay", flat=True))),
        "rows": SanitaryComplaintSerializer(complaints, many=True).data,
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
            "suspended": all_establishments.filter(permit_status="suspended").count(),
            "noPermit": all_establishments.filter(permit_status="no_permit").count(),
        },
        "rows": SanitaryEstablishmentSerializer(establishments, many=True).data,
    }


def build_sanitation_renewals_payload(params=None):
    ensure_initial_sanitation_data()

    params = params or {}
    search = (params.get("search") or "").strip()
    stage = (params.get("stage") or "").strip()
    business_type_id = (params.get("business_type_id") or "").strip()
    barangay = (params.get("barangay") or "").strip()
    payment_status = (params.get("payment_status") or "").strip()

    renewals = SanitaryPermitRenewal.objects.select_related(
        "establishment",
        "establishment__business_type",
    ).all()

    if search:
        renewals = renewals.filter(
            Q(renewal_id__icontains=search)
            | Q(permit_number__icontains=search)
            | Q(establishment__business_name__icontains=search)
            | Q(establishment__owner_name__icontains=search)
        )

    if stage and stage != "all":
        renewals = renewals.filter(stage=stage)

    if business_type_id and business_type_id != "all":
        renewals = renewals.filter(establishment__business_type_id=business_type_id)

    if barangay and barangay != "all":
        renewals = renewals.filter(establishment__barangay=barangay)

    if payment_status and payment_status != "all":
        renewals = renewals.filter(payment_status=payment_status)

    all_renewals = SanitaryPermitRenewal.objects.all()
    today = timezone.localdate()
    due_limit = today + timedelta(days=30)

    stage_counts = {
        item["stage"]: item["total"]
        for item in all_renewals.values("stage").annotate(total=Count("id"))
    }

    return {
        "filters": {
            "search": search,
            "stage": stage or "all",
            "business_type_id": business_type_id or "all",
            "barangay": barangay or "all",
            "payment_status": payment_status or "all",
        },
        "summary": {
            "totalRenewals": all_renewals.count(),
            "dueForRenewal": all_renewals.filter(
                expiration_date__gte=today,
                expiration_date__lte=due_limit,
            ).exclude(stage=RENEWAL_STAGE_RELEASED).count(),
            "inProgress": all_renewals.exclude(
                stage__in=[RENEWAL_STAGE_RELEASED, RENEWAL_STAGE_LAPSED]
            ).count(),
            "expired": all_renewals.filter(
                Q(stage=RENEWAL_STAGE_LAPSED) | Q(expiration_date__lt=today)
            ).exclude(stage=RENEWAL_STAGE_RELEASED).count(),
            "released": all_renewals.filter(stage=RENEWAL_STAGE_RELEASED).count(),
        },
        "stageCounts": [
            {
                "stage": value,
                "label": label,
                "count": stage_counts.get(value, 0),
            }
            for value, label in SanitaryPermitRenewal._meta.get_field("stage").choices
        ],
        "barangays": sorted(
            set(SanitaryEstablishment.objects.values_list("barangay", flat=True))
        ),
        "rows": SanitaryPermitRenewalSerializer(renewals, many=True).data,
    }


def generate_renewal_id():
    year = timezone.localdate().year
    prefix = f"RNW-{year}-"
    latest = (
        SanitaryPermitRenewal.objects.filter(renewal_id__startswith=prefix)
        .order_by("-renewal_id")
        .first()
    )
    next_number = 1

    if latest:
        try:
            next_number = int(latest.renewal_id.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            next_number = SanitaryPermitRenewal.objects.count() + 1

    while True:
        renewal_id = f"{prefix}{next_number:04d}"
        if not SanitaryPermitRenewal.objects.filter(renewal_id=renewal_id).exists():
            return renewal_id
        next_number += 1


def generate_complaint_id():
    year = timezone.localdate().year
    prefix = f"CMP-{year}-"
    latest = (
        SanitaryComplaint.objects.filter(complaint_id__startswith=prefix)
        .order_by("-complaint_id")
        .first()
    )
    next_number = 1

    if latest:
        try:
            next_number = int(latest.complaint_id.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            next_number = SanitaryComplaint.objects.count() + 1

    while True:
        complaint_id = f"{prefix}{next_number:04d}"
        if not SanitaryComplaint.objects.filter(complaint_id=complaint_id).exists():
            return complaint_id
        next_number += 1


def grouped_counts(queryset, field):
    return [
        {
            "name": item[field] or "Unspecified",
            "total": item["total"],
        }
        for item in queryset.values(field).annotate(total=Count("id")).order_by("-total", field)
    ]


def build_complaint_summary():
    complaints = SanitaryComplaint.objects.all()
    return {
        "summary": {
            "total": complaints.count(),
            "pending": complaints.filter(status=COMPLAINT_STATUS_PENDING).count(),
            "investigating": complaints.filter(status=COMPLAINT_STATUS_INVESTIGATING).count(),
            "resolved": complaints.filter(status=COMPLAINT_STATUS_RESOLVED).count(),
            "rejected": complaints.filter(status=COMPLAINT_STATUS_REJECTED).count(),
            "highPriority": complaints.filter(priority=COMPLAINT_PRIORITY_HIGH).count(),
        },
        "byCategory": grouped_counts(complaints, "category")[:8],
        "byStatus": grouped_counts(complaints, "status"),
    }


def build_requirement_tracker(establishments):
    return [
        {
            "name": "No permit record",
            "total": establishments.filter(Q(has_permit=False) | Q(permit_status=PERMIT_STATUS_NO_PERMIT)).count(),
        },
        {
            "name": "For completion",
            "total": establishments.filter(compliance_status=SANITARY_STATUS_FOR_COMPLETION).count(),
        },
        {
            "name": "Failed / violation",
            "total": establishments.filter(compliance_status=SANITARY_STATUS_VIOLATION).count(),
        },
        {
            "name": "Upcoming inspection",
            "total": establishments.filter(compliance_status=SANITARY_STATUS_UPCOMING).count(),
        },
    ]


def build_inspection_schedule():
    today = timezone.localdate()
    inspections = SanitaryInspection.objects.select_related(
        "establishment",
        "establishment__business_type",
    )
    return {
        "today": SanitaryInspectionSerializer(
            inspections.filter(next_due_date=today)[:6],
            many=True,
        ).data,
        "upcoming": SanitaryInspectionSerializer(
            inspections.filter(next_due_date__gt=today).order_by("next_due_date")[:8],
            many=True,
        ).data,
        "overdue": SanitaryInspectionSerializer(
            inspections.filter(next_due_date__lt=today).order_by("next_due_date")[:8],
            many=True,
        ).data,
    }


def build_barangay_hotspots(establishments):
    risk_counts = (
        establishments.filter(
            Q(compliance_status=SANITARY_STATUS_VIOLATION)
            | Q(compliance_status=SANITARY_STATUS_FOR_COMPLETION)
            | Q(compliance_status=SANITARY_STATUS_NO_PERMIT)
            | Q(permit_status=PERMIT_STATUS_SUSPENDED)
        )
        .values("barangay")
        .annotate(total=Count("id"))
        .order_by("-total", "barangay")[:8]
    )
    complaint_counts = {
        item["barangay"]: item["total"]
        for item in SanitaryComplaint.objects.values("barangay").annotate(total=Count("id"))
    }

    return [
        {
            "barangay": item["barangay"] or "Unspecified",
            "sanitationConcerns": item["total"],
            "complaints": complaint_counts.get(item["barangay"], 0),
            "riskScore": item["total"] + complaint_counts.get(item["barangay"], 0),
        }
        for item in risk_counts
    ]


def build_renewal_alert_summary():
    today = timezone.localdate()
    due_limit = today + timedelta(days=30)
    renewals = SanitaryPermitRenewal.objects.select_related("establishment")
    return {
        "expiringSoon": SanitaryPermitRenewalSerializer(
            renewals.filter(
                expiration_date__gte=today,
                expiration_date__lte=due_limit,
            ).exclude(stage=RENEWAL_STAGE_RELEASED).order_by("expiration_date")[:8],
            many=True,
        ).data,
        "expired": SanitaryPermitRenewalSerializer(
            renewals.filter(expiration_date__lt=today)
            .exclude(stage=RENEWAL_STAGE_RELEASED)
            .order_by("expiration_date")[:8],
            many=True,
        ).data,
        "paymentPending": SanitaryPermitRenewalSerializer(
            renewals.filter(payment_status__in=[RENEWAL_PAYMENT_UNPAID, RENEWAL_PAYMENT_PARTIAL])
            .exclude(stage=RENEWAL_STAGE_RELEASED)
            .order_by("expiration_date")[:8],
            many=True,
        ).data,
    }


def build_needs_attention_list(establishments):
    rows = []

    for establishment in establishments:
        open_complaints = establishment.complaints.exclude(
            status__in=[COMPLAINT_STATUS_RESOLVED, COMPLAINT_STATUS_REJECTED]
        ).count()
        latest_inspection = establishment.inspections.order_by("-inspection_date").first()
        score = 0
        reasons = []

        if establishment.compliance_status == SANITARY_STATUS_VIOLATION:
            score += 40
            reasons.append("Violation status")
        elif establishment.compliance_status == SANITARY_STATUS_FOR_COMPLETION:
            score += 25
            reasons.append("Pending requirements")

        if establishment.permit_status in [PERMIT_STATUS_SUSPENDED, PERMIT_STATUS_NO_PERMIT]:
            score += 30
            reasons.append("Permit enforcement issue")
        elif establishment.permit_status == PERMIT_STATUS_RENEWAL_DUE:
            score += 15
            reasons.append("Permit renewal due")

        if not establishment.has_permit:
            score += 25
            reasons.append("No permit on record")

        if open_complaints:
            score += min(open_complaints * 15, 45)
            reasons.append(f"{open_complaints} open complaint(s)")

        if latest_inspection and latest_inspection.next_due_date:
            today = timezone.localdate()
            if latest_inspection.next_due_date < today:
                score += 20
                reasons.append("Inspection overdue")

        score = min(score, 100)

        if score:
            rows.append(
                {
                    "id": establishment.id,
                    "business_name": establishment.business_name,
                    "barangay": establishment.barangay,
                    "business_type_name": establishment.business_type.name,
                    "riskScore": score,
                    "riskLevel": "High Risk" if score >= 70 else "Medium Risk" if score >= 35 else "Low Risk",
                    "reasons": reasons,
                    "latestInspection": latest_inspection.inspection_date.isoformat()
                    if latest_inspection
                    else "",
                    "nextDueDate": latest_inspection.next_due_date.isoformat()
                    if latest_inspection and latest_inspection.next_due_date
                    else "",
                }
            )

    return sorted(rows, key=lambda item: item["riskScore"], reverse=True)[:10]


def build_adviser_sanitation_questions(establishments):
    households = HouseholdSanitationRecord.objects.all()
    inspections = SanitaryInspection.objects.select_related("establishment")
    complaints = SanitaryComplaint.objects.select_related("establishment")
    needs_attention = build_needs_attention_list(establishments)

    permit_status_text = ", ".join(
        f"{format_permit_status(item['permit_status'])}: {item['total']}"
        for item in establishments.values("permit_status").annotate(total=Count("id"))
    ) or "No permit records available."

    immediate = needs_attention[:5]
    latest_failed = inspections.exclude(status_after_inspection=SANITARY_STATUS_GOOD).first()
    repeated = (
        complaints.exclude(status__in=[COMPLAINT_STATUS_RESOLVED, COMPLAINT_STATUS_REJECTED])
        .values("establishment__business_name")
        .annotate(total=Count("id"))
        .filter(total__gte=2)
        .order_by("-total")
    )
    resolved_complaints = complaints.filter(
        status=COMPLAINT_STATUS_RESOLVED,
        resolved_date__isnull=False,
    )
    resolution_days = [
        (item.resolved_date - item.reported_date).days for item in resolved_complaints
    ]
    average_resolution = (
        round(sum(resolution_days) / len(resolution_days), 1)
        if resolution_days
        else 0
    )
    likely_compliant = establishments.filter(
        has_permit=True,
        permit_status__in=[PERMIT_STATUS_ACTIVE, PERMIT_STATUS_RENEWAL_DUE],
    ).exclude(compliance_status=SANITARY_STATUS_VIOLATION)[:5]
    household_risk_barangay = top_sanitation_group(
        households.filter(status__in=[HOUSEHOLD_STATUS_VIOLATION, HOUSEHOLD_STATUS_FOR_COMPLETION]),
        "barangay",
    )
    household_profile = build_household_barangay_profile(households)
    priority_households = sorted(
        HouseholdSanitationRecordSerializer(households, many=True).data,
        key=lambda item: item["risk_score"],
        reverse=True,
    )[:5]
    factor_counts = {
        "unsafe water source": households.filter(water_level=HOUSEHOLD_WATER_LEVEL_1).count(),
        "unavailable toilet facility": households.filter(toilet_type=HOUSEHOLD_TOILET_NONE).count(),
        "improper waste disposal": households.filter(
            waste_disposal__in=[HOUSEHOLD_WASTE_BURNED, HOUSEHOLD_WASTE_DUMPED]
        ).count(),
    }
    top_factor = max(factor_counts.items(), key=lambda item: item[1]) if factor_counts else ("", 0)
    geographic_hotspot = build_combined_geographic_hotspots(establishments, households)

    return [
        {
            "id": "permit_status",
            "question": "What is the current sanitation permit status of each registered establishment?",
            "answer": permit_status_text,
            "visual": "permit_status",
        },
        {
            "id": "immediate_action",
            "question": "Which establishments need immediate inspection, follow-up, or enforcement action?",
            "answer": ", ".join(item["business_name"] for item in immediate) or "No establishment is currently flagged for immediate action.",
            "visual": "needs_attention",
        },
        {
            "id": "inspection_effect",
            "question": "How do inspection findings affect the compliance status of an establishment?",
            "answer": (
                f"The latest non-compliant inspection changed {latest_failed.establishment.business_name} to {latest_failed.get_status_after_inspection_display()}."
                if latest_failed
                else "Inspection records currently show no non-compliant status changes."
            ),
            "visual": "inspection_status",
        },
        {
            "id": "repeated_issues",
            "question": "Which establishments have repeated violations or recurring sanitation issues?",
            "answer": ", ".join(
                f"{item['establishment__business_name']} ({item['total']})"
                for item in repeated[:5]
            )
            or "No establishment has two or more open recurring complaint records.",
            "visual": "recurring",
        },
        {
            "id": "resolution_time",
            "question": "What is the average time needed to resolve sanitation violations after inspection?",
            "answer": f"Resolved complaint records average {average_resolution} day(s) from report to resolution.",
            "visual": "resolution_time",
        },
        {
            "id": "likely_compliant",
            "question": "Which establishments are most likely to become fully compliant based on their permit status, inspection results, and violation records?",
            "answer": ", ".join(item.business_name for item in likely_compliant) or "No likely-compliant establishment candidates found.",
            "visual": "compliance_prediction",
        },
        {
            "id": "household_poor_barangays",
            "question": "Which barangays have the highest number of households with poor sanitation conditions?",
            "answer": format_sanitation_top_answer(household_risk_barangay, households.count(), "household concern records"),
            "visual": "household_risk_barangay",
        },
        {
            "id": "household_profile",
            "question": "What is the household sanitation profile of each barangay based on toilet facility, water access, and waste disposal method?",
            "answer": household_profile[0]["summary"] if household_profile else "No household profile data available.",
            "visual": "household_profile",
        },
        {
            "id": "priority_households",
            "question": "Which households should be prioritized for sanitary monitoring based on their sanitation risk level?",
            "answer": ", ".join(
                f"{item['household_head']} ({item['risk_level']})"
                for item in priority_households
            )
            or "No priority households found.",
            "visual": "priority_households",
        },
        {
            "id": "risk_factor",
            "question": "Which household sanitation factor contributes most to high risk: unsafe water source, unavailable toilet facility, or improper waste disposal?",
            "answer": f"{top_factor[0].title()} contributes the most with {top_factor[1]} household record(s).",
            "visual": "risk_factor",
        },
        {
            "id": "geographic_risk",
            "question": "Where are the sanitation risk areas located geographically based on household, establishment, inspection, and violation records?",
            "answer": ", ".join(
                f"{item['barangay']} ({item['riskScore']})"
                for item in geographic_hotspot[:5]
            )
            or "No geographic risk hotspot data found.",
            "visual": "risk_map",
        },
    ]


def build_household_barangay_profile(households):
    rows = []

    for barangay in households.values_list("barangay", flat=True).distinct():
        records = households.filter(barangay=barangay)
        total = records.count()
        safe_toilet = records.exclude(toilet_type=HOUSEHOLD_TOILET_NONE).count()
        water_access = records.exclude(water_level=HOUSEHOLD_WATER_LEVEL_1).count()
        proper_waste = records.exclude(
            waste_disposal__in=[HOUSEHOLD_WASTE_BURNED, HOUSEHOLD_WASTE_DUMPED]
        ).count()

        rows.append(
            {
                "barangay": barangay,
                "total": total,
                "safeToilet": safe_toilet,
                "waterAccess": water_access,
                "properWaste": proper_waste,
                "summary": f"{barangay}: {safe_toilet}/{total} with toilet, {water_access}/{total} with safer water access, {proper_waste}/{total} with proper waste disposal.",
            }
        )

    return sorted(rows, key=lambda item: item["barangay"])


def build_combined_geographic_hotspots(establishments, households):
    scores = {}

    for row in build_barangay_hotspots(establishments):
        scores[row["barangay"]] = scores.get(row["barangay"], 0) + row["riskScore"]

    for item in households:
        score = 0
        if item.status == HOUSEHOLD_STATUS_VIOLATION:
            score += 3
        if item.status == HOUSEHOLD_STATUS_FOR_COMPLETION:
            score += 2
        if item.toilet_type == HOUSEHOLD_TOILET_NONE:
            score += 2
        if item.water_level == HOUSEHOLD_WATER_LEVEL_1:
            score += 1
        if item.waste_disposal in [HOUSEHOLD_WASTE_BURNED, HOUSEHOLD_WASTE_DUMPED]:
            score += 1
        scores[item.barangay] = scores.get(item.barangay, 0) + score

    return [
        {"barangay": barangay, "riskScore": score}
        for barangay, score in sorted(scores.items(), key=lambda item: item[1], reverse=True)
    ]


def advance_renewal_stage(renewal):
    if renewal.stage == RENEWAL_STAGE_LAPSED:
        renewal.stage = RENEWAL_STAGE_APPLICATION_FILED
    elif renewal.stage in RENEWAL_STAGE_ORDER:
        index = RENEWAL_STAGE_ORDER.index(renewal.stage)
        renewal.stage = RENEWAL_STAGE_ORDER[min(index + 1, len(RENEWAL_STAGE_ORDER) - 1)]

    renewal.progress = RENEWAL_STAGE_PROGRESS.get(renewal.stage, renewal.progress)
    if renewal.stage == RENEWAL_STAGE_RELEASED:
        renewal.payment_status = RENEWAL_PAYMENT_PAID
        renewal.released_at = timezone.localdate()
    renewal.save()
    return renewal


def sync_renewal_progress(renewal):
    renewal.progress = RENEWAL_STAGE_PROGRESS.get(renewal.stage, renewal.progress)

    if renewal.stage == RENEWAL_STAGE_RELEASED:
        renewal.payment_status = RENEWAL_PAYMENT_PAID
        renewal.released_at = renewal.released_at or timezone.localdate()

    renewal.save()
    return renewal


def sync_establishment_after_inspection(inspection):
    establishment = inspection.establishment
    establishment.compliance_status = inspection.status_after_inspection

    permit_status = PERMIT_STATUS_BY_COMPLIANCE.get(inspection.status_after_inspection)
    if permit_status:
        establishment.permit_status = permit_status

    establishment.save()


def build_sanitation_question_answers(establishments):
    total = establishments.count()
    good = establishments.filter(compliance_status=SANITARY_STATUS_GOOD).count()
    for_completion = establishments.filter(
        compliance_status=SANITARY_STATUS_FOR_COMPLETION
    ).count()
    upcoming = establishments.filter(compliance_status=SANITARY_STATUS_UPCOMING).count()
    violation = establishments.filter(compliance_status=SANITARY_STATUS_VIOLATION).count()
    no_permit = establishments.filter(compliance_status=SANITARY_STATUS_NO_PERMIT).count()
    without_permit = establishments.filter(has_permit=False).count()
    compliance_rate = round((good / total) * 100, 1) if total else 0
    top_type = top_sanitation_group(establishments, "business_type__name")
    top_violation_type = top_sanitation_group(
        establishments.filter(compliance_status=SANITARY_STATUS_VIOLATION),
        "business_type__name",
    )
    top_barangay_risk = top_sanitation_group(
        establishments.filter(
            Q(compliance_status=SANITARY_STATUS_VIOLATION)
            | Q(compliance_status=SANITARY_STATUS_FOR_COMPLETION)
            | Q(compliance_status=SANITARY_STATUS_NO_PERMIT)
        ),
        "barangay",
    )
    top_no_permit_type = top_sanitation_group(
        establishments.filter(Q(has_permit=False) | Q(permit_status=PERMIT_STATUS_NO_PERMIT)),
        "business_type__name",
    )
    permit_status = establishments.values("permit_status").annotate(total=Count("id"))
    permit_summary = ", ".join(
        f"{format_permit_status(item['permit_status'])}: {item['total']}"
        for item in permit_status
    ) or "No permit records yet"
    monthly_queue = establishments.filter(
        business_type__inspection_frequency="monthly",
        compliance_status__in=[
            SANITARY_STATUS_UPCOMING,
            SANITARY_STATUS_FOR_COMPLETION,
            SANITARY_STATUS_VIOLATION,
            SANITARY_STATUS_NO_PERMIT,
        ],
    ).count()
    quarterly_queue = establishments.filter(
        business_type__inspection_frequency="quarterly",
        compliance_status__in=[
            SANITARY_STATUS_UPCOMING,
            SANITARY_STATUS_FOR_COMPLETION,
            SANITARY_STATUS_VIOLATION,
            SANITARY_STATUS_NO_PERMIT,
        ],
    ).count()
    urgent = list(
        establishments.filter(
            Q(compliance_status=SANITARY_STATUS_VIOLATION)
            | Q(compliance_status=SANITARY_STATUS_NO_PERMIT)
            | Q(permit_status=PERMIT_STATUS_SUSPENDED)
        )
        .order_by("business_name")
        .values_list("business_name", flat=True)[:5]
    )

    return [
        {
            "id": "monitored_establishments",
            "question": "How many establishments are currently monitored by the sanitation office?",
            "answer": f"The system monitors {total} establishments in the selected scope.",
        },
        {
            "id": "compliance_rate",
            "question": "What percentage of establishments are in good sanitary standing?",
            "answer": f"{good} out of {total} establishments are in good standing, giving a compliance rate of {compliance_rate}%.",
        },
        {
            "id": "largest_business_type",
            "question": "Which business type has the highest number of monitored establishments?",
            "answer": format_sanitation_top_answer(top_type, total, "establishments"),
        },
        {
            "id": "violation_business_type",
            "question": "Which business type has the highest number of sanitation violations or complaints?",
            "answer": format_sanitation_top_answer(top_violation_type, violation, "violation records"),
        },
        {
            "id": "requirements_queue",
            "question": "How many establishments still have pending requirements or incomplete compliance?",
            "answer": f"{for_completion} establishments are marked for completion and {upcoming} are queued for upcoming inspection.",
        },
        {
            "id": "permit_gap",
            "question": "How many establishments have no permit or missing permit records?",
            "answer": f"{without_permit} establishments have no permit flag, while {no_permit} are classified under no-permit compliance status.",
        },
        {
            "id": "permit_status",
            "question": "What is the current status distribution of sanitary permits?",
            "answer": permit_summary,
        },
        {
            "id": "barangay_risk",
            "question": "Which barangay has the highest sanitation concern count?",
            "answer": format_sanitation_top_answer(top_barangay_risk, total, "concern records"),
        },
        {
            "id": "inspection_frequency_queue",
            "question": "Which inspection frequency queue needs more attention: monthly or quarterly?",
            "answer": f"Monthly queue: {monthly_queue}; quarterly queue: {quarterly_queue}.",
        },
        {
            "id": "urgent_attention",
            "question": "Which establishments require immediate follow-up because of violation, no-permit, or suspended status?",
            "answer": (
                "Immediate follow-up list: " + ", ".join(urgent)
                if urgent
                else "No establishments currently require immediate follow-up."
            ),
        },
    ]


def top_sanitation_group(queryset, group_field):
    item = (
        queryset.values(group_field)
        .annotate(total=Count("id"))
        .order_by("-total", group_field)
        .first()
    )

    if not item:
        return {"name": "", "total": 0}

    return {"name": item.get(group_field) or "Unspecified", "total": item["total"] or 0}


def format_sanitation_top_answer(item, denominator, unit):
    if not item.get("name"):
        return "No matching sanitation records are available yet."

    percentage = round((item["total"] / denominator) * 100, 1) if denominator else 0
    return f"{item['name']} leads with {item['total']} {unit}, equal to {percentage}% of the selected total."


def format_permit_status(value):
    labels = {
        PERMIT_STATUS_ACTIVE: "Active",
        PERMIT_STATUS_RENEWAL_DUE: "Renewal due",
        PERMIT_STATUS_CONDITIONAL: "Conditional",
        PERMIT_STATUS_SUSPENDED: "Suspended",
        PERMIT_STATUS_NO_PERMIT: "No permit",
    }
    return labels.get(value, value or "Unspecified")
