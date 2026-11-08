// HeroCard and DestinationTile hold their text at the bottom of the card. When a destination has no visitors this year the count pill is not drawn;
// the gap that was between the last line and that pill must not stay behind as empty space. Measured in pixels on the screen, not read from the code.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

Destination place({int yearly = 0, int monthly = 0}) => Destination.fromJson({
  'resort_id': 1,
  'resort_name': 'Sample Place',
  'type': 'Beach Resort',
  'location': 'Sample Barangay',
  'short_description': 'A sample place.',
  'tourism_rating': 4.0,
  'review_count': 1,
  'monthly_arrivals': monthly,
  'yearly_arrivals': yearly,
  'latitude': 14.18,
  'longitude': 121.73,
});

Future<void> show(WidgetTester tester, Widget card) async {
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: card))));
  await tester.pump();
}

Widget hero(Destination d) => SizedBox(width: 360, child: HeroCard(destination: d));
Widget tile(Destination d) => SizedBox(height: 230, child: DestinationTile(destination: d, onTap: () {}));

/// From the bottom of [what] to the bottom of the card.
double below(WidgetTester tester, Finder card, Finder what) => tester.getRect(card).bottom - tester.getRect(what).bottom;

void main() {
  group('HeroCard', () {
    final card = find.byType(HeroCard);

    testWidgets('the card is the same height with a count and with none', (tester) async {
      await show(tester, hero(place(yearly: 12)));
      final with_ = tester.getSize(card);
      await show(tester, hero(place(yearly: 0)));
      expect(tester.getSize(card), with_);
      expect(with_.height, 185);
    });

    testWidgets('with a count the pill is 16 from the bottom; with none the last line (the location) is, and no gap is left under it', (tester) async {
      await show(tester, hero(place(yearly: 12)));
      expect(below(tester, card, find.byType(VisitorPill)), closeTo(16, 0.5));
      final location = find.text('Sample Barangay');
      final aboveThePill = tester.getRect(find.byType(VisitorPill)).top - tester.getRect(location).bottom;
      expect(aboveThePill, greaterThan(7), reason: 'the 8 between the line and the pill is there when the pill is');

      await show(tester, hero(place(yearly: 0)));
      final gap = below(tester, card, location);
      // the location line stands where the bottom margin puts it: 16 (+ at most the few pixels of its own line height), not 16 + 8
      expect(gap, lessThan(16 + 3), reason: 'gap under the last line is $gap');
      expect(gap, greaterThanOrEqualTo(15.5));
      expect(find.byType(VisitorPill), findsNothing);
    });

    testWidgets('the last line is the same distance from the bottom whatever the month says', (tester) async {
      await show(tester, hero(place(yearly: 0, monthly: 0)));
      final a = below(tester, card, find.text('Sample Barangay'));
      await show(tester, hero(place(yearly: 0, monthly: 5000)));
      expect(below(tester, card, find.text('Sample Barangay')), a);
    });
  });

  group('DestinationTile', () {
    final card = find.byType(DestinationTile);

    testWidgets('the card is the same height with a count and with none', (tester) async {
      await show(tester, tile(place(yearly: 12)));
      final with_ = tester.getSize(card);
      await show(tester, tile(place(yearly: 0)));
      expect(tester.getSize(card), with_);
      expect(with_.width, 175);
    });

    testWidgets('with a count the pill is 12 from the bottom; with none the type line is, and no gap is left under it', (tester) async {
      await show(tester, tile(place(yearly: 12)));
      expect(below(tester, card, find.byType(VisitorPill)), closeTo(12, 0.5));
      final type = find.text('Beach Resort');
      final aboveThePill = tester.getRect(find.byType(VisitorPill)).top - tester.getRect(type).bottom;
      expect(aboveThePill, greaterThan(5), reason: 'the 6 between the line and the pill is there when the pill is');

      await show(tester, tile(place(yearly: 0)));
      final gap = below(tester, card, type);
      expect(gap, lessThan(12 + 3), reason: 'gap under the last line is $gap');
      expect(gap, greaterThanOrEqualTo(11.5));
      expect(find.byType(VisitorPill), findsNothing);
    });
  });
}
