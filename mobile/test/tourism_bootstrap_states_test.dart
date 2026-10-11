// The tourism Home must never say "No destinations ..." while the bootstrap is
// still on its way. Three different answers, three different renders:
// waiting (skeleton), loaded but nothing matches, and failed.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const noMatchMessage = 'No destinations match your search or filter';
const nothingPublishedMessage = 'No destinations are available yet.';

/// Synthetic data only: no real resort, person or contact.
MobileBootstrap bootstrapWith(int count) {
  Map<String, dynamic> resort(int i) => {
    'resort_id': i,
    'resort_name': 'Sample Beach $i',
    'type': 'Beach Resort',
    'location': 'Sample Barangay',
    'short_description': 'A sample place.',
    'tourism_rating': 4.0,
    'monthly_arrivals': 500,
    'latitude': 14.18,
    'longitude': 121.73,
  };
  final list = [for (var i = 1; i <= count; i++) resort(i)];
  return MobileBootstrap.fromJson({
    'destinations': list,
    'featuredDestinations': list.take(2).toList(),
    'referenceTables': <String, dynamic>{},
    'barangays': <dynamic>[],
    'notifications': <dynamic>[],
  });
}

class FakeApi extends TourismApi {
  FakeApi(this._answer);

  final Completer<MobileBootstrap> _answer;

  @override
  Future<MobileBootstrap> fetchBootstrap() => _answer.future;
}

/// Two errors that come from the test harness, not from what is under test:
/// the test font (Ahem) makes every glyph a full em wide, so the existing
/// destination cards overflow their rows here though not on a device; and
/// the card images are decoded from assets the harness cannot load. Every
/// other error still fails the test.
void ignoreOverflowOnly() {
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) {
      return;
    }
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

Future<void> openHome(
  WidgetTester tester,
  TourismApi api, {
  double height = 3000,
}) async {
  ignoreOverflowOnly();
  tester.view.physicalSize = Size(411, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(MaterialApp(home: AppBootstrap(api: api)));
  await tester.pump();
  await tester.tap(find.text('Skip'));
  await tester.pump();
  await tester.tap(find.text("I'm a Tourist / Visitor"));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1500));
  await tester.pump();
}

void expectNoEmptyMessage() {
  expect(find.text(noMatchMessage), findsNothing);
  expect(find.text(nothingPublishedMessage), findsNothing);
  expect(find.text('No destinations found'), findsNothing);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('while loading: skeleton, and never an empty-state message', (
    tester,
  ) async {
    final answer = Completer<MobileBootstrap>();
    await openHome(tester, FakeApi(answer));

    expect(find.byType(FeaturedCarouselSkeleton), findsOneWidget);
    expect(find.byType(HiddenGemsRowSkeleton), findsOneWidget);
    expect(find.byType(DestinationListSkeleton), findsOneWidget);
    expect(find.text('All Destinations & Resorts'), findsOneWidget);
    expectNoEmptyMessage();

    // Still waiting 9 seconds later: the plain notice appears, empty state not.
    expect(find.text(tourismSlowLoadingMessage), findsNothing);
    await tester.pump(const Duration(seconds: 9));
    expect(find.text(tourismSlowLoadingMessage), findsOneWidget);
    expect(find.byType(DestinationListSkeleton), findsOneWidget);
    expectNoEmptyMessage();

    // The category chips and search do not turn waiting into "no match".
    await tester.tap(find.text('Beaches'));
    await tester.pump();
    expect(find.byType(DestinationListSkeleton), findsOneWidget);
    expectNoEmptyMessage();

    // Data arrives: the skeleton is replaced by the real cards.
    answer.complete(bootstrapWith(3));
    await tester.pump();
    await tester.pump();
    expect(find.byType(DestinationListSkeleton), findsNothing);
    expect(find.text('Sample Beach 1'), findsWidgets);
    expectNoEmptyMessage();
  });

  testWidgets('on a phone-height screen the slow notice is on the first '
      'screen, not down by the list', (tester) async {
    final answer = Completer<MobileBootstrap>();
    await openHome(tester, FakeApi(answer), height: 760);
    await tester.pump(const Duration(seconds: 9));

    final notice = find.text(tourismSlowLoadingMessage);
    expect(notice, findsOneWidget);
    expect(tester.getTopLeft(notice).dy, lessThan(760));
  });

  testWidgets('loaded with nothing published says so', (tester) async {
    final answer = Completer<MobileBootstrap>();
    await openHome(tester, FakeApi(answer));
    expectNoEmptyMessage();

    answer.complete(bootstrapWith(0));
    await tester.pump();
    await tester.pump();

    expect(find.byType(DestinationListSkeleton), findsNothing);
    expect(find.text(nothingPublishedMessage), findsOneWidget);
    expect(find.text(noMatchMessage), findsNothing);
  });

  testWidgets('loaded with data but nothing matching the search', (
    tester,
  ) async {
    final answer = Completer<MobileBootstrap>();
    answer.complete(bootstrapWith(3));
    await openHome(tester, FakeApi(answer));
    expect(find.text('Sample Beach 1'), findsWidgets);
    expect(find.text(noMatchMessage), findsNothing);

    await tester.enterText(find.byType(TextField).first, 'zzzzzz');
    await tester.pump();

    expect(find.text(noMatchMessage), findsOneWidget);
    expect(find.text(nothingPublishedMessage), findsNothing);
    expect(find.byType(DestinationListSkeleton), findsNothing);
  });

  testWidgets('failed is the error panel, not an empty-state message and not '
      'an endless skeleton', (tester) async {
    final answer = Completer<MobileBootstrap>();
    await openHome(tester, FakeApi(answer));
    expect(find.byType(DestinationListSkeleton), findsOneWidget);

    answer.completeError(Exception('blocked'));
    await tester.pump();
    await tester.pump();

    expect(find.byType(DestinationListSkeleton), findsNothing);
    expect(find.byType(FeaturedCarouselSkeleton), findsNothing);
    expect(find.text("Can't reach the server."), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expectNoEmptyMessage();
  });

  testWidgets('Explore shows a skeleton, not "No destinations found", '
      'and My Visit registration waits for the data', (tester) async {
    final answer = Completer<MobileBootstrap>();
    await openHome(tester, FakeApi(answer));

    await tester.tap(find.text('Explore'));
    await tester.pump();
    expect(find.byType(DestinationListSkeleton), findsOneWidget);
    expectNoEmptyMessage();

    await tester.tap(find.text('My Visit'));
    await tester.pump();
    FilledButton register() => tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Register / Get Pass'),
    );
    expect(register().onPressed, isNull);

    answer.complete(bootstrapWith(2));
    await tester.pump();
    await tester.pump();
    expect(register().onPressed, isNotNull);
  });
}
