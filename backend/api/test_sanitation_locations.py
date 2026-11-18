"""Real loopback HTTP contracts for synthetic household/establishment locations."""
import json
from collections import Counter
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import LiveServerTestCase, override_settings
from rest_framework.authtoken.models import Token

from api.models import (
    ActivityLog, Barangay, HouseholdSanitationRecord, SanitaryBusinessType,
    SanitaryEstablishment, Sitio, UserProfile,
)
from api.serializers import HouseholdSanitationRecordSerializer, SanitaryEstablishmentSerializer


CAPTURE = {"method": "device_reported", "accuracy_m": 4.25,
           "captured_at": "2026-11-12T10:00:00Z", "reported_mock": True}


@override_settings(USE_SEED_DATA=False)
class SanitationLocationHTTPTests(LiveServerTestCase):
    host = "127.0.0.1"

    def setUp(self):
        self.responses = []
        self.tokens = {}
        for role in ("sanitation", "admin", "tourism", "tourist", "establishment"):
            user = User.objects.create_user(username="synthetic_location_" + role)
            UserProfile.objects.update_or_create(user=user, defaults={"role": role})
            self.tokens[role] = Token.objects.create(user=user).key
        self.barangay = Barangay.objects.create(name="Synthetic Barangay A")
        self.other_barangay = Barangay.objects.create(name="Synthetic Barangay B")
        self.sitio = Sitio.objects.create(barangay=self.barangay, name="SYNTHETIC Sitio A")
        self.other_sitio = Sitio.objects.create(barangay=self.other_barangay, name="SYNTHETIC Sitio B")
        self.inactive = Sitio.objects.create(barangay=self.barangay, name="SYNTHETIC Inactive", is_active=False)
        business_type = SanitaryBusinessType.objects.create(name="Synthetic location type")
        self.cases = [
            ("/api/households/records/", HouseholdSanitationRecord,
             {"household_code": "SYNTH-LOC", "household_head": "Synthetic household",
              "toilet_type": "water_sealed", "water_level": "level_3", "waste_disposal": "collected"}),
            ("/api/sanitation/establishments/", SanitaryEstablishment,
             {"business_name": "Synthetic establishment", "owner_name": "Synthetic owner",
              "business_type": business_type.pk, "address": "Synthetic address"}),
        ]

    def tearDown(self):
        print("SANITATION_LOCATION_HTTP", self._testMethodName,
              json.dumps(dict(Counter(self.responses)), sort_keys=True))

    def request(self, path, data=None, *, method=None, role="sanitation"):
        headers = {"Content-Type": "application/json"}
        if role:
            headers["Authorization"] = "Token " + self.tokens[role]
        body = None if data is None else json.dumps(data).encode()
        request = Request(self.live_server_url + path, data=body, headers=headers,
                          method=method or ("GET" if data is None else "POST"))
        try:
            response = urlopen(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            self.responses.append(response.status)
            payload = response.read()
            self.assertIn("application/json", response.headers.get("Content-Type", ""), payload[:100])
            return response.status, json.loads(payload)

    def create(self, path, payload, **extra):
        code, data = self.request(path, {**payload, "barangay": self.barangay.name,
                                        "latitude": 14.192345678, "longitude": 121.734567891, **extra})
        self.assertEqual(code, 201, data)
        return data

    def snapshot(self):
        return (list(HouseholdSanitationRecord.objects.values()),
                list(SanitaryEstablishment.objects.values()), list(ActivityLog.objects.values()))

    def test_device_capture_create_read_mobile_gis_and_id_isolation(self):
        for path, model, payload in self.cases:
            with self.subTest(path=path):
                data = self.create(path, payload, location_capture=CAPTURE, sitio_reference=self.sitio.pk)
                record = model.objects.get(pk=data["id"])
                self.assertEqual((record.latitude, record.longitude), (14.192345678, 121.734567891))
                self.assertEqual(record.location_accuracy_m, 4.25)
                self.assertTrue(record.location_reported_mock)
                self.assertEqual(record.location_source, "device_reported")
                self.assertEqual(record.location_captured_at.isoformat(), "2026-11-12T10:00:00+00:00")
                self.assertEqual((record.sitio, record.sitio_reference_id, record.sitio_source),
                                 (self.sitio.name, self.sitio.pk, "configured"))
                code, reopened = self.request(f"{path}{record.pk}/")
                self.assertEqual(code, 200)
                self.assertEqual(reopened, data)
                code, bootstrap = self.request("/api/mobile/sanitation/staff-bootstrap/")
                self.assertEqual(code, 200)
                key = "householdRecords" if model is HouseholdSanitationRecord else "establishments"
                row = next(row for row in bootstrap[key] if row["id"] == record.pk)
                for field in ("latitude", "longitude", "location_source", "location_accuracy_m",
                              "location_captured_at", "location_reported_mock", "sitio", "sitio_reference", "sitio_source"):
                    self.assertEqual(row[field], data[field], field)
                before = self.snapshot()
                code, _ = self.request(f"{path}999999/", {"latitude": 14.2, "longitude": 121.8}, method="PATCH")
                self.assertEqual(code, 404)
                self.assertEqual(self.snapshot(), before)

    def test_metadata_lifecycle_partial_patch_manual_legacy_and_clear(self):
        for path, model, payload in self.cases:
            with self.subTest(path=path):
                data = self.create(path, payload, location_capture=CAPTURE)
                detail = f"{path}{data['id']}/"
                for change in ({"remarks": "Preserve metadata"},
                               {"latitude": data["latitude"], "longitude": data["longitude"]}):
                    code, saved = self.request(detail, change, method="PATCH")
                    self.assertEqual(code, 200)
                    self.assertEqual(saved["location_source"], "device_reported")
                    self.assertEqual(saved["location_accuracy_m"], 4.25)
                code, saved = self.request(detail, {"latitude": 0.0001}, method="PATCH")
                self.assertEqual(code, 200)
                self.assertEqual(saved["longitude"], data["longitude"])
                self.assertEqual(saved["location_source"], "unknown")
                for field in ("location_accuracy_m", "location_captured_at", "location_reported_mock"):
                    self.assertIsNone(saved[field])
                for capture, source in ((CAPTURE, "device_reported"), ({"method": "manual"}, "manual")):
                    code, saved = self.request(detail, {"latitude": 0, "longitude": 0,
                                                       "location_capture": capture}, method="PATCH")
                    self.assertEqual(code, 200)
                    self.assertEqual(saved["location_source"], source)
                self.assertIsNone(saved["location_accuracy_m"])
                code, saved = self.request(detail, {"latitude": None, "longitude": None}, method="PATCH")
                self.assertEqual(code, 200)
                self.assertEqual(saved["location_source"], "unknown")
                self.assertIsNone(saved["location_reported_mock"])
                model.objects.filter(pk=data["id"]).update(latitude=14.19)
                code, _ = self.request(detail, {"remarks": "Legacy edit"}, method="PATCH")
                self.assertEqual(code, 200)
                code, saved = self.request(detail, {"longitude": 121.73}, method="PATCH")
                self.assertEqual(code, 200)
                self.assertEqual((saved["latitude"], saved["longitude"]), (14.19, 121.73))

    def test_zero_accuracy_and_optional_mock_indicator_remain_untrusted_claims(self):
        for path, model, payload in self.cases:
            data = self.create(path, payload)
            for mock in (False, None, "omitted"):
                capture = {**CAPTURE, "accuracy_m": 0}
                capture.pop("reported_mock")
                if mock != "omitted":
                    capture["reported_mock"] = mock
                code, saved = self.request(f"{path}{data['id']}/", {
                    "latitude": 14.19, "longitude": 121.73, "location_capture": capture,
                }, method="PATCH")
                self.assertEqual(code, 200)
                self.assertEqual(saved["location_source"], "device_reported")
                self.assertEqual(saved["location_accuracy_m"], 0)
                self.assertEqual(saved["location_reported_mock"], None if mock == "omitted" else mock)
        code, public = self.request("/api/mobile/sanitation/bootstrap/", role=None)
        self.assertEqual(code, 200)
        self.assertEqual(public["householdRecords"], [])
        self.assertEqual(public["establishments"], [])

    def test_capture_validation_and_protected_sources_preserve_all_rows_and_logs(self):
        invalid_captures = [
            {}, {"method": "gps_verified"}, {"method": "device_reported"},
            {**CAPTURE, "accuracy_m": True}, {**CAPTURE, "accuracy_m": "NaN"},
            {**CAPTURE, "accuracy_m": "Infinity"}, {**CAPTURE, "accuracy_m": -1},
            {**CAPTURE, "accuracy_m": None}, {**CAPTURE, "captured_at": "bad"},
            {**CAPTURE, "captured_at": None}, {**CAPTURE, "reported_mock": 0},
            {**CAPTURE, "reported_mock": "false"}, {**CAPTURE, "verified": True},
            {"method": "manual", "accuracy_m": 1}, None, "bad",
        ]
        for path, model, payload in self.cases:
            data = self.create(path, payload, location_capture=CAPTURE)
            detail = f"{path}{data['id']}/"
            invalid = [{"latitude": 14.2, "longitude": 121.8, "location_capture": capture}
                       for capture in invalid_captures]
            invalid += [{"location_capture": CAPTURE}, {"latitude": None},
                        {"latitude": True}, {"latitude": 91}, {"longitude": "Infinity"}]
            invalid += [{field: value} for field, value in (
                ("location_source", "device_reported"), ("location_accuracy_m", 1),
                ("location_captured_at", CAPTURE["captured_at"]), ("location_reported_mock", False),
                ("sitio_source", "configured"))]
            for changes in invalid:
                with self.subTest(path=path, changes=changes):
                    before = self.snapshot()
                    code, errors = self.request(detail, {"remarks": "Must not persist", **changes}, method="PATCH")
                    self.assertEqual(code, 400, errors)
                    self.assertEqual(self.snapshot(), before)

    def test_configured_and_manual_sitio_legacy_and_membership(self):
        for path, model, payload in self.cases:
            data = self.create(path, payload, sitio_reference=self.sitio.pk)
            detail = f"{path}{data['id']}/"
            for changes in ({"sitio_reference": self.other_sitio.pk},
                            {"sitio_reference": self.inactive.pk},
                            {"sitio_reference": self.sitio.pk, "sitio": "Wrong text"},
                            {"barangay": self.other_barangay.name}, {"sitio_reference": 999999}):
                with self.subTest(path=path, changes=changes):
                    before = self.snapshot()
                    code, _ = self.request(detail, changes, method="PATCH")
                    self.assertEqual(code, 400)
                    self.assertEqual(self.snapshot(), before)
            code, saved = self.request(detail, {"barangay": self.other_barangay.name,
                                               "sitio_reference": None, "sitio": "Synthetic manual entry"}, method="PATCH")
            self.assertEqual(code, 200)
            self.assertEqual((saved["sitio"], saved["sitio_reference"], saved["sitio_source"]),
                             ("Synthetic manual entry", None, "manual"))
            model.objects.filter(pk=data["id"]).update(sitio="  Legacy free text  ", sitio_source="unknown")
            code, saved = self.request(detail, {"remarks": "Legacy preservation"}, method="PATCH")
            self.assertEqual(code, 200)
            self.assertEqual(saved["sitio"], "  Legacy free text  ")
            self.assertEqual(saved["sitio_source"], "unknown")
            code, saved = self.request(detail, {"sitio": ""}, method="PATCH")
            self.assertEqual(code, 200)
            self.assertIsNone(saved["sitio_reference"])
            self.assertEqual(saved["sitio_source"], "unknown")

    def test_sitio_choices_empty_state_inactive_and_role_boundaries(self):
        endpoint = f"/api/sanitation/sitios/?barangay_id={self.barangay.pk}"
        code, data = self.request(endpoint)
        self.assertEqual(code, 200)
        self.assertEqual([row["id"] for row in data["rows"]], [self.sitio.pk])
        Sitio.objects.filter(pk=self.sitio.pk).update(is_active=False)
        code, data = self.request(endpoint)
        self.assertEqual((code, data["rows"]), (200, []))
        for path, expected in (("/api/sanitation/sitios/", 400),
                               ("/api/sanitation/sitios/?barangay_id=bad", 400),
                               ("/api/sanitation/sitios/?barangay_id=999999", 404)):
            self.assertEqual(self.request(path)[0], expected)
        for role, expected in ((None, 401), ("tourism", 403), ("tourist", 403), ("establishment", 403), ("admin", 200)):
            self.assertEqual(self.request(endpoint, role=role)[0], expected)
            for path, model, payload in self.cases:
                if role == "admin":
                    continue
                before = self.snapshot()
                code, _ = self.request(path, {**payload, "barangay": self.barangay.name,
                                             "latitude": 14.19, "longitude": 121.73, "location_capture": CAPTURE}, role=role)
                self.assertEqual(code, expected)
                self.assertEqual(self.snapshot(), before)
        self.barangay.is_active = False
        self.barangay.save()
        self.assertEqual(self.request(endpoint)[0], 404)

    def test_mobile_survey_upsert_metadata_sitio_and_legacy_clients(self):
        endpoint = "/api/mobile/sanitation/household-surveys/"
        payload = {**self.cases[0][2], "barangay": self.barangay.name,
                   "latitude": 14.19, "longitude": 121.73,
                   "location_capture": CAPTURE, "sitio_reference": self.sitio.pk}
        code, data = self.request(endpoint, payload)
        self.assertEqual(code, 201, data)
        identity = data["id"]
        code, saved = self.request(endpoint, {**self.cases[0][2], "barangay": self.barangay.name,
                                             "remarks": "Older client omitted location"})
        self.assertEqual(code, 201)
        self.assertEqual(saved["location_source"], "device_reported")
        self.assertEqual(saved["sitio_reference"], self.sitio.pk)
        before = self.snapshot()
        code, _ = self.request(endpoint, {**payload, "sitio_reference": self.other_sitio.pk})
        self.assertEqual(code, 400)
        self.assertEqual(self.snapshot(), before)
        code, saved = self.request(endpoint, {**self.cases[0][2], "barangay": self.barangay.name,
                                             "latitude": None, "longitude": None})
        self.assertEqual(code, 201)
        self.assertEqual(saved["id"], identity)
        self.assertEqual(HouseholdSanitationRecord.objects.count(), 1)
        self.assertEqual(saved["location_source"], "unknown")
        self.assertIsNone(saved["location_accuracy_m"])

    def test_save_revalidates_locked_row_and_configured_reference(self):
        for path, model, payload in self.cases:
            data = self.create(path, payload, location_capture=CAPTURE)
            serializer_type = HouseholdSanitationRecordSerializer if model is HouseholdSanitationRecord else SanitaryEstablishmentSerializer
            serializer = serializer_type(model.objects.get(pk=data["id"]), data={"latitude": 14.2}, partial=True)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            model.objects.filter(pk=data["id"]).update(longitude=None)
            before = self.snapshot()
            from rest_framework.exceptions import ValidationError as ApiValidationError
            with self.assertRaises(ApiValidationError):
                serializer.save()
            self.assertEqual(self.snapshot(), before)
            serializer = serializer_type(model.objects.get(pk=data["id"]), data={"sitio_reference": self.sitio.pk}, partial=True)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            Sitio.objects.filter(pk=self.sitio.pk).update(is_active=False)
            before = self.snapshot()
            with self.assertRaises(ApiValidationError):
                serializer.save()
            self.assertEqual(self.snapshot(), before)
            Sitio.objects.filter(pk=self.sitio.pk).update(is_active=True)

    def test_reference_uniqueness_and_blank_names(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Sitio.objects.create(barangay=self.barangay, name="  synthetic sitio a  ")
        Sitio.objects.create(barangay=self.other_barangay, name=self.sitio.name)
        with self.assertRaises(ValidationError):
            Sitio.objects.create(barangay=self.barangay, name="   ")
