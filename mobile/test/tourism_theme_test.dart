// The tourism theme colour: reading the `theme` of the bootstrap, choosing the
// colour the app would use, and deriving the palette from it. Nothing is
// applied to the screens yet.
//
// The derived palette is compared with what the web's own
// deriveTourismTheme.js returns (test/data/tourism_theme_golden.json, written
// by test/data/generate_tourism_theme_golden.mjs, which runs that file in
// Node). Nothing here is checked by counting pixels.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

TourismTheme theme({
  Object? primary = '#EF7C1F',
  Object? follows = true,
  Object? mobile = '',
}) => TourismTheme.fromJson({
  'primary_color': primary,
  'mobile_follows_web': follows,
  'mobile_primary_color': mobile,
});

void main() {
  test('the default is the apps own green, AppColors.green', () {
    expect(defaultBrandHex, '#28A84A');
    final argb = AppColors.green.toARGB32() & 0xFFFFFF;
    expect(
      '#${argb.toRadixString(16).padLeft(6, '0').toUpperCase()}',
      defaultBrandHex,
    );
    // Not the web's own default (#2FA34A).
    expect(defaultBrandHex, isNot(webDefaultPrimaryHex));
  });

  group('the colour the app uses', () {
    test('follows the web: the web colour', () {
      expect(effectiveBrandHex(theme(follows: true)), '#EF7C1F');
    });

    test('has its own colour: that one, not the web colour', () {
      expect(
        effectiveBrandHex(theme(follows: false, mobile: '#28A84A')),
        '#28A84A',
      );
      expect(
        effectiveBrandHex(theme(primary: '#236BFB', follows: false, mobile: '#CB0606')),
        '#CB0606',
      );
    });

    test('primary and mobile are not mixed up', () {
      // Orange on the web, green in the app: green wins in the app...
      expect(
        effectiveBrandHex(theme(primary: '#EF7C1F', follows: false, mobile: '#28A84A')),
        '#28A84A',
      );
      // ...and when following, the mobile colour is ignored.
      expect(
        effectiveBrandHex(theme(primary: '#EF7C1F', follows: true, mobile: '#28A84A')),
        '#EF7C1F',
      );
    });

    test('lower case is accepted and upper-cased', () {
      expect(effectiveBrandHex(theme(primary: '#ef7c1f')), '#EF7C1F');
      expect(
        effectiveBrandHex(theme(follows: false, mobile: '#28a84a')),
        '#28A84A',
      );
    });

    group('falls back to the app\'s own green (#28A84A)', () {
      test('no theme at all', () {
        expect(effectiveBrandHex(null), defaultBrandHex);
        expect(effectiveBrandHex(TourismTheme.none), defaultBrandHex);
        expect(effectiveBrandHex(TourismTheme.fromJson(null)), defaultBrandHex);
        expect(effectiveBrandHex(TourismTheme.fromJson('x')), defaultBrandHex);
        expect(effectiveBrandHex(TourismTheme.fromJson(<String, dynamic>{})), defaultBrandHex);
      });

      test('following, and the web colour is missing, blank or not a colour', () {
        for (final bad in [null, '', '   ', 'orange', '#FFF', '#GGGGGG', '#EF7C1F00', 'EF7C1F', 7]) {
          expect(
            effectiveBrandHex(theme(primary: bad, follows: true)),
            defaultBrandHex,
            reason: '$bad',
          );
        }
      });

      test('own colour, and it is blank or not a colour: green, not the web colour', () {
        for (final bad in [null, '', '   ', 'orange', '#FFF', '#GGGGGG', '#28A84A00', 'EF7C1F', 7]) {
          expect(
            effectiveBrandHex(theme(primary: '#EF7C1F', follows: false, mobile: bad)),
            defaultBrandHex,
            reason: '$bad',
          );
        }
      });

      test('a 3-digit hex is not accepted, as the server does not accept it', () {
        expect(isHexColor('#FFF'), isFalse);
        expect(isHexColor('#FFFFFF'), isTrue);
        expect(isHexColor('#ffffff'), isTrue);
        expect(isHexColor('FFFFFF'), isFalse);
        expect(isHexColor('#FFFFFFFF'), isFalse);
        expect(isHexColor(null), isFalse);
      });
    });

    group('mobile_follows_web: only a real false turns it off', () {
      test('missing', () {
        final t = TourismTheme.fromJson({'primary_color': '#EF7C1F'});
        expect(t.followsWeb, isTrue);
        expect(effectiveBrandHex(t), '#EF7C1F');
      });

      test('null, a string, a number: still follows', () {
        for (final v in [null, 'false', 0, 'no']) {
          expect(theme(follows: v).followsWeb, isTrue, reason: '$v');
        }
      });

      test('false', () {
        expect(theme(follows: false).followsWeb, isFalse);
      });
    });
  });

  group('the bootstrap carries it', () {
    test('read from the answer', () {
      final bootstrap = MobileBootstrap.fromJson({
        'theme': {
          'primary_color': '#EF7C1F',
          'mobile_follows_web': false,
          'mobile_primary_color': '#28A84A',
          'saved_colors': [
            {'hex': '#2FA34A', 'label': 'Original (Green)'},
          ],
          'updated_at': '2026-10-11T19:34:56+08:00',
        },
      });

      expect(bootstrap.theme.primaryColor, '#EF7C1F');
      expect(bootstrap.theme.followsWeb, isFalse);
      expect(bootstrap.theme.mobilePrimaryColor, '#28A84A');
      expect(effectiveBrandHex(bootstrap.theme), '#28A84A');
    });

    test('an answer without a theme: the default', () {
      final bootstrap = MobileBootstrap.fromJson({'destinations': <dynamic>[]});
      expect(bootstrap.theme, same(TourismTheme.none));
      expect(effectiveBrandHex(bootstrap.theme), defaultBrandHex);
    });

    test('the offline fallback has none', () {
      expect(effectiveBrandHex(MobileBootstrap.fallback().theme), defaultBrandHex);
    });

    test('the saved copy gives the theme back (offline, second launch)', () {
      // What the cache stores is the response text; it goes through the same
      // parser, so the theme comes back with it.
      const raw =
          '{"destinations":[],"theme":{"primary_color":"#EF7C1F",'
          '"mobile_follows_web":false,"mobile_primary_color":"#28A84A"}}';

      final bootstrap = parseBootstrapRaw(raw);

      expect(effectiveBrandHex(bootstrap.theme), '#28A84A');
    });
  });

  group('derived palette equals the web\'s (golden from the JS, in Node)', () {
    final golden =
        (jsonDecode(File('test/data/tourism_theme_golden.json').readAsStringSync())
                as Map<String, dynamic>)
            .map((key, value) => MapEntry(key, Map<String, String>.from(value as Map)));

    test('the golden file holds the colours we rely on', () {
      expect(
        golden.keys,
        containsAll(['#EF7C1F', '#236BFB', '#28A84A', '#2FA34A', '#FFF200', '#CB0606']),
      );
      expect(golden['#EF7C1F']!.length, greaterThan(30));
    });

    for (final color in ['#EF7C1F', '#236BFB', '#28A84A', '#2FA34A', '#FFF200', '#CB0606']) {
      test('every token for $color', () {
        final derived = deriveTourismTheme(color);
        final expected = golden[color]!;

        expect(derived.keys.toSet(), expected.keys.toSet());
        for (final token in expected.keys) {
          expect(derived[token], expected[token], reason: '$color $token');
        }
      });
    }

    test('a value that is not a colour derives the web green, as the JS does', () {
      expect(deriveTourismTheme('#FFF'), golden['invalid:#FFF']);
      expect(deriveTourismTheme(null), golden['invalid:#FFF']);
      expect(deriveTourismTheme('#FFF')['--th-primary'], webDefaultPrimaryHex);
    });

    test('lower case input is the same palette', () {
      expect(deriveTourismTheme('#ef7c1f'), golden['#EF7C1F']);
    });

    test('a pale colour gets a dark ink on its fill (the contrast floor)', () {
      final derived = deriveTourismTheme('#FFF200');
      expect(derived['--th-primary-contrast'], isNot('#FFFFFF'));
      expect(derived['--th-primary-contrast'], golden['#FFF200']!['--th-primary-contrast']);
    });

    test('orange keeps white on its fill, as the web does', () {
      expect(deriveTourismTheme('#EF7C1F')['--th-primary-contrast'], '#FFFFFF');
    });
  });

  group('the colour maths', () {
    test('hex <-> rgb', () {
      expect(hexToRgb('#EF7C1F'), [239, 124, 31]);
      expect(rgbToHex([239, 124, 31]), '#EF7C1F');
      expect(rgbToHex([300, -4, 31.4]), '#FF001F');
    });

    test('contrast: black on white is 21, equal colours are 1', () {
      expect(contrastRatio('#000000', '#FFFFFF'), closeTo(21, 0.001));
      expect(contrastRatio('#336699', '#336699'), closeTo(1, 0.0001));
    });
  });
}
