import json
from datetime import timedelta
from pathlib import Path

from django.db.models import Max
from django.utils import timezone

from .models import (
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
    SanitaryInspectionChecklistItem,
    SanitaryPermitRenewal,
    SanitaryRequirement,
    TouristRecord,
    TravelMode,
    VisitPurpose,
)
from .seed_data import (
    HOUSEHOLD_SANITATION_RECORDS,
    INITIAL_FEEDBACK_ENTRIES,
    INITIAL_TOURIST_RECORDS,
    LEGACY_SANITARY_BUSINESS_TYPE_ALIASES,
    MAUBAN_BARANGAYS,
    REFERENCE_TABLES,
    SANITARY_BUSINESS_TYPES,
    SANITARY_ESTABLISHMENTS,
    SANITARY_INSPECTIONS,
    SANITARY_REQUIREMENTS,
)


REFERENCE_SEED_CONFIG = (
    (Country, REFERENCE_TABLES["countries"]),
    (Region, REFERENCE_TABLES["regions"]),
    (Province, REFERENCE_TABLES["provinces"]),
    (Itinerary, REFERENCE_TABLES["itineraries"]),
    (TravelMode, REFERENCE_TABLES["travel_modes"]),
    (BoatType, REFERENCE_TABLES["boat_types"]),
    (VisitPurpose, REFERENCE_TABLES["visit_purposes"]),
    (Resort, REFERENCE_TABLES["resorts"]),
)

_REFERENCE_DATA_READY = False
_TOURISM_DATA_READY = False
_SANITATION_DATA_READY = False

PH_LOCATION_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "ph_locations"

REGION_LABELS_BY_CODE = {
    "01": "Region I - Ilocos Region",
    "02": "Region II - Cagayan Valley",
    "03": "Region III - Central Luzon",
    "04": "CALABARZON Region",
    "17": "MIMAROPA Region",
    "05": "Region V - Bicol Region",
    "13": "NCR - National Capital Region",
    "14": "CAR - Cordillera Administrative Region",
    "06": "Region VI - Western Visayas",
    "07": "Region VII - Central Visayas",
    "08": "Region VIII - Eastern Visayas",
    "09": "Region IX - Zamboanga Peninsula",
    "10": "Region X - Northern Mindanao",
    "11": "Region XI - Davao Region",
    "12": "Region XII - SOCCSKSARGEN",
    "16": "Region XIII - Caraga",
    "15": "Autonomous Region in Muslim Mindanao (ARMM)",
}

REGION_DISPLAY_ORDER = [
    "01",
    "02",
    "03",
    "04",
    "17",
    "05",
    "13",
    "14",
    "06",
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "16",
    "15",
]


def ensure_initial_reference_data():
    global _REFERENCE_DATA_READY

    if _REFERENCE_DATA_READY and has_initial_reference_data():
        sync_seed_resorts(REFERENCE_TABLES["resorts"])
        return

    if has_initial_reference_data():
        sync_seed_resorts(REFERENCE_TABLES["resorts"])
        _REFERENCE_DATA_READY = True
        return

    ensure_initial_barangays()

    for model, rows in REFERENCE_SEED_CONFIG:
        if model in (Region, Province):
            continue

        if model is Resort:
            sync_seed_resorts(rows)
            continue

        for row in rows:
            row_data = row.copy()
            row_id = row_data.pop("id")
            model.objects.update_or_create(
                id=row_id,
                defaults=row_data,
            )

    ensure_ph_location_regions_and_provinces()
    _REFERENCE_DATA_READY = True


def sync_seed_resorts(rows):
    seed_ids = []

    for row in rows:
        seed_ids.append(row["resort_id"])
        Resort.objects.update_or_create(
            resort_id=row["resort_id"],
            defaults=row,
        )

    removable_resorts = Resort.objects.exclude(resort_id__in=seed_ids)
    removable_resorts.filter(tourist_records__isnull=True).delete()


def has_initial_reference_data():
    return (
        Barangay.objects.exists()
        and Country.objects.exists()
        and Region.objects.exists()
        and Province.objects.exists()
        and Itinerary.objects.exists()
        and TravelMode.objects.exists()
        and BoatType.objects.exists()
        and VisitPurpose.objects.exists()
        and Resort.objects.exists()
    )


def ensure_initial_barangays():
    if (
        Barangay.objects.filter(name__in=MAUBAN_BARANGAYS, is_active=True).count()
        == len(MAUBAN_BARANGAYS)
    ):
        return

    for index, name in enumerate(MAUBAN_BARANGAYS, start=1):
        Barangay.objects.update_or_create(
            name=name,
            defaults={
                "municipality": "Mauban",
                "province": "Quezon",
                "display_order": index,
                "is_active": True,
            },
        )


