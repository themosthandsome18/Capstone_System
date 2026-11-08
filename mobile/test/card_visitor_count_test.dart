// The count on a card is the people who arrived THIS YEAR (`yearly_arrivals`), never the month's (`monthly_arrivals`, which starts again at 0 every
// month). With none, the card has no count pill at all, and the type of the resort is not put in its place (the card has its own pill for it).
// Synthetic data only: no real resort, person or contact.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const guest = MobileUserProfile(name: '', email: '', contactNumber: '');

Map<String, dynamic> resort(int id, String name, {required String type, int yearly = 0, int monthly = 0}) => {
  'resort_id': id,
  'resort_name': name,
  'type': type,
  'location': 'Sample Barangay',
  'short_description': 'A sample place.',
  'tourism_rating': 4.0,
  'review_count': 1,
  'monthly_arrivals': monthly,
  'yearly_arrivals': yearly,
  'latitude': 14.18,
  'longitude': 121.73,
};

Map<String, dynamic> homeWith({required Map<String, dynamic> popular, required Map<String, dynamic> gem}) => {
  'destinations': [popular, gem],
  'featuredDestinations': [popular],
  'hiddenGems': [gem],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
};

TourismBootstrapState stateOf(Map<String, dynamic> map) =>
    TourismBootstrapState.loaded(MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>));

