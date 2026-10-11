// Step 3 of the theme: the 42 uses of AppColors.green / deepGreen that are
// brand colours read context.brand. These tests render the widgets under the
// green (the app as it was), an orange tourism setting, and the sanitation
// theme (no BrandColors), and compare the colours the widgets state.
//
// The four status/semantic uses and the notification status colours must not
// follow the theme. The ten-widget sanitation contract is in
// tourism_theme_wiring_test.dart and is not repeated here.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const followsOrange = TourismTheme(primaryColor: '#EF7C1F');

String hex(Color c) => c.toARGB32().toRadixString(16).padLeft(8, '0');

final greenTheme = buildAppTheme(isSanitation: false, theme: TourismTheme.none);
final orangeTheme = buildAppTheme(isSanitation: false, theme: followsOrange);
final sanitationTheme = buildAppTheme(isSanitation: true, theme: followsOrange);
final orangeBrand = BrandColors.fromBase('#EF7C1F');

final greenPrimary = hex(BrandColors.original.primary);
final greenDeep = hex(BrandColors.original.deep);

/// Every colour a rendered tree states itself, as hex.
Set<String> colours(WidgetTester tester) {
  final out = <String>{};
  void add(Color? c) {
    if (c != null) out.add(hex(c));
  }

  void visit(Element element) {
    final w = element.widget;
    if (w is Icon) add(w.color);
    if (w is Text) add(w.style?.color);
    if (w is DecoratedBox) {
      final d = w.decoration;
      if (d is BoxDecoration) {
        add(d.color);
        final b = d.border;
        if (b is Border) {
          add(b.top.color);
          add(b.left.color);
        }
      }
    }
    if (w is CircleAvatar) add(w.backgroundColor);
    if (w is Chip) add(w.backgroundColor);
    element.visitChildren(visit);
  }

  tester.binding.rootElement!.visitChildren(visit);
  return out;
}

Future<Set<String>> render(WidgetTester tester, ThemeData theme, Widget child) async {
  tester.view.physicalSize = const Size(411, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  // The test font overflows, and the destination photos are not bundled.
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed') || text.contains('Unable to load asset')) return;
    previous?.call(details);
  };
  addTearDown(() => FlutterError.onError = previous);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
  await tester.pump();
  return colours(tester);
}

Destination destination() => Destination.fromJson({
  'resort_id': 1,
  'resort_name': 'Test Beach',
  'type': 'Beach',
  'monthly_arrivals': 12,
});

/// The widgets whose brand colour moved, and what they state.
Map<String, Widget Function()> movedWidgets() => {
  'StatCard': () => StatCard(label: 'L', value: '1', icon: Icons.groups),
  'AppHeader': () => AppHeader(onOpenNotifications: () {}),
  // QuickAction is an Expanded: it is put in a Row, as the Home page does.
  'QuickAction': () =>
      Row(children: [QuickAction(icon: Icons.map, label: 'Map', onTap: () {})]),
  'DestinationListCard': () =>
      DestinationListCard(destination: destination(), onTap: () {}),
  'VisitorPill': () => VisitorPill(destination: destination()),
  'StatusPill.label': () => const StatusPill.label(text: 'Beach Resort'),
  'InfoBanner': () => const InfoBanner(
    icon: Icons.info_outline,
    title: 'T',
    text: 'x',
    color: Color(0xff0000ff),
  ),
  'MapPin': () => const MapPin(),
  'MiniTripStat': () => const MiniTripStat(icon: Icons.group, label: 'L', value: '1'),
  'LocationCard': () => LocationCard(destination: destination()),
  'FactRow': () => const FactRow(icon: Icons.place, label: 'L', value: 'v'),
  'LocationCapturePanel': () => LocationCapturePanel(
    latitude: '',
    longitude: '',
    locating: false,
    onCapture: () {},
  ),
  'DataSourceBanner': () => const DataSourceBanner(
    icon: Icons.cloud_done_outlined,
    title: 'S',
    text: 'Live',
  ),
  'PickerTile': () => PickerTile(
    icon: Icons.calendar_month_outlined,
    label: 'Date',
    value: 'Today',
    onTap: () {},
  ),
  'ReceiptCard': () => const ReceiptCard(
    icon: Icons.receipt_long_outlined,
    title: 'R',
    reference: 'REF',
    lines: ['one'],
  ),
};


