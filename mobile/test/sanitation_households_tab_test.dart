import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_staff_bootstrap_test.dart' show FakeStaffApi, pumpShell;
import 'sanitation_staff_shortcuts_test.dart' show expectNoPublicShortcuts;

Future<void> openFourthTab(WidgetTester tester) async {
  await tester.tap(find.byType(NavigationDestination).at(3));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('Complaints route refreshes its loaded records', (tester) async {
    final staff = <String, dynamic>{};
    await pumpShell(tester, FakeStaffApi(staff: staff));
    tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Complaints'));
    await tester.pumpAndSettle();
    expect(find.text('No complaint alerts loaded'), findsOneWidget);
    staff['complaintData'] = {
      'rows': [
        {
          'complaint_id': 'SAN-REFRESH',
          'category': 'Refreshed complaint',
          'barangay': 'Daungan',
          'description': 'Local test',
        },
      ],
    };
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();
    expect(find.text('Refreshed complaint'), findsOneWidget);
    expect(find.text('No complaint alerts loaded'), findsNothing);
    expectNoPublicShortcuts();
  });

  testWidgets('staff bottom navigation has Households instead of Community', (
    tester,
  ) async {
    await pumpShell(tester, FakeStaffApi());
    expect(
      tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((item) => item.label),
      ['Home', 'Records', 'Map', 'Households', 'Profile'],
    );
    expect(
      find.widgetWithText(NavigationDestination, 'Community'),
      findsNothing,
    );
  });

  testWidgets('fourth tab lists bootstrap households rather than complaints', (
    tester,
  ) async {
    await pumpShell(
      tester,
      FakeStaffApi(
        staff: {
          'householdRecords': [
            {
              'household_code': 'HH-LOCAL',
              'household_head': 'Local Household Head',
              'barangay': 'Daungan',
              'survey_date': '2026-09-28',
              'status': 'for_compliance',
            },
          ],
        },
      ),
    );
    await openFourthTab(tester);
    expect(find.byType(SanitationReportsPage), findsNothing);
    expect(find.text('Local Household Head'), findsOneWidget);
    expect(find.textContaining('Daungan'), findsOneWidget);
    expect(find.textContaining('2026-09-28'), findsOneWidget);
    expect(find.text(householdStatusLabel('for_compliance')), findsOneWidget);
    expectNoPublicShortcuts();
  });

  testWidgets('empty households shows an honest empty state', (tester) async {
    await pumpShell(tester, FakeStaffApi());
    await openFourthTab(tester);
    expect(find.text('No household records loaded'), findsOneWidget);
    expect(find.text('New Household Survey'), findsOneWidget);
    expect(find.byType(SanitationReportsPage), findsNothing);
  });

  testWidgets('household action opens the existing survey without Remarks', (
    tester,
  ) async {
    await pumpShell(tester, FakeStaffApi());
    await openFourthTab(tester);
    expect(find.text('New Household Survey'), findsOneWidget);
    await tester.tap(find.text('New Household Survey'));
    await tester.pumpAndSettle();
    expect(find.byType(HouseholdSurveyPage), findsOneWidget);
    expect(find.widgetWithText(AppTextField, 'Household head'), findsOneWidget);
    expect(find.widgetWithText(AppTextField, 'Remarks'), findsNothing);
  });

  testWidgets(
    'drawer Complaints opens the existing screen without public tracking',
    (tester) async {
      await pumpShell(
        tester,
        FakeStaffApi(
          staff: {
            'complaintData': {
              'rows': [
                {
                  'complaint_id': 'SAN-LOCAL',
                  'category': 'Local garbage complaint',
                  'barangay': 'Daungan',
                  'description': 'Local test',
                },
              ],
            },
          },
        ),
      );
      tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
      await tester.pumpAndSettle();
      expect(find.text('Complaints'), findsOneWidget);
      await tester.tap(find.text('Complaints'));
      await tester.pumpAndSettle();
      expect(find.byType(SanitationReportsPage), findsOneWidget);
      expect(find.text('Local garbage complaint'), findsOneWidget);
      expectNoPublicShortcuts();
      await tester.pageBack();
      await tester.pumpAndSettle();
      await openFourthTab(tester);
      expect(find.byType(SanitationReportsPage), findsNothing);
    },
  );
}
