import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> inspection(
  int id,
  int establishment,
  String date,
  String? due, {
  bool draft = false,
}) => {
  'id': id,
  'establishment': establishment,
  'establishment_name': 'Store $establishment',
  'business_type_name': 'Food',
  'inspection_date': date,
  'next_due_date': due,
  'is_draft': draft,
};

Map<String, dynamic> complaint(
  String id,
  String time, {
  String status = 'pending',
  String priority = 'medium',
}) => {
  'complaint_id': id,
  'created_at': time,
  'category': 'Garbage',
  'barangay': 'Daungan',
  'status': status,
  'priority': priority,
};

Future<List<SanitationDashboardState>> load({
  List<Map<String, dynamic>> inspections = const [],
  List<Map<String, dynamic>> complaints = const [],
  int? pending = 0,
  List<Map<String, dynamic>> households = const [],
  List<Map<String, dynamic>> establishments = const [],
  int inspectionStatus = 200,
  Object? inspectionBody,
  bool reuseStaff = false,
}) async {
  final staff = {
    'establishments': establishments,
    'householdRecords': households,
  };
  final requests = <http.Request>[];
  final client = MockClient((request) async {
    requests.add(request);
    expect(request.headers['Authorization'], 'Token mock-dashboard-token');
    switch (request.url.path) {
      case '/api/mobile/sanitation/staff-bootstrap/':
        return http.Response(jsonEncode(staff), 200);
      case '/api/sanitation/complaints/':
        expect(request.url.queryParameters, {'status': 'pending'});
        return http.Response(
          jsonEncode({
            'summary': {'pending': ?pending},
            'rows': complaints,
          }),
          200,
        );
      case '/api/sanitation/inspections/':
        return http.Response(
          jsonEncode(inspectionBody ?? inspections),
          inspectionStatus,
        );
      default:
        throw StateError('Unexpected endpoint: ${request.url.path}');
    }
  });
  try {
    return await http.runWithClient(() async {
      final stream = const TourismApi().loadSanitationDashboard(
        now: DateTime(2026, 9, 29, 23, 59),
        staffRecords: reuseStaff ? staff : null,
      );
      final states = await stream.toList();
      expect(states.first.status.name, 'loading');
      expect(states.first.data, isNull);
      expect(
        requests.where((r) => r.url.path.endsWith('staff-bootstrap/')).length,
        reuseStaff ? 0 : 1,
      );
      return states;
    }, () => client);
  } finally {
    client.close();
  }
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'mock-dashboard-token',
    }),
  );

  test('household parsing uses last_survey_date, not legacy date guesses', () {
    final item = HouseholdSanitationItem.fromJson({
      'last_survey_date': '2026-09-29',
      'survey_date': '2020-01-01',
      'date': '2019-01-01',
    });
    expect(item.surveyDate, '2026-09-29');
    expect(
      HouseholdSanitationItem.fromJson({'date': '2026-09-29'}).surveyDate,
      isEmpty,
    );
  });

  test(
    'pending summary is authoritative despite capped rows; timestamps order pending only',
    () async {
      final states = await load(
        pending: 73,
        complaints: [
          complaint('older', '2026-09-29T09:00:00+08:00', priority: 'high'),
          complaint('newer', '2026-09-29T02:00:00Z', priority: 'low'),
          complaint('resolved', '2026-09-29T12:00:00Z', status: 'resolved'),
          complaint(
            'investigating',
            '2026-09-29T12:00:00Z',
            status: 'investigating',
          ),
        ],
      );
      final data = states.last.data!;
      expect(data.newComplaintsCount, 73);
      expect(data.newComplaints.map((dynamic c) => c.reference).toList(), [
        'newer',
        'older',
      ]);
      expect(data.newComplaints.first.createdAt, DateTime.utc(2026, 9, 29, 2));
      expect(data.newComplaints.first.priority, 'low');
      expect(data.newComplaints.first.priorityTag, 'STANDARD');
      expect(data.newComplaints.last.priorityTag, 'URGENT');
      expect(data.newComplaints.first.category, 'Garbage');
      expect(data.newComplaints.first.barangay, 'Daungan');
    },
  );

  test(
    'all other current priorities map to STANDARD without rewriting raw priority',
    () async {
      final states = await load(
        pending: 3,
        complaints: [
          for (final priority in ['low', 'medium', 'high'])
            complaint(
              priority,
              '2026-09-29T09:00:00+08:00',
              priority: priority,
            ),
        ],
      );
      for (final dynamic item in states.last.data!.newComplaints) {
        expect(
          item.priorityTag,
          item.priority == 'high' ? 'URGENT' : 'STANDARD',
        );
        expect(item.reference, item.priority);
      }
    },
  );

  test(
    'establishment count is complete and households count distinct latest dates in local month',
    () async {
      final states = await load(
        reuseStaff: true,
        establishments: List.generate(60, (i) => {'id': i + 1}),
        households: [
          {'id': 1, 'household_code': 'A', 'last_survey_date': '2026-09-01'},
          {'id': 1, 'household_code': 'A', 'last_survey_date': '2026-09-01'},
          {'id': 2, 'household_code': 'B', 'last_survey_date': '2026-09-30'},
          {'id': 3, 'household_code': 'C', 'last_survey_date': '2026-08-31'},
          {'id': 4, 'household_code': 'D', 'last_survey_date': '2026-10-01'},
          {'id': 5, 'household_code': 'E', 'last_survey_date': null},
        ],
      );
      expect(states.last.data!.establishmentsCount, 60);
      expect(states.last.data!.householdsThisMonthCount, 2);
    },
  );

  test(
    'latest finalized per establishment: drafts and superseded due dates ignored',
    () async {
      final states = await load(
        inspections: [
          inspection(1, 1, '2026-09-01', '2026-09-01'),
          inspection(2, 1, '2026-09-20', '2026-10-20'),
          inspection(3, 2, '2026-09-10', '2026-09-29'),
          inspection(4, 2, '2026-09-21', '2026-12-01', draft: true),
          inspection(5, 3, '2026-09-20', '2026-09-29', draft: true),
          inspection(6, 4, '2026-09-20', '2026-09-29'),
          inspection(7, 4, '2026-09-20', null),
        ],
      );
      expect(states.last.data!.dueForInspectionCount, 1);
      expect(states.last.data!.dueInspections.single.establishmentId, 2);
      expect(states.last.data!.dueInspections.single.inspectionId, 3);
    },
  );

  test(
    'due window includes overdue, today and day seven; sorted earliest with IDs retained',
    () async {
      final states = await load(
        inspections: [
          inspection(4, 4, '2026-09-01', '2026-10-07'),
          inspection(3, 3, '2026-09-01', '2026-10-06'),
          inspection(2, 2, '2026-09-01', '2026-09-29'),
          inspection(1, 1, '2026-09-01', '2026-09-10'),
          inspection(5, 5, '2026-09-01', null),
        ],
      );
      expect(
        states.last.data!.dueInspections
            .map((dynamic i) => i.establishmentId)
            .toList(),
        [1, 2, 3],
      );
      expect(states.last.data!.dueInspections.last.businessTypeName, 'Food');
      expect(
        states.last.data!.dueInspections.last.establishmentName,
        'Store 3',
      );
    },
  );

  test(
    'complete array endpoint handles more than 25 inspections, one establishment once',
    () async {
      final states = await load(
        inspections: [
          for (var i = 1; i <= 40; i++)
            inspection(i, i, '2026-09-01', '2026-09-29'),
          inspection(99, 1, '2026-09-02', '2026-09-30'),
        ],
      );
      expect(states.last.data!.dueForInspectionCount, 40);
      expect(
        states.last.data!.dueInspections
            .where((dynamic i) => i.establishmentId == 1)
            .length,
        1,
      );
    },
  );

  test('valid empty data is loaded zero, not loading or unavailable', () async {
    final state = (await load()).last;
    expect(state.status.name, 'loaded');
    expect(state.error, isNull);
    expect(state.data!.establishmentsCount, 0);
    expect(state.data!.newComplaintsCount, 0);
    expect(state.data!.householdsThisMonthCount, 0);
    expect(state.data!.dueForInspectionCount, 0);
  });

  for (final status in [401, 500]) {
    test('HTTP $status remains unavailable, never fake zero', () async {
      final state = (await load(
        inspectionStatus: status,
        inspectionBody: {'detail': 'Local test failure'},
      )).last;
      expect(state.status.name, 'unavailable');
      expect(state.data, isNull);
      expect(state.error, isA<ApiException>());
      expect((state.error as ApiException).statusCode, status);
    });
  }

  test(
    'missing authoritative summary is unavailable rather than capped-row count',
    () async {
      final state = (await load(pending: null)).last;
      expect(state.status.name, 'unavailable');
      expect(state.data, isNull);
    },
  );

  test(
    'unexpected inspection response shape is unavailable rather than empty',
    () async {
      final state = (await load(inspectionBody: {})).last;
      expect(state.status.name, 'unavailable');
      expect(state.data, isNull);
    },
  );
}
