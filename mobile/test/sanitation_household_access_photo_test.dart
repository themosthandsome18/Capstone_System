import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'household_front_photo_test.dart' show PhotoPicker, photoBytes;
import 'sanitation_household_edit_preservation_test.dart' show storedHousehold;
import 'sanitation_household_location_test.dart'
    show FakeHouseholdLocation, capture, coordinateField;
import 'sanitation_staff_bootstrap_test.dart' show FakeStaffApi, pumpShell;

const token = 'local-test-token';

/// Local stand-in for the household and photo endpoints; every request is recorded.
class HouseholdServer {
  HouseholdServer({this.createResponse});

  final Map<String, dynamic>? createResponse;
  final requests = <http.Request>[];
  final putStatuses = <int>[];
  bool photoStored = false;

  Iterable<http.Request> get creates => requests.where(
    (r) => r.method == 'POST' && r.url.path == '/api/mobile/sanitation/household-surveys/',
  );
  Iterable<http.Request> get uploads => requests.where((r) => r.method == 'PUT');

  MockClient get client => MockClient((request) async {
    requests.add(request);
    final path = request.url.path;
    if (request.method == 'GET' && path == '/api/sanitation/sitios/') {
      return http.Response(jsonEncode({
        'barangay_id': int.parse(request.url.queryParameters['barangay_id']!),
        'rows': [],
      }), 200);
    }
    if (request.method == 'POST' && path == '/api/mobile/sanitation/household-surveys/') {
      return http.Response(
        jsonEncode(createResponse ??
            {'id': 501, 'household_code': 'HH-NEW', 'status': 'good_standing'}),
        201,
      );
    }
    if (path.endsWith('/front-photo/') && request.method == 'GET') {
      return photoStored
          ? http.Response.bytes(photoBytes, 200, headers: {'content-type': 'image/png'})
          : http.Response('{"detail":"Photo not found."}', 404);
    }
    if (path.endsWith('/front-photo/') && request.method == 'PUT') {
      final status = putStatuses.isEmpty ? 200 : putStatuses.removeAt(0);
      if (status != 200) {
        return http.Response('{"detail":"Private photo storage unavailable."}', status);
      }
      photoStored = true;
      return http.Response('{"has_front_photo":true,"cleanup_pending":false}', 200);
    }
    return http.Response('{"detail":"unexpected request"}', 599);
  });
}

void setView(WidgetTester tester, Size size, {double textScale = 1}) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

/// Opens a NEW household survey from a launcher so the popped receipt can be read.
Future<List<Object?>> openNewSurvey(WidgetTester tester, PhotoPicker picker) async {
  setView(tester, const Size(1200, 5000));
  final results = <Object?>[];
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () async => results.add(
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => HouseholdSurveyPage(
                    api: const TourismApi(),
                    barangays: SanitationBootstrap.fallback().barangays,
                    locationAdapter: FakeHouseholdLocation(),
                    imagePicker: picker,
                  ),
                ),
              ),
            ),
            child: const Text('open survey'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open survey'));
  await settle(tester);
  await tester.enterText(coordinateField('Household head'), 'Synthetic new household');
  await tester.tap(find.widgetWithText(ChoiceChip, 'Bottomless'));
  tester.widget<ConsentCheckPanel>(find.byType(ConsentCheckPanel)).onChanged(true);
  await tester.pump();
  await capture(tester);
  await tester.ensureVisible(find.text('Confirm Pin'));
  await tester.tap(find.text('Confirm Pin'));
  await tester.pump();
  return results;
}

/// Timed pumps: the survey page keeps an animation running (as in the existing
/// household tests), so pumpAndSettle would never settle there.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await settle(tester);
}

Future<void> submitAndCloseDialog(WidgetTester tester) async {
  await tapAndSettle(tester, find.text('Submit Household Survey'));
  await tapAndSettle(tester, find.descendant(
    of: find.byType(AlertDialog),
    matching: find.widgetWithText(FilledButton, 'Done'),
  ));
}

