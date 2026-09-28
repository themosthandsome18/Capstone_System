// Public permit verification confirms a permit and nothing more.
//
// The server now answers with the business name, type, barangay, permit
// number, permit status and issue/expiry dates only. The card must show
// those, and must not show an empty or invented compliance result.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

final Map<String, dynamic> verifiedJson = {
  'verified': true,
  'establishment': {
    'business_name': 'Verify Bakery',
    'business_type_name': 'Public Market Stall',
    'barangay': 'Daungan',
    'permit_number': 'SP-2026-900',
  },
  'permit': {
    'permit_number': 'SP-2026-900',
    'permit_status': 'active',
    'permit_status_label': 'Active',
    'permit_issued_date': '2026-01-05',
    'permit_expiry_date': '2027-01-05',
  },
};

Future<void> pumpCard(WidgetTester tester, Map<String, dynamic> json) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: PermitVerificationCard(
          result: PermitVerificationResult.fromJson(json),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('shows the permit confirmation fields', (tester) async {
    await pumpCard(tester, verifiedJson);

    expect(find.text('Verify Bakery'), findsOneWidget);
    expect(find.text('Public Market Stall'), findsOneWidget);
    expect(find.text('Daungan'), findsOneWidget);
    expect(find.text('SP-2026-900'), findsOneWidget);
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('2026-01-05'), findsOneWidget);
    expect(find.text('2027-01-05'), findsOneWidget);
  });

  testWidgets('shows no compliance result the server no longer sends', (tester) async {
    await pumpCard(tester, verifiedJson);

    expect(find.text('Compliance Status'), findsNothing);
    expect(find.text('Pending'), findsNothing);
  });
}
