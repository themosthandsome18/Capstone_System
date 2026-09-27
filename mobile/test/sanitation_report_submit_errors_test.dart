// What the Community Report form does when sending fails.
//
// Public reporters have no drafts screen, so a failed report is not saved
// as a draft: the form keeps everything (including photos) and can simply be
// sent again. Every fill of the form carries one client_submission_id, reused
// on retries, so a resend after a timeout can never create a second report.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const serverRateLimit =
    'Naabot na ang 5 report ngayong araw para sa contact number na ito. '
    'Subukan muli bukas. / This contact number has reached 5 reports today. '
    'Please try again tomorrow.';
const serverMissingAddress =
    'Ilagay ang lokasyon o address ng nakitang problema. / '
    'Please enter the location or address of the problem.';
const networkMessage =
    'Hindi naipadala. Tingnan ang internet at subukan ulit. / '
    'Not sent. Check your connection and try again.';
const serverProblemMessage =
    'May problema sa server. Subukan ulit mamaya. / '
    'Server problem. Please try again later.';

class ScriptedReportApi extends TourismApi {
  ScriptedReportApi(this.outcomes);

  /// One entry per call: an error to throw, or null for success.
  final List<Object?> outcomes;
  final List<Map<String, Object?>> calls = [];

  @override
  Future<Map<String, dynamic>> submitSanitationReport({
    required String name,
    required String contactNumber,
    required String category,
    required String priority,
    required String barangay,
    required String locationAddress,
    required String description,
    List<XFile> photos = const [],
    required String latitude,
    required String longitude,
    String clientSubmissionId = '',
  }) async {
    calls.add({
      'name': name,
      'contact_number': contactNumber,
      'location_address': locationAddress,
      'description': description,
      'photos': photos.length,
      'client_submission_id': clientSubmissionId,
    });
    final outcome = outcomes.isEmpty ? null : outcomes.removeAt(0);
    if (outcome != null) throw outcome;
    return {
      'complaint_id': 'SAN-OK-${calls.length}',
      'category': category,
      'barangay': barangay,
      'status': 'pending',
      'priority': priority,
    };
  }
}

