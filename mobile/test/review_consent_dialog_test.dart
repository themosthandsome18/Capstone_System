// What becomes of a review and its photos is said BEFORE the form: pressing Review opens a pop-up first. "I understand" opens the form, "Cancel" does
// not. It is shown every time. Its words are the same as the notice under the form, from one source. On a small screen, or with large text, the words
// scroll and the two buttons stay where they can be pressed. The people here are made up.
import 'dart:convert';
import 'dart:io';

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

MobileVisitReceipt pass() => MobileVisitReceipt(
  reference: 'SURV-1',
  destination: keptDestination(7, 'Sample Beach'),
  arrivalDate: DateTime(2099, 6, 1),
  totalVisitors: 2,
  status: 'arrived',
  fullName: 'Sample Person',
  contactNumber: '+639000000001',
  email: '',
);

final dialog = find.byKey(const ValueKey('review-notice-dialog'));
final cancel = find.byKey(const ValueKey('review-notice-cancel'));
final understand = find.byKey(const ValueKey('review-notice-understand'));
final scroll = find.byKey(const ValueKey('review-notice-scroll'));
final form = find.byType(FeedbackPage);

Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async {
    if (request.url.path.contains('/mobile/tourism/destinations/7/')) {
      return http.Response(jsonEncode({'destination': sampleBeach, 'recentFeedback': <dynamic>[]}), 200);
    }
    return http.Response('', 404);
  }),
);

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// The destination's page, with a pass that was scanned here (so Review can be pressed), on a screen of [width] x [height] and text [scale] times bigger.
Future<void> openDestination(WidgetTester tester, {double width = 411, double height = 3000, double scale = 1.0}) async {
  tester.view.physicalSize = Size(width, height);
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

  await mocked(() async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
        home: DestinationDetailPage(
          destination: Destination.fromJson(sampleBeach),
          api: const TourismApi(),
          bootstrap: bootstrap(),
          onVisitSubmitted: (_) {},
          onFeedbackSubmitted: (_) {},
          reviewPassFor: (_) => pass(),
        ),
      ),
    );
    await settle(tester);
  });
}

Finder reviewButton() => find.widgetWithText(OutlinedButton, 'Review');

Future<void> pressReview(WidgetTester tester) async {
  await mocked(() async {
    await tester.tap(reviewButton());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  });
}

/// The words of a notice: every Text inside [of], in the order they are shown.
List<String> wordsIn(WidgetTester tester, Finder of) =>
    find.descendant(of: of, matching: find.byType(Text)).evaluate().map((element) => (element.widget as Text).data!).toList();

