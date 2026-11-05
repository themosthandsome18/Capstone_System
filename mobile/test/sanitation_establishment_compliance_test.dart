import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sanitation_permit_verification_test.dart' show verifiedJson, pumpCard;
import 'sanitation_inspection_checklist_test.dart'
    show pumpInspectionForm, chooseStatus;

const official = <String, String>{
  'good_standing': 'Good Standing',
  'upcoming': 'Upcoming',
  'for_completion': 'For Completion',
  'violation': 'Violation',
  'no_permit': 'No Permit',
  'not_yet_inspected': 'Not Yet Inspected',
};
final missingCases = <String, Map<String, dynamic>>{
  'absent': {},
  'null': {'compliance_status': null},
  'blank': {'compliance_status': ''},
  'whitespace': {'compliance_status': '  \t '},
};
SanitationEstablishment record(Map<String, dynamic> fields) =>
    SanitationEstablishment.fromJson({
      'id': 701,
      'business_name': 'Controlled Store',
      'business_type': 24,
      'latitude': 14.185,
      'longitude': 121.731,
      'permit_status': 'active',
      ...fields,
    });

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'test-session',
    }),
  );
  for (final entry in missingCases.entries) {
    test(
      '${entry.key} compliance is unavailable and cannot serialize an official classification',
      () {
        final item = record({
          ...entry.value,
          'compliance_status_label': 'Upcoming',
        });
        expect(item.complianceStatus, isEmpty);
        expect(item.statusLabel, 'Status unavailable');
        expect(item.toJson().containsKey('compliance_status'), isFalse);
        expect(item.toJson().containsKey('compliance_status_label'), isFalse);
        expect(
          SanitationEstablishment.fromJson(item.toJson()).complianceStatus,
          isEmpty,
        );
        expect(sanitationEstablishmentMapStatus(item.complianceStatus), (
          label: 'Status unavailable',
          color: AppColors.muted,
        ));
      },
    );
  }
  for (final entry in official.entries) {
    test('explicit ${entry.key} stays accurate without a server label', () {
      final item = record({'compliance_status': entry.key});
      expect(item.complianceStatus, entry.key);
      expect(item.statusLabel, entry.value);
      expect(item.toJson()['compliance_status'], entry.key);
      expect(
        SanitationEstablishment.fromJson(item.toJson()).statusLabel,
        entry.value,
      );
    });
  }
  for (final code in [
    'future_status',
    'active',
    'pending',
    'resolved',
    'high',
  ]) {
    test(
      'unknown compliance $code is preserved and neutral, never Upcoming',
      () {
        final item = record({'compliance_status': code});
        expect(item.complianceStatus, code);
        expect(item.statusLabel, code);
        expect(item.toJson()['compliance_status'], code);
        expect(sanitationEstablishmentMapStatus(code).color, AppColors.muted);
      },
    );
  }
  test('placeholder has no official compliance status', () {
    expect(SanitationEstablishment.placeholder().complianceStatus, isEmpty);
    expect(
      SanitationEstablishment.placeholder().toJson().containsKey(
        'compliance_status',
      ),
      isFalse,
    );
  });
  testWidgets(
    'Records shows unavailable and unknown compliance without an Upcoming badge',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                SanitationEstablishmentCard(
                  establishment: record({}),
                  onInspection: () {},
                ),
                SanitationEstablishmentCard(
                  establishment: record({'compliance_status': 'active'}),
                  onInspection: () {},
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Status unavailable'), findsOneWidget);
      expect(find.text('Upcoming'), findsNothing);
      final status = tester.widget<Text>(find.text('active'));
      expect(status.style!.color, AppColors.muted);
    },
  );
  testWidgets('Upcoming filter excludes unavailable and unknown records', (
    tester,
  ) async {
    final items = [
      for (final fields in missingCases.values) record(fields),
      record({'compliance_status': 'active'}),
      record({'compliance_status': 'upcoming'}),
    ];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SanitationEstablishmentsPage(
            establishments: items,
            onOpenInspection: (_) {},
            onRefresh: () async {},
            refreshing: false,
            initialComplianceStatus: 'upcoming',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final cards = tester.widgetList<SanitationEstablishmentCard>(
      find.byType(SanitationEstablishmentCard),
    );
    expect(cards, hasLength(1));
    expect(cards.single.establishment.complianceStatus, 'upcoming');
    expect(find.text('1 establishment(s) found'), findsOneWidget);
  });
  testWidgets(
    'partial public permit remains permit-only with no fabricated compliance',
    (tester) async {
      final result = PermitVerificationResult.fromJson(verifiedJson);
      expect(result.establishment.complianceStatus, isEmpty);
      await pumpCard(tester, verifiedJson);
      expect(find.text('Active'), findsOneWidget);
      expect(find.text('Upcoming'), findsNothing);
      expect(find.text('Status unavailable'), findsNothing);
    },
  );
  testWidgets(
    'missing establishment status never preselects an inspection result',
    (tester) async {
      final api = await pumpInspectionForm(tester, record({}));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit Inspection'));
      await tester.pumpAndSettle();
      expect(api.sentStatus, isNull);
      expect(find.text('Select the status after inspection.'), findsOneWidget);
      await chooseStatus(tester, 'violation');
      await tester.tap(find.text('Submit Inspection'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(api.sentStatus, 'violation');
    },
  );
  test(
    'inspection API sends only the explicitly selected result, not establishment serialization',
    () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        return http.Response('{"id":1}', 200);
      });
      addTearDown(client.close);
      await http.runWithClient(
        () => TourismApi().submitSanitationInspection(
          establishmentId: record({}).id,
          inspectorName: 'Controlled Inspector',
          inspectionDate: '2026-11-02',
          nextDueDate: '2026-12-02',
          findings: '',
          remarks: '',
          statusAfterInspection: 'violation',
          checklistItems: [],
        ),
        () => client,
      );
      final body = jsonDecode(requests.single.body) as Map<String, dynamic>;
      expect(body['status_after_inspection'], 'violation');
      expect(body.containsKey('compliance_status'), isFalse);
      expect(body.containsKey('compliance_status_label'), isFalse);
    },
  );
}
