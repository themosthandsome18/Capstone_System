// Hidden Gems on the Home: a slideshow (the same widget as Most Popular) of the list the SERVER chose (its key `hiddenGems`). No name of a resort
// and no number of arrivals takes part in it in the app. Synthetic data only: no real resort, person or contact.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const guest = MobileUserProfile(name: '', email: '', contactNumber: '');
const title = '💎 Hidden Gems of Mauban';
const subtitle = 'Peaceful glamping, quiet beaches & eco-spots';
const popularTitle = '🔥 Most Popular Resorts';

Map<String, dynamic> resort(int id, String name, {String type = 'Beach Resort', int arrivals = 500}) => {
  'resort_id': id,
  'resort_name': name,
  'type': type,
  'location': 'Sample Barangay',
  'short_description': 'A sample place.',
  'tourism_rating': 4.0,
  'review_count': 1,
  'monthly_arrivals': arrivals,
  'latitude': 14.18,
  'longitude': 121.73,
};

/// 14 places. Featured: 1, 2, 3. Hidden Gems as the server sent them: 12, 10, 11 (NOT in id order, so the order is the server's).
/// Place 5 is named like a name the old code looked for ("Rio ...") and place 6 is a camp with few arrivals (the old `< 100`): the old
/// code would have put both in Hidden Gems. The server did not.
Map<String, dynamic> world({List<int>? gems = const [12, 10, 11], bool withKey = true}) {
  final all = <int, Map<String, dynamic>>{
    for (var i = 1; i <= 14; i++) i: resort(i, 'Place Number $i'),
  };
  all[5] = resort(5, 'Rio Del Sample Beach Resort');
  all[6] = resort(6, 'Quiet Camp Six', type: 'Camping Resort', arrivals: 5);
  all[7] = resort(7, 'Tent Sample Place');
  Map<String, dynamic> pick(int i) => all[i]!;
  final map = <String, dynamic>{
    'destinations': [for (var i = 1; i <= 14; i++) pick(i)],
    'featuredDestinations': [for (final i in [1, 2, 3]) pick(i)],
    'referenceTables': <String, dynamic>{},
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  };
  if (withKey) map['hiddenGems'] = [for (final i in gems ?? <int>[]) pick(i)];
  return map;
}

TourismBootstrapState stateOf(Map<String, dynamic> map) =>
    TourismBootstrapState.loaded(MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>));

Future<void> showHome(WidgetTester tester, TourismBootstrapState state, {bool reduceMotion = false}) async {
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
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
        child: child!,
      ),
      home: Scaffold(
        body: HomePage(
          state: state,
          onRetry: () {},
          profile: guest,
          onOpenTab: (_) {},
          onOpenDestination: (_) {},
          onOpenNotifications: () {},
        ),
      ),
    ),
  );
  await tester.pump();
}

final gemsShow = find.byKey(const ValueKey('hidden-gems-slideshow'));
final popularShow = find.byKey(const ValueKey('popular-slideshow'));

List<int> idsOf(WidgetTester tester, Finder slideshow) => tester.widget<FeaturedResortsSlideshow>(slideshow).destinations.map((d) => d.id).toList();

/// The page a slideshow is on, as a number (1.0 = the second slide).
double pageOf(WidgetTester tester, Finder slideshow) =>
    tester.widget<PageView>(find.descendant(of: slideshow, matching: find.byType(PageView))).controller!.page!;

