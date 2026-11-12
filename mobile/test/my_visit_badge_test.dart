// A small red dot on the My Visit tab says "there is something new here": a pass that was added, or a pass whose status changed (the tourist was
// scanned and it is now Arrived). It goes when the My Visit tab is opened, and by nothing else; it is kept on the phone, so it is still there when
// the app is closed and opened again before the tourist has looked. The people here are made up.
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
  'referenceTables': {
    'countries': [
      {'id': 1, 'name': 'Philippines', 'type': 'local'},
    ],
    'regions': [
      {'id': 4, 'name': 'CALABARZON Region'},
    ],
    'provinces': [
      {'id': 1, 'name': 'Quezon', 'region_id': 4},
    ],
    'boatTypes': [
      {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': false},
    ],
  },
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

MobileVisitReceipt pass(String reference, {String status = 'pending'}) => MobileVisitReceipt(
  reference: reference,
  destination: keptDestination(7, 'Sample Beach'),
  arrivalDate: DateTime(2099, 6, 1),
  totalVisitors: 2,
  status: status,
  fullName: 'Sample Person',
  contactNumber: '+639000000001',
  email: 'sample@example.test',
);

const profile = MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: '+639000000001');

/// The server's answer about a pass, as the app asks it: [answers] says what each survey ID gets (null for "not known").
class StatusApi extends TourismApi {
  StatusApi([this.answers = const {}]);

  final Map<String, MobilePassStatus?> answers;

  @override
  Future<MobilePassStatus?> fetchPassStatus({required String reference, required String contact}) async => answers[reference];
}

final dot = find.byKey(const ValueKey('my-visit-news-dot'));

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 6000);
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

/// The app opened: a new shell, reading what the phone kept (the old one is gone, as when the app is closed).
Future<void> openApp(WidgetTester tester, {TourismApi? api}) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
      home: MobileShell(api: api ?? StatusApi(), state: TourismBootstrapState.loaded(bootstrap()), onRetry: () {}, onSignOut: () {}),
    ),
  );
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

Future<void> openTab(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> keepPasses(List<MobileVisitReceipt> passes) async {
  await const MyVisitsStore().saveVisits(passes);
  await const MyVisitsStore().saveProfile(profile);
}

Future<bool> newsKept() async => (await const MyVisitsStore().read()).news;

Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async {
    final path = request.url.path;
    if (path.endsWith('/mobile/tourism/register-visit/')) {
      return http.Response(
        jsonEncode({'survey_id': 'SURV-NEW-1', 'full_name': 'Sample Person', 'contact_number': '+639000000001', 'email': 'sample@example.test', 'status': 'pending', 'total_visitors': 1}),
        201,
      );
    }
    if (path.endsWith('/mobile/tourism/feedback/')) {
      return http.Response(jsonEncode({'id': 77, 'reviewer': 'Sample Person', 'rating': 5, 'message': 'A made-up review.', 'date': '2099-06-02'}), 201);
    }
    if (path.contains('/mobile/tourism/destinations/')) {
      return http.Response(jsonEncode({'destination': sampleBeach, 'recentFeedback': <dynamic>[]}), 200);
    }
    return http.Response('', 404);
  }),
);

