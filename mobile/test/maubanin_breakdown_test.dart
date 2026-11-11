// "Maubanin" under "Filipino" in the visitor breakdown of the scanned record. Maubanin are a PART of the Filipino count: a quiet line under it, never
// added to anything and never more than the Filipino count; TOTAL GUESTS does not move. Synthetic data only.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'staff_qr_read_only_test.dart' show pumpCard, record;

Finder count(String label) => find.byKey(ValueKey('count-$label'));
String textOf(WidgetTester tester, Finder f) => tester.widget<Text>(f).data!;
double luminance(Color c) => c.computeLuminance();

void main() {
  group('the Maubanin line', () {
    testWidgets('is under Filipino, in the left column, indented, and its number starts where the Filipino number starts', (tester) async {
      await pumpCard(tester, record({'maubanin_count': 2}));

      final filipino = tester.getTopLeft(find.text('Filipino'));
      final maubanin = tester.getTopLeft(find.text('Maubanin'));
      final male = tester.getTopLeft(find.text('Male'));
      expect(find.text('Maubanin'), findsOneWidget);
      expect(maubanin.dy, greaterThan(filipino.dy));
      expect(maubanin.dy, lessThan(male.dy), reason: 'right under Filipino, before the next row');
      expect(maubanin.dx, greaterThan(filipino.dx), reason: 'indented');
      expect(maubanin.dx, lessThan(tester.getTopLeft(find.text('Foreigner')).dx), reason: 'in the left column');
      expect(tester.getTopLeft(count('Maubanin')).dx, tester.getTopLeft(count('Filipino')).dx);
      expect(textOf(tester, count('Maubanin')), '2');
    });

    testWidgets('is not added to anything: Filipino, Foreigner and TOTAL GUESTS are the same with 0, 2 or 3 Maubanin', (tester) async {
      final seen = <List<String>>[];
      for (final maubanin in [0, 2, 3]) {
        await pumpCard(tester, record({'maubanin_count': maubanin}));
        seen.add([
          textOf(tester, count('Filipino')),
          textOf(tester, count('Foreigner')),
          textOf(tester, count('Male')),
          textOf(tester, count('Female')),
          textOf(tester, count('Age 0-7')),
          textOf(tester, count('Age 8-59')),
          textOf(tester, count('Age 60+')),
          find.text('4 Visitors').evaluate().length.toString(),
          find.text('TOTAL GUESTS').evaluate().length.toString(),
        ]);
      }
      expect(seen.first, ['3', '1', '2', '2', '1', '2', '1', '1', '1']);
      expect(seen[1], seen.first);
      expect(seen[2], seen.first);
    });

    testWidgets('never shows more than the Filipino count', (tester) async {
      await pumpCard(tester, record({'filipino_count': 3, 'maubanin_count': 9}));
      expect(textOf(tester, count('Maubanin')), '3');
    });

    testWidgets('shows 0 when there is no Maubanin', (tester) async {
      await pumpCard(tester, record({'maubanin_count': 0}));
      expect(find.text('Maubanin'), findsOneWidget);
      expect(textOf(tester, count('Maubanin')), '0');
    });

    testWidgets('is not drawn when the record does not say (no field, null or blank), and never as 0 made up', (tester) async {
      for (final data in [record(), record({'maubanin_count': null}), record({'maubanin_count': ''})]) {
        await pumpCard(tester, data);
        expect(find.text('Filipino'), findsOneWidget); // the card is drawn
        expect(find.text('Maubanin'), findsNothing);
      }
    });

    testWidgets('adds no row on the right and does not touch Male, Female and the ages', (tester) async {
      await pumpCard(tester, record({'maubanin_count': 2}));
      final keys = find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('count-'));
      expect(keys.evaluate().length, 7 + 1, reason: 'the seven counts of the breakdown before, and the one new line');
      final foreigner = tester.getTopLeft(find.text('Foreigner'));
      final female = tester.getTopLeft(find.text('Female'));
      expect(foreigner.dx, female.dx);
      expect(find.text('Age 8-59'), findsOneWidget);
    });
  });

  group('it reads as a part of Filipino, not as a count beside it', () {
    testWidgets('smaller, lighter and not bold, against both the Filipino label and number', (tester) async {
      await pumpCard(tester, record({'maubanin_count': 2}));

      final subLabel = tester.widget<Text>(find.text('Maubanin')).style!;
      final subValue = tester.widget<Text>(count('Maubanin')).style!;
      final mainLabel = tester.widget<Text>(find.text('Filipino')).style!;
      final mainValue = tester.widget<Text>(count('Filipino')).style!;

      expect(subLabel.fontSize!, lessThan(mainLabel.fontSize!));
      expect(subValue.fontSize!, lessThan(mainValue.fontSize!));
      for (final main in [mainLabel, mainValue]) {
        expect(luminance(subLabel.color!), greaterThan(luminance(main.color!)), reason: 'lighter than ${main.color}');
        expect(luminance(subValue.color!), greaterThan(luminance(main.color!)), reason: 'lighter than ${main.color}');
      }
      expect(subValue.fontWeight!.value, lessThan(mainValue.fontWeight!.value));
      expect(subLabel.fontWeight, isNull);
    });
  });

  group('nothing runs out of the screen', () {
    for (final width in [320.0, 360.0, 390.0]) {
      testWidgets('at ${width.toInt()} wide, with the text at 130%', (tester) async {
        final seen = await pumpCard(tester, record({'maubanin_count': 2}), width: width, scale: 1.3);
        expect(find.text('Maubanin'), findsOneWidget);
        expect(seen, isEmpty);
        expect(tester.takeException(), isNull);
      });
    }
  });
}
