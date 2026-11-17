// A photo in a review, on a destination's page, can be pressed: it opens full screen. It closes with its Close button and with the phone's Back. With
// more than one photo they can be swiped and a pill says which one it is. A photo that is coming shows a spinner; one that could not be loaded says so.
// Just looking: no download, no share. The people and the photos here are made up (nothing is fetched: the network is faked).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const sampleBeach = {
  'resort_id': 7,
  'resort_name': 'Sample Beach',
  'type': 'Beach Resort',
  'location': 'Mauban, Quezon',
  'latitude': 14.2,
  'longitude': 121.7,
};

MobileBootstrap bootstrap() => MobileBootstrap.fromJson({
  'destinations': [sampleBeach],
  'featuredDestinations': [sampleBeach],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

Map<String, Object?> review(int id, List<String> photos, {String message = 'A made-up review.'}) => {
  'id': id,
  'reviewer': 'A.B.',
  'rating': 5,
  'date': '2099-06-02',
  'message': message,
  'photos': photos,
  'reply': '',
};

const one = 'https://storage.test/feedback/one.jpg';
const threeA = 'https://storage.test/feedback/three-a.jpg';
const threeB = 'https://storage.test/feedback/three-b.jpg';
const threeC = 'https://storage.test/feedback/three-c.jpg';

final reviews = [
  review(1, [one]),
  review(2, [threeA, threeB, threeC]),
  review(3, [], message: 'A review with no photo.'),
];

final viewer = find.byKey(const ValueKey('photo-viewer'));
final close = find.byKey(const ValueKey('photo-viewer-close'));
final counter = find.byKey(const ValueKey('photo-viewer-counter'));
final pages = find.byKey(const ValueKey('photo-viewer-pages'));

Finder thumb(int reviewId, int index) => find.byKey(ValueKey('review-photo-$reviewId-$index'));

/// A network that never answers: a photo that is still coming.
class HangingClient implements HttpClient {
  @override
  Future<HttpClientRequest> getUrl(Uri url) => Completer<HttpClientRequest>().future;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

Future<void> openDestination(WidgetTester tester, {List<Map<String, Object?>>? withReviews}) async {
  tester.view.physicalSize = const Size(411, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset') || text.contains('NetworkImage') || text.contains('HTTP request failed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);

  await http.runWithClient(
    () async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
          home: DestinationDetailPage(
            destination: Destination.fromJson(sampleBeach),
            api: const TourismApi(),
            bootstrap: bootstrap(),
            onVisitSubmitted: (_) {},
            onFeedbackSubmitted: (_) {},
          ),
        ),
      );
      await settle(tester);
    },
    () => MockClient((request) async {
      if (request.url.path.contains('/mobile/tourism/destinations/7/')) {
        return http.Response(jsonEncode({'destination': sampleBeach, 'recentFeedback': withReviews ?? reviews}), 200);
      }
      return http.Response('', 404);
    }),
  );
}

Future<void> openPhoto(WidgetTester tester, int reviewId, int index) async {
  await tester.ensureVisible(thumb(reviewId, index));
  await tester.tap(thumb(reviewId, index));
  await settle(tester);
}

String counterText(WidgetTester tester) => tester.widget<Text>(find.descendant(of: counter, matching: find.byType(Text))).data!;

Future<void> swipeLeft(WidgetTester tester) async {
  await tester.drag(pages, const Offset(-300, 0)); // past the middle of the page: it goes on to the next
  await settle(tester);
}

