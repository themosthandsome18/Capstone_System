import os
import sys
import django
import random
from datetime import date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import TouristRecord

records = list(TouristRecord.objects.all())
print(f"Found {len(records)} tourist records. Updating them...")

start_date = date(2025, 1, 1)
end_date = date(2026, 6, 30)
date_range = (end_date - start_date).days

for record in records:
    # Randomize status: 85% arrived, 10% pending, 5% no_show
    rand = random.random()
    if rand < 0.85:
        record.status = "arrived"
    elif rand < 0.95:
        record.status = "pending"
    else:
        record.status = "no_show"
        
    # Randomize date across 2025 and early 2026
    random_days = random.randint(0, date_range)
    new_date = start_date + timedelta(days=random_days)
    
    # Peak season bias: 30% chance to force it into summer (March, April, May)
    if random.random() < 0.3:
        year = random.choice([2025, 2026])
        month = random.choice([3, 4, 5])
        day = random.randint(1, 28)
        new_date = date(year, month, day)
        
    record.arrival_date = new_date

# Bulk update
TouristRecord.objects.bulk_update(records, ['status', 'arrival_date'])

print("Successfully updated tourist records with better distribution!")
