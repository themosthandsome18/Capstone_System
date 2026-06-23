import os
import sys
import django
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import HouseholdSanitationRecord, SanitaryEstablishment

# Corrected Cagbalete centers (moved further North to hit the actual island)
CAGBALETE_CENTERS = {
    "Cagbalete I": (14.270, 121.830),
    "Cagbalete II": (14.280, 121.835),
}

def get_realistic_coordinates(barangay_name):
    base_lat, base_lng = CAGBALETE_CENTERS[barangay_name]
    offset_lat = random.uniform(-0.003, 0.003)
    offset_lng = random.uniform(-0.003, 0.003)
    return round(base_lat + offset_lat, 6), round(base_lng + offset_lng, 6)

print("Fixing coordinates for Cagbalete...")
households = list(HouseholdSanitationRecord.objects.filter(barangay__in=["Cagbalete I", "Cagbalete II"]))
to_update_hh = []
for hh in households:
    lat, lng = get_realistic_coordinates(hh.barangay)
    hh.latitude = lat
    hh.longitude = lng
    to_update_hh.append(hh)

HouseholdSanitationRecord.objects.bulk_update(to_update_hh, ['latitude', 'longitude'])
print(f"Fixed {len(to_update_hh)} Cagbalete households.")

establishments = list(SanitaryEstablishment.objects.filter(barangay__in=["Cagbalete I", "Cagbalete II"]))
to_update_est = []
for est in establishments:
    lat, lng = get_realistic_coordinates(est.barangay)
    est.latitude = lat
    est.longitude = lng
    to_update_est.append(est)

SanitaryEstablishment.objects.bulk_update(to_update_est, ['latitude', 'longitude'])
print(f"Fixed {len(to_update_est)} Cagbalete establishments.")

print("Cagbalete successfully moved!")
