import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'household_front_photo_test.dart' show PhotoPicker, photoBytes;
import 'sanitation_staff_bootstrap_test.dart' show FakeStaffApi, pumpShell;

const token = 'session-a';

/// Local stand-in for the establishment photo endpoint; every request is recorded.
class EstablishmentPhotoServer {
  final requests = <http.Request>[];
  final stored = <int>{};
  final putStatuses = <int>[];
  int getStatus = 200;
  Completer<http.Response>? pendingGet;

  Iterable<http.Request> get uploads => requests.where((r) => r.method == 'PUT');

  MockClient get client => MockClient((request) async {
    requests.add(request);
    final match = RegExp(r'^/api/sanitation/establishments/(\d+)/front-photo/$').firstMatch(request.url.path);
    if (match == null) return http.Response('{"detail":"unexpected"}', 599);
    final id = int.parse(match.group(1)!);
    if (request.method == 'GET') {
      if (pendingGet != null) return pendingGet!.future;
      if (getStatus != 200) return http.Response('{"detail":"denied"}', getStatus);
      return stored.contains(id)
          ? http.Response.bytes(photoBytes, 200, headers: {'content-type': 'image/png'})
          : http.Response('{"detail":"Photo not found."}', 404);
    }
    final status = putStatuses.isEmpty ? 200 : putStatuses.removeAt(0);
    if (status != 200) return http.Response('{"detail":"Private photo storage unavailable."}', status);
    stored.add(id);
    return http.Response('{"has_front_photo":true,"cleanup_pending":false}', 200);
  });
}

SanitationEstablishment establishment(int id, String name) => SanitationEstablishment.fromJson({
  'id': id,
  'business_name': name,
  'business_type_name': 'Synthetic Food Establishment',
  'barangay': 'Daungan',
  'compliance_status': 'good_standing',
});

Future<void> pumpPage(WidgetTester tester, PhotoPicker picker, {int id = 9}) async {
  tester.view.physicalSize = const Size(1000, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: EstablishmentFrontPhotoPage(
      api: const TourismApi(),
      establishment: establishment(id, 'Synthetic Bakery'),
      imagePicker: picker,
    ),
  ));
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

