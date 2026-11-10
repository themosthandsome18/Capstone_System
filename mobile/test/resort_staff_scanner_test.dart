// A resort's own staff (role `resort`) can use the staff QR scanner. The door lets them in beside admin and tourism and still refuses everyone else; the
// Export button is not drawn for them (how it LOOKS, the server is the lock); the two refusals of the server are said as they are; and the record card does
// not run out of the screen. Synthetic data only.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A TourismApi that answers from a script: a login for a role, and a lookup / history / check-in that fail with a given error.
class ScriptedApi extends TourismApi {
  ScriptedApi({this.role = 'resort', this.failure});

  final String role;
  final ApiException? failure;
  int logins = 0;
  int lookups = 0;
  int checkIns = 0;

  @override
  Future<Map<String, dynamic>> login({required String username, required String password}) async {
    logins++;
    return {
      'token': 'token-of-this-test',
      'user': {
        'display_name': 'Sample Person',
        'profile': {'role': role},
      },
    };
  }

  @override
  Future<Map<String, dynamic>> lookupTouristRecord(String query) async {
    lookups++;
    if (failure != null) throw failure!;
    return record();
  }

  @override
  Future<List<Map<String, dynamic>>> fetchTouristRecordHistory({String? search, int? resortId}) async {
    if (failure != null) throw failure!;
    return [];
  }

  @override
  Future<Map<String, dynamic>> checkInTouristRecord(Map<String, dynamic> payload) async {
    checkIns++;
    if (failure != null) throw failure!;
    return {};
  }
}

Map<String, dynamic> record([Map<String, dynamic> over = const {}]) => {
  'survey_id': 'SURV-TEST-001',
  'full_name': 'sample person',
  'email': 'sample@example.test',
  'contact_number': '09000000000',
  'country_name': 'Philippines',
  'region_name': 'CALABARZON Region',
  'province_name': 'Quezon',
  'resort_name': 'Sample Beach 1',
  'itinerary_name': 'Overnight',
  'travel_mode_name': 'Private Vehicle',
  'boat_type_name': 'Tourist Boat',
  'visit_purpose_name': 'Leisure',
  'arrival_date': '2026-10-12',
  'total_visitors': 4,
  'filipino_count': 3,
  'foreigner_count': 1,
  'total_male': 2,
  'total_female': 2,
  'age_0_7': 1,
  'age_8_59': 2,
  'age_60_above': 1,
  'status': 'arrived',
  ...over,
};

const notYourResort = ApiException(statusCode: 404, message: 'error: This booking is not for your resort.');
const notLinked = ApiException(statusCode: 403, message: 'This account is not linked to a resort.');
const generalForbidden = ApiException(statusCode: 403, message: 'Only tourism staff and administrators can look up visitor records.');

void setSize(WidgetTester tester, double width, [double height = 1200]) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// A page with one button that runs [action] with a context under a Navigator and a Scaffold.
Future<void> pumpHost(WidgetTester tester, Future<void> Function(BuildContext) action) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(child: ElevatedButton(onPressed: () => action(context), child: const Text('go'))),
        ),
      ),
    ),
  );
  await tester.tap(find.text('go'));
  await tester.pumpAndSettle();
}

Future<int> signIn(WidgetTester tester, String role) async {
  var authenticated = 0;
  final api = ScriptedApi(role: role);
  SharedPreferences.setMockInitialValues({});
  await pumpHost(tester, (context) async {
    showDialog(
      context: context,
      builder: (_) => StaffAuthGateDialog(api: api, onAuthenticated: () => authenticated++),
    );
  });
  await tester.enterText(find.widgetWithText(TextField, 'Username'), 'someone');
  await tester.enterText(find.widgetWithText(TextField, 'Password'), 'whatever-123');
  await tester.tap(find.text('Sign In & Unlock Scanner'));
  await tester.pumpAndSettle();
  return authenticated;
}

