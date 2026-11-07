// "View on map" on Destination Details is a real button: it takes the visitor to the Map tab (Maps & Guides), centred on that destination,
// with its box already open, as when its pin is tapped. A destination with no place on the map is not offered as a button.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:mauban_mobile_app/main.dart';

const alpha = {
  'resort_id': 1,
  'resort_name': 'Alpha Beach',
  'type': 'Beach Resort',
  'location': 'Cagbalete, Mauban',
  'latitude': 14.20,
  'longitude': 121.70,
};
const bravo = {
  'resort_id': 2,
  'resort_name': 'Bravo Cove',
  'type': 'Beach Resort',
  'location': 'Lamon Bay, Mauban',
  'latitude': 14.31,
  'longitude': 121.88,
};
const nowhere = {
  'resort_id': 3,
  'resort_name': 'Nowhere Place',
  'type': 'Heritage',
  'location': 'Mauban',
  'latitude': 0,
  'longitude': 0,
};

Destination dest(Map<String, Object?> json) => Destination.fromJson(json);

MobileBootstrap bootstrap() => MobileBootstrap.fromJson({
  'destinations': [alpha, bravo, nowhere],
  'featuredDestinations': [alpha, bravo],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 1800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('HTTP request failed') || text.contains('NetworkImage')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

/// Every HTTP call (the destination's reviews, the map tiles) is answered by a mock: nothing reaches a real server.
Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async {
    if (request.url.path.contains('/mobile/tourism/destinations/')) {
      return http.Response(jsonEncode({'destination': alpha, 'recentFeedback': []}), 200);
    }
    return http.Response('', 404);
  }),
);

Finder viewOnMap() => find.widgetWithText(ListTile, 'View on map');

LatLng centreOf(WidgetTester tester) {
  final map = tester.widget<FlutterMap>(find.byType(FlutterMap));
  return map.mapController!.camera.center;
}

Finder boxOf(String name) => find.descendant(of: find.byType(Stack), matching: find.text(name));

