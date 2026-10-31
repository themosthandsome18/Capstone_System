// 9b: the Home reads `appContent` for the Welcome and the Why Visit (the title, the subtitle, the body and the pillars). The rule of every case in this file:
// THE TOURIST ALWAYS HAS A TEXT TO READ. When the server sends nothing, or nothing the app can use, the text written in the code is shown; and every part is
// decided on its own. Every test that has a fixture asserts, inside the test, that the fixture reached the case it is for.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Map<String, dynamic> realContent() => jsonDecode(File('test/data/app_content_commit3.json').readAsStringSync()) as Map<String, dynamic>;

/// The real value with every text of the server made different from the code's, so a test can tell where a text came from.
Map<String, dynamic> serverContent() {
  final content = realContent();
  for (final block in (content['blocks'] as Map<String, dynamic>).values) {
    for (final field in (block as Map<String, dynamic>).keys.toList()) {
      block[field] = 'SERVER ${block[field]}';
    }
  }
  for (final item in (content['sections']['why_visit'] as List).cast<Map<String, dynamic>>()) {
    item['title'] = 'SERVER ${item['title']}';
    item['short_text'] = 'SERVER ${item['short_text']}';
  }
  return content;
}

Map<String, Object?> pillar(int id, {String? title, String? shortText, Object? icon = 'beach'}) => {
  'id': id,
  'icon': icon,
  'title': title ?? 'Pillar $id',
  'short_text': shortText ?? 'About pillar $id',
  'full_text': '',
  'style': 'tile',
  'tappable': false,
};

MobileBootstrap bootstrapWith(Object? appContent, {bool absent = false}) {
  final map = bootstrapJson(0);
  if (!absent) map['appContent'] = appContent;
  return MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>);
}

const guest = MobileUserProfile(name: '', email: '', contactNumber: '');
const ana = MobileUserProfile(name: 'Ana Cruz', email: 'a@b.c', contactNumber: '1');

Future<void> showHome(WidgetTester tester, TourismBootstrapState state, {MobileUserProfile profile = guest}) async {
  tester.view.physicalSize = const Size(411, 6000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: HomePage(
          state: state,
          onRetry: () {},
          profile: profile,
          onOpenTab: (_) {},
          onOpenDestination: (_) {},
          onOpenNotifications: () {},
        ),
      ),
    ),
  );
  await tester.pump();
}

TourismBootstrapState loaded(Object? appContent, {bool absent = false}) => TourismBootstrapState.loaded(bootstrapWith(appContent, absent: absent));

bool shows(String text) => find.text(text).evaluate().isNotEmpty;

/// The four pillars of the code, by title, as the screen has always shown them.
List<String> get codePillarTitles => AppContentDefaults.whyVisitItems.map((i) => i.title).toList();

