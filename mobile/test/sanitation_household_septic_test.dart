import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const septicChoices = {
  'bottomless': 'Bottomless',
  'vault_sealed': 'Vault-sealed',
};

class SurveyApi extends TourismApi {
  Map<String, dynamic>? submitted;

  @override
  Future<Map<String, dynamic>> submitHouseholdSurvey({
    HouseholdSanitationItem? originalHousehold,
    String? householdCode,
    String? septicTankType,
    required String householdHead,
    required String barangay,
    required String address,
    required int maleCount,
    required int femaleCount,
    required String toiletType,
    required String waterLevel,
    required String waterSource,
    required String wasteDisposal,
    required String latitude,
    required String longitude,
  }) async {
    submitted = {
      'household_code': householdCode,
      'toilet_type': toiletType,
      'septic_tank_type': septicTankType,
      'address': address,
    };
    return {
      'household_code': householdCode ?? 'HH-NEW',
      'status': 'for_completion',
    };
  }
}

HouseholdSanitationItem record(String toilet, String? septic) =>
    HouseholdSanitationItem.fromJson({
      'id': 1,
      'household_code': 'HH-EDIT',
      'household_head': 'Existing household',
      'barangay': 'Daungan',
      'address': 'Stored address',
      'male_count': 2,
      'female_count': 3,
      'water_level': 'level_2',
      'water_source': 'Spring',
      'waste_disposal': 'composted',
      'toilet_type': toilet,
      'septic_tank_type': septic,
      'latitude': 14.19,
      'longitude': 121.73,
    });

Finder dropdown(String label) => find.byWidgetPredicate(
  (widget) => widget is HouseholdChoiceField && widget.label == label,
);

Future<void> choose(WidgetTester tester, String control, String label) async {
  final chip = find.descendant(of: dropdown(control), matching: find.widgetWithText(ChoiceChip, label));
  await tester.ensureVisible(chip);
  await tester.tap(chip);
  await tester.pumpAndSettle();
}

