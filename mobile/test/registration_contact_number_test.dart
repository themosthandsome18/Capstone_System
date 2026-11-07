// The Contact Number on Tourist Registration is +63 and exactly 10 digits,
// the same as the admin's Add Record form. The payload is checked through a
// mocked HTTP client: nothing is sent to a real backend.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

MobileBootstrap bootstrap({List<Map<String, Object?>>? countries}) {
  return MobileBootstrap.fromJson({
    'destinations': [
      {'resort_id': 7, 'resort_name': 'Sample Beach 1', 'type': 'Beach Resort'},
    ],
    'referenceTables': {
      'countries':
          countries ??
          [
            {'id': 1, 'name': 'Philippines', 'type': 'local'},
            {'id': 2, 'name': 'United States', 'type': 'foreign'},
            {'id': 6, 'name': 'International', 'type': 'foreign'},
          ],
      'regions': [
        {'id': 4, 'name': 'CALABARZON Region'},
        {'id': 7, 'name': 'Region VII'},
      ],
      'provinces': [
        {'id': 1, 'name': 'Quezon', 'region_id': 4},
        {'id': 9, 'name': 'Cebu', 'region_id': 7},
        {'id': 10, 'name': 'Bohol', 'region_id': 7},
      ],
      'boatTypes': [
        {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': true},
      ],
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
        // The Destination field starts blank unless a resort was tapped; these
        // tests are about other fields, so they open the form as if one was.
        initialDestination: b.destinations.first,
      ),
    ),
  );
  await tester.pump();
}

Finder contactField() => find.widgetWithText(TextField, 'Contact number *');

String boxText(WidgetTester tester) =>
    tester.widget<TextField>(contactField()).controller!.text;

Future<List<Map<String, dynamic>>> submitWith(WidgetTester tester, String contact) async {
  await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
  await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
  await tester.enterText(contactField(), contact);
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


void main() {
  styleTests();
  testWidgets('the box shows +63 and 9XXXXXXXXX, and holds 10 digits', (tester) async {
    await pumpForm(tester, bootstrap());
    final field = tester.widget<TextField>(contactField());
    expect(field.decoration!.prefixText, startsWith('+63'));
    expect(field.decoration!.hintText, '9XXXXXXXXX');
    expect(field.maxLength, 10);
  });

  testWidgets('an 11th digit does not go in', (tester) async {
    await pumpForm(tester, bootstrap());
    await tester.enterText(contactField(), '91712345678');
    expect(boxText(tester), '9171234567');
  });

  testWidgets('letters and symbols do not go in', (tester) async {
    await pumpForm(tester, bootstrap());
    await tester.enterText(contactField(), '9a1-7 (2)x3.4#5');
    expect(boxText(tester), '917234' '5');
  });

  testWidgets('a number starting with 0 or +63 is brought to 10 digits', (tester) async {
    await pumpForm(tester, bootstrap());
    await tester.enterText(contactField(), '09171234567');
    expect(boxText(tester), '9171234567');
    await tester.enterText(contactField(), '+639171234567');
    expect(boxText(tester), '9171234567');
    expect(contactDigits('+63 917 123 4567'), '9171234567');
    expect(contactDigits('0917-123-4567'), '9171234567');
  });

  testWidgets('9 digits: not sent, and the message says 10 digits', (tester) async {
    await pumpForm(tester, bootstrap());
    final bodies = await submitWith(tester, '917123456');
    expect(bodies, isEmpty);
    expect(find.text('Contact Number must be exactly 10 digits (after +63).'), findsOneWidget);
  });

  testWidgets('10 digits: +63 and the 10 digits are sent', (tester) async {
    await pumpForm(tester, bootstrap());
    final bodies = await submitWith(tester, '9171234567');
    expect(bodies, hasLength(1));
    expect(bodies.single['contact_number'], '+639171234567');
  });
}

void styleTests() {
  testWidgets('+63 is w600 and the hint is paler than what the user types', (tester) async {
    await pumpForm(tester, bootstrap());
    final d = tester.widget<TextField>(contactField()).decoration!;
    expect(d.prefixStyle!.fontWeight, FontWeight.w600);
    expect(d.hintStyle!.color, AppColors.muted);
    expect(d.hintStyle!.color, isNot(d.prefixStyle!.color));
    expect(d.hintStyle!.fontWeight, isNull, reason: 'the hint is not bold');
    // No size change: neither style sets a font size.
    expect(d.prefixStyle!.fontSize, isNull);
    expect(d.hintStyle!.fontSize, isNull);
  });
}
