// Two things shared one name. The OFFICE is the Mauban Tourism Office: real, it sends the advisories, reads the reviews and takes the fee, and its name stays
// where it is the office that speaks. The SYSTEM covers Cagbalete Island only: its names are the header ("Cagbalete Island Guide"), the full-screen map
// ("Cagbalete Island Map"), the browser tab, and the guest, who is called "Guest" and not by the name of the office.
//
// The words are written out here on purpose, and not read from the app's constants: a test that compared a text with itself would pass when it was changed.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

const guide = 'Cagbalete Island Guide';

Future<void> showHeader(WidgetTester tester) async {
  tester.view.physicalSize = const Size(411, 900);
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
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: AppHeader(onOpenNotifications: () {}))));
  await tester.pump();
}

String source(String path) => File(path).readAsStringSync();

/// The Profile page as a person sees it, with the profile given: this is where the guest's name is READ, as a name, under the avatar.
Future<void> showProfile(WidgetTester tester, MobileUserProfile profile) async {
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
      home: Scaffold(body: ProfilePage(profile: profile, visits: const [], feedbackHistory: const [], contacts: AppContacts.none)),
    ),
  );
  await tester.pump();
}

void main() {
  group('the system: Cagbalete Island', () {
    testWidgets('the app header says Cagbalete Island Guide, under the Municipality of Mauban, and no longer Tourism Guide', (tester) async {
      await showHeader(tester);

      expect(find.text('Cagbalete Island Guide'), findsOneWidget);
      expect(find.text('Tourism Guide'), findsNothing);
      expect(find.text('MUNICIPALITY OF MAUBAN'), findsOneWidget); // the municipality is the owner of the app; it stays
    });

    test('the guest is called Guest, not Mauban Tourism; a person is called by their name', () {
      final guest = MobileUserProfile.guest();

      expect(guest.isGuest, isTrue);
      expect(guest.displayName, 'Guest');
      expect(guest.displayName, isNot('Mauban Tourism'));
      expect(const MobileUserProfile(name: 'Ana Cruz', email: '', contactNumber: '').displayName, 'Ana Cruz');
    });

    test('the title of the browser tab and of the app switcher is the app\'s name, Cagbalete Island Guide, in the three places that write it', () {
      expect(source('web/index.html'), contains('<title>$guide</title>'));
      expect(source('web/index.html'), contains("'$guide';"));
      expect(source('lib/utils/web_branding.dart'), contains("'$guide'"));
      expect(source('lib/main.dart'), contains("'$guide'"));
      for (final path in ['web/index.html', 'lib/utils/web_branding.dart', 'lib/main.dart']) {
        expect(source(path), isNot(contains('Mauban Tourism & Travel Pass')), reason: path);
        expect(source(path), isNot(contains('Visitor Monitoring')), reason: '$path: the phone is a guide, not monitoring');
      }
      // the sanitation module has its own title, which is not this system's
      expect(source('lib/main.dart'), contains("'Mauban Sanitation & Health Portal'"));
    });

    test('the sign-out question and the sign-in message name the app: Cagbalete Island Guide', () {
      final tourism = source('lib/screens/tourism_screens.dart');
      final common = source('lib/screens/common_screens.dart');

      expect(tourism, contains('Are you sure you want to sign out of $guide? Nothing about you is saved on this phone.'));
      expect(common, contains("message: 'Signing In to $guide...'"));
      expect(tourism, isNot(contains('sign out of Mauban Tourism')));
      expect(common, isNot(contains('Signing In to Mauban Tourism')));
    });

    testWidgets('on the Profile page the guest is read as Guest, with a G in the avatar, and the office\'s name is not given to a person', (tester) async {
      await showProfile(tester, MobileUserProfile.guest());

      expect(find.text('Guest'), findsOneWidget);
      expect(find.text('G'), findsOneWidget);
      expect(find.text('Mauban Tourism'), findsNothing);
      expect(find.text('MT'), findsNothing);
    });

    testWidgets('on the Profile page a person is read by their own name and initials, as before', (tester) async {
      await showProfile(tester, const MobileUserProfile(name: 'Ana Cruz', email: 'ana@example.com', contactNumber: '09170000000'));

      expect(find.text('Ana Cruz'), findsOneWidget);
      expect(find.text('AC'), findsOneWidget);
      expect(find.text('Guest'), findsNothing);
    });

    test('the guest\'s initials are G, to match Guest; a person\'s are their own', () {
      expect(MobileUserProfile.guest().initials, 'G');
      expect(const MobileUserProfile(name: 'Ana Cruz', email: '', contactNumber: '').initials, 'AC');
      expect(const MobileUserProfile(name: 'Ana', email: '', contactNumber: '').initials, 'A');
    });

    test('the name under the icon of the tourism app is Cagbalete (the one that fits whole in a launcher)', () {
      final gradle = source('android/app/build.gradle.kts');

      expect(gradle, contains('manifestPlaceholders["appLabel"] = "Cagbalete"'));
      expect(gradle, isNot(contains('"Mauban Tourism"')));
      expect(gradle, contains('"Mauban Sanitation & Community"')); // the other app is not this one
    });

    test('the phone is the Guide and the web admin is Visitor Monitoring: neither has the other\'s name', () {
      const monitoring = 'Cagbalete Island Visitor Monitoring';
      final web = File('../frontend/src/tourism/components/layout/Sidebar.js').readAsStringSync();
      final branding = File('../frontend/src/shared/useDocumentBranding.js').readAsStringSync();

      expect(web, contains(monitoring));
      expect(branding, contains(monitoring));
      expect(web, isNot(contains(guide)));
      expect(branding, isNot(contains(guide)));
      for (final path in ['lib/widgets/widgets.dart', 'lib/main.dart', 'lib/utils/web_branding.dart', 'web/index.html']) {
        expect(source(path), isNot(contains(monitoring)), reason: path);
      }
      expect(source('lib/widgets/widgets.dart'), contains("'$guide'"));
    });

    test('the full-screen map is called Cagbalete Island Map', () {
      final screens = source('lib/screens/tourism_screens.dart');
      expect(screens, contains("'Cagbalete Island Map'"));
      expect(screens, isNot(contains("'Mauban Tourism GIS Map'")));
    });
  });

  group('the office: the Mauban Tourism Office, unchanged', () {
    test('the advisories come from the Mauban Tourism Office', () {
      expect(tourismNotificationsSubtitle, 'Advisories from the Mauban Tourism Office');
    });

    test('the review notice still says who the Tourism Office is: sees the name, adds the photos, hides or removes the review', () {
      final text = publicReviewNoticeText;

      expect(text, contains('The Mauban Tourism Office sees the name you type here.'));
      expect(text, contains("The Tourism Office may add your photos to the place's photo gallery"));
      expect(text, contains('Office can hide or remove it'));
    });

    test('the fee is still paid at the Tourism Office, 2nd Floor, Mauban Municipal Hall, and the boat fare is not its', () {
      final defaults = source('lib/models/app_content_defaults.dart');

      expect(defaults, contains('Pay at the Tourism Office, 2nd Floor, Mauban Municipal Hall'));
      expect(defaults, contains('the Tourism Office does not collect it'));
    });

    test('the hotline is still the Mauban Tourism Information Desk', () {
      final desk = AppContentDefaults.hotlines.singleWhere((contact) => contact.id == -4);

      expect(desk.name, 'Mauban Tourism Information Desk');
      expect(desk.email, 'tourism@mauban.gov.ph');
    });

    test('the pass is still LGU MAUBAN • TOURIST ENTRY PASS and the consent still goes to Mauban LGU Tourism', () {
      expect(source('lib/widgets/widgets.dart'), contains('LGU MAUBAN • TOURIST ENTRY PASS'));
      expect(source('lib/screens/tourism_screens.dart'), contains('I consent to submit this visitor record to Mauban LGU Tourism.'));
    });
  });
}
