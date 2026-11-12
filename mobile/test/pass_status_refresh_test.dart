// A pass kept on the phone says what it said when it was made ("Pending"). When the app is opened and the kept passes are read, the server is asked,
// ONCE, where each one stands now, with the survey ID and the contact number that are on the pass (the tourist types nothing). A pass that has been
// scanned then says "Arrived". When the server cannot be asked, the pass keeps what it had and nothing breaks. The people here are made up.
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

MobileVisitReceipt pass(String reference, {String status = 'pending', String contact = '+639000000001', String? checkedInAt}) => MobileVisitReceipt(
  reference: reference,
  destination: keptDestination(7, 'Sample Beach'),
  arrivalDate: DateTime(2099, 6, 1),
  totalVisitors: 2,
  status: status,
  fullName: 'Sample Person',
  contactNumber: contact,
  email: 'sample@example.test',
  checkedInAt: checkedInAt,
);

const profile = MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: '+639000000001');

/// The server, as the app asks it: [answers] says what each survey ID gets (a [MobilePassStatus], null for "not known", or an exception).
class StatusApi extends TourismApi {
  StatusApi(this.answers);

  final Map<String, Object?> answers;
  final List<(String, String)> asked = [];

  @override
  Future<MobilePassStatus?> fetchPassStatus({required String reference, required String contact}) async {
    asked.add((reference, contact));
    final answer = answers[reference];
    if (answer is Exception) throw answer;
    return answer as MobilePassStatus?;
  }
}

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
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<void> openVisitHistory(WidgetTester tester, int count) async {
  await tester.tap(find.text('Profile').last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Visit History & Entry Passes ($count)'));
  await tester.pumpAndSettle();
}

Future<void> keep(List<MobileVisitReceipt> visits) async {
  await const MyVisitsStore().saveVisits(visits);
  await const MyVisitsStore().saveProfile(profile);
}

Future<List<MobileVisitReceipt>> kept() async => (await const MyVisitsStore().read()).visits;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('opening the app brings a kept pass up to date', () {
    testWidgets('a pass that was Pending and has been scanned says Arrived, in the pass and in what is kept', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00')});

      await openApp(tester, api);
      await openVisitHistory(tester, 1);

      expect(find.text('Arrived'), findsWidgets);
      expect(find.text('Pending'), findsNothing);
      final stored = await kept();
      expect(stored.single.status, 'arrived');
      expect(stored.single.checkedInAt, '2099-06-01T08:30:00+00:00');
    });

    testWidgets('it is still Arrived when the app is opened again with no internet at all', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      await openApp(tester, StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00')}));

      await openApp(tester, StatusApi({'SURV-1': Exception('no internet')})); // the next opening cannot reach the server
      await openVisitHistory(tester, 1);

      expect(find.text('Arrived'), findsWidgets);
      expect(find.text('Pending'), findsNothing);
    });

    testWidgets('a pass that did not come is shown as Cancelled (the server says no_show)', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      await openApp(tester, StatusApi({'SURV-1': const MobilePassStatus(status: 'no_show')}));
      await openVisitHistory(tester, 1);

      expect(find.text('Cancelled'), findsWidgets);
      expect((await kept()).single.status, 'no_show');
    });

    testWidgets('the server is asked with the survey ID and the contact number that are ON the pass, once for each pass', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-2', contact: '+639000000002'), pass('SURV-1', contact: '+639000000001')]);
      final api = StatusApi({
        'SURV-1': const MobilePassStatus(status: 'pending'),
        'SURV-2': const MobilePassStatus(status: 'arrived'),
      });

      await openApp(tester, api);

      expect(api.asked.toSet(), {('SURV-1', '+639000000001'), ('SURV-2', '+639000000002')});
      expect(api.asked, hasLength(2));
    });

    testWidgets('it is asked once when the app is opened, not on every screen', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': const MobilePassStatus(status: 'pending')});

      await openApp(tester, api);
      for (final tab in ['Explore', 'Map', 'My Visit', 'Profile', 'Home']) {
        await tester.tap(find.text(tab).last);
        await tester.pumpAndSettle();
      }

      expect(api.asked, hasLength(1));
    });

    testWidgets('a pass that is already right is not written again, and nothing changes on screen', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1', status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00')]);

      await openApp(tester, StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00')}));
      await openVisitHistory(tester, 1);

      expect(find.text('Arrived'), findsWidgets);
      expect((await kept()).single.checkedInAt, '2099-06-01T08:30:00+00:00');
    });
  });

  group('when the server cannot be asked, the pass stays as it was', () {
    testWidgets('an error: the old status is shown, the pass is not taken away, and nothing crashes', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);

      await openApp(tester, StatusApi({'SURV-1': Exception('no internet')}));
      await openVisitHistory(tester, 1);

      expect(tester.takeException(), isNull);
      expect(find.text('Pending'), findsWidgets);
      expect(find.textContaining('PASS REF: SURV-1'), findsOneWidget);
      final stored = await kept();
      expect(stored, hasLength(1));
      expect(stored.single.status, 'pending');
    });

    testWidgets('the server does not know the pass (an empty answer): it is kept as it is, not taken away', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);

      await openApp(tester, StatusApi({'SURV-1': null}));
      await openVisitHistory(tester, 1);

      expect(find.text('Pending'), findsWidgets);
      expect((await kept()), hasLength(1));
    });

    testWidgets('one pass answers and one fails: the first is brought up to date and the second keeps what it had', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-2'), pass('SURV-1')]);

      await openApp(tester, StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived'), 'SURV-2': Exception('timeout')}));

      final byReference = {for (final item in await kept()) item.reference: item.status};
      expect(byReference, {'SURV-1': 'arrived', 'SURV-2': 'pending'});
    });

    testWidgets('the real client with no server behind it (every call fails): no crash, the pass stays', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);

      await http.runWithClient(
        () async {
          await openApp(tester, const TourismApi());
          await openVisitHistory(tester, 1);
        },
        () => MockClient((request) async => throw http.ClientException('no connection')),
      );

      expect(tester.takeException(), isNull);
      expect(find.text('Pending'), findsWidgets);
      expect((await kept()).single.status, 'pending');
    });

    testWidgets('a tourist with no kept pass asks nothing', (tester) async {
      bigScreen(tester);
      final api = StatusApi({});

      await openApp(tester, api);

      expect(api.asked, isEmpty);
    });

    testWidgets('a pass with no contact number on it is not asked about (the server needs both)', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1', contact: '')]);
      final api = StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')});

      await openApp(tester, api);

      expect(api.asked, isEmpty);
    });
  });

  group('the question the app asks', () {
    test('GET /mobile/tourism/records/status/ with the survey ID and the contact number, and no login', () async {
      late http.Request seen;
      final answer = await http.runWithClient(
        () => const TourismApi().fetchPassStatus(reference: ' SURV-1 ', contact: ' +639000000001 '),
        () => MockClient((request) async {
          seen = request;
          return http.Response(
            jsonEncode({
              'rows': [
                {'status': 'arrived', 'checked_in_at': '2099-06-01T08:30:00+00:00', 'destination_id': 7, 'destination_name': 'Sample Beach'},
              ],
              'summary': {'total': 1},
            }),
            200,
          );
        }),
      );

      expect(seen.method, 'GET');
      expect(seen.url.path, endsWith('/mobile/tourism/records/status/'));
      expect(seen.url.queryParameters, {'reference': 'SURV-1', 'contact': '+639000000001'});
      expect(seen.headers.containsKey('Authorization'), isFalse);
      expect(answer!.status, 'arrived');
      expect(answer.checkedInAt, '2099-06-01T08:30:00+00:00');
      expect(answer.destinationName, 'Sample Beach');
    });

    test('no rows is "not known": null, not an error', () async {
      final answer = await http.runWithClient(
        () => const TourismApi().fetchPassStatus(reference: 'SURV-1', contact: '0900'),
        () => MockClient((request) async => http.Response(jsonEncode({'rows': <dynamic>[], 'summary': {'total': 0}}), 200)),
      );

      expect(answer, isNull);
    });

    test('a failed answer is thrown, for the caller to keep what it knew', () async {
      for (final code in [400, 404, 500]) {
        await expectLater(
          http.runWithClient(
            () => const TourismApi().fetchPassStatus(reference: 'SURV-1', contact: '0900'),
            () => MockClient((request) async => http.Response('{"detail": "no"}', code)),
          ),
          throwsA(anything),
          reason: 'status $code',
        );
      }
    });

    test('a row with no status is not an answer', () {
      expect(MobilePassStatus.tryParse({'checked_in_at': 'x'}), isNull);
      expect(MobilePassStatus.tryParse({'status': ''}), isNull);
    });
  });

  group('the receipt', () {
    test('withStatus changes the status and the check-in time and nothing else', () {
      final updated = pass('SURV-1').withStatus('arrived', '2099-06-01T08:30:00+00:00');

      expect(updated.status, 'arrived');
      expect(updated.checkedInAt, '2099-06-01T08:30:00+00:00');
      expect(updated.reference, 'SURV-1');
      expect(updated.contactNumber, '+639000000001');
      expect(updated.fullName, 'Sample Person');
      expect(updated.destination.name, 'Sample Beach');
      expect(updated.totalVisitors, 2);
    });

    test('the check-in time is kept and read back; a copy made before it existed reads fine', () async {
      await keep([pass('SURV-1', status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00')]);
      expect((await kept()).single.checkedInAt, '2099-06-01T08:30:00+00:00');

      final old = pass('SURV-OLD').toStoredJson()..remove('checked_in_at');
      SharedPreferences.setMockInitialValues({'tourism_my_visits_v1': [jsonEncode(old)]});
      final read = (await kept()).single;
      expect(read.reference, 'SURV-OLD');
      expect(read.checkedInAt, isNull);
    });
  });
}
