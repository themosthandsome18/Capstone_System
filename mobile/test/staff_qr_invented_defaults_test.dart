// The staff QR portal shows a tourist record from the LGU's data. A field that
// is not in the record is NOT replaced with a made-up value (a survey ID, a
// phone number, a date, a head count): it is not shown. On the edit form a
// missing count is empty, and a required count cannot be saved empty.
// 0 is a real value and is shown and saved as 0.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

const madeUp = [
  'SURV-2026-0001',
  '+63 999 013 2845',
  '2026-08-20',
  'Mauban Destination',
];

const countKeys = [
  'total_visitors',
  'filipino_count',
  'foreigner_count',
  'total_male',
  'total_female',
  'age_0_7',
  'age_8_59',
  'age_60_above',
];

Map<String, dynamic> record([Map<String, dynamic> over = const {}]) => {
  'survey_id': 'SURV-TEST-007',
  'full_name': 'sample person',
  'email': 'sample@example.test',
  'contact_number': '09170000000',
  'country_name': 'Philippines',
  'region_name': 'CALABARZON Region',
  'province_name': 'Quezon',
  'resort_name': 'Sample Beach 1',
  'itinerary_name': 'Overnight',
  'travel_mode_name': 'Private Vehicle',
  'boat_type_name': 'Tourist Boat',
  'visit_purpose_name': 'Leisure',
  'arrival_date': '2026-10-12',
  'status': 'arrived',
  'total_visitors': 5,
  'filipino_count': 4,
  'foreigner_count': 1,
  'total_male': 3,
  'total_female': 2,
  'age_0_7': 1,
  'age_8_59': 3,
  'age_60_above': 1,
  ...over,
};

Map<String, dynamic> without(List<String> keys) =>
    record()..removeWhere((k, _) => keys.contains(k));

Map<String, dynamic> noCounts() => without(countKeys);

void tallScreen(WidgetTester tester) {
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
}

Future<void> pumpCard(WidgetTester tester, Map<String, dynamic> data) async {
  tallScreen(tester);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      home: ScannedTouristRecordSheet(
        recordData: data,
        api: const TourismApi(),
        bootstrap: MobileBootstrap.fallback(),
      ),
    ),
  );
  await tester.pump();
}

/// Opens the edit sheet from a button, so that its result (the saved map, or
/// null when it was left without saving) can be read.
class EditHarness {
  Map<String, dynamic>? saved;
  bool returned = false;
}

