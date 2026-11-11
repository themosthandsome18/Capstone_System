// The Scan QR Code screen: a square window to aim at over the camera, and an error message that can be read. The window is MEASURED on the screen (the pixels
// it paints over a known ground), not only looked for as a widget; and it takes no touch. Synthetic data only.
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:mauban_mobile_app/main.dart';

const ground = Color(0xFF2040A0); // a blue the overlay's black and white can be told from

/// The overlay over [ground], [size] big, painted by the engine: returns its pixels.
Future<Pixels> paintOverlay(WidgetTester tester, Size size) async {
  final key = GlobalKey();
  // the screen is as big as the picture, one pixel to a logical pixel: nothing is squeezed by the size of the test window
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: RepaintBoundary(
        key: key,
        child: const ColoredBox(color: ground, child: ScannerFrameOverlay()),
      ),
    ),
  );
  expect(tester.getSize(find.byKey(key)), size); // the fixture: the overlay really has this size
  late ui.Image image;
  late ByteData data;
  await tester.runAsync(() async {
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    image = await boundary.toImage();
    data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  });
  return Pixels(image.width, image.height, data);
}

class Pixels {
  Pixels(this.width, this.height, this.data);
  final int width;
  final int height;
  final ByteData data;
  Color at(num x, num y) {
    final i = (y.floor() * width + x.floor()) * 4; // the pixel that holds the point
    return Color.fromARGB(data.getUint8(i + 3), data.getUint8(i), data.getUint8(i + 1), data.getUint8(i + 2));
  }
}

bool same(Color a, Color b, [int tolerance = 3]) => (a.r * 255 - b.r * 255).abs() <= tolerance && (a.g * 255 - b.g * 255).abs() <= tolerance && (a.b * 255 - b.b * 255).abs() <= tolerance;

/// The ground with 0.55 of black over it.
Color dimmed(Color c) => Color.fromARGB(255, (c.r * 255 * 0.45).round(), (c.g * 255 * 0.45).round(), (c.b * 255 * 0.45).round());