void main() {
  group('the card', () {
    Widget card({VoidCallback? onTap, Map<String, Object?> json = alpha}) => MaterialApp(
      home: Scaffold(body: LocationCard(destination: dest(json), onViewOnMap: onTap)),
    );

    testWidgets('pressing it asks to show the destination on the map', (tester) async {
      var pressed = 0;
      await tester.pumpWidget(card(onTap: () => pressed++));
      await tester.tap(viewOnMap());
      expect(pressed, 1);
    });

    testWidgets('it is a real button: a ListTile with onTap, not a tap on a Container', (tester) async {
      await tester.pumpWidget(card(onTap: () {}));
      final tile = tester.widget<ListTile>(viewOnMap());
      expect(tile.onTap, isNotNull);
      expect(tile.enabled, isTrue);
      expect(find.descendant(of: find.byType(LocationCard), matching: find.byType(InkWell)), findsOneWidget);
    });

    testWidgets('the keyboard reaches it and Enter presses it', (tester) async {
      var pressed = 0;
      await tester.pumpWidget(card(onTap: () => pressed++));
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pump();
      expect(pressed, 1);
    });

    testWidgets('a screen reader hears a button with a label that names the destination, and can press it', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(card(onTap: () {}));
      expect(
        tester.getSemantics(find.bySemanticsLabel('View Alpha Beach on the map')),
        isSemantics(
          label: 'View Alpha Beach on the map',
          isButton: true,
          hasEnabledState: true,
          isEnabled: true,
          hasTapAction: true,
        ),
      );
      handle.dispose();
    });

    testWidgets('a destination with no place on the map is not a button, and says why', (tester) async {
      var pressed = 0;
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(card(onTap: () => pressed++, json: nowhere));
      expect(find.text('View on map'), findsNothing);
      expect(find.text('Not on the map yet'), findsOneWidget);
      expect(find.text('This destination has no map location yet.'), findsOneWidget);
      final tile = tester.widget<ListTile>(find.byType(ListTile));
      expect(tile.onTap, isNull);
      expect(tile.enabled, isFalse);
      await tester.tap(find.byType(ListTile), warnIfMissed: false);
      expect(pressed, 0);
      expect(find.bySemanticsLabel(RegExp('^View .* on the map')), findsNothing);
      handle.dispose();
    });

    testWidgets('with nothing to do (no callback) it only shows where the destination is', (tester) async {
      await tester.pumpWidget(card());
      expect(tester.widget<ListTile>(find.byType(ListTile)).onTap, isNull);
      expect(find.text('14.2, 121.7'), findsOneWidget);
    });
  });

  group('the Map tab', () {
    Future<void> pump(WidgetTester tester, {MapFocusRequest? focus}) async {
      bigScreen(tester);
      await mocked(() async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TourismMapPage(
                destinations: bootstrap().destinations,
                onOpenDestination: (_) {},
                focus: focus,
              ),
            ),
          ),
        );
        await tester.pump();
      });
    }

    testWidgets('without a request it is the whole of Mauban, with no box', (tester) async {
      await pump(tester);
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.185, 0.0001));
      expect(centre.longitude, closeTo(121.731, 0.0001));
      expect(find.text('View'), findsNothing);
    });

    testWidgets('with a request it ends centred on that destination, close in', (tester) async {
      await pump(tester, focus: MapFocusRequest(dest(bravo)));
      await tester.pump(mapFocusDuration + const Duration(milliseconds: 100));
      final camera = tester.widget<FlutterMap>(find.byType(FlutterMap)).mapController!.camera;
      expect(camera.center.latitude, closeTo(14.31, 0.0001));
      expect(camera.center.longitude, closeTo(121.88, 0.0001));
      expect(camera.zoom, closeTo(mapFocusZoom, 0.0001));
    });

    // The names also stand in the list of places under the map (once each): the box is the second time.
    testWidgets('with a request its box is open: name, place and the View button', (tester) async {
      await pump(tester, focus: MapFocusRequest(dest(bravo)));
      expect(find.text('Bravo Cove'), findsNWidgets(2), reason: 'the list and the box');
      expect(find.text('Lamon Bay, Mauban'), findsNWidgets(2));
      expect(find.text('View'), findsOneWidget);
      expect(find.text('Alpha Beach'), findsOneWidget, reason: 'only in the list: no box for the other destination');
    });

    testWidgets('a request that comes while the map is open moves the map and opens the box', (tester) async {
      await pump(tester);
      await mocked(() async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TourismMapPage(
                destinations: bootstrap().destinations,
                onOpenDestination: (_) {},
                focus: MapFocusRequest(dest(alpha)),
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(mapFocusDuration + const Duration(milliseconds: 100));
      });
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.20, 0.0001));
      expect(centre.longitude, closeTo(121.70, 0.0001));
      expect(find.text('Alpha Beach'), findsNWidgets(2), reason: 'the list and the box');
      expect(find.text('Bravo Cove'), findsOneWidget, reason: 'only in the list');
      expect(find.text('View'), findsOneWidget);
    });

    testWidgets('a destination with no place on the map does not crash and is not shown', (tester) async {
      await pump(tester, focus: MapFocusRequest(dest(nowhere)));
      expect(tester.takeException(), isNull);
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.185, 0.0001));
      expect(find.text('Nowhere Place'), findsOneWidget, reason: 'in the list only: no box was opened for it');
      expect(find.text('View'), findsNothing);
    });
  });

  group('the trip and the scroll', () {
    // Alpha and Bravo, and twelve more places, so that the list under the map is long enough to scroll.
    List<Destination> many() => [
      dest(alpha),
      dest(bravo),
      for (var i = 0; i < 12; i++)
        dest({
          'resort_id': 100 + i,
          'resort_name': 'Filler Place $i',
          'type': 'Beach Resort',
          'location': 'Mauban',
          'latitude': 14.15 + i * 0.01,
          'longitude': 121.6 + i * 0.01,
        }),
    ];

    Widget page({MapFocusRequest? focus, bool reduceMotion = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(size: const Size(411, 700), disableAnimations: reduceMotion),
        child: Scaffold(
          body: TourismMapPage(destinations: many(), onOpenDestination: (_) {}, focus: focus),
        ),
      ),
    );

    Future<void> pumpPage(WidgetTester tester, Widget widget) async {
      await mocked(() async {
        await tester.pumpWidget(widget);
        await tester.pump();
      });
    }

    double scrolled(WidgetTester tester) => tester.state<ScrollableState>(find.byType(Scrollable).first).position.pixels;

    /// The map is on the screen, whole in the height of it.
    bool mapVisible(WidgetTester tester) {
      if (find.byType(FlutterMap).evaluate().isEmpty) return false;
      final rect = tester.getRect(find.byType(FlutterMap));
      return rect.top >= 0 && rect.bottom <= 700;
    }

    /// Scrolls the page down to the list of places. The drag starts on the list, not on the map (a drag on the map moves the map).
    Future<void> scrollDown(WidgetTester tester) async {
      await tester.dragFrom(const Offset(205, 660), const Offset(0, -3000));
      await tester.pump();
    }

    void smallScreen(WidgetTester tester) {
      bigScreen(tester);
      tester.view.physicalSize = const Size(411, 700);
    }

    testWidgets('scrolled down to the list, View on map brings the page back up to the map and its box', (tester) async {
      smallScreen(tester);
      await pumpPage(tester, page());
      await scrollDown(tester);
      await tester.pump();
      expect(scrolled(tester), greaterThan(300), reason: 'the fixture: the page really is scrolled down');
      expect(mapVisible(tester), isFalse);

      await pumpPage(tester, page(focus: MapFocusRequest(dest(alpha))));
      await mocked(() async {
        await tester.pump(mapScrollDuration + const Duration(milliseconds: 50));
        await tester.pump(mapFocusDuration);
      });
      expect(scrolled(tester), 0, reason: 'back at the top');
      expect(mapVisible(tester), isTrue);
      expect(find.text('View'), findsOneWidget, reason: 'its box is open and can be seen');
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.20, 0.0001));
      expect(centre.longitude, closeTo(121.70, 0.0001));
    });

    testWidgets('the page does not jump: it is part-way up while it travels', (tester) async {
      smallScreen(tester);
      await pumpPage(tester, page());
      await scrollDown(tester);
      await tester.pump();
      final start = scrolled(tester);
      await pumpPage(tester, page(focus: MapFocusRequest(dest(alpha))));
      await mocked(() async {
        await tester.pump(const Duration(milliseconds: 150));
        expect(scrolled(tester), lessThan(start * 0.8), reason: 'well on its way up (a settling of the layout is not a scroll)');
        expect(scrolled(tester), greaterThan(0), reason: 'still on its way, not already at the top');
        await tester.pump(mapScrollDuration);
        await tester.pump(mapFocusDuration);
      });
    });

    testWidgets('from another tab the map is at the top and on the screen, with the box open', (tester) async {
      smallScreen(tester);
      await pumpPage(tester, page(focus: MapFocusRequest(dest(bravo))));
      await mocked(() async {
        await tester.pump(mapFocusDuration + const Duration(milliseconds: 100));
      });
      expect(scrolled(tester), 0);
      expect(mapVisible(tester), isTrue);
      expect(find.text('View'), findsOneWidget);
    });

    testWidgets('the map TRAVELS: part-way through, the camera is between where it began and where it ends', (tester) async {
      smallScreen(tester);
      final samples = <(double, double)>[];
      await pumpPage(tester, page(focus: MapFocusRequest(dest(bravo))));
      await mocked(() async {
        for (var i = 0; i < 8; i++) {
          final camera = tester.widget<FlutterMap>(find.byType(FlutterMap)).mapController!.camera;
          samples.add((camera.center.latitude, camera.zoom));
          await tester.pump(const Duration(milliseconds: 100));
        }
        await tester.pump(const Duration(milliseconds: 100));
      });
      final end = centreOf(tester);
      expect(end.latitude, closeTo(14.31, 0.0001));
      // it began far from the destination (the whole of Mauban) and not already there
      expect(samples.first.$1, closeTo(14.185, 0.01));
      expect(samples.first.$2, closeTo(10.5, 0.1));
      // and in between it was neither at the start nor at the end: more than one move
      final middle = samples[4];
      expect(middle.$1, greaterThan(14.185 + 0.01));
      expect(middle.$1, lessThan(14.31 - 0.01));
      expect(middle.$2, greaterThan(10.5 + 0.3));
      expect(middle.$2, lessThan(mapFocusZoom - 0.3));
      // it only goes one way, step after step
      for (var i = 1; i < samples.length; i++) {
        expect(samples[i].$1, greaterThanOrEqualTo(samples[i - 1].$1));
        expect(samples[i].$2, greaterThanOrEqualTo(samples[i - 1].$2));
      }
      // and it is a glide that eases: slower at the start than in the middle
      final first = samples[1].$1 - samples[0].$1;
      final mid = samples[4].$1 - samples[3].$1;
      expect(first, lessThan(mid));
    });

    testWidgets('the trip takes about as long as it was meant to, and not much longer', (tester) async {
      smallScreen(tester);
      expect(mapFocusDuration.inMilliseconds, inInclusiveRange(700, 900));
      await pumpPage(tester, page(focus: MapFocusRequest(dest(bravo))));
      await mocked(() async {
        await tester.pump(mapFocusDuration ~/ 2);
        expect(centreOf(tester).latitude, lessThan(14.31 - 0.005), reason: 'half way, not there yet');
        await tester.pump(mapFocusDuration ~/ 2 + const Duration(milliseconds: 20));
      });
      expect(centreOf(tester).latitude, closeTo(14.31, 0.0001), reason: 'there when the time is up');
    });

    testWidgets('a trip that begins on the map starts where the camera is, not from the destination', (tester) async {
      smallScreen(tester);
      await pumpPage(tester, page());
      final before = centreOf(tester);
      await pumpPage(tester, page(focus: MapFocusRequest(dest(bravo))));
      await mocked(() async {
        await tester.pump(const Duration(milliseconds: 100));
        final soon = centreOf(tester);
        expect((soon.latitude - before.latitude).abs(), lessThan(0.06), reason: 'it set off from where it was');
        await tester.pump(mapFocusDuration);
      });
      expect(centreOf(tester).latitude, closeTo(14.31, 0.0001));
    });

    testWidgets('with reduce-motion on it goes at once, and the page jumps to the top', (tester) async {
      smallScreen(tester);
      await pumpPage(tester, page(reduceMotion: true));
      await scrollDown(tester);
      await tester.pump();
      await pumpPage(tester, page(focus: MapFocusRequest(dest(alpha)), reduceMotion: true));
      await tester.pump();
      expect(centreOf(tester).latitude, closeTo(14.20, 0.0001));
      expect(scrolled(tester), 0);
    });
  });

  group('through the app', () {
    Future<void> openAlphaDetail(WidgetTester tester) async {
      bigScreen(tester);
      final data = bootstrap();
      await mocked(() async {
        await tester.pumpWidget(
          MaterialApp(
            home: MobileShell(
              api: const TourismApi(),
              state: TourismBootstrapState.loaded(data),
              onRetry: () {},
            ),
          ),
        );
        await tester.pump();
        await tester.tap(find.text('Explore'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 200));
        await tester.tap(find.text('Alpha Beach').first);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        await tester.scrollUntilVisible(viewOnMap(), 300, scrollable: find.byType(Scrollable).first);
        await tester.pump();
      });
    }

    testWidgets('View on map: the detail page goes, the Map tab shows, centred, with the box of that destination', (tester) async {
      await openAlphaDetail(tester);
      expect(find.byType(DestinationDetailPage), findsOneWidget);
      await mocked(() async {
        await tester.tap(viewOnMap());
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(mapFocusDuration);
      });
      expect(find.byType(DestinationDetailPage), findsNothing);
      expect(find.text('Maps & Guides'), findsOneWidget);
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.20, 0.0001));
      expect(centre.longitude, closeTo(121.70, 0.0001));
      expect(find.text('View'), findsOneWidget);
      expect(find.text('Lamon Bay, Mauban'), findsOneWidget, reason: 'only in the list: not the box of the other destination');
      expect(find.byType(FlutterMap), findsOneWidget);
      expect(tester.getRect(find.byType(FlutterMap)).top, greaterThanOrEqualTo(0), reason: 'the map can be seen');
    });

    testWidgets('leaving the Map tab and coming back is the whole map again, not the same destination', (tester) async {
      await openAlphaDetail(tester);
      await mocked(() async {
        await tester.tap(viewOnMap());
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Home'));
        await tester.pump();
        await tester.tap(find.text('Map'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 200));
      });
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.185, 0.0001));
      expect(find.text('View'), findsNothing);
    });
  });
}
