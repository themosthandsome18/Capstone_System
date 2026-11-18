import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:mauban_mobile_app/main_sanitation_preview.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sanitation_staff_bootstrap_test.dart' show publicBootstrap;

/// Stands in for the local Django preview backend.
class FakePreviewApi extends TourismApi {
  FakePreviewApi({this.role = 'sanitation', this.password = 'preview-only-not-a-secret'});
  final String role;
  final String password;
  final logins = <String>[];
  int bootstraps = 0;

  @override
  Future<Map<String, dynamic>> login({required String username, required String password}) async {
    logins.add(username);
    if (password != this.password) {
      throw const ApiException(statusCode: 401, message: 'Invalid username or password.');
    }
    return {
      'token': 'synthetic-token-$username',
      'user': {
        'display_name': 'Preview Inspector',
        'username': username,
        'profile': {'role': role},
      },
    };
  }

  @override
  Future<SanitationBootstrap> fetchSanitationBootstrap() async {
    bootstraps++;
    return publicBootstrap();
  }

  @override
  Future<Map<String, dynamic>> fetchSanitationPendingComplaints() async => {
    'summary': {'pending': 0}, 'rows': [],
  };

  @override
  Future<List<Map<String, dynamic>>> fetchSanitationDashboardInspections() async => [];

  @override
  Future<Map<String, dynamic>> fetchSanitationStaffRecords() async => {};
}

Future<List<http.Request>> pumpPreview(WidgetTester tester, FakePreviewApi api) async {
  tester.view.physicalSize = const Size(1200, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final requests = <http.Request>[];
  final client = MockClient((request) async {
    requests.add(request);
    return http.Response(jsonEncode({'user': {'display_name': 'Preview Inspector'}}), 200);
  });
  addTearDown(client.close);
  await http.runWithClient(() async {
    await tester.pumpWidget(SanitationPreviewApp(api: api));
    await tester.pumpAndSettle();
  }, () => client);
  return requests;
}

Future<void> signIn(WidgetTester tester, String username, String password) async {
  await tester.enterText(find.byKey(const ValueKey('preview-username')), username);
  await tester.enterText(find.byKey(const ValueKey('preview-password')), password);
  await tester.tap(find.byKey(const ValueKey('preview-sign-in')));
  await tester.pumpAndSettle();
}

Iterable<File> productionDartFiles() => Directory('lib')
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.endsWith('.dart'))
    .where((f) => !f.path.replaceAll('\\', '/').endsWith('lib/main_sanitation_preview.dart'));

