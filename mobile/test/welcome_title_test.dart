// The title on the Welcome screen (the one with "I'm a Tourist / Visitor").
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  testWidgets('the Welcome title is Mabuhay Mauban', (tester) async {
    await tester.pumpWidget(MaterialApp(home: LoginPage(onContinue: () {})));

    expect(find.text('Mabuhay Mauban'), findsOneWidget);
    expect(find.text('Welcome to Mauban'), findsNothing);
    expect(find.text("I'm a Tourist / Visitor"), findsOneWidget);
  });
}
