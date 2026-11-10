// The record card of the staff QR scanner is READ-ONLY, for every role. Nothing on it is edited at the door (the visitor paid before arriving, and the count
// they paid for is already in the record); the only action is Check in, and it sends the arrival and nothing else. The lines of the record stand on one
// vertical line, and nothing runs out of the screen. Synthetic data only.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CapturingApi extends TourismApi {
  final List<Map<String, dynamic>> checkIns = [];

  @override
  Future<Map<String, dynamic>> checkInTouristRecord(Map<String, dynamic> payload) async {
    checkIns.add(Map<String, dynamic>.from(payload));
    return {};
  }
}

Map<String, dynamic> record([Map<String, dynamic> over = const {}]) => {
  'survey_id': 'SURV-TEST-001',
  'full_name': 'sample person',
  'email': 'sample@example.test',
  'contact_number': '09000000000',
  'country_name': 'Philippines',
  'region_name': 'CALABARZON Region',
  'province_name': 'Quezon',
  'resort_name': 'Sample Beach 1',
  'itinerary_name': 'Overnight',
  'travel_mode_name': 'Private Vehicle',
  'boat_type_name': 'Tourist Boat',
  'visit_purpose_name': 'Leisure',
  'arrival_date': '2026-10-12',
  'total_visitors': 4,
  'filipino_count': 3,
  'foreigner_count': 1,
  'total_male': 2,
  'total_female': 2,
  'age_0_7': 1,
  'age_8_59': 2,
  'age_60_above': 1,
  'status': 'arrived',
  ...over,
};

final longRecord = record({
  'email': 'maria.clara.magdalena.de.los.santos.villanueva@example-long-domain-name.test',
  'contact_number': '+63 900 000 0000 loc. 1234 (after office hours only)',
  'country_name': 'United Kingdom of Great Britain and Northern Ireland',
  'region_name': 'Region IV-A (CALABARZON) — Calabarzon Administrative Region',
  'province_name': 'Quezon Province, Southern Tagalog Peninsula',
  'resort_name': 'Dona Choleng Camping and Beach Resort and Events Place of Mauban, Quezon',
  'itinerary_name': 'Overnight stay with the island hopping tour and the lighthouse visit',
  'travel_mode_name': 'Private Vehicle with a trailer, parked at the resort ground',
  'boat_type_name': 'Motorized outrigger tourist boat with a roof and life vests',
  'visit_purpose_name': 'Leisure, family reunion and the celebration of an anniversary',
});

const countKeys = ['total_visitors', 'filipino_count', 'foreigner_count', 'total_male', 'total_female', 'age_0_7', 'age_8_59', 'age_60_above'];

/// Pumps the card at [width]; overflow warnings are collected (and given back BEFORE any expect) instead of thrown.
Future<List<String>> pumpCard(
  WidgetTester tester,
  Map<String, dynamic> data, {
  double width = 411,
  double scale = 1.0,
  TourismApi api = const TourismApi(),
}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = Size(width, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final seen = <String>[];
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed')) {
      seen.add(text.split('\n').first);
    } else {
      previous?.call(details);
    }
  };
  try {
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: ScannedTouristRecordSheet(recordData: data, api: api, bootstrap: MobileBootstrap.fallback()),
      ),
    );
    await tester.pump();
  } finally {
    FlutterError.onError = previous;
  }
  return seen;
}

/// The Text with the VALUE of a line of the record, found from its label: the last Text of the row that holds the label.
Finder valueOf(String label) => find.descendant(of: find.ancestor(of: find.text(label), matching: find.byType(Row)).first, matching: find.byType(Text)).last;
Finder labelOf(String label) => find.text(label);

const identity = ['Email', 'Contact', 'Country'];
const trip = ['Resort', 'Region / Province', 'Itinerary', 'Travel Mode', 'Boat Type', 'Visit Purpose'];

