part of '../main.dart';

/// The square window of the scanner, in a preview of [size]: its centre is in the middle across and at 42% of the height from the top, its side is 70% of
/// the width but never less than 200 or more than 280 logical pixels (and never more than the preview itself).
Rect scannerFrameRect(Size size) {
  final side = math.min((size.width * 0.7).clamp(200.0, 280.0).toDouble(), math.min(size.width, size.height));
  return Rect.fromLTWH((size.width - side) / 2, size.height * 0.42 - side / 2, side, side);
}

/// What is drawn over the camera: the outside of the window dark (black, 0.55), the inside clear (nothing over it), and only the four corners marked with a
/// line (white, 4 thick, 28 long from the corner, bent with a radius of 14). It takes no touch: the scanner under it is not in its way.
class ScannerFrameOverlay extends StatelessWidget {
  const ScannerFrameOverlay({super.key});

  @override
  Widget build(BuildContext context) => const IgnorePointer(child: SizedBox.expand(child: CustomPaint(painter: ScannerFramePainter())));
}

class ScannerFramePainter extends CustomPainter {
  const ScannerFramePainter();

  static const double dimOpacity = 0.55;
  static const double stroke = 4;
  static const double arm = 28;
  static const double radius = 14;

  @override
  void paint(Canvas canvas, Size size) {
    final window = scannerFrameRect(size);
    // the dark: everything but the window, so the inside has nothing over it at all
    final dark = Path.combine(
      PathOperation.difference,
      Path()..addRect(Offset.zero & size),
      Path()..addRRect(RRect.fromRectAndRadius(window, const Radius.circular(radius))),
    );
    canvas.drawPath(dark, Paint()..color = Colors.black.withValues(alpha: dimOpacity));

    final l = window.left, t = window.top, r = window.right, b = window.bottom;
    const rr = radius, d = rr * 2;
    final corners = Path()
      ..moveTo(l, t + arm)
      ..lineTo(l, t + rr)
      ..arcTo(Rect.fromLTWH(l, t, d, d), math.pi, math.pi / 2, false)
      ..lineTo(l + arm, t)
      ..moveTo(r - arm, t)
      ..lineTo(r - rr, t)
      ..arcTo(Rect.fromLTWH(r - d, t, d, d), -math.pi / 2, math.pi / 2, false)
      ..lineTo(r, t + arm)
      ..moveTo(r, b - arm)
      ..lineTo(r, b - rr)
      ..arcTo(Rect.fromLTWH(r - d, b - d, d, d), 0, math.pi / 2, false)
      ..lineTo(r - arm, b)
      ..moveTo(l + arm, b)
      ..lineTo(l + rr, b)
      ..arcTo(Rect.fromLTWH(l, b - d, d, d), math.pi / 2, math.pi / 2, false)
      ..lineTo(l, b - arm);
    canvas.drawPath(
      corners,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.butt,
    );
  }

  @override
  bool shouldRepaint(ScannerFramePainter oldDelegate) => false;
}

/// What the scanner says when the camera cannot start: light text and icon on a dark ground, so that it can be read (the page behind it is light).
class ScannerErrorView extends StatelessWidget {
  const ScannerErrorView({super.key, required this.message});

  final String message;

  static const Color ground = Color(0xFF0F172A);

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      child: ColoredBox(
        color: ground,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.videocam_off_outlined, size: 48, color: Colors.white),
                const SizedBox(height: 12),
                Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 13)),
                const SizedBox(height: 16),
                FilledButton.tonal(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Go Back to Manual Entry'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _scanned = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QR Code'),
        actions: [
          /*
          IconButton(
            icon: ValueListenableBuilder(
              valueListenable: _controller.torchState,
              builder: (context, state, child) {
                switch (state) {
                  case TorchState.off:
                    return const Icon(Icons.flash_off);
                  case TorchState.on:
                    return const Icon(Icons.flash_on);
                }
              },
            ),
            onPressed: () => _controller.toggleTorch(),
          ),
          IconButton(
            icon: ValueListenableBuilder(
              valueListenable: _controller.cameraFacingState,
              builder: (context, state, child) {
                switch (state) {
                  case CameraFacing.front:
                    return const Icon(Icons.camera_front);
                  case CameraFacing.back:
                    return const Icon(Icons.camera_rear);
                }
              },
            ),
            onPressed: () => _controller.switchCamera(),
          ),
          */
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            errorBuilder: (context, error) {
              return ScannerErrorView(
                message: kIsWeb
                    ? 'Camera access unavailable in this browser.\nPlease enter your Permit Number or Business Name directly in the search field.'
                    : 'Unable to start camera: ${error.errorCode.name}',
              );
            },
            onDetect: (capture) {
              if (_scanned) return;
              final List<Barcode> barcodes = capture.barcodes;
              for (final barcode in barcodes) {
                if (barcode.rawValue != null) {
                  setState(() => _scanned = true);
                  Navigator.of(context).pop(barcode.rawValue);
                  break;
                }
              }
            },
          ),
          // the window to aim at: only while the camera works (when it cannot start, the message is on a dark ground of its own and nothing dims it)
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, child) => state.error == null ? const ScannerFrameOverlay() : const SizedBox.shrink(),
          ),
          const Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Text(
              'Align the QR code within the frame',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold,
                backgroundColor: Colors.black54,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
