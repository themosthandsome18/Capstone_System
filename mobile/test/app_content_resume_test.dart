// The quiet refresh when the app comes back to the foreground. The rule that matters most: when the server does NOT answer, NOTHING changes - no failed state, no
// error panel, not one text taken from the screen. When it answers, the data and the saved copy are replaced. Not before five minutes since the last good
// answer, and never two requests at once. The launch and "Try again" are not changed (their own tests are untouched). Every test that has a fixture asserts,
// inside the test, that the fixture reached the case it is for.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Map<String, dynamic> realContent() => jsonDecode(File('test/data/app_content_commit3.json').readAsStringSync()) as Map<String, dynamic>;

/// The real appContent with every text prefixed, so a test can tell which answer a text came from.
Map<String, dynamic> contentOf(String tag) {
  final content = realContent();
  for (final block in (content['blocks'] as Map<String, dynamic>).values) {
    for (final field in (block as Map<String, dynamic>).keys.toList()) {
      block[field] = (block[field] as String).split('\n').map((l) => 'SERVER $tag $l').join('\n');
    }
  }
  for (final section in (content['sections'] as Map<String, dynamic>).values) {
    for (final item in (section as List).cast<Map<String, dynamic>>()) {
      item['title'] = 'SERVER $tag ${item['title']}';
      item['short_text'] = 'SERVER $tag ${item['short_text']}';
    }
  }
  return content;
}

/// The text of one answer of the server: [destinations] places and the texts of [tag].
String answer(String tag, {int destinations = 2}) {
  final map = bootstrapJson(destinations);
  for (final key in ['destinations', 'featuredDestinations']) {
    (map[key] as List).first['resort_name'] = 'Beach of $tag'; // the first place carries the tag of the answer
  }
  map['appContent'] = contentOf(tag);
  return jsonEncode(map);
}

/// Answers from a script (one step per request; the last repeats). A step is a function so that it can wait, fail, or answer.
class Scripted extends TourismApi {
  Scripted(this.steps);

  final List<FutureOr<String> Function()> steps;
  int asked = 0;

  @override
  Future<String> fetchBootstrapRaw() {
    final step = steps[min(asked, steps.length - 1)];
    asked++;
    return Future<String>.sync(step);
  }
}

FutureOr<String> Function() ok(String raw) => () => raw;
FutureOr<String> Function() fails(Object error) =>
    () => Future<String>.error(error);

var clock = DateTime(2026, 10, 28, 12);

void ignoreOverflow() {
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

Future<void> openHome(WidgetTester tester, TourismApi api, {TourismBootstrapCache cache = const TourismBootstrapCache()}) async {
  ignoreOverflow();
  tester.view.physicalSize = const Size(411, 3500);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(const SizedBox()); // a clean start, also when a test opens the app more than once
  await tester.pumpWidget(MaterialApp(home: AppBootstrap(api: api, cache: cache, now: () => clock)));
  await tester.pump();
  await tester.tap(find.text('Skip'));
  await tester.pump();
  await tester.tap(find.text("I'm a Tourist / Visitor"));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1500));
  await tester.pump();
}

/// The app goes to the background and comes back, the way the system does it.
Future<void> background(WidgetTester tester) async {
  for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused]) {
    tester.binding.handleAppLifecycleStateChanged(s);
  }
  await tester.pump();
}

