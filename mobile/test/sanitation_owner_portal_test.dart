// The Establishment Portal: an owner types the private tracking code from the
// Owner's Slip and sees the permit status. No login, nothing kept on the phone.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const notFound =
    "Hindi nahanap ang tracking code. Tingnan ang code sa iyong Owner's Slip. / "
    "Tracking code not found. Check the code on your Owner's Slip.";
const tooMany =
    'Masyadong maraming pagsubok mula sa device na ito. Subukan muli '
    'pagkalipas ng isang oras. / Too many attempts from this device. '
    'Please try again in an hour.';
const notAvailable =
    "Hindi pa available ang serbisyong ito. Subukan ulit mamaya. / "
    "This service isn't available yet. Please try again later.";
const networkMessage =
    'Hindi naipadala. Tingnan ang internet at subukan ulit. / '
    'Not sent. Check your connection and try again.';
const renewalNotice =
    'Mag-e-expire ang iyong sanitary permit sa loob ng 45 araw. Mag-renew sa '
    'Sanitary Office. / Your sanitary permit expires in 45 days. Please renew '
    'at the Sanitary Office.';
const expiredNotice =
    'Expired na ang iyong sanitary permit. Mag-renew sa Sanitary Office. / '
    'Your sanitary permit has expired. Please renew at the Sanitary Office.';
const suspendedNotice =
    'Makipag-ugnayan sa Sanitary Office. / Please contact the Sanitary Office.';

Map<String, dynamic> activeStatus({Map<String, dynamic> changes = const {}}) => {
      'business_name': 'Aling Nena Carinderia',
      'business_type': 'Restaurant / Food Establishment',
      'barangay': 'Daungan',
      'permit_number': 'SP-2026-0101',
      'permit_status': 'active',
      'permit_status_label': 'Active',
      'permit_expiry_date': '2026-11-11',
      'days_left': 45,
      'is_expired': false,
      'renewal_notice': renewalNotice,
      'expired_notice': null,
      'suspended_notice': null,
      'requirements': [
        {'name': 'Health Certificate', 'submitted': true},
        {'name': 'Water Potability Test', 'submitted': false},
      ],
      'requirements_note': null,
      ...changes,
    };

class ScriptedPortalApi extends TourismApi {
  ScriptedPortalApi(this.outcomes);

  /// One entry per call: a status map to return, or an error to throw.
  final List<Object> outcomes;
  final List<String> codes = [];
  Completer<void>? gate;

  @override
  Future<OwnerPermitStatus> fetchOwnerPermitStatus(String code) async {
    codes.add(code);
    if (gate != null) await gate!.future;
    final outcome = outcomes.removeAt(0);
    if (outcome is Map<String, dynamic>) return OwnerPermitStatus.fromJson(outcome);
    throw outcome;
  }
}

Future<void> pumpPortal(WidgetTester tester, TourismApi api) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: SanitationOwnerPortalPage(api: api)));
  await tester.pumpAndSettle();
}

Future<void> check(WidgetTester tester, String typed) async {
  await tester.enterText(find.byKey(const ValueKey('owner-code-input')), typed);
  await tester.tap(find.byKey(const ValueKey('owner-code-submit')));
  await tester.pumpAndSettle();
}

Future<void> showStatus(WidgetTester tester, Map<String, dynamic> status) async {
  await pumpPortal(tester, ScriptedPortalApi([status]));
  await check(tester, 'MBN-7KQ4-XP2M');
}

