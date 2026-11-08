// The Notifications page of the tourism side: its own subtitle (not the sanitation's), a line of the colour of the weight down the side of each notice
// instead of a round icon, and "No new advisories" when there is none. The sanitation side keeps its subtitle and its round icon: it is given nothing
// new. Synthetic data only: no real notice, person or contact.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson, openHome;

const newSubtitle = 'Advisories from the Mauban Tourism Office';
const sanitationSubtitle = 'Sanitary advisories and compliance updates';

class FixedApi extends TourismApi {
  FixedApi(this.map);
  final Map<String, dynamic> map;

  @override
  Future<String> fetchBootstrapRaw() async => jsonEncode(map);
}

Map<String, dynamic> notice(String id, String title, String message, {String? severity, String type = 'tourism'}) => {
  'id': id,
  'type': type,
  'title': title,
  'message': message,
  'severity': ?severity,
  'created_at': '2026-11-08T08:00:00+00:00',
};

Future<void> openNotifications(WidgetTester tester, List<Map<String, dynamic>> notices) async {
  final map = bootstrapJson(0)..['notifications'] = notices;
  await openHome(tester, FixedApi(map));
  await tester.tap(find.byIcon(Icons.notifications_outlined).first);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

Finder card(String id) => find.byKey(ValueKey('notice-$id'));
Finder stripe(String id) => find.byKey(ValueKey('notice-stripe-$id'));
Color colourOf(WidgetTester tester, Finder stripe) => tester.widget<Container>(stripe).color!;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('the tourism side', () {
    testWidgets('says the words of the Tourism Office under the title, and not the sanitation ones', (tester) async {
      await openNotifications(tester, [notice('advisory-1', 'Sea advisory', 'Boats may be delayed.')]);
      expect(find.byType(NotificationPage), findsOneWidget);
      expect(find.text('Notifications'), findsWidgets);
      expect(find.text(newSubtitle), findsOneWidget);
      expect(find.text(sanitationSubtitle), findsNothing);
    });

    testWidgets('each notice has a line down its side, and no round icon', (tester) async {
      await openNotifications(tester, [
        notice('advisory-1', 'First', 'One', severity: 'info'),
        notice('advisory-2', 'Second', 'Two', severity: 'warning'),
      ]);
      expect(stripe('advisory-1'), findsOneWidget);
      expect(stripe('advisory-2'), findsOneWidget);
      expect(find.descendant(of: find.byType(NotificationPage), matching: find.byType(CircleAvatar)), findsNothing);
      expect(find.descendant(of: card('advisory-1'), matching: find.byType(Icon)), findsNothing);
      expect(find.descendant(of: card('advisory-2'), matching: find.byType(Icon)), findsNothing);
      expect(find.text('First'), findsOneWidget);
      expect(find.text('Two'), findsOneWidget);
    });

    testWidgets('the three weights have the colours the app already has: info the blue of the other notices, warning the amber, critical the red', (tester) async {
      await openNotifications(tester, [
        notice('advisory-1', 'Info', 'a', severity: 'info'),
        notice('advisory-2', 'Warning', 'b', severity: 'warning'),
        notice('advisory-3', 'Critical', 'c', severity: 'critical'),
      ]);
      expect(colourOf(tester, stripe('advisory-1')), Colors.blue);
      expect(colourOf(tester, stripe('advisory-2')), AppColors.amber);
      expect(colourOf(tester, stripe('advisory-3')), AppColors.red);
      expect({colourOf(tester, stripe('advisory-1')), colourOf(tester, stripe('advisory-2')), colourOf(tester, stripe('advisory-3'))}, hasLength(3));
    });

    testWidgets('a notice with no weight, or one this app does not know, is info', (tester) async {
      await openNotifications(tester, [
        notice('advisory-1', 'None', 'a'),
        notice('advisory-2', 'Odd', 'b', severity: 'urgent-ish'),
        notice('advisory-3', 'Empty', 'c', severity: ''),
      ]);
      for (final id in ['advisory-1', 'advisory-2', 'advisory-3']) {
        expect(colourOf(tester, stripe(id)), Colors.blue, reason: id);
      }
    });

    testWidgets('the line is 4 wide, flush with the left edge, and as tall as its whole row (measured on the screen)', (tester) async {
      await openNotifications(tester, [
        notice('advisory-1', 'Short', 'One line.', severity: 'critical'),
        notice('advisory-2', 'Long', 'A long message that runs over several lines so that the row is much taller than the first one. ' * 3, severity: 'warning'),
      ]);
      final heights = <double>[];
      for (final id in ['advisory-1', 'advisory-2']) {
        final box = tester.getRect(card(id));
        final line = tester.getRect(stripe(id));
        expect(line.width, 4, reason: id);
        expect(line.height, box.height, reason: 'the line is as tall as the row: $line, row $box');
        expect(line.top, box.top, reason: id);
        expect(line.bottom, box.bottom, reason: id);
        expect(line.left, box.left, reason: 'against the left edge of the box');
        heights.add(box.height);
      }
      expect(heights[1], greaterThan(heights[0] + 20), reason: 'the fixture: the two rows really are of different heights');
    });

    testWidgets('with no notice it says No new advisories, as it always did, and there is no line', (tester) async {
      await openNotifications(tester, []);
      expect(find.text('No new advisories'), findsOneWidget);
      expect(find.text('Check back later for official announcements.'), findsOneWidget);
      expect(find.byIcon(Icons.notifications_off_outlined), findsOneWidget);
      expect(find.byKey(const ValueKey('notice-stripe-x')), findsNothing);
      expect(find.text(newSubtitle), findsOneWidget);
    });

    testWidgets('a notice is never a "trending" line made by the app', (tester) async {
      await openNotifications(tester, [notice('advisory-1', 'Real advisory', 'Real message.')]);
      expect(find.textContaining('trending'), findsNothing);
      expect(find.textContaining('tourism guide data'), findsNothing);
      expect(find.textContaining('recorded visitor arrivals'), findsNothing);
    });
  });

  group('the sanitation side is as it was', () {
    final items = [
      const AppNotification(id: 'permit-1', title: 'Permit expiring soon', message: 'A Place expires on 2026-12-01.', type: 'permit'),
      const AppNotification(id: 'complaint-2', title: 'Garbage', message: 'Cagsiay I - Open', type: 'warning', severity: 'critical'),
    ];

    testWidgets('without being asked it has the round icon, no line, and the subtitle it has always had', (tester) async {
      await tester.pumpWidget(MaterialApp(home: NotificationPage(notifications: items, subtitle: sanitationSubtitle)));
      expect(find.text(sanitationSubtitle), findsOneWidget);
      expect(find.byType(CircleAvatar), findsNWidgets(2));
      expect(find.byKey(const ValueKey('notice-stripe-permit-1')), findsNothing);
      expect(find.byKey(const ValueKey('notice-stripe-complaint-2')), findsNothing);
      expect(find.text('Permit expiring soon'), findsOneWidget);
    });

    testWidgets('a notice that has a weight still gets the icon here (the weight is for the tourism side only)', (tester) async {
      await tester.pumpWidget(MaterialApp(home: NotificationPage(notifications: items)));
      expect(find.byType(CircleAvatar), findsNWidgets(2));
      expect(find.text(sanitationSubtitle), findsOneWidget, reason: 'the default of the page is the sanitation words, unchanged');
    });

    test('the sanitation screen still passes the same words and asks for no line', () {
      final source = File('lib/screens/sanitation_screens.dart').readAsStringSync();
      expect(source, contains("subtitle: 'Sanitary advisories and compliance updates'"));
      expect(source, isNot(contains('severityStripe')));
    });
  });

  group('what the model reads', () {
    test('severity comes from the notice, info when it has none', () {
      expect(AppNotification.fromJson({'id': 'a', 'title': 't', 'message': 'm', 'type': 'tourism', 'severity': 'critical'}).severity, 'critical');
      expect(AppNotification.fromJson({'id': 'a', 'title': 't', 'message': 'm', 'type': 'tourism'}).severity, 'info');
      expect(AppNotification.fromJson({'id': 'a'}).severityColor, Colors.blue);
    });
  });
}
