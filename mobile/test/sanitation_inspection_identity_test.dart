import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sanitation_inspection_checklist_test.dart'
    show bootstrapWith, fishballCart, chooseStatus;

const accountA = {
  'id': 1,
  'username': 'msantos',
  'display_name': 'Maria Santos',
};
Future<void> session(String token, String username) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(staffAuthTokenKey, token);
  await prefs.setString(staffAuthUsernameKey, username);
}

Future<void> form(
  WidgetTester tester, {
  Key? key,
  VoidCallback? onSessionExpired,
}) async {
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: SanitationInspectionPage(
        key: key,
        api: TourismApi(),
        bootstrap: bootstrapWith(fishballCart),
        onSessionExpired: onSessionExpired,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

String inspector(WidgetTester tester) =>
    tester.widget<TextField>(find.byType(TextField).first).controller!.text;
Future<void> submit(WidgetTester tester) async {
  await chooseStatus(tester, 'good_standing');
  await tester.tap(find.text('Submit Inspection'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'session-A',
      staffAuthUsernameKey: 'msantos',
    }),
  );
  testWidgets('empty establishments render safely and block inspection POST', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response(jsonEncode({'user': accountA}), 200);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await tester.pumpWidget(MaterialApp(
        home: SanitationInspectionPage(
          api: TourismApi(),
          bootstrap: const SanitationBootstrap(
            businessTypes: [],
            establishments: [],
            inspections: [],
            complaints: [],
            householdRecords: [],
            barangays: [],
            notifications: [],
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(inspector(tester), 'Maria Santos');
      expect(requests, hasLength(1));
      expect(requests.single.method, 'GET');
      expect(requests.single.url.path, endsWith('/auth/me/'));
      expect(requests.single.headers['Authorization'], 'Token session-A');
      final dropdown = find.byType(
        DropdownButtonFormField<SanitationEstablishment>,
      );
      expect(dropdown, findsOneWidget);
      expect(
        tester.widget<DropdownTile<SanitationEstablishment>>(
          find.byType(DropdownTile<SanitationEstablishment>),
        ).items,
        isEmpty,
      );
      await tester.tap(dropdown);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      // Dismiss any menu without selecting an option.
      await tester.tapAt(const Offset(1, 1));
      await tester.pumpAndSettle();
      await submit(tester);
      expect(tester.takeException(), isNull);
      expect(find.text('No establishment records loaded.'), findsOneWidget);
      expect(find.text('Inspection submitted'), findsNothing);
      expect(requests.where((request) => request.method == 'POST'), isEmpty);
      expect(
        tester.state<FormFieldState<SanitationEstablishment>>(dropdown).value,
        isA<SanitationEstablishment>()
            .having((item) => item.id, 'placeholder ID', 0)
            .having(
              (item) => item.businessName,
              'placeholder label',
              'No establishment loaded',
            ),
      );
    }, () => client);
  });
  final cases = <String, Map<String, dynamic>>{
    'Maria Santos': accountA,
    'Maria': {'username': 'msantos', 'first_name': 'Maria', 'last_name': ''},
    'Santos': {'username': 'msantos', 'first_name': '', 'last_name': 'Santos'},
    'msantos': {'username': 'msantos', 'display_name': '  '},
    'Ana McDonald-De la Cruz': {
      'username': 'amcd',
      'display_name': '  Ana McDonald-De la Cruz  ',
    },
  };
  for (final entry in cases.entries) {
    testWidgets('resolved identity and actual POST preserve ${entry.key}', (
      tester,
    ) async {
      final posts = <http.Request>[];
      final client = MockClient((request) async {
        if (request.method == 'GET') {
          return http.Response(jsonEncode({'user': entry.value}), 200);
        }
        posts.add(request);
        return http.Response(
          jsonEncode({
            'id': 42,
            'inspector_name': jsonDecode(request.body)['inspector_name'],
          }),
          201,
        );
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await form(tester);
        expect(inspector(tester), entry.key);
        expect(
          tester.widget<TextField>(find.byType(TextField).first).readOnly,
          isTrue,
        );
        await submit(tester);
        expect(posts, hasLength(1));
        expect(jsonDecode(posts.single.body)['inspector_name'], entry.key);
        expect(posts.single.headers['Authorization'], 'Token session-A');
        expect(find.text('Inspector: ${entry.key}'), findsOneWidget);
      }, () => client);
    });
  }
  testWidgets('actual submission uses full name rather than saved username', (
    tester,
  ) async {
    final posts = <http.Request>[];
    final client = MockClient((r) async {
      if (r.method == 'GET') {
        return http.Response(jsonEncode({'user': accountA}), 200);
      }
      posts.add(r);
      return http.Response('{"id":42}', 201);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester);
      await submit(tester);
      expect(posts, hasLength(1));
      expect(jsonDecode(posts.single.body)['inspector_name'], 'Maria Santos');
    }, () => client);
  });
  // Exercise the real form and decoder; empty bodies deliberately stay outside
  // this matrix because upstream continues to decode them as an empty object.
  const unreadable = 'The server sent a response the app could not read.';
  for (final response in {
    'malformed JSON': '{broken',
    'non-object JSON': '[]',
  }.entries) {
    testWidgets('${response.key} identity success blocks POST and can retry', (
      tester,
    ) async {
      var fail = true;
      final requests = <http.Request>[];
      final client = MockClient((r) async {
        requests.add(r);
        expect(r.method, 'GET');
        return http.Response(
          fail ? response.value : jsonEncode({'user': accountA}),
          200,
        );
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await form(tester);
        await submit(tester);
        await tester.pump(const Duration(seconds: 2));
        expect(inspector(tester), isEmpty);
        expect(find.text('Could not load inspector identity.'), findsOneWidget);
        expect(find.text('Retry identity'), findsOneWidget);
        expect(find.text('Inspection submitted'), findsNothing);
        expect(requests, hasLength(1));
        expect(requests.single.headers['Authorization'], 'Token session-A');

        fail = false;
        await tester.tap(find.text('Retry identity'));
        await tester.pumpAndSettle();
        expect(requests, hasLength(2));
        expect(requests.every((r) => r.method == 'GET'), isTrue);
        expect(inspector(tester), 'Maria Santos');
        expect(find.text('Could not load inspector identity.'), findsNothing);
      }, () => client);
    });

    testWidgets(
      '${response.key} inspection success shows error without retry',
      (tester) async {
        final posts = <http.Request>[];
        final client = MockClient((r) async {
          if (r.method == 'GET') {
            return http.Response(jsonEncode({'user': accountA}), 200);
          }
          posts.add(r);
          return http.Response(response.value, 201);
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await form(tester);
          await submit(tester);
          await tester.pump(const Duration(seconds: 1));
          expect(find.text(unreadable), findsOneWidget);
          expect(find.text('Inspection submitted'), findsNothing);
          expect(find.byType(AlertDialog), findsNothing);
          expect(find.byType(SanitationInspectionPage), findsOneWidget);
          expect(posts, hasLength(1));
          expect(posts.single.headers['Authorization'], 'Token session-A');
          expect(
            jsonDecode(posts.single.body)['inspector_name'],
            'Maria Santos',
          );
          // Beyond the API timeout as well as the session-watch interval: no
          // implicit resubmission even after the error snackbar has expired.
          await tester.pump(const Duration(minutes: 2));
          await tester.pumpAndSettle();
          expect(posts, hasLength(1));
          expect(find.text('Inspection submitted'), findsNothing);
        }, () => client);
      },
    );

    for (final identityLookup in [true, false]) {
      testWidgets(
        'late ${response.key} ${identityLookup ? 'identity' : 'inspection'} response cannot affect B session',
        (tester) async {
          final pending = Completer<http.Response>();
          final requests = <http.Request>[];
          final client = MockClient((r) async {
            requests.add(r);
            if (r.headers['Authorization'] == 'Token session-B') {
              expect(r.method, 'GET');
              return http.Response(
                '{"user":{"username":"breyes","display_name":"Ben Reyes"}}',
                200,
              );
            }
            if (identityLookup || r.method == 'POST') return pending.future;
            return http.Response(jsonEncode({'user': accountA}), 200);
          });
          addTearDown(client.close);
          await http.runWithClient(() async {
            await form(tester, key: const ValueKey('A'));
            if (!identityLookup) await submit(tester);
            await session('session-B', 'breyes');
            await form(tester, key: const ValueKey('B'));
            expect(inspector(tester), 'Ben Reyes');
            pending.complete(
              http.Response(response.value, identityLookup ? 200 : 201),
            );
            await tester.pumpAndSettle();
            await tester.pump(const Duration(minutes: 2));
            await tester.pumpAndSettle();
            expect(inspector(tester), 'Ben Reyes');
            expect(
              find.text('Could not load inspector identity.'),
              findsNothing,
            );
            expect(find.text(unreadable), findsNothing);
            expect(find.text('Inspection submitted'), findsNothing);
            final posts = requests.where((r) => r.method == 'POST').toList();
            expect(posts, hasLength(identityLookup ? 0 : 1));
            if (!identityLookup) {
              expect(posts.single.headers['Authorization'], 'Token session-A');
              expect(
                jsonDecode(posts.single.body)['inspector_name'],
                'Maria Santos',
              );
            }
            expect(
              (await SharedPreferences.getInstance()).getString(
                staffAuthTokenKey,
              ),
              'session-B',
            );
          }, () => client);
        },
      );
    }
  }
  testWidgets('pending identity cannot submit', (tester) async {
    final pending = Completer<http.Response>();
    final posts = <http.Request>[];
    final client = MockClient((r) async {
      if (r.method == 'GET') return pending.future;
      posts.add(r);
      return http.Response('{"id":42}', 201);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester);
      await submit(tester);
      expect(posts, isEmpty);
      pending.complete(http.Response(jsonEncode({'user': accountA}), 200));
      await tester.pumpAndSettle();
    }, () => client);
  });
  testWidgets('failed identity blocks submission and can retry', (
    tester,
  ) async {
    var fail = true;
    final posts = <http.Request>[];
    final client = MockClient((r) async {
      if (r.method == 'GET') {
        return fail
            ? http.Response('{}', 500)
            : http.Response(jsonEncode({'user': accountA}), 200);
      }
      posts.add(r);
      return http.Response('{"id":42}', 201);
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester);
      await submit(tester);
      expect(posts, isEmpty);
      fail = false;
      await tester.tap(find.text('Retry identity'));
      await tester.pumpAndSettle();
      expect(inspector(tester), 'Maria Santos');
    }, () => client);
  });
  testWidgets(
    'account switch before dispatch never combines A name with B token',
    (tester) async {
      final posts = <http.Request>[];
      final client = MockClient((r) async {
        if (r.method == 'GET') {
          return http.Response(jsonEncode({'user': accountA}), 200);
        }
        posts.add(r);
        return http.Response('{"id":42}', 201);
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await form(tester);
        tester
                .widget<TextField>(find.byType(TextField).first)
                .controller!
                .text =
            'Maria Santos';
        await session('session-B', 'breyes');
        await submit(tester);
        expect(
          posts,
          isEmpty,
          reason: 'A-bound form must reject B session before HTTP',
        );
      }, () => client);
    },
  );
  testWidgets('delayed A response cannot populate B form', (tester) async {
    final pending = Completer<http.Response>();
    final client = MockClient(
      (r) async => r.headers['Authorization'] == 'Token session-A'
          ? pending.future
          : http.Response(
              '{"user":{"id":2,"username":"breyes","display_name":"Ben Reyes"}}',
              200,
            ),
    );
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester, key: const ValueKey('A'));
      await session('session-B', 'breyes');
      await form(tester, key: const ValueKey('B'));
      pending.complete(http.Response(jsonEncode({'user': accountA}), 200));
      await tester.pumpAndSettle();
      expect(inspector(tester), 'Ben Reyes');
    }, () => client);
  });
  testWidgets('delayed A response invalidates surviving form after switch', (
    tester,
  ) async {
    final pending = Completer<http.Response>();
    final client = MockClient((r) => pending.future);
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester);
      await session('session-B', 'breyes');
      pending.complete(http.Response(jsonEncode({'user': accountA}), 200));
      await tester.pumpAndSettle();
      expect(inspector(tester), isEmpty);
    }, () => client);
  });
  for (final missing in [false, true]) {
    testWidgets(
      '${missing ? "missing" : "expired"} session blocks and invokes expiry handling',
      (tester) async {
        if (missing) SharedPreferences.setMockInitialValues({});
        var expired = 0;
        final requests = <http.Request>[];
        final client = MockClient((r) async {
          requests.add(r);
          return http.Response('{}', 401);
        });
        addTearDown(client.close);
        await http.runWithClient(() async {
          await form(tester, onSessionExpired: () => expired++);
          await tester.pumpAndSettle();
          expect(expired, 1);
          expect(requests.where((r) => r.method == 'POST'), isEmpty);
          expect(
            (await SharedPreferences.getInstance()).getString(
              staffAuthTokenKey,
            ),
            isNull,
          );
        }, () => client);
      },
    );
  }
  testWidgets('stale A 401 cannot clear B session or expire B', (tester) async {
    final pending = Completer<http.Response>();
    var expired = 0;
    final client = MockClient((r) => pending.future);
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester, onSessionExpired: () => expired++);
      await session('session-B', 'breyes');
      pending.complete(http.Response('{}', 401));
      await tester.pumpAndSettle();
      expect(expired, 0);
      expect(inspector(tester), isEmpty);
      expect(
        (await SharedPreferences.getInstance()).getString(staffAuthTokenKey),
        'session-B',
      );
    }, () => client);
  });
  testWidgets(
    'empty authenticated identity never uses generic placeholder or saved username',
    (tester) async {
      final requests = <http.Request>[];
      final client = MockClient((r) async {
        requests.add(r);
        return http.Response('{"user":{}}', 200);
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await form(tester);
        await submit(tester);
        expect(inspector(tester), isEmpty);
        expect(requests.where((r) => r.method == 'POST'), isEmpty);
      }, () => client);
    },
  );
  testWidgets('late submission result from A does not surface in B session', (
    tester,
  ) async {
    final pending = Completer<http.Response>();
    final posts = <http.Request>[];
    final client = MockClient((r) async {
      if (r.method == 'GET') {
        return http.Response(jsonEncode({'user': accountA}), 200);
      }
      posts.add(r);
      return pending.future;
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester);
      await submit(tester);
      expect(posts.single.headers['Authorization'], 'Token session-A');
      await session('session-B', 'breyes');
      pending.complete(
        http.Response('{"id":42,"inspector_name":"Maria Santos"}', 201),
      );
      await tester.pumpAndSettle();
      expect(find.text('Inspection submitted'), findsNothing);
      expect(inspector(tester), isEmpty);
    }, () => client);
  });
  testWidgets('logout A then login B submits only B attribution', (
    tester,
  ) async {
    final posts = <http.Request>[];
    final client = MockClient((r) async {
      if (r.method == 'GET') {
        return http.Response(
          jsonEncode({
            'user': r.headers['Authorization'] == 'Token session-A'
                ? accountA
                : {'username': 'breyes', 'display_name': 'Ben Reyes'},
          }),
          200,
        );
      }
      posts.add(r);
      return http.Response(
        jsonEncode({
          'id': 42,
          'inspector_name': jsonDecode(r.body)['inspector_name'],
        }),
        201,
      );
    });
    addTearDown(client.close);
    await http.runWithClient(() async {
      await form(tester, key: const ValueKey('A'));
      expect(inspector(tester), 'Maria Santos');
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(staffAuthTokenKey);
      await tester.pump(const Duration(seconds: 1));
      expect(inspector(tester), isEmpty);
      await session('session-B', 'breyes');
      await form(tester, key: const ValueKey('B'));
      expect(inspector(tester), 'Ben Reyes');
      await submit(tester);
      expect(posts, hasLength(1));
      expect(posts.single.headers['Authorization'], 'Token session-B');
      expect(jsonDecode(posts.single.body)['inspector_name'], 'Ben Reyes');
      expect(find.text('Inspector: Ben Reyes'), findsOneWidget);
    }, () => client);
  });
  test('historical name remains a stored snapshot', () {
    final item = SanitationInspectionItem.fromJson({
      'id': 99,
      'inspector_name': 'Legacy mcDONALD',
    });
    expect(item.inspectorName, 'Legacy mcDONALD');
  });
}
