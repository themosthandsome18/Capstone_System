"""Registration never substitutes a barangay centroid for an unknown location."""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from django.test import LiveServerTestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from api.models import UserProfile, SanitaryBusinessType, SanitaryEstablishment

@override_settings(USE_SEED_DATA=False)
class EstablishmentCoordinateHTTPTests(LiveServerTestCase):
    host = '127.0.0.1'
    def setUp(self):
        user=User.objects.create_user(username='synthetic_coordinate_staff')
        UserProfile.objects.update_or_create(user=user,defaults={'role':'sanitation'})
        self.token=Token.objects.create(user=user).key
        bt=SanitaryBusinessType.objects.first() or SanitaryBusinessType.objects.create(name='Synthetic Type')
        self.data=dict(business_name='Synthetic Coordinate',owner_name='Synthetic',business_type=bt.pk,barangay='Alitap',address='Synthetic road')
    def request(self,data,pk=None):
        q=Request(self.live_server_url+'/api/sanitation/establishments/'+(str(pk)+'/' if pk else ''),data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Authorization':'Token '+self.token},method='PATCH' if pk else 'POST')
        try:r=urlopen(q,timeout=15)
        except HTTPError as e:r=e
        return r.status,json.load(r)
    def check_pair(self,extra,expected):
        code,body=self.request({**self.data,**extra});self.assertEqual(code,201,body)
        record=SanitaryEstablishment.objects.get(pk=body['id'])
        self.assertEqual((record.latitude,record.longitude),expected)
        self.assertEqual((body['latitude'],body['longitude']),expected)
        print('COORDINATE_HTTP',json.dumps({'submitted':extra,'status':code,'stored':expected,'response':body['coordinates']}))
        return record
    def test_omitted_location_stays_unknown(self):self.check_pair({},(None,None))
    def test_explicit_null_location_stays_unknown(self):self.check_pair({'latitude':None,'longitude':None},(None,None))
    def test_incomplete_pair_is_not_completed_from_barangay(self):self.check_pair({'latitude':14.14},(14.14,None))
    def test_valid_pair_persists_and_unrelated_edit_preserves_it(self):
        r=self.check_pair({'latitude':14.14,'longitude':121.715},(14.14,121.715))
        self.assertEqual(self.request({'address':'Updated synthetic'},r.pk)[0],200)
        r.refresh_from_db();self.assertEqual((r.latitude,r.longitude),(14.14,121.715))
    def test_unknown_remains_unknown_on_unrelated_edit(self):
        r=self.check_pair({},(None,None));self.assertEqual(self.request({'address':'Updated synthetic'},r.pk)[0],200)
        r.refresh_from_db();self.assertEqual((r.latitude,r.longitude),(None,None))
