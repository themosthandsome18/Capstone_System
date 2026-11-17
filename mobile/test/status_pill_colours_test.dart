// The colour of a booking's status is the same wherever the app shows it: Pending is amber, Arrived is green, Cancelled is red. The pass used to show
// every status in green, which said "done" of a tourist who had not come yet. The colours have ONE source, touristStatusChip (the chips of the staff QR
// check-in History); the pill on a pass uses it, and so does everything else that shows these three statuses. The people here are made up.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const amber = (background: Color(0xFFFEF3C7), foreground: Color(0xFF92400E));
const green = (background: Color(0xFFDCFCE7), foreground: Color(0xFF166534));
const red = (background: Color(0xFFFEE2E2), foreground: Color(0xFF991B1B));

/// status -> (word, colours): written out here on purpose, and not read from the app, so that a colour changed in the app is seen.
final expected = {
  'pending': ('Pending', amber),
  'arrived': ('Arrived', green),
  'no_show': ('Cancelled', red),
};

MobileVisitReceipt pass(String status) => MobileVisitReceipt(
  reference: 'SURV-TEST-1',
  destination: keptDestination(7, 'Sample Beach'),
  arrivalDate: DateTime(2099, 6, 1),
  totalVisitors: 2,
  status: status,
  fullName: 'Sample Person',
  contactNumber: '+639000000001',
  email: 'sample@example.test',
);

class HistoryApi extends TourismApi {
  HistoryApi(this.records);

  final List<Map<String, dynamic>> records;

  @override
  Future<List<Map<String, dynamic>>> fetchTouristRecordHistory({String? search, int? resortId}) async => records;
}

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(411, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset') || text.contains('NetworkImage')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
}

Future<void> show(WidgetTester tester, Widget child) async {
  bigScreen(tester);
  await tester.pumpWidget(MaterialApp(theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none), home: Scaffold(body: SingleChildScrollView(child: child))));
  await tester.pump();
}

/// The colours a pill (or chip) really paints: its fill and its text.
({Color background, Color foreground, String text}) painted(WidgetTester tester, Finder pill) {
  final box = tester.widget<Container>(find.descendant(of: pill, matching: find.byType(Container)).first).decoration! as BoxDecoration;
  final text = tester.widget<Text>(find.descendant(of: pill, matching: find.byType(Text)).first);
  return (background: box.color!, foreground: text.style!.color!, text: text.data!);
}

/// WCAG contrast ratio of two colours: (lighter + 0.05) / (darker + 0.05), by their relative luminance.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final lighter = la > lb ? la : lb;
  final darker = la > lb ? lb : la;
  return (lighter + 0.05) / (darker + 0.05);
}

