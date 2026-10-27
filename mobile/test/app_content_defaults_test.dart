// The anti-drift test (9b). The texts the app has written in its own code (AppContentDefaults) must be EXACTLY the value the server sends for the seed
// (test/data/app_content_commit3.json). They are the Welcome and the Why Visit; the Travel Guide and the Port & Boat Guide join them in 9c.
// They were MOVED from the screen, so each text is in lib/ once, and the screen holds none of them.
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

void main() {
  final content = real();
  final blocks = content['blocks'] as Map<String, dynamic>;
  final why = (content['sections'] as Map<String, dynamic>)['why_visit'] as List;

  group('the code\'s texts are the seed', () {
    test('the Welcome and the Why Visit blocks', () {
      expect(blocks.keys, hasLength(4)); // the fixture: the real value was read
      expect(AppContentDefaults.welcomeTitle, blocks['welcome']['title']);
      expect(AppContentDefaults.welcomeSubtitle, blocks['welcome']['subtitle']);
      expect(AppContentDefaults.whyVisitTitle, blocks['why_visit']['title']);
      expect(AppContentDefaults.whyVisitSubtitle, blocks['why_visit']['subtitle']);
      expect(AppContentDefaults.whyVisitBody, blocks['why_visit']['body']);
    });

    test('the four pillars, one by one, in the same order', () {
      expect(why, hasLength(4)); // the fixture
      expect(AppContentDefaults.whyVisitItems, hasLength(why.length));
      for (var i = 0; i < why.length; i++) {
        final mine = AppContentDefaults.whyVisitItems[i];
        final theirs = why[i] as Map<String, dynamic>;
        expect(mine.title, theirs['title'], reason: 'pillar $i');
        expect(mine.shortText, theirs['short_text'], reason: 'pillar $i');
        expect(mine.icon, theirs['icon'], reason: 'pillar $i');
        expect(mine.isBanner, theirs['style'] == 'banner', reason: 'pillar $i');
        expect(mine.id, -(theirs['id'] as int), reason: 'pillar $i'); // never a server id
      }
    });

    test('they carry no `{...}` but `{name}`, so none is ever shown with one in it', () {
      final all = <String>[
        AppContentDefaults.welcomeTitle, AppContentDefaults.welcomeSubtitle, AppContentDefaults.whyVisitTitle, AppContentDefaults.whyVisitSubtitle,
        AppContentDefaults.whyVisitBody,
        for (final i in AppContentDefaults.whyVisitItems) ...[i.title, i.shortText],
      ];
      expect(all, hasLength(13)); // the fixture
      for (final text in all) {
        expect(RegExp(r'\{[^{}]*\}').allMatches(text.replaceAll('{name}', '')), isEmpty, reason: text);
      }
    });
  });

  group('each text is in lib/ once', () {
    test('every default is written exactly one time in lib/ (moved, not copied)', () {
      final source = libSource();
      final texts = <String>[
        AppContentDefaults.welcomeTitle, AppContentDefaults.welcomeSubtitle, AppContentDefaults.whyVisitTitle, AppContentDefaults.whyVisitSubtitle,
        AppContentDefaults.whyVisitBody,
        for (final i in AppContentDefaults.whyVisitItems) ...[i.title, i.shortText],
      ];
      expect(texts, hasLength(13)); // the fixture
      for (final text in texts) {
        expect(literal(text).allMatches(source).length, 1, reason: text);
      }
    });

    test('the screen has no copy of them: the greeting is no longer a literal', () {
      final screens = File('lib/screens/tourism_screens.dart').readAsStringSync();
      expect(screens, isNot(contains('Mabuhay, Explorer')));
      expect(screens, isNot(contains(r'Mabuhay, ${widget.profile.displayName}')));
      expect(screens, contains('AppContentDefaults.welcomeTitle')); // the fixture: it reads the default
      expect(screens, contains('AppContentDefaults.whyVisitItems'));
    });
  });
}
