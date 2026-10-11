// Step 4 of the theme: the remaining brand literals read BrandColors.
//
//  - the literals that equal a role's `original` value must be what they were
//    on the app's own green (the table below, and the pages rendered green);
//  - STATUS and NEUTRAL colours do not move under another colour;
//  - the QR code modules never follow the theme (scan contrast is functional);
//  - the page background follows the theme.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

const followsOrange = TourismTheme(primaryColor: '#EF7C1F');

String hex(Color c) => c.toARGB32().toRadixString(16).padLeft(8, '0');

final greenTheme = buildAppTheme(isSanitation: false, theme: TourismTheme.none);
final orangeTheme = buildAppTheme(isSanitation: false, theme: followsOrange);
final orangeBrand = BrandColors.fromBase('#EF7C1F');

class _Api extends TourismApi {
  @override
  Future<String> fetchBootstrapRaw() => Completer<String>().future;
}

MobileVisitReceipt receipt() => MobileVisitReceipt(
  reference: 'REF-1',
  destination: Destination.fromJson({
    'resort_id': 1,
    'resort_name': 'Test Beach',
    'type': 'Beach Resort',
  }),
  arrivalDate: DateTime(2026, 10, 20),
  totalVisitors: 2,
  status: 'pending',
  fullName: 'Sample Visitor',
  contactNumber: '',
  email: '',
);

