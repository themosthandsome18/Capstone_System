import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_staff_bootstrap_test.dart' show publicBootstrap;

class IdentityTestApi extends TourismApi {
  IdentityTestApi({this.recordsError});
  final Object? recordsError;

  @override
  Future<Map<String, dynamic>> fetchSanitationStaffRecords() async {
    if (recordsError != null) throw recordsError!;
    return {};
  }
}

Future<void> withIdentity(
  WidgetTester tester,
  Map<String, dynamic> user,
  Future<void> Function(List<http.Request>) check, {
  int status = 200,
  VoidCallback? onSessionExpired,
  VoidCallback? onLogout,
  Object? recordsError,
}) async {
  tester.view.physicalSize = const Size(1200, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final requests = <http.Request>[];
  final client = MockClient((request) async {
    requests.add(request);
    return http.Response(jsonEncode({'user': user}), status);
  });
  addTearDown(client.close);
  await http.runWithClient(() async {
    await tester.pumpWidget(
      MaterialApp(
        home: SanitationMobileShell(
          api: IdentityTestApi(recordsError: recordsError),
          bootstrap: publicBootstrap(),
          onRefresh: () async => publicBootstrap(),
          onSessionExpired: onSessionExpired,
          onLogout: onLogout,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await check(requests);
  }, () => client);
}

const inspector = {
  'display_name': 'Local Inspector',
  'username': 'local.inspector',
  'profile': {'role': 'sanitation', 'role_label': 'Sanitation Staff'},
};

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'mock-session-token',
      staffAuthRoleKey: 'sanitation',
      staffAuthUsernameKey: 'local.inspector',
    }),
  );

  testWidgets('Home greets the authenticated display name', (tester) async {
    await withIdentity(tester, inspector, (_) async {
      expect(find.text('Good day, Local Inspector'), findsOneWidget);
      expect(find.text('Welcome, Sanitary Inspector'), findsNothing);
    });
  });

  for (final name in <String?>['  ', null]) {
    testWidgets(
      'username fallback for ${name == null ? 'missing' : 'blank'} display name',
      (tester) async {
        await withIdentity(
          tester,
          {
            'display_name': ?name,
            'username': 'local.inspector',
          },
          (_) async {
            expect(find.text('Good day, local.inspector'), findsOneWidget);
          },
        );
      },
    );
  }

  testWidgets('missing identity uses a neutral fallback', (tester) async {
    await withIdentity(tester, {}, (_) async {
      expect(find.text('Good day, Sanitary Inspector'), findsOneWidget);
    });
  });

  testWidgets('Profile and drawer show the same authenticated identity', (
    tester,
  ) async {
    await withIdentity(tester, inspector, (_) async {
      await tester.tap(find.widgetWithText(NavigationDestination, 'Profile'));
      await tester.pumpAndSettle();
      expect(find.text('Local Inspector'), findsOneWidget);
      expect(find.text('Username: local.inspector'), findsOneWidget);
      expect(find.text('Sanitation Staff'), findsOneWidget);
      expect(find.text('Submitted Inspections & Surveys'), findsOneWidget);
      tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(Drawer),
          matching: find.text('Local Inspector'),
        ),
        findsOneWidget,
      );
    });
  });

  testWidgets(
    'identity reuses the stored token and loads only once across tabs and refresh',
    (tester) async {
      await withIdentity(tester, inspector, (requests) async {
        await tester.tap(find.widgetWithText(NavigationDestination, 'Profile'));
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.refresh));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(NavigationDestination, 'Home'));
        await tester.pumpAndSettle();
        expect(requests, hasLength(1));
        expect(requests.single.method, 'GET');
        expect(requests.single.url.path, '/api/auth/me/');
        expect(
          requests.single.headers['Authorization'],
          'Token mock-session-token',
        );
      });
    },
  );

  testWidgets('Home bell still opens notifications', (tester) async {
    await withIdentity(tester, inspector, (_) async {
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      expect(find.byType(NotificationPage), findsOneWidget);
    });
  });

  testWidgets(
    'identity 401 clears the session and calls existing expiry handler',
    (tester) async {
      var expired = 0;
      await withIdentity(
        tester,
        {},
        (_) async {
          expect(expired, 1);
          final prefs = await SharedPreferences.getInstance();
          expect(prefs.getString(staffAuthTokenKey), isNull);
          expect(prefs.getString(staffAuthRoleKey), isNull);
          expect(prefs.getString(staffAuthUsernameKey), isNull);
        },
        status: 401,
        onSessionExpired: () => expired++,
      );
    },
  );

  testWidgets(
    'identity 401 without a callback keeps the existing expiry message',
    (tester) async {
      await withIdentity(tester, {}, (_) async {
        expect(
          find.text('Your session expired, please sign in again.'),
          findsOneWidget,
        );
      }, status: 401);
    },
  );

  testWidgets(
    'concurrent identity and records 401 expire the session only once',
    (tester) async {
      var expired = 0;
      await withIdentity(
        tester,
        {},
        (_) async {
          expect(expired, 1);
          expect(tester.takeException(), isNull);
        },
        status: 401,
        onSessionExpired: () => expired++,
        recordsError: const ApiException(
          statusCode: 401,
          message: 'Expired local test session',
        ),
      );
    },
  );

  testWidgets(
    'identity server failure retains the session and neutral identity',
    (tester) async {
      var expired = false;
      await withIdentity(
        tester,
        {},
        (_) async {
          expect(expired, isFalse);
          expect(find.text('Good day, Sanitary Inspector'), findsOneWidget);
          expect(find.text('Could not load staff identity.'), findsOneWidget);
          final prefs = await SharedPreferences.getInstance();
          expect(prefs.containsKey(staffAuthTokenKey), isTrue);
        },
        status: 500,
        onSessionExpired: () => expired = true,
      );
    },
  );

  testWidgets('Profile sign out still invokes the session logout', (
    tester,
  ) async {
    var loggedOut = false;
    await withIdentity(tester, inspector, (_) async {
      await tester.tap(find.widgetWithText(NavigationDestination, 'Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(loggedOut, isTrue);
    }, onLogout: () => loggedOut = true);
  });

  testWidgets('Profile retains both history types without category chips', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SanitationActionsPage(
            bootstrap: publicBootstrap(),
            inspections: const [
              MobileSanitationInspectionReceipt(
                reference: 'INS-LOCAL',
                establishmentName: 'Local Store',
                inspectorName: 'Local Inspector',
                inspectionDate: '2026-09-28',
                status: 'good_standing',
              ),
            ],
            householdSurveys: const [
              MobileHouseholdSurveyReceipt(
                householdCode: 'HH-LOCAL',
                householdHead: 'Local Head',
                barangay: 'Daungan',
                status: 'good_standing',
                inspectionDate: '2026-09-28',
                waterSource: 'Local source',
                toiletType: 'water_sealed',
              ),
            ],
            onOpenInspection: (_) {},
            onOpenPermits: () {},
            onOpenHouseholdSurvey: () {},
            onOpenNotifications: () {},
            onRefresh: () async {},
            refreshing: false,
          ),
        ),
      ),
    );
    expect(find.text('Local Store'), findsOneWidget);
    expect(find.text('Household: Local Head'), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNothing);
  });
}
