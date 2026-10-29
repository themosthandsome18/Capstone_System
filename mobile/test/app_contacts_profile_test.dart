// The Profile page draws the hotlines: the server's list when it has one, the four written in the code when it has nothing. Whatever the server sends, the visitor
// has a hotline to read: never a blank section. Each card shows the name, the number, then the email and the description ONLY when they are not empty (smaller and
// paler for the description), with no gap left for an empty one. Every test that has a fixture asserts, inside the test, that the fixture reached the case it is for.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tourism_bootstrap_states_test.dart' show bootstrapJson;

Map<String, Object?> contact(int id, {Object? name, Object? numbers, Object? email = '', Object? description = '', Object? icon = 'other'}) => {
  'id': id,
  'name': name ?? 'Contact $id',
  'contact_numbers': numbers ?? 'Number $id',
  'email': email,
  'description': description,
  'icon': icon,
};

const profile = MobileUserProfile(name: '', email: '', contactNumber: '');

Future<void> showProfile(WidgetTester tester, AppContacts contacts) async {
  tester.view.physicalSize = const Size(411, 6000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: ProfilePage(profile: profile, visits: const [], feedbackHistory: const [], contacts: contacts)),
    ),
  );
  await tester.pump();
}

AppContacts server(List<Object?> list) => AppContacts.fromJson(list);

Finder card(int id) => find.byKey(ValueKey('contact-$id'));
Finder cardText(int id) => find.descendant(of: card(id), matching: find.byType(Text));
List<String> cardTexts(int id) => [for (final e in cardText(id).evaluate()) (e.widget as Text).data!];
Text textIn(int id, String data) => find.descendant(of: card(id), matching: find.text(data)).evaluate().single.widget as Text;
bool shows(String text) => find.text(text).evaluate().isNotEmpty;
List<String> allCardKeys() => [for (final e in find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('contact-')).evaluate()) (e.widget.key! as ValueKey<String>).value];

