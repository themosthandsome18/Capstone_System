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
  const AppBootstrap({super.key});

  @override
  State<AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<AppBootstrap> {
  final TourismApi _api = TourismApi();
  late Future<MobileBootstrap> _bootstrapFuture;
  bool _showIntro = true;
  bool _showLogin = false;

  @override
  void initState() {
    super.initState();
    if (!isSanitationModule()) {
      setWebBranding(WebBrandingModule.tourism);
    }
    _bootstrapFuture = _api.fetchBootstrap();
  }

  @override
  Widget build(BuildContext context) {
    if (!isSanitationModule()) {
      setWebBranding(WebBrandingModule.tourism);
    }
    return FutureBuilder<MobileBootstrap>(
      future: _bootstrapFuture,
      builder: (context, snapshot) {
        final data = snapshot.data ?? MobileBootstrap.fallback();

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
          api: _api,
          bootstrap: data,
          onSignOut: () {
            setState(() {
              _showLogin = true;
            });
          },
        );
      },
    );
  }
}
