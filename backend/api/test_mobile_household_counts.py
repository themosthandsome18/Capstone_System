"""Mobile household counts: real authenticated HTTP and persisted-value checks."""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from django.contrib.auth.models import User
from django.test import LiveServerTestCase, override_settings
from rest_framework.authtoken.models import Token
from api.models import UserProfile, HouseholdSanitationRecord, ActivityLog

@override_settings(USE_SEED_DATA=False)
class MobileHouseholdCountHTTPTests(LiveServerTestCase):
    host = '127.0.0.1'
    def setUp(self):
        self.tokens = {}
        for role in ('sanitation', 'tourism', 'tourist', 'establishment', 'admin'):
            user = User.objects.create_user(username='synthetic_count_' + role)
            UserProfile.objects.update_or_create(user=user, defaults={'role': role})
            self.tokens[role] = Token.objects.create(user=user).key
        self.payload = dict(household_code='SYN-COUNT', household_head='Synthetic Count',
            barangay='Alitap', address='Synthetic address', male_count=2, female_count=1,
            toilet_type='water_sealed', septic_tank_type='vault_sealed', water_level='level_3',
            water_source='Other', waste_disposal='collected', latitude='14.14', longitude='121.715', remarks='  exact  ')

    def request(self, data=None, role='sanitation', path='/api/mobile/sanitation/household-surveys/'):
        headers = {'Content-Type': 'application/json'}
        if role: headers['Authorization'] = 'Token ' + self.tokens.get(role, 'invalid-synthetic-token')
        req = Request(self.live_server_url + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try: response = urlopen(req, timeout=15)
        except HTTPError as error: response = error
        return response.status, json.load(response)

    def invalid(self, values):
        for field in ('male_count', 'female_count'):
            for value in values:
                with self.subTest(field=field, value=value):
                    before = list(HouseholdSanitationRecord.objects.values())
                    audits = ActivityLog.objects.count()
                    code, body = self.request({**self.payload, field: value})
                    print('COUNT_HTTP', json.dumps({'field':field,'submitted':value,'status':code,'response':body.get(field) if isinstance(body,dict) else body}))
                    self.assertEqual(code, 400)
                    self.assertIn(field, body)
                    self.assertEqual(list(HouseholdSanitationRecord.objects.values()), before)
                    self.assertEqual(ActivityLog.objects.count(), audits)

    def test_fractional_counts(self): self.invalid([1.5, -0.5, '1.5'])
    def test_malformed_counts(self): self.invalid(['not-a-count', '1e2', '', None, [], {}])
    def test_boolean_counts(self): self.invalid([True, False])
    def test_negative_counts(self): self.invalid([-1, '-1'])
    def test_out_of_range_counts(self): self.invalid([2147483648, '2147483648'])

    def test_valid_zero_and_portable_database_maximum(self):
        for value in (0, 2147483647):
            code, body = self.request({**self.payload, 'male_count':value, 'female_count':value})
            self.assertEqual(code, 201)
            record = HouseholdSanitationRecord.objects.get(household_code='SYN-COUNT')
            self.assertEqual((record.male_count,record.female_count), (value,value))
            self.assertEqual((body['male_count'],body['female_count']), (value,value))

    def test_omitted_creation_counts_keep_zero_defaults(self):
        data = {k:v for k,v in self.payload.items() if k not in ('male_count','female_count')}
        code, body = self.request(data)
        self.assertEqual(code,201)
        self.assertEqual((body['male_count'],body['female_count']),(0,0))

    def test_omitted_upsert_counts_keep_existing_mobile_zero_default_semantics(self):
        self.assertEqual(self.request(self.payload)[0],201)
        data = {k:v for k,v in self.payload.items() if k not in ('male_count','female_count')}
        code, body = self.request(data)
        self.assertEqual(code,201)
        record = HouseholdSanitationRecord.objects.get(household_code='SYN-COUNT')
        self.assertEqual((record.male_count,record.female_count),(0,0))
        self.assertEqual((body['male_count'],body['female_count']),(0,0))

    def test_invalid_upserts_preserve_entire_existing_record_and_audit(self):
        self.assertEqual(self.request(self.payload)[0],201)
        self.payload.update(household_head='Must not replace', remarks='Must not replace', address='Must not replace')
        self.invalid([1.5, 'bad', True, -1, 2147483648])

    def test_valid_flutter_create_upsert_and_react_readback(self):
        code, body = self.request(self.payload)
        self.assertEqual(code,201)
        self.assertEqual((body['male_count'],body['female_count']),(2,1))
        code, body = self.request({**self.payload,'male_count':3,'female_count':4})
        self.assertEqual(code,201)
        self.assertEqual(HouseholdSanitationRecord.objects.count(),1)
        record = HouseholdSanitationRecord.objects.get(household_code='SYN-COUNT')
        self.assertEqual((record.male_count,record.female_count,record.remarks),(3,4,'  exact  '))
        code, data = self.request(path='/api/households/records/')
        self.assertEqual(code,200)
        rows = data if isinstance(data,list) else data.get('results',data.get('rows',[]))
        row = next(row for row in rows if row['id']==record.pk)
        self.assertEqual((row['male_count'],row['female_count'],row['total_members']),(3,4,7))
        print('COUNT_READBACK',json.dumps(row))

    def test_form_integer_strings_remain_compatible(self):
        code, body = self.request({**self.payload,'male_count':'12','female_count':'0'})
        self.assertEqual(code,201)
        self.assertEqual((body['male_count'],body['female_count']),(12,0))

    def test_authentication_roles_and_admin(self):
        for role, expected in ((None,401),('invalid',401),('tourism',403),('tourist',403),('establishment',403)):
            with self.subTest(role=role):
                self.assertEqual(self.request(self.payload,role=role)[0],expected)
                self.assertFalse(HouseholdSanitationRecord.objects.exists())
        self.assertEqual(self.request(self.payload,role='admin')[0],201)
