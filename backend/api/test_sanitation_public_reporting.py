from unittest.mock import patch

from django.core.cache import caches
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.dateparse import parse_datetime
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import ActivityLog, Barangay, SanitaryComplaint


@override_settings(USE_SEED_DATA=False)
class PublicReportingContractTests(TestCase):
    url = "/api/mobile/sanitation/reports/"

    def setUp(self):
        caches["throttle"].clear()
        Barangay.objects.create(name="Daungan")
        self.client = APIClient()
        self.payload = {
            "complainant_name": "Synthetic Resident",
            "contact_number": "09171234567",
            "category": "Severe Sewage Overflow",
            "barangay": "Daungan",
            "location_address": "Purok 3",
            "description": "Synthetic sanitation concern.",
            "client_submission_id": "synthetic-form-1",
        }

    def post(self, **changes):
        return self.client.post(self.url, {**self.payload, **changes}, format="json")

    def test_internal_management_fields_are_rejected(self):
        for field, value in {
            "assigned_inspector": "Injected inspector", "status": "resolved",
            "action_taken": "Injected internal action", "resolved_date": "2026-01-01",
            "inspection_scheduled_date": "2026-01-01",
            "inspection_scheduled_time": "09:00", "inspection_schedule_note": "Private",
            "inspection_notify_reporter": False, "establishment": None,
            "complaint_id": "ATTACKER-ID", "photo_documentation": "https://invalid.test/a.jpg",
        }.items():
            with self.subTest(field=field):
                response = self.post(**{field: value})
                self.assertEqual(response.status_code, 400, response.content)
                self.assertIn(field, response.json().get("errors", {}))
                self.assertFalse(SanitaryComplaint.objects.exists())

    def test_creation_returns_receipt_without_internal_or_personal_data(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.content)
        receipt = response.json()
        self.assertEqual(set(receipt), {"complaint_id", "status", "created_at", "priority"})
        self.assertEqual(receipt["status"], "pending")
        self.assertEqual(receipt["priority"], "high")
        self.assertIsNotNone(parse_datetime(receipt["created_at"]).utcoffset())
        self.assertEqual(receipt["complaint_id"], SanitaryComplaint.objects.get().complaint_id)
        self.assertIn("created_at", receipt)
        for field in ("id", "complainant_name", "contact_number", "description",
                      "assigned_inspector", "inspection_schedule_note", "action_taken",
                      "resolved_date", "photo_documentation", "establishment"):
            self.assertNotIn(field, receipt)

    def test_changed_payload_with_same_id_is_a_private_conflict(self):
        first = self.post()
        self.assertEqual(first.status_code, 201)
        for field, value in {
            "complainant_name": "Another Resident", "contact_number": "09179998888",
            "description": "Different problem", "location_address": "Another location",
            "category": "Improper Garbage Disposal",
        }.items():
            with self.subTest(field=field):
                response = self.post(**{field: value})
                self.assertEqual(response.status_code, 409, response.content)
                self.assertEqual(set(response.json()), {"code", "detail"})
                self.assertNotIn(first.json()["complaint_id"], str(response.json()))
        self.assertEqual(SanitaryComplaint.objects.count(), 1)

    def test_retry_after_staff_edits_uses_original_payload_and_receipt(self):
        first = self.post()
        record = SanitaryComplaint.objects.get()
        record.description = "Private staff edit"
        record.status = "resolved"
        record.action_taken = "Private staff note"
        record.priority = "low"
        record.save()
        events = ActivityLog.objects.count()
        again = self.post()
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json(), first.json())
        self.assertEqual(ActivityLog.objects.count(), events)
        self.assertEqual(self.post(action_taken="Injected").status_code, 400)

    def test_legacy_record_without_original_payload_proof_fails_closed(self):
        # Represent a pre-contract row directly; protected live digests must no
        # longer be deleted merely to construct this historical fixture.
        from datetime import date
        SanitaryComplaint.objects.create(
            **self.payload, complaint_id="SYNTHETIC-LEGACY", reported_date=date(2026, 1, 1),
        )
        again = self.post()
        self.assertEqual(again.status_code, 409)
        self.assertEqual(set(again.json()), {"code", "detail"})

    def test_fingerprint_failure_rolls_back_complaint(self):
        with patch("api.views.mobile.record_submission", side_effect=RuntimeError("synthetic failure")):
            response = self.post()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("synthetic failure", str(response.json()))
        self.assertFalse(SanitaryComplaint.objects.exists())
        self.assertFalse(ActivityLog.objects.exists())

    def test_unique_collision_checks_the_payload_before_replying(self):
        from .views.mobile import find_existing_community_report
        self.post()
        for changes, expected in (({}, 200), ({"description": "Conflicting request"}, 409)):
            with self.subTest(expected=expected):
                # Both throttle lookups and the early view lookup miss; the
                # unique insert fails and the post-rollback lookup finds it.
                calls = iter(range(10))
                def miss_before_insert(submission_id):
                    return None if next(calls) < 3 else find_existing_community_report(submission_id)
                with patch("api.views.mobile.find_existing_community_report", side_effect=miss_before_insert):
                    response = self.post(**changes)
                self.assertEqual(response.status_code, expected, response.content)
        self.assertEqual(SanitaryComplaint.objects.count(), 1)
        self.assertEqual(ActivityLog.objects.filter(record_type="SanitationPublicSubmission").count(), 1)

    def test_installed_flutter_photos_retry_by_bytes_not_generated_filename(self):
        with patch("api.views.mobile.save_image_file", return_value="/media/synthetic.jpg") as save:
            def upload(content, filename):
                return self.client.post(self.url, {
                    **self.payload, "priority": "low", "latitude": "14.19", "longitude": "121.73",
                    "photo": SimpleUploadedFile(filename, content, content_type="image/jpeg"),
                }, format="multipart")
            first = upload(b"synthetic-image", "original.jpg")
            retry = upload(b"synthetic-image", "regenerated-name.jpg")
            conflict = upload(b"different-image", "regenerated-name.jpg")
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(retry.status_code, 200, retry.content)
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(save.call_count, 1)

    def test_invalid_json_shapes_ids_and_coordinates_are_validation_errors(self):
        for data in ([], ["bad"], "bad", 42, True,
                     {**self.payload, "client_submission_id": "x" * 65},
                     {**self.payload, "latitude": "nan"}, {**self.payload, "contact_number": None}):
            with self.subTest(data=data):
                response = self.client.post(self.url, data, format="json")
                self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(SanitaryComplaint.objects.exists())

    def test_same_normalized_payload_returns_same_minimal_receipt(self):
        first = self.post()
        second = self.post(
            complainant_name="  Synthetic Resident  ", contact_number="+63 917 123 4567",
            category=" severe   sewage overflow ", barangay=" daungan ",
            location_address="  Purok   3  ", description=" Synthetic sanitation concern. ",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(SanitaryComplaint.objects.count(), 1)

    def test_unauthenticated_staff_record_access_is_denied(self):
        for path in ("/api/sanitation/complaints/", "/api/sanitation/complaints/1/",
                     "/api/mobile/sanitation/staff-bootstrap/"):
            with self.subTest(path=path):
                self.assertIn(self.client.get(path).status_code, (401, 403))

    def test_validation_and_server_priority_remain_authoritative(self):
        self.assertEqual(self.post(complainant_name="").status_code, 400)
        self.assertEqual(self.post(contact_number="bad").status_code, 400)
        self.assertEqual(self.post(location_address="").status_code, 400)
        self.assertEqual(self.post(category="invented").status_code, 400)
        response = self.post(priority="low")  # installed Flutter sends priority
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(SanitaryComplaint.objects.get().priority, "high")
