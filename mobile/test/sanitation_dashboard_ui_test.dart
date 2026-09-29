import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sanitation_staff_bootstrap_test.dart' show publicBootstrap;

class DashboardUiApi extends TourismApi {
  bool empty = false;
  Object? error;
  Completer<void>? gate;
  int identityCalls = 0;
  int staffCalls = 0;
  int complaintCalls = 0;
  @override
  Future<Map<String, dynamic>> fetchSanitationStaffIdentity() async {
    identityCalls++;
    return {
      'user': {'display_name': 'Local Inspector'},
    };
  }

  @override
  Future<Map<String, dynamic>> fetchSanitationStaffRecords() async {
    staffCalls++;
    return {
      'establishments': empty
          ? []
          : [
              {'id': 11, 'business_name': 'Other Store', 'business_type': 8},
              {'id': 12, 'business_name': 'Due Store', 'business_type': 8},
            ],
      'householdRecords': [],
    };
  }

  @override
  Future<Map<String, dynamic>> fetchSanitationPendingComplaints() async {
    complaintCalls++;
    await gate?.future;
    if (error != null) throw error!;
    return {
      'summary': {'pending': empty ? 0 : 7},
      'rows': empty
          ? []
          : [
              {
                'complaint_id': 'old',
                'status': 'pending',
                'priority': 'medium',
                'category': 'Water',
                'barangay': 'Mabato',
                'created_at': '2026-09-28T08:00:00+08:00',
              },
              {
                'complaint_id': 'new',
                'status': 'pending',
                'priority': 'high',
                'category': 'Garbage',
                'barangay': 'Daungan',
                'created_at': '2026-09-29T09:30:00+08:00',
              },
            ],
    };
  }

  @override
  Future<List<Map<String, dynamic>>>
  fetchSanitationDashboardInspections() async => empty
      ? []
      : [
          {
            'id': 21,
            'establishment': 12,
            'establishment_name': 'Due Store',
            'business_type_name': 'Water Refilling Station',
            'inspection_date': '2026-09-01',
            'next_due_date': '2026-09-01',
            'is_draft': false,
          },
        ];
}

