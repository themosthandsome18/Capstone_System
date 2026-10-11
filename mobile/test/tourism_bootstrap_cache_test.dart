// The saved copy of the tourism bootstrap: what is written, when it is shown
// at once, when it is thrown away, and what the user is (not) told.
//
// A saved copy is shown immediately while the server is asked again. The
// answer replaces it silently; only a failed refresh says anything, and only
// as one small line, never the error panel (there is data to look at).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_errors_test.dart' show SequenceApi, fails;
import 'tourism_bootstrap_states_test.dart'
    show bootstrapJson, bootstrapWith, expectNoEmptyMessage, openHome;

const connectionTitle = "Can't reach the server.";
const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String rawWith(int count) => jsonEncode(bootstrapJson(count));

/// The saved-info line as the user reads it, for a copy saved at [savedAt].
String savedLine(DateTime savedAt, {bool refreshing = false}) {
  final day = '${months[savedAt.month - 1]} ${savedAt.day}';
  final date = savedAt.year == DateTime.now().year
      ? day
      : '$day, ${savedAt.year}';
  return refreshing
      ? 'Showing saved info from $date. Refreshing...'
      : "Showing saved info from $date. Couldn't refresh.";
}

void seedCache(String raw, DateTime savedAt) {
  SharedPreferences.setMockInitialValues({
    tourismBootstrapCacheKey: raw,
    tourismBootstrapSavedAtKey: savedAt.millisecondsSinceEpoch,
  });
}

Future<({String? raw, int? savedAt})> savedCopy() async {
  final prefs = await SharedPreferences.getInstance();
  return (
    raw: prefs.getString(tourismBootstrapCacheKey),
    savedAt: prefs.getInt(tourismBootstrapSavedAtKey),
  );
}

int destinationCount(String raw) =>
    (jsonDecode(raw) as Map<String, dynamic>)['destinations'].length as int;

/// A cache whose read finishes only when the test says so.
class SlowCache extends TourismBootstrapCache {
  final release = Completer<void>();

  @override
  Future<CachedBootstrap?> read({DateTime? now}) async {
    await release.future;
    return super.read(now: now);
  }
}

