// The model of `appContent` and the resolver (9a, no screen). Nothing here may throw, and EVERY PART IS DECIDED ON ITS OWN: a block that is missing sends only that
// block back to the code, a broken item is left out and not its section, a `{...}` left in a text sends that text back to the code.
// Every test that has a fixture asserts, inside the test, that the fixture reached the case it is for.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Map<String, dynamic> realContent() => jsonDecode(File('test/data/app_content_commit3.json').readAsStringSync()) as Map<String, dynamic>;

/// The real value with the texts of the server made different from the code's, so a test can tell where a text came from.
Map<String, dynamic> serverContent() {
  final content = realContent();
  for (final block in (content['blocks'] as Map<String, dynamic>).values) {
    for (final field in (block as Map<String, dynamic>).keys.toList()) {
      block[field] = 'SERVER ${block[field]}';
    }
  }
  return content;
}

Map<String, Object?> item(int id, {String title = 'T', String shortText = 'S', Object? icon = 'beach', Object? style = 'tile', Object? full, Object? tappable}) => {
  'id': id,
  'icon': icon,
  'title': title,
  'short_text': shortText,
  'full_text': full ?? '',
  'style': style,
  'tappable': ?tappable,
};

AppContent withItems(List<Object?> why, [List<Object?> guide = const []]) => AppContent.fromJson({
  'blocks': {},
  'sections': {'why_visit': why, 'travel_guide': guide},
});

const String codeWelcome = 'CODE hello, {name}!';
const List<String> codeLines = ['code line 1', 'code line 2', 'code line 3', 'code line 4'];
const List<AppContentItem> codeItems = [
  AppContentItem(id: -1, icon: 'beach', title: 'CODE one', shortText: 'code one'),
  AppContentItem(id: -2, icon: 'craft', title: 'CODE two', shortText: 'code two'),
  AppContentItem(id: -3, icon: 'boat', title: 'CODE three', shortText: 'code three'),
  AppContentItem(id: -4, icon: 'event', title: 'CODE banner', shortText: 'code banner', style: AppContentStyle.banner),
];

const List<AppContentItem> code = [
  AppContentItem(id: -1, icon: 'beach', title: 'CODE one', shortText: 'code one'),
  AppContentItem(id: -2, icon: 'craft', title: 'CODE two', shortText: 'code two'),
];

