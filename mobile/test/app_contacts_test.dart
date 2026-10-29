// The model of `emergencyContacts`, its resolver, the map of the twelve icons, and the four hotlines written in the code (AppContentDefaults.hotlines).
// Nothing here may throw, and EVERY ENTRY IS DECIDED ON ITS OWN: a broken entry is left out and not the whole list. The server's list REPLACES the written four; the
// written four are only what is shown when there is nothing to show. Every test that has a fixture asserts, inside the test, that the fixture reached the case it is for.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Map<String, Object?> contact(int id, {Object? name = 'A name', Object? numbers = '0000', Object? email = '', Object? description = '', Object? icon = 'other'}) => {
  'id': id,
  'name': name,
  'contact_numbers': numbers,
  'email': email,
  'description': description,
  'icon': icon,
};

String read(String path) => File(path).readAsStringSync().replaceAll('\r\n', '\n');

double luminance(Color c) {
  double lin(double v) => v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

double contrastOnWhite(Color c) => 1.05 / (luminance(c) + 0.05);

const expectedIcons = {
  'rescue': Icons.local_hospital_outlined,
  'police': Icons.local_police_outlined,
  'coast_guard': Icons.directions_boat_outlined,
  'fire': Icons.local_fire_department_outlined,
  'hospital': Icons.medical_services_outlined,
  'ambulance': Icons.emergency_outlined,
  'help_desk': Icons.support_agent_outlined,
  'lgu_office': Icons.account_balance_outlined,
  'power': Icons.bolt_outlined,
  'water': Icons.water_drop_outlined,
  'port': Icons.anchor_outlined,
  'other': Icons.phone_outlined,
};
const iconIdentifiers = {
  'rescue': 'local_hospital_outlined',
  'police': 'local_police_outlined',
  'coast_guard': 'directions_boat_outlined',
  'fire': 'local_fire_department_outlined',
  'hospital': 'medical_services_outlined',
  'ambulance': 'emergency_outlined',
  'help_desk': 'support_agent_outlined',
  'lgu_office': 'account_balance_outlined',
  'power': 'bolt_outlined',
  'water': 'water_drop_outlined',
  'port': 'anchor_outlined',
  'other': 'phone_outlined',
};

String hex(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase()}';

void main() {
  group('the model reads the server\'s list', () {
    test('a good entry, with every field', () {
      final contacts = AppContacts.fromJson([contact(7, name: 'Desk', numbers: '111 / 222', email: 'a@b.c', description: 'Open daily', icon: 'help_desk')]);
      expect(contacts.items, hasLength(1)); // the fixture
      final one = contacts.items.single;
      expect(one.id, 7);
      expect(one.name, 'Desk');
      expect(one.numbers, '111 / 222'); // whole, as written: the slash is not split
      expect(one.email, 'a@b.c');
      expect(one.description, 'Open daily');
      expect(one.icon, 'help_desk');
    });

    test('the email and the description are SEPARATE fields and empty ones stay empty', () {
      final one = AppContacts.fromJson([contact(1, email: '', description: '')]).items.single;
      expect(one.email, '');
      expect(one.description, '');
      final blanks = AppContacts.fromJson([contact(1, email: '   ', description: '\n ')]).items.single;
      expect(blanks.email, '');
      expect(blanks.description, '');
      final odd = AppContacts.fromJson([contact(1, email: 5, description: ['x'])]).items.single;
      expect(odd.email, '');
      expect(odd.description, '');
      // the numbers never take the email in: the number text is exactly what was sent
      expect(AppContacts.fromJson([contact(1, numbers: '(042) 784-0555', email: 'x@y.z')]).items.single.numbers, '(042) 784-0555');
    });

    test('the text is trimmed, and the server\'s order is kept (no sorting)', () {
      final contacts = AppContacts.fromJson([contact(9, name: ' Z first '), contact(2, name: 'A second'), contact(5, name: 'M third')]);
      expect(contacts.items.map((c) => c.id), [9, 2, 5]);
      expect(contacts.items.first.name, 'Z first');
    });

    test('a missing, odd or unknown icon is NOT a broken entry: it is "other"', () {
      final contacts = AppContacts.fromJson([
        contact(1, icon: 'siren'), contact(2, icon: null), contact(3, icon: 5), contact(4, icon: ''), contact(5, icon: 'RESCUE'),
        {'id': 6, 'name': 'No icon key', 'contact_numbers': '1'},
      ]);
      expect(contacts.items, hasLength(6)); // the fixture: nothing was left out
      expect(contacts.items.map((c) => c.icon), ['siren', 'other', 'other', 'other', 'RESCUE', 'other']);
      expect(contacts.items.map((c) => appContactIconFor(c.icon).icon), everyElement(Icons.phone_outlined));
    });
  });

  group('it never throws, and takes only the right kind', () {
    test('anything that is not a list is nothing', () {
      var reached = 0;
      for (final shape in <Object?>[null, 'text', 5, 5.5, true, {}, {'x': 1}, {'items': []}]) {
        expect(AppContacts.fromJson(shape), same(AppContacts.none), reason: '$shape');
        reached++;
      }
      expect(reached, 8); // the fixture
    });

    test('a broken entry is left out, and the good ones stay, in the server\'s order', () {
      final contacts = AppContacts.fromJson([
        contact(1, name: 'First good'),
        'not a map', null, 5, [],
        contact(2, name: ''),
        contact(3, name: '   '),
        contact(4, name: 7),
        contact(5, numbers: ''),
        contact(6, numbers: '  '),
        contact(7, numbers: ['1']),
        {'id': '8', 'name': 'x', 'contact_numbers': '1'},
        {'id': 9.5, 'name': 'x', 'contact_numbers': '1'},
        {'name': 'no id', 'contact_numbers': '1'},
        {'id': 10, 'contact_numbers': '1'},
        {'id': 11, 'name': 'no numbers'},
        contact(12, name: 'Last good'),
      ]);
      expect(contacts.items.map((c) => c.name), ['First good', 'Last good']);
      expect(contacts.items.map((c) => c.id), [1, 12]);
    });

    test('a repeated id is left out (the later one)', () {
      final contacts = AppContacts.fromJson([contact(1, name: 'Kept'), contact(1, name: 'Same id again'), contact(2, name: 'Other')]);
      expect(contacts.items.map((c) => c.name), ['Kept', 'Other']);
    });

    test('a list where every entry is broken is nothing', () {
      final broken = [null, 'x', contact(1, name: ''), contact(2, numbers: '')];
      expect(AppContacts.fromJson(broken), same(AppContacts.none));
      expect(AppContacts.fromJson([]), same(AppContacts.none)); // the fixture: and the empty list as well
    });

    test('a very long list is read whole', () {
      final contacts = AppContacts.fromJson([for (var i = 1; i <= 200; i++) contact(i, name: 'Contact $i')]);
      expect(contacts.items, hasLength(200));
      expect(contacts.items.last.name, 'Contact 200');
    });
  });

  group('the bootstrap carries it', () {
    test('a bootstrap without the key has AppContacts.none; with it, the contacts', () {
      final map = bootstrapJson(1);
      expect(MobileBootstrap.fromJson(map).emergencyContacts, same(AppContacts.none));
      map['emergencyContacts'] = [contact(3, name: 'In the bootstrap')];
      final bootstrap = MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>);
      expect(bootstrap.emergencyContacts.items.single.name, 'In the bootstrap');
      expect(MobileBootstrap.fallback().emergencyContacts, same(AppContacts.none));
      expect(TourismBootstrapState.loaded(bootstrap).emergencyContacts.items, hasLength(1));
      expect(const TourismBootstrapState.loading().emergencyContacts, same(AppContacts.none));
      expect(TourismBootstrapState.failed(const SocketException('no'), BootstrapFailureKind.network).emergencyContacts, same(AppContacts.none));
    });

    test('a key of any odd shape is read as nothing, and nothing else of the bootstrap is touched', () {
      for (final odd in <Object?>[null, 'text', 5, [], [1, 2], [null], {}, {'name': 'x'}]) {
        final map = bootstrapJson(2);
        map['emergencyContacts'] = odd;
        final bootstrap = MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>);
        expect(bootstrap.emergencyContacts.items, isEmpty, reason: '$odd');
        expect(bootstrap.destinations, hasLength(2), reason: '$odd');
      }
    });
  });

  group('the resolver: the server\'s list replaces the written four', () {
    final written = AppContentDefaults.hotlines;

    test('the server failed, or has not answered: the written four', () {
      expect(written, hasLength(4)); // the fixture
      expect(const TourismBootstrapState.loading().emergencyContacts.resolve(written), same(written));
      expect(TourismBootstrapState.failed(TimeoutException('too slow'), BootstrapFailureKind.timeout).emergencyContacts.resolve(written), same(written));
    });

    test('the key is missing (an older server, an older saved copy): the written four', () {
      expect(MobileBootstrap.fromJson(bootstrapJson(1)).emergencyContacts.resolve(written), same(written));
    });

    test('the key is there but the list is empty: the written four', () {
      expect(AppContacts.fromJson(<Object?>[]).resolve(written), same(written));
    });

    test('an entry is broken: the good ones; and when all are broken: the written four', () {
      final some = AppContacts.fromJson([contact(1, name: 'Good'), contact(2, name: '')]).resolve(written);
      expect(some.map((c) => c.name), ['Good']);
      expect(AppContacts.fromJson([contact(2, name: ''), 'x']).resolve(written), same(written));
    });

    test('ONE good entry is ONE contact: the written four are not added to it', () {
      final one = AppContacts.fromJson([contact(1, name: 'The only active one')]).resolve(written);
      expect(one, hasLength(1));
      expect(one.single.name, 'The only active one');
      expect(one.map((c) => c.name), isNot(contains(written.first.name)));
    });

    test('several: exactly the server\'s, in its order; and the result is never empty while the code has contacts', () {
      final many = AppContacts.fromJson([for (var i = 1; i <= 5; i++) contact(i, name: 'C$i')]).resolve(written);
      expect(many.map((c) => c.name), ['C1', 'C2', 'C3', 'C4', 'C5']);
      for (final shape in <Object?>[null, 'x', [], [null], [contact(1, name: '')]]) {
        expect(AppContacts.fromJson(shape).resolve(written), isNotEmpty, reason: '$shape');
      }
    });
  });

  group('the twelve icons', () {
    test('the app\'s map has the twelve names, each with its picture, as the doc says', () {
      expect(appContactIcons.keys.toList(), expectedIcons.keys.toList());
      expectedIcons.forEach((name, icon) => expect(appContactIcons[name]!.icon, icon, reason: name));
    });

    test('a name the app does not know, or no name, is "other", and the contact stays', () {
      for (final unknown in <Object?>['siren', '', 'RESCUE', 'help desk', null, 5, true, []]) {
        final drawn = appContactIconFor(unknown);
        expect(drawn.icon, Icons.phone_outlined, reason: '$unknown');
        expect(identical(drawn, appContactIcons['other']), isTrue, reason: '$unknown');
      }
    });

    test('the four colours the app has today are the same, and only help_desk follows the theme', () {
      expect(appContactIcons['rescue']!.color, const Color(0xFFEF4444));
      expect(appContactIcons['police']!.color, const Color(0xFF2563EB));
      expect(appContactIcons['coast_guard']!.color, const Color(0xFF0D9488));
      expect(appContactIcons['help_desk']!.color, isNull);
      expect(appContactIcons.entries.where((e) => e.value.color == null).map((e) => e.key), ['help_desk']);
    });

    test('the doc, the backend choices and the web module list the same twelve names, in the same order as the app', () {
      final doc = read('../docs/MOBILE_CONTACT_ICONS.md');
      final rows = RegExp(r'^\| `(\w+)` \| `Icons\.(\w+)` \| (.+?) \| .*\|$', multiLine: true).allMatches(doc).toList();
      expect(rows, hasLength(12)); // the fixture: the table was read
      expect(rows.map((m) => m.group(1)), appContactIcons.keys);
      for (final row in rows) {
        expect(row.group(2), iconIdentifiers[row.group(1)], reason: 'the Material icon of ${row.group(1)}');
      }
      final models = read('../backend/api/models.py');
      final block = RegExp(r'ICON_CHOICES = \[(.*?)\n    \]', dotAll: true).firstMatch(models)!.group(1)!;
      final backend = RegExp(r'\(ICON_\w+, "[^"]+"\)').allMatches(block).length;
      expect(backend, 12); // the fixture
      final constants = {for (final m in RegExp(r'ICON_(\w+) = "(\w+)"').allMatches(models.substring(models.indexOf('class EmergencyContact(')))) m.group(1)!: m.group(2)!};
      final names = [for (final m in RegExp(r'\(ICON_(\w+), "[^"]+"\)').allMatches(block)) constants[m.group(1)]!];
      expect(names, appContactIcons.keys.toList());
      final web = read('../frontend/src/tourism/utils/contactIcons.js');
      final webNames = [for (final m in RegExp(r'\{ name: "(\w+)"|\{ name: FALLBACK_ICON').allMatches(web)) m.group(1) ?? 'other'];
      expect(webNames, appContactIcons.keys.toList());
    });

    test('the doc\'s colours are the app\'s: the colour of the picture, and nothing else', () {
      final doc = read('../docs/MOBILE_CONTACT_ICONS.md');
      final rows = RegExp(r'^\| `(\w+)` \| `Icons\.\w+` \| (.+?) \| .*\|$', multiLine: true).allMatches(doc).toList();
      expect(rows, hasLength(12)); // the fixture
      for (final row in rows) {
        final name = row.group(1)!;
        final drawn = appContactIcons[name]!;
        final cell = row.group(2)!;
        if (drawn.color == null) {
          expect(cell, contains('theme'), reason: name);
        } else {
          expect(cell, contains('(`0xFF${hex(drawn.color!).substring(1)}`)'), reason: '$name picture');
        }
      }
      // the doc has no second colour any more: the text is neutral
      expect(doc, isNot(contains('Text colour')));
    });

    test('the web draws the same picture colours: each token in Tourism_index.css is the app\'s colour', () {
      final css = read('../frontend/src/tourism/Tourism_index.css');
      final web = read('../frontend/src/tourism/utils/contactIcons.js');
      var compared = 0;
      for (final m in RegExp(r'name: "(\w+)".*?token: "(--[\w-]+)"|name: FALLBACK_ICON.*?token: "(--[\w-]+)"').allMatches(web)) {
        final name = m.group(1) ?? 'other';
        final token = m.group(2) ?? m.group(3)!;
        final drawn = appContactIcons[name]!;
        if (drawn.color == null) continue; // help_desk: the theme's deep colour on both sides
        final value = RegExp('$token:\\s*(#[0-9a-fA-F]{6});').firstMatch(css)!.group(1)!.toUpperCase();
        expect(hex(drawn.color!), value, reason: '$name / $token');
        compared++;
      }
      expect(compared, 11); // the fixture: every name but help_desk (the theme's colour) was compared
    });

    test('the web and the DOC match: every picture colour in the doc table is the token in Tourism_index.css (one source of truth)', () {
      final css = read('../frontend/src/tourism/Tourism_index.css');
      final doc = read('../docs/MOBILE_CONTACT_ICONS.md');
      var compared = 0;
      for (final name in appContactIcons.keys) {
        final token = '--th-contact-${name.replaceAll('_', '-')}';
        final row = RegExp('^\\| `$name` \\|[^\\n]*\\| `(#[0-9A-Fa-f]{6})` \\(', multiLine: true).firstMatch(doc);
        if (name == 'help_desk') {
          expect(row, isNull, reason: 'help_desk follows the theme: no colour of its own in the doc');
          continue;
        }
        final docValue = row!.group(1)!.toUpperCase();
        final webValue = RegExp('$token:\\s*(#[0-9a-fA-F]{6});').firstMatch(css)!.group(1)!.toUpperCase();
        expect(webValue, docValue, reason: '$name: web token $token vs the doc');
        compared++;
      }
      expect(compared, 11);
    });

    test('the web draws the number and the email in the neutral box of the app and the description in its grey', () {
      final css = read('../frontend/src/tourism/Tourism_index.css');
      String token(String n) => RegExp('$n:\\s*(#[0-9a-fA-F]{6});').firstMatch(css)!.group(1)!.toUpperCase();
      final card = read('lib/screens/tourism_screens.dart');
      expect(card, contains('0xFF${token('--th-contact-box-bg').substring(1)}'));
      expect(card, contains('0xFF${token('--th-contact-box-text').substring(1)}'));
      expect(card, contains('0xFF${token('--th-contact-note-text').substring(1)}'));
    });
  });

  group('the contrast', () {
    test('the measurement is right: a few known ratios', () {
      expect(contrastOnWhite(const Color(0xFFFFFFFF)), closeTo(1.0, 0.001));
      expect(contrastOnWhite(const Color(0xFF000000)), closeTo(21.0, 0.01));
      expect(contrastOnWhite(const Color(0xFFEF4444)), closeTo(3.76, 0.01));
      expect(contrastOnWhite(const Color(0xFFF97316)), closeTo(2.80, 0.01));
    });

    // The picture is drawn on its OWN pale box (its colour at 10% over the white card), so that is the background it is measured against (WCAG 1.4.11: 3:1 for a graphical object).
    Color boxOf(Color c) => Color.alphaBlend(c.withValues(alpha: 0.1), Colors.white);
    double between(Color a, Color b) {
      final la = luminance(a), lb = luminance(b);
      return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
    }

    test('ALL TWELVE pictures reach 3:1 against their own pale box (no list of exceptions)', () {
      var checked = 0;
      for (final entry in appContactIcons.entries) {
        final color = entry.value.color ?? BrandColors.original.deep; // help_desk: the app's own green (the theme darkens the others)
        expect(between(color, boxOf(color)), greaterThanOrEqualTo(3.0), reason: '${entry.key} ${hex(color)} on its box ${hex(boxOf(color))}');
        checked++;
      }
      expect(checked, 12); // the fixture: every name was measured
    });

    test('and they reach 3:1 on plain white as well', () {
      for (final entry in appContactIcons.entries) {
        final color = entry.value.color ?? BrandColors.original.deep;
        expect(contrastOnWhite(color), greaterThanOrEqualTo(3.0), reason: entry.key);
      }
    });

    test('the three that were too pale are the original colours made darker, with the same hue', () {
      HSLColor hsl(Color c) => HSLColor.fromColor(c);
      const original = {'fire': Color(0xFFF97316), 'power': Color(0xFFCA8A04), 'port': Color(0xFF65A30D)};
      original.forEach((name, old) {
        final now = appContactIcons[name]!.color!;
        expect(between(old, boxOf(old)), lessThan(3.0), reason: '$name: the original was below 3:1 on its box'); // the fixture
        expect(luminance(now), lessThan(luminance(old)), reason: '$name is darker');
        expect((hsl(now).hue - hsl(old).hue).abs(), lessThan(1.0), reason: '$name keeps its hue');
      });
    });

    test('help_desk follows the theme, and the theme\'s deep colour reaches 4.5:1 on white (the app\'s own green does)', () {
      expect(contrastOnWhite(BrandColors.original.deep), greaterThanOrEqualTo(4.5));
      expect(appContactIcons['help_desk']!.color, isNull);
    });

    test('the text is neutral and readable: the number and the email on their box, the description on white (4.5:1)', () {
      double between(Color a, Color b) {
        final la = luminance(a), lb = luminance(b);
        return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
      }

      expect(between(const Color(0xFF3C4C55), const Color(0xFFEFF5F7)), greaterThanOrEqualTo(4.5));
      expect(contrastOnWhite(const Color(0xFF5E6F77)), greaterThanOrEqualTo(4.5));
    });
  });

  group('the four written in the code: one copy, equal to the seed', () {
    test('they equal the seed of migration 0054, field by field', () {
      final seed = read('../backend/api/migrations/0054_seed_emergency_contacts.py');
      final rows = RegExp(r'^\s+\("([^"]+)", "([^"]*)", "([^"]*)", "(\w+)"\),$', multiLine: true).allMatches(seed).toList();
      expect(rows, hasLength(4)); // the fixture: the seed was read
      final written = AppContentDefaults.hotlines;
      expect(written, hasLength(4));
      for (var i = 0; i < 4; i++) {
        expect(written[i].name, rows[i].group(1), reason: 'name $i');
        expect(written[i].numbers, rows[i].group(2), reason: 'numbers $i');
        expect(written[i].email, rows[i].group(3), reason: 'email $i');
        expect(written[i].icon, rows[i].group(4), reason: 'icon $i');
        expect(written[i].description, '', reason: 'description $i');
        expect(written[i].id, lessThan(0), reason: 'never a server id');
      }
    });

    test('the desk\'s number and email are apart, as the server sends them; nothing is joined', () {
      final desk = AppContentDefaults.hotlines.last;
      expect(desk.icon, 'help_desk');
      expect(desk.email, isNotEmpty);
      expect(desk.numbers, isNot(contains('@')));
      expect(desk.numbers, isNot(contains('•')));
      expect(AppContentDefaults.hotlines.take(3).map((c) => c.email), everyElement(''));
    });

    test('their icons are the four of the doc, and the colours are the ones the screen had', () {
      expect(AppContentDefaults.hotlines.map((c) => c.icon), ['rescue', 'police', 'coast_guard', 'help_desk']);
      expect(AppContentDefaults.hotlines.map((c) => appContactIconFor(c.icon).color), [const Color(0xFFEF4444), const Color(0xFF2563EB), const Color(0xFF0D9488), null]);
    });

    test('each text is in lib/ once (moved, not copied), and the screen has no literal card left', () {
      String libSource() => [
        for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) f.readAsStringSync().replaceAll('\r\n', '\n'),
      ].join('\n');
      final source = libSource();
      var counted = 0;
      for (final c in AppContentDefaults.hotlines) {
        for (final text in [c.name, c.numbers, if (c.email.isNotEmpty) c.email]) {
          expect("'$text'".allMatches(source).length, 1, reason: text);
          counted++;
        }
      }
      expect(counted, 9); // the fixture: four names, four numbers, one email
      final screens = File('lib/screens/tourism_screens.dart').readAsStringSync();
      expect(RegExp(r"_EmergencyContactCard\(\s*icon: Icons\.").hasMatch(screens), isFalse);
      expect(screens, contains('AppContentDefaults.hotlines'));
    });
  });
}
