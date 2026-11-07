// Boat Capacity & Fare and Total Visitors are tied together on the registration
// form through each tier's own min_pax and max_pax (never its text):
//   - Total Visitors changes -> the first tier whose range holds it is chosen;
//   - a tier is chosen      -> Total Visitors becomes the largest number of its
//     range, through _setVisitors, so male, female and the rest follow.
// A tier with no range is left out of both. Nothing here reaches a real backend.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const capacityLabel = 'Boat Capacity & Fare';
const boatLabel = 'Boat Classification *';

const t12 = '1-2 pax (One-Way P1500, Two-way P2000)';
const t34 = '3-4 pax (One-Way P2000, Two-way P2,500)';
const t56 = '5-6 pax (One-Way P2,500, Two-way P3,000)';
const t78 = '7-8 pax (One-Way P3,000, Two-way P3,500)';
const t1820 = '18-20 pax (One-Way P5,500, Two-way P6,000)';
const open = 'Open charter (price on request)';

Map<String, Object?> tier(String name, [int? min, int? max]) => {
  'name': name,
  'min_pax': ?min,
  'max_pax': ?max,
};

List<Object?> allTiers() => [
  tier(t12, 1, 2),
  tier(t34, 3, 4),
  tier(t56, 5, 6),
  tier(t78, 7, 8),
  tier(t1820, 18, 20),
  tier(open), // no range
];

MobileBootstrap bootstrap({List<Object?>? fares}) {
  return MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 7, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': {
      'boatTypes': [
        {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': true},
        {'id': 2, 'name': 'Passenger Boat', 'requires_capacity_fare': false},
      ],
      'boatCapacityFares': fares ?? allTiers(),
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
        initialDestination: b.destinations.first,
      ),
    ),
  );
  await tester.pump();
}

