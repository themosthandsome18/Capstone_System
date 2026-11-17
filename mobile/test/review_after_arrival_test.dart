// A review is for someone who has really been to the place: they have a pass for THAT destination, and its status is arrived (it was scanned on
// arrival). The Review button of a destination is shown to everyone but can be pressed only then; otherwise it says why. The review carries the survey
// ID and the contact number of the pass, and the server checks them too (this is the app's half). The people here are made up.
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
const otherCove = {
  'resort_id': 8,
  'resort_name': 'Other Cove',
  'type': 'Beach Resort',
  'location': 'Mauban, Quezon',
  'latitude': 14.3,
  'longitude': 121.8,
};

const note = 'You can review this place after your visit here is scanned on arrival.';

MobileBootstrap bootstrap() => MobileBootstrap.fromJson({
  'destinations': [sampleBeach, otherCove],
  'featuredDestinations': [sampleBeach, otherCove],
  'referenceTables': <String, dynamic>{},
  'barangays': <dynamic>[],
  'notifications': <dynamic>[],
});

MobileVisitReceipt pass(String reference, {int destinationId = 7, String destination = 'Sample Beach', String status = 'arrived', String contact = '+639000000001'}) {
  return MobileVisitReceipt(
    reference: reference,
    destination: keptDestination(destinationId, destination),
    arrivalDate: DateTime(2099, 6, 1),
    totalVisitors: 2,
    status: status,
    fullName: 'Sample Person',
    contactNumber: contact,
    email: 'sample@example.test',
  );
}

const profile = MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: '+639000000001');

class StatusApi extends TourismApi {
  StatusApi([this.answers = const {}]);

  final Map<String, MobilePassStatus?> answers;

  @override
  Future<MobilePassStatus?> fetchPassStatus({required String reference, required String contact}) async => answers[reference];
}

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 6000);
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

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

Future<void> keepPasses(List<MobileVisitReceipt> passes) async {
  await const MyVisitsStore().saveVisits(passes);
  await const MyVisitsStore().saveProfile(profile);
}

final requests = <http.Request>[];

Future<T> mocked<T>(Future<T> Function() body) => http.runWithClient(
  body,
  () => MockClient((request) async {
    requests.add(request);
    final path = request.url.path;
    if (path.endsWith('/mobile/tourism/feedback/')) {
      return http.Response(jsonEncode({'id': 77, 'reviewer': 'Sample Person', 'rating': 5, 'message': 'A made-up review.', 'date': '2099-06-02'}), 201);
    }
    if (path.contains('/mobile/tourism/destinations/7/')) {
      return http.Response(jsonEncode({'destination': sampleBeach, 'recentFeedback': <dynamic>[]}), 200);
    }
    if (path.contains('/mobile/tourism/destinations/8/')) {
      return http.Response(jsonEncode({'destination': otherCove, 'recentFeedback': <dynamic>[]}), 200);
    }
    return http.Response('', 404);
  }),
);

/// The app opened, and the destination's page opened from Explore. The destination's own call is answered by a mock.
Future<void> openDestination(WidgetTester tester, {String name = 'Sample Beach', TourismApi? api}) async {
  await tester.pumpWidget(const SizedBox());
  await mocked(() async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
        home: MobileShell(api: api ?? StatusApi(), state: TourismBootstrapState.loaded(bootstrap()), onRetry: () {}, onSignOut: () {}),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    await tester.tap(find.text('Explore').last);
    await settle(tester);
    await tester.tap(find.text(name).first);
    await settle(tester);
  });
}

Finder reviewButton() => find.widgetWithText(OutlinedButton, 'Review');
bool pressable(WidgetTester tester) => tester.widget<OutlinedButton>(reviewButton()).onPressed != null;

