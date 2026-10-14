// A foreign visitor is not asked for a region or province, and none is sent.
// The server already allows a foreign record without them
// (country_requires_location in backend/api/models.py): only a country typed
// "foreign" may leave them empty; local, untyped or unknown keeps them
// required. The payload is checked through a mocked HTTP client: nothing is
// sent to a real backend.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

MobileBootstrap bootstrap({List<Map<String, Object?>>? countries}) {
  return MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 7, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': {
      'countries':
          countries ??
          [
            {'id': 1, 'name': 'Philippines', 'type': 'local'},
            {'id': 2, 'name': 'United States', 'type': 'foreign'},
            {'id': 6, 'name': 'International', 'type': 'foreign'},
          ],
      'regions': [
        {'id': 4, 'name': 'CALABARZON Region'},
        {'id': 7, 'name': 'Region VII'},
      ],
      'provinces': [
        {'id': 1, 'name': 'Quezon', 'region_id': 4},
        {'id': 9, 'name': 'Cebu', 'region_id': 7},
        {'id': 10, 'name': 'Bohol', 'region_id': 7},
      ],
      'boatTypes': [
        {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': true},
      ],
    },
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
}

Future<void> pumpForm(WidgetTester tester, MobileBootstrap b) async {
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

  await tester.pumpWidget(
    MaterialApp(
      home: TouristRegistrationPage(
        api: const TourismApi(),
        bootstrap: b,
        // The Destination field starts blank unless a resort was tapped; these
        // tests are about other fields, so they open the form as if one was.
        initialDestination: b.destinations.first,
      ),
    ),
  );
  await tester.pump();
}

Finder tile(String label) => find.byWidgetPredicate(
  (w) => w is DropdownTile<RefItem> && w.label == label,
);

