// A pass the server does not know (its record was deleted, or the database was reset) used to be asked about at EVERY opening of the app, and each of those
// questions counts against the tourist's own limit on the server (30 failures an hour), until the limit shut out their real passes too. Now, when the server
// ANSWERS that it does not know a pass (no rows), the app keeps that on the phone and does not ask about it again; the pass stays in the list. A refusal
// (429), no network, a timeout and an answer that cannot be read are failures, not "not known": they are asked again at the next opening.
// The people here are made up.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const sampleBeach = {
  'resort_id': 7,
  'resort_name': 'Sample Beach',
  'type': 'Beach Resort',
  'location': 'Mauban, Quezon',
  'latitude': 14.2,
  'longitude': 121.7,
};

MobileBootstrap bootstrap() => MobileBootstrap.fromJson({
  'destinations': [sampleBeach],
  'featuredDestinations': [sampleBeach],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

const phone = '+639000000001';

MobileVisitReceipt pass(String reference, {String status = 'pending'}) => MobileVisitReceipt(
  reference: reference,
  destination: keptDestination(7, 'Sample Beach'),
  arrivalDate: DateTime(2099, 6, 1),
  totalVisitors: 2,
  status: status,
  fullName: 'Sample Person',
  contactNumber: phone,
  email: 'sample@example.test',
);

/// The server, as the app asks it. [answers] says what each survey ID gets NOW (change it between openings): a [MobilePassStatus], null for "the server
/// answered that it does not know it", or an exception for a failure.
class StatusApi extends TourismApi {
  StatusApi(this.answers);

  final Map<String, Object?> answers;
  final List<String> asked = [];

  int timesAsked(String reference) => asked.where((item) => item == reference).length;

  @override
  Future<MobilePassStatus?> fetchPassStatus({required String reference, required String contact}) async {
    asked.add(reference);
    final answer = answers[reference];
    if (answer is Exception) throw answer;
    return answer as MobilePassStatus?;
  }

  @override
  Future<List<MobileFeedbackReply>> fetchFeedbackReplies({required String reference, required String contact}) async => const [];
}

const arrived = MobilePassStatus(status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00');
const tooMany = ApiException(statusCode: 429, message: 'Too many attempts from this device. Please try again in an hour.');

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset') || text.contains('NetworkImage') || text.contains('HTTP request failed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

Future<void> openApp(WidgetTester tester, TourismApi api) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
      home: MobileShell(api: api, state: TourismBootstrapState.loaded(bootstrap()), onRetry: () {}, onSignOut: () {}),
    ),
  );
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}

Future<void> keep(List<MobileVisitReceipt> passes) async {
  await const MyVisitsStore().saveVisits(passes);
  await const MyVisitsStore().saveProfile(const MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: phone));
}

