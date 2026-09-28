import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final householdCode in <String?>[null, 'HH-REMARKS-TEST']) {
    test('household ${householdCode == null ? 'create' : 'update'} omits remarks', () async {
      Map<String, dynamic>? sent;
      final client = MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/mobile/sanitation/household-surveys/');
        sent = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response('{"household_code":"HH-REMARKS-TEST"}', 201);
      });
      addTearDown(client.close);

      await http.runWithClient(() async {
        await const TourismApi().submitHouseholdSurvey(
          householdCode: householdCode,
          householdHead: 'Local Survey Household',
          barangay: 'Daungan',
          address: 'Test address',
          maleCount: 2,
          femaleCount: 3,
          toiletType: 'water_sealed',
          waterLevel: 'level_3',
          waterSource: 'MWSS',
          wasteDisposal: 'collected',
          latitude: '14.19',
          longitude: '121.73',
        );
      }, () => client);

      expect(sent, isNotNull);
      expect(sent!.containsKey('remarks'), isFalse,
          reason: 'An empty remarks key would erase existing web notes.');
      expect(sent, {
        'household_head': 'Local Survey Household',
        'barangay': 'Daungan',
        'address': 'Test address',
        'male_count': 2,
        'female_count': 3,
        'toilet_type': 'water_sealed',
        'water_level': 'level_3',
        'water_source': 'MWSS',
        'waste_disposal': 'collected',
        'latitude': '14.19',
        'longitude': '121.73',
        'household_code': ?householdCode,
      });
    });
  }

  testWidgets('household form has no Remarks input', (tester) async {
    tester.view.physicalSize = const Size(1200, 5000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
      home: HouseholdSurveyPage(
        api: const TourismApi(),
        barangays: SanitationBootstrap.fallback().barangays,
      ),
    ));
    await tester.pump();
    expect(find.widgetWithText(AppTextField, 'Household head'), findsOneWidget);
    expect(find.widgetWithText(AppTextField, 'Remarks'), findsNothing);
  });
}
