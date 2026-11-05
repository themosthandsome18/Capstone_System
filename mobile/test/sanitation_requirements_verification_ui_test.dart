import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mauban_mobile_app/main.dart';
import 'sanitation_inspection_checklist_test.dart'
    show
        FakeSanitationApi,
        aquaStation,
        fishballCart,
        bootstrapWith,
        chooseStatus,
        submitForm;

InspectionRequirementsResult configured(int id, {bool empty = false}) =>
    InspectionRequirementsResult.loaded(
      InspectionRequirementsContext.fromResponses(
        id,
        {'id': id, 'business_type': 8, 'permit_size': 'sp'},
        [
          {
            'id': 8,
            'requirements': empty
                ? []
                : [
                    {
                      'id': 31,
                      'business_type': 8,
                      'permit_size': 'sp',
                      'requirement_name': 'Same requirement',
                      'is_required': true,
                    },
                    {
                      'id': 32,
                      'business_type': 8,
                      'permit_size': 'sp',
                      'requirement_name': 'Same requirement',
                      'is_required': false,
                    },
                    {
                      'id': 33,
                      'business_type': 8,
                      'permit_size': 'large',
                      'requirement_name': 'Other coverage',
                      'is_required': true,
                    },
                  ],
          },
        ],
      ),
    );

class VerificationApi extends FakeSanitationApi {
  Future<InspectionRequirementsResult> Function(int)? handler;
  final loaded = <int>[];
  @override
  Future<InspectionRequirementsResult> fetchInspectionRequirements(
    int id, {
    String? expectedSessionToken,
  }) {
    loaded.add(id);
    return handler?.call(id) ?? Future.value(configured(id));
  }
}