def ensure_ph_location_regions_and_provinces():
    regions_by_code = ensure_ph_location_regions()
    ensure_ph_location_provinces(regions_by_code)


def ensure_ph_location_regions():
    regions_path = PH_LOCATION_DATA_DIR / "regions.json"

    if not regions_path.exists():
        return ensure_seed_regions()

    with regions_path.open("r", encoding="utf-8") as file:
        rows = json.load(file)

    rows_by_code = {row["reg_code"]: row for row in rows}
    regions_by_code = {}

    for index, code in enumerate(REGION_DISPLAY_ORDER, start=1):
        row = rows_by_code.get(code)
        if not row:
            continue

        region, _ = Region.objects.update_or_create(
            id=index,
            defaults={
                "name": REGION_LABELS_BY_CODE.get(
                    code,
                    normalize_location_label(row.get("name", "")),
                ),
                "code": code,
            },
        )
        regions_by_code[code] = region

    return regions_by_code


def ensure_seed_regions():
    regions_by_code = {}

    for row in REFERENCE_TABLES["regions"]:
        code = row.get("code", "")
        region, _ = Region.objects.update_or_create(
            id=row["id"],
            defaults={
                "name": row["name"],
                "code": code,
            },
        )
        if code:
            regions_by_code[code] = region

    return regions_by_code


def ensure_ph_location_provinces(regions_by_code):
    provinces_path = PH_LOCATION_DATA_DIR / "provinces.json"

    if not provinces_path.exists():
        ensure_seed_provinces(regions_by_code)
        return

    with provinces_path.open("r", encoding="utf-8") as file:
        rows = json.load(file)

    province_id = 1
    for row in sorted(rows, key=lambda item: (region_sort_key(item), item["name"])):
        name = normalize_location_label(row.get("name", ""))
        region = regions_by_code.get(row.get("reg_code"))

        if row.get("reg_code") == "13":
            continue

        if not name or not region:
            continue

        Province.objects.update_or_create(
            id=province_id,
            defaults={
                "name": name,
                "region": region,
                "code": row.get("prov_code", ""),
            },
        )
        province_id += 1

    ncr_region = regions_by_code.get("13")
    if ncr_region:
        Province.objects.filter(region=ncr_region).exclude(
            name="Metro Manila"
        ).delete()
        metro_manila = Province.objects.filter(
            region=ncr_region,
            name="Metro Manila",
        ).order_by("id").first()
        metro_manila_id = metro_manila.id if metro_manila else province_id

        Province.objects.filter(
            region=ncr_region,
            name="Metro Manila",
        ).exclude(id=metro_manila_id).delete()
        Province.objects.update_or_create(
            id=metro_manila_id,
            defaults={
                "name": "Metro Manila",
                "region": ncr_region,
                "code": "1300",
            },
        )


def ensure_seed_provinces(regions_by_code):
    calabarzon_region = regions_by_code.get("04") or Region.objects.filter(
        name__icontains="CALABARZON",
    ).first()
    ncr_region = regions_by_code.get("13") or Region.objects.filter(
        name__icontains="National Capital",
    ).first()

    for row in REFERENCE_TABLES["provinces"]:
        region = ncr_region if row["name"] == "Metro Manila" else calabarzon_region
        if not region:
            continue

        Province.objects.update_or_create(
            id=row["id"],
            defaults={
                "name": row["name"],
                "region": region,
                "code": row.get("code", ""),
            },
        )


def region_sort_key(row):
    try:
        return REGION_DISPLAY_ORDER.index(row.get("reg_code"))
    except ValueError:
        return len(REGION_DISPLAY_ORDER)


def normalize_reference_name(value):
    return " ".join(str(value).strip().lower().split())


def normalize_location_label(value):
    return " ".join(str(value).strip().title().split())


def ensure_initial_tourist_records():
    if TouristRecord.objects.exists():
        return

    TouristRecord.objects.bulk_create(
        TouristRecord(**record) for record in INITIAL_TOURIST_RECORDS
    )


def ensure_initial_feedback_entries():
    if FeedbackEntry.objects.exists():
        return

    FeedbackEntry.objects.bulk_create(
        FeedbackEntry(**entry) for entry in INITIAL_FEEDBACK_ENTRIES
    )


def ensure_initial_data():
    ensure_initial_tourism_data()
    ensure_initial_sanitation_data()
    ensure_initial_household_data()


