import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  testWidgets('Mauban mobile app renders intro flow', (tester) async {
    await tester.pumpWidget(const MaubanMobileApp());
    await tester.pump();

    expect(find.text('Discover Destinations'), findsOneWidget);
  });
}