void main() {
  group('nothing on the card is edited', () {
    for (final entry in {'a complete record': record(), 'a record with no counts': record({for (final k in countKeys) k: null})}.entries) {
      testWidgets('${entry.key}: no box to type in, no dropdown, no + or -, no Edit Info', (tester) async {
        await pumpCard(tester, entry.value);
        expect(find.text('Cancel'), findsOneWidget); // the fixture reached the case: the card is drawn
        expect(find.byType(TextField), findsNothing);
        expect(find.byType(TextFormField), findsNothing);
        expect(find.byType(EditableText), findsNothing);
        expect(find.byType(DropdownButton<int>), findsNothing);
        expect(find.byType(DropdownButton<String>), findsNothing);
        expect(find.byType(DropdownButtonFormField<int>), findsNothing);
        expect(find.byType(DropdownButtonFormField<String>), findsNothing);
        expect(find.byIcon(Icons.add), findsNothing);
        expect(find.byIcon(Icons.remove), findsNothing);
        expect(find.byIcon(Icons.edit), findsNothing);
        for (final word in ['+', '−', '-', 'Edit Info', 'See Info', 'Edit']) {
          expect(find.text(word), findsNothing, reason: word);
        }
        expect(find.textContaining('Save'), findsNothing);
      });
    }

    testWidgets('the only buttons are Cancel and Check in', (tester) async {
      await pumpCard(tester, record());
      expect(find.text('Check in'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.byWidgetPredicate((widget) => widget is ButtonStyleButton), findsNWidgets(2));
      expect(find.byType(IconButton), findsNothing);
      // nothing else on the card can be pressed: every touch target (ink) is inside one of the two buttons
      for (final ink in find.byType(InkWell).evaluate()) {
        expect(find.ancestor(of: find.byWidget(ink.widget), matching: find.byWidgetPredicate((widget) => widget is ButtonStyleButton)), findsOneWidget);
      }
    });

    testWidgets('the header, the QR, VERIFIED and the two pills are as they were', (tester) async {
      await pumpCard(tester, record());
      for (final text in ['RECORD ID', 'SURV-TEST-001', 'VERIFIED', 'ARRIVAL DATE', '2026-10-12', 'TOTAL GUESTS', '4 Visitors']) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
      expect(find.text('Scan this QR to verify the visitor on arrival.'), findsOneWidget);
      expect(find.text('Tourist Qr Check-In'), findsOneWidget);
    });
  });

  group('the check-in sends the arrival and nothing else', () {
    testWidgets('the body has the survey ID and the status, and NO count', (tester) async {
      final api = CapturingApi();
      await pumpCard(tester, record(), api: api);
      await tester.ensureVisible(find.text('Check in'));
      await tester.tap(find.text('Check in'));
      await tester.pumpAndSettle();
      expect(api.checkIns, hasLength(1));
      expect(api.checkIns.single.keys.toSet(), {'survey_id', 'status'});
      expect(api.checkIns.single['survey_id'], 'SURV-TEST-001');
      expect(api.checkIns.single['status'], 'arrived');
      for (final key in countKeys) {
        expect(api.checkIns.single.containsKey(key), isFalse, reason: key);
      }
      expect(find.text('Verified & Recorded'), findsOneWidget);
    });

    testWidgets('a record with no counts at all is checked in all the same, and without counts', (tester) async {
      final api = CapturingApi();
      await pumpCard(tester, record({for (final k in countKeys) k: null}), api: api);
      await tester.ensureVisible(find.text('Check in'));
      await tester.tap(find.text('Check in'));
      await tester.pumpAndSettle();
      expect(api.checkIns, hasLength(1));
      expect(api.checkIns.single.keys.toSet(), {'survey_id', 'status'});
      expect(find.textContaining('before saving'), findsNothing);
    });

    testWidgets('Cancel leaves without asking the server for anything', (tester) async {
      final api = CapturingApi();
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(411, 4000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ScannedTouristRecordSheet(recordData: record(), api: api, bootstrap: MobileBootstrap.fallback())),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byType(ScannedTouristRecordSheet), findsOneWidget);
      await tester.ensureVisible(find.text('Cancel'));
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.byType(ScannedTouristRecordSheet), findsNothing);
      expect(api.checkIns, isEmpty);
    });
  });

  group('the values stand on one vertical line', () {
    for (final width in [320.0, 360.0, 390.0, 411.0]) {
      testWidgets('at ${width.toInt()} wide, with every value long: one left edge for the labels, one for the values', (tester) async {
        final seen = await pumpCard(tester, longRecord, width: width);
        expect(seen, isEmpty);
        final labelsLeft = {for (final l in [...identity, ...trip]) tester.getTopLeft(labelOf(l)).dx};
        final valuesLeft = {for (final l in [...identity, ...trip]) tester.getTopLeft(valueOf(l)).dx};
        expect(labelsLeft, hasLength(1), reason: 'the labels start at $labelsLeft');
        expect(valuesLeft, hasLength(1), reason: 'the values start at $valuesLeft');
        // the values are to the right of the labels, and inside the screen
        final labelRight = [for (final l in [...identity, ...trip]) tester.getTopRight(labelOf(l)).dx].reduce((a, b) => a > b ? a : b);
        expect(valuesLeft.single, greaterThan(labelRight - 0.01));
        for (final l in [...identity, ...trip]) {
          expect(tester.getTopRight(valueOf(l)).dx, lessThanOrEqualTo(width));
        }
      });
    }

    testWidgets('the value is left-aligned inside its own column, not right-aligned', (tester) async {
      await pumpCard(tester, record());
      for (final l in [...identity, ...trip]) {
        final text = tester.widget<Text>(valueOf(l));
        expect(text.textAlign, TextAlign.start, reason: l);
      }
      // a SHORT value starts at the edge of the column too (a right-aligned one would end at the right edge)
      final shortLeft = tester.getTopLeft(valueOf('Country')).dx;
      expect(tester.getTopLeft(valueOf('Email')).dx, shortLeft);
      expect(tester.getTopLeft(valueOf('Resort')).dx, shortLeft);
    });

    testWidgets('the first letter of a short value is AT the edge of its column (measured in the paragraph: a right-aligned text starts far from it)', (tester) async {
      await pumpCard(tester, record());
      final shortLeft = tester.getTopLeft(valueOf('Country')).dx;
      for (final l in ['Country', 'Email', 'Resort', 'Itinerary']) {
        final paragraph = tester.renderObject<RenderParagraph>(valueOf(l));
        final first = paragraph.getBoxesForSelection(const TextSelection(baseOffset: 0, extentOffset: 1)).first;
        expect(tester.getTopLeft(valueOf(l)).dx + first.left, closeTo(shortLeft, 0.5), reason: '$l starts at the edge of its column');
      }
    });

    testWidgets('the identity and the trip groups share the same edge', (tester) async {
      await pumpCard(tester, record());
      expect(tester.getTopLeft(valueOf('Email')).dx, tester.getTopLeft(valueOf('Visit Purpose')).dx);
    });

    testWidgets('a long value is WRAPPED inside its column, not cut with dots', (tester) async {
      await pumpCard(tester, longRecord, width: 320);
      for (final l in ['Resort', 'Region / Province']) {
        final text = tester.widget<Text>(valueOf(l));
        expect(text.overflow, isNull, reason: l);
        expect(text.maxLines, isNull, reason: l);
        expect(tester.getSize(valueOf(l)).height, greaterThan(20), reason: '$l is on more than one line');
      }
    });

    testWidgets('the visitor breakdown: the numbers of a column stand on one line, too', (tester) async {
      await pumpCard(tester, record());
      double dx(String label) => tester.getTopLeft(find.byKey(ValueKey('count-$label'))).dx;
      final left = {dx('Filipino'), dx('Male'), dx('Age 0-7'), dx('Age 60+')};
      final right = {dx('Foreigner'), dx('Female'), dx('Age 8-59')};
      expect(left, hasLength(1), reason: 'left column $left');
      expect(right, hasLength(1), reason: 'right column $right');
      expect(left.single, lessThan(right.single));
      // and the labels of a column start together, too
      expect({tester.getTopLeft(find.text('Filipino')).dx, tester.getTopLeft(find.text('Male')).dx, tester.getTopLeft(find.text('Age 0-7')).dx}, hasLength(1));
    });
  });

  group('nothing runs out of the screen', () {
    for (final width in [320.0, 360.0, 390.0]) {
      testWidgets('at ${width.toInt()} wide, with every line long', (tester) async {
        final seen = await pumpCard(tester, longRecord, width: width);
        expect(find.textContaining('Dona Choleng Camping'), findsOneWidget); // the fixture reached the case
        expect(seen, isEmpty);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('at 320 wide with the text at 130% too', (tester) async {
      final seen = await pumpCard(tester, longRecord, width: 320, scale: 1.3);
      expect(find.textContaining('Dona Choleng Camping'), findsOneWidget);
      expect(seen, isEmpty);
    });
  });
}