Future<void> elapse(WidgetTester tester, Duration d) async {
  // in steps, so every timer that falls due runs and the page animations (600 ms) are given frames
  var left = d.inMilliseconds;
  while (left > 0) {
    final step = left > 100 ? 100 : left;
    await tester.pump(Duration(milliseconds: step));
    left -= step;
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('what Hidden Gems shows', () {
    testWidgets('exactly the server\'s list, in the server\'s order, as the same slideshow widget as Most Popular', (tester) async {
      await showHome(tester, stateOf(world()));
      expect(gemsShow, findsOneWidget);
      expect(tester.widget(gemsShow), isA<FeaturedResortsSlideshow>());
      expect(tester.widget(popularShow), isA<FeaturedResortsSlideshow>());
      expect(idsOf(tester, gemsShow), [12, 10, 11], reason: 'the order of the key, not the order of the ids');
      expect(find.text(title), findsOneWidget);
      expect(find.text(subtitle), findsOneWidget);
      // and what is drawn is the first of them
      expect(find.descendant(of: gemsShow, matching: find.text('Place Number 12')), findsOneWidget);
    });

    testWidgets('no name and no small number of arrivals puts a place in it: a "Rio", a "Tent" and a quiet camp are not there unless the server sent them',
        (tester) async {
      await showHome(tester, stateOf(world()));
      final ids = idsOf(tester, gemsShow);
      for (final notSent in [5, 6, 7]) {
        expect(ids, isNot(contains(notSent)));
      }
      expect(find.descendant(of: gemsShow, matching: find.text('Tent Sample Place')), findsNothing);
      expect(find.descendant(of: gemsShow, matching: find.text('Quiet Camp Six')), findsNothing);
    });

    testWidgets('and when the server DOES send a "Rio" it is shown (it is the server\'s choice)', (tester) async {
      await showHome(tester, stateOf(world(gems: [5, 6])));
      expect(idsOf(tester, gemsShow), [5, 6]);
    });

    testWidgets('no place is in both slideshows', (tester) async {
      await showHome(tester, stateOf(world()));
      final popular = idsOf(tester, popularShow).toSet();
      final gems = idsOf(tester, gemsShow).toSet();
      expect(popular, {1, 2, 3});
      expect(gems, {10, 11, 12});
      expect(popular.intersection(gems), isEmpty);
    });
  });

  group('when the server gives none, the section is not there at all', () {
    Future<void> expectNoSection(WidgetTester tester) async {
      expect(find.text(title), findsNothing);
      expect(find.text(subtitle), findsNothing);
      expect(gemsShow, findsNothing);
      expect(find.byType(HiddenGemsRowSkeleton), findsNothing);
      expect(find.text('HIDDEN GEM'), findsNothing);
      // and the rest of the Home is as it was
      expect(find.text(popularTitle), findsOneWidget);
      expect(popularShow, findsOneWidget);
    }

    testWidgets('an empty hiddenGems', (tester) async {
      await showHome(tester, stateOf(world(gems: const [])));
      expect((world(gems: const [])['hiddenGems'] as List), isEmpty); // the fixture: the key is there and empty
      await expectNoSection(tester);
    });

    testWidgets('no hiddenGems key (an older server): nothing comes back from a list of names', (tester) async {
      final map = world(withKey: false);
      expect(map.containsKey('hiddenGems'), isFalse); // the fixture
      // the destinations would have been picked by the old rule: a "Rio", a "Tent", a camp with 5 arrivals
      await showHome(tester, stateOf(map));
      await expectNoSection(tester);
    });

    testWidgets('while loading, the skeleton holds the place of the section (it is not hidden yet)', (tester) async {
      await showHome(tester, const TourismBootstrapState.loading());
      expect(find.text(title), findsOneWidget);
      expect(find.byType(HiddenGemsRowSkeleton), findsOneWidget);
    });
  });

  group('the chip "Hidden Gems" filters by the same list', () {
    testWidgets('only the places of the server\'s hiddenGems are listed', (tester) async {
      await showHome(tester, stateOf(world()));
      final chips = find.byWidgetPredicate((w) => w is ListView && w.scrollDirection == Axis.horizontal).first;
      await tester.dragUntilVisible(find.text('Hidden Gems'), chips, const Offset(-120, 0));
      await tester.ensureVisible(find.text('Hidden Gems'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hidden Gems'));
      await tester.pump();
      expect(find.text('Hidden Gems Spots'), findsOneWidget, reason: 'the chip was selected');
      for (final id in [10, 11, 12]) {
        expect(find.text('Place Number $id'), findsWidgets, reason: 'place $id');
      }
      // a "Rio", a "Tent", a quiet camp and the others are not
      for (final name in ['Rio Del Sample Beach Resort', 'Tent Sample Place', 'Quiet Camp Six', 'Place Number 4', 'Place Number 8', 'Place Number 13']) {
        expect(find.text(name), findsNothing, reason: name);
      }
    });
  });

  group('the badge', () {
    testWidgets('Hidden Gems says HIDDEN GEM and Most Popular says POPULAR RESORT, each in its own colour', (tester) async {
      await showHome(tester, stateOf(world()));
      expect(find.descendant(of: gemsShow, matching: find.text('HIDDEN GEM')), findsWidgets);
      expect(find.descendant(of: gemsShow, matching: find.text('POPULAR RESORT')), findsNothing);
      expect(find.descendant(of: popularShow, matching: find.text('POPULAR RESORT')), findsWidgets);
      expect(find.descendant(of: popularShow, matching: find.text('HIDDEN GEM')), findsNothing);

      Color? colourOf(Finder show, String text) {
        final container = find.ancestor(of: find.descendant(of: show, matching: find.text(text)).first, matching: find.byType(Container));
        for (final element in container.evaluate()) {
          final decoration = (element.widget as Container).decoration;
          if (decoration is BoxDecoration && decoration.borderRadius != null && decoration.color != null) return decoration.color;
        }
        return null;
      }

      final brand = tester.element(gemsShow).brand;
      expect(colourOf(gemsShow, 'HIDDEN GEM'), brand.deep, reason: 'the colour it always had');
      expect(colourOf(popularShow, 'POPULAR RESORT'), const Color(0xFFD81558), reason: 'Most Popular keeps its own');
    });
  });

  group('when they turn', () {
    testWidgets('Most Popular turns at 4 s, Hidden Gems 2 s later (at 6 s), and never at the same moment', (tester) async {
      await showHome(tester, stateOf(world()));
      expect(pageOf(tester, popularShow), 0);
      expect(pageOf(tester, gemsShow), 0);

      await elapse(tester, const Duration(milliseconds: 3900));
      expect(pageOf(tester, popularShow), 0, reason: 'not yet, 3.9 s');
      expect(pageOf(tester, gemsShow), 0);

      await elapse(tester, const Duration(milliseconds: 800)); // 4.7 s: Most Popular has turned (its 600 ms included)
      expect(pageOf(tester, popularShow), 1, reason: 'Most Popular turned at 4 s');
      expect(pageOf(tester, gemsShow), 0, reason: 'Hidden Gems has not: it begins 2 s later');

      await elapse(tester, const Duration(milliseconds: 1000)); // 5.7 s
      expect(pageOf(tester, gemsShow), 0, reason: 'still waiting at 5.7 s');

      await elapse(tester, const Duration(milliseconds: 1000)); // 6.7 s: its first turn is at 6 s
      expect(pageOf(tester, gemsShow), 1, reason: 'Hidden Gems turned at 6 s');
      expect(pageOf(tester, popularShow), 1, reason: 'Most Popular next turns at 8 s');

      await elapse(tester, const Duration(milliseconds: 2000)); // 8.7 s
      expect(pageOf(tester, popularShow), 2, reason: 'every 4 s: 8 s');
      expect(pageOf(tester, gemsShow), 1, reason: 'Hidden Gems next turns at 10 s');
    });

    testWidgets('with one slide Hidden Gems does not turn by itself', (tester) async {
      await showHome(tester, stateOf(world(gems: const [12])));
      expect(idsOf(tester, gemsShow), [12]);
      await elapse(tester, const Duration(seconds: 12));
      expect(pageOf(tester, gemsShow), 0);
      expect(find.text('Place Number 12'), findsWidgets);
    });

    testWidgets('with less motion asked for, neither slideshow turns by itself (they can still be swiped)', (tester) async {
      await showHome(tester, stateOf(world()), reduceMotion: true);
      await elapse(tester, const Duration(seconds: 12));
      expect(pageOf(tester, popularShow), 0);
      expect(pageOf(tester, gemsShow), 0);
      await tester.drag(gemsShow, const Offset(-300, 0));
      await tester.pumpAndSettle();
      expect(pageOf(tester, gemsShow), 1, reason: 'the person can still move it');
    });

    testWidgets('leaving the Home stops the timers (nothing is left running)', (tester) async {
      await showHome(tester, stateOf(world()));
      await tester.pumpWidget(const SizedBox());
      await elapse(tester, const Duration(seconds: 10));
      expect(tester.takeException(), isNull);
    });
  });
}
