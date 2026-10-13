// The review form tells the person who fills it in who will see what they
// send (item #16 of the mobile list). Every statement in the notice was
// checked against the code and the live data; this test pins that the text is
// there, that it is above the Submit button (where it is read at the moment of
// deciding), that the four statements that matter are in it, and that it never
// says that the full name is public.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Written out here, on purpose, and not read from the app's constant: a test
// that compared the text with itself would pass when the text was changed.
const approvedNotice =
    'Reviews are public. Anyone who opens this destination in the app can see '
    'the initials of your name (for example, J.D.C.), your rating, your '
    'comment, any photos you attach, and the date. Your cleanliness rating is '
    'added to the end of your comment. Each photo also gets its own web '
    'address, so anyone with the link can open it outside the app. Once sent, '
    'a review cannot be changed or removed from the app. The tourism office '
    'sees your full name; the public does not. Leave the name blank to appear '
    'as "Mobile Tourist".';

Destination destination() => Destination.fromJson({
  'resort_id': 1,
  'resort_name': 'Test Beach',
  'type': 'Beach Resort',
});

Future<void> showForm(WidgetTester tester) async {
  tester.view.physicalSize = const Size(411, 1800);
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
    MaterialApp(
      theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
      home: FeedbackPage(api: const TourismApi(), destination: destination()),
    ),
  );
  await tester.pump();
}

String noticeText(WidgetTester tester) => tester
    .widget<Text>(
      find.descendant(
        of: find.byType(PublicVisibilityNotice),
        matching: find.byType(Text),
      ),
    )
    .data!;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the notice is on the review form, once, with the approved text', (
    tester,
  ) async {
    await showForm(tester);

    expect(find.byType(PublicVisibilityNotice), findsOneWidget);
    expect(find.text(approvedNotice), findsOneWidget);
  });

  testWidgets('it is above the Submit button, not below it', (tester) async {
    await showForm(tester);

    final notice = tester.getTopLeft(find.text(approvedNotice)).dy;
    final submit = tester.getTopLeft(find.text('Submit Feedback')).dy;
    expect(notice, lessThan(submit));
    // ...and below the form's own fields, so it is the last thing read.
    final photos = tester.getTopLeft(find.text('Attach Photos (Optional)')).dy;
    expect(notice, greaterThan(photos));
  });

  testWidgets('it says the four things that matter', (tester) async {
    await showForm(tester);
    final text = noticeText(tester);

    expect(text, contains('initials of your name'));
    expect(text, contains('Each photo also gets its own web address'));
    expect(text, contains('anyone with the link can open it outside the app'));
    expect(
      text,
      contains('Your cleanliness rating is added to the end of your comment'),
    );
    expect(text, contains('cannot be changed or removed from the app'));
  });

  testWidgets('it never says the full name is public', (tester) async {
    await showForm(tester);
    final text = noticeText(tester);

    // The full name appears once, and only as what the public does NOT see.
    expect('full name'.allMatches(text).length, 1);
    expect(text, contains('sees your full name; the public does not.'));
    expect(RegExp(r'can see (your|the) (full )?name').hasMatch(text), isFalse);
    expect(text, isNot(contains('full name is public')));
    expect(text, isNot(contains('the public does too')));
  });

  testWidgets('it is its own widget, not a data-source banner', (tester) async {
    await showForm(tester);

    expect(find.byType(DataSourceBanner), findsNothing);
    expect(find.byType(InfoBanner), findsNothing);
  });
}