Future<void> open(
  WidgetTester tester,
  VerificationApi api, {
  bool multiple = false,
}) async {
  tester.view.physicalSize = const Size(1200, 5000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final base = bootstrapWith(aquaStation);
  final bootstrap = SanitationBootstrap(
    businessTypes: base.businessTypes,
    establishments: multiple ? [aquaStation, fishballCart] : [aquaStation],
    inspections: [],
    complaints: [],
    householdRecords: [],
    barangays: [],
    notifications: [],
  );
  await tester.pumpWidget(
    MaterialApp(
      home: SanitationInspectionPage(api: api, bootstrap: bootstrap),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'test-session',
    }),
  );
  testWidgets(
    'loading is explicit and submit disabled; no bootstrap checklist fallback',
    (tester) async {
      final pending = Completer<InspectionRequirementsResult>();
      final api = VerificationApi()..handler = (_) => pending.future;
      await open(tester, api);
      expect(find.text('Loading requirements...'), findsOneWidget);
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Submit Inspection'),
            )
            .onPressed,
        isNull,
      );
      expect(api.loaded, [aquaStation.id]);
      pending.complete(configured(aquaStation.id));
      await tester.pump();
    },
  );
  testWidgets(
    'ready shows distinct IDs, applicable items and required/optional labels without grades',
    (tester) async {
      await open(tester, VerificationApi());
      expect(find.text('Requirements Verification'), findsOneWidget);
      expect(find.text('Sanitation Checklist & Score'), findsNothing);
      expect(find.textContaining('Grade'), findsNothing);
      expect(find.textContaining('%'), findsNothing);
      expect(find.text('Same requirement'), findsNWidgets(2));
      expect(find.text('Other coverage'), findsNothing);
      expect(find.text('Required'), findsOneWidget);
      expect(find.text('Optional'), findsOneWidget);
      expect(find.byKey(const ValueKey('requirement-31')), findsOneWidget);
      expect(find.byKey(const ValueKey('requirement-32')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('requirement-31')));
      await tester.pump();
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const ValueKey('requirement-31')),
            )
            .value,
        isTrue,
      );
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const ValueKey('requirement-32')),
            )
            .value,
        isFalse,
      );
    },
  );
  testWidgets(
    'two same-name observations submit separately under the existing payload',
    (tester) async {
      final api = VerificationApi();
      await open(tester, api);
      await tester.tap(find.byKey(const ValueKey('requirement-31')));
      await tester.pump();
      await chooseStatus(tester, 'for_completion');
      await submitForm(tester);
      expect(api.sentChecklist!.map((x) => x.requirementName).toList(), [
        'Same requirement',
        'Same requirement',
      ]);
      expect(api.sentChecklist!.map((x) => x.isComplied).toList(), [
        true,
        false,
      ]);
      expect(api.sentStatus, 'for_completion');
    },
  );
  testWidgets(
    'unconfigured is explicit warning and retains manually chosen empty submission',
    (tester) async {
      final api = VerificationApi()
        ..handler = (id) => Future.value(configured(id, empty: true));
      await open(tester, api);
      expect(
        find.textContaining(
          'No requirements are configured for this classification/permit size',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('without requirements evidence'),
        findsOneWidget,
      );
      await chooseStatus(tester, 'for_completion');
      await submitForm(tester);
      expect(api.sentChecklist, isEmpty);
      expect(api.sentStatus, 'for_completion');
    },
  );
  for (final failure in InspectionRequirementsFailure.values) {
    testWidgets('$failure remains an error with Retry, never unconfigured', (
      tester,
    ) async {
      final api = VerificationApi()
        ..handler = (_) =>
            Future.value(InspectionRequirementsResult.failed(failure));
      await open(tester, api);
      expect(find.text('Retry requirements'), findsOneWidget);
      expect(
        find.textContaining('No requirements are configured'),
        findsNothing,
      );
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Submit Inspection'),
            )
            .onPressed,
        isNull,
      );
    });
  }
  testWidgets(
    'same-record Retry preserves findings, remarks and manually chosen status',
    (tester) async {
      final api = VerificationApi()
        ..handler = (_) => Future.value(
          const InspectionRequirementsResult.failed(
            InspectionRequirementsFailure.retrieval,
          ),
        );
      await open(tester, api);
      await tester.enterText(
        find.widgetWithText(TextField, 'Findings'),
        'Exact findings',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Remarks / observations'),
        'Exact remarks',
      );
      await chooseStatus(tester, 'for_completion');
      api.handler = (id) => Future.value(configured(id));
      await tester.tap(find.text('Retry requirements'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Exact findings'), findsOneWidget);
      expect(find.text('Exact remarks'), findsOneWidget);
      expect(find.text('For Completion'), findsOneWidget);
      expect(find.byType(CheckboxListTile), findsNWidgets(2));
    },
  );
  testWidgets(
    'session invalidation clears selections and rejects delayed result',
    (tester) async {
      final pending = Completer<InspectionRequirementsResult>();
      final api = VerificationApi()..handler = (_) => pending.future;
      await open(tester, api);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(staffAuthTokenKey, 'other-session');
      pending.complete(configured(aquaStation.id));
      await tester.pump(const Duration(seconds: 1));
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.textContaining('Staff session changed'), findsOneWidget);
      expect(api.sentChecklist, isNull);
    },
  );
  testWidgets('changing establishment ignores previous late requirements', (
    tester,
  ) async {
    final pending = Completer<InspectionRequirementsResult>();
    final api = VerificationApi()
      ..handler = (id) => id == aquaStation.id
          ? pending.future
          : Future.value(configured(id, empty: true));
    await open(tester, api, multiple: true);
    await tester.tap(
      find.byType(DropdownButtonFormField<SanitationEstablishment>),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text(fishballCart.businessName).last);
    await tester.pumpAndSettle();
    pending.complete(configured(aquaStation.id));
    await tester.pump();
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(api.loaded, [aquaStation.id, fishballCart.id]);
    expect(
      find.textContaining('No requirements are configured'),
      findsOneWidget,
    );
  });

  for (final logout in [true, false]) {
    testWidgets(
      'ready selections clear on ${logout ? 'logout' : 'account switch'}',
      (tester) async {
        final api = VerificationApi();
        await open(tester, api);
        await tester.tap(find.byKey(const ValueKey('requirement-31')));
        await tester.pump();
        final prefs = await SharedPreferences.getInstance();
        if (logout) {
          await prefs.remove(staffAuthTokenKey);
        } else {
          await prefs.setString(staffAuthTokenKey, 'new-session');
        }
        await tester.pump(const Duration(seconds: 1));
        expect(find.byType(CheckboxListTile), findsNothing);
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Submit Inspection'),
              )
              .onPressed,
          isNull,
        );
        expect(api.sentChecklist, isNull);
      },
    );
  }
}
