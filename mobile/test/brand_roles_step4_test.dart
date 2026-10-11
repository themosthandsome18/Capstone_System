// Step 4 of the theme, first part: the roles the web has no token for
// (onDark, borderAlt, emerald) and the page background.
//
// The page background is the web's: its `--th-page-grad-1` (for #EF7C1F,
// #FBEFE6). The web paints a three-stop gradient (135deg) on its layout; the
// app uses the first stop as a flat colour (see PROJECT_AUDIT.md for why).
// The app's own green keeps AppColors.canvas, so nothing changes there.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const followsOrange = TourismTheme(primaryColor: '#EF7C1F');

Color hexColor(String hex) => colorFromHex(hex);

double contrast(Color a, Color b) {
  String h(Color c) =>
      '#${(c.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0')}';
  return contrastRatio(h(a), h(b));
}

void main() {
  group('the original palette has the new roles as literals', () {
    test('values', () {
      expect(BrandColors.original.onDark, const Color(0xff86efac));
      expect(BrandColors.original.borderAlt, const Color(0xffbadbcc));
      expect(BrandColors.original.emerald, const Color(0xff10b981));
      expect(BrandColors.original.page, AppColors.canvas);
    });

    test('the app green is the original, nothing derived', () {
      expect(identical(BrandColors.fromBase('#28A84A'), BrandColors.original), isTrue);
    });
  });

  group('derived from another colour', () {
    final orange = BrandColors.fromBase('#EF7C1F');

    test("the page is the web's first page-gradient stop", () {
      final t = deriveTourismTheme('#EF7C1F');
      expect(orange.page, hexColor(t['--th-page-grad-1']!));
      expect(orange.page, hexColor('#FBEFE6'));
    });

    test('the other new roles follow the rule (orange, golden values)', () {
      expect(orange.onDark, hexColor('#FFC576'));
      expect(orange.borderAlt, hexColor('#E4C8B1'));
      expect(orange.emerald, hexColor('#B35C16'));
    });

    test('they are not the green any more', () {
      expect(orange.onDark, isNot(BrandColors.original.onDark));
      expect(orange.borderAlt, isNot(BrandColors.original.borderAlt));
      expect(orange.emerald, isNot(BrandColors.original.emerald));
      expect(orange.page, isNot(AppColors.canvas));
    });

    test('onDark stays readable on the dark fills for any colour', () {
      for (final hex in [
        '#EF7C1F',
        '#236BFB',
        '#CB0606',
        '#FFF200',
        '#7C3AED',
        '#0D9488',
      ]) {
        final b = BrandColors.fromBase(hex);
        expect(contrast(b.onDark, b.deep), greaterThanOrEqualTo(4.5), reason: hex);
        expect(contrast(b.onDark, b.dark), greaterThanOrEqualTo(4.5), reason: hex);
      }
    });

    test('the page is pale for any colour (text on it stays readable)', () {
      for (final hex in ['#EF7C1F', '#236BFB', '#CB0606', '#FFF200', '#7C3AED']) {
        final page = BrandColors.fromBase(hex).page;
        expect(contrast(page, const Color(0xff111827)), greaterThan(12), reason: hex);
        // Still distinguishable from the white cards that sit on it.
        expect(page, isNot(const Color(0xffffffff)), reason: hex);
      }
    });

    test('lerp and copyWith carry the new roles', () {
      const a = BrandColors.original;
      expect(a.lerp(orange, 1), orange);
      expect(a.lerp(orange, 0), a);
      expect(a.copyWith(page: const Color(0xff123456)).page, const Color(0xff123456));
      expect(a.copyWith(emerald: const Color(0xff123456)).onDark, a.onDark);
    });
  });

  group('the page background of the app', () {
    test('tourism on the app green: the canvas it always had', () {
      final t = buildAppTheme(isSanitation: false, theme: TourismTheme.none);
      expect(t.scaffoldBackgroundColor, AppColors.canvas);
    });

    test('tourism on another colour: the theme\'s tint, not white', () {
      final t = buildAppTheme(isSanitation: false, theme: followsOrange);
      expect(t.scaffoldBackgroundColor, hexColor('#FBEFE6'));
      expect(t.scaffoldBackgroundColor, isNot(const Color(0xffffffff)));
      expect(t.scaffoldBackgroundColor, t.extension<BrandColors>()!.page);
    });

    test('sanitation is the canvas whatever tourism is set to', () {
      for (final theme in [TourismTheme.none, followsOrange]) {
        final t = buildAppTheme(isSanitation: true, theme: theme);
        expect(t.scaffoldBackgroundColor, AppColors.canvas);
        expect(t.extension<BrandColors>(), isNull);
      }
    });
  });
}
