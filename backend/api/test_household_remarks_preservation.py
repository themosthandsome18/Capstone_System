import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from django.test import LiveServerTestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from .models import HouseholdSanitationRecord, UserProfile


@override_settings(USE_SEED_DATA=False)
class HouseholdRemarksPreservationTests(LiveServerTestCase):
    """Actual loopback HTTP with token authentication and database readback."""
    def setUp(self):
        user = get_user_model().objects.create_user(username='synthetic-remarks-inspector')
        UserProfile.objects.create(user=user, role='sanitation')
        self.token = Token.objects.create(user=user).key
        self.observations = []
        self.payload = dict(household_head='Synthetic household', barangay='Alitap',
                            male_count=2, female_count=1, toilet_type='water_sealed',
                            water_level='level_3', waste_disposal='collected')
        self.record = HouseholdSanitationRecord.objects.create(
            household_code='SYN-REMARKS', **self.payload, remarks='  Legacy\n notes  ')
        self.detail = f'/api/households/records/{self.record.pk}/'

    def request(self, method, path, payload=None):
        req = Request(self.live_server_url + path, method=method,
                      data=None if payload is None else json.dumps(payload).encode(),
                      headers={'Authorization': 'Token ' + self.token, 'Content-Type': 'application/json'})
        try:
            response = urlopen(req, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            body = json.loads(response.read())
            return response.status, body

    def exact(self, method, path, payload, expected, status):
        code, body = self.request(method, path, payload)
        self.assertEqual(code, status, body)
        stored = HouseholdSanitationRecord.objects.get(pk=body['id'])
        read_status, readback = self.request('GET', f"/api/households/records/{stored.pk}/")
        self.assertEqual(read_status, 200)
        self.observations.append(dict(method=method, endpoint=path, submitted=payload.get('remarks', '<omitted>'),
                                      response=body['remarks'], stored=stored.remarks, readback=readback['remarks']))
        self.assertEqual((body['remarks'], stored.remarks, readback['remarks']), (expected, expected, expected))

    def test_web_post_preserves_outer_whitespace(self):
        self.exact('POST', '/api/households/records/', {**self.payload, 'remarks': ' 1 '}, ' 1 ', 201)

    def test_web_patch_preserves_outer_whitespace(self):
        self.exact('PATCH', self.detail, {'remarks': ' 1 '}, ' 1 ', 200)

    def test_web_put_preserves_outer_whitespace(self):
        self.exact('PUT', self.detail, {**self.payload, 'household_code': 'SYN-REMARKS', 'remarks': ' 1 '}, ' 1 ', 200)

    def test_internal_whitespace_and_newlines_control(self):
        self.exact('PATCH', self.detail, {'remarks': 'Line 1\n\tLine 2  spaced\r\nLast'}, 'Line 1\n\tLine 2  spaced\r\nLast', 200)

    def test_unrelated_patch_preserves_existing_exact_remarks(self):
        self.exact('PATCH', self.detail, {'male_count': 3}, self.record.remarks, 200)

    def test_explicit_empty_patch_clears_remarks(self):
        self.exact('PATCH', self.detail, {'remarks': ''}, '', 200)

    def test_omitted_post_uses_empty_default(self):
        self.exact('POST', '/api/households/records/', self.payload, '', 201)

    def test_mobile_post_preserves_outer_whitespace(self):
        self.exact('POST', '/api/mobile/sanitation/household-surveys/', {**self.payload, 'remarks': ' 1 '}, ' 1 ', 201)

    def test_mobile_upsert_preserves_outer_whitespace(self):
        self.exact('POST', '/api/mobile/sanitation/household-surveys/', {**self.payload, 'household_code': 'SYN-REMARKS', 'remarks': ' 1 '}, ' 1 ', 201)

    def test_mobile_upsert_omission_preserves_legacy_remarks(self):
        self.exact('POST', '/api/mobile/sanitation/household-surveys/', {**self.payload, 'household_code': 'SYN-REMARKS'}, self.record.remarks, 201)

    def test_null_remarks_remain_rejected(self):
        code, body = self.request('PATCH', self.detail, {'remarks': None})
        self.assertEqual(code, 400)
        self.assertIn('remarks', body)
        self.record.refresh_from_db()
        self.assertEqual(self.record.remarks, '  Legacy\n notes  ')

    def test_current_whitespace_only_and_other_field_normalization_policy(self):
        # Approved policy: retain accepted whitespace-only remarks literally.
        self.exact('PATCH', self.detail, {'remarks': ' \t\n '}, ' \t\n ', 200)
        code, body = self.request('PATCH', self.detail, {'address': '  Other text  '})
        self.assertEqual(code, 200)
        self.record.refresh_from_db()
        self.assertEqual((body['address'], self.record.address), ('Other text', 'Other text'))