Future<SurveyApi> pumpSurvey(
  WidgetTester tester, {
  HouseholdSanitationItem? household,
}) async {
  tester.view.physicalSize = const Size(1200, 5000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final api = SurveyApi();
  await tester.pumpWidget(
    MaterialApp(
      home: HouseholdSurveyPage(
        api: api,
        barangays: SanitationBootstrap.fallback().barangays,
        household: household,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

Future<void> readyToSubmit(WidgetTester tester) async {
  await tester.enterText(
    find.widgetWithText(AppTextField, 'Household head'),
    'Local household',
  );
  await tester.enterText(
    find.widgetWithText(AppTextField, 'Latitude'),
    '14.19',
  );
  await tester.enterText(
    find.widgetWithText(AppTextField, 'Longitude'),
    '121.73',
  );
  await tester.pump();
  tester
      .widget<LocationConfirmationPanel>(find.byType(LocationConfirmationPanel))
      .onConfirm();
  tester
      .widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel))
      .onChanged(true);
  await tester.pump();
}

Future<void> submit(WidgetTester tester) async {
  await tester.tap(find.text('Submit Household Survey'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('parser retains backend toilet and septic fields', () {
    for (final toilet in [
      'water_sealed',
      'pour_flush',
      'pit_latrine',
      'none',
    ]) {
      final item = record(toilet, 'vault_sealed');
      expect(item.toiletType, toilet);
      expect(item.septicTankType, 'vault_sealed');
    }
  });

  for (final toilet in ['water_sealed', 'pour_flush']) {
    testWidgets('$toilet shows the exact two septic choices', (tester) async {
      await pumpSurvey(tester);
      await choose(tester, 'Toilet facility', householdToiletLabel(toilet));
      expect(dropdown('Septic tank type'), findsOneWidget);
      final dynamic tile = tester.widget(dropdown('Septic tank type'));
      expect(tile.value, isNull);
      expect(tile.items, septicChoices.keys.toList());
      for (final label in septicChoices.values) {
        expect(find.text(label).hitTestable(), findsOneWidget);
      }
    });

    testWidgets('new $toilet requires septic selection', (tester) async {
      final api = await pumpSurvey(tester);
      await choose(tester, 'Toilet facility', householdToiletLabel(toilet));
      await readyToSubmit(tester);
      await submit(tester);
      expect(api.submitted, isNull);
      expect(find.text('Septic tank type is required.'), findsOneWidget);
    });
  }

  for (final toilet in ['pit_latrine', 'none']) {
    testWidgets('$toilet hides selector and submits without septic', (
      tester,
    ) async {
      final api = await pumpSurvey(tester);
      await choose(tester, 'Toilet facility', householdToiletLabel(toilet));
      expect(dropdown('Septic tank type'), findsNothing);
      await readyToSubmit(tester);
      await submit(tester);
      expect(api.submitted?['toilet_type'], toilet);
      expect(api.submitted?['septic_tank_type'], isNull);
    });

    testWidgets(
      'switch to $toilet clears and switching back requires reselection',
      (tester) async {
        final api = await pumpSurvey(
          tester,
          household: record('water_sealed', 'septic_tank'),
        );
        expect(dropdown('Septic tank type'), findsOneWidget);
        await choose(tester, 'Toilet facility', householdToiletLabel(toilet));
        expect(dropdown('Septic tank type'), findsNothing);
        await choose(
          tester,
          'Toilet facility',
          householdToiletLabel('pour_flush'),
        );
        final dynamic tile = tester.widget(dropdown('Septic tank type'));
        expect(tile.value, isNull);
        await readyToSubmit(tester);
        await submit(tester);
        expect(api.submitted, isNull);
        expect(find.text('Septic tank type is required.'), findsOneWidget);
      },
    );

    testWidgets('edit to $toilet submits no stale selection', (tester) async {
      final api = await pumpSurvey(
        tester,
        household: record('pour_flush', 'vault_sealed'),
      );
      await choose(tester, 'Toilet facility', householdToiletLabel(toilet));
      await readyToSubmit(tester);
      await submit(tester);
      expect(api.submitted?['household_code'], 'HH-EDIT');
      expect(api.submitted?['toilet_type'], toilet);
      expect(api.submitted?['septic_tank_type'], isNull);
    });
  }

  for (final entry in {
    'water_sealed': 'septic_tank',
    'pour_flush': 'vault_sealed',
    'pit_latrine': null,
    'none': null,
  }.entries) {
    testWidgets(
      'existing ${entry.key} initializes and unrelated edit preserves data',
      (tester) async {
        final api = await pumpSurvey(
          tester,
          household: record(entry.key, entry.value),
        );
        final dynamic toilet = tester.widget(dropdown('Toilet facility'));
        expect(toilet.value, entry.key);
        if (entry.value != null) {
          final dynamic septic = tester.widget(dropdown('Septic tank type'));
          expect(septic.value, entry.value);
        } else {
          expect(dropdown('Septic tank type'), findsNothing);
        }
        await tester.enterText(
          find.widgetWithText(AppTextField, 'Address'),
          'Updated address',
        );
        tester
            .widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel))
            .onChanged(true);
        await tester.pump();
        await submit(tester);
        expect(api.submitted, {
          'household_code': 'HH-EDIT',
          'toilet_type': entry.key,
          'septic_tank_type': entry.value,
          'address': 'Updated address',
        });
      },
    );
  }

  testWidgets('applicable toilet change retains a selected septic value', (
    tester,
  ) async {
    final api = await pumpSurvey(tester);
    await choose(tester, 'Septic tank type', 'Bottomless');
    await choose(tester, 'Toilet facility', householdToiletLabel('pour_flush'));
    final dynamic tile = tester.widget(dropdown('Septic tank type'));
    expect(tile.value, 'bottomless');
    await readyToSubmit(tester);
    await submit(tester);
    expect(api.submitted?['septic_tank_type'], 'bottomless');
    expect(find.text('Survey submitted'), findsOneWidget);
    expect(find.widgetWithText(AppTextField, 'Remarks'), findsNothing);
  });

  testWidgets('legacy applicable edit may keep an absent septic value', (
    tester,
  ) async {
    final api = await pumpSurvey(tester, household: record('pour_flush', null));
    await readyToSubmit(tester);
    await submit(tester);
    expect(api.submitted?['toilet_type'], 'pour_flush');
    expect(api.submitted?['septic_tank_type'], isNull);
  });

  for (final toilet in ['water_sealed', 'pour_flush', 'pit_latrine', 'none']) {
    for (final septic in septicChoices.keys) {
      test('API maps $toilet / $septic and omits remarks', () async {
        Map<String, dynamic>? sent;
        SharedPreferences.setMockInitialValues({
          staffAuthTokenKey: 'local-test-token',
        });
        final client = MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/api/mobile/sanitation/household-surveys/');
          expect(request.headers['Authorization'], 'Token local-test-token');
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response('{"household_code":"HH-EDIT"}', 201);
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await const TourismApi().submitHouseholdSurvey(
            householdCode: 'HH-EDIT',
            householdHead: 'Local household',
            barangay: 'Daungan',
            address: 'Local address',
            maleCount: 2,
            femaleCount: 3,
            toiletType: toilet,
            septicTankType: septic,
            waterLevel: 'level_3',
            waterSource: 'MWSS',
            wasteDisposal: 'collected',
            latitude: '14.19',
            longitude: '121.73',
          );
        }, () => client);
        expect(sent, {
          'household_code': 'HH-EDIT',
          'household_head': 'Local household',
          'barangay': 'Daungan',
          'address': 'Local address',
          'male_count': 2,
          'female_count': 3,
          'toilet_type': toilet,
          if (toilet == 'water_sealed' || toilet == 'pour_flush')
            'septic_tank_type': septic,
          'water_level': 'level_3',
          'water_source': 'MWSS',
          'waste_disposal': 'collected',
          'latitude': '14.19',
          'longitude': '121.73',
        });
        expect(sent!.containsKey('remarks'), isFalse);
      });
    }
  }
}
