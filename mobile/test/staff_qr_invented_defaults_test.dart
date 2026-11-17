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
    testWidgets('with a value: shown on the card', (tester) async {
      await pumpCard(tester, record());
      expect(find.text('ARRIVAL DATE'), findsOneWidget);
      expect(find.text('2026-10-12'), findsOneWidget);
    });

    for (final entry in {
      'missing': () => without(['arrival_date']),
      'blank': () => record({'arrival_date': ' '}),
    }.entries) {
      testWidgets('${entry.key}: not on the card', (tester) async {
        await pumpCard(tester, entry.value());
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

  group('status chip in the history list (not the pending of nothing)', () {
    Future<void> showStatus(WidgetTester tester, Object? status) {
      return pumpHistory(tester, [
        record({'status': status, 'full_name': 'chip person'}),
      ]);
    }

    for (final entry in {
      'arrived': 'Arrived',
      'pending': 'Pending',
      'no_show': 'Cancelled',
      'ARRIVED': 'Arrived',
    }.entries) {
      testWidgets('status "${entry.key}": the "${entry.value}" chip', (
        tester,
      ) async {
        await showStatus(tester, entry.key);

        expect(find.text(entry.value), findsOneWidget);
        expect(find.text('Chip Person'), findsOneWidget);
        for (final other in ['Arrived', 'Pending', 'Cancelled']) {
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
        expect(find.text('Cancelled'), findsNothing);
        expect(find.text('Unknown'), findsNothing);
        // The record itself is still listed.
        expect(find.text('Sample Person'), findsOneWidget);
      });
    }

    test('touristStatusChip: only the three real statuses have a chip', () {
      expect(touristStatusChip('arrived')?.label, 'Arrived');
      expect(touristStatusChip('pending')?.label, 'Pending');
      expect(touristStatusChip('no_show')?.label, 'Cancelled');
      expect(touristStatusChip(null), isNull);
      expect(touristStatusChip(''), isNull);
      expect(touristStatusChip('on_hold'), isNull);
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
