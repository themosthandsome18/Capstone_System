// The Notifications page of the tourism side, made good to read: when each notice was written, the word of its weight, the subtitle in line with the notices,
// the shape of the box and its line, three lines of message, one label for a screen reader. The sanitation side is given none of it. Positions are
// measured on the screen. Synthetic data only: no real notice, person or contact.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

final fixedNow = DateTime(2026, 11, 9, 15, 0);
const subtitle = 'Advisories from the Mauban Tourism Office';

AppNotification notice(String id, {String title = 'Sea advisory', String message = 'Boats may be delayed.', String? severity, String? createdAt}) =>
    AppNotification.fromJson({
      'id': id,
      'type': 'tourism',
      'title': title,
      'message': message,
      'severity': ?severity,
      'created_at': ?createdAt,
    });

Future<void> show(WidgetTester tester, List<AppNotification> items, {bool stripe = true, Size size = const Size(390, 800), TargetPlatform? platform}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(theme: platform == null ? null : ThemeData(platform: platform), home: NotificationPage(notifications: items, subtitle: stripe ? subtitle : 'Sanitary advisories and compliance updates', severityStripe: stripe, now: fixedNow)),
  );
  await tester.pump();
}

/// The left edge of the FIRST GLYPH of a text, on the screen: not the box of the widget, which is somewhere else when the text sits in the middle of it.
double glyphLeft(WidgetTester tester, Finder text) {
  final paragraph = tester.renderObject<RenderParagraph>(text);
  final first = paragraph.getBoxesForSelection(const TextSelection(baseOffset: 0, extentOffset: 1)).first;
  return paragraph.localToGlobal(Offset.zero).dx + first.left;
}

Finder box(String id) => find.byKey(ValueKey('notice-$id'));
Finder line(String id) => find.byKey(ValueKey('notice-stripe-$id'));

