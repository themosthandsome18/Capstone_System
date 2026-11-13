part of '../main.dart';

// What the tourist has done with this app, kept on the phone: the entry passes of the visits they registered, the feedback they sent, and
// the profile they made by doing so. Without this the three lived in memory only, and closing the app made the tourist a stranger again.
//
// Done as the bootstrap cache and the sanitation drafts are: SharedPreferences, a key with a version in its name, JSON text, and a store
// that NEVER throws. A copy that cannot be read, or an item that is incomplete, is just not there: the app starts without it and goes on.

const tourismMyVisitsKey = 'tourism_my_visits_v1';
const tourismMyFeedbackKey = 'tourism_my_feedback_v1';
const tourismProfileKey = 'tourism_profile_v1';

/// Whether there is news in My Visit the tourist has not looked at yet (a new pass, or a pass whose status changed): the red dot on its tab.
const tourismMyVisitNewsKey = 'tourism_my_visit_news_v1';

/// Which notices the tourist has SEEN (the Notifications page was opened while they were there: the red dot on the bell goes) and which they have
/// REMOVED (the X or a swipe: they do not come back). By the id of the notice: an advisory's id is the server's, and the id of an answer to a review
/// has the answer in it, so a changed answer is a new notice.
const tourismNoticesSeenKey = 'tourism_notices_seen_v1';
const tourismNoticesRemovedKey = 'tourism_notices_removed_v1';

/// The passes whose status the app SAW change (to arrived or to cancelled) when it brought them up to date: the survey ID and the status it changed to,
/// as JSON text. It is what makes a notice "one for each change": a notice is made only from a change that was seen, so a pass that was already arrived
/// before the app could tell has none, and a pass that stays arrived adds none.
const tourismPassEventsKey = 'tourism_pass_events_v1';

/// The passes the server SAID it does not know (it answered, well, with no rows: the record was deleted, or the database was reset), by survey ID. The app
/// does not ask about them again: each question that fails to find a pass is counted against the tourist's own limit, and asking at every opening
/// would use it up and shut out their real passes too. The pass is NOT taken away: it stays in the list. A refusal (429) or no network is not here.
const tourismUnknownPassesKey = 'tourism_unknown_passes_v1';

/// What is kept: the three, as they were when the app was closed.
class MyVisits {
  const MyVisits({
    this.visits = const [],
    this.feedback = const [],
    this.profile = const MobileUserProfile(name: '', email: '', contactNumber: ''),
    this.news = false,
    this.seenNotices = const {},
    this.removedNotices = const {},
    this.passEvents = const {},
    this.unknownPasses = const {},
  });

  /// Nothing kept: a tourist who has not registered or written yet.
  static const MyVisits none = MyVisits();

  final List<MobileVisitReceipt> visits;
  final List<MobileFeedbackReceipt> feedback;
  final MobileUserProfile profile;

  /// There is news in My Visit that has not been looked at (the red dot on the tab).
  final bool news;

  /// The ids of the notices that were seen, and of those that were removed (see [tourismNoticesSeenKey]).
  final Set<String> seenNotices;
  final Set<String> removedNotices;

  /// Survey ID -> the status the pass was seen to change to (see [tourismPassEventsKey]).
  final Map<String, String> passEvents;

  /// The survey IDs of the passes the server said it does not know (see [tourismUnknownPassesKey]).
  final Set<String> unknownPasses;

  bool get isEmpty => visits.isEmpty && feedback.isEmpty && profile.isGuest;
}

class MyVisitsStore {
  const MyVisitsStore();

