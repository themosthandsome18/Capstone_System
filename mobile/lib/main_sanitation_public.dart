import 'package:flutter/material.dart';

import 'constants/colors.dart';
import 'sanitation_public/owner_lookup_browser_transport_stub.dart'
    if (dart.library.js_interop) 'sanitation_public/owner_lookup_browser_transport.dart'
    as browser;
import 'sanitation_public/owner_lookup_client.dart';
import 'sanitation_public/owner_lookup_configuration.dart';
import 'sanitation_public/owner_models.dart';
import 'sanitation_public/owner_portal_view.dart';

void main() {
  runApp(createPublicOwnerApp());
}

/// Compose public lookup only for explicit fixture settings on a browser.
PublicOwnerApp createPublicOwnerApp({
  OwnerLookupConfiguration? configuration,
  OwnerLookupTransport? Function()? transportFactory,
}) {
  final settings = configuration ?? OwnerLookupConfiguration.fromEnvironment();
  if (settings.enabled) {
    final transport =
        (transportFactory ?? browser.createOwnerLookupTransport)();
    if (transport != null) {
      final client = OwnerLookupClient(
        apiBase: settings.apiBase!,
        transport: transport,
      );
      return PublicOwnerApp(
        lookup: client.lookup,
        formatError: ownerLookupErrorMessage,
      );
    }
  }
  return PublicOwnerApp(
    lookup: _disabledLookup,
    formatError: (_) =>
        "This service isn't available yet. Please try again later.",
  );
}

Future<OwnerPermitStatus> _disabledLookup(String code) async {
  throw UnsupportedError('Public owner lookup is not configured.');
}

/// Public navigation only. Callers supply lookup and safe error presentation;
/// this application does not initialize a client, authentication or storage.
class PublicOwnerApp extends StatelessWidget {
  const PublicOwnerApp({
    super.key,
    required this.lookup,
    required this.formatError,
    this.initialRoute,
  });

  static const landingRoute = '/';
  static const ownerRoute = '/establishment-portal';

  final Future<OwnerPermitStatus> Function(String code) lookup;
  final String Function(Object error) formatError;
  final String? initialRoute;

  Route<void> _publicRoute(String? name) {
    final owner = name == ownerRoute;
    return MaterialPageRoute<void>(
      settings: RouteSettings(name: owner ? ownerRoute : landingRoute),
      builder: (_) => owner
          ? OwnerPortalView(lookup: lookup, formatError: formatError)
          : const _PublicLandingPage(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Sanitation & Health Portal',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.deepGreen,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        fontFamily: 'Roboto',
        useMaterial3: true,
      ),
      initialRoute: initialRoute,
      // A direct owner link must retain a public destination for Back.
      // All other initial routes resolve to the public landing page only.
      onGenerateInitialRoutes: (name) => [
        _publicRoute(landingRoute),
        if (name == ownerRoute) _publicRoute(ownerRoute),
      ],
      onGenerateRoute: (settings) => _publicRoute(settings.name),
    );
  }
}

class _PublicLandingPage extends StatelessWidget {
  const _PublicLandingPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mauban Sanitation & Health Portal')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: FilledButton(
              onPressed: () =>
                  Navigator.of(context).pushNamed(PublicOwnerApp.ownerRoute),
              child: const Text('Establishment Portal'),
            ),
          ),
        ),
      ),
    );
  }
}
