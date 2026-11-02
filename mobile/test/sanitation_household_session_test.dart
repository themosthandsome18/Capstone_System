import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sanitation_household_edit_preservation_test.dart'
    show storedHousehold, field;
import 'sanitation_household_septic_test.dart' show readyToSubmit, choose;

const changedMessage =
    'Staff session changed. Reopen and review the household form under the current account.';

Future<void> openForm(WidgetTester tester, {required bool edit}) async {
  tester.view.physicalSize = const Size(1200, 5000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: HouseholdSurveyPage(
        api: const TourismApi(),
        barangays: SanitationBootstrap.fallback().barangays,
        household: edit
            ? HouseholdSanitationItem.fromJson(storedHousehold())
            : null,
      ),
    ),
  );
  await tester.pumpAndSettle();
  if (!edit) {
    await readyToSubmit(tester);
    await choose(tester, 'Septic tank type', 'Bottomless');
  }
  tester
      .widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel))
      .onChanged(true);
  await tester.pump();
}

Future<void> submit(WidgetTester tester) async {
  await tester.tap(find.text('Submit Household Survey'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'session-A',
    }),
  );
  for (final edit in [false, true]) {
    for (final token in <String?>['session-B', null, '']) {
      testWidgets(
        '${edit ? 'edit' : 'new'} opened under A blocks ${token ?? 'logout'} before HTTP or receipt',
        (tester) async {
          final requests = <http.Request>[];
          final client = MockClient((r) async {
            requests.add(r);
            return http.Response(jsonEncode(storedHousehold()), 200);
          });
          addTearDown(client.close);
          await http.runWithClient(() async {
            await openForm(tester, edit: edit);
            if (edit) {
              await tester.enterText(
                field('Existing combined address'),
                'Changed',
              );
            }
            final prefs = await SharedPreferences.getInstance();
            if (token == null) {
              await prefs.remove(staffAuthTokenKey);
            } else {
              await prefs.setString(staffAuthTokenKey, token);
            }
            await submit(tester);
            expect(
              requests,
              isEmpty,
              reason:
                  'Observed ${requests.map((r) => '${r.method} ${r.headers['Authorization']}')}',
            );
            expect(find.text(changedMessage), findsOneWidget);
            expect(find.text('Survey submitted'), findsNothing);
            // Returning to A does not silently revive the already-invalid form.
            await prefs.setString(staffAuthTokenKey, 'session-A');
            await submit(tester);
            expect(requests, isEmpty);
          }, () => client);
        },
      );
    }
  }
  testWidgets(
    'session change blocks a no-change edit without a success receipt',
    (tester) async {
      await openForm(tester, edit: true);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(staffAuthTokenKey, 'session-B');
      await submit(tester);
      expect(find.text('Survey submitted'), findsNothing);
      expect(find.text(changedMessage), findsOneWidget);
    },
  );
  for (final edit in [false, true]) {
    testWidgets(
      'same-session ${edit ? 'PATCH' : 'POST'} retains A authorization',
      (tester) async {
        final requests = <http.Request>[];
        final client = MockClient((r) async {
          requests.add(r);
          return http.Response(jsonEncode(storedHousehold()), 200);
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await openForm(tester, edit: edit);
          if (edit) {
            await tester.enterText(
              field('Existing combined address'),
              'Changed',
            );
          }
          await submit(tester);
          expect(requests.single.method, edit ? 'PATCH' : 'POST');
          expect(requests.single.headers['Authorization'], 'Token session-A');
          expect(find.text('Survey submitted'), findsOneWidget);
        }, () => client);
      },
    );
  }
  testWidgets('same-session no-change edit still succeeds without HTTP', (
    tester,
  ) async {
    var calls = 0;
    final client = MockClient((r) async {
      calls++;
      return http.Response('{}', 200);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await openForm(tester, edit: true);
      await submit(tester);
      expect(calls, 0);
      expect(find.text('Survey submitted'), findsOneWidget);
    }, () => client);
  });
  testWidgets(
    'form opened without authentication cannot adopt a later session',
    (tester) async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(staffAuthTokenKey);
      await openForm(tester, edit: true);
      await prefs.setString(staffAuthTokenKey, 'session-B');
      await submit(tester);
      expect(find.text(changedMessage), findsOneWidget);
      expect(find.text('Survey submitted'), findsNothing);
    },
  );
  for (final mode in ['new', 'edit', 'no-change']) {
    test(
      'session switch during API preference read blocks $mode dispatch or local success',
      () async {
        final requests = <http.Request>[];
        final client = MockClient((r) async {
          requests.add(r);
          return http.Response('{}', 200);
        });
        addTearDown(client.close);
        final prefs = await SharedPreferences.getInstance();
        final stored = storedHousehold();
        await http.runWithClient(() async {
          final pending = const TourismApi().submitHouseholdSurvey(
            expectedSessionToken: 'session-A',
            originalHousehold: mode == 'new'
                ? null
                : HouseholdSanitationItem.fromJson(stored),
            householdCode: mode == 'new'
                ? null
                : stored['household_code'] as String,
            householdHead: stored['household_head'] as String,
            barangay: stored['barangay'] as String,
            address: mode == 'no-change'
                ? stored['address'] as String
                : 'Changed',
            maleCount: 7,
            femaleCount: 0,
            toiletType: 'pour_flush',
            septicTankType: 'vault_sealed',
            waterLevel: 'level_2',
            waterSource: 'Spring',
            wasteDisposal: 'composted',
            latitude: '${stored['latitude']}',
            longitude: '${stored['longitude']}',
          );
          final change = prefs.setString(staffAuthTokenKey, 'session-B');
          await expectLater(
            pending,
            throwsA(
              isA<ApiException>().having((e) => e.statusCode, 'status', 409),
            ),
          );
          await change;
          expect(requests, isEmpty);
        }, () => client);
      },
    );
  }
  for (final status in [200, 401]) {
    testWidgets(
      'in-flight $status response cannot create a receipt or clear replacement B session',
      (tester) async {
        final prefs = await SharedPreferences.getInstance();
        final requests = <http.Request>[];
        final client = MockClient((r) async {
          requests.add(r);
          await prefs.setString(staffAuthTokenKey, 'session-B');
          return http.Response(jsonEncode(storedHousehold()), status);
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await openForm(tester, edit: true);
          await tester.enterText(field('Existing combined address'), 'Changed');
          await submit(tester);
          expect(requests.single.headers['Authorization'], 'Token session-A');
          expect(find.text('Survey submitted'), findsNothing);
          expect(find.text(changedMessage), findsOneWidget);
          expect(prefs.getString(staffAuthTokenKey), 'session-B');
        }, () => client);
      },
    );
  }
}
