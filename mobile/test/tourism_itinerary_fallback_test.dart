// The registration form's itinerary. It used to fall back to three made-up items (ids 2, 1, 3) when the server sent none; an id that is only
// "the live one today" is a guess, so the form now offers what the server sent, and when the server sent none it says so and registers nothing
// (see registration_no_invented_ids_test.dart). What is left to hold here: the server's list is used as it is, and the offline bootstrap has none.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

import 'support/reference_tables.dart';

MobileBootstrap bootstrapWithItineraries(List<Map<String, Object>> itineraries) {
  return MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 1, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': fixtureReferenceTables({'itineraries': itineraries}),
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
}

Future<DropdownTile<RefItem>> itineraryTile(WidgetTester tester, MobileBootstrap bootstrap) async {
  tester.view.physicalSize = const Size(411, 5000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    if (details.exceptionAsString().contains('overflowed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);

  await tester.pumpWidget(MaterialApp(home: TouristRegistrationPage(api: const TourismApi(), bootstrap: bootstrap)));
  await tester.pump();
  return tester.widget<DropdownTile<RefItem>>(
    find.byWidgetPredicate((w) => w is DropdownTile<RefItem> && w.label == 'Length of Stay *'),
  );
}

List<(int, String)> pairs(List<RefItem> items) => [for (final i in items) (i.id, i.name)];

void main() {
  test('the offline bootstrap has no itineraries: no id is written in the app', () {
    expect(MobileBootstrap.fallback().itineraries, isEmpty);
  });

  testWidgets('itineraries from the server are used as they are', (tester) async {
    final tile = await itineraryTile(
      tester,
      bootstrapWithItineraries([
        {'id': 1, 'name': 'Overnight'},
        {'id': 2, 'name': 'Same Day'},
        {'id': 4, 'name': '3 Nights'},
      ]),
    );

    expect(pairs(tile.items), [(1, 'Overnight'), (2, 'Same Day'), (4, '3 Nights')]);
    expect(tile.value.id, 1);
  });
}
