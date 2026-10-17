import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'session-A',
    }),
  );
  for (final lookup in [true, false]) {
    test(
      'concurrent session switch blocks ${lookup ? 'identity GET' : 'inspection POST'} before dispatch',
      () async {
        final requests = <http.Request>[];
        final client = MockClient((r) async {
          requests.add(r);
          return http.Response('{}', 200);
        });
        addTearDown(client.close);
        final prefs = await SharedPreferences.getInstance();
        await http.runWithClient(() async {
          final api = TourismApi();
          final pending = lookup
              ? api.fetchSanitationStaffIdentity(
                  expectedSessionToken: 'session-A',
                )
              : api.submitSanitationInspection(
                  expectedSessionToken: 'session-A',
                  establishmentId: 1,
                  inspectorName: 'Maria Santos',
                  inspectionDate: '2026-10-13',
                  nextDueDate: '2026-11-13',
                  findings: '',
                  remarks: '',
                  statusAfterInspection: 'good_standing',
                  checklistItems: [],
                );
          // The real API has entered its preference-read await. Change the cache
          // before that continuation runs; this is not a sequential pre-call switch.
          final changed = prefs.setString(staffAuthTokenKey, 'session-B');
          Object? error;
          try {
            await pending;
          } catch (e) {
            error = e;
          }
          await changed;
          expect(
            requests,
            isEmpty,
            reason:
                'Must reject before dispatch; observed ${requests.map((r) => '${r.method} ${r.headers['Authorization']} ${r.body}').toList()}',
          );
          expect(
            error,
            isA<ApiException>().having((e) => e.statusCode, 'status', 409),
          );
        }, () => client);
      },
    );
  }
  test(
    'in-flight inspection retains validated A token when session changes',
    () async {
      final prefs = await SharedPreferences.getInstance();
      final requests = <http.Request>[];
      final client = MockClient((r) async {
        requests.add(r);
        await prefs.setString(staffAuthTokenKey, 'session-B');
        return http.Response(
          jsonEncode({'inspector_name': jsonDecode(r.body)['inspector_name']}),
          201,
        );
      });
      addTearDown(client.close);
      await http.runWithClient(() async {
        await TourismApi().submitSanitationInspection(
          expectedSessionToken: 'session-A',
          establishmentId: 1,
          inspectorName: 'Maria Santos',
          inspectionDate: '2026-10-13',
          nextDueDate: '2026-11-13',
          findings: '',
          remarks: '',
          statusAfterInspection: 'good_standing',
          checklistItems: [],
        );
        expect(requests.single.headers['Authorization'], 'Token session-A');
        expect(
          jsonDecode(requests.single.body)['inspector_name'],
          'Maria Santos',
        );
        expect(prefs.getString(staffAuthTokenKey), 'session-B');
      }, () => client);
    },
  );
}
