"""Inspector account authority is independent of Django admin-site is_staff."""
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from api.models import ActivityLog, UserProfile, ROLE_ADMIN, ROLE_SANITATION, ROLE_TOURISM


@override_settings(USE_SEED_DATA=False)
class InspectorAccountAuthorizationTests(TestCase):
    prefixes = ('/api/sanitation/staff/', '/api/v1/sanitation/staff/')

    def setUp(self):
        self.client = APIClient()
        self.target = self.account('target', ROLE_SANITATION, is_staff=True)

    def account(self, name, role, **flags):
        user = User.objects.create_user(name, password='Synthetic-test-only-123', **flags)
        if role is not None:
            UserProfile.objects.create(user=user, role=role)
        Token.objects.create(user=user)
        return user

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + user.auth_token.key)

    def snapshot(self):
        # Compare persisted columns, including password hashes, roles and tokens.
        return [list(model.objects.order_by('pk').values())
                for model in (User, UserProfile, Token, ActivityLog)]

    def denied(self, operation, payload):
        for index, (role, staff) in enumerate((
            (ROLE_SANITATION, True), (ROLE_SANITATION, False),
            (ROLE_TOURISM, True), ('tourist', True), ('establishment', True),
            (None, True), ('unknown', True),
        )):
            actor = self.account('denied_' + str(index), role, is_staff=staff)
            self.authenticate(actor)
            for prefix in self.prefixes:
                for method in (('post',) if operation == 'create' else ('patch', 'put')):
                    with self.subTest(role=role, is_staff=staff, route=prefix, method=method):
                        url = prefix if operation == 'create' else f'{prefix}{self.target.pk}/'
                        before = self.snapshot()
                        response = getattr(self.client, method)(url, payload, format='json')
                        self.assertEqual(response.status_code, 403)
                        self.assertIn('Administrator privileges', response.data['detail'])
                        self.assertEqual(self.snapshot(), before)

    def test_create_denied_without_account_authority(self):
        self.denied('create', {'username': 'new_inspector', 'first_name': 'Sample',
                    'last_name': 'Inspector', 'password': 'Synthetic-new-only-123',
                    'is_superuser': True, 'role': ROLE_ADMIN})

    def test_profile_edit_denied_without_account_authority(self):
        self.denied('edit', {'first_name': 'Changed', 'last_name': 'Changed',
                    'email': 'changed@example.invalid'})

    def test_deactivate_denied_without_account_authority(self):
        self.denied('deactivate', {'is_active': False})

    def test_reactivate_denied_without_account_authority(self):
        self.target.is_active = False
        self.target.save()
        self.denied('reactivate', {'is_active': True})

    def test_password_change_denied_without_account_authority(self):
        self.denied('password', {'password': 'Synthetic-replacement-only-123'})

    def test_self_edit_cannot_elevate_an_inspector(self):
        self.authenticate(self.target)
        for prefix in self.prefixes:
            before = self.snapshot()
            response = self.client.patch(f'{prefix}{self.target.pk}/',
                {'role': ROLE_ADMIN, 'is_superuser': True, 'password': 'Synthetic-new-only-123'}, format='json')
            self.assertEqual(response.status_code, 403)
            self.assertEqual(self.snapshot(), before)

    def test_denial_precedes_validation_and_target_lookup(self):
        self.authenticate(self.target)
        for prefix in self.prefixes:
            before = self.snapshot()
            self.assertEqual(self.client.post(prefix, {}, format='json').status_code, 403)
            self.assertEqual(self.client.patch(f'{prefix}999999/', {}, format='json').status_code, 403)
            self.assertEqual(self.snapshot(), before)

    def allowed(self, role, **flags):
        actor = self.account('administrator', role, **flags)
        self.authenticate(actor)
        for index, prefix in enumerate(self.prefixes):
            response = self.client.post(prefix, {'username': f'created_{index}',
                'first_name': 'Synthetic', 'last_name': 'Inspector',
                'password': 'Synthetic-created-only-123', 'role': ROLE_ADMIN,
                'is_superuser': True}, format='json')
            self.assertEqual(response.status_code, 201)
            target = User.objects.get(pk=response.data['id'])
            self.assertEqual(target.profile.role, ROLE_SANITATION)
            self.assertFalse(target.is_superuser)
            self.assertTrue(target.is_staff)
            self.assertTrue(target.check_password('Synthetic-created-only-123'))
            url = f'{prefix}{target.pk}/'
            for method in ('patch', 'put'):
                for data in ({'first_name': method, 'last_name': 'Sample', 'email': f'{method}@example.invalid'},
                             {'is_active': False}, {'is_active': True},
                             {'password': f'Synthetic-{method}-only-123'}):
                    # Avoid email uniqueness conflicts between the two route fixtures.
                    if 'email' in data:
                        data['email'] = f'{index}-{method}@example.invalid'
                    result = getattr(self.client, method)(url, data, format='json')
                    self.assertEqual(result.status_code, 200)
                    target.refresh_from_db()
                    for field, value in data.items():
                        if field == 'password':
                            self.assertTrue(target.check_password(value))
                        else:
                            self.assertEqual(getattr(target, field), value)
                    self.assertEqual(target.profile.role, ROLE_SANITATION)
            self.assertEqual(self.client.get(prefix).status_code, 200)
            self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(ActivityLog.objects.filter(user=actor).count(), 18)

    def test_application_admin_without_is_staff_can_manage(self):
        self.allowed(ROLE_ADMIN, is_staff=False)

    def test_application_admin_with_is_staff_can_manage(self):
        self.allowed(ROLE_ADMIN, is_staff=True)

    def test_superuser_with_sanitation_profile_can_manage(self):
        self.allowed(ROLE_SANITATION, is_superuser=True)

    def test_superuser_with_other_module_profile_can_manage(self):
        self.allowed(ROLE_TOURISM, is_superuser=True)

    def test_superuser_without_profile_can_manage(self):
        self.allowed(None, is_superuser=True)

    def test_get_preserves_inspector_access_and_excludes_credentials(self):
        self.authenticate(self.target)
        for prefix in self.prefixes:
            before = self.snapshot()
            listing = self.client.get(prefix)
            detail = self.client.get(f'{prefix}{self.target.pk}/')
            self.assertEqual(listing.status_code, 200)
            self.assertEqual(detail.status_code, 200)
            self.assertNotIn('password', detail.data)
            self.assertNotIn('token', detail.data)
            self.assertEqual(self.snapshot(), before)

    def test_get_denies_other_roles_without_creating_profile(self):
        for index, role in enumerate((ROLE_TOURISM, 'tourist', 'establishment', None)):
            self.authenticate(self.account(f'other_{index}', role, is_staff=True))
            for prefix in self.prefixes:
                before = self.snapshot()
                self.assertEqual(self.client.get(prefix).status_code, 403)
                self.assertEqual(self.client.get(f'{prefix}{self.target.pk}/').status_code, 403)
                self.assertEqual(self.snapshot(), before)

    def test_anonymous_and_inactive_accounts_are_not_authenticated(self):
        inactive = self.account('inactive_admin', ROLE_ADMIN, is_active=False, is_superuser=True)
        for actor in (None, inactive):
            self.client.credentials()
            if actor:
                self.authenticate(actor)
            for prefix in self.prefixes:
                before = self.snapshot()
                for method, path in (('get', prefix), ('post', prefix),
                                     ('get', f'{prefix}{self.target.pk}/'),
                                     ('patch', f'{prefix}{self.target.pk}/'),
                                     ('put', f'{prefix}{self.target.pk}/')):
                    self.assertEqual(getattr(self.client, method)(path).status_code, 401)
                self.assertEqual(self.snapshot(), before)
