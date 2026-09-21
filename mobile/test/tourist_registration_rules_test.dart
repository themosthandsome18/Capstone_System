import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

/// Captures what the registration form would submit, then fails on purpose so the real
/// receipt dialog / navigation is not part of these tests.
class _CapturingApi extends TourismApi {
  _CapturingApi();

  Map<String, Object?>? submitted;

  @override
  Future<Map<String, dynamic>> registerVisit({
    required String firstName,
    required String lastName,
    String? fullName,
    required String contactNumber,
    required String email,
    required bool consentConfirmed,
    required String arrivalDate,
    required int countryId,
    required int regionId,
    required int provinceId,
    required String countryOfOrigin,
    required int resortId,
    required int itineraryId,
    required int travelModeId,
    required int boatTypeId,
    required String boatCapacityFare,
    required String parkingSpace,
    required int visitPurposeId,
    required int totalVisitors,
    required int totalMale,
    required int totalFemale,
    required int filipinoCount,
    required int maubaninCount,
    required int foreignerCount,
    required int specialGroupCount,
    required int age0To7,
    required int age8To59,
    required int age60Above,
  }) async {
    submitted = {
      'boatTypeId': boatTypeId,
      'boatCapacityFare': boatCapacityFare,
      'totalVisitors': totalVisitors,
      'filipinoCount': filipinoCount,
      'maubaninCount': maubaninCount,
      'foreignerCount': foreignerCount,
    };
    throw Exception('captured');
  }
}

const _publicBoat = 'Public Boat';
const _privateBoat = 'Private Boat (Rates depend on the capacity)';
const _resortBoat =
    'Boat Provided by Resort (As confirmed by both guests and resort)';
const _fare = '3-4 pax (One-Way P2000, Two-way P2,500)';

MobileBootstrap _bootstrap({List<Map<String, Object?>>? boats}) {
  return MobileBootstrap.fromJson({
    'referenceTables': {
      'countries': [
        {'id': 1, 'name': 'Philippines'},
      ],
      'regions': [
        {'id': 4, 'name': 'CALABARZON Region'},
      ],
      'provinces': [
        {'id': 1, 'name': 'Quezon', 'region_id': 4},
      ],
      'itineraries': [
        {'id': 1, 'name': 'Overnight'},
      ],
      'travelModes': [
        {'id': 1, 'name': 'Private Vehicle'},
      ],
      'boatTypes':
          boats ??
          [
            {'id': 1, 'name': _publicBoat},
            {'id': 2, 'name': _privateBoat},
            {'id': 3, 'name': _resortBoat},
          ],
      'visitPurposes': [
        {'id': 1, 'name': 'Leisure'},
      ],
    },
    'destinations': [
      {
        'resort_id': 1,
        'resort_name': 'Test Resort',
        'type': 'Beach Resort',
        'location': 'Cagbalete',
        'short_description': 'x',
        'tourism_rating': 4.0,
        'monthly_arrivals': 10,
        'with_mayors_permit': true,
        'access': 'Boat Access',
        'latitude': 14.25,
        'longitude': 121.8,
        'images': [],
      },
    ],
  });
}

Future<_CapturingApi> _pumpForm(
  WidgetTester tester, {
  List<Map<String, Object?>>? boats,
}) async {
  // Tall viewport so every field of the long form is built and tappable.
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final api = _CapturingApi();
  await tester.pumpWidget(
    MaterialApp(
      home: TouristRegistrationPage(api: api, bootstrap: _bootstrap(boats: boats)),
    ),
  );
  await tester.pump();
  return api;
}

Finder _dropdown<T>(String label) => find.ancestor(
  of: find.text(label),
  matching: find.byType(DropdownButtonFormField<T>),
);

bool _fareEnabled(WidgetTester tester) =>
    tester
        .widget<DropdownButtonFormField<String>>(
          _dropdown<String>('Boat Capacity & Fare'),
        )
        .onChanged !=
    null;