List<String> wordsOfDialog(WidgetTester tester) => wordsIn(tester, find.descendant(of: dialog, matching: find.byType(ReviewNoticeContent)));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('pressing Review', () {
    testWidgets('opens the pop-up at once, before the form', (tester) async {
      await openDestination(tester);
      expect(dialog, findsNothing);

      await pressReview(tester);

      expect(dialog, findsOneWidget);
      expect(find.text('Before you write a review'), findsOneWidget);
      expect(form, findsNothing); // the form is not there yet
      expect(cancel, findsOneWidget);
      expect(understand, findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('I understand'), findsOneWidget);
    });

    testWidgets('Cancel goes back, and the form is never opened', (tester) async {
      await openDestination(tester);
      await pressReview(tester);

      await tester.tap(cancel);
      await tester.pumpAndSettle();

      expect(dialog, findsNothing);
      expect(form, findsNothing);
      expect(find.byType(DestinationDetailPage), findsOneWidget); // still on the destination's page
    });

    testWidgets('"I understand" opens the form', (tester) async {
      await openDestination(tester);
      await pressReview(tester);

      await mocked(() async {
        await tester.tap(understand);
        await settle(tester);
      });

      expect(dialog, findsNothing);
      expect(form, findsOneWidget);
    });

    testWidgets('tapping outside the pop-up, or the back button, is a Cancel: no form', (tester) async {
      await openDestination(tester);
      await pressReview(tester);

      await tester.tapAt(const Offset(4, 4)); // outside the dialog
      await tester.pumpAndSettle();
      expect(dialog, findsNothing);
      expect(form, findsNothing);

      await pressReview(tester);
      Navigator.of(tester.element(dialog)).pop(); // what the back button does
      await tester.pumpAndSettle();
      expect(dialog, findsNothing);
      expect(form, findsNothing);
    });

    testWidgets('it is shown again the second time, after Cancel', (tester) async {
      await openDestination(tester);

      await pressReview(tester);
      await tester.tap(cancel);
      await tester.pumpAndSettle();
      await pressReview(tester);

      expect(dialog, findsOneWidget);
      expect(form, findsNothing);
    });

    testWidgets('it is shown again after the tourist went through it and the form, and came back: nothing is remembered', (tester) async {
      await openDestination(tester);
      await pressReview(tester);
      await mocked(() async {
        await tester.tap(understand);
        await settle(tester);
      });
      expect(form, findsOneWidget);

      Navigator.of(tester.element(form)).pop(); // back from the form, nothing sent
      await tester.pumpAndSettle();
      expect(form, findsNothing);

      await pressReview(tester);
      expect(dialog, findsOneWidget);
      expect(form, findsNothing); // the form waits for "I understand" again
      await tester.tap(cancel);
      await tester.pumpAndSettle();
      await pressReview(tester);
      expect(dialog, findsOneWidget); // and a third time
    });

    testWidgets('nothing is kept on the phone about it having been seen', (tester) async {
      await openDestination(tester);
      await pressReview(tester);
      await mocked(() async {
        await tester.tap(understand);
        await settle(tester);
      });

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys().where((key) => key.contains('notice') || key.contains('review') || key.contains('consent')), isEmpty);
    });
  });

  group('the words', () {
    testWidgets('the pop-up and the notice under the form are EXACTLY the same words', (tester) async {
      await openDestination(tester);
      await pressReview(tester);
      final inTheDialog = wordsOfDialog(tester);

      await mocked(() async {
        await tester.tap(understand);
        await settle(tester);
      });
      final underTheForm = wordsIn(tester, find.byType(PublicVisibilityNotice));

      expect(inTheDialog, isNotEmpty);
      expect(underTheForm, inTheDialog);
      expect(inTheDialog, [reviewNoticeTitle, ...reviewNoticeParagraphs.map((paragraph) => paragraph.text)]);
      expect(inTheDialog.join('\n\n'), publicReviewNoticeText);
    });

    testWidgets('the sentence about the photo gallery is there, and stands out', (tester) async {
      await openDestination(tester);
      await pressReview(tester);

      final gallery = find.descendant(of: dialog, matching: find.textContaining("add your photos to the place's photo gallery in the app"));
      expect(gallery, findsOneWidget);
      expect(find.descendant(of: dialog, matching: find.textContaining('your photos stay there even if your review is later hidden or removed')), findsOneWidget);
      expect(find.descendant(of: dialog, matching: find.byKey(const ValueKey('review-notice-stressed'))), findsOneWidget);
      final stressed = tester.widget<Text>(gallery).style!.fontWeight!;
      final others = find.descendant(of: dialog, matching: find.byType(Text)).evaluate().map((e) => e.widget as Text).where((text) => text.data != null && !text.data!.contains('photo gallery'));
      for (final other in others) {
        if (other.data == 'Cancel' || other.data == 'I understand' || other.data == reviewNoticeTitle) continue;
        expect(stressed.value, greaterThan((other.style?.fontWeight ?? FontWeight.w400).value), reason: other.data);
      }
    });

    test('there is ONE source: the words are written in one place in the app, and drawn by one widget in two places', () {
      final sources = Directory('lib').listSync(recursive: true).whereType<File>().where((file) => file.path.endsWith('.dart')).toList();
      int count(String needle) => sources.map((file) => needle.allMatches(file.readAsStringSync()).length).fold(0, (a, b) => a + b);

      expect(count("photo gallery in the "), 1);
      expect(count('Before you write a review'), 1);
      expect(count('hiding does not delete the photo file'), 1);
      expect(count('ReviewNoticeContent()'), 2); // the pop-up and the notice under the form
      expect(count('publicReviewNoticeText'), 1); // defined; nothing else writes the words again
    });
  });

  group('on a small screen, and with large text, the buttons are still there', () {
    for (final width in [320.0, 360.0, 390.0]) {
      for (final scale in [1.0, 1.5, 2.0]) {
        testWidgets('$width wide, text x$scale: both buttons are on the screen and can be pressed', (tester) async {
          const height = 560.0;
          await openDestination(tester, width: width, height: height, scale: scale);
          await pressReview(tester);

          final screen = Rect.fromLTWH(0, 0, width, height);
          for (final button in [cancel, understand]) {
            expect(button, findsOneWidget);
            final box = tester.getRect(button);
            expect(screen.contains(box.topLeft) && screen.contains(box.bottomRight), isTrue, reason: '$button at $box is not inside $screen');
          }
          final viewportBottom = tester.getRect(scroll).bottom;
          expect(tester.getRect(cancel).top, greaterThanOrEqualTo(viewportBottom - 0.5)); // the buttons are outside the scrolling words
          expect(tester.getRect(understand).top, greaterThanOrEqualTo(viewportBottom - 0.5));
          expect(tester.takeException(), isNull);

          await tester.tap(understand); // and pressing one works
          await settle(tester);
          expect(dialog, findsNothing);
        });

        testWidgets('$width wide, text x$scale: the words scroll to the end, and the buttons do not move', (tester) async {
          const height = 560.0;
          await openDestination(tester, width: width, height: height, scale: scale);
          await pressReview(tester);

          final understandBefore = tester.getRect(understand);
          final scrollable = tester.state<ScrollableState>(find.descendant(of: scroll, matching: find.byType(Scrollable)));
          expect(scrollable.position.maxScrollExtent, greaterThan(0), reason: 'the notice is longer than the screen here');

          scrollable.position.jumpTo(scrollable.position.maxScrollExtent); // to the very end
          await tester.pump();

          expect(scrollable.position.pixels, scrollable.position.maxScrollExtent);
          final last = tester.getRect(find.text(reviewNoticeParagraphs.last.text));
          expect(last.bottom, lessThanOrEqualTo(tester.getRect(scroll).bottom + 0.5)); // the last words are reachable
          expect(tester.getRect(understand), understandBefore); // the buttons stayed
          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets('a very short screen (a phone turned on its side): the buttons are still on it', (tester) async {
      await openDestination(tester, width: 640, height: 320);
      await pressReview(tester);

      final screen = const Rect.fromLTWH(0, 0, 640, 320);
      for (final button in [cancel, understand]) {
        final box = tester.getRect(button);
        expect(screen.contains(box.topLeft) && screen.contains(box.bottomRight), isTrue, reason: '$box');
      }
      expect(tester.takeException(), isNull);
    });
  });
}
