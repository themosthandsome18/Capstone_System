"""Synthetic preview records (requires Django setup and the fake photo store)."""
import datetime
import io

from PIL import Image, ImageDraw

PREVIEW_USERNAME = "preview.inspector"
# Synthetic, preview-only credential for a throwaway local database. Not a real account.
PREVIEW_PASSWORD = "preview-only-not-a-secret"


def _photo(color, label):
    image = Image.new("RGB", (480, 320), color)
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, 464, 304), outline=(255, 255, 255), width=4)
    draw.text((32, 140), f"SYNTHETIC PREVIEW PHOTO\n{label}", fill=(255, 255, 255))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=85)
    return out.getvalue()


def seed(store):
    from django.contrib.auth.models import User
    from api.models import (
        HouseholdSanitationRecord, SanitaryBusinessType, SanitaryComplaint,
        SanitaryEstablishment, UserProfile,
    )
    from api.services.household_photos import replace_household_photo

    user = User.objects.create_user(
        username=PREVIEW_USERNAME, password=PREVIEW_PASSWORD,
        first_name="Preview", last_name="Inspector")
    UserProfile.objects.update_or_create(user=user, defaults={"role": "sanitation"})

    business_type = SanitaryBusinessType.objects.order_by("pk").first()
    if business_type is None:
        business_type = SanitaryBusinessType.objects.create(name="Synthetic Food Establishment")
    establishments = [
        ("Synthetic Carinderia", "Daungan", 14.1855, 121.7310, "good_standing"),
        ("Synthetic Bakery", "Poblacion", 14.1890, 121.7290, "violation"),
        ("Synthetic Water Refilling", "Rizaliana", 14.1910, 121.7360, "for_completion"),
        ("Synthetic Sari-sari Store", "Alitap", 14.1800, 121.7400, "not_yet_inspected"),
    ]
    for index, (name, barangay, lat, lng, status) in enumerate(establishments, start=1):
        SanitaryEstablishment.objects.create(
            business_name=name, owner_name=f"Synthetic Owner {index}", business_type=business_type,
            barangay=barangay, address=f"{index} Synthetic Street", latitude=lat, longitude=lng,
            compliance_status=status)

    households = []
    for index, (head, barangay, lat, lng) in enumerate([
        ("Synthetic Household A", "Daungan", 14.1860, 121.7320),
        ("Synthetic Household B", "Poblacion", 14.1880, 121.7280),
        ("Synthetic Household C (no coordinates)", "Alitap", None, None),
    ], start=1):
        households.append(HouseholdSanitationRecord.objects.create(
            household_code=f"SYN-HH-{index:03d}", household_head=head, barangay=barangay,
            latitude=lat, longitude=lng, male_count=2, female_count=2))

    today = datetime.date.today()
    for complaint_id, barangay, lat, lng, source in [
        ("SYN-RPT-001", "Daungan", 14.1858, 121.7315, "reporter_provided"),
        ("SYN-RPT-002", "Poblacion", 14.1885, 121.7295, "staff_provided"),
        ("SYN-RPT-003", "Alitap", None, None, "unknown"),
    ]:
        complaint = SanitaryComplaint.objects.create(
            complaint_id=complaint_id, category="Synthetic concern", barangay=barangay,
            reported_date=today, description="Synthetic preview description",
            complainant_name="Synthetic Reporter", latitude=lat, longitude=lng)
        # location_source is server-owned (editable=False); set it directly for the fixture.
        SanitaryComplaint.objects.filter(pk=complaint.pk).update(
            location_source=source, latitude=lat, longitude=lng)

    for household, color in zip(households[:2], [(34, 120, 84), (40, 90, 160)]):
        replace_household_photo(household.pk, _photo(color, household.household_code), "jpg", store)

    return {
        "username": PREVIEW_USERNAME,
        "establishments": SanitaryEstablishment.objects.count(),
        "households": HouseholdSanitationRecord.objects.count(),
        "reports": SanitaryComplaint.objects.count(),
        "household_photos": len(store.objects),
        "household_ids": [h.pk for h in households],
    }