/// The colours a StatusPill states (its background and its text), by pill.
List<Set<String>> pillColours(WidgetTester tester) {
  final pills = <Set<String>>[];
  for (final element in find.byType(StatusPill).evaluate()) {
    final set = <String>{};
    void visit(Element e) {
      final w = e.widget;
      if (w is DecoratedBox && w.decoration is BoxDecoration) {
        final c = (w.decoration as BoxDecoration).color;
        if (c != null) set.add(hex(c));
      }
      if (w is Text && w.style?.color != null) set.add(hex(w.style!.color!));
      e.visitChildren(visit);
    }

    visit(element);
    pills.add(set);
  }
  return pills;
}

class _NoDetailApi extends TourismApi {
  @override
  Future<Map<String, dynamic>> fetchDestinationDetail(int resortId) async => {};
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('a moved brand colour follows the theme in tourism', () {
    for (final entry in movedWidgets().entries) {
      testWidgets('${entry.key}: green as it was, orange when following', (
        tester,
      ) async {
        final inGreen = await render(tester, greenTheme, entry.value());
        final inOrange = await render(tester, orangeTheme, entry.value());

        // It states a brand colour (the original green, or its deep).
        expect(
          inGreen.contains(greenPrimary) || inGreen.contains(greenDeep),
          isTrue,
          reason: '${entry.key} states no brand colour in the green',
        );
        // Under orange it states the orange's, and none of the original two.
        expect(
          inOrange.contains(hex(orangeBrand.primary)) ||
              inOrange.contains(hex(orangeBrand.deep)),
          isTrue,
          reason: '${entry.key} does not state the orange',
        );
        expect(inOrange.contains(greenPrimary), isFalse, reason: 'primary left');
        expect(inOrange.contains(greenDeep), isFalse, reason: 'deep left');
      });

      testWidgets('${entry.key}: sanitation (no BrandColors) is as in green', (
        tester,
      ) async {
        final inGreen = await render(tester, greenTheme, entry.value());
        final inSanitation = await render(tester, sanitationTheme, entry.value());

        expect(inSanitation, inGreen);
      });
    }
  });

  group('StatusPill: a status is fixed, a type label follows the brand', () {
    final fixed = {greenPrimary, hex(BrandColors.original.tint)};

    testWidgets('a status under orange keeps its colours', (tester) async {
      await render(tester, orangeTheme, const StatusPill(text: 'Confirmed'));

      expect(pillColours(tester), [fixed]);
    });

    testWidgets('a type label under orange takes the brand', (tester) async {
      await render(tester, orangeTheme, const StatusPill.label(text: 'Beach Resort'));

      expect(pillColours(tester), [
        {hex(orangeBrand.primary), hex(orangeBrand.tint)},
      ]);
    });

    testWidgets('on the app green both look as they always did', (tester) async {
      await render(tester, greenTheme, const StatusPill(text: 'Confirmed'));
      expect(pillColours(tester), [fixed]);

      await render(tester, greenTheme, const StatusPill.label(text: 'Beach Resort'));
      expect(pillColours(tester), [fixed]);
    });

    testWidgets('under the sanitation theme both are as they were', (tester) async {
      await render(tester, sanitationTheme, const StatusPill(text: 'Good standing'));
      expect(pillColours(tester), [fixed]);

      await render(tester, sanitationTheme, const StatusPill.label(text: 'x'));
      expect(pillColours(tester), [fixed]);
    });

    testWidgets('the receipt status is fixed under orange', (tester) async {
      final receipt = MobileVisitReceipt(
        reference: 'REF-1',
        destination: destination(),
        arrivalDate: DateTime(2026, 10, 11),
        totalVisitors: 2,
        status: 'pending',
        fullName: 'A B',
        contactNumber: '',
        email: '',
      );
      await render(tester, orangeTheme, VisitReceiptCard(receipt: receipt));

      expect(pillColours(tester), [fixed]);
    });

    testWidgets("the destination's type label follows the brand under orange", (
      tester,
    ) async {
      await render(
        tester,
        orangeTheme,
        DestinationListCard(destination: destination(), onTap: () {}),
      );

      expect(pillColours(tester), [
        {hex(orangeBrand.primary), hex(orangeBrand.tint)},
      ]);
    });

    testWidgets("the detail page's type label follows the brand under orange", (
      tester,
    ) async {
      await render(
        tester,
        orangeTheme,
        SizedBox(
          height: 800,
          child: DestinationDetailPage(
            destination: destination(),
            api: _NoDetailApi(),
            bootstrap: MobileBootstrap.fallback(),
            onVisitSubmitted: (_) {},
            onFeedbackSubmitted: (_) {},
          ),
        ),
      );
      await tester.pump();

      expect(pillColours(tester), [
        {hex(orangeBrand.primary), hex(orangeBrand.tint)},
      ]);
    });

    testWidgets('the GIS confirmation status is fixed under orange', (tester) async {
      await render(
        tester,
        orangeTheme,
        LocationConfirmationPanel(
          latitude: '14.19',
          longitude: '121.73',
          confirmed: false,
          onChanged: (_) {},
          onConfirm: () {},
        ),
      );

      expect(pillColours(tester), [fixed]);
    });
  });