/// Everything the code writes for the Welcome and the Why Visit is on the screen: nothing is blank.
void expectAllCodeTexts(String greeting) {
  expect(shows(greeting), isTrue, reason: 'the greeting');
  expect(shows(AppContentDefaults.welcomeSubtitle), isTrue, reason: 'the welcome subtitle');
  expect(shows(AppContentDefaults.whyVisitTitle), isTrue, reason: 'the why visit title');
  expect(shows(AppContentDefaults.whyVisitSubtitle), isTrue, reason: 'the why visit subtitle');
  expect(shows(AppContentDefaults.whyVisitBody), isTrue, reason: 'the why visit body');
  for (final item in AppContentDefaults.whyVisitItems) {
    expect(shows(item.title), isTrue, reason: item.title);
    expect(shows(item.shortText), isTrue, reason: item.shortText);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('what the server sends is what the tourist reads', () {
    testWidgets('the Welcome, the Why Visit and the four pillars are the server\'s, in the server\'s order', (tester) async {
      final content = serverContent();
      (content['sections']['why_visit'] as List).shuffle(Random(3));
      final order = [for (final i in content['sections']['why_visit'] as List) (i as Map)['title'] as String];
      expect(order.first, isNot(startsWith('SERVER Cagbalete'))); // the fixture: the order is not the code's
      await showHome(tester, loaded(content));
      expect(shows('SERVER Mabuhay, Explorer! 🌊'), isTrue);
      expect(shows('SERVER ${AppContentDefaults.welcomeSubtitle}'), isTrue);
      expect(shows('SERVER ${AppContentDefaults.whyVisitTitle}'), isTrue);
      expect(shows('SERVER ${AppContentDefaults.whyVisitSubtitle}'), isTrue);
      expect(shows('SERVER ${AppContentDefaults.whyVisitBody}'), isTrue);
      for (final title in order) {
        expect(shows(title), isTrue, reason: title);
      }
      expect(shows(codePillarTitles.first), isFalse); // none of the code's pillar texts is left beside them
      final tops = [for (final title in order) tester.getTopLeft(find.text(title))];
      // two to a row, in the server's order: left, right, left, right
      expect(tops[0].dy, tops[1].dy);
      expect(tops[0].dx, lessThan(tops[1].dx));
      expect(tops[2].dy, greaterThan(tops[0].dy));
      expect(tops[2].dx, tops[0].dx);
      expect(tops[3].dy, tops[2].dy);
    });

    testWidgets('`{name}` is the visitor\'s name when they are logged in, and the Explorer when they are not', (tester) async {
      await showHome(tester, loaded(serverContent()), profile: ana);
      expect(shows('SERVER Mabuhay, Ana Cruz! 🌊'), isTrue);
      expect(shows('SERVER Mabuhay, Explorer! 🌊'), isFalse);
      expect(find.textContaining('{name}'), findsNothing);
    });

    testWidgets('`{name}` in the Why Visit and in a pillar is put in as well', (tester) async {
      final content = {
        'blocks': {'why_visit': {'title': 'Why {name} visits', 'subtitle': 'For {name}', 'body': 'Dear {name}, welcome.'}},
        'sections': {'why_visit': [pillar(1, title: 'Beach of {name}', shortText: 'Made for {name}')]},
      };
      await showHome(tester, loaded(content), profile: ana);
      expect(shows('Why Ana Cruz visits'), isTrue);
      expect(shows('For Ana Cruz'), isTrue);
      expect(shows('Dear Ana Cruz, welcome.'), isTrue);
      expect(shows('Beach of Ana Cruz'), isTrue);
      expect(shows('Made for Ana Cruz'), isTrue);
      expect(find.textContaining('{name}'), findsNothing);
      await showHome(tester, loaded(content));
      expect(shows('Why Explorer visits'), isTrue);
    });

    testWidgets('`{name}` in the welcome subtitle is put in', (tester) async {
      final content = {'blocks': {'welcome': {'title': 'Hi', 'subtitle': 'Enjoy your stay, {name}.'}}, 'sections': {}};
      await showHome(tester, loaded(content), profile: ana);
      expect(shows('Enjoy your stay, Ana Cruz.'), isTrue);
      expect(find.textContaining('{name}'), findsNothing);
    });

    testWidgets('in a pillar the title is above the short text, and each is where it belongs', (tester) async {
      await showHome(tester, loaded({'blocks': {}, 'sections': {'why_visit': [pillar(1, title: 'The title', shortText: 'The short text')]}}));
      final title = tester.getTopLeft(find.text('The title'));
      final sub = tester.getTopLeft(find.text('The short text'));
      expect(title.dy, lessThan(sub.dy));
      expect(title.dx, sub.dx);
      expect(tester.widget<Text>(find.text('The title')).style!.fontWeight, FontWeight.w800); // the title is the bold one
    });

    testWidgets('a visitor called `{x}` is greeted by that name, and the greeting is the server\'s', (tester) async {
      const odd = MobileUserProfile(name: '{x}', email: 'a@b.c', contactNumber: '1');
      await showHome(tester, loaded(serverContent()), profile: odd);
      expect(shows('SERVER Mabuhay, {x}! 🌊'), isTrue);
    });

    testWidgets('a saved copy (the server could not be asked) shows the server\'s texts as well', (tester) async {
      final state = TourismBootstrapState.loaded(
        bootstrapWith(serverContent()),
        fromCache: true,
        age: const Duration(days: 2),
        savedAt: DateTime(2026, 1, 1),
        refreshFailure: BootstrapFailureKind.network,
      );
      await showHome(tester, state);
      expect(state.fromCache, isTrue); // the fixture
      expect(shows('SERVER Mabuhay, Explorer! 🌊'), isTrue);
    });
  });

  group('when the server sends nothing it can use, the tourist reads the texts of the code', () {
    testWidgets('an older server: the bootstrap has no appContent', (tester) async {
      final state = loaded(null, absent: true);
      expect(state.appContent, same(AppContent.none)); // the fixture
      await showHome(tester, state);
      expectAllCodeTexts('Mabuhay, Explorer! 🌊');
    });

    testWidgets('an older server, and the visitor is logged in', (tester) async {
      await showHome(tester, loaded(null, absent: true), profile: ana);
      expectAllCodeTexts('Mabuhay, Ana Cruz! 🌊');
    });

    testWidgets('the app has not heard from the server yet (loading)', (tester) async {
      await showHome(tester, const TourismBootstrapState.loading());
      expectAllCodeTexts('Mabuhay, Explorer! 🌊');
    });

    testWidgets('no internet and no saved copy (failed)', (tester) async {
      await showHome(tester, TourismBootstrapState.failed(const SocketException('no internet'), BootstrapFailureKind.network));
      expectAllCodeTexts('Mabuhay, Explorer! 🌊');
    });

    testWidgets('an appContent of any odd shape', (tester) async {
      final odd = <Object?>[
        null, 'text', 5, true, [], [1, 2], {}, {'x': 1},
        {'blocks': null, 'sections': null},
        {'blocks': 5, 'sections': 'x'},
        {'blocks': [], 'sections': []},
        {'blocks': {'welcome': 'nope', 'why_visit': 5}, 'sections': {'why_visit': 'nope', 'travel_guide': 7}},
        {'blocks': {'welcome': {'title': 5, 'subtitle': ['x']}, 'why_visit': {'title': '', 'subtitle': '  ', 'body': null}}, 'sections': {'why_visit': [1, null, 'x', {}]}},
      ];
      var reached = 0;
      for (final shape in odd) {
        await showHome(tester, loaded(shape));
        reached++;
        expectAllCodeTexts('Mabuhay, Explorer! 🌊');
      }
      expect(reached, odd.length); // the fixture: every shape was shown
    });

    testWidgets('texts that are blank, or that still have a `{...}` in them, are the code\'s, one by one', (tester) async {
      final content = serverContent();
      final blocks = content['blocks'] as Map<String, dynamic>;
      blocks['welcome']['subtitle'] = '   ';
      blocks['why_visit']['body'] = 'Pay at {fee_office}';
      await showHome(tester, loaded(content));
      expect(shows(AppContentDefaults.welcomeSubtitle), isTrue); // blank -> the code's
      expect(shows(AppContentDefaults.whyVisitBody), isTrue); // a {...} left -> the code's
      expect(find.textContaining('{fee_office}'), findsNothing); // never shown to a tourist
      expect(shows('SERVER Mabuhay, Explorer! 🌊'), isTrue); // the rest is the server's
      expect(shows('SERVER ${AppContentDefaults.whyVisitTitle}'), isTrue);
    });
  });

  group('every part is decided on its own', () {
    testWidgets('a missing block sends only that block to the code', (tester) async {
      for (final missing in ['welcome', 'why_visit']) {
        final content = serverContent();
        (content['blocks'] as Map).remove(missing);
        await showHome(tester, loaded(content));
        final greetingFromServer = shows('SERVER Mabuhay, Explorer! 🌊');
        final whyFromServer = shows('SERVER ${AppContentDefaults.whyVisitTitle}');
        expect(greetingFromServer, missing != 'welcome', reason: '$missing missing');
        expect(whyFromServer, missing != 'why_visit', reason: '$missing missing');
        // and the code's text is on the screen where the block is missing
        expect(shows(missing == 'welcome' ? 'Mabuhay, Explorer! 🌊' : AppContentDefaults.whyVisitTitle), isTrue, reason: '$missing missing');
        // the pillars are their own part: still the server's
        expect(shows('SERVER ${codePillarTitles.first}'), isTrue, reason: '$missing missing');
      }
    });

    testWidgets('a broken pillar is left out, and the others stay, in the server\'s order', (tester) async {
      final content = {
        'blocks': {},
        'sections': {
          'why_visit': [pillar(1, title: 'First'), 'not a map', pillar(2, title: ''), pillar(3, title: 'Third'), pillar(1, title: 'Repeated id'), null],
        },
      };
      await showHome(tester, loaded(content));
      expect(shows('First'), isTrue);
      expect(shows('Third'), isTrue);
      expect(shows('Repeated id'), isFalse); // the fixture: the broken ones were really there
      expect(shows(codePillarTitles.first), isFalse);
      expect(tester.getTopLeft(find.text('First')).dx, lessThan(tester.getTopLeft(find.text('Third')).dx));
    });

    testWidgets('a pillar with a `{...}` left in its text is left out, the others stay', (tester) async {
      final content = {'blocks': {}, 'sections': {'why_visit': [pillar(1, title: 'Pay at {fee_office}'), pillar(2, title: 'Fine one')]}};
      await showHome(tester, loaded(content));
      expect(find.textContaining('{fee_office}'), findsNothing);
      expect(shows('Fine one'), isTrue);
    });

    testWidgets('[] is "nothing published": the four pillars of the code', (tester) async {
      final state = loaded({'blocks': {}, 'sections': {'why_visit': [], 'travel_guide': []}});
      expect(state.appContent.whyVisit, isEmpty); // the fixture
      await showHome(tester, state);
      expectAllCodeTexts('Mabuhay, Explorer! 🌊');
    });

    testWidgets('pillars that are all broken are the four of the code', (tester) async {
      final state = loaded({'blocks': {}, 'sections': {'why_visit': [pillar(1, title: ''), 'x', pillar(2, title: '{fee_office}')]}});
      await showHome(tester, state);
      expectAllCodeTexts('Mabuhay, Explorer! 🌊');
    });
  });

  group('the pillars: as many as the server sends', () {
    Future<List<Offset>> places(WidgetTester tester, int count) async {
      final content = {'blocks': {}, 'sections': {'why_visit': [for (var i = 1; i <= count; i++) pillar(i)]}};
      await showHome(tester, loaded(content));
      return [for (var i = 1; i <= count; i++) tester.getTopLeft(find.text('Pillar $i'))];
    }

    testWidgets('1: one pillar, on the left half', (tester) async {
      final at = await places(tester, 1);
      expect(at, hasLength(1));
      expect(find.text('About pillar 1'), findsOneWidget);
      expect(shows(codePillarTitles.first), isFalse);
      expect(at.single.dx, lessThan(150)); // the left half of a 411 wide screen
    });

    testWidgets('3: two, then one alone on the left', (tester) async {
      final at = await places(tester, 3);
      expect(at[0].dy, at[1].dy);
      expect(at[2].dy, greaterThan(at[0].dy));
      expect(at[2].dx, at[0].dx);
      expect(at[1].dx, greaterThan(at[0].dx));
    });

    testWidgets('5: two, two, one', (tester) async {
      final at = await places(tester, 5);
      expect(at[0].dy, at[1].dy);
      expect(at[2].dy, at[3].dy);
      expect(at[2].dy, greaterThan(at[0].dy));
      expect(at[4].dy, greaterThan(at[2].dy));
      expect(at[4].dx, at[0].dx);
    });

    testWidgets('2 and 4 are as they were: full rows', (tester) async {
      final two = await places(tester, 2);
      expect(two[0].dy, two[1].dy);
      final four = await places(tester, 4);
      expect(four[2].dy, four[3].dy);
      expect(four[2].dy, greaterThan(four[0].dy));
    });

    testWidgets('0 is the four of the code', (tester) async {
      await showHome(tester, loaded({'blocks': {}, 'sections': {'why_visit': []}}));
      for (final title in codePillarTitles) {
        expect(shows(title), isTrue, reason: title);
      }
      expect(codePillarTitles, hasLength(4));
    });

    testWidgets('many (40, the most the server allows): all are on the screen, none is dropped', (tester) async {
      final at = await places(tester, 40);
      expect(at, hasLength(40));
      expect(at[39].dy, greaterThan(at[0].dy));
    });
  });

  group('the picture and the colour come from the name the server sends', () {
    Icon iconOf(WidgetTester tester, int id) => tester.widget<Icon>(find.descendant(of: find.byKey(ValueKey('pillar-$id')), matching: find.byType(Icon)));

    testWidgets('each known name is its own picture and colour', (tester) async {
      await showHome(tester, loaded({'blocks': {}, 'sections': {'why_visit': [pillar(1, icon: 'festival'), pillar(2, icon: 'waste'), pillar(3, icon: 'food'), pillar(4, icon: 'boat')]}}));
      expect(iconOf(tester, 1).icon, Icons.festival_outlined);
      expect(iconOf(tester, 1).color, const Color(0xFFD97706));
      expect(iconOf(tester, 2).icon, Icons.delete_outline);
      expect(iconOf(tester, 2).color, const Color(0xFF7C3AED));
      expect(iconOf(tester, 3).icon, Icons.restaurant_menu);
      expect(iconOf(tester, 3).color, const Color(0xFFDC2626));
      expect(iconOf(tester, 4).icon, Icons.directions_boat_outlined);
    });

    testWidgets('a name the app does not know is the neutral info, and the pillar is still there with its texts', (tester) async {
      await showHome(tester, loaded({'blocks': {}, 'sections': {'why_visit': [pillar(1, icon: 'rocket', title: 'Strange icon'), pillar(2, icon: 5, title: 'Number icon'), pillar(3, icon: null, title: 'No icon')]}}));
      for (final id in [1, 2, 3]) {
        expect(iconOf(tester, id).icon, Icons.info_outline);
        expect(iconOf(tester, id).color, const Color(0xFF64748B));
      }
      expect(shows('Strange icon'), isTrue);
      expect(shows('Number icon'), isTrue);
      expect(shows('No icon'), isTrue);
    });

    testWidgets('the four of the code are drawn as they always were', (tester) async {
      await showHome(tester, loaded(null, absent: true));
      final drawn = [for (final item in AppContentDefaults.whyVisitItems) iconOf(tester, item.id)];
      expect(drawn.map((i) => i.icon), [Icons.beach_access, Icons.workspace_premium, Icons.water_drop, Icons.restaurant_menu]);
      expect(drawn.map((i) => i.color), [const Color(0xFF0284C7), const Color(0xFFD97706), const Color(0xFF059669), const Color(0xFFDC2626)]);
    });
  });

  group('through the whole app', () {
    testWidgets('the bootstrap the server sends is read, and the tourist sees the server\'s greeting', (tester) async {
      final map = bootstrapJson(0)..['appContent'] = serverContent();
      final api = _Api(jsonEncode(map));
      tester.view.physicalSize = const Size(411, 6000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
        previous?.call(details);
      };
      addTearDown(() => FlutterError.onError = previous);
      await tester.pumpWidget(MaubanMobileApp(initialTheme: TourismTheme.none, api: api, cache: const TourismBootstrapCache()));
      await tester.pump();
      await tester.tap(find.text('Skip'));
      await tester.pump();
      await tester.tap(find.text("I'm a Tourist / Visitor"));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pump();
      expect(api.asked, greaterThan(0)); // the fixture: the server was asked
      expect(shows('SERVER Mabuhay, Explorer! 🌊'), isTrue);
      expect(shows('SERVER ${AppContentDefaults.whyVisitBody}'), isTrue);
    });
  });
}

class _Api extends TourismApi {
  _Api(this._raw);
  final String _raw;
  int asked = 0;

  @override
  Future<String> fetchBootstrapRaw() async {
    asked++;
    return _raw;
  }
}
