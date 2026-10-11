// The "Day Tour" itinerary was renamed "Same Day" in the data (2026-10-03).
// The My Visit itinerary cards still said "Day Tour (Town Proper)".
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

Future<void> selectItinerary(WidgetTester tester, String chip) async {
  final finder = find.text(chip);
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await tester.pump();
}

void main() {
  testWidgets('the town itinerary card says "Same Day", not "Day Tour"', (
    tester,
  ) async {
    await openMyVisit(tester);

    await selectItinerary(tester, '🌿 Waterfalls & Heritage');

    expect(find.text('Same Day (Town Proper)'), findsOneWidget);
    expect(find.textContaining('Day Tour'), findsNothing);
  });

  testWidgets('no itinerary card on My Visit says "Day Tour"', (tester) async {
    await openMyVisit(tester);

    for (final chip in [
      '🏝️ Cagbalete Loop',
      '🌿 Waterfalls & Heritage',
      '🍲 Food & Culture',
    ]) {
      await selectItinerary(tester, chip);
      expect(find.textContaining('Day Tour'), findsNothing, reason: chip);
    }
  });
}
