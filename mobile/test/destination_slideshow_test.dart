// The slideshow on Destination Details: the photos that were uploaded, and ONLY those when there is at least one; the built-in photo only
// when there is none. It used to add the built-in photo to the uploads, so a destination with one photo read "2 / 2".
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const logo = 'assets/tourism_logo.png';
const one = 'https://cdn.example.com/media/resorts/one.png';
const two = 'https://cdn.example.com/media/resorts/two.png';
const build = '/static/media/Dona Choleng Camping Resort - Cagbalete.68a26fe8bbc35d2f6ae3.jpg';

Destination destination({String key = '', List<Object?> images = const []}) =>
    Destination.fromJson({
      'resort_id': 1,
      'resort_name': 'Test Beach',
      'type': 'Beach',
      'monthly_arrivals': 12,
      'image_key': key,
      'images': images,
    });

Future<void> pump(WidgetTester tester, Destination d) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SizedBox(width: 300, height: 300, child: DestinationImageSlideshow(destination: d)),
      ),
    ),
  );
  await tester.pump();
}

Finder counter(String text) => find.text(text);

/// How many slides the PageView has.
int slides(WidgetTester tester) {
  final delegate = tester.widget<PageView>(find.byType(PageView)).childrenDelegate as SliverChildBuilderDelegate;
  return delegate.estimatedChildCount!;
}
Finder anyCounter() => find.byWidgetPredicate((w) => w is Text && RegExp(r'^\d+ / \d+$').hasMatch(w.data ?? ''));

Finder networkImage(String url) => find.byWidgetPredicate(
  (w) => w is Image && w.image is NetworkImage && (w.image as NetworkImage).url == url,
);

Finder assetImage(String name) => find.byWidgetPredicate(
  (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == name,
);

void main() {
  testWidgets('one upload: one slide, and no "2 / 2" counter at all', (tester) async {
    await pump(tester, destination(key: 'best-resort', images: [one]));
    expect(slides(tester), 1, reason: 'the built-in photo is not added to an upload');
    expect(anyCounter(), findsNothing);
  });

  testWidgets('two uploads: two slides, "1 / 2"', (tester) async {
    await pump(tester, destination(key: 'best-resort', images: [one, two]));
    expect(slides(tester), 2);
    expect(counter('1 / 2'), findsOneWidget);
    expect(anyCounter(), findsOneWidget);
  });

  testWidgets('no upload: the built-in photo of the key, and no counter', (tester) async {
    await pump(tester, destination(key: 'aquazul'));
    expect(slides(tester), 1);
    expect(assetImage('assets/destinations/Aquazul Hotel and Resort - Cagbalete.jpg'), findsOneWidget);
    expect(anyCounter(), findsNothing);
  });

  testWidgets('no upload and no key: the logo', (tester) async {
    await pump(tester, destination());
    expect(assetImage(logo), findsOneWidget);
    expect(anyCounter(), findsNothing);
  });

  testWidgets('a build path of the web is not a slide: with it and no real upload, the built-in photo alone', (tester) async {
    await pump(tester, destination(key: 'dona-choleng-camping-resort', images: [build]));
    expect(assetImage('assets/destinations/Dona Choleng Camping Resort - Cagbalete.jpg'), findsOneWidget);
    expect(anyCounter(), findsNothing);
  });

  testWidgets('a build path next to a real upload is left out: one slide', (tester) async {
    await pump(tester, destination(key: 'dona-choleng-camping-resort', images: [build, one]));
    expect(slides(tester), 1);
    expect(anyCounter(), findsNothing);
  });

  testWidgets('an asset name in the list is the built-in photo when there is no upload', (tester) async {
    await pump(tester, destination(images: ['assets/destinations/Orlan Beach Resort - Cagbalete.jpg']));
    expect(assetImage('assets/destinations/Orlan Beach Resort - Cagbalete.jpg'), findsOneWidget);
    expect(anyCounter(), findsNothing);
  });

  testWidgets('the same upload twice is one slide', (tester) async {
    await pump(tester, destination(images: [one, one]));
    expect(slides(tester), 1);
    expect(anyCounter(), findsNothing);
  });
}
