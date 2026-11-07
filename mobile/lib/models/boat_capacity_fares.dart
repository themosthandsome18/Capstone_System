part of '../main.dart';

// The `referenceTables.boatCapacityFares` of the bootstrap: the "Boat Capacity and Fare" tiers an LGU admin edits on the web (Registration Options), which the
// booking form offers in place of the nine written in its own code (boatCapacityFareOptions in utils/helpers.dart, the ONLY copy of them). Like app_contacts.dart:
// nothing here ever throws, a part that is missing or of the wrong kind is just missing, and EVERY ENTRY IS DECIDED ON ITS OWN: a broken entry is left out and not
// the whole list. The server's list REPLACES the written nine; the written nine are only what is offered when there is nothing to offer (see
// BoatCapacityFares.choices), so a tourist who must pick a tier always has one to pick.

/// The people a tier is for, as the server sends them (`min_pax`, `max_pax`).
class PaxRange {
  const PaxRange(this.min, this.max);

  final int min;
  final int max;

  bool fits(int visitors) => visitors >= min && visitors <= max;
}

class BoatCapacityFares {
  const BoatCapacityFares({this.names = const [], this.ranges = const {}});

  /// No `boatCapacityFares` in the answer (or one the app cannot read): nothing is set, and the written nine are offered.
  static const none = BoatCapacityFares();

  /// The tier texts, in the order the server sent them (it already applies the admin's order, and sends active tiers only). A tier is its TEXT: a record keeps
  /// the text it was saved with, and the server sends no id for it.
  final List<String> names;

  /// The range of the tiers that have one, by tier text. A tier the server sent without `min_pax` and `max_pax` (or with numbers that make no range) is NOT here:
  /// it has no known range, so the head count never chooses it and choosing it never sets the head count. The written nine have none either.
  final Map<String, PaxRange> ranges;

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

  /// The range of one entry, or null when it has none: both numbers must be whole numbers, `min_pax` 1 or more and `max_pax` not below it. Never throws, never guesses.
  static PaxRange? tryParseRange(Object? entry) {
    try {
      if (entry is! Map) return null;
      final min = entry['min_pax'];
      final max = entry['max_pax'];
      if (min is! int || max is! int) return null;
      if (min < 1 || max < min) return null;
      return PaxRange(min, max);
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
      final ranges = <String, PaxRange>{};
      for (final one in json) {
        final name = tryParseName(one);
        if (name != null && seen.add(name)) {
          names.add(name);
          final range = tryParseRange(one);
          if (range != null) ranges[name] = range;
        }
      }
      return names.isEmpty ? none : BoatCapacityFares(names: names, ranges: ranges);
    } catch (_) {
      return none;
    }
  }

  /// What the form offers: the empty choice ("Select capacity and fare") and then the server's tiers, or [fromCode] (the written list, which already starts
  /// with the empty choice) when the server gave none: it failed, the key is missing, the list is empty, or every entry is broken. Never empty of tiers.
  List<String> choices(List<String> fromCode) => names.isEmpty ? fromCode : ['', ...names];
}

extension BoatCapacityFarePax on BoatCapacityFares {
  /// The first tier, in the order the server sent them (active ones only), whose range holds [visitors]; null when none does. Uses the numbers, never the text.
  String? tierForVisitors(int visitors) {
    if (visitors < 1) return null;
    for (final name in names) {
      if (ranges[name]?.fits(visitors) == true) return name;
    }
    return null;
  }

  /// The tier the form should hold once the head count is [visitors]. Nothing changes when the boat takes no fare, when the tier already chosen holds the count,
  /// when no tier holds it, or when the count is not 1 or more.
  String fareFollowingVisitors({required String fare, required int visitors, required bool requiresFare}) {
    if (!requiresFare || visitors < 1) return fare;
    if (ranges[fare]?.fits(visitors) == true) return fare;
    return tierForVisitors(visitors) ?? fare;
  }

  /// What choosing [fare] puts in Total Visitors: the largest number of its range. null for a tier with no range: nothing is put anywhere.
  int? visitorsForTier(String fare) => ranges[fare]?.max;
}
