import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/constants/colors.dart';
import 'package:mauban_mobile_app/main_sanitation_public.dart' as public;
import 'package:mauban_mobile_app/sanitation_public/owner_models.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_portal_view.dart';

const input = ValueKey('owner-code-input');
const submit = ValueKey('owner-code-submit');
const unavailable = "This service isn't available yet. Please try again later.";

OwnerPermitStatus fixture() => OwnerPermitStatus.fromJson({
  'business_name': 'Synthetic Owner Fixture',
  'business_type': 'Food Establishment',
  'barangay': 'Fixture Barangay',
  'permit_number': 'SP-FIXTURE',
  'permit_status': 'active',
  'permit_status_label': 'Active',
  'permit_expiry_date': '2026-11-11',
  'days_left': 1,
  'renewal_notice': 'Synthetic renewal notice',
  'requirements': [
    {'name': 'Fixture certificate', 'submitted': true},
  ],
});

Future<void> pumpApp(
  WidgetTester tester, {
  String route = public.PublicOwnerApp.landingRoute,
  Future<OwnerPermitStatus> Function(String)? lookup,
  String Function(Object)? formatError,
}) async {
  await tester.pumpWidget(
    public.PublicOwnerApp(
      initialRoute: route,
      lookup: lookup ?? (_) async => fixture(),
      formatError: formatError ?? (_) => 'Safe fixture failure.',
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
  setUp(() {
    final tester = TestWidgetsFlutterBinding.ensureInitialized();
    tester.platformDispatcher.defaultRouteNameTestValue = '/';
  });

  tearDown(
    () => TestWidgetsFlutterBinding.ensureInitialized().platformDispatcher
        .clearDefaultRouteNameTestValue(),
  );

  testWidgets(
    'landing starts without lookup and retains the Sanitation theme',
    (tester) async {
      var calls = 0;
      await pumpApp(
        tester,
        lookup: (_) async {
          calls++;
          return fixture();
        },
      );
      expect(calls, 0);
      expect(find.text('Establishment Portal'), findsOneWidget);
      expect(find.byType(OwnerPortalView), findsNothing);
      final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(app.theme!.scaffoldBackgroundColor, AppColors.canvas);
      expect(
        app.theme!.colorScheme,
        ColorScheme.fromSeed(seedColor: AppColors.deepGreen),
      );
      expect(app.theme!.textTheme.bodyMedium!.fontFamily, 'Arial');
    },
  );

  testWidgets('public landing opens owner and Back returns to landing', (
    tester,
  ) async {
    await pumpApp(tester);
    await tester.tap(find.text('Establishment Portal'));
    await tester.pumpAndSettle();
    expect(find.byType(OwnerPortalView), findsOneWidget);
    expect(find.text('Check your sanitary permit status'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(OwnerPortalView), findsNothing);
    expect(find.text('Establishment Portal'), findsOneWidget);
  });

  testWidgets('direct owner initialization retains public landing for Back', (
    tester,
  ) async {
    await pumpApp(tester, route: public.PublicOwnerApp.ownerRoute);
    expect(find.byType(OwnerPortalView), findsOneWidget);
    final context = tester.element(find.byType(OwnerPortalView));
    expect(
      ModalRoute.of(context)!.settings.name,
      public.PublicOwnerApp.ownerRoute,
    );
    expect(Navigator.of(context).canPop(), isTrue);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Establishment Portal'), findsOneWidget);
    expect(find.byType(OwnerPortalView), findsNothing);
  });

  testWidgets('unknown initial route falls back to public landing', (
    tester,
  ) async {
    await pumpApp(tester, route: '/not-a-public-route');
    expect(find.text('Establishment Portal'), findsOneWidget);
    final context = tester.element(find.text('Establishment Portal'));
    expect(
      ModalRoute.of(context)!.settings.name,
      public.PublicOwnerApp.landingRoute,
    );
    expect(Navigator.of(context).canPop(), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('main honors the platform owner route without a client', (
    tester,
  ) async {
    tester.binding.platformDispatcher.defaultRouteNameTestValue =
        public.PublicOwnerApp.ownerRoute;
    public.main();
    await tester.pumpAndSettle();
    expect(find.byType(OwnerPortalView), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Establishment Portal'), findsOneWidget);
  });

  testWidgets(
    'staff and Tourism route attempts resolve only to public landing',
    (tester) async {
      await pumpApp(tester);
      final navigator = tester.state<NavigatorState>(find.byType(Navigator));
      for (final route in [
        '/staff',
        '/login',
        '/sanitation/dashboard',
        '/tourism',
      ]) {
        unawaited(navigator.pushNamed(route));
        await tester.pumpAndSettle();
        expect(find.text('Establishment Portal'), findsOneWidget);
        expect(find.text('Staff Sign In'), findsNothing);
        expect(find.text('Tourism'), findsNothing);
        expect(find.byType(OwnerPortalView), findsNothing);
        navigator.pop();
        await tester.pumpAndSettle();
      }
    },
  );

  testWidgets('owner receives normalized lookup and presents supplied data', (
    tester,
  ) async {
    final codes = <String>[];
    await pumpApp(
      tester,
      route: public.PublicOwnerApp.ownerRoute,
      lookup: (code) async {
        codes.add(code);
        return fixture();
      },
    );
    await check(tester, ' mbn-fixture!');
    expect(codes, ['MBN-FIXTURE']);
    for (final text in [
      'Synthetic Owner Fixture',
      'SP-FIXTURE',
      'Active',
      'Nov 11, 2026 · 1 day',
      'Synthetic renewal notice',
      'Fixture certificate',
      'Submitted',
    ]) {
      expect(find.text(text), findsOneWidget);
    }
  });

  testWidgets(
    'error callback receives failure without raw exception exposure',
    (tester) async {
      final failure = StateError('Private exception details');
      Object? received;
      await pumpApp(
        tester,
        route: public.PublicOwnerApp.ownerRoute,
        lookup: (_) async => throw failure,
        formatError: (error) {
          received = error;
          return 'Safe fixture failure.';
        },
      );
      await check(tester, 'MBN-FIXTURE');
      expect(identical(received, failure), isTrue);
      expect(find.text('Safe fixture failure.'), findsOneWidget);
      expect(find.textContaining('Private exception details'), findsNothing);
    },
  );

  testWidgets('empty input does not invoke injected lookup', (tester) async {
    var calls = 0;
    await pumpApp(
      tester,
      route: public.PublicOwnerApp.ownerRoute,
      lookup: (_) async {
        calls++;
        return fixture();
      },
    );
    await check(tester, '');
    expect(calls, 0);
    expect(find.text('Enter the tracking code.'), findsOneWidget);
  });

  testWidgets(
    'default main has disabled lookup with safe unavailable feedback',
    (tester) async {
      public.main();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Establishment Portal'));
      await tester.pumpAndSettle();
      final view = tester.widget<OwnerPortalView>(find.byType(OwnerPortalView));
      await expectLater(view.lookup('MBN-FIXTURE'), throwsUnsupportedError);
      await check(tester, 'MBN-FIXTURE');
      expect(find.text(unavailable), findsOneWidget);
      expect(find.text('Synthetic Owner Fixture'), findsNothing);
      expect(find.textContaining('UnsupportedError'), findsNothing);
    },
  );

  testWidgets('public app never initializes storage or platform plugins', (
    tester,
  ) async {
    final platformCalls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMessageHandler(
      'flutter/platform',
      (message) async {
        final call = const JSONMethodCodec().decodeMethodCall(message);
        if (call.method != 'SystemNavigator.routeInformationUpdated') {
          platformCalls.add(call.method);
        }
        return const JSONMethodCodec().encodeSuccessEnvelope(null);
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMessageHandler(
        'flutter/platform',
        null,
      ),
    );
    final storageCalls = <String>[];
    for (final name in [
      'plugins.flutter.io/shared_preferences',
      'dev.flutter.pigeon.shared_preferences_android.SharedPreferencesApi.getAll',
      'plugins.flutter.io/path_provider',
    ]) {
      tester.binding.defaultBinaryMessenger.setMockMessageHandler(name, (
        message,
      ) async {
        storageCalls.add(name);
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMessageHandler(
          name,
          null,
        ),
      );
    }
    await pumpApp(tester);
    await tester.tap(find.text('Establishment Portal'));
    await tester.pumpAndSettle();
    await check(tester, 'MBN-FIXTURE');
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(storageCalls, isEmpty);
    // Text input and accessibility are Flutter framework services, not sessions.
    expect(
      platformCalls.where(
        (name) => name.contains('auth') || name.contains('storage'),
      ),
      isEmpty,
    );
  });

  test(
    'public entry import graph contains only the standalone UI boundary',
    () {
      final visited = <String>{};
      final imports = <String>[];
      void inspect(String path) {
        if (!visited.add(path)) return;
        final source = File(path).readAsStringSync();
        for (final match in RegExp(
          r"(?:import|export|part)\s+'([^']+)'",
        ).allMatches(source)) {
          final uri = match.group(1)!;
          imports.add(uri);
          if (!uri.contains(':')) {
            inspect(File.fromUri(File(path).absolute.uri.resolve(uri)).path);
          }
        }
      }

      inspect('lib/main_sanitation_public.dart');
      expect(
        imports.where(
          (uri) =>
              uri.startsWith('package:') && !uri.startsWith('package:flutter/'),
        ),
        isEmpty,
      );
      expect(
        imports.where(
          (uri) => [
            'main.dart',
            'main_sanitation.dart',
            'utils/helpers.dart',
            'services/api.dart',
          ].contains(uri),
        ),
        isEmpty,
      );
      expect(visited, hasLength(5));
    },
  );
}
