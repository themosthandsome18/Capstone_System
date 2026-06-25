import 'dart:convert';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:flutter/services.dart';

part 'constants/colors.dart';
part 'utils/helpers.dart';
part 'models/models.dart';
part 'services/api.dart';
part 'widgets/widgets.dart';
part 'screens/common_screens.dart';
part 'screens/tourism_screens.dart';
part 'screens/sanitation_screens.dart';
part 'screens/qr_scanner_screen.dart';
part 'widgets/striped_polygon_layer.dart';

void main() {
  if (appModule == 'sanitation') {
    runApp(const SanitationStandaloneApp());
    return;
  }

  runApp(const MaubanMobileApp());
}

class MaubanMobileApp extends StatelessWidget {
  const MaubanMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Tourism',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.green,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        textTheme: GoogleFonts.interTextTheme(Theme.of(context).textTheme),
        useMaterial3: true,
      ),
      home: const AppBootstrap(),
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
    _bootstrapFuture = _api.fetchBootstrap();
  }

  @override
  Widget build(BuildContext context) {
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

        return MobileShell(api: _api, bootstrap: data);
      },
    );
  }
}
