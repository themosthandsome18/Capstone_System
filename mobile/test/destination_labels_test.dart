// A destination with no review has no rating to show, and one nobody has arrived at says so: no "0.0", no "0 visitor arrivals".
// Text only: the pills and cards are the ones they were.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

Destination destination({Object? rating = 0, Object? arrivals = 0}) => Destination.fromJson({
      'resort_id': 7,
      'resort_name': 'Test Resort',
      'tourism_rating': rating,
      'monthly_arrivals': arrivals,
      'latitude': 14.2,
      'longitude': 121.7,
    });

void main() {
  group('the rating', () {
    test('0 is written No ratings yet, not 0.0', () {
      expect(destination(rating: 0).ratingLabel, 'No ratings yet');
      expect(destination(rating: 0.0).ratingLabel, isNot(contains('0.0')));
      expect(ratingText(0), 'No ratings yet');
    });

    test('a rating is one decimal', () {
      expect(destination(rating: 4.8).ratingLabel, '4.8');
      expect(destination(rating: 5).ratingLabel, '5.0');
      expect(destination(rating: 4).ratingLabel, '4.0');
    });

    test('the placeholder has no rating either', () {
      expect(Destination.placeholder().ratingLabel, 'No ratings yet');
    });

    testWidgets('the rating pill writes No ratings yet for 0 and the number otherwise', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Column(children: [RatingPill(rating: 0), RatingPill(rating: 4.6)]))));

      expect(find.text('No ratings yet'), findsOneWidget);
      expect(find.text('0.0'), findsNothing);
      expect(find.text('4.6'), findsOneWidget);
      // the star is still there in each: only the words changed
      expect(find.byIcon(Icons.star), findsNWidgets(2));
    });
  });

  group('the arrivals', () {
    test('0 is None recorded yet, not "0 visitor arrivals"', () {
      expect(destination(arrivals: 0).visitorsLabel, 'None recorded yet');
      expect(destination(arrivals: 0).visitorsLabel, isNot(contains('0 visitor')));
    });

    test('a number is as it was', () {
      expect(destination(arrivals: 12).visitorsLabel, '12 visitor arrivals');
      expect(destination(arrivals: 1500).visitorsLabel, '${formatCount(1500)} visitor arrivals');
    });

    test('a missing number is none recorded, not 0', () {
      final d = Destination.fromJson({'resort_id': 1, 'resort_name': 'No Number', 'latitude': 14.2, 'longitude': 121.7});
      expect(d.visitorsLabel, 'None recorded yet');
    });
  });

  test('the registration form offers the destinations of the bootstrap, so a destination the server leaves out (Inactive) cannot be chosen', () {
    final source = File('lib/screens/tourism_screens.dart').readAsStringSync();
    final form = source.substring(source.indexOf("label: 'Destination / Resort *'"));
    expect(form.substring(0, 400), contains('items: widget.bootstrap.destinations'));
  });

  test('no screen or widget writes a rating with toStringAsFixed any more: they all say it through the one label', () {
    for (final path in ['lib/widgets/widgets.dart', 'lib/screens/tourism_screens.dart']) {
      final source = File(path).readAsStringSync();
      expect(RegExp(r'(destination|widget\.destination)\.rating\.toStringAsFixed').hasMatch(source), isFalse, reason: path);
    }
  });
}