Future<void> comeBack(WidgetTester tester) async {
  for (final s in [AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
    tester.binding.handleAppLifecycleStateChanged(s);
  }
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

/// Away for [minutes] and back.
Future<void> awayAndBack(WidgetTester tester, {required int minutes, int seconds = 0}) async {
  await background(tester);
  clock = clock.add(Duration(minutes: minutes, seconds: seconds));
  await comeBack(tester);
}

/// Every text on the screen.
List<String> allTexts() => [
  for (final e in find.byType(Text, skipOffstage: false).evaluate())
    if ((e.widget as Text).data != null) (e.widget as Text).data!,
]..sort();

bool shows(String text) => find.text(text).evaluate().isNotEmpty;

Future<String?> savedRaw(WidgetTester tester) async {
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
  return (await SharedPreferences.getInstance()).getString(tourismBootstrapCacheKey);
}

const greetingA = 'SERVER A Mabuhay, Explorer! 🌊';
const greetingB = 'SERVER B Mabuhay, Explorer! 🌊';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    clock = DateTime(2026, 10, 28, 12);
  });

  group('the server does NOT answer: nothing changes', () {
    testWidgets('every kind of failure leaves ALL the texts on the screen, and no error panel', (tester) async {
      final failures = <String, Object>{
        'no internet': const SocketException('no internet'),
        'a timeout': TimeoutException('too slow'),
        'a server error': const ApiException(statusCode: 500, message: 'boom'),
        'an answer that is not JSON': const FormatException('not json'),
      };
      var reached = 0;
      for (final entry in failures.entries) {
        final api = Scripted([ok(answer('A')), fails(entry.value)]);
        await openHome(tester, api);
        expect(shows(greetingA), isTrue, reason: '${entry.key}: the launch answered'); // the fixture
        final before = allTexts();
        expect(before.length, greaterThan(30)); // the fixture: the screen really is full
        await awayAndBack(tester, minutes: 6);
        expect(api.asked, 2, reason: '${entry.key}: the quiet refresh did ask'); // the fixture: it asked, and failed
        expect(allTexts(), before, reason: '${entry.key}: not one text moved');
        expect(find.byType(BootstrapErrorPanel), findsNothing, reason: entry.key);
        expect(find.byType(SavedInfoNotice), findsNothing, reason: entry.key);
        expect(find.text("Can't reach the server."), findsNothing);
        expect(find.text('The server is having a problem.'), findsNothing);
        reached++;
      }
      expect(reached, failures.length);
    });

    testWidgets('a failed refresh does not stop the next one: it asks again at the next return', (tester) async {
      final api = Scripted([ok(answer('A')), fails(const SocketException('no')), ok(answer('B'))]);
      await openHome(tester, api);
      await awayAndBack(tester, minutes: 6);
      expect(api.asked, 2); // failed
      expect(shows(greetingA), isTrue);
      await awayAndBack(tester, minutes: 0, seconds: 30); // the last GOOD answer is still the launch: six minutes ago
      expect(api.asked, 3); // so it asks again, and now it answers
      expect(shows(greetingB), isTrue);
      expect(shows(greetingA), isFalse);
    });

    testWidgets('a failure in the middle of the data leaves the saved copy as it was', (tester) async {
      final first = answer('A');
      final api = Scripted([ok(first), fails(const SocketException('no'))]);
      await openHome(tester, api);
      expect(await savedRaw(tester), first); // the fixture: the launch saved it
      await awayAndBack(tester, minutes: 6);
      expect(await savedRaw(tester), first);
    });
  });

  group('the server answers: the texts and the saved copy are replaced', () {
    testWidgets('new texts, new data, new saved copy', (tester) async {
      final first = answer('A', destinations: 2);
      final second = answer('B', destinations: 3);
      final api = Scripted([ok(first), ok(second)]);
      await openHome(tester, api);
      expect(shows(greetingA), isTrue); // the fixture
      expect(find.text('Beach of A'), findsWidgets);
      expect(await savedRaw(tester), first);
      await awayAndBack(tester, minutes: 6);
      expect(api.asked, 2);
      expect(shows(greetingB), isTrue);
      expect(shows(greetingA), isFalse);
      expect(shows('SERVER B Why Visit Mauban, Quezon?'), isTrue);
      expect(find.text('Beach of B'), findsWidgets); // the data changed too
      expect(find.text('Beach of A'), findsNothing);
      expect(await savedRaw(tester), second);
    });

    testWidgets('the theme the server sent is put on', (tester) async {
      final map = jsonDecode(answer('A')) as Map<String, dynamic>;
      map['theme'] = {'primary_color': '#EF7C1F', 'mobile_follows_web': true, 'mobile_primary_color': ''};
      final api = Scripted([ok(answer('A')), ok(jsonEncode(map))]);
      final notifier = ValueNotifier<TourismTheme>(TourismTheme.none);
      addTearDown(notifier.dispose);
      ignoreOverflow();
      tester.view.physicalSize = const Size(411, 3500);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        TourismThemeScope(
          notifier: notifier,
          child: MaterialApp(home: AppBootstrap(api: api, now: () => clock)),
        ),
      );
      await tester.pump();
      await tester.tap(find.text('Skip'));
      await tester.pump();
      await tester.tap(find.text("I'm a Tourist / Visitor"));
      await tester.pump(const Duration(milliseconds: 1500));
      expect(notifier.value.primaryColor, isNull); // the fixture: the launch had no colour
      await awayAndBack(tester, minutes: 6);
      expect(notifier.value.primaryColor, '#EF7C1F');
    });

    testWidgets('after a launch that could not ask, the first return that works recovers the screen', (tester) async {
      final api = Scripted([fails(const SocketException('no')), ok(answer('B'))]);
      await openHome(tester, api);
      expect(find.byType(BootstrapErrorPanel), findsOneWidget); // the fixture: the launch failed and says so
      expect(shows(greetingB), isFalse);
      await awayAndBack(tester, minutes: 0, seconds: 10); // no good answer yet, so there is nothing to wait five minutes for
      expect(api.asked, 2);
      expect(shows(greetingB), isTrue);
      expect(find.byType(BootstrapErrorPanel), findsNothing);
    });

    testWidgets('and a return that does not work leaves that screen exactly as it was', (tester) async {
      final api = Scripted([fails(const SocketException('no')), fails(const SocketException('still no'))]);
      await openHome(tester, api);
      final before = allTexts();
      expect(find.byType(BootstrapErrorPanel), findsOneWidget); // the fixture
      await awayAndBack(tester, minutes: 1);
      expect(api.asked, 2);
      expect(allTexts(), before);
      expect(find.byType(BootstrapErrorPanel), findsOneWidget);
    });
  });

  group('not before five minutes since the last good answer', () {
    testWidgets('4 minutes 59 seconds: no request; 5 minutes: a request', (tester) async {
      final api = Scripted([ok(answer('A')), ok(answer('B'))]);
      await openHome(tester, api);
      expect(api.asked, 1); // the fixture: the launch
      await awayAndBack(tester, minutes: 4, seconds: 59);
      expect(api.asked, 1);
      expect(shows(greetingA), isTrue);
      await awayAndBack(tester, minutes: 0, seconds: 1); // five minutes exactly since the launch's answer
      expect(api.asked, 2);
      expect(shows(greetingB), isTrue);
    });

    testWidgets('many quick returns: still one launch request', (tester) async {
      final api = Scripted([ok(answer('A'))]);
      await openHome(tester, api);
      for (var i = 0; i < 6; i++) {
        await awayAndBack(tester, minutes: 0, seconds: 20);
      }
      expect(api.asked, 1);
    });

    testWidgets('the five minutes count from the last GOOD answer: after a quiet one, a new wait', (tester) async {
      final api = Scripted([ok(answer('A')), ok(answer('B')), ok(answer('C'))]);
      await openHome(tester, api);
      await awayAndBack(tester, minutes: 5); // asks (2)
      expect(api.asked, 2);
      await awayAndBack(tester, minutes: 4, seconds: 59);
      expect(api.asked, 2);
      await awayAndBack(tester, minutes: 0, seconds: 1);
      expect(api.asked, 3);
      expect(shows('SERVER C Mabuhay, Explorer! 🌊'), isTrue);
    });

    testWidgets('the time of "Try again" counts too: a good answer from it is a good answer', (tester) async {
      final api = Scripted([fails(const SocketException('no')), ok(answer('B')), ok(answer('C'))]);
      await openHome(tester, api);
      await tester.tap(find.text('Try again').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(api.asked, 2);
      expect(shows(greetingB), isTrue); // the fixture: Try again recovered it
      await awayAndBack(tester, minutes: 2);
      expect(api.asked, 2); // two minutes after a good answer: not yet
    });

    testWidgets('only the return to the foreground asks: going away, or being covered, does not', (tester) async {
      final api = Scripted([ok(answer('A')), ok(answer('B'))]);
      await openHome(tester, api);
      clock = clock.add(const Duration(minutes: 30));
      for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused, AppLifecycleState.hidden, AppLifecycleState.inactive]) {
        tester.binding.handleAppLifecycleStateChanged(s);
        await tester.pump();
      }
      expect(api.asked, 1);
    });
  });

  group('never two requests at once', () {
    testWidgets('two returns while the first quiet request is still out: one request', (tester) async {
      final late = Completer<String>();
      final api = Scripted([ok(answer('A')), () => late.future]);
      await openHome(tester, api);
      await awayAndBack(tester, minutes: 6);
      expect(api.asked, 2); // the fixture: the first quiet request is out and waiting
      await awayAndBack(tester, minutes: 6);
      await awayAndBack(tester, minutes: 6);
      expect(api.asked, 2);
      late.complete(answer('B'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(shows(greetingB), isTrue);
      expect(api.asked, 2);
    });

    testWidgets('the request of the launch is still out (a saved copy is on screen): the return does not add another', (tester) async {
      final saved = answer('A');
      SharedPreferences.setMockInitialValues({
        tourismBootstrapCacheKey: saved,
        tourismBootstrapSavedAtKey: clock.subtract(const Duration(days: 1)).millisecondsSinceEpoch,
      });
      final launch = Completer<String>();
      final api = Scripted([() => launch.future, ok(answer('C'))]);
      await openHome(tester, api);
      expect(shows(greetingA), isTrue); // the fixture: the saved copy is on screen while the launch asks
      expect(api.asked, 1);
      await awayAndBack(tester, minutes: 10);
      expect(api.asked, 1);
      launch.complete(answer('B'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(shows(greetingB), isTrue);
      expect(api.asked, 1);
    });

    testWidgets('while "Try again" is asking, the return does not ask as well', (tester) async {
      final retry = Completer<String>();
      final api = Scripted([fails(const SocketException('no')), () => retry.future]);
      await openHome(tester, api);
      await tester.tap(find.text('Try again').first);
      await tester.pump();
      expect(api.asked, 2); // the fixture: Try again is out
      await awayAndBack(tester, minutes: 10);
      expect(api.asked, 2);
      retry.complete(answer('B'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(shows(greetingB), isTrue);
    });
  });

  group('what the person is doing is not disturbed', () {
    testWidgets('text typed in the search box stays when the data is replaced', (tester) async {
      final api = Scripted([ok(answer('A')), ok(answer('B'))]);
      await openHome(tester, api);
      final box = find.byType(TextField).first;
      await tester.enterText(box, 'Sample');
      await tester.pump();
      expect(tester.widget<TextField>(box).controller?.text ?? 'Sample', 'Sample'); // the fixture
      await awayAndBack(tester, minutes: 6);
      expect(shows(greetingB), isTrue); // the data really was replaced
      expect(find.text('Sample'), findsWidgets);
      expect(find.byType(TextField).first, findsOneWidget);
    });

    testWidgets('the registration form open on top is not touched: what is typed stays, nothing breaks', (tester) async {
      final api = Scripted([ok(answer('A')), ok(answer('B', destinations: 5))]);
      await openHome(tester, api);
      await tester.tap(find.text('My Visit'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      final register = find.text('Register / Get Pass');
      await tester.ensureVisible(register);
      await tester.tap(register);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      final field = find.byType(TextField).first;
      expect(field, findsOneWidget); // the fixture: the form is open
      await tester.enterText(field, 'Ana Cruz');
      await tester.pump();
      await awayAndBack(tester, minutes: 6);
      expect(api.asked, 2); // the data was replaced under the form
      expect(find.text('Ana Cruz'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('the app leaves', () {
    testWidgets('after the screen is gone, a return asks for nothing and breaks nothing', (tester) async {
      final api = Scripted([ok(answer('A')), ok(answer('B'))]);
      await openHome(tester, api);
      await tester.pumpWidget(const SizedBox());
      await awayAndBack(tester, minutes: 10);
      expect(api.asked, 1);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the screen goes away while the quiet request is out: its answer is ignored', (tester) async {
      final late = Completer<String>();
      final api = Scripted([ok(answer('A')), () => late.future]);
      await openHome(tester, api);
      await awayAndBack(tester, minutes: 6);
      expect(api.asked, 2); // the fixture: out and waiting
      await tester.pumpWidget(const SizedBox());
      late.complete(answer('B'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  });
}
