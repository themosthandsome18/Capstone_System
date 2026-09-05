import os
import sys
import django
from decimal import Decimal

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from api.models import (
    SanitaryComplaint,
    SanitaryEstablishment,
    HouseholdSanitationRecord,
    ROLE_ESTABLISHMENT,
)
from api.views.mobile import mobile_sanitation_report_submit
from rest_framework.test import APIRequestFactory

User = get_user_model()

def test_community_report_submission():
    print("=== Testing Community Report Submission ===")
    factory = APIRequestFactory()
    
    # Test 1: Submit urgent report with string coordinates
    data = {
        "name": "Maria Test Reporter",
        "contact_number": "09171234567",
        "barangay": "Poblacion",
        "category": "Sewage Overflow / Drainage Contamination",
        "priority": "high",
        "description": "Urgent sewage overflow near market street.",
        "latitude": "14.1852",
        "longitude": "121.7314",
        "is_anonymous": False,
        "photo_urls": ["http://example.com/photo1.jpg", "http://example.com/photo2.jpg"]
    }
    
    request = factory.post("/api/mobile/sanitation/report-submit/", data, format="json")
    response = mobile_sanitation_report_submit(request)
    print(f"Status Code: {response.status_code}")
    print(f"Response Data: {response.data}")
    assert response.status_code == 201, f"Expected 201, got {response.status_code}"
    complaint_id = response.data.get("complaint_id")
    print(f"Created Complaint ID: {complaint_id}")
    
    # Verify in DB
    complaint = SanitaryComplaint.objects.get(complaint_id=complaint_id)
    assert complaint.priority == "high", "Priority should be high"
    print(f"DB Verification: Priority={complaint.priority}, Photos={complaint.photo_documentation}")
    print("Test 1 Passed!")

def test_establishment_demo_user():
    print("\n=== Testing Establishment Demo Account ===")
    user = User.objects.filter(username="establishment_owner").first()
    assert user is not None, "establishment_owner user should exist"
    role = getattr(getattr(user, "profile", None), "role", None)
    assert role == ROLE_ESTABLISHMENT, f"User role should be {ROLE_ESTABLISHMENT}, got {role}"
    
    establishment = SanitaryEstablishment.objects.filter(user=user).first()
    assert establishment is not None, "Establishment linked to establishment_owner should exist"
    print(f"User: {user.username} (Role: {role})")
    print(f"Linked Establishment: {establishment.business_name} (Permit: {establishment.permit_number})")
    print("Test 2 Passed!")

if __name__ == "__main__":
    try:
        test_community_report_submission()
        test_establishment_demo_user()
        print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY! [OK]")
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