/// From a destination's "Plan Visit / Get Pass" (the tourist is on the Explore side, not on My Visit), through the pass, back to the tabs.
Future<void> registerFromDestination(WidgetTester tester, {bool backToTabs = true}) async {
  await mocked(() async {
    await tester.tap(find.text('Explore').last);
    await settle(tester);
    await tester.tap(find.text('Sample Beach').first);
    await settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Plan Visit / Get Pass'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
    await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
    await tester.enterText(find.widgetWithText(TextField, 'Contact number *'), '09000000001');
    await tester.enterText(find.widgetWithText(TextField, 'Email address (Optional)'), 'sample@example.test');
    final button = find.text('Submit Registration');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await settle(tester);
    await tester.tap(find.byIcon(Icons.close).last); // close the pass
    await settle(tester);
  });
  if (backToTabs) {
    await tester.pageBack(); // from the destination's page to the tabs
    await settle(tester);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('it shows when there is something new', () {
    testWidgets('there is no dot for a tourist with nothing new', (tester) async {
      bigScreen(tester);
      await openApp(tester);

      expect(dot, findsNothing);
      expect(find.byType(NewsDot), findsNothing);
    });

    testWidgets('after registering, the My Visit tab has a dot', (tester) async {
      bigScreen(tester);
      await openApp(tester);

      await registerFromDestination(tester);

      expect(dot, findsOneWidget);
      expect(find.byType(NewsDot), findsOneWidget); // only that tab
      expect(await newsKept(), isTrue);
    });

    testWidgets('a pass whose status changed in the refresh (they were scanned) puts the dot on', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);

      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived', checkedInAt: '2099-06-01T08:30:00+00:00')}));

      expect(dot, findsOneWidget);
      expect(await newsKept(), isTrue);
    });

    testWidgets('a refresh that finds the status the same is not news', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);

      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'pending')}));

      expect(dot, findsNothing);
      expect(await newsKept(), isFalse);
    });

    testWidgets('a refresh that fails or finds nothing is not news', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);

      await openApp(tester, api: StatusApi({'SURV-1': null}));

      expect(dot, findsNothing);
    });

    testWidgets('kept passes with nothing changed show no dot when the app is opened', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1'), pass('SURV-2', status: 'arrived')]);

      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'pending'), 'SURV-2': const MobilePassStatus(status: 'arrived')}));

      expect(dot, findsNothing);
    });

    testWidgets('a pass registered while the tourist is on My Visit itself is not news: they are looking at it', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await mocked(() async {
        await openTab(tester, 'My Visit');
        await tester.tap(find.text('Register / Get Pass'));
        await settle(tester);
        final tile = find.byWidgetPredicate((w) => w is DropdownTile<Destination?> && w.label == 'Destination / Resort *');
        await tester.ensureVisible(tile);
        await tester.tap(find.descendant(of: tile, matching: find.byType(DropdownButtonFormField<Destination?>)));
        await settle(tester);
        await tester.tap(find.text('Sample Beach').last);
        await settle(tester);
        await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
        await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
        await tester.enterText(find.widgetWithText(TextField, 'Contact number *'), '09000000001');
        final button = find.text('Submit Registration');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        await settle(tester);
        await tester.tap(find.byIcon(Icons.close).last);
        await settle(tester);
      });

      expect(dot, findsNothing);
      expect(await newsKept(), isFalse);
      expect((await const MyVisitsStore().read()).visits, hasLength(1)); // the pass is there, and was seen
    });

    testWidgets('feedback is not news for My Visit', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await tester.tap(find.text('Explore').last);
      await tester.pump(const Duration(milliseconds: 300));
      await mocked(() async {
        await tester.tap(find.text('Sample Beach').first);
        await settle(tester);
        await tester.tap(find.widgetWithText(OutlinedButton, 'Review'));
        await settle(tester);
        await tester.enterText(find.widgetWithText(TextField, 'What did you like?'), 'A made-up review.');
        final submit = find.text('Submit Feedback');
        await tester.ensureVisible(submit);
        await tester.tap(submit);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        await settle(tester);
        await tester.tap(find.widgetWithText(FilledButton, 'Done'));
        await settle(tester);
      });
      await tester.pageBack();
      await settle(tester);

      expect((await const MyVisitsStore().read()).feedback, hasLength(1));
      expect(dot, findsNothing);
    });
  });

  group('it goes when My Visit is opened, and by nothing else', () {
    testWidgets('opening My Visit takes it away, and what is kept says so', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await registerFromDestination(tester);
      expect(dot, findsOneWidget);

      await openTab(tester, 'My Visit');

      expect(dot, findsNothing);
      expect(await newsKept(), isFalse);
      expect((await SharedPreferences.getInstance()).containsKey(tourismMyVisitNewsKey), isFalse);
    });

    testWidgets('opening the other tabs, one after another, does not take it away', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await registerFromDestination(tester);

      for (final tab in ['Home', 'Explore', 'Map', 'Profile']) {
        await openTab(tester, tab);
        expect(dot, findsOneWidget, reason: 'after opening $tab');
      }
      expect(await newsKept(), isTrue);
    });

    testWidgets('looking at the passes in the Profile (Visit History) does not take it away either', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));
      expect(dot, findsOneWidget);

      await openTab(tester, 'Profile');
      await tester.tap(find.text('Visit History & Entry Passes (1)'));
      await tester.pumpAndSettle();
      expect(find.textContaining('PASS REF: SURV-1'), findsOneWidget);
      Navigator.of(tester.element(find.byType(Scaffold).last)).pop(); // back from the Visit History page
      await tester.pumpAndSettle();

      expect(dot, findsOneWidget);
    });

    testWidgets('a second thing that is new while the dot is on keeps it on, and one visit takes it away', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1'), pass('SURV-2')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived'), 'SURV-2': const MobilePassStatus(status: 'no_show')}));
      expect(dot, findsOneWidget);

      await openTab(tester, 'My Visit');

      expect(dot, findsNothing);
    });
  });

  group('it is kept on the phone', () {
    testWidgets('the app is closed and opened again BEFORE the tourist looked: the dot is still there', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await registerFromDestination(tester);
      expect(dot, findsOneWidget);

      await openApp(tester); // closed and opened again
      expect(dot, findsOneWidget);
      await openApp(tester); // and again
      expect(dot, findsOneWidget);
    });

    testWidgets('the app is closed and opened again AFTER the tourist looked: no dot', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await registerFromDestination(tester);
      await openTab(tester, 'My Visit');

      await openApp(tester);

      expect(dot, findsNothing);
    });

    testWidgets('the dot of a status change is kept too, and a later opening that finds nothing new does not bring it back', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));
      expect(dot, findsOneWidget);

      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')})); // closed and opened again: same status now
      expect(dot, findsOneWidget); // still not looked at

      await openTab(tester, 'My Visit');
      expect(dot, findsNothing);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));
      expect(dot, findsNothing); // seen, and nothing has changed since
    });

    testWidgets('a status that changes again after it was seen is news again', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));
      await openTab(tester, 'My Visit');
      expect(dot, findsNothing);

      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'no_show')}));

      expect(dot, findsOneWidget);
    });

    testWidgets('Sign Out takes the dot away with everything else', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));
      expect(dot, findsOneWidget);

      await openTab(tester, 'Profile');
      await tester.ensureVisible(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Sign Out'));
      await tester.pumpAndSettle();

      expect(dot, findsNothing);
      expect((await SharedPreferences.getInstance()).containsKey(tourismMyVisitNewsKey), isFalse);
      await openApp(tester);
      expect(dot, findsNothing);
    });

    test('the store keeps "news" under a key with a version, and nothing for "no news"', () async {
      await const MyVisitsStore().saveNews(true);
      expect((await SharedPreferences.getInstance()).getBool('tourism_my_visit_news_v1'), isTrue);
      expect((await const MyVisitsStore().read()).news, isTrue);

      await const MyVisitsStore().saveNews(false);
      expect((await SharedPreferences.getInstance()).containsKey('tourism_my_visit_news_v1'), isFalse);
      expect((await const MyVisitsStore().read()).news, isFalse);
    });

    test('a damaged value under the key is no news, and does not crash', () async {
      SharedPreferences.setMockInitialValues({'tourism_my_visit_news_v1': 'yes please'});

      final mine = await const MyVisitsStore().read();

      expect(mine.news, isFalse);
    });

    test('clear() takes the key away too', () async {
      await const MyVisitsStore().saveNews(true);

      expect(await const MyVisitsStore().clear(), isTrue);
      expect((await SharedPreferences.getInstance()).containsKey('tourism_my_visit_news_v1'), isFalse);
    });
  });

  group('how it looks', () {
    testWidgets('a small red dot at the top right of the My Visit icon, with no number, like the one on the bell', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));

      final dotBox = tester.getRect(dot);
      final icon = tester.getRect(find.byIcon(Icons.route_outlined));
      expect(dotBox.size, const Size(9, 9));
      expect(dotBox.center.dx, greaterThan(icon.center.dx)); // to the right of the icon's middle
      expect(dotBox.center.dy, lessThan(icon.center.dy)); // above its middle
      expect(find.descendant(of: dot, matching: find.byType(Text)), findsNothing); // no number
      final decoration = tester.widget<Container>(find.descendant(of: dot, matching: find.byType(Container)).first).decoration as BoxDecoration;
      expect(decoration.color, const Color(0xFFEF4444));
      expect(decoration.shape, BoxShape.circle);
    });

    testWidgets('no other tab has a dot', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1')]);
      await openApp(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));

      expect(find.byType(NewsDot), findsOneWidget);
      final bar = find.byType(NavigationBar);
      expect(find.descendant(of: bar, matching: find.byType(NewsDot)), findsOneWidget);
      for (final tab in ['Home', 'Explore', 'Map', 'Profile']) {
        final destination = find.ancestor(of: find.text(tab), matching: find.byType(NavigationDestination)).first;
        expect(find.descendant(of: destination, matching: find.byType(NewsDot)), findsNothing, reason: tab);
      }
    });
  });
}
