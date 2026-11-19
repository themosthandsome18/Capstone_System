"""Old-backend compatibility of the 0071 location/Sitio columns.

Render runs `migrate` while the previous backend is still serving. That backend
does not know the five NOT NULL columns added by 0071 and leaves them out of its
INSERTs, so the columns need physical database defaults (migration 0076).
Synthetic data only.
"""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.contrib.auth.models import User
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader
from django.db.models import NOT_PROVIDED
from django.test import LiveServerTestCase, SimpleTestCase, TestCase, TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token

from api.models import Barangay, HouseholdSanitationRecord, SanitaryBusinessType, SanitaryEstablishment, Sitio, UserProfile


MIGRATION = ("api", "0076_location_sitio_db_defaults")
BEFORE = ("api", "0075_merge_production_and_photos")
# Last migration of the production lineage, without the Photos/location branch:
# its project state is the schema the previously deployed backend writes with.
PRODUCTION_LINEAGE = ("api", "0074_resort_is_fallback")

EXPECTED_DEFAULTS = {
    (HouseholdSanitationRecord, "location_source"): "unknown",
    (HouseholdSanitationRecord, "sitio_source"): "unknown",
    (SanitaryEstablishment, "location_source"): "unknown",
    (SanitaryEstablishment, "sitio_source"): "unknown",
    (SanitaryEstablishment, "sitio"): "",
}


class LocationDbDefaultContractTests(SimpleTestCase):
    def test_each_old_backend_omitted_not_null_column_has_the_approved_db_default(self):
        for (model, name), expected in EXPECTED_DEFAULTS.items():
            with self.subTest(model=model.__name__, field=name):
                field = model._meta.get_field(name)
                self.assertFalse(field.null)
                self.assertIsNot(field.db_default, NOT_PROVIDED, "missing database default")
                self.assertEqual(field.db_default, expected)
                self.assertEqual(type(field.db_default), str)
                self.assertEqual(field.default, expected)

    def test_old_backend_omits_exactly_these_not_null_columns(self):
        old_apps = MigrationLoader(None, ignore_no_migrations=True).project_state(PRODUCTION_LINEAGE).apps
        for model in (HouseholdSanitationRecord, SanitaryEstablishment):
            with self.subTest(model=model.__name__):
                old_columns = {f.column for f in old_apps.get_model("api", model.__name__)._meta.concrete_fields}
                omitted_required = {
                    f.name for f in model._meta.concrete_fields
                    if f.column not in old_columns and not f.null
                }
                expected = {name for (owner, name) in EXPECTED_DEFAULTS if owner is model}
                self.assertEqual(omitted_required, expected)

    def test_migration_0076_contains_only_the_five_default_changes(self):
        loader = MigrationLoader(None, ignore_no_migrations=True)
        # One api leaf, and 0076 is on its path (later migrations build on it).
        leaves = loader.graph.leaf_nodes("api")
        self.assertEqual(len(leaves), 1, leaves)
        self.assertIn(MIGRATION, loader.graph.forwards_plan(leaves[0]))
        migration = loader.disk_migrations[MIGRATION]
        self.assertEqual(migration.dependencies, [BEFORE])
        found = {}
        for operation in migration.operations:
            self.assertEqual(type(operation).__name__, "AlterField")
            found[(operation.model_name, operation.name)] = operation.field.db_default
        self.assertEqual(found, {
            (model._meta.model_name, name): value for (model, name), value in EXPECTED_DEFAULTS.items()
        })


class OldBackendInsertTests(TestCase):
    """An INSERT with the previous backend's column list, issued as raw SQL."""

    def old_style_copy(self, model, template, **literals):
        old_apps = MigrationLoader(None, ignore_no_migrations=True).project_state(PRODUCTION_LINEAGE).apps
        old_model = old_apps.get_model("api", model.__name__)
        columns = [f.column for f in old_model._meta.concrete_fields if not f.primary_key]
        quote = connection.ops.quote_name
        selected = ", ".join("%s" if column in literals else quote(column) for column in columns)
        table = quote(model._meta.db_table)
        params = [literals[column] for column in columns if column in literals] + [template.pk]
        with connection.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO {table} ({', '.join(quote(c) for c in columns)}) "
                f"SELECT {selected} FROM {table} WHERE {quote('id')} = %s",
                params,
            )
        return model.objects.exclude(pk=template.pk).get(**{key: value for key, value in literals.items()})

    def test_household_insert_without_new_columns_gets_unknown_provenance(self):
        template = HouseholdSanitationRecord.objects.create(
            household_code="SYNTH-DEF-H1", household_head="Synthetic", barangay="Synthetic",
            sitio="Synthetic Sitio", location_source="manual", sitio_source="manual",
        )
        row = self.old_style_copy(HouseholdSanitationRecord, template, household_code="SYNTH-DEF-H2")
        self.assertEqual((row.location_source, row.sitio_source), ("unknown", "unknown"))
        self.assertEqual(row.sitio, "Synthetic Sitio")
        template.refresh_from_db()
        self.assertEqual((template.location_source, template.sitio_source), ("manual", "manual"))

    def test_establishment_insert_without_new_columns_gets_unknown_provenance_and_blank_sitio(self):
        business_type = SanitaryBusinessType.objects.create(name="Synthetic default type")
        template = SanitaryEstablishment.objects.create(
            business_name="SYNTH-DEF-E1", owner_name="Synthetic", business_type=business_type,
            barangay="Synthetic", address="Synthetic", sitio="Synthetic Sitio",
            location_source="manual", sitio_source="manual",
        )
        row = self.old_style_copy(SanitaryEstablishment, template, business_name="SYNTH-DEF-E2")
        self.assertEqual((row.location_source, row.sitio_source, row.sitio), ("unknown", "unknown", ""))
        template.refresh_from_db()
        self.assertEqual((template.location_source, template.sitio_source, template.sitio),
                         ("manual", "manual", "Synthetic Sitio"))


