import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mauban_mobile_app/main.dart';

Map<String, dynamic> row(
  int id, {
  String source = 'reporter_provided',
  bool eligible = true,
  Object? lat = 14.185,
  Object? lng = 121.731,
}) => {
  'id': id,
  'complaint_id': 'REPORT-$id',
  'category': 'Synthetic concern',
  'status': 'pending',
  'latitude': lat,
  'longitude': lng,
  'location_source': source,
  'map_location_eligible': eligible,
  'complainant_name': 'PRIVATE REPORTER',
  'contact_number': 'PRIVATE CONTACT',
  'description': 'PRIVATE DESCRIPTION',
  'photo_documentation': 'https://private.invalid/photo',
};
Map<String, dynamic> payload(List<Map<String, dynamic>> rows) => {
  'summary': {'total': rows.length},
  'rows': rows,
};
http.Response response(List<Map<String, dynamic>> rows) =>
    http.Response(jsonEncode(payload(rows)), 200);

Future<void> open(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1000, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
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
  await tester.pumpAndSettle();
  expect(find.text('Community Reports'), findsOneWidget);
  await tester.tap(find.text('Community Reports'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

// Exercise the same token-free boundary as app login/logout paths.
Future<void> switchSession(String? value) async {
  final prefs = await SharedPreferences.getInstance();
  await setStaffSessionToken(prefs, value);
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'session-a',
    }),
  );
  testWidgets(
    'reports mode maps only eligible known-source complete pairs and safe details',
    (tester) async {
      final client = MockClient((request) async {
        expect(request.url.path, '/api/sanitation/complaints/');
        expect(request.url.query, isEmpty);
        expect(request.headers['Authorization'], 'Token session-a');
        return response([
          row(1),
          row(2, source: 'staff_provided'),
          row(3, source: 'unknown', eligible: false),
          row(4, source: 'barangay_approximate', eligible: false),
          row(5, lat: null),
          row(6, lat: 91),
          row(7, source: 'unknown'),
        ]);
      });
      await http.runWithClient(() async {
        await open(tester);
        expect(find.byKey(const ValueKey('report-map-pin-1')), findsOneWidget);
        expect(find.byKey(const ValueKey('report-map-pin-2')), findsOneWidget);
        for (final id in [3, 4, 5, 6, 7]) {
          expect(find.byKey(ValueKey('report-map-pin-$id')), findsNothing);
        }
        expect(find.text('7 reports · 2 mapped · 5 unmapped'), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('report-map-pin-2')));
        await tester.pump();
        expect(find.text('Staff-provided location'), findsOneWidget);
        expect(
          find.textContaining('not independently GPS-verified'),
          findsWidgets,
        );
        for (final text in [
          'PRIVATE REPORTER',
          'PRIVATE CONTACT',
          'PRIVATE DESCRIPTION',
          'https://private.invalid/photo',
        ]) {
          expect(find.textContaining(text), findsNothing);
        }
      }, () => client);
      client.close();
    },
  );
  testWidgets('loading is distinct from a successful empty dataset', (
    tester,
  ) async {
    final pending = Completer<http.Response>();
    await http.runWithClient(() async {
      await open(tester);
      expect(find.text('Loading reports...'), findsOneWidget);
      expect(find.text('No community reports found.'), findsNothing);
      pending.complete(response([]));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('No community reports found.'), findsOneWidget);
    }, () => MockClient((_) => pending.future));
  });
  testWidgets('error is not empty and Retry recovers current records', (
    tester,
  ) async {
    var fail = true;
    await http.runWithClient(
      () async {
        await open(tester);
        expect(find.textContaining('HTTP 503'), findsOneWidget);
        expect(find.text('No community reports found.'), findsNothing);
        fail = false;
        await tester.tap(find.text('Retry reports'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byKey(const ValueKey('report-map-pin-1')), findsOneWidget);
      },
      () => MockClient(
        (_) async => fail ? http.Response('{}', 503) : response([row(1)]),
      ),
    );
  });
  testWidgets(
    'failed refresh hides previously loaded private markers and details',
    (tester) async {
      var fail = false;
      await http.runWithClient(
        () async {
          await open(tester);
          expect(
            find.byKey(const ValueKey('report-map-pin-1')),
            findsOneWidget,
          );
          await tester.tap(find.byKey(const ValueKey('report-map-pin-1')));
          await tester.pump();
          fail = true;
          await tester.tap(find.text('Refresh reports'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 100));
          expect(find.byKey(const ValueKey('report-map-pin-1')), findsNothing);
          expect(find.text('Reporter-provided location'), findsNothing);
          expect(find.textContaining('HTTP 503'), findsOneWidget);
        },
        () => MockClient(
          (_) async => fail ? http.Response('{}', 503) : response([row(1)]),
        ),
      );
    },
  );
  for (final logout in [false, true]) {
    testWidgets(
      'visible reports clear on ${logout ? 'logout' : 'account switch'}',
      (tester) async {
        await http.runWithClient(() async {
          await open(tester);
          expect(
            find.byKey(const ValueKey('report-map-pin-1')),
            findsOneWidget,
          );
          await switchSession(logout ? null : 'session-b');
          await tester.pump();
          expect(find.byKey(const ValueKey('report-map-pin-1')), findsNothing);
          expect(find.textContaining('Staff session changed'), findsOneWidget);
        }, () => MockClient((_) async => response([row(1)])));
      },
    );
  }
  testWidgets('late previous-session success cannot restore report data', (
    tester,
  ) async {
    final pending = Completer<http.Response>();
    await http.runWithClient(() async {
      await open(tester);
      await switchSession('session-b');
      await tester.pump();
      pending.complete(response([row(1)]));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const ValueKey('report-map-pin-1')), findsNothing);
      expect(find.textContaining('Staff session changed'), findsOneWidget);
    }, () => MockClient((_) => pending.future));
  });
  testWidgets('full dataset includes reports beyond staff-bootstrap 50 cap', (
    tester,
  ) async {
    await http.runWithClient(
      () async {
        await open(tester);
        expect(
          find.text('52 reports · 52 mapped · 0 unmapped'),
          findsOneWidget,
        );
        expect(find.byKey(const ValueKey('report-map-pin-52')), findsOneWidget);
      },
      () => MockClient(
        (_) async => response([for (var i = 1; i <= 52; i++) row(i)]),
      ),
    );
  });
  for (final invalid in [
    <String, dynamic>{
      'rows': [],
      'summary': {'total': 51},
    },
    <String, dynamic>{
      'rows': [
        {'id': 1},
      ],
      'summary': {'total': 1},
    },
  ]) {
    testWidgets(
      'incomplete or malformed contract fails closed ${invalid.toString()}',
      (tester) async {
        await http.runWithClient(
          () async {
            await open(tester);
            expect(find.textContaining('Report data contract'), findsOneWidget);
            expect(find.text('No community reports found.'), findsNothing);
            expect(find.text('Retry reports'), findsOneWidget);
          },
          () =>
              MockClient((_) async => http.Response(jsonEncode(invalid), 200)),
        );
      },
    );
  }
  testWidgets('new-session records survive a delayed old-session failure', (
    tester,
  ) async {
    final pending = Completer<http.Response>();
    await http.runWithClient(
      () async {
        await open(tester);
        await switchSession('session-b');
        await tester.pump();
        await tester.tap(find.text('Retry reports'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byKey(const ValueKey('report-map-pin-2')), findsOneWidget);
        pending.complete(http.Response('{}', 401));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byKey(const ValueKey('report-map-pin-2')), findsOneWidget);
        expect(find.byKey(const ValueKey('report-map-pin-1')), findsNothing);
        expect(
          (await SharedPreferences.getInstance()).getString(staffAuthTokenKey),
          'session-b',
        );
      },
      () => MockClient(
        (request) => request.headers['Authorization'] == 'Token session-a'
            ? pending.future
            : Future.value(response([row(2)])),
      ),
    );
  });
  testWidgets('reports mode fits a narrow handset layout', (tester) async {
    await http.runWithClient(() async {
      await open(tester);
      tester.view.physicalSize = const Size(430, 1800);
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('1 reports · 1 mapped · 0 unmapped'), findsOneWidget);
      expect(find.byKey(const ValueKey('report-map-pin-1')), findsOneWidget);
    }, () => MockClient((_) async => response([row(1)])));
  });
  testWidgets('returning to existing map modes retains their controls', (
    tester,
  ) async {
    await http.runWithClient(() async {
      await open(tester);
      await tester.tap(find.text('Households'));
      await tester.pump();
      expect(find.text('Household GIS Status Legend'), findsOneWidget);
      await tester.tap(find.text('Establishments'));
      await tester.pump();
      expect(find.text('Establishment GIS Status Legend'), findsOneWidget);
    }, () => MockClient((_) async => response([])));
  });
}