void main() {
  group('API_BASE_URL validation', () {
    test('accepts explicit loopback /api URLs', () {
      for (final ok in [
        'http://127.0.0.1:8770/api',
        'http://127.0.0.1:8770/api/',
        'http://localhost:8770/api',
      ]) {
        expect(validatePreviewApiBase(ok).host, anyOf('127.0.0.1', 'localhost'), reason: ok);
      }
    });

    test('rejects production, remote, malformed and tricky URLs', () {
      for (final bad in [
        'https://capstone-backend-stzr.onrender.com/api',
        'https://127.0.0.1:8770/api',
        'http://192.168.1.5:8770/api',
        'http://example.com:8770/api',
        'http://127.0.0.1/api',
        'http://127.0.0.1:80/api',
        'http://127.0.0.1:99999/api',
        'http://127.0.0.1:8770/',
        'http://127.0.0.1:8770/api/v2',
        'http://127.0.0.1:8770/api/../admin',
        'http://user:pass@127.0.0.1:8770/api',
        'http://127.0.0.1:8770@evil.example/api',
        'http://127.0.0.1.evil.example:8770/api',
        'http://localhost.evil.example:8770/api',
        'http://[::1]:8770/api',
        'http://127.0.0.1:8770/api?next=https://evil.example',
        'http://127.0.0.1:8770/api#x',
        'http:\\\\127.0.0.1:8770\\api',
        ' http://127.0.0.1:8770/api',
        'ftp://127.0.0.1:8770/api',
        '//127.0.0.1:8770/api',
        'not a url',
        '',
      ]) {
        expect(() => validatePreviewApiBase(bad), throwsA(isA<PreviewConfigError>()), reason: bad);
      }
    });
  });

  group('startup gate', () {
    test('release builds are refused even with a valid local URL', () {
      expect(
        previewStartupError(releaseMode: true, apiBaseDefined: true, apiBase: 'http://127.0.0.1:8770/api'),
        contains('release'),
      );
    });

    test('a missing API_BASE_URL (production default) is refused', () {
      expect(
        previewStartupError(releaseMode: false, apiBaseDefined: false, apiBase: 'http://127.0.0.1:8770/api'),
        isNotNull,
      );
      // This test run itself has no --dart-define, so the real gate refuses it.
      if (!previewApiBaseDefined) {
        expect(
          previewStartupError(releaseMode: false, apiBaseDefined: previewApiBaseDefined, apiBase: apiBaseUrl),
          isNotNull,
        );
      }
    });

    test('a defined but production URL is refused; a local one is allowed', () {
      expect(
        previewStartupError(releaseMode: false, apiBaseDefined: true,
            apiBase: 'https://capstone-backend-stzr.onrender.com/api'),
        isNotNull,
      );
      expect(
        previewStartupError(releaseMode: false, apiBaseDefined: true, apiBase: 'http://127.0.0.1:8770/api'),
        isNull,
      );
    });

    testWidgets('the refusal screen makes no requests', (tester) async {
      var requests = 0;
      await http.runWithClient(() async {
        await tester.pumpWidget(const PreviewRefusedApp(message: 'refused'));
        await tester.pumpAndSettle();
      }, () => MockClient((_) async {
        requests++;
        return http.Response('{}', 200);
      }));
      expect(find.byKey(const ValueKey('preview-refused')), findsOneWidget);
      expect(requests, 0);
    });
  });

  group('production isolation', () {
    test('no production source imports or references the preview', () {
      for (final file in productionDartFiles()) {
        final text = file.readAsStringSync();
        for (final needle in ['main_sanitation_preview', 'SanitationPreviewApp',
                              'SanitationPreviewHome', sanitationPreviewMarker]) {
          expect(text.contains(needle), isFalse, reason: '${file.path} references $needle');
        }
      }
    });

    test('the preview is a separate library, not a part of main.dart', () {
      final preview = File('lib/main_sanitation_preview.dart').readAsStringSync();
      expect(preview.contains('part of'), isFalse);
      expect(File('lib/main.dart').readAsStringSync().contains('main_sanitation_preview'), isFalse);
      expect(File('lib/main_sanitation.dart').readAsStringSync().contains('preview'), isFalse);
    });

    test('production web still hides the staff sign-in entry', () {
      final screens = File('lib/screens/sanitation_screens.dart').readAsStringSync();
      final gate = RegExp(
        r'if \(!isWeb\)\s*OutlinedButton\(\s*onPressed: \(\) \{\s*setState\(\(\) => _currentScreen =\s*'
        r'SanitationGatewayScreen\.staffLogin\);',
      );
      expect(gate.hasMatch(screens), isTrue);
      expect(RegExp(r'_currentScreen =\s*SanitationGatewayScreen\.staffLogin').allMatches(screens).length, 1);
    });
  });

  group('preview sign-in', () {
    setUp(() => SharedPreferences.setMockInitialValues({
      // A session left behind in the browser must not be reused.
      staffAuthTokenKey: 'left-over-token',
      staffAuthRoleKey: 'sanitation',
    }));

    testWidgets('starts signed out and clears any stored session', (tester) async {
      final api = FakePreviewApi();
      await pumpPreview(tester, api);
      expect(find.byKey(const ValueKey('preview-sign-in')), findsOneWidget);
      expect(find.byType(SanitationMobileShell), findsNothing);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(staffAuthTokenKey), isNull);
      expect(api.logins, isEmpty);
    });

    testWidgets('invalid login stays on the form and stores nothing', (tester) async {
      final api = FakePreviewApi();
      await pumpPreview(tester, api);
      await signIn(tester, 'preview.inspector', 'wrong');
      expect(find.byKey(const ValueKey('preview-error')), findsOneWidget);
      expect(find.byType(SanitationMobileShell), findsNothing);
      expect((await SharedPreferences.getInstance()).getString(staffAuthTokenKey), isNull);
    });

    testWidgets('non-staff roles are refused and nothing is stored', (tester) async {
      for (final role in ['tourist', 'establishment', 'tourism', '']) {
        final api = FakePreviewApi(role: role);
        await pumpPreview(tester, api);
        await signIn(tester, 'someone', 'preview-only-not-a-secret');
        expect(find.byType(SanitationMobileShell), findsNothing, reason: role);
        expect((await SharedPreferences.getInstance()).getString(staffAuthTokenKey), isNull, reason: role);
      }
    });

    testWidgets('staff login opens the real shell; logout clears the session', (tester) async {
      final api = FakePreviewApi();
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode({'user': {'display_name': 'Preview Inspector'}}), 200);
      });
      addTearDown(client.close);
      tester.view.physicalSize = const Size(1200, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await http.runWithClient(() async {
        await tester.pumpWidget(SanitationPreviewApp(api: api));
        await tester.pumpAndSettle();
        await signIn(tester, 'preview.inspector', 'preview-only-not-a-secret');
        expect(find.byType(SanitationMobileShell), findsOneWidget);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString(staffAuthTokenKey), 'synthetic-token-preview.inspector');
        expect(prefs.getString(staffAuthRoleKey), 'sanitation');
        final revision = staffSessionRevision.value;

        tester.widget<SanitationMobileShell>(find.byType(SanitationMobileShell)).onLogout!();
        await tester.pumpAndSettle();
        expect(find.byType(SanitationMobileShell), findsNothing);
        expect(find.byKey(const ValueKey('preview-sign-in')), findsOneWidget);
        expect(prefs.getString(staffAuthTokenKey), isNull);
        expect(staffSessionRevision.value, greaterThan(revision),
            reason: 'logout must notify mounted private panels to clear');
      }, () => client);
      for (final request in requests) {
        expect(request.url.toString(), startsWith(apiBaseUrl));
      }
    });

    testWidgets('session expiry returns to sign-in with a message', (tester) async {
      final api = FakePreviewApi();
      final client = MockClient((_) async =>
          http.Response(jsonEncode({'user': {'display_name': 'Preview Inspector'}}), 200));
      addTearDown(client.close);
      tester.view.physicalSize = const Size(1200, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await http.runWithClient(() async {
        await tester.pumpWidget(SanitationPreviewApp(api: api));
        await tester.pumpAndSettle();
        await signIn(tester, 'preview.inspector', 'preview-only-not-a-secret');
        tester.widget<SanitationMobileShell>(find.byType(SanitationMobileShell)).onSessionExpired!();
        await tester.pumpAndSettle();
      }, () => client);
      expect(find.byType(SanitationMobileShell), findsNothing);
      expect(find.textContaining('session expired'), findsOneWidget);
      expect((await SharedPreferences.getInstance()).getString(staffAuthTokenKey), isNull);
    });
  });
}
