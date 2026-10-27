import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/constants/colors.dart';
import 'package:mauban_mobile_app/main_sanitation_public.dart' as public;
import 'package:mauban_mobile_app/sanitation_public/owner_lookup_client.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_lookup_configuration.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_models.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_portal_view.dart';

const input = ValueKey('owner-code-input');
const submit = ValueKey('owner-code-submit');
const unavailable = "This service isn't available yet. Please try again later.";

class RecordingTransport implements OwnerLookupTransport, OwnerLookupOperation {
  RecordingTransport(this.reply);
  final OwnerLookupResponse reply;
  final endpoints = <Uri>[];
  final bodies = <String>[];
  @override
  Future<OwnerLookupResponse> get response => Future.value(reply);
  @override
  OwnerLookupOperation post(Uri endpoint, String body) {
    endpoints.add(endpoint);
    bodies.add(body);
    return this;
  }

  @override
  void abort() {}
}

const commonPublicFiles = {
  'lib/main_sanitation_public.dart',
  'lib/constants/colors.dart',
  'lib/sanitation_public/owner_models.dart',
  'lib/sanitation_public/owner_formatting.dart',
  'lib/sanitation_public/owner_portal_view.dart',
  'lib/sanitation_public/owner_lookup_configuration.dart',
  'lib/sanitation_public/owner_lookup_client.dart',
};
const browserFile = 'lib/sanitation_public/owner_lookup_browser_transport.dart';
const stubFile =
    'lib/sanitation_public/owner_lookup_browser_transport_stub.dart';

