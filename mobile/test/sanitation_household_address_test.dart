import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_household_edit_preservation_test.dart'
    show storedHousehold, pumpEdit, submitEdit, field;

Map<String, dynamic> addressed() => {
  ...storedHousehold(),
  'house_number': '01-A',
  'sitio': 'lower sitio',
};

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'local-test',
    }),
  );

  test(
    'parser reads optional fields and preserves their absence in old responses',
    () {
      final current = HouseholdSanitationItem.fromJson(addressed());
      expect(current.houseNumber, '01-A');
      expect(current.sitio, 'lower sitio');
      expect(current.editIncompatibility, isNull);
      final old = HouseholdSanitationItem.fromJson(storedHousehold());
      expect(old.houseNumber, '');
      expect(old.sitio, '');
      expect(old.surveyValues!.containsKey('house_number'), isFalse);
      expect(old.surveyValues!.containsKey('sitio'), isFalse);
      expect(old.editIncompatibility, isNull);
    },
  );

  test('invalid optional values retain the edit safety barrier', () {
    for (final key in ['house_number', 'sitio']) {
      for (final value in [null, 12, 'x' * 121]) {
        final item = HouseholdSanitationItem.fromJson({
          ...addressed(),
          key: value,
        });
        expect(item.editIncompatibility, contains(key));
      }
    }
  });

  testWidgets(
    'new survey sends separate fields with unchanged barangay and no inferred address',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 6000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        return http.Response(
          jsonEncode({'household_code': 'HH-NEW', 'status': 'good_standing'}),
          201,
        );
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await tester.pumpWidget(
          MaterialApp(
            home: HouseholdSurveyPage(
              api: const TourismApi(),
              barangays: SanitationBootstrap.fallback().barangays,
            ),
          ),
        );
        await tester.pump();
        final barangay = tester
            .widget<DropdownTile<String>>(
              find.byWidgetPredicate(
                (w) => w is DropdownTile<String> && w.label == 'Barangay',
              ),
            )
            .value;
        await tester.enterText(field('Household head'), 'Local household');
        await tester.enterText(field('House Number'), '01-b');
        await tester.enterText(field('Sitio'), 'new sitio');
        await tester.enterText(field('Latitude'), '14.19');
        await tester.enterText(field('Longitude'), '121.73');
        await tester.tap(find.widgetWithText(ChoiceChip, 'Bottomless'));
        await tester.pump();
        tester
            .widget<LocationConfirmationPanel>(
              find.byType(LocationConfirmationPanel),
            )
            .onConfirm();
        await submitEdit(tester);
        expect(requests.single.method, 'POST');
        expect(
          requests.single.url.path,
          endsWith('/mobile/sanitation/household-surveys/'),
        );
        final body = jsonDecode(requests.single.body) as Map<String, dynamic>;
        expect(body['house_number'], '01-b');
        expect(body['sitio'], 'new sitio');
        expect(body['barangay'], barangay);
        expect(body['address'], '');
      }, () => client);
    },
  );

  testWidgets(
    'edit displays exact historical combined address without splitting it',
    (tester) async {
      await pumpEdit(tester, storedHousehold());
      expect(
        tester.widget<AppTextField>(field('House Number')).controller.text,
        '',
      );
      expect(tester.widget<AppTextField>(field('Sitio')).controller.text, '');
      expect(
        tester
            .widget<AppTextField>(field('Existing combined address'))
            .controller
            .text,
        storedHousehold()['address'],
      );
    },
  );

  for (final entry in {
    'House Number': 'house_number',
    'Sitio': 'sitio',
  }.entries) {
    for (final value in ['new value', '']) {
      testWidgets(
        '${entry.key} one-field change [$value] preserves other address data',
        (tester) async {
          final stored = addressed();
          final requests = <http.Request>[];
          final client = MockClient((request) async {
            requests.add(request);
            return http.Response(
              jsonEncode({...stored, entry.value: value}),
              200,
            );
          });
          addTearDown(client.close);
          await http.runWithClient(() async {
            await pumpEdit(tester, stored);
            await tester.enterText(field(entry.key), value);
            await submitEdit(tester);
          }, () => client);
          expect(requests.single.method, 'PATCH');
          expect(jsonDecode(requests.single.body), {entry.value: value});
          final readback = HouseholdSanitationItem.fromJson({
            ...stored,
            entry.value: value,
          });
          expect(readback.surveyValues!['address'], stored['address']);
          expect(readback.surveyValues!['barangay'], stored['barangay']);
          expect(readback.surveyValues![entry.value], value);
        },
      );
    }
  }

  for (final stored in [addressed(), storedHousehold()]) {
    testWidgets(
      'no-op sends no request with optional keys ${stored.containsKey('sitio')}',
      (tester) async {
        var requests = 0;
        final client = MockClient((request) async {
          requests++;
          return http.Response('{}', 200);
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await pumpEdit(tester, stored);
          await submitEdit(tester);
        }, () => client);
        expect(requests, 0);
      },
    );

    testWidgets(
      'unrelated edit omits address fields with optional keys ${stored.containsKey('sitio')}',
      (tester) async {
        final requests = <http.Request>[];
        final client = MockClient((request) async {
          requests.add(request);
          return http.Response(
            jsonEncode({...stored, 'household_head': 'Changed Household'}),
            200,
          );
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await pumpEdit(tester, stored);
          await tester.enterText(field('Household head'), 'Changed Household');
          await submitEdit(tester);
        }, () => client);
        expect(jsonDecode(requests.single.body), {
          'household_head': 'Changed Household',
        });
      },
    );
  }

  testWidgets('overlength address input is rejected before sending', (
    tester,
  ) async {
    var requests = 0;
    final client = MockClient((request) async {
      requests++;
      return http.Response('{}', 200);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await pumpEdit(tester, addressed());
      await tester.enterText(field('House Number'), 'x' * 121);
      await submitEdit(tester);
    }, () => client);
    expect(requests, 0);
    expect(find.textContaining('120 characters or fewer'), findsOneWidget);
  });
}
