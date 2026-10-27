/// Explicit public lookup configuration. Invalid settings always disable lookup.
/// Resolving settings does not create a client, transport, or request.
class OwnerLookupConfiguration {
  const OwnerLookupConfiguration._(this.apiBase);

  /// Null when disabled; otherwise an explicit, validated loopback /api/ base.
  final String? apiBase;

  bool get enabled => apiBase != null;

  factory OwnerLookupConfiguration.fromEnvironment() {
    return OwnerLookupConfiguration.resolve(
      mode: const String.fromEnvironment(
        'SANITATION_OWNER_LOOKUP_MODE',
        defaultValue: 'disabled',
      ),
      apiBase: const String.fromEnvironment('SANITATION_OWNER_API_BASE_URL'),
    );
  }

  /// Pure resolver, also used to verify settings without rebuilding the app.
  factory OwnerLookupConfiguration.resolve({
    String mode = 'disabled',
    String apiBase = '',
  }) {
    const disabled = OwnerLookupConfiguration._(null);
    if (mode != 'local-fixture') return disabled;

    final uri = Uri.tryParse(apiBase);
    // Keep OwnerLookupClient's base rules, with loopback required for HTTPS too.
    if (uri == null ||
        apiBase != apiBase.trim() ||
        !uri.isAbsolute ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        !const {'127.0.0.1', 'localhost', '::1', '[::1]'}.contains(uri.host) ||
        uri.userInfo.isNotEmpty ||
        apiBase.contains('@') ||
        uri.hasQuery ||
        uri.hasFragment ||
        uri.path != '/api/' ||
        // Uri normalizes escaped characters and dot segments during parsing.
        !RegExp(
          r'^https?://[^/]+/api/$',
          caseSensitive: false,
        ).hasMatch(apiBase) ||
        (uri.scheme != 'http' && uri.scheme != 'https') ||
        RegExp(r'[\s\\]').hasMatch(apiBase)) {
      return disabled;
    }
    return OwnerLookupConfiguration._(apiBase);
  }
}
