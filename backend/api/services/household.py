from django.db.models import Count, Q
from ..models import HouseholdSanitationRecord
from ..seeders import ensure_initial_household_data


def build_household_dashboard_payload(barangay=None):
    ensure_initial_household_data()

    records = HouseholdSanitationRecord.objects.all()
    if barangay and barangay != "all":
        records = records.filter(barangay=barangay)

    # Consolidate all distribution and summary counts into a single aggregate query
    agg = records.aggregate(
        total=Count("id"),
        with_sanitary_facility=Count("id", filter=~Q(toilet_type="none")),
        with_water_access=Count("id", filter=Q(water_level__in=["level_2", "level_3"])),
        at_risk=Count("id", filter=Q(status="violation")),
        toilet_water_sealed=Count("id", filter=Q(toilet_type="water_sealed")),
        toilet_pour_flush=Count("id", filter=Q(toilet_type="pour_flush")),
        toilet_pit_latrine=Count("id", filter=Q(toilet_type="pit_latrine")),
        toilet_none=Count("id", filter=Q(toilet_type="none")),
        waste_collected=Count("id", filter=Q(waste_disposal="collected")),
        waste_composted=Count("id", filter=Q(waste_disposal="composted")),
        waste_burned=Count("id", filter=Q(waste_disposal="burned")),
        waste_dumped=Count("id", filter=Q(waste_disposal="dumped")),
        water_level1=Count("id", filter=Q(water_level="level_1")),
        water_level2=Count("id", filter=Q(water_level="level_2")),
        water_level3=Count("id", filter=Q(water_level="level_3")),
    )

    total = agg["total"] or 0
    with_sanitary_facility = agg["with_sanitary_facility"] or 0
    with_water_access = agg["with_water_access"] or 0
    at_risk = agg["at_risk"] or 0

    risk_by_barangay = []
    barangay_stats = records.values("barangay").annotate(
        total_count=Count("id"),
        at_risk_count=Count("id", filter=Q(status="violation")),
        for_completion_count=Count("id", filter=Q(status="for_completion")),
        good_standing_count=Count("id", filter=Q(status="good_standing")),
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
            "waterSealed": agg["toilet_water_sealed"] or 0,
            "pourFlush": agg["toilet_pour_flush"] or 0,
            "pitLatrine": agg["toilet_pit_latrine"] or 0,
            "none": agg["toilet_none"] or 0,
        },
        "wasteDistribution": {
            "collected": agg["waste_collected"] or 0,
            "composted": agg["waste_composted"] or 0,
            "burned": agg["waste_burned"] or 0,
            "dumped": agg["waste_dumped"] or 0,
        },
        "waterDistribution": {
            "level1": agg["water_level1"] or 0,
            "level2": agg["water_level2"] or 0,
            "level3": agg["water_level3"] or 0,
        },
    }
