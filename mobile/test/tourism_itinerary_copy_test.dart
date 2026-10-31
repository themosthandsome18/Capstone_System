// The "Curated Mauban Itineraries" section of My Visit was REMOVED: its routes had exact times and stops that nobody had verified, and it was shown as a guide
// in a system real visitors use. This file used to hold the guard of one of its texts ("Day Tour" was renamed "Same Day" in the data, 2026-10-03: no itinerary
// card on My Visit said "Day Tour"). The guard stays, and says more now: My Visit has no "Day Tour" and no "Same Day (Town Proper)" anywhere, because there is
// no itinerary card left to say them. (The "Length of Stay" choice of the registration form is another thing, from the database, and has its own tests.)
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

Future<void> openMyVisit(WidgetTester tester) async {
  tester.view.physicalSize = const Size(411, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final overflow = FlutterError.onError;
  FlutterError.onError = (details) {
    // The test font makes some existing rows overflow; nothing here is about that.
    if (details.exceptionAsString().contains('overflowed')) return;
    overflow?.call(details);
  };
  addTearDown(() => FlutterError.onError = overflow);

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: VisitPlannerPage(
          registerEnabled: true,
          visits: const [],
          onRegisterVisit: () {},
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('My Visit has no "Day Tour" and no "Same Day (Town Proper)"', (tester) async {
    await openMyVisit(tester);

    expect(find.textContaining('Day Tour', skipOffstage: false), findsNothing);
    expect(find.text('Same Day (Town Proper)', skipOffstage: false), findsNothing);
    expect(find.textContaining('Same Day', skipOffstage: false), findsNothing);
    // the fixture: the page really is My Visit, with the parts that stay
    expect(find.text('My Visit & Travel Wallet'), findsOneWidget);
    expect(find.textContaining('Packing', skipOffstage: false), findsWidgets);
  });

  testWidgets('the itinerary section is gone, with its chips, its routes and its times', (tester) async {
    await openMyVisit(tester);

    for (final gone in [
      'Curated Mauban Itineraries',
      '🏝️ Cagbalete Loop',
      '🌿 Waterfalls & Heritage',
      '🍲 Food & Culture',
      'Top Recommended',
      'Yang-in Sandbar Walk & Swimming',
      'Port Departure to Cagbalete',
      'Beachfront Seafood Feast',
    ]) {
      expect(find.textContaining(gone, skipOffstage: false), findsNothing, reason: gone);
    }
    // and nothing on the page promises an itinerary
    expect(find.textContaining('itinerary', skipOffstage: false), findsNothing);
    expect(find.text('Active passes and island guide'), findsOneWidget);
  });

  testWidgets('the Packing checklist is followed by the Port & Boat Guide', (tester) async {
    await openMyVisit(tester);

    final packing = tester.getTopLeft(find.textContaining('Packing', skipOffstage: false).first);
    final port = tester.getTopLeft(find.text(AppContentDefaults.portGuideTitle));
    expect(packing.dy, lessThan(port.dy));
  });
}
