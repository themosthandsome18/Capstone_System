"""Complaint location origins: real HTTP, private receipts and stored values."""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.contrib.auth.models import User
from django.core.cache import caches
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token

from api.models import ActivityLog, Barangay, Notification, SanitaryComplaint, UserProfile


@override_settings(USE_SEED_DATA=False)
class ComplaintLocationHTTPTests(LiveServerTestCase):
    host = "127.0.0.1"
    public = "/api/mobile/sanitation/reports/"
    staff = "/api/sanitation/complaints/"

    def setUp(self):
        Barangay.objects.create(name="Daungan", is_active=True)
        self.tokens = {}
        for role in ("sanitation", "admin", "tourism", "tourist", "establishment", "unknown"):
            user = User.objects.create_user(username="synthetic_location_" + role)
            UserProfile.objects.update_or_create(user=user, defaults={"role": role})
            self.tokens[role] = Token.objects.create(user=user).key
        self.payload = dict(complainant_name="Synthetic Resident", contact_number="09171234567",
            category="Severe Sewage Overflow", barangay="Daungan", location_address="Synthetic street",
            description="Synthetic concern", client_submission_id="synthetic-location-form")

    def request(self, path, data=None, method="GET", role=None):
        # Throttling has independent regressions; never let rate limits hide
        # the coordinate validation assertion in this synthetic matrix.
        caches["throttle"].clear()
        headers = {"Content-Type": "application/json"}
        if role:
            headers["Authorization"] = "Token " + self.tokens[role]
        req = Request(self.live_server_url + path, data=json.dumps(data).encode() if data is not None else None,
                      headers=headers, method=method)
        try:
            response = urlopen(req, timeout=15)
        except HTTPError as error:
            response = error
        return response.status, json.load(response)

    def post(self, **changes):
        return self.request(self.public, {**self.payload, **changes}, "POST")

    @staticmethod
    def snapshot():
        return {m.__name__: list(m.objects.order_by("pk").values())
                for m in (SanitaryComplaint, ActivityLog, Notification)}

    def legacy(self):
        return SanitaryComplaint.objects.create(complaint_id="SYNTHETIC-LEGACY", category="Synthetic",
            barangay="Daungan", reported_date=timezone.localdate(), description="Synthetic",
            latitude=14.14, longitude=121.715)

    def read(self, record):
        code, data = self.request(self.staff + str(record.pk) + "/", role="sanitation")
        self.assertEqual(code, 200, data)
        return data

    def assert_location(self, record, source, eligible, pair=None):
        record.refresh_from_db()
        response = self.read(record)
        self.assertEqual(response.get("location_source"), source)
        self.assertIs(response.get("map_location_eligible"), eligible)
        self.assertEqual(record.location_source, source)
        if pair is not None:
            self.assertEqual((record.latitude, record.longitude), pair)

    def test_explicit_public_pair_is_reporter_provided_and_receipt_remains_private(self):
        code, receipt = self.post(latitude=14.14, longitude=121.715)
        self.assertEqual(code, 201, receipt)
        self.assertEqual(set(receipt), {"complaint_id", "status", "priority", "created_at"})
        self.assert_location(SanitaryComplaint.objects.get(), "reporter_provided", True, (14.14, 121.715))

    def test_optional_location_is_approximate_and_not_mappable(self):
        code, data = self.post(latitude="", longitude="")
        self.assertEqual(code, 201, data)
        record = SanitaryComplaint.objects.get()
        self.assertIsNotNone(record.latitude)
        self.assertIsNotNone(record.longitude)
        self.assert_location(record, "barangay_approximate", False)

    def test_omitted_location_and_unchanged_approximate_pair_stay_approximate(self):
        code, receipt = self.post()
        self.assertEqual(code, 201, receipt)
        record = SanitaryComplaint.objects.get()
        pair = (record.latitude, record.longitude)
        code, data = self.request(self.staff + str(record.pk) + "/", {
            "latitude": pair[0], "longitude": pair[1], "status": "investigating"}, "PATCH", "sanitation")
        self.assertEqual(code, 200, data)
        self.assert_location(record, "barangay_approximate", False, pair)

    def test_public_history_does_not_gain_staff_provenance_fields(self):
        code, receipt = self.post(latitude=14.14, longitude=121.715)
        self.assertEqual(code, 201, receipt)
        path = self.public + "history/?reference=" + receipt["complaint_id"] + "&contact=09171234567"
        code, data = self.request(path)
        self.assertEqual(code, 200, data)
        self.assertEqual(len(data["rows"]), 1)
        self.assertNotIn("location_source", data["rows"][0])
        self.assertNotIn("map_location_eligible", data["rows"][0])

    def test_new_direct_model_pair_is_unknown_not_assumed_reporter_or_device(self):
        self.assert_location(self.legacy(), "unknown", False, (14.14, 121.715))

    def test_legacy_unknown_pair_and_nulls_survive_status_updates(self):
        record = self.legacy()
        for pair in ((14.14, 121.715), (None, None)):
            SanitaryComplaint.objects.filter(pk=record.pk).update(latitude=pair[0], longitude=pair[1])
            code, data = self.request(self.staff + str(record.pk) + "/", {"status": "investigating"}, "PATCH", "sanitation")
            self.assertEqual(code, 200, data)
            self.assert_location(record, "unknown", False, pair)

    def test_staff_create_uses_staff_provided_origin(self):
        body = {**self.payload, "reported_date": timezone.localdate().isoformat(), "latitude": 14.14, "longitude": 121.715}
        body.pop("client_submission_id")
        code, data = self.request(self.staff, body, "POST", "admin")
        self.assertEqual(code, 201, data)
        self.assert_location(SanitaryComplaint.objects.get(), "staff_provided", True, (14.14, 121.715))

    def test_source_and_eligibility_cannot_be_spoofed(self):
        for key, value in (("location_source", "reporter_provided"), ("map_location_eligible", True)):
            before = self.snapshot()
            code, data = self.post(**{key: value})
            self.assertEqual(code, 400, data)
            self.assertEqual(self.snapshot(), before)
        record = self.legacy()
        for key, value in (("location_source", "staff_provided"), ("map_location_eligible", True)):
            before = self.snapshot()
            code, data = self.request(self.staff + str(record.pk) + "/", {key: value}, "PATCH", "sanitation")
            self.assertEqual(code, 400, data)
            self.assertEqual(self.snapshot(), before)

    def test_invalid_public_pairs_do_not_write_any_rows(self):
        for changes in ({"latitude": "garbage", "longitude": 121.715}, {"latitude": 14.14},
                        {"latitude": None, "longitude": 121.715}, {"latitude": float("nan"), "longitude": 121.715},
                        {"latitude": 14.14, "longitude": float("inf")}, {"latitude": 91, "longitude": 121.715},
                        {"latitude": 14.14, "longitude": 181}, {"latitude": True, "longitude": 121.715},
                        {"latitude": 0, "longitude": 121.715}):
            with self.subTest(changes=changes):
                before = self.snapshot()
                code, data = self.post(**changes)
                self.assertEqual(code, 400, data)
                self.assertEqual(self.snapshot(), before)

    def test_partial_and_invalid_staff_updates_preserve_all_values(self):
        record = self.legacy()
        for changes in ({"latitude": 14.15}, {"latitude": 14.15, "longitude": None},
                        {"latitude": float("inf"), "longitude": 121.7},
                        {"latitude": 95, "longitude": 121.7}, {"latitude": True, "longitude": 121.7}):
            before = self.snapshot()
            code, data = self.request(self.staff + str(record.pk) + "/", changes, "PATCH", "sanitation")
            self.assertEqual(code, 400, data)
            self.assertEqual(self.snapshot(), before)

    def test_status_update_and_identical_pair_do_not_promote_or_change_source(self):
        record = self.legacy()
        code, data = self.request(self.staff + str(record.pk) + "/", {
            "latitude": 14.14, "longitude": 121.715, "status": "investigating"}, "PATCH", "sanitation")
        self.assertEqual(code, 200, data)
        self.assert_location(record, "unknown", False, (14.14, 121.715))
        self.post(latitude=14.14, longitude=121.715)
        record = SanitaryComplaint.objects.exclude(pk=record.pk).get()
        code, data = self.request(self.staff + str(record.pk) + "/", {"status": "investigating",
            "latitude": 14.14, "longitude": 121.715}, "PATCH", "sanitation")
        self.assertEqual(code, 200, data)
        self.assert_location(record, "reporter_provided", True, (14.14, 121.715))

    def test_changed_pair_becomes_staff_provided_and_explicit_clear_uses_approximation(self):
        record = self.legacy()
        path = self.staff + str(record.pk) + "/"
        code, data = self.request(path, {"latitude": 14.15, "longitude": 121.72}, "PATCH", "sanitation")
        self.assertEqual(code, 200, data)
        self.assert_location(record, "staff_provided", True, (14.15, 121.72))
        code, data = self.request(path, {"latitude": None, "longitude": None}, "PATCH", "sanitation")
        self.assertEqual(code, 200, data)
        self.assert_location(record, "barangay_approximate", False)

    def test_identical_retry_preserves_receipt_pair_and_audits_after_staff_changes(self):
        code, receipt = self.post(latitude=14.14, longitude=121.715)
        self.assertEqual(code, 201, receipt)
        record = SanitaryComplaint.objects.get()
        code, data = self.request(self.staff + str(record.pk) + "/", {
            "latitude": 14.15, "longitude": 121.72, "status": "investigating"}, "PATCH", "sanitation")
        self.assertEqual(code, 200, data)
        before = self.snapshot()
        code, again = self.post(latitude=14.14, longitude=121.715)
        self.assertEqual(code, 200, again)
        self.assertEqual(again, receipt)
        self.assertEqual(self.snapshot(), before)
        self.assert_location(record, "staff_provided", True, (14.15, 121.72))

    def test_staff_map_payload_has_location_fields_without_reporter_contacts(self):
        self.post(latitude=14.14, longitude=121.715)
        code, data = self.request("/api/mobile/sanitation/staff-bootstrap/", role="sanitation")
        self.assertEqual(code, 200, data)
        row = data["complaintData"]["rows"][0]
        self.assertEqual(row.get("location_source"), "reporter_provided")
        self.assertIs(row.get("map_location_eligible"), True)
        self.assertNotIn("contact_number", row)
        self.assertNotIn("complainant_name", row)

    def test_permissions_and_private_receipt_unchanged(self):
        self.post(latitude=14.14, longitude=121.715)
        for role in (None, "tourism", "tourist", "establishment", "unknown"):
            before = self.snapshot()
            code, data = self.request("/api/mobile/sanitation/staff-bootstrap/", role=role)
            self.assertEqual(code, 401 if role is None else 403, data)
            self.assertNotIn("complaintData", data)
            self.assertEqual(self.snapshot(), before)
        code, data = self.request(self.staff, role="admin")
        self.assertEqual(code, 200, data)

    def test_known_source_alone_cannot_make_invalid_pair_mappable(self):
        record = self.legacy()
        for pair in ((None, None), (14.14, None), (float("nan"), 121.715), (91, 121.715), (0, 0)):
            SanitaryComplaint.objects.filter(pk=record.pk).update(
                latitude=pair[0], longitude=pair[1], location_source="reporter_provided")
            self.assertIs(self.read(record).get("map_location_eligible"), False)
