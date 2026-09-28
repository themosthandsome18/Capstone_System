// Establishment accounts are no longer used: owners check their permit in
// the Establishment Portal with the code on their Owner's Slip. A phone that
// still has an establishment session gets it cleared, and an establishment
// account signing in through Staff Sign In is turned away.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const retiredMessage =
    "Hindi na ginagamit ang establishment account. Gamitin ang Establishment "
    "Portal at ang code sa iyong Owner's Slip. / Establishment accounts are no "
    "longer used. Use the Establishment Portal with the code on your Owner's Slip.";

const oldSession = {
  'staff_auth_token': '0123456789abcdef0123456789abcdef01234567',
  'staff_auth_role': 'establishment',
  'staff_auth_username': 'old_owner',
  'establishment_data': '{"id": 7, "business_name": "Old Owner Store"}',
};

class LoginApi extends TourismApi {
  LoginApi(this.role);

  final String role;
  int logins = 0;

  @override
  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    logins += 1;
    return {
      'token': 'fedcba9876543210fedcba9876543210fedcba98',
      'user': {
        'display_name': username,
        'profile': {'role': role},
      },
      if (role == 'establishment')
        'establishment': {'id': 7, 'business_name': 'Old Owner Store'},
    };
  }
}

Future<void> pumpGateway(WidgetTester tester, TourismApi api) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final bootstrap = SanitationBootstrap.fallback();
  await tester.pumpWidget(MaterialApp(
    home: SanitationAccessGateway(
      api: api,
      bootstrap: bootstrap,
      onRefresh: () async => bootstrap,
    ),
  ));
  await tester.pumpAndSettle();
}

Future<void> staffSignIn(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(OutlinedButton, 'Staff Sign In'));
  await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField, 'Username or Email'), 'someone');
  await tester.enterText(find.widgetWithText(TextField, 'Password'), 'Secret@123');
  await tester.tap(find.text('Sign in as Inspector / Admin'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a saved establishment session is cleared and the landing page shows', (tester) async {
    SharedPreferences.setMockInitialValues(Map<String, Object>.from(oldSession));

    await pumpGateway(tester, const TourismApi());

    expect(find.text('Ano ang kailangan mo ngayon?'), findsOneWidget);
    expect(find.text('Old Owner Store'), findsNothing);
    final prefs = await SharedPreferences.getInstance();
    for (final key in oldSession.keys) {
      expect(prefs.containsKey(key), isFalse, reason: key);
    }
  });

  testWidgets('leftover establishment data alone is cleared too', (tester) async {
    SharedPreferences.setMockInitialValues({
      'establishment_data': '{"id": 7, "business_name": "Old Owner Store"}',
    });

    await pumpGateway(tester, const TourismApi());

    expect(find.text('Ano ang kailangan mo ngayon?'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey('establishment_data'), isFalse);
  });

  testWidgets('a saved staff session still opens the staff app', (tester) async {
    SharedPreferences.setMockInitialValues({
      'staff_auth_token': '0123456789abcdef0123456789abcdef01234567',
      'staff_auth_role': 'sanitation',
      'staff_auth_username': 'inspector',
    });

    await pumpGateway(tester, const TourismApi());

    expect(find.byType(SanitationMobileShell), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('staff_auth_role'), 'sanitation');
  });

  testWidgets('an establishment account signing in as staff is turned away', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = LoginApi('establishment');
    await pumpGateway(tester, api);

    await staffSignIn(tester);

    expect(api.logins, 1);
    expect(find.text(retiredMessage), findsOneWidget);
    expect(find.byType(SanitationMobileShell), findsNothing);
    expect(find.text('Old Owner Store'), findsNothing);
    expect(find.text('Inspector / Staff Login'), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getKeys(), isEmpty);
  });

  testWidgets('a sanitation account signing in as staff still gets in', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await pumpGateway(tester, LoginApi('sanitation'));

    await staffSignIn(tester);

    expect(find.byType(SanitationMobileShell), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('staff_auth_role'), 'sanitation');
  });
}
