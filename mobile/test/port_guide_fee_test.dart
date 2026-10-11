// The Port Guide card on My Visit states the entrance fee. There is one fee
// (PHP 80, PHP 64 for children 0-7, seniors 60+ and special needs: the same
// rates as frontend entranceFee.js and the backend's entrance_fee); the card
// used to say PHP 50, a figure that exists nowhere else.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoAnswerApi extends TourismApi {
  @override
  Future<String> fetchBootstrapRaw() => Completer<String>().future;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('My Visit states PHP 80 and PHP 64, and no PHP 50', (tester) async {
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
        initialTheme: TourismTheme.none,
        api: _NoAnswerApi(),
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
    await tester.tap(find.text('My Visit'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final fee = find.textContaining('Environmental & Tourism Fee', skipOffstage: false);
    await tester.scrollUntilVisible(fee, 400, scrollable: find.byType(Scrollable).first);
    final text = tester.widget<Text>(fee).data!;

    expect(text, contains('₱80 per visitor'));
    expect(text, contains('7 and below'));
    expect(text, contains('60 and above'));
    expect(text, contains('special needs'));
    expect(text, contains('₱64'));
    expect(text, isNot(contains('₱50')));
    // No other peso amount on the card.
    expect(RegExp(r'₱\d+').allMatches(text).map((m) => m.group(0)).toSet(), {'₱80', '₱64'});
  });
}
