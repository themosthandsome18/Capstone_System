import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'sanitation_household_edit_preservation_test.dart' show storedHousehold;

final photoBytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAAE0lEQVR4nGP8z0AYMBGhZpgrAgAwUAEPZ+AT8AAAAABJRU5ErkJggg==',
);

class PhotoPicker extends ImagePicker {
  XFile? result = XFile.fromData(
    photoBytes,
    name: 'front.png',
    mimeType: 'image/png',
  );
  Object? failure;
  Completer<XFile?>? pending;
  ImageSource? source;
  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async {
    this.source = source;
    if (failure != null) throw failure!;
    return pending == null ? result : await pending!.future;
  }
}

Future<void> panel(WidgetTester tester, PhotoPicker picker) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: HouseholdFrontPhotoPanel(
            api: const TourismApi(),
            householdId: 71,
            imagePicker: picker,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

http.Response saved() => http.Response.bytes(
  photoBytes,
  200,
  headers: {'content-type': 'image/png'},
);
http.Response none() => http.Response('{}', 404);
http.Response successfulSave() =>
    http.Response('{"has_front_photo":true,"cleanup_pending":false}', 200);

void main() {
  setUp(
    () => SharedPreferences.setMockInitialValues({
      staffAuthTokenKey: 'synthetic-session',
    }),
  );
  testWidgets('existing household offers camera and gallery actions', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 5000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: HouseholdSurveyPage(
          api: const TourismApi(),
          barangays: SanitationBootstrap.fallback().barangays,
          household: HouseholdSanitationItem.fromJson(storedHousehold()),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Take Photo'), findsOneWidget);
    expect(find.text('Choose from Gallery'), findsOneWidget);
  });

  for (final source in [ImageSource.camera, ImageSource.gallery]) {
    testWidgets('$source previews then explicitly confirms save', (
      tester,
    ) async {
      final picker = PhotoPicker();
      final requests = <http.Request>[];
      var hasPhoto = false;
      final client = MockClient((request) async {
        requests.add(request);
        expect(request.headers['authorization'], 'Token synthetic-session');
        expect(request.url.path, '/api/households/records/71/front-photo/');
        if (request.method == 'PUT') {
          hasPhoto = true;
          expect(
            utf8.decode(request.bodyBytes, allowMalformed: true),
            contains('name="photo"'),
          );
          expect(
            request.headers['content-type'],
            startsWith('multipart/form-data;'),
          );
          return successfulSave();
        }
        return hasPhoto ? saved() : none();
      });
      await http.runWithClient(() async {
        await panel(tester, picker);
        expect(find.text('No front photo saved.'), findsOneWidget);
        await tester.tap(
          find.text(
            source == ImageSource.camera ? 'Take Photo' : 'Choose from Gallery',
          ),
        );
        await tester.pumpAndSettle();
        expect(picker.source, source);
        expect(find.text('Preview — not saved'), findsOneWidget);
        expect(requests.where((request) => request.method == 'PUT'), isEmpty);
        await tester.tap(find.text('Save Photo'));
        await tester.pumpAndSettle();
        expect(requests.where((request) => request.method == 'PUT'), isEmpty);
        await tester.tap(find.text('Confirm'));
        await tester.pumpAndSettle();
        expect(find.text('Photo saved.'), findsOneWidget);
        expect(find.text('Preview — not saved'), findsNothing);
        expect(requests.where((request) => request.method == 'PUT').length, 1);
        expect(requests.where((request) => request.method == 'GET').length, 2);
        await tester.pumpWidget(const SizedBox());
      }, () => client);
      client.close();
    });
  }

  testWidgets(
    'replace confirmation cancellation preserves saved image and sends no PUT',
    (tester) async {
      final picker = PhotoPicker();
      var puts = 0;
      final client = MockClient((request) async {
        if (request.method == 'PUT') puts++;
        return saved();
      });
      await http.runWithClient(() async {
        await panel(tester, picker);
        await tester.tap(find.text('Choose from Gallery'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Replace Photo'));
        await tester.pumpAndSettle();
        expect(find.text('Replace saved household photo?'), findsOneWidget);
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Cancel Preview'));
        await tester.pumpAndSettle();
        expect(find.byType(Image), findsOneWidget);
        expect(
          (tester.widget<Image>(find.byType(Image)).image as MemoryImage).bytes,
          photoBytes,
        );
        expect(puts, 0);
        await tester.pumpWidget(const SizedBox());
      }, () => client);
      client.close();
    },
  );

  testWidgets(
    'failed upload retains preview and saved image for cancellation or retry',
    (tester) async {
      final client = MockClient(
        (request) async =>
            request.method == 'GET' ? saved() : http.Response('{}', 503),
      );
      await http.runWithClient(() async {
        await panel(tester, PhotoPicker());
        await tester.tap(find.text('Choose from Gallery'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Replace Photo'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Confirm'));
        await tester.pumpAndSettle();
        expect(
          find.text('Private photos are unavailable. Please retry later.'),
          findsOneWidget,
        );
        expect(find.text('Preview — not saved'), findsOneWidget);
        await tester.tap(find.text('Cancel Preview'));
        await tester.pumpAndSettle();
        expect(find.byType(Image), findsOneWidget);
        expect(
          (tester.widget<Image>(find.byType(Image)).image as MemoryImage).bytes,
          photoBytes,
        );
        await tester.pumpWidget(const SizedBox());
      }, () => client);
      client.close();
    },
  );

  testWidgets(
    'picker cancellation and permission denial do not mutate saved photo',
    (tester) async {
      final picker = PhotoPicker()..result = null;
      final client = MockClient((request) async => saved());
      await http.runWithClient(() async {
        await panel(tester, picker);
        await tester.tap(find.text('Take Photo'));
        await tester.pumpAndSettle();
        expect(find.text('Preview — not saved'), findsNothing);
        picker.failure = PlatformException(code: 'camera_access_denied');
        await tester.tap(find.text('Take Photo'));
        await tester.pumpAndSettle();
        expect(find.textContaining('Check app permissions'), findsOneWidget);
        expect(find.byType(Image), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      }, () => client);
      client.close();
    },
  );

  testWidgets('retrieval failure is distinct from empty and retry recovers', (
    tester,
  ) async {
    var status = 503;
    final client = MockClient(
      (request) async => status == 200 ? saved() : http.Response('{}', status),
    );
    await http.runWithClient(() async {
      await panel(tester, PhotoPicker());
      expect(
        find.textContaining('Private photos are unavailable'),
        findsOneWidget,
      );
      expect(find.text('No front photo saved.'), findsNothing);
      status = 200;
      await tester.tap(find.text('Retry Photo'));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    }, () => client);
    client.close();
  });

  for (final status in [401, 403]) {
    testWidgets('$status retrieval never displays an empty success state', (
      tester,
    ) async {
      final client = MockClient((request) async => http.Response('{}', status));
      await http.runWithClient(() async {
        await panel(tester, PhotoPicker());
        expect(
          find.textContaining(
            status == 401 ? 'Sign in again' : 'not authorized',
          ),
          findsOneWidget,
        );
        expect(find.text('No front photo saved.'), findsNothing);
        expect(
          tester
              .widget<TextButton>(find.widgetWithText(TextButton, 'Take Photo'))
              .onPressed,
          isNull,
        );
        await tester.pumpWidget(const SizedBox());
      }, () => client);
      client.close();
    });
  }

  test('session switch blocks upload before HTTP', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests++;
      return successfulSave();
    });
    final prefs = await SharedPreferences.getInstance();
    await setStaffSessionToken(prefs, 'new-session');
    await http.runWithClient(() async {
      await expectLater(
        const TourismApi().uploadHouseholdFrontPhoto(
          71,
          photoBytes,
          expectedSessionToken: 'synthetic-session',
        ),
        throwsA(
          isA<ApiException>().having(
            (error) => error.statusCode,
            'status',
            409,
          ),
        ),
      );
    }, () => client);
    expect(requests, 0);
    client.close();
  });

  test(
    'delayed response from previous session is rejected without clearing new token',
    () async {
      final completed = Completer<http.Response>();
      final client = MockClient((request) => completed.future);
      await http.runWithClient(() async {
        final future = const TourismApi().fetchHouseholdFrontPhoto(
          71,
          expectedSessionToken: 'synthetic-session',
        );
        await Future<void>.delayed(Duration.zero);
        final prefs = await SharedPreferences.getInstance();
        await setStaffSessionToken(prefs, 'new-session');
        completed.complete(saved());
        await expectLater(
          future,
          throwsA(
            isA<ApiException>().having(
              (error) => error.statusCode,
              'status',
              409,
            ),
          ),
        );
        expect(prefs.getString(staffAuthTokenKey), 'new-session');
      }, () => client);
      client.close();
    },
  );

  test('oversized or non-image selections are rejected before HTTP', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests++;
      return successfulSave();
    });
    await http.runWithClient(() async {
      for (final bytes in [
        Uint8List(5 * 1024 * 1024 + 1),
        Uint8List.fromList([1, 2, 3]),
      ]) {
        await expectLater(
          const TourismApi().uploadHouseholdFrontPhoto(
            71,
            bytes,
            expectedSessionToken: 'synthetic-session',
          ),
          throwsA(isA<ApiException>()),
        );
      }
    }, () => client);
    expect(requests, 0);
    client.close();
  });

  testWidgets(
    'privacy: displayed saved photo clears when mounted session changes',
    (tester) async {
      final client = MockClient((request) async => saved());
      await http.runWithClient(() async {
        await panel(tester, PhotoPicker());
        expect(find.byType(Image), findsOneWidget);
        final prefs = await SharedPreferences.getInstance();
        await setStaffSessionToken(prefs, 'different-synthetic-session');
        await tester.pumpAndSettle();
        expect(find.byType(Image).evaluate().length, 0);
      }, () => client);
      client.close();
    },
  );

  for (final code in [401, 403, 409]) {
    testWidgets(
      'privacy: $code upload removes draft and saved private images',
      (tester) async {
        final client = MockClient(
          (request) async =>
              request.method == 'GET' ? saved() : http.Response('{}', code),
        );
        await http.runWithClient(() async {
          await panel(tester, PhotoPicker());
          await tester.tap(find.text('Choose from Gallery'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Replace Photo'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Confirm'));
          await tester.pumpAndSettle();
          expect(find.byType(Image).evaluate().length, 0);
          expect(find.text('Preview — not saved'), findsNothing);
        }, () => client);
        client.close();
      },
    );
  }

  for (final action in ['Take Photo', 'Choose from Gallery']) {
    testWidgets(
      'privacy: $action is blocked after original session invalidation',
      (tester) async {
        final picker = PhotoPicker();
        final client = MockClient((request) async => saved());
        await http.runWithClient(() async {
          await panel(tester, picker);
          final prefs = await SharedPreferences.getInstance();
          await setStaffSessionToken(prefs, null);
          await tester.tap(find.text(action));
          await tester.pumpAndSettle();
          expect(picker.source, isNull);
          expect(find.byType(Image).evaluate().length, 0);
        }, () => client);
        client.close();
      },
    );
  }

  testWidgets('privacy: picker completion cannot restore old-session preview', (
    tester,
  ) async {
    final picker = PhotoPicker()..pending = Completer<XFile?>();
    final client = MockClient((request) async => saved());
    await http.runWithClient(() async {
      await panel(tester, picker);
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pump();
      final prefs = await SharedPreferences.getInstance();
      await setStaffSessionToken(prefs, 'different-synthetic-session');
      picker.pending!.complete(picker.result);
      await tester.pumpAndSettle();
      expect(find.byType(Image).evaluate().length, 0);
      expect(find.text('Preview — not saved'), findsNothing);
    }, () => client);
    client.close();
  });

  testWidgets(
    'privacy: delayed upload cannot retain preview after account switch',
    (tester) async {
      final upload = Completer<http.Response>();
      final client = MockClient(
        (request) async => request.method == 'GET' ? saved() : upload.future,
      );
      await http.runWithClient(() async {
        await panel(tester, PhotoPicker());
        await tester.tap(find.text('Choose from Gallery'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Replace Photo'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Confirm'));
        await tester.pump();
        final prefs = await SharedPreferences.getInstance();
        await setStaffSessionToken(prefs, 'different-synthetic-session');
        upload.complete(successfulSave());
        await tester.pumpAndSettle();
        expect(find.byType(Image).evaluate().length, 0);
        expect(find.text('Photo saved.'), findsNothing);
      }, () => client);
      client.close();
    },
  );

  testWidgets('privacy: delayed retrieval rejects previous account bytes', (
    tester,
  ) async {
    final retrieval = Completer<http.Response>();
    final client = MockClient((request) => retrieval.future);
    await http.runWithClient(() async {
      await panel(tester, PhotoPicker());
      final prefs = await SharedPreferences.getInstance();
      await setStaffSessionToken(prefs, 'different-synthetic-session');
      retrieval.complete(saved());
      await tester.pumpAndSettle();
      expect(find.byType(Image).evaluate().length, 0);
      expect(find.textContaining('Staff session changed'), findsOneWidget);
    }, () => client);
    client.close();
  });

  test(
    'staff signal is synchronous, token-free and preserves credential writes',
    () async {
      final prefs = await SharedPreferences.getInstance();
      var notifications = 0;
      void listener() {
        notifications++;
      }

      staffSessionRevision.addListener(listener);
      addTearDown(() => staffSessionRevision.removeListener(listener));
      final write = setStaffSessionToken(prefs, 'replacement-synthetic');
      expect(notifications, 1);
      expect(prefs.getString(staffAuthTokenKey), 'replacement-synthetic');
      expect(await write, isTrue);
      await setStaffSessionToken(prefs, 'replacement-synthetic');
      expect(notifications, 1);
      final remove = setStaffSessionToken(prefs, null);
      expect(notifications, 2);
      expect(prefs.getString(staffAuthTokenKey), isNull);
      expect(await remove, isTrue);
    },
  );

  testWidgets(
    'new session requires remount and fresh authorized GET; dispose unsubscribes',
    (tester) async {
      final headers = <String?>[];
      final client = MockClient((request) async {
        headers.add(request.headers['authorization']);
        return saved();
      });
      await http.runWithClient(() async {
        await panel(tester, PhotoPicker());
        final prefs = await SharedPreferences.getInstance();
        await setStaffSessionToken(prefs, 'new-synthetic');
        await tester.pumpAndSettle();
        expect(find.byType(Image).evaluate().length, 0);
        expect(
          tester
              .widget<TextButton>(
                find.widgetWithText(TextButton, 'Retry Photo'),
              )
              .onPressed,
          isNull,
        );
        expect(headers.length, 1);
        await tester.pumpWidget(const SizedBox());
        await panel(tester, PhotoPicker());
        expect(headers, ['Token synthetic-session', 'Token new-synthetic']);
        expect(find.byType(Image).evaluate().length, 1);
        await tester.pumpWidget(const SizedBox());
        await setStaffSessionToken(prefs, null);
        await tester.pump();
        expect(tester.takeException(), isNull);
      }, () => client);
      client.close();
    },
  );

  testWidgets('session change while confirmation is open sends no upload', (
    tester,
  ) async {
    var puts = 0;
    final client = MockClient((request) async {
      if (request.method == 'PUT') puts++;
      return saved();
    });
    await http.runWithClient(() async {
      await panel(tester, PhotoPicker());
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Replace Photo'));
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      await setStaffSessionToken(prefs, 'new-synthetic');
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(puts, 0);
      expect(find.byType(Image).evaluate().length, 0);
    }, () => client);
    client.close();
  });

  testWidgets('authentication rejection clears every mounted photo panel', (
    tester,
  ) async {
    var reject = false;
    final client = MockClient(
      (request) async => reject ? http.Response('{}', 401) : saved(),
    );
    await http.runWithClient(() async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Column(
                children: [
                  HouseholdFrontPhotoPanel(
                    api: const TourismApi(),
                    householdId: 71,
                    imagePicker: PhotoPicker(),
                  ),
                  HouseholdFrontPhotoPanel(
                    api: const TourismApi(),
                    householdId: 72,
                    imagePicker: PhotoPicker(),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(Image).evaluate().length, 2);
      reject = true;
      await tester.tap(find.text('Reload Photo').first);
      await tester.pumpAndSettle();
      expect(find.byType(Image).evaluate().length, 0);
    }, () => client);
    client.close();
  });

  for (final status in [403, 409]) {
    testWidgets(
      '$status is local: other authorized household remains functional',
      (tester) async {
        var reject = false;
        var authorizedGets = 0;
        final before = staffSessionRevision.value;
        final client = MockClient((request) async {
          if (request.url.path.contains('/71/')) authorizedGets++;
          return reject && request.url.path.contains('/72/')
              ? http.Response('{}', status)
              : saved();
        });
        await http.runWithClient(() async {
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(
                body: SingleChildScrollView(
                  child: Column(
                    children: [
                      HouseholdFrontPhotoPanel(
                        api: const TourismApi(),
                        householdId: 71,
                        imagePicker: PhotoPicker(),
                      ),
                      HouseholdFrontPhotoPanel(
                        api: const TourismApi(),
                        householdId: 72,
                        imagePicker: PhotoPicker(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.byType(Image).evaluate().length, 2);
          reject = true;
          await tester.tap(find.text('Reload Photo').last);
          await tester.pumpAndSettle();
          expect(find.byType(Image).evaluate().length, 1);
          expect(staffSessionRevision.value, before);
          expect(
            tester
                .widget<TextButton>(
                  find.widgetWithText(TextButton, 'Take Photo').last,
                )
                .onPressed,
            isNull,
          );
          await tester.tap(find.text('Reload Photo').first);
          await tester.pumpAndSettle();
          expect(authorizedGets, 2);
          expect(find.byType(Image).evaluate().length, 1);
        }, () => client);
        client.close();
      },
    );
  }

  for (final code in [401, 403, 409]) {
    testWidgets('stale $code cannot invalidate a newly opened session', (
      tester,
    ) async {
      final oldResponse = Completer<http.Response>();
      final client = MockClient(
        (request) =>
            request.headers['authorization'] == 'Token synthetic-session'
            ? oldResponse.future
            : Future.value(saved()),
      );
      await http.runWithClient(() async {
        await panel(tester, PhotoPicker());
        final prefs = await SharedPreferences.getInstance();
        await setStaffSessionToken(prefs, 'replacement-synthetic');
        await tester.pumpWidget(const SizedBox());
        await panel(tester, PhotoPicker());
        final revision = staffSessionRevision.value;
        oldResponse.complete(http.Response('{}', code));
        await tester.pumpAndSettle();
        expect(find.byType(Image).evaluate().length, 1);
        expect(staffSessionRevision.value, revision);
        expect(prefs.getString(staffAuthTokenKey), 'replacement-synthetic');
      }, () => client);
      client.close();
    });
  }
}
