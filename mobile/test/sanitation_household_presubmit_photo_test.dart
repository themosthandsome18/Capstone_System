import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'household_front_photo_test.dart' show PhotoPicker, photoBytes;
import 'sanitation_household_access_photo_test.dart'
    show openNewSurvey, settle, tapAndSettle, submitAndCloseDialog, token;
import 'sanitation_household_location_test.dart' show coordinateField;

/// Local household endpoints with failure controls; every request is recorded in order.
class Server {
  Server({this.createStatus = 201, this.createBody});
  final int createStatus;
  final Map<String, dynamic>? createBody;
  final requests = <http.Request>[];
  final putStatuses = <int>[];
  Completer<http.Response>? pendingPut;
  bool stored = false;

  List<http.Request> get creates => requests
      .where((r) => r.method == 'POST' && r.url.path == '/api/mobile/sanitation/household-surveys/')
      .toList();
  List<http.Request> get uploads => requests.where((r) => r.method == 'PUT').toList();

  MockClient get client => MockClient((request) async {
    requests.add(request);
    final path = request.url.path;
    if (request.method == 'POST' && path == '/api/mobile/sanitation/household-surveys/') {
      return createStatus == 201
          ? http.Response(jsonEncode(createBody ?? {'id': 501, 'household_code': 'HH-NEW', 'status': 'good_standing'}), 201)
          : http.Response('{"detail":"Synthetic server failure."}', createStatus);
    }
    if (path.endsWith('/front-photo/') && request.method == 'GET') {
      return stored
          ? http.Response.bytes(photoBytes, 200, headers: {'content-type': 'image/png'})
          : http.Response('{"detail":"Photo not found."}', 404);
    }
    if (path.endsWith('/front-photo/') && request.method == 'PUT') {
      if (pendingPut != null) {
        final response = await pendingPut!.future;
        pendingPut = null;
        if (response.statusCode == 200) stored = true;
        return response;
      }
      final status = putStatuses.isEmpty ? 200 : putStatuses.removeAt(0);
      if (status != 200) return http.Response('{"detail":"Private photo storage unavailable."}', status);
      stored = true;
      return http.Response('{"has_front_photo":true,"cleanup_pending":false}', 200);
    }
    return http.Response('{"detail":"unexpected request"}', 599);
  });
}

Finder pendingPreview() => find.bySemanticsLabel('Selected household photo (not uploaded yet)');
Finder savedPhoto() => find.bySemanticsLabel('Saved household front photo');

void clearSnackBars(WidgetTester tester) =>
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger).first).clearSnackBars();

