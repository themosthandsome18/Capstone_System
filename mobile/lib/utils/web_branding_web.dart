import 'dart:js_interop';

@JS('updateWebBranding')
external void _updateWebBranding(JSString moduleName);

@JS('getActiveWebBranding')
external JSString? _getActiveWebBranding();

void updateWebFaviconAndTitle(String moduleName) {
  try {
    _updateWebBranding(moduleName.toJS);
  } catch (_) {}
}

String? getActiveWebBranding() {
  try {
    return _getActiveWebBranding()?.toDart;
  } catch (_) {
    return null;
  }
}