Future<void> swipeRight(WidgetTester tester) async {
  await tester.drag(pages, const Offset(300, 0));
  await settle(tester);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() {
    debugNetworkImageHttpClientProvider = null;
    // A photo that never came (the hanging network) must not stay in the cache for the next test, which asks for the same address.
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
  });

  group('a photo in a review can be pressed', () {
    testWidgets('it opens full screen, on black', (tester) async {
      await openDestination(tester);
      expect(viewer, findsNothing);

      await openPhoto(tester, 1, 0);

      expect(viewer, findsOneWidget);
      expect(tester.getSize(viewer), const Size(411, 3000)); // the whole screen
      expect(tester.widget<Scaffold>(viewer).backgroundColor, Colors.black);
    });

    testWidgets('every photo of every review that has photos can be pressed', (tester) async {
      await openDestination(tester);

      expect(thumb(1, 0), findsOneWidget);
      for (final index in [0, 1, 2]) {
        expect(thumb(2, index), findsOneWidget);
      }
    });

    testWidgets('a review with no photo has nothing to press', (tester) async {
      await openDestination(tester);

      expect(find.text('A review with no photo.'), findsOneWidget);
      expect(thumb(3, 0), findsNothing);
      final photoKeys = find.byWidgetPredicate((widget) => widget.key is ValueKey<String> && (widget.key! as ValueKey<String>).value.startsWith('review-photo-3-'));
      expect(photoKeys, findsNothing);
    });

    testWidgets('a destination with no reviews shows no photo to press at all', (tester) async {
      await openDestination(tester, withReviews: const []);

      final photoKeys = find.byWidgetPredicate((widget) => widget.key is ValueKey<String> && (widget.key! as ValueKey<String>).value.startsWith('review-photo-'));
      expect(photoKeys, findsNothing);
    });

    testWidgets('the photo that was pressed is the one that opens', (tester) async {
      await openDestination(tester);

      await openPhoto(tester, 2, 1);

      final image = tester.widget<Image>(find.byKey(const ValueKey('photo-viewer-image-1')));
      expect((image.image as NetworkImage).url, threeB);
    });

    testWidgets('the viewer asks for the SAME address as the card does', (tester) async {
      await openDestination(tester);
      final card = tester.widget<Image>(find.descendant(of: thumb(2, 2), matching: find.byType(Image)));

      await openPhoto(tester, 2, 2);

      final big = tester.widget<Image>(find.byKey(const ValueKey('photo-viewer-image-2')));
      expect((big.image as NetworkImage).url, (card.image as NetworkImage).url);
      expect((big.image as NetworkImage).url, threeC);
    });

    test('an address is whole: the server\'s own, or a bare /media/ made whole on the server\'s origin (not the API\'s)', () {
      expect(reviewPhotoUrl('https://storage.test/feedback/a.jpg'), 'https://storage.test/feedback/a.jpg');
      expect(reviewPhotoUrl('/media/feedback/a.jpg'), '$serverOrigin/media/feedback/a.jpg');
      expect(reviewPhotoUrl('/media/feedback/a.jpg'), isNot(contains('/api/media')));
    });
  });

  group('it closes', () {
    testWidgets('with its Close button', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 1, 0);
      expect(close, findsOneWidget);

      await tester.tap(close);
      await tester.pumpAndSettle();

      expect(viewer, findsNothing);
      expect(find.byType(DestinationDetailPage), findsOneWidget); // back on the destination's page
    });

    testWidgets("with the phone's Back", (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 1, 0);

      await tester.binding.handlePopRoute(); // what the back button of the phone does
      await tester.pumpAndSettle();

      expect(viewer, findsNothing);
      expect(find.byType(DestinationDetailPage), findsOneWidget);
    });

    testWidgets('it can be opened again after it was closed', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 1, 0);
      await tester.tap(close);
      await tester.pumpAndSettle();

      await openPhoto(tester, 2, 0);

      expect(viewer, findsOneWidget);
    });
  });

  group('more than one photo', () {
    testWidgets('they can be swiped, and the pill says which one it is', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 2, 0);
      expect(counterText(tester), '1 / 3');

      await swipeLeft(tester);
      expect(counterText(tester), '2 / 3');
      expect(tester.widget<Image>(find.byKey(const ValueKey('photo-viewer-image-1'))).image, isA<NetworkImage>());

      await swipeLeft(tester);
      expect(counterText(tester), '3 / 3');

      await swipeRight(tester);
      expect(counterText(tester), '2 / 3');
    });

    testWidgets('it stays on the last photo when swiped past the end, and on the first when swiped before it', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 2, 0);

      await swipeRight(tester);
      expect(counterText(tester), '1 / 3');
      await swipeLeft(tester);
      await swipeLeft(tester);
      await swipeLeft(tester);
      expect(counterText(tester), '3 / 3');
    });

    testWidgets('it opens on the photo that was pressed, and the pill is right at once', (tester) async {
      await openDestination(tester);

      await openPhoto(tester, 2, 1);
      expect(counterText(tester), '2 / 3');
      await tester.tap(close);
      await tester.pumpAndSettle();

      await openPhoto(tester, 2, 2);
      expect(counterText(tester), '3 / 3');
    });

    testWidgets('the pill is the same one the destination\'s slideshow has', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 2, 0);

      expect(find.descendant(of: counter, matching: find.byType(PhotoCounterPill)), findsOneWidget);
    });

    testWidgets('they can be swiped with the mouse too (the web)', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 2, 0);

      final gesture = await tester.startGesture(tester.getCenter(pages), kind: PointerDeviceKind.mouse);
      await gesture.moveBy(const Offset(-300, 0));
      await gesture.up();
      await settle(tester);

      expect(counterText(tester), '2 / 3');
    });
  });

  group('one photo', () {
    testWidgets('has no pill and nothing to swipe to', (tester) async {
      await openDestination(tester);

      await openPhoto(tester, 1, 0);

      expect(counter, findsNothing);
      expect(find.byType(PhotoCounterPill), findsNothing);
      expect(tester.widget<PageView>(pages).childrenDelegate.estimatedChildCount, 1);
    });
  });

  group('a photo that is coming, and one that cannot be loaded', () {
    testWidgets('while it comes there is a spinner, not an empty black page', (tester) async {
      debugNetworkImageHttpClientProvider = () => HangingClient();
      try {
        await openDestination(tester);

        await openPhoto(tester, 1, 0);

        expect(find.byKey(const ValueKey('photo-viewer-loading-0')), findsOneWidget);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.byKey(const ValueKey('photo-viewer-error-0')), findsNothing);
      } finally {
        debugNetworkImageHttpClientProvider = null; // the test's own checks, after the body, want it unset
      }
    });

    testWidgets('a photo that cannot be loaded says so, and nothing crashes', (tester) async {
      await openDestination(tester); // the faked network answers every photo with a failure

      await openPhoto(tester, 1, 0);

      expect(find.byKey(const ValueKey('photo-viewer-error-0')), findsOneWidget);
      expect(find.text('This photo could not be loaded.'), findsOneWidget);
      expect(find.byIcon(Icons.broken_image_outlined), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(close, findsOneWidget); // and it can still be closed
      await tester.tap(close);
      await tester.pumpAndSettle();
      expect(viewer, findsNothing);
    });

    testWidgets('in a set, the one that failed says so on its page and the others are still there to swipe to', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 2, 0);

      await swipeLeft(tester);

      expect(counterText(tester), '2 / 3');
      expect(find.byKey(const ValueKey('photo-viewer-error-1')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('just looking', () {
    testWidgets('no download and no share: the Close button is the only button', (tester) async {
      await openDestination(tester);
      await openPhoto(tester, 2, 0);

      final inViewer = find.descendant(of: viewer, matching: find.byType(IconButton));
      expect(inViewer, findsOneWidget);
      expect(find.descendant(of: viewer, matching: find.byIcon(Icons.close)), findsOneWidget);
      for (final icon in [Icons.download, Icons.download_outlined, Icons.share, Icons.share_outlined, Icons.save_alt, Icons.ios_share, Icons.file_download]) {
        expect(find.descendant(of: viewer, matching: find.byIcon(icon)), findsNothing);
      }
      expect(find.descendant(of: viewer, matching: find.byType(TextButton)), findsNothing);
      expect(find.descendant(of: viewer, matching: find.byType(FilledButton)), findsNothing);
    });
  });
}
