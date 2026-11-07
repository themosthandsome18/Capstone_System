import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mauban_mobile_app/main.dart';
import 'sanitation_reports_map_test.dart' show row, payload;

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'session-a',
    }),
  );
  Future<List<SanitationMapReport>> load() => const TourismApi()
      .fetchSanitationMapReports(expectedSessionToken: 'session-a');
  test(
    'full unfiltered authenticated endpoint retains rows beyond 50 including closed reports',
    () async {
      final records = [
        for (var i = 1; i <= 53; i++)
          {...row(i), 'status': i == 53 ? 'resolved' : 'pending'},
      ];
      final result = await http.runWithClient(
        load,
        () => MockClient((r) async {
          expect(r.url.path, '/api/sanitation/complaints/');
          expect(r.url.query, isEmpty);
          expect(r.headers['Authorization'], 'Token session-a');
          return http.Response(jsonEncode(payload(records)), 200);
        }),
      );
      expect(result, hasLength(53));
      expect(result.last.reference, 'REPORT-53');
      expect(result.last.statusLabel, 'Resolved');
    },
  );
  for (final invalid in [
    {
      'rows': [],
      'summary': {'total': 1},
    },
    {'results': [], 'count': 0},
    {
      'rows': [],
      'summary': {'total': 0},
      'next': '/next-page/',
    },
    payload([row(1), row(1)]),
    payload([
      {'id': 1},
    ]),
    payload([
      {...row(1), 'map_location_eligible': 'true'},
    ]),
  ]) {
    test('malformed/incomplete response is an error: $invalid', () async {
      await http.runWithClient(
        () async {
          await expectLater(load(), throwsFormatException);
        },
        () => MockClient((_) async => http.Response(jsonEncode(invalid), 200)),
      );
    });
  }
  test('missing or changed session prevents dispatch', () async {
    var requests = 0;
    final prefs = await SharedPreferences.getInstance();
    await http.runWithClient(
      () async {
        for (final token in [null, 'session-b']) {
          await setStaffSessionToken(prefs, token);
          await expectLater(
            load(),
            throwsA(
              isA<ApiException>().having((e) => e.statusCode, 'status', 409),
            ),
          );
        }
      },
      () => MockClient((_) async {
        requests++;
        return http.Response('{}', 200);
      }),
    );
    expect(requests, 0);
  });
  for (final status in [401, 403]) {
    test(
      'HTTP $status rejects reports without clearing another/global session',
      () async {
        await http.runWithClient(() async {
          await expectLater(
            load(),
            throwsA(
              isA<ApiException>().having((e) => e.statusCode, 'status', status),
            ),
          );
          expect(
            (await SharedPreferences.getInstance()).getString(
              staffAuthTokenKey,
            ),
            'session-a',
          );
        }, () => MockClient((_) async => http.Response('{}', status)));
      },
    );
  }
  test(
    'stale previous-session failure cannot affect new credentials',
    () async {
      final pending = Completer<http.Response>();
      final started = Completer<void>();
      await http.runWithClient(
        () async {
          final result = load();
          await started.future;
          await setStaffSessionToken(
            await SharedPreferences.getInstance(),
            'session-b',
          );
          pending.complete(http.Response('{}', 401));
          await expectLater(
            result,
            throwsA(
              isA<ApiException>().having((e) => e.statusCode, 'status', 409),
            ),
          );
          expect(
            (await SharedPreferences.getInstance()).getString(
              staffAuthTokenKey,
            ),
            'session-b',
          );
        },
        () => MockClient((_) {
          started.complete();
          return pending.future;
        }),
      );
    },
  );
  test(
    'eligibility also requires known source and complete finite bounded coordinates',
    () {
      expect(SanitationMapReport.fromJson(row(1)).canMap, isTrue);
      for (final r in [
        row(2, eligible: false),
        row(3, source: 'unknown'),
        row(4, source: 'barangay_approximate'),
        row(5, lat: null),
        row(6, lat: double.nan),
        row(7, lng: double.infinity),
        row(8, lat: true),
        row(9, lng: 181),
        row(10, lat: 0),
      ]) {
        expect(SanitationMapReport.fromJson(r).canMap, isFalse);
      }
      expect(
        SanitationMapReport.fromJson({
          ...row(1),
          'status': 'future',
        }).statusLabel,
        'Status unavailable',
      );
    },
  );
  test(
    'staff-session notification contains revisions only and fires before write completion',
    () async {
      final prefs = await SharedPreferences.getInstance();
      final seen = <int>[];
      void listener() => seen.add(staffSessionRevision.value);
      staffSessionRevision.addListener(listener);
      try {
        final before = staffSessionRevision.value;
        final write = setStaffSessionToken(prefs, 'session-b');
        expect(seen, [before + 1]);
        expect(prefs.getString(staffAuthTokenKey), 'session-b');
        await write;
        await setStaffSessionToken(prefs, 'session-b');
        expect(seen, hasLength(1));
        await setStaffSessionToken(prefs, null);
        expect(seen, hasLength(2));
      } finally {
        staffSessionRevision.removeListener(listener);
      }
    },
  );
}
