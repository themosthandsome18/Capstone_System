// Step 2 of the theme: the colour setting is attached to the tourism
// MaterialApp (the seed and the BrandColors extension), and the saved copy is
// read before the first frame. The sanitation app must not get any of it.
//
// Colours are compared as values (a theme's scheme, a widget's colour
// property); no pixel is counted.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const green = Color(0xff28a84a);
const orange = Color(0xffef7c1f);

TourismTheme own(String mobile, {String web = '#EF7C1F'}) => TourismTheme(
  primaryColor: web,
  followsWeb: false,
  mobilePrimaryColor: mobile,
);

const followsOrange = TourismTheme(primaryColor: '#EF7C1F');

String rawWithTheme(Map<String, Object?> theme) => jsonEncode({
  'destinations': <dynamic>[],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
  'theme': theme,
});

/// Answers the bootstrap with [raw] once [gate] is opened (at once when there
/// is no gate), or never when [raw] is null.
class ThemeApi extends TourismApi {
  ThemeApi(this.raw, {this.gate});
  final String? raw;
  final Completer<void>? gate;

  @override
  Future<String> fetchBootstrapRaw() async {
    if (raw == null) return Completer<String>().future;
    if (gate != null) await gate!.future;
    return raw!;
  }
}

ThemeData appTheme(WidgetTester tester) =>
    tester.widget<MaterialApp>(find.byType(MaterialApp)).theme!;

Future<void> pumpApp(
  WidgetTester tester, {
  TourismTheme initial = TourismTheme.none,
  String? answer,
  Completer<void>? gate,
  TourismBootstrapCache cache = const TourismBootstrapCache(),
}) async {
  tester.view.physicalSize = const Size(411, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);

  await tester.pumpWidget(
    MaubanMobileApp(
      initialTheme: initial,
      api: ThemeApi(answer, gate: gate),
      cache: cache,
    ),
  );
  await tester.pump();
}

Future<void> toHome(WidgetTester tester) async {
  await tester.tap(find.text('Skip'));
  await tester.pump();
  await tester.tap(find.text("I'm a Tourist / Visitor"));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1500));
  await tester.pump();
}

/// The colours a widget tree states explicitly (an icon, a text, a box, a
/// card), in order, as text, so two renders can be compared exactly.
List<String> explicitColors(WidgetTester tester) {
  final out = <String>[];
  void add(String kind, Color? color) {
    if (color != null) {
      out.add('$kind:${color.toARGB32().toRadixString(16)}');
    }
  }

  void visit(Element element) {
    final w = element.widget;
    if (w is Icon) add('icon', w.color);
    if (w is Text) add('text', w.style?.color);
    if (w is DecoratedBox) {
      final d = w.decoration;
      if (d is BoxDecoration) {
        add('box', d.color);
        final b = d.border;
        if (b is Border) add('border', b.top.color);
      }
    }
    if (w is Card) add('card', w.color);
    if (w is Material) add('material', w.color);
    element.visitChildren(visit);
  }

  tester.binding.rootElement!.visitChildren(visit);
  return out;
}

Map<String, Widget Function()> sharedWidgets() => {
  'EmptyState': () => const EmptyState(icon: Icons.search, title: 'Nothing'),
  'SectionHeader': () => SectionHeader(title: 'Title', action: 'Go', onTap: () {}),
  'StatusPill': () => const StatusPill(text: 'Good standing'),
  'DataSourceBanner': () => const DataSourceBanner(
    icon: Icons.cloud_done_outlined,
    title: 'Source',
    text: 'Live data',
  ),
  'DataSourceBanner warning': () => const DataSourceBanner(
    icon: Icons.warning_amber_outlined,
    title: 'Source',
    text: 'Offline',
    warning: true,
  ),
  'SubmitButton': () => SubmitButton(label: 'Send', loading: false, onPressed: () {}),
  'ProfileLink': () => ProfileLink(icon: Icons.person_outline, label: 'Me', onTap: () {}),
  'PickerTile': () => PickerTile(
    icon: Icons.calendar_month_outlined,
    label: 'Date',
    value: 'Today',
    onTap: () {},
  ),
  'SearchBox': () => const SearchBox(hint: 'Search'),
  'ReceiptCard': () => const ReceiptCard(
    icon: Icons.receipt_long_outlined,
    title: 'Receipt',
    reference: 'REF-1',
    lines: ['one', 'two'],
  ),
  'FormPageScaffold': () => FormPageScaffold(
    title: 'Form',
    subtitle: 'Sub',
    children: const [Text('field')],
  ),
};

