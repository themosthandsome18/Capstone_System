// A notice when one of the tourist's own passes CHANGES: it was scanned on arrival (Arrived) or it was cancelled. It is made from the change the app sees when
// it brings the passes up to date on opening (the same moment that puts the red dot on My Visit): ONE notice for each change, never for a pass that is
// still pending, never at every opening, and never for a pass that was already Arrived before the app could tell. Pressing it opens that pass; the X or a
// swipe removes it for good. The people here are made up.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

MobileVisitReceipt pass(String reference, {String status = 'pending', DateTime? arrival}) => MobileVisitReceipt(
  reference: reference,
  destination: keptDestination(7, 'Sample Beach'),
  arrivalDate: arrival ?? DateTime(2099, 6, 1),
  totalVisitors: 2,
  status: status,
  fullName: 'Sample Person',
  contactNumber: phone,
  email: 'sample@example.test',
);

/// The server, as the app asks it: [answers] says what each survey ID is now (a [MobilePassStatus], null for "not known", or an exception).
class StatusApi extends TourismApi {
  StatusApi(this.answers);

  final Map<String, Object?> answers;
  final List<String> asked = [];

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

MobilePassStatus now(String status) => MobilePassStatus(status: status, checkedInAt: status == 'arrived' ? '2099-06-01T08:30:00+00:00' : null);

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

Future<Map<String, String>> events() async => (await const MyVisitsStore().read()).passEvents;
Future<List<MobileVisitReceipt>> kept() async => (await const MyVisitsStore().read()).visits;

final bell = find.byIcon(Icons.notifications_outlined);
final dot = find.byKey(const ValueKey('bell-dot'));
const arrivedTitle = 'Your arrival was recorded';
const cancelledTitle = 'Your visit was cancelled';
const arrivedMessage = 'Your visit to Sample Beach was scanned when you arrived.';

Future<void> openNotifications(WidgetTester tester) async {
  await tester.tap(bell);
  await tester.pumpAndSettle();
}

Future<void> goBack(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.arrow_back));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('a pass changes', () {
    testWidgets('Pending to Arrived: a notice with its words, and a red dot on the bell', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);

      await openApp(tester, StatusApi({'SURV-1': now('arrived')}));

      expect(dot, findsOneWidget);
      await openNotifications(tester);
      expect(find.text(arrivedTitle), findsOneWidget);
      expect(find.text(arrivedMessage), findsOneWidget);
      expect(find.text('Pass'), findsWidgets);
      expect(await events(), {'SURV-1': 'arrived'});
    });

    testWidgets('Pending to Cancelled: a notice that says which visit and on what day', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1', arrival: DateTime(2099, 6, 1))]);

      await openApp(tester, StatusApi({'SURV-1': now('no_show')}));

      expect(dot, findsOneWidget);
      await openNotifications(tester);
      expect(find.text(cancelledTitle), findsOneWidget);
      expect(find.text('Your visit to Sample Beach on 1 Jun 2099 was marked cancelled.'), findsOneWidget);
      expect(find.text(arrivedTitle), findsNothing);
      expect(await events(), {'SURV-1': 'no_show'});
    });

    testWidgets('still Pending: no notice and no dot', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);

      await openApp(tester, StatusApi({'SURV-1': now('pending')}));

      expect(dot, findsNothing);
      await openNotifications(tester);
      expect(find.text(arrivedTitle), findsNothing);
      expect(find.text(cancelledTitle), findsNothing);
      expect(await events(), isEmpty);
    });

    testWidgets('a pass the server does not know, or cannot be asked about, makes no notice', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1'), pass('SURV-2')]);

      await openApp(tester, StatusApi({'SURV-1': null, 'SURV-2': Exception('no connection')}));

      expect(dot, findsNothing);
      expect(await events(), isEmpty);
    });

    testWidgets('a pass that goes on from Arrived to Cancelled gives the new notice in place of the old one', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      await openApp(tester, StatusApi({'SURV-1': now('arrived')}));
      await keep([...await kept()]); // (what is kept stays)

      await openApp(tester, StatusApi({'SURV-1': now('no_show')}));
      await openNotifications(tester);

      expect(find.text(cancelledTitle), findsOneWidget);
      expect(find.text(arrivedTitle), findsNothing);
      expect(await events(), {'SURV-1': 'no_show'});
    });
  });

  group('one notice for each change, and never a false one', () {
    testWidgets('Arrived and still Arrived: nothing new, at any opening', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1', status: 'arrived')]);

      for (var opening = 0; opening < 3; opening++) {
        await openApp(tester, StatusApi({'SURV-1': now('arrived')}));
        expect(dot, findsNothing, reason: 'opening ${opening + 1}');
      }

      await openNotifications(tester);
      expect(find.text(arrivedTitle), findsNothing);
      expect(await events(), isEmpty);
    });

    testWidgets('a pass that was ALREADY Arrived before this existed: no notice at the first opening after the update (no events were ever kept)', (tester) async {
      bigScreen(tester);
      // exactly what an older copy left on the phone: a pass that says arrived, and no record of any change
      await keep([pass('SURV-1', status: 'arrived'), pass('SURV-2', status: 'no_show')]);
      expect((await const MyVisitsStore().read()).passEvents, isEmpty);

      await openApp(tester, StatusApi({'SURV-1': now('arrived'), 'SURV-2': now('no_show')}));

      expect(dot, findsNothing);
      await openNotifications(tester);
      expect(find.text(arrivedTitle), findsNothing);
      expect(find.text(cancelledTitle), findsNothing);
      expect(find.text('No new advisories'), findsOneWidget);
    });

    testWidgets('the change is one notice: opening again changes nothing, the dot stays gone once it was seen, and a removed notice does not return', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': now('arrived')});

      await openApp(tester, api); // the change is seen here
      expect(dot, findsOneWidget);
      await openNotifications(tester);
      await goBack(tester);
      expect(dot, findsNothing);

      await openApp(tester, api); // now it already says arrived: no change
      expect(dot, findsNothing);
      await openNotifications(tester);
      expect(find.text(arrivedTitle), findsOneWidget); // still the one notice, once
    });

    testWidgets('a pass kept as Arrived by the app is not given a notice later when the server repeats it', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      await openApp(tester, StatusApi({'SURV-1': now('arrived')}));
      expect((await kept()).single.status, 'arrived');

      final second = StatusApi({'SURV-1': now('arrived')});
      await openApp(tester, second);

      expect(second.asked, ['SURV-1']);
      expect(await events(), {'SURV-1': 'arrived'}); // the one that was, and nothing more
    });

    testWidgets('two passes, one changes: one notice, for that pass', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1'), pass('SURV-2')]);

      await openApp(tester, StatusApi({'SURV-1': now('pending'), 'SURV-2': now('arrived')}));
      await openNotifications(tester);

      expect(find.text(arrivedTitle), findsOneWidget);
      expect(await events(), {'SURV-2': 'arrived'});
    });
  });

  group('pressing and removing', () {
    testWidgets('pressing the notice opens THAT pass', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1'), pass('SURV-2')]);

      await openApp(tester, StatusApi({'SURV-2': now('arrived')}));
      await openNotifications(tester);
      await tester.tap(find.text(arrivedTitle));
      await tester.pumpAndSettle();

      expect(find.text('My Pass'), findsOneWidget);
      expect(find.text('PASS REF: SURV-2'), findsOneWidget);
      expect(find.text('PASS REF: SURV-1'), findsNothing);
      expect(find.text('Arrived'), findsWidgets); // the pass says what it says now
    });

    testWidgets('the X removes it at once and it does not come back when the app is opened again', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': now('arrived')});
      await openApp(tester, api);
      await openNotifications(tester);

      await tester.tap(find.byKey(const ValueKey('notice-x-pass-SURV-1-arrived')));
      await tester.pumpAndSettle();

      expect(find.text(arrivedTitle), findsNothing);
      expect((await const MyVisitsStore().read()).removedNotices, {'pass-SURV-1-arrived'});
      await openApp(tester, api);
      expect(dot, findsNothing);
      await openNotifications(tester);
      expect(find.text(arrivedTitle), findsNothing);
    });

    testWidgets('a swipe removes it too, and it stays removed', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': now('no_show')});
      await openApp(tester, api);
      await openNotifications(tester);

      await tester.drag(find.byKey(const ValueKey('dismiss-pass-SURV-1-no_show')), const Offset(-600, 0));
      await tester.pumpAndSettle();

      expect(find.text(cancelledTitle), findsNothing);
      await openApp(tester, api);
      await openNotifications(tester);
      expect(find.text(cancelledTitle), findsNothing);
    });

    testWidgets('the dot goes when the Notifications page is opened and stays gone', (tester) async {
      bigScreen(tester);
      await keep([pass('SURV-1')]);
      final api = StatusApi({'SURV-1': now('arrived')});
      await openApp(tester, api);
      expect(dot, findsOneWidget);

      await openNotifications(tester);
      await goBack(tester);
      expect(dot, findsNothing);

      await openApp(tester, api);
      expect(dot, findsNothing);
    });
  });

  group('what is kept', () {
    test('which passes were seen to change come back as they were kept, and a value that is not a status is left out', () async {
      await const MyVisitsStore().savePassEvents({'SURV-1': 'arrived', 'SURV-2': 'no_show'});
      expect((await const MyVisitsStore().read()).passEvents, {'SURV-1': 'arrived', 'SURV-2': 'no_show'});

      SharedPreferences.setMockInitialValues({tourismPassEventsKey: '{"SURV-1":"arrived","SURV-2":"pending","":"arrived","SURV-3":5}'});
      expect((await const MyVisitsStore().read()).passEvents, {'SURV-1': 'arrived'});
    });

    test('a value of another kind under the key is nothing kept, not a crash', () async {
      SharedPreferences.setMockInitialValues({tourismPassEventsKey: 'not json'});
      expect((await const MyVisitsStore().read()).passEvents, isEmpty);

      SharedPreferences.setMockInitialValues({tourismPassEventsKey: 7});
      expect((await const MyVisitsStore().read()).passEvents, isEmpty);
    });

    test('Sign Out takes them off the phone too', () async {
      await const MyVisitsStore().savePassEvents({'SURV-1': 'arrived'});

      expect(await const MyVisitsStore().clear(), isTrue);

      expect((await const MyVisitsStore().read()).passEvents, isEmpty);
    });

    testWidgets('a change kept for a pass that is no longer kept makes no notice and no crash', (tester) async {
      bigScreen(tester);
      await const MyVisitsStore().savePassEvents({'SURV-GONE': 'arrived'});
      await keep([pass('SURV-1')]);

      await openApp(tester, StatusApi({'SURV-1': now('pending')}));

      expect(tester.takeException(), isNull);
      expect(dot, findsNothing);
    });
  });

  group('the words', () {
    test('the notice has its id from the pass and the status, and nothing of a person', () {
      final arrived = AppNotification.passChanged(pass('SURV-1', status: 'arrived'))!;
      final cancelled = AppNotification.passChanged(pass('SURV-1', status: 'no_show'))!;

      expect(arrived.id, 'pass-SURV-1-arrived');
      expect(cancelled.id, 'pass-SURV-1-no_show');
      expect(arrived.id, isNot(cancelled.id));
      for (final notice in [arrived, cancelled]) {
        expect('${notice.title} ${notice.message}', isNot(contains('Sample Person')));
        expect('${notice.title} ${notice.message}', isNot(contains(phone)));
        expect(notice.isPass, isTrue);
      }
    });

    test('a pass that is pending has no notice', () {
      expect(AppNotification.passChanged(pass('SURV-1')), isNull);
      expect(AppNotification.passChanged(pass('SURV-1', status: 'something_else')), isNull);
    });
  });
}