Future<void> _chooseBoat(WidgetTester tester, String name) async {
  await tester.tap(_dropdown<RefItem>('Boat Classification *'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

Future<void> _chooseFare(WidgetTester tester, String fare) async {
  await tester.tap(_dropdown<String>('Boat Capacity & Fare'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(fare).last);
  await tester.pumpAndSettle();
}

Finder _counterRow(String label) => find
    .ancestor(of: find.text(label), matching: find.byType(CounterRow))
    .first;

Future<void> _tapCounter(
  WidgetTester tester,
  String label,
  IconData icon, [
  int times = 1,
]) async {
  for (var i = 0; i < times; i++) {
    await tester.tap(
      find.descendant(of: _counterRow(label), matching: find.byIcon(icon)),
    );
    await tester.pump();
  }
}

String _counterValue(WidgetTester tester, String label) {
  final texts = find.descendant(
    of: _counterRow(label),
    matching: find.byType(Text),
  );
  return tester.widget<Text>(texts.at(1)).data!;
}

Future<void> _submit(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'Ana');
  await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'Cruz');
  await tester.enterText(
    find.widgetWithText(TextField, 'Contact number *'),
    '09171234567',
  );
  await tester.tap(find.text('Submit Registration'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  group('public boat detection (by name, like the web)', () {
    test('matches names that start with "public boat", trimmed and case-insensitive', () {
      expect(isPublicBoat(const RefItem(id: 1, name: _publicBoat)), isTrue);
      expect(
        isPublicBoat(
          const RefItem(id: 1, name: 'Public Boat (P100/ride/head) Sabang Port Only'),
        ),
        isTrue,
      );
      expect(isPublicBoat(const RefItem(id: 9, name: '  PUBLIC boat  ')), isTrue);
    });

    test('everything else, including no boat, is not the public boat', () {
      expect(isPublicBoat(const RefItem(id: 2, name: _privateBoat)), isFalse);
      expect(isPublicBoat(const RefItem(id: 3, name: _resortBoat)), isFalse);
      expect(isPublicBoat(const RefItem(id: 4, name: 'Not a Public Boat')), isFalse);
      expect(isPublicBoat(const RefItem(id: 5, name: '')), isFalse);
      expect(isPublicBoat(const RefItem(id: 1, name: 'Public')), isFalse);
      expect(isPublicBoat(null), isFalse);
    });
  });

  group('Boat Capacity & Fare', () {
    testWidgets('is enabled for the public boat and its fare is submitted', (tester) async {
      final api = await _pumpForm(tester);

      expect(_fareEnabled(tester), isTrue);
      await _chooseFare(tester, _fare);
      await _submit(tester);

      expect(api.submitted!['boatTypeId'], 1);
      expect(api.submitted!['boatCapacityFare'], _fare);
    });

    testWidgets('stays visible but is disabled for a non-public boat', (tester) async {
      await _pumpForm(tester);

      for (final boat in [_privateBoat, _resortBoat]) {
        await _chooseBoat(tester, boat);
        expect(find.text('Boat Capacity & Fare'), findsOneWidget);
        expect(_fareEnabled(tester), isFalse, reason: boat);

        // not tappable: the option list never opens
        await tester.tap(_dropdown<String>('Boat Capacity & Fare'));
        await tester.pumpAndSettle();
        expect(find.text(_fare), findsNothing, reason: boat);
      }
    });

    testWidgets('is disabled when no boat is selected', (tester) async {
      await _pumpForm(
        tester,
        boats: [
          {'id': 9, 'name': ''},
        ],
      );

      expect(find.text('Boat Capacity & Fare'), findsOneWidget);
      expect(_fareEnabled(tester), isFalse);
    });

    testWidgets('switching public -> non-public clears the fare and submits ""', (tester) async {
      final api = await _pumpForm(tester);

      await _chooseFare(tester, _fare);
      expect(find.text(_fare), findsOneWidget);

      await _chooseBoat(tester, _privateBoat);
      expect(find.text(_fare), findsNothing); // cleared
      expect(find.text('Select capacity and fare'), findsOneWidget);

      await _submit(tester);
      expect(api.submitted!['boatTypeId'], 2);
      expect(api.submitted!['boatCapacityFare'], '');
    });

    testWidgets('going back to the public boat re-enables it but does not restore the old fare', (tester) async {
      final api = await _pumpForm(tester);

      await _chooseFare(tester, _fare);
      await _chooseBoat(tester, _privateBoat);
      await _chooseBoat(tester, _publicBoat);

      expect(_fareEnabled(tester), isTrue);
      expect(find.text('Select capacity and fare'), findsOneWidget);

      await _submit(tester);
      expect(api.submitted!['boatCapacityFare'], '');
    });
  });

  group('Sub Maubanin', () {
    testWidgets('is shown directly under Filipino, indented, only when Filipino > 0', (tester) async {
      await _pumpForm(tester);

      // default group: 1 visitor, Filipino 1
      expect(find.text('Sub Maubanin'), findsOneWidget);
      expect(
        find.text('Maubanin (Local Resident, subset of Filipino)'),
        findsNothing,
      ); // renamed, no separate old field

      final filipino = tester.getTopLeft(find.text('Filipino'));
      final sub = tester.getTopLeft(find.text('Sub Maubanin'));
      final foreigner = tester.getTopLeft(find.text('Foreigner'));
      expect(sub.dy, greaterThan(filipino.dy));
      expect(sub.dy, lessThan(foreigner.dy)); // between Filipino and Foreigner
      expect(sub.dx, greaterThan(filipino.dx)); // visually a sub-item
    });

    testWidgets('is hidden when Filipino is 0 and reappears when Filipino > 0', (tester) async {
      await _pumpForm(tester);

      await _tapCounter(tester, 'Foreigner', Icons.add); // 1 visitor -> Filipino 0
      expect(_counterValue(tester, 'Filipino'), '0');
      expect(find.text('Sub Maubanin'), findsNothing);

      await _tapCounter(tester, 'Foreigner', Icons.remove); // Filipino back to 1
      expect(_counterValue(tester, 'Filipino'), '1');
      expect(find.text('Sub Maubanin'), findsOneWidget);
    });

    testWidgets('resets to 0 when Filipino returns to 0 (and 0 is submitted)', (tester) async {
      final api = await _pumpForm(tester);

      await _tapCounter(tester, 'Total Visitors', Icons.add, 2); // 3 visitors, all Filipino
      await _tapCounter(tester, 'Sub Maubanin', Icons.add, 2);
      expect(_counterValue(tester, 'Sub Maubanin'), '2');

      await _tapCounter(tester, 'Foreigner', Icons.add, 3); // Filipino -> 0
      expect(find.text('Sub Maubanin'), findsNothing);

      await _tapCounter(tester, 'Foreigner', Icons.remove, 3); // Filipino -> 3
      expect(_counterValue(tester, 'Filipino'), '3');
      expect(_counterValue(tester, 'Sub Maubanin'), '0'); // not the old 2

      await _submit(tester);
      expect(api.submitted!['maubaninCount'], 0);
    });

    testWidgets('cannot exceed Filipino and does not change any totals', (tester) async {
      final api = await _pumpForm(tester);

      await _tapCounter(tester, 'Total Visitors', Icons.add, 2); // 3 visitors, Filipino 3
      await _tapCounter(tester, 'Sub Maubanin', Icons.add, 6);
      expect(_counterValue(tester, 'Sub Maubanin'), '3'); // capped at Filipino

      // totals untouched by the sub-item
      expect(_counterValue(tester, 'Total Visitors'), '3');
      expect(_counterValue(tester, 'Filipino'), '3');
      expect(_counterValue(tester, 'Foreigner'), '0');

      // lowering Filipino drags it down with it
      await _tapCounter(tester, 'Foreigner', Icons.add);
      expect(_counterValue(tester, 'Filipino'), '2');
      expect(_counterValue(tester, 'Sub Maubanin'), '2');

      await _submit(tester);
      expect(api.submitted!['maubaninCount'], 2);
      expect(api.submitted!['filipinoCount'], 2);
      expect(api.submitted!['foreignerCount'], 1);
      expect(api.submitted!['totalVisitors'], 3);
    });
  });
}