double luminance(Color c) => c.computeLuminance();
double contrast(Color a, Color b) {
  final hi = luminance(a) > luminance(b) ? luminance(a) : luminance(b);
  final lo = luminance(a) > luminance(b) ? luminance(b) : luminance(a);
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  group('the window: where it is and how big', () {
    test('it is a SQUARE, in the middle across, and its centre is at 42% of the height', () {
      for (final size in [const Size(400, 800), const Size(360, 640), const Size(411, 900), const Size(320, 480), const Size(800, 600)]) {
        final rect = scannerFrameRect(size);
        expect(rect.width, closeTo(rect.height, 1e-9), reason: '$size is square');
        expect(rect.center.dx, closeTo(size.width / 2, 0.001), reason: '$size is in the middle across');
        expect(rect.center.dy, closeTo(size.height * 0.42, 0.001), reason: '$size has its centre at 42%');
      }
    });

    test('its side is 70% of the width, never under 200 and never over 280', () {
      expect(scannerFrameRect(const Size(300, 800)).width, 210); // 70% of 300
      expect(scannerFrameRect(const Size(360, 800)).width, closeTo(252, 0.001));
      expect(scannerFrameRect(const Size(250, 800)).width, 200); // 70% is 175: the least is 200
      expect(scannerFrameRect(const Size(400, 800)).width, 280); // 70% is 280
      expect(scannerFrameRect(const Size(700, 900)).width, 280); // 70% is 490: the most is 280
    });
  });

  group('what is painted, measured in pixels', () {
    testWidgets('outside the window the ground is dark: black at 0.55; inside it is clear', (tester) async {
      final pixels = await paintOverlay(tester, const Size(400, 800));
      final rect = scannerFrameRect(const Size(400, 800)); // 60,196 .. 340,476
      expect(rect.left, 60);
      expect(rect.top, closeTo(196, 0.01));
      expect(same(pixels.at(5, 5), dimmed(ground)), isTrue, reason: 'the top left corner of the screen is dark: ${pixels.at(5, 5)}');
      expect(same(pixels.at(395, 795), dimmed(ground)), isTrue, reason: 'the bottom right corner of the screen is dark');
      expect(same(pixels.at(200, 100), dimmed(ground)), isTrue, reason: 'above the window is dark');
      expect(same(pixels.at(200, 600), dimmed(ground)), isTrue, reason: 'below the window is dark');
      expect(same(pixels.at(20, rect.center.dy), dimmed(ground)), isTrue, reason: 'beside the window is dark');
      expect(same(pixels.at(rect.center.dx, rect.center.dy), ground), isTrue, reason: 'the middle of the window is clear: the ground as it is');
      expect(same(pixels.at(rect.left + 40, rect.top + 40), ground), isTrue);
      expect(same(pixels.at(rect.right - 40, rect.bottom - 40), ground), isTrue);
    });

    testWidgets('the clear window is a square on the screen: as wide as it is high, measured along its middle row and its middle column', (tester) async {
      for (final size in [const Size(400, 800), const Size(360, 640)]) {
        final pixels = await paintOverlay(tester, size);
        final r = scannerFrameRect(size);
        bool clear(num x, num y) => same(pixels.at(x, y), ground, 6);
        var across = 0;
        for (var x = 0; x < size.width; x++) {
          if (clear(x, r.center.dy)) across++;
        }
        var down = 0;
        for (var y = 0; y < size.height; y++) {
          if (clear(r.center.dx, y)) down++;
        }
        expect(across, inInclusiveRange(r.width.round() - 2, r.width.round() + 2), reason: '$size across: $across');
        expect(down, inInclusiveRange(r.width.round() - 2, r.width.round() + 2), reason: '$size down: $down');
        expect((across - down).abs(), lessThanOrEqualTo(2), reason: '$size: $across across, $down down');
      }
    });

    testWidgets('only the four corners have a line: the middle of each side has none (it is not a whole box)', (tester) async {
      final pixels = await paintOverlay(tester, const Size(400, 800));
      final r = scannerFrameRect(const Size(400, 800));
      // on the edge of the window, half way along each side: no white, only the dark of the outside and the clear of the inside
      for (final point in [Offset(r.left, r.center.dy), Offset(r.right, r.center.dy), Offset(r.center.dx, r.top), Offset(r.center.dx, r.bottom)]) {
        for (final delta in [-1.0, 1.0]) {
          final inner = pixels.at(point.dx + (point.dx == r.left ? -delta : point.dx == r.right ? delta : 0), point.dy + (point.dy == r.top ? -delta : point.dy == r.bottom ? delta : 0));
          expect(same(inner, Colors.white, 40), isFalse, reason: 'white at $point: $inner');
        }
      }
    });

    testWidgets('each corner has a white line, 4 thick, along 28 from the corner, and not beyond', (tester) async {
      final pixels = await paintOverlay(tester, const Size(400, 800));
      final r = scannerFrameRect(const Size(400, 800));
      bool white(num x, num y) => same(pixels.at(x, y), Colors.white, 30);
      for (final corner in [
        // [the corner, dx along the side that leaves it, dy along the other side]
        [r.topLeft, 1.0, 1.0],
        [r.topRight, -1.0, 1.0],
        [r.bottomRight, -1.0, -1.0],
        [r.bottomLeft, 1.0, -1.0],
      ]) {
        final c = corner[0] as Offset;
        final sx = corner[1] as double;
        final sy = corner[2] as double;
        // along the vertical side: 20 from the corner it is white at the edge, 4 thick (2 each side of the edge), and not at 3 to the side
        expect(white(c.dx + sx * 0.0, c.dy + sy * 22), isTrue, reason: 'vertical arm at 22 from $c');
        expect(white(c.dx - sx * 1.5, c.dy + sy * 22), isTrue, reason: 'the line goes 2 outside the edge at $c');
        expect(white(c.dx + sx * 1.5, c.dy + sy * 22), isTrue, reason: 'the line goes 2 inside the edge at $c');
        expect(white(c.dx - sx * 4, c.dy + sy * 22), isFalse, reason: 'not thicker than 4 at $c');
        expect(white(c.dx + sx * 4, c.dy + sy * 22), isFalse, reason: 'not thicker than 4 at $c');
        expect(white(c.dx, c.dy + sy * 34), isFalse, reason: 'the arm ends at 28 from the corner at $c');
        // along the horizontal side, the same
        expect(white(c.dx + sx * 22, c.dy), isTrue, reason: 'horizontal arm at 22 from $c');
        expect(white(c.dx + sx * 34, c.dy), isFalse, reason: 'the arm ends at 28 from the corner at $c');
        // the bend: the very corner of the square is empty (it is bent with a radius of 14, not a right angle)
        expect(white(c.dx + sx * 0.5, c.dy + sy * 0.5), isFalse, reason: 'the corner at $c is rounded');
        // ...and the bend is there: on the diagonal, about 14 * (1 - 0.7071) = 4.1 from the corner
        expect(white(c.dx + sx * 4.1, c.dy + sy * 4.1), isTrue, reason: 'the arc passes at 4.1 on the diagonal at $c');
      }
    });

    testWidgets('it is the same in another size: the window follows 42% and the least width', (tester) async {
      final pixels = await paintOverlay(tester, const Size(300, 500));
      final r = scannerFrameRect(const Size(300, 500)); // 210 wide, centre y 210
      expect(r.width, 210);
      expect(same(pixels.at(r.center.dx, r.center.dy), ground), isTrue);
      expect(same(pixels.at(r.left - 8, r.center.dy), dimmed(ground)), isTrue);
      expect(same(pixels.at(r.center.dx, r.top - 8), dimmed(ground)), isTrue);
    });
  });

  group('it takes no touch', () {
    testWidgets('a button under the overlay is pressed, in the dark and in the window', (tester) async {
      var pressed = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 400,
              height: 800,
              child: Stack(
                children: [
                  Positioned(left: 20, top: 20, width: 80, height: 40, child: TextButton(key: const ValueKey('dark'), onPressed: () => pressed.add('dark'), child: const Text('a'))),
                  Positioned(left: 180, top: 316, width: 80, height: 40, child: TextButton(key: const ValueKey('window'), onPressed: () => pressed.add('window'), child: const Text('b'))),
                  const ScannerFrameOverlay(),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('dark')));
      await tester.tap(find.byKey(const ValueKey('window')));
      expect(pressed, ['dark', 'window']);
    });

    testWidgets('it holds nothing that could be pressed or that reads a touch', (tester) async {
      await tester.pumpWidget(const Directionality(textDirection: TextDirection.ltr, child: ScannerFrameOverlay()));
      final ignore = tester.widget<IgnorePointer>(find.descendant(of: find.byType(ScannerFrameOverlay), matching: find.byType(IgnorePointer)));
      expect(ignore.ignoring, isTrue);
      expect(find.descendant(of: find.byType(ScannerFrameOverlay), matching: find.byType(GestureDetector)), findsNothing);
    });
  });

  group('the screen', () {
    Future<void> pumpScreen(WidgetTester tester) async {
      tester.view.physicalSize = const Size(411, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const MaterialApp(home: QrScannerScreen()));
      await tester.pump();
    }

    testWidgets('has the window over the camera', (tester) async {
      await pumpScreen(tester);
      expect(find.byType(MobileScanner), findsOneWidget); // the fixture: the camera is there
      expect(find.byType(ScannerFrameOverlay), findsOneWidget);
    });

    testWidgets('the window is ABOVE the camera in the stack', (tester) async {
      await pumpScreen(tester);
      final stack = tester.widget<Stack>(find.ancestor(of: find.byType(MobileScanner), matching: find.byType(Stack)).first);
      final order = stack.children.map((c) => c.runtimeType.toString()).toList();
      expect(order.indexOf('ValueListenableBuilder<MobileScannerState>'), greaterThan(order.indexOf('MobileScanner')));
      expect(order.indexOf('MobileScanner'), greaterThanOrEqualTo(0));
    });

    testWidgets('it covers the whole place of the camera, and the window is square and in the middle of that', (tester) async {
      await pumpScreen(tester);
      expect(find.byType(ScannerFrameOverlay), findsOneWidget);
      final body = tester.getRect(find.ancestor(of: find.byType(ScannerFrameOverlay), matching: find.byType(Stack)).first);
      expect(body.height, greaterThan(700)); // the fixture: the body is the screen under the bar
      expect(tester.getRect(find.byType(ScannerFrameOverlay)), body);
      final window = scannerFrameRect(body.size);
      expect(window.width, closeTo(window.height, 1e-9));
      expect(window.center.dx, closeTo(body.width / 2, 0.001));
    });

    testWidgets('the old green box is gone', (tester) async {
      await pumpScreen(tester);
      expect(find.byType(ScannerFrameOverlay), findsOneWidget);
      expect(find.byWidgetPredicate((w) => w is Container && w.decoration is BoxDecoration && ((w.decoration as BoxDecoration).border?.top.color == Colors.green)), findsNothing);
    });

    testWidgets('the line "Align the QR code within the frame" is where it was', (tester) async {
      await pumpScreen(tester);
      expect(find.byType(ScannerFrameOverlay), findsOneWidget);
      final line = tester.widget<Positioned>(find.ancestor(of: find.text('Align the QR code within the frame'), matching: find.byType(Positioned)));
      expect(line.bottom, 40);
      expect(line.left, 0);
      expect(line.right, 0);
    });
  });

  group('the message when the camera cannot start', () {
    testWidgets('is light on a dark ground, and the words are the same', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(scaffoldBackgroundColor: const Color(0xFFE5E7EB)), // the light page behind it
          home: const Scaffold(body: ScannerErrorView(message: 'Unable to start camera: genericError')),
        ),
      );
      expect(find.text('Unable to start camera: genericError'), findsOneWidget);
      expect(find.text('Go Back to Manual Entry'), findsOneWidget);
      final text = tester.widget<Text>(find.text('Unable to start camera: genericError'));
      final back = tester.widget<ColoredBox>(find.ancestor(of: find.text('Unable to start camera: genericError'), matching: find.byType(ColoredBox)).first);
      final icon = tester.widget<Icon>(find.byIcon(Icons.videocam_off_outlined));
      expect(contrast(text.style!.color!, back.color), greaterThanOrEqualTo(7), reason: 'the words on their ground');
      expect(contrast(icon.color!, back.color), greaterThanOrEqualTo(7), reason: 'the icon on its ground');
      expect(luminance(back.color), lessThan(0.05), reason: 'a dark ground');
      expect(luminance(text.style!.color!), greaterThan(0.9), reason: 'light words');
    });

    testWidgets('the ground fills the place of the camera (nothing light shows round it)', (tester) async {
      tester.view.physicalSize = const Size(411, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ScannerErrorView(message: 'Unable to start camera: genericError'))));
      final size = tester.getSize(find.ancestor(of: find.text('Unable to start camera: genericError'), matching: find.byType(ColoredBox)).first);
      expect(size, const Size(411, 900));
    });

    testWidgets('the Go Back button leaves the screen', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const Scaffold(body: ScannerErrorView(message: 'x')))),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Go Back to Manual Entry'));
      await tester.pumpAndSettle();
      expect(find.text('Go Back to Manual Entry'), findsNothing);
    });
  });
}