def ensure_initial_tourism_data():
    global _TOURISM_DATA_READY

    if _TOURISM_DATA_READY:
        return

    if (
        TouristRecord.objects.exists()
        and Resort.objects.exists()
        and Country.objects.exists()
    ):
        sync_seed_resorts(REFERENCE_TABLES["resorts"])
        _TOURISM_DATA_READY = True
        return

    ensure_initial_reference_data()
    ensure_initial_tourist_records()
    ensure_initial_feedback_entries()
    _TOURISM_DATA_READY = True


def ensure_initial_sanitation_data():
    global _SANITATION_DATA_READY

    if _SANITATION_DATA_READY and SanitaryEstablishment.objects.exists():
        sync_sanitary_business_types_and_requirements()
        ensure_initial_permit_renewals()
        return

    if (
        SanitaryBusinessType.objects.exists()
        and SanitaryRequirement.objects.exists()
        and SanitaryEstablishment.objects.exists()
        and SanitaryInspection.objects.exists()
        and SanitaryPermitRenewal.objects.exists()
        and SanitaryComplaint.objects.exists()
    ):
        sync_sanitary_business_types_and_requirements()
        ensure_initial_permit_renewals()
        _SANITATION_DATA_READY = True
        return

    business_type_lookup = sync_sanitary_business_types_and_requirements()

    establishment_lookup = {}

    for row in SANITARY_ESTABLISHMENTS:
        data = row.copy()
        business_type_name = data.pop("business_type")
        business_type = business_type_lookup.get(business_type_name)

        if not business_type:
            continue

        establishment, _ = SanitaryEstablishment.objects.update_or_create(
            business_name=data["business_name"],
            defaults={
                **data,
                "business_type": business_type,
            },
        )
        establishment_lookup[establishment.business_name] = establishment

    for row in SANITARY_INSPECTIONS:
        data = row.copy()
        business_name = data.pop("business_name")
        checklist = data.pop("checklist", [])

        establishment = establishment_lookup.get(business_name)

        if not establishment:
            continue

        inspection, _ = SanitaryInspection.objects.update_or_create(
            establishment=establishment,
            inspection_date=data["inspection_date"],
            defaults={
                **data,
                "establishment": establishment,
            },
        )

        for item in checklist:
            SanitaryInspectionChecklistItem.objects.update_or_create(
                inspection=inspection,
                requirement_name=item["requirement_name"],
                defaults={
                    "is_complied": item.get("is_complied", False),
                    "notes": item.get("notes", ""),
                },
            )

    ensure_initial_permit_renewals()
    ensure_initial_sanitary_complaints()
    _SANITATION_DATA_READY = True


def sync_sanitary_business_types_and_requirements():
    rename_legacy_sanitary_business_types()

    business_type_lookup = {}

    for row in SANITARY_BUSINESS_TYPES:
        business_type, _ = SanitaryBusinessType.objects.update_or_create(
            name=row["name"],
            defaults={
                "inspection_frequency": row["inspection_frequency"],
                "description": row.get("description", ""),
            },
        )
        business_type_lookup[business_type.name] = business_type

    seed_requirement_keys = set()

    for group in SANITARY_REQUIREMENTS:
        business_type = business_type_lookup.get(group["business_type"])

        if not business_type:
            continue

        for requirement_name in group["requirements"]:
            seed_requirement_keys.add(
                (business_type.id, group["permit_size"], requirement_name)
            )
            SanitaryRequirement.objects.update_or_create(
                business_type=business_type,
                permit_size=group["permit_size"],
                requirement_name=requirement_name,
                defaults={"is_required": True},
            )

    seed_type_ids = {business_type.id for business_type in business_type_lookup.values()}

    for requirement in SanitaryRequirement.objects.filter(
        business_type_id__in=seed_type_ids,
    ):
        key = (
            requirement.business_type_id,
            requirement.permit_size,
            requirement.requirement_name,
        )
        if key not in seed_requirement_keys:
            requirement.delete()

    sync_seed_establishment_business_types(business_type_lookup)

    return business_type_lookup


def rename_legacy_sanitary_business_types():
    for legacy_name, target_name in LEGACY_SANITARY_BUSINESS_TYPE_ALIASES.items():
        legacy_type = SanitaryBusinessType.objects.filter(name=legacy_name).first()
        if not legacy_type:
            continue

        target_type = SanitaryBusinessType.objects.filter(name=target_name).first()
        if target_type:
            SanitaryEstablishment.objects.filter(business_type=legacy_type).update(
                business_type=target_type
            )
            SanitaryRequirement.objects.filter(business_type=legacy_type).delete()
            if not legacy_type.establishments.exists():
                legacy_type.delete()
            continue

        legacy_type.name = target_name
        legacy_type.save(update_fields=["name"])


