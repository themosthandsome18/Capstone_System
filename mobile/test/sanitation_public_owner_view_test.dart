import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/constants/colors.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_models.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_portal_view.dart';

const input = ValueKey('owner-code-input');
const submit = ValueKey('owner-code-submit');

OwnerPermitStatus status({Map<String, dynamic> changes = const {}}) =>
    OwnerPermitStatus.fromJson({
      'business_name': 'Fixture Establishment',
      'business_type': 'Food Establishment',
      'barangay': 'Fixture Barangay',
      'permit_number': 'SP-FIXTURE',
      'permit_status': 'active',
      'permit_status_label': 'Active',
      'permit_expiry_date': '2026-11-11',
      'days_left': 1,
      'requirements': [
        {'name': 'Submitted requirement', 'submitted': true},
        {'name': 'Missing requirement', 'submitted': false},
        {'name': 'Unknown requirement', 'submitted': null},
      ],
      ...changes,
    });

Future<void> pumpView(
  WidgetTester tester, {
  required Future<OwnerPermitStatus> Function(String) lookup,
  String Function(Object)? formatError,
}) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: OwnerPortalView(
        lookup: lookup,
        formatError: formatError ?? (_) => 'Safe fixture error.',
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> check(WidgetTester tester, String code) async {
  await tester.enterText(find.byKey(input), code);
  await tester.tap(find.byKey(submit));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('standalone view retains labels, dimensions and canvas', (
    tester,
  ) async {
    await pumpView(tester, lookup: (_) async => status());
    for (final label in [
      'MUNICIPAL HEALTH OFFICE',
      'Check your sanitary permit status',
      'No account needed. Enter the tracking code given by the Sanitary Office.',
      'TRACKING CODE',
      'MBN-XXXX-XXXX',
      'Check status',
      'This is not the permit number posted in your shop. No code? Visit the Sanitary Office.',
      'Official Mauban LGU e-Service',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.byType(BackButton), findsOneWidget);
    expect(tester.getSize(find.byKey(input)).height, 52);
    expect(
      tester.widget<Scaffold>(find.byType(Scaffold)).backgroundColor,
      const Color(0xFFF3F7F4),
    );
    expect(AppColors.ink, const Color(0xFF111827));
  });

  test('status colors retain every existing mapping', () {
    for (final name in [
      'active',
      'renewal_due',
      'conditional',
      'expired',
      'suspended',
      'other',
    ]) {
      final colors = ownerStatusColors(name);
      final expected = switch (name) {
        'active' => const [Color(0xFF1E6B45), Color(0xFFE3F1E8)],
        'renewal_due' ||
        'conditional' => const [Color(0xFF8A5A00), Color(0xFFFFF1CC)],
        'expired' ||
        'suspended' => const [Color(0xFF8A1C12), Color(0xFFFBE4E1)],
        _ => const [Color(0xFF4B5563), Color(0xFFEDEFF2)],
      };
      expect(colors.foreground, expected[0], reason: name);
      expect(colors.background, expected[1], reason: name);
    }
  });

  testWidgets('empty and filtered-empty codes never call either callback', (
    tester,
  ) async {
    var calls = 0;
    var errors = 0;
    await pumpView(
      tester,
      lookup: (_) async {
        calls++;
        return status();
      },
      formatError: (_) {
        errors++;
        return 'Unexpected';
      },
    );
    await check(tester, '');
    await check(tester, ' !@# ');
    expect(find.text('Enter the tracking code.'), findsOneWidget);
    expect(calls, 0);
    expect(errors, 0);
  });

  testWidgets('input filtering and normalization reach the injected lookup', (
    tester,
  ) async {
    final codes = <String>[];
    await pumpView(
      tester,
      lookup: (code) async {
        codes.add(code);
        return status();
      },
    );
    await check(tester, ' mbn-7kq4 xp2m!');
    expect(codes, ['MBN-7KQ4XP2M']);
    expect(
      tester.widget<TextField>(find.byKey(input)).controller!.text,
      'MBN-7KQ4XP2M',
    );
    expect(find.text('Fixture Establishment'), findsOneWidget);
    expect(find.text('SP-FIXTURE'), findsOneWidget);
    expect(find.text('Nov 11, 2026 · 1 day'), findsOneWidget);
    expect(find.text('Submitted'), findsOneWidget);
    expect(find.text('Missing'), findsOneWidget);
    expect(find.text('Unknown requirement'), findsOneWidget);
  });

  testWidgets('loading blocks duplicate taps and keyboard submissions', (
    tester,
  ) async {
    final gate = Completer<OwnerPermitStatus>();
    var calls = 0;
    await pumpView(
      tester,
      lookup: (_) {
        calls++;
        return gate.future;
      },
    );
    await tester.enterText(find.byKey(input), 'MBN-FIXTURE');
    await tester.tap(find.byKey(submit));
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byKey(submit)).onPressed, isNull);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(
      find.text(
        'The first check can take up to a minute while the server wakes up.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(submit));
    tester.widget<TextField>(find.byKey(input)).onSubmitted!('MBN-FIXTURE');
    expect(calls, 1);
    gate.complete(status());
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(find.byKey(submit)).onPressed,
      isNotNull,
    );
  });

  testWidgets('all notices and requirement note retain server text', (
    tester,
  ) async {
    await pumpView(
      tester,
      lookup: (_) async => status(
        changes: {
          'renewal_notice': 'Renewal fixture notice',
          'expired_notice': 'Expired fixture notice',
          'suspended_notice': 'Suspended fixture notice',
          'requirements_note': 'Requirements fixture note',
        },
      ),
    );
    await check(tester, 'MBN-FIXTURE');
    for (final text in [
      'Renewal fixture notice',
      'Expired fixture notice',
      'Suspended fixture notice',
      'Requirements fixture note',
    ]) {
      expect(find.text(text), findsOneWidget);
    }
  });

  testWidgets('missing permit and expiry keep original fallbacks', (
    tester,
  ) async {
    await pumpView(
      tester,
      lookup: (_) async => status(
        changes: {
          'permit_number': null,
          'permit_expiry_date': null,
          'days_left': null,
        },
      ),
    );
    await check(tester, 'MBN-FIXTURE');
    expect(find.text('No permit number yet'), findsOneWidget);
    expect(find.text('No date'), findsOneWidget);
  });

  testWidgets('failure uses only injected formatter and clears stale result', (
    tester,
  ) async {
    final failure = StateError('private raw exception');
    final seen = <Object>[];
    var calls = 0;
    await pumpView(
      tester,
      lookup: (_) async {
        if (calls++ == 0) return status();
        throw failure;
      },
      formatError: (error) {
        seen.add(error);
        return 'Safe fixture error.';
      },
    );
    await check(tester, 'MBN-FIRST');
    expect(find.text('Fixture Establishment'), findsOneWidget);
    await check(tester, 'MBN-SECOND');
    expect(seen, [failure]);
    expect(find.text('Safe fixture error.'), findsOneWidget);
    expect(find.textContaining('private raw exception'), findsNothing);
    expect(find.text('Fixture Establishment'), findsNothing);
    expect(
      tester.widget<FilledButton>(find.byKey(submit)).onPressed,
      isNotNull,
    );
  });

  testWidgets('disposal during lookup does not update an unmounted view', (
    tester,
  ) async {
    final gate = Completer<OwnerPermitStatus>();
    await pumpView(tester, lookup: (_) => gate.future);
    await tester.enterText(find.byKey(input), 'MBN-FIXTURE');
    await tester.tap(find.byKey(submit));
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    gate.complete(status());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('render and lookup need no saved-session plugin', (tester) async {
    final storageCalls = <MethodCall>[];
    const channel = MethodChannel('plugins.flutter.io/shared_preferences');
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      storageCalls.add(call);
      throw StateError('Storage must not be accessed');
    });
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      ),
    );
    await pumpView(tester, lookup: (_) async => status());
    await check(tester, 'MBN-FIXTURE');
    expect(find.text('Fixture Establishment'), findsOneWidget);
    expect(storageCalls, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