TourismBootstrapState shellState(WidgetTester tester) =>
    tester.widget<MobileShell>(find.byType(MobileShell)).state;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('TourismBootstrapCache', () {
    const cache = TourismBootstrapCache();

    test('writes the text and the time under the two keys', () async {
      final at = DateTime(2026, 10, 11, 8);
      await cache.write(rawWith(2), now: at);

      final saved = await savedCopy();
      expect(saved.raw, rawWith(2));
      expect(saved.savedAt, at.millisecondsSinceEpoch);
    });

    test('reads back what was written, with its age', () async {
      final at = DateTime(2026, 10, 11, 8);
      await cache.write(rawWith(2), now: at);

      final read = await cache.read(now: at.add(const Duration(hours: 5)));
      expect(read, isNotNull);
      expect(read!.bootstrap.destinations, hasLength(2));
      expect(read.savedAt, at);
      expect(read.age, const Duration(hours: 5));
    });

    test('nothing saved is null', () async {
      expect(await cache.read(), isNull);
    });

    test('7 days is still usable; past 7 days is not, and is removed', () async {
      final at = DateTime(2026, 10, 1, 8);
      await cache.write(rawWith(2), now: at);

      expect(
        await cache.read(now: at.add(const Duration(days: 7))),
        isNotNull,
      );
      expect(
        await cache.read(
          now: at.add(const Duration(days: 7, seconds: 1)),
        ),
        isNull,
      );
      final saved = await savedCopy();
      expect(saved.raw, isNull);
      expect(saved.savedAt, isNull);
    });

    test('a copy saved in the future (clock moved) is not trusted', () async {
      final at = DateTime(2026, 10, 11, 8);
      await cache.write(rawWith(2), now: at);

      expect(
        await cache.read(now: at.subtract(const Duration(days: 1))),
        isNull,
      );
    });

    test('bad copies are thrown away: not JSON, wrong shape, no time', () async {
      for (final raw in ['not json', '[]', '{"referenceTables":"oops"}']) {
        final at = DateTime.now();
        seedCache(raw, at);
        expect(await cache.read(now: at), isNull, reason: raw);
        final saved = await savedCopy();
        expect(saved.raw, isNull, reason: raw);
        expect(saved.savedAt, isNull, reason: raw);
      }

      SharedPreferences.setMockInitialValues({
        tourismBootstrapCacheKey: rawWith(2),
      });
      expect(await cache.read(), isNull);
    });

    test('the saved text is the bootstrap response and nothing else', () async {
      // Nothing but the response text and a time is written.
      await cache.write(rawWith(1));
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), {
        tourismBootstrapCacheKey,
        tourismBootstrapSavedAtKey,
      });
    });
  });

  group('first launch, no saved copy', () {
    testWidgets('skeleton, then loaded, and the copy is written', (
      tester,
    ) async {
      final answer = Completer<MobileBootstrap>();
      await openHome(tester, SequenceApi([() => answer.future]));

      expect(find.byType(DestinationListSkeleton), findsOneWidget);
      expect((await savedCopy()).raw, isNull);

      answer.complete(bootstrapWith(3));
      await tester.pump();
      await tester.pump();

      expect(find.byType(DestinationListSkeleton), findsNothing);
      expect(find.text('Sample Beach 1'), findsWidgets);
      expect(shellState(tester).fromCache, isFalse);

      final saved = await savedCopy();
      expect(saved.raw, isNotNull);
      expect(destinationCount(saved.raw!), 3);
      expect(saved.savedAt, isNotNull);
    });

    testWidgets('the server failing is the error panel, and nothing saved', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(connectionTitle), findsOneWidget);
      expect(find.textContaining('Showing saved info'), findsNothing);
      expect((await savedCopy()).raw, isNull);
    });
  });

  group('second launch, with a saved copy', () {
    testWidgets('shown at once: loaded from cache, no skeleton', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(hours: 3));
      seedCache(rawWith(2), savedAt);
      final never = Completer<MobileBootstrap>();
      await openHome(tester, SequenceApi([() => never.future]));

      expect(find.byType(FeaturedCarouselSkeleton), findsNothing);
      expect(find.byType(DestinationListSkeleton), findsNothing);
      expect(find.text('Sample Beach 1'), findsWidgets);
      expect(find.textContaining('Showing saved info'), findsNothing);
      expect(find.text(connectionTitle), findsNothing);
      expectNoEmptyMessage();

      final state = shellState(tester);
      expect(state.isLoaded, isTrue);
      expect(state.fromCache, isTrue);
      expect(state.age, isNotNull);
      expect(state.age!.inHours, 3);
    });

    testWidgets('the refresh replaces data and copy, with no banner', (
      tester,
    ) async {
      seedCache(rawWith(2), DateTime.now().subtract(const Duration(days: 1)));
      final answer = Completer<MobileBootstrap>();
      await openHome(tester, SequenceApi([() => answer.future]));
      expect(shellState(tester).destinations, hasLength(2));

      answer.complete(bootstrapWith(3));
      await tester.pump();
      await tester.pump();

      expect(shellState(tester).destinations, hasLength(3));
      expect(find.textContaining('Showing saved info'), findsNothing);
      expect(find.text('Try again'), findsNothing);
      expect(shellState(tester).fromCache, isFalse);

      final saved = await savedCopy();
      expect(destinationCount(saved.raw!), 3);
      expect(
        DateTime.fromMillisecondsSinceEpoch(saved.savedAt!)
            .difference(DateTime.now())
            .inMinutes
            .abs(),
        lessThan(2),
      );
    });

    testWidgets('a failed refresh keeps the data and adds one small line', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(days: 2));
      seedCache(rawWith(2), savedAt);
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text('Sample Beach 1'), findsWidgets);
      expect(find.text(savedLine(savedAt)), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      // Not the whole error panel: there is data to look at.
      expect(find.text(connectionTitle), findsNothing);
      expect(find.text('Check your internet connection, then try again.'),
          findsNothing);
      expectNoEmptyMessage();
      // The copy on disk is the one that was saved, not touched.
      expect(destinationCount((await savedCopy()).raw!), 2);
      expect(shellState(tester).fromCache, isTrue);
    });

    testWidgets('the server answering badly (5xx) is the same line', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(days: 1));
      seedCache(rawWith(2), savedAt);
      await openHome(
        tester,
        SequenceApi([
          fails(const ApiException(statusCode: 503, message: 'down')),
        ]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(savedLine(savedAt)), findsOneWidget);
      expect(find.text('The server is having a problem.'), findsNothing);
    });

    testWidgets('Try again from the saved copy: refreshing, then fresh', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(days: 2));
      seedCache(rawWith(2), savedAt);
      final second = Completer<MobileBootstrap>();
      await openHome(
        tester,
        SequenceApi([
          fails(const SocketException('no route')),
          () => second.future,
        ]),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text(savedLine(savedAt)), findsOneWidget);

      await tester.tap(find.text('Try again'));
      await tester.pump();

      // The copy stays on screen; the line says it is refreshing, no button.
      expect(find.text('Sample Beach 1'), findsWidgets);
      expect(find.text(savedLine(savedAt, refreshing: true)), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
      expect(find.byType(DestinationListSkeleton), findsNothing);

      second.complete(bootstrapWith(3));
      await tester.pump();
      await tester.pump();

      expect(shellState(tester).destinations, hasLength(3));
      expect(shellState(tester).fromCache, isFalse);
      expect(find.textContaining('Showing saved info'), findsNothing);
      expect(destinationCount((await savedCopy()).raw!), 3);
    });

    testWidgets('Try again from the saved copy failing again: the line is back', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(days: 2));
      seedCache(rawWith(2), savedAt);
      await openHome(
        tester,
        SequenceApi([
          fails(const SocketException('no route')),
          fails(const SocketException('no route')),
        ]),
      );
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Try again'));
      await tester.pump();
      await tester.pump();

      expect(find.text(savedLine(savedAt)), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text(connectionTitle), findsNothing);
    });

    testWidgets('Explore and Map show the same line', (tester) async {
      final savedAt = DateTime.now().subtract(const Duration(days: 2));
      seedCache(rawWith(2), savedAt);
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Explore'));
      await tester.pump();
      expect(find.text(savedLine(savedAt)), findsOneWidget);

      await tester.tap(find.text('Map'));
      await tester.pump();
      expect(find.text(savedLine(savedAt)), findsOneWidget);
    });
  });

  group('the server and the saved copy race', () {
    testWidgets('a good answer before the copy is read: the copy never shows', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(hours: 1));
      seedCache(rawWith(2), savedAt);
      final slow = SlowCache();
      await openHome(
        tester,
        SequenceApi([() => Future.value(bootstrapWith(3))]),
        cache: slow,
      );
      await tester.pump();
      await tester.pump();
      expect(shellState(tester).destinations, hasLength(3));
      expect(shellState(tester).fromCache, isFalse);

      // The read of the saved copy finishes after the fresh answer is shown.
      slow.release.complete();
      await tester.pump();
      await tester.pump();

      expect(shellState(tester).destinations, hasLength(3));
      expect(shellState(tester).fromCache, isFalse);
    });

    testWidgets('a failure waits for the copy, then keeps it on screen', (
      tester,
    ) async {
      final savedAt = DateTime.now().subtract(const Duration(hours: 1));
      seedCache(rawWith(2), savedAt);
      final slow = SlowCache();
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
        cache: slow,
      );
      await tester.pump();
      await tester.pump();
      // Not decided yet: the copy has not been read, so no error panel yet.
      expect(find.text(connectionTitle), findsNothing);

      slow.release.complete();
      await tester.pump();
      await tester.pump();

      expect(find.text(connectionTitle), findsNothing);
      expect(find.text(savedLine(savedAt)), findsOneWidget);
      expect(shellState(tester).destinations, hasLength(2));
    });
  });

  group('a copy that cannot be used', () {
    testWidgets('older than 7 days and the server fails: the error panel', (
      tester,
    ) async {
      seedCache(rawWith(2), DateTime.now().subtract(const Duration(days: 8)));
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(connectionTitle), findsOneWidget);
      expect(find.text('Sample Beach 1'), findsNothing);
      expect(find.textContaining('Showing saved info'), findsNothing);
      expect((await savedCopy()).raw, isNull);
    });

    testWidgets('older than 7 days is not shown while waiting either', (
      tester,
    ) async {
      seedCache(rawWith(2), DateTime.now().subtract(const Duration(days: 8)));
      final never = Completer<MobileBootstrap>();
      await openHome(tester, SequenceApi([() => never.future]));

      expect(find.byType(DestinationListSkeleton), findsOneWidget);
      expect(find.text('Sample Beach 1'), findsNothing);
    });

    for (final raw in ['not json at all', '[]', '{"referenceTables":"oops"}']) {
      testWidgets('a broken copy ($raw): thrown away, like no copy', (
        tester,
      ) async {
        seedCache(raw, DateTime.now());
        final answer = Completer<MobileBootstrap>();
        await openHome(tester, SequenceApi([() => answer.future]));

        // Waiting, not crashed, not showing the broken copy.
        expect(find.byType(DestinationListSkeleton), findsOneWidget);
        expectNoEmptyMessage();

        answer.complete(bootstrapWith(3));
        await tester.pump();
        await tester.pump();

        expect(find.text('Sample Beach 1'), findsWidgets);
        expect(destinationCount((await savedCopy()).raw!), 3);
      });
    }

    testWidgets('a broken copy and the server failing: the error panel', (
      tester,
    ) async {
      seedCache('not json at all', DateTime.now());
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(connectionTitle), findsOneWidget);
      expect((await savedCopy()).raw, isNull);
    });
  });
}