def sync_seed_establishment_business_types(business_type_lookup):
    for row in SANITARY_ESTABLISHMENTS:
        business_type = business_type_lookup.get(row["business_type"])
        if not business_type:
            continue

        SanitaryEstablishment.objects.filter(
            business_name=row["business_name"],
        ).update(
            business_type=business_type,
            permit_size=row["permit_size"],
        )


def ensure_initial_permit_renewals():
    stages = [
        ("notice_sent", "unpaid", 14),
        ("application_filed", "unpaid", 29),
        ("requirements_review", "unpaid", 43),
        ("inspection_scheduled", "partial", 57),
        ("payment_pending", "partial", 71),
        ("approved", "paid", 86),
        ("released", "paid", 100),
        ("lapsed", "unpaid", 8),
    ]
    establishments = list(SanitaryEstablishment.objects.order_by("id")[:10])
    for index, establishment in enumerate(establishments, start=1):
        stage, payment_status, progress = stages[(index - 1) % len(stages)]
        expiration_date = timezone.localdate() + timedelta(days=(index * 8) - 18)
        requirements = list(
            establishment.business_type.requirements.filter(
                permit_size=establishment.permit_size
            ).values_list("requirement_name", flat=True)
        )
        submitted_count = (
            min(len(requirements), 2 + (index % len(requirements)))
            if requirements
            else 0
        )

        SanitaryPermitRenewal.objects.update_or_create(
            renewal_id=f"RNW-2026-{index:04d}",
            defaults={
                "establishment": establishment,
                "permit_number": establishment.permit_number or f"SP-2026-{index:04d}",
                "permit_type": "Sanitary Permit",
                "expiration_date": expiration_date,
                "stage": stage,
                "progress": progress,
                "renewal_fee": 500 + (index * 300),
                "payment_status": payment_status,
                "submitted_requirements": requirements[:submitted_count],
                "inspection_status": (
                    "Inspection Completed - Passed"
                    if stage in {"approved", "released"}
                    else "For inspection scheduling"
                ),
                "remarks": "Routine annual sanitary permit renewal.",
                "released_at": timezone.localdate() if stage == "released" else None,
            },
        )


def ensure_initial_sanitary_complaints():
    establishments = list(
        SanitaryEstablishment.objects.select_related("business_type").order_by("id")[:12]
    )
    categories = [
        "Food handling concern",
        "Improper waste disposal",
        "Expired sanitary permit",
        "Water potability concern",
        "Unclean preparation area",
        "Pest control concern",
    ]
    statuses = ["pending", "investigating", "resolved", "pending", "resolved", "rejected"]
    priorities = ["high", "medium", "high", "medium", "low", "medium"]

    for index, establishment in enumerate(establishments, start=1):
        status_value = statuses[(index - 1) % len(statuses)]
        SanitaryComplaint.objects.update_or_create(
            complaint_id=f"CMP-2026-{index:04d}",
            defaults={
                "establishment": establishment,
                "complainant_name": f"Resident {index}",
                "contact_number": f"09{index:09d}"[:11],
                "category": categories[(index - 1) % len(categories)],
                "barangay": establishment.barangay,
                "reported_date": timezone.localdate() - timedelta(days=index * 3),
                "status": status_value,
                "priority": priorities[(index - 1) % len(priorities)],
                "description": "Complaint recorded for sanitary monitoring follow-up.",
                "action_taken": (
                    "Verified by sanitary inspector and advised correction."
                    if status_value == "resolved"
                    else "For validation and inspection scheduling."
                ),
                "resolved_date": (
                    timezone.localdate() - timedelta(days=index)
                    if status_value == "resolved"
                    else None
                ),
            },
        )


def ensure_initial_household_data():
    ensure_initial_barangays()

    if HouseholdSanitationRecord.objects.exists():
        return

    HouseholdSanitationRecord.objects.bulk_create(
        HouseholdSanitationRecord(**record) for record in HOUSEHOLD_SANITATION_RECORDS
    )


def generate_survey_id():
    year = timezone.localdate().year
    prefix = f"SURV-{year}-"
    latest = (
        TouristRecord.objects.filter(survey_id__startswith=prefix)
        .order_by("-survey_id")
        .first()
    )

    next_number = 1
    if latest:
        try:
            next_number = int(latest.survey_id.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            next_number = TouristRecord.objects.count() + 1

    while True:
        survey_id = f"{prefix}{next_number:03d}"
        if not TouristRecord.objects.filter(survey_id=survey_id).exists():
            return survey_id
        next_number += 1


def generate_resort_id():
    latest_id = Resort.objects.aggregate(max_id=Max("resort_id"))["max_id"] or 0
    return latest_id + 1
