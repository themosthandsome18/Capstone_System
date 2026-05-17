import json
from pathlib import Path

from django.db.models import Max
from django.utils import timezone

from .models import (
    BoatType,
    Country,
    FeedbackEntry,
    HouseholdSanitationRecord,
    Itinerary,
    Province,
    Region,
    Resort,
    SanitaryBusinessType,
    SanitaryEstablishment,
    SanitaryInspection,
    SanitaryInspectionChecklistItem,
    SanitaryRequirement,
    TouristRecord,
    TravelMode,
    VisitPurpose,
)
from .seed_data import (
    HOUSEHOLD_SANITATION_RECORDS,
    INITIAL_FEEDBACK_ENTRIES,
    INITIAL_TOURIST_RECORDS,
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
    for model, rows in REFERENCE_SEED_CONFIG:
        if model in (Region, Province):
            continue

        if model is Resort:
            for row in rows:
                Resort.objects.get_or_create(
                    resort_id=row["resort_id"],
                    defaults=row,
                )
            continue

        for row in rows:
            row_data = row.copy()
            row_id = row_data.pop("id")
            model.objects.update_or_create(
                id=row_id,
                defaults=row_data,
            )

    ensure_ph_location_regions_and_provinces()


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
    ensure_initial_reference_data()
    ensure_initial_tourist_records()
    ensure_initial_feedback_entries()
    ensure_initial_sanitation_data()
    ensure_initial_household_data()


def ensure_initial_sanitation_data():
    if SanitaryBusinessType.objects.exists():
        return

    business_type_lookup = {}

    for row in SANITARY_BUSINESS_TYPES:
        business_type = SanitaryBusinessType.objects.create(**row)
        business_type_lookup[business_type.name] = business_type

    for group in SANITARY_REQUIREMENTS:
        business_type = business_type_lookup.get(group["business_type"])

        if not business_type:
            continue

        for requirement_name in group["requirements"]:
            SanitaryRequirement.objects.create(
                business_type=business_type,
                permit_size=group["permit_size"],
                requirement_name=requirement_name,
                is_required=True,
            )

    establishment_lookup = {}

    for row in SANITARY_ESTABLISHMENTS:
        data = row.copy()
        business_type_name = data.pop("business_type")
        business_type = business_type_lookup.get(business_type_name)

        if not business_type:
            continue

        establishment = SanitaryEstablishment.objects.create(
            business_type=business_type,
            **data,
        )
        establishment_lookup[establishment.business_name] = establishment

    for row in SANITARY_INSPECTIONS:
        data = row.copy()
        business_name = data.pop("business_name")
        checklist = data.pop("checklist", [])

        establishment = establishment_lookup.get(business_name)

        if not establishment:
            continue

        inspection = SanitaryInspection.objects.create(
            establishment=establishment,
            **data,
        )

        for item in checklist:
            SanitaryInspectionChecklistItem.objects.create(
                inspection=inspection,
                **item,
            )


def ensure_initial_household_data():
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
