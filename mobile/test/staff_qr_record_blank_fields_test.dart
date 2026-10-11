// The staff QR portal's record card and edit sheet. A bare `??` only catches a
// missing (null) field; the server sends '' for a field left empty, and that
// used to show as a bare ", " under Region / Province. The fallbacks were also
// made-up places ("Region VII, Cebu" for a Mauban visitor). Now a blank or
// missing place is not shown, never replaced with another one.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const madeUpPlaces = [
  'Region VII',
  'Cebu',
  'Region IV-A',
  'Cagbalete Swimmingan',
  'Cagbalete Island Resort',
];

Map<String, dynamic> record([Map<String, dynamic> over = const {}]) => {
  'survey_id': 'SURV-TEST-001',
  'full_name': 'sample person',
  'email': 'sample@example.test',
  'contact_number': '09000000000',
  'country_name': 'Philippines',
  'region_name': 'CALABARZON Region',
  'province_name': 'Quezon',
  'resort_name': 'Sample Beach 1',
  'itinerary_name': 'Overnight',
  'travel_mode_name': 'Private Vehicle',
  'boat_type_name': 'Tourist Boat',
  'visit_purpose_name': 'Leisure',
  'arrival_date': '2026-10-12',
  'total_visitors': 2,
  'status': 'arrived',
  ...over,
};

/// A copy of [record] with these keys removed entirely (null when read).
Map<String, dynamic> without(List<String> keys) =>
    record()..removeWhere((k, _) => keys.contains(k));

