import os
import sys
import django
import random
from datetime import timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.utils import timezone
from api.models import (
    TouristRecord, FeedbackEntry, HouseholdSanitationRecord, Resort, Barangay, 
    Country, Region, Province, Itinerary, TravelMode, BoatType, VisitPurpose
)

print("Starting to add more mock data for Tourism and Households...")

barangays = list(Barangay.objects.filter(is_active=True))
resorts = list(Resort.objects.all())
countries = list(Country.objects.all())
regions = list(Region.objects.all())
provinces = list(Province.objects.all())
itineraries = list(Itinerary.objects.all())
travel_modes = list(TravelMode.objects.all())
boat_types = list(BoatType.objects.all())
visit_purposes = list(VisitPurpose.objects.all())

# Add 50 Household Sanitation Records
for i in range(50):
    brgy = random.choice(barangays) if barangays else None
    brgy_name = brgy.name if brgy else "Poblacion"
    HouseholdSanitationRecord.objects.create(
        household_code=f"HH-{2026}-{random.randint(10000, 99999)}",
        household_head=f"Resident {random.randint(100, 999)}",
        barangay=brgy_name,
        address=f"Block {random.randint(1, 10)} Lot {random.randint(1, 20)}",
        male_count=random.randint(1, 5),
        female_count=random.randint(1, 5),
        toilet_type=random.choice(["water_sealed", "pour_flush", "pit_latrine", "none"]),
        water_level=random.choice(["level_1", "level_2", "level_3"]),
        waste_disposal=random.choice(["collected", "composted", "burned", "dumped"]),
        status=random.choice(["good_standing", "for_completion", "violation"]),
        last_survey_date=timezone.localdate() - timedelta(days=random.randint(1, 300))
    )

# Add 50 Tourist Records
if resorts and countries and regions and provinces and itineraries and travel_modes and boat_types and visit_purposes:
    for i in range(50):
        arrival_date = timezone.localdate() - timedelta(days=random.randint(0, 100))
        foreigner = random.randint(0, 2)
        filipino = random.randint(1, 5)
        maubanin = random.randint(0, 2)
        total = foreigner + filipino + maubanin
        
        TouristRecord.objects.create(
            survey_id=f"SURV-{2026}-{random.randint(1000, 9999)}",
            full_name=f"Tourist {random.randint(100, 999)}",
            contact_number=f"09{random.randint(100000000, 999999999)}",
            country=random.choice(countries),
            region=random.choice(regions),
            province=random.choice(provinces),
            foreigner_count=foreigner,
            filipino_count=filipino,
            maubanin_count=maubanin,
            total_visitors=total,
            total_male=total // 2,
            total_female=total - (total // 2),
            age_0_7=0,
            age_8_59=total,
            age_60_above=0,
            arrival_date=arrival_date,
            itinerary=random.choice(itineraries),
            resort=random.choice(resorts),
            travel_mode=random.choice(travel_modes),
            boat_type=random.choice(boat_types),
            visit_purpose=random.choice(visit_purposes),
            status=random.choice(["pending", "arrived", "no_show"])
        )

# Add 50 Feedback Entries
if resorts:
    for i in range(50):
        FeedbackEntry.objects.create(
            destination=random.choice(resorts),
            reviewer=f"Reviewer {random.randint(100, 999)}",
            rating=random.randint(1, 5),
            status=random.choice(["positive", "neutral", "negative"]),
            date=timezone.localdate() - timedelta(days=random.randint(1, 100)),
            title=f"Feedback #{random.randint(1000, 9999)}",
            message="This is a mock feedback generated for the system.",
            reply="Thank you for your feedback!" if random.random() > 0.5 else ""
        )

print("Successfully added 50 households, 50 tourist records, and 50 feedback entries!")
