// The model of `referenceTables.boatCapacityFares` and what the booking form offers because of it. Nothing here may throw, EVERY ENTRY IS DECIDED ON ITS OWN (a
// broken entry is left out, not the whole list), the server's list REPLACES the nine written in the code, and the written nine are only what is offered when the
// server gives nothing to offer. In every state the tourist has a tier to pick. Every test with a fixture asserts, inside the test, that the fixture reached the case.
import 'dart:collection';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

String read(String path) => File(path).readAsStringSync().replaceAll('\r\n', '\n');

MobileBootstrap bootstrapWith(Object? fares, {bool withKey = true}) => MobileBootstrap.fromJson({
  'destinations': <dynamic>[],
  'referenceTables': {'boatTypes': <dynamic>[], if (withKey) 'boatCapacityFares': fares},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

const written = [
  '1-2 pax (One-Way P1500, Two-way P2000)',
  '3-4 pax (One-Way P2000, Two-way P2,500)',
  '5-6 pax (One-Way P2,500, Two-way P3,000)',
  '7-8 pax (One-Way P3,000, Two-way P3,500)',
  '9-10 pax (One-Way P3,500, Two-way P4,000)',
  '11-12 pax (One-Way P4,000, Two-way P4,500)',
  '13-14 pax (One-Way P4,500, Two-way P5,000)',
  '15-17 pax (One-Way P5,000, Two-way P5,500)',
  '18-20 pax (One-Way P5,500, Two-way P6,000)',
];

/// A list whose reading throws: the model must not let that out.
class _Hostile extends ListBase<Object?> {
  @override
  int get length => throw StateError('cannot be read');
  @override
  set length(int value) {}
  @override
  Object? operator [](int index) => throw StateError('cannot be read');
  @override
  void operator []=(int index, Object? value) {}
}

void main() {
  group('the model reads the server\'s tiers', () {
    test('good entries, in the order the server sent them (no sorting), as their text', () {
      final fares = BoatCapacityFares.fromJson([
        {'name': 'Zeta tier'},
        {'name': 'Alpha tier'},
        {'name': '21-25 pax (One-Way P6,000, Two-way P6,500)'},
      ]);
      expect(fares.names, ['Zeta tier', 'Alpha tier', '21-25 pax (One-Way P6,000, Two-way P6,500)']);
      expect(fares.names, hasLength(3)); // the fixture: three entries reached the result
    });

    test('the text is trimmed, because the form sends it trimmed and the dropdown must hold the same text', () {
      final fares = BoatCapacityFares.fromJson([
        {'name': '  Padded tier  '},
      ]);
      expect(fares.names, ['Padded tier']);
    });

    test('an entry with no usable name is broken and is left out; the good ones stay', () {
      final broken = <Object?>[
        null,
        5,
        'a text',
        [],
        <String, Object?>{},
        {'name': null},
        {'name': ''},
        {'name': '   '},
        {'name': 7},
        {'name': true},
        {'name': <String>['x']},
        {'id': 1},
      ];
      final fares = BoatCapacityFares.fromJson([broken.first, {'name': 'Good one'}, ...broken.skip(1), {'name': 'Good two'}]);
      expect(fares.names, ['Good one', 'Good two']);
      for (final one in broken) {
        expect(BoatCapacityFares.tryParseName(one), isNull, reason: '$one'); // the fixture: each of these really is broken
      }
      expect(broken, hasLength(12));
    });

    test('a repeated text is left out (the later one): a dropdown cannot hold two equal choices', () {
      final fares = BoatCapacityFares.fromJson([
        {'name': 'Same'},
        {'name': 'Other'},
        {'name': ' Same '},
      ]);
      expect(fares.names, ['Same', 'Other']);
    });

    test('anything that is not a list is nothing', () {
      for (final odd in <Object?>[null, 'text', 5, true, <String, Object?>{}, {'name': 'x'}]) {
        expect(BoatCapacityFares.fromJson(odd).names, isEmpty, reason: '$odd');
        expect(identical(BoatCapacityFares.fromJson(odd), BoatCapacityFares.none), isTrue, reason: '$odd');
      }
    });

    test('it never throws, whatever the entries are', () {
      final weird = <Object?>[
        {'name': Object()},
        {1: 'x'},
        {'name': 'ok'},
        double.nan,
        () {},
      ];
      late BoatCapacityFares fares;
      expect(() => fares = BoatCapacityFares.fromJson(weird), returnsNormally);
      expect(fares.names, ['ok']); // the fixture: the odd ones were met and the good one survived
    });

    test('an empty list, or one where every entry is broken, is the shared "none"', () {
      for (final nothing in <List<Object?>>[[], [null], [5, 'x'], [{'name': ''}]]) {
        expect(identical(BoatCapacityFares.fromJson(nothing), BoatCapacityFares.none), isTrue, reason: '$nothing');
      }
    });

    test('a list that throws when it is read is nothing, not an exception', () {
      final hostile = _Hostile();
      expect(() => hostile.toList(), throwsStateError); // the fixture: reading it really throws
      late BoatCapacityFares fares;
      expect(() => fares = BoatCapacityFares.fromJson(hostile), returnsNormally);
      expect(identical(fares, BoatCapacityFares.none), isTrue);
    });

    test('a very long list is read whole', () {
      final fares = BoatCapacityFares.fromJson([for (var i = 0; i < 500; i++) {'name': 'Tier $i'}]);
      expect(fares.names, hasLength(500));
      expect(fares.names.first, 'Tier 0');
      expect(fares.names.last, 'Tier 499');
    });
  });

  group('what the form offers: the four states, and the tourist always has a tier to pick', () {
    void expectWritten(List<String> choices, String reason) {
      expect(choices, boatCapacityFareOptions, reason: reason);
      expect(choices.first, '', reason: reason);
      expect(choices.skip(1), written, reason: reason);
    }

    void expectSomethingToPick(List<String> choices, String reason) {
      expect(choices.first, '', reason: reason); // the "Select capacity and fare" choice
      expect(choices.where((c) => c.isNotEmpty), isNotEmpty, reason: reason);
    }

    test('the server failed (the offline bootstrap): the written nine', () {
      final choices = MobileBootstrap.fallback().boatCapacityFareChoices;
      expectWritten(choices, 'offline');
      expectSomethingToPick(choices, 'offline');
    });

    test('the key is missing (an older server, an older saved copy): the written nine', () {
      final bootstrap = bootstrapWith(null, withKey: false);
      expect((bootstrap.boatCapacityFares).names, isEmpty);
      expectWritten(bootstrap.boatCapacityFareChoices, 'missing');
    });

    test('the key is there but the list is empty: the written nine', () {
      final bootstrap = bootstrapWith(<Object?>[]);
      expect(bootstrap.boatCapacityFares.names, isEmpty);
      expectWritten(bootstrap.boatCapacityFareChoices, 'empty');
    });

    test('an entry is broken: it is left out and the good ones are offered; when ALL are broken, the written nine', () {
      final some = bootstrapWith([
        {'name': ''},
        {'name': 'Kept tier'},
        5,
      ]);
      expect(some.boatCapacityFareChoices, ['', 'Kept tier']); // the fixture: one broken entry was dropped and one tier survived
      expectSomethingToPick(some.boatCapacityFareChoices, 'some broken');

      final all = bootstrapWith([
        {'name': ''},
        {'name': null},
        5,
        null,
      ]);
      expect(all.boatCapacityFares.names, isEmpty); // the fixture: every entry was broken
      expectWritten(all.boatCapacityFareChoices, 'all broken');
      expectSomethingToPick(all.boatCapacityFareChoices, 'all broken');
    });

    test('the server\'s list REPLACES the written nine: none of the nine is added to it, and the order is the server\'s', () {
      final bootstrap = bootstrapWith([
        {'name': 'Second tier'},
        {'name': '1-2 pax (One-Way P1500, Two-way P2000)'},
      ]);
      expect(bootstrap.boatCapacityFareChoices, ['', 'Second tier', '1-2 pax (One-Way P1500, Two-way P2000)']);
      expect(bootstrap.boatCapacityFareChoices, hasLength(3)); // not 3 + 9
    });

    test('one good tier is ONE choice (after the empty one); the written nine are not added to it', () {
      final bootstrap = bootstrapWith([
        {'name': 'Only tier'},
      ]);
      expect(bootstrap.boatCapacityFareChoices, ['', 'Only tier']);
    });

    test('a bootstrap built by hand, without the field, offers the written nine', () {
      final bootstrap = MobileBootstrap(
        destinations: const [],
        featuredDestinations: const [],
        countries: const [],
        regions: const [],
        provinces: const [],
        itineraries: const [],
        travelModes: const [],
        boatTypes: const [],
        visitPurposes: const [],
        barangays: const [],
        notifications: const [],
      );
      expect(identical(bootstrap.boatCapacityFares, BoatCapacityFares.none), isTrue);
      expectWritten(bootstrap.boatCapacityFareChoices, 'by hand');
    });
  });

  group('the nine written in the code: one copy, equal to the seed', () {
    test('they equal the seed of migration 0056, text for text and in the same order', () {
      final migration = read('../backend/api/migrations/0056_seed_boat_capacity_fares.py');
      final block = migration.substring(migration.indexOf('TIERS = ['));
      final seed = [for (final m in RegExp(r'^    "([^"]+)",$', multiLine: true).allMatches(block.substring(0, block.indexOf(']\n')))) m.group(1)!];
      expect(seed, hasLength(9)); // the fixture: the seed was really read
      expect(boatCapacityFareOptions.skip(1).toList(), seed);
    });

    test('they are the nine of this test, after the empty choice, with no repeated text', () {
      expect(boatCapacityFareOptions.first, '');
      expect(boatCapacityFareOptions.skip(1).toList(), written);
      expect(boatCapacityFareOptions.toSet(), hasLength(10));
    });

    test('each text is in lib/ once (moved, not copied): no second copy of the list is left in the code', () {
      final sources = [for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) read(f.path)];
      expect(sources.length, greaterThan(10)); // the fixture: the sources were really read
      for (final text in written) {
        final count = sources.fold<int>(0, (n, source) => n + text.allMatches(source).length);
        expect(count, 1, reason: text);
      }
    });
  });
}
