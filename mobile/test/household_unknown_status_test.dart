import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

Map<String, dynamic> payload(String? value) {
  final data = <String, dynamic>{};
  if (value != null) data['status'] = value;
  return data;
}

void main() {
  for (final value in [null, '', 'future_status', 'active', 'good_standing', 'violation', 'for_completion']) {
    final expected = ['good_standing', 'violation', 'for_completion'].contains(value) ? value! : '';
    test('household and receipt status $value stay factual', () {
      final data = payload(value);
      final item = HouseholdSanitationItem.fromJson(data);
      final receipt = MobileHouseholdSurveyReceipt.fromResponse(data, head: 'Synthetic', barangay: 'Alitap', waterSource: 'Other', toiletType: 'none');
      expect(item.status, expected);
      expect(receipt.status, expected);
      expect(householdStatusLabel(item.status), expected.isEmpty ? 'Unknown' : {'good_standing':'Good Standing','violation':'Violation','for_completion':'For Completion'}[expected]);
    });
    testWidgets('household list renders $value with truthful label and colour', (tester) async {
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SanitationHouseholdsPage(
        householdRecords: [HouseholdSanitationItem.fromJson({'household_head':'Synthetic',...payload(value)})],
        onOpenHouseholdSurvey: () {}, onRefresh: () async {}, refreshing: false))));
      final card = tester.widget<SimpleInfoCard>(find.byType(SimpleInfoCard));
      expect(card.trailing, expected.isEmpty ? 'Unknown' : {'good_standing':'Good Standing','violation':'Violation','for_completion':'For Completion'}[expected]);
      expect(card.statusColor, expected.isEmpty ? AppColors.muted : sanitationStatusColor(expected));
      expect(find.text(expected.isEmpty ? 'Unknown' : householdStatusLabel(expected)), findsOneWidget);
    });
  }
}
