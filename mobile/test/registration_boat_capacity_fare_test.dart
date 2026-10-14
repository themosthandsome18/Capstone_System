// Boat Capacity & Fare on the registration form belongs to the boat types whose
// row says so (requires_capacity_fare), as on the web. It was always shown and
// always sent. The payload is checked through a mocked HTTP client: nothing is
// sent to a real backend.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

const capacityLabel = 'Boat Capacity & Fare';
const boatLabel = 'Boat Classification *';

MobileBootstrap bootstrapWithBoats(List<Map<String, Object?>> boats) {
  return MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 7, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': {'boatTypes': boats},
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
}

const touristBoat = {
  'id': 1,
  'name': 'Tourist Boat',
  'requires_capacity_fare': true,
};
const passengerBoat = {
  'id': 2,
  'name': 'Passenger Boat',
  'requires_capacity_fare': false,
};

/// What the form sent, as the server would have received it.
class Sent {
  final List<Map<String, dynamic>> bodies = [];
  Map<String, dynamic> get last => bodies.last;
}

Future<void> pumpForm(WidgetTester tester, MobileBootstrap bootstrap) async {
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
        bootstrap: bootstrap,
        // The Destination field starts blank unless a resort was tapped; these
        // tests are about other fields, so they open the form as if one was.
        initialDestination: bootstrap.destinations.first,
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

Future<void> chooseFare(WidgetTester tester, String option) async {
  final tile = find.byWidgetPredicate(
    (w) => w is DropdownTile<String> && w.label == capacityLabel,
  );
  await tester.ensureVisible(tile);
  await tester.tap(
    find.descendant(of: tile, matching: find.byType(DropdownButtonFormField<String>)),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(boatCapacityFareLabel(option)).last);
  await tester.pumpAndSettle();
}

/// Fills the required text fields and presses Submit Registration; the HTTP
/// call is answered by a mock, and what it received is returned.
Future<Map<String, dynamic>> submit(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
  await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
  await tester.enterText(
    find.widgetWithText(TextField, 'Contact number *'),
    '09000000000',
  );
  final sent = Sent();
  final button = find.text('Submit Registration');
  await tester.ensureVisible(button);
  await http.runWithClient(
    () async {
      await tester.tap(button);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    },
    () => MockClient((request) async {
      sent.bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response('{"survey_id":"SURV-TEST-1"}', 201);
    }),
  );
  expect(sent.bodies, hasLength(1), reason: 'the form was not submitted');
  return sent.last;
}

bool capacityShown() =>
    find
        .byWidgetPredicate(
          (w) => w is DropdownTile<String> && w.label == capacityLabel,
        )
        .evaluate()
        .isNotEmpty;

void main() {
  final fare = boatCapacityFareOptions.firstWhere((o) => o.isNotEmpty);

  group('RefItem reads the flag', () {
    test('true, false, absent and not a bool', () {
      expect(RefItem.fromJson(touristBoat).requiresCapacityFare, isTrue);
      expect(RefItem.fromJson(passengerBoat).requiresCapacityFare, isFalse);
      expect(RefItem.fromJson({'id': 3, 'name': 'X'}).requiresCapacityFare, isNull);
      expect(
        RefItem.fromJson({'id': 3, 'name': 'X', 'requires_capacity_fare': 'yes'})
            .requiresCapacityFare,
        isNull,
      );
    });

    test('the offline boats carry the live flags', () {
      final boats = MobileBootstrap.fallback().boatTypes;
      expect(boats.map((b) => (b.name, b.requiresCapacityFare)), [
        ('Tourist Boat', true),
        ('Passenger Boat', false),
      ]);
    });

    test('the two helpers: shown only when known, kept only when shown', () {
      const yes = RefItem(id: 1, name: 'a', requiresCapacityFare: true);
      const no = RefItem(id: 2, name: 'b', requiresCapacityFare: false);
      const unknown = RefItem(id: 3, name: 'c');
      expect(boatRequiresCapacityFare(yes), isTrue);
      expect(boatRequiresCapacityFare(no), isFalse);
      expect(boatRequiresCapacityFare(unknown), isFalse);
      expect(boatRequiresCapacityFare(null), isFalse);
      expect(capacityFareForBoatType(yes, 'F'), 'F');
      expect(capacityFareForBoatType(no, 'F'), '');
      expect(capacityFareForBoatType(unknown, 'F'), '');
      expect(capacityFareForBoatType(yes, ''), '');
    });
  });

  group('the form', () {
    testWidgets('a boat that takes a fare shows the field and sends the fare', (
      tester,
    ) async {
      await pumpForm(tester, bootstrapWithBoats([touristBoat, passengerBoat]));

      expect(capacityShown(), isTrue);
      await chooseFare(tester, fare);

      final body = await submit(tester);
      expect(body['boat_type_id'], 1);
      expect(body['boat_capacity_fare'], fare);
    });

    testWidgets('a boat that takes none hides the field and sends none', (
      tester,
    ) async {
      await pumpForm(tester, bootstrapWithBoats([passengerBoat, touristBoat]));

      expect(capacityShown(), isFalse);

      final body = await submit(tester);
      expect(body['boat_type_id'], 2);
      expect(body['boat_capacity_fare'], '');
    });

    testWidgets('a boat whose rule is not known: hidden, nothing sent', (
      tester,
    ) async {
      await pumpForm(
        tester,
        bootstrapWithBoats([
          {'id': 9, 'name': 'Mystery Boat'},
        ]),
      );

      expect(capacityShown(), isFalse);
      final body = await submit(tester);
      expect(body['boat_capacity_fare'], '');
    });

    testWidgets('the flag decides, not the name', (tester) async {
      await pumpForm(
        tester,
        bootstrapWithBoats([
          {'id': 1, 'name': 'Renamed Boat', 'requires_capacity_fare': true},
          {'id': 2, 'name': 'Tourist Boat', 'requires_capacity_fare': false},
        ]),
      );
      expect(capacityShown(), isTrue);

      await chooseBoat(tester, 'Tourist Boat');
      expect(capacityShown(), isFalse);
    });

    testWidgets('switching to a no-fare boat clears the fare for good', (
      tester,
    ) async {
      await pumpForm(tester, bootstrapWithBoats([touristBoat, passengerBoat]));
      await chooseFare(tester, fare);

      await chooseBoat(tester, 'Passenger Boat');
      expect(capacityShown(), isFalse);

      // Back to a boat that takes a fare: the field is back, and empty.
      await chooseBoat(tester, 'Tourist Boat');
      expect(capacityShown(), isTrue);
      final tile = tester.widget<DropdownTile<String>>(
        find.byWidgetPredicate(
          (w) => w is DropdownTile<String> && w.label == capacityLabel,
        ),
      );
      expect(tile.value, '');

      final body = await submit(tester);
      expect(body['boat_type_id'], 1);
      expect(body['boat_capacity_fare'], '');
    });

    testWidgets('no-fare boat after a fare was chosen sends no fare', (
      tester,
    ) async {
      await pumpForm(tester, bootstrapWithBoats([touristBoat, passengerBoat]));
      await chooseFare(tester, fare);
      await chooseBoat(tester, 'Passenger Boat');

      final body = await submit(tester);
      expect(body['boat_type_id'], 2);
      expect(body['boat_capacity_fare'], '');
    });
  });
}
