// The box that opens when a pin is tapped (the preview card of the map): the X that closes it sits in the top right corner of the card, 8 from
// the top and 8 from the right, higher than the name and clear of it and of the picture, and is a target of at least 44 x 44 even though the X
// that is seen is small (18). One card for both maps (the one in Maps & Guides and the full-screen one), so both are measured. Positions are
// measured on the screen, not just looked for.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

Destination place(int id, String name, double lat, double lng) => Destination.fromJson({
  'resort_id': id,
  'resort_name': name,
  'type': 'Beach Resort',
  'location': '$name Place',
  'latitude': lat,
  'longitude': lng,
});

final bravo = place(2, 'Bravo Cove', 14.31, 121.88);
final nearHome = place(5, 'Near Home', 14.19, 121.74);

Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async => http.Response(jsonEncode({'destination': {}, 'recentFeedback': []}), 200)),
);

void screen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('NetworkImage') || text.contains('HTTP request failed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

/// The Maps & Guides map, opened on a destination: its box is open.
Future<void> openPageBox(WidgetTester tester, Destination d) async {
  screen(tester);
  await mocked(() async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TourismMapPage(
            destinations: [d],
            onOpenDestination: (_) {},
            focus: MapFocusRequest(d),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(mapFocusDuration + const Duration(milliseconds: 100));
  });
}

/// The full-screen map, with the box of a destination open.
Future<void> openFullBox(WidgetTester tester, Destination d) async {
  screen(tester);
  await mocked(() async {
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: TourismMapPage(destinations: [d], onOpenDestination: (_) {}))),
    );
    await tester.pump();
    await tester.tap(find.text('Full Screen'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.descendant(of: find.byType(Dialog), matching: find.byType(MapPin)).first);
    await tester.pump();
    await tester.pump(mapFocusDuration + const Duration(milliseconds: 100));
  });
}

/// The preview card: the rounded white box that holds the View button.
Finder card({bool full = false}) {
  final scope = full ? find.byType(Dialog) : find.byType(FlutterMap).first;
  final viewButton = full
      ? find.descendant(of: scope, matching: find.text('View'))
      : find.text('View');
  return find
      .ancestor(
        of: viewButton,
        matching: find.byWidgetPredicate(
          (w) => w is Container && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).borderRadius == BorderRadius.circular(18),
        ),
      )
      .first;
}

/// The Stack that holds the card and the X laid on it.
Finder cardStack({bool full = false}) => find.ancestor(of: card(full: full), matching: find.byType(Stack)).first;

Finder closeButton({bool full = false}) =>
    find.descendant(of: cardStack(full: full), matching: find.widgetWithIcon(IconButton, Icons.close));

Finder closeGlyph({bool full = false}) =>
    find.descendant(of: cardStack(full: full), matching: find.byIcon(Icons.close));

Rect rectOf(WidgetTester tester, Finder f) => tester.getRect(f);

Finder inCard(Finder what, {bool full = false}) => find.descendant(of: card(full: full), matching: what);

