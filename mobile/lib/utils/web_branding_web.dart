import 'dart:js_interop';

@JS('updateWebBranding')
external void _updateWebBranding(JSString moduleName);

void updateWebFaviconAndTitle(String moduleName) {
  try {
    _updateWebBranding(moduleName.toJS);
  } catch (_) {}
}
