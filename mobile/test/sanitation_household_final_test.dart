import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_household_edit_preservation_test.dart'
    show storedHousehold, pumpEdit, submitEdit, field;
import 'sanitation_household_septic_test.dart' show pumpSurvey, readyToSubmit;

Finder choice(String label) => find.widgetWithText(ChoiceChip, label);
Future<void> tapChoice(WidgetTester tester, String label) async {
  await tester.ensureVisible(choice(label));
  await tester.tap(choice(label));
  await tester.pump();
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({staffAuthTokenKey: 'test'}),
  );

  test('parser never uses water source as a water level fallback', () {
    final data = storedHousehold()..remove('water_level');
    final record = HouseholdSanitationItem.fromJson(data);
    expect(record.waterAccessLevel, '');
    expect(record.editIncompatibility, contains('water_level'));
    expect(
      HouseholdSanitationItem.fromJson(storedHousehold()).waterAccessLevel,
      'level_2',
    );
    expect(
      MobileHouseholdSurveyReceipt.fromRecord(
        HouseholdSanitationItem.fromJson(storedHousehold()),
      ).waterSource,
      'Spring',
    );
  });

  testWidgets(
    'fixed fields use exact tap choices; only Barangay is a dropdown',
    (tester) async {
      await pumpEdit(tester, storedHousehold());
      final dropdowns = tester.widgetList(
        find.byWidgetPredicate((w) => w is DropdownTile),
      );
      expect(dropdowns.length, 1);
      expect((dropdowns.single as dynamic).label, 'Barangay');
      for (final label in [
        'Water-sealed',
        householdToiletLabel('pour_flush'),
        householdToiletLabel('pit_latrine'),
        householdToiletLabel('none'),
        'Bottomless',
        'Vault-sealed',
        'Deep well',
        'Poso-shallow well',
        'Spring',
        'Barangay water system',
        'Other',
        'Level 1',
        'Level 2',
        'Level 3',
        'Collected by LGU',
        'Composted',
        'Burned',
        'Dumped',
      ]) {
        expect(choice(label), findsOneWidget);
      }
      expect(find.byType(ChoiceChip), findsNWidgets(18));
      expect(choice('Septic tank'), findsNothing);
      expect(field('Specify other water source'), findsNothing);
    },
  );

  for (final septic in ['septic_tank', null, '']) {
    testWidgets(
      'unrelated edit preserves legacy septic [$septic] and exact legacy source',
      (tester) async {
        final stored = {
          ...storedHousehold(),
          'septic_tank_type': septic,
          'water_source': '  Deep Well, Private pump  ',
        };
        http.Request? sent;
        await http.runWithClient(
          () async {
            await pumpEdit(tester, stored);
            expect(find.textContaining('Legacy water source:'), findsOneWidget);
            expect(
              find.textContaining('  Deep Well, Private pump  '),
              findsOneWidget,
            );
            expect(
              tester.widget<ChoiceChip>(choice('Other')).selected,
              isFalse,
            );
            if (septic == 'septic_tank') {
              expect(
                find.textContaining('Legacy value: Septic tank'),
                findsOneWidget,
              );
              expect(choice('Septic tank'), findsNothing);
            }
            await tester.enterText(field('Address'), 'Only address');
            await submitEdit(tester);
          },
          () => MockClient((r) async {
            sent = r;
            return http.Response(jsonEncode(stored), 200);
          }),
        );
        expect(jsonDecode(sent!.body), {'address': 'Only address'});
      },
    );
  }

  for (final toilet in ['water_sealed', 'pour_flush']) {
    testWidgets('legacy $toilet transition requires approved replacement', (
      tester,
    ) async {
      var calls = 0;
      await http.runWithClient(
        () async {
          await pumpEdit(tester, {
            ...storedHousehold(),
            'toilet_type': toilet,
            'septic_tank_type': 'septic_tank',
          });
          await tapChoice(
            tester,
            householdToiletLabel(
              toilet == 'water_sealed' ? 'pour_flush' : 'water_sealed',
            ),
          );
          await submitEdit(tester);
          expect(calls, 0);
          expect(find.text('Septic tank type is required.'), findsOneWidget);
        },
        () => MockClient((r) async {
          calls++;
          return http.Response('{}', 200);
        }),
      );
    });
  }

  for (final entry in {
    'Bottomless': 'bottomless',
    'Vault-sealed': 'vault_sealed',
  }.entries) {
    testWidgets(
      'legacy septic replacement ${entry.value} submits exact PATCH',
      (tester) async {
        http.Request? sent;
        await http.runWithClient(
          () async {
            await pumpEdit(tester, {
              ...storedHousehold(),
              'septic_tank_type': 'septic_tank',
            });
            await tapChoice(tester, entry.key);
            await submitEdit(tester);
          },
          () => MockClient((r) async {
            sent = r;
            return http.Response(jsonEncode(storedHousehold()), 200);
          }),
        );
        expect(jsonDecode(sent!.body), {'septic_tank_type': entry.value});
      },
    );
  }

  testWidgets(
    'source replacement is single-select and leaves level independent',
    (tester) async {
      http.Request? sent;
      await http.runWithClient(
        () async {
          await pumpEdit(tester, {
            ...storedHousehold(),
            'water_source': 'Legacy, raw',
          });
          await tapChoice(tester, 'Deep well');
          await tapChoice(tester, 'Other');
          expect(
            tester.widget<ChoiceChip>(choice('Deep well')).selected,
            isFalse,
          );
          expect(tester.widget<ChoiceChip>(choice('Other')).selected, isTrue);
          expect(tester.widget<ChoiceChip>(choice('Level 2')).selected, isTrue);
          await submitEdit(tester);
        },
        () => MockClient((r) async {
          sent = r;
          return http.Response(jsonEncode(storedHousehold()), 200);
        }),
      );
      expect(jsonDecode(sent!.body), {'water_source': 'Other'});
    },
  );

  testWidgets('level-only edit preserves exact legacy source', (tester) async {
    http.Request? sent;
    await http.runWithClient(
      () async {
        await pumpEdit(tester, {
          ...storedHousehold(),
          'water_source': '  Custom, raw  ',
        });
        await tapChoice(tester, 'Level 1');
        expect(find.textContaining('  Custom, raw  '), findsOneWidget);
        await submitEdit(tester);
      },
      () => MockClient((r) async {
        sent = r;
        return http.Response(jsonEncode(storedHousehold()), 200);
      }),
    );
    expect(jsonDecode(sent!.body), {'water_level': 'level_1'});
  });

  testWidgets(
    'new survey source changes never derive a level; literal Other POST',
    (tester) async {
      // Use the real API method; pumpSurvey's fake API is not used for this assertion.
      await pumpSurvey(tester);
      await tester.pumpWidget(
        MaterialApp(
          home: HouseholdSurveyPage(
            api: const TourismApi(),
            barangays: SanitationBootstrap.fallback().barangays,
          ),
        ),
      );
      await tester.pumpAndSettle();
      http.Request? sent;
      await http.runWithClient(
        () async {
          await tapChoice(tester, 'Level 2');
          for (final source in [
            'Deep well',
            'Poso-shallow well',
            'Spring',
            'Barangay water system',
            'Other',
          ]) {
            await tapChoice(tester, source);
            expect(
              tester.widget<ChoiceChip>(choice('Level 2')).selected,
              isTrue,
            );
          }
          await tapChoice(tester, 'Bottomless');
          await readyToSubmit(tester);
          await submitEdit(tester);
        },
        () => MockClient((r) async {
          sent = r;
          return http.Response('{"household_code":"HH-NEW"}', 201);
        }),
      );
      expect(sent!.method, 'POST');
      final body = jsonDecode(sent!.body) as Map;
      expect(body['water_source'], 'Other');
      expect(body['water_level'], 'level_2');
      expect(body['septic_tank_type'], 'bottomless');
      expect(body.containsKey('total_members'), isFalse);
      expect(body.containsKey('remarks'), isFalse);
    },
  );

  testWidgets(
    'member taps update display-only Total and omit total from PATCH',
    (tester) async {
      http.Request? sent;
      await http.runWithClient(
        () async {
          await pumpEdit(tester, storedHousehold());
          await tester.tap(find.byTooltip('Increase Male'));
          await tester.pump();
          expect(
            find.byKey(const ValueKey('household-total-8')),
            findsOneWidget,
          );
          await tester.tap(find.byTooltip('Increase Female'));
          await tester.pump();
          expect(find.text('Total'), findsOneWidget);
          expect(
            find.byKey(const ValueKey('household-total-9')),
            findsOneWidget,
          );
          expect(field('Total'), findsNothing);
          await submitEdit(tester);
        },
        () => MockClient((r) async {
          sent = r;
          return http.Response(jsonEncode(storedHousehold()), 200);
        }),
      );
      expect(jsonDecode(sent!.body), {'male_count': 8, 'female_count': 1});
    },
  );

  testWidgets('360px household controls and legacy messages do not overflow', (
    tester,
  ) async {
    await pumpEdit(tester, {
      ...storedHousehold(),
      'septic_tank_type': 'septic_tank',
      'water_source': 'Legacy custom source, with several words',
    });
    tester.view.physicalSize = const Size(360, 800);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      choice('Vault-sealed'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      choice('Barangay water system'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      choice('Dumped'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('legacy septic and source no-op edit makes no request', (
    tester,
  ) async {
    var calls = 0;
    await http.runWithClient(
      () async {
        await pumpEdit(tester, {
          ...storedHousehold(),
          'septic_tank_type': 'septic_tank',
          'water_source': '  Custom, source  ',
        });
        await submitEdit(tester);
        expect(calls, 0);
      },
      () => MockClient((r) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
  });

  testWidgets('edit without household consent makes no request', (
    tester,
  ) async {
    var calls = 0;
    await http.runWithClient(
      () async {
        await pumpEdit(tester, storedHousehold());
        await tester.enterText(field('Address'), 'Changed address');
        await tester.tap(find.text('Submit Household Survey'));
        await tester.pump();
        expect(
          find.text('Privacy consent is required before submitting.'),
          findsOneWidget,
        );
        expect(calls, 0);
      },
      () => MockClient((r) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
  });
}