Future<EditHarness> pumpEdit(
  WidgetTester tester,
  Map<String, dynamic> data,
) async {
  tallScreen(tester);
  final harness = EditHarness();
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async {
                harness.saved = await Navigator.of(context)
                    .push<Map<String, dynamic>>(
                      MaterialPageRoute(
                        builder: (_) => EditTouristRecordSheet(
                          recordData: data,
                          bootstrap: MobileBootstrap.fallback(),
                        ),
                      ),
                    );
                harness.returned = true;
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return harness;
}

class HistoryApi extends TourismApi {
  HistoryApi(this.records);
  final List<Map<String, dynamic>> records;

  @override
  Future<List<Map<String, dynamic>>> fetchTouristRecordHistory({
    String? search,
    int? resortId,
  }) async => records;
}

Future<void> pumpHistory(
  WidgetTester tester,
  List<Map<String, dynamic>> records,
) async {
  tallScreen(tester);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      home: TouristHistoryLogScreen(
        api: HistoryApi(records),
        bootstrap: MobileBootstrap.fallback(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

/// The number shown on a counter tile ('' when it is empty), by its label.
String tileValue(WidgetTester tester, String label) {
  final column = find
      .ancestor(of: find.text(label), matching: find.byType(Column))
      .first;
  final texts = find
      .descendant(of: column, matching: find.byType(Text))
      .evaluate()
      .map((e) => (e.widget as Text).data ?? '')
      .where((t) => t != label)
      .toList();
  expect(texts, hasLength(1), reason: '$label: $texts');
  return texts.single;
}

void expectNoMadeUp() {
  for (final text in madeUp) {
    expect(find.textContaining(text), findsNothing, reason: text);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('2. counts that are shown', () {
    testWidgets('with values: shown, and a 0 stays 0', (tester) async {
      await pumpCard(tester, record({'foreigner_count': 0, 'age_0_7': 0}));

      expect(find.text('5 Visitors'), findsOneWidget);
      expect(find.text('Filipino'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      expect(find.text('Foreigner'), findsOneWidget);
      expect(find.text('0'), findsNWidgets(2)); // foreigner, age 0-7
    });

    testWidgets('missing: no total, no breakdown row, no 1, no 0', (
      tester,
    ) async {
      await pumpCard(tester, noCounts());

      expect(find.textContaining('Visitors'), findsNothing);
      for (final label in [
        'Filipino',
        'Foreigner',
        'Male',
        'Female',
        'Age 0-7',
        'Age 8-59',
        'Age 60+',
      ]) {
        expect(find.text(label), findsNothing, reason: label);
      }
      expect(find.text('1'), findsNothing);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('blank: the same as missing', (tester) async {
      await pumpCard(tester, {
        ...record(),
        for (final key in countKeys) key: key == 'age_0_7' ? '' : '  ',
      });

      expect(find.textContaining('Visitors'), findsNothing);
      expect(find.text('Filipino'), findsNothing);
      expect(find.text('Age 60+'), findsNothing);
      expect(find.text('1'), findsNothing);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('only some missing: only those are left out', (tester) async {
      await pumpCard(tester, without(['total_female', 'age_8_59']));

      expect(find.text('Male'), findsOneWidget);
      expect(find.text('Female'), findsNothing);
      expect(find.text('Age 0-7'), findsOneWidget);
      expect(find.text('Age 8-59'), findsNothing);
      expect(find.text('Age 60+'), findsOneWidget);
    });
  });

  group('3. survey ID (and the QR that encodes it)', () {
    testWidgets('with a value: shown, and in the QR', (tester) async {
      await pumpCard(tester, record());

      expect(find.text('SURV-TEST-007'), findsOneWidget);
      expect(find.text('RECORD ID'), findsOneWidget);
      expect(find.byType(QrImageView), findsOneWidget);
    });

    for (final entry in {
      'missing': () => without(['survey_id']),
      'blank': () => record({'survey_id': '   '}),
    }.entries) {
      testWidgets('${entry.key}: no ID line and no QR', (tester) async {
        await pumpCard(tester, entry.value());

        expect(find.text('RECORD ID'), findsNothing);
        expect(find.byType(QrImageView), findsNothing);
        expectNoMadeUp();
      });
    }
  });

  group('4. contact', () {
    testWidgets('with a value: shown', (tester) async {
      await pumpCard(tester, record());
      expect(find.text('09170000000'), findsOneWidget);
      expect(find.text('Contact'), findsOneWidget);
    });

    for (final entry in {
      'missing': () => without(['contact_number']),
      'blank': () => record({'contact_number': ''}),
    }.entries) {
      testWidgets('${entry.key}: no line, no made-up number', (tester) async {
        await pumpCard(tester, entry.value());
        expect(find.text('Contact'), findsNothing);
        expectNoMadeUp();
      });
    }
  });

  group('5. arrival date', () {
    testWidgets('with a value: shown on the card and in the edit form', (
      tester,
    ) async {
      await pumpCard(tester, record());
      expect(find.text('ARRIVAL DATE'), findsOneWidget);
      expect(find.text('2026-10-12'), findsOneWidget);

      await pumpEdit(tester, record());
      expect(find.text('ARRIVAL DATE'), findsOneWidget);
    });

    for (final entry in {
      'missing': () => without(['arrival_date']),
      'blank': () => record({'arrival_date': ' '}),
    }.entries) {
      testWidgets('${entry.key}: not on the card, not in the edit form', (
        tester,
      ) async {
        await pumpCard(tester, entry.value());
        expect(find.text('ARRIVAL DATE'), findsNothing);
        expectNoMadeUp();

        await pumpEdit(tester, entry.value());
        expect(find.text('ARRIVAL DATE'), findsNothing);
        expectNoMadeUp();
      });
    }
  });

  group('6. history list line', () {
    testWidgets('with values: ID and resort, date and pax', (tester) async {
      await pumpHistory(tester, [record()]);

      expect(find.text('SURV-TEST-007 • Sample Beach 1'), findsOneWidget);
      expect(find.text('2026-10-12 • 5 Pax'), findsOneWidget);
    });

    testWidgets('no resort: no "Mauban Destination", no trailing bullet', (
      tester,
    ) async {
      await pumpHistory(tester, [
        without(['resort_name']),
        record({'survey_id': 'SURV-TEST-008', 'resort_name': '  '}),
      ]);

      expect(find.text('SURV-TEST-007'), findsOneWidget);
      expect(find.text('SURV-TEST-008'), findsOneWidget);
      expect(find.textContaining('Mauban Destination'), findsNothing);
      expect(find.textContaining('•  '), findsNothing);
      expect(find.textContaining('• '), findsNWidgets(2)); // the date lines
    });

    testWidgets('no date and no count: no bullet, no "null", no "1 Pax"', (
      tester,
    ) async {
      await pumpHistory(tester, [
        without(['arrival_date', 'total_visitors']),
      ]);

      expect(find.textContaining('null'), findsNothing);
      expect(find.textContaining('Pax'), findsNothing);
      expect(find.textContaining('1 Pax'), findsNothing);
      expect(find.text('SURV-TEST-007 • Sample Beach 1'), findsOneWidget);
    });

    testWidgets('a 0 head count is shown as "0 Pax"', (tester) async {
      await pumpHistory(tester, [record({'total_visitors': 0})]);

      expect(find.text('2026-10-12 • 0 Pax'), findsOneWidget);
    });
  });

  group('1. the edit form', () {
    testWidgets('with values: they are shown and saved as they are', (
      tester,
    ) async {
      final h = await pumpEdit(tester, record());

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isTrue);
      for (final key in countKeys) {
        expect(h.saved![key], record()[key], reason: key);
      }
    });

    testWidgets('missing counts are empty, not 1', (tester) async {
      await pumpEdit(tester, noCounts());

      // Every counter is empty: no 1, no 0 was made up.
      for (final label in [
        'FILIPINO',
        'FOREIGNER',
        'MALE',
        'FEMALE',
        'AGE 0-7',
        'AGE 8-59',
        'AGE 60+',
      ]) {
        expect(tileValue(tester, label), '', reason: label);
      }
    });

    testWidgets('Done is refused while a required count is empty', (
      tester,
    ) async {
      final h = await pumpEdit(tester, noCounts());

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isFalse, reason: 'the sheet must stay open');
      expect(h.saved, isNull);
      expect(find.textContaining('before saving'), findsOneWidget);
      expect(find.textContaining('Filipino'), findsWidgets);
    });

    testWidgets('one count missing: refused, and it is named', (tester) async {
      final h = await pumpEdit(tester, without(['total_female']));

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isFalse);
      expect(
        find.text('Enter the missing count before saving: Female.'),
        findsOneWidget,
      );
    });

    testWidgets('a blank count is refused like a missing one', (tester) async {
      final h = await pumpEdit(tester, record({'age_8_59': '  '}));

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isFalse);
      expect(
        find.text('Enter the missing count before saving: Age 8-59.'),
        findsOneWidget,
      );
    });

    testWidgets('entering the missing count lets Done through', (
      tester,
    ) async {
      final h = await pumpEdit(tester, without(['total_female']));

      // The FEMALE tile: one tap on its "+" makes it 1, a real entered value.
      final femaleTile = find.ancestor(
        of: find.text('FEMALE'),
        matching: find.byType(Container),
      );
      final plus = find.descendant(
        of: femaleTile.first,
        matching: find.byIcon(Icons.add),
      );
      await tester.tap(plus.first);
      await tester.pump();

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isTrue);
      expect(h.saved!['total_female'], 1);
    });

    testWidgets('0 is a real value: shown as 0 and saved as 0', (tester) async {
      final h = await pumpEdit(
        tester,
        record({'foreigner_count': 0, 'age_0_7': 0, 'age_60_above': 0}),
      );

      expect(tileValue(tester, 'FOREIGNER'), '0');
      expect(tileValue(tester, 'AGE 0-7'), '0');
      expect(tileValue(tester, 'AGE 60+'), '0');

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isTrue);
      expect(h.saved!['foreigner_count'], 0);
      expect(h.saved!['age_0_7'], 0);
      expect(h.saved!['age_60_above'], 0);
    });

    testWidgets('every count 0 is saved as 0 (0 is never "missing")', (
      tester,
    ) async {
      final h = await pumpEdit(tester, {
        ...record(),
        for (final key in countKeys) key: 0,
      });

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isTrue);
      for (final key in countKeys) {
        expect(h.saved![key], 0, reason: key);
      }
    });

    testWidgets('a missing total is typed in, not fixed at 1', (tester) async {
      final h = await pumpEdit(tester, without(['total_visitors']));

      // Empty, with its own + to enter it.
      expect(tileValue(tester, 'TOTAL GUESTS'), '');
      final column = find
          .ancestor(of: find.text('TOTAL GUESTS'), matching: find.byType(Column))
          .first;
      final plus = find.descendant(of: column, matching: find.byIcon(Icons.add));
      expect(plus, findsOneWidget);

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(h.returned, isFalse);
      expect(
        find.text('Enter the missing count before saving: Total guests.'),
        findsOneWidget,
      );

      await tester.tap(plus);
      await tester.pump();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(h.returned, isTrue);
      expect(h.saved!['total_visitors'], 1);
    });
  });

  group('status chip in the history list (not the pending of nothing)', () {
    Future<void> showStatus(WidgetTester tester, Object? status) {
      return pumpHistory(tester, [
        record({'status': status, 'full_name': 'chip person'}),
      ]);
    }

    for (final entry in {
      'arrived': 'Arrived',
      'pending': 'Pending',
      'no_show': 'No-show',
      'ARRIVED': 'Arrived',
    }.entries) {
      testWidgets('status "${entry.key}": the "${entry.value}" chip', (
        tester,
      ) async {
        await showStatus(tester, entry.key);

        expect(find.text(entry.value), findsOneWidget);
        expect(find.text('Chip Person'), findsOneWidget);
        for (final other in ['Arrived', 'Pending', 'No-show']) {
          if (other != entry.value) {
            expect(find.text(other), findsNothing, reason: other);
          }
        }
      });
    }

    for (final entry in {
      'missing': () => without(['status']),
      'null': () => record({'status': null}),
      'blank': () => record({'status': '   '}),
      'unknown': () => record({'status': 'on_hold'}),
    }.entries) {
      testWidgets('status ${entry.key}: no chip at all, and not "Pending"', (
        tester,
      ) async {
        await pumpHistory(tester, [entry.value()]);

        expect(find.text('Pending'), findsNothing);
        expect(find.text('Arrived'), findsNothing);
        expect(find.text('No-show'), findsNothing);
        expect(find.text('Unknown'), findsNothing);
        // The record itself is still listed.
        expect(find.text('Sample Person'), findsOneWidget);
      });
    }

    test('touristStatusChip: only the three real statuses have a chip', () {
      expect(touristStatusChip('arrived')?.label, 'Arrived');
      expect(touristStatusChip('pending')?.label, 'Pending');
      expect(touristStatusChip('no_show')?.label, 'No-show');
      expect(touristStatusChip(null), isNull);
      expect(touristStatusChip(''), isNull);
      expect(touristStatusChip('on_hold'), isNull);
    });
  });

  group('the check-in itself', () {
    testWidgets('does not send a record that has counts missing', (
      tester,
    ) async {
      await pumpCard(tester, noCounts());

      await tester.tap(find.textContaining('Save'));
      await tester.pump();

      expect(find.textContaining('before saving'), findsOneWidget);
    });
  });

  group('kept as they were', () {
    testWidgets('a missing e-mail is the honest label "Not provided"', (
      tester,
    ) async {
      await pumpCard(tester, without(['email']));
      expect(find.text('Not provided'), findsWidgets);
    });
  });

  group('presentCount', () {
    test('ints, numbers and numeric text; blank and junk are null; 0 is 0', () {
      expect(presentCount(5), 5);
      expect(presentCount(0), 0);
      expect(presentCount(3.0), 3);
      expect(presentCount('4'), 4);
      expect(presentCount(' 2 '), 2);
      expect(presentCount(null), isNull);
      expect(presentCount(''), isNull);
      expect(presentCount('   '), isNull);
      expect(presentCount('many'), isNull);
    });
  });
}
