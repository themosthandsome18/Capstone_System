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
    required String description,
    List<XFile> photos = const [],
    required String latitude,
    required String longitude,
  }) async {
    calls.add({
      'name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
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
  await tester.tap(find.text('Piliin ang barangay'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Daungan').last);
  await tester.pumpAndSettle();
  await enter(tester, 'Lokasyon / Address *', 'Kanto ng Rizal St.');
  await enter(tester, 'Ilarawan ang nakita mo *', 'Umaapaw ang poso negro.');
  await enter(tester, 'Pangalan *', 'juana dela cruz');
  await enter(tester, 'Contact no. *', '0917 123 4567');
  await tester.tap(find.byKey(const ValueKey('community-report-consent')));
  await tester.pump();
}

Future<void> submit(WidgetTester tester) async {
  await tester.tap(find.text('Isumite ang Report'));
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
        'Urgent · awtomatiko batay sa category (24–48 oras)',
      );
      expect(
        communityReportUrgencyBadge('Improper Garbage Disposal'),
        'Standard · awtomatiko batay sa category (3–5 araw)',
      );
      expect(
        communityReportUrgencyBadge('Other Sanitation Concern'),
        'Low · awtomatiko batay sa category (5–7 araw)',
      );
    });

    test('the typed location is kept with the description', () {
      expect(
        buildCommunityReportDescription('Kanto ng Rizal St.', 'Umaapaw.'),
        'Lokasyon: Kanto ng Rizal St.\n\nUmaapaw.',
      );
      expect(buildCommunityReportDescription('', 'Umaapaw.'), 'Umaapaw.');
    });
  });

  testWidgets('layout: header, category chips, no anonymous option, no raw coordinates',
      (tester) async {
    await pumpForm(tester);

    expect(find.text('I-report ang maruming kondisyon'), findsOneWidget);
    expect(find.text('Ano ang sakop?'), findsOneWidget);
    expect(find.text('Ano ang ire-report mo? *'), findsOneWidget);
    for (final category in sanitationReportCategories) {
      expect(find.widgetWithText(ChoiceChip, category), findsOneWidget, reason: category);
    }
    expect(find.textContaining('without name'), findsNothing);
    expect(find.textContaining('nonymous'), findsNothing);
    expect(find.text('Latitude'), findsNothing);
    expect(find.text('Longitude'), findsNothing);
    expect(find.text('Urgency'), findsNothing);
    expect(find.text('Kumuha ng litrato'), findsOneWidget);
    expect(find.text('Mag-upload'), findsOneWidget);
    expect(find.text('Litrato (hanggang 5)'), findsOneWidget);
    expect(find.text('5 na lang ang natitirang report ngayong araw'), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'I-save bilang draft'), findsOneWidget);
  });

  testWidgets('the urgency badge follows the chosen category', (tester) async {
    await pumpForm(tester);

    await tester.tap(find.text('Severe Sewage Overflow'));
    await tester.pump();
    expect(find.text('Urgent · awtomatiko batay sa category (24–48 oras)'), findsOneWidget);

    await tester.tap(find.text('Improper Garbage Disposal'));
    await tester.pump();
    expect(find.text('Standard · awtomatiko batay sa category (3–5 araw)'), findsOneWidget);
    expect(find.textContaining('24–48 oras'), findsNothing);
  });

  testWidgets('submit is blocked until every required field is filled', (tester) async {
    final api = await pumpForm(tester);

    await submit(tester);
    expect(api.calls, isEmpty);

    await fillEverything(tester);
    await enter(tester, 'Pangalan *', '');
    await submit(tester);
    expect(api.calls, isEmpty);

    await enter(tester, 'Pangalan *', 'Juana');
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
    expect(payload['description'], 'Lokasyon: Kanto ng Rizal St.\n\nUmaapaw ang poso negro.');
  });
}
