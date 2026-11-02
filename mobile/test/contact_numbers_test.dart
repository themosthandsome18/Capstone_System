// The numbers of an Emergency Hotline can be tapped to open the phone's dialer; the email cannot.
// The dialer itself is never opened here: a test gives the widget its own launcher and reads what it was asked to open.

import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/widgets/contact_numbers.dart';

const _style = TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFFEF4444));

/// Every span of the text that can be tapped: (its text, what a tap does).
List<(String, GestureRecognizer)> _tappable(WidgetTester tester) {
  final found = <(String, GestureRecognizer)>[];
  final rich = tester.widget<RichText>(find.descendant(of: find.byType(ContactNumbers), matching: find.byType(RichText)));
  rich.text.visitChildren((span) {
    if (span is TextSpan && span.recognizer != null) found.add((span.text ?? '', span.recognizer!));
    return true;
  });
  return found;
}

Future<List<Uri>> _pump(WidgetTester tester, String numbers, {DialLauncher? launcher}) async {
  final opened = <Uri>[];
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: ContactNumbers(
        numbers: numbers,
        style: _style,
        launcher: launcher ??
            (uri) async {
              opened.add(uri);
              return true;
            },
      ),
    ),
  ));
  return opened;
}

void main() {
  group('the number that is dialled', () {
    test('spaces, hyphens and parentheses are taken out', () {
      expect(dialableNumber('0998-598-8422'), '09985988422');
      expect(dialableNumber('(042) 784-0123'), '0427840123');
      expect(dialableNumber('  0917 842 7643 '), '09178427643');
    });

    test('a leading + is kept; text that is not a number is not dialable', () {
      expect(dialableNumber('+63 998 598 8422'), '+639985988422');
      expect(dialableNumber('Local 101'), isNull);
      expect(dialableNumber('tourism@mauban.gov.ph'), isNull);
      expect(dialableNumber('---'), isNull);
      expect(dialableNumber(''), isNull);
    });
  });

  group('openDialer', () {
    test('asks for tel: with the cleaned number', () async {
      Uri? asked;
      final ok = await openDialer('(042) 784-0123', launcher: (uri) async {
        asked = uri;
        return true;
      });
      expect(ok, isTrue);
      expect(asked.toString(), 'tel:0427840123');
      expect(asked!.scheme, 'tel');
    });

    test('does nothing for text that is not a number', () async {
      var called = false;
      final ok = await openDialer('Local 101', launcher: (uri) async {
        called = true;
        return true;
      });
      expect(ok, isFalse);
      expect(called, isFalse);
    });

    test('does not throw when the dialer cannot be opened', () async {
      expect(await openDialer('911', launcher: (uri) async => false), isFalse);
      expect(await openDialer('911', launcher: (uri) async => throw Exception('no dialer')), isFalse);
    });
  });

  group('ContactNumbers', () {
    testWidgets('one number: one tappable span, and a tap opens its tel:', (tester) async {
      final opened = await _pump(tester, '0917-842-7643');

      final spans = _tappable(tester);
      expect(spans.map((s) => s.$1), ['0917-842-7643']);
      (spans.single.$2 as TapGestureRecognizer).onTap!();
      await tester.pump();

      expect(opened.map((u) => u.toString()), ['tel:09178427643']);
    });

    testWidgets('several numbers apart by a slash: each is tappable on its own, with its own tel:', (tester) async {
      final opened = await _pump(tester, '0998-598-8422 / (042) 784-0123');

      final spans = _tappable(tester);
      expect(spans.map((s) => s.$1), ['0998-598-8422', '(042) 784-0123']);
      (spans[0].$2 as TapGestureRecognizer).onTap!();
      (spans[1].$2 as TapGestureRecognizer).onTap!();
      await tester.pump();

      expect(opened.map((u) => u.toString()), ['tel:09985988422', 'tel:0427840123']);
    });

    testWidgets('it looks the same as the plain text: same words, same style, no underline, the slash between', (tester) async {
      await _pump(tester, '0998-598-8422 / (042) 784-0123');

      final rich = tester.widget<RichText>(find.descendant(of: find.byType(ContactNumbers), matching: find.byType(RichText)));
      expect(rich.text.toPlainText(), '0998-598-8422 / (042) 784-0123');
      // the style is the one text style of the whole line, and no span has a style of its own
      final style = rich.text.style!;
      expect(style.fontSize, 11.5);
      expect(style.fontWeight, FontWeight.w600);
      expect(style.color, const Color(0xFFEF4444));
      expect(style.decoration, anyOf(isNull, TextDecoration.none));
      rich.text.visitChildren((span) {
        if (span is TextSpan) expect(span.style, isNull, reason: span.text);
        return true;
      });
      // one line of text, not a row of widgets
      expect(find.descendant(of: find.byType(ContactNumbers), matching: find.byType(RichText)), findsOneWidget);
    });

    testWidgets('a part that is not a number is shown but cannot be tapped', (tester) async {
      await _pump(tester, '911 / Local 101 / 0917-842-7643');

      final spans = _tappable(tester);
      expect(spans.map((s) => s.$1), ['911', '0917-842-7643']);
      expect(find.textContaining('Local 101', findRichText: true), findsOneWidget);
    });

    testWidgets('a dialer that fails does nothing and does not crash the app', (tester) async {
      await _pump(tester, '0917-842-7643 / 911', launcher: (uri) async => throw Exception('no dialer'));

      for (final span in _tappable(tester)) {
        (span.$2 as TapGestureRecognizer).onTap!();
      }
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.textContaining('0917-842-7643', findRichText: true), findsOneWidget);
    });
  });

  group('the Emergency Hotlines card', () {
    final screens = File('lib/screens/tourism_screens.dart').readAsStringSync();
    final start = screens.indexOf('class _EmergencyContactCard');
    final card = screens.substring(start, screens.indexOf('class DestinationImageSlideshow'));

    test('draws the numbers with ContactNumbers', () {
      expect(card, contains('ContactNumbers('));
      expect(card, contains('numbers: number'));
    });

    test('the email is still plain text: nothing in the card can open anything from it', () {
      final email = card.substring(card.indexOf('if (email.isNotEmpty)'), card.indexOf('if (description.isNotEmpty)'));
      expect(email, contains('Text('));
      expect(email, isNot(contains('ContactNumbers')));
      expect(email, isNot(contains('GestureDetector')));
      expect(email, isNot(contains('InkWell')));
      expect(email, isNot(contains('recognizer')));
      expect(email, isNot(contains('launch')));
    });
  });
}