Future<(List<String>, ColorScheme)> renderUnder(
  WidgetTester tester,
  ThemeData theme,
  Widget child,
) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      // A page is its own Scaffold; the rest are put on one.
      home: child is FormPageScaffold
          ? child
          : Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
  await tester.pump();
  final scheme = Theme.of(tester.element(find.byType(Scaffold).first)).colorScheme;
  return (explicitColors(tester), scheme);
}

/// The theme the sanitation app has always had (SanitationStandaloneApp).
ThemeData oldSanitationTheme() => ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.deepGreen,
    brightness: Brightness.light,
  ),
  scaffoldBackgroundColor: AppColors.canvas,
  useMaterial3: true,
);

/// The theme the tourism app had before this change.
ThemeData oldTourismTheme() => ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.green,
    brightness: Brightness.light,
  ),
  scaffoldBackgroundColor: AppColors.canvas,
  useMaterial3: true,
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('green in the app although the web is orange', () {
    testWidgets('BrandColors and the Material scheme are the app green', (
      tester,
    ) async {
      await pumpApp(tester, initial: own('#28A84A'));

      final theme = appTheme(tester);
      expect(theme.extension<BrandColors>()!.primary, green);
      expect(theme.colorScheme, ColorScheme.fromSeed(seedColor: green));
    });

    testWidgets('the NavigationBar and the Home chips read green', (
      tester,
    ) async {
      await pumpApp(tester, initial: own('#28A84A'));
      await toHome(tester);

      final nav = tester.element(find.byType(NavigationBar));
      final scheme = ColorScheme.fromSeed(seedColor: green);
      expect(Theme.of(nav).extension<BrandColors>()!.primary, green);
      expect(nav.brand.primary, green);
      // The bar takes its colours from the scheme made from the seed.
      expect(Theme.of(nav).colorScheme.primary, scheme.primary);
      expect(Theme.of(nav).colorScheme.secondaryContainer, scheme.secondaryContainer);
      expect(Theme.of(nav).colorScheme.surface, scheme.surface);
    });
  });

  group('following the web: orange', () {
    testWidgets('BrandColors and the scheme are made from orange', (
      tester,
    ) async {
      await pumpApp(tester, initial: followsOrange);

      final theme = appTheme(tester);
      expect(theme.extension<BrandColors>()!.primary, orange);
      expect(theme.colorScheme, ColorScheme.fromSeed(seedColor: orange));
      expect(theme.colorScheme, isNot(ColorScheme.fromSeed(seedColor: green)));
    });

    testWidgets('the NavigationBar reads orange', (tester) async {
      await pumpApp(tester, initial: followsOrange);
      await toHome(tester);

      final nav = tester.element(find.byType(NavigationBar));
      final scheme = ColorScheme.fromSeed(seedColor: orange);
      expect(nav.brand.primary, orange);
      expect(Theme.of(nav).colorScheme.secondaryContainer, scheme.secondaryContainer);
    });

    test('the Material scheme is the seed\'s own, not primary replaced', () {
      // The tonal look of the Material widgets is what the seed implies; the
      // exact brand colour is carried by BrandColors only.
      final theme = buildAppTheme(isSanitation: false, theme: followsOrange);
      expect(theme.colorScheme, ColorScheme.fromSeed(seedColor: orange));
      expect(theme.colorScheme.primary, isNot(orange));
      expect(theme.extension<BrandColors>()!.primary, orange);
    });
  });

  group('nothing set: the app as it was', () {
    test('no theme: the green, the original palette, the same scheme', () {
      final theme = buildAppTheme(isSanitation: false, theme: TourismTheme.none);

      expect(theme.colorScheme, oldTourismTheme().colorScheme);
      expect(theme.extension<BrandColors>(), BrandColors.original);
    });

    test('#28A84A is the original palette itself, nothing derived', () {
      expect(identical(BrandColors.fromBase('#28A84A'), BrandColors.original), isTrue);
      expect(identical(BrandColors.fromBase('#28a84a'), BrandColors.original), isTrue);
      expect(BrandColors.fromBase('#28A84A'), BrandColors.original);
      // An unusable value is the default too.
      expect(identical(BrandColors.fromBase('nope'), BrandColors.original), isTrue);
      expect(BrandColors.original.primary, AppColors.green);
      expect(BrandColors.original.deep, AppColors.deepGreen);
    });

    test('any other colour is derived, with the web\'s tokens', () {
      final orangeColors = BrandColors.fromBase('#EF7C1F');
      final tokens = deriveTourismTheme('#EF7C1F');

      expect(orangeColors, isNot(BrandColors.original));
      expect(orangeColors.primary, colorFromHex(tokens['--th-primary']!));
      expect(orangeColors.ink, colorFromHex(tokens['--th-primary-ink']!));
      expect(orangeColors.border, colorFromHex(tokens['--th-primary-border']!));
      expect(orangeColors.onPrimary, colorFromHex(tokens['--th-primary-contrast']!));
    });

    test('lerp and copyWith', () {
      const a = BrandColors.original;
      final b = BrandColors.fromBase('#EF7C1F');
      expect(a.lerp(b, 0), a);
      expect(a.lerp(b, 1), b);
      expect(a.copyWith(primary: orange).primary, orange);
      expect(a.copyWith(primary: orange).deep, a.deep);
    });
  });

  group('the saved copy, before the first frame', () {
    Future<void> save(WidgetTester tester, Map<String, Object?> theme) async {
      await const TourismBootstrapCache().write(rawWithTheme(theme));
    }

    testWidgets('a saved own colour is there on the first frame, no network', (
      tester,
    ) async {
      await save(tester, {
        'primary_color': '#EF7C1F',
        'mobile_follows_web': false,
        'mobile_primary_color': '#28A84A',
      });

      final app = await createTourismApp();
      await tester.pumpWidget(app); // a single frame
      expect(appTheme(tester).extension<BrandColors>()!.primary, green);
    });

    testWidgets('a saved followed colour is orange on the first frame', (
      tester,
    ) async {
      await save(tester, {'primary_color': '#EF7C1F', 'mobile_follows_web': true});

      await tester.pumpWidget(await createTourismApp());

      expect(appTheme(tester).extension<BrandColors>()!.primary, orange);
    });

    testWidgets('nothing saved: the green', (tester) async {
      await tester.pumpWidget(await createTourismApp());

      expect(appTheme(tester).extension<BrandColors>(), BrandColors.original);
    });

    testWidgets('a copy that cannot be read: the green, no crash', (tester) async {
      SharedPreferences.setMockInitialValues({
        tourismBootstrapCacheKey: 'not json',
        tourismBootstrapSavedAtKey: DateTime.now().millisecondsSinceEpoch,
      });

      await tester.pumpWidget(await createTourismApp());

      expect(appTheme(tester).extension<BrandColors>(), BrandColors.original);
    });

    test('readSavedTourismTheme: the saved setting, or none', () async {
      expect(await readSavedTourismTheme(), TourismTheme.none);
      await const TourismBootstrapCache().write(
        rawWithTheme({'primary_color': '#236BFB', 'mobile_follows_web': true}),
      );
      final theme = await readSavedTourismTheme();
      expect(theme.primaryColor, '#236BFB');
      expect(effectiveBrandHex(theme), '#236BFB');
    });
  });

  group('the answer changes the colour', () {
    testWidgets('a fresh answer replaces the one the app started with', (
      tester,
    ) async {
      await pumpApp(
        tester,
        initial: TourismTheme.none,
        answer: rawWithTheme({'primary_color': '#EF7C1F', 'mobile_follows_web': true}),
      );
      await tester.pump();
      await tester.pump();

      expect(appTheme(tester).extension<BrandColors>()!.primary, orange);
    });

    testWidgets('the web changed to green: the app follows on the next answer', (
      tester,
    ) async {
      final gate = Completer<void>();
      await pumpApp(
        tester,
        initial: followsOrange,
        gate: gate,
        answer: rawWithTheme({
          'primary_color': '#EF7C1F',
          'mobile_follows_web': false,
          'mobile_primary_color': '#28A84A',
        }),
      );
      expect(appTheme(tester).extension<BrandColors>()!.primary, orange);

      gate.complete();
      await tester.pump();
      await tester.pump();

      expect(appTheme(tester).extension<BrandColors>()!.primary, green);
    });

    testWidgets('the saved copy shown at once sets the colour, before any answer', (
      tester,
    ) async {
      // The app was started without a colour (none) but a saved copy exists:
      // showing it must also set the colour, not wait for the network.
      await const TourismBootstrapCache().write(
        rawWithTheme({'primary_color': '#EF7C1F', 'mobile_follows_web': true}),
      );
      await pumpApp(tester, initial: TourismTheme.none, answer: null);
      await tester.pump();
      await tester.pump();

      // The answer never came: this colour is the saved copy's.
      expect(appTheme(tester).extension<BrandColors>()!.primary, orange);
    });

    testWidgets('no answer yet: the colour it started with stays', (tester) async {
      await pumpApp(tester, initial: followsOrange, answer: null);
      await tester.pump(const Duration(seconds: 1));

      expect(appTheme(tester).extension<BrandColors>()!.primary, orange);
    });
  });

  group('the sanitation boundary', () {
    final orangeTourism = buildAppTheme(isSanitation: false, theme: followsOrange);
    final sanitation = buildAppTheme(isSanitation: true, theme: followsOrange);

    test('sanitation gets no BrandColors, and its own scheme', () {
      expect(sanitation.extension<BrandColors>(), isNull);
      expect(sanitation.colorScheme, oldSanitationTheme().colorScheme);
      expect(sanitation.scaffoldBackgroundColor, AppColors.canvas);
    });

    test('a chosen tourism colour does not reach it, whatever it is', () {
      for (final colour in ['#EF7C1F', '#236BFB', '#CB0606', '#FFF200']) {
        final t = buildAppTheme(
          isSanitation: true,
          theme: TourismTheme(primaryColor: colour),
        );
        expect(t.extension<BrandColors>(), isNull, reason: colour);
        expect(t.colorScheme, oldSanitationTheme().colorScheme, reason: colour);
      }
    });

    test('AppColors is unchanged, and still const', () {
      expect(AppColors.green, const Color(0xff28a84a));
      expect(AppColors.deepGreen, const Color(0xff0c6b3f));
      expect(AppColors.canvas, const Color(0xfff2f7f4));
      expect(AppColors.ink, const Color(0xff111827));
      expect(AppColors.muted, const Color(0xff6b7280));
      expect(AppColors.border, const Color(0xffd8e1dc));
      expect(AppColors.red, const Color(0xffd32f2f));
      expect(AppColors.amber, const Color(0xffd59b00));
    });

    // The shared widgets that state a brand colour (moved in Step 3).
    const movedToBrand = {'DataSourceBanner', 'DataSourceBanner warning', 'PickerTile', 'ReceiptCard'};

    for (final entry in sharedWidgets().entries) {
      testWidgets('${entry.key}: the same in sanitation as it always was', (
        tester,
      ) async {
        final before = await renderUnder(tester, oldSanitationTheme(), entry.value());
        final after = await renderUnder(tester, sanitation, entry.value());

        expect(after.$1, before.$1, reason: 'explicit colours');
        expect(after.$2, before.$2, reason: 'scheme');
        expect(
          tester.element(find.byType(Scaffold).first).brand,
          BrandColors.original,
        );
      });

      testWidgets('${entry.key}: in tourism, only the theme can differ', (
        tester,
      ) async {
        final green = await renderUnder(tester, oldTourismTheme(), entry.value());
        final orangeRender = await renderUnder(tester, orangeTourism, entry.value());

        // What the Material scheme gives them (a Material's colour, a hint's
        // text colour) moves; what the widgets state themselves is compared.
        List<String> stated(List<String> colors) => colors
            .where((c) => !c.startsWith('material:') && !c.startsWith('text:'))
            .toList();
        if (!movedToBrand.contains(entry.key)) {
          // Not moved: they still state AppColors, the same in both.
          expect(stated(orangeRender.$1), stated(green.$1));
        } else {
          // Moved to context.brand: exactly the primary, the deep, the tint
          // and the border green become the orange's primary, deep, tint and
          // border (with the alpha each use has), and nothing else differs.
          final orangeBrand = BrandColors.fromBase('#EF7C1F');
          String rgb(Color c) =>
              (c.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0');
          final becomes = {
            rgb(BrandColors.original.primary): rgb(orangeBrand.primary),
            rgb(AppColors.deepGreen): rgb(orangeBrand.deep),
            rgb(BrandColors.original.tint): rgb(orangeBrand.tint),
            rgb(BrandColors.original.border): rgb(orangeBrand.border),
          };
          final expected = stated(green.$1).map((c) {
            // 'kind:aarrggbb' -> keep 'kind:aa', map the 6 colour digits.
            final cut = c.length - 6;
            final to = becomes[c.substring(cut)];
            return to == null ? c : '${c.substring(0, cut)}$to';
          }).toList();
          expect(stated(orangeRender.$1), expected);
          expect(
            expected,
            isNot(stated(green.$1)),
            reason: 'a moved widget must actually take the brand colour',
          );
        }
        expect(orangeRender.$2, isNot(green.$2));
        expect(
          tester.element(find.byType(Scaffold).first).brand,
          BrandColors.fromBase('#EF7C1F'),
        );
      });
    }
  });

  group('status colours do not follow the theme', () {
    test('tourist booking status chips are fixed', () {
      expect(touristStatusChip('arrived')!.foreground, const Color(0xFF166534));
      expect(touristStatusChip('arrived')!.background, const Color(0xFFDCFCE7));
      expect(touristStatusChip('pending')!.foreground, const Color(0xFF92400E));
      expect(touristStatusChip('pending')!.background, const Color(0xFFFEF3C7));
      expect(touristStatusChip('no_show')!.foreground, const Color(0xFF991B1B));
      expect(touristStatusChip('no_show')!.background, const Color(0xFFFEE2E2));
    });

    test('sanitation status colours are the app greens and ambers, fixed', () {
      expect(sanitationStatusColor('good_standing'), AppColors.green);
      expect(sanitationStatusColor('resolved'), AppColors.green);
      expect(sanitationStatusColor('pending'), const Color(0xffd59b00));
      expect(sanitationStatusColor('not_yet_inspected'), AppColors.muted);
    });

    test('they are the same whichever colour the app is', () {
      // These functions take no BuildContext: there is no theme to read.
      for (final theme in [TourismTheme.none, followsOrange, own('#CB0606')]) {
        buildAppTheme(isSanitation: false, theme: theme);
        expect(touristStatusChip('arrived')!.foreground, const Color(0xFF166534));
        expect(sanitationStatusColor('good_standing'), AppColors.green);
      }
    });
  });
}
