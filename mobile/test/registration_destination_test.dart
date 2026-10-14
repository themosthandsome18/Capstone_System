// The Destination / Resort field of the Tourist Registration form.
//
// The field must be FILLED with the resort the visitor tapped, yet still
// changeable, and BLANK when the visitor came without one (My Visit tab): a
// resort the visitor did not choose decides the fee and the report, so it must
// never be put there for them.
//
// Why it was blank from the Home carousel: the server sends the featured
// resorts as a second list (featuredDestinations), parsed into separate
// Destination objects, and Destination has no ==, so the dropdown could not
// find the tapped one among its own items.
//
// The payload is checked through a mocked HTTP client: nothing is sent to a
// real backend.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

const Map<String, dynamic> beachOne = {
  'resort_id': 7,
  'resort_name': 'Sample Beach 1',
  'type': 'Beach Resort',
};
const Map<String, dynamic> beachTwo = {
  'resort_id': 9,
  'resort_name': 'Sample Beach 2',
  'type': 'Beach Resort',
};
const Map<String, dynamic> beachThree = {
  'resort_id': 11,
  'resort_name': 'Sample Beach 3',
  'type': 'Beach Resort',
};

MobileBootstrap bootstrap({List<Map<String, dynamic>>? destinations}) {
  return MobileBootstrap.fromJson({
    'destinations': destinations ?? [beachOne, beachTwo, beachThree],
    // The server's second list: the same resorts, parsed again.
    'featuredDestinations': [beachTwo, beachThree],
    'referenceTables': <String, dynamic>{},
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
}

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 7000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    // The detail page's hero image is an asset the test bundle does not carry.
    if (text.contains('overflowed') || text.contains('Unable to load asset')) {
      return;
    }
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

Future<void> pumpForm(
  WidgetTester tester, {
  required MobileBootstrap data,
  Destination? initialDestination,
}) async {
  bigScreen(tester);
  await tester.pumpWidget(
    MaterialApp(
      home: TouristRegistrationPage(
        api: const TourismApi(),
        bootstrap: data,
        initialDestination: initialDestination,
      ),
    ),
  );
  await tester.pump();
}

/// What the closed Destination field shows: the name of the selected resort,
/// or null when it shows its hint (nothing chosen).
String? shownDestination() {
  for (final name in ['Sample Beach 1', 'Sample Beach 2', 'Sample Beach 3']) {
    if (find.text(name).evaluate().isNotEmpty) return name;
  }
  return null;
}

Future<void> fillPerson(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
  await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
  await tester.enterText(
    find.widgetWithText(TextField, 'Contact number *'),
    '09000000000',
  );
}

/// Presses Submit with a mocked server; returns every body that was sent.
Future<List<Map<String, dynamic>>> submit(WidgetTester tester) async {
  await fillPerson(tester);
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
  return bodies;
}

Future<void> choose(WidgetTester tester, String name) async {
  final field = find.byType(DropdownButtonFormField<Destination?>);
  await tester.ensureVisible(field);
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

void main() {
  group('the field is filled with the resort that was tapped', () {
    testWidgets(
      'from the featured list: a different object with the same id',
      (tester) async {
        final data = bootstrap();
        // What the Home carousel passes: from featuredDestinations, not from
        // the list the dropdown is built from.
        final tapped = data.featuredDestinations.first;
        expect(identical(tapped, data.destinations[1]), isFalse);
        expect(tapped.id, data.destinations[1].id);

        await pumpForm(tester, data: data, initialDestination: tapped);

        expect(shownDestination(), 'Sample Beach 2');
      },
    );

    testWidgets('from the main list (Explore, Map): the same object', (
      tester,
    ) async {
      final data = bootstrap();

      await pumpForm(
        tester,
        data: data,
        initialDestination: data.destinations[2],
      );

      expect(shownDestination(), 'Sample Beach 3');
    });

    testWidgets('untouched, the tapped resort is what is sent', (tester) async {
      final data = bootstrap();
      await pumpForm(
        tester,
        data: data,
        initialDestination: data.featuredDestinations.first,
      );

      final bodies = await submit(tester);

      expect(bodies, hasLength(1));
      expect(bodies.single['resort_id'], 9);
    });
  });

  group('without a resort the field is blank', () {
    testWidgets('My Visit: nothing is chosen, not the first resort', (
      tester,
    ) async {
      await pumpForm(tester, data: bootstrap());

      expect(shownDestination(), isNull);
      expect(find.text('Choose a destination'), findsOneWidget);
    });

    testWidgets('submitting blank shows the message and sends nothing', (
      tester,
    ) async {
      await pumpForm(tester, data: bootstrap());

      final bodies = await submit(tester);

      expect(bodies, isEmpty);
      expect(find.text('Choose a destination.'), findsOneWidget);
    });

    testWidgets('a resort that is not in the list: blank, and no crash', (
      tester,
    ) async {
      final stranger = Destination.fromJson({
        'resort_id': 999,
        'resort_name': 'Not In The List',
      });

      await pumpForm(
        tester,
        data: bootstrap(),
        initialDestination: stranger,
      );

      expect(tester.takeException(), isNull);
      expect(shownDestination(), isNull);
      expect(find.text('Not In The List'), findsNothing);
    });

    testWidgets('no resorts loaded at all: blank, and still no crash', (
      tester,
    ) async {
      await pumpForm(tester, data: bootstrap(destinations: const []));

      expect(tester.takeException(), isNull);
      expect(shownDestination(), isNull);
      // ...and it still says so: the hint, not an empty selected item.
      expect(find.text('Choose a destination'), findsOneWidget);
    });
  });

  group('the field can still be changed', () {
    testWidgets('after it is filled: the new resort is shown and sent', (
      tester,
    ) async {
      final data = bootstrap();
      await pumpForm(
        tester,
        data: data,
        initialDestination: data.featuredDestinations.first,
      );
      expect(shownDestination(), 'Sample Beach 2');

      await choose(tester, 'Sample Beach 3');

      expect(shownDestination(), 'Sample Beach 3');
      final bodies = await submit(tester);
      expect(bodies, hasLength(1));
      expect(bodies.single['resort_id'], 11);
    });

    testWidgets('from blank: a chosen resort is shown and sent', (tester) async {
      await pumpForm(tester, data: bootstrap());

      await choose(tester, 'Sample Beach 1');

      expect(shownDestination(), 'Sample Beach 1');
      final bodies = await submit(tester);
      expect(bodies, hasLength(1));
      expect(bodies.single['resort_id'], 7);
    });
  });

  group('through the real screen: the resort detail page', () {
    testWidgets(
      'Plan Visit / Get Pass opens the form with the tapped featured resort',
      (tester) async {
        bigScreen(tester);
        final data = bootstrap();
        final tapped = data.featuredDestinations.last; // Sample Beach 3

        await http.runWithClient(
          () async {
            await tester.pumpWidget(
              MaterialApp(
                home: DestinationDetailPage(
                  destination: tapped,
                  api: const TourismApi(),
                  bootstrap: data,
                  onVisitSubmitted: (_) {},
                  onFeedbackSubmitted: (_) {},
                ),
              ),
            );
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 100));
            final plan = find.text('Plan Visit / Get Pass');
            await tester.scrollUntilVisible(
              plan,
              300,
              scrollable: find.byType(Scrollable).first,
            );
            await tester.tap(plan);
            await tester.pumpAndSettle();
          },
          () => MockClient(
            (request) async => http.Response(
              jsonEncode({'destination': beachThree, 'recentFeedback': []}),
              200,
            ),
          ),
        );

        expect(find.text('Tourist Registration'), findsOneWidget);
        expect(shownDestination(), 'Sample Beach 3');
      },
    );
  });
}
