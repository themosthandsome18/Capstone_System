from ..models import HouseholdSanitationRecord
from ..seeders import ensure_initial_household_data


def build_household_dashboard_payload():
    ensure_initial_household_data()

    records = HouseholdSanitationRecord.objects.all()
    total = records.count()

    with_sanitary_facility = records.exclude(toilet_type="none").count()
    with_water_access = records.filter(water_level__in=["level_2", "level_3"]).count()
    at_risk = records.filter(status="violation").count()

    from django.db.models import Count, Q

    risk_by_barangay = []
    
    barangay_stats = records.values("barangay").annotate(
        total_count=Count("id"),
        at_risk_count=Count("id", filter=Q(status="violation")),
        for_completion_count=Count("id", filter=Q(status="for_completion")),
        good_standing_count=Count("id", filter=Q(status="good_standing"))
    )

    for stat in barangay_stats:
        if stat["barangay"]:
            risk_by_barangay.append({
                "barangay": stat["barangay"],
                "total": stat["total_count"],
                "atRisk": stat["at_risk_count"],
                "forCompletion": stat["for_completion_count"],
                "goodStanding": stat["good_standing_count"],
            })

    return {
        "summary": {
            "totalHouseholds": total,
            "withSanitaryFacility": with_sanitary_facility,
            "sanitaryFacilityCoverage": round(
                (with_sanitary_facility / total) * 100
            )
            if total
            else 0,
            "withWaterAccess": with_water_access,
            "waterAccessCoverage": round((with_water_access / total) * 100)
            if total
            else 0,
            "atRiskHouseholds": at_risk,
        },
        "riskByBarangay": risk_by_barangay,
        "toiletDistribution": {
            "waterSealed": records.filter(toilet_type="water_sealed").count(),
            "pourFlush": records.filter(toilet_type="pour_flush").count(),
            "pitLatrine": records.filter(toilet_type="pit_latrine").count(),
            "none": records.filter(toilet_type="none").count(),
        },
        "wasteDistribution": {
            "collected": records.filter(waste_disposal="collected").count(),
            "composted": records.filter(waste_disposal="composted").count(),
            "burned": records.filter(waste_disposal="burned").count(),
            "dumped": records.filter(waste_disposal="dumped").count(),
        },
        "waterDistribution": {
            "level1": records.filter(water_level="level_1").count(),
            "level2": records.filter(water_level="level_2").count(),
            "level3": records.filter(water_level="level_3").count(),
        },
    }