@override_settings(USE_SEED_DATA=False)
class ExplicitProvenanceHTTPTests(LiveServerTestCase):
    host = "127.0.0.1"

    def setUp(self):
        user = User.objects.create_user(username="synthetic_default_inspector")
        UserProfile.objects.update_or_create(user=user, defaults={"role": "sanitation"})
        self.token = Token.objects.create(user=user).key
        self.barangay = Barangay.objects.create(name="Synthetic Default Barangay")
        self.sitio = Sitio.objects.create(barangay=self.barangay, name="SYNTHETIC Default Sitio")
        self.business_type = SanitaryBusinessType.objects.create(name="Synthetic default HTTP type")

    def post(self, path, data):
        request = Request(self.live_server_url + path, data=json.dumps(data).encode(), method="POST",
                          headers={"Content-Type": "application/json", "Authorization": "Token " + self.token})
        try:
            response = urlopen(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_supplied_provenance_is_not_replaced_by_database_defaults(self):
        household = {"household_head": "Synthetic", "toilet_type": "water_sealed",
                     "water_level": "level_3", "waste_disposal": "collected"}
        establishment = {"business_name": "Synthetic", "owner_name": "Synthetic",
                         "business_type": self.business_type.pk, "address": "Synthetic"}
        device = {"method": "device_reported", "accuracy_m": 3.5,
                  "captured_at": "2026-11-17T10:00:00Z", "reported_mock": False}
        cases = [
            ({"sitio": "Typed Sitio", "location_capture": {"method": "manual"}}, "manual", "manual", "Typed Sitio"),
            ({"sitio_reference": None, "location_capture": device}, "device_reported", "unknown", ""),
        ]
        for path, model, base in (("/api/households/records/", HouseholdSanitationRecord, household),
                                  ("/api/sanitation/establishments/", SanitaryEstablishment, establishment)):
            for index, (extra, location_source, sitio_source, sitio) in enumerate(
                    cases + [({"sitio_reference": self.sitio.pk, "location_capture": {"method": "manual"}},
                              "manual", "configured", self.sitio.name)]):
                with self.subTest(path=path, case=index):
                    payload = {**base, **extra, "barangay": self.barangay.name,
                               "latitude": 14.19, "longitude": 121.73}
                    if model is HouseholdSanitationRecord:
                        payload["household_code"] = f"SYNTH-DEF-HTTP-{index}"
                    code, data = self.post(path, payload)
                    self.assertEqual(code, 201, data)
                    record = model.objects.get(pk=data["id"])
                    self.assertEqual((record.location_source, record.sitio_source, record.sitio),
                                     (location_source, sitio_source, sitio))
                    self.assertEqual((data["location_source"], data["sitio_source"]), (location_source, sitio_source))


class Migration0076PreservesExistingRowsTests(TransactionTestCase):
    def test_setting_defaults_changes_no_existing_row(self):
        executor = MigrationExecutor(connection)
        executor.migrate([BEFORE])
        try:
            apps = executor.loader.project_state([BEFORE]).apps
            Household = apps.get_model("api", "HouseholdSanitationRecord")
            Establishment = apps.get_model("api", "SanitaryEstablishment")
            business_type = apps.get_model("api", "SanitaryBusinessType").objects.create(name="Synthetic 0076 type")
            Household.objects.create(household_code="SYNTH-0076-A", household_head="A", barangay="B",
                                     sitio="Kept", location_source="manual", sitio_source="manual")
            Household.objects.create(household_code="SYNTH-0076-B", household_head="B", barangay="B")
            Establishment.objects.create(business_name="SYNTH-0076", owner_name="O", business_type=business_type,
                                         barangay="B", address="A", sitio="Kept", location_source="device_reported",
                                         location_accuracy_m=2.0, sitio_source="manual")
            before = (list(Household.objects.order_by("pk").values()),
                      list(Establishment.objects.order_by("pk").values()))

            executor = MigrationExecutor(connection)
            executor.migrate([MIGRATION])
            apps = executor.loader.project_state([MIGRATION]).apps
            after = (list(apps.get_model("api", "HouseholdSanitationRecord").objects.order_by("pk").values()),
                     list(apps.get_model("api", "SanitaryEstablishment").objects.order_by("pk").values()))
            self.assertEqual(after, before)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
