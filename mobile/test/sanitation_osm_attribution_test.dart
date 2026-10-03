import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_community_report_test.dart' show pumpForm;

const osmAttribution = '© OpenStreetMap contributors';
const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const osmUserAgent = 'mauban_sanitation_mobile';

void expectOsmMapConfiguration() {
  final tileLayer = find.byType(TileLayer);
  expect(tileLayer, findsOneWidget);
  final tile = tileLayer.evaluate().single.widget as TileLayer;
  expect(tile.urlTemplate, osmTileUrl);
  expect(
    tile.tileProvider.headers['User-Agent'],
    'flutter_map ($osmUserAgent)',
  );
  expect(find.textContaining('Satellite', findRichText: true), findsNothing);
}

void expectFooterOutsideMap() {
  final footer = find.text(osmAttribution);
  expect(footer, findsOneWidget);
  expect(
    find.ancestor(of: footer, matching: find.byType(FlutterMap)),
    findsNothing,
  );
}

void useNarrowPhone(WidgetTester tester, {double height = 900}) {
  tester.view.physicalSize = Size(360, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'community report map has visible OSM attribution below its canvas',
    (tester) async {
      await pumpForm(tester);
      await tester.ensureVisible(find.text('Adjust on map'));
      await tester.tap(find.text('Adjust on map'));
      await tester.pump();

      expectFooterOutsideMap();
      expectOsmMapConfiguration();
      expect(find.text('Tap the map to move the pin.'), findsOneWidget);
    },
  );

  testWidgets(
    'staff GIS map keeps attribution, overlays, markers, and controls',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SanitationMapPage(
              establishments: [
                SanitationEstablishment.fromJson({
                  'id': 1,
                  'business_name': 'Mapped establishment',
                  'barangay': 'Daungan',
                  'latitude': 14.185,
                  'longitude': 121.731,
                }),
              ],
              householdRecords: [
                HouseholdSanitationItem.fromJson({
                  'id': 2,
                  'household_code': 'HH-MAP',
                  'household_head': 'Mapped household',
                  'barangay': 'Daungan',
                  'status': 'good_standing',
                  'latitude': 14.186,
                  'longitude': 121.732,
                }),
              ],
              onRefresh: () async {},
              refreshing: false,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expectFooterOutsideMap();
      expectOsmMapConfiguration();
      expect(find.byType(SegmentedButton<bool>), findsOneWidget);
      expect(find.byType(MapPin), findsOneWidget);

      await tester.tap(find.text('Households'));
      await tester.pump();
      expect(find.byType(MapPin), findsOneWidget);
      expect(find.byType(PolygonLayer), findsOneWidget);
    },
  );

  testWidgets(
    'household pin map has visible OSM attribution below its canvas',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LocationConfirmationPanel(
              latitude: '14.185',
              longitude: '121.731',
              confirmed: false,
              onChanged: (_) {},
              onConfirm: () {},
            ),
          ),
        ),
      );
      await tester.pump();

      expectFooterOutsideMap();
      expectOsmMapConfiguration();
      expect(find.byType(MapPin), findsOneWidget);
      expect(find.text('Confirm Pin'), findsOneWidget);
    },
  );

  testWidgets('OSM footer fits below a map on a narrow phone', (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: LocationConfirmationPanel(
              latitude: '14.185',
              longitude: '121.731',
              confirmed: false,
              onChanged: (_) {},
              onConfirm: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expectFooterOutsideMap();
    expect(find.text('Confirm Pin'), findsOneWidget);
  });
}