void expectPainted(WidgetTester tester, Finder pill, String status) {
  final (word, colours) = expected[status]!;
  final got = painted(tester, pill);
  expect(got.text, word, reason: status);
  expect(got.background, colours.background, reason: '$status: the fill');
  expect(got.foreground, colours.foreground, reason: '$status: the text');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the one source: touristStatusChip', () {
    for (final entry in expected.entries) {
      test('${entry.key} is ${entry.value.$1}, in its own colours', () {
        final chip = touristStatusChip(entry.key)!;

        expect(chip.label, entry.value.$1);
        expect(chip.background, entry.value.$2.background);
        expect(chip.foreground, entry.value.$2.foreground);
      });
    }

    test('Pending is amber, not green: it does not look like a success', () {
      final pending = touristStatusChip('pending')!;
      final arrived = touristStatusChip('arrived')!;

      expect(pending.background, isNot(arrived.background));
      expect(pending.foreground, isNot(arrived.foreground));
      // amber: red and green high, blue low (a green is the other way round)
      expect(pending.background.r, greaterThan(pending.background.b));
      expect(pending.foreground.r, greaterThan(pending.foreground.g));
    });

    test('Cancelled is red, not yellow', () {
      final cancelled = touristStatusChip('no_show')!;

      expect(cancelled.foreground.r, greaterThan(cancelled.foreground.g * 3));
      expect(cancelled.background, isNot(touristStatusChip('pending')!.background));
    });

    test('the three are three different colours', () {
      final fills = ['pending', 'arrived', 'no_show'].map((status) => touristStatusChip(status)!.background).toSet();
      expect(fills, hasLength(3));
    });
  });

  group('everywhere the app shows these three statuses', () {
    for (final status in expected.keys) {
      testWidgets('the pass card in My Visit and in Visit History: $status', (tester) async {
        await show(tester, VisitReceiptCard(receipt: pass(status)));

        expectPainted(tester, find.byType(BookingStatusPill), status);
      });

      testWidgets('the Status row of the QR pass: $status', (tester) async {
        await show(tester, TouristDigitalPassModal(receipt: pass(status), saver: (_, _) async => ''));

        expectPainted(tester, find.byType(BookingStatusPill), status);
      });

      testWidgets('the staff QR check-in History chip: $status', (tester) async {
        bigScreen(tester);
        await tester.pumpWidget(
          MaterialApp(
            home: TouristHistoryLogScreen(
              api: HistoryApi([
                {'survey_id': 'SURV-TEST-007', 'status': status, 'full_name': 'chip person', 'resort_name': 'Sample Beach', 'arrival_date': '2026-10-12', 'total_visitors': 5},
              ]),
              bootstrap: MobileBootstrap.fallback(),
            ),
          ),
        );
        await tester.pump();
        await tester.pump();

        final (word, colours) = expected[status]!;
        final label = find.text(word);
        expect(label, findsOneWidget);
        final chip = find.ancestor(of: label, matching: find.byType(Container)).first;
        final box = tester.widget<Container>(chip).decoration! as BoxDecoration;
        expect(box.color, colours.background);
        expect(tester.widget<Text>(label).style!.color, colours.foreground);
      });
    }

    testWidgets('the pass card and the staff chip say the same thing about the same status', (tester) async {
      for (final status in expected.keys) {
        await show(tester, VisitReceiptCard(receipt: pass(status)));
        final pill = painted(tester, find.byType(BookingStatusPill));
        final chip = touristStatusChip(status)!;

        expect(pill.background, chip.background, reason: status);
        expect(pill.foreground, chip.foreground, reason: status);
        expect(pill.text, chip.label, reason: status);
      }
    });

    for (final status in expected.keys) {
      testWidgets('the passes in the app (My Visit, Visit History) show $status in its colours', (tester) async {
        await const MyVisitsStore().saveVisits([pass(status)]);
        await const MyVisitsStore().saveProfile(const MobileUserProfile(name: 'Sample Person', email: 'sample@example.test', contactNumber: '+639000000001'));
        bigScreen(tester);
        await tester.pumpWidget(
          MaterialApp(
            theme: buildAppTheme(isSanitation: false, theme: TourismTheme.none),
            home: MobileShell(api: const TourismApi(), state: TourismBootstrapState.loaded(MobileBootstrap.fallback()), onRetry: () {}, onSignOut: () {}),
          ),
        );
        for (var i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 60));
        }

        await tester.tap(find.text('Profile').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Visit History & Entry Passes (1)'));
        await tester.pumpAndSettle();

        expectPainted(tester, find.byType(BookingStatusPill), status);
      });
    }

    testWidgets('a status the app does not know gets a neutral pill, never a status colour', (tester) async {
      for (final status in ['on_hold', '', 'ARRIVED_LATER']) {
        await show(tester, BookingStatusPill(status: status));
        final got = painted(tester, find.byType(BookingStatusPill));

        expect(got.background, BookingStatusPill.unknownBackground, reason: 'status "$status"');
        expect(got.foreground, BookingStatusPill.unknownForeground, reason: 'status "$status"');
        for (final known in expected.values) {
          expect(got.background, isNot(known.$2.background));
        }
      }
    });

    testWidgets('the status is read without regard to case or spaces, as the server and the staff chip read it', (tester) async {
      await show(tester, const BookingStatusPill(status: ' Arrived '));

      expectPainted(tester, find.byType(BookingStatusPill), 'arrived');
    });
  });

  group('the words in the pill can be read: contrast, measured', () {
    // 4.5 : 1 is the WCAG AA minimum for normal text (these are 11 px, bold)
    const minimum = 4.5;

    for (final entry in expected.entries) {
      test('${entry.value.$1}: the text on its fill is at least $minimum : 1', () {
        final ratio = contrast(entry.value.$2.foreground, entry.value.$2.background);

        expect(ratio, greaterThanOrEqualTo(minimum), reason: '${entry.key}: ${ratio.toStringAsFixed(2)} : 1');
      });

      test('${entry.value.$1}: what the app paints has that contrast too', () {
        final chip = touristStatusChip(entry.key)!;

        expect(contrast(chip.foreground, chip.background), greaterThanOrEqualTo(minimum));
      });
    }

    test('the neutral pill of an unknown status can be read too', () {
      expect(contrast(BookingStatusPill.unknownForeground, BookingStatusPill.unknownBackground), greaterThanOrEqualTo(minimum));
    });

    test('the contrast function is right: black on white is 21 : 1, white on white is 1 : 1', () {
      expect(contrast(const Color(0xFF000000), const Color(0xFFFFFFFF)), closeTo(21, 0.01));
      expect(contrast(const Color(0xFFFFFFFF), const Color(0xFFFFFFFF)), closeTo(1, 0.0001));
    });
  });
}
