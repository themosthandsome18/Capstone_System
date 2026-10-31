import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_lookup_configuration.dart';

void main() {
  void expectDisabled(OwnerLookupConfiguration configuration) {
    expect(configuration.enabled, isFalse);
    expect(configuration.apiBase, isNull);
  }

  test('omitted configuration defaults to disabled with no fallback', () {
    expectDisabled(OwnerLookupConfiguration.resolve());
  });

  test('compile-time environment resolves with fail-closed defaults', () {
    const mode = String.fromEnvironment(
      'SANITATION_OWNER_LOOKUP_MODE',
      defaultValue: 'disabled',
    );
    const base = String.fromEnvironment('SANITATION_OWNER_API_BASE_URL');
    final expected = OwnerLookupConfiguration.resolve(
      mode: mode,
      apiBase: base,
    );
    final actual = OwnerLookupConfiguration.fromEnvironment();
    expect(actual.enabled, expected.enabled);
    expect(actual.apiBase, expected.apiBase);
  });

  for (final base in [
    '',
    'http://127.0.0.1:8765/api/',
    'https://example.invalid/api/',
    'malformed',
  ]) {
    test('disabled mode ignores supplied base [$base]', () {
      expectDisabled(
        OwnerLookupConfiguration.resolve(mode: 'disabled', apiBase: base),
      );
    });
  }

  for (final mode in [
    '',
    ' ',
    '\t',
    'production',
    'enabled',
    'unknown',
    'LOCAL-FIXTURE',
    'Local-fixture',
    'local-Fixture',
    ' local-fixture',
    'local-fixture ',
    'local-fixture\n',
    'Disabled',
    ' disabled',
    'disabled ',
  ]) {
    test('invalid mode [$mode] fails closed despite valid base', () {
      expectDisabled(
        OwnerLookupConfiguration.resolve(
          mode: mode,
          apiBase: 'http://127.0.0.1:8765/api/',
        ),
      );
    });
  }

  for (final scheme in ['http', 'https']) {
    for (final host in ['localhost', '127.0.0.1', '[::1]']) {
      for (final port in ['', ':8765']) {
        final base = '$scheme://$host$port/api/';
        test('explicit loopback base accepted: $base', () {
          final result = OwnerLookupConfiguration.resolve(
            mode: 'local-fixture',
            apiBase: base,
          );
          expect(result.enabled, isTrue);
          expect(result.apiBase, base);
        });
      }
    }
  }

  test('local-fixture without a base has no implicit production fallback', () {
    expectDisabled(OwnerLookupConfiguration.resolve(mode: 'local-fixture'));
  });

  for (final base in [
    'https://example.invalid/api/',
    'http://example.invalid/api/',
    'https://localhost.example.invalid/api/',
    'http://127.0.0.2/api/',
    'https://127.0.0.2/api/',
    'https://192.168.1.1/api/',
    'https://[::2]/api/',
    'http://[::ffff:127.0.0.1]/api/',
    '/api/',
    '//localhost/api/',
    'http:/localhost/api/',
    'http:///api/',
    'https:///api/',
    'http://localhost',
    'http://localhost/api',
    'http://localhost/API/',
    'http://localhost/api/extra/',
    'ftp://localhost/api/',
    'http://user:password@localhost/api/',
    'https://user@localhost/api/',
    'http://@localhost/api/',
    'http://localhost/api/?',
    'http://localhost/api/?key=value',
    'http://localhost/api/#',
    'http://localhost/api/#fragment',
    ' http://localhost/api/',
    'http://localhost/api/ ',
    'http://local host/api/',
    'http://localhost/api/\n',
    'http://localhost/\tapi/',
    r'http://localhost\api/',
    'http://localhost/%61pi/',
    'http://localhost/other/../api/',
    'http://localhost/./api/',
    'http://localhost:invalid/api/',
    'http://[::1/api/',
    'not a URL',
  ]) {
    test('external or malformed base fails closed: [$base]', () {
      expectDisabled(
        OwnerLookupConfiguration.resolve(mode: 'local-fixture', apiBase: base),
      );
    });
  }
}
