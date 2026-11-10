// The log of the staff QR scanner is called what it holds: the visitors THIS account took in ("My Check-ins"), not a list of the resort. Its title, its count,
// its search box and its empty state say so, and nothing on the screen speaks of a list of a resort. Synthetic data only.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RecordingApi extends ListApi {
  RecordingApi(super.records);
  final List<({String? search, int? resortId})> calls = [];

  @override
  Future<List<Map<String, dynamic>>> fetchTouristRecordHistory({String? search, int? resortId}) async {
    calls.add((search: search, resortId: resortId));
    return super.fetchTouristRecordHistory(search: search, resortId: resortId);
  }
}

Future<void> pumpLogWith(WidgetTester tester, TourismApi api) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(411, 1200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(MaterialApp(home: TouristHistoryLogScreen(api: api, bootstrap: MobileBootstrap.fallback())));
  await tester.pumpAndSettle();
}

class ListApi extends TourismApi {
  ListApi(this.records);
  final List<Map<String, dynamic>> records;

  @override
  Future<List<Map<String, dynamic>>> fetchTouristRecordHistory({String? search, int? resortId}) async => records;
}

Map<String, dynamic> row(String id, String name, {String resort = 'Sample Beach 1'}) => {
  'survey_id': id,
  'full_name': name,
  'resort_name': resort,
  'arrival_date': '2026-10-12',
  'total_visitors': 2,
  'status': 'arrived',
};

