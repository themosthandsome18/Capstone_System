import 'package:flutter/material.dart';

import 'main.dart';
import 'utils/web_branding.dart';

void main() {
  setWebBranding(WebBrandingModule.sanitation);
  runApp(const SanitationStandaloneApp());
}
