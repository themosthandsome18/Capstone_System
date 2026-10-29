part of '../main.dart';

// The `referenceTables.boatCapacityFares` of the bootstrap: the "Boat Capacity and Fare" tiers an LGU admin edits on the web (Registration Options), which the
// booking form offers in place of the nine written in its own code (boatCapacityFareOptions in utils/helpers.dart, the ONLY copy of them). Like app_contacts.dart:
// nothing here ever throws, a part that is missing or of the wrong kind is just missing, and EVERY ENTRY IS DECIDED ON ITS OWN: a broken entry is left out and not
// the whole list. The server's list REPLACES the written nine; the written nine are only what is offered when there is nothing to offer (see
// BoatCapacityFares.choices), so a tourist who must pick a tier always has one to pick.

class BoatCapacityFares {
  const BoatCapacityFares({this.names = const []});

  /// No `boatCapacityFares` in the answer (or one the app cannot read): nothing is set, and the written nine are offered.
  static const none = BoatCapacityFares();

  /// The tier texts, in the order the server sent them (it already applies the admin's order, and sends active tiers only). A tier is its TEXT: a record keeps
  /// the text it was saved with, and the server sends no id for it.
  final List<String> names;

  /// The tier of one entry, or null when it is broken: not a map, or a `name` that is not a string or is blank. Never throws.
  static String? tryParseName(Object? entry) {
    try {
      if (entry is! Map) return null;
      final name = entry['name'];
      if (name is! String) return null;
      final text = name.trim();
      return text.isEmpty ? null : text;
    } catch (_) {
      return null;
    }
  }

  /// Anything that is not a list is [none]; every entry through [tryParseName], the broken ones left out, a repeated text left out (the later one: a dropdown
  /// cannot hold two equal choices). Never throws.
  factory BoatCapacityFares.fromJson(Object? json) {
    try {
      if (json is! List) return none;
      final seen = <String>{};
      final names = <String>[];
      for (final one in json) {
        final name = tryParseName(one);
        if (name != null && seen.add(name)) names.add(name);
      }
      return names.isEmpty ? none : BoatCapacityFares(names: names);
    } catch (_) {
      return none;
    }
  }

  /// What the form offers: the empty choice ("Select capacity and fare") and then the server's tiers, or [fromCode] (the written list, which already starts
  /// with the empty choice) when the server gave none: it failed, the key is missing, the list is empty, or every entry is broken. Never empty of tiers.
  List<String> choices(List<String> fromCode) => names.isEmpty ? fromCode : ['', ...names];
}