Future<void> pumpHub(WidgetTester tester, {String? role, String? kept, ScriptedApi? api}) async {
  SharedPreferences.setMockInitialValues({staffAuthRoleKey: ?kept});
  setSize(tester, 411);
  await tester.pumpWidget(const SizedBox()); // a fresh tree: the screen reads its role in initState
  await tester.pumpWidget(
    MaterialApp(
      home: TouristQrCheckInScreen(api: api ?? ScriptedApi(), bootstrap: MobileBootstrap.fallback(), staffRole: role),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('the door', () {
    for (final role in ['resort', 'admin', 'tourism']) {
      testWidgets('$role gets in: the gate lets the person through and keeps the role', (tester) async {
        expect(await signIn(tester, role), 1);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString(staffAuthRoleKey), role);
        expect(find.textContaining('Access restricted'), findsNothing);
      });
    }

    for (final role in ['tourist', 'establishment', 'sanitation', '']) {
      testWidgets('"$role" is refused as before: nobody is let in and no role is kept', (tester) async {
        expect(await signIn(tester, role), 0);
        expect(find.textContaining('Access restricted'), findsOneWidget);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString(staffAuthRoleKey), isNull);
      });
    }

    test('the rule itself: three roles come in, every other role and no role stay out', () {
      for (final role in ['resort', 'admin', 'tourism']) {
        expect(staffMayScan(role), isTrue);
      }
      for (final role in ['tourist', 'establishment', 'sanitation', 'auditor', '', null, 'Resort', 'RESORT', ' resort']) {
        expect(staffMayScan(role), isFalse);
      }
    });

    for (final entry in {'resort': true, 'admin': true, 'tourism': true, 'tourist': false, 'establishment': false}.entries) {
      testWidgets('a session already kept for "${entry.key}" ${entry.value ? 'opens the scanner' : 'is asked to sign in'}', (tester) async {
        SharedPreferences.setMockInitialValues({staffAuthTokenKey: 'kept-token', staffAuthRoleKey: entry.key});
        setSize(tester, 411);
        await pumpHost(
          tester,
          (context) => openStaffQrPortalWithAuth(context, api: ScriptedApi(), bootstrap: MobileBootstrap.fallback()),
        );
        expect(find.byType(TouristQrCheckInScreen), entry.value ? findsOneWidget : findsNothing);
        expect(find.byType(StaffAuthGateDialog), entry.value ? findsNothing : findsOneWidget);
      });
    }
  });

  group('Export / Download Records', () {
    for (final role in ['admin', 'tourism']) {
      testWidgets('is there for $role', (tester) async {
        await pumpHub(tester, role: role);
        expect(find.text('Export / Download Records'), findsOneWidget);
        // the fixture reached the case: the other two buttons of the same screen are there
        expect(find.text('Tourist History Log'), findsOneWidget);
      });
    }

    testWidgets('is NOT there for resort, and the other two buttons are', (tester) async {
      await pumpHub(tester, role: 'resort');
      expect(find.text('Export / Download Records'), findsNothing);
      expect(find.textContaining('Export'), findsNothing);
      expect(find.text('Tourist History Log'), findsOneWidget);
      expect(find.textContaining('Scan'), findsWidgets);
    });

    testWidgets('read from the kept sign-in when no role is given: resort has none, tourism has it', (tester) async {
      await pumpHub(tester, kept: 'resort');
      expect(find.text('Export / Download Records'), findsNothing);
      await pumpHub(tester, kept: 'tourism');
      expect(find.text('Export / Download Records'), findsOneWidget);
    });

    testWidgets('a role the screen does not know shows no export either', (tester) async {
      await pumpHub(tester, role: 'something-new');
      expect(find.text('Export / Download Records'), findsNothing);
    });

    test('the rule: admin and tourism only', () {
      expect(staffMayExport('admin'), isTrue);
      expect(staffMayExport('tourism'), isTrue);
      for (final role in ['resort', 'tourist', 'sanitation', '', null]) {
        expect(staffMayExport(role), isFalse);
      }
    });
  });

  group('the two refusals of the server are said as they are', () {
    test('the words, and nothing else is turned into them', () {
      expect(staffRefusalMessage(notYourResort), 'This booking is not for your resort.');
      expect(staffRefusalMessage(notLinked), 'This account is not linked to a resort.\nAsk the tourism office to link your account.');
      expect(staffRefusalMessage(generalForbidden), isNull);
      expect(staffRefusalMessage(const ApiException(statusCode: 404, message: 'error: Record not found')), isNull);
      expect(staffRefusalMessage(const ApiException(statusCode: 401, message: 'Your session expired')), isNull);
      expect(staffRefusalMessage(Exception('boom')), isNull);
    });

    Future<void> lookUp(WidgetTester tester, ApiException failure) async {
      await pumpHub(tester, role: 'resort', api: ScriptedApi(failure: failure));
      await tester.enterText(find.byType(TextField).first, 'SURV-TEST-001');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
    }

    testWidgets('a booking for another resort: "This booking is not for your resort." and not the general "not found"', (tester) async {
      await lookUp(tester, notYourResort);
      expect(find.text('This booking is not for your resort.'), findsOneWidget);
      expect(find.textContaining('not found'), findsNothing);
      expect(find.textContaining("don't have permission"), findsNothing);
    });

    testWidgets('an account with no resort: the sentence AND the line that says what to do', (tester) async {
      await lookUp(tester, notLinked);
      expect(find.textContaining('This account is not linked to a resort.'), findsOneWidget);
      expect(find.textContaining('Ask the tourism office to link your account.'), findsOneWidget);
      expect(find.textContaining("don't have permission"), findsNothing);
    });

    testWidgets('the general refusal still says what it always said', (tester) async {
      await lookUp(tester, generalForbidden);
      expect(find.text("You don't have permission to access visitor records."), findsOneWidget);
      expect(find.textContaining('Ask the tourism office'), findsNothing);
    });

    for (final entry in {'not for your resort': notYourResort, 'not linked': notLinked}.entries) {
      testWidgets('the history log says it too (${entry.key})', (tester) async {
        setSize(tester, 411);
        await tester.pumpWidget(
          MaterialApp(home: TouristHistoryLogScreen(api: ScriptedApi(failure: entry.value), bootstrap: MobileBootstrap.fallback())),
        );
        await tester.pumpAndSettle();
        final expected = staffRefusalMessage(entry.value)!;
        expect(find.text(expected), findsOneWidget);
        expect(find.textContaining("don't have permission"), findsNothing);
      });

      testWidgets('so does the check-in (${entry.key})', (tester) async {
        setSize(tester, 411, 2400);
        final api = ScriptedApi(failure: entry.value);
        await tester.pumpWidget(
          MaterialApp(home: ScannedTouristRecordSheet(recordData: record(), api: api, bootstrap: MobileBootstrap.fallback())),
        );
        await tester.pump();
        await tester.ensureVisible(find.text('Check in'));
        await tester.tap(find.text('Check in'));
        await tester.pumpAndSettle();
        expect(api.checkIns, 1); // the fixture reached the case: the check-in was asked for
        expect(find.text(staffRefusalMessage(entry.value)!), findsOneWidget);
        expect(find.textContaining("don't have permission"), findsNothing);
        expect(find.textContaining('Failed:'), findsNothing);
      });
    }
  });

  group('the record card does not run out of the screen', () {
    final long = record({
      'full_name': 'Maria Clara Magdalena de los Santos-Villanueva y Fernandez',
      'email': 'maria.clara.magdalena.de.los.santos.villanueva@example-long-domain-name.test',
      'contact_number': '+63 900 000 0000 loc. 1234 (after office hours only)',
      'country_name': 'United Kingdom of Great Britain and Northern Ireland',
      'region_name': 'Region IV-A (CALABARZON) — Calabarzon Administrative Region',
      'province_name': 'Quezon Province, Southern Tagalog Peninsula',
      'resort_name': 'Dona Choleng Camping and Beach Resort and Events Place of Mauban, Quezon',
      'itinerary_name': 'Overnight stay with the island hopping tour and the lighthouse visit',
      'travel_mode_name': 'Private Vehicle with a trailer, parked at the resort ground',
      'boat_type_name': 'Motorized outrigger tourist boat with a roof and life vests',
      'visit_purpose_name': 'Leisure, family reunion and the celebration of an anniversary',
    });

    Future<List<String>> overflowsAt(WidgetTester tester, double width, {double scale = 1.0}) async {
      setSize(tester, width, 4000);
      final seen = <String>[];
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed')) {
          final where = RegExp(r'tourist_qr_checkin_screens\.dart:(\d+)').firstMatch(details.toString()) ?.group(1) ?? '?';
          seen.add('${text.split('\n').first} (line $where)');
        } else {
          previous?.call(details);
        }
      };
      try {
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: ScannedTouristRecordSheet(recordData: long, api: ScriptedApi(), bootstrap: MobileBootstrap.fallback()),
          ),
        );
        await tester.pump();
      } finally {
        FlutterError.onError = previous; // given back BEFORE any expect(), as the test binding requires
      }
      return seen;
    }

    for (final width in [320.0, 360.0, 390.0]) {
      testWidgets('nothing overflows at ${width.toInt()} wide, with every line long', (tester) async {
        final seen = await overflowsAt(tester, width);
        expect(find.text('Resort'), findsOneWidget); // the fixture reached the case: the lines are drawn
        expect(find.text('Region / Province'), findsOneWidget);
        expect(find.textContaining('Dona Choleng Camping'), findsOneWidget);
        expect(seen, isEmpty);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('nothing overflows at 320 wide with the text at 130% either', (tester) async {
      final seen = await overflowsAt(tester, 320, scale: 1.3);
      expect(find.textContaining('Dona Choleng Camping'), findsOneWidget);
      expect(seen, isEmpty);
    });

    testWidgets('the long value is WRAPPED beside its label, not cut with dots', (tester) async {
      await overflowsAt(tester, 320);
      final resort = tester.widget<Text>(find.textContaining('Dona Choleng Camping'));
      expect(resort.overflow, isNull);
      expect(resort.maxLines, isNull);
      final box = tester.getSize(find.textContaining('Dona Choleng Camping'));
      expect(box.height, greaterThan(20)); // more than one line
      expect(box.width, lessThan(320));
    });
  });
}
