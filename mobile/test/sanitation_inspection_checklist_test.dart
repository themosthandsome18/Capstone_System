// The inspection checklist must come from the requirements the Sanitation
// Section configured for the business type.
//
// A type such as Ambulant Food Vendor has none configured yet, so the app
// must show nothing rather than invent a generic list. Types that do have
// requirements keep their existing behaviour.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The generic list the app used to substitute when a type had no requirements.
const oldFabricatedChecklist = [
  'Proper waste disposal system',
  'Clean water supply available',
  'Functional toilet facilities',
  'Food handling area is clean',
  'Valid sanitary permit displayed',
];

SanitationBusinessType businessType(
  int id,
  String name,
  List<String> requirementNames,
) {
  return SanitationBusinessType(
    id: id,
    name: name,
    inspectionFrequency: 'monthly',
    requirements: requirementNames
        .map((item) => SanitationRequirement(requirementName: item))
        .toList(),
  );
}

// Ambulant Food Vendor is configured in production with no requirements.
final ambulant = businessType(24, 'Ambulant Food Vendor', const []);
final waterStation = businessType(8, 'Water Refilling Station', const [
  'Water Potability Certificate',
  'Health Certificate of Staff',
  'water potability certificate',
  '  ',
]);

final allTypes = [ambulant, waterStation];

SanitationEstablishment establishment(int id, String name, int typeId) {
  return SanitationEstablishment.fromJson({
    'id': id,
    'business_name': name,
    'business_type': typeId,
  });
}

final fishballCart = establishment(701, 'Fishball Cart', ambulant.id);
final aquaStation = establishment(702, 'Aqua Station', waterStation.id);

SanitationBootstrap bootstrapWith(SanitationEstablishment record) {
  return SanitationBootstrap(
    businessTypes: allTypes,
    establishments: [record],
    inspections: const [],
    complaints: const [],
    householdRecords: const [],
    barangays: const [],
    notifications: const [],
  );
}

/// Records what the inspection form would send, without touching the network.
class FakeSanitationApi extends TourismApi {
  FakeSanitationApi();

  List<InspectionChecklistDraft>? sentChecklist;
  String? sentStatus;

  @override
  Future<Map<String, dynamic>> submitSanitationInspection({
    required int establishmentId,
    required String inspectorName,
    required String inspectionDate,
    required String nextDueDate,
    required String findings,
    required String remarks,
    required String statusAfterInspection,
    required List<InspectionChecklistDraft> checklistItems,
  }) async {
    sentChecklist = checklistItems;
    sentStatus = statusAfterInspection;
    return {'id': 4242};
  }
}

Future<FakeSanitationApi> pumpInspectionForm(
  WidgetTester tester,
  SanitationEstablishment record,
) async {
  // Tall surface so the whole scrolling form, submit button included, builds.
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final api = FakeSanitationApi();
  await tester.pumpWidget(
    MaterialApp(
      home: SanitationInspectionPage(
        api: api,
        bootstrap: bootstrapWith(record),
        initialEstablishment: record,
      ),
    ),
  );
  await tester.pump();
  return api;
}

Future<void> chooseStatus(WidgetTester tester, String status) async {
  await tester.tap(find.byType(DropdownButtonFormField<String?>).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(sanitationStatusLabel(status)).last);
  await tester.pumpAndSettle();
}

Future<void> submitForm(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).first, 'Juan Dela Cruz');
  await tester.pump();
  final button = find.text('Submit Inspection');
  await tester.tap(button);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  group('buildInspectionChecks', () {
    test('a type with no configured requirements yields no checklist', () {
      final checks = buildInspectionChecks(allTypes, ambulant.id);

      expect(checks, isEmpty);
      final names = checks.map((item) => item.requirementName).toList();
      for (final fabricated in oldFabricatedChecklist) {
        expect(names, isNot(contains(fabricated)));
      }
    });

    test('a configured type yields its own requirements, unchecked', () {
      final checks = buildInspectionChecks(allTypes, waterStation.id);

      expect(
        checks.map((item) => item.requirementName).toList(),
        const ['Water Potability Certificate', 'Health Certificate of Staff'],
      );
      expect(checks.any((item) => item.isComplied), isFalse);
    });

    test('an unknown business type yields no checklist', () {
      expect(buildInspectionChecks(allTypes, 999), isEmpty);
      expect(buildInspectionChecks(const [], waterStation.id), isEmpty);
    });
  });

  group('Inspection form', () {
    testWidgets('shows an empty state for a type with no requirements', (
      tester,
    ) async {
      await pumpInspectionForm(tester, fishballCart);

      expect(find.text('No requirements configured yet.'), findsOneWidget);
      expect(find.byType(CheckboxListTile), findsNothing);
      for (final fabricated in oldFabricatedChecklist) {
        expect(find.text(fabricated), findsNothing);
      }
    });

    testWidgets('has no status chosen when there is nothing to check', (
      tester,
    ) async {
      await pumpInspectionForm(tester, fishballCart);

      // The hint stands in for a status; no real status is preselected.
      expect(find.text('Select status'), findsOneWidget);
      for (final status in sanitationInspectionStatuses) {
        expect(find.text(sanitationStatusLabel(status)), findsNothing);
      }
    });

    testWidgets('blocks submission until a status is chosen', (tester) async {
      final api = await pumpInspectionForm(tester, fishballCart);

      await submitForm(tester);

      expect(api.sentChecklist, isNull);
      expect(find.text('Select the status after inspection.'), findsOneWidget);
    });

    testWidgets('submits an empty checklist with the chosen status', (
      tester,
    ) async {
      final api = await pumpInspectionForm(tester, fishballCart);

      await chooseStatus(tester, 'upcoming');
      await submitForm(tester);

      expect(api.sentChecklist, isNotNull);
      expect(api.sentChecklist, isEmpty);
      expect(api.sentStatus, 'upcoming');
      expect(find.text('Inspection checklist is required.'), findsNothing);
    });

    testWidgets('a configured type still lists and sends its requirements', (
      tester,
    ) async {
      final api = await pumpInspectionForm(tester, aquaStation);

      expect(find.text('No requirements configured yet.'), findsNothing);
      expect(find.text('Water Potability Certificate'), findsOneWidget);
      expect(find.text('Health Certificate of Staff'), findsOneWidget);
      // A configured type still starts with a status and needs no prompt.
      expect(find.text('Select status'), findsNothing);
      expect(find.text(sanitationStatusLabel('for_completion')), findsOneWidget);

      await submitForm(tester);

      expect(
        api.sentChecklist?.map((item) => item.requirementName).toList(),
        const ['Water Potability Certificate', 'Health Certificate of Staff'],
      );
      expect(api.sentStatus, 'for_completion');
    });
  });
}
