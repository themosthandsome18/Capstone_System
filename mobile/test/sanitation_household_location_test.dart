import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_household_edit_preservation_test.dart' show storedHousehold;

class FakeHouseholdLocation extends HouseholdLocationAdapter {
  bool enabled = true;
  LocationPermission permission = LocationPermission.whileInUse;
  LocationPermission requested = LocationPermission.denied;
  Object? error;
  final calls = <String>[];
  Future<Position>? pendingPosition;

  @override
  Future<bool> isLocationServiceEnabled() async {
    calls.add('service');
    return enabled;
  }

  @override
  Future<LocationPermission> checkPermission() async {
    calls.add('check');
    return permission;
  }

  @override
  Future<LocationPermission> requestPermission() async {
    calls.add('request');
    return requested;
  }

  @override
  Future<Position> getCurrentPosition() async {
    calls.add('position');
    if (error != null) throw error!;
    return pendingPosition ??
        Future.value(
          Position(
            latitude: 14.213456789,
            longitude: 121.765432198,
            timestamp: DateTime(2026, 10, 4),
            accuracy: 10,
            altitude: 0,
            altitudeAccuracy: 0,
            heading: 0,
            headingAccuracy: 0,
            speed: 0,
            speedAccuracy: 0,
          ),
        );
  }
}

Finder coordinateField(String label) =>
    find.widgetWithText(AppTextField, label);
String coordinateText(WidgetTester tester, String label) =>
    tester.widget<AppTextField>(coordinateField(label)).controller.text;
LocationConfirmationPanel confirmation(WidgetTester tester) => tester
    .widget<LocationConfirmationPanel>(find.byType(LocationConfirmationPanel));

Future<void> pumpHousehold(
  WidgetTester tester,
  FakeHouseholdLocation location, {
  Map<String, dynamic>? stored,
}) async {
  tester.view.physicalSize = const Size(1200, 5000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: HouseholdSurveyPage(
        api: const TourismApi(),
        barangays: SanitationBootstrap.fallback().barangays,
        household: stored == null
            ? null
            : HouseholdSanitationItem.fromJson(stored),
        locationAdapter: location,
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
  if (stored == null) {
    await tester.enterText(
      coordinateField('Household head'),
      'Local GPS household',
    );
    await tester.tap(find.widgetWithText(ChoiceChip, 'Bottomless'));
  }
  tester
      .widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel))
      .onChanged(true);
  await tester.pump();
}

