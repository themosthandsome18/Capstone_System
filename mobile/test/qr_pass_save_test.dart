// "Save QR Pass" on the Visit Registered pass: one press puts the picture of the pass in the gallery of the phone, with no share sheet. The saver is handed in,
// so no test touches a real gallery. The failures a gallery gives (every type of GalException of gal 2.3.3) are each said in a clear English sentence, and none
// of them escapes. The real saver is tested against a mock of the native side of gal. Synthetic data only.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gal/gal.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SaverCall {
  SaverCall(this.bytes, this.fileName);
  final Uint8List bytes;
  final String fileName;
}

final calls = <SaverCall>[];

MobileVisitReceipt receipt({String reference = 'SURV-2026-10001'}) => MobileVisitReceipt(
  reference: reference,
  destination: Destination.placeholder(),
  arrivalDate: DateTime(2026, 10, 11),
  totalVisitors: 2,
  status: 'pending',
  fullName: 'Sample Person',
  contactNumber: '09000000000',
  email: 'sample@example.test',
);

/// What a share sheet would be: share_plus asks the platform through this channel. The test says that it is never asked.
final shareCalls = <MethodCall>[];

Future<void> pumpPass(WidgetTester tester, QrPassSaver saver, {String reference = 'SURV-2026-10001'}) async {
  SharedPreferences.setMockInitialValues({});
  shareCalls.clear();
  tester.view.physicalSize = const Size(411, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('dev.fluttercommunity.plus/share'), (call) async {
    shareCalls.add(call);
    return null;
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('dev.fluttercommunity.plus/share'), null));
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: TouristDigitalPassModal(receipt: receipt(reference: reference), saver: saver))));
  await tester.pump();
}

/// Presses the button and lets the whole thing run (a short wait, the picture of the pass being made by the engine, which is real time).
Future<void> pressSave(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Save QR Pass'));
  await tester.tap(find.text('Save QR Pass'));
  await tester.pump(const Duration(milliseconds: 100));
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 600)));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> recording(Uint8List bytes, String fileName) async => calls.add(SaverCall(bytes, fileName));

final pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

