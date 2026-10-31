// The registration form's itinerary when the server sent none. It used to be a
// single made-up item: id 1 named "Day Tour" (id 1 is "Overnight", and "Day
// Tour" is now "Same Day"). It is now the three live itineraries.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

MobileBootstrap bootstrapWithItineraries(List<Map<String, Object>> itineraries) {
  return MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 1, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': {'itineraries': itineraries},
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
}

Future<DropdownTile<RefItem>> itineraryTile(
  WidgetTester tester,
  MobileBootstrap bootstrap,
) async {
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

  await tester.pumpWidget(
    MaterialApp(
      home: TouristRegistrationPage(
        api: const TourismApi(),
        bootstrap: bootstrap,
      ),
    ),
  );
  await tester.pump();
  return tester.widget<DropdownTile<RefItem>>(
    find.byWidgetPredicate(
      (w) => w is DropdownTile<RefItem> && w.label == 'Length of Stay *',
    ),
  );
}

List<(int, String)> pairs(List<RefItem> items) =>
    [for (final i in items) (i.id, i.name)];

void main() {
  test('the fallback is the three live itineraries, ids and names', () {
    expect(pairs(tourismItineraryFallback), [
      (2, 'Same Day'),
      (1, 'Overnight'),
      (3, '2 Nights'),
    ]);
    expect(
      tourismItineraryFallback.map((i) => i.name),
      isNot(contains('Day Tour')),
    );
  });

  test('MobileBootstrap.fallback uses the same list (no drift)', () {
    expect(
      pairs(MobileBootstrap.fallback().itineraries),
      pairs(tourismItineraryFallback),
    );
  });

  testWidgets('no itineraries from the server: the form offers the three', (
    tester,
  ) async {
    final tile = await itineraryTile(tester, bootstrapWithItineraries([]));

    expect(pairs(tile.items), pairs(tourismItineraryFallback));
    expect(tile.value, tourismItineraryFallback.first);
    expect(tile.value.name, 'Same Day');
    expect(tile.items.map((i) => i.name), isNot(contains('Day Tour')));
  });

  testWidgets('itineraries from the server are used as they are', (
    tester,
  ) async {
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
