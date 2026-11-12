"""Household coordinate writes using synthetic records and isolated test databases."""
import json
from collections import Counter
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.contrib.auth.models import User
from django.test import LiveServerTestCase, TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from api.models import ActivityLog, HouseholdSanitationRecord, UserProfile
from api.serializers import HouseholdSanitationRecordSerializer


WEB = "/api/households/records/"
MOBILE = "/api/mobile/sanitation/household-surveys/"
PAYLOAD = {
    "household_head": "Synthetic coordinate household", "barangay": "Daungan",
    "toilet_type": "water_sealed", "water_level": "level_3",
    "waste_disposal": "collected", "remarks": "  Original notes  ",
}
INCOMPLETE = (
    {"latitude": 14.19}, {"longitude": 121.73},
    {"latitude": 14.19, "longitude": None},
    {"latitude": None, "longitude": 121.73},
    {"latitude": None}, {"longitude": None},
)
INVALID_VALUES = (
    True, False, float("nan"), float("inf"), -float("inf"),
    "NaN", "Infinity", "-Infinity", "bad", "", " ", [], {},
)


@override_settings(USE_SEED_DATA=False)
class HouseholdCoordinateValidationTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="synthetic_coordinate_validator")
        UserProfile.objects.update_or_create(user=user, defaults={"role": "sanitation"})
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        self.record = HouseholdSanitationRecord.objects.create(
            household_code="SYNTH-COORD", **PAYLOAD, latitude=14.19, longitude=121.73,
        )

    def test_invalid_values_rejected_by_serializer(self):
        for field in ("latitude", "longitude"):
            for value in (*INVALID_VALUES, -181, 181):
                with self.subTest(field=field, value=value):
                    serializer = HouseholdSanitationRecordSerializer(data={
                        **PAYLOAD, "household_code": "SYNTH-INVALID",
                        "latitude": 14.19, "longitude": 121.73, field: value,
                    })
                    self.assertFalse(serializer.is_valid(), "Invalid coordinate accepted")

    def test_incomplete_create_rejected_on_both_endpoints(self):
        for endpoint in (WEB, MOBILE):
            for coordinates in INCOMPLETE:
                with self.subTest(endpoint=endpoint, coordinates=coordinates):
                    before = list(HouseholdSanitationRecord.objects.values())
                    response = self.client.post(endpoint, {**PAYLOAD, **coordinates}, format="json")
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(list(HouseholdSanitationRecord.objects.values()), before)

    def test_valid_creates_preserve_exact_values_on_both_endpoints(self):
        for endpoint in (WEB, MOBILE):
            for latitude, longitude in ((0, 0), (0.0001, -0.0001), (-90, 180),
                                        (90, -180), (14.192345678, 121.734567891),
                                        ("14.19", "121.73")):
                with self.subTest(endpoint=endpoint, latitude=latitude, longitude=longitude):
                    response = self.client.post(endpoint, {
                        **PAYLOAD, "latitude": latitude, "longitude": longitude,
                    }, format="json")
                    self.assertEqual(response.status_code, 201, response.data)
                    record = HouseholdSanitationRecord.objects.get(pk=response.data["id"])
                    self.assertEqual((record.latitude, record.longitude), (float(latitude), float(longitude)))

    def test_omitted_and_explicit_null_creates_remain_unknown(self):
        for endpoint in (WEB, MOBILE):
            for coordinates in ({}, {"latitude": None, "longitude": None}):
                with self.subTest(endpoint=endpoint, coordinates=coordinates):
                    response = self.client.post(endpoint, {**PAYLOAD, **coordinates}, format="json")
                    self.assertEqual(response.status_code, 201, response.data)
                    self.assertEqual(response.data["coordinates"], {"lat": None, "lng": None})

    def test_differential_patch_uses_retained_coordinate(self):
        for coordinates in ({"latitude": 14.2}, {"longitude": 121.8}):
            with self.subTest(coordinates=coordinates):
                response = self.client.patch(f"{WEB}{self.record.pk}/", coordinates, format="json")
                self.assertEqual(response.status_code, 200, response.data)
        self.record.refresh_from_db()
        self.assertEqual((self.record.latitude, self.record.longitude), (14.2, 121.8))

    def test_partial_null_and_invalid_patches_leave_entire_record_unchanged(self):
        for coordinates in ({"latitude": None}, {"longitude": None},
                            {"latitude": 91}, {"longitude": -181},
                            {"latitude": True}, {"longitude": "bad"}):
            with self.subTest(coordinates=coordinates):
                before = HouseholdSanitationRecord.objects.values().get(pk=self.record.pk)
                response = self.client.patch(f"{WEB}{self.record.pk}/", {
                    **coordinates, "household_head": "Must not persist", "remarks": "Must not persist",
                }, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(HouseholdSanitationRecord.objects.values().get(pk=self.record.pk), before)

    def test_one_null_requires_explicit_pair_even_when_retained_value_is_null(self):
        HouseholdSanitationRecord.objects.filter(pk=self.record.pk).update(latitude=None, longitude=None)
        response = self.client.patch(f"{WEB}{self.record.pk}/", {"latitude": None}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_legacy_invalid_pairs_allow_unrelated_edits_and_repairs(self):
        for latitude, longitude in ((14.19, None), (None, 121.73), (91, 181)):
            for method in ("patch", "put"):
                with self.subTest(pair=(latitude, longitude), method=method):
                    HouseholdSanitationRecord.objects.filter(pk=self.record.pk).update(
                        latitude=latitude, longitude=longitude,
                    )
                    data = {**PAYLOAD, "household_code": self.record.household_code}
                    response = getattr(self.client, method)(f"{WEB}{self.record.pk}/", data, format="json")
                    self.assertEqual(response.status_code, 200, response.data)
                    self.record.refresh_from_db()
                    self.assertEqual((self.record.latitude, self.record.longitude), (latitude, longitude))
        HouseholdSanitationRecord.objects.filter(pk=self.record.pk).update(latitude=14.19, longitude=None)
        rejected = self.client.patch(f"{WEB}{self.record.pk}/", {"latitude": 14.2}, format="json")
        self.assertEqual(rejected.status_code, 400)
        repaired = self.client.patch(f"{WEB}{self.record.pk}/", {"longitude": 121.73}, format="json")
        self.assertEqual(repaired.status_code, 200, repaired.data)
        self.record.refresh_from_db()
        self.assertEqual((self.record.latitude, self.record.longitude), (14.19, 121.73))

    def test_mobile_upsert_rejects_invalid_coordinates_without_mutation_or_duplicates(self):
        for coordinates in ({"latitude": None}, {"latitude": 14.2, "longitude": None},
                            {"latitude": "", "longitude": 121.8},
                            {"latitude": True}, {"longitude": 181}):
            with self.subTest(coordinates=coordinates):
                before = list(HouseholdSanitationRecord.objects.values())
                response = self.client.post(MOBILE, {
                    **PAYLOAD, "household_code": self.record.household_code,
                    "remarks": "Must not persist", **coordinates,
                }, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(list(HouseholdSanitationRecord.objects.values()), before)

    def test_mobile_upsert_preserves_omitted_coordinates_and_allows_patch_and_clear(self):
        for coordinates, expected in (({}, (14.19, 121.73)), ({"latitude": 14.2}, (14.2, 121.73)),
                                      ({"latitude": None, "longitude": None}, (None, None))):
            with self.subTest(coordinates=coordinates):
                response = self.client.post(MOBILE, {
                    **PAYLOAD, "household_code": self.record.household_code, **coordinates,
                }, format="json")
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data["id"], self.record.pk)
                self.assertEqual(HouseholdSanitationRecord.objects.count(), 1)
                self.record.refresh_from_db()
                self.assertEqual((self.record.latitude, self.record.longitude), expected)

    def test_form_blank_coordinate_is_rejected_instead_of_becoming_an_omission(self):
        for endpoint in (WEB, MOBILE):
            response = self.client.post(endpoint, {
                **PAYLOAD, "latitude": "", "longitude": "121.73",
            }, format="multipart")
            self.assertEqual(response.status_code, 400)


@override_settings(USE_SEED_DATA=False)
class HouseholdCoordinateHTTPTests(LiveServerTestCase):
    host = "127.0.0.1"

    def setUp(self):
        self.tokens = {}
        self.responses = []
        for role in ("sanitation", "admin", "tourism", "tourist", "establishment"):
            user = User.objects.create_user(username=f"synthetic_coordinate_{role}")
            UserProfile.objects.update_or_create(user=user, defaults={"role": role})
            self.tokens[role] = Token.objects.create(user=user).key

    def tearDown(self):
        print("HOUSEHOLD_COORDINATE_HTTP", self._testMethodName,
              json.dumps(dict(Counter(self.responses)), sort_keys=True))

    def request(self, path, payload, method="POST", role="sanitation"):
        headers = {"Content-Type": "application/json"}
        if role:
            headers["Authorization"] = f"Token {self.tokens[role]}"
        request = Request(self.live_server_url + path, data=json.dumps(payload).encode(),
                          headers=headers, method=method)
        try:
            response = urlopen(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            self.responses.append(response.status)
            return response.status, json.loads(body) if "application/json" in response.headers.get("Content-Type", "") else None

    def test_http_create_patch_and_upsert_preserve_identity_and_values(self):
        for endpoint in (WEB, MOBILE):
            with self.subTest(endpoint=endpoint):
                code, body = self.request(endpoint, {**PAYLOAD, "latitude": "14.19", "longitude": "121.73"})
                self.assertEqual(code, 201)
                record = HouseholdSanitationRecord.objects.get(pk=body["id"])
                code, _ = self.request(f"{WEB}{record.pk}/", {"latitude": 0}, method="PATCH")
                self.assertEqual(code, 200)
                record.refresh_from_db()
                self.assertEqual((record.latitude, record.longitude), (0, 121.73))
                count = HouseholdSanitationRecord.objects.count()
                code, body = self.request(MOBILE, {**PAYLOAD, "household_code": record.household_code, "longitude": 0.0001})
                self.assertEqual(code, 201)
                self.assertEqual(body["id"], record.pk)
                self.assertEqual(HouseholdSanitationRecord.objects.count(), count)
                record.refresh_from_db()
                self.assertEqual((record.latitude, record.longitude), (0, 0.0001))
        print("HOUSEHOLD_COORDINATE_HTTP valid_create_patch_upsert PASS")

    def test_http_invalid_creates_and_updates_do_not_write(self):
        record = HouseholdSanitationRecord.objects.create(
            household_code="SYNTH-HTTP", **PAYLOAD, latitude=14.19, longitude=121.73,
        )
        invalid = (*INCOMPLETE, {"latitude": True, "longitude": 121.73},
                   {"latitude": 91, "longitude": 121.73},
                   {"latitude": "NaN", "longitude": 121.73},
                   {"latitude": 14.19, "longitude": "Infinity"})
        for endpoint in (WEB, MOBILE):
            for coordinates in invalid:
                with self.subTest(endpoint=endpoint, coordinates=coordinates):
                    before = list(HouseholdSanitationRecord.objects.values())
                    activity_count = ActivityLog.objects.count()
                    code, _ = self.request(endpoint, {**PAYLOAD, **coordinates})
                    self.assertEqual(code, 400)
                    self.assertEqual(list(HouseholdSanitationRecord.objects.values()), before)
                    self.assertEqual(ActivityLog.objects.count(), activity_count)
        for endpoint, method, identity in ((f"{WEB}{record.pk}/", "PATCH", {}),
                                            (MOBILE, "POST", {"household_code": record.household_code})):
            for coordinates in ({"latitude": None}, {"longitude": 181}, {"latitude": True},
                                {"latitude": 14.2, "longitude": None},
                                {"latitude": "NaN"}, {"longitude": "Infinity"},
                                {"latitude": "bad"}):
                with self.subTest(endpoint=endpoint, coordinates=coordinates):
                    before = list(HouseholdSanitationRecord.objects.values())
                    activity_count = ActivityLog.objects.count()
                    code, _ = self.request(endpoint, {**PAYLOAD, **identity, **coordinates}, method=method)
                    self.assertEqual(code, 400)
                    self.assertEqual(list(HouseholdSanitationRecord.objects.values()), before)
                    self.assertEqual(ActivityLog.objects.count(), activity_count)
        print("HOUSEHOLD_COORDINATE_HTTP invalid_writes_no_mutation PASS")

    def test_http_clear_and_repair_legacy_location(self):
        record = HouseholdSanitationRecord.objects.create(household_code="SYNTH-LEGACY", **PAYLOAD, latitude=14.19)
        code, _ = self.request(f"{WEB}{record.pk}/", {"remarks": "Legacy edit"}, method="PATCH")
        self.assertEqual(code, 200)
        code, _ = self.request(f"{WEB}{record.pk}/", {"longitude": 121.73}, method="PATCH")
        self.assertEqual(code, 200)
        code, _ = self.request(MOBILE, {**PAYLOAD, "household_code": record.household_code,
                                       "latitude": None, "longitude": None})
        self.assertEqual(code, 201)
        record.refresh_from_db()
        self.assertEqual((record.latitude, record.longitude), (None, None))
        self.assertEqual(HouseholdSanitationRecord.objects.count(), 1)
        print("HOUSEHOLD_COORDINATE_HTTP clear_legacy_repair PASS")

    def test_http_authentication_and_roles(self):
        for endpoint in (WEB, MOBILE):
            for role, expected in ((None, 401), ("tourism", 403), ("tourist", 403), ("establishment", 403)):
                with self.subTest(endpoint=endpoint, role=role):
                    before = HouseholdSanitationRecord.objects.count()
                    code, _ = self.request(endpoint, PAYLOAD, role=role)
                    self.assertEqual(code, expected)
                    self.assertEqual(HouseholdSanitationRecord.objects.count(), before)
            code, _ = self.request(endpoint, PAYLOAD, role="admin")
            self.assertEqual(code, 201)
        print("HOUSEHOLD_COORDINATE_HTTP authentication_roles PASS")
