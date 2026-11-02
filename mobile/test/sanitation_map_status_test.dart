import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mauban_mobile_app/main.dart';

const expectedStatuses = <String, (String, Color)>{
  'good_standing': ('Good Standing', Color(0xff28a84a)),
  'upcoming': ('Upcoming', Color(0xffd59b00)),
  'for_completion': ('For Completion', Color(0xffef6c00)),
  'violation': ('Violation', Color(0xfff44336)),
  'no_permit': ('No Permit', Color(0xff7b1fa2)),
  'not_yet_inspected': ('Not Yet Inspected', Color(0xff6b7280)),
};

List<SanitationEstablishment> establishmentFixtures() => [
  for (final entry in expectedStatuses.entries.indexed)
    SanitationEstablishment.fromJson({
      'id': entry.$1 + 1, 'business_name': 'Store ${entry.$2.key}',
      'barangay': 'Daungan', 'compliance_status': entry.$2.key,
      // A stale/default label and conflicting permit must never colour the pin.
      'compliance_status_label': 'Good Standing', 'permit_status': 'active',
      'latitude': 14.185 + entry.$1 * 0.001, 'longitude': 121.731,
    }),
  SanitationEstablishment.fromJson({
    'id': 7,
    'business_name': 'Future status store',
    'compliance_status': 'future_status',
    'latitude': 14.19,
    'longitude': 121.732,
  }),
  SanitationEstablishment.fromJson({
    'id': 8,
    'business_name': 'Unmapped store',
    'latitude': 0,
    'longitude': 0,
  }),
  SanitationEstablishment.fromJson({
    'id': 9,
    'business_name': 'Invalid coordinate store',
    'latitude': 91,
    'longitude': 121.731,
  }),
  SanitationEstablishment.fromJson({
    'id': 10,
    'business_name': 'Nonfinite store',
    'latitude': double.infinity,
    'longitude': 121.731,
  }),
];

