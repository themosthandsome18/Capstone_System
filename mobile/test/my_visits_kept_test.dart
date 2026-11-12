// The tourist's entry passes, feedback and profile are kept on the phone (shared_preferences), and read back when the app is opened again.
// Without this they lived in memory only, and closing the app made the tourist a stranger. Sign Out takes all three off the phone.
//
// shared_preferences is the package's own fake (setMockInitialValues); the network is a mocked HTTP client. The people in these tests are
// made up.
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

MobileBootstrap bootstrap({List<Map<String, Object?>>? destinations}) => MobileBootstrap.fromJson({
  'destinations': destinations ?? [sampleBeach],
  'featuredDestinations': destinations ?? [sampleBeach],
  'referenceTables': {
    'countries': [
      {'id': 1, 'name': 'Philippines', 'type': 'local'},
    ],
    'regions': [
      {'id': 4, 'name': 'CALABARZON Region'},
    ],
    'provinces': [
      {'id': 1, 'name': 'Quezon', 'region_id': 4},
    ],
    'boatTypes': [
      {'id': 1, 'name': 'Tourist Boat', 'requires_capacity_fare': false},
    ],
  },
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

MobileVisitReceipt visit({String reference = 'SURV-TEST-1', String destination = 'Sample Beach', int destinationId = 7, String status = 'pending'}) {
  return MobileVisitReceipt(
    reference: reference,
    destination: keptDestination(destinationId, destination),
    arrivalDate: DateTime(2099, 6, 1),
    totalVisitors: 3,
    status: status,
    fullName: 'Sample Person',
    contactNumber: '+639000000000',
    email: 'sample@example.test',
  );
}

MobileFeedbackReceipt feedback({String reference = '41', String destination = 'Sample Beach', int destinationId = 7}) {
  return MobileFeedbackReceipt(
    reference: reference,
    destination: keptDestination(destinationId, destination),
    reviewer: 'Sample Person',
    rating: 4,
    message: 'A made-up review.',
    reply: '',
    date: '2099-06-02',
  );
}

const profile = MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: '+639000000000');

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 6000); // tall, so that a long form is built whole
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