Future<void> choose(WidgetTester tester, String label, String name) async {
  await tester.ensureVisible(tile(label));
  await tester.tap(
    find.descendant(
      of: tile(label),
      matching: find.byType(DropdownButtonFormField<RefItem>),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

bool locationShown() =>
    tile('Region *').evaluate().isNotEmpty &&
    tile('Province *').evaluate().isNotEmpty;

String selected(WidgetTester tester, String label) =>
    tester.widget<DropdownTile<RefItem>>(tile(label)).value.name;

String originText(WidgetTester tester) => tester
    .widget<TextField>(find.widgetWithText(TextField, 'Country of origin *'))
    .controller!
    .text;

Future<void> setOrigin(WidgetTester tester, String text) => tester.enterText(
  find.widgetWithText(TextField, 'Country of origin *'),
  text,
);

Future<Map<String, dynamic>> submit(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
  await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
  await tester.enterText(
    find.widgetWithText(TextField, 'Contact number *'),
    '09000000000',
  );
  final bodies = <Map<String, dynamic>>[];
  final button = find.text('Submit Registration');
  await tester.ensureVisible(button);
  await http.runWithClient(
    () async {
      await tester.tap(button);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    },
    () => MockClient((request) async {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response('{"survey_id":"SURV-TEST-1"}', 201);
    }),
  );
  expect(bodies, hasLength(1), reason: 'the form was not submitted');
  return bodies.single;
}

void main() {
  test('only a country typed "foreign" may leave the location out', () {
    expect(
      countryRequiresLocation(const RefItem(id: 1, name: 'P', type: 'local')),
      isTrue,
    );
    expect(
      countryRequiresLocation(const RefItem(id: 2, name: 'U', type: 'foreign')),
      isFalse,
    );
    // Untyped or unknown: required, the way the backend treats it.
    expect(countryRequiresLocation(const RefItem(id: 3, name: 'X')), isTrue);
    expect(
      countryRequiresLocation(const RefItem(id: 3, name: 'X', type: 'island')),
      isTrue,
    );
    expect(countryRequiresLocation(null), isTrue);
    expect(RefItem.fromJson({'id': 2, 'name': 'U', 'type': 'foreign'}).type, 'foreign');
  });

  testWidgets('Philippines: region and province are asked for and sent', (
    tester,
  ) async {
    await pumpForm(tester, bootstrap());

    expect(locationShown(), isTrue);
    expect(selected(tester, 'Region *'), 'CALABARZON Region');
    expect(selected(tester, 'Province *'), 'Quezon');

    final body = await submit(tester);
    expect(body['country_id'], 1);
    expect(body['region_id'], 4);
    expect(body['province_id'], 1);
    expect(body['country_of_origin'], 'Philippines');
  });

  testWidgets('a foreign country: no region, no province, none sent', (
    tester,
  ) async {
    await pumpForm(tester, bootstrap());
    await choose(tester, 'Country *', 'United States');

    expect(locationShown(), isFalse);
    // The autofilled "Philippines" is not this visitor's origin.
    expect(originText(tester), '');
    await setOrigin(tester, 'United States');

    final body = await submit(tester);
    expect(body['country_id'], 2);
    expect(body.containsKey('region_id'), isFalse);
    expect(body.containsKey('province_id'), isFalse);
    expect(body['country_of_origin'], 'United States');
  });

  testWidgets('foreign, then back to the Philippines: required again', (
    tester,
  ) async {
    await pumpForm(tester, bootstrap());
    await choose(tester, 'Country *', 'United States');
    expect(locationShown(), isFalse);

    await choose(tester, 'Country *', 'Philippines');

    expect(locationShown(), isTrue);
    expect(selected(tester, 'Region *'), 'CALABARZON Region');
    expect(selected(tester, 'Province *'), 'Quezon');
    expect(originText(tester), 'Philippines');

    final body = await submit(tester);
    expect(body['country_id'], 1);
    expect(body['region_id'], 4);
    expect(body['province_id'], 1);
  });

  testWidgets('local, then foreign, then local: what was chosen comes back', (
    tester,
  ) async {
    await pumpForm(tester, bootstrap());
    await choose(tester, 'Region *', 'Region VII');
    expect(selected(tester, 'Province *'), 'Cebu');

    await choose(tester, 'Country *', 'United States');
    expect(locationShown(), isFalse);
    await choose(tester, 'Country *', 'Philippines');

    expect(selected(tester, 'Region *'), 'Region VII');
    expect(selected(tester, 'Province *'), 'Cebu');
  });

  testWidgets('a province picked by hand is restored too, not the default', (
    tester,
  ) async {
    await pumpForm(tester, bootstrap());
    await choose(tester, 'Region *', 'Region VII');
    await choose(tester, 'Province *', 'Bohol');
    expect(selected(tester, 'Province *'), 'Bohol');

    await choose(tester, 'Country *', 'United States');
    await choose(tester, 'Country *', 'Philippines');

    expect(selected(tester, 'Region *'), 'Region VII');
    expect(selected(tester, 'Province *'), 'Bohol');
  });

  testWidgets('foreign, local, foreign: gone again and still not sent', (
    tester,
  ) async {
    await pumpForm(tester, bootstrap());
    await choose(tester, 'Country *', 'United States');
    await choose(tester, 'Country *', 'Philippines');
    await choose(tester, 'Country *', 'International');

    expect(locationShown(), isFalse);
    await setOrigin(tester, 'Somewhere');

    final body = await submit(tester);
    expect(body['country_id'], 6);
    expect(body.containsKey('region_id'), isFalse);
    expect(body.containsKey('province_id'), isFalse);
  });

  testWidgets('a country with no type keeps them required', (tester) async {
    await pumpForm(
      tester,
      bootstrap(
        countries: [
          {'id': 1, 'name': 'Philippines'},
          {'id': 2, 'name': 'Elsewhere'},
        ],
      ),
    );
    await choose(tester, 'Country *', 'Elsewhere');

    expect(locationShown(), isTrue);
    await setOrigin(tester, 'Elsewhere');
    final body = await submit(tester);
    expect(body['region_id'], 4);
    expect(body['province_id'], 1);
  });

  testWidgets('a first country that is foreign starts without them', (
    tester,
  ) async {
    await pumpForm(
      tester,
      bootstrap(
        countries: [
          {'id': 2, 'name': 'United States', 'type': 'foreign'},
          {'id': 1, 'name': 'Philippines', 'type': 'local'},
        ],
      ),
    );

    expect(locationShown(), isFalse);
    await choose(tester, 'Country *', 'Philippines');
    expect(locationShown(), isTrue);
    expect(selected(tester, 'Region *'), 'CALABARZON Region');
  });
}