Future<void> capture(WidgetTester tester) async {
  await tester.tap(find.text('Use GPS'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> submit(WidgetTester tester) async {
  await tester.tap(find.text('Submit Household Survey'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> withRequests(
  Future<void> Function(List<http.Request>) body,
) async {
  final requests = <http.Request>[];
  final client = MockClient((request) async {
    requests.add(request);
    return http.Response(
      jsonEncode({
        ...storedHousehold(),
        ...jsonDecode(request.body) as Map<String, dynamic>,
      }),
      request.method == 'POST' ? 201 : 200,
    );
  });
  try {
    await http.runWithClient(() => body(requests), () => client);
  } finally {
    client.close();
  }
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'local-test-token',
    }),
  );

  final failures = <String, String>{
    'service off':
        'Location services are off. Turn them on, then tap Use GPS again.',
    'denied':
        'Location permission was denied. Allow location access, then tap Use GPS again.',
    'denied forever':
        'Location permission is blocked. Enable it in app settings, then tap Use GPS again.',
    'timeout': 'GPS timed out. Move to an open area and tap Use GPS again.',
    'exception':
        'Could not get your GPS location. Check location services and try again.',
  };
  for (final scenario in failures.entries) {
    testWidgets('${scenario.key}: no fabrication, no confirmation, no POST', (
      tester,
    ) async {
      final location = FakeHouseholdLocation();
      switch (scenario.key) {
        case 'service off':
          location.enabled = false;
        case 'denied':
          location.permission = LocationPermission.denied;
        case 'denied forever':
          location.permission = LocationPermission.deniedForever;
        case 'timeout':
          location.error = TimeoutException('test timeout');
        case 'exception':
          location.error = StateError('test geolocation failure');
      }
      await withRequests((requests) async {
        await pumpHousehold(tester, location);
        await capture(tester);
        final observed = <String, Object?>{
          'latitude': coordinateText(tester, 'Latitude'),
          'longitude': coordinateText(tester, 'Longitude'),
          'confirmed': confirmation(tester).confirmed,
          'failureVisible': find.text(scenario.value).evaluate().isNotEmpty,
          'successVisible': find
              .textContaining('GPS location acquired')
              .evaluate()
              .isNotEmpty,
          'locating': tester
              .widget<LocationCapturePanel>(find.byType(LocationCapturePanel))
              .locating,
        };
        await submit(tester);
        observed['requests'] = requests.length;
        observed['postedCoordinates'] = requests.isEmpty
            ? null
            : [
                jsonDecode(requests.single.body)['latitude'],
                jsonDecode(requests.single.body)['longitude'],
              ];
        expect(observed, {
          'latitude': '',
          'longitude': '',
          'confirmed': false,
          'failureVisible': true,
          'successVisible': false,
          'locating': false,
          'requests': 0,
          'postedCoordinates': null,
        });
        expect(location.calls, switch (scenario.key) {
          'service off' => ['service'],
          'denied' => ['service', 'check', 'request'],
          'denied forever' => ['service', 'check'],
          _ => ['service', 'check', 'position'],
        });
      });
    });
  }

  for (final permission in [
    LocationPermission.whileInUse,
    LocationPermission.always,
  ]) {
    testWidgets('real GPS $permission populates and POSTs six decimals', (
      tester,
    ) async {
      await withRequests((requests) async {
        final location = FakeHouseholdLocation()..permission = permission;
        await pumpHousehold(tester, location);
        await capture(tester);
        expect(coordinateText(tester, 'Latitude'), '14.213457');
        expect(coordinateText(tester, 'Longitude'), '121.765432');
        expect(confirmation(tester).confirmed, isTrue);
        final success = find
            .text('GPS location acquired.')
            .evaluate()
            .isNotEmpty;
        await submit(tester);
        expect(requests.single.method, 'POST');
        expect(
          requests.single.url.path,
          '/api/mobile/sanitation/household-surveys/',
        );
        expect(
          jsonDecode(requests.single.body),
          containsPair('latitude', '14.213457'),
        );
        expect(
          jsonDecode(requests.single.body),
          containsPair('longitude', '121.765432'),
        );
        expect(success, isTrue);
      });
    });
  }

  testWidgets(
    'manual fields clear confirmation; Confirm Pin permits exact POST',
    (tester) async {
      await withRequests((requests) async {
        await pumpHousehold(tester, FakeHouseholdLocation());
        await capture(tester);
        await tester.enterText(coordinateField('Latitude'), '14.192345678');
        await tester.pump();
        expect(confirmation(tester).confirmed, isFalse);
        await tester.tap(find.text('Confirm Pin'));
        await tester.pump();
        expect(confirmation(tester).confirmed, isTrue);
        await tester.enterText(coordinateField('Longitude'), '121.734567891');
        await tester.pump();
        expect(confirmation(tester).confirmed, isFalse);
        await submit(tester);
        expect(requests, isEmpty);
        await tester.tap(find.text('Confirm Pin'));
        await tester.pump();
        await submit(tester);
        expect(
          jsonDecode(requests.single.body),
          containsPair('latitude', '14.192345678'),
        );
        expect(
          jsonDecode(requests.single.body),
          containsPair('longitude', '121.734567891'),
        );
      });
    },
  );

  testWidgets('map tap changes pair and requires Confirm Pin before POST', (
    tester,
  ) async {
    await withRequests((requests) async {
      await pumpHousehold(tester, FakeHouseholdLocation());
      await capture(tester);
      final before = coordinateText(tester, 'Longitude');
      await tester.tapAt(
        tester.getCenter(find.byType(FlutterMap)) + const Offset(65, 0),
      );
      await tester.pump(const Duration(milliseconds: 400));
      expect(confirmation(tester).confirmed, isFalse);
      expect(coordinateText(tester, 'Longitude'), isNot(before));
      final lat = coordinateText(tester, 'Latitude');
      final lng = coordinateText(tester, 'Longitude');
      await submit(tester);
      expect(requests, isEmpty);
      await tester.tap(find.text('Confirm Pin'));
      await tester.pump();
      await submit(tester);
      expect(jsonDecode(requests.single.body), containsPair('latitude', lat));
      expect(jsonDecode(requests.single.body), containsPair('longitude', lng));
    });
  });

  testWidgets(
    'failed recapture retains exact stored text and requires reconfirmation',
    (tester) async {
      await withRequests((requests) async {
        final stored = storedHousehold();
        await pumpHousehold(
          tester,
          FakeHouseholdLocation()..enabled = false,
          stored: stored,
        );
        await tester.enterText(coordinateField('Address'), 'Only address');
        await capture(tester);
        expect(coordinateText(tester, 'Latitude'), '${stored['latitude']}');
        expect(coordinateText(tester, 'Longitude'), '${stored['longitude']}');
        expect(confirmation(tester).confirmed, isFalse);
        await submit(tester);
        expect(requests, isEmpty);
        await tester.tap(find.text('Confirm Pin'));
        await tester.pump();
        await submit(tester);
        expect(requests.single.method, 'PATCH');
        expect(jsonDecode(requests.single.body), {'address': 'Only address'});
      });
    },
  );

  for (final value in ['', 'not-a-number', '0', '0.0001']) {
    testWidgets('invalid latitude [$value] cannot be confirmed or submitted', (
      tester,
    ) async {
      await withRequests((requests) async {
        await pumpHousehold(tester, FakeHouseholdLocation());
        await tester.enterText(coordinateField('Latitude'), value);
        await tester.enterText(coordinateField('Longitude'), '121.73');
        await tester.pump();
        final button = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Confirm Pin'),
        );
        expect(button.onPressed, isNull);
        expect(confirmation(tester).confirmed, isFalse);
        await submit(tester);
        expect(requests, isEmpty);
      });
    });
  }

  testWidgets('retry after enabling service succeeds', (tester) async {
    final location = FakeHouseholdLocation()..enabled = false;
    await pumpHousehold(tester, location);
    await capture(tester);
    location.enabled = true;
    await capture(tester);
    expect(confirmation(tester).confirmed, isTrue);
    expect(coordinateText(tester, 'Latitude'), '14.213457');
    expect(location.calls, ['service', 'service', 'check', 'position']);
  });

  testWidgets(
    'leaving page while GPS is pending causes no disposed-state error',
    (tester) async {
      final pending = Completer<Position>();
      final location = FakeHouseholdLocation()
        ..pendingPosition = pending.future;
      await pumpHousehold(tester, location);
      await capture(tester);
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      pending.completeError(TimeoutException('late timeout'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );
}