/// WCAG contrast of [a] on [b].
double contrast(Color a, Color b) {
  double lin(double c) => c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
  double lum(Color c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  final hi = math.max(lum(a), lum(b));
  final lo = math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}

/// The line under the message of a notice, as one string, and its parts.
Finder meta(String text) => find.text(text);

void main() {
  group('A) when it was written', () {
    final cases = <String, String>{
      '2026-11-09T14:30:00': 'Just now', // 30 minutes ago
      '2026-11-09T08:00:00': 'Today',
      '2026-11-08T20:00:00': 'Yesterday',
      '2026-11-06T10:00:00': '3 days ago',
      '2026-11-03T09:00:00': '6 days ago', // still under seven days
      '2026-11-02T09:00:00': '2 Nov', // seven days: the date
      '2025-10-28T09:00:00': '28 Oct 2025', // another year
    };

    cases.forEach((created, expected) {
      test('$created -> $expected (the model)', () {
        expect(notice('a', createdAt: created).whenLabel(fixedNow), expected);
      });
    });

    test('the edges: 59 minutes is just now, an hour is not; midnight turns Today into Yesterday', () {
      expect(notice('a', createdAt: '2026-11-09T14:01:00').whenLabel(fixedNow), 'Just now');
      expect(notice('a', createdAt: '2026-11-09T14:00:00').whenLabel(fixedNow), 'Today');
      expect(notice('a', createdAt: '2026-11-08T23:59:00').whenLabel(fixedNow), 'Yesterday');
      expect(notice('a', createdAt: '2026-11-09T00:00:00').whenLabel(fixedNow), 'Today');
      // a quarter past midnight, a notice from before midnight, 20 minutes old: just now, though it is "yesterday"
      expect(notice('a', createdAt: '2026-11-08T23:55:00').whenLabel(DateTime(2026, 11, 9, 0, 15)), 'Just now');
    });

    test('a date a little ahead of the clock is just now; no date, or one that is not a date, is no label', () {
      expect(notice('a', createdAt: '2026-11-09T15:05:00').whenLabel(fixedNow), 'Just now');
      expect(notice('a').whenLabel(fixedNow), isNull);
      expect(notice('a', createdAt: 'not a date').whenLabel(fixedNow), isNull);
      expect(notice('a', createdAt: '').whenLabel(fixedNow), isNull);
    });

    cases.forEach((created, expected) {
      testWidgets('$expected is on the screen under the message', (tester) async {
        await show(tester, [notice('a', severity: 'info', createdAt: created)]);
        expect(meta('Info · $expected'), findsOneWidget);
      });
    });

    testWidgets('with no created_at there is no date at all, and no dot or placeholder where it would be', (tester) async {
      await show(tester, [notice('a', severity: 'warning')]);
      expect(meta('Advisory'), findsOneWidget);
      expect(find.textContaining('·'), findsNothing);
      for (final word in ['Just now', 'Today', 'Yesterday', 'ago', '—', 'Unknown']) {
        expect(find.textContaining(word), findsNothing, reason: word);
      }
    });
  });

  group('B) the word for the weight', () {
    testWidgets('info is Info, warning is Advisory, critical is Urgent, and none is Info', (tester) async {
      await show(tester, [
        notice('a', severity: 'info', createdAt: '2026-11-09T08:00:00'),
        notice('b', severity: 'warning', createdAt: '2026-11-09T08:00:00'),
        notice('c', severity: 'critical', createdAt: '2026-11-09T08:00:00'),
        notice('d', createdAt: '2026-11-09T08:00:00'),
      ]);
      expect(find.descendant(of: box('a'), matching: find.text('Info · Today')), findsOneWidget);
      expect(find.descendant(of: box('b'), matching: find.text('Advisory · Today')), findsOneWidget);
      expect(find.descendant(of: box('c'), matching: find.text('Urgent · Today')), findsOneWidget);
      expect(find.descendant(of: box('d'), matching: find.text('Info · Today')), findsOneWidget);
    });

    testWidgets('the word is 11.5 w800 and the date 11.5 w500 and lighter', (tester) async {
      await show(tester, [notice('a', severity: 'critical', createdAt: '2026-11-09T08:00:00')]);
      final text = tester.widget<RichText>(find.descendant(of: box('a'), matching: find.byWidgetPredicate((w) => w is RichText && w.text.toPlainText() == 'Urgent · Today')));
      final root = text.text as TextSpan; // (Text.rich wraps what it is given in a span that carries the effective style)
      final mine = root.children![0] as TextSpan;
      final word = mine.children![0] as TextSpan;
      final date = mine.children![1] as TextSpan;
      expect(root.style!.fontSize, 11.5);
      expect(word.style!.fontWeight, FontWeight.w800);
      expect(date.style!.fontWeight, FontWeight.w500);
      expect(word.text, 'Urgent');
      expect(date.text, ' · Today');
      expect(date.style!.color, AppColors.muted);
      expect(word.style!.color, isNot(date.style!.color));
    });

    test('every word is at least 4.5:1 on the white box, and all three are the ink of the app', () {
      final info = notice('a', severity: 'info');
      final warning = notice('b', severity: 'warning');
      final critical = notice('c', severity: 'critical');
      // the colour of the LINE would not do as text: info 3.1:1, warning 2.5:1 on white
      expect(contrast(info.severityColor, Colors.white), lessThan(4.5));
      expect(contrast(warning.severityColor, Colors.white), lessThan(4.5));
      for (final item in [info, warning, critical]) {
        expect(item.severityTextColor, AppColors.ink, reason: item.severity);
        expect(contrast(item.severityTextColor, Colors.white), greaterThanOrEqualTo(4.5), reason: item.severity);
      }
      expect(contrast(AppColors.ink, Colors.white), greaterThan(17));
    });

    test('the three words have ONE colour (they cannot drift apart), and the lines keep their three', () {
      final words = {for (final w in ['info', 'warning', 'critical', null, 'unknown']) notice('x', severity: w).severityTextColor};
      expect(words, {AppColors.ink});
      final lines = {for (final w in ['info', 'warning', 'critical']) notice('x', severity: w).severityColor};
      expect(lines, hasLength(3));
      expect(notice('x', severity: 'critical').severityColor, AppColors.red);
      expect(notice('x', severity: 'warning').severityColor, AppColors.amber);
      expect(notice('x', severity: 'info').severityColor, Colors.blue);
    });

    testWidgets('the colour of the word on the screen is the one the model says', (tester) async {
      await show(tester, [notice('a', severity: 'critical', createdAt: '2026-11-09T08:00:00'), notice('b', severity: 'info', createdAt: '2026-11-09T08:00:00')]);
      Color wordColour(String id, String plain) {
        final rich = tester.widget<RichText>(find.descendant(of: box(id), matching: find.byWidgetPredicate((w) => w is RichText && w.text.toPlainText() == plain)));
        return ((((rich.text as TextSpan).children![0] as TextSpan).children![0]) as TextSpan).style!.color!;
      }

      expect(wordColour('a', 'Urgent · Today'), AppColors.ink);
      expect(wordColour('b', 'Info · Today'), AppColors.ink);
      expect(wordColour('a', 'Urgent · Today'), wordColour('b', 'Info · Today'), reason: 'one colour for the words, on the screen too');
    });
  });

  group('C) the subtitle is in line with the notices', () {
    // The FIRST GLYPH of the subtitle is measured (not the box of the widget) against the LEFT EDGE of the box of the first notice, on both platforms and at
    // four widths. 1.0 allows the side bearing of the first letter (0.13 here) and nothing like the 56 it was set in by, in line with the title.
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      for (final width in [432.0, 390.0, 600.0, 800.0]) {
        testWidgets('$platform, ${width.toInt()} wide: the first glyph of the subtitle is at the left edge of the first notice', (tester) async {
          await show(tester, [notice('a')], size: Size(width, 800), platform: platform);
          final card = tester.getTopLeft(box('a')).dx;
          final under = glyphLeft(tester, find.text(subtitle));
          expect(card, 16, reason: 'the fixture: the notice begins 16 from the left');
          expect(under, closeTo(card, 1.0), reason: 'card $card, subtitle $under');
          expect(under, lessThan(40), reason: 'not set in after the back arrow any more');
        });
      }
    }

    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      testWidgets('$platform: the title is where it was: after the back arrow, on the left, whatever the subtitle does', (tester) async {
        // wide enough that a CENTRED title would be far from the left (at 390 the test font is so wide that a centred title is pushed to 72 anyway)
        await show(tester, [notice('a')], size: const Size(600, 800), platform: platform);
        expect(glyphLeft(tester, find.text('Notifications')), closeTo(72, 0.5));
      });
    }

    testWidgets('the bar is told not to centre the title on this page, and nowhere else is it told anything', (tester) async {
      await show(tester, [notice('a')]);
      expect(tester.widget<AppBar>(find.byType(AppBar)).centerTitle, isFalse);
      await show(tester, [notice('a')], stripe: false);
      expect(tester.widget<AppBar>(find.byType(AppBar)).centerTitle, isNull, reason: 'the sanitation side leaves it to the platform, as it always did');
    });

    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      testWidgets('$platform: on the sanitation side the subtitle is where it always was (18 from the left, first glyph within a pixel)', (tester) async {
        await show(tester, [notice('a')], stripe: false, platform: platform);
        expect(tester.getTopLeft(find.text('Sanitary advisories and compliance updates')).dx, 18);
        expect(glyphLeft(tester, find.text('Sanitary advisories and compliance updates')), closeTo(18, 1));
      });
    }
  });

  group('D) the shape and the breathing room', () {
    testWidgets('the box: white, radius 14, a soft shadow', (tester) async {
      await show(tester, [notice('a')]);
      final decorated = tester.widget<DecoratedBox>(box('a'));
      final decoration = decorated.decoration as BoxDecoration;
      expect(decoration.color, Colors.white);
      expect(decoration.borderRadius, BorderRadius.circular(14));
      expect(decoration.boxShadow, isNotEmpty);
      final clip = tester.widget<ClipRRect>(find.descendant(of: box('a'), matching: find.byType(ClipRRect)).first);
      expect(clip.borderRadius, BorderRadius.circular(14), reason: 'the line is inside the box, so its left corners follow the radius of the box');
      expect(find.descendant(of: find.descendant(of: box('a'), matching: find.byType(ClipRRect)), matching: line('a')), findsOneWidget);
    });

    testWidgets('the line: 4 wide, against the left edge, the whole height of the box (measured), with a short and with a tall box', (tester) async {
      await show(tester, [notice('a', severity: 'critical'), notice('b', severity: 'warning', message: 'A message that goes on and on so that the box is taller. ' * 6)]);
      final heights = <double>[];
      for (final id in ['a', 'b']) {
        final outer = tester.getRect(box(id));
        final inner = tester.getRect(line(id));
        expect(inner.width, 4);
        expect(inner.left, outer.left);
        expect(inner.top, outer.top);
        expect(inner.bottom, outer.bottom);
        heights.add(outer.height);
      }
      expect(heights[1], greaterThan(heights[0] + 20)); // the fixture: two different heights
    });

    testWidgets('16 around the page, 10 between the boxes', (tester) async {
      await show(tester, [notice('a'), notice('b')]);
      final a = tester.getRect(box('a'));
      final b = tester.getRect(box('b'));
      expect(a.left, 16);
      expect(a.right, 390 - 16);
      expect(b.top - a.bottom, 10);
    });

    testWidgets('14 inside the box on all four sides (besides the line), 7 and 10 between the lines of text', (tester) async {
      await show(tester, [notice('a', title: 'Sea advisory', message: 'Boats may be delayed.', severity: 'info', createdAt: '2026-11-09T08:00:00')]);
      final outer = tester.getRect(box('a'));
      final title = tester.getRect(find.text('Sea advisory'));
      final message = tester.getRect(find.text('Boats may be delayed.'));
      final dateLine = tester.getRect(find.text('Info · Today'));
      expect(title.left - (outer.left + 4), 14);
      expect(title.top - outer.top, 14);
      expect(outer.bottom - dateLine.bottom, 14);
      expect(outer.right - math.max(title.right, math.max(message.right, dateLine.right)), greaterThanOrEqualTo(14));
      expect(message.top - title.bottom, 7);
      expect(dateLine.top - message.bottom, 10);
    });

    testWidgets('the title is 15 w700, the message 13 and lighter', (tester) async {
      await show(tester, [notice('a', title: 'Sea advisory', message: 'Boats may be delayed.')]);
      final title = tester.widget<Text>(find.text('Sea advisory'));
      final message = tester.widget<Text>(find.text('Boats may be delayed.'));
      expect(title.style!.fontSize, 15);
      expect(title.style!.fontWeight, FontWeight.w700);
      expect(message.style!.fontSize, 13);
      expect(message.style!.color, AppColors.muted);
      expect(message.style!.color, isNot(title.style!.color));
    });

    testWidgets('a long message is three lines and ends in an ellipsis; a short one is not cut', (tester) async {
      final long = 'This message is far too long for three lines of the page and it keeps going and going well past where the third line ends. ' * 4;
      await show(tester, [notice('a', message: long), notice('b', message: 'Short.')]);
      final paragraph = tester.renderObject<RenderParagraph>(find.text(long));
      expect(paragraph.didExceedMaxLines, isTrue);
      expect(tester.widget<Text>(find.text(long)).maxLines, 3);
      expect(tester.widget<Text>(find.text(long)).overflow, TextOverflow.ellipsis);
      final oneLine = tester.getSize(find.text('Short.')).height;
      expect(tester.getSize(find.text(long)).height, closeTo(oneLine * 3, 1), reason: 'three lines, no more');
      expect(tester.renderObject<RenderParagraph>(find.text('Short.')).didExceedMaxLines, isFalse);
    });
  });

  group('E) for a screen reader', () {
    testWidgets('one label per notice: the weight, the title, the message and when', (tester) async {
      final handle = tester.ensureSemantics();
      await show(tester, [
        notice('a', title: 'Sea advisory', message: 'Boats may be delayed.', severity: 'critical', createdAt: '2026-11-08T20:00:00'),
        notice('b', title: 'Road work', message: 'Slow traffic.', severity: 'info'),
      ]);
      expect(find.bySemanticsLabel('Urgent, Sea advisory, Boats may be delayed., Yesterday'), findsOneWidget);
      expect(find.bySemanticsLabel('Info, Road work, Slow traffic.'), findsOneWidget, reason: 'no date: none is read');
      // the text inside is not read a second time as separate pieces
      expect(find.bySemanticsLabel('Sea advisory'), findsNothing);
      handle.dispose();
    });
  });

  group('the sanitation side is given none of it', () {
    testWidgets('icon yes; no line, no date, no word for the weight, no stripe key', (tester) async {
      final items = [
        notice('a', title: 'Permit expiring soon', message: 'A Place expires on 2026-12-01.', severity: 'critical', createdAt: '2026-11-09T14:30:00'),
        notice('b', title: 'Garbage', message: 'Cagsiay I - Open', severity: 'warning', createdAt: '2026-11-08T20:00:00'),
      ];
      await show(tester, items, stripe: false);
      expect(find.byType(CircleAvatar), findsNWidgets(2));
      expect(find.byKey(const ValueKey('notice-stripe-a')), findsNothing);
      expect(find.byKey(const ValueKey('notice-a')), findsNothing);
      for (final word in ['Urgent', 'Advisory', 'Info', 'Just now', 'Yesterday', '·']) {
        expect(find.textContaining(word), findsNothing, reason: word);
      }
      expect(find.text('Permit expiring soon'), findsOneWidget);
      expect(find.text('A Place expires on 2026-12-01.'), findsOneWidget);
    });
  });
}
