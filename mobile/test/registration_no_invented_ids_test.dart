// The registration form never makes up the id of a reference item.
//
// It sends the id of a country, a region, a province, a length of stay, a way of travelling, a boat and a purpose. The app used to carry its own
// copies of some of them, to fall back on when the server's list was empty: the province was written as id 1 "Quezon", which is Ilocos Norte on the
// live database. A wrong id would be recorded as the visitor's own answer, so now a missing list stops the form, with a message that says what is
// wrong and what to do, and nothing is sent. With every list present the form is what it was.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

import 'support/reference_tables.dart';

const lists = {
  'countries': 'countries',
  'regions': 'regions',
  'provinces': 'provinces',
  'itineraries': 'length-of-stay choices',
  'travelModes': 'ways of travelling',
  'boatTypes': 'boat types',
  'visitPurposes': 'purposes of visit',
};

MobileBootstrap bootstrap({Map<String, dynamic> tables = const {}}) => MobileBootstrap.fromJson({
  'destinations': [
    {'resort_id': 7, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
  ],
  'referenceTables': fixtureReferenceTables(tables),
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

Future<void> pumpForm(WidgetTester tester, MobileBootstrap b, {bool tapped = true}) async {
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
      home: TouristRegistrationPage(api: const TourismApi(), bootstrap: b, initialDestination: tapped ? b.destinations.first : null),
    ),
  );
  await tester.pump();
}

final unavailable = find.byKey(const ValueKey('registration-unavailable'));

void main() {
  group('a list that did not arrive: the form is not shown, and the person is told', () {
    for (final entry in lists.entries) {
      testWidgets('no ${entry.key}: the message names them, there is nothing to fill in and nothing to submit', (tester) async {
        var sent = 0;
        await http.runWithClient(() async {
          await pumpForm(tester, bootstrap(tables: {entry.key: <dynamic>[]}));
        }, () => MockClient((request) async {
          sent++;
          return http.Response('{}', 500);
        }));

        expect(unavailable, findsOneWidget);
        expect(find.text("Registration isn't available right now"), findsOneWidget);
        // what is wrong
        expect(find.textContaining("couldn't load the list of ${entry.value}."), findsOneWidget);
        // what to do
        expect(find.textContaining('Check your internet connection and try again. If it keeps happening, let the Tourism Office know.'), findsOneWidget);
        expect(find.text('Go back'), findsOneWidget);
        // and no way to register
        expect(find.text('Submit Registration'), findsNothing);
        expect(find.byType(TextField), findsNothing);
        expect(find.byType(DropdownButtonFormField<RefItem>), findsNothing);
        expect(sent, 0);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('no provinces, the one that was written as 1 "Quezon": the form is not shown and nothing is sent', (tester) async {
      var sent = 0;
      await http.runWithClient(() async {
        await pumpForm(tester, bootstrap(tables: {'provinces': <dynamic>[]}));
      }, () => MockClient((request) async {
        sent++;
        return http.Response('{}', 500);
      }));

      expect(unavailable, findsOneWidget);
      expect(find.textContaining('provinces'), findsWidgets);
      expect(find.text('Submit Registration'), findsNothing);
      expect(find.textContaining('Quezon'), findsNothing);
      expect(sent, 0);
    });

    testWidgets('the message is plain: one paragraph, and it does not explain why the app will not guess', (tester) async {
      await pumpForm(tester, bootstrap(tables: {'provinces': <dynamic>[]}));

      expect(
        find.text("The app couldn't load the list of provinces. Check your internet connection and try again. If it keeps happening, let the Tourism Office know."),
        findsOneWidget,
      );
      for (final gone in ['guess', 'Nothing was sent', "visitor's answer", 'go back,']) {
        expect(find.textContaining(gone), findsNothing, reason: gone);
      }
    });

    testWidgets('several missing: all are named', (tester) async {
      await pumpForm(tester, bootstrap(tables: {'provinces': <dynamic>[], 'boatTypes': <dynamic>[]}));

      expect(find.textContaining("couldn't load the list of provinces and boat types."), findsOneWidget);
    });

    testWidgets('the offline bootstrap (the one the Staff QR portal is given) is not a registration: all seven are named', (tester) async {
      await pumpForm(tester, MobileBootstrap.fallback(), tapped: false);

      expect(unavailable, findsOneWidget);
      expect(
        find.textContaining("couldn't load the list of countries, regions, provinces, length-of-stay choices, ways of travelling, boat types and purposes of visit."),
        findsOneWidget,
      );
      expect(find.text('Submit Registration'), findsNothing);
    });

    test('missingRegistrationLists names exactly the empty ones, in the order of the form', () {
      expect(missingRegistrationLists(bootstrap()), isEmpty);
      expect(missingRegistrationLists(bootstrap(tables: {'visitPurposes': <dynamic>[], 'regions': <dynamic>[]})), ['regions', 'purposes of visit']);
    });
  });

  group('with every list present the form is what it was', () {
    testWidgets('it opens, offers the server\'s items, and sends THEIR ids', (tester) async {
      final bodies = <Map<String, dynamic>>[];
      await http.runWithClient(() async {
        await pumpForm(tester, bootstrap());
        expect(unavailable, findsNothing);
        expect(find.text('Submit Registration'), findsOneWidget);

        await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
        await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
        await tester.enterText(find.widgetWithText(TextField, 'Contact number *'), '09000000000');
        final button = find.text('Submit Registration');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => MockClient((request) async {
        bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
        return http.Response('{"survey_id":"SURV-TEST-1"}', 201);
      }));

      expect(bodies, hasLength(1));
      final body = bodies.single;
      // every id is one the SERVER'S lists (here, the fixture's) carry: the province is 20 (the fixture's Quezon), never a 1 that the app wrote
      expect(body['country_id'], 1);
      expect(body['region_id'], 4);
      expect(body['province_id'], 20);
      expect(body['itinerary_id'], 1);
      expect(body['travel_mode_id'], 1);
      expect(body['boat_type_id'], 1);
      expect(body['visit_purpose_id'], 1);
    });

    testWidgets('the ids follow the server: other ids in the lists are the ids that are sent', (tester) async {
      final bodies = <Map<String, dynamic>>[];
      await http.runWithClient(() async {
        await pumpForm(
          tester,
          bootstrap(tables: {
            'countries': [
              {'id': 91, 'name': 'Philippines', 'type': 'local'},
            ],
            'regions': [
              {'id': 92, 'name': 'CALABARZON Region'},
            ],
            'provinces': [
              {'id': 93, 'name': 'Quezon', 'region_id': 92},
            ],
            'itineraries': [
              {'id': 94, 'name': 'Overnight'},
            ],
            'travelModes': [
              {'id': 95, 'name': 'Private Vehicle'},
            ],
            'boatTypes': [
              {'id': 96, 'name': 'Tourist Boat', 'requires_capacity_fare': false},
            ],
            'visitPurposes': [
              {'id': 97, 'name': 'Leisure'},
            ],
          }),
        );
        await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
        await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
        await tester.enterText(find.widgetWithText(TextField, 'Contact number *'), '09000000000');
        final button = find.text('Submit Registration');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
      }, () => MockClient((request) async {
        bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
        return http.Response('{"survey_id":"SURV-TEST-1"}', 201);
      }));

      expect(bodies, hasLength(1));
      expect([for (final k in ['country_id', 'region_id', 'province_id', 'itinerary_id', 'travel_mode_id', 'boat_type_id', 'visit_purpose_id']) bodies.single[k]], [91, 92, 93, 94, 95, 96, 97]);
    });
  });

  group('no id is written in the form (read from the source)', () {
    String source(String path) => File(path).readAsStringSync().replaceAll('\r\n', '\n');

    String registrationState() {
      final all = source('lib/screens/tourism_screens.dart');
      final from = all.indexOf('class _TouristRegistrationPageState');
      expect(from, greaterThan(0), reason: 'the form\'s state class was not found');
      final to = all.indexOf('\nclass ', from + 10);
      return all.substring(from, to == -1 ? all.length : to);
    }

    test('the state of the form builds no RefItem and has no fallback of one', () {
      final form = registrationState();
      expect(RegExp(r'(?<![A-Za-z_])RefItem\(').hasMatch(form), isFalse); // a constructor call (not _preferredRefItem(, a method)
      expect(form, isNot(contains('const RefItem')));
      expect(form, isNot(contains('fallback:')));
      expect(RegExp(r'\?\?\s*(const\s+)?RefItem').hasMatch(form), isFalse);
      expect(RegExp(r'id:\s*\d+').hasMatch(form), isFalse);
    });

    test('every initial choice is an item of the server\'s list (.first), not an item made up', () {
      final form = registrationState();
      for (final list in ['countries', 'travelModes', 'boatTypes', 'visitPurposes']) {
        expect(form, contains('widget.bootstrap.$list.first'));
      }
    });

    test('the offline bootstrap writes no RefItem, and the itinerary fallback is gone from the code', () {
      final models = source('lib/models/models.dart');
      final from = models.indexOf('factory MobileBootstrap.fallback()');
      final fallback = models.substring(from, models.indexOf('\n  }\n', from));
      expect(fallback, isNot(contains('RefItem')));
      expect(models, isNot(contains('tourismItineraryFallback')));
      for (final file in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        expect(file.readAsStringSync(), isNot(contains('tourismItineraryFallback')), reason: file.path);
      }
    });

    test('the submit reads the chosen items, and the form checks the lists before it can be reached', () {
      final form = registrationState();
      expect(form, contains('if (_missingLists.isNotEmpty) return;'));
      expect(form, contains('missing.isNotEmpty'));
    });
  });
}
