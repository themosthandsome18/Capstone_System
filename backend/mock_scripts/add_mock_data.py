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
    SanitaryEstablishment, SanitaryBusinessType, SanitaryPermitRenewal, SanitaryComplaint, Barangay
)

print("Starting to add mock data...")

business_types = list(SanitaryBusinessType.objects.all())
barangays = list(Barangay.objects.filter(is_active=True))

if not business_types:
    print("No business types found. Cannot create mock establishments.")
else:
    for i in range(50):
        btype = random.choice(business_types)
        brgy = random.choice(barangays) if barangays else None
        brgy_name = brgy.name if brgy else "Poblacion"
        
        business_name = f"Test Establishment {random.randint(1000, 9999)}"
        owner_name = f"Owner {random.randint(100, 999)}"
        permit_number = f"SP-2026-{random.randint(1000, 9999)}"
        
        est = SanitaryEstablishment.objects.create(
            business_name=business_name,
            owner_name=owner_name,
            business_type=btype,
            permit_size=random.choice(["sp", "large"]),
            barangay=brgy_name,
            address=f"Street {random.randint(1, 100)}, Brgy {brgy_name}",
            has_permit=random.choice([True, False]),
            permit_issued_date=timezone.localdate() - timedelta(days=random.randint(10, 300)),
            permit_expiry_date=timezone.localdate() + timedelta(days=random.randint(-50, 300)),
            compliance_status=random.choice(["good_standing", "upcoming", "for_completion", "non_compliant"]),
            permit_status=random.choice(["active", "renewal_due", "expired", "revoked"])
        )
        
        # Add renewal records
        SanitaryPermitRenewal.objects.create(
            renewal_id=f"RNW-2026-{random.randint(1000, 9999)}",
            establishment=est,
            permit_number=permit_number,
            permit_type="Sanitary Permit",
            expiration_date=est.permit_expiry_date,
            stage=random.choice(["notice_sent", "application_filed", "approved", "released"]),
            progress=random.randint(10, 100),
            renewal_fee=random.choice([500, 1500, 2000]),
            payment_status=random.choice(["unpaid", "partial", "paid"])
        )

        # Add complaints randomly
        if random.random() > 0.4:
            SanitaryComplaint.objects.create(
                complaint_id=f"CMP-2026-{random.randint(1000, 9999)}",
                establishment=est,
                complainant_name=f"Citizen {random.randint(1, 100)}",
                contact_number=f"0912345{random.randint(1000, 9999)}",
                category=random.choice(["Food handling concern", "Improper waste disposal", "Expired sanitary permit", "Pest control concern", "Unclean preparation area"]),
                barangay=brgy_name,
                reported_date=timezone.localdate() - timedelta(days=random.randint(1, 30)),
                status=random.choice(["pending", "investigating", "resolved", "rejected"]),
                priority=random.choice(["low", "medium", "high"])
            )

    print("Successfully added 50 mock establishments with permits and complaints!")
