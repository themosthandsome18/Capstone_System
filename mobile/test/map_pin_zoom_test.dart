// Tapping a pin: the box opens (as it did) AND the map glides and zooms to the pin, with the same trip as "View on map" (mapFocusDuration,
// mapFocusCurve). In both maps: the one in Maps & Guides, and the full-screen one ("Mauban Tourism GIS Map"). Close in on the pin already:
// no more zoom, and the map moves only if it has to. Reduce motion: at once. A tap outside a pin still closes the box.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:mauban_mobile_app/main.dart';

Destination place(int id, String name, double lat, double lng) => Destination.fromJson({
  'resort_id': id,
  'resort_name': name,
  'type': 'Beach Resort',
  'location': '$name Place',
  'latitude': lat,
  'longitude': lng,
});

final alpha = place(1, 'Alpha Beach', 14.20, 121.70);
final bravo = place(2, 'Bravo Cove', 14.31, 121.88);
final delta = place(3, 'Delta Point', 14.3110, 121.881); // a hundredth of a degree... a thousandth from Bravo
final echo = place(4, 'Echo Bay', 14.3125, 121.8825);
final nearHome = place(5, 'Near Home', 14.19, 121.74); // close to the middle of the whole of Mauban, for the full-screen map

Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async => http.Response(jsonEncode({'destination': {}, 'recentFeedback': []}), 200)),
);

void screen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('NetworkImage') || text.contains('HTTP request failed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

Future<void> pumpMap(WidgetTester tester, List<Destination> destinations, {bool reduceMotion = false}) async {
  screen(tester);
  await mocked(() async {
    await tester.pumpWidget(
      MaterialApp(
        // Above the Navigator, as the device's own setting is, so that the full-screen map (a dialog) sees it too.
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
          child: child!,
        ),
        home: Scaffold(body: TourismMapPage(destinations: destinations, onOpenDestination: (_) {})),
      ),
    );
    await tester.pump();
  });
}

/// The map of the page (the first FlutterMap) and, when the full-screen map is open, that one (the last).
MapCamera camera(WidgetTester tester, {bool full = false}) {
  final maps = find.byType(FlutterMap);
  final map = tester.widget<FlutterMap>(full ? maps.last : maps.first);
  return map.mapController!.camera;
}

Finder pins({bool full = false}) => full
    ? find.descendant(of: find.byType(Dialog), matching: find.byType(MapPin))
    : find.descendant(of: find.byType(FlutterMap).first, matching: find.byType(MapPin));

/// The map goes to [where] at [zoom] by itself (what a visitor would do with a finger), so that the tests can start from a map that is
/// already close in.
Future<void> placeCamera(WidgetTester tester, LatLng where, double zoom) async {
  camera(tester); // the map is there
  tester.widget<FlutterMap>(find.byType(FlutterMap).first).mapController!.move(where, zoom);
  await tester.pump();
}

const step = Duration(milliseconds: 100);

/// A tap, and the frame in which the tap is handled: the trip starts in that frame, so what is measured after it is measured from t = 0.
Future<void> tapPin(WidgetTester tester, Finder pin) async {
  await tester.tap(pin);
  await tester.pump();
}