Future<void> pumpMap(
  WidgetTester tester, {
  double width = 430,
  double scale = 1,
}) async {
  tester.view.physicalSize = Size(width, 2200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: Scaffold(
        body: SanitationMapPage(
          establishments: establishmentFixtures(),
          householdRecords: [
            HouseholdSanitationItem.fromJson({
              'id': 1,
              'household_head': 'Daungan household',
              'barangay': 'Daungan',
              'status': 'good_standing',
              'latitude': 14.185,
              'longitude': 121.731,
            }),
            HouseholdSanitationItem.fromJson({
              'id': 2,
              'household_head': 'Mabato household',
              'barangay': 'Mabato',
              'status': 'violation',
              'latitude': 14.186,
              'longitude': 121.732,
            }),
            HouseholdSanitationItem.fromJson({
              'id': 3,
              'household_head': 'Unmapped household',
              'barangay': 'Daungan',
            }),
          ],
          onRefresh: () async {},
          refreshing: false,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

List<Marker> markers(WidgetTester tester) =>
    tester.widget<MarkerLayer>(find.byType(MarkerLayer)).markers;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    rootBundle.evict('assets/mauban_barangays.json');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', (message) async {
          final name = utf8.decode(
            message!.buffer.asUint8List(
              message.offsetInBytes,
              message.lengthInBytes,
            ),
          );
          if (name != 'assets/mauban_barangays.json') return null;
          return ByteData.sublistView(
            Uint8List.fromList(
              utf8.encode(
                jsonEncode({
                  'type': 'FeatureCollection',
                  'features': [
                    {
                      'properties': {'NAME_3': 'Daungan'},
                      'geometry': {
                        'type': 'Polygon',
                        'coordinates': [
                          [
                            [121.72, 14.18],
                            [121.74, 14.18],
                            [121.74, 14.20],
                            [121.72, 14.20],
                            [121.72, 14.18],
                          ],
                        ],
                      },
                    },
                  ],
                }),
              ),
            ),
          );
        });
  });
  tearDown(() {
    rootBundle.evict('assets/mauban_barangays.json');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', null);
  });
  test(
    'omitted and null compliance remain unavailable instead of becoming Upcoming',
    () {
      final base = <String, dynamic>{
        'id': 1,
        'business_name': 'Source provenance fixture',
        'latitude': 14.185,
        'longitude': 121.731,
      };
      final omitted = SanitationEstablishment.fromJson(base);
      final nullStatus = SanitationEstablishment.fromJson({
        ...base,
        'compliance_status': null,
      });
      final explicit = SanitationEstablishment.fromJson({
        ...base,
        'compliance_status': 'upcoming',
      });
      expect(omitted.complianceStatus, isEmpty);
      expect(nullStatus.complianceStatus, isEmpty);
      expect(omitted.toJson().containsKey('compliance_status'), isFalse);
      expect(explicit.complianceStatus, 'upcoming');
      expect(sanitationEstablishmentMapStatus(omitted.complianceStatus), (
        label: 'Status unavailable',
        color: AppColors.muted,
      ));
      expect(
        sanitationEstablishmentMapStatus(explicit.complianceStatus).label,
        'Upcoming',
      );
    },
  );

  test(
    'explicit blank and unknown compliance values do not claim a known status',
    () {
      final blank = SanitationEstablishment.fromJson({'compliance_status': ''});
      final unknown = SanitationEstablishment.fromJson({
        'compliance_status': 'future_status',
      });
      expect(sanitationEstablishmentMapStatus(blank.complianceStatus), (
        label: 'Status unavailable',
        color: AppColors.muted,
      ));
      expect(sanitationEstablishmentMapStatus(unknown.complianceStatus), (
        label: 'future_status',
        color: AppColors.muted,
      ));
    },
  );

  testWidgets('closing map before boundary loading completes is safe', (
    tester,
  ) async {
    final pending = Completer<ByteData?>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', (_) => pending.future);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SanitationMapPage(
            establishments: const [],
            householdRecords: const [],
            onRefresh: () async {},
            refreshing: false,
          ),
        ),
      ),
    );
    await tester.pumpWidget(const SizedBox());
    pending.complete(
      ByteData.sublistView(Uint8List.fromList(utf8.encode('{"features":[]}'))),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'six compliance statuses have distinct stored-coordinate pins and matching legends',
    (tester) async {
      await pumpMap(tester);
      expect(markers(tester), hasLength(7));
      expect(find.text('7 mapped records'), findsOneWidget);
      final colours = <Color>{};
      for (final entry in expectedStatuses.entries.indexed) {
        final marker = markers(tester)[entry.$1];
        final tooltip = marker.child as Tooltip;
        final pin = tooltip.child as MapPin;
        expect(pin.color, entry.$2.value.$2);
        colours.add(pin.color!);
        expect(marker.point.latitude, 14.185 + entry.$1 * 0.001);
        expect(marker.point.longitude, 121.731);
        expect(tooltip.message, contains(entry.$2.value.$1));
        final legend = find.byKey(
          ValueKey('establishment-map-legend-${entry.$2.key}'),
        );
        expect(
          find.descendant(of: legend, matching: find.text(entry.$2.value.$1)),
          findsOneWidget,
        );
        final swatch = tester.widget<Container>(
          find.descendant(of: legend, matching: find.byType(Container)),
        );
        expect((swatch.decoration as BoxDecoration).color, pin.color);
        final info = tester
            .widgetList<SimpleInfoCard>(find.byType(SimpleInfoCard))
            .singleWhere((item) => item.title == 'Store ${entry.$2.key}');
        expect(info.trailing, entry.$2.value.$1);
        expect(info.statusColor, pin.color);
      }
      expect(colours, hasLength(6));
      expect(
        ((markers(tester).last.child as Tooltip).child as MapPin).color,
        AppColors.muted,
      );
      expect(find.text('Other / Unknown'), findsOneWidget);
      expect(find.text('Unmapped store'), findsNothing);
      expect(find.text('Invalid coordinate store'), findsNothing);
      expect(find.text('Nonfinite store'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'barangay selection filters pins, count and details together; switching layers clears selection',
    (tester) async {
      await pumpMap(tester);
      await tester.tap(find.text('Households'));
      await tester.pumpAndSettle();
      expect(markers(tester), hasLength(2));
      final polygons = tester.widget<PolygonLayer<Object>>(
        find.byWidgetPredicate((widget) => widget is PolygonLayer),
      );
      // Simulate the same hit notifier used by the existing polygon interaction.
      // ignore: invalid_use_of_internal_member
      polygons.hitNotifier!.value = const LayerHitResult<Object>(
        hitValues: ['Daungan'],
        coordinate: LatLng(14.185, 121.731),
        point: Offset.zero,
      );
      await tester.pumpAndSettle();
      expect(markers(tester), hasLength(1));
      expect(find.text('1 mapped records'), findsOneWidget);
      expect(find.text('Daungan household'), findsOneWidget);
      expect(find.text('Mabato household'), findsNothing);
      expect(find.text('Unmapped household'), findsNothing);
      expect(find.byType(InputChip), findsOneWidget);
      final notifier = polygons.hitNotifier!;
      await tester.tap(find.byTooltip('Clear barangay filter'));
      await tester.pumpAndSettle();
      expect(markers(tester), hasLength(2));
      // ignore: invalid_use_of_internal_member
      notifier.value = const LayerHitResult<Object>(
        hitValues: ['Daungan'],
        coordinate: LatLng(14.185, 121.731),
        point: Offset.zero,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Establishments'));
      await tester.pumpAndSettle();
      expect(markers(tester), hasLength(7));
      expect(find.byType(InputChip), findsNothing);
      expect(
        find.byWidgetPredicate((widget) => widget is PolygonLayer),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    },
  );

  for (final width in [320.0, 360.0]) {
    testWidgets(
      'map legend and status details fit at $width with enlarged text',
      (tester) async {
        await pumpMap(tester, width: width, scale: 1.3);
        for (final status in expectedStatuses.keys) {
          expect(
            find.byKey(ValueKey('establishment-map-legend-$status')),
            findsOneWidget,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
