// DEVELOPMENT-ONLY local preview of the real Sanitation staff app in Chrome.
//
//   flutter run -d chrome --no-pub -t lib/main_sanitation_preview.dart --web-port 3001 \
//     --dart-define=API_BASE_URL=http://127.0.0.1:8770/api
//
// Pair it with tools/flutter-preview/run_backend.py (synthetic data). This file is a
// separate entrypoint selected only with -t: main.dart and main_sanitation.dart never
// import it, so the production web app keeps its staff sign-in restriction. It refuses
// release builds and any backend other than an explicit loopback /api URL, before any
// session or network work. Sign-in uses the real /auth/login/ API and the normal staff
// session helpers; no token is ever written by hand.
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'main.dart';
import 'utils/web_branding.dart';

/// True only when API_BASE_URL was passed with --dart-define (no production default).
const previewApiBaseDefined = bool.hasEnvironment('API_BASE_URL');

/// Marker used to prove this code is absent from production builds.
const sanitationPreviewMarker = 'SANITATION-LOCAL-PREVIEW-ONLY';

const _previewRoles = {'sanitation', 'admin'};

class PreviewConfigError implements Exception {
  const PreviewConfigError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Accepts only `http://127.0.0.1:PORT/api` or `http://localhost:PORT/api`.
Uri validatePreviewApiBase(String raw) {
  const fail = PreviewConfigError(
    'API_BASE_URL must be http://127.0.0.1:<port>/api or http://localhost:<port>/api '
    '(the local preview backend).',
  );
  if (raw.isEmpty || raw.trim() != raw || raw.contains('\\') || raw.contains('@')) {
    throw fail;
  }
  final Uri uri;
  try {
    uri = Uri.parse(raw);
  } on FormatException {
    throw fail;
  }
  final authority = raw.substring(raw.indexOf('//') + 2).split('/').first;
  if (uri.scheme != 'http' ||
      !(uri.host == '127.0.0.1' || uri.host == 'localhost') ||
      uri.userInfo.isNotEmpty ||
      authority != '${uri.host}:${uri.port}' ||
      uri.port < 1024 ||
      uri.port > 65535 ||
      !(uri.path == '/api' || uri.path == '/api/') ||
      uri.hasQuery ||
      uri.hasFragment) {
    throw fail;
  }
  return uri;
}

/// Why the preview must not start, or null when it may.
String? previewStartupError({
  required bool releaseMode,
  required bool apiBaseDefined,
  required String apiBase,
}) {
  if (releaseMode) {
    return 'The local preview cannot run in a release build.';
  }
  if (!apiBaseDefined) {
    return 'Start with --dart-define=API_BASE_URL=http://127.0.0.1:8770/api '
        '(the local preview backend).';
  }
  try {
    validatePreviewApiBase(apiBase);
  } on PreviewConfigError catch (error) {
    return error.message;
  }
  return null;
}

void main() {
  final error = previewStartupError(
    releaseMode: kReleaseMode,
    apiBaseDefined: previewApiBaseDefined,
    apiBase: apiBaseUrl,
  );
  if (error != null) {
    runApp(PreviewRefusedApp(message: error));
    return;
  }
  // setWebBranding uses SystemChrome, which needs the binding first.
  WidgetsFlutterBinding.ensureInitialized();
  setWebBranding(WebBrandingModule.sanitation);
  runApp(const SanitationPreviewApp());
}

ThemeData _previewTheme() => ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.deepGreen,
    brightness: Brightness.light,
  ),
  scaffoldBackgroundColor: AppColors.canvas,
  fontFamily: 'Arial',
  useMaterial3: true,
);

/// Shown instead of the app when the configuration is unsafe; makes no requests.
class PreviewRefusedApp extends StatelessWidget {
  const PreviewRefusedApp({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: _previewTheme(),
    home: Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Local preview refused\n\n$message',
            key: const ValueKey('preview-refused'),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    ),
  );
}

class SanitationPreviewApp extends StatelessWidget {
  const SanitationPreviewApp({super.key, this.api = const TourismApi()});
  final TourismApi api;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Sanitation staff — local preview',
    theme: _previewTheme(),
    builder: (context, child) => Banner(
      message: 'PREVIEW',
      location: BannerLocation.topEnd,
      color: const Color(0xFFB45309),
      child: child ?? const SizedBox.shrink(),
    ),
    home: SanitationPreviewHome(api: api),
  );
}

class SanitationPreviewHome extends StatefulWidget {
  const SanitationPreviewHome({super.key, required this.api});
  final TourismApi api;

  @override
  State<SanitationPreviewHome> createState() => _SanitationPreviewHomeState();
}

class _SanitationPreviewHomeState extends State<SanitationPreviewHome> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  SanitationBootstrap? _bootstrap;
  bool _starting = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Always start signed out: never reuse a session left in this browser.
    _clearSession().whenComplete(() {
      if (mounted) setState(() => _starting = false);
    });
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await setStaffSessionToken(prefs, null);
    await prefs.remove(staffAuthRoleKey);
    await prefs.remove(staffAuthUsernameKey);
    await prefs.remove(establishmentDataKey);
  }

  Future<void> _signIn() async {
    final username = _username.text.trim();
    final password = _password.text;
    if (username.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter username and password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await widget.api.login(username: username, password: password);
      final token = res['token'] as String?;
      final user = res['user'] as Map<String, dynamic>? ?? {};
      final role = (user['profile'] as Map<String, dynamic>? ?? {})['role'] as String? ?? '';
      if (token == null || token.isEmpty) {
        throw Exception('No authentication token returned by the local backend.');
      }
      if (!_previewRoles.contains(role)) {
        throw Exception('The preview is for Sanitation staff or Admin accounts only.');
      }
      final prefs = await SharedPreferences.getInstance();
      await setStaffSessionToken(prefs, token);
      await prefs.setString(staffAuthRoleKey, role);
      await prefs.setString(staffAuthUsernameKey, username);
      final bootstrap = await widget.api.fetchSanitationBootstrap();
      if (!mounted) return;
      setState(() {
        _bootstrap = bootstrap;
        _busy = false;
        _password.clear();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = conciseError(error);
      });
    }
  }

  Future<void> _signOut({String? message}) async {
    await _clearSession();
    if (!mounted) return;
    setState(() {
      _bootstrap = null;
      _password.clear();
      _error = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final bootstrap = _bootstrap;
    if (bootstrap != null) {
      return SanitationMobileShell(
        api: widget.api,
        bootstrap: bootstrap,
        onRefresh: widget.api.fetchSanitationBootstrap,
        onLogout: () => _signOut(),
        onSessionExpired: () => _signOut(message: 'Your session expired, please sign in again.'),
      );
    }
    if (_starting) return const SanitationLoadingScreen();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Sanitation staff — local preview',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Synthetic data from $apiBaseUrl. Not connected to production.',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      key: const ValueKey('preview-username'),
                      controller: _username,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Username'),
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      key: const ValueKey('preview-password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      onSubmitted: (_) => _busy ? null : _signIn(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _error!,
                        key: const ValueKey('preview-error'),
                        style: const TextStyle(color: Color(0xFFB91C1C)),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      key: const ValueKey('preview-sign-in'),
                      onPressed: _busy ? null : _signIn,
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                      child: Text(_busy ? 'Signing in…' : 'Sign in'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
