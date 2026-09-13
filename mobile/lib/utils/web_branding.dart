import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'web_branding_stub.dart'
    if (dart.library.js_interop) 'web_branding_web.dart'
    as platform;

enum WebBrandingModule { tourism, sanitation }

WebBrandingModule? _currentBrandingModule;

WebBrandingModule? get currentBrandingModule => _currentBrandingModule;

bool isSanitationBrandingActive() =>
    _currentBrandingModule == WebBrandingModule.sanitation;

String? getActiveWebBrandingModule() {
  if (kIsWeb) {
    return platform.getActiveWebBranding();
  }
  return null;
}

void setWebBranding(WebBrandingModule module) {
  _currentBrandingModule = module;
  final isSanitation = module == WebBrandingModule.sanitation;
  final title = isSanitation
      ? 'Mauban Sanitation & Health Portal'
      : 'Mauban Tourism & Travel Pass';
  final primaryColor = isSanitation ? 0xFF07613B : 0xFF147A50;

  SystemChrome.setApplicationSwitcherDescription(
    ApplicationSwitcherDescription(label: title, primaryColor: primaryColor),
  );

  if (kIsWeb) {
    platform.updateWebFaviconAndTitle(isSanitation ? 'sanitation' : 'tourism');
  }
}
