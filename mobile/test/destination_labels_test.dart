// A destination with no review has no rating to show, and one nobody has arrived at says so: no "0.0", no "0 visitor arrivals".
// Text only: the pills and cards are the ones they were.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

// reviewCount: a number is sent as `review_count`; the default leaves the key out, as an older server does.
const _noKey = Object();
Destination destination({Object? rating = 0, Object? arrivals = 0, Object? reviewCount = _noKey}) => Destination.fromJson({
      'resort_id': 7,
      'resort_name': 'Test Resort',
      'tourism_rating': rating,
      'yearly_arrivals': arrivals,
      if (!identical(reviewCount, _noKey)) 'review_count': reviewCount,
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

    group('the number of reviews decides, when the server says it', () {
      test('(a) 4.4 written in the column and 0 reviews: No ratings yet', () {
        final d = destination(rating: 4.4, reviewCount: 0);
        expect(d.reviewCount, 0);
        expect(d.ratingLabel, 'No ratings yet');
        expect(ratingText(4.4, reviewCount: 0), 'No ratings yet');
      });

      test('(b) 4.4 written in the column and 2 reviews: 4.4', () {
        final d = destination(rating: 4.4, reviewCount: 2);
        expect(d.reviewCount, 2);
        expect(d.ratingLabel, '4.4');
      });

      test('one review is enough, and a count of 0 wins over any number', () {
        expect(destination(rating: 5, reviewCount: 1).ratingLabel, '5.0');
        expect(destination(rating: 5.0, reviewCount: 0).ratingLabel, 'No ratings yet');
        expect(destination(rating: 0, reviewCount: 0).ratingLabel, 'No ratings yet');
      });

      test('a count with no rating written is still shown as it is (the server sets both together)', () {
        expect(destination(rating: 3.5, reviewCount: 4).ratingLabel, '3.5');
      });
    });

    group('an older server, with no review_count: the rating itself decides, as before', () {
      test('(c) the key is missing: reviewCount is null, and 4.4 is a rating, 0 is not', () {
        final withRating = destination(rating: 4.4);
        final without = destination(rating: 0);
        expect(withRating.reviewCount, isNull);
        expect(withRating.ratingLabel, '4.4');
        expect(without.reviewCount, isNull);
        expect(without.ratingLabel, 'No ratings yet');
      });

      test('(c) it does not crash on a key that is null, or not a number', () {
        for (final odd in <Object?>[null, 'many', '2', true, <int>[], <String, Object?>{}]) {
          final d = destination(rating: 4.4, reviewCount: odd);
          expect(d.reviewCount, isNull, reason: '$odd');
          expect(d.ratingLabel, '4.4', reason: '$odd');
        }
      });

      test('a whole number that arrives as a double (2.0) is a count of 2', () {
        expect(destination(rating: 4.4, reviewCount: 2.0).reviewCount, 2);
      });

      test('the placeholder says no review count, and no rating', () {
        expect(Destination.placeholder().reviewCount, isNull);
        expect(Destination.placeholder().ratingLabel, 'No ratings yet');
      });
    });

    test('the placeholder has no rating either', () {
      expect(Destination.placeholder().ratingLabel, 'No ratings yet');
    });

    testWidgets('the rating pill writes No ratings yet for 0 and the number otherwise', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Column(children: [
            RatingPill(destination: destination(rating: 0)),
            RatingPill(destination: destination(rating: 4.6)),
          ]),
        ),
      ));

      expect(find.text('No ratings yet'), findsOneWidget);
      expect(find.text('0.0'), findsNothing);
      expect(find.text('4.6'), findsOneWidget);
      // the star is still there in each: only the words changed
      expect(find.byIcon(Icons.star), findsNWidgets(2));
    });

    testWidgets('the rating pill follows the review count too: 4.4 with 0 reviews is No ratings yet, with 2 it is 4.4', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Column(children: [
            RatingPill(destination: destination(rating: 4.4, reviewCount: 0)),
            RatingPill(destination: destination(rating: 4.4, reviewCount: 2)),
          ]),
        ),
      ));

      expect(find.text('No ratings yet'), findsOneWidget);
      expect(find.text('4.4'), findsOneWidget);
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

  test('the decision is in one place: no widget or screen compares the rating with 0 itself', () {
    for (final path in ['lib/widgets/widgets.dart', 'lib/screens/tourism_screens.dart']) {
      final source = File(path).readAsStringSync();
      expect(RegExp(r'\.rating\s*(>|<=|<|>=)\s*0').hasMatch(source), isFalse, reason: path);
      expect(RegExp(r'RatingPill\(\s*rating:').hasMatch(source), isFalse, reason: path);
    }
  });

  test('no screen or widget writes a rating with toStringAsFixed any more: they all say it through the one label', () {
    for (final path in ['lib/widgets/widgets.dart', 'lib/screens/tourism_screens.dart']) {
      final source = File(path).readAsStringSync();
      expect(RegExp(r'(destination|widget\.destination)\.rating\.toStringAsFixed').hasMatch(source), isFalse, reason: path);
    }
  });
}