Future<void> showHome(WidgetTester tester, Map<String, dynamic> map) async {
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
          state: stateOf(map),
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

final popularShow = find.byKey(const ValueKey('popular-slideshow'));
final gemsShow = find.byKey(const ValueKey('hidden-gems-slideshow'));

Finder inside(Finder show, Finder what) => find.descendant(of: show, matching: what);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  // the same rules in the two slideshows of the Home
  for (final entry in {'Most Popular': popularShow, 'Hidden Gems': gemsShow}.entries) {
    final name = entry.key;
    final show = entry.value;

    group('$name card', () {
      Map<String, dynamic> world({int yearly = 0, int monthly = 0}) => homeWith(
        popular: resort(1, 'Popular Sample', type: 'Beach Resort', yearly: name == 'Most Popular' ? yearly : 3, monthly: name == 'Most Popular' ? monthly : 0),
        gem: resort(2, 'Gem Sample', type: 'Beach Resort', yearly: name == 'Hidden Gems' ? yearly : 3, monthly: name == 'Hidden Gems' ? monthly : 0),
      );

      testWidgets('12 this year: "12 visitors" with the icon of a person', (tester) async {
        await showHome(tester, world(yearly: 12));
        expect(inside(show, find.text('12 visitors')), findsOneWidget);
        final pill = inside(show, find.byType(VisitorPill));
        expect(pill, findsOneWidget);
        expect(find.descendant(of: pill, matching: find.byIcon(Icons.person_outline)), findsOneWidget);
        expect(find.descendant(of: pill, matching: find.byIcon(Icons.place_outlined)), findsNothing, reason: 'not the pin');
      });

      testWidgets('1 this year: "1 visitor", not "1 visitors"', (tester) async {
        await showHome(tester, world(yearly: 1));
        expect(inside(show, find.text('1 visitor')), findsOneWidget);
        expect(inside(show, find.text('1 visitors')), findsNothing);
      });

      testWidgets('a thousand or more has its comma: "1,234 visitors"', (tester) async {
        await showHome(tester, world(yearly: 1234));
        expect(inside(show, find.text('1,234 visitors')), findsOneWidget);
      });

      testWidgets('none this year: no count pill at all, and the type is the only pill (once, not twice)', (tester) async {
        await showHome(tester, world(yearly: 0, monthly: 777));
        expect(inside(show, find.byType(VisitorPill)), findsNothing, reason: 'the slide does not even build it');
        expect(inside(show, find.byIcon(Icons.person_outline)), findsNothing);
        expect(inside(show, find.byIcon(Icons.place_outlined)), findsOneWidget, reason: 'the only pin is the location line itself, none in a pill');
        expect(inside(show, find.textContaining('visit')), findsNothing);
        expect(inside(show, find.text('Beach Resort')), findsOneWidget, reason: 'the type, once');
        expect(inside(show, find.text('777')), findsNothing);
      });

      testWidgets('the month does not matter: the same year with a month of 0 and of 99999 is the same card', (tester) async {
        await showHome(tester, world(yearly: 12, monthly: 0));
        final a = inside(show, find.byType(VisitorPill));
        expect(inside(show, find.text('12 visitors')), findsOneWidget);
        final sizeA = tester.getSize(a);
        await showHome(tester, world(yearly: 12, monthly: 99999));
        expect(inside(show, find.text('12 visitors')), findsOneWidget);
        expect(inside(show, find.textContaining('99999')), findsNothing);
        expect(inside(show, find.textContaining('99,999')), findsNothing);
        expect(tester.getSize(inside(show, find.byType(VisitorPill))), sizeA);
      });

      testWidgets('the card is the same size with a count and without one', (tester) async {
        await showHome(tester, world(yearly: 12));
        final with_ = tester.getSize(inside(show, find.byType(PageView)));
        await showHome(tester, world(yearly: 0));
        final without = tester.getSize(inside(show, find.byType(PageView)));
        expect(without, with_);
        expect(with_.height, 225);
      });

      testWidgets('with no count the type pill begins at the left edge, where the count pill began', (tester) async {
        await showHome(tester, world(yearly: 12));
        final countLeft = tester.getTopLeft(inside(show, find.byType(VisitorPill))).dx;
        await showHome(tester, world(yearly: 0));
        final typeLeft = tester.getTopLeft(inside(show, find.text('Beach Resort'))).dx - 8; // 8: the padding of the type pill
        expect(typeLeft, closeTo(countLeft, 1.5), reason: 'no gap is left where the count pill was');
      });
    });
  }

  group('the same number in the card and in the details', () {
    testWidgets('visitorsLabel (the list card and the details) says the year\'s number', (tester) async {
      final d = Destination.fromJson(resort(1, 'Sample', type: 'Beach Resort', yearly: 12, monthly: 99999));
      expect(d.yearlyArrivals, 12);
      expect(d.visitorsLabel, '12 visitor arrivals', reason: 'the words are the ones it always had; the number is the year\'s');
      expect(d.visitorCountLabel, '12 visitors');
      expect(d.visitorsLabel, isNot(contains('99')));
      final none = Destination.fromJson(resort(1, 'Sample', type: 'Beach Resort', yearly: 0, monthly: 99999));
      expect(none.visitorsLabel, noArrivalsLabel);
      expect(none.hasVisitors, isFalse);
    });

    testWidgets('a list card shows that number, and a slideshow card shows the same one', (tester) async {
      final d = Destination.fromJson(resort(1, 'Sample', type: 'Beach Resort', yearly: 1234, monthly: 5));
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: DestinationListCard(destination: d, onTap: () {}))));
      expect(find.text('1,234 visitor arrivals'), findsOneWidget);
      expect(find.textContaining('5 visitor'), findsNothing);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: VisitorPill(destination: d))));
      expect(find.text('1,234 visitors'), findsOneWidget);
    });

    testWidgets('a server that does not send yearly_arrivals (an older one) gives 0: no pill, "None recorded yet"', (tester) async {
      final json = resort(1, 'Sample', type: 'Beach Resort', monthly: 40)..remove('yearly_arrivals');
      final d = Destination.fromJson(json);
      expect(d.yearlyArrivals, 0);
      expect(d.visitorsLabel, noArrivalsLabel);
    });
  });

  group('the pill never shows the type', () {
    for (final type in ['Beach Resort', 'Camping Resort', '', 'Falls']) {
      testWidgets('with no count and the type "$type": nothing is drawn', (tester) async {
        final d = Destination.fromJson(resort(1, 'Sample', type: type, yearly: 0, monthly: 50));
        await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: VisitorPill(destination: d)))));
        expect(tester.getSize(find.byType(VisitorPill)), Size.zero);
        expect(find.byType(Text), findsNothing);
        expect(find.byType(Icon), findsNothing);
        expect(find.text('Featured Spot'), findsNothing);
      });
    }
  });
}
