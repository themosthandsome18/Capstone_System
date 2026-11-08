// The "Tourism Record" card on Destination Details (DestinationFactsPanel): two
// even columns. The icon and the label are on the left, and the value starts at
// ONE position in every row, aligned to the left of its own column; a long value
// wraps inside its column and does not run past the card.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const longAccess =
    'Take a tricycle from the town proper to the port, then a boat across the bay to the island and walk the last stretch to the resort';

Destination destination({String access = longAccess, bool permit = true}) =>
    Destination.fromJson({
      'resort_id': 1,
      'resort_name': 'Test Beach',
      'type': 'Beach Resort',
      'yearly_arrivals': 1250,
      'with_mayors_permit': permit,
      'access': access,
    });

Future<void> pumpPanel(WidgetTester tester, Destination d) async {
  tester.view.physicalSize = const Size(411, 1200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: DestinationFactsPanel(destination: d),
        ),
      ),
    ),
  );
}

/// Where the FIRST LETTER of a text is drawn, on the screen. The box of a Text can
/// start in one place while its letters are pushed to the right inside it (right
/// alignment), so the box is not what the eye sees: the first letter is.
double firstLetterLeft(WidgetTester tester, String text) {
  final render = tester.renderObject<RenderParagraph>(find.text(text));
  final box = render
      .getBoxesForSelection(const TextSelection(baseOffset: 0, extentOffset: 1))
      .first;
  return render.localToGlobal(Offset(box.left, 0)).dx;
}

void main() {
  testWidgets('every value starts at the same position', (tester) async {
    final d = destination();
    await pumpPanel(tester, d);
    final values = [d.visitorsLabel, d.type, d.permitLabel, d.access];
    final lefts = [for (final v in values) firstLetterLeft(tester, v)];
    for (final left in lefts) {
      expect(left, lefts.first, reason: 'values start at $lefts');
    }
  });

  testWidgets('the values are aligned to the left of their column, not the right', (tester) async {
    final d = destination();
    await pumpPanel(tester, d);
    for (final v in [d.visitorsLabel, d.type, d.permitLabel, d.access]) {
      final text = tester.widget<Text>(find.text(v));
      expect(text.textAlign == TextAlign.right || text.textAlign == TextAlign.end, isFalse, reason: v);
    }
  });

  testWidgets('a short value and a long one share a start; the long one wraps and stays inside the card', (tester) async {
    final d = destination();
    await pumpPanel(tester, d);
    final card = tester.getRect(find.byType(Card));
    final short = tester.getRect(find.text(d.type));
    final long = tester.getRect(find.text(d.access));
    expect(long.left, short.left);
    expect(long.height, greaterThan(short.height * 1.5), reason: 'the long value wrapped onto more lines');
    expect(long.right, lessThanOrEqualTo(card.right));
    expect(long.left, greaterThanOrEqualTo(card.left));
  });

  testWidgets('a value that wraps ("Mayor\'s permit verified") still starts where the others do', (tester) async {
    await tester.binding.setSurfaceSize(const Size(260, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final d = destination(access: 'Boat');
    tester.view.physicalSize = const Size(260, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: Padding(padding: const EdgeInsets.all(8), child: DestinationFactsPanel(destination: d)))),
    );
    final permit = tester.getRect(find.text("Mayor's permit verified"));
    final category = tester.getRect(find.text('Beach Resort'));
    expect(firstLetterLeft(tester, "Mayor's permit verified"), firstLetterLeft(tester, 'Beach Resort'));
    expect(permit.height, greaterThan(category.height * 1.5), reason: 'at this width it wraps onto two lines');
  });

  testWidgets('the four rows still say what they said', (tester) async {
    final d = destination();
    await pumpPanel(tester, d);
    for (final label in ['Visitor arrivals', 'Category', 'Permit status', 'Access']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('1,250 visitor arrivals'), findsOneWidget);
    expect(find.text('Beach Resort'), findsOneWidget);
    expect(find.text("Mayor's permit verified"), findsOneWidget);
    expect(find.text(longAccess), findsOneWidget);
    expect(find.byIcon(Icons.groups_outlined), findsOneWidget);
    expect(find.byIcon(Icons.category_outlined), findsOneWidget);
    expect(find.byIcon(Icons.verified_outlined), findsOneWidget);
    expect(find.byIcon(Icons.route_outlined), findsOneWidget);
  });

  testWidgets('an empty Access still reads Not specified', (tester) async {
    await pumpPanel(tester, destination(access: ''));
    expect(find.text('Not specified'), findsOneWidget);
  });

  testWidgets('the rows are spaced evenly: the same space above the label in every row, wrapped or not', (tester) async {
    final d = destination();
    await pumpPanel(tester, d);
    final rows = tester.widgetList<FactRow>(find.byType(FactRow)).toList();
    expect(rows, hasLength(4));
    final gaps = <double>[];
    for (final row in rows) {
      final rowRect = tester.getRect(find.byWidget(row));
      final labelRect = tester.getRect(find.text(row.label));
      gaps.add(labelRect.top - rowRect.top);
    }
    for (final gap in gaps) {
      expect(gap, gaps.first, reason: 'space above the label per row: $gaps');
    }
    // and the rows are stacked with nothing between them
    for (var i = 1; i < rows.length; i++) {
      final above = tester.getRect(find.byWidget(rows[i - 1]));
      final below = tester.getRect(find.byWidget(rows[i]));
      expect(below.top, above.bottom);
    }
  });
}