Future<void> show(WidgetTester tester, ThemeData theme, Widget page) async {
  tester.view.physicalSize = const Size(411, 1600);
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
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(MaterialApp(theme: theme, home: page));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

/// Every colour a tree states itself (icon, text, box, border, avatar, button).
Set<String> colours(WidgetTester tester) {
  final out = <String>{};
  void add(Color? c) {
    if (c != null) out.add(hex(c));
  }

  void visit(Element e) {
    final w = e.widget;
    if (w is Icon) add(w.color);
    if (w is Text) add(w.style?.color);
    if (w is DecoratedBox && w.decoration is BoxDecoration) {
      final d = w.decoration as BoxDecoration;
      add(d.color);
      final b = d.border;
      if (b is Border) {
        add(b.top.color);
        add(b.left.color);
      }
      for (final shadow in d.boxShadow ?? const <BoxShadow>[]) {
        add(shadow.color);
      }
      for (final c in d.gradient is LinearGradient
          ? (d.gradient as LinearGradient).colors
          : const <Color>[]) {
        add(c);
      }
    }
    if (w is CircleAvatar) add(w.backgroundColor);
    e.visitChildren(visit);
  }

  tester.binding.rootElement!.visitChildren(visit);
  return out;
}

/// The colours the QR codes in the tree are drawn in (eyes and data modules).
List<(Color?, Color?)> qrColours(WidgetTester tester) => [
  for (final e in find.byType(QrImageView).evaluate())
    (
      (e.widget as QrImageView).eyeStyle.color,
      (e.widget as QrImageView).dataModuleStyle.color,
    ),
];

/// The avatar background of the first CircleAvatar in the tree.
Color? avatarColour(WidgetTester tester) =>
    tester.widget<CircleAvatar>(find.byType(CircleAvatar).first).backgroundColor;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('a literal that equals a role is that role on the app green', () {
    // The literal each role stands in for; it must stay what it was.
    final exact = <String, (Color, Color)>{
      'dark 14532D': (BrandColors.original.dark, const Color(0xff14532d)),
      'ink 166534': (BrandColors.original.ink, const Color(0xff166534)),
      'tintStrong D1E7DD': (BrandColors.original.tintStrong, const Color(0xffd1e7dd)),
      'tint DCFCE7': (BrandColors.original.tint, const Color(0xffdcfce7)),
      'light E8F5E9': (BrandColors.original.light, const Color(0xffe8f5e9)),
      'border BBF7D0': (BrandColors.original.border, const Color(0xffbbf7d0)),
      'onDark 86EFAC': (BrandColors.original.onDark, const Color(0xff86efac)),
      'borderAlt BADBCC': (BrandColors.original.borderAlt, const Color(0xffbadbcc)),
      'emerald 10B981': (BrandColors.original.emerald, const Color(0xff10b981)),
    };
    for (final e in exact.entries) {
      test(e.key, () => expect(e.value.$1, e.value.$2));
    }

    testWidgets('the digital pass modal states the same literals on green', (
      tester,
    ) async {
      await show(tester, greenTheme, TouristDigitalPassModal(receipt: receipt()));

      final c = colours(tester);
      for (final literal in [
        const Color(0xffe8f5e9), // body (light)
        const Color(0xff14532d), // header band (dark)
        const Color(0xff86efac), // label on it (onDark)
      ]) {
        expect(c.contains(hex(literal)), isTrue, reason: hex(literal));
      }
    });
  });

  group('the QR code modules never follow the theme', () {
    testWidgets('the tourist pass modal', (tester) async {
      await show(tester, orangeTheme, TouristDigitalPassModal(receipt: receipt()));

      final qr = qrColours(tester);
      expect(qr, isNotEmpty);
      for (final c in qr) {
        expect(c, (const Color(0xff14532d), const Color(0xff14532d)));
      }
    });

    testWidgets('the receipt card', (tester) async {
      await show(tester, orangeTheme, VisitReceiptCard(receipt: receipt()));

      final qr = qrColours(tester);
      expect(qr, isNotEmpty);
      for (final c in qr) {
        expect(c, (const Color(0xff14532d), const Color(0xff14532d)));
      }
    });

    testWidgets('the pass hero on My Visit', (tester) async {
      await show(
        tester,
        orangeTheme,
        Scaffold(
          body: VisitPlannerPage(
            registerEnabled: true,
            visits: [receipt()],
            onRegisterVisit: () {},
          ),
        ),
      );

      final qr = qrColours(tester);
      expect(qr, isNotEmpty);
      for (final c in qr) {
        expect(c, (const Color(0xff064e3b), const Color(0xff064e3b)));
      }
    });

    testWidgets("the staff record sheet's QR", (tester) async {
      await show(
        tester,
        orangeTheme,
        ScannedTouristRecordSheet(
          recordData: const {
            'survey_id': 'S-1',
            'full_name': 'Sample Visitor',
            'status': 'pending',
          },
          api: _Api(),
          bootstrap: MobileBootstrap.fallback(),
        ),
      );

      final qr = qrColours(tester);
      expect(qr, isNotEmpty);
      for (final c in qr) {
        expect(c, (const Color(0xff14532d), const Color(0xff14532d)));
      }
    });
  });

  group('the teal family follows the theme (deep / dark), on green too', () {
    testWidgets('the receipt card', (tester) async {
      await show(tester, orangeTheme, VisitReceiptCard(receipt: receipt()));
      final c = colours(tester);
      expect(c.contains(hex(orangeBrand.deep)), isTrue);
      for (final teal in ['ff0f766e', 'ffccfbf1', 'fff0fdfa']) {
        expect(c.contains(teal), isFalse, reason: teal);
      }
      // The card's shadow is the theme's deep at 8%, not teal at any alpha.
      expect(c.contains(hex(orangeBrand.deep.withValues(alpha: 0.08))), isTrue);
      expect(c.where((x) => x.endsWith('0f766e')), isEmpty);

      await show(tester, greenTheme, VisitReceiptCard(receipt: receipt()));
      final g = colours(tester);
      // On the app green they are the original deep green, no longer teal.
      expect(g.contains(hex(BrandColors.original.deep)), isTrue);
      expect(g.contains('ff0f766e'), isFalse);
    });

    testWidgets('the pass hero', (tester) async {
      await show(
        tester,
        orangeTheme,
        Scaffold(
          body: VisitPlannerPage(
            registerEnabled: true,
            visits: [receipt()],
            onRegisterVisit: () {},
          ),
        ),
      );
      final c = colours(tester);
      expect(c.contains(hex(orangeBrand.dark)), isTrue);
      for (final teal in ['ff064e3b', 'ff0f766e', 'ffccfbf1']) {
        expect(c.contains(teal), isFalse, reason: teal);
      }
    });
  });

  group('status and neutral colours do not move under another colour', () {
    testWidgets("the pass modal: the status circle and the status pill", (
      tester,
    ) async {
      await show(tester, orangeTheme, TouristDigitalPassModal(receipt: receipt()));

      final c = colours(tester);
      // The "Top Status Circle" check, and the pill with receipt.displayStatus.
      for (final fixed in [
        const Color(0xffc8e6c9),
        const Color(0xffa5d6a7),
        const Color(0xff1b5e20),
        const Color(0xffdcfce7),
        const Color(0xff166534),
      ]) {
        expect(c.contains(hex(fixed)), isTrue, reason: hex(fixed));
      }
      // ...while its band and body took the theme.
      expect(c.contains(hex(orangeBrand.dark)), isTrue);
      expect(c.contains(hex(orangeBrand.light)), isTrue);
      expect(c.contains(hex(orangeBrand.onDark)), isTrue);
      expect(c.contains('ff14532d'), isFalse);
    });

    testWidgets("the staff sheet: the VERIFIED badge is fixed, the tile follows", (
      tester,
    ) async {
      await show(
        tester,
        orangeTheme,
        ScannedTouristRecordSheet(
          recordData: const {
            'survey_id': 'S-1',
            'full_name': 'Sample Visitor',
            'status': 'pending',
          },
          api: _Api(),
          bootstrap: MobileBootstrap.fallback(),
        ),
      );

      final c = colours(tester);
      // The badge (status) is the same emerald as the app green's...
      expect(c.contains('ff10b981'), isTrue);
      // ...and the initials tile (brand) took the orange's emerald role.
      expect(c.contains(hex(orangeBrand.emerald)), isTrue);
      // The brand fills of the sheet follow.
      expect(c.contains(hex(orangeBrand.dark)), isTrue);
    });

    test('the Arrived chip and the booking statuses are fixed', () {
      final arrived = touristStatusChip('arrived')!;
      expect(arrived.foreground, const Color(0xFF166534));
      expect(arrived.background, const Color(0xFFDCFCE7));
      expect(touristStatusChip('pending')!.foreground, const Color(0xFF92400E));
      expect(touristStatusChip('no_show')!.foreground, const Color(0xFF991B1B));
    });
  });

  group('the last three: ReceiptCard avatar and the DataSourceBanner ok variant', () {
    testWidgets("ReceiptCard: the avatar is the theme's tint", (tester) async {
      const card = ReceiptCard(
        icon: Icons.receipt_long_outlined,
        title: 'R',
        reference: 'REF',
        lines: ['one'],
      );
      await show(tester, orangeTheme, card);
      expect(avatarColour(tester), orangeBrand.tint);

      await show(tester, greenTheme, card);
      expect(avatarColour(tester), BrandColors.original.tint);
    });

    testWidgets('DataSourceBanner ok: background and border follow, warning does not', (
      tester,
    ) async {
      const ok = DataSourceBanner(
        icon: Icons.cloud_done_outlined,
        title: 'S',
        text: 'Live',
      );
      await show(tester, orangeTheme, ok);
      final c = colours(tester);
      expect(c.contains(hex(orangeBrand.tint.withValues(alpha: 0.6))), isTrue);
      expect(c.contains(hex(orangeBrand.border.withValues(alpha: 0.5))), isTrue);
      expect(c.contains(hex(BrandColors.original.tint.withValues(alpha: 0.6))), isFalse);

      // The warning variant is amber, fixed.
      const warning = DataSourceBanner(
        icon: Icons.warning_amber_outlined,
        title: 'S',
        text: 'Offline',
        warning: true,
      );
      await show(tester, orangeTheme, warning);
      final w = colours(tester);
      expect(w.contains(hex(const Color(0xfffff3bd).withValues(alpha: 0.6))), isTrue);
      expect(w.contains(hex(const Color(0xffffd267).withValues(alpha: 0.5))), isTrue);
      expect(w.contains(hex(orangeBrand.tint.withValues(alpha: 0.6))), isFalse);
    });
  });

  group('the page background follows the theme', () {
    Future<void> toHome(WidgetTester tester, TourismTheme initial) async {
      tester.view.physicalSize = const Size(411, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed') || text.contains('Unable to load asset')) {
          return;
        }
        previous?.call(details);
      };
      addTearDown(() => FlutterError.onError = previous);
      await tester.pumpWidget(
        MaubanMobileApp(
          initialTheme: initial,
          api: _Api(),
          cache: const TourismBootstrapCache(),
        ),
      );
      await tester.pump();
      await tester.tap(find.text('Skip'));
      await tester.pump();
      await tester.tap(find.text("I'm a Tourist / Visitor"));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pump();
    }

    testWidgets('orange: the Home page is the web\'s tint, not white', (
      tester,
    ) async {
      await toHome(tester, followsOrange);

      final context = tester.element(find.byType(Scaffold).first);
      expect(Theme.of(context).scaffoldBackgroundColor, const Color(0xfffbefe6));
      expect(context.brand.page, const Color(0xfffbefe6));
    });

    testWidgets("orange: the Home hero is the theme's deep, not teal", (
      tester,
    ) async {
      await toHome(tester, followsOrange);

      final c = colours(tester);
      expect(c.contains(hex(orangeBrand.deep)), isTrue);
      expect(c.contains('ff0f766e'), isFalse);
      expect(c.contains('ff115e59'), isFalse);
    });

    testWidgets('green: the canvas it always had', (tester) async {
      await toHome(tester, TourismTheme.none);

      final context = tester.element(find.byType(Scaffold).first);
      expect(Theme.of(context).scaffoldBackgroundColor, AppColors.canvas);
    });
  });
}
