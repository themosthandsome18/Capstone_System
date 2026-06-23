import os
import sys
import django
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import HouseholdSanitationRecord, SanitaryEstablishment

# Approximate centers for Mauban Barangays to make mock data realistic
BARANGAY_CENTERS = {
    # Cagbalete Island (East)
    "Cagbalete I": (14.230, 121.820),
    "Cagbalete II": (14.220, 121.830),
    
    # Northwest Inland
    "Abo-abo": (14.225, 121.670),
    "Remedios I": (14.230, 121.660),
    "Remedios II": (14.235, 121.650),
    "San Roque": (14.240, 121.690),
    
    # Northern Coastal
    "Cagsiay I": (14.260, 121.710),
    "Cagsiay II": (14.250, 121.715),
    "Cagsiay III": (14.240, 121.720),
    "San Lorenzo": (14.210, 121.720),
    
    # Town Proper / Poblacion (Center)
    "Bagong Bayan": (14.185, 121.731),
    "Daungan": (14.187, 121.735),
    "Lual": (14.190, 121.728),
    "Lual Rural": (14.195, 121.725),
    "Rizaliana": (14.184, 121.730),
    "Rosario": (14.183, 121.729),
    "Sadsaran": (14.186, 121.732),
    "San Vicente": (14.188, 121.733),
    "Santa Lucia": (14.182, 121.734),
    "Santo Angel": (14.181, 121.735),
    "Polo": (14.175, 121.730),
    
    # Western Inland
    "Bato": (14.200, 121.680),
    "Concepcion": (14.190, 121.690),
    "Macasin": (14.180, 121.680),
    "San Miguel": (14.170, 121.690),
    "Lucutan": (14.175, 121.670),
    "Baao": (14.160, 121.680),
    
    # Southern Coastal
    "San Isidro": (14.160, 121.725),
    "Tapucan": (14.150, 121.720),
    "Alitap": (14.140, 121.715),
    "San Jose": (14.130, 121.710),
    
    # Southern Inland
    "Liwayway": (14.140, 121.690),
    "Luya-luya": (14.130, 121.680),
    "Santol": (14.120, 121.670),
    "Balaybalay": (14.110, 121.660),
    "San Gabriel": (14.100, 121.650),
    "San Rafael": (14.090, 121.640),
    "Mabato": (14.080, 121.630),
    "Soledad": (14.070, 121.620),
}

# Default center if not found
DEFAULT_CENTER = (14.185, 121.731)

def get_realistic_coordinates(barangay_name):
    # Get center for barangay, or default
    base_lat, base_lng = BARANGAY_CENTERS.get(barangay_name, DEFAULT_CENTER)
    
    # Add a small random offset to scatter them around the barangay (approx 500m radius)
    offset_lat = random.uniform(-0.005, 0.005)
    offset_lng = random.uniform(-0.005, 0.005)
    
    return round(base_lat + offset_lat, 6), round(base_lng + offset_lng, 6)

print("Fixing coordinates for HouseholdSanitationRecord...")
households = list(HouseholdSanitationRecord.objects.all())
to_update = []
for hh in households:
    # Always assign new realistic coordinates based on their actual barangay
    lat, lng = get_realistic_coordinates(hh.barangay)
    hh.latitude = lat
    hh.longitude = lng
    to_update.append(hh)

HouseholdSanitationRecord.objects.bulk_update(to_update, ['latitude', 'longitude'])
print(f"Fixed {len(to_update)} households.")

print("Fixing coordinates for SanitaryEstablishment...")
establishments = list(SanitaryEstablishment.objects.all())
to_update = []
for est in establishments:
    lat, lng = get_realistic_coordinates(est.barangay)
    est.latitude = lat
    est.longitude = lng
    to_update.append(est)

SanitaryEstablishment.objects.bulk_update(to_update, ['latitude', 'longitude'])
print(f"Fixed {len(to_update)} establishments.")

print("All coordinates have been successfully re-mapped to their proper barangays!")
