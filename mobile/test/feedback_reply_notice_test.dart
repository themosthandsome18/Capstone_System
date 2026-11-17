// When the Tourism Office answers a tourist's review, the tourist sees a notice. The tourist has no account, so the phone asks the server, once when the app
// is opened and with nothing typed, using the survey ID and the contact number that were kept with each review. A new or changed answer is a notice on
// the Notifications page and a red dot on the bell; pressing it opens that review with the answer in full; the X or a swipe removes it for good; and
// the dot goes when the page is opened and comes back only for something new. A review kept before the pass was kept with it is never asked about.
// The people here are made up.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const sampleBeach = {
  'resort_id': 7,
  'resort_name': 'Sample Beach',
  'type': 'Beach Resort',
  'location': 'Mauban, Quezon',
  'latitude': 14.2,
  'longitude': 121.7,
};

MobileBootstrap bootstrap({List<Map<String, Object?>> notifications = const []}) => MobileBootstrap.fromJson({
  'destinations': [sampleBeach],
  'featuredDestinations': [sampleBeach],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': notifications,
});

const phone = '+639000000001';

MobileFeedbackReceipt review(String reference, {String reply = '', String survey = 'SURV-1', String contact = phone, String message = 'A made-up review.'}) =>
    MobileFeedbackReceipt(
      reference: reference,
      destination: keptDestination(7, 'Sample Beach'),
      reviewer: 'Sample Person',
      rating: 4,
      message: message,
      reply: reply,
      date: '2099-06-02',
      surveyId: survey,
      contactNumber: contact,
    );

/// A review kept by an older copy of the app: no survey ID and no number were kept with it.
MobileFeedbackReceipt oldReview(String reference, {String reply = ''}) => review(reference, reply: reply, survey: '', contact: '');

/// The server, as the app asks it: [replies] says what each review (by its number) has been answered, [asked] what was asked, and [failure] makes it fail.
class ReplyApi extends TourismApi {
  ReplyApi({this.replies = const {}, this.failure});

  Map<int, String> replies;
  final Object? failure;
  final List<(String, String)> asked = [];

  @override
  Future<MobilePassStatus?> fetchPassStatus({required String reference, required String contact}) async => null;

  @override
  Future<List<MobileFeedbackReply>> fetchFeedbackReplies({required String reference, required String contact}) async {
    asked.add((reference, contact));
    if (failure != null) throw failure!;
    return [for (final entry in replies.entries) MobileFeedbackReply(id: entry.key, destinationId: 7, reply: entry.value)];
  }
}

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset') || text.contains('NetworkImage') || text.contains('HTTP request failed')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

/// The app opened: a new shell that reads what the phone kept (the old one is gone, as when the app is closed).
Future<void> openApp(WidgetTester tester, TourismApi api, {List<Map<String, Object?>> notifications = const []}) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
      home: MobileShell(api: api, state: TourismBootstrapState.loaded(bootstrap(notifications: notifications)), onRetry: () {}, onSignOut: () {}),
    ),
  );
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}

Future<void> keepReviews(List<MobileFeedbackReceipt> reviews) async {
  await const MyVisitsStore().saveFeedback(reviews);
  await const MyVisitsStore().saveProfile(const MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: phone));
}

Future<List<MobileFeedbackReceipt>> keptReviews() async => (await const MyVisitsStore().read()).feedback;

final bell = find.byIcon(Icons.notifications_outlined);
final dot = find.byKey(const ValueKey('bell-dot'));
const answerTitle = 'The Tourism Office answered your review';

Future<void> openNotifications(WidgetTester tester) async {
  await tester.tap(bell);
  await tester.pumpAndSettle();
}

Future<void> goBack(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.arrow_back));
  await tester.pumpAndSettle();
}

String noticeIdOf(MobileFeedbackReceipt receipt, String reply) => AppNotification.replyTo(receipt.withReply(reply)).id;

