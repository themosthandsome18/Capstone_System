// What the tourism app says when the bootstrap fails, and how it decides.
//
// Two answers for the user: the connection ("Can't reach the server.") or the
// server ("The server is having a problem."). A 2xx that is not a JSON object
// used to come back as {} and read as "no data"; it must be an error.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart'
    show bootstrapWith, expectNoEmptyMessage, openHome;

/// Answers each `fetchBootstrap()` call in turn.
class SequenceApi extends TourismApi {
  SequenceApi(this._answers);

  final List<Future<MobileBootstrap> Function()> _answers;
  int calls = 0;

  @override
  Future<MobileBootstrap> fetchBootstrap() => _answers[calls++]();
}

Future<MobileBootstrap> Function() fails(Object error) =>
    () => Future<MobileBootstrap>.error(error);

const connectionTitle = "Can't reach the server.";
const connectionBody = 'Check your internet connection, then try again.';
const serverTitle = 'The server is having a problem.';
const serverBody = 'Please try again in a moment.';

/// Runs [body] with `http` answering through [handler].
Future<T> withHttp<T>(
  Future<http.Response> Function(http.Request) handler,
  Future<T> Function() body,
) => http.runWithClient(body, () => MockClient(handler));

Future<void> expectApiError(
  Future<Object?> future,
  int status,
) async {
  try {
    await future;
  } on ApiException catch (error) {
    expect(error.statusCode, status);
    return;
  }
  fail('expected an ApiException, got a value');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('classifyBootstrapFailure', () {
    test('timeout', () {
      expect(
        classifyBootstrapFailure(TimeoutException('slow')),
        BootstrapFailureKind.timeout,
      );
    });

    test('5xx and 4xx are the server', () {
      for (final status in [500, 502, 503, 404, 401]) {
        expect(
          classifyBootstrapFailure(ApiException(statusCode: status, message: '')),
          BootstrapFailureKind.server,
          reason: '$status',
        );
      }
    });

    test('a 2xx that cannot be read is the server', () {
      expect(
        classifyBootstrapFailure(
          const ApiException(statusCode: 200, message: 'unreadable'),
        ),
        BootstrapFailureKind.server,
      );
      expect(
        classifyBootstrapFailure(const FormatException('bad json')),
        BootstrapFailureKind.server,
      );
    });

    test('anything else is the network', () {
      for (final error in <Object>[
        const SocketException('no route'),
        http.ClientException('blocked'),
        Exception('whatever'),
      ]) {
        expect(
          classifyBootstrapFailure(error),
          BootstrapFailureKind.network,
          reason: '${error.runtimeType}',
        );
      }
    });
  });

  group('the real api: fetchBootstrap and _decode', () {
    test('a 2xx that is not an object throws, it is not {}', () async {
      for (final body in ['[]', '"hello"', 'null', 'not json at all', '12']) {
        await expectApiError(
          withHttp(
            (_) async => http.Response(body, 200),
            () => const TourismApi().fetchBootstrap(),
          ),
          200,
        );
      }
    });

    test('an object the app cannot read is an ApiException, not a crash', () async {
      await expectApiError(
        withHttp(
          (_) async => http.Response('{"referenceTables":"oops"}', 200),
          () => const TourismApi().fetchBootstrap(),
        ),
        200,
      );
    });

    test('the shared decoder is strict for the other endpoints too', () async {
      await expectApiError(
        withHttp(
          (_) async => http.Response('[]', 200),
          () => const TourismApi().fetchDestinationDetail(1),
        ),
        200,
      );
    });

    test('an empty body is still an empty object, not an error', () async {
      final detail = await withHttp(
        (_) async => http.Response('', 200),
        () => const TourismApi().fetchDestinationDetail(1),
      );
      expect(detail, isEmpty);
    });

    test('a good answer still loads', () async {
      final bootstrap = await withHttp(
        (_) async => http.Response(
          '{"destinations":[{"resort_id":1,"resort_name":"Sample Beach 1"}],'
          '"featuredDestinations":[],"referenceTables":{},"barangays":[],'
          '"notifications":[]}',
          200,
        ),
        () => const TourismApi().fetchBootstrap(),
      );
      expect(bootstrap.destinations, hasLength(1));
    });

    test('a 5xx is an ApiException carrying its status', () async {
      for (final status in [500, 502, 503]) {
        await expectApiError(
          withHttp(
            (_) async => http.Response('', status),
            () => const TourismApi().fetchBootstrap(),
          ),
          status,
        );
      }
    });

    test('a 4xx is an ApiException carrying its status', () async {
      await expectApiError(
        withHttp(
          (_) async => http.Response('{"detail":"nope"}', 404),
          () => const TourismApi().fetchBootstrap(),
        ),
        404,
      );
    });

    test('a connection that fails is not an ApiException', () async {
      Object? caught;
      try {
        await withHttp(
          (_) async => throw http.ClientException('blocked'),
          () => const TourismApi().fetchBootstrap(),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught, isA<http.ClientException>());
      expect(classifyBootstrapFailure(caught!), BootstrapFailureKind.network);
    });

    testWidgets('the timeout is still 90 seconds, and is the timeout kind', (
      tester,
    ) async {
      final never = Completer<http.Response>();
      var settled = false;
      Object? caught;
      final future = withHttp(
        (_) => never.future,
        () => const TourismApi().fetchBootstrap(),
      ).then<void>((_) => settled = true).catchError((Object e) {
        settled = true;
        caught = e;
      });

      await tester.pump(const Duration(seconds: 89));
      expect(settled, isFalse, reason: 'must not give up before 90 s');
      await tester.pump(const Duration(seconds: 2));
      await future;

      expect(caught, isA<TimeoutException>());
      expect(
        classifyBootstrapFailure(caught!),
        BootstrapFailureKind.timeout,
      );
    });
  });

  group('what the user sees', () {
    Future<void> failWith(WidgetTester tester, Object error) async {
      await openHome(tester, SequenceApi([fails(error)]));
      await tester.pump();
      await tester.pump();
    }

    for (final error in <String, Object>{
      'a timeout': TimeoutException('slow'),
      'a network error': const SocketException('no route'),
      'a blocked browser request': http.ClientException('blocked'),
    }.entries) {
      testWidgets('${error.key}: the connection message', (tester) async {
        await failWith(tester, error.value);

        expect(find.text(connectionTitle), findsOneWidget);
        expect(find.text(connectionBody), findsOneWidget);
        expect(find.text(serverTitle), findsNothing);
        expect(find.text('Try again'), findsOneWidget);
        expect(find.byType(DestinationListSkeleton), findsNothing);
        expectNoEmptyMessage();
      });
    }

    for (final error in <String, Object>{
      'a 503': const ApiException(statusCode: 503, message: 'down'),
      'a 404': const ApiException(statusCode: 404, message: 'gone'),
      'a 2xx that cannot be read': const ApiException(
        statusCode: 200,
        message: 'unreadable',
      ),
    }.entries) {
      testWidgets('${error.key}: the server message', (tester) async {
        await failWith(tester, error.value);

        expect(find.text(serverTitle), findsOneWidget);
        expect(find.text(serverBody), findsOneWidget);
        expect(find.text(connectionTitle), findsNothing);
        expect(find.text('Try again'), findsOneWidget);
        expectNoEmptyMessage();
      });
    }

    testWidgets('Try again goes back to loading, then loads', (tester) async {
      final second = Completer<MobileBootstrap>();
      final api = SequenceApi([
        fails(const SocketException('no route')),
        () => second.future,
      ]);
      await openHome(tester, api);
      await tester.pump();
      await tester.pump();
      expect(find.text(connectionTitle), findsOneWidget);
      expect(api.calls, 1);

      await tester.tap(find.text('Try again'));
      await tester.pump();

      // Back to loading: the skeletons again, no panel, no empty message.
      expect(api.calls, 2);
      expect(find.text(connectionTitle), findsNothing);
      expect(find.text('Try again'), findsNothing);
      expect(find.byType(FeaturedCarouselSkeleton), findsOneWidget);
      expect(find.byType(DestinationListSkeleton), findsOneWidget);
      expectNoEmptyMessage();

      second.complete(bootstrapWith(3));
      await tester.pump();
      await tester.pump();
      expect(find.byType(DestinationListSkeleton), findsNothing);
      expect(find.text('Sample Beach 1'), findsWidgets);
      expect(find.text(connectionTitle), findsNothing);
    });

    testWidgets('a second failure shows the panel again', (tester) async {
      final api = SequenceApi([
        fails(const SocketException('no route')),
        fails(const ApiException(statusCode: 503, message: 'down')),
      ]);
      await openHome(tester, api);
      await tester.pump();
      await tester.pump();
      expect(find.text(connectionTitle), findsOneWidget);

      await tester.tap(find.text('Try again'));
      await tester.pump();
      await tester.pump();

      expect(find.text(serverTitle), findsOneWidget);
      expect(find.text(connectionTitle), findsNothing);
    });

    testWidgets('Explore shows the panel and retries', (tester) async {
      final second = Completer<MobileBootstrap>();
      final api = SequenceApi([
        fails(const SocketException('no route')),
        () => second.future,
      ]);
      await openHome(tester, api);
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Explore'));
      await tester.pump();
      expect(find.text(connectionTitle), findsOneWidget);
      expect(find.text('No destinations found'), findsNothing);

      await tester.tap(find.text('Try again'));
      await tester.pump();
      expect(find.byType(DestinationListSkeleton), findsOneWidget);
    });

    testWidgets('My Visit says why Register is off, and can retry', (
      tester,
    ) async {
      final second = Completer<MobileBootstrap>();
      final api = SequenceApi([
        fails(const ApiException(statusCode: 503, message: 'down')),
        () => second.future,
      ]);
      await openHome(tester, api);
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('My Visit'));
      await tester.pump();

      final register = find.widgetWithText(FilledButton, 'Register / Get Pass');
      expect(tester.widget<FilledButton>(register).onPressed, isNull);
      expect(find.text(serverTitle), findsOneWidget);
      expect(
        find.text(
          'You can register a visit once the destinations have loaded.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Try again'));
      await tester.pump();
      expect(find.text(serverTitle), findsNothing);

      second.complete(bootstrapWith(2));
      await tester.pump();
      await tester.pump();
      expect(tester.widget<FilledButton>(register).onPressed, isNotNull);
    });
  });

  group('no orphan headings', () {
    const popular = '🔥 Most Popular Resorts';
    const gems = '💎 Hidden Gems of Mauban';
    const gemsSubtitle = 'Peaceful glamping, quiet beaches & eco-spots';

    testWidgets('failed: neither Home section, nor its heading, is shown', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(connectionTitle), findsOneWidget);
      expect(find.text(popular), findsNothing);
      expect(find.text(gems), findsNothing);
      expect(find.text(gemsSubtitle), findsNothing);
      expect(find.text('View all'), findsNothing);
    });

    testWidgets('loading: both headings are there, over skeletons', (
      tester,
    ) async {
      final never = Completer<MobileBootstrap>();
      await openHome(tester, SequenceApi([() => never.future]));

      expect(find.text(popular), findsOneWidget);
      expect(find.text(gems), findsOneWidget);
      expect(find.byType(FeaturedCarouselSkeleton), findsOneWidget);
      expect(find.byType(HiddenGemsRowSkeleton), findsOneWidget);
    });

    testWidgets('loaded: both headings are there', (tester) async {
      await openHome(
        tester,
        SequenceApi([() => Future.value(bootstrapWith(3))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(popular), findsOneWidget);
      expect(find.text(gems), findsOneWidget);
      expect(find.text(gemsSubtitle), findsOneWidget);
    });

    testWidgets('a retry that succeeds brings the headings back', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([
          fails(const SocketException('no route')),
          () => Future.value(bootstrapWith(3)),
        ]),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text(popular), findsNothing);

      await tester.tap(find.text('Try again'));
      await tester.pump();
      await tester.pump();

      expect(find.text(popular), findsOneWidget);
      expect(find.text(gems), findsOneWidget);
    });

    testWidgets('failed: the destinations list heading and View Map go too', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text(connectionTitle), findsOneWidget);
      expect(find.text('All Destinations & Resorts'), findsNothing);
      expect(find.text('View Map'), findsNothing);
    });

    testWidgets('failed, with a category chosen: no "<category> Spots" either', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Beaches'));
      await tester.pump();

      expect(find.text('Beach Resort Spots'), findsNothing);
      expect(find.text('View Map'), findsNothing);
    });

    testWidgets('loading: the list heading is there, over the skeleton', (
      tester,
    ) async {
      final never = Completer<MobileBootstrap>();
      await openHome(tester, SequenceApi([() => never.future]));

      expect(find.text('All Destinations & Resorts'), findsOneWidget);
      expect(find.text('View Map'), findsOneWidget);
      expect(find.byType(DestinationListSkeleton), findsOneWidget);
    });

    testWidgets('loaded: the list heading and View Map are there', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([() => Future.value(bootstrapWith(3))]),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text('All Destinations & Resorts'), findsOneWidget);
      expect(find.text('View Map'), findsOneWidget);
    });

    testWidgets('Map: "Nearby Places" is not shown while failed', (
      tester,
    ) async {
      await openHome(
        tester,
        SequenceApi([fails(const SocketException('no route'))]),
      );
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Map'));
      await tester.pump();

      expect(find.text(connectionTitle), findsOneWidget);
      expect(find.text('Nearby Places'), findsNothing);
    });

    testWidgets('Map: "Nearby Places" is shown when loaded', (tester) async {
      await openHome(
        tester,
        SequenceApi([() => Future.value(bootstrapWith(3))]),
      );
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Map'));
      await tester.pump();

      expect(find.text('Nearby Places'), findsOneWidget);
    });
  });
}