void main() {
  for (final full in [false, true]) {
    final which = full ? 'the full-screen map' : 'the map of Maps & Guides';

    group(which, () {
      Future<void> open(WidgetTester tester) => full ? openFullBox(tester, nearHome) : openPageBox(tester, bravo);
      final name = full ? 'Near Home' : 'Bravo Cove';

      testWidgets('the X that is seen is 8 from the top of the card and 8 from its right edge', (tester) async {
        await open(tester);
        final box = rectOf(tester, card(full: full));
        final glyph = rectOf(tester, closeGlyph(full: full));
        expect(glyph.size, const Size(18, 18), reason: 'the X that is seen is the size it was');
        expect(glyph.top - box.top, closeTo(8, 2), reason: 'glyph $glyph, card $box');
        expect(box.right - glyph.right, closeTo(8, 2), reason: 'glyph $glyph, card $box');
      });

      testWidgets('it is HIGHER than the name, not level with it', (tester) async {
        await open(tester);
        final title = rectOf(tester, inCard(find.text(name), full: full));
        final glyph = rectOf(tester, closeGlyph(full: full));
        final target = rectOf(tester, closeButton(full: full));
        expect(glyph.top, lessThan(title.top - 5), reason: 'glyph $glyph, name $title');
        expect(glyph.center.dy, lessThan(title.center.dy - 5));
        expect(target.top, lessThan(title.top));
      });

      testWidgets('it does not cover the name or the picture', (tester) async {
        await open(tester);
        final title = rectOf(tester, inCard(find.text(name), full: full));
        final image = rectOf(tester, inCard(find.byType(DestinationImage), full: full));
        final target = rectOf(tester, closeButton(full: full));
        final glyph = rectOf(tester, closeGlyph(full: full));
        expect(target.overlaps(title), isFalse, reason: 'target $target, name $title');
        expect(glyph.overlaps(title), isFalse);
        expect(target.overlaps(image), isFalse, reason: 'target $target, picture $image');
        expect(glyph.overlaps(image), isFalse);
      });

      testWidgets('the target is at least 44 x 44, whatever the size of the X that is seen', (tester) async {
        await open(tester);
        final target = rectOf(tester, closeButton(full: full));
        expect(target.width, greaterThanOrEqualTo(44));
        expect(target.height, greaterThanOrEqualTo(44));
        final glyph = rectOf(tester, closeGlyph(full: full));
        expect(glyph.width, lessThan(24), reason: 'the X that is seen stays small');
      });

      testWidgets('the target does not touch the View button', (tester) async {
        await open(tester);
        final target = rectOf(tester, closeButton(full: full));
        final view = rectOf(tester, inCard(find.byType(FilledButton), full: full));
        expect(target.bottom, lessThanOrEqualTo(view.top), reason: 'the two targets do not overlap: $target, $view');
        expect(target.overlaps(view), isFalse);
      });

      testWidgets('it still closes the box: from the middle of the X and from the corner of its target', (tester) async {
        await open(tester);
        expect(find.text('View'), findsOneWidget);
        await tester.tap(closeButton(full: full));
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text('View'), findsNothing, reason: 'closed by a tap on the X');

        await open(tester);
        final target = rectOf(tester, closeButton(full: full));
        final box = rectOf(tester, card(full: full));
        expect(target.top, lessThan(box.top), reason: 'the target begins above the card: the corner is where the X is');
        await tester.tapAt(target.topLeft + const Offset(3, 3));
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text('View'), findsNothing, reason: 'closed by a tap on the corner of the target, above the card');
      });

      testWidgets('all four corners of the target press it', (tester) async {
        for (final corner in [const Offset(3, 3), const Offset(41, 3), const Offset(3, 41), const Offset(41, 41)]) {
          await open(tester);
          final target = rectOf(tester, closeButton(full: full));
          await tester.tapAt(target.topLeft + corner);
          await tester.pump(const Duration(milliseconds: 400));
          expect(find.text('View'), findsNothing, reason: 'corner $corner of $target');
        }
      });

      testWidgets('a screen reader hears a button called Close, and can press it', (tester) async {
        final handle = tester.ensureSemantics();
        await open(tester);
        expect(
          tester.getSemantics(find.bySemanticsLabel('Close')),
          isSemantics(label: 'Close', isButton: true, hasTapAction: true),
        );
        handle.dispose();
      });
    });
  }

  group('nothing else about the card moved', () {
    testWidgets('the size of the card, the image, the chips and the View button, and where the name is, are what they were', (tester) async {
      await openPageBox(tester, bravo);
      final box = rectOf(tester, card());
      expect(box.size, const Size(351, 104));
      final image = rectOf(tester, inCard(find.byType(DestinationImage)));
      expect(image.size, const Size(72, 72));
      expect(image.topLeft - box.topLeft, const Offset(12, 16));
      final chips = rectOf(tester, inCard(find.byType(RatingPill)));
      expect(chips.topLeft - box.topLeft, const Offset(96, 62));
      final view = rectOf(tester, inCard(find.byType(FilledButton)));
      expect(view.size.height, 40);
      expect(view.top - box.top, 52);
      expect(box.right - view.right, 12);
      final title = rectOf(tester, inCard(find.text('Bravo Cove')));
      expect(title.topLeft - box.topLeft, const Offset(96, 18));
    });

    testWidgets('the full-screen card has the same height', (tester) async {
      await openFullBox(tester, nearHome);
      expect(rectOf(tester, card(full: true)).height, 104);
    });

    testWidgets('a very long name stops before the X, and the X does not cover it', (tester) async {
      const longName = 'Bravo Cove Beach And Camping Resort With A Very Long Name That Fills The Whole Width Of The Card';
      await openPageBox(tester, place(9, longName, 14.31, 121.88));
      final title = rectOf(tester, inCard(find.text(longName)));
      final target = rectOf(tester, closeButton());
      expect(title.overlaps(target), isFalse, reason: 'name $title, target $target');
      expect(title.right, lessThanOrEqualTo(target.left + 0.5));
      expect(tester.renderObject<RenderParagraph>(inCard(find.text(longName))).didExceedMaxLines, isTrue, reason: 'it is cut, not pushed');
    });

    testWidgets('the card itself did not grow: the widget around it is larger by the overhang above and to the right, and no more', (tester) async {
      await openPageBox(tester, bravo);
      final box = rectOf(tester, card());
      final around = rectOf(tester, cardStack());
      expect(box.top - around.top, mapPreviewCloseOverhang);
      expect(around.right - box.right, mapPreviewCloseOverhang);
      expect(box.left, around.left);
      expect(box.bottom, around.bottom);
    });
  });
}
