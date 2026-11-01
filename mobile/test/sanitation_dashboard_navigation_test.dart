import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sanitation_dashboard_ui_test.dart' show DashboardUiApi, pumpHome, tile;

class NavigationApi extends DashboardUiApi {
  bool recovered = false;
  bool failRefresh = false;
  bool invalidHouseholdDate = false;
  @override
  Future<Map<String, dynamic>> fetchSanitationStaffRecords() async {
    final now = DateTime.now();
    final month = '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
    final nextMonth = DateTime(now.year, now.month + 1);
    final futureMonth =
        '${nextMonth.year}-${nextMonth.month.toString().padLeft(2, '0')}-01';
    return {
      'establishments': [
        {
          'id': 11,
          'business_name': 'Other Store',
          'compliance_status': 'good_standing',
          'permit_status': 'active',
        },
        {
          'id': 12,
          'business_name': 'Due Store',
          'compliance_status': 'violation',
          'permit_status': 'renewal_due',
        },
        {
          'id': 13,
          'business_name': 'Suspended Store',
          'compliance_status': 'for_completion',
          'permit_status': 'suspended',
        },
      ],
      'householdRecords': [
        {
          'id': 1,
          'household_code': 'HH-1',
          'household_head': 'Superseded Survey',
          'last_survey_date': '2020-01-01',
        },
        {
          'id': 3,
          'household_code': 'HH-3',
          'household_head': 'Future Household',
          'last_survey_date': futureMonth,
        },
        if (invalidHouseholdDate)
          {
            'id': 4,
            'household_code': 'HH-4',
            'household_head': 'Invalid Date',
            'last_survey_date': '${month}T23:00:00-12:00',
          },
        {'id': 5, 'household_code': 'HH-5', 'household_head': 'Missing Date'},
        {
          'id': 1,
          'household_code': 'HH-1',
          'household_head': 'This Month',
          'last_survey_date': month,
        },
        {
          'id': 2,
          'household_code': 'HH-2',
          'household_head': 'Old Household',
          'last_survey_date': '2020-01-01',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> fetchSanitationPendingComplaints() async {
    if (failRefresh) throw StateError('Synthetic unavailable');
    return {
      'summary': {'pending': 1},
      'rows': [
        {
          'complaint_id': 'pending',
          'category': recovered ? 'Refreshed Pending' : 'Pending Water',
          'status': 'pending',
        },
        {
          'complaint_id': 'closed',
          'category': 'Closed Waste',
          'status': 'resolved',
        },
      ],
    };
  }
}

Future<void> open(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'test-session',
    }),
  );

  testWidgets('menu and both Profile entries reach the existing destinations', (
    tester,
  ) async {
    await pumpHome(tester, NavigationApi());
    await open(tester, find.byTooltip('Menu'));
    expect(find.byType(Drawer), findsOneWidget);
    await open(tester, find.widgetWithText(ListTile, 'Profile'));
    expect(find.byType(SanitationActionsPage), findsOneWidget);
    await open(tester, find.widgetWithText(NavigationDestination, 'Home'));
    await open(
      tester,
      find.descendant(
        of: find.byType(SanitationDashboardPage),
        matching: find.byTooltip('Profile'),
      ),
    );
    expect(find.byType(SanitationActionsPage), findsOneWidget);
  });

  testWidgets('Establishments opens all records; card padding is tappable', (
    tester,
  ) async {
    await pumpHome(tester, NavigationApi());
    await tester.tapAt(
      tester.getTopLeft(tile('Establishments')) + const Offset(20, 8),
    );
    await tester.pumpAndSettle();
    final page = tester.widget<SanitationEstablishmentsPage>(
      find.byType(SanitationEstablishmentsPage),
    );
    expect(page.establishments.map((e) => e.id), [11, 12, 13]);
    expect(page.initialComplianceStatus, 'All Status');
    expect(page.initialPermitStatus, 'All Permits');
  });

  for (final shortcut in [false, true]) {
    testWidgets(
      'due inspection ${shortcut ? 'shortcut' : 'card'} excludes unrelated records and Back returns Home',
      (tester) async {
        await pumpHome(tester, NavigationApi());
        expect(
          find.widgetWithText(ListTile, 'Due Inspections'),
          findsOneWidget,
        );
        expect(find.widgetWithText(ListTile, 'Inspections'), findsNothing);
        await open(
          tester,
          shortcut
              ? find.widgetWithText(ListTile, 'Due Inspections')
              : tile('Due for inspection'),
        );
        final page = tester.widget<SanitationEstablishmentsPage>(
          find.byType(SanitationEstablishmentsPage),
        );
        expect(page.establishments.map((e) => e.id), [12]);
        await open(tester, find.byType(BackButton));
        expect(find.byType(SanitationDashboardPage), findsOneWidget);
      },
    );
  }

  for (final label in ['Violations', 'Permit Follow-up']) {
    testWidgets(
      '$label applies the exact existing status and resets on all-records navigation',
      (tester) async {
        await pumpHome(tester, NavigationApi());
        await open(tester, find.widgetWithText(ListTile, label));
        expect(tester.takeException(), isNull);
        final page = tester.widget<SanitationEstablishmentsPage>(
          find.byType(SanitationEstablishmentsPage),
        );
        expect(
          page.initialComplianceStatus,
          label == 'Violations' ? 'violation' : 'All Status',
        );
        expect(
          page.initialPermitStatus,
          label == 'Permit Follow-up' ? 'renewal_due' : 'All Permits',
        );
        final cards = tester.widgetList<SanitationEstablishmentCard>(
          find.byType(SanitationEstablishmentCard),
        );
        expect(cards.map((e) => e.establishment.id), [12]);
        await open(tester, find.widgetWithText(NavigationDestination, 'Home'));
        await open(tester, tile('Establishments'));
        expect(
          tester
              .widget<SanitationEstablishmentsPage>(
                find.byType(SanitationEstablishmentsPage),
              )
              .initialComplianceStatus,
          'All Status',
        );
        expect(find.byType(SanitationEstablishmentCard), findsNWidgets(3));
      },
    );
  }

  testWidgets(
    'complaint card filters pending rows and refresh preserves scope',
    (tester) async {
      final api = NavigationApi();
      await pumpHome(tester, api);
      await open(tester, tile('New complaints'));
      expect(find.text('Pending Water'), findsOneWidget);
      expect(find.text('Closed Waste'), findsNothing);
      expect(find.text('Submitted Community Reports'), findsNothing);
      api.recovered = true;
      await open(tester, find.byIcon(Icons.refresh));
      expect(find.text('Refreshed Pending'), findsOneWidget);
      expect(find.text('Closed Waste'), findsNothing);
      api.failRefresh = true;
      await open(tester, find.byIcon(Icons.refresh));
      expect(
        find.text('Pending complaints unavailable. Refresh to retry.'),
        findsOneWidget,
      );
      expect(find.text('No complaint alerts loaded'), findsNothing);
    },
  );

  testWidgets('invalid household calendar dates disable filtered navigation', (
    tester,
  ) async {
    await pumpHome(tester, NavigationApi()..invalidHouseholdDate = true);
    expect(
      find.descendant(
        of: tile('Households this month'),
        matching: find.text('Unavailable'),
      ),
      findsOneWidget,
    );
    await open(tester, tile('Households this month'));
    expect(find.byType(SanitationHouseholdsPage), findsNothing);
  });

  testWidgets('monthly household card excludes old surveys', (tester) async {
    await pumpHome(tester, NavigationApi());
    await open(tester, tile('Households this month'));
    expect(find.text('This Month'), findsOneWidget);
    expect(find.text('Old Household'), findsNothing);
    expect(find.text('Superseded Survey'), findsNothing);
    expect(find.text('Future Household'), findsNothing);
    expect(find.text('Invalid Date'), findsNothing);
    expect(find.text('Missing Date'), findsNothing);
    final page = tester.widget<SanitationHouseholdsPage>(
      find.byType(SanitationHouseholdsPage),
    );
    expect(page.householdRecords, hasLength(1));
  });

  testWidgets('loading filtered shortcuts are disabled', (tester) async {
    await pumpHome(tester, NavigationApi());
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SanitationDashboardPage(
            identity: const SanitationStaffIdentity(),
            bootstrap: tester
                .widget<SanitationMobileShell>(
                  find.byType(SanitationMobileShell),
                )
                .bootstrap,
            dashboard: const SanitationDashboardState.loading(),
            onOpenInspection: (_) {},
            onOpenComplaints: () {},
            onOpenNotifications: () {},
            onOpenEstablishments: () {},
            onOpenDueInspections: () => fail('must be disabled'),
            onOpenViolations: () => fail('must be disabled'),
            onRefresh: () async {},
            refreshing: false,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await open(tester, tile('Due for inspection'));
    await open(tester, find.widgetWithText(ListTile, 'Violations'));
    expect(find.byType(SanitationEstablishmentsPage), findsNothing);
  });

  for (final width in [320.0, 360.0, 600.0]) {
    testWidgets(
      'dashboard wraps at $width with enlarged text and long identity',
      (tester) async {
        await pumpHome(tester, NavigationApi());
        tester.view.physicalSize = Size(width, 1800);
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(1.5)),
              child: child!,
            ),
            home: SanitationDashboardPage(
              identity: const SanitationStaffIdentity(
                displayName:
                    'A very long inspector name for the narrow dashboard header',
              ),
              bootstrap: tester
                  .widget<SanitationMobileShell>(
                    find.byType(SanitationMobileShell),
                  )
                  .bootstrap,
              dashboard: const SanitationDashboardState.loading(),
              onOpenInspection: (_) {},
              onOpenComplaints: () {},
              onOpenNotifications: () {},
              onOpenEstablishments: () {},
              onRefresh: () async {},
              refreshing: false,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
}