void main() {
  group('the model reads the real value', () {
    test('the four blocks and the two sections, the way the server sends them', () {
      final content = AppContent.fromJson(realContent());
      expect(content.blocks.keys, ['welcome', 'why_visit', 'travel_guide', 'port_guide']);
      expect(content.whyVisit, hasLength(4));
      expect(content.travelGuide, hasLength(6));
      expect(content.travelGuide.where((i) => i.isBanner), hasLength(2)); // the fixture: tiles AND banners
      expect(content.travelGuide.where((i) => !i.isBanner), hasLength(4));
      expect(content.whyVisit.map((i) => i.id), [1, 2, 3, 4]);
      expect(content.blocks['welcome']!.title, 'Mabuhay, {name}! 🌊');
      expect(content.blocks['welcome']!.body, isNull); // a field the server did not send is null
      expect(content.blocks['port_guide']!.body!.split('\n'), hasLength(4));
    });

    test('the full text and the "tappable" are read: the real content has none, and a text or a mark that the server sends is kept as it is', () {
      expect(AppContent.fromJson(realContent()).whyVisit.every((i) => !i.tappable && i.fullText.isEmpty), isTrue);
      final read = withItems([item(7, full: 'The whole story.', tappable: true), item(8, full: 'Has a text', tappable: 'yes'), item(9, tappable: false)]);
      expect(read.whyVisit, hasLength(3)); // the fixture
      expect(read.whyVisit[0].fullText, 'The whole story.');
      expect(read.whyVisit[0].tappable, isTrue);
      expect(read.whyVisit[1].tappable, isTrue, reason: 'not a bool: worked out from the full text');
      expect(read.whyVisit[2].tappable, isFalse);
    });

    test('it is in the bootstrap, and a bootstrap without it has AppContent.none', () {
      final map = bootstrapJson(3);
      expect(MobileBootstrap.fromJson(map).appContent, same(AppContent.none));
      map['appContent'] = realContent();
      final bootstrap = MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>);
      expect(bootstrap.appContent.whyVisit, hasLength(4));
      expect(bootstrap.appContent, isNot(same(AppContent.none)));
      expect(MobileBootstrap.fallback().appContent, same(AppContent.none));
    });
  });

  group('it never throws, and takes only the right kind', () {
    test('a value of any odd shape is read as nothing', () {
      final odd = <Object?>[
        null, 'text', 5, 5.5, true, [], [1, 2], [null], {}, {'x': 1},
        {'blocks': null, 'sections': null},
        {'blocks': 5, 'sections': 'x'},
        {'blocks': [], 'sections': []},
        {'blocks': {'welcome': 'not a map'}, 'sections': {'why_visit': 'nope', 'travel_guide': 7}},
        {'blocks': {}, 'sections': {'why_visit': [1, null, 'x', {}], 'travel_guide': [{'id': 'a', 'tappable': 'yes'}]}},
        {'appContent': {'appContent': {'appContent': 1}}},
        {'blocks': {1: {'title': 'x'}}, 'sections': {}},
      ];
      var reached = 0;
      for (final shape in odd) {
        final content = AppContent.fromJson(shape);
        reached++;
        expect(content.whyVisit, isEmpty, reason: '$shape');
        expect(content.travelGuide, isEmpty, reason: '$shape');
        expect(content.blocks.values.every((b) => b.title == null && b.body == null && b.subtitle == null), isTrue, reason: '$shape');
      }
      expect(reached, odd.length); // the fixture: every shape was read
    });

    test('a block that is not a map is not a block, and a field that is not a text is not there', () {
      final content = AppContent.fromJson({
        'blocks': {
          'welcome': 'nope',
          'why_visit': {'title': 5, 'subtitle': '   ', 'body': ['x']},
          'travel_guide': {'title': 'Good'},
        },
        'sections': {},
      });
      expect(content.blocks.keys, ['why_visit', 'travel_guide']);
      expect(content.blocks['why_visit']!.title, isNull);
      expect(content.blocks['why_visit']!.subtitle, isNull);
      expect(content.blocks['why_visit']!.body, isNull);
      expect(content.blocks['travel_guide']!.title, 'Good');
    });

    test('a broken item is left out and the rest of the section stays, in the server\'s order', () {
      final content = withItems([
        item(1, title: 'first'),
        'not a map',
        item(2, title: '   '), // no title
        item(3, shortText: ''), // no short text
        {'id': '4', 'title': 'x', 'short_text': 'x'}, // the id is not a whole number
        {'id': 5.5, 'title': 'x', 'short_text': 'x'},
        item(6, title: 'sixth'),
        item(1, title: 'a second item with id 1'), // a repeated id
        null,
      ]);
      expect(content.whyVisit.map((i) => i.title), ['first', 'sixth']);
      expect(content.whyVisit.map((i) => i.id), [1, 6]);
    });

    test('a missing, odd or unknown icon does not break an item; an unknown style is a tile', () {
      final content = withItems([item(1, icon: 'rocket'), item(2, icon: 5), item(3, icon: null), item(4, style: 'huge'), item(5, style: 'banner')]);
      expect(content.whyVisit, hasLength(5)); // the fixture: nothing was left out
      expect(content.whyVisit[0].icon, 'rocket'); // kept as the server wrote it
      expect(content.whyVisit[1].icon, 'info');
      expect(content.whyVisit[2].icon, 'info');
      expect(content.whyVisit[3].isBanner, isFalse);
      expect(content.whyVisit[4].isBanner, isTrue);
    });
  });

  group('contentOr: the text of the server, or the text of the code', () {
    test('a text the app can show is the server\'s', () {
      expect(contentOr('From the server', 'From the code'), 'From the server');
    });

    test('nothing, a blank, or a thing that is not a string is the code\'s', () {
      final nothing = <Object?>[null, '', '   ', '\n', 5, true, ['x'], {'a': 1}];
      for (final value in nothing) {
        expect(contentOr(value, 'From the code'), 'From the code', reason: '$value');
      }
      expect(nothing, hasLength(8));
    });

    test('`{name}` is put in, every time it is there', () {
      expect(contentOr('Mabuhay, {name}! (yes, {name})', 'code', name: 'Ana'), 'Mabuhay, Ana! (yes, Ana)');
    });

    test('a `{...}` left after `{name}` sends the text back to the code', () {
      for (final left in ['Pay at {fee_office}', 'A {fee_regular} fee', 'Hi {name}, {other}', '{}', 'x {a b} y']) {
        expect(contentOr(left, 'From the code', name: 'Ana'), 'From the code', reason: left);
      }
    });

    test('`{name}` with no name to put in is the code\'s text', () {
      expect(contentOr('Hello {name}', 'From the code'), 'From the code');
    });

    test('a visitor called `{x}` or `{name}` does not make the text unusable, and the name is not read again', () {
      expect(contentOr('Hi {name}', 'code', name: '{x}'), 'Hi {x}');
      expect(contentOr('Hi {name}', 'code', name: '{name}'), 'Hi {name}');
    });

    test('the code\'s own text also gets the name; with no name it is the Explorer', () {
      expect(contentOr(null, codeWelcome, name: 'Ana'), 'CODE hello, Ana!');
      expect(contentOr(null, codeWelcome), 'CODE hello, Explorer!');
      expect(visitorName(isGuest: true, displayName: 'Mauban Tourism'), 'Explorer');
      expect(visitorName(isGuest: false, displayName: 'Ana Cruz'), 'Ana Cruz');
      expect(visitorName(isGuest: false, displayName: '  '), 'Explorer');
    });
  });

  group('every part is decided on its own', () {
    test('a block that is missing sends only that block back to the code', () {
      final map = serverContent();
      (map['blocks'] as Map).remove('why_visit');
      final content = AppContent.fromJson(map);
      expect(content.blocks.containsKey('why_visit'), isFalse); // the fixture: the block really is missing
      expect(content.text('why_visit', 'title', 'CODE title'), 'CODE title');
      expect(content.text('why_visit', 'body', 'CODE body'), 'CODE body');
      // the other three blocks are still the server's
      expect(content.text('welcome', 'title', codeWelcome, name: 'Ana'), 'SERVER Mabuhay, Ana! 🌊');
      expect(content.text('travel_guide', 'title', 'CODE title'), 'SERVER ${realContent()['blocks']['travel_guide']['title']}');
      expect(content.text('port_guide', 'title', 'CODE title'), startsWith('SERVER '));
      expect(content.lines('port_guide', codeLines).first, startsWith('SERVER '));
    });

    test('every block missing in turn: only that one is the code\'s', () {
      const keys = ['welcome', 'why_visit', 'travel_guide', 'port_guide'];
      for (final missing in keys) {
        final map = serverContent();
        (map['blocks'] as Map).remove(missing);
        final content = AppContent.fromJson(map);
        for (final key in keys) {
          final title = content.text(key, 'title', 'CODE', name: 'Ana');
          expect(title, key == missing ? 'CODE' : startsWith('SERVER '), reason: '$missing missing, asked $key');
        }
      }
    });

    test('a field that is blank sends only that field back to the code', () {
      final map = serverContent();
      ((map['blocks'] as Map)['why_visit'] as Map)['subtitle'] = '   ';
      final content = AppContent.fromJson(map);
      expect(content.blocks['why_visit']!.subtitle, isNull); // the fixture
      expect(content.text('why_visit', 'subtitle', 'CODE sub'), 'CODE sub');
      expect(content.text('why_visit', 'title', 'CODE title'), startsWith('SERVER '));
      expect(content.text('why_visit', 'body', 'CODE body'), startsWith('SERVER '));
    });

    test('a field the block does not have, or a block the server does not know, is the code\'s', () {
      final content = AppContent.fromJson(serverContent());
      expect(content.text('welcome', 'body', 'CODE'), 'CODE'); // the welcome has no body
      expect(content.text('welcome', 'title', 'CODE', name: 'Ana'), startsWith('SERVER ')); // the fixture: the block has a title it could have given
      expect(content.text('welcome', 'colour', 'CODE', name: 'Ana'), 'CODE');
      expect(content.text('nothing_like_it', 'title', 'CODE'), 'CODE');
      expect(AppContent.none.text('welcome', 'title', 'CODE'), 'CODE');
    });

    test('a title with a `{...}` left in it is the code\'s, and the subtitle beside it is still the server\'s', () {
      final map = serverContent();
      ((map['blocks'] as Map)['why_visit'] as Map)['title'] = 'Pay at {fee_office}';
      final content = AppContent.fromJson(map);
      expect(content.blocks['why_visit']!.title, 'Pay at {fee_office}'); // the fixture: it did get here
      expect(content.text('why_visit', 'title', 'CODE'), 'CODE');
      expect(content.text('why_visit', 'subtitle', 'CODE'), startsWith('SERVER '));
    });
  });

  group('the lines of the Port & Boat Guide', () {
    AppContent port(Object? body) => AppContent.fromJson({'blocks': {'port_guide': {'title': 'T', 'body': body}}, 'sections': {}});
    const fromCode = ['code 1', 'code 2'];

    test('the four lines of the real value, in order, are the server\'s', () {
      final lines = AppContent.fromJson(realContent()).lines('port_guide', codeLines);
      expect(lines, hasLength(4));
      expect(lines, (realContent()['blocks']['port_guide']['body'] as String).split('\n')); // the seed's four lines, as written
      expect(lines, isNot(codeLines)); // the fixture: they are the server's, not the code's
    });

    test('lines are trimmed and a blank line is dropped; three lines are shown as three', () {
      final lines = port('  one \n\n two\r\n   \nthree').lines('port_guide', fromCode);
      expect(lines, ['one', 'two', 'three']);
      expect(lines, hasLength(3));
    });

    test('no body, a blank body, or a body that is not a text is the code\'s', () {
      for (final body in [null, '', ' \n \n ', 5, ['x']]) {
        expect(port(body).lines('port_guide', fromCode), fromCode, reason: '$body');
      }
      expect(AppContent.none.lines('port_guide', fromCode), fromCode);
    });

    test('one line with a `{...}` left in it sends the WHOLE body back to the code', () {
      final lines = port('fine one\nPay at {fee_office}\nfine three').lines('port_guide', fromCode);
      expect(lines, fromCode);
      expect(port('fine one\nfine two').lines('port_guide', fromCode), ['fine one', 'fine two']); // the same without it: the server's
    });

    test('a long body is shown whole', () {
      final long = List.filled(8, 'x' * 180).join('\n');
      expect(long.length, greaterThan(1400)); // the fixture: a long body
      expect(port(long).lines('port_guide', fromCode), hasLength(8));
    });

    test('`{name}` in a line is put in', () {
      expect(port('Hi {name}').lines('port_guide', fromCode, name: 'Ana'), ['Hi Ana']);
    });
  });

  group('the items of a section', () {
    test('the server\'s items are shown in the server\'s order, whatever the code has', () {
      final shown = withItems([item(5, title: 'five'), item(2, title: 'two')]).whyVisitItems(code);
      expect(shown.map((i) => i.title), ['five', 'two']);
    });

    test('a broken item is left out and not its section', () {
      final shown = withItems([item(1, title: 'good one'), item(2, title: ''), item(3, title: 'good three')]).whyVisitItems(code);
      expect(shown.map((i) => i.title), ['good one', 'good three']);
    });

    test('[] is "nothing published": the code\'s items', () {
      final content = withItems([]);
      expect(content.whyVisit, isEmpty); // the fixture
      expect(content.whyVisitItems(code), same(code));
      expect(content.travelGuideItems(code), same(code));
      expect(AppContent.none.whyVisitItems(code), same(code));
    });

    test('a section with nothing but broken items is the code\'s items too', () {
      final content = withItems([item(1, title: ''), 'x', null, item(2, shortText: '')]);
      expect(content.whyVisit, isEmpty); // the fixture: all four were broken
      expect(content.whyVisitItems(code), same(code));
    });

    test('an item with a `{...}` in its title or short text is left out; the others stay', () {
      final shown = withItems([
        item(1, title: 'Pay at {fee_office}'),
        item(2, shortText: 'Fee {fee_regular}'),
        item(3, title: 'fine'),
      ]).whyVisitItems(code);
      expect(shown.map((i) => i.id), [3]);
    });

    test('if every item has a `{...}` left, the code\'s items are shown', () {
      final content = withItems([item(1, title: '{fee_office}')]);
      expect(content.whyVisit, hasLength(1)); // the fixture: the item was read
      expect(content.whyVisitItems(code), same(code));
    });

    test('`{name}` in a title or short text is put in', () {
      final shown = withItems([item(1, title: 'Hello {name}', shortText: 'for {name}')]).whyVisitItems(code, name: 'Ana');
      expect(shown.single.title, 'Hello Ana');
      expect(shown.single.shortText, 'for Ana');
      expect(withItems([item(1, title: 'Hello {name}')]).whyVisitItems(code), same(code)); // no name: it cannot be shown
    });

    test('a full text that cannot be finished takes away the detail, not the item', () {
      final shown = withItems([item(1, full: 'See {fee_office}', tappable: true)]).whyVisitItems(code);
      expect(shown, hasLength(1));
      expect(shown.single.fullText, '');
      expect(shown.single.tappable, isFalse);
      final fine = withItems([item(1, full: 'All of it', tappable: true)]).whyVisitItems(code);
      expect(fine.single.fullText, 'All of it');
      expect(fine.single.tappable, isTrue);
    });

    test('the Travel Guide keeps its tiles and its banners in one list, and a section with only tiles has no banner', () {
      final all = AppContent.fromJson(realContent()).travelGuideItems(codeItems);
      expect(all.where((i) => i.isBanner), hasLength(2));
      final onlyTiles = withItems([], [item(1), item(2)]).travelGuideItems(codeItems);
      expect(onlyTiles, hasLength(2)); // the fixture: the server's two tiles, not the code's four
      expect(onlyTiles.any((i) => i.isBanner), isFalse);
    });
  });

  group('the icons', () {
    test('the 11 names are the 11 the server knows', () {
      final models = File('../backend/api/models.py').readAsStringSync();
      final block = RegExp(r'ICON_NAMES = \[([^\]]*)\]').firstMatch(models)!.group(1)!;
      final names = RegExp(r'"([a-z]+)"').allMatches(block).map((m) => m.group(1)!).toList();
      expect(names, hasLength(11)); // the fixture: the server's list was read
      expect(appContentIcons.keys.toList()..sort(), (List<String>.of(names))..sort());
    });

    test('each known name is its own picture and colour, as the code draws it', () {
      const expected = {
        'beach': [Icons.beach_access, 0xFF0284C7],
        'craft': [Icons.workspace_premium, 0xFFD97706],
        'waterfall': [Icons.water_drop, 0xFF059669],
        'food': [Icons.restaurant_menu, 0xFFDC2626],
        'boat': [Icons.directions_boat_outlined, 0xFF0284C7],
        'festival': [Icons.festival_outlined, 0xFFD97706],
        'receipt': [Icons.receipt_long_outlined, 0xFF059669],
        'waste': [Icons.delete_outline, 0xFF7C3AED],
      };
      for (final entry in expected.entries) {
        final drawn = appContentIconFor(entry.key);
        expect(drawn.icon, entry.value[0], reason: entry.key);
        expect(drawn.color.toARGB32(), entry.value[1], reason: entry.key);
      }
      expect(expected, hasLength(8));
      expect(appContentIconFor('event').icon, Icons.event_available_outlined);
      expect(appContentIconFor('eco').icon, Icons.eco_outlined);
    });

    test('a name the app does not know is the neutral info, and the item stays', () {
      for (final unknown in <Object?>['rocket', '', 'BEACH', null, 5, true]) {
        final drawn = appContentIconFor(unknown);
        expect(drawn.icon, Icons.info_outline, reason: '$unknown');
        expect(drawn.color.toARGB32(), 0xFF64748B, reason: '$unknown');
        expect(identical(drawn, appContentIcons['info']), isTrue);
      }
      final shown = withItems([item(1, icon: 'rocket', title: 'Still here')]).whyVisitItems(code);
      expect(shown.single.title, 'Still here'); // not dropped
      expect(appContentIconFor(shown.single.icon).icon, Icons.info_outline);
    });
  });
}