Future<Map<String, dynamic>> writeReview(WidgetTester tester) async {
  requests.clear();
  await mocked(() async {
    await tester.tap(reviewButton());
    await settle(tester);
    // pressing Review opens the notice first; the form opens only on "I understand"
    await tester.tap(find.byKey(const ValueKey('review-notice-understand')));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Your name'), 'Sample Person');
    await tester.enterText(find.widgetWithText(TextField, 'What did you like?'), 'A made-up review.');
    final submit = find.text('Submit Feedback');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await settle(tester);
  });
  final sent = requests.where((request) => request.url.path.endsWith('/mobile/tourism/feedback/')).toList();
  expect(sent, hasLength(1), reason: 'the review was not sent');
  return jsonDecode(sent.single.body) as Map<String, dynamic>;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    requests.clear();
  });

  group('the Review button of a destination', () {
    testWidgets('no pass at all: it is there, cannot be pressed, and says why', (tester) async {
      bigScreen(tester);
      await openDestination(tester);

      expect(reviewButton(), findsOneWidget); // not hidden
      expect(pressable(tester), isFalse);
      expect(find.text(note), findsOneWidget);
      expect(find.text(note), findsOneWidget);
    });

    testWidgets('the explanation is the exact words, under the buttons', (tester) async {
      bigScreen(tester);
      await openDestination(tester);

      expect(reviewNeedsVisitNote, note);
      final noteTop = tester.getTopLeft(find.byKey(const ValueKey('review-needs-visit-note'))).dy;
      expect(noteTop, greaterThan(tester.getBottomLeft(reviewButton()).dy));
    });

    testWidgets('a pass that is still pending: cannot be pressed, with the explanation', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'pending')]);
      await openDestination(tester);

      expect(pressable(tester), isFalse);
      expect(find.text(note), findsOneWidget);
    });

    testWidgets('a pass that was cancelled (no_show): cannot be pressed', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'no_show')]);
      await openDestination(tester);

      expect(pressable(tester), isFalse);
      expect(find.text(note), findsOneWidget);
    });

    testWidgets('a pass that was scanned on arrival here: it can be pressed, and there is no explanation', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'arrived')]);
      await openDestination(tester);

      expect(reviewButton(), findsOneWidget);
      expect(pressable(tester), isTrue);
      expect(find.text(note), findsNothing);
    });

    testWidgets('an arrived pass for ANOTHER destination does not open this one', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'arrived', destinationId: 8, destination: 'Other Cove')]);
      await openDestination(tester); // Sample Beach

      expect(pressable(tester), isFalse);
      expect(find.text(note), findsOneWidget);
    });

    testWidgets('the same pass opens the review of the destination it is for', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'arrived', destinationId: 8, destination: 'Other Cove')]);
      await openDestination(tester, name: 'Other Cove');

      expect(pressable(tester), isTrue);
      expect(find.text(note), findsNothing);
    });

    testWidgets('a pass that is pending at one place and arrived at another opens only the second', (tester) async {
      bigScreen(tester);
      await keepPasses([
        pass('SURV-2', status: 'pending', destinationId: 7, destination: 'Sample Beach'),
        pass('SURV-1', status: 'arrived', destinationId: 8, destination: 'Other Cove'),
      ]);
      await openDestination(tester);

      expect(pressable(tester), isFalse);
    });

    testWidgets('a pass that becomes Arrived in the refresh opens the review', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'pending')]);

      await openDestination(tester, api: StatusApi({'SURV-1': const MobilePassStatus(status: 'arrived')}));

      expect(pressable(tester), isTrue);
      expect(find.text(note), findsNothing);
    });
  });

  group('the review carries the visit', () {
    testWidgets('the survey ID and the contact number of the pass are sent with the review', (tester) async {
      bigScreen(tester);
      await keepPasses([pass('SURV-1', status: 'arrived', contact: '+639000000001')]);
      await openDestination(tester);

      final body = await writeReview(tester);

      expect(body['survey_id'], 'SURV-1');
      expect(body['contact_number'], '+639000000001');
      expect(body['destination_id'], '7');
      expect(body['message'], 'A made-up review.');
    });

    testWidgets('with two passes that arrived at the same place, the newest is used', (tester) async {
      bigScreen(tester);
      // the list is newest first
      await keepPasses([
        pass('SURV-NEW', status: 'arrived', contact: '+639000000002'),
        pass('SURV-OLD', status: 'arrived', contact: '+639000000001'),
      ]);
      await openDestination(tester);

      final body = await writeReview(tester);

      expect(body['survey_id'], 'SURV-NEW');
      expect(body['contact_number'], '+639000000002');
    });

    testWidgets('a newer pass that has not arrived does not take the place of an older one that has', (tester) async {
      bigScreen(tester);
      await keepPasses([
        pass('SURV-NEW', status: 'pending'),
        pass('SURV-OLD', status: 'arrived', contact: '+639000000001'),
      ]);
      await openDestination(tester);

      final body = await writeReview(tester);

      expect(body['survey_id'], 'SURV-OLD');
    });

    test('submitFeedback sends the survey ID and the contact number, and the rest as it did', () async {
      late http.Request seen;
      await http.runWithClient(
        () => const TourismApi().submitFeedback(
          destinationId: 7,
          surveyId: 'SURV-1',
          contactNumber: '+639000000001',
          reviewer: 'Sample Person',
          rating: 4,
          message: 'A made-up review.',
          cleanlinessRating: 5,
          sanitationComment: 'Clean',
        ),
        () => MockClient((request) async {
          seen = request;
          return http.Response('{"id": 1}', 201);
        }),
      );

      final body = jsonDecode(seen.body) as Map<String, dynamic>;
      expect(seen.url.path, endsWith('/mobile/tourism/feedback/'));
      expect(body, {
        'destination_id': '7',
        'survey_id': 'SURV-1',
        'contact_number': '+639000000001',
        'reviewer': 'Sample Person',
        'rating': '4',
        'message': 'A made-up review.',
        'cleanliness_rating': '5',
        'sanitation_comment': 'Clean',
      });
    });
  });
}
