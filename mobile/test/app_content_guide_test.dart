// 9c: the Home reads `appContent` for the Travel Guide (the heading, the tiles in the middle of the Home, the notices at the foot) and the Visit planner reads
// it for the Port & Boat Guide (the title and the lines, each a bullet). The rule of every case here: THE TOURIST ALWAYS HAS A TEXT TO READ. When the server
// sends nothing it can use, the text written in the code is shown, and every part is decided on its own. Every test that has a fixture asserts, inside
// the test, that the fixture reached the case it is for.
import 'dart:convert';
import 'dart:io';

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
      block[field] = (block[field] as String).split('\n').map((l) => 'SERVER $l').join('\n');
    }
  }
  for (final section in (content['sections'] as Map<String, dynamic>).values) {
    for (final item in (section as List).cast<Map<String, dynamic>>()) {
      item['title'] = 'SERVER ${item['title']}';
      item['short_text'] = 'SERVER ${item['short_text']}';
    }
  }
  return content;
}

Map<String, Object?> item(int id, {String? title, String? shortText, Object? icon = 'boat', String style = 'tile'}) => {
  'id': id,
  'icon': icon,
  'title': title ?? '${style == 'banner' ? 'Notice' : 'Guide'} $id',
  'short_text': shortText ?? 'About $id',
  'full_text': '',
  'style': style,
  'tappable': false,
};

Map<String, Object?> content({List<Object?>? guide, Map<String, Object?>? blocks}) => {
  'blocks': blocks ?? {},
  'sections': {'why_visit': [], 'travel_guide': guide ?? []},
};

MobileBootstrap bootstrapWith(Object? appContent, {bool absent = false, int destinations = 0}) {
  final map = bootstrapJson(destinations);
  if (!absent) map['appContent'] = appContent;
  return MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>);
}

const guest = MobileUserProfile(name: '', email: '', contactNumber: '');
const ana = MobileUserProfile(name: 'Ana Cruz', email: 'a@b.c', contactNumber: '1');

void tallScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 9000);
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
}

Future<void> showHome(WidgetTester tester, TourismBootstrapState state, {MobileUserProfile profile = guest}) async {
  tallScreen(tester);
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

Future<void> showPlanner(WidgetTester tester, AppContent content) async {
  tallScreen(tester);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: VisitPlannerPage(registerEnabled: true, visits: const [], onRegisterVisit: () {}, content: content),
      ),
    ),
  );
  await tester.pump();
}

TourismBootstrapState loaded(Object? appContent, {bool absent = false, int destinations = 0}) =>
    TourismBootstrapState.loaded(bootstrapWith(appContent, absent: absent, destinations: destinations));

bool shows(String text) => find.text(text).evaluate().isNotEmpty;

/// The guides and the notices of the code, as the screen has always shown them.
List<AppContentItem> get codeTiles => AppContentDefaults.travelGuideItems.where((i) => !i.isBanner).toList();
List<AppContentItem> get codeBanners => AppContentDefaults.travelGuideItems.where((i) => i.isBanner).toList();

/// Everything the code writes for the Travel Guide is on the screen: nothing is blank.
void expectAllCodeTravelGuide() {
  expect(shows(AppContentDefaults.travelGuideTitle), isTrue, reason: 'the heading');
  for (final one in AppContentDefaults.travelGuideItems) {
    expect(shows(one.title), isTrue, reason: one.title);
    expect(shows(one.shortText), isTrue, reason: one.shortText);
  }
  expect(codeTiles, hasLength(4)); // the fixture
  expect(codeBanners, hasLength(2));
}

