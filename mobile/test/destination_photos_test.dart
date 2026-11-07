// A destination photo: the one that was uploaded is shown (on every card that uses DestinationImage), and the built-in one only when there
// is none, while it loads, or when it cannot be loaded. And the built-in one is chosen by an exact piece of the image key: a key that
// matches none gets the logo, never the photo of ANOTHER resort.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const logo = 'assets/tourism_logo.png';
const uploaded = 'https://cdn.example.com/media/resorts/abc123.png';

Destination destination({String key = '', List<Object?> images = const []}) =>
    Destination.fromJson({
      'resort_id': 1,
      'resort_name': 'Test Beach',
      'type': 'Beach',
      'monthly_arrivals': 12,
      'image_key': key,
      'images': images,
    });

Future<void> pump(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: SizedBox(width: 300, height: 300, child: child)),
    ),
  );
}

Finder networkImage(String url) => find.byWidgetPredicate(
  (w) => w is Image && w.image is NetworkImage && (w.image as NetworkImage).url == url,
);

Finder assetImage(String name) => find.byWidgetPredicate(
  (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == name,
);

void main() {
  group('B: the uploaded photo is shown', () {
    testWidgets('a destination with an upload shows it', (tester) async {
      await pump(tester, DestinationImage(destination: destination(images: [uploaded])));
      expect(networkImage(uploaded), findsOneWidget);
    });

    testWidgets('a destination with no upload shows the built-in one', (tester) async {
      await pump(tester, DestinationImage(destination: destination(key: 'aquazul')));
      expect(assetImage('assets/destinations/Aquazul Hotel and Resort - Cagbalete.jpg'), findsOneWidget);
      expect(find.byWidgetPredicate((w) => w is Image && w.image is NetworkImage), findsNothing);
    });

    testWidgets('with no upload and no key it is the logo', (tester) async {
      await pump(tester, DestinationImage(destination: destination()));
      expect(assetImage(logo), findsOneWidget);
    });

    testWidgets('a bare /media/ path of an older server is fetched from the server, not from /api/media/', (tester) async {
      await pump(tester, DestinationImage(destination: destination(images: ['/media/resorts/x.png'])));
      final url = '$serverOrigin/media/resorts/x.png';
      expect(networkImage(url), findsOneWidget);
      expect(url.contains('/api/'), isFalse, reason: url);
    });

    testWidgets('the first upload is the one shown, and a name that is only an asset is not an upload', (tester) async {
      await pump(
        tester,
        DestinationImage(destination: destination(images: ['assets/destinations/x.jpg', '', uploaded, 'https://cdn.example.com/second.png'])),
      );
      expect(networkImage(uploaded), findsOneWidget);
      expect(networkImage('https://cdn.example.com/second.png'), findsNothing);
    });

    testWidgets('only a name of an asset in images: the built-in photo, no network', (tester) async {
      await pump(tester, DestinationImage(destination: destination(images: ['assets/destinations/x.jpg'])));
      expect(find.byWidgetPredicate((w) => w is Image && w.image is NetworkImage), findsNothing);
      expect(assetImage(logo), findsOneWidget);
    });

    testWidgets('when the upload cannot be loaded, the built-in photo is shown', (tester) async {
      // the test binding answers every HTTP request with an error, so the upload fails to load
      await pump(tester, DestinationImage(destination: destination(key: 'orlan', images: [uploaded])));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      expect(assetImage('assets/destinations/Orlan Beach Resort - Cagbalete.jpg'), findsOneWidget);
    });

    testWidgets('the cards of the list use it too', (tester) async {
      final d = destination(images: [uploaded]);
      await pump(tester, SingleChildScrollView(child: DestinationListCard(destination: d, onTap: () {})));
      expect(networkImage(uploaded), findsOneWidget);
    });

    test('serverImageUrl: whole URLs as they are, /media/ on the server, anything else is not a server photo', () {
      expect(serverImageUrl('https://a.example/x.png'), 'https://a.example/x.png');
      expect(serverImageUrl('  http://a.example/x.png '), 'http://a.example/x.png');
      expect(serverImageUrl('/media/resorts/x.png'), '$serverOrigin/media/resorts/x.png');
      expect(serverImageUrl('assets/destinations/x.jpg'), isNull);
      expect(serverImageUrl(''), isNull);
      expect(serverOrigin.endsWith('/api'), isFalse);
      expect(serverOrigin.endsWith('/'), isFalse);
    });
  });

  group('C: no photo of another resort', () {
    test('"best-resort" is not the photo of any resort: it is the logo', () {
      final asset = imageAssetFor('best-resort');
      expect(asset, logo);
      expect(asset.startsWith('assets/destinations/'), isFalse);
    });

    test('the words beach, resort, cove and island no longer pick a photo', () {
      for (final key in ['beach', 'resort', 'cove', 'island', 'zz-bago-k7q-beach-resort', 'my-new-island-cove']) {
        expect(imageAssetFor(key), logo, reason: key);
      }
    });

    test('a key of any length gets the same answer: the length does not choose a photo', () {
      final answers = {for (var n = 1; n <= 40; n++) imageAssetFor('resort${'x' * n}')};
      expect(answers, {logo});
    });

    test('the 15 matches by key still work', () {
      const expected = {
        'aguho-playa': 'assets/destinations/Aguho Playa Beach Resort - Cagbalete.jpg',
        'aquazul-hotel': 'assets/destinations/Aquazul Hotel and Resort - Cagbalete.jpg',
        'dona-choleng-camping': 'assets/destinations/Dona Choleng Camping Resort - Cagbalete.jpg',
        'jovencios-resort': "assets/destinations/Jovencio's Resort Cagbalete.jpg",
        'mvt-sto-nino': 'assets/destinations/MVT Sto. Nino Beach Resort - Cagbalete.jpg',
        'nenita-del-sol': 'assets/destinations/Nenita Del Sol - Cagbalete.jpg',
        'nilandingan-cove': 'assets/destinations/Nilandingan Cove Resort - Cagbalete.jpg',
        'orlan-beach': 'assets/destinations/Orlan Beach Resort - Cagbalete.jpg',
        'rio-del-sol-beach': 'assets/destinations/Rio Del Sol Beach Resort - Cagbalete.jpg',
        'tent-place': 'assets/destinations/Tent Place - Cagbalete.jpg',
        'tita-pinay': 'assets/destinations/Tita Pinay Beach Resort - Cagbalete.png',
        'villa-cleofas': 'assets/destinations/Villa Cleofas Cagbalete.webp',
        'villa-escaparde': 'assets/destinations/Villa Escaparde Camping and Beach Resort.jpg',
        'noe-beach-resort': 'assets/destinations/Villa Noe Beach- Cagbalete.jpg',
        'villa-noe': 'assets/destinations/Villa Noe Beach- Cagbalete.jpg',
        'villa-pilarosa': 'assets/destinations/Villa Pilarosa Beach Resort - Cagbalete.png',
      };
      for (final entry in expected.entries) {
        expect(imageAssetFor(entry.key), entry.value, reason: entry.key);
      }
    });

    test('a match is on the key, not on the case of it', () {
      expect(imageAssetFor('  DONA-CHOLENG  '), 'assets/destinations/Dona Choleng Camping Resort - Cagbalete.jpg');
    });
  });
}
