// A pillar of the Why Visit and a tile of the Travel Guide that have a full text open it in a bottom sheet; every other one is exactly what it has always been, and a
// banner never opens. What the sheet shows is the text of the SERVER: the code writes none. Every test that has a fixture asserts, inside the test, that the fixture
// reached the case it is for.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Map<String, Object?> item(
  int id, {
  String style = 'tile',
  String full = '',
  bool? tappable,
  String? title,
  String icon = 'beach',
}) => {
  'id': id,
  'icon': icon,
  'title': title ?? '${style == 'banner' ? 'Notice' : 'Item'} $id',
  'short_text': 'About $id',
  'full_text': full,
  'style': style,
  'tappable': tappable ?? full.trim().isNotEmpty,
};

Map<String, Object?> content({List<Object?> why = const [], List<Object?> guide = const []}) => {
  'blocks': <String, Object?>{},
  'sections': {'why_visit': why, 'travel_guide': guide},
};

MobileBootstrap bootstrapWith(Object? appContent, {bool absent = false}) {
  final map = bootstrapJson(0);
  if (!absent) map['appContent'] = appContent;
  return MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>);
}

TourismBootstrapState loaded(Object? appContent, {bool absent = false}) => TourismBootstrapState.loaded(bootstrapWith(appContent, absent: absent));

const guest = MobileUserProfile(name: '', email: '', contactNumber: '');
const ana = MobileUserProfile(name: 'Ana Cruz', email: 'a@b.c', contactNumber: '1');

Future<void> showHome(WidgetTester tester, TourismBootstrapState state, {MobileUserProfile profile = guest, double height = 9000}) async {
  tester.view.physicalSize = Size(411, height);
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
          state: state,
          onRetry: () {},
          profile: profile,
          onOpenTab: (_) {},
          onOpenDestination: (_) {},
          onOpenNotifications: () {},
        ),
      ),
    ),
  );
  await tester.pump();
}

Finder pillar(int id) => find.byKey(ValueKey('pillar-$id'));
Finder tile(int id) => find.byKey(ValueKey('guide-$id'));
Finder banner(int id) => find.byKey(ValueKey('banner-$id'));
Finder sheet() => find.byKey(const ValueKey('item-detail'));
Finder inSheet(Finder what) => find.descendant(of: sheet(), matching: what);

/// The small sign that a pillar or a tile opens.
Finder chevronIn(Finder card) => find.descendant(of: card, matching: find.byIcon(Icons.chevron_right_rounded));

