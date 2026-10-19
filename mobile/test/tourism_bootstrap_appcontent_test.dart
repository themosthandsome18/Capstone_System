// An app already installed must not break when the server sends the key `appContent`
// (Mobile App Content, Commit 3). MobileBootstrap.fromJson reads only the keys it
// knows by name, so it never looks at this one; nothing in the app reads it yet.
//
// test/data/app_content_commit3.json is the REAL value the server sends for the ten
// seeded texts (3,359 bytes). A backend test (api/test_mobile_content_app_content.py)
// checks that this file is byte for byte what the server renders, so this test and the
// server cannot drift apart.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Object? realAppContent() => jsonDecode(File('test/data/app_content_commit3.json').readAsStringSync());

/// Everything the app reads of a bootstrap, as plain values, so two can be compared.
Map<String, Object?> whatTheAppReads(MobileBootstrap b) => {
  'destinations': b.destinations.map((d) => '${d.id}:${d.name}').toList(),
  'featured': b.featuredDestinations.map((d) => d.name).toList(),
  'countries': b.countries.map((r) => '${r.id}:${r.name}').toList(),
  'itineraries': b.itineraries.map((r) => '${r.id}:${r.name}').toList(),
  'barangays': b.barangays.map((r) => '${r.id}:${r.name}').toList(),
  'notifications': b.notifications.map((n) => '${n.id}:${n.title}').toList(),
  'themeWebColour': b.theme.primaryColor,
};

Map<String, dynamic> payload({Object? appContent = _absent}) {
  final map = bootstrapJson(3);
  map['theme'] = {'primary_color': '#EF7C1F', 'mobile_follows_web': true, 'mobile_primary_color': ''};
  map['emergencyContacts'] = <dynamic>[];
  if (!identical(appContent, _absent)) map['appContent'] = appContent;
  // through real JSON text, as the app receives it
  return jsonDecode(jsonEncode(map)) as Map<String, dynamic>;
}

const Object _absent = Object();

String textOfLength(int n, String unit) => List.filled(n, unit).join();

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final without = whatTheAppReads(MobileBootstrap.fromJson(payload()));

  test('the fixture is the real value: the two sections and the four blocks, and a fee that is already filled in', () {
    final content = realAppContent() as Map<String, dynamic>;
    expect(content.keys, ['blocks', 'sections']);
    expect((content['blocks'] as Map).keys, ['welcome', 'why_visit', 'travel_guide', 'port_guide']);
    expect(((content['sections'] as Map)['why_visit'] as List), hasLength(4));
    expect(((content['sections'] as Map)['travel_guide'] as List), hasLength(6));
    expect(jsonEncode(content), contains('₱80'));
    expect(jsonEncode(content), isNot(contains('{fee_')));
    expect(jsonEncode(content), contains('{name}')); // the one placeholder left for the app
    expect(without['destinations'], hasLength(3)); // the baseline really has something to compare
  });

  test('the real appContent changes nothing the app reads', () {
    final withContent = payload(appContent: realAppContent());
    expect(withContent.containsKey('appContent'), isTrue);
    final bootstrap = MobileBootstrap.fromJson(withContent);
    expect(whatTheAppReads(bootstrap), without);
  });

  test('appContent of any odd shape is ignored', () {
    final odd = <Object?>[
      null, 'text', 5, 5.5, true, [], [1, 2], [null], {}, {'x': 1},
      {'blocks': null, 'sections': null},
      {'blocks': 5, 'sections': 'x'},
      {'blocks': [], 'sections': []},
      {'blocks': {'welcome': 'not a map'}, 'sections': {'why_visit': 'nope', 'travel_guide': 7}},
      {'blocks': {}, 'sections': {'why_visit': [1, null, 'x', {}], 'travel_guide': [{'id': 'a', 'tappable': 'yes'}]}},
      {'appContent': {'appContent': {'appContent': 1}}},
    ];
    for (final shape in odd) {
      final bootstrap = MobileBootstrap.fromJson(payload(appContent: shape));
      expect(whatTheAppReads(bootstrap), without, reason: '$shape');
    }
  });

  test('a very large appContent is read through the same text path as the cache, and the rest is unchanged', () {
    // the worst the API allows: 40 items x 2 sections x 5,000 four-byte letters of full text (about 1.7 MB)
    final emoji = textOfLength(5000, '\u{1F30A}');
    final item = {
      'id': 1, 'icon': 'beach', 'title': 'x', 'short_text': 'x', 'full_text': emoji, 'style': 'tile', 'tappable': true,
    };
    final big = {
      'blocks': realAppContent() is Map ? (realAppContent() as Map)['blocks'] : {},
      'sections': {'why_visit': List.filled(40, item), 'travel_guide': List.filled(40, item)},
    };
    final raw = jsonEncode(payload(appContent: big));
    expect(utf8.encode(raw).length, greaterThan(1500000)); // the fixture: it really is that big
    expect(whatTheAppReads(parseBootstrapRaw(raw)), without);
  });

  test('the saved copy with appContent is written, read back and parsed like any other', () async {
    final raw = jsonEncode(payload(appContent: realAppContent()));
    const cache = TourismBootstrapCache();
    await cache.write(raw);
    final saved = await cache.read();
    expect(saved, isNotNull);
    expect(whatTheAppReads(saved!.bootstrap), without);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(tourismBootstrapCacheKey), contains('"appContent"')); // it is in the saved text, untouched
  });

  test('a saved copy from BEFORE appContent existed is still read (a new key can be missing as well as extra)', () async {
    final raw = jsonEncode(payload());
    expect(raw, isNot(contains('appContent')));
    const cache = TourismBootstrapCache();
    await cache.write(raw);
    final saved = await cache.read();
    expect(saved, isNotNull);
    expect(whatTheAppReads(saved!.bootstrap), without);
  });
}