Future<void> pumpHome(
  WidgetTester tester,
  DashboardUiApi api, {
  VoidCallback? onExpired,
}) async {
  tester.view.physicalSize = const Size(430, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: SanitationMobileShell(
        api: api,
        bootstrap: publicBootstrap(),
        onRefresh: () async => publicBootstrap(),
        onSessionExpired: onExpired,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

Finder tile(String label) => find.byKey(ValueKey('dashboard-stat-$label'));
void count(String label, String value) => expect(
  find.descendant(of: tile(label), matching: find.text(value)),
  findsOneWidget,
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
    'approved four tiles and identity replace obsolete Home content',
    (tester) async {
      await pumpHome(tester, DashboardUiApi());
      expect(find.text('Good day, Local Inspector'), findsOneWidget);
      for (final label in [
        'Establishments',
        'Due for inspection',
        'New complaints',
        'Households this month',
      ]) {
        expect(tile(label), findsOneWidget);
      }
      count('Establishments', '2');
      count('Due for inspection', '1');
      count('New complaints', '7');
      count('Households this month', '0');
      for (final label in [
        'Inspections',
        'Violations',
        'Permit Follow-up',
        'Urgent Alerts',
        'Recent Activity',
        'Quick Actions',
      ]) {
        expect(find.text(label), findsNothing);
      }
      expect(
        find.textContaining(
          RegExp(r'verify|track.*report', caseSensitive: false),
        ),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'pending rows show ordered real times, priority, category and barangay',
    (tester) async {
      await pumpHome(tester, DashboardUiApi());
      expect(find.text('New complaints from residents'), findsOneWidget);
      expect(find.text('URGENT'), findsOneWidget);
      expect(find.text('STANDARD'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Garbage')).dy,
        lessThan(tester.getTopLeft(find.text('Water')).dy),
      );
      expect(find.text('Daungan'), findsOneWidget);
      expect(find.text('Mabato'), findsOneWidget);
      final local = DateTime.parse('2026-09-29T09:30:00+08:00').toLocal();
      expect(
        find.text(
          '${shortDate(local)} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}',
        ),
        findsOneWidget,
      );
    },
  );
  testWidgets('See all opens existing staff complaints, never public tracker', (
    tester,
  ) async {
    await pumpHome(tester, DashboardUiApi());
    await tester.tap(find.text('See all'));
    await tester.pumpAndSettle();
    expect(find.byType(SanitationReportsPage), findsOneWidget);
    expect(find.byType(ReportTrackerPage), findsNothing);
  });
  testWidgets('due row Inspect selects matching existing establishment', (
    tester,
  ) async {
    await pumpHome(tester, DashboardUiApi());
    expect(find.text('Due Store'), findsOneWidget);
    expect(find.text('Water Refilling Station'), findsOneWidget);
    expect(find.text('Due: 9/1/2026'), findsOneWidget);
    await tester.tap(find.text('Inspect'));
    await tester.pumpAndSettle();
    final form = tester.widget<SanitationInspectionPage>(
      find.byType(SanitationInspectionPage),
    );
    expect(form.initialEstablishment!.id, 12);
    expect(
      tester
          .widget<DropdownTile<SanitationEstablishment>>(
            find.byType(DropdownTile<SanitationEstablishment>),
          )
          .value
          .id,
      12,
    );
  });
  testWidgets('valid zero gives honest empty lists', (tester) async {
    await pumpHome(tester, DashboardUiApi()..empty = true);
    for (final label in [
      'Establishments',
      'Due for inspection',
      'New complaints',
      'Households this month',
    ]) {
      count(label, '0');
    }
    expect(find.text('No new complaints.'), findsOneWidget);
    expect(find.text('No inspections due in this window.'), findsOneWidget);
  });
  testWidgets('loading then failure never displays zero or empty lists', (
    tester,
  ) async {
    final api = DashboardUiApi()
      ..gate = Completer<void>()
      ..error = StateError('Local failure');
    await pumpHome(tester, api);
    count('Establishments', 'Loading');
    expect(find.text('Loading complaints...'), findsOneWidget);
    expect(find.text('Loading due inspections...'), findsOneWidget);
    api.gate!.complete();
    await tester.pumpAndSettle();
    count('Establishments', 'Unavailable');
    expect(
      find.text('Complaints unavailable. Refresh to retry.'),
      findsOneWidget,
    );
    expect(
      find.text('Due inspections unavailable. Refresh to retry.'),
      findsOneWidget,
    );
    expect(find.text('No new complaints.'), findsNothing);
    expect(find.text('No inspections due in this window.'), findsNothing);
    expect(find.text('0'), findsNothing);
  });
  testWidgets(
    'refresh recovers data without repeating identity or staff fetch',
    (tester) async {
      final api = DashboardUiApi()..error = StateError('Local failure');
      await pumpHome(tester, api);
      api.error = null;
      await tester.tap(find.byIcon(Icons.refresh));
      await tester.pumpAndSettle();
      count('Establishments', '2');
      expect(api.identityCalls, 1);
      expect(api.staffCalls, 2);
      expect(api.complaintCalls, 2);
    },
  );
  testWidgets('dashboard 401 follows existing session expiry', (tester) async {
    var expired = 0;
    await pumpHome(
      tester,
      DashboardUiApi()
        ..error = const ApiException(statusCode: 401, message: 'Local expired'),
      onExpired: () => expired++,
    );
    expect(expired, 1);
  });
  testWidgets(
    'narrow phone layout and pull-to-refresh keep the same four tiles',
    (tester) async {
      final api = DashboardUiApi()..empty = true;
      await pumpHome(tester, api);
      tester.view.physicalSize = const Size(360, 800);
      await tester.pumpAndSettle();
      final left = tester.getTopLeft(tile('Establishments'));
      final right = tester.getTopLeft(tile('Due for inspection'));
      expect(left.dy, right.dy);
      expect(left.dx, lessThan(right.dx));
      expect(
        tester.getTopLeft(tile('New complaints')).dy,
        greaterThan(left.dy),
      );
      await tester.drag(find.byType(ListView).first, const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(api.staffCalls, 2);
      expect(api.identityCalls, 1);
      count('Establishments', '0');
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('bell still opens existing notifications', (tester) async {
    await pumpHome(tester, DashboardUiApi());
    await tester.tap(find.byIcon(Icons.notifications_outlined));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationPage), findsOneWidget);
  });
}