/// The bullets on the card, in order.
List<String> bullets() => [
  for (final text in find.byType(Text).evaluate().map((e) => (e.widget as Text).data))
    if (text != null && text.startsWith('• ')) text,
];

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the Travel Guide: the tiles in the middle, the notices at the foot', () {
    testWidgets('what the server sends is shown: the heading, the tiles and the notices', (tester) async {
      await showHome(tester, loaded(serverContent(), destinations: 2));
      expect(shows('SERVER ${AppContentDefaults.travelGuideTitle}'), isTrue);
      for (final one in AppContentDefaults.travelGuideItems) {
        expect(shows('SERVER ${one.title}'), isTrue, reason: one.title);
        expect(shows('SERVER ${one.shortText}'), isTrue, reason: one.shortText);
        expect(shows(one.title), isFalse, reason: 'the code\'s text is not left beside the server\'s'); // the fixture: they differ
      }
    });

    testWidgets('the tiles are above the list of destinations and the notices are BELOW it, whatever order the server lists them in', (tester) async {
      // the notices first in the server's list, the tiles after
      final guide = [item(9, style: 'banner'), item(1), item(8, style: 'banner'), item(2)];
      await showHome(tester, loaded(content(guide: guide), destinations: 2));
      final tile1 = tester.getTopLeft(find.text('Guide 1'));
      final tile2 = tester.getTopLeft(find.text('Guide 2'));
      final list = tester.getTopLeft(find.text('All Destinations & Resorts'));
      final notice9 = tester.getTopLeft(find.text('Notice 9'));
      final notice8 = tester.getTopLeft(find.text('Notice 8'));
      expect(find.text('Sample Beach 1'), findsWidgets); // the fixture: the list of destinations is really there
      expect(tile1.dy, lessThan(list.dy));
      expect(tile2.dy, lessThan(list.dy));
      expect(notice9.dy, greaterThan(list.dy));
      expect(notice8.dy, greaterThan(list.dy));
      expect(tile1.dy, lessThan(tile2.dy)); // the tiles keep the server's order among themselves
      expect(notice9.dy, lessThan(notice8.dy)); // so do the notices
    });

    testWidgets('the code\'s own notices are at the foot as well', (tester) async {
      await showHome(tester, loaded(null, absent: true, destinations: 2));
      final list = tester.getTopLeft(find.text('All Destinations & Resorts'));
      for (final banner in codeBanners) {
        expect(tester.getTopLeft(find.text(banner.title)).dy, greaterThan(list.dy), reason: banner.title);
      }
      for (final tile in codeTiles) {
        expect(tester.getTopLeft(find.text(tile.title)).dy, lessThan(list.dy), reason: tile.title);
      }
    });

    testWidgets('the picture and the colour of a tile come from its name; an unknown name is the neutral info and the tile stays', (tester) async {
      final guide = [item(1, icon: 'festival'), item(2, icon: 'waste'), item(3, icon: 'rocket', title: 'Strange'), item(4, icon: 5, title: 'Number'), item(5, icon: null, title: 'None')];
      await showHome(tester, loaded(content(guide: guide)));
      Icon iconOf(int id) => tester.widget<Icon>(find.descendant(of: find.byKey(ValueKey('guide-$id')), matching: find.byType(Icon)));
      expect(iconOf(1).icon, Icons.festival_outlined);
      expect(iconOf(1).color, const Color(0xFFD97706));
      expect(iconOf(2).icon, Icons.delete_outline);
      expect(iconOf(2).color, const Color(0xFF7C3AED));
      for (final id in [3, 4, 5]) {
        expect(iconOf(id).icon, Icons.info_outline);
        expect(iconOf(id).color, const Color(0xFF64748B));
      }
      expect(shows('Strange') && shows('Number') && shows('None'), isTrue);
    });

    testWidgets('a notice: its own picture; the blue of the festival, the theme\'s tint for the rest', (tester) async {
      final guide = [item(1), item(2, style: 'banner', icon: 'event'), item(3, style: 'banner', icon: 'eco'), item(4, style: 'banner', icon: 'rocket')];
      await showHome(tester, loaded(content(guide: guide)));
      InfoBanner banner(int id) => tester.widget<InfoBanner>(find.descendant(of: find.byKey(ValueKey('banner-$id')), matching: find.byType(InfoBanner)));
      expect(banner(2).icon, Icons.event_available_outlined);
      expect(banner(2).color, const Color(0xffd7efff));
      expect(banner(3).icon, Icons.eco_outlined);
      expect(banner(3).color, BrandColors.original.tint);
      expect(banner(4).icon, Icons.info_outline); // unknown: neutral, and the notice is still there
      expect(banner(4).title, 'Notice 4');
      expect(banner(4).text, 'About 4');
    });

    testWidgets('in a tile the title is above the text, in bold, and each is where it belongs', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, title: 'The title', shortText: 'The text')])));
      final title = tester.getTopLeft(find.text('The title'));
      final text = tester.getTopLeft(find.text('The text'));
      expect(title.dy, lessThan(text.dy));
      expect(title.dx, text.dx);
      expect(tester.widget<Text>(find.text('The title')).style!.fontWeight, FontWeight.w800);
      expect(tester.widget<Text>(find.text('The text')).style!.fontWeight, isNot(FontWeight.w800));
    });

    testWidgets('`{name}` in a tile or a notice is put in', (tester) async {
      final guide = [item(1, title: 'For {name}', shortText: 'Guide of {name}'), item(2, style: 'banner', title: 'Dear {name}', shortText: 'Notice for {name}')];
      await showHome(tester, loaded(content(guide: guide)), profile: ana);
      expect(shows('For Ana Cruz') && shows('Guide of Ana Cruz') && shows('Dear Ana Cruz') && shows('Notice for Ana Cruz'), isTrue);
      expect(find.textContaining('{name}'), findsNothing);
    });
  });

  group('the Travel Guide: as many as the server sends', () {
    Future<void> tiles(WidgetTester tester, int tileCount, int bannerCount) async {
      final guide = [for (var i = 1; i <= tileCount; i++) item(i), for (var i = 1; i <= bannerCount; i++) item(100 + i, style: 'banner')];
      await showHome(tester, loaded(content(guide: guide), destinations: 2));
    }

    testWidgets('1 tile, 3 tiles, 5 tiles: each is a tile of the guide, one under the other', (tester) async {
      for (final count in [1, 3, 5]) {
        await tiles(tester, count, 1);
        final at = [for (var i = 1; i <= count; i++) tester.getTopLeft(find.text('Guide $i'))];
        expect(at, hasLength(count)); // the fixture
        for (var i = 1; i < count; i++) {
          expect(at[i].dy, greaterThan(at[i - 1].dy));
          expect(at[i].dx, at[0].dx);
        }
        expect(shows(codeTiles.first.title), isFalse); // the server's tiles, not the code's four
      }
    });

    testWidgets('1, 3 and 5 notices are all shown, one under the other, at the foot', (tester) async {
      for (final count in [1, 3, 5]) {
        await tiles(tester, 2, count);
        final list = tester.getTopLeft(find.text('All Destinations & Resorts'));
        final at = [for (var i = 1; i <= count; i++) tester.getTopLeft(find.text('Notice ${100 + i}'))];
        expect(at, hasLength(count));
        for (var i = 0; i < count; i++) {
          expect(at[i].dy, greaterThan(list.dy));
          if (i > 0) expect(at[i].dy, greaterThan(at[i - 1].dy));
        }
      }
    });

    testWidgets('NO notice: there are none, and there is no gap left at the foot of the Home', (tester) async {
      await tiles(tester, 2, 0);
      expect(find.byType(InfoBanner), findsNothing);
      expect(shows('Guide 1') && shows('Guide 2'), isTrue); // the fixture: the tiles are there
      final children = (tester.widget<ListView>(find.byType(ListView).first).childrenDelegate as SliverChildListDelegate).children;
      expect(children.last, isNot(isA<SizedBox>()), reason: 'the last thing in the Home is not an empty gap');
      // and with a notice the last thing is the notice
      await tiles(tester, 2, 1);
      final withNotice = (tester.widget<ListView>(find.byType(ListView).first).childrenDelegate as SliverChildListDelegate).children;
      expect(withNotice.last, isA<KeyedSubtree>());
    });

    testWidgets('NO tile but notices: the guide has no heading with nothing under it, and the notices are shown', (tester) async {
      await tiles(tester, 0, 2);
      expect(find.byType(InfoBanner), findsNWidgets(2));
      expect(shows('SERVER ${AppContentDefaults.travelGuideTitle}'), isFalse);
      expect(shows(AppContentDefaults.travelGuideTitle), isFalse); // the heading goes with its tiles
      expect(find.byKey(const ValueKey('guide-1')), findsNothing);
    });

    testWidgets('a long section: 40 items are all shown', (tester) async {
      final guide = [for (var i = 1; i <= 30; i++) item(i), for (var i = 1; i <= 10; i++) item(100 + i, style: 'banner')];
      await showHome(tester, loaded(content(guide: guide), destinations: 2));
      expect(find.byType(InfoBanner, skipOffstage: false), findsNWidgets(10));
      expect(find.byWidgetPredicate((w) => w is Text && RegExp(r'^Guide \d+$').hasMatch(w.data ?? ''), skipOffstage: false), findsNWidgets(30));
    });
  });

  group('the Travel Guide: when the server sends nothing it can use, the tourist reads the code\'s', () {
    testWidgets('an older server: the bootstrap has no appContent', (tester) async {
      final state = loaded(null, absent: true);
      expect(state.appContent, same(AppContent.none)); // the fixture
      await showHome(tester, state);
      expectAllCodeTravelGuide();
    });

    testWidgets('loading, failed and an older server with a saved copy', (tester) async {
      await showHome(tester, const TourismBootstrapState.loading());
      expectAllCodeTravelGuide();
      await showHome(tester, TourismBootstrapState.failed(const SocketException('no internet'), BootstrapFailureKind.network));
      expectAllCodeTravelGuide();
    });

    testWidgets('an appContent of any odd shape', (tester) async {
      final odd = <Object?>[
        null, 'text', 5, true, [], [1, 2], {}, {'x': 1},
        {'blocks': null, 'sections': null},
        {'blocks': 5, 'sections': 'x'},
        {'blocks': {'travel_guide': 'nope'}, 'sections': {'travel_guide': 'nope'}},
        {'blocks': {'travel_guide': {'title': 5}}, 'sections': {'travel_guide': 7}},
        {'blocks': {}, 'sections': {'travel_guide': [1, null, 'x', {}]}},
      ];
      var reached = 0;
      for (final shape in odd) {
        await showHome(tester, loaded(shape));
        reached++;
        expectAllCodeTravelGuide();
      }
      expect(reached, odd.length); // the fixture: every shape was shown
    });

    testWidgets('a missing block sends only the heading to the code; the tiles are the server\'s', (tester) async {
      final map = serverContent();
      (map['blocks'] as Map).remove('travel_guide');
      await showHome(tester, loaded(map));
      expect(shows(AppContentDefaults.travelGuideTitle), isTrue);
      expect(shows('SERVER ${codeTiles.first.title}'), isTrue);
      expect(shows(codeTiles.first.title), isFalse); // the fixture: the tile text is not the code's
    });

    testWidgets('a broken tile or notice is left out; the others stay', (tester) async {
      final guide = [item(1, title: 'Good tile'), 'not a map', item(2, title: ''), item(3, title: 'Pay at {fee_office}'), item(4, style: 'banner', title: 'Good notice'), null, item(1, title: 'Same id')];
      await showHome(tester, loaded(content(guide: guide)));
      expect(shows('Good tile') && shows('Good notice'), isTrue);
      expect(shows('Same id'), isFalse); // the fixture: the broken ones were really there
      expect(find.textContaining('{fee_office}'), findsNothing); // never shown to a tourist
      expect(find.byType(InfoBanner), findsOneWidget);
    });

    testWidgets('[] is "nothing published": the code\'s tiles and notices', (tester) async {
      final state = loaded(content(guide: []));
      expect(state.appContent.travelGuide, isEmpty); // the fixture
      await showHome(tester, state);
      expectAllCodeTravelGuide();
    });

    testWidgets('items that are all broken are the code\'s', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, title: ''), 'x', item(2, title: '{fee_office}')])));
      expectAllCodeTravelGuide();
    });

    testWidgets('a heading that is blank or has a `{...}` left in it is the code\'s, the tiles are the server\'s', (tester) async {
      for (final heading in ['   ', 'Pay at {fee_office}']) {
        await showHome(tester, loaded(content(guide: [item(1)], blocks: {'travel_guide': {'title': heading}})));
        expect(shows(AppContentDefaults.travelGuideTitle), isTrue, reason: heading);
        expect(shows('Guide 1'), isTrue, reason: heading);
        expect(find.textContaining('{fee_office}'), findsNothing);
      }
    });
  });

  group('the Port & Boat Guide: the title and the lines, each a bullet', () {
    testWidgets('what the server sends: the title and the four lines, in order, each with its bullet', (tester) async {
      final map = serverContent();
      final lines = (map['blocks']['port_guide']['body'] as String).split('\n');
      expect(lines, hasLength(4)); // the fixture
      await showPlanner(tester, AppContent.fromJson(map));
      expect(find.text(map['blocks']['port_guide']['title'] as String), findsOneWidget);
      expect(bullets(), [for (final line in lines) '• $line']);
    });

    testWidgets('the real value of the server: the code\'s card, word for word', (tester) async {
      final real = realContent();
      await showPlanner(tester, AppContent.fromJson(real));
      final lines = (real['blocks']['port_guide']['body'] as String).split('\n');
      expect(bullets(), [for (final line in lines) '• $line']);
      expect(find.text(real['blocks']['port_guide']['title'] as String), findsOneWidget);
      expect(bullets(), AppContentDefaults.portGuideBullets);
    });

    testWidgets('the lines are one under the other with a small gap between them', (tester) async {
      await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'title': 'T', 'body': 'First\nSecond\nThird'}})));
      final tops = [for (final t in ['• First', '• Second', '• Third']) tester.getTopLeft(find.text(t)).dy];
      final height = tester.getSize(find.text('• First')).height;
      expect(tops[1] - tops[0], height + 4);
      expect(tops[2] - tops[1], height + 4);
    });

    testWidgets('1, 3, 5 and 8 lines: all are shown, in order', (tester) async {
      for (final count in [1, 3, 5, 8]) {
        final body = [for (var i = 1; i <= count; i++) 'Line number $i'].join('\n');
        await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'title': 'T', 'body': body}})));
        expect(bullets(), [for (var i = 1; i <= count; i++) '• Line number $i'], reason: '$count lines');
      }
    });

    testWidgets('blank lines are left out, and the lines are trimmed', (tester) async {
      await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'title': 'T', 'body': '  one  \n\n   \n two'}})));
      expect(bullets(), ['• one', '• two']);
    });

    testWidgets('NO line, or only blank ones: the four lines of the code', (tester) async {
      for (final body in [null, '', ' \n \n ', 5, ['x']]) {
        await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'title': 'T', 'body': body}})));
        expect(bullets(), AppContentDefaults.portGuideBullets, reason: '$body');
        expect(bullets(), hasLength(4)); // the fixture
      }
    });

    testWidgets('an older server, an appContent of any odd shape, and no block: the code\'s title and four lines', (tester) async {
      final odd = <AppContent>[
        AppContent.none,
        AppContent.fromJson('text'),
        AppContent.fromJson({'blocks': 5, 'sections': 'x'}),
        AppContent.fromJson({'blocks': {'port_guide': 'nope'}}),
        AppContent.fromJson({'blocks': {'port_guide': {'title': 5, 'body': 6}}}),
        AppContent.fromJson(content()),
      ];
      for (final shape in odd) {
        await showPlanner(tester, shape);
        expect(find.text(AppContentDefaults.portGuideTitle), findsOneWidget);
        expect(bullets(), AppContentDefaults.portGuideBullets);
      }
      expect(odd, hasLength(6)); // the fixture
    });

    testWidgets('a missing port block sends only the port to the code; the title and the lines are decided on their own', (tester) async {
      await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'body': 'Only the lines'}})));
      expect(find.text(AppContentDefaults.portGuideTitle), findsOneWidget); // no title from the server: the code's
      expect(bullets(), ['• Only the lines']);
      await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'title': 'Only the title'}})));
      expect(find.text('Only the title'), findsOneWidget);
      expect(bullets(), AppContentDefaults.portGuideBullets);
    });

    testWidgets('a line with a `{...}` left in it: the whole body is the code\'s; the title stays the server\'s', (tester) async {
      final body = 'Fine one\nPay at {fee_office}\nFine three';
      await showPlanner(tester, AppContent.fromJson(content(blocks: {'port_guide': {'title': 'Server title', 'body': body}})));
      expect(bullets(), AppContentDefaults.portGuideBullets);
      expect(find.text('Server title'), findsOneWidget);
      expect(find.textContaining('{fee_office}'), findsNothing);
    });

    testWidgets('the fee line is one Text, with its bullet, as the guard of the fee reads it', (tester) async {
      await showPlanner(tester, AppContent.fromJson(serverContent()));
      final fee = find.textContaining('Environmental Fee:');
      expect(fee, findsOneWidget);
      expect(tester.widget<Text>(fee).data, startsWith('• SERVER Environmental Fee:'));
    });
  });

  group('through the whole app', () {
    testWidgets('the tourist signs in as a guest and reads the server\'s Travel Guide', (tester) async {
      final map = bootstrapJson(0)..['appContent'] = serverContent();
      tallScreen(tester);
      await tester.pumpWidget(MaubanMobileApp(initialTheme: TourismTheme.none, api: _Api(jsonEncode(map)), cache: const TourismBootstrapCache()));
      await tester.pump();
      await tester.tap(find.text('Skip'));
      await tester.pump();
      await tester.tap(find.text("I'm a Tourist / Visitor"));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pump();
      expect(shows('SERVER ${AppContentDefaults.travelGuideTitle}'), isTrue);
      expect(find.byType(InfoBanner), findsNWidgets(2));
      // and the Port & Boat Guide, on My Visit
      await tester.tap(find.text('My Visit'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      final fee = find.textContaining('Environmental Fee:', skipOffstage: false);
      await tester.scrollUntilVisible(fee, 400, scrollable: find.byType(Scrollable).first);
      expect(tester.widget<Text>(fee).data, startsWith('• SERVER Environmental Fee:'));
      expect(find.text('SERVER ${AppContentDefaults.portGuideTitle}', skipOffstage: false), findsOneWidget);
    });
  });
}

class _Api extends TourismApi {
  _Api(this._raw);
  final String _raw;

  @override
  Future<String> fetchBootstrapRaw() async => _raw;
}
