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

    testWidgets('with a request it opens centred on that destination', (tester) async {
      await pump(tester, focus: MapFocusRequest(dest(bravo)));
      final map = tester.widget<FlutterMap>(find.byType(FlutterMap));
      expect(map.options.initialCenter.latitude, closeTo(14.31, 0.0001));
      expect(map.options.initialCenter.longitude, closeTo(121.88, 0.0001));
      expect(map.options.initialZoom, mapFocusZoom);
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
        await tester.pump();
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
        await tester.pump();
      });
      expect(find.byType(DestinationDetailPage), findsNothing);
      expect(find.text('Maps & Guides'), findsOneWidget);
      final centre = centreOf(tester);
      expect(centre.latitude, closeTo(14.20, 0.0001));
      expect(centre.longitude, closeTo(121.70, 0.0001));
      expect(find.text('View'), findsOneWidget);
      expect(find.text('Lamon Bay, Mauban'), findsOneWidget, reason: 'only in the list: not the box of the other destination');
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
