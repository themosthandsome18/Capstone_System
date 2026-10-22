import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'owner_lookup_client.dart';

/// Browser-only transport. Never import into the Android application library.
class OwnerLookupBrowserTransport implements OwnerLookupTransport {
  const OwnerLookupBrowserTransport();

  @override
  OwnerLookupOperation post(Uri endpoint, String jsonBody) =>
      _BrowserOperation(endpoint, jsonBody);
}

class _BrowserOperation implements OwnerLookupOperation {
  _BrowserOperation(Uri endpoint, String jsonBody) {
    response = _send(endpoint, jsonBody);
  }

  final _controller = web.AbortController();
  @override
  late final Future<OwnerLookupResponse> response;

  Future<OwnerLookupResponse> _send(Uri endpoint, String body) async {
    try {
      final response = await web.window
          .fetch(
            endpoint.toString().toJS,
            web.RequestInit(
              method: 'POST',
              headers: web.Headers(
                {
                      'Content-Type': 'application/json',
                      'Accept': 'application/json',
                    }.jsify()!
                    as JSObject,
              ),
              body: body.toJS,
              credentials: 'omit',
              cache: 'no-store',
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              signal: _controller.signal,
            ),
          )
          .toDart;
      final text = await response.text().toDart;
      return OwnerLookupResponse(response.status, text.toDart);
    } catch (_) {
      throw const OwnerLookupException(OwnerLookupFailure.connection);
    }
  }

  @override
  void abort() => _controller.abort();
}
