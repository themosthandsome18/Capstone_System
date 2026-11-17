// The review form tells the person who fills it in who will see what they send (item #16 of the mobile list), and what becomes of their photos. The
// words are the SAME as the ones in the pop-up that opens when Review is pressed (review_consent_dialog_test.dart): one source, drawn twice. This
// test pins that the notice is there, above the Submit button (where it is read at the moment of deciding), that it says what matters (the five latest
// reviews, the web address of a photo, the name the Tourism Office sees, the photo gallery, hiding), that the gallery sentence is the one that stands
// out, and that it never says the typed name is public.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Written out here, on purpose, and not read from the app's constants: a test that compared the text with itself would pass when the text was changed.
const approvedTitle = 'Before you write a review';
const approvedParagraphs = [
  'Your review is public. Anyone who opens this place in the app can see the '
      'initials of your name (for example, J.D.C.), your rating, your comment, any '
      'photos you attach, and the date. Your cleanliness rating is added to the end '
      'of your comment.',
  "Only the five most recent reviews are shown on a place's page. Older ones "
      'stop showing, but each photo keeps its own web address, so anyone who has '
      'the link can still open it outside the app.',
  'The Mauban Tourism Office sees the name you type here. The public sees only '
      'your initials. Leave the name blank to appear as "Mobile Tourist".',
  "The Tourism Office may add your photos to the place's photo gallery in the "
      'app, where they are shown to everyone as pictures of the place. If they do, '
      'your photos stay there even if your review is later hidden or removed.',
  'Once sent, you cannot change or remove your review yourself. The Tourism '
      'Office can hide or remove it, but hiding does not delete the photo file.',
];

Destination destination() => Destination.fromJson({
  'resort_id': 1,
  'resort_name': 'Test Beach',
  'type': 'Beach Resort',
});

Future<void> showForm(WidgetTester tester) async {
  tester.view.physicalSize = const Size(411, 3200);
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
      home: FeedbackPage(api: const TourismApi(), destination: destination(), visit: visit()),
    ),
  );
  await tester.pump();
}

// The visit that opens the review: a pass for this destination that was scanned on arrival.
MobileVisitReceipt visit() => MobileVisitReceipt(
  reference: 'SURV-TEST-1',
  destination: destination(),
  arrivalDate: DateTime(2099, 6, 1),
  totalVisitors: 1,
  status: 'arrived',
  fullName: 'Sample Person',
  contactNumber: '+639000000000',
  email: '',
);

/// The words of the notice under the form: its title, then its paragraphs, in the order they are shown.
List<String> noticeTexts(WidgetTester tester) => find
    .descendant(of: find.byType(PublicVisibilityNotice), matching: find.byType(Text))
    .evaluate()
    .map((element) => (element.widget as Text).data!)
    .toList();

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the notice is on the review form, once, with the approved words', (tester) async {
    await showForm(tester);

    expect(find.byType(PublicVisibilityNotice), findsOneWidget);
    expect(noticeTexts(tester), [approvedTitle, ...approvedParagraphs]);
    for (final paragraph in approvedParagraphs) {
      expect(find.text(paragraph), findsOneWidget);
    }
  });

  testWidgets('it is above the Submit button, not below it', (tester) async {
    await showForm(tester);

    final notice = tester.getTopLeft(find.text(approvedTitle)).dy;
    final submit = tester.getTopLeft(find.text('Submit Feedback')).dy;
    expect(notice, lessThan(submit));
    // ...and below the form's own fields, so it is the last thing read.
    final photos = tester.getTopLeft(find.text('Attach Photos (Optional)')).dy;
    expect(notice, greaterThan(photos));
  });

  testWidgets('it says what matters', (tester) async {
    await showForm(tester);
    final text = noticeTexts(tester).join('\n');

    expect(text, contains('Your review is public.'));
    expect(text, contains('initials of your name'));
    expect(text, contains('Your cleanliness rating is added to the end of your comment'));
    expect(text, contains('Only the five most recent reviews are shown'));
    expect(text, contains('each photo keeps its own web address'));
    expect(text, contains('anyone who has the link can still open it outside the app'));
    expect(text, contains('The Mauban Tourism Office sees the name you type here.'));
    expect(text, contains('may add your photos to the place\'s photo gallery in the app'));
    expect(text, contains('your photos stay there even if your review is later hidden or removed'));
    expect(text, contains('you cannot change or remove your review yourself'));
    expect(text, contains('hiding does not delete the photo file'));
  });

  testWidgets('the photo gallery sentence is the one that stands out', (tester) async {
    await showForm(tester);

    final gallery = tester.widget<Text>(find.text(approvedParagraphs[3]));
    expect(find.byKey(const ValueKey('review-notice-stressed')), findsOneWidget);
    expect(gallery.style!.fontWeight, FontWeight.w800);
    for (final other in [0, 1, 2, 4]) {
      final style = tester.widget<Text>(find.text(approvedParagraphs[other])).style!;
      expect(style.fontWeight, isNot(FontWeight.w800), reason: 'paragraph $other');
      expect(gallery.style!.fontWeight!.value, greaterThan((style.fontWeight ?? FontWeight.w400).value));
    }
    // it also has a box of its own
    final box = tester.widget<Container>(find.byKey(const ValueKey('review-notice-stressed')));
    expect((box.decoration! as BoxDecoration).border, isNotNull);
  });

  testWidgets('it never says the name that was typed is public: the public sees the initials', (tester) async {
    await showForm(tester);
    final text = noticeTexts(tester).join('\n');

    expect(text, contains('The public sees only your initials.'));
    expect(text, isNot(contains('full name')));
    expect(RegExp(r'public (can )?sees? (your|the) (full )?name').hasMatch(text), isFalse);
    expect(text, isNot(contains('the public does too')));
  });

  testWidgets('it does not promise what is not true: nothing says the photo can be taken back', (tester) async {
    await showForm(tester);
    final text = noticeTexts(tester).join('\n').toLowerCase();

    expect(text, isNot(contains('we will delete')));
    expect(text, isNot(contains('will be deleted')));
    expect(text, isNot(contains('can be removed from the app by you')));
    expect(text, isNot(contains('only the tourism office sees your photo')));
  });

  testWidgets('it is its own widget, not a data-source banner', (tester) async {
    await showForm(tester);

    expect(find.byType(DataSourceBanner), findsNothing);
    expect(find.byType(InfoBanner), findsNothing);
  });
}
