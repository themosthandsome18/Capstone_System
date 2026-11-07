// The header of Destination Details: the back arrow and the name of the destination must not be on top of each other. The name starts
// after the arrow, with a gap, and is cut with an ellipsis when it is long. Measured on the screen, at every stage of the header: open,
// part-way and folded up.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';

const shortName = 'Rio Del Sol';
const longName =
    'Rio Del Sol Beach Resort And Camping Grounds With A Very Long Name That Goes On And On Past Two Whole Lines Of Text And More';

MobileBootstrap bootstrap(String name) => MobileBootstrap.fromJson({
  'destinations': [
    {'resort_id': 1, 'resort_name': name, 'type': 'Beach Resort', 'location': 'Cagbalete', 'latitude': 14.2, 'longitude': 121.7},
  ],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async => http.Response(jsonEncode({'destination': {}, 'recentFeedback': []}), 200)),
);

/// The detail page, pushed from another page so that it has a back arrow.
Future<void> openDetail(WidgetTester tester, String name) async {
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

  final data = bootstrap(name);
  await mocked(() async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => DestinationDetailPage(
                      destination: data.destinations.first,
                      api: const TourismApi(),
                      bootstrap: data,
                      onVisitSubmitted: (_) {},
                      onFeedbackSubmitted: (_) {},
                    ),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  });
}

Finder backArrow() => find.descendant(of: find.byType(SliverAppBar), matching: find.byType(BackButton));
Finder title(String name) => find.descendant(of: find.byType(FlexibleSpaceBar), matching: find.text(name));

Future<void> scrollTo(WidgetTester tester, double offset) async {
  final scrollable = tester.state<ScrollableState>(find.byType(Scrollable).first);
  scrollable.position.jumpTo(offset);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  group('the name does not go under the arrow', () {
    for (final stage in {'open': 0.0, 'a little folded': 60.0, 'half folded': 140.0, 'almost folded': 230.0, 'folded up': 400.0}.entries) {
      testWidgets('${stage.key}: the box of the name and the box of the arrow do not overlap', (tester) async {
        await openDetail(tester, shortName);
        await scrollTo(tester, stage.value);
        final arrow = tester.getRect(backArrow());
        final name = tester.getRect(title(shortName));
        expect(name.overlaps(arrow), isFalse, reason: 'arrow $arrow, name $name');
      });
    }

    testWidgets('folded up, the name starts after the arrow with a gap, not touching it', (tester) async {
      await openDetail(tester, shortName);
      await scrollTo(tester, 400);
      final arrow = tester.getRect(backArrow());
      final name = tester.getRect(title(shortName));
      expect(name.left, greaterThanOrEqualTo(arrow.right + 8), reason: 'arrow $arrow, name $name');
    });

    testWidgets('a long name too: it never reaches under the arrow, folded or open', (tester) async {
      await openDetail(tester, longName);
      for (final offset in [0.0, 140.0, 400.0]) {
        await scrollTo(tester, offset);
        final arrow = tester.getRect(backArrow());
        final name = tester.getRect(title(longName));
        expect(name.overlaps(arrow), isFalse, reason: 'at $offset: arrow $arrow, name $name');
      }
    });
  });

  group('long and short names', () {
    RenderParagraph paragraph(WidgetTester tester, String name) => tester.renderObject<RenderParagraph>(title(name));

    testWidgets('a long name is cut with an ellipsis, in at most two lines, and stays inside the screen', (tester) async {
      await openDetail(tester, longName);
      for (final offset in [0.0, 400.0]) {
        await scrollTo(tester, offset);
        expect(paragraph(tester, longName).didExceedMaxLines, isTrue, reason: 'at $offset');
        final text = tester.widget<Text>(title(longName));
        expect(text.maxLines, 2);
        expect(text.overflow, TextOverflow.ellipsis);
        final name = tester.getRect(title(longName));
        expect(name.right, lessThanOrEqualTo(411), reason: 'at $offset: $name');
        expect(name.left, greaterThanOrEqualTo(0));
      }
    });

    testWidgets('a short name is whole, on one line, and not cut', (tester) async {
      await openDetail(tester, shortName);
      for (final offset in [0.0, 400.0]) {
        await scrollTo(tester, offset);
        expect(paragraph(tester, shortName).didExceedMaxLines, isFalse, reason: 'at $offset');
        expect(find.text(shortName), findsWidgets);
        expect(tester.widget<Text>(title(shortName)).data, shortName);
        expect(paragraph(tester, shortName).size.height, lessThan(40), reason: 'one line');
      }
    });
  });

  group('nothing else about the header moved', () {
    testWidgets('the size, the colour and the weight of the name, and the height of the header, are what they were', (tester) async {
      await openDetail(tester, shortName);
      final text = tester.widget<Text>(title(shortName));
      expect(text.style!.fontSize, 16);
      expect(text.style!.fontWeight, FontWeight.w900);
      expect(text.style!.color, Colors.white);
      final bar = tester.widget<SliverAppBar>(find.byType(SliverAppBar));
      expect(bar.expandedHeight, 320);
      expect(bar.pinned, isTrue);
    });
  });
}