void main() {
  group('the map of Maps & Guides', () {
    testWidgets('a pin opens its box and the map travels to it: part-way it is between, and it ends close in on the pin', (tester) async {
      await pumpMap(tester, [alpha, bravo]);
      final samples = <(double, double)>[];
      await mocked(() async {
        await tapPin(tester, pins().at(1));
        expect(find.text('Bravo Cove'), findsNWidgets(2), reason: 'the list under the map and the box');
        expect(find.text('Alpha Beach'), findsOneWidget, reason: 'only the list: no box for the other one');
        expect(find.text('View'), findsOneWidget);
        for (var i = 0; i < 8; i++) {
          final c = camera(tester);
          samples.add((c.center.latitude, c.zoom));
          await tester.pump(step);
        }
        await tester.pump(step);
      });
      final end = camera(tester);
      expect(end.center.latitude, closeTo(14.31, 0.0001));
      expect(end.center.longitude, closeTo(121.88, 0.0001));
      expect(end.zoom, closeTo(mapFocusZoom, 0.0001));
      expect(samples.first.$1, closeTo(14.185, 0.01), reason: 'it set off from where it was');
      expect(samples[4].$1, greaterThan(14.185 + 0.01));
      expect(samples[4].$1, lessThan(14.31 - 0.01), reason: 'part-way through, it is neither at the start nor at the end');
      expect(samples[4].$2, greaterThan(10.5 + 0.3));
      expect(samples[4].$2, lessThan(mapFocusZoom - 0.3));
      for (var i = 1; i < samples.length; i++) {
        expect(samples[i].$1, greaterThanOrEqualTo(samples[i - 1].$1));
        expect(samples[i].$2, greaterThanOrEqualTo(samples[i - 1].$2));
      }
    });

    testWidgets('the trip is the one of "View on map": the same time, the same curve', (tester) async {
      await pumpMap(tester, [alpha, bravo]);
      await mocked(() async {
        await tapPin(tester, pins().at(1));
        await tester.pump(mapFocusDuration ~/ 2);
        expect(camera(tester).center.latitude, lessThan(14.31 - 0.005), reason: 'half way: not there yet');
        await tester.pump(mapFocusDuration ~/ 2 + const Duration(milliseconds: 20));
      });
      expect(camera(tester).center.latitude, closeTo(14.31, 0.0001), reason: 'there when mapFocusDuration is up');
    });

    testWidgets('the box of the OTHER pin opens when that one is tapped', (tester) async {
      await pumpMap(tester, [alpha, bravo]);
      await mocked(() async {
        await tapPin(tester, pins().at(0));
        await tester.pump(mapFocusDuration + step);
      });
      expect(find.text('Alpha Beach'), findsNWidgets(2));
      expect(find.text('Bravo Cove'), findsOneWidget);
      expect(camera(tester).center.latitude, closeTo(14.20, 0.0001));
      expect(camera(tester).center.longitude, closeTo(121.70, 0.0001));
    });

    testWidgets('close in on the pin already: it does not zoom again, and tapping it again and again does not move the map', (tester) async {
      await pumpMap(tester, [bravo, delta, echo]);
      await placeCamera(tester, LatLng(14.31, 121.88), 16.5);
      final before = camera(tester);
      await mocked(() async {
        await tapPin(tester, pins().first); // Bravo, in the middle
        for (var i = 0; i < 6; i++) {
          await tester.pump(step);
          final c = camera(tester);
          expect(c.zoom, before.zoom, reason: 'no zoom at all, at step $i');
          expect(c.center.latitude, before.center.latitude, reason: 'no move at all, at step $i');
          expect(c.center.longitude, before.center.longitude);
        }
        for (var tap = 0; tap < 3; tap++) {
          await tapPin(tester, find.byIcon(Icons.location_on).first);
          await tester.pump(step);
          expect(camera(tester).zoom, before.zoom);
          expect(camera(tester).center.latitude, before.center.latitude);
        }
        await tester.pump(mapFocusDuration);
      });
      expect(find.text('Bravo Cove'), findsNWidgets(2), reason: 'its box is open all the same');
    });

    testWidgets('close in, a pin in the middle of the screen does not move the map; its box opens', (tester) async {
      await pumpMap(tester, [bravo, delta, echo]);
      await placeCamera(tester, LatLng(14.31, 121.88), 16.5);
      final before = camera(tester);
      await mocked(() async {
        await tapPin(tester, pins().at(1)); // Delta, a little to the side of Bravo
        await tester.pump(mapFocusDuration + step);
      });
      expect(camera(tester).center.latitude, before.center.latitude);
      expect(camera(tester).zoom, before.zoom);
      expect(find.text('Delta Point'), findsNWidgets(2));
    });

    testWidgets('close in, a pin far from the middle moves the map to it WITHOUT changing the zoom, and glides', (tester) async {
      await pumpMap(tester, [bravo, delta, echo]);
      await placeCamera(tester, LatLng(14.31, 121.88), 16.5);
      final start = camera(tester).center.latitude;
      final samples = <double>[];
      await mocked(() async {
        await tapPin(tester, pins().at(2)); // Echo, towards the edge of the screen
        for (var i = 0; i < 6; i++) {
          samples.add(camera(tester).center.latitude);
          expect(camera(tester).zoom, closeTo(16.5, 0.0001), reason: 'the zoom is left as it is, at step $i');
          await tester.pump(step);
        }
        await tester.pump(mapFocusDuration);
      });
      expect(camera(tester).center.latitude, closeTo(14.3125, 0.0001));
      expect(camera(tester).center.longitude, closeTo(121.8825, 0.0001));
      expect(camera(tester).zoom, closeTo(16.5, 0.0001));
      expect(samples.first, closeTo(start, 0.0005));
      expect(samples[3], greaterThan(start + 0.0002), reason: 'part-way: on its way');
      expect(samples[3], lessThan(14.3125 - 0.0002), reason: 'part-way: not there yet');
      expect(find.text('Echo Bay'), findsNWidgets(2));
    });

    testWidgets('close in is when the zoom is at least mapFocusZoom: a little further out still zooms in to it', (tester) async {
      await pumpMap(tester, [bravo, delta, echo]);
      await placeCamera(tester, LatLng(14.31, 121.88), 14.0);
      await mocked(() async {
        await tapPin(tester, pins().first);
        await tester.pump(mapFocusDuration + step);
      });
      expect(camera(tester).zoom, closeTo(mapFocusZoom, 0.0001));
    });

    testWidgets('reduce motion: the map goes to the pin at once', (tester) async {
      await pumpMap(tester, [alpha, bravo], reduceMotion: true);
      await mocked(() async {
        await tapPin(tester, pins().at(1));
        await tester.pump();
      });
      expect(camera(tester).center.latitude, closeTo(14.31, 0.0001));
      expect(camera(tester).zoom, closeTo(mapFocusZoom, 0.0001));
      expect(find.text('Bravo Cove'), findsNWidgets(2));
    });

    testWidgets('a tap outside a pin still closes the box, and the map does not move', (tester) async {
      await pumpMap(tester, [alpha, bravo]);
      await mocked(() async {
        await tapPin(tester, pins().at(1));
        await tester.pump(mapFocusDuration + step);
      });
      expect(find.text('View'), findsOneWidget);
      final at = camera(tester).center;
      final map = tester.getRect(find.byType(FlutterMap).first);
      await tester.tapAt(map.topLeft + const Offset(20, 20));
      await tester.pump(mapFocusDuration);
      expect(find.text('View'), findsNothing, reason: 'the box is closed');
      expect(camera(tester).center.latitude, closeTo(at.latitude, 0.0001));
    });
  });

  group('the full-screen map (Mauban Tourism GIS Map)', () {
    Future<void> openFull(WidgetTester tester, {bool reduceMotion = false}) async {
      await pumpMap(tester, [nearHome, alpha], reduceMotion: reduceMotion);
      await mocked(() async {
        await tester.tap(find.text('Full Screen'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      });
      expect(find.text('Mauban Tourism GIS Map'), findsOneWidget);
    }

    testWidgets('a pin opens its box and the map travels to it, and it ends close in', (tester) async {
      await openFull(tester);
      expect(camera(tester, full: true).zoom, closeTo(12.0, 0.0001), reason: 'the fixture: it opens at zoom 12');
      final samples = <(double, double)>[];
      await mocked(() async {
        await tapPin(tester, pins(full: true).first); // Near Home
        for (var i = 0; i < 8; i++) {
          final c = camera(tester, full: true);
          samples.add((c.center.latitude, c.zoom));
          await tester.pump(step);
        }
        await tester.pump(step);
      });
      final end = camera(tester, full: true);
      expect(end.center.latitude, closeTo(14.19, 0.0001));
      expect(end.center.longitude, closeTo(121.74, 0.0001));
      expect(end.zoom, closeTo(mapFocusZoom, 0.0001));
      expect(samples[4].$2, greaterThan(12.0 + 0.2), reason: 'part-way through the zoom is on its way');
      expect(samples[4].$2, lessThan(mapFocusZoom - 0.2));
      expect(samples.first.$2, closeTo(12.0, 0.1));
      expect(find.text('Near Home'), findsWidgets);
      expect(find.text('View'), findsOneWidget, reason: 'its box is open');
    });

    testWidgets('the box is the one of the pin that was tapped', (tester) async {
      await openFull(tester);
      await mocked(() async {
        await tapPin(tester, pins(full: true).first);
        await tester.pump(mapFocusDuration + step);
      });
      final box = find.descendant(of: find.byType(Dialog), matching: find.text('Near Home Place'));
      expect(box, findsOneWidget, reason: 'the place of that destination in its box');
      expect(find.descendant(of: find.byType(Dialog), matching: find.text('Alpha Beach Place')), findsNothing);
    });

    testWidgets('a pin in the full-screen map, close in already: no more zoom', (tester) async {
      await openFull(tester);
      await mocked(() async {
        await tapPin(tester, pins(full: true).first);
        await tester.pump(mapFocusDuration + step);
      });
      final settled = camera(tester, full: true);
      await mocked(() async {
        for (var tap = 0; tap < 3; tap++) {
          await tapPin(tester, find.descendant(of: find.byType(Dialog), matching: find.byIcon(Icons.location_on)).first);
          await tester.pump(step);
          expect(camera(tester, full: true).zoom, settled.zoom);
          expect(camera(tester, full: true).center.latitude, settled.center.latitude);
        }
      });
    });

    testWidgets('reduce motion: at once, in the full-screen map too', (tester) async {
      await openFull(tester, reduceMotion: true);
      await mocked(() async {
        await tapPin(tester, pins(full: true).first);
        await tester.pump();
      });
      expect(camera(tester, full: true).center.latitude, closeTo(14.19, 0.0001));
      expect(camera(tester, full: true).zoom, closeTo(mapFocusZoom, 0.0001));
    });

    testWidgets('a tap outside a pin still closes the box', (tester) async {
      await openFull(tester);
      await mocked(() async {
        await tapPin(tester, pins(full: true).first);
        await tester.pump(mapFocusDuration + step);
      });
      expect(find.text('View'), findsOneWidget);
      await tester.tapAt(const Offset(40, 300));
      await tester.pump(const Duration(milliseconds: 400)); // the map waits out a double tap before it counts a tap
      expect(find.text('View'), findsNothing);
    });
  });
}
