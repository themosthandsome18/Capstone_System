@TestOn('browser')
library;

import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'package:flutter_test/flutter_test.dart';
import 'package:web/web.dart' as web;
import 'package:mauban_mobile_app/sanitation_public/owner_lookup_browser_transport.dart';
import 'package:mauban_mobile_app/sanitation_public/owner_lookup_client.dart';

void main() {
  late JSAny? original;
  setUp(() => original = globalContext.getProperty<JSAny?>('fetch'.toJS));
  tearDown(() => globalContext.setProperty('fetch'.toJS, original));
  for (final origin in ['same', 'cross']) {
    test('$origin origin Fetch security settings', () async {
      web.RequestInit? captured;
      String? url;
      globalContext.setProperty(
        'fetch'.toJS,
        ((JSString input, web.RequestInit init) {
          captured = init;
          url = input.toDart;
          return Future.value(
            web.Response('{}'.toJS, web.ResponseInit(status: 200)),
          ).toJS;
        }).toJS,
      );
      final base = origin == 'same'
          ? web.window.location.origin
          : 'http://127.0.0.1:8765';
      final response = await const OwnerLookupBrowserTransport()
          .post(
            Uri.parse('$base/api/mobile/sanitation/establishment-status/'),
            '{"code":"SYNTHETIC"}',
          )
          .response;
      expect(response.status, 200);
      expect(url, '$base/api/mobile/sanitation/establishment-status/');
      expect(captured!.credentials, 'omit');
      expect(captured!.cache, 'no-store');
      expect(captured!.redirect, 'error');
      expect(captured!.referrerPolicy, 'no-referrer');
      expect(captured!.method, 'POST');
      final headers = web.Headers(captured!.headers);
      expect(headers.get('Authorization'), null);
      expect(headers.get('Cookie'), null);
      expect(headers.get('Content-Type'), 'application/json');
      expect(headers.get('Accept'), 'application/json');
      expect((captured!.body as JSString).toDart, '{"code":"SYNTHETIC"}');
    });
  }
  test('abort reaches pending fetch', () async {
    web.AbortSignal? signal;
    final pending = Completer<web.Response>();
    globalContext.setProperty(
      'fetch'.toJS,
      ((JSString input, web.RequestInit init) {
        signal = init.signal;
        signal!.addEventListener(
          'abort',
          ((web.Event _) {
            pending.completeError(StateError('PRIVATE'));
          }).toJS,
        );
        return pending.future.toJS;
      }).toJS,
    );
    final op = const OwnerLookupBrowserTransport().post(
      Uri.parse('http://127.0.0.1/api/'),
      '{}',
    );
    final assertion = expectLater(
      op.response,
      throwsA(isA<OwnerLookupException>()),
    );
    op.abort();
    await assertion;
    expect(signal!.aborted, true);
  });
  test('timeout signal remains active through body read', () async {
    web.AbortSignal? signal;
    final body = Completer<JSString>();
    final response = JSObject();
    response.setProperty('status'.toJS, 200.toJS);
    response.setProperty('text'.toJS, (() => body.future.toJS).toJS);
    globalContext.setProperty(
      'fetch'.toJS,
      ((JSString input, web.RequestInit init) {
        signal = init.signal;
        signal!.addEventListener(
          'abort',
          ((web.Event _) {
            body.completeError(StateError('PRIVATE'));
          }).toJS,
        );
        return Future.value(response as web.Response).toJS;
      }).toJS,
    );
    final client = OwnerLookupClient(
      apiBase: 'http://127.0.0.1/api/',
      transport: const OwnerLookupBrowserTransport(),
      timeout: const Duration(milliseconds: 20),
    );
    await expectLater(
      client.lookup('SYNTHETIC'),
      throwsA(isA<OwnerLookupException>()),
    );
    expect(signal!.aborted, true);
  });
}
