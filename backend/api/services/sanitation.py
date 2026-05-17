from django.db.models import Q

from ..models import (
    PERMIT_STATUS_ACTIVE,
    PERMIT_STATUS_CONDITIONAL,
    PERMIT_STATUS_RENEWAL_DUE,
    PERMIT_STATUS_SUSPENDED,
    SANITARY_STATUS_FOR_COMPLETION,
    SANITARY_STATUS_GOOD,
    SANITARY_STATUS_NO_PERMIT,
    SANITARY_STATUS_UPCOMING,
    SANITARY_STATUS_VIOLATION,
    SanitaryBusinessType,
    SanitaryEstablishment,
)
from ..seeders import ensure_initial_sanitation_data
from ..serializers import SanitaryEstablishmentSerializer


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


def sync_establishment_after_inspection(inspection):
    establishment = inspection.establishment
    establishment.compliance_status = inspection.status_after_inspection

    permit_status = PERMIT_STATUS_BY_COMPLIANCE.get(inspection.status_after_inspection)
    if permit_status:
        establishment.permit_status = permit_status

    establishment.save()
