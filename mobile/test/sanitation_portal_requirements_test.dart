// The Establishment Portal's Requirements Checklist is shown to business
// owners, so it must list the requirements actually configured for their
// business type and nothing else: no invented documents, no invented dates,
// and no submission status the app cannot know.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

/// The documents the portal used to invent, regardless of the business type.
const oldFabricatedDocuments = [
  'Barangay Business Clearance',
  'Employee Health Certificates',
  'Water Potability Test Result',
  'Solid Waste & Grease Trap Maintenance',
  'Pest & Vermin Abatement Plan',
];

/// Fragments of the invented evidence that went with those documents.
const oldFabricatedEvidence = [
  'Verified on',
  'Tested on',
  'Daungan Lab',
  '12/12',
  'Certified valid until',
];

SanitationBusinessType portalType(
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
final ambulantType = portalType(24, 'Ambulant Food Vendor', const []);
final carinderiaType = portalType(3, 'Carinderia', const [
  'Sanitary Permit Application Form',
  'Health Certificate of Food Handlers',
  'sanitary permit application form',
  '   ',
]);

final portalTypes = [ambulantType, carinderiaType];

SanitationEstablishment portalEstablishment(int typeId, String status) {
  return SanitationEstablishment.fromJson({
    'id': 900 + typeId,
    'business_name': 'Owner Business',
    'business_type': typeId,
    'barangay': 'Daungan',
    'compliance_status': status,
  });
}

Future<void> pumpPortal(
  WidgetTester tester, {
  required SanitationEstablishment establishment,
  required List<SanitationBusinessType> businessTypes,
}) async {
  // Tall surface so the whole scrolling portal, requirements card included,
  // builds without scrolling.
  tester.view.physicalSize = const Size(1200, 6000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: SanitationEstablishmentPortalPage(
        establishment: establishment,
        businessTypes: businessTypes,
        onLogout: () {},
        onRefresh: () async {},
      ),
    ),
  );
  await tester.pump();
}

void expectNoFabricatedContent(WidgetTester tester) {
  for (final document in oldFabricatedDocuments) {
    expect(
      find.text(document),
      findsNothing,
      reason: '"$document" is not real data',
    );
  }
  final rendered = tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data ?? '')
      .join('\n');
  for (final fragment in oldFabricatedEvidence) {
    expect(
      rendered.contains(fragment),
      isFalse,
      reason: '"$fragment" is invented evidence',
    );
  }
}

void main() {
  group('Establishment Portal requirements', () {
    testWidgets('lists the real requirements configured for the type', (
      tester,
    ) async {
      await pumpPortal(
        tester,
        establishment: portalEstablishment(carinderiaType.id, 'good_standing'),
        businessTypes: portalTypes,
      );

      expect(find.text('Sanitary Permit Application Form'), findsOneWidget);
      expect(find.text('Health Certificate of Food Handlers'), findsOneWidget);
      expect(find.text('No requirements configured yet.'), findsNothing);
      expectNoFabricatedContent(tester);
    });

    testWidgets('shows an empty state for a type with no requirements', (
      tester,
    ) async {
      await pumpPortal(
        tester,
        establishment: portalEstablishment(ambulantType.id, 'good_standing'),
        businessTypes: portalTypes,
      );

      expect(find.text('No requirements configured yet.'), findsOneWidget);
      expectNoFabricatedContent(tester);
    });

    testWidgets('says so honestly when the business type is unavailable', (
      tester,
    ) async {
      await pumpPortal(
        tester,
        establishment: portalEstablishment(999, 'violation'),
        businessTypes: portalTypes,
      );

      expect(find.text('Requirements unavailable.'), findsOneWidget);
      expectNoFabricatedContent(tester);
    });

    testWidgets('invents nothing when a violation is recorded', (tester) async {
      await pumpPortal(
        tester,
        establishment: portalEstablishment(carinderiaType.id, 'violation'),
        businessTypes: portalTypes,
      );

      expect(find.text('Sanitary Permit Application Form'), findsOneWidget);
      expectNoFabricatedContent(tester);
    });
  });
}
