// A mobile registration used to carry no discounted_count, so the server saved
// 0 and charged every visitor the regular fee (PHP 80), while the same group
// booked on the web paid PHP 64 each for children 0-7, seniors 60+ and special
// needs. The app now sends the web's own number: suggestedDiscountedCount in
// frontend/src/tourism/utils/entranceFee.js,
//   min(age_0_7 + age_60_above + special_group_count, filipino + foreigner).
// The payload is checked through a mocked HTTP client: nothing is sent to a
// real backend.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

// services/tourism.py entrance_fee and frontend entranceFee.js.
const regularFee = 80;
const discountedFee = 64;

int entranceFee(int visitors, int discounted) =>
    (visitors - discounted) * regularFee + discounted * discountedFee;

int suggested({
  int filipino = 0,
  int foreigner = 0,
  int age0To7 = 0,
  int age60Above = 0,
  int specialGroup = 0,
}) => suggestedDiscountedCount(
  filipino: filipino,
  foreigner: foreigner,
  age0To7: age0To7,
  age60Above: age60Above,
  specialGroup: specialGroup,
);

Future<void> pumpForm(WidgetTester tester) async {
  tester.view.physicalSize = const Size(411, 7000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    if (details.exceptionAsString().contains('overflowed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);

  final bootstrap = MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 7, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': <String, dynamic>{},
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
  await tester.pumpWidget(
    MaterialApp(
      home: TouristRegistrationPage(
        api: const TourismApi(),
        bootstrap: bootstrap,
      ),
    ),
  );
  await tester.pump();
}

Future<void> plus(WidgetTester tester, String label, int times) async {
  final row = find
      .ancestor(of: find.text(label), matching: find.byType(Row))
      .first;
  final button = find.descendant(of: row, matching: find.byIcon(Icons.add));
  await tester.ensureVisible(button);
  for (var i = 0; i < times; i++) {
    await tester.tap(button);
    await tester.pump();
  }
}

Future<Map<String, dynamic>> submit(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
  await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
  await tester.enterText(
    find.widgetWithText(TextField, 'Contact number *'),
    '09000000000',
  );
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
  expect(bodies, hasLength(1), reason: 'the form was not submitted');
  return bodies.single;
}

void main() {
  group('the web formula (suggestedDiscountedCount)', () {
    test('children 0-7 count', () {
      expect(suggested(filipino: 4, age0To7: 2), 2);
    });

    test('seniors 60+ count', () {
      expect(suggested(filipino: 4, age60Above: 1), 1);
    });

    test('special needs count', () {
      expect(suggested(foreigner: 4, specialGroup: 3), 3);
    });

    test('the three add up', () {
      expect(
        suggested(filipino: 5, foreigner: 5, age0To7: 1, age60Above: 2, specialGroup: 3),
        6,
      );
    });

    test('capped at filipino + foreigner (a senior who is special needs too)', () {
      // 2 seniors + 2 special needs in a group of 3: 4 would be more than 3.
      expect(suggested(filipino: 3, age60Above: 2, specialGroup: 2), 3);
      expect(suggested(filipino: 1, foreigner: 1, age0To7: 5), 2);
    });

    test('0 is 0, and all of them is the total (the server allows both)', () {
      expect(suggested(filipino: 4), 0);
      expect(suggested(), 0);
      expect(suggested(filipino: 2, age0To7: 2), 2);
      expect(suggested(filipino: 2, specialGroup: 2), 2);
    });

    test('a negative count is 0, as the web\'s toCount', () {
      expect(suggested(filipino: 3, age0To7: -2, specialGroup: 1), 1);
      expect(suggested(filipino: -3, foreigner: 2, age0To7: 5), 2);
    });

    test('the cap uses filipino + foreigner, not any other total', () {
      expect(suggested(filipino: 2, foreigner: 1, age0To7: 3), 3);
    });
  });

  group('the form sends it', () {
    testWidgets('a group of 4 with 2 children: PHP 288, not PHP 320', (
      tester,
    ) async {
      await pumpForm(tester);
      await plus(tester, 'Total Visitors', 3); // 4 visitors
      await plus(tester, 'Age 0-7 (Children)', 2);

      final body = await submit(tester);

      expect(body['total_visitors'], 4);
      expect(body['age_0_7'], 2);
      expect(body['special_group_count'], 0);
      expect(body['discounted_count'], 2);
      final fee = entranceFee(
        body['total_visitors'] as int,
        body['discounted_count'] as int,
      );
      expect(fee, 288);
      expect(fee, isNot(320)); // what every mobile registration was charged
    });

    testWidgets('a senior who is special needs too is not counted twice', (
      tester,
    ) async {
      await pumpForm(tester);
      await plus(tester, 'Total Visitors', 2); // 3 visitors
      await plus(tester, 'Age 60+ (Seniors)', 2);
      await plus(tester, 'Special Needs', 2);

      final body = await submit(tester);

      expect(body['total_visitors'], 3);
      expect(body['age_60_above'], 2);
      expect(body['special_group_count'], 2);
      // 2 + 2 = 4, capped at filipino + foreigner = 3.
      expect(body['discounted_count'], 3);
      expect(body['filipino_count'] + body['foreigner_count'], 3);
    });

    testWidgets('special needs is still sent on its own, as well', (
      tester,
    ) async {
      await pumpForm(tester);
      await plus(tester, 'Total Visitors', 3);
      await plus(tester, 'Special Needs', 1);

      final body = await submit(tester);

      expect(body['special_group_count'], 1);
      expect(body['discounted_count'], 1);
      expect(body['age_0_7'], 0);
      expect(body['age_60_above'], 0);
    });

    testWidgets('nobody discounted: discounted_count is sent as 0', (
      tester,
    ) async {
      await pumpForm(tester);
      await plus(tester, 'Total Visitors', 1); // 2 visitors

      final body = await submit(tester);

      expect(body.containsKey('discounted_count'), isTrue);
      expect(body['discounted_count'], 0);
      expect(entranceFee(2, 0), 160);
    });

    testWidgets('everybody discounted: discounted_count equals the total', (
      tester,
    ) async {
      await pumpForm(tester);
      await plus(tester, 'Total Visitors', 1); // 2 visitors
      await plus(tester, 'Special Needs', 2);

      final body = await submit(tester);

      expect(body['total_visitors'], 2);
      expect(body['discounted_count'], 2);
      expect(entranceFee(2, 2), 128);
    });

    testWidgets('a senior only counts, without special needs', (tester) async {
      await pumpForm(tester);
      await plus(tester, 'Total Visitors', 1);
      await plus(tester, 'Age 60+ (Seniors)', 1);

      final body = await submit(tester);

      expect(body['special_group_count'], 0);
      expect(body['age_60_above'], 1);
      expect(body['discounted_count'], 1);
    });
  });
}
