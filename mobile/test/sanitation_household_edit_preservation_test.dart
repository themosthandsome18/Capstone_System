import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> storedHousehold() => {
  'id': 71,
  'household_code': 'HH-H2B',
  'household_head': 'de la CRUZ household',
  'barangay': 'Daungan',
  'address': '  Existing address  ',
  'male_count': 7,
  'female_count': 0,
  'toilet_type': 'pour_flush',
  'septic_tank_type': 'vault_sealed',
  'water_source': 'Spring',
  'water_level': 'level_2',
  'waste_disposal': 'composted',
  'latitude': 14.192345678,
  'longitude': 121.73456789,
  'last_survey_date': '2025-07-04',
  'status': 'for_completion',
};

Finder field(String label) => find.widgetWithText(AppTextField, label);
Finder dropdown(String label) => find.byWidgetPredicate(
  (widget) => widget is DropdownTile && widget.label == label,
);

Future<void> pumpEdit(WidgetTester tester, Map<String, dynamic> stored) async {
  tester.view.physicalSize = const Size(1200, 5000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: HouseholdSurveyPage(
        api: const TourismApi(),
        barangays: SanitationBootstrap.fallback().barangays,
        household: HouseholdSanitationItem.fromJson(stored),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> submitEdit(WidgetTester tester) async {
  tester
      .widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel))
      .onChanged(true);
  await tester.pump();
  await tester.tap(find.text('Submit Household Survey'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'local-test-token',
    }),
  );

  testWidgets('initializes all stored editable fields without normalization', (
    tester,
  ) async {
    final stored = storedHousehold();
    await pumpEdit(tester, stored);
    for (final entry in {
      'Household head': stored['household_head'],
      'Address': stored['address'],
      'Latitude': '${stored['latitude']}',
      'Longitude': '${stored['longitude']}',
    }.entries) {
      expect(
        tester.widget<AppTextField>(field(entry.key)).controller.text,
        entry.value,
      );
    }
    final counters = tester
        .widget<CounterPanel>(find.byType(CounterPanel))
        .counters;
    expect(counters.map((counter) => counter.value), [7, 0]);
    for (final entry in {
      'Toilet facility': 'pour_flush',
      'Septic tank type': 'vault_sealed',
      'Water source': 'Spring',
      'Water access level': 'level_2',
      'Waste disposal': 'composted',
    }.entries) {
      final dynamic tile = tester.widget(dropdown(entry.key));
      expect(tile.value, entry.value);
    }
    expect(field('Remarks'), findsNothing);
  });

  for (final source in [
    'Spring',
    'Private hand pump',
    'Deep Well,  Spring',
    '',
    '  Custom source  ',
  ]) {
    testWidgets(
      'one-field edit preserves source [$source] and all unrelated fields',
      (tester) async {
        final stored = {...storedHousehold(), 'water_source': source};
        http.Request? sent;
        final client = MockClient((request) async {
          sent = request;
          return http.Response(
            jsonEncode({...stored, 'address': 'Changed address'}),
            200,
          );
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await pumpEdit(tester, stored);
          await tester.enterText(field('Address'), 'Changed address');
          await submitEdit(tester);
        }, () => client);
        expect(sent, isNotNull);
        expect(sent!.method, 'PATCH');
        expect(sent!.url.path, '/api/households/records/71/');
        expect(sent!.headers['Authorization'], 'Token local-test-token');
        expect(jsonDecode(sent!.body), {'address': 'Changed address'});
      },
    );
  }

  testWidgets(
    'changing water source does not overwrite independent stored level',
    (tester) async {
      http.Request? sent;
      final client = MockClient((request) async {
        sent = request;
        return http.Response(jsonEncode(storedHousehold()), 200);
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await pumpEdit(tester, storedHousehold());
        final tile = tester.widget<DropdownTile<String>>(
          dropdown('Water source'),
        );
        tile.onChanged('MWSS');
        await tester.pump();
        await submitEdit(tester);
      }, () => client);
      expect(jsonDecode(sent!.body), {'water_source': 'MWSS'});
    },
  );

  testWidgets('legacy null septic remains omitted during unrelated edit', (
    tester,
  ) async {
    http.Request? sent;
    final client = MockClient((request) async {
      sent = request;
      return http.Response(jsonEncode(storedHousehold()), 200);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await pumpEdit(tester, {...storedHousehold(), 'septic_tank_type': null});
      await tester.enterText(field('Address'), 'Changed address');
      await submitEdit(tester);
    }, () => client);
    expect(jsonDecode(sent!.body), {'address': 'Changed address'});
  });

  for (final entry in {
    'Water access level': ['level_1', 'water_level'],
    'Waste disposal': ['burned', 'waste_disposal'],
    'Toilet facility': ['pit_latrine', 'toilet_type'],
  }.entries) {
    testWidgets('explicit ${entry.key} change sends only the intended field', (
      tester,
    ) async {
      http.Request? sent;
      final client = MockClient((request) async {
        sent = request;
        return http.Response(jsonEncode(storedHousehold()), 200);
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await pumpEdit(tester, storedHousehold());
        tester
            .widget<DropdownTile<String>>(dropdown(entry.key))
            .onChanged(entry.value[0]);
        await tester.pump();
        await submitEdit(tester);
      }, () => client);
      expect(jsonDecode(sent!.body), {entry.value[1]: entry.value[0]});
    });
  }

  testWidgets(
    'explicit zero count is retained and does not reset other values',
    (tester) async {
      http.Request? sent;
      final client = MockClient((request) async {
        sent = request;
        return http.Response(jsonEncode(storedHousehold()), 200);
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await pumpEdit(tester, {...storedHousehold(), 'female_count': 4});
        tester
            .widget<CounterPanel>(find.byType(CounterPanel))
            .counters
            .first
            .onChanged(0);
        await tester.pump();
        await submitEdit(tester);
      }, () => client);
      expect(jsonDecode(sent!.body), {'male_count': 0});
    },
  );

  testWidgets(
    'unchanged blank septic and custom source do not cause any write',
    (tester) async {
      var calls = 0;
      final client = MockClient((request) async {
        calls++;
        return http.Response(jsonEncode(storedHousehold()), 200);
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await pumpEdit(tester, {
          ...storedHousehold(),
          'septic_tank_type': '',
          'water_source': '  Deep Well,  Spring  ',
        });
        await submitEdit(tester);
      }, () => client);
      expect(calls, 0);
    },
  );

  testWidgets(
    'stored septic value on an inapplicable toilet blocks silent clearing',
    (tester) async {
      await pumpEdit(tester, {
        ...storedHousehold(),
        'toilet_type': 'pit_latrine',
      });
      expect(find.textContaining('Cannot safely edit'), findsOneWidget);
      expect(find.textContaining('septic_tank_type conflicts'), findsOneWidget);
      expect(find.text('Submit Household Survey'), findsNothing);
    },
  );

  for (final key in [
    'id',
    'address',
    'male_count',
    'female_count',
    'toilet_type',
    'septic_tank_type',
    'water_source',
    'water_level',
    'waste_disposal',
    'latitude',
    'longitude',
  ]) {
    testWidgets('missing $key blocks editing without invented defaults', (
      tester,
    ) async {
      final stored = storedHousehold()..remove(key);
      await pumpEdit(tester, stored);
      expect(find.textContaining('Cannot safely edit'), findsOneWidget);
      expect(find.textContaining(key), findsOneWidget);
      expect(find.text('Submit Household Survey'), findsNothing);
    });
  }

  for (final entry in <String, dynamic>{
    'water_level': 'none',
    'waste_disposal': 'legacy_other',
    'male_count': 100,
    'female_count': null,
    'latitude': null,
    'toilet_type': 'legacy_other',
    'septic_tank_type': 'legacy_other',
    'barangay': 'Unknown legacy barangay',
  }.entries) {
    testWidgets('unrepresentable ${entry.key} blocks destructive editing', (
      tester,
    ) async {
      await pumpEdit(tester, {...storedHousehold(), entry.key: entry.value});
      expect(find.textContaining('Cannot safely edit'), findsOneWidget);
      expect(find.textContaining(entry.key), findsOneWidget);
      expect(find.text('Submit Household Survey'), findsNothing);
    });
  }
}
