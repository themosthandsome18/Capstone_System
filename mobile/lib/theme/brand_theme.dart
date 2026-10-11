part of '../main.dart';

// The tourism theme colour, as the server sends it, and the palette derived
// from it.
//
// The derivation is a port of frontend/src/tourism/theme/deriveTourismTheme.js
// (same tables, same order of steps), so a colour gives the same palette on the
// web and here. test/tourism_theme_test.dart checks it against the output of
// that very file, run in Node (test/data/tourism_theme_golden.json).
//
// Nothing here changes how the app looks yet: it only reads and computes.

/// The mobile app's own brand green (AppColors.green). The fallback for
/// everything that is not a usable colour, so a bad or missing setting leaves
/// the app looking as it did.
const defaultBrandHex = '#28A84A';

/// The web's own default, used by [deriveTourismTheme] for an input that is
/// not a colour (the JS does the same). The app picks its colour with
/// [effectiveBrandHex] first, so it never reaches this.
const webDefaultPrimaryHex = '#2FA34A';

final _hexPattern = RegExp(r'^#[0-9A-Fa-f]{6}$');

/// `#RRGGBB`, the only form the server accepts and stores.
bool isHexColor(Object? value) => value is String && _hexPattern.hasMatch(value);

/// The `theme` object of the bootstrap. Every part may be missing.
class TourismTheme {
  const TourismTheme({
    this.primaryColor,
    this.followsWeb = true,
    this.mobilePrimaryColor,
  });

  /// No `theme` in the answer: nothing is set, so the web is followed and its
  /// colour is unknown (which resolves to the default).
  static const none = TourismTheme();

  /// The web colour (`primary_color`), if the server sent a string.
  final String? primaryColor;

  /// `mobile_follows_web`. Only a real `false` turns it off, as on the web
  /// (Settings.js: `mobile_follows_web !== false`): missing, null or anything
  /// that is not a bool means "follow".
  final bool followsWeb;

  /// `mobile_primary_color`, if the server sent a string. Blank is "".
  final String? mobilePrimaryColor;

  @override
  bool operator ==(Object other) =>
      other is TourismTheme &&
      other.primaryColor == primaryColor &&
      other.followsWeb == followsWeb &&
      other.mobilePrimaryColor == mobilePrimaryColor;

  @override
  int get hashCode => Object.hash(primaryColor, followsWeb, mobilePrimaryColor);

  factory TourismTheme.fromJson(Object? json) {
    if (json is! Map) return none;
    final primary = json['primary_color'];
    final mobile = json['mobile_primary_color'];
    return TourismTheme(
      primaryColor: primary is String ? primary : null,
      followsWeb: json['mobile_follows_web'] != false,
      mobilePrimaryColor: mobile is String ? mobile : null,
    );
  }
}

/// The colour the app uses, as `#RRGGBB` upper-case.
///
///   follows the web  ->  the web colour, if it is a colour
///   own colour       ->  the mobile colour, if it is a colour
///   anything else    ->  [defaultBrandHex]
///
/// Never the web colour when the app has its own colour set but unusable: a
/// half-saved setting must not change what the app looks like.
String effectiveBrandHex(TourismTheme? theme) {
  final t = theme ?? TourismTheme.none;
  final chosen = t.followsWeb ? t.primaryColor : t.mobilePrimaryColor;
  return isHexColor(chosen) ? chosen!.toUpperCase() : defaultBrandHex;
}

// ---- colour maths (the JS functions of the same names) ---------------------

const List<double> _greenHsl = [133.96552, 0.55238, 0.41176];
const double _aa = 4.5;

/// White text on the primary fill is kept unless it falls below this.
const double contrastWhiteFloor = 2.5;

double _clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

List<int> hexToRgb(String hex) => [
  for (final i in [1, 3, 5]) int.parse(hex.substring(i, i + 2), radix: 16),
];