/// Inspect both selections, allowing web only through the exact guarded edge.
Set<String> inspectPublicImports({
  required bool browser,
  Map<String, String> overrides = const {},
}) {
  final allowedFiles = {...commonPublicFiles, browser ? browserFile : stubFile};
  final visited = <String>{};
  void inspect(String path) {
    if (!allowedFiles.contains(path)) {
      throw StateError('Forbidden source: $path');
    }
    if (!visited.add(path)) return;
    final source = overrides[path] ?? File(path).readAsStringSync();
    for (final directive in RegExp(
      r'''(?:import|export|part)\s+['"][^;]+;''',
    ).allMatches(source)) {
      final text = directive.group(0)!.trim();
      final uris = RegExp(
        r'''['"]([^'"]+)['"]''',
      ).allMatches(text).map((match) => match.group(1)!).toList();
      if (uris.isEmpty) throw StateError('Unrecognized directive');
      String uri;
      if (uris.length > 1 || text.contains('if (')) {
        if (path != 'lib/main_sanitation_public.dart' ||
            !RegExp(
              r"^import\s+'sanitation_public/owner_lookup_browser_transport_stub\.dart'\s+if\s*\(dart\.library\.js_interop\)\s+'sanitation_public/owner_lookup_browser_transport\.dart'\s+as\s+browser;$",
            ).hasMatch(text)) {
          throw StateError('Unapproved conditional import');
        }
        uri = uris[browser ? 1 : 0];
      } else {
        uri = uris.single;
        if (uri.endsWith('owner_lookup_browser_transport.dart')) {
          throw StateError('Unguarded browser import');
        }
      }
      if (uri.startsWith('package:flutter/')) continue;
      if (const {'dart:async', 'dart:convert'}.contains(uri)) continue;
      if (path == 'lib/constants/colors.dart' && uri == 'dart:ui') continue;
      if (browser &&
          path == browserFile &&
          const {'dart:js_interop', 'package:web/web.dart'}.contains(uri)) {
        continue;
      }
      if (uri.contains(':')) throw StateError('Forbidden import: $uri');
      inspect(Uri.parse(path).resolve(uri).normalizePath().path);
    }
  }

  inspect('lib/main_sanitation_public.dart');
  return visited;
}

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
  for (final configuration in [
    OwnerLookupConfiguration.resolve(),
    OwnerLookupConfiguration.resolve(apiBase: 'http://localhost/api/'),
    OwnerLookupConfiguration.resolve(
      mode: 'production',
      apiBase: 'http://localhost/api/',
    ),
    OwnerLookupConfiguration.resolve(
      mode: 'local-fixture',
      apiBase: 'https://example.invalid/api/',
    ),
    OwnerLookupConfiguration.resolve(mode: 'local-fixture'),
  ].indexed) {
    test(
      'disabled or invalid settings ${configuration.$1} never create transport',
      () async {
        var creations = 0;
        final app = public.createPublicOwnerApp(
          configuration: configuration.$2,
          transportFactory: () {
            creations++;
            throw StateError('Must not construct transport');
          },
        );
        expect(creations, 0);
        await expectLater(app.lookup('SYNTHETIC'), throwsUnsupportedError);
        expect(app.formatError(StateError('PRIVATE')), unavailable);
      },
    );
  }

  test(
    'explicit fixture constructs once and preserves client request and safe errors',
    () async {
      final transport = RecordingTransport(
        const OwnerLookupResponse(404, 'PRIVATE body'),
      );
      var creations = 0;
      final app = public.createPublicOwnerApp(
        configuration: OwnerLookupConfiguration.resolve(
          mode: 'local-fixture',
          apiBase: 'http://127.0.0.1:8765/api/',
        ),
        transportFactory: () {
          creations++;
          return transport;
        },
      );
      expect(creations, 1);
      expect(transport.endpoints, isEmpty);
      await expectLater(
        app.lookup(' mbn-fixture '),
        throwsA(isA<OwnerLookupException>()),
      );
      expect(
        transport.endpoints.single.toString(),
        'http://127.0.0.1:8765/api/mobile/sanitation/establishment-status/',
      );
      expect(transport.bodies, ['{"code":"MBN-FIXTURE"}']);
      expect(
        app.formatError(
          const OwnerLookupException(OwnerLookupFailure.notFound),
        ),
        "Tracking code not found. Check the code on your Owner's Slip.",
      );
      expect(
        app.formatError(StateError('PRIVATE')),
        'Unable to connect. Check your connection and try again.',
      );
    },
  );

  test(
    'VM fixture configuration stays disabled through the real platform stub',
    () async {
      final app = public.createPublicOwnerApp(
        configuration: OwnerLookupConfiguration.resolve(
          mode: 'local-fixture',
          apiBase: 'http://localhost/api/',
        ),
      );
      await expectLater(app.lookup('SYNTHETIC'), throwsUnsupportedError);
      expect(app.formatError(StateError('PRIVATE')), unavailable);
    },
  );

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
      expect(app.theme!.textTheme.bodyMedium!.fontFamily, 'Roboto');
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
    'public entry import graph enforces exact VM and guarded browser boundaries',
    () {
      expect(inspectPublicImports(browser: false), {
        ...commonPublicFiles,
        stubFile,
      });
      expect(inspectPublicImports(browser: true), {
        ...commonPublicFiles,
        browserFile,
      });
    },
  );

  test(
    'boundary rejects web on VM and staff dependencies inside either branch',
    () {
      for (final browser in [false, true]) {
        final path = browser ? browserFile : stubFile;
        for (final forbidden in [
          '../services/api.dart',
          '../utils/helpers.dart',
          '../main_sanitation.dart',
          'package:shared_preferences/shared_preferences.dart',
        ]) {
          for (final separator in ['\n', ' ']) {
            expect(
              () => inspectPublicImports(
                browser: browser,
                overrides: {
                  path:
                      "${File(path).readAsStringSync()}${separator}import '$forbidden';",
                },
              ),
              throwsStateError,
            );
          }
        }
      }
      expect(
        () => inspectPublicImports(
          browser: false,
          overrides: {stubFile: "import 'package:web/web.dart';"},
        ),
        throwsStateError,
      );
      final entry = File('lib/main_sanitation_public.dart').readAsStringSync();
      expect(entry, contains('if (dart.library.js_interop)'));
      expect(
        () => inspectPublicImports(
          browser: true,
          overrides: {
            'lib/main_sanitation_public.dart': entry.replaceAll(
              'dart.library.js_interop',
              'dart.library.io',
            ),
          },
        ),
        throwsStateError,
      );
    },
  );

  testWidgets('public text retains accented names and expiry punctuation', (
    tester,
  ) async {
    await pumpApp(
      tester,
      route: public.PublicOwnerApp.ownerRoute,
      lookup: (_) async => OwnerPermitStatus.fromJson({
        'business_name': 'Ni\u00f1o / NI\u00d1O Caf\u00e9',
        'business_type': 'Food Establishment',
        'barangay': 'Santo Ni\u00f1o',
        'permit_status': 'active',
        'permit_status_label': 'Active',
        'permit_expiry_date': '2026-11-11',
        'days_left': 1,
        'renewal_notice': 'Owner\u2019s notice \u2013 please check.',
      }),
    );
    await check(tester, 'MBN-ACCENTS');
    expect(find.text('Ni\u00f1o / NI\u00d1O Caf\u00e9'), findsOneWidget);
    expect(
      find.text('Food Establishment \u00b7 Santo Ni\u00f1o'),
      findsOneWidget,
    );
    expect(find.text('Nov 11, 2026 \u00b7 1 day'), findsOneWidget);
    expect(
      find.text('Owner\u2019s notice \u2013 please check.'),
      findsOneWidget,
    );
  });

  test('local Roboto font and redistribution license are bundled', () async {
    final font = await rootBundle.load('assets/fonts/Roboto-Regular.ttf');
    expect(font.lengthInBytes, 171676);
    expect(font.getUint32(0), 0x00010000); // TrueType sfnt header.
    final license = await rootBundle.loadString(
      'assets/fonts/roboto_license.txt',
    );
    expect(license, contains('Apache License'));
    expect(license, contains('Version 2.0, January 2004'));
  });
}