const advisory1 = {'id': 'advisory-1', 'type': 'tourism', 'title': 'Sea advisory', 'message': 'Boats may be delayed.', 'severity': 'warning'};
const advisory2 = {'id': 'advisory-2', 'type': 'tourism', 'title': 'Road works', 'message': 'Expect delays.', 'severity': 'info'};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the review remembers the pass it was written with', () {
    test('what is kept holds the survey ID and the contact number', () {
      final stored = review('42').toStoredJson();

      expect(stored['survey_id'], 'SURV-1');
      expect(stored['contact_number'], phone);
      final back = MobileFeedbackReceipt.fromStoredJson(Map<String, dynamic>.from(jsonDecode(jsonEncode(stored)) as Map))!;
      expect((back.surveyId, back.contactNumber, back.canAskForReply), ('SURV-1', phone, true));
    });

    test('a review kept before they were kept still loads, with neither, and is never asked about', () {
      final old = MobileFeedbackReceipt.fromStoredJson({
        'reference': '12',
        'destination_id': 7,
        'destination_name': 'Sample Beach',
        'reviewer': 'Sample Person',
        'rating': 4,
        'message': 'Old.',
        'reply': '',
        'date': '2099-01-01',
        'photos': <String>[],
      })!;

      expect((old.surveyId, old.contactNumber), ('', ''));
      expect(old.canAskForReply, isFalse);
    });

    test('with only one of the two it is not asked about either', () {
      expect(review('1', survey: 'SURV-1', contact: '').canAskForReply, isFalse);
      expect(review('1', survey: '', contact: phone).canAskForReply, isFalse);
    });

    test('a changed destination or a new answer keeps the pass', () {
      final changed = review('42').withReply('Thank you!').withDestination(keptDestination(8, 'Other Place'));

      expect((changed.surveyId, changed.contactNumber, changed.reply), ('SURV-1', phone, 'Thank you!'));
    });

    test('the answer from the server keeps the pass it was written with', () {
      final made = MobileFeedbackReceipt.fromResponse(
        {'id': 77, 'reviewer': 'Sample Person', 'rating': 5, 'message': 'Nice.', 'date': '2099-06-02'},
        destination: keptDestination(7, 'Sample Beach'),
        reviewer: 'Sample Person',
        rating: 5,
        surveyId: ' SURV-9 ',
        contactNumber: ' $phone ',
      );

      expect((made.reference, made.surveyId, made.contactNumber), ('77', 'SURV-9', phone));
    });
  });

  group('the notice that is an answer', () {
    test('has the answer in its id: the same answer is the same notice, a changed one is a new notice', () {
      final same = [noticeIdOf(review('42'), 'Thanks!'), noticeIdOf(review('42'), 'Thanks!')];
      final changed = noticeIdOf(review('42'), 'Thanks, and come back!');

      expect(same[0], same[1]);
      expect(changed, isNot(same[0]));
      expect(noticeIdOf(review('43'), 'Thanks!'), isNot(same[0])); // another review
    });

    test('the number made of a text is the same on every run (FNV-1a)', () {
      expect(stableTextHash('a'), 0xe40c292c);
      expect(stableTextHash(''), 0x811c9dc5);
      expect(stableTextHash('Thanks!'), stableTextHash('Thanks!'));
    });

    test('says what it is, names no person and quotes nothing', () {
      final notice = AppNotification.replyTo(review('42', reply: 'A secret answer.'));

      expect(notice.isReply, isTrue);
      expect(notice.title, answerTitle);
      expect(notice.message, 'Your review of Sample Beach has a reply. Open it to read it.');
      expect(notice.message, isNot(contains('secret')));
      expect(notice.severityLabel, 'Reply');
      expect(notice.createdAt, isNull);
    });
  });

  group('what the app asks, and how', () {
    test('POST /mobile/tourism/feedback/replies/ with the survey ID and the contact number in the BODY, and nothing in the address', () async {
      late http.Request seen;
      final rows = await http.runWithClient(
        () => const TourismApi().fetchFeedbackReplies(reference: ' SURV-1 ', contact: ' $phone '),
        () => MockClient((request) async {
          seen = request;
          return http.Response(
            jsonEncode({
              'rows': [
                {'id': 42, 'destination_id': 7, 'reply': 'Thank you!'},
                {'id': 43, 'destination_id': 7, 'reply': ''},
                {'destination_id': 7, 'reply': 'no id: left out'},
              ],
              'summary': {'total': 3},
            }),
            200,
          );
        }),
      );

      expect(seen.method, 'POST');
      expect(seen.url.path, endsWith('/mobile/tourism/feedback/replies/'));
      expect(seen.url.query, isEmpty); // the number is not in the address, so not in the server's log
      expect(seen.url.toString(), isNot(contains('SURV-1')));
      expect(seen.url.toString(), isNot(contains('9000')));
      expect(jsonDecode(seen.body), {'reference': 'SURV-1', 'contact': phone});
      expect(seen.headers['Authorization'], isNull);
      expect(rows.map((row) => (row.id, row.destinationId, row.reply)).toList(), [(42, 7, 'Thank you!'), (43, 7, '')]);
    });

    test('no rows is an empty list, not an error', () async {
      final rows = await http.runWithClient(
        () => const TourismApi().fetchFeedbackReplies(reference: 'SURV-1', contact: '0900'),
        () => MockClient((request) async => http.Response(jsonEncode({'rows': <dynamic>[], 'summary': {'total': 0}}), 200)),
      );

      expect(rows, isEmpty);
    });
  });

  group('opening the app', () {
    testWidgets('a new answer is a notice on the Notifications page and a red dot on the bell, and it is kept with the review', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);
      final api = ReplyApi(replies: {42: 'Thank you for visiting!'});

      await openApp(tester, api);

      expect(api.asked, [('SURV-1', phone)]);
      expect(dot, findsOneWidget);
      await openNotifications(tester);
      expect(find.text(answerTitle), findsOneWidget);
      expect(find.text('Your review of Sample Beach has a reply. Open it to read it.'), findsOneWidget);
      expect((await keptReviews()).single.reply, 'Thank you for visiting!');
    });

    testWidgets('no answer: no red dot and no notice', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);

      await openApp(tester, ReplyApi(replies: {42: ''}));

      expect(dot, findsNothing);
      await openNotifications(tester);
      expect(find.text(answerTitle), findsNothing);
      expect(find.text('No new advisories'), findsOneWidget); // the page is not blank and not broken
    });

    testWidgets('pressing the notice opens that very review, with the answer in full', (tester) async {
      bigScreen(tester);
      const long = 'Thank you for visiting Sample Beach! We are glad you liked it, and we hope to see you again soon. Please bring a friend next time.';
      await keepReviews([review('41', message: 'The first review.'), review('42', message: 'The second review.')]);

      await openApp(tester, ReplyApi(replies: {42: long}));
      await openNotifications(tester);
      await tester.tap(find.text(answerTitle));
      await tester.pumpAndSettle();

      expect(find.text('My Review'), findsOneWidget);
      expect(find.byKey(const ValueKey('review-message')), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('review-message'))).data, 'The second review.'); // the one that was answered
      expect(find.descendant(of: find.byKey(const ValueKey('review-reply')), matching: find.text(long)), findsOneWidget); // in full
      expect(find.text('Reply from the Tourism Office'), findsOneWidget);
    });

    testWidgets('a review that has several passes is asked once for each pass, and an answer reaches only its own review', (tester) async {
      bigScreen(tester);
      await keepReviews([review('41', survey: 'SURV-A'), review('42', survey: 'SURV-A'), review('43', survey: 'SURV-B', contact: '+639000000002')]);
      final api = ReplyApi(replies: {42: 'For the second only.'});

      await openApp(tester, api);

      expect(api.asked.toSet(), {('SURV-A', phone), ('SURV-B', '+639000000002')});
      expect(api.asked, hasLength(2)); // not once for each review
      final kept = {for (final item in await keptReviews()) item.reference: item.reply};
      expect(kept['42'], 'For the second only.');
      expect(kept['41'], '');
      expect(kept['43'], '');
    });
  });

  group('removing a notice', () {
    testWidgets('the X removes it at once, and it does not come back when the app is opened again', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);
      final api = ReplyApi(replies: {42: 'Thank you!'});
      await openApp(tester, api);
      await openNotifications(tester);
      final id = noticeIdOf(review('42'), 'Thank you!');

      await tester.tap(find.byKey(ValueKey('notice-x-$id')));
      await tester.pumpAndSettle();

      expect(find.text(answerTitle), findsNothing);
      expect(find.text('No new advisories'), findsOneWidget);
      expect((await const MyVisitsStore().read()).removedNotices, {id});

      await openApp(tester, api); // closed and opened again
      expect(dot, findsNothing);
      await openNotifications(tester);
      expect(find.text(answerTitle), findsNothing);
    });

    testWidgets('a swipe removes it too, and it stays removed', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);
      final api = ReplyApi(replies: {42: 'Thank you!'});
      await openApp(tester, api);
      await openNotifications(tester);
      final id = noticeIdOf(review('42'), 'Thank you!');

      await tester.drag(find.byKey(ValueKey('dismiss-$id')), const Offset(-600, 0));
      await tester.pumpAndSettle();

      expect(find.text(answerTitle), findsNothing);
      await openApp(tester, api);
      await openNotifications(tester);
      expect(find.text(answerTitle), findsNothing);
    });

    testWidgets('removing one leaves the others, and a CHANGED answer is a new notice that comes back', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42'), review('43')]);
      final api = ReplyApi(replies: {42: 'First answer.', 43: 'Another answer.'});
      await openApp(tester, api);
      await openNotifications(tester);
      await tester.tap(find.byKey(ValueKey('notice-x-${noticeIdOf(review('42'), 'First answer.')}')));
      await tester.pumpAndSettle();
      expect(find.text(answerTitle), findsOneWidget); // the other one is still there

      api.replies = {42: 'First answer, EDITED.', 43: 'Another answer.'};
      await openApp(tester, api);
      await openNotifications(tester);

      expect(find.text(answerTitle), findsNWidgets(2)); // the edited answer to 42 is new news
    });

    testWidgets('an advisory is removed and stays removed too', (tester) async {
      bigScreen(tester);

      await openApp(tester, ReplyApi(), notifications: [advisory1, advisory2]);
      await openNotifications(tester);
      await tester.tap(find.byKey(const ValueKey('notice-x-advisory-1')));
      await tester.pumpAndSettle();
      expect(find.text('Sea advisory'), findsNothing);
      expect(find.text('Road works'), findsOneWidget);

      await openApp(tester, ReplyApi(), notifications: [advisory1, advisory2]);
      await openNotifications(tester);
      expect(find.text('Sea advisory'), findsNothing);
      expect(find.text('Road works'), findsOneWidget);
    });
  });

  group('the red dot on the bell', () {
    testWidgets('it is there for a notice that is new, goes when the Notifications page is opened, and stays gone when the app is opened again', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);
      final api = ReplyApi(replies: {42: 'Thank you!'});

      await openApp(tester, api);
      expect(dot, findsOneWidget);

      await openNotifications(tester);
      await goBack(tester);
      expect(dot, findsNothing); // seen

      await openApp(tester, api);
      expect(dot, findsNothing); // it is not the same news again
    });

    testWidgets('with advisories (the old dot never went): it goes when they are looked at, and comes back only for an advisory that is new', (tester) async {
      bigScreen(tester);

      await openApp(tester, ReplyApi(), notifications: [advisory1]);
      expect(dot, findsOneWidget);
      await openNotifications(tester);
      await goBack(tester);
      expect(dot, findsNothing);

      await openApp(tester, ReplyApi(), notifications: [advisory1]);
      expect(dot, findsNothing);

      await openApp(tester, ReplyApi(), notifications: [advisory1, advisory2]);
      expect(dot, findsOneWidget); // advisory-2 was never seen
      await openNotifications(tester);
      await goBack(tester);
      expect(dot, findsNothing);
    });

    testWidgets('a changed answer brings the dot back', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);
      await openApp(tester, ReplyApi(replies: {42: 'First answer.'}));
      await openNotifications(tester);
      await goBack(tester);
      expect(dot, findsNothing);

      await openApp(tester, ReplyApi(replies: {42: 'A different answer.'}));

      expect(dot, findsOneWidget);
    });

    testWidgets('with nothing at all there is no dot', (tester) async {
      bigScreen(tester);

      await openApp(tester, ReplyApi());

      expect(dot, findsNothing);
    });

    testWidgets('an advisory that was removed does not give a dot', (tester) async {
      bigScreen(tester);
      await const MyVisitsStore().saveNotices(seen: {}, removed: {'advisory-1'});

      await openApp(tester, ReplyApi(), notifications: [advisory1]);

      expect(dot, findsNothing);
    });
  });

  group('the review kept by an older copy of the app', () {
    testWidgets('is not asked about, is not a notice, does not crash, and looks as it always did', (tester) async {
      bigScreen(tester);
      await keepReviews([oldReview('12')]);
      final api = ReplyApi(replies: {12: 'This would be somebody else\'s answer.'});

      await openApp(tester, api);

      expect(api.asked, isEmpty); // not even one question
      expect(tester.takeException(), isNull);
      expect(dot, findsNothing);
      expect((await keptReviews()).single.reply, ''); // nothing was put on it
      await openNotifications(tester);
      expect(find.text(answerTitle), findsNothing);
      expect(find.text('No new advisories'), findsOneWidget);
    });

    testWidgets('a new review and an old one together: only the new one is asked about', (tester) async {
      bigScreen(tester);
      await keepReviews([oldReview('12'), review('42')]);
      final api = ReplyApi(replies: {42: 'Thank you!', 12: 'must not reach the old one'});

      await openApp(tester, api);

      expect(api.asked, [('SURV-1', phone)]);
      final kept = {for (final item in await keptReviews()) item.reference: item.reply};
      expect(kept['42'], 'Thank you!');
      expect(kept['12'], '');
    });
  });

  group('no internet', () {
    testWidgets('the last known answer stays, nothing is shown to say it failed, and nothing crashes', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42', reply: 'An answer from before.')]);
      await const MyVisitsStore().saveNotices(seen: {noticeIdOf(review('42'), 'An answer from before.')}, removed: {});

      await openApp(tester, ReplyApi(failure: http.ClientException('no connection')));

      expect(tester.takeException(), isNull);
      expect((await keptReviews()).single.reply, 'An answer from before.');
      expect(dot, findsNothing); // seen already
      await openNotifications(tester);
      expect(find.text(answerTitle), findsOneWidget);
    });

    testWidgets('the real client with no server behind it (every call fails): no crash, no notice', (tester) async {
      bigScreen(tester);
      await keepReviews([review('42')]);

      await http.runWithClient(
        () async => openApp(tester, const TourismApi()),
        () => MockClient((request) async => throw http.ClientException('no connection')),
      );

      expect(tester.takeException(), isNull);
      expect(dot, findsNothing);
      expect((await keptReviews()).single.reply, '');
    });
  });

  group('what is kept about the notices', () {
    test('which were seen and which were removed come back as they were kept', () async {
      await const MyVisitsStore().saveNotices(seen: {'a', 'b'}, removed: {'c'});

      final mine = await const MyVisitsStore().read();

      expect(mine.seenNotices, {'a', 'b'});
      expect(mine.removedNotices, {'c'});
    });

    test('Sign Out takes them off the phone too', () async {
      await const MyVisitsStore().saveNotices(seen: {'a'}, removed: {'c'});

      expect(await const MyVisitsStore().clear(), isTrue);

      final mine = await const MyVisitsStore().read();
      expect(mine.seenNotices, isEmpty);
      expect(mine.removedNotices, isEmpty);
    });

    test('a value of another kind under the key is nothing kept, not a crash', () async {
      SharedPreferences.setMockInitialValues({tourismNoticesSeenKey: 'not a list', tourismNoticesRemovedKey: 5});

      final mine = await const MyVisitsStore().read();

      expect(mine.seenNotices, isEmpty);
      expect(mine.removedNotices, isEmpty);
    });
  });

  group('a review that is sent keeps the pass it was written with', () {
    testWidgets('the receipt it gives back carries the survey ID and the contact number of that pass', (tester) async {
      bigScreen(tester);
      MobileFeedbackReceipt? recorded;
      final visit = MobileVisitReceipt(
        reference: 'SURV-1',
        destination: keptDestination(7, 'Sample Beach'),
        arrivalDate: DateTime(2099, 6, 1),
        totalVisitors: 2,
        status: 'arrived',
        fullName: 'Sample Person',
        contactNumber: phone,
        email: 'sample@example.test',
      );

      await http.runWithClient(
        () async {
          await tester.pumpWidget(
            MaterialApp(
              theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
              home: FeedbackPage(api: const TourismApi(), destination: keptDestination(7, 'Sample Beach'), visit: visit, onRecorded: (receipt) => recorded = receipt),
            ),
          );
          await tester.pump();
          await tester.enterText(find.byType(TextField).last, 'A made-up comment.');
          await tester.tap(find.text('Submit Feedback'));
          for (var i = 0; i < 8; i++) {
            await tester.pump(const Duration(milliseconds: 100));
          }
        },
        () => MockClient((request) async {
          if (request.url.path.endsWith('/mobile/tourism/feedback/')) {
            return http.Response(jsonEncode({'id': 77, 'reviewer': 'Mobile Tourist', 'rating': 5, 'message': 'A made-up comment.', 'date': '2099-06-02'}), 201);
          }
          return http.Response('', 404);
        }),
      );

      expect(recorded, isNotNull);
      expect((recorded!.reference, recorded!.surveyId, recorded!.contactNumber), ('77', 'SURV-1', phone));
    });
  });
}