String rgbToHex(List<double> rgb) {
  final parts = rgb.map((v) {
    final n = (v < 0 ? 0 : (v > 255 ? 255 : v)).round();
    return n.toRadixString(16).padLeft(2, '0');
  });
  return '#${parts.join().toUpperCase()}';
}

List<double> rgbToHsl(List<int> rgb) {
  final r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  final mx = [r, g, b].reduce((a, c) => a > c ? a : c);
  final mn = [r, g, b].reduce((a, c) => a < c ? a : c);
  final l = (mx + mn) / 2;
  if (mx == mn) return [0, 0, l];
  final d = mx - mn;
  final s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  double h;
  if (mx == r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (mx == g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

List<double> hslToRgb(double h, double s, double l) {
  final hue = ((h % 360) + 360) % 360;
  final c = (1 - (2 * l - 1).abs()) * s;
  final x = c * (1 - (((hue / 60) % 2) - 1).abs());
  final m = l - c / 2;
  List<double> rgb;
  if (hue < 60) {
    rgb = [c, x, 0];
  } else if (hue < 120) {
    rgb = [x, c, 0];
  } else if (hue < 180) {
    rgb = [0, c, x];
  } else if (hue < 240) {
    rgb = [0, x, c];
  } else if (hue < 300) {
    rgb = [x, 0, c];
  } else {
    rgb = [c, 0, x];
  }
  return rgb.map((v) => (v + m) * 255).toList();
}

double _channelToLinear(int v) {
  final c = v / 255;
  return c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
}

double relativeLuminance(String hex) {
  final rgb = hexToRgb(hex).map(_channelToLinear).toList();
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

double contrastRatio(String a, String b) {
  final la = relativeLuminance(a), lb = relativeLuminance(b);
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

// [hue offset, saturation, lightness] measured from the web's :root against
// #2FA34A. Lightness is absolute, so pale surfaces stay pale.
const Map<String, List<double>> _absoluteRules = {
  '--th-primary-deep': [0, 0.6875, 0.251],
  '--th-primary-ink': [8.819, 0.6423, 0.2412],
  '--th-primary-ink-strong': [6.489, 0.5946, 0.1451],
  '--th-primary-selected': [0, 0.8039, 0.9],
  '--th-primary-tint': [4.496, 0.7647, 0.9667],
  '--th-primary-tint-strong': [-3.966, 0.3913, 0.9098],
  '--th-primary-border': [7.034, 0.7895, 0.851],
  '--th-page-grad-1': [0, 0.4483, 0.9431],
  '--th-page-grad-2': [0, 0.3929, 0.8902],
  '--th-page-grad-3': [0, 0.2842, 0.8137],
  '--th-surface-tinted': [1.034, 0.5455, 0.9569],
  '--th-surface-tinted-strong': [0, 0.2667, 0.8235],
  '--th-border-tinted': [0, 0.3333, 0.8824],
  '--th-border-tinted-strong': [8.534, 0.1429, 0.7804],
  '--th-border-tinted-control': [0, 0.2857, 0.7804],
  '--th-text-tinted-strong': [0, 0.2, 0.0784],
  '--th-text-tinted': [0, 0.1057, 0.2412],
  '--th-text-tinted-muted': [0, 0.0642, 0.4275],
};

// [hue offset, saturation, lightness DELTA]: darker states of the base itself.
final Map<String, List<double>> _relativeRules = {
  '--th-primary-hover': [8.464, 0.7181, 0.2922 - _greenHsl[2]],
  '--th-primary-active': [0.409, 0.6076, 0.3098 - _greenHsl[2]],
};

const Map<String, List<double>> _chartRules = {
  '--th-chart-1': [0, 0.62, 0.4],
  '--th-chart-2': [4, 0.58, 0.5],
  '--th-chart-3': [-3, 0.55, 0.61],
  '--th-chart-4': [6, 0.5, 0.71],
  '--th-chart-5': [2, 0.45, 0.81],
};
const double _chartSaturationCap = 0.78;

const List<double> _shadowRule = [0, 0.3585, 0.2078];
const List<double> _chartWashRule = [0, 0.4057, 0.5843, 0.15];
const Map<String, double> _alphas = {
  '--th-primary-alpha-10': 0.1,
  '--th-primary-alpha-20': 0.2,
  '--th-primary-alpha-30': 0.3,
};

String _fromRule(
  List<double> baseHsl,
  List<double> rule, {
  bool relative = false,
  double saturationCap = 1,
}) {
  final ratio = _greenHsl[1] != 0 ? baseHsl[1] / _greenHsl[1] : 0.0;
  final saturation = math.min(_clamp01(rule[1] * ratio), saturationCap);
  final lightness = _clamp01(relative ? baseHsl[2] + rule[2] : rule[2]);
  return rgbToHex(hslToRgb(baseHsl[0] + rule[0], saturation, lightness));
}

// Darken a colour (same hue and saturation) until it reaches AA against
// `against`. Never changes a colour that already passes.
String _darkenToContrast(String hex, String against, [double target = _aa]) {
  if (contrastRatio(hex, against) >= target) return hex;
  final hsl = rgbToHsl(hexToRgb(hex));
  for (var next = hsl[2] - 0.01; next >= 0; next -= 0.01) {
    final candidate = rgbToHex(hslToRgb(hsl[0], hsl[1], next));
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return '#000000';
}

/// Text colour for content on the primary fill: white, unless white falls
/// below [contrastWhiteFloor] against it; then a dark ink of the same hue.
String deriveContrastColor(String primaryHex, String inkStrongHex) {
  if (contrastRatio('#FFFFFF', primaryHex) >= contrastWhiteFloor) {
    return '#FFFFFF';
  }
  return _darkenToContrast(inkStrongHex, primaryHex);
}

String _rgbaString(String hex, double alpha) {
  final c = hexToRgb(hex);
  return 'rgba(${c[0]}, ${c[1]}, ${c[2]}, ${_jsNumber(alpha)})';
}

/// A number as JavaScript prints it (0.1, not 0.10; 1, not 1.0).
String _jsNumber(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toString();

/// Every derived `--th-*` token for [primaryColor], the same map as the web's
/// `deriveTourismTheme`. A value that is not `#RRGGBB` falls back to the web's
/// own green, as the JS does.
Map<String, String> deriveTourismTheme(String? primaryColor) {
  final base = isHexColor(primaryColor)
      ? primaryColor!.toUpperCase()
      : webDefaultPrimaryHex;
  final baseHsl = rgbToHsl(hexToRgb(base));
  final vars = <String, String>{'--th-primary': base};

  _absoluteRules.forEach((name, rule) {
    vars[name] = _fromRule(baseHsl, rule);
  });
  _relativeRules.forEach((name, rule) {
    vars[name] = _fromRule(baseHsl, rule, relative: true);
  });
  _chartRules.forEach((name, rule) {
    vars[name] = _fromRule(baseHsl, rule, saturationCap: _chartSaturationCap);
  });

  // Readability floors (no effect on green, which already passes them).
  vars['--th-primary-deep'] = _darkenToContrast(
    vars['--th-primary-deep']!,
    '#FFFFFF',
  );
  vars['--th-primary-ink'] = _darkenToContrast(
    vars['--th-primary-ink']!,
    vars['--th-primary-tint-strong']!,
  );
  vars['--th-primary-ink-strong'] = _darkenToContrast(
    vars['--th-primary-ink-strong']!,
    vars['--th-primary-tint']!,
  );
  vars['--th-text-tinted'] = _darkenToContrast(
    vars['--th-text-tinted']!,
    vars['--th-surface-tinted']!,
  );
  vars['--th-text-tinted-muted'] = _darkenToContrast(
    vars['--th-text-tinted-muted']!,
    vars['--th-surface-tinted']!,
  );

  _alphas.forEach((name, alpha) {
    vars[name] = _rgbaString(base, alpha);
  });

  final shadow = hexToRgb(_fromRule(baseHsl, _shadowRule));
  vars['--th-shadow-rgb'] = shadow.join(', ');

  final wash = _fromRule(baseHsl, _chartWashRule);
  vars['--th-chart-wash'] = _rgbaString(wash, _chartWashRule[3]);

  vars['--th-primary-contrast'] = deriveContrastColor(
    base,
    vars['--th-primary-ink-strong']!,
  );
  return vars;
}

// ---- the colours as the app uses them --------------------------------------

/// `#RRGGBB` as a [Color].
Color colorFromHex(String hex) {
  final rgb = hexToRgb(hex);
  return Color.fromARGB(0xFF, rgb[0], rgb[1], rgb[2]);
}

/// The brand colours the tourism screens will read from the theme.
///
/// [original] is the palette the app has always had, with its literals, so
/// the app looks the same when nothing is set. [BrandColors.fromBase] derives
/// the same roles from another colour with the web's own rules. Where a role
/// has no web token of the same name, the nearest one is used (noted below).
///
/// Only the tourism MaterialApp carries it. The sanitation app does not, so
/// `context.brand` is [original] there and a colour chosen for tourism never
/// reaches it.
@immutable
class BrandColors extends ThemeExtension<BrandColors> {
  const BrandColors({
    required this.primary,
    required this.deep,
    required this.dark,
    required this.ink,
    required this.tintStrong,
    required this.tint,
    required this.light,
    required this.border,
    required this.onPrimary,
  });

  /// The brand colour (AppColors.green).
  final Color primary;

  /// Dark fills that carry white text (AppColors.deepGreen).
  final Color deep;

  /// The darker header and button fill (0xFF14532D).
  final Color dark;

  /// Text and icons on a tint (0xFF166534).
  final Color ink;

  /// Strong tinted surface (0xFFD1E7DD).
  final Color tintStrong;

  /// Tinted surface (0xFFDCFCE7).
  final Color tint;

  /// The palest brand surface (0xFFE8F5E9).
  final Color light;

  /// Brand-tinted border (0xFFBBF7D0).
  final Color border;

  /// Text on a [primary] fill.
  final Color onPrimary;

  /// The palette the app has always had. Exactly its literals.
  static const original = BrandColors(
    primary: Color(0xff28a84a),
    deep: Color(0xff0c6b3f),
    dark: Color(0xff14532d),
    ink: Color(0xff166534),
    tintStrong: Color(0xffd1e7dd),
    tint: Color(0xffdcfce7),
    light: Color(0xffe8f5e9),
    border: Color(0xffbbf7d0),
    onPrimary: Color(0xffffffff),
  );

  /// The palette for [hex] (a usable `#RRGGBB`; anything else is the default).
  /// The default colour returns [original] itself, with no derived value, so
  /// choosing the app's own green changes nothing.
  factory BrandColors.fromBase(String hex) {
    final base = isHexColor(hex) ? hex.toUpperCase() : defaultBrandHex;
    if (base == defaultBrandHex) return original;
    final t = deriveTourismTheme(base);
    Color token(String name) => colorFromHex(t[name]!);
    return BrandColors(
      primary: token('--th-primary'),
      deep: token('--th-primary-deep'),
      dark: token('--th-primary-deep'),
      ink: token('--th-primary-ink'),
      tintStrong: token('--th-primary-tint-strong'),
      tint: token('--th-primary-selected'),
      light: token('--th-surface-tinted'),
      border: token('--th-primary-border'),
      onPrimary: token('--th-primary-contrast'),
    );
  }

  @override
  BrandColors copyWith({
    Color? primary,
    Color? deep,
    Color? dark,
    Color? ink,
    Color? tintStrong,
    Color? tint,
    Color? light,
    Color? border,
    Color? onPrimary,
  }) {
    return BrandColors(
      primary: primary ?? this.primary,
      deep: deep ?? this.deep,
      dark: dark ?? this.dark,
      ink: ink ?? this.ink,
      tintStrong: tintStrong ?? this.tintStrong,
      tint: tint ?? this.tint,
      light: light ?? this.light,
      border: border ?? this.border,
      onPrimary: onPrimary ?? this.onPrimary,
    );
  }

  @override
  BrandColors lerp(ThemeExtension<BrandColors>? other, double t) {
    if (other is! BrandColors) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return BrandColors(
      primary: mix(primary, other.primary),
      deep: mix(deep, other.deep),
      dark: mix(dark, other.dark),
      ink: mix(ink, other.ink),
      tintStrong: mix(tintStrong, other.tintStrong),
      tint: mix(tint, other.tint),
      light: mix(light, other.light),
      border: mix(border, other.border),
      onPrimary: mix(onPrimary, other.onPrimary),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is BrandColors &&
      other.primary == primary &&
      other.deep == deep &&
      other.dark == dark &&
      other.ink == ink &&
      other.tintStrong == tintStrong &&
      other.tint == tint &&
      other.light == light &&
      other.border == border &&
      other.onPrimary == onPrimary;

  @override
  int get hashCode => Object.hash(
    primary,
    deep,
    dark,
    ink,
    tintStrong,
    tint,
    light,
    border,
    onPrimary,
  );
}

extension BrandColorsContext on BuildContext {
  /// The brand colours of the app this widget is in: the tourism theme's, or
  /// [BrandColors.original] where none is set (the sanitation app, a test).
  BrandColors get brand =>
      Theme.of(this).extension<BrandColors>() ?? BrandColors.original;
}

/// The app's ThemeData. The one place that decides what a module's theme is,
/// so the tests build exactly what the app builds.
///
/// Sanitation: its own seed and no [BrandColors]. Tourism: the seed is the
/// colour in use (the same `ColorScheme.fromSeed` as before, so the tonal look
/// of the Material widgets is only what the seed implies) and the extension.
ThemeData buildAppTheme({
  required bool isSanitation,
  required TourismTheme theme,
  TextTheme? textTheme,
}) {
  final hex = effectiveBrandHex(theme);
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: isSanitation ? AppColors.deepGreen : colorFromHex(hex),
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: AppColors.canvas,
    textTheme: textTheme,
    useMaterial3: true,
    extensions: <ThemeExtension<dynamic>>[
      if (!isSanitation) BrandColors.fromBase(hex),
    ],
  );
}

/// Carries the colour setting down from the app to whatever learns it (the
/// bootstrap), so the MaterialApp can follow it.
class TourismThemeScope extends InheritedNotifier<ValueNotifier<TourismTheme>> {
  const TourismThemeScope({
    super.key,
    required ValueNotifier<TourismTheme> notifier,
    required super.child,
  }) : super(notifier: notifier);

  /// Null where there is no app above (a test that builds a page alone).
  static ValueNotifier<TourismTheme>? maybeOf(BuildContext context) => context
      .getInheritedWidgetOfExactType<TourismThemeScope>()
      ?.notifier;
}

/// The theme saved with the last bootstrap, or none. Read before the first
/// frame, so the app is not painted in one colour and then another.
Future<TourismTheme> readSavedTourismTheme({
  TourismBootstrapCache cache = const TourismBootstrapCache(),
}) async {
  final saved = await cache.read();
  return saved?.bootstrap.theme ?? TourismTheme.none;
}

/// What `main()` runs for tourism.
Future<Widget> createTourismApp({
  TourismBootstrapCache cache = const TourismBootstrapCache(),
}) async {
  return MaubanMobileApp(
    initialTheme: await readSavedTourismTheme(cache: cache),
    cache: cache,
  );
}