class FakePicker extends ImagePicker {
  @override
  Future<List<XFile>> pickMultiImage({
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    int? limit,
    bool requestFullMetadata = true,
  }) async {
    // A valid 1x1 PNG, so the thumbnails decode.
    final bytes = Uint8List.fromList(const [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    return [
      XFile.fromData(bytes, name: 'one.png', mimeType: 'image/png'),
      XFile.fromData(bytes, name: 'two.png', mimeType: 'image/png'),
    ];
  }
}

const barangays = [BarangayItem(id: 1, name: 'Daungan')];

Future<void> pumpForm(
  WidgetTester tester,
  TourismApi api, {
  bool staff = false,
  Key? key,
}) async {
  tester.view.physicalSize = const Size(1080, 7000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: SanitationReportPage(
        key: key,
        api: api,
        barangays: barangays,
        saveDraftOnFailure: staff,
        imagePicker: FakePicker(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  if (find.byType(Dialog).evaluate().isNotEmpty) {
    await tester.tap(
      find.descendant(of: find.byType(Dialog), matching: find.byIcon(Icons.close)),
    );
    await tester.pumpAndSettle();
  }
}

Future<void> enter(WidgetTester tester, String label, String text) async {
  await tester.enterText(find.widgetWithText(TextField, label), text);
  await tester.pump();
}

Future<void> fillForm(WidgetTester tester) async {
  await tester.tap(find.text('Improper Garbage Disposal'));
  await tester.pump();
  await tester.tap(find.text('Piliin ang barangay'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Daungan').last);
  await tester.pumpAndSettle();
  await enter(tester, 'Lokasyon / Address *', 'Purok 3');
  await enter(tester, 'Ilarawan ang nakita mo *', 'Nakatambak ang basura.');
  await enter(tester, 'Pangalan *', 'Juana Reporter');
  await enter(tester, 'Contact no. *', '09171234567');
  await tester.tap(find.byKey(const ValueKey('community-report-consent')));
  await tester.pump();
  await tester.tap(find.text('Mag-upload'));
  await tester.pump();
  await tester.pump();
}

Future<void> send(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('community-report-submit')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

Future<void> dismissMessages(WidgetTester tester) async {
  ScaffoldMessenger.of(tester.element(find.byType(SanitationReportPage)))
      .clearSnackBars();
  await tester.pump(const Duration(seconds: 1));
}

String fieldText(WidgetTester tester, String label) {
  return tester
      .widget<TextField>(find.widgetWithText(TextField, label))
      .controller!
      .text;
}

Future<void> expectFormKept(WidgetTester tester) async {
  expect(fieldText(tester, 'Lokasyon / Address *'), 'Purok 3');
  expect(fieldText(tester, 'Ilarawan ang nakita mo *'), 'Nakatambak ang basura.');
  expect(fieldText(tester, 'Pangalan *'), 'Juana Reporter');
  expect(fieldText(tester, 'Contact no. *'), '09171234567');
  expect(find.byTooltip('Alisin'), findsNWidgets(2), reason: 'photos kept');
  expect(await SanitationDraftStore.loadReports(), isEmpty, reason: 'no draft');
  expect(find.textContaining('draft'), findsNothing);
  final button = tester.widget<FilledButton>(
    find.descendant(
      of: find.byKey(const ValueKey('community-report-submit')),
      matching: find.byWidgetPredicate((widget) => widget is FilledButton),
    ),
  );
  expect(button.onPressed, isNotNull, reason: 'submit works again');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final failures = <String, (Object, String)>{
    '429 shows the server message': (
      const ApiException(statusCode: 429, message: serverRateLimit),
      serverRateLimit,
    ),
    '400 shows the server message': (
      const ApiException(statusCode: 400, message: serverMissingAddress),
      serverMissingAddress,
    ),
    'a timeout shows the connection message': (
      TimeoutException('Future not completed', const Duration(seconds: 90)),
      networkMessage,
    ),
    'no network shows the connection message': (
      const SocketException('Failed host lookup: capstone-backend-stzr.onrender.com'),
      networkMessage,
    ),
    'a 5xx shows the server-problem message': (
      const ApiException(statusCode: 503, message: 'Service Unavailable'),
      serverProblemMessage,
    ),
  };

  failures.forEach((name, failure) {
    testWidgets('$name, keeps the form and photos, saves no draft', (tester) async {
      final api = ScriptedReportApi([failure.$1]);
      await pumpForm(tester, api);
      await fillForm(tester);

      await send(tester);

      expect(api.calls, hasLength(1));
      expect(api.calls.single['photos'], 2);
      expect(find.text(failure.$2), findsOneWidget);
      await expectFormKept(tester);
    });
  });

  testWidgets('a retry of the same form sends the same client_submission_id', (tester) async {
    final api = ScriptedReportApi([
      TimeoutException('Future not completed', const Duration(seconds: 90)),
      null,
    ]);
    await pumpForm(tester, api);
    await fillForm(tester);

    await send(tester);
    await dismissMessages(tester);
    await send(tester);

    expect(api.calls, hasLength(2));
    final first = api.calls[0]['client_submission_id'] as String;
    expect(first, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(api.calls[1]['client_submission_id'], first);
    expect(api.calls[1]['photos'], 2);
  });

  testWidgets('a new form after a successful submit gets a new id', (tester) async {
    final api = ScriptedReportApi([null, null]);
    await pumpForm(tester, api, key: const ValueKey('form-1'));
    await fillForm(tester);
    await send(tester);

    // A fresh app, as when the reporter opens Community Report again.
    await tester.pumpWidget(const SizedBox());
    await pumpForm(tester, api, key: const ValueKey('form-2'));
    await fillForm(tester);
    await send(tester);

    expect(api.calls, hasLength(2));
    expect(api.calls[0]['client_submission_id'], isNotEmpty);
    expect(api.calls[1]['client_submission_id'], isNot(api.calls[0]['client_submission_id']));
  });

  testWidgets('while sending, a second tap does nothing and the wait is explained',
      (tester) async {
    final gate = Completer<void>();
    final api = _SlowApi(gate);
    await pumpForm(tester, api);
    await fillForm(tester);

    await tester.tap(find.byKey(const ValueKey('community-report-submit')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('community-report-submit')));
    await tester.pump();

    expect(api.calls, 1);
    expect(find.textContaining('hanggang isang minuto'), findsOneWidget);
    gate.complete();
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('the staff app still keeps a failed report as a draft', (tester) async {
    final api = ScriptedReportApi([
      TimeoutException('Future not completed', const Duration(seconds: 90)),
    ]);
    await pumpForm(tester, api, staff: true);
    await fillForm(tester);

    await send(tester);

    expect(await SanitationDraftStore.loadReports(), hasLength(1));
    expect(find.text('I-save bilang draft'), findsOneWidget);
  });
}

class _SlowApi extends TourismApi {
  _SlowApi(this.gate);

  final Completer<void> gate;
  int calls = 0;

  @override
  Future<Map<String, dynamic>> submitSanitationReport({
    required String name,
    required String contactNumber,
    required String category,
    required String priority,
    required String barangay,
    required String locationAddress,
    required String description,
    List<XFile> photos = const [],
    required String latitude,
    required String longitude,
    String clientSubmissionId = '',
  }) async {
    calls++;
    await gate.future;
    return {'complaint_id': 'SAN-SLOW', 'category': category, 'barangay': barangay};
  }
}