Future<void> choose(WidgetTester tester, String key) async =>
    tapAndSettle(tester, find.byKey(ValueKey('pending-photo-$key')));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({staffAuthTokenKey: token}));

  testWidgets('optional section sits before consent; selecting a photo sends nothing', (tester) async {
    final server = Server();
    final picker = PhotoPicker();
    await http.runWithClient(() async {
      await openNewSurvey(tester, picker);
      expect(find.text('Household Front Photo (Optional)'), findsOneWidget);
      final section = tester.getTopLeft(find.byKey(const ValueKey('pending-photo-section'))).dy;
      expect(section, greaterThan(tester.getTopLeft(find.byType(LocationConfirmationPanel)).dy));
      expect(section, lessThan(tester.getTopLeft(find.byType(ConsentCheckPanel)).dy));
      expect(find.text('Take Photo'), findsOneWidget);
      expect(find.text('Choose from Gallery'), findsOneWidget);
      await choose(tester, 'gallery');
      expect(picker.source, ImageSource.gallery);
      expect(pendingPreview(), findsOneWidget);
      expect(find.text('Remove Photo'), findsOneWidget);
    }, () => server.client);
    expect(server.requests, isEmpty, reason: 'no upload or request before submission');
  });

  testWidgets('photo uploads once, after and only to the confirmed household id', (tester) async {
    final server = Server();
    await http.runWithClient(() async {
      final results = await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'camera');
      await submitAndCloseDialog(tester);
      await settle(tester);
      expect(find.byKey(const ValueKey('pending-photo-uploaded')), findsOneWidget);
      expect(find.text('Household and front photo saved.'), findsOneWidget);
      expect(savedPhoto(), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const ValueKey('household-photo-done')));
      expect(results.single, isA<MobileHouseholdSurveyReceipt>());
    }, () => server.client);
    expect(server.creates, hasLength(1));
    expect(server.uploads, hasLength(1));
    expect(server.uploads.single.url.path, '/api/households/records/501/front-photo/');
    expect(server.uploads.single.headers['Authorization'], 'Token $token');
    expect(server.requests.indexOf(server.creates.single),
        lessThan(server.requests.indexOf(server.uploads.single)));
  });

  testWidgets('no photo selected: no upload, existing post-save panel still offered', (tester) async {
    final server = Server();
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await submitAndCloseDialog(tester);
      expect(find.byKey(const ValueKey('household-saved-banner')), findsOneWidget);
      expect(find.byKey(const ValueKey('pending-photo-uploaded')), findsNothing);
      expect(find.text('No front photo saved.'), findsOneWidget);
    }, () => server.client);
    expect(server.uploads, isEmpty);
    expect(server.creates, hasLength(1));
  });

  testWidgets('cancel, change and remove keep the survey fields', (tester) async {
    final server = Server();
    final picker = PhotoPicker()..result = null;
    await http.runWithClient(() async {
      await openNewSurvey(tester, picker);
      await choose(tester, 'gallery');
      expect(pendingPreview(), findsNothing, reason: 'cancelled picker selects nothing');
      picker.result = PhotoPicker().result;
      await choose(tester, 'camera');
      expect(pendingPreview(), findsOneWidget);
      await choose(tester, 'gallery');
      expect(find.text('Change Photo'), findsOneWidget);
      expect(pendingPreview(), findsOneWidget);
      await choose(tester, 'remove');
      expect(pendingPreview(), findsNothing);
      expect(tester.widget<AppTextField>(coordinateField('Household head')).controller.text,
          'Synthetic new household');
    }, () => server.client);
    expect(server.requests, isEmpty);
  });

  testWidgets('household creation failure keeps the form and photo; nothing uploads', (tester) async {
    final server = Server(createStatus: 500);
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'gallery');
      await tapAndSettle(tester, find.text('Submit Household Survey'));
      expect(find.text('Submit Household Survey'), findsOneWidget);
      expect(pendingPreview(), findsOneWidget);
      expect(find.byKey(const ValueKey('household-saved-banner')), findsNothing);
    }, () => server.client);
    expect(server.creates, hasLength(1));
    expect(server.uploads, isEmpty);
  });

  testWidgets('upload failure after a saved household retries the photo only', (tester) async {
    final server = Server()..putStatuses.add(503);
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'gallery');
      await submitAndCloseDialog(tester);
      await settle(tester);
      expect(find.byKey(const ValueKey('pending-photo-failed')), findsOneWidget);
      expect(find.textContaining('household is saved, but the selected front photo was not uploaded'), findsOneWidget);
      expect(find.text('Submit Household Survey'), findsNothing);
      await tapAndSettle(tester, find.byKey(const ValueKey('pending-photo-retry')));
      await settle(tester);
      expect(find.byKey(const ValueKey('pending-photo-uploaded')), findsOneWidget);
      expect(savedPhoto(), findsOneWidget);
    }, () => server.client);
    expect(server.creates, hasLength(1));
    expect(server.uploads, hasLength(2));
    expect(server.uploads.every((r) => r.url.path == '/api/households/records/501/front-photo/'), isTrue);
  });

  for (final body in <String, Map<String, dynamic>>{
    'missing id': {'household_code': 'HH-NOID', 'status': 'good_standing'},
    'invalid id': {'id': '501', 'household_code': 'HH-NOID', 'status': 'good_standing'},
  }.entries) {
    testWidgets('${body.key}: the selected photo is NOT uploaded and the user is told', (tester) async {
      final server = Server(createBody: body.value);
      await http.runWithClient(() async {
        await openNewSurvey(tester, PhotoPicker());
        await choose(tester, 'gallery');
        await tapAndSettle(tester, find.text('Submit Household Survey'));
        expect(find.byKey(const ValueKey('household-save-unconfirmed')), findsOneWidget);
        expect(find.byKey(const ValueKey('unconfirmed-photo-not-uploaded')), findsOneWidget);
        expect(find.textContaining('NOT uploaded'), findsOneWidget);
        expect(pendingPreview(), findsNothing);
      }, () => server.client);
      expect(server.uploads, isEmpty);
      expect(server.creates, hasLength(1));
    });
  }

  testWidgets('repeated Submit taps create one household', (tester) async {
    final server = Server();
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'gallery');
      final submit = find.text('Submit Household Survey');
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.tap(submit, warnIfMissed: false);
      await tester.tap(submit, warnIfMissed: false);
      await settle(tester);
    }, () => server.client);
    expect(server.creates, hasLength(1));
  });

  testWidgets('logout during selection clears the unsaved photo', (tester) async {
    final server = Server();
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'gallery');
      expect(pendingPreview(), findsOneWidget);
      await setStaffSessionToken(await SharedPreferences.getInstance(), null);
      await settle(tester);
      expect(pendingPreview(), findsNothing);
    }, () => server.client);
    expect(server.requests, isEmpty);
  });

  testWidgets('account switch during the upload never reports success', (tester) async {
    final server = Server()..pendingPut = Completer<http.Response>();
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'gallery');
      await submitAndCloseDialog(tester);
      expect(find.byKey(const ValueKey('pending-photo-uploading')), findsOneWidget);
      await setStaffSessionToken(await SharedPreferences.getInstance(), 'session-b');
      server.pendingPut!.complete(http.Response('{"has_front_photo":true,"cleanup_pending":false}', 200));
      await settle(tester);
      expect(find.byKey(const ValueKey('pending-photo-uploaded')), findsNothing);
      expect(find.byKey(const ValueKey('pending-photo-retry')), findsNothing);
      expect(savedPhoto(), findsNothing);
    }, () => server.client);
    expect(server.creates, hasLength(1));
  });

  testWidgets('GIS pin and consent rules still apply with a selected photo', (tester) async {
    final server = Server();
    await http.runWithClient(() async {
      await openNewSurvey(tester, PhotoPicker());
      await choose(tester, 'gallery');
      tester.widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel)).onChanged(false);
      await settle(tester);
      clearSnackBars(tester); // the earlier "GPS location acquired." message is still queued
      await tapAndSettle(tester, find.text('Submit Household Survey'));
      expect(find.text('Privacy consent is required before submitting.'), findsOneWidget);
      tester.widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel)).onChanged(true);
      await tester.enterText(coordinateField('Latitude'), '14.190000');
      await settle(tester);
      clearSnackBars(tester);
      await tapAndSettle(tester, find.text('Submit Household Survey'));
      expect(find.text('Confirm the household GIS pin before submitting.'), findsOneWidget);
      expect(pendingPreview(), findsOneWidget);
    }, () => server.client);
    expect(server.requests, isEmpty);
  });
}
