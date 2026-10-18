// An app already installed must not break when the server sends keys it has
// never heard of. The server now sends referenceTables.boatCapacityFares (the
// active "Boat Capacity and Fare" tiers as [{name}], no id) and, at the top,
// emergencyContacts. MobileBootstrap.fromJson reads only the six keys it knows
// and ignores the rest. The payload below has the shape the server really sends
// (see BoatCapacityFarePayloadTests in backend/api/tests.py).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const knownSix = [
  'destinations',
  'featuredDestinations',
  'referenceTables',
  'barangays',
  'notifications',
  'theme',
];

Map<String, dynamic> serverPayload({bool withNewKeys = true}) {
  final referenceTables = <String, dynamic>{
    'countries': [
      {'id': 1, 'name': 'Philippines', 'type': 'local'},
    ],
    'regions': [
      {'id': 4, 'name': 'CALABARZON Region'},
    ],
    'provinces': [
      {'id': 7, 'name': 'Quezon', 'region_id': 4},
    ],
    'itineraries': [
      {'id': 2, 'name': 'Same Day'},
      {'id': 5, 'name': 'Overnight'},
    ],
    'travelModes': [
      {'id': 3, 'name': 'Private Vehicle'},
    ],
    'boatTypes': [
      {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': true},
      {'id': 2, 'name': 'Passenger Boat', 'requires_capacity_fare': false},
    ],
    'visitPurposes': [
      {'id': 6, 'name': 'Leisure'},
    ],
    'resorts': [],
  };
  final top = <String, dynamic>{
    'destinations': [
      {'resort_id': 11, 'resort_name': 'Sample Beach Resort'},
    ],
    'featuredDestinations': [
      {'resort_id': 11, 'resort_name': 'Sample Beach Resort'},
    ],
    'barangays': [
      {'id': 9, 'name': 'Cagsiay I'},
    ],
    'notifications': [
      {'id': 'n1', 'title': 'Welcome', 'message': 'Hello', 'type': 'tourism'},
    ],
    'theme': {
      'primary_color': '#EF7C1F',
      'mobile_follows_web': true,
      'mobile_primary_color': '',
    },
  };
  if (withNewKeys) {
    referenceTables['boatCapacityFares'] = [
      {'name': '1-2 pax (One-Way P1500, Two-way P2000)'},
      {'name': '21-25 pax (One-Way P6,000, Two-way P6,500)'},
    ];
    top['emergencyContacts'] = [
      {
        'id': 1,
        'name': 'Mauban MDRRMO / Rescue 24/7',
        'contact_numbers': '0998-598-8422 / (042) 784-0123',
        'email': '',
        'description': '',
        'icon': 'rescue',
      },
    ];
  }
  top['referenceTables'] = referenceTables;
  // through real JSON text, as the app receives it
  return jsonDecode(jsonEncode(top)) as Map<String, dynamic>;
}

/// What the app reads, as plain values, so two bootstraps can be compared.
Map<String, Object?> whatTheAppReads(MobileBootstrap b) => {
  'destinations': b.destinations.map((d) => d.name).toList(),
  'featured': b.featuredDestinations.map((d) => d.name).toList(),
  'countries': b.countries.map((r) => '${r.id}:${r.name}').toList(),
  'regions': b.regions.map((r) => '${r.id}:${r.name}').toList(),
  'provinces': b.provinces.map((r) => '${r.id}:${r.name}').toList(),
  'itineraries': b.itineraries.map((r) => '${r.id}:${r.name}').toList(),
  'travelModes': b.travelModes.map((r) => '${r.id}:${r.name}').toList(),
  'boatTypes': b.boatTypes.map((r) => '${r.id}:${r.name}:${r.requiresCapacityFare}').toList(),
  'visitPurposes': b.visitPurposes.map((r) => '${r.id}:${r.name}').toList(),
  'barangays': b.barangays.map((r) => '${r.id}:${r.name}').toList(),
  'notifications': b.notifications.map((n) => '${n.id}:${n.title}').toList(),
  'themeWebColour': b.theme.primaryColor,
};

void main() {
  test('the payload really has the new keys, and the six known ones', () {
    final payload = serverPayload();
    for (final key in knownSix) {
      expect(payload.containsKey(key), isTrue, reason: key);
    }
    expect(payload.containsKey('emergencyContacts'), isTrue);
    final tables = payload['referenceTables'] as Map<String, dynamic>;
    expect(tables.containsKey('boatCapacityFares'), isTrue);
    // and the new list has no id, as the server sends it
    for (final tier in tables['boatCapacityFares'] as List) {
      expect((tier as Map).keys, ['name']);
    }
  });

  test('fromJson ignores the new keys: no exception, and the six known keys are read right', () {
    final MobileBootstrap bootstrap = MobileBootstrap.fromJson(serverPayload());

    expect(bootstrap.destinations.map((d) => d.name), ['Sample Beach Resort']);
    expect(bootstrap.featuredDestinations.map((d) => d.name), ['Sample Beach Resort']);
    expect(bootstrap.countries.map((r) => r.name), ['Philippines']);
    expect(bootstrap.regions.map((r) => r.name), ['CALABARZON Region']);
    expect(bootstrap.provinces.map((r) => r.name), ['Quezon']);
    expect(bootstrap.itineraries.map((r) => '${r.id}:${r.name}'), ['2:Same Day', '5:Overnight']);
    expect(bootstrap.travelModes.map((r) => r.name), ['Private Vehicle']);
    expect(bootstrap.boatTypes.map((r) => r.requiresCapacityFare), [true, false]);
    expect(bootstrap.visitPurposes.map((r) => r.name), ['Leisure']);
    expect(bootstrap.barangays.map((b) => b.name), ['Cagsiay I']);
    expect(bootstrap.notifications.map((n) => n.title), ['Welcome']);
    expect(bootstrap.theme.primaryColor, '#EF7C1F');
  });

  test('the answer is exactly the same with the new keys as without them', () {
    final withNew = whatTheAppReads(MobileBootstrap.fromJson(serverPayload()));
    final without = whatTheAppReads(MobileBootstrap.fromJson(serverPayload(withNewKeys: false)));
    expect(withNew, without);
  });

  test('a new key of any odd shape is still ignored', () {
    for (final odd in <Object?>[null, 'text', 5, [], [1, 2], [null], {}, {'name': 'x'}]) {
      final payload = serverPayload();
      (payload['referenceTables'] as Map<String, dynamic>)['boatCapacityFares'] = odd;
      payload['emergencyContacts'] = odd;
      payload['someFutureKey'] = odd;
      final bootstrap = MobileBootstrap.fromJson(payload);
      expect(bootstrap.itineraries, hasLength(2), reason: '$odd');
      expect(bootstrap.destinations, hasLength(1), reason: '$odd');
    }
  });

  test('the written list of tiers is still what the form offers: nine, after the empty choice', () {
    expect(boatCapacityFareOptions.first, '');
    expect(boatCapacityFareOptions.skip(1), hasLength(9));
    expect(boatCapacityFareOptions[1], '1-2 pax (One-Way P1500, Two-way P2000)');
  });
}
