import os
import sys
import django
import random
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.utils import timezone
from api.models import HouseholdSanitationRecord, Barangay

print("Generating 500 Household Sanitation Records...")

barangays = list(Barangay.objects.filter(is_active=True))

if not barangays:
    print("No barangays found. Exiting.")
    sys.exit(0)

households_to_create = []

for i in range(500):
    brgy = random.choice(barangays)
    
    # 70% good standing, 20% for completion, 10% violation
    rand_status = random.random()
    if rand_status < 0.7:
        status = "good_standing"
    elif rand_status < 0.9:
        status = "for_completion"
    else:
        status = "violation"
        
    toilet = random.choice(["water_sealed", "pour_flush", "pit_latrine", "none"])
    water = random.choice(["level_1", "level_2", "level_3"])
    waste = random.choice(["collected", "composted", "burned", "dumped"])
    
    households_to_create.append(HouseholdSanitationRecord(
        household_code=f"HH-{2026}-{random.randint(100000, 999999)}",
        household_head=f"Resident {random.randint(1000, 9999)}",
        barangay=brgy.name,
        address=f"Purok {random.randint(1, 7)}, Brgy {brgy.name}",
        male_count=random.randint(1, 5),
        female_count=random.randint(1, 5),
        toilet_type=toilet,
        water_level=water,
        waste_disposal=waste,
        status=status,
        last_survey_date=timezone.localdate() - timedelta(days=random.randint(1, 300))
    ))

HouseholdSanitationRecord.objects.bulk_create(households_to_create)

print("Successfully added 500 household records!")