Color? textColor(WidgetTester tester, Finder finder) =>
    tester.widget<Text>(finder).style?.color;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the landing card for owners opens the portal', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final bootstrap = SanitationBootstrap.fallback();
    await tester.pumpWidget(MaterialApp(
      home: SanitationAccessGateway(
        api: const TourismApi(),
        bootstrap: bootstrap,
        onRefresh: () async => bootstrap,
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Establishment Portal'));
    await tester.pumpAndSettle();

    expect(find.byType(SanitationOwnerPortalPage), findsOneWidget);
    expect(find.text('Establishment Access'), findsNothing);
  });

  testWidgets('the page shows the approved texts', (tester) async {
    await pumpPortal(tester, ScriptedPortalApi([]));

    expect(find.text('MUNICIPAL HEALTH OFFICE'), findsOneWidget);
    expect(find.text('Tingnan ang status ng iyong sanitary permit'), findsOneWidget);
    expect(
      find.text(
        'Walang account na kailangan. Ilagay ang tracking code na ibinigay ng Sanitary Office.',
      ),
      findsOneWidget,
    );
    expect(find.text('TRACKING CODE'), findsOneWidget);
    expect(find.text('MBN-XXXX-XXXX'), findsOneWidget);
    expect(find.text('Tingnan ang status'), findsOneWidget);
    expect(
      find.text(
        'Hindi ito ang permit number na nakapaskil sa tindahan. Wala kang code? Pumunta sa Sanitary Office.',
      ),
      findsOneWidget,
    );
    expect(find.text('Official Mauban LGU e-Service'), findsOneWidget);
    expect(find.byType(BackButton), findsOneWidget);
    expect(
      tester.getSize(find.byKey(const ValueKey('owner-code-input'))).height,
      52,
    );
  });

  test('the code is trimmed, upper-cased and stripped of spaces', () {
    expect(normalizeOwnerTrackingCode('  mbn 7kq4 - xp2m '), 'MBN7KQ4-XP2M');
    expect(normalizeOwnerTrackingCode('MBN-7KQ4-XP2M'), 'MBN-7KQ4-XP2M');
  });

  testWidgets('the input keeps only letters, digits and dashes, in capitals', (tester) async {
    final api = ScriptedPortalApi([activeStatus()]);
    await pumpPortal(tester, api);

    await check(tester, ' mbn-7kq4 xp2m!');

    final field = tester.widget<TextField>(find.byKey(const ValueKey('owner-code-input')));
    expect(field.controller!.text, 'MBN-7KQ4XP2M');
    expect(api.codes, ['MBN-7KQ4XP2M']);
  });

  testWidgets('an empty code is not sent', (tester) async {
    final api = ScriptedPortalApi([]);
    await pumpPortal(tester, api);

    await check(tester, '   ');

    expect(api.codes, isEmpty);
    expect(find.text('Ilagay ang tracking code. / Enter the tracking code.'), findsOneWidget);
  });

  testWidgets('while checking, the button is disabled and the wake-up note shows', (tester) async {
    final api = ScriptedPortalApi([activeStatus()])..gate = Completer<void>();
    await pumpPortal(tester, api);

    await tester.enterText(find.byKey(const ValueKey('owner-code-input')), 'MBN-7KQ4-XP2M');
    await tester.tap(find.byKey(const ValueKey('owner-code-submit')));
    await tester.pump();

    final button = tester.widget<FilledButton>(find.byKey(const ValueKey('owner-code-submit')));
    expect(button.onPressed, isNull);
    expect(find.textContaining('hanggang isang minuto'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('owner-code-submit')));
    expect(api.codes, hasLength(1));

    api.gate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Aling Nena Carinderia'), findsOneWidget);
    expect(find.textContaining('hanggang isang minuto'), findsNothing);
  });

  testWidgets('an active permit near expiry shows every part of the card', (tester) async {
    await showStatus(tester, activeStatus());

    expect(find.text('Aling Nena Carinderia'), findsOneWidget);
    expect(find.text('Restaurant / Food Establishment · Daungan'), findsOneWidget);
    expect(find.byKey(const ValueKey('owner-status-chip')), findsOneWidget);
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('Permit no.'), findsOneWidget);
    expect(find.text('SP-2026-0101'), findsOneWidget);
    expect(find.text('Mag-e-expire'), findsOneWidget);
    expect(find.text('Nov 11, 2026 · 45 araw'), findsOneWidget);
    expect(find.text(renewalNotice), findsOneWidget);
    expect(find.byIcon(Icons.notifications_active_outlined), findsOneWidget);
    expect(find.text('Requirements'), findsOneWidget);
    expect(find.text('Health Certificate'), findsOneWidget);
    expect(find.text('Water Potability Test'), findsOneWidget);
    expect(find.text('Naisumite'), findsOneWidget);
    expect(find.text('Kulang'), findsOneWidget);
    expect(textColor(tester, find.text('Kulang')), const Color(0xFF8A1C12));
    expect(textColor(tester, find.text('Naisumite')), const Color(0xFF1E6B45));
    expect(find.text(expiredNotice), findsNothing);
    expect(find.text(suspendedNotice), findsNothing);
  });

  testWidgets('an expired permit is shown in red with the expired notice', (tester) async {
    await showStatus(
      tester,
      activeStatus(changes: {
        'permit_status': 'expired',
        'permit_status_label': 'Expired',
        'permit_expiry_date': '2026-09-20',
        'days_left': -7,
        'is_expired': true,
        'renewal_notice': null,
        'expired_notice': expiredNotice,
      }),
    );

    expect(find.text('Expired'), findsOneWidget);
    expect(textColor(tester, find.text('Expired')), ownerStatusColors('expired').foreground);
    expect(ownerStatusColors('expired').foreground, const Color(0xFF8A1C12));
    expect(find.text(expiredNotice), findsOneWidget);
    expect(find.text('Sep 20, 2026 · 7 araw nang lumipas'), findsOneWidget);
    expect(find.text(renewalNotice), findsNothing);
  });

  testWidgets('a suspended permit is shown in red with only the contact notice', (tester) async {
    await showStatus(
      tester,
      activeStatus(changes: {
        'permit_status': 'suspended',
        'permit_status_label': 'Suspended',
        'renewal_notice': null,
        'suspended_notice': suspendedNotice,
      }),
    );

    expect(find.text('Suspended'), findsOneWidget);
    expect(textColor(tester, find.text('Suspended')), const Color(0xFF8A1C12));
    expect(find.text(suspendedNotice), findsOneWidget);
  });

  testWidgets('no permit number and no date', (tester) async {
    await showStatus(
      tester,
      activeStatus(changes: {
        'permit_number': null,
        'permit_status': 'no_permit',
        'permit_status_label': 'No Permit',
        'permit_expiry_date': null,
        'days_left': null,
        'renewal_notice': null,
      }),
    );

    expect(find.text('Walang permit number pa'), findsOneWidget);
    expect(find.text('Walang petsa'), findsOneWidget);
    expect(find.text('No Permit'), findsOneWidget);
  });

  testWidgets('without an open renewal the checklist is neutral, with the note', (tester) async {
    await showStatus(
      tester,
      activeStatus(changes: {
        'requirements': [
          {'name': 'Health Certificate', 'submitted': null},
          {'name': 'Water Potability Test', 'submitted': null},
        ],
        'requirements_note': 'Dalhin sa renewal',
      }),
    );

    expect(find.text('Health Certificate'), findsOneWidget);
    expect(find.text('Water Potability Test'), findsOneWidget);
    expect(find.text('Naisumite'), findsNothing);
    expect(find.text('Kulang'), findsNothing);
    expect(find.text('Dalhin sa renewal'), findsOneWidget);
  });

  testWidgets('no requirements configured', (tester) async {
    await showStatus(
      tester,
      activeStatus(changes: {
        'requirements': <Map<String, dynamic>>[],
        'requirements_note': 'Wala pang naka-set na requirements',
      }),
    );

    expect(find.text('Requirements'), findsOneWidget);
    expect(find.text('Wala pang naka-set na requirements'), findsOneWidget);
  });

  for (final entry in <String, List<Object>>{
    '404': [const ApiException(statusCode: 404, message: notFound), notFound],
    '429': [const ApiException(statusCode: 429, message: tooMany), tooMany],
    '503': [
      const ApiException(
        statusCode: 503,
        message: 'Tracking codes are not configured on the server (TRACKING_CODE_KEY is not set).',
      ),
      notAvailable,
    ],
    'no network': [const SocketException('Failed host lookup'), networkMessage],
    'timeout': [TimeoutException('slow'), networkMessage],
  }.entries) {
    testWidgets('${entry.key}: a bilingual message, no raw error text', (tester) async {
      await pumpPortal(tester, ScriptedPortalApi([entry.value[0]]));
      await check(tester, 'MBN-7KQ4-XP2M');

      expect(find.text(entry.value[1] as String), findsOneWidget);
      expect(find.textContaining('TRACKING_CODE_KEY'), findsNothing);
      expect(find.textContaining('Failed host lookup'), findsNothing);
      expect(find.textContaining('TimeoutException'), findsNothing);
      expect(find.text('Aling Nena Carinderia'), findsNothing);
    });
  }

  testWidgets('a failed check clears an earlier result', (tester) async {
    await pumpPortal(
      tester,
      ScriptedPortalApi([activeStatus(), const ApiException(statusCode: 404, message: notFound)]),
    );
    await check(tester, 'MBN-7KQ4-XP2M');
    expect(find.text('Aling Nena Carinderia'), findsOneWidget);

    await check(tester, 'MBN-2222-2222');
    expect(find.text('Aling Nena Carinderia'), findsNothing);
    expect(find.text(notFound), findsOneWidget);
  });

  testWidgets('nothing is written on the phone', (tester) async {
    await pumpPortal(
      tester,
      ScriptedPortalApi([activeStatus(), const ApiException(statusCode: 404, message: notFound)]),
    );
    await check(tester, 'MBN-7KQ4-XP2M');
    await check(tester, 'MBN-2222-2222');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getKeys(), isEmpty);
    expect(await SanitationDraftStore.loadReports(), isEmpty);
  });
}
