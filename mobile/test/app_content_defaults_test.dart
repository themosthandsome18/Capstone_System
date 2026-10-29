// The anti-drift test. The texts the app has written in its own code (AppContentDefaults) must be EXACTLY the value the server sends for the seed
// (test/data/app_content_commit3.json): the Welcome, the Why Visit, the Travel Guide (the four tiles and the two notices) and the Port & Boat Guide.
// They were MOVED from the screens, so each text is in lib/ once, and the screens hold none of them.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

Map<String, dynamic> real() => jsonDecode(File('test/data/app_content_commit3.json').readAsStringSync()) as Map<String, dynamic>;

/// A text as a Dart single-quoted literal is written in a source file.
String literal(String text) => "'${text.replaceAll(r'\', r'\\').replaceAll("'", r"\'").replaceAll(r'$', r'\$').replaceAll('\n', r'\n')}'";

String libSource() => [
  for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) f.readAsStringSync().replaceAll('\r\n', '\n'),
].join('\n');

/// Every text the code writes, one by one.
List<String> everyDefault() => <String>[
  AppContentDefaults.welcomeTitle, AppContentDefaults.welcomeSubtitle, AppContentDefaults.whyVisitTitle, AppContentDefaults.whyVisitSubtitle,
  AppContentDefaults.whyVisitBody, AppContentDefaults.travelGuideTitle, AppContentDefaults.portGuideTitle,
  for (final i in [...AppContentDefaults.whyVisitItems, ...AppContentDefaults.travelGuideItems]) ...[i.title, i.shortText],
  ...AppContentDefaults.portGuideBullets,
];

void main() {
  final content = real();
  final blocks = content['blocks'] as Map<String, dynamic>;
  final sections = content['sections'] as Map<String, dynamic>;
  final why = sections['why_visit'] as List;
  final guide = sections['travel_guide'] as List;

  group('the code\'s texts are the seed', () {
    test('the four blocks', () {
      expect(blocks.keys, hasLength(4)); // the fixture: the real value was read
      expect(AppContentDefaults.welcomeTitle, blocks['welcome']['title']);
      expect(AppContentDefaults.welcomeSubtitle, blocks['welcome']['subtitle']);
      expect(AppContentDefaults.whyVisitTitle, blocks['why_visit']['title']);
      expect(AppContentDefaults.whyVisitSubtitle, blocks['why_visit']['subtitle']);
      expect(AppContentDefaults.whyVisitBody, blocks['why_visit']['body']);
      expect(AppContentDefaults.travelGuideTitle, blocks['travel_guide']['title']);
      expect(AppContentDefaults.portGuideTitle, blocks['port_guide']['title']);
    });

    test('the four lines of the Port & Boat Guide: the seed\'s, each with its bullet', () {
      final seed = (blocks['port_guide']['body'] as String).split('\n');
      expect(seed, hasLength(4)); // the fixture
      expect(AppContentDefaults.portGuideBullets, hasLength(4));
      for (var i = 0; i < seed.length; i++) {
        expect(AppContentDefaults.portGuideBullets[i], '• ${seed[i]}', reason: 'line $i');
      }
      expect(AppContentDefaults.portGuideLines, seed); // without the bullet, as the server sends them
    });

    test('the pillars and the Travel Guide items, one by one, in the same order', () {
      expect(why.length + guide.length, 10); // the fixture
      expect(AppContentDefaults.whyVisitItems, hasLength(why.length));
      expect(AppContentDefaults.travelGuideItems, hasLength(guide.length));
      for (final pair in [(AppContentDefaults.whyVisitItems, why), (AppContentDefaults.travelGuideItems, guide)]) {
        for (var i = 0; i < pair.$2.length; i++) {
          final mine = pair.$1[i];
          final theirs = pair.$2[i] as Map<String, dynamic>;
          expect(mine.title, theirs['title'], reason: 'item $i');
          expect(mine.shortText, theirs['short_text'], reason: 'item $i');
          expect(mine.icon, theirs['icon'], reason: 'item $i');
          expect(mine.isBanner, theirs['style'] == 'banner', reason: 'item $i');
          expect(mine.id, -(theirs['id'] as int), reason: 'item $i'); // the code's ids are negative: never a server id
        }
      }
      expect(AppContentDefaults.travelGuideItems.where((i) => i.isBanner), hasLength(2)); // the fixture: tiles AND notices
    });

    test('they carry no `{...}` but `{name}`, so none is ever shown with one in it', () {
      final all = everyDefault();
      expect(all.length, greaterThan(30)); // the fixture
      for (final text in all) {
        expect(RegExp(r'\{[^{}]*\}').allMatches(text.replaceAll('{name}', '')), isEmpty, reason: text);
      }
    });
  });

  group('each text is in lib/ once', () {
    test('every default is written exactly one time in lib/ (moved, not copied)', () {
      final source = libSource();
      final texts = everyDefault();
      expect(texts, hasLength(31)); // the fixture
      for (final text in texts) {
        expect(literal(text).allMatches(source).length, 1, reason: text);
      }
    });

    test('the screens have no copy of them: they read the defaults', () {
      final screens = File('lib/screens/tourism_screens.dart').readAsStringSync();
      expect(screens, isNot(contains('Mabuhay, Explorer')));
      expect(screens, isNot(contains(r'Mabuhay, ${widget.profile.displayName}')));
      for (final name in ['welcomeTitle', 'whyVisitItems', 'travelGuideItems', 'travelGuideTitle', 'portGuideTitle', 'portGuideLines']) {
        expect(screens, contains('AppContentDefaults.$name'), reason: name); // the fixture: each one is read
      }
      // no icon of the old hand-written tiles, notices or pillars is left in the screens
      expect(screens, isNot(contains('_buildGuideTile(\n          icon: Icons.')));
      expect(RegExp(r"InfoBanner\(\s*icon: Icons\.").hasMatch(screens), isFalse);
    });
  });
}
