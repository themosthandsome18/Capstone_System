import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_landing_test.dart' show pumpLanding;
import 'sanitation_staff_bootstrap_test.dart' show FakeStaffApi, pumpShell;

void expectNoPublicShortcuts() {
  expect(
    find.textContaining(RegExp(r'verify|track.*report', caseSensitive: false)),
    findsNothing,
  );
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('staff Home has no Quick Actions section or public shortcuts', (
    tester,
  ) async {
    await pumpShell(tester, FakeStaffApi());
    expect(find.text('Quick Actions'), findsNothing);
    expect(find.byType(QuickAction), findsNothing);
    expectNoPublicShortcuts();
  });

  testWidgets('staff drawer has no public shortcuts', (tester) async {
    await pumpShell(tester, FakeStaffApi());
    tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
    await tester.pumpAndSettle();
    expectNoPublicShortcuts();
    expect(find.text('Household Survey'), findsOneWidget);
  });

  for (final tab in ['Community', 'Profile', 'Records']) {
    testWidgets('staff $tab has no public shortcuts', (tester) async {
      await pumpShell(tester, FakeStaffApi());
      await tester.tap(find.widgetWithText(NavigationDestination, tab));
      await tester.pumpAndSettle();
      expectNoPublicShortcuts();
    });
  }

  testWidgets('public Verify Permit remains reachable', (tester) async {
    await pumpLanding(tester);
    await tester.tap(find.text('Verify a posted permit'));
    await tester.pumpAndSettle();
    expect(find.byType(PermitVerificationPage), findsOneWidget);
  });

  testWidgets('public Track a report opens the existing tracker', (
    tester,
  ) async {
    await pumpLanding(tester);
    expect(find.text('Track a report'), findsOneWidget);
    await tester.tap(find.text('Track a report'));
    await tester.pumpAndSettle();
    expect(find.byType(ReportTrackerPage), findsOneWidget);
    expect(find.widgetWithText(AppTextField, 'Contact number'), findsOneWidget);
    expect(find.widgetWithText(AppTextField, 'Complaint ID'), findsOneWidget);
  });

  testWidgets('tracker requires both inputs and uses the existing lookup API', (
    tester,
  ) async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('{"rows":[]}', 200);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await tester.pumpWidget(
        const MaterialApp(home: ReportTrackerPage(api: TourismApi())),
      );
      await tester.tap(find.text('Track Reports'));
      await tester.pump();
      expect(requests, isEmpty);
      await tester.enterText(find.byType(TextField).first, '09170000000');
      await tester.tap(find.text('Track Reports'));
      await tester.pump();
      expect(requests, isEmpty);
      await tester.enterText(find.byType(TextField).first, '');
      await tester.enterText(find.byType(TextField).last, 'SAN-LOCAL');
      await tester.tap(find.text('Track Reports'));
      await tester.pump();
      expect(requests, isEmpty);
      await tester.enterText(find.byType(TextField).first, '09170000000');
      await tester.tap(find.text('Track Reports'));
      await tester.pumpAndSettle();
      expect(requests, hasLength(1));
      expect(requests.single.method, 'GET');
      expect(
        requests.single.url.path,
        '/api/mobile/sanitation/reports/history/',
      );
      expect(requests.single.url.queryParameters, {
        'contact': '09170000000',
        'reference': 'SAN-LOCAL',
      });
    }, () => client);
  });
}
