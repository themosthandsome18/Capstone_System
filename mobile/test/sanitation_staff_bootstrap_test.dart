// Staff records come from the signed-in staff-bootstrap endpoint.
//
// The public sanitation bootstrap no longer carries establishments, owners,
// complaints, households or inspectors. After a staff sign-in (and on every
// refresh) the app loads them with the staff token and layers them over the
// public data, which still supplies business types and barangays. A rejected
// token must end in a clear message, never a crash.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

final publicTypes = [
  SanitationBusinessType(
    id: 8,
    name: 'Water Refilling Station',
    inspectionFrequency: 'monthly',
    requirements: const [],
  ),
];

const publicBarangays = [BarangayItem(id: 1, name: 'Daungan')];

SanitationBootstrap publicBootstrap() {
  return SanitationBootstrap(
    businessTypes: publicTypes,
    establishments: const [],
    inspections: const [],
    complaints: const [],
    householdRecords: const [],
    barangays: publicBarangays,
    notifications: const [],
  );
}

final Map<String, dynamic> staffJson = {
  'establishments': [
    {'id': 11, 'business_name': 'Aqua Station', 'business_type': 8, 'owner_name': 'Owner'},
    {'id': 12, 'business_name': 'Fishball Cart', 'business_type': 8},
  ],
  'inspections': [
    {'id': 21, 'establishment': 11, 'establishment_name': 'Aqua Station'},
  ],
  'complaintData': {
    'summary': {'total': 1, 'pending': 1, 'open': 1},
    'rows': [
      {'id': 31, 'complaint_id': 'SAN-0031', 'category': 'Water', 'barangay': 'Daungan'},
    ],
  },
  'householdRecords': [
    {'id': 41, 'household_code': 'HH-0041', 'household_head': 'Head'},
  ],
  'notifications': [
    {'id': 'complaint-SAN-0031', 'title': 'Water', 'message': 'Daungan - Pending'},
  ],
};

class FakeStaffApi extends TourismApi {
  FakeStaffApi({this.staff, this.error});

  final Map<String, dynamic>? staff;
  final Object? error;
  int calls = 0;

  @override
  Future<Map<String, dynamic>> fetchSanitationStaffRecords() async {
    calls++;
    if (error != null) throw error!;
    return staff ?? const {};
  }
}

Future<void> pumpShell(
  WidgetTester tester,
  FakeStaffApi api, {
  VoidCallback? onSessionExpired,
}) async {
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: SanitationMobileShell(
        api: api,
        bootstrap: publicBootstrap(),
        onRefresh: () async => publicBootstrap(),
        onSessionExpired: onSessionExpired,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('mergeSanitationStaffRecords', () {
    test('takes staff records and keeps public business types and barangays', () {
      final merged = mergeSanitationStaffRecords(publicBootstrap(), staffJson);

      expect(merged.establishments.map((item) => item.id), [11, 12]);
      expect(merged.inspections, hasLength(1));
      expect(merged.complaints.single.reference, 'SAN-0031');
      expect(merged.householdRecords, hasLength(1));
      expect(merged.notifications.single.id, 'complaint-SAN-0031');
      expect(merged.businessTypes.single.name, 'Water Refilling Station');
      expect(merged.barangays.single.name, 'Daungan');
      expect(merged.isOffline, isFalse);
    });

    test('missing staff keys become empty lists, not a crash', () {
      final merged = mergeSanitationStaffRecords(publicBootstrap(), const {});

      expect(merged.establishments, isEmpty);
      expect(merged.complaints, isEmpty);
      expect(merged.businessTypes, hasLength(1));
    });
  });

  group('staff shell', () {
    testWidgets('loads staff records with the token after sign-in', (tester) async {
      final api = FakeStaffApi(staff: staffJson);
      await pumpShell(tester, api);

      expect(api.calls, 1);
      expect(find.text('2 establishment records loaded.'), findsOneWidget);
    });

    testWidgets('a rejected token ends the session instead of crashing', (tester) async {
      var expired = false;
      final api = FakeStaffApi(
        error: const ApiException(statusCode: 401, message: 'Invalid token.'),
      );
      await pumpShell(tester, api, onSessionExpired: () => expired = true);

      expect(tester.takeException(), isNull);
      expect(expired, isTrue);
    });

    testWidgets('a rejected token without a handler shows a clear message', (tester) async {
      final api = FakeStaffApi(
        error: const ApiException(statusCode: 401, message: 'Invalid token.'),
      );
      await pumpShell(tester, api);

      expect(tester.takeException(), isNull);
      expect(find.text('Your session expired, please sign in again.'), findsOneWidget);
    });

    testWidgets('an account without sanitation access is told so', (tester) async {
      final api = FakeStaffApi(
        error: const ApiException(statusCode: 403, message: 'No access.'),
      );
      await pumpShell(tester, api);

      expect(tester.takeException(), isNull);
      expect(
        find.text('This account cannot load sanitation records.'),
        findsOneWidget,
      );
    });
  });
}
