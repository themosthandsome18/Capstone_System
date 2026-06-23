import os
import sys
import django
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import HouseholdSanitationRecord, SanitaryEstablishment, Resort

def get_random_lat():
    return round(random.uniform(14.150, 14.220), 6)

def get_random_lng():
    return round(random.uniform(121.680, 121.780), 6)

print("Populating coordinates for HouseholdSanitationRecord...")
households = list(HouseholdSanitationRecord.objects.all())
to_update = []
for hh in households:
    if hh.latitude is None or hh.longitude is None:
        hh.latitude = get_random_lat()
        hh.longitude = get_random_lng()
        to_update.append(hh)
HouseholdSanitationRecord.objects.bulk_update(to_update, ['latitude', 'longitude'])
print(f"Updated {len(to_update)} households.")

print("Populating coordinates for SanitaryEstablishment...")
establishments = list(SanitaryEstablishment.objects.all())
to_update = []
for est in establishments:
    if est.latitude is None or est.longitude is None:
        est.latitude = get_random_lat()
        est.longitude = get_random_lng()
        to_update.append(est)
SanitaryEstablishment.objects.bulk_update(to_update, ['latitude', 'longitude'])
print(f"Updated {len(to_update)} establishments.")

print("Populating coordinates for Resort...")
resorts = list(Resort.objects.all())
to_update = []
for res in resorts:
    if res.latitude is None or res.longitude is None:
        res.latitude = get_random_lat()
        res.longitude = get_random_lng()
        to_update.append(res)
Resort.objects.bulk_update(to_update, ['latitude', 'longitude'])
print(f"Updated {len(to_update)} resorts.")

print("All done!")