Future<void> pumpLog(WidgetTester tester, List<Map<String, dynamic>> records, {String? kept}) async {
  SharedPreferences.setMockInitialValues({staffAuthRoleKey: ?kept});
  tester.view.physicalSize = const Size(411, 1200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(MaterialApp(home: TouristHistoryLogScreen(api: ListApi(records), bootstrap: MobileBootstrap.fallback())));
  await tester.pumpAndSettle();
}

String hint(WidgetTester tester) => tester.widget<TextField>(find.byType(TextField)).decoration!.hintText!;

const old = [
  'Tourist History Log',
  'record(s) loaded',
  'Search by Survey ID, name, or resort',
  'No Checked-In Records Yet',
  'No matching records',
  'arrival logs will appear here in real-time',
];

void expectNoOldWords(WidgetTester tester) {
  for (final words in old) {
    expect(find.textContaining(words), findsNothing, reason: words);
  }
  expect(tester.widget<TextField>(find.byType(TextField)).decoration!.hintText, isNot(contains('resort')));
}

void main() {
  testWidgets('the title is "My Check-ins"', (tester) async {
    await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz')]);
    expect(find.text('My Check-ins'), findsOneWidget);
    expectNoOldWords(tester);
  });

  testWidgets('the line under the title: "N check-ins", and "1 check-in" for one', (tester) async {
    await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz')]);
    expect(find.text('1 check-in'), findsOneWidget);
    expect(find.text('1 check-ins'), findsNothing);

    await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz'), row('SURV-TEST-002', 'Maria Santos'), row('SURV-TEST-003', 'Pedro Reyes')]);
    expect(find.text('3 check-ins'), findsOneWidget);

    await pumpLog(tester, []);
    expect(find.text('0 check-ins'), findsOneWidget);
  });

  test('the sentence of the count', () {
    expect(myCheckInsCount(0), '0 check-ins');
    expect(myCheckInsCount(1), '1 check-in');
    expect(myCheckInsCount(2), '2 check-ins');
    expect(myCheckInsCount(40), '40 check-ins');
  });

  testWidgets('the search box says "Search by Survey ID or name"', (tester) async {
    await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz')]);
    expect(hint(tester), 'Search by Survey ID or name');
  });

  testWidgets('with nothing in it: "No check-ins yet." and "Visitors you take in will appear here."', (tester) async {
    await pumpLog(tester, []);
    expect(find.text('No check-ins yet.'), findsOneWidget);
    expect(find.text('Visitors you take in will appear here.'), findsOneWidget);
    expectNoOldWords(tester);
  });

  testWidgets('a search with no match says so in the same words, and does not match a resort name', (tester) async {
    await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz', resort: 'Sample Beach 1')]);
    await tester.enterText(find.byType(TextField), 'Sample Beach');
    await tester.pump();
    expect(find.text('No matching check-ins'), findsOneWidget);
    expect(find.text('Try searching with a different Survey ID or name.'), findsOneWidget);
    expect(find.text('0 check-ins'), findsOneWidget);
    // ...while the name and the ID still find it
    await tester.enterText(find.byType(TextField), 'dela cruz');
    await tester.pump();
    expect(find.text('Juan Dela Cruz'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'TEST-001');
    await tester.pump();
    expect(find.text('Juan Dela Cruz'), findsOneWidget);
    expect(find.text('1 check-in'), findsOneWidget);
  });

  testWidgets('no text on the screen speaks of a list of a resort', (tester) async {
    for (final records in [<Map<String, dynamic>>[], [row('SURV-TEST-001', 'Juan Dela Cruz', resort: 'Sample Beach 1')]]) {
      await pumpLog(tester, records);
      final words = find.byType(Text).evaluate().map((e) => (e.widget as Text).data ?? '').where((t) => !t.contains('Sample Beach')).join('\n').toLowerCase();
      expect(words, isNot(contains('resort')));
      expect(words, isNot(contains('history')));
      expect(words, isNot(contains('record(s)')));
    }
  });

  testWidgets('the button on the main screen says "My Check-ins" too', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(411, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MaterialApp(home: TouristQrCheckInScreen(api: ListApi([]), bootstrap: MobileBootstrap.fallback())));
    await tester.pumpAndSettle();
    expect(find.text('My Check-ins'), findsOneWidget);
    expect(find.text('Tourist History Log'), findsNothing);
    await tester.tap(find.text('My Check-ins'));
    await tester.pumpAndSettle();
    expect(find.text('My Check-ins'), findsOneWidget); // now it is the title of the screen it opened
    expect(find.text('No check-ins yet.'), findsOneWidget);
  });

  group('Export is there for every role, because it carries only this person\'s check-ins', () {
    for (final role in ['admin', 'tourism', 'resort']) {
      testWidgets('My Check-ins: Export is there for $role', (tester) async {
        await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz')], kept: role);
        expect(find.text('My Check-ins'), findsOneWidget); // the fixture reached the case: the screen is drawn
        expect(find.text('Juan Dela Cruz'), findsOneWidget);
        expect(find.text('Export'), findsOneWidget);
        expect(find.byIcon(Icons.download), findsOneWidget);
      });

      testWidgets('from the main screen as $role: both Exports are there, and the log holds only what the server sent', (tester) async {
        SharedPreferences.setMockInitialValues({staffAuthRoleKey: role});
        tester.view.physicalSize = const Size(411, 1200);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(const SizedBox());
        await tester.pumpWidget(MaterialApp(home: TouristQrCheckInScreen(api: ListApi([]), bootstrap: MobileBootstrap.fallback())));
        await tester.pumpAndSettle();
        expect(find.text('Export / Download Records'), findsOneWidget);
        await tester.tap(find.text('My Check-ins'));
        await tester.pumpAndSettle();
        expect(find.text('No check-ins yet.'), findsOneWidget); // the screen it opened
        expect(find.text('Export'), findsOneWidget);
      });
    }

    testWidgets('it does not depend on what the sign-in kept', (tester) async {
      await pumpLog(tester, [row('SURV-TEST-001', 'Juan Dela Cruz')]);
      expect(find.text('Export'), findsOneWidget);
    });

    testWidgets('the export asks for the same list as the screen: the own check-ins, nothing wider', (tester) async {
      final api = RecordingApi([row('SURV-TEST-001', 'Juan Dela Cruz')]);
      await pumpLogWith(tester, api);
      expect(api.calls, isNotEmpty);
      for (final call in api.calls) {
        expect(call.resortId, isNull, reason: 'no resort is asked for: the server gives the own scans, whoever asks');
      }
    });
  });
}
