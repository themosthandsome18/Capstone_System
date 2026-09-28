// The public Community Report form.
//
// The client does not act on anonymous reports, so a name and a Philippine
// mobile number are required and there is no anonymous option. Urgency comes
// from the chosen category and cannot be picked by the reporter.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeReportApi extends TourismApi {
  final List<Map<String, Object?>> calls = [];

  @override
  Future<Map<String, dynamic>> submitSanitationReport({
    required String name,
    required String contactNumber,
    required String category,
    required String priority,
    required String barangay,
    required String locationAddress,
    required String description,
    List<XFile> photos = const [],
    required String latitude,
    required String longitude,
    String clientSubmissionId = '',
  }) async {
    calls.add({
      'name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
      'location_address': locationAddress,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
    });
    return {
      'complaint_id': 'SAN-TEST-0001',
      'category': category,
      'barangay': barangay,
      'status': 'pending',
      'priority': priority,
    };
  }
}

const barangays = [
  BarangayItem(id: 1, name: 'Daungan'),
  BarangayItem(id: 2, name: 'Poblacion'),
];

Future<FakeReportApi> pumpForm(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 7000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final api = FakeReportApi();
  await tester.pumpWidget(
    MaterialApp(home: SanitationReportPage(api: api, barangays: barangays)),
  );
  await tester.pumpAndSettle();
  // The scope guide still opens once on arrival; close it.
  if (find.byType(Dialog).evaluate().isNotEmpty) {
    await tester.tap(find.descendant(of: find.byType(Dialog), matching: find.byIcon(Icons.close)));
    await tester.pumpAndSettle();
  }
  return api;
}

Future<void> enter(WidgetTester tester, String label, String text) async {
  await tester.enterText(find.widgetWithText(TextField, label), text);
  await tester.pump();
}

Future<void> fillEverything(WidgetTester tester) async {
  await tester.tap(find.text('Severe Sewage Overflow'));
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('barangay-field')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Daungan').last);
  await tester.pumpAndSettle();
  await enter(tester, 'Location / Address *', 'Corner of Rizal St.');
  await enter(tester, 'Describe what you saw *', 'The septic tank is overflowing.');
  await enter(tester, 'Name *', 'juana dela cruz');
  await enter(tester, 'Contact no. *', '0917 123 4567');
  await tester.tap(find.byKey(const ValueKey('community-report-consent')));
  await tester.pump();
}

Future<void> submit(WidgetTester tester) async {
  await tester.tap(find.text('Submit report'));
  // The success dialog animates, so pump a fixed time instead of settling.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('pure helpers', () {
    test('PH mobile numbers: digits only, +63 folded to 0, 09XXXXXXXXX', () {
      expect(isValidPhMobileNumber('09171234567'), isTrue);
      expect(isValidPhMobileNumber('0917 123 4567'), isTrue);
      expect(isValidPhMobileNumber('+63 917 123 4567'), isTrue);
      expect(isValidPhMobileNumber('0817 123 4567'), isFalse);
      expect(isValidPhMobileNumber('0917123456'), isFalse);
      expect(isValidPhMobileNumber(''), isFalse);
    });

    test('urgency comes from the category', () {
      expect(
        communityReportUrgencyBadge('Severe Sewage Overflow'),
        'Urgent · set automatically by category (24–48 hours)',
      );
      expect(
        communityReportUrgencyBadge('Improper Garbage Disposal'),
        'Standard · set automatically by category (3–5 days)',
      );
      expect(
        communityReportUrgencyBadge('Other Sanitation Concern'),
        'Low · set automatically by category (5–7 days)',
      );
    });

    test('staff see the typed location next to the barangay', () {
      final item = SanitationComplaintItem.fromJson({
        'complaint_id': 'SAN-1',
        'barangay': 'Daungan',
        'location_address': 'Corner of Rizal St.',
      });
      expect(complaintLocationLine(item), 'Daungan · Corner of Rizal St.');
      expect(
        complaintLocationLine(SanitationComplaintItem.fromJson({'barangay': 'Daungan'})),
        'Daungan',
      );
    });
  });

  testWidgets('layout: header, category chips, no anonymous option, no raw coordinates',
      (tester) async {
    await pumpForm(tester);

    expect(find.text('Report an unsanitary condition'), findsOneWidget);
    expect(find.text("What's covered?"), findsOneWidget);
    expect(find.text('What are you reporting? *'), findsOneWidget);
    for (final category in sanitationReportCategories) {
      expect(find.widgetWithText(ChoiceChip, category), findsOneWidget, reason: category);
    }
    expect(find.textContaining('without name'), findsNothing);
    expect(find.textContaining('nonymous'), findsNothing);
    expect(find.text('Latitude'), findsNothing);
    expect(find.text('Longitude'), findsNothing);
    expect(find.text('Urgency'), findsNothing);
    expect(find.text('Take photo'), findsOneWidget);
    expect(find.text('Upload'), findsOneWidget);
    expect(find.text('Photos (up to 5)'), findsOneWidget);
    expect(find.text('5 reports left today'), findsOneWidget);
    // Public reporters have no drafts screen, so there is no Save Draft here.
    expect(find.text('Save as draft'), findsNothing);
  });

  testWidgets('the urgency badge follows the chosen category', (tester) async {
    await pumpForm(tester);

    await tester.tap(find.text('Severe Sewage Overflow'));
    await tester.pump();
    expect(find.text('Urgent · set automatically by category (24–48 hours)'), findsOneWidget);

    await tester.tap(find.text('Improper Garbage Disposal'));
    await tester.pump();
    expect(find.text('Standard · set automatically by category (3–5 days)'), findsOneWidget);
    expect(find.textContaining('24–48 hours'), findsNothing);
  });

  testWidgets('submit is blocked until every required field is filled', (tester) async {
    final api = await pumpForm(tester);

    await submit(tester);
    expect(api.calls, isEmpty);

    await fillEverything(tester);
    await enter(tester, 'Name *', '');
    await submit(tester);
    expect(api.calls, isEmpty);

    await enter(tester, 'Name *', 'Juana');
    await enter(tester, 'Contact no. *', '12345');
    await submit(tester);
    expect(api.calls, isEmpty);
  });

  testWidgets('a complete report sends the name, contact and derived urgency', (tester) async {
    final api = await pumpForm(tester);

    await fillEverything(tester);
    await submit(tester);

    expect(api.calls, hasLength(1));
    final payload = api.calls.single;
    expect(payload['name'], 'Juana Dela Cruz');
    expect(payload['contact_number'], '09171234567');
    expect(payload['category'], 'Severe Sewage Overflow');
    expect(payload['priority'], 'high');
    expect(payload['barangay'], 'Daungan');
    expect(payload['location_address'], 'Corner of Rizal St.');
    expect(payload['description'], 'The septic tank is overflowing.');
  });
}