Future<void> pickAndSave(WidgetTester tester) async {
  await tapAndSettle(tester, find.text('Choose from Gallery'));
  expect(find.text('Preview — not saved'), findsOneWidget);
  await tapAndSettle(tester, find.text('Save Photo'));
  await tapAndSettle(tester, find.text('Confirm'));
}

Finder savedPhoto() => find.bySemanticsLabel('Saved household front photo');

int lineCount(WidgetTester tester, Finder text) {
  final paragraph = tester.renderObject<RenderParagraph>(text);
  final length = paragraph.text.toPlainText().length;
  final boxes = paragraph.getBoxesForSelection(
    TextSelection(baseOffset: 0, extentOffset: length),
  );
  return boxes.map((box) => box.top.round()).toSet().length;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({staffAuthTokenKey: token}));

  group('Issue A: opening a household', () {
    testWidgets('tapping a household map pin opens that household', (tester) async {
      setView(tester, const Size(1000, 3200));
      final opened = <HouseholdSanitationItem>[];
      final household = HouseholdSanitationItem.fromJson(storedHousehold());
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SanitationMapPage(
            establishments: const [],
            householdRecords: [household],
            onRefresh: () async {},
            refreshing: false,
            onEditHousehold: opened.add,
          ),
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Households'));
      await tester.pumpAndSettle();
      final pin = find.byKey(const ValueKey('household-map-pin-HH-H2B'));
      expect(pin, findsOneWidget);
      await tester.tap(pin);
      await tester.pump();
      expect(opened.map((h) => h.householdCode), ['HH-H2B']);
    });

    testWidgets('Households tab card opens the household profile with its photo', (tester) async {
      final server = HouseholdServer()..photoStored = true;
      await http.runWithClient(() async {
        await pumpShell(tester, FakeStaffApi(staff: {'householdRecords': [storedHousehold()]}));
        await tester.tap(find.byType(NavigationDestination).at(3));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('household-card-HH-H2B')));
        await tester.pumpAndSettle();
        expect(find.byType(HouseholdSurveyPage), findsOneWidget);
        expect(find.byType(HouseholdFrontPhotoPanel), findsOneWidget);
        expect(savedPhoto(), findsOneWidget);
        expect(server.requests.map((request) => request.url.path), unorderedEquals([
          '/api/households/records/71/front-photo/', '/api/sanitation/sitios/',
        ]));
        expect(server.requests.every((request) => request.method == 'GET'), isTrue);
        expect(server.requests.singleWhere((request) => request.url.path.endsWith('/sitios/'))
            .url.queryParameters, {'barangay_id': '1'});
      }, () => server.client);
    });

    testWidgets('a household without a saved photo shows the empty state', (tester) async {
      final server = HouseholdServer();
      await http.runWithClient(() async {
        await pumpShell(tester, FakeStaffApi(staff: {'householdRecords': [storedHousehold()]}));
        await tester.tap(find.byType(NavigationDestination).at(3));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('household-card-HH-H2B')));
        await tester.pumpAndSettle();
        expect(find.text('No front photo saved.'), findsOneWidget);
        expect(savedPhoto(), findsNothing);
      }, () => server.client);
    });
  });

  group('Issue B: optional front photo after creating a household', () {
    testWidgets('saved household offers the photo against the server id; Done returns the receipt', (tester) async {
      final server = HouseholdServer();
      await http.runWithClient(() async {
        final results = await openNewSurvey(tester, PhotoPicker());
        expect(find.byType(HouseholdFrontPhotoPanel), findsNothing,
            reason: 'no photo can be taken before the household exists');
        await submitAndCloseDialog(tester);
        expect(server.creates, hasLength(1));
        expect(find.byKey(const ValueKey('household-saved-banner')), findsOneWidget);
        expect(find.text('Submit Household Survey'), findsNothing);
        expect(find.text('No front photo saved.'), findsOneWidget);
        await pickAndSave(tester);
        expect(server.uploads.single.url.path, '/api/households/records/501/front-photo/');
        expect(server.uploads.single.headers['Authorization'], 'Token $token');
        expect(savedPhoto(), findsOneWidget);
        await tapAndSettle(tester, find.byKey(const ValueKey('household-photo-done')));
        expect(results.single, isA<MobileHouseholdSurveyReceipt>());
        expect((results.single as MobileHouseholdSurveyReceipt).householdCode, 'HH-NEW');
        expect(server.creates, hasLength(1));
      }, () => server.client);
    });

    testWidgets('cancelled picker and cancelled preview keep the saved household; no upload', (tester) async {
      final server = HouseholdServer();
      final picker = PhotoPicker()..result = null;
      await http.runWithClient(() async {
        final results = await openNewSurvey(tester, picker);
        await submitAndCloseDialog(tester);
        await tapAndSettle(tester, find.text('Choose from Gallery'));
        expect(find.text('Preview — not saved'), findsNothing);
        picker.result = PhotoPicker().result;
        await tapAndSettle(tester, find.text('Take Photo'));
        expect(find.text('Preview — not saved'), findsOneWidget);
        await tapAndSettle(tester, find.text('Cancel Preview'));
        expect(find.text('Preview — not saved'), findsNothing);
        expect(find.byKey(const ValueKey('household-saved-banner')), findsOneWidget);
        // System back from the saved step also returns the saved household.
        await tester.binding.handlePopRoute(); // Android system back
        await settle(tester);
        expect(results.single, isA<MobileHouseholdSurveyReceipt>());
      }, () => server.client);
      expect(server.uploads, isEmpty);
      expect(server.creates, hasLength(1));
    });

    testWidgets('upload failure shows retry; retry succeeds without a second household', (tester) async {
      final server = HouseholdServer()..putStatuses.add(503);
      await http.runWithClient(() async {
        await openNewSurvey(tester, PhotoPicker());
        await submitAndCloseDialog(tester);
        await pickAndSave(tester);
        expect(find.textContaining('unavailable'), findsWidgets);
        expect(savedPhoto(), findsNothing);
        expect(find.text('Save Photo'), findsOneWidget, reason: 'the preview stays for a retry');
        await tapAndSettle(tester, find.text('Save Photo'));
        await tapAndSettle(tester, find.text('Confirm'));
        expect(savedPhoto(), findsOneWidget);
      }, () => server.client);
      expect(server.uploads, hasLength(2));
      expect(server.creates, hasLength(1));
    });

    for (final response in <String, Map<String, dynamic>>{
      'missing id': {'household_code': 'HH-NOID', 'status': 'good_standing'},
      'non-integer id': {'id': '501', 'household_code': 'HH-NOID', 'status': 'good_standing'},
      'zero id': {'id': 0, 'household_code': 'HH-NOID', 'status': 'good_standing'},
    }.entries) {
      testWidgets('${response.key}: unconfirmed save is explained, kept open, never resubmitted or photographed', (tester) async {
        final server = HouseholdServer(createResponse: response.value);
        await http.runWithClient(() async {
          final results = await openNewSurvey(tester, PhotoPicker());
          await tapAndSettle(tester, find.text('Submit Household Survey'));
          expect(server.creates, hasLength(1));
          // Not presented as a completed save, and not closed silently.
          expect(find.byType(AlertDialog), findsNothing);
          expect(results, isEmpty);
          expect(find.byKey(const ValueKey('household-save-unconfirmed')), findsOneWidget);
          expect(find.textContaining('may already be saved'), findsOneWidget);
          expect(find.text('Household Code: HH-NOID'), findsOneWidget);
          expect(find.text('Household head: Synthetic New Household'), findsOneWidget);
          // No resubmission path and no photo against an unverified id.
          expect(find.text('Submit Household Survey'), findsNothing);
          expect(find.byType(HouseholdFrontPhotoPanel), findsNothing);
          await tapAndSettle(tester, find.byKey(const ValueKey('household-unconfirmed-close')));
          expect(results.single, isA<MobileHouseholdSurveyReceipt>(),
              reason: 'closing returns the receipt so the Households list refreshes');
        }, () => server.client);
        expect(server.creates, hasLength(1));
        expect(server.requests.where((r) => r.url.path.contains('front-photo')), isEmpty);
      });
    }

    testWidgets('a staff-session change clears the saved photo on the saved step', (tester) async {
      final server = HouseholdServer();
      await http.runWithClient(() async {
        await openNewSurvey(tester, PhotoPicker());
        await submitAndCloseDialog(tester);
        await pickAndSave(tester);
        expect(savedPhoto(), findsOneWidget);
        await setStaffSessionToken(await SharedPreferences.getInstance(), null);
        await settle(tester);
        expect(savedPhoto(), findsNothing);
      }, () => server.client);
    });
  });

  group('UI polish', () {
    Future<SegmentedButton> stackedSelector(WidgetTester tester, Size size, double scale) async {
      setView(tester, size, textScale: scale);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SanitationMapPage(
            establishments: const [],
            householdRecords: const [],
            onRefresh: () async {},
            refreshing: false,
          ),
        ),
      ));
      await tester.pumpAndSettle();
      return tester.widget<SegmentedButton>(find.byWidgetPredicate((w) => w is SegmentedButton));
    }

    testWidgets('stacked GIS selector is a rounded rectangle, not an oval', (tester) async {
      final control = await stackedSelector(tester, const Size(320, 2400), 1.5);
      expect(control.direction, Axis.vertical);
      expect(control.style!.shape!.resolve({}), isA<RoundedRectangleBorder>());
      await tester.tap(find.text('Community Reports'));
      await tester.pump();
      final selected = tester.widget<SegmentedButton>(find.byWidgetPredicate((w) => w is SegmentedButton));
      expect(selected.selected, {selected.segments.last.value});
    });

    testWidgets('horizontal GIS selector keeps its default shape', (tester) async {
      final control = await stackedSelector(tester, const Size(1000, 2400), 1);
      expect(control.direction, Axis.horizontal);
      expect(control.style!.shape, isNull);
    });

    // The test font draws every glyph as a full em square, so "Households" is far
    // wider here than in the real font; 520 px at 1.5x is the equivalent squeeze
    // (it wraps without the fit). 320 px with real fonts is checked in Chrome.
    testWidgets('bottom navigation labels stay on one line when space is tight at 1.5x text', (tester) async {
      await pumpShell(tester, FakeStaffApi());
      setView(tester, const Size(520, 900), textScale: 1.5);
      await tester.pumpAndSettle();
      final bar = find.byType(NavigationBar);
      for (final label in ['Home', 'Records', 'Map', 'Households', 'Profile']) {
        final text = find.descendant(of: bar, matching: find.text(label));
        expect(text, findsOneWidget, reason: label);
        expect(lineCount(tester, text), 1, reason: '$label wrapped');
      }
      for (final destination in tester.widgetList(find.byType(NavigationDestination)).toList().asMap().keys) {
        final size = tester.getSize(find.byType(NavigationDestination).at(destination));
        expect(size.height, greaterThanOrEqualTo(48));
        expect(size.width, greaterThanOrEqualTo(48));
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('bottom navigation text scale is untouched when labels fit', (tester) async {
      await pumpShell(tester, FakeStaffApi());
      final bar = tester.element(find.byType(NavigationBar));
      final shell = tester.element(find.byType(SanitationNavLabelFit));
      expect(MediaQuery.textScalerOf(bar), MediaQuery.textScalerOf(shell));
    });

    testWidgets('front-photo controls are spaced from the Household head field', (tester) async {
      final server = HouseholdServer();
      setView(tester, const Size(360, 3000));
      await http.runWithClient(() async {
        await tester.pumpWidget(MaterialApp(
          home: HouseholdSurveyPage(
            api: const TourismApi(),
            barangays: SanitationBootstrap.fallback().barangays,
            household: HouseholdSanitationItem.fromJson(storedHousehold()),
          ),
        ));
        await tester.pumpAndSettle();
      }, () => server.client);
      final controlsBottom = tester.getBottomLeft(find.text('Reload Photo')).dy;
      final headTop = tester.getTopLeft(coordinateField('Household head')).dy;
      expect(headTop - controlsBottom, greaterThanOrEqualTo(16));
    });
  });
}