void main() {
  setUp(calls.clear);

  group('the button', () {
    testWidgets('is called "Save QR Pass", with an icon that means saving, not sharing', (tester) async {
      await pumpPass(tester, recording);
      expect(find.text('Save QR Pass'), findsOneWidget);
      expect(find.text('Save / Share QR Pass'), findsNothing);
      expect(find.textContaining('Share'), findsNothing);
      expect(find.byIcon(Icons.save_alt), findsOneWidget);
      expect(find.byIcon(Icons.share), findsNothing);
    });
  });

  group('pressing it', () {
    testWidgets('calls the saver ONCE, with the picture of the pass (a PNG) and the name mauban_qr_<SURVEY_ID>.png', (tester) async {
      await pumpPass(tester, recording);
      await pressSave(tester);
      expect(calls, hasLength(1));
      expect(calls.single.fileName, 'mauban_qr_SURV-2026-10001.png');
      expect(calls.single.bytes.length, greaterThan(1000)); // a real picture, not an empty list
      expect(calls.single.bytes.sublist(0, 8), pngSignature);
    });

    testWidgets('a reference with other characters is made safe for a file name, as it always was', (tester) async {
      await pumpPass(tester, recording, reference: 'SURV 2026/10001');
      await pressSave(tester);
      expect(calls.single.fileName, 'mauban_qr_SURV_2026_10001.png');
    });

    testWidgets('says "Saved to Gallery", and says nothing else', (tester) async {
      await pumpPass(tester, recording);
      await pressSave(tester);
      expect(find.text('Saved to Gallery'), findsOneWidget);
      expect(find.textContaining('Could not'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('opens NO share sheet: the platform is never asked to share anything', (tester) async {
      await pumpPass(tester, recording);
      await pressSave(tester);
      expect(calls, hasLength(1)); // the fixture: the press went all the way
      expect(shareCalls, isEmpty);
      expect(find.textContaining('shared'), findsNothing);
    });

    testWidgets('pressed twice quickly, it saves once (the button waits while it works)', (tester) async {
      await pumpPass(tester, recording);
      await tester.ensureVisible(find.text('Save QR Pass'));
      await tester.tap(find.text('Save QR Pass'));
      await tester.pump(const Duration(milliseconds: 10));
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 600)));
      await tester.pump();
      expect(calls, hasLength(1));
    });
  });

  group('when the saver fails, the person is told and nothing escapes', () {
    final cases = <GalExceptionType, String>{
      GalExceptionType.accessDenied: 'Could not save the QR Pass: this app is not allowed to save to the gallery. Allow it in your phone settings and try again.',
      GalExceptionType.notEnoughSpace: 'Could not save the QR Pass: there is not enough storage space on your phone.',
      GalExceptionType.notSupportedFormat: 'Could not save the QR Pass: the image format is not supported.',
      GalExceptionType.unexpected: 'Could not save the QR Pass: an unexpected error happened. Please try again.',
    };

    test('the types are the four that gal 2.3.3 has (a new one in a later version must be looked at)', () {
      expect(GalExceptionType.values.toSet(), cases.keys.toSet());
    });

    for (final entry in cases.entries) {
      testWidgets('${entry.key.name}: "${entry.value}"', (tester) async {
        await pumpPass(tester, (bytes, name) async {
          calls.add(SaverCall(bytes, name));
          throw GalException(type: entry.key, platformException: PlatformException(code: entry.key.code), stackTrace: StackTrace.current);
        });
        await pressSave(tester);
        expect(calls, hasLength(1)); // the fixture: the saver was reached and it failed
        expect(find.text(entry.value), findsOneWidget);
        expect(find.text('Saved to Gallery'), findsNothing);
        expect(tester.takeException(), isNull);
        // and the button is back, so the person can try again
        expect(find.text('Save QR Pass'), findsOneWidget);
        expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
      });
    }

    testWidgets('any other error is said too, with what it is, and does not escape', (tester) async {
      await pumpPass(tester, (bytes, name) async => throw Exception('the disk went away'));
      await pressSave(tester);
      expect(find.text('Could not save the QR Pass: the disk went away'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a platform without the plugin (an exception that is not a GalException) is said too', (tester) async {
      await pumpPass(tester, (bytes, name) async => throw MissingPluginException('No implementation found'));
      await pressSave(tester);
      expect(find.textContaining('Could not save the QR Pass'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    test('every message is one English sentence of its own', () {
      final messages = [for (final type in GalExceptionType.values) qrPassSaveErrorMessage(GalException(type: type, platformException: PlatformException(code: type.code), stackTrace: StackTrace.empty))];
      expect(messages.toSet(), hasLength(GalExceptionType.values.length), reason: 'a message for each reason, not one for all');
      for (final message in messages) {
        expect(message, startsWith('Could not save the QR Pass'));
        expect(message, endsWith('.'));
        expect(message, isNot(contains('GalException')));
        expect(message, isNot(contains('ACCESS_DENIED')));
      }
    });
  });

  group('the real saver, against a mock of the native side of gal', () {
    final native = <String>[];
    Uint8List? savedBytes;
    String? savedName;
    late bool hasAccess;
    late bool grantsAccess;
    String? failWith;

    setUp(() {
      native.clear();
      savedBytes = null;
      savedName = null;
      hasAccess = true;
      grantsAccess = true;
      failWith = null;
      TestWidgetsFlutterBinding.ensureInitialized();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), (call) async {
        native.add(call.method);
        switch (call.method) {
          case 'hasAccess':
            return hasAccess;
          case 'requestAccess':
            return grantsAccess;
          case 'putImageBytes':
            if (failWith != null) throw PlatformException(code: failWith!, message: 'native said so');
            savedBytes = call.arguments['bytes'] as Uint8List;
            savedName = call.arguments['name'] as String;
            return null;
        }
        return null;
      });
    });
    tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), null));

    test('saves the bytes under the name WITHOUT the extension (gal puts it), so the file is mauban_qr_<ID>.png', () async {
      await saveQrPassToGallery(Uint8List.fromList([1, 2, 3]), 'mauban_qr_SURV-1.png');
      expect(savedBytes, [1, 2, 3]);
      expect(savedName, 'mauban_qr_SURV-1');
    });

    test('asks whether it has access FIRST, and the picture goes last', () async {
      await saveQrPassToGallery(Uint8List.fromList([1]), 'mauban_qr_X.png');
      expect(native.first, 'hasAccess');
      expect(native.last, 'putImageBytes');
      expect(native.where((call) => call == 'putImageBytes'), hasLength(1));
    });

    test('without access it asks for it, and saves when it is granted', () async {
      hasAccess = false;
      grantsAccess = true;
      await saveQrPassToGallery(Uint8List.fromList([9]), 'mauban_qr_Y.png');
      expect(native, contains('requestAccess'));
      expect(savedName, 'mauban_qr_Y');
    });

    test('without access and refused: it saves NOTHING and throws accessDenied', () async {
      hasAccess = false;
      grantsAccess = false;
      await expectLater(
        saveQrPassToGallery(Uint8List.fromList([9]), 'mauban_qr_Z.png'),
        throwsA(isA<GalException>().having((e) => e.type, 'type', GalExceptionType.accessDenied)),
      );
      expect(native, isNot(contains('putImageBytes')));
      expect(savedBytes, isNull);
    });

    for (final entry in {
      'ACCESS_DENIED': GalExceptionType.accessDenied,
      'NOT_ENOUGH_SPACE': GalExceptionType.notEnoughSpace,
      'NOT_SUPPORTED_FORMAT': GalExceptionType.notSupportedFormat,
      'UNEXPECTED': GalExceptionType.unexpected,
    }.entries) {
      test('the native ${entry.key} becomes a GalException of type ${entry.value.name}, which the pass then says in English', () async {
        failWith = entry.key;
        await expectLater(
          saveQrPassToGallery(Uint8List.fromList([5]), 'mauban_qr_W.png'),
          throwsA(isA<GalException>().having((e) => e.type, 'type', entry.value)),
        );
        try {
          await saveQrPassToGallery(Uint8List.fromList([5]), 'mauban_qr_W.png');
        } catch (e) {
          expect(qrPassSaveErrorMessage(e), startsWith('Could not save the QR Pass'));
        }
      });
    }
  });
}
