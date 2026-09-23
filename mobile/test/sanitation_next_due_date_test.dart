// The next inspection due date follows the business type's frequency, and the
// rule must match the web app and the backend: annual +1 year, quarterly
// +3 months, monthly +1 month. An unrecognised frequency yields no suggestion
// rather than a silent monthly one.
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  group('suggestedInspectionDueDate', () {
    final inspected = DateTime(2026, 3, 15);

    test('annual adds one year', () {
      expect(
        suggestedInspectionDueDate(inspected, 'annual'),
        DateTime(2027, 3, 15),
      );
    });

    test('quarterly adds three months', () {
      expect(
        suggestedInspectionDueDate(inspected, 'quarterly'),
        DateTime(2026, 6, 15),
      );
    });

    test('monthly adds one month', () {
      expect(
        suggestedInspectionDueDate(inspected, 'monthly'),
        DateTime(2026, 4, 15),
      );
    });

    test('an unknown frequency suggests nothing', () {
      expect(suggestedInspectionDueDate(inspected, 'fortnightly'), isNull);
      expect(suggestedInspectionDueDate(inspected, ''), isNull);
    });

    test('a month end rolls back to a real date', () {
      expect(
        suggestedInspectionDueDate(DateTime(2026, 1, 31), 'monthly'),
        DateTime(2026, 2, 28),
      );
    });
  });
}