void expectTheWrittenFour() {
  final written = AppContentDefaults.hotlines;
  expect(written, hasLength(4)); // the fixture
  expect(allCardKeys(), ['contact--1', 'contact--2', 'contact--3', 'contact--4']);
  for (final c in written) {
    expect(shows(c.name), isTrue, reason: c.name);
    expect(shows(c.numbers), isTrue, reason: c.numbers);
  }
  expect(shows('tourism@mauban.gov.ph'), isTrue); // the desk's email is on its own line
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('when the server gives nothing to show: the four written in the code', () {
    testWidgets('no contacts at all (loading, failed, an older server)', (tester) async {
      await showProfile(tester, AppContacts.none);
      expectTheWrittenFour();
      expect(find.text('Emergency Hotlines & Helpdesk'), findsOneWidget);
    });

    testWidgets('the key is there but the list is empty', (tester) async {
      await showProfile(tester, server([]));
      expectTheWrittenFour();
    });

    testWidgets('every entry is broken', (tester) async {
      await showProfile(tester, server([null, 'x', contact(1, name: ''), contact(2, numbers: '   ')]));
      expectTheWrittenFour();
    });

    testWidgets('a value of any odd shape', (tester) async {
      var reached = 0;
      for (final shape in <Object?>[null, 'text', 5, true, {}, {'name': 'x'}, [1, 2], [null]]) {
        await showProfile(tester, AppContacts.fromJson(shape));
        expectTheWrittenFour();
        reached++;
      }
      expect(reached, 8); // the fixture: every shape was drawn
    });

    testWidgets('through the state of the app: loading and failed show the four', (tester) async {
      await showProfile(tester, const TourismBootstrapState.loading().emergencyContacts);
      expectTheWrittenFour();
      await showProfile(tester, TourismBootstrapState.failed(const SocketException('no'), BootstrapFailureKind.network).emergencyContacts);
      expectTheWrittenFour();
    });

    testWidgets('the written four look as they did: the same colours; the desk\'s email apart from its number', (tester) async {
      await showProfile(tester, AppContacts.none);
      Color iconColor(int id) => tester.widget<Icon>(find.descendant(of: card(id), matching: find.byType(Icon))).color!;
      expect(iconColor(-1), const Color(0xFFEF4444));
      expect(iconColor(-2), const Color(0xFF2563EB));
      expect(iconColor(-3), const Color(0xFF0D9488));
      expect(iconColor(-4), BrandColors.original.deep);
      expect(tester.widget<Icon>(find.descendant(of: card(-1), matching: find.byType(Icon))).icon, Icons.local_hospital_outlined);
      expect(tester.widget<Icon>(find.descendant(of: card(-4), matching: find.byType(Icon))).icon, Icons.support_agent_outlined);
      // the number and the email are two Texts; no text carries a bullet
      expect(cardTexts(-4), ['Mauban Tourism Information Desk', '(042) 784-0555', 'tourism@mauban.gov.ph']);
      for (final id in [-1, -2, -3, -4]) {
        expect(cardTexts(id).where((t) => t.contains('•')), isEmpty, reason: 'card $id');
      }
      expect(cardTexts(-1), ['Mauban MDRRMO / Rescue 24/7', '0998-598-8422 / (042) 784-0123']); // no email, no description: two lines and no gap
    });
  });

  group('when the server has contacts: they replace the written four', () {
    testWidgets('one active contact is ONE card, and none of the written four', (tester) async {
      await showProfile(tester, server([contact(5, name: 'The only one', numbers: '111')]));
      expect(allCardKeys(), ['contact-5']);
      expect(shows('The only one') && shows('111'), isTrue); // the fixture
      for (final c in AppContentDefaults.hotlines) {
        expect(shows(c.name), isFalse, reason: c.name);
      }
    });

    testWidgets('several: in the server\'s order, and a broken one is left out while the others stay', (tester) async {
      await showProfile(tester, server([contact(9, name: 'Z'), contact(1, name: ''), contact(2, name: 'A'), contact(7, name: 'M')]));
      expect(allCardKeys(), ['contact-9', 'contact-2', 'contact-7']);
      final tops = [for (final id in [9, 2, 7]) tester.getTopLeft(card(id)).dy];
      expect(tops[0], lessThan(tops[1]));
      expect(tops[1], lessThan(tops[2]));
    });

    testWidgets('forty contacts are all drawn', (tester) async {
      await showProfile(tester, server([for (var i = 1; i <= 40; i++) contact(i)]));
      expect(allCardKeys(), hasLength(40));
    });

    testWidgets('the number is shown whole, as written, with its slash', (tester) async {
      await showProfile(tester, server([contact(1, numbers: '0911-111-1111 / (042) 111-2222')]));
      expect(shows('0911-111-1111 / (042) 111-2222'), isTrue);
    });

    testWidgets('through the state of the app: a loaded bootstrap with contacts', (tester) async {
      final map = bootstrapJson(1)..['emergencyContacts'] = [contact(3, name: 'From the bootstrap')];
      final state = TourismBootstrapState.loaded(MobileBootstrap.fromJson(jsonDecode(jsonEncode(map)) as Map<String, dynamic>));
      await showProfile(tester, state.emergencyContacts);
      expect(allCardKeys(), ['contact-3']);
      expect(shows('From the bootstrap'), isTrue);
    });
  });

  group('the card: email, description, and no gap when they are empty', () {
    testWidgets('no email and no description: only the name and the number, and the card is as tall as the old card', (tester) async {
      await showProfile(tester, server([contact(1), contact(2, email: 'a@b.c'), contact(3, description: 'Open all day'), contact(4, email: 'a@b.c', description: 'Open all day')]));
      expect(cardTexts(1), ['Contact 1', 'Number 1']);
      expect(cardTexts(2), ['Contact 2', 'Number 2', 'a@b.c']);
      expect(cardTexts(3), ['Contact 3', 'Number 3', 'Open all day']);
      expect(cardTexts(4), ['Contact 4', 'Number 4', 'a@b.c', 'Open all day']);
      final heights = [for (final id in [1, 2, 3, 4]) tester.getSize(card(id)).height];
      expect(heights[1], greaterThan(heights[0])); // email: a line more
      expect(heights[2], greaterThan(heights[0])); // description: a line more
      expect(heights[3], greaterThan(heights[1]));
      expect(heights[3], greaterThan(heights[2]));
      // the same two strings in a server card and in the written card: the same height (nothing extra, no gap)
      final first = AppContentDefaults.hotlines.first;
      await showProfile(tester, server([contact(1, name: first.name, numbers: first.numbers)]));
      final fromServer = tester.getSize(card(1)).height;
      await showProfile(tester, AppContacts.none);
      expect(tester.getSize(card(-1)).height, fromServer);
    });

    testWidgets('the picture sits at the top of the card, tall or short', (tester) async {
      await showProfile(tester, server([contact(1), contact(2, description: 'A line more'), contact(3, email: 'a@b.c')]));
      double offset(int id) => tester.getTopLeft(find.descendant(of: card(id), matching: find.byType(Icon))).dy - tester.getTopLeft(card(id)).dy;
      // the Icon is in a box padded by 8, in a card with a 1 px border and padding 12: 1 + 12 + 8 = 21 from the top of the card when the box is at the top
      expect(offset(2), 21);
      expect(offset(3), 21);
      expect(offset(1), 21); // a short card: the same place (its box is the tallest part)
      await showProfile(tester, AppContacts.none);
      expect(tester.getTopLeft(find.descendant(of: card(-1), matching: find.byType(Icon))).dy - tester.getTopLeft(card(-1)).dy, greaterThanOrEqualTo(21));
    });

    testWidgets('the email is its OWN line, in the text colour, and never joined to the number', (tester) async {
      await showProfile(tester, server([contact(1, numbers: '123', email: 'x@y.z', icon: 'police')]));
      expect(cardTexts(1), ['Contact 1', '123', 'x@y.z']);
      expect(cardTexts(1).where((t) => t.contains('•')), isEmpty);
      expect(textIn(1, '123').style!.color, const Color(0xFF2563EB));
      expect(textIn(1, 'x@y.z').style!.color, const Color(0xFF2563EB));
      expect(tester.getTopLeft(find.text('x@y.z')).dy, greaterThan(tester.getTopLeft(find.text('123')).dy));
    });

    testWidgets('the description is smaller and paler than the number, under it', (tester) async {
      await showProfile(tester, server([contact(1, numbers: '123', description: 'Open all day', icon: 'police')]));
      final number = textIn(1, '123').style!;
      final note = textIn(1, 'Open all day').style!;
      expect(note.fontSize!, lessThan(number.fontSize!));
      expect(note.fontSize, 10.5);
      expect(note.color, AppColors.muted);
      expect(note.color, isNot(number.color)); // paler: not the colour of the number
      expect(tester.getTopLeft(find.text('Open all day')).dy, greaterThan(tester.getTopLeft(find.text('123')).dy));
    });

    testWidgets('a long description wraps and the card grows with it', (tester) async {
      final long = List.filled(40, 'word').join(' ');
      await showProfile(tester, server([contact(1, description: 'short'), contact(2, description: long)]));
      expect(tester.getSize(card(2)).height, greaterThan(tester.getSize(card(1)).height));
      expect(shows(long), isTrue);
    });

    testWidgets('blank, odd and missing email and description draw nothing', (tester) async {
      await showProfile(tester, server([contact(1, email: '   ', description: '\n'), contact(2, email: 5, description: ['x']), {'id': 3, 'name': 'Bare', 'contact_numbers': '9'}]));
      expect(cardTexts(1), ['Contact 1', 'Number 1']);
      expect(cardTexts(2), ['Contact 2', 'Number 2']);
      expect(cardTexts(3), ['Bare', '9']);
    });
  });

  group('the picture and the colours of each name', () {
    testWidgets('each of the twelve draws its picture; the text is the darker colour where the picture\'s fails 4.5:1', (tester) async {
      final names = appContactIcons.keys.toList();
      await showProfile(tester, server([for (var i = 0; i < names.length; i++) contact(i + 1, numbers: 'N${names[i]}', icon: names[i])]));
      for (var i = 0; i < names.length; i++) {
        final id = i + 1;
        final drawn = appContactIcons[names[i]]!;
        final icon = tester.widget<Icon>(find.descendant(of: card(id), matching: find.byType(Icon)));
        expect(icon.icon, drawn.icon, reason: names[i]);
        expect(icon.color, drawn.color ?? BrandColors.original.deep, reason: '${names[i]} picture');
        expect(textIn(id, 'N${names[i]}').style!.color, drawn.textColor ?? drawn.color ?? BrandColors.original.deep, reason: '${names[i]} text');
      }
      // the six that needed a darker text: the picture keeps its colour
      final fire = tester.widget<Icon>(find.descendant(of: card(names.indexOf('fire') + 1), matching: find.byType(Icon)));
      expect(fire.color, const Color(0xFFF97316));
      expect(textIn(names.indexOf('fire') + 1, 'Nfire').style!.color, const Color(0xFFC55405));
    });

    testWidgets('the pale box behind the picture has the picture\'s colour, not the text\'s', (tester) async {
      await showProfile(tester, server([contact(1, icon: 'fire')]));
      final tints = [
        for (final e in find.descendant(of: card(1), matching: find.byType(Container)).evaluate())
          if ((e.widget as Container).decoration is BoxDecoration) ((e.widget as Container).decoration! as BoxDecoration).color,
      ];
      expect(tints, contains(const Color(0xFFF97316).withValues(alpha: 0.1))); // the picture's colour at 10%
      expect(tints, isNot(contains(const Color(0xFFC55405).withValues(alpha: 0.1)))); // not the darker text colour
    });

    testWidgets('a name the app does not know is "other": the phone picture, and the contact is still there', (tester) async {
      await showProfile(tester, server([contact(1, icon: 'siren'), contact(2, icon: null), contact(3, icon: 7), contact(4, icon: 'RESCUE')]));
      expect(allCardKeys(), hasLength(4)); // the fixture: none was left out
      for (final id in [1, 2, 3, 4]) {
        final icon = tester.widget<Icon>(find.descendant(of: card(id), matching: find.byType(Icon)));
        expect(icon.icon, Icons.phone_outlined, reason: 'contact $id');
        expect(icon.color, const Color(0xFF64748B));
      }
    });

    testWidgets('help_desk follows the theme\'s deep colour', (tester) async {
      tester.view.physicalSize = const Size(411, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      const orange = Color(0xFF8A3B05);
      final themed = BrandColors.original.copyWith(deep: orange);
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(extensions: [themed]),
          home: Scaffold(body: ProfilePage(profile: profile, visits: const [], feedbackHistory: const [], contacts: server([contact(1, icon: 'help_desk', numbers: 'N')]))),
        ),
      );
      await tester.pump();
      expect(tester.widget<Icon>(find.descendant(of: card(1), matching: find.byType(Icon))).color, orange);
      expect(textIn(1, 'N').style!.color, orange);
    });
  });

  group('through the whole app', () {
    testWidgets('the Profile tab shows the contacts of the bootstrap the server sent', (tester) async {
      final map = bootstrapJson(0)..['emergencyContacts'] = [contact(11, name: 'Server hotline', numbers: '555', description: 'From the server')];
      tester.view.physicalSize = const Size(411, 6000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
        previous?.call(details);
      };
      addTearDown(() => FlutterError.onError = previous);
      await tester.pumpWidget(MaterialApp(home: AppBootstrap(api: _Api(jsonEncode(map)))));
      await tester.pump();
      await tester.tap(find.text('Skip'));
      await tester.pump();
      await tester.tap(find.text("I'm a Tourist / Visitor"));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pump();
      await tester.tap(find.text('Profile'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(allCardKeys(), ['contact-11']);
      expect(shows('Server hotline') && shows('555') && shows('From the server'), isTrue);
      expect(shows(AppContentDefaults.hotlines.first.name), isFalse);
    });

    testWidgets('and an older server (no key) shows the four written', (tester) async {
      tester.view.physicalSize = const Size(411, 6000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
        previous?.call(details);
      };
      addTearDown(() => FlutterError.onError = previous);
      await tester.pumpWidget(MaterialApp(home: AppBootstrap(api: _Api(jsonEncode(bootstrapJson(0))))));
      await tester.pump();
      await tester.tap(find.text('Skip'));
      await tester.pump();
      await tester.tap(find.text("I'm a Tourist / Visitor"));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pump();
      await tester.tap(find.text('Profile'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expectTheWrittenFour();
    });
  });
}

class _Api extends TourismApi {
  _Api(this._raw);
  final String _raw;

  @override
  Future<String> fetchBootstrapRaw() async => _raw;
}