Future<void> open(WidgetTester tester, Finder card) async {
  await tester.ensureVisible(card);
  await tester.tap(card);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the model: which items open', () {
    AppContentItem parsed(Map<String, Object?> json) => AppContentItem.tryParse(jsonDecode(jsonEncode(json)))!;

    test('a tile or a pillar with a full text, that the server marked, opens; nothing else does', () {
      expect(parsed(item(1, full: 'The whole story.')).opensDetail, isTrue);
      expect(parsed(item(2, full: 'The whole story.', tappable: false)).opensDetail, isFalse, reason: 'the server says no');
      expect(parsed(item(3, full: '', tappable: true)).opensDetail, isFalse, reason: 'there is nothing to show');
      expect(parsed(item(4, full: '   \n ', tappable: true)).opensDetail, isFalse, reason: 'a blank text is nothing');
      expect(parsed(item(5)).opensDetail, isFalse, reason: 'no full text');
    });

    test('a banner opens like a tile when it has a full text that the server marked', () {
      final banner = parsed(item(6, style: 'banner', full: 'More about the notice.', tappable: true));
      expect(banner.isBanner, isTrue); // the fixture
      expect(banner.fullText, isNotEmpty); // the fixture: it has a text
      expect(banner.tappable, isTrue); // the fixture: and the server says yes
      expect(banner.opensDetail, isTrue);
    });

    test('a banner does not open without a full text, with a blank one, or when the server says no', () {
      expect(parsed(item(7, style: 'banner')).opensDetail, isFalse, reason: 'no full text');
      expect(parsed(item(8, style: 'banner', full: '  \n ', tappable: true)).opensDetail, isFalse, reason: 'a blank text is nothing');
      expect(parsed(item(9, style: 'banner', full: 'More about the notice.', tappable: false)).opensDetail, isFalse, reason: 'the server says no');
      expect(parsed(item(9, style: 'banner', full: 'More about the notice.', tappable: false)).fullText, isNotEmpty); // the fixture: it does have a text
    });

    test('the code writes no full text: none of the items written in the code opens', () {
      final written = [...AppContentDefaults.whyVisitItems, ...AppContentDefaults.travelGuideItems];
      expect(written, isNotEmpty); // the fixture
      expect(written.any((i) => i.opensDetail), isFalse);
      expect(written.any((i) => i.fullText.isNotEmpty), isFalse);
    });
  });

  group('a pillar of the Why Visit', () {
    const story = 'THE WHOLE STORY OF PILLAR ONE, written by the LGU and found nowhere in the code.';

    testWidgets('with a full text opens a sheet with its icon, its title and the server\'s text, and the sheet closes', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: story, icon: 'beach'), item(2)])));
      expect(chevronIn(pillar(1)), findsOneWidget); // the quiet sign
      expect(sheet(), findsNothing); // the fixture: nothing is open yet
      await open(tester, pillar(1));
      expect(sheet(), findsOneWidget);
      expect(inSheet(find.text(story)), findsOneWidget);
      expect(inSheet(find.text('Item 1')), findsOneWidget);
      expect(inSheet(find.byIcon(appContentIconFor('beach').icon)), findsOneWidget);
      expect(find.byKey(const ValueKey('item-detail-close')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('item-detail-close')));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('the text is the SERVER\'s: the code has none to show', (tester) async {
      expect(story, isNot(contains('Cagbalete'))); // the fixture
      expect(AppContentDefaults.whyVisitItems.every((i) => !i.fullText.contains('PILLAR ONE')), isTrue);
      await showHome(tester, loaded(content(why: [item(1, full: story)])));
      await open(tester, pillar(1));
      expect(inSheet(find.text(story)), findsOneWidget);
      // and a different text from the server is a different text on the sheet
      expect(inSheet(find.text('A DIFFERENT TEXT')), findsNothing);
    });

    testWidgets('without a full text does not open, and has no sign that it does', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: story), item(2)])));
      expect(pillar(2), findsOneWidget); // the fixture: the pillar is on the screen
      expect(chevronIn(pillar(2)), findsNothing);
      await tester.ensureVisible(pillar(2));
      await tester.tap(pillar(2));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('the server decides: marked "no" with a text, or "yes" with a blank text, does not open', (tester) async {
      await showHome(
        tester,
        loaded(content(why: [item(1, full: story, tappable: false), item(2, full: '  ', tappable: true), item(3, full: story)])),
      );
      expect(chevronIn(pillar(3)), findsOneWidget); // the fixture: one that does open, beside the two that do not
      for (final id in [1, 2]) {
        expect(chevronIn(pillar(id)), findsNothing, reason: 'pillar $id');
        await tester.ensureVisible(pillar(id));
        await tester.tap(pillar(id));
        await tester.pumpAndSettle();
        expect(sheet(), findsNothing, reason: 'pillar $id');
      }
    });

    testWidgets('`{name}` in the full text is the visitor\'s name', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'Welcome, {name}. Here is the whole story.')])), profile: ana);
      await open(tester, pillar(1));
      expect(inSheet(find.text('Welcome, Ana Cruz. Here is the whole story.')), findsOneWidget);
    });

    testWidgets('a full text that still has a `{...}` is not offered, and the pillar stays', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'Pay at {unknown_place}.', tappable: true), item(2)])));
      expect(pillar(1), findsOneWidget); // the fixture: the pillar is still there
      expect(chevronIn(pillar(1)), findsNothing);
      await tester.ensureVisible(pillar(1));
      await tester.tap(pillar(1));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('a long text scrolls inside the sheet, to its last line', (tester) async {
      final lines = [for (var i = 1; i <= 120; i++) 'Line $i of the long story.'];
      // a tall phone screen: the pillar is on it, and the text is still longer than the sheet
      await showHome(tester, loaded(content(why: [item(1, full: lines.join('\n'))])), height: 1100);
      await open(tester, pillar(1));
      expect(find.text(lines.join('\n')), findsOneWidget);
      final scroller = find.byKey(const ValueKey('item-detail-text'));
      final text = find.descendant(of: scroller, matching: find.byType(Text));
      final before = tester.getTopLeft(text).dy;
      await tester.drag(scroller, const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(text).dy, lessThan(before)); // it moved: the text is longer than the sheet
      expect(tester.takeException(), isNull);
      // the sheet never grows past the screen
      expect(tester.getSize(sheet()).height, lessThanOrEqualTo(1100 * 0.8 + 0.1));
    });

    testWidgets('opens only the pillar that was pressed', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'Text of one.'), item(2, full: 'Text of two.')])));
      await open(tester, pillar(2));
      expect(inSheet(find.text('Text of two.')), findsOneWidget);
      expect(inSheet(find.text('Text of one.')), findsNothing);
    });
  });

  group('a tile of the Travel Guide', () {
    const guideStory = 'THE WHOLE GUIDE OF TILE ONE, written by the LGU and found nowhere in the code.';

    testWidgets('with a full text opens a sheet with its icon, its title and the server\'s text, and the sheet closes', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, full: guideStory, icon: 'boat'), item(2)])));
      expect(chevronIn(tile(1)), findsOneWidget);
      await open(tester, tile(1));
      expect(sheet(), findsOneWidget);
      expect(inSheet(find.text(guideStory)), findsOneWidget);
      expect(inSheet(find.text('Item 1')), findsOneWidget);
      expect(inSheet(find.byIcon(appContentIconFor('boat').icon)), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('item-detail-close')));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('without a full text does not open, and has no sign that it does', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, full: guideStory), item(2)])));
      expect(tile(2), findsOneWidget); // the fixture
      expect(chevronIn(tile(2)), findsNothing);
      await tester.ensureVisible(tile(2));
      await tester.tap(tile(2));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('the server decides: marked "no" with a text, or "yes" with a blank text, does not open', (tester) async {
      await showHome(
        tester,
        loaded(content(guide: [item(1, full: guideStory, tappable: false), item(2, full: '  ', tappable: true), item(3, full: guideStory)])),
      );
      expect(chevronIn(tile(3)), findsOneWidget); // the fixture: one that does open, beside the two that do not
      for (final id in [1, 2]) {
        expect(chevronIn(tile(id)), findsNothing, reason: 'tile $id');
        await tester.ensureVisible(tile(id));
        await tester.tap(tile(id));
        await tester.pumpAndSettle();
        expect(sheet(), findsNothing, reason: 'tile $id');
      }
    });

    testWidgets('the text is the server\'s: the code writes none', (tester) async {
      expect(AppContentDefaults.travelGuideItems.every((i) => i.fullText.isEmpty), isTrue); // the fixture
      await showHome(tester, loaded(content(guide: [item(1, full: guideStory)])));
      await open(tester, tile(1));
      expect(inSheet(find.text(guideStory)), findsOneWidget);
    });
  });

  group('a banner', () {
    const notice = 'More about the notice, written by the LGU.';

    testWidgets('with a full text opens a dialog with the server\'s text, and has the quiet sign', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, full: 'A tile that opens.'), item(2, style: 'banner', full: notice)])));
      expect(banner(2), findsOneWidget); // the fixture: the banner is on the screen
      expect(chevronIn(banner(2)), findsOneWidget);
      expect(find.descendant(of: banner(2), matching: find.byType(GestureDetector)), findsOneWidget); // and it is a button
      expect(sheet(), findsNothing); // the fixture: nothing is open yet
      await open(tester, banner(2));
      expect(sheet(), findsOneWidget);
      expect(find.byType(Dialog), findsOneWidget);
      expect(inSheet(find.text('Notice 2')), findsOneWidget);
      expect(inSheet(find.text(notice)), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('item-detail-close')));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('its dialog has NO short line, as the Travel Guide has none, and no gap for one', (tester) async {
      await showHome(tester, loaded(content(guide: [item(2, style: 'banner', full: notice)])));
      expect(find.descendant(of: banner(2), matching: find.text('About 2')), findsOneWidget); // the fixture: the banner shows its short text itself
      await open(tester, banner(2));
      expect(find.byKey(const ValueKey('item-detail-short')), findsNothing);
      expect(inSheet(find.text('About 2')), findsNothing);
      final column = tester.widget<Column>(find.ancestor(of: inSheet(find.text('Notice 2')), matching: find.byType(Column)).first);
      expect(column.children, hasLength(1));
    });

    testWidgets('without a full text does not open, and has no sign', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, full: 'A tile that opens.'), item(2, style: 'banner')])));
      expect(banner(2), findsOneWidget); // the fixture
      expect(chevronIn(tile(1)), findsOneWidget); // and a tile that opens is beside it
      expect(chevronIn(banner(2)), findsNothing);
      expect(find.descendant(of: banner(2), matching: find.byType(GestureDetector)), findsNothing); // not even a button for the screen reader
      await tester.ensureVisible(banner(2));
      await tester.tap(banner(2));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('the server decides: marked "no" with a text, or "yes" with a blank text, does not open', (tester) async {
      await showHome(
        tester,
        loaded(content(guide: [item(1, style: 'banner', full: notice, tappable: false), item(2, style: 'banner', full: '  ', tappable: true), item(3, style: 'banner', full: notice)])),
      );
      expect(chevronIn(banner(3)), findsOneWidget); // the fixture: one that does open, beside the two that do not
      for (final id in [1, 2]) {
        expect(chevronIn(banner(id)), findsNothing, reason: 'banner $id');
        await tester.ensureVisible(banner(id));
        await tester.tap(banner(id));
        await tester.pumpAndSettle();
        expect(sheet(), findsNothing, reason: 'banner $id');
      }
    });

    testWidgets('looks as it did: the same width as a banner without a full text, and the sign takes the place of nothing', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, style: 'banner'), item(2, style: 'banner', full: notice)])));
      final plain = tester.getRect(banner(1)), opens = tester.getRect(banner(2));
      expect(opens.width, plain.width); // wide, as before
      expect(opens.left, plain.left);
      expect(opens.height, plain.height); // and no taller: the sign sits in the row, taking nothing from the lines
    });
  });

  group('the detail is a dialog in the middle of the screen', () {
    const story = 'The whole story, written by the LGU.';

    // the visible box of the dialog (the Dialog widget itself fills the screen, to centre its box)
    Rect box(WidgetTester tester) => tester.getRect(find.descendant(of: find.byType(Dialog), matching: find.byType(Material)).first);

    Future<void> openFirstPillar(WidgetTester tester, {String full = story, double height = 1100}) async {
      await showHome(tester, loaded(content(why: [item(1, full: full), item(2)])), height: height);
      await open(tester, pillar(1));
    }

    testWidgets('is a dialog, not a bottom sheet', (tester) async {
      await openFirstPillar(tester);
      expect(find.byType(Dialog), findsOneWidget);
      expect(find.byType(BottomSheet), findsNothing);
      expect(inSheet(find.text(story)), findsOneWidget);
    });

    testWidgets('is in the middle, with a margin at the sides, and as tall as its content', (tester) async {
      await openFirstPillar(tester);
      final dialog = box(tester);
      expect((dialog.center.dx - 411 / 2).abs(), lessThan(1)); // the middle, sideways
      expect((dialog.center.dy - 1100 / 2).abs(), lessThan(1)); // and the middle, up and down
      expect(dialog.left, greaterThanOrEqualTo(20)); // a margin at each side
      expect(411 - dialog.right, greaterThanOrEqualTo(20));
      expect(dialog.height, lessThan(1100 * 0.4)); // a short text: the dialog is short, not a full-height page
      expect(dialog.top, greaterThan(100)); // and it does not sit at the bottom, where a sheet sits
      expect(dialog.bottom, lessThan(1100 - 100));
    });

    testWidgets('has rounded corners', (tester) async {
      await openFirstPillar(tester);
      final shape = tester.widget<Dialog>(find.byType(Dialog)).shape! as RoundedRectangleBorder;
      expect(shape.borderRadius, BorderRadius.circular(20));
    });

    testWidgets('keeps its icon, its title, the whole text and the X', (tester) async {
      await openFirstPillar(tester);
      expect(inSheet(find.text('Item 1')), findsOneWidget);
      expect(inSheet(find.byIcon(appContentIconFor('beach').icon)), findsOneWidget);
      expect(inSheet(find.text(story)), findsOneWidget);
      expect(find.byKey(const ValueKey('item-detail-close')), findsOneWidget);
    });

    testWidgets('closes with the X', (tester) async {
      await openFirstPillar(tester);
      await tester.tap(find.byKey(const ValueKey('item-detail-close')));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsNothing);
    });

    testWidgets('closes with a tap outside, and not with a tap inside', (tester) async {
      await openFirstPillar(tester);
      await tester.tap(find.text(story)); // inside: stays
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      await tester.tapAt(const Offset(5, 5)); // outside, on the dim background
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsNothing);
    });

    testWidgets('a long text: the dialog is no taller than 80% of the screen, and the text scrolls inside it', (tester) async {
      final lines = [for (var i = 1; i <= 150; i++) 'Line $i of the long story.'];
      await openFirstPillar(tester, full: lines.join('\n'), height: 1100);
      final dialog = box(tester);
      expect(dialog.height, lessThanOrEqualTo(1100 * 0.8 + 0.1));
      expect(dialog.height, greaterThan(1100 * 0.7)); // the fixture: the text really is longer than the dialog
      final scroller = find.byKey(const ValueKey('item-detail-text'));
      final text = find.descendant(of: scroller, matching: find.byType(Text));
      final before = tester.getTopLeft(text).dy;
      await tester.drag(scroller, const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(text).dy, lessThan(before));
      expect(tester.takeException(), isNull);
    });
  });

  group('the text of a pillar is not cut at the first line', () {
    // The tests draw every letter as a square of the font size (the test font), so these are just long enough for a second line in the narrow half of a row.
    const longTitle = 'Sand Bars Tide';
    const longShort = 'Clear blue waters here';
    const tileLongTitle = 'Cagbalete Island Sandbars And The Tidal Pools Of The East Coast';
    const tileLongShort = 'Pristine sand bars and clear shallow waters for swimming and for long walks';

    RenderParagraph paragraph(WidgetTester tester, String text) => tester.renderObject<RenderParagraph>(find.text(text));
    int linesOf(RenderParagraph one) {
      final boxes = one.getBoxesForSelection(TextSelection(baseOffset: 0, extentOffset: one.text.toPlainText().length));
      return boxes.map((box) => box.top.round()).toSet().length; // one top for each line
    }

    int lines(WidgetTester tester, String text) => linesOf(paragraph(tester, text));

    Map<String, Object?> pillarItem(int id, String title, String shortText) => {...item(id), 'title': title, 'short_text': shortText};

    testWidgets('a long title and a long short text go to a second line, whole', (tester) async {
      await showHome(tester, loaded(content(why: [pillarItem(1, longTitle, longShort), pillarItem(2, 'Short', 'Short too')])));
      expect(lines(tester, longTitle), 2);
      expect(paragraph(tester, longTitle).didExceedMaxLines, isFalse); // nothing is cut: no ellipsis
      expect(lines(tester, longShort), 2);
      expect(paragraph(tester, longShort).didExceedMaxLines, isFalse);
      // a short one stays on one line
      expect(lines(tester, 'Short'), 1);
      expect(lines(tester, 'Short too'), 1);
    });

    testWidgets('a text longer than two lines is cut only after the second', (tester) async {
      final hugeTitle = List.filled(14, 'sandbars').join(' ');
      final hugeShort = List.filled(14, 'shallows').join(' ');
      await showHome(tester, loaded(content(why: [pillarItem(1, hugeTitle, hugeShort), pillarItem(2, 'B', 'b')])));
      for (final text in [hugeTitle, hugeShort]) {
        expect(lines(tester, text), 2, reason: 'cut after the second line, not before');
        expect(paragraph(tester, text).didExceedMaxLines, isTrue, reason: 'and it is cut');
      }
    });

    testWidgets('two to a row, as before; the taller one makes its neighbour as tall, and nothing overlaps', (tester) async {
      await showHome(
        tester,
        loaded(content(why: [pillarItem(1, longTitle, longShort), pillarItem(2, 'Short', 'Short too'), pillarItem(3, longTitle, longShort), item(4), item(5), item(6)])),
      );
      final one = tester.getRect(pillar(1)), two = tester.getRect(pillar(2)), three = tester.getRect(pillar(3)), four = tester.getRect(pillar(4));
      expect(one.top, two.top); // two to a row
      expect(one.left, lessThan(two.left));
      expect(three.top, four.top);
      expect(three.top, greaterThan(one.top)); // the next row is below
      expect(one.height, two.height); // the short one grew to the height of the long one
      expect(three.height, four.height);
      expect(one.overlaps(two), isFalse);
      expect(three.overlaps(four), isFalse);
      expect(three.top, greaterThanOrEqualTo(one.bottom)); // the long row did not run into the next
      expect(one.height, greaterThan(tester.getRect(pillar(5)).height)); // the fixture: the long pillar IS taller than a plain one (pillar 5 is in a row of plain ones)
      expect(tester.takeException(), isNull);
    });

    testWidgets('the sign that it opens is small, so it takes little of the width of the text', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'A text.'), item(2)])));
      final sign = tester.widget<Icon>(chevronIn(pillar(1)));
      expect(sign.size, lessThanOrEqualTo(12));
    });

    testWidgets('a long title and short text of a tile of the Travel Guide are whole, and the tiles do not overlap', (tester) async {
      await showHome(
        tester,
        loaded(content(guide: [pillarItem(1, tileLongTitle, tileLongShort), pillarItem(2, 'Short', 'Short too')])),
      );
      expect(paragraph(tester, tileLongTitle).didExceedMaxLines, isFalse); // not cut at all
      expect(paragraph(tester, tileLongShort).didExceedMaxLines, isFalse);
      expect(lines(tester, tileLongTitle), greaterThanOrEqualTo(2)); // the fixture: they need more than one line, and they have them
      expect(lines(tester, tileLongShort), greaterThanOrEqualTo(2));
      final one = tester.getRect(tile(1)), two = tester.getRect(tile(2));
      expect(one.height, greaterThan(two.height)); // the box grew
      expect(one.bottom, lessThanOrEqualTo(two.top)); // and did not run into its neighbour
    });

    testWidgets('the sign on a tile is small as well', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, full: 'A text.')])));
      expect(tester.widget<Icon>(chevronIn(tile(1))).size, lessThanOrEqualTo(14));
    });
  });

  group('a pillar: the icon on top, the text under it with the whole width of the box', () {
    Rect rectOf(WidgetTester tester, Finder f) => tester.getRect(f);
    Finder iconOf(Finder card) => find.descendant(of: card, matching: find.byIcon(appContentIconFor('beach').icon));
    Finder textIn(Finder card, String text) => find.descendant(of: card, matching: find.text(text));

    testWidgets('the icon is above the title, and the title above the short text, all at the same left edge', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'A text.'), item(2)])));
      final icon = rectOf(tester, iconOf(pillar(1)));
      final title = rectOf(tester, textIn(pillar(1), 'Item 1'));
      final short = rectOf(tester, textIn(pillar(1), 'About 1'));
      expect(title.top, greaterThanOrEqualTo(icon.bottom)); // under the icon, not beside it
      expect(short.top, greaterThanOrEqualTo(title.bottom));
      expect(title.left, icon.left);
      expect(short.left, icon.left);
    });

    testWidgets('the text has the whole width of the box: a title that did not fit beside the icon is on ONE line', (tester) async {
      // In the test font every letter is a square of the font size: 11 letters of 11.5 need 126.5, and the text had 114.5 beside an icon and 138.5 under it.
      const wide = 'Sandy Caves';
      const wideShort = 'Cool blue wave';
      await showHome(tester, loaded(content(why: [{...item(1), 'title': wide, 'short_text': wideShort}, item(2)])));
      RenderParagraph paragraph(String text) => tester.renderObject<RenderParagraph>(find.text(text));
      int lines(RenderParagraph one) =>
          one.getBoxesForSelection(TextSelection(baseOffset: 0, extentOffset: one.text.toPlainText().length)).map((b) => b.top.round()).toSet().length;
      expect(lines(paragraph(wide)), 1);
      expect(lines(paragraph(wideShort)), 1);
      expect(paragraph(wide).didExceedMaxLines, isFalse);
    });

    testWidgets('the sign that it opens is at the top right, level with the icon', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'A text.'), item(2)])));
      final card = rectOf(tester, pillar(1));
      final icon = rectOf(tester, iconOf(pillar(1)));
      final sign = rectOf(tester, chevronIn(pillar(1)));
      expect(sign.left, greaterThan(icon.right)); // on the right
      expect(sign.top, greaterThanOrEqualTo(icon.top - 1)); // level with the icon, at the top
      expect(sign.bottom, lessThanOrEqualTo(icon.bottom + 1));
      expect(card.right - sign.right, lessThanOrEqualTo(14)); // near the edge
    });

    testWidgets('the box has room to breathe: at least 12 px between its edge and the icon', (tester) async {
      await showHome(tester, loaded(content(why: [item(1), item(2)])));
      final card = rectOf(tester, pillar(1));
      final icon = rectOf(tester, iconOf(pillar(1)));
      expect(icon.left - card.left, greaterThanOrEqualTo(12));
      expect(icon.top - card.top, greaterThanOrEqualTo(12));
    });

    testWidgets('still two to a row, the neighbours as tall as each other, a third row below', (tester) async {
      await showHome(tester, loaded(content(why: [{...item(1), 'title': 'A long title that needs the second line', 'short_text': 'x'}, item(2), item(3), item(4), item(5)])));
      final one = rectOf(tester, pillar(1)), two = rectOf(tester, pillar(2)), three = rectOf(tester, pillar(3)), four = rectOf(tester, pillar(4)), five = rectOf(tester, pillar(5));
      expect(one.top, two.top);
      expect(three.top, four.top);
      expect(three.top, greaterThanOrEqualTo(one.bottom));
      expect(five.left, one.left); // a last one alone is on the left half
      expect(one.height, two.height);
      expect(one.height, greaterThan(three.height)); // the fixture: the row with the long title IS taller
    });
  });

  group('the head of the dialog: icon box, title, short text, thin line, loose text', () {
    Future<void> openDirectly(WidgetTester tester, AppContentItem one, {bool withShort = true}) async {
      tester.view.physicalSize = const Size(411, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(onPressed: () => showItemDetail(context, one, withShortText: withShort), child: const Text('open')),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    AppContentItem built({String shortText = 'The short line.', String title = 'The title'}) =>
        AppContentItem(id: 9, icon: 'beach', title: title, shortText: shortText, fullText: 'The whole text of the item.', tappable: true);

    Finder titleIn(String title) => inSheet(find.text(title));
    Finder shortKey() => find.byKey(const ValueKey('item-detail-short'));

    testWidgets('the short text is right under the title, before the full text', (tester) async {
      await openDirectly(tester, built());
      final title = tester.getRect(titleIn('The title'));
      final short = tester.getRect(shortKey());
      final full = tester.getRect(inSheet(find.text('The whole text of the item.')));
      expect(inSheet(find.text('The short line.')), findsOneWidget);
      expect(short.top, greaterThanOrEqualTo(title.bottom));
      expect(short.top - title.bottom, lessThanOrEqualTo(8)); // right under it
      expect(short.left, title.left);
      expect(full.top, greaterThan(short.bottom)); // and the full text after it
    });

    testWidgets('it is the item\'s own short text, as the server sent it, through the whole path', (tester) async {
      const story = 'The full story of the pillar, from the LGU.';
      await showHome(
        tester,
        loaded(content(why: [{...item(1, full: story), 'short_text': 'Short words from the LGU'}, item(2)])),
      );
      await open(tester, pillar(1));
      expect(inSheet(find.text('Short words from the LGU')), findsOneWidget);
      expect(inSheet(find.text(story)), findsOneWidget);
    });

    testWidgets('with no short text there is no line and no gap for it', (tester) async {
      for (final blank in ['', '   ']) {
        await openDirectly(tester, built(shortText: blank));
        expect(shortKey(), findsNothing, reason: 'short text "$blank"');
        expect(inSheet(find.text('')), findsNothing, reason: 'no empty line');
        // the column that holds the title holds only the title: no space is left for the short line
        final column = tester.widget<Column>(find.ancestor(of: titleIn('The title'), matching: find.byType(Column)).first);
        expect(column.children, hasLength(1), reason: 'short text "$blank"');
        expect(inSheet(find.text('The whole text of the item.')), findsOneWidget); // the dialog itself is there
        await tester.tap(find.byKey(const ValueKey('item-detail-close')));
        await tester.pumpAndSettle();
      }
    });

    testWidgets('with a short text the column holds the title, the gap and the short line', (tester) async {
      await openDirectly(tester, built());
      final column = tester.widget<Column>(find.ancestor(of: titleIn('The title'), matching: find.byType(Column)).first);
      expect(column.children, hasLength(3)); // the fixture for the test above: the same column, with the line and the gap
    });

    testWidgets('a tile of the Travel Guide has NO short text in its dialog, even when it has one, and no gap for it', (tester) async {
      await showHome(tester, loaded(content(guide: [item(1, full: 'The whole guide.')])));
      expect(find.descendant(of: tile(1), matching: find.text('About 1')), findsOneWidget); // the fixture: the tile has a short text, and shows it
      await open(tester, tile(1));
      expect(sheet(), findsOneWidget);
      expect(shortKey(), findsNothing);
      expect(inSheet(find.text('About 1')), findsNothing);
      expect(inSheet(find.text('The whole guide.')), findsOneWidget);
      // the title goes straight to the line: the column of the title holds only the title, and the line comes 16 px under the icon box
      final column = tester.widget<Column>(find.ancestor(of: titleIn('Item 1'), matching: find.byType(Column)).first);
      expect(column.children, hasLength(1));
      final iconBox = tester.getRect(find.byKey(const ValueKey('item-detail-icon')));
      final line = tester.getRect(find.byKey(const ValueKey('item-detail-divider')));
      expect(line.top - iconBox.bottom, closeTo(16, 0.5));
    });

    testWidgets('a pillar of the Why Visit has its short text in its dialog (the same item, the other section)', (tester) async {
      await showHome(tester, loaded(content(why: [item(1, full: 'The whole story.')])));
      await open(tester, pillar(1));
      expect(inSheet(find.text('About 1')), findsOneWidget);
      expect(shortKey(), findsOneWidget);
    });

    testWidgets('the icon is in a box of its own colour at a low opacity, about 48 px, with round corners', (tester) async {
      await openDirectly(tester, built());
      final box = find.byKey(const ValueKey('item-detail-icon'));
      expect(tester.getSize(box), const Size(48, 48));
      final decoration = tester.widget<Container>(box).decoration! as BoxDecoration;
      final drawn = appContentIconFor('beach');
      expect(decoration.color, drawn.color.withValues(alpha: 0.1));
      expect(decoration.borderRadius, BorderRadius.circular(14));
      expect(find.descendant(of: box, matching: find.byIcon(drawn.icon)), findsOneWidget);
    });

    testWidgets('the title is larger and bolder than before, and the short text smaller and paler than the title', (tester) async {
      await openDirectly(tester, built());
      final title = tester.widget<Text>(titleIn('The title'));
      final short = tester.widget<Text>(shortKey());
      expect(title.style!.fontSize, greaterThanOrEqualTo(20));
      expect(title.style!.fontWeight, FontWeight.w900);
      expect(short.style!.fontSize, lessThan(title.style!.fontSize!));
      expect(short.style!.color, const Color(0xFF64748B));
      expect(title.style!.color, isNot(short.style!.color));
    });

    testWidgets('a thin line divides the head from the full text', (tester) async {
      await openDirectly(tester, built());
      final line = tester.getRect(find.byKey(const ValueKey('item-detail-divider')));
      final iconBox = tester.getRect(find.byKey(const ValueKey('item-detail-icon')));
      final full = tester.getRect(inSheet(find.text('The whole text of the item.')));
      expect(line.height, lessThanOrEqualTo(1));
      // it is a drawn line, thin, in a pale colour (not an empty space of the same height)
      final drawn = tester.widget<Divider>(find.byKey(const ValueKey('item-detail-divider')));
      expect(drawn.thickness, lessThanOrEqualTo(1));
      expect(drawn.color, const Color(0xFFE2E8F0));
      expect(line.top, greaterThanOrEqualTo(iconBox.bottom)); // under the head
      expect(full.top, greaterThan(line.bottom)); // and above the text
    });

    testWidgets('the full text has a line spacing of 1.45', (tester) async {
      await openDirectly(tester, built());
      final full = tester.widget<Text>(inSheet(find.text('The whole text of the item.')));
      expect(full.style!.height, 1.45);
    });

    testWidgets('the dialog has more room inside, the X stays at the top right, and the rounded corners and the 80% are kept', (tester) async {
      await openDirectly(tester, built());
      final dialog = tester.getRect(find.descendant(of: find.byType(Dialog), matching: find.byType(Material)).first);
      final iconBox = tester.getRect(find.byKey(const ValueKey('item-detail-icon')));
      final close = tester.getRect(find.byKey(const ValueKey('item-detail-close')));
      expect(iconBox.left - dialog.left, greaterThanOrEqualTo(20)); // room inside
      expect(iconBox.top - dialog.top, greaterThanOrEqualTo(20));
      expect(dialog.right - close.right, lessThanOrEqualTo(16)); // the X is at the right...
      expect(close.top - dialog.top, lessThanOrEqualTo(30)); // ...and at the top
      expect((tester.widget<Dialog>(find.byType(Dialog)).shape! as RoundedRectangleBorder).borderRadius, BorderRadius.circular(20));
      expect(dialog.height, lessThanOrEqualTo(1100 * 0.8 + 0.1));
    });
  });

  group('what the code writes is as it has always been', () {
    testWidgets('no appContent from the server: no pillar, no tile and no notice has a sign or opens', (tester) async {
      await showHome(tester, loaded(null, absent: true));
      final pillars = AppContentDefaults.whyVisitItems;
      final tiles = AppContentDefaults.travelGuideItems.where((i) => !i.isBanner);
      expect(pillars, isNotEmpty); // the fixtures
      expect(tiles, isNotEmpty);
      for (final one in pillars) {
        expect(pillar(one.id), findsOneWidget, reason: one.title);
        expect(chevronIn(pillar(one.id)), findsNothing, reason: one.title);
      }
      for (final one in tiles) {
        expect(tile(one.id), findsOneWidget, reason: one.title);
        expect(chevronIn(tile(one.id)), findsNothing, reason: one.title);
      }
      await tester.ensureVisible(pillar(pillars.first.id));
      await tester.tap(pillar(pillars.first.id));
      await tester.pumpAndSettle();
      expect(sheet(), findsNothing);
    });

    testWidgets('a server whose items have no full text: the same, pillar by pillar', (tester) async {
      await showHome(tester, loaded(content(why: [item(1), item(2)], guide: [item(3), item(4)])));
      for (final card in [pillar(1), pillar(2), tile(3), tile(4)]) {
        expect(card, findsOneWidget);
        expect(chevronIn(card), findsNothing);
      }
    });
  });
}
