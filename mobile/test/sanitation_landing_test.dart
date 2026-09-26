// The public landing page of the sanitation app.
//
// Two services only (Community Report, Establishment Portal), a Staff Sign In
// pill in the top bar instead of a separate inspector card, a small link to
// verify a posted permit, and none of the old feature chips.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const oldChipLabels = [
  'Photo Upload',
  'Map Pin',
  'Draft Sync',
  'Anonymous Option',
  'Permit Code Lookup',
  'QR Pass Scan',
  'Inspection Checklist',
  'Certificate',
];

SanitationBootstrap emptyBootstrap() {
  return SanitationBootstrap(
    businessTypes: const [],
    establishments: const [],
    inspections: const [],
    complaints: const [],
    householdRecords: const [],
    barangays: const [BarangayItem(id: 1, name: 'Daungan')],
    notifications: const [],
  );
}

Future<void> pumpLanding(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: SanitationAccessGateway(
        api: const TourismApi(),
        bootstrap: emptyBootstrap(),
        onRefresh: () async => emptyBootstrap(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows the Filipino heading, two services and the footer', (tester) async {
    await pumpLanding(tester);

    expect(find.text('Mauban Sanitary'), findsOneWidget);
    expect(find.text('Municipal Health Office'), findsOneWidget);
    expect(find.text('Ano ang kailangan mo ngayon?'), findsOneWidget);
    expect(find.text('Pumili ng serbisyo para magpatuloy.'), findsOneWidget);
    expect(find.text('PARA SA RESIDENTE'), findsOneWidget);
    expect(find.text('Community Report'), findsOneWidget);
    expect(
      find.text('I-report ang maruming lugar, tagas ng poso negro, o basura.'),
      findsOneWidget,
    );
    expect(find.text('PARA SA MAY-ARI NG NEGOSYO'), findsOneWidget);
    expect(find.text('Establishment Portal'), findsOneWidget);
    expect(find.text('Tingnan ang status ng sanitary permit.'), findsOneWidget);
    expect(find.text('Official Mauban LGU e-Service · Sanitary Section'), findsOneWidget);
    expect(find.text('Municipal Inspector Portal'), findsNothing);
  });

  testWidgets('no feature chip labels render', (tester) async {
    await pumpLanding(tester);

    for (final label in oldChipLabels) {
      expect(find.textContaining(label), findsNothing, reason: label);
    }
  });

  testWidgets('Staff Sign In is a tall pill that opens the staff login', (tester) async {
    await pumpLanding(tester);

    final button = find.widgetWithText(OutlinedButton, 'Staff Sign In');
    expect(button, findsOneWidget);
    expect(tester.getSize(button).height, greaterThanOrEqualTo(44));

    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.text('Inspector / Staff Login'), findsOneWidget);
  });

  testWidgets('Community Report card opens the report form', (tester) async {
    await pumpLanding(tester);

    await tester.tap(find.text('Community Report'));
    await tester.pumpAndSettle();
    expect(find.byType(SanitationReportPage), findsOneWidget);
  });

  testWidgets('Establishment Portal card keeps its current destination', (tester) async {
    await pumpLanding(tester);

    await tester.tap(find.text('Establishment Portal'));
    await tester.pumpAndSettle();
    expect(find.text('Establishment Access'), findsOneWidget);
  });

  testWidgets('the verify link opens the permit verification screen', (tester) async {
    await pumpLanding(tester);

    await tester.tap(find.text('I-verify ang nakapaskil na permit'));
    await tester.pumpAndSettle();
    expect(find.byType(PermitVerificationPage), findsOneWidget);
  });
}