  /// Everything that was kept. Never throws: a copy that cannot be read is dropped from the answer (and left to be written over).
  Future<MyVisits> read() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return MyVisits(
        visits: _readList(prefs, tourismMyVisitsKey, MobileVisitReceipt.fromStoredJson),
        feedback: _readList(prefs, tourismMyFeedbackKey, MobileFeedbackReceipt.fromStoredJson),
        profile: _readProfile(prefs),
        news: _readNews(prefs),
        seenNotices: _readIds(prefs, tourismNoticesSeenKey),
        removedNotices: _readIds(prefs, tourismNoticesRemovedKey),
        passEvents: _readPassEvents(prefs),
        unknownPasses: _readIds(prefs, tourismUnknownPassesKey),
      );
    } catch (_) {
      return MyVisits.none;
    }
  }

  Future<void> saveVisits(List<MobileVisitReceipt> visits) =>
      _writeList(tourismMyVisitsKey, visits.map((item) => item.toStoredJson()).toList());

  Future<void> saveFeedback(List<MobileFeedbackReceipt> feedback) =>
      _writeList(tourismMyFeedbackKey, feedback.map((item) => item.toStoredJson()).toList());

  Future<void> saveProfile(MobileUserProfile profile) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (profile.isGuest) {
        await prefs.remove(tourismProfileKey);
      } else {
        await prefs.setString(tourismProfileKey, jsonEncode(profile.toStoredJson()));
      }
    } catch (_) {
      // A copy that cannot be written is just no copy.
    }
  }

  /// Keeps whether there is news in My Visit that has not been looked at. Nothing is kept for "no news".
  Future<void> saveNews(bool news) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (news) {
        await prefs.setBool(tourismMyVisitNewsKey, true);
      } else {
        await prefs.remove(tourismMyVisitNewsKey);
      }
    } catch (_) {
      // A copy that cannot be written is just no copy.
    }
  }

  /// Keeps which notices were seen and which were removed. Never throws. Nothing is kept for an empty set.
  Future<void> saveNotices({required Set<String> seen, required Set<String> removed}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final entry in {tourismNoticesSeenKey: seen, tourismNoticesRemovedKey: removed}.entries) {
        if (entry.value.isEmpty) {
          await prefs.remove(entry.key);
        } else {
          await prefs.setStringList(entry.key, entry.value.toList());
        }
      }
    } catch (_) {
      // A copy that cannot be written is just no copy.
    }
  }

  /// Keeps which passes the server said it does not know. Never throws. Nothing is kept for none.
  Future<void> saveUnknownPasses(Set<String> references) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (references.isEmpty) {
        await prefs.remove(tourismUnknownPassesKey);
      } else {
        await prefs.setStringList(tourismUnknownPassesKey, references.toList());
      }
    } catch (_) {
      // A copy that cannot be written is just no copy.
    }
  }

  /// Keeps which passes were seen to change, and to what. Never throws. Nothing is kept for none.
  Future<void> savePassEvents(Map<String, String> events) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (events.isEmpty) {
        await prefs.remove(tourismPassEventsKey);
      } else {
        await prefs.setString(tourismPassEventsKey, jsonEncode(events));
      }
    } catch (_) {
      // A copy that cannot be written is just no copy.
    }
  }

  /// Takes everything off the phone (Sign Out). Never throws. True when nothing is left.
  Future<bool> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(tourismMyVisitsKey);
      await prefs.remove(tourismMyFeedbackKey);
      await prefs.remove(tourismProfileKey);
      await prefs.remove(tourismMyVisitNewsKey);
      await prefs.remove(tourismNoticesSeenKey);
      await prefs.remove(tourismNoticesRemovedKey);
      await prefs.remove(tourismPassEventsKey);
      await prefs.remove(tourismUnknownPassesKey);
      return !prefs.containsKey(tourismUnknownPassesKey) &&
          !prefs.containsKey(tourismPassEventsKey) &&
          !prefs.containsKey(tourismNoticesSeenKey) &&
          !prefs.containsKey(tourismNoticesRemovedKey) &&
          !prefs.containsKey(tourismMyVisitsKey) &&
          !prefs.containsKey(tourismMyFeedbackKey) &&
          !prefs.containsKey(tourismProfileKey) &&
          !prefs.containsKey(tourismMyVisitNewsKey);
    } catch (_) {
      return false;
    }
  }

  Future<void> _writeList(String key, List<Map<String, Object?>> items) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(key, items.map(jsonEncode).toList());
    } catch (_) {
      // A copy that cannot be written is just no copy.
    }
  }

  List<T> _readList<T>(SharedPreferences prefs, String key, T? Function(Map<String, dynamic>) parse) {
    try {
      final raw = prefs.getStringList(key) ?? const <String>[];
      final items = <T>[];
      for (final text in raw) {
        try {
          final decoded = jsonDecode(text);
          if (decoded is! Map) continue;
          final item = parse(Map<String, dynamic>.from(decoded));
          if (item != null) items.add(item); // an item that is incomplete is left out, the others stay
        } catch (_) {
          continue;
        }
      }
      return items;
    } catch (_) {
      return <T>[]; // a value of another kind under the key: nothing kept
    }
  }

  Map<String, String> _readPassEvents(SharedPreferences prefs) {
    try {
      final text = prefs.getString(tourismPassEventsKey);
      if (text == null) return <String, String>{};
      final decoded = jsonDecode(text);
      if (decoded is! Map) return <String, String>{};
      return {
        for (final entry in decoded.entries)
          if ('${entry.key}'.trim().isNotEmpty && (entry.value == 'arrived' || entry.value == 'no_show')) '${entry.key}': '${entry.value}',
      };
    } catch (_) {
      return <String, String>{}; // a value of another kind under the key: nothing kept
    }
  }

  Set<String> _readIds(SharedPreferences prefs, String key) {
    try {
      return (prefs.getStringList(key) ?? const <String>[]).where((id) => id.trim().isNotEmpty).toSet();
    } catch (_) {
      return <String>{}; // a value of another kind under the key: nothing kept
    }
  }

  bool _readNews(SharedPreferences prefs) {
    try {
      return prefs.getBool(tourismMyVisitNewsKey) ?? false;
    } catch (_) {
      return false; // a value of another kind under the key: no news
    }
  }

  MobileUserProfile _readProfile(SharedPreferences prefs) {
    try {
      final text = prefs.getString(tourismProfileKey);
      if (text == null) return MobileUserProfile.guest();
      final decoded = jsonDecode(text);
      if (decoded is! Map) return MobileUserProfile.guest();
      return MobileUserProfile.fromStoredJson(Map<String, dynamic>.from(decoded)) ?? MobileUserProfile.guest();
    } catch (_) {
      return MobileUserProfile.guest();
    }
  }
}

/// A destination for a receipt that was kept: it knows its id and its NAME (all that a pass and a feedback card show). Where the destination is
/// still in the bootstrap, [resolveDestination] swaps in the real one; where it is not, this one is shown and the pass is not broken.
Destination keptDestination(int id, String name) {
  final clean = cleanDestinationName(name);
  return Destination(
    id: id,
    name: clean,
    type: 'Tourism Site',
    location: 'Mauban, Quezon',
    description: '',
    rating: 0,
    imageKey: getImageKeyFromName(clean),
    monthlyArrivals: 0,
    hasMayorPermit: false,
    access: '',
    latitude: 0,
    longitude: 0,
  );
}

/// The destination of the bootstrap with this id, or [kept] when it is no longer there (or the bootstrap has not come yet).
Destination resolveDestination(Destination kept, List<Destination>? destinations) {
  if (destinations == null) return kept;
  for (final destination in destinations) {
    if (destination.id == kept.id) return destination;
  }
  return kept;
}
