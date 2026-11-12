import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_household_location_test.dart' show FakeHouseholdLocation;

const barangays = [
  BarangayItem(id: 11, name: 'Daungan'),
  BarangayItem(id: 22, name: 'Polo'),
];
Map<String, dynamic> sitioRows(int id) => {
  'barangay_id': id,
  'rows': [
    {
      'id': id + 1,
      'barangay_id': id,
      'name': 'SYNTHETIC ONLY $id',
      'is_active': true,
    },
  ],
};
Map<String, dynamic> record(int id) => {
  'id': id,
  'household_head': 'SYNTHETIC household',
  'business_name': 'SYNTHETIC establishment',
  'barangay': 'Daungan',
  'address': 'Preserve complete address',
  'latitude': null,
  'longitude': null,
  'sitio': 'Legacy exact text',
  'sitio_reference': null,
  'sitio_source': 'unknown',
};

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'synthetic-session',
    }),
  );

  test(
    'coordinate validation accepts zero and rejects malformed or nonfinite pairs',
    () {
      for (final pair in [
        ['0', '0'],
        ['0.00001', '-0.00001'],
        ['-90', '180'],
      ]) {
        expect(sanitationCoordinatePair(pair[0], pair[1]), isNotNull);
      }
      for (final pair in [
        ['NaN', '1'],
        ['1', 'Infinity'],
        ['91', '1'],
        ['1', '-181'],
        ['', '1'],
      ]) {
        expect(sanitationCoordinatePair(pair[0], pair[1]), isNull);
      }
    },
  );

  test(
    'capture retains reported accuracy, UTC instant and mock status',
    () async {
      final position = await FakeHouseholdLocation().getCurrentPosition();
      final details = SanitationLocationDetails.fromPosition(position);
      expect(details.capture, {
        'method': 'device_reported',
        'accuracy_m': 10.0,
        'captured_at': position.timestamp.toUtc().toIso8601String(),
        'reported_mock': false,
      });
      expect(details.description, contains('Device-reported'));
      expect(details.description, contains('UTC'));
      expect(const SanitationLocationDetails(source: 'manual').capture, {
        'method': 'manual',
      });
    },
  );

  test(
    'Sitio selection ignores stale Barangay responses and submits correct reference',
    () async {
      final first = Completer<http.Response>();
      final client = MockClient((request) async {
        final id = int.parse(request.url.queryParameters['barangay_id']!);
        return id == 11
            ? first.future
            : http.Response(jsonEncode(sitioRows(id)), 200);
      });
      await http.runWithClient(() async {
        final selection = SanitationSitioSelection(
          api: const TourismApi(),
          barangays: barangays,
          barangay: 'Daungan',
          reference: 12,
          text: 'Saved configured',
          source: 'configured',
        );
        final pending = selection.load('synthetic-session');
        await Future<void>.delayed(Duration.zero);
        selection.changeBarangay('Polo', 'synthetic-session');
        await Future<void>.delayed(const Duration(milliseconds: 10));
        first.complete(http.Response(jsonEncode(sitioRows(11)), 200));
        await pending;
        expect(selection.barangay, 'Polo');
        expect(selection.reference, isNull);
        expect(selection.text, '');
        expect(selection.choices.single.barangayId, 22);
        selection.select('id-23');
        expect(selection.changes, {
          'sitio_reference': 23,
          'sitio': 'SYNTHETIC ONLY 22',
        });
        expect(selection.validationError, isNull);
        selection.dispose();
      }, () => client);
      client.close();
    },
  );

  test('legacy Sitio is untouched until explicit manual or clear action', () {
    final selection = SanitationSitioSelection(
      api: const TourismApi(),
      barangays: barangays,
      barangay: 'Daungan',
      text: '  Exact LEGACY  ',
    );
    expect(selection.changes, isEmpty);
    selection.select('manual');
    selection.enterText('Manual choice');
    expect(selection.changes, {
      'sitio_reference': null,
      'sitio': 'Manual choice',
    });
    selection.select('');
    expect(selection.changes, {'sitio_reference': null, 'sitio': ''});
    selection.dispose();
  });

  test(
    'offline Barangay display positions never become Sitio API IDs',
    () async {
      var requests = 0;
      final client = MockClient((_) async {
        requests++;
        return http.Response('{}', 200);
      });
      await http.runWithClient(() async {
        final selection = SanitationSitioSelection(
          api: const TourismApi(),
          barangays: sanitationBarangayFallback,
          barangay: 'Daungan',
        );
        await selection.load('synthetic-session');
        expect(selection.error, contains('Barangay reference is unavailable'));
        expect(requests, 0);
        selection.dispose();
      }, () => client);
      client.close();
    },
  );

  test(
    'configured Sitio hydration, loading failure, retry and empty choices preserve saved values',
    () async {
      var fail = true;
      var empty = false;
      final client = MockClient(
        (_) async => fail
            ? http.Response('{"detail":"Synthetic failure"}', 503)
            : http.Response(
                jsonEncode(
                  empty ? {'barangay_id': 11, 'rows': []} : sitioRows(11),
                ),
                200,
              ),
      );
      await http.runWithClient(() async {
        final selection = SanitationSitioSelection(
          api: const TourismApi(),
          barangays: barangays,
          barangay: 'Daungan',
          reference: 12,
          text: 'SYNTHETIC ONLY 11',
          source: 'configured',
        );
        await selection.load('synthetic-session');
        expect(selection.error, isNotNull);
        expect(selection.reference, 12);
        expect(selection.changes, isEmpty);
        fail = false;
        await selection.load('synthetic-session');
        expect(selection.choices.single.id, 12);
        expect(selection.reference, 12);
        expect(selection.changes, isEmpty);
        selection.select('id-12');
        empty = true;
        await selection.load('synthetic-session');
        expect(selection.choices, isEmpty);
        expect(selection.validationError, isNotNull);
        selection.select('');
        expect(selection.validationError, isNull);
        selection.dispose();
      }, () => client);
      client.close();
    },
  );

  test(
    'location API rejects invalid saved IDs and unrelated fields before HTTP',
    () async {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      });
      await http.runWithClient(() async {
        expect(
          () => const TourismApi().fetchSanitationLocationRecord(
            0,
            household: false,
            expectedSessionToken: 'synthetic-session',
          ),
          throwsArgumentError,
        );
        expect(
          () => const TourismApi().patchSanitationLocationRecord(
            7,
            {'address': 'Do not send'},
            household: false,
            expectedSessionToken: 'synthetic-session',
          ),
          throwsArgumentError,
        );
        expect(calls, 0);
      }, () => client);
      client.close();
    },
  );

  for (final cancel in [true, false]) {
    testWidgets(
      'saved editor discards pending GPS after ${cancel ? 'cancellation' : 'session change'}',
      (tester) async {
        tester.view.physicalSize = const Size(1000, 4000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final position = Completer<Position>();
        final location = FakeHouseholdLocation()
          ..pendingPosition = position.future;
        final requests = <http.Request>[];
        final client = MockClient((request) async {
          requests.add(request);
          return http.Response(
            jsonEncode(
              request.url.path.endsWith('/sitios/') ? sitioRows(11) : record(7),
            ),
            200,
          );
        });
        await http.runWithClient(() async {
          await tester.pumpWidget(
            MaterialApp(
              home: SavedSanitationLocationPage(
                api: const TourismApi(),
                recordId: 7,
                household: false,
                barangays: barangays,
                locationAdapter: location,
              ),
            ),
          );
          await tester.pump(const Duration(milliseconds: 100));
          await tester.tap(find.text('Use GPS'));
          await tester.pump();
          if (cancel) {
            await tester.pumpWidget(const SizedBox());
          } else {
            await setStaffSessionToken(
              await SharedPreferences.getInstance(),
              'replacement-session',
            );
            await tester.pump();
          }
          position.complete(await FakeHouseholdLocation().getCurrentPosition());
          await tester.pump(const Duration(milliseconds: 100));
          expect(tester.takeException(), isNull);
          expect(find.textContaining('Reported accuracy'), findsNothing);
          expect(requests.where((request) => request.method != 'GET'), isEmpty);
          await tester.pumpWidget(const SizedBox());
        }, () => client);
        client.close();
      },
    );
  }

  test(
    'Sitio API fails closed on wrong Barangay, inactive choice and duplicate IDs',
    () async {
      for (final data in [
        sitioRows(22),
        {
          'barangay_id': 11,
          'rows': [
            {
              'id': 12,
              'name': 'Synthetic',
              'barangay_id': 11,
              'is_active': false,
            },
          ],
        },
        {
          'barangay_id': 11,
          'rows': [...sitioRows(11)['rows'], ...sitioRows(11)['rows']],
        },
      ]) {
        final client = MockClient(
          (_) async => http.Response(jsonEncode(data), 200),
        );
        await http.runWithClient(() async {
          await expectLater(
            const TourismApi().fetchSanitationSitios(
              11,
              expectedSessionToken: 'synthetic-session',
            ),
            throwsFormatException,
          );
        }, () => client);
        client.close();
      }
    },
  );

  test(
    'session change rejects an in-flight API response and never uses replacement token',
    () async {
      final pending = Completer<http.Response>();
      final requests = <http.Request>[];
      final client = MockClient((request) {
        requests.add(request);
        return pending.future;
      });
      await http.runWithClient(() async {
        final request = const TourismApi().fetchSanitationLocationRecord(
          7,
          household: false,
          expectedSessionToken: 'synthetic-session',
        );
        final rejected = expectLater(request, throwsA(isA<ApiException>()));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        final prefs = await SharedPreferences.getInstance();
        await setStaffSessionToken(prefs, 'replacement-session');
        pending.complete(http.Response(jsonEncode(record(7)), 200));
        await rejected;
        expect(
          requests.single.headers['Authorization'],
          'Token synthetic-session',
        );
      }, () => client);
      client.close();
    },
  );

  for (final household in [true, false]) {
    testWidgets(
      '${household ? 'household repair' : 'establishment'} fetch, confirm, retry and readback use exact ID',
      (tester) async {
        tester.view.physicalSize = const Size(1000, 4000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final writes = <http.Request>[];
        var saved = record(71);
        var fail = true;
        final client = MockClient((request) async {
          if (request.url.path.endsWith('/sitios/')) {
            return http.Response(jsonEncode(sitioRows(11)), 200);
          }
          expect(
            request.url.path,
            household
                ? '/api/households/records/71/'
                : '/api/sanitation/establishments/71/',
          );
          if (request.method == 'PATCH') {
            writes.add(request);
            if (fail) {
              return http.Response('{"latitude":["Synthetic failure"]}', 400);
            }
            saved = {
              ...saved,
              ...jsonDecode(request.body),
              'location_source': 'device_reported',
              'location_accuracy_m': 10.0,
              'location_captured_at': '2026-10-04T00:00:00Z',
            };
          }
          return http.Response(jsonEncode(saved), 200);
        });
        await http.runWithClient(() async {
          await tester.pumpWidget(
            MaterialApp(
              home: SavedSanitationLocationPage(
                api: const TourismApi(),
                recordId: 71,
                household: household,
                barangays: barangays,
                locationAdapter: FakeHouseholdLocation(),
              ),
            ),
          );
          await tester.pump(const Duration(milliseconds: 100));
          expect(find.textContaining('Legacy exact text'), findsWidgets);
          await tester.tap(find.text('Use GPS'));
          await tester.pump(const Duration(milliseconds: 100));
          expect(
            tester
                .widget<LocationConfirmationPanel>(
                  find.byType(LocationConfirmationPanel),
                )
                .confirmed,
            isFalse,
          );
          expect(
            find.textContaining('Reported accuracy 10.0 m'),
            findsOneWidget,
          );
          await tester.tap(find.text('Save Location and Sitio'));
          await tester.pump();
          expect(writes, isEmpty);
          await tester.tap(find.text('Confirm Pin'));
          await tester.pump();
          await tester.tap(find.text('Save Location and Sitio'));
          await tester.pump(const Duration(milliseconds: 100));
          expect(writes, hasLength(1));
          final body = jsonDecode(writes.single.body) as Map;
          expect(body.keys.toSet(), {
            'latitude',
            'longitude',
            'location_capture',
          });
          expect(body['latitude'], 14.213456789);
          expect(body['location_capture']['method'], 'device_reported');
          expect(find.textContaining('Synthetic failure'), findsOneWidget);
          expect(saved['latitude'], isNull);
          fail = false;
          await tester.tap(find.text('Save Location and Sitio'));
          await tester.pump(const Duration(milliseconds: 100));
          expect(writes, hasLength(2));
          expect(saved['address'], 'Preserve complete address');
          expect(saved['sitio'], 'Legacy exact text');
          expect(find.text('Location and Sitio saved.'), findsOneWidget);
          await tester.pumpWidget(const SizedBox());
        }, () => client);
        client.close();
      },
    );
  }

  for (final width in [320.0, 360.0, 412.0]) {
    testWidgets('household survey fits $width with enlarged text', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final client = MockClient(
        (_) async => http.Response(jsonEncode(sitioRows(11)), 200),
      );
      await http.runWithClient(() async {
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(1.5)),
              child: child!,
            ),
            home: const HouseholdSurveyPage(
              api: TourismApi(),
              barangays: barangays,
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(
          find.byType(LocationCapturePanel),
          400,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.text('Household Location')).height,
          lessThan(65),
        );
        await tester.pumpWidget(const SizedBox());
      }, () => client);
      client.close();
    });
    for (final title in ['Household Location', 'Report Location']) {
      testWidgets('$title readable at $width with enlarged text', (
        tester,
      ) async {
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(width, 900),
                textScaler: TextScaler.linear(1.5),
              ),
              child: Center(
                child: SizedBox(
                  width: width,
                  child: LocationCapturePanel(
                    latitude: '',
                    longitude: '',
                    locating: false,
                    title: title,
                    onCapture: () {},
                  ),
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull);
        expect(tester.getSize(find.text(title)).height, lessThan(65));
        expect(tester.getSize(find.text(title)).width, greaterThan(240));
      });
    }
  }
}
