// The inspection checklist must come from the requirements the Sanitation
// Section configured for the business type.
//
// A type such as Ambulant Food Vendor has none configured yet, so the app
// must show nothing rather than invent a generic list. Types that do have
// requirements keep their existing behaviour.
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

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

void main() {
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
      expect(checks.every((item) => item.isComplied), isFalse);
      expect(checks.any((item) => item.isComplied), isFalse);
    });

    test('an unknown business type yields no checklist', () {
      expect(buildInspectionChecks(allTypes, 999), isEmpty);
      expect(buildInspectionChecks(const [], waterStation.id), isEmpty);
    });
  });
}
