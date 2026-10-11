import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'utils/web_branding.dart';
import 'utils/web_download.dart';

part 'constants/colors.dart';
part 'theme/brand_theme.dart';
part 'utils/helpers.dart';
part 'utils/export_helpers.dart';
part 'models/models.dart';
part 'services/api.dart';
part 'widgets/widgets.dart';
part 'widgets/tourism_loading_screen.dart';
part 'screens/common_screens.dart';
part 'screens/tourism_screens.dart';
part 'screens/sanitation_screens.dart';
part 'screens/qr_scanner_screen.dart';
part 'screens/tourist_qr_checkin_screens.dart';
part 'widgets/striped_polygon_layer.dart';

bool isSanitationModule() {
  if (appModule == 'sanitation') {
    return true;
  }
  if (currentBrandingModule == WebBrandingModule.sanitation) {
    return true;
  }
  if (kIsWeb) {
    final active = getActiveWebBrandingModule();
    if (active == 'sanitation') {
      return true;
    }
    final uri = Uri.base;
    final moduleParam =
        (uri.queryParameters['module'] ??
                uri.queryParameters['mode'] ??
                uri.queryParameters['app'])
            ?.toLowerCase();
    if (moduleParam == 'sanitation') {
      return true;
    }
    final path = uri.path.toLowerCase();
    final fragment = uri.fragment.toLowerCase();
    if (path.contains('sanitation') || fragment.contains('sanitation')) {
      return true;
    }
  }
  return false;
}

void main() {
  if (isSanitationModule()) {
    setWebBranding(WebBrandingModule.sanitation);
    runApp(const SanitationStandaloneApp());
    return;
  }

  setWebBranding(WebBrandingModule.tourism);
  runApp(const MaubanMobileApp());
}

class MaubanMobileApp extends StatelessWidget {
  const MaubanMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    final isSanitation = isSanitationModule();
    if (!isSanitation) {
      setWebBranding(WebBrandingModule.tourism);
    }
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: isSanitation
          ? 'Mauban Sanitation & Health Portal'
          : 'Mauban Tourism & Travel Pass',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: isSanitation ? AppColors.deepGreen : AppColors.green,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        textTheme: GoogleFonts.interTextTheme(Theme.of(context).textTheme),
        useMaterial3: true,
      ),
      home: isSanitation
          ? const SanitationStandaloneBootstrap()
          : const AppBootstrap(),
    );
  }
}

class AppBootstrap extends StatefulWidget {
  const AppBootstrap({
    super.key,
    this.api = const TourismApi(),
    this.cache = const TourismBootstrapCache(),
  });

  /// Injectable so tests can drive loading, failure and loaded.
  final TourismApi api;
  final TourismBootstrapCache cache;

  @override
  State<AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<AppBootstrap> {
  TourismBootstrapState _state = const TourismBootstrapState.loading();
  bool _showIntro = true;
  bool _showLogin = false;

  @override
  void initState() {
    super.initState();
    if (!isSanitationModule()) {
      setWebBranding(WebBrandingModule.tourism);
    }
    _load();
  }

  /// The saved copy that is on screen, if one is.
  CachedBootstrap? _cached;

  /// Launch: the saved copy and the server are asked at the same time. A
  /// usable saved copy is shown at once; the server's answer replaces it.
  Future<void> _load() async {
    _cached = null;
    var serverAnswered = false;
    final cacheRead = widget.cache.read().then((cached) {
      if (cached == null || serverAnswered || !mounted) return;
      _cached = cached;
      setState(() => _state = _fromCache(cached));
    });
    final result = await _fetch();
    serverAnswered = result.bootstrap != null;
    // A good answer does not wait for the saved copy; a failure needs it, to
    // know whether there is anything to keep on screen.
    if (!serverAnswered) await cacheRead;
    if (!mounted) return;
    _apply(result);
  }

  TourismBootstrapState _fromCache(
    CachedBootstrap cached, {
    BootstrapFailureKind? refreshFailure,
    bool refreshing = false,
  }) => TourismBootstrapState.loaded(
    cached.bootstrap,
    fromCache: true,
    age: cached.age,
    savedAt: cached.savedAt,
    refreshFailure: refreshFailure,
    refreshing: refreshing,
  );

  Future<_BootstrapFetch> _fetch() async {
    try {
      final raw = await widget.api.fetchBootstrapRaw();
      return _BootstrapFetch(bootstrap: parseBootstrapRaw(raw), raw: raw);
    } catch (error) {
      debugPrint('Tourism bootstrap failed: $error');
      return _BootstrapFetch(error: error);
    }
  }

  void _apply(_BootstrapFetch result) {
    final bootstrap = result.bootstrap;
    if (bootstrap != null) {
      _cached = null;
      setState(() => _state = TourismBootstrapState.loaded(bootstrap));
      unawaited(widget.cache.write(result.raw!));
      return;
    }
    final error = result.error!;
    final kind = classifyBootstrapFailure(error);
    final cached = _cached;
    setState(
      () => _state = cached != null
          ? _fromCache(cached, refreshFailure: kind)
          : TourismBootstrapState.failed(error, kind),
    );
  }

  Future<void> _retry() async {
    if (_state.isLoading || _state.refreshing) return;
    final cached = _cached;
    if (cached != null) {
      // The saved copy stays on screen while the server is asked again.
      setState(() => _state = _fromCache(cached, refreshing: true));
      final result = await _fetch();
      if (!mounted) return;
      _apply(result);
      return;
    }
    setState(() => _state = const TourismBootstrapState.loading());
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (!isSanitationModule()) {
      setWebBranding(WebBrandingModule.tourism);
    }

    if (_showIntro) {
      return IntroFlow(
        onDone: () {
          setState(() {
            _showIntro = false;
            _showLogin = true;
          });
        },
      );
    }

    if (_showLogin) {
      return LoginPage(
        onContinue: () {
          setState(() {
            _showLogin = false;
          });
        },
      );
    }

    return MobileShell(
      api: widget.api,
      state: _state,
      onRetry: _retry,
      onSignOut: () {
        setState(() {
          _showLogin = true;
        });
      },
    );
  }
}

class _BootstrapFetch {
  const _BootstrapFetch({this.bootstrap, this.raw, this.error});

  final MobileBootstrap? bootstrap;
  final String? raw;
  final Object? error;
}