/// A newly opened app: a new shell (a new State), reading what the phone kept.
Future<void> openApp(WidgetTester tester, {MobileBootstrap? data, VoidCallback? onSignOut}) async {
  await tester.pumpWidget(const SizedBox()); // the old one is gone, as when the app is closed
  await tester.pumpWidget(
    MaterialApp(
      theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
      home: MobileShell(
        api: const TourismApi(),
        state: TourismBootstrapState.loaded(data ?? bootstrap()),
        onRetry: () {},
        onSignOut: onSignOut ?? () {},
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

/// A few frames, for a page whose spinner or image never lets pumpAndSettle finish.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

Future<void> openProfile(WidgetTester tester) async {
  await tester.tap(find.text('Profile').last);
  await tester.pumpAndSettle();
}

Future<void> keep({List<MobileVisitReceipt> visits = const [], List<MobileFeedbackReceipt> feedbacks = const [], MobileUserProfile? who}) async {
  const store = MyVisitsStore();
  await store.saveVisits(visits);
  await store.saveFeedback(feedbacks);
  await store.saveProfile(who ?? MobileUserProfile.guest());
}

Future<Set<String>> keptKeys() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getKeys().where((key) => key.startsWith('tourism_my_') || key == tourismProfileKey).toSet();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the store keeps the three and gives them back', () {
    test('a pass, a feedback and the profile come back as they were put', () async {
      await keep(visits: [visit()], feedbacks: [feedback()], who: profile);

      final mine = await const MyVisitsStore().read();

      expect(mine.visits, hasLength(1));
      final pass = mine.visits.single;
      expect(pass.reference, 'SURV-TEST-1');
      expect(pass.destination.name, 'Sample Beach');
      expect(pass.destination.id, 7);
      expect(pass.arrivalDate, DateTime(2099, 6, 1));
      expect(pass.totalVisitors, 3);
      expect(pass.status, 'pending');
      expect(pass.fullName, 'Sample Person');
      expect(pass.contactNumber, '+639000000000');
      expect(pass.email, 'sample@example.test');
      expect(mine.feedback, hasLength(1));
      expect(mine.feedback.single.reference, '41');
      expect(mine.feedback.single.rating, 4);
      expect(mine.feedback.single.message, 'A made-up review.');
      expect(mine.feedback.single.destination.name, 'Sample Beach');
      expect(mine.profile.name, 'Sample Person');
      expect(mine.profile.email, 'sample@example.test');
      expect(mine.profile.contactNumber, '+639000000000');
      expect(mine.profile.isGuest, isFalse);
    });

    test('the keys carry a version, and the order of the passes is kept (newest first)', () async {
      await keep(visits: [visit(reference: 'NEW-2'), visit(reference: 'OLD-1')], feedbacks: [feedback()], who: profile);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), containsAll(['tourism_my_visits_v1', 'tourism_my_feedback_v1', 'tourism_profile_v1']));
      final mine = await const MyVisitsStore().read();
      expect(mine.visits.map((item) => item.reference), ['NEW-2', 'OLD-1']);
    });

    test('nothing kept: empty, a guest', () async {
      final mine = await const MyVisitsStore().read();

      expect(mine.visits, isEmpty);
      expect(mine.feedback, isEmpty);
      expect(mine.profile.isGuest, isTrue);
      expect(mine.isEmpty, isTrue);
    });

    test('saving an empty profile keeps no profile at all', () async {
      await keep(who: profile);
      await const MyVisitsStore().saveProfile(MobileUserProfile.guest());

      expect((await SharedPreferences.getInstance()).containsKey('tourism_profile_v1'), isFalse);
    });
  });

  group('a copy that is damaged or incomplete never crashes the app', () {
    test('text that is not JSON: nothing kept, no error', () async {
      SharedPreferences.setMockInitialValues({
        'tourism_my_visits_v1': ['this is not json', '{broken'],
        'tourism_my_feedback_v1': ['[1,2,3]'],
        'tourism_profile_v1': 'also not json',
      });

      final mine = await const MyVisitsStore().read();

      expect(mine.visits, isEmpty);
      expect(mine.feedback, isEmpty);
      expect(mine.profile.isGuest, isTrue);
    });

    test('a value of another kind under the key: nothing kept, no error', () async {
      SharedPreferences.setMockInitialValues({
        'tourism_my_visits_v1': 'a string where a list belongs',
        'tourism_my_feedback_v1': 12,
        'tourism_profile_v1': ['a', 'list', 'where', 'a', 'string', 'belongs'],
      });

      final mine = await const MyVisitsStore().read();

      expect(mine.isEmpty, isTrue);
    });

    test('an item with parts missing is left out, and the good ones stay', () async {
      final good = jsonEncode(visit(reference: 'GOOD-1').toStoredJson());
      SharedPreferences.setMockInitialValues({
        'tourism_my_visits_v1': [
          jsonEncode({'reference': 'NO-DESTINATION', 'arrival_date': '2099-06-01T00:00:00.000'}),
          jsonEncode({'destination_name': 'Sample Beach', 'arrival_date': '2099-06-01T00:00:00.000'}),
          jsonEncode({'reference': 'NO-DATE', 'destination_name': 'Sample Beach'}),
          jsonEncode({'reference': 'BAD-DATE', 'destination_name': 'Sample Beach', 'arrival_date': 'tomorrow-ish'}),
          good,
          jsonEncode(['not', 'a', 'map']),
        ],
        'tourism_my_feedback_v1': [
          jsonEncode({'reference': '', 'destination_name': 'Sample Beach'}),
          jsonEncode(feedback(reference: '9').toStoredJson()),
        ],
        'tourism_profile_v1': jsonEncode({'email': 'sample@example.test'}), // no name: it is not a profile
      });

      final mine = await const MyVisitsStore().read();

      expect(mine.visits.map((item) => item.reference), ['GOOD-1']);
      expect(mine.feedback.map((item) => item.reference), ['9']);
      expect(mine.profile.isGuest, isTrue);
    });

    testWidgets('the app opens with nothing in it, and goes on, when what was kept is damaged', (tester) async {
      bigScreen(tester);
      SharedPreferences.setMockInitialValues({
        'tourism_my_visits_v1': ['{broken', jsonEncode({'reference': 'X'})],
        'tourism_my_feedback_v1': 5,
        'tourism_profile_v1': '###',
      });

      await openApp(tester);
      await openProfile(tester);

      expect(tester.takeException(), isNull);
      expect(find.text('Visit History & Entry Passes (0)'), findsOneWidget);
      expect(find.text('My Submitted Feedback (0)'), findsOneWidget);
      expect(find.text('Not provided yet'), findsWidgets);
    });

    test('it is written over, not stuck: the next save replaces what was damaged', () async {
      SharedPreferences.setMockInitialValues({'tourism_my_visits_v1': 'broken'});
      await const MyVisitsStore().saveVisits([visit()]);

      expect((await const MyVisitsStore().read()).visits.single.reference, 'SURV-TEST-1');
    });
  });

  group('opening the app again', () {
    testWidgets('the passes, the feedback and the profile are there, and the (N) counts are right', (tester) async {
      bigScreen(tester);
      await keep(
        visits: [visit(reference: 'SURV-TEST-2'), visit(reference: 'SURV-TEST-1')],
        feedbacks: [feedback()],
        who: profile,
      );

      await openApp(tester);
      await openProfile(tester);

      expect(find.text('Visit History & Entry Passes (2)'), findsOneWidget);
      expect(find.text('My Submitted Feedback (1)'), findsOneWidget);
      expect(find.text('Sample Person'), findsWidgets);
      expect(find.text('sample@example.test'), findsOneWidget);
      expect(find.text('+639000000000'), findsOneWidget);
    });

    testWidgets('My Visit shows the pass that was kept', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit()], who: profile);

      await openApp(tester);
      await tester.tap(find.text('My Visit').last);
      await tester.pumpAndSettle();

      expect(find.textContaining('SURV-TEST-1'), findsWidgets);
      expect(find.text('Sample Beach'), findsWidgets);
    });

    testWidgets('the visit history page lists the kept pass', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit()], who: profile);

      await openApp(tester);
      await openProfile(tester);
      await tester.tap(find.text('Visit History & Entry Passes (1)'));
      await tester.pumpAndSettle();

      expect(find.text('No submitted visits yet'), findsNothing);
      expect(find.textContaining('PASS REF: SURV-TEST-1'), findsOneWidget);
    });

    testWidgets('a destination that is no longer in the bootstrap still shows its pass, by the name that was kept', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit(destination: 'Gone Cove', destinationId: 99)], feedbacks: [feedback(destination: 'Gone Cove', destinationId: 99)], who: profile);

      await openApp(tester, data: bootstrap()); // the bootstrap has Sample Beach (7) only
      await openProfile(tester);
      await tester.tap(find.text('Visit History & Entry Passes (1)'));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Gone Cove'), findsWidgets);
      expect(find.textContaining('PASS REF: SURV-TEST-1'), findsOneWidget);
    });

    testWidgets('a destination that is still there is the bootstrap\'s own (its name as the server now says it)', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit(destination: 'Old Name', destinationId: 7)], who: profile);

      await openApp(tester); // destination 7 is "Sample Beach" in the bootstrap
      await openProfile(tester);
      await tester.tap(find.text('Visit History & Entry Passes (1)'));
      await tester.pumpAndSettle();

      expect(find.text('Sample Beach'), findsWidgets);
      expect(find.text('Old Name'), findsNothing);
    });

    test('resolveDestination: the bootstrap\'s when it has it, the kept one when it does not or is not here yet', () {
      final kept = keptDestination(7, 'Old Name');
      final live = Destination.fromJson(sampleBeach);

      expect(resolveDestination(kept, [live]).name, 'Sample Beach');
      expect(resolveDestination(kept, [Destination.fromJson({...sampleBeach, 'resort_id': 8})]).name, 'Old Name');
      expect(resolveDestination(kept, const []).name, 'Old Name');
      expect(resolveDestination(kept, null).name, 'Old Name');
    });
  });

  group('after registering and after sending feedback, it is kept', () {
    final responses = <http.Request>[];

    Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
      body,
      () => MockClient((request) async {
        responses.add(request);
        final path = request.url.path;
        if (path.endsWith('/mobile/tourism/register-visit/')) {
          return http.Response(
            jsonEncode({
              'survey_id': 'SURV-NEW-1',
              'full_name': 'Sample Person',
              'contact_number': '+639000000000',
              'email': 'sample@example.test',
              'status': 'pending',
              'total_visitors': 1,
            }),
            201,
          );
        }
        if (path.endsWith('/mobile/tourism/feedback/')) {
          return http.Response(
            jsonEncode({'id': 77, 'reviewer': 'Sample Person', 'rating': 5, 'message': 'A made-up review.', 'date': '2099-06-02'}),
            201,
          );
        }
        if (path.contains('/mobile/tourism/destinations/')) {
          return http.Response(jsonEncode({'destination': sampleBeach, 'recentFeedback': <dynamic>[]}), 200);
        }
        return http.Response('', 404);
      }),
    );

    setUp(responses.clear);

    // From a destination (its "Plan Visit / Get Pass"), so that the form starts with that destination chosen, as a tourist who tapped it; or,
    // with [fromMyVisit], from the My Visit tab, choosing the destination in the form. With [closeDialog] false the pass is left open.
    Future<void> register(WidgetTester tester, {bool closeDialog = true, bool fromMyVisit = false}) async {
      await mocked(() async {
        if (fromMyVisit) {
          await tester.tap(find.text('My Visit').last);
          await settle(tester);
          await tester.tap(find.text('Register / Get Pass'));
          await settle(tester);
          final tile = find.byWidgetPredicate((w) => w is DropdownTile<Destination?> && w.label == 'Destination / Resort *');
          await tester.ensureVisible(tile);
          await tester.tap(find.descendant(of: tile, matching: find.byType(DropdownButtonFormField<Destination?>)));
          await settle(tester);
          await tester.tap(find.text('Sample Beach').last);
          await settle(tester);
        } else {
          await tester.tap(find.text('Explore').last);
          await settle(tester);
          await tester.tap(find.text('Sample Beach').first);
          await settle(tester);
          await tester.tap(find.widgetWithText(FilledButton, 'Plan Visit / Get Pass'));
          await settle(tester);
        }
        await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
        await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
        await tester.enterText(find.widgetWithText(TextField, 'Contact number *'), '09000000000');
        await tester.enterText(find.widgetWithText(TextField, 'Email address (Optional)'), 'sample@example.test');
        final button = find.text('Submit Registration');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        await settle(tester);
        if (closeDialog) {
          await tester.tap(find.byIcon(Icons.close).last);
          await settle(tester);
        }
      });
    }

    // From a destination's "Review". With [closeDialog] false the "Feedback sent" dialog is left open.
    Future<void> sendFeedback(WidgetTester tester, {bool closeDialog = true}) async {
      await tester.tap(find.text('Explore').last);
      await tester.pump(const Duration(milliseconds: 300));
      await mocked(() async {
        await tester.tap(find.text('Sample Beach').first);
        await settle(tester);
        await tester.tap(find.widgetWithText(OutlinedButton, 'Review'));
        await settle(tester);
        await tester.enterText(find.widgetWithText(TextField, 'Your name'), 'Sample Person');
        await tester.enterText(find.widgetWithText(TextField, 'What did you like?'), 'A made-up review.');
        final submit = find.text('Submit Feedback');
        await tester.ensureVisible(submit);
        await tester.tap(submit);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        await settle(tester);
        if (closeDialog) {
          await tester.tap(find.widgetWithText(FilledButton, 'Done'));
          await settle(tester);
        }
      });
    }

    testWidgets('a registered visit is kept, and is there when the app is opened again', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await register(tester);
      expect(responses.where((r) => r.url.path.endsWith('/register-visit/')), hasLength(1), reason: 'the form was not submitted');

      final kept = await const MyVisitsStore().read();
      expect(kept.visits, hasLength(1));
      expect(kept.visits.single.reference, 'SURV-NEW-1');
      expect(kept.visits.single.destination.name, 'Sample Beach');
      expect(kept.profile.name, 'Sample Person');
      expect(kept.profile.email, 'sample@example.test');
      expect(kept.profile.contactNumber, '+639000000000');

      await openApp(tester); // closed and opened again
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (1)'), findsOneWidget);
      expect(find.text('Sample Person'), findsWidgets);
      expect(find.text('sample@example.test'), findsOneWidget);
    });

    testWidgets('a second pass is added to the first, newest first, and both are kept', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit(reference: 'SURV-OLD-1')], who: profile);
      await openApp(tester);
      await register(tester);

      final kept = await const MyVisitsStore().read();
      expect(kept.visits.map((item) => item.reference), ['SURV-NEW-1', 'SURV-OLD-1']);
    });

    testWidgets('feedback that was sent is kept, and its (N) is right when the app is opened again', (tester) async {
      bigScreen(tester);
      // a review is for someone whose visit here was scanned on arrival
      await keep(visits: [visit(reference: 'SURV-SCANNED-1', status: 'arrived')], who: profile);
      await openApp(tester);
      await sendFeedback(tester);
      expect(responses.where((r) => r.url.path.endsWith('/feedback/')), hasLength(1), reason: 'the feedback was not sent');

      final kept = await const MyVisitsStore().read();
      expect(kept.feedback, hasLength(1));
      expect(kept.feedback.single.reference, '77');
      expect(kept.feedback.single.destination.name, 'Sample Beach');
      expect(kept.profile.name, 'Sample Person');

      await openApp(tester);
      await openProfile(tester);
      expect(find.text('My Submitted Feedback (1)'), findsOneWidget);
    });
  });

  // The pass and the feedback are recorded and kept the moment the server answers, BEFORE the pass or the "Feedback sent" dialog is shown, so
  // that closing the app with either still open loses nothing. Closing it afterwards hands the same receipt over a second time: it is taken once.
  group('it is kept the moment the server answers, before the pass or the dialog is closed', () {
    final responses = <http.Request>[];

    Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
      body,
      () => MockClient((request) async {
        responses.add(request);
        final path = request.url.path;
        if (path.endsWith('/mobile/tourism/register-visit/')) {
          return http.Response(
            jsonEncode({
              'survey_id': 'SURV-NEW-1',
              'full_name': 'Sample Person',
              'contact_number': '+639000000000',
              'email': 'sample@example.test',
              'status': 'pending',
              'total_visitors': 1,
            }),
            201,
          );
        }
        if (path.endsWith('/mobile/tourism/feedback/')) {
          return http.Response(
            jsonEncode({'id': 77, 'reviewer': 'Sample Person', 'rating': 5, 'message': 'A made-up review.', 'date': '2099-06-02'}),
            201,
          );
        }
        if (path.contains('/mobile/tourism/destinations/')) {
          return http.Response(jsonEncode({'destination': sampleBeach, 'recentFeedback': <dynamic>[]}), 200);
        }
        return http.Response('', 404);
      }),
    );

    setUp(responses.clear);

    // From a destination (its "Plan Visit / Get Pass"), so that the form starts with that destination chosen, as a tourist who tapped it; or,
    // with [fromMyVisit], from the My Visit tab, choosing the destination in the form. With [closeDialog] false the pass is left open.
    Future<void> register(WidgetTester tester, {bool closeDialog = true, bool fromMyVisit = false}) async {
      await mocked(() async {
        if (fromMyVisit) {
          await tester.tap(find.text('My Visit').last);
          await settle(tester);
          await tester.tap(find.text('Register / Get Pass'));
          await settle(tester);
          final tile = find.byWidgetPredicate((w) => w is DropdownTile<Destination?> && w.label == 'Destination / Resort *');
          await tester.ensureVisible(tile);
          await tester.tap(find.descendant(of: tile, matching: find.byType(DropdownButtonFormField<Destination?>)));
          await settle(tester);
          await tester.tap(find.text('Sample Beach').last);
          await settle(tester);
        } else {
          await tester.tap(find.text('Explore').last);
          await settle(tester);
          await tester.tap(find.text('Sample Beach').first);
          await settle(tester);
          await tester.tap(find.widgetWithText(FilledButton, 'Plan Visit / Get Pass'));
          await settle(tester);
        }
        await tester.enterText(find.widgetWithText(TextField, 'First name *'), 'sample');
        await tester.enterText(find.widgetWithText(TextField, 'Last name *'), 'person');
        await tester.enterText(find.widgetWithText(TextField, 'Contact number *'), '09000000000');
        await tester.enterText(find.widgetWithText(TextField, 'Email address (Optional)'), 'sample@example.test');
        final button = find.text('Submit Registration');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        await settle(tester);
        if (closeDialog) {
          await tester.tap(find.byIcon(Icons.close).last);
          await settle(tester);
        }
      });
    }

    // From a destination's "Review". With [closeDialog] false the "Feedback sent" dialog is left open.
    Future<void> sendFeedback(WidgetTester tester, {bool closeDialog = true}) async {
      await tester.tap(find.text('Explore').last);
      await tester.pump(const Duration(milliseconds: 300));
      await mocked(() async {
        await tester.tap(find.text('Sample Beach').first);
        await settle(tester);
        await tester.tap(find.widgetWithText(OutlinedButton, 'Review'));
        await settle(tester);
        await tester.enterText(find.widgetWithText(TextField, 'Your name'), 'Sample Person');
        await tester.enterText(find.widgetWithText(TextField, 'What did you like?'), 'A made-up review.');
        final submit = find.text('Submit Feedback');
        await tester.ensureVisible(submit);
        await tester.tap(submit);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        await settle(tester);
        if (closeDialog) {
          await tester.tap(find.widgetWithText(FilledButton, 'Done'));
          await settle(tester);
        }
      });
    }

    testWidgets('the pass is kept while it is still open, and is there if the app is opened again at that point', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await register(tester, closeDialog: false);

      expect(find.byType(TouristDigitalPassModal), findsOneWidget, reason: 'the pass must still be open');
      expect(responses.where((r) => r.url.path.endsWith('/register-visit/')), hasLength(1));
      final kept = await const MyVisitsStore().read();
      expect(kept.visits.map((item) => item.reference), ['SURV-NEW-1']);
      expect(kept.profile.name, 'Sample Person');
      expect(kept.profile.email, 'sample@example.test');

      await openApp(tester); // the app is killed with the pass open, and opened again
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (1)'), findsOneWidget);
      expect(find.text('Sample Person'), findsWidgets);
    });

    testWidgets('the same from My Visit, where the destination is chosen in the form', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await register(tester, closeDialog: false, fromMyVisit: true);

      expect(find.byType(TouristDigitalPassModal), findsOneWidget);
      expect((await const MyVisitsStore().read()).visits.map((item) => item.reference), ['SURV-NEW-1']);
    });

    testWidgets('the feedback is kept while the "Feedback sent" dialog is still open, and is there if the app is opened again', (tester) async {
      bigScreen(tester);
      // a review is for someone whose visit here was scanned on arrival
      await keep(visits: [visit(reference: 'SURV-SCANNED-1', status: 'arrived')], who: profile);
      await openApp(tester);
      await sendFeedback(tester, closeDialog: false);

      expect(find.text('Feedback sent'), findsOneWidget, reason: 'the dialog must still be open');
      expect(responses.where((r) => r.url.path.endsWith('/feedback/')), hasLength(1));
      final kept = await const MyVisitsStore().read();
      expect(kept.feedback.map((item) => item.reference), ['77']);
      expect(kept.profile.name, 'Sample Person');

      await openApp(tester);
      await openProfile(tester);
      expect(find.text('My Submitted Feedback (1)'), findsOneWidget);
    });

    testWidgets('closing the pass does not make a second one: one in the list, one in storage, (1) on the Profile', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await register(tester, closeDialog: true);

      expect((await const MyVisitsStore().read()).visits, hasLength(1));
      await tester.pageBack(); // back from the destination's page to the tabs
      await settle(tester);
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (1)'), findsOneWidget); // the same app, not reopened: the list in memory
      await openApp(tester);
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (1)'), findsOneWidget);
    });

    testWidgets('closing the pass opened from My Visit does not double it either', (tester) async {
      bigScreen(tester);
      await openApp(tester);
      await register(tester, closeDialog: true, fromMyVisit: true);

      expect((await const MyVisitsStore().read()).visits, hasLength(1));
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (1)'), findsOneWidget);
    });

    testWidgets('closing the "Feedback sent" dialog does not make a second feedback', (tester) async {
      bigScreen(tester);
      // a review is for someone whose visit here was scanned on arrival
      await keep(visits: [visit(reference: 'SURV-SCANNED-1', status: 'arrived')], who: profile);
      await openApp(tester);
      await sendFeedback(tester, closeDialog: true);

      expect((await const MyVisitsStore().read()).feedback, hasLength(1));
      await tester.pageBack(); // back from the destination's page to the tabs
      await settle(tester);
      await openProfile(tester);
      expect(find.text('My Submitted Feedback (1)'), findsOneWidget);
    });
  });

  group('Sign Out takes everything off the phone', () {
    testWidgets('the confirmation says what will be lost, in numbers, and that the passes cannot be shown again', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit(reference: 'A'), visit(reference: 'B')], feedbacks: [feedback()], who: profile);
      await openApp(tester);
      await openProfile(tester);

      await tester.ensureVisible(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.pumpAndSettle();

      expect(find.textContaining('removes these from this phone'), findsOneWidget);
      expect(find.textContaining('2 entry passes'), findsOneWidget);
      expect(find.textContaining('1 feedback you sent'), findsOneWidget);
      expect(find.textContaining('your profile (name, email and contact number)'), findsOneWidget);
      expect(find.textContaining('will not be able to show these entry passes again'), findsOneWidget);
    });

    test('signOutNotice: singular, and nothing-to-lose, are said plainly', () {
      expect(signOutNotice(visits: 1, feedback: 0, hasProfile: false), contains('1 entry pass\n'));
      expect(signOutNotice(visits: 1, feedback: 0, hasProfile: false), isNot(contains('feedback')));
      expect(signOutNotice(visits: 0, feedback: 0, hasProfile: false), contains('Nothing about you is saved on this phone'));
    });

    testWidgets('Cancel keeps everything', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit()], feedbacks: [feedback()], who: profile);
      var signedOut = false;
      await openApp(tester, onSignOut: () => signedOut = true);
      await openProfile(tester);

      await tester.ensureVisible(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(signedOut, isFalse);
      expect(await keptKeys(), containsAll(['tourism_my_visits_v1', 'tourism_my_feedback_v1', 'tourism_profile_v1']));
      expect(find.text('Visit History & Entry Passes (1)'), findsOneWidget);
    });

    testWidgets('confirming leaves nothing in storage, and the Profile is empty, and the next person finds nothing', (tester) async {
      bigScreen(tester);
      await keep(visits: [visit()], feedbacks: [feedback()], who: profile);
      var signedOut = false;
      await openApp(tester, onSignOut: () => signedOut = true);
      await openProfile(tester);

      await tester.ensureVisible(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Sign Out'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Sign Out'));
      await tester.pumpAndSettle();

      expect(signedOut, isTrue);
      expect(await keptKeys(), isEmpty);
      final mine = await const MyVisitsStore().read();
      expect(mine.isEmpty, isTrue);

      // the same screen, still open, now shows nobody
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (0)'), findsOneWidget);
      expect(find.text('My Submitted Feedback (0)'), findsOneWidget);
      expect(find.text('Sample Person'), findsNothing);
      expect(find.text('sample@example.test'), findsNothing);

      // and the next person who opens the app on this phone
      await openApp(tester);
      await openProfile(tester);
      expect(find.text('Visit History & Entry Passes (0)'), findsOneWidget);
      expect(find.text('Sample Person'), findsNothing);
    });

    test('clear() reports that nothing is left', () async {
      await keep(visits: [visit()], feedbacks: [feedback()], who: profile);

      expect(await const MyVisitsStore().clear(), isTrue);
      expect(await keptKeys(), isEmpty);
    });

    test('clear() with nothing kept is fine', () async {
      expect(await const MyVisitsStore().clear(), isTrue);
    });
  });
}