Finder savedPhoto() => find.bySemanticsLabel('Saved establishment front photo');

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({staffAuthTokenKey: token}));

  testWidgets('Records tab Front Photo opens the page for that establishment id only', (tester) async {
    final server = EstablishmentPhotoServer()..stored.add(9);
    await http.runWithClient(() async {
      await pumpShell(tester, FakeStaffApi(staff: {
        'establishments': [
          {'id': 7, 'business_name': 'Synthetic Carinderia', 'barangay': 'Daungan'},
          {'id': 9, 'business_name': 'Synthetic Bakery', 'barangay': 'Polo'},
          {'business_name': 'Unsaved Draft Store', 'barangay': 'Alitap'},
        ],
      }));
      await tester.tap(find.byType(NavigationDestination).at(1));
      await tester.pumpAndSettle();
      expect(find.text('Inspect'), findsNWidgets(3), reason: 'inspection actions are unchanged');
      expect(find.byKey(const ValueKey('establishment-front-photo-7')), findsOneWidget);
      expect(find.byKey(const ValueKey('establishment-front-photo-0')), findsNothing,
          reason: 'no photo action without a saved server id');
      final action = find.byKey(const ValueKey('establishment-front-photo-9'));
      await tester.ensureVisible(action);
      await tester.tap(action);
      await tester.pumpAndSettle();
      final page = tester.widget<EstablishmentFrontPhotoPage>(find.byType(EstablishmentFrontPhotoPage));
      expect(page.establishment.id, 9);
      expect(savedPhoto(), findsOneWidget);
    }, () => server.client);
    expect(server.requests.map((r) => r.url.path), ['/api/sanitation/establishments/9/front-photo/']);
    expect(server.requests.single.headers['Authorization'], 'Token $token');
  });

  testWidgets('narrow card with large text moves actions under the business name', (tester) async {
    Future<void> pumpCard(double width, double textScale) async {
      await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: Scaffold(
            body: Center(
              child: SizedBox(
                width: width,
                child: SanitationEstablishmentCard(
                  establishment: establishment(7, 'Synthetic Carinderia'),
                  onInspection: () {},
                  onFrontPhoto: () {},
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
    }

    tester.view.physicalSize = const Size(1600, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final name = find.text('Synthetic Carinderia');
    final action = find.byKey(const ValueKey('establishment-front-photo-7'));

    await pumpCard(1200, 1);
    expect(tester.getTopLeft(action).dx, greaterThanOrEqualTo(tester.getTopRight(name).dx),
        reason: 'wide cards keep the actions in a column beside the name');

    await pumpCard(600, 3);
    expect(tester.takeException(), isNull);
    expect(tester.getTopLeft(action).dy, greaterThanOrEqualTo(tester.getBottomLeft(name).dy),
        reason: 'compact cards place the actions below the name');
    expect(tester.getSize(name).width, greaterThan(400),
        reason: 'the business name keeps most of the card width');
    expect(find.text('Inspect'), findsOneWidget);
  });

  testWidgets('empty state, gallery preview, confirmed upload and camera replacement', (tester) async {
    final server = EstablishmentPhotoServer();
    final picker = PhotoPicker();
    await http.runWithClient(() async {
      await pumpPage(tester, picker);
      expect(find.text('Establishment front photo'), findsOneWidget);
      expect(find.text('No front photo saved.'), findsOneWidget);
      await tapText(tester, 'Choose from Gallery');
      expect(picker.source, ImageSource.gallery);
      expect(find.text('Preview — not saved'), findsOneWidget);
      expect(server.uploads, isEmpty, reason: 'nothing uploads before confirmation');
      await tapText(tester, 'Save Photo');
      expect(find.text('Save establishment front photo?'), findsOneWidget);
      await tapText(tester, 'Confirm');
      expect(savedPhoto(), findsOneWidget);
      await tapText(tester, 'Take Photo');
      expect(picker.source, ImageSource.camera);
      await tapText(tester, 'Replace Photo');
      expect(find.text('Replace saved establishment photo?'), findsOneWidget);
      await tapText(tester, 'Confirm');
      expect(savedPhoto(), findsOneWidget);
    }, () => server.client);
    expect(server.uploads.map((r) => r.url.path).toSet(), {'/api/sanitation/establishments/9/front-photo/'});
    expect(server.uploads, hasLength(2));
  });

  testWidgets('cancel preview uploads nothing', (tester) async {
    final server = EstablishmentPhotoServer();
    await http.runWithClient(() async {
      await pumpPage(tester, PhotoPicker());
      await tapText(tester, 'Choose from Gallery');
      await tapText(tester, 'Cancel Preview');
      expect(find.text('Preview — not saved'), findsNothing);
    }, () => server.client);
    expect(server.uploads, isEmpty);
  });

  testWidgets('storage rejection keeps the preview for a retry that succeeds', (tester) async {
    final server = EstablishmentPhotoServer()..putStatuses.add(503);
    await http.runWithClient(() async {
      await pumpPage(tester, PhotoPicker());
      await tapText(tester, 'Choose from Gallery');
      await tapText(tester, 'Save Photo');
      await tapText(tester, 'Confirm');
      expect(find.text('Private photos are unavailable. Please retry later.'), findsOneWidget);
      expect(find.text('Preview — not saved'), findsOneWidget);
      expect(savedPhoto(), findsNothing);
      await tapText(tester, 'Save Photo');
      await tapText(tester, 'Confirm');
      expect(savedPhoto(), findsOneWidget);
    }, () => server.client);
    expect(server.uploads, hasLength(2));
  });

  testWidgets('403 stays local; 401 invalidates the staff session', (tester) async {
    for (final status in [403, 401]) {
      await tester.pumpWidget(const SizedBox()); // fresh panel state per case
      final server = EstablishmentPhotoServer()..getStatus = status;
      final before = staffSessionRevision.value;
      await http.runWithClient(() async {
        await pumpPage(tester, PhotoPicker());
      }, () => server.client);
      expect(savedPhoto(), findsNothing);
      if (status == 403) {
        expect(find.text('You are not authorized to access establishment photos.'), findsOneWidget);
        expect(staffSessionRevision.value, before);
      } else {
        expect(find.textContaining('establishment'), findsWidgets);
        expect(staffSessionRevision.value, greaterThan(before));
      }
      expect(find.text('Take Photo'), findsOneWidget);
      expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Take Photo')).onPressed, isNull);
    }
  });

  testWidgets('a session change while the photo is loading discards the late response', (tester) async {
    final server = EstablishmentPhotoServer()..pendingGet = Completer<http.Response>();
    await http.runWithClient(() async {
      await pumpPage(tester, PhotoPicker());
      await setStaffSessionToken(await SharedPreferences.getInstance(), 'session-b');
      await tester.pump();
      server.pendingGet!.complete(
          http.Response.bytes(photoBytes, 200, headers: {'content-type': 'image/png'}));
      await tester.pumpAndSettle();
      expect(savedPhoto(), findsNothing);
      expect(find.text('Staff session changed. Reopen the establishment profile.'), findsOneWidget);
    }, () => server.client);
    expect(server.uploads, isEmpty);
  });

  testWidgets('logout clears a pending selection and the saved photo', (tester) async {
    final server = EstablishmentPhotoServer()..stored.add(9);
    await http.runWithClient(() async {
      await pumpPage(tester, PhotoPicker());
      expect(savedPhoto(), findsOneWidget);
      await tapText(tester, 'Choose from Gallery');
      expect(find.text('Preview — not saved'), findsOneWidget);
      await setStaffSessionToken(await SharedPreferences.getInstance(), null);
      await tester.pumpAndSettle();
      expect(savedPhoto(), findsNothing);
      expect(find.text('Preview — not saved'), findsNothing);
      expect(find.byType(Image), findsNothing);
    }, () => server.client);
    expect(server.uploads, isEmpty);
  });

  testWidgets('household panel wrapper keeps household wording and endpoint', (tester) async {
    final requests = <http.Request>[];
    await http.runWithClient(() async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: HouseholdFrontPhotoPanel(api: const TourismApi(), householdId: 71)),
      ));
      await tester.pumpAndSettle();
    }, () => MockClient((r) async {
      requests.add(r);
      return http.Response('{}', 404);
    }));
    expect(find.text('Household front photo'), findsOneWidget);
    expect(requests.single.url.path, '/api/households/records/71/front-photo/');
  });
}