Future<void> chooseBoat(WidgetTester tester, String name) async {
  final tile = find.byWidgetPredicate(
    (w) => w is DropdownTile<RefItem> && w.label == boatLabel,
  );
  await tester.ensureVisible(tile);
  await tester.tap(
    find.descendant(of: tile, matching: find.byType(DropdownButtonFormField<RefItem>)),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

final fareTile = find.byWidgetPredicate(
  (w) => w is DropdownTile<String> && w.label == capacityLabel,
);

Future<void> chooseFare(WidgetTester tester, String option) async {
  await tester.ensureVisible(fareTile);
  await tester.tap(
    find.descendant(of: fareTile, matching: find.byType(DropdownButtonFormField<String>)),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(boatCapacityFareLabel(option)).last);
  await tester.pumpAndSettle();
}

String chosenFare(WidgetTester tester) => tester.widget<DropdownTile<String>>(fareTile).value;

Finder counter(String label) =>
    find.byWidgetPredicate((w) => w is CounterRow && w.item.label == label);

int count(WidgetTester tester, String label) => tester.widget<CounterRow>(counter(label)).item.value;

/// Taps + or - on Total Visitors until it shows [target].
Future<void> setVisitors(WidgetTester tester, int target) async {
  await tester.ensureVisible(counter('Total Visitors'));
  while (count(tester, 'Total Visitors') != target) {
    final up = count(tester, 'Total Visitors') < target;
    final button = find.descendant(
      of: counter('Total Visitors'),
      matching: find.byType(IconButton),
    );
    await tester.tap(up ? button.last : button.first);
    await tester.pump();
  }
}

Future<void> openWithTouristBoat(WidgetTester tester, [MobileBootstrap? b]) async {
  await pumpForm(tester, b ?? bootstrap());
  await chooseBoat(tester, 'Tourist Boat');
}

void main() {
  group('the model reads the range from the numbers', () {
    test('a tier with both numbers has a range; one without has none', () {
      final fares = BoatCapacityFares.fromJson(allTiers());
      expect(fares.ranges[t34]!.min, 3);
      expect(fares.ranges[t34]!.max, 4);
      expect(fares.ranges.containsKey(open), isFalse);
      expect(fares.names, contains(open));
    });

    test('numbers that make no range are no range (nothing is guessed)', () {
      final fares = BoatCapacityFares.fromJson([
        {'name': 'a', 'min_pax': 0, 'max_pax': 2},
        {'name': 'b', 'min_pax': 5, 'max_pax': 4},
        {'name': 'c', 'min_pax': 3},
        {'name': 'd', 'min_pax': '3', 'max_pax': '4'},
        {'name': 'e', 'min_pax': 3.5, 'max_pax': 4},
        {'name': 'f', 'min_pax': null, 'max_pax': null},
      ]);
      expect(fares.names, ['a', 'b', 'c', 'd', 'e', 'f']);
      expect(fares.ranges, isEmpty);
    });

    test('the text is never read: a name that looks like a range has none without the numbers', () {
      final fares = BoatCapacityFares.fromJson([
        {'name': '1-2 pax (One-Way P1500)'},
      ]);
      expect(fares.ranges, isEmpty);
      expect(fares.tierForVisitors(2), isNull);
    });

    test('the first tier in the server order wins when ranges overlap', () {
      final fares = BoatCapacityFares.fromJson([
        tier('wide', 1, 10),
        tier('narrow', 3, 4),
      ]);
      expect(fares.tierForVisitors(3), 'wide');
    });

    test('the written nine have no range, so nothing follows', () {
      expect(BoatCapacityFares.none.tierForVisitors(5), isNull);
      expect(BoatCapacityFares.none.visitorsForTier(t56), isNull);
    });
  });

  group('Total Visitors chooses the tier', () {
    testWidgets('5 -> 5-6 pax', (tester) async {
      await openWithTouristBoat(tester);
      await setVisitors(tester, 5);
      expect(chosenFare(tester), t56);
    });

    testWidgets('2 -> 1-2 pax, and 20 -> 18-20 pax', (tester) async {
      await openWithTouristBoat(tester);
      await setVisitors(tester, 2);
      expect(chosenFare(tester), t12);
      await setVisitors(tester, 20);
      expect(chosenFare(tester), t1820);
    });

    testWidgets('a count no tier holds (9) leaves the tier as it was', (tester) async {
      await openWithTouristBoat(tester);
      await setVisitors(tester, 8);
      expect(chosenFare(tester), t78);
      await setVisitors(tester, 9);
      expect(chosenFare(tester), t78);
    });

    testWidgets('from 4 raised to 5 while 3-4 pax: the tier moves to 5-6 pax', (tester) async {
      await openWithTouristBoat(tester);
      await chooseFare(tester, t34);
      expect(count(tester, 'Total Visitors'), 4);
      await setVisitors(tester, 5);
      expect(chosenFare(tester), t56);
    });

    testWidgets('from 4 lowered to 3 while 3-4 pax: the tier stays', (tester) async {
      await openWithTouristBoat(tester);
      await chooseFare(tester, t34);
      await setVisitors(tester, 3);
      expect(count(tester, 'Total Visitors'), 3);
      expect(chosenFare(tester), t34);
    });

    testWidgets('a tier with no range is never chosen by the count', (tester) async {
      await openWithTouristBoat(tester, bootstrap(fares: [tier(open)]));
      await setVisitors(tester, 5);
      expect(chosenFare(tester), '');
    });
  });

  group('choosing a tier sets Total Visitors', () {
    testWidgets('3-4 pax -> 4, and male + female is 4', (tester) async {
      await openWithTouristBoat(tester);
      await chooseFare(tester, t34);
      expect(count(tester, 'Total Visitors'), 4);
      expect(count(tester, 'Male') + count(tester, 'Female'), 4);
      expect(count(tester, 'Filipino') + count(tester, 'Foreigner'), 4);
      expect(chosenFare(tester), t34);
    });

    testWidgets('5-6 pax -> 6', (tester) async {
      await openWithTouristBoat(tester);
      await chooseFare(tester, t56);
      expect(count(tester, 'Total Visitors'), 6);
      expect(count(tester, 'Male') + count(tester, 'Female'), 6);
      expect(chosenFare(tester), t56);
    });

    testWidgets('a tier with no range puts nothing in Total Visitors', (tester) async {
      await openWithTouristBoat(tester);
      await setVisitors(tester, 3);
      await chooseFare(tester, open);
      expect(count(tester, 'Total Visitors'), 3);
      expect(chosenFare(tester), open);
    });
  });

  group('a boat that takes no fare', () {
    testWidgets('is not touched: no dropdown, and the count moves freely', (tester) async {
      await pumpForm(tester, bootstrap());
      await chooseBoat(tester, 'Passenger Boat');
      expect(fareTile, findsNothing);
      await setVisitors(tester, 5);
      expect(count(tester, 'Total Visitors'), 5);
      // back to the boat that asks: nothing was chosen on the way
      await chooseBoat(tester, 'Tourist Boat');
      expect(chosenFare(tester), '');
    });
  });
}