Future<Set<String>> unknown() async => (await const MyVisitsStore().read()).unknownPasses;
Future<List<MobileVisitReceipt>> kept() async => (await const MyVisitsStore().read()).visits;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('a pass the server does not know', () {
    testWidgets('is asked about ONCE, and not at the next openings', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-GONE')]);
      final api = StatusApi({'SURV-GONE': null});

      await openApp(tester, api);
      await openApp(tester, api);
      await openApp(tester, api);

      expect(api.timesAsked('SURV-GONE'), 1);
      expect(await unknown(), {'SURV-GONE'});
    });

    testWidgets('stays in the list: it is not taken away, and keeps what it said', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-GONE'), pass('SURV-2')]);
      final api = StatusApi({'SURV-GONE': null, 'SURV-2': arrived});

      await openApp(tester, api);
      await openApp(tester, api);

      final passes = await kept();
      expect(passes.map((item) => item.reference).toSet(), {'SURV-GONE', 'SURV-2'});
      expect(passes.firstWhere((item) => item.reference == 'SURV-GONE').status, 'pending'); // unchanged
    });

    testWidgets('is remembered after the app is closed: the next copy of the app does not ask either', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-GONE')]);
      await openApp(tester, StatusApi({'SURV-GONE': null}));

      final next = StatusApi({'SURV-GONE': arrived}); // even if the server would know it now, the question is not asked
      await openApp(tester, next);

      expect(next.asked, isEmpty);
      expect((await kept()).single.status, 'pending');
    });

    testWidgets('many of them (a reset database): each is asked once in all, not once at every opening', (tester) async {
      bigScreen(tester);
      await keep([for (var i = 1; i <= 6; i++) pass('SURV-OLD-$i')]);
      final api = StatusApi({for (var i = 1; i <= 6; i++) 'SURV-OLD-$i': null});

      for (var opening = 0; opening < 5; opening++) {
        await openApp(tester, api);
      }

      expect(api.asked.length, 6); // 6 questions in all, where it used to be 30
      expect((await unknown()).length, 6);
    });
  });

  group('a pass the server knows', () {
    testWidgets('is still asked at every opening, also next to one the server does not know', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-GONE'), pass('SURV-1')]);
      final api = StatusApi({'SURV-GONE': null, 'SURV-1': const MobilePassStatus(status: 'pending')});

      await openApp(tester, api);
      await openApp(tester, api);
      await openApp(tester, api);

      expect(api.timesAsked('SURV-1'), 3);
      expect(api.timesAsked('SURV-GONE'), 1);
      expect(await unknown(), {'SURV-GONE'});
    });

    testWidgets('still brings its status up to date', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-GONE'), pass('SURV-1')]);
      final api = StatusApi({'SURV-GONE': null, 'SURV-1': const MobilePassStatus(status: 'pending')});
      await openApp(tester, api);

      api.answers['SURV-1'] = arrived;
      await openApp(tester, api);

      expect((await kept()).firstWhere((item) => item.reference == 'SURV-1').status, 'arrived');
    });
  });

  group('a failure is not "not known": the pass is asked again at the next opening', () {
    testWidgets('a refusal (429)', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': tooMany});

      await openApp(tester, api);
      expect(await unknown(), isEmpty);
      api.answers['SURV-1'] = arrived; // the hour has passed
      await openApp(tester, api);

      expect(api.timesAsked('SURV-1'), 2);
      expect((await kept()).single.status, 'arrived');
      expect(await unknown(), isEmpty);
    });

    testWidgets('no network', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': http.ClientException('no connection')});

      await openApp(tester, api);
      await openApp(tester, api);

      expect(api.timesAsked('SURV-1'), 2);
      expect(await unknown(), isEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a timeout', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': TimeoutException('too slow')});

      await openApp(tester, api);
      await openApp(tester, api);

      expect(api.timesAsked('SURV-1'), 2);
      expect(await unknown(), isEmpty);
    });

    testWidgets('after a failure and then "not known", it is asked no more', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': tooMany});
      await openApp(tester, api);
      api.answers['SURV-1'] = null; // answered at last: it does not know it
      await openApp(tester, api);
      await openApp(tester, api);

      expect(api.timesAsked('SURV-1'), 2);
      expect(await unknown(), {'SURV-1'});
    });

    testWidgets('the real client: a 429, no network and an answer that is not understood are all failures, and nothing is remembered', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      var calls = 0;
      final replies = <http.Response Function()>[
        () => http.Response(jsonEncode({'detail': 'Too many attempts from this device. Please try again in an hour.'}), 429),
        () => throw http.ClientException('no connection'),
        () => http.Response(jsonEncode({'summary': {'total': 0}}), 200), // no "rows" at all
        () => http.Response(jsonEncode({'rows': [5], 'summary': {'total': 1}}), 200), // a row that is not a status
        () => http.Response('<html>oops</html>', 200),
      ];

      await http.runWithClient(
        () async {
          for (var opening = 0; opening < replies.length; opening++) {
            await openApp(tester, const TourismApi());
          }
        },
        () => MockClient((request) async {
          if (!request.url.path.endsWith('/mobile/tourism/records/status/')) return http.Response('', 404);
          return replies[calls++ % replies.length]();
        }),
      );

      expect(calls, replies.length); // asked at every one of the openings
      expect(await unknown(), isEmpty);
      expect(tester.takeException(), isNull);
    });
  });

  group('what the app is told', () {
    test('an empty list of rows is the one answer that means "not known" (null); anything that cannot be read is a failure', () async {
      Future<MobilePassStatus?> ask(http.Response Function() reply) =>
          http.runWithClient(() => const TourismApi().fetchPassStatus(reference: 'SURV-1', contact: phone), () => MockClient((request) async => reply()));

      expect(await ask(() => http.Response(jsonEncode({'rows': <dynamic>[], 'summary': {'total': 0}}), 200)), isNull);
      expect((await ask(() => http.Response(jsonEncode({'rows': [{'status': 'arrived'}], 'summary': {'total': 1}}), 200)))!.status, 'arrived');
      await expectLater(ask(() => http.Response(jsonEncode({'detail': 'Too many.'}), 429)), throwsA(isA<ApiException>()));
      await expectLater(ask(() => http.Response(jsonEncode({'summary': {}}), 200)), throwsA(isA<ApiException>()));
      await expectLater(ask(() => http.Response(jsonEncode({'rows': ['x']}), 200)), throwsA(isA<ApiException>()));
      await expectLater(ask(() => http.Response(jsonEncode({'rows': [{'no_status': 1}]}), 200)), throwsA(isA<ApiException>()));
      await expectLater(ask(() => http.Response('', 503)), throwsA(isA<ApiException>()));
    });
  });

  group('what is kept', () {
    test('which passes the server does not know come back as they were kept', () async {
      await const MyVisitsStore().saveUnknownPasses({'SURV-A', 'SURV-B'});

      expect((await const MyVisitsStore().read()).unknownPasses, {'SURV-A', 'SURV-B'});
    });

    test('Sign Out takes it off the phone too, so a new tourist on this phone starts clean', () async {
      await const MyVisitsStore().saveUnknownPasses({'SURV-A'});

      expect(await const MyVisitsStore().clear(), isTrue);

      expect((await const MyVisitsStore().read()).unknownPasses, isEmpty);
    });

    test('a value of another kind under the key is nothing kept, not a crash', () async {
      SharedPreferences.setMockInitialValues({tourismUnknownPassesKey: 'not a list'});

      expect((await const MyVisitsStore().read()).unknownPasses, isEmpty);
    });
  });
}
