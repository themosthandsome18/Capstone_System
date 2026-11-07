// The Welcome logo is a transparent PNG; nothing between it and the page may
// paint a box (colour, decoration, card, material) behind it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  testWidgets('no box paints behind the Welcome logo', (tester) async {
    await tester.pumpWidget(MaterialApp(home: LoginPage(onContinue: () {})));

    final logo = find.byWidgetPredicate((w) =>
        w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == 'assets/tourism_logo.png');
    expect(logo, findsOneWidget);

    // The Scaffold paints the page colour itself; look only inside its body.
    final body = find.byType(SafeArea);
    final boxes = find.ancestor(
      of: logo,
      matching: find.byWidgetPredicate((w) =>
          w is Card ||
          w is DecoratedBox ||
          w is PhysicalModel ||
          w is ColoredBox ||
          (w is Container && (w.color != null || w.decoration != null))),
      matchRoot: false,
    );
    // Only count boxes that sit between the logo and the page body.
    final between = boxes.evaluate().where((e) =>
        find.descendant(of: body, matching: find.byWidget(e.widget)).evaluate().isNotEmpty);
    expect(between, isEmpty);
  });
}