  group('status and semantic colours do not follow the theme', () {
    testWidgets('PermitPill is the app green / amber under orange', (tester) async {
      final verified = await render(
        tester,
        orangeTheme,
        const PermitPill(verified: true),
      );
      expect(verified.contains(greenPrimary), isTrue);
      expect(verified.contains(hex(orangeBrand.primary)), isFalse);

      final pending = await render(
        tester,
        orangeTheme,
        const PermitPill(verified: false),
      );
      expect(pending.contains(hex(const Color(0xff9a6700))), isTrue);
      expect(pending.contains(hex(orangeBrand.primary)), isFalse);
    });

    test('the sanitation and tourist status colours are fixed', () {
      expect(sanitationStatusColor('good_standing'), AppColors.green);
      expect(sanitationStatusColor('resolved'), AppColors.green);
      expect(touristStatusChip('arrived')!.foreground, const Color(0xFF166534));
    });
  });

  group('AppNotification.colorFor', () {
    // The context is read at once: a second pump under another theme reuses
    // the same element, so an earlier context would see the later theme.
    Future<T> under<T>(
      WidgetTester tester,
      ThemeData theme,
      T Function(BuildContext) read,
    ) async {
      late T value;
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Builder(
            builder: (context) {
              value = read(context);
              return const SizedBox();
            },
          ),
        ),
      );
      return value;
    }

    AppNotification note(String type) =>
        AppNotification(id: '1', title: 't', message: 'm', type: type);

    testWidgets('tourism follows the brand', (tester) async {
      expect(
        await under(tester, greenTheme, note('tourism').colorFor),
        AppColors.green,
      );
      expect(
        await under(tester, orangeTheme, note('tourism').colorFor),
        orangeBrand.primary,
      );
      expect(
        await under(tester, sanitationTheme, note('tourism').colorFor),
        AppColors.green,
      );
    });

    testWidgets('approval, sanitation and other are fixed status colours', (
      tester,
    ) async {
      for (final theme in [greenTheme, orangeTheme, sanitationTheme]) {
        expect(
          await under(tester, theme, note('approval').colorFor),
          const Color(0xFF10B981),
        );
        expect(
          await under(tester, theme, note('sanitation').colorFor),
          Colors.orange,
        );
        expect(await under(tester, theme, note('other').colorFor), Colors.blue);
      }
    });

    testWidgets('IntroItem: no colour takes the brand; a colour is fixed', (
      tester,
    ) async {
      const brand = IntroItem(icon: Icons.map, title: 't', text: 'x');
      const fixed = IntroItem(
        icon: Icons.map,
        title: 't',
        text: 'x',
        color: Color(0xff159ee0),
      );

      expect(await under(tester, greenTheme, brand.colorOf), AppColors.green);
      expect(await under(tester, orangeTheme, brand.colorOf), orangeBrand.primary);
      expect(await under(tester, orangeTheme, fixed.colorOf), const Color(0xff159ee0));
    });
  });
}