Future<void> pump(WidgetTester tester, Widget child) async {
  tester.view.physicalSize = const Size(411, 6000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    if (details.exceptionAsString().contains('overflowed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);

  // A fresh tree each time: the sheets copy the record in initState.
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
  await tester.pump();
}

Future<void> pumpCard(WidgetTester tester, Map<String, dynamic> data) => pump(
  tester,
  ScannedTouristRecordSheet(
    recordData: data,
    api: const TourismApi(),
    bootstrap: MobileBootstrap.fallback(),
  ),
);

Future<void> pumpEdit(WidgetTester tester, Map<String, dynamic> data) => pump(
  tester,
  EditTouristRecordSheet(
    recordData: data,
    bootstrap: MobileBootstrap.fallback(),
  ),
);

void expectNoMadeUpPlaces() {
  for (final place in madeUpPlaces) {
    expect(find.textContaining(place), findsNothing, reason: place);
  }
}

void expectNoBareComma() {
  expect(find.text(', '), findsNothing);
  expect(find.text(','), findsNothing);
  final texts = find.byType(Text).evaluate().map((e) => (e.widget as Text).data);
  for (final t in texts.whereType<String>()) {
    expect(t.startsWith(','), isFalse, reason: '"$t" starts with a comma');
    expect(t.trim().endsWith(','), isFalse, reason: '"$t" ends with a comma');
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('record card', () {
    testWidgets('a normal record shows its region, province and place', (
      tester,
    ) async {
      await pumpCard(tester, record());

      expect(find.text('CALABARZON Region, Quezon'), findsOneWidget);
      expect(find.text('Sample Beach 1'), findsOneWidget);
      expect(find.text('Overnight'), findsOneWidget);
      expect(find.text('Boat Type'), findsOneWidget);
      expectNoMadeUpPlaces();
    });

    testWidgets('blank region and province: no line, no bare comma, no Cebu', (
      tester,
    ) async {
      await pumpCard(
        tester,
        record({'region_name': '', 'province_name': '   '}),
      );

      expect(find.text('Region / Province'), findsNothing);
      expectNoBareComma();
      expectNoMadeUpPlaces();
    });

    testWidgets('missing (null) region and province: no line either', (
      tester,
    ) async {
      await pumpCard(tester, without(['region_name', 'province_name']));

      expect(find.text('Region / Province'), findsNothing);
      expectNoBareComma();
      expectNoMadeUpPlaces();
    });

    testWidgets('only one of region and province: that one, with no comma', (
      tester,
    ) async {
      await pumpCard(
        tester,
        record({'region_name': '', 'province_name': 'Quezon'}),
      );
      expect(find.text('Quezon'), findsOneWidget);
      expectNoBareComma();

      await pumpCard(
        tester,
        record({'region_name': 'CALABARZON Region', 'province_name': null}),
      );
      expect(find.text('CALABARZON Region'), findsOneWidget);
      expectNoBareComma();
    });

    testWidgets('blank resort and country are not replaced by another place', (
      tester,
    ) async {
      await pumpCard(tester, record({'resort_name': ' ', 'country_name': ''}));

      expect(find.text('Resort'), findsNothing);
      expect(find.text('Country'), findsNothing);
      expectNoMadeUpPlaces();
    });

    testWidgets('blank itinerary, boat, travel mode and purpose: not shown', (
      tester,
    ) async {
      await pumpCard(
        tester,
        record({
          'itinerary_name': '',
          'boat_type_name': '  ',
          'travel_mode_name': '',
          'visit_purpose_name': '',
        }),
      );

      for (final label in [
        'Itinerary',
        'Boat Type',
        'Travel Mode',
        'Visit Purpose',
      ]) {
        expect(find.text(label), findsNothing, reason: label);
      }
      // ...and are not invented for a null either.
      await pumpCard(
        tester,
        without([
          'itinerary_name',
          'boat_type_name',
          'travel_mode_name',
          'visit_purpose_name',
        ]),
      );
      expect(find.text('Itinerary'), findsNothing);
      expect(find.text('Same Day'), findsNothing);
      expect(find.text('Tourist Boat'), findsNothing);
    });

    testWidgets('a blank name is an empty line, not a made-up one', (
      tester,
    ) async {
      await pumpCard(tester, record({'full_name': '   '}));
      expect(find.text('Tourist'), findsNothing);
      expect(find.text('Sample Person'), findsNothing);
      expectNoBareComma();

      await pumpCard(tester, record({'full_name': 'juan dela cruz'}));
      expect(find.text('Juan Dela Cruz'), findsOneWidget);
    });
  });

  group('edit sheet', () {
    testWidgets('a normal record shows its places', (tester) async {
      await pumpEdit(tester, record());

      expect(find.text('CALABARZON Region'), findsOneWidget);
      expect(find.text('Quezon'), findsOneWidget);
      expect(find.text('Sample Beach 1'), findsOneWidget);
      expectNoMadeUpPlaces();
    });

    testWidgets('blank or missing places are not filled in', (tester) async {
      await pumpEdit(
        tester,
        record({
          'region_name': '',
          'province_name': null,
          'resort_name': '  ',
          'country_name': '',
        }),
      );

      for (final label in ['REGION', 'PROVINCE', 'RESORT', 'COUNTRY']) {
        expect(find.text(label), findsNothing, reason: label);
      }
      expect(find.text('Quezon'), findsNothing);
      expect(find.text('Philippines'), findsNothing);
      expectNoMadeUpPlaces();
    });

    testWidgets('blank trip details are not filled in', (tester) async {
      await pumpEdit(
        tester,
        record({
          'itinerary_name': '',
          'visit_purpose_name': ' ',
          'travel_mode_name': '',
          'boat_type_name': '',
        }),
      );

      for (final label in [
        'ITINERARY',
        'VISIT PURPOSE',
        'TRAVEL MODE',
        'BOAT TYPE',
      ]) {
        expect(find.text(label), findsNothing, reason: label);
      }
    });
  });

  group('presentText', () {
    test('null, empty and spaces are null; text is trimmed', () {
      expect(presentText(null), isNull);
      expect(presentText(''), isNull);
      expect(presentText('   \t'), isNull);
      expect(presentText(' Quezon '), 'Quezon');
      expect(presentText(7), '7');
    });
  });
}
