part of '../main.dart';

/// TourismLoadingScreen — Clean & Minimal Animated Logo Loading Screen
///
/// Displays only the smooth animated Mauban Tourism Logo:
/// - Woven magenta Banig mat
/// - Buntal Hat & flower
/// - Bobbing & sailing boat
/// - 3-tier rolling parallax waves
class TourismLoadingScreen extends StatefulWidget {
  const TourismLoadingScreen({
    super.key,
    this.message,
    this.subtext,
  });

  final String? message;
  final String? subtext;

  @override
  State<TourismLoadingScreen> createState() => _TourismLoadingScreenState();
}

class _TourismLoadingScreenState extends State<TourismLoadingScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 5200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0FDFA),
      body: SafeArea(
        child: Center(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return CustomPaint(
                size: const Size(190, 190),
                painter: MaubanTourismLogoPainter(
                  progress: _controller.value,
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// CustomPainter that recreates the official Mauban Tourism Logo in Flutter with animations:
/// - Woven Banig mat
/// - Buntal Hat & flower
/// - Bobbing & sailing boat
/// - 3 parallax rolling wave layers
class MaubanTourismLogoPainter extends CustomPainter {
  MaubanTourismLogoPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    // Ambient glow
    final glowPaint = Paint()
      ..color = const Color(0x44D81558)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16);
    canvas.drawCircle(center, radius + 6, glowPaint);

    // Clip everything to Circle
    canvas.save();
    final clipPath = Path()..addOval(Rect.fromCircle(center: center, radius: radius));
    canvas.clipPath(clipPath);

    // 1. Hot Magenta Base Background (#D81558)
    final bgPaint = Paint()..color = const Color(0xFFD81558);
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    // 2. Banig Weave Pattern
    final weavePaint1 = Paint()..color = const Color(0xFFC2134E);
    final weavePaint2 = Paint()..color = const Color(0x66E91E63);
    final weavePaint3 = Paint()..color = const Color(0x59AD1457);

    const double tileSize = 20;
    for (double x = 0; x < size.width; x += tileSize * 2) {
      for (double y = 0; y < size.height; y += tileSize * 2) {
        canvas.drawRect(Rect.fromLTWH(x, y, tileSize, tileSize * 2), weavePaint1);
        canvas.drawRect(Rect.fromLTWH(x + tileSize, y, tileSize, tileSize), weavePaint2);
        canvas.drawRect(Rect.fromLTWH(x + tileSize, y + tileSize, tileSize, tileSize), weavePaint3);
      }
    }

    // Scale factor to map 0..500 coordinate space to size.width x size.height
    final s = size.width / 500.0;

    // 3. The Mauban Buntal Hat
    final hatCrownPaint = Paint()..color = const Color(0xFFFAE38C);
    final hatBrimPaint = Paint()..color = const Color(0xFFF7D86F);

    // Hat Crown
    final crownPath = Path()
      ..moveTo(238 * s, 155 * s)
      ..cubicTo(248 * s, 100 * s, 345 * s, 100 * s, 362 * s, 178 * s)
      ..cubicTo(324 * s, 188 * s, 276 * s, 182 * s, 238 * s, 155 * s)
      ..close();
    canvas.drawPath(crownPath, hatCrownPaint);

    // Hat Brim (Curved Sweeping Crescent)
    final brimPath = Path()
      ..moveTo(135 * s, 120 * s)
      ..cubicTo(185 * s, 130 * s, 275 * s, 115 * s, 355 * s, 205 * s)
      ..cubicTo(388 * s, 242 * s, 420 * s, 278 * s, 432 * s, 282 * s)
      ..cubicTo(398 * s, 282 * s, 342 * s, 254 * s, 292 * s, 216 * s)
      ..cubicTo(242 * s, 178 * s, 192 * s, 142 * s, 135 * s, 120 * s)
      ..close();
    canvas.drawPath(brimPath, hatBrimPaint);

    // Green Ribbon Band
    final ribbonPaint = Paint()
      ..color = const Color(0xFF00A859)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14 * s
      ..strokeCap = StrokeCap.round;
    final ribbonPath = Path()
      ..moveTo(250 * s, 135 * s)
      ..quadraticBezierTo(295 * s, 175 * s, 328 * s, 215 * s);
    canvas.drawPath(ribbonPath, ribbonPaint);

    // 5-Petal Flower Accent
    final flowerCenter = Offset(328 * s, 218 * s);
    final petalPaint = Paint()..color = const Color(0xFF00C853);
    final petalCenterPaint = Paint()..color = const Color(0xFF006837);

    const int petalCount = 5;
    for (int i = 0; i < petalCount; i++) {
      final angle = (i * 2 * 3.14159265 / petalCount) - 3.14159265 / 2;
      final petalOffset = Offset(
        flowerCenter.dx + 8 * s * math.cos(angle),
        flowerCenter.dy + 8 * s * math.sin(angle),
      );
      canvas.drawCircle(petalOffset, 6 * s, petalPaint);
    }
    canvas.drawCircle(flowerCenter, 4.5 * s, petalCenterPaint);

    // 4. Animated Sailing Boat (Bobbing, pitching & sailing across)
    final boatX = -60 * s + (progress * (size.width + 120 * s));
    final waveYAtBoat = 286 * s + math.sin((boatX / s) * 0.03 + progress * 6.28) * (6 * s);
    final boatPitch = math.cos((boatX / s) * 0.03 + progress * 6.28) * 0.07;

    canvas.save();
    canvas.translate(boatX, waveYAtBoat - 16 * s);
    canvas.rotate(boatPitch);

    // Hull (Dark pine green)
    final hullPaint = Paint()..color = const Color(0xFF143D2B);
    final hullPath = Path()
      ..moveTo(0 * s, 14 * s)
      ..lineTo(56 * s, 14 * s)
      ..quadraticBezierTo(46 * s, 24 * s, 28 * s, 24 * s)
      ..quadraticBezierTo(10 * s, 24 * s, 0 * s, 14 * s)
      ..close();
    canvas.drawPath(hullPath, hullPaint);

    // Mast
    final mastPaint = Paint()
      ..color = const Color(0xFF6D1A24)
      ..strokeWidth = 2 * s
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(28 * s, -30 * s), Offset(28 * s, 14 * s), mastPaint);

    // Left Main Sail (Crisp White)
    final sailPaint = Paint()..color = Colors.white;
    final leftSail = Path()
      ..moveTo(26 * s, -28 * s)
      ..lineTo(2 * s, 12 * s)
      ..lineTo(26 * s, 12 * s)
      ..close();
    canvas.drawPath(leftSail, sailPaint);

    // Right Jib Sail
    final rightSail = Path()
      ..moveTo(30 * s, -22 * s)
      ..lineTo(52 * s, 12 * s)
      ..lineTo(30 * s, 12 * s)
      ..close();
    canvas.drawPath(rightSail, sailPaint);

    canvas.restore();

    // 5. Three Tiers of Rolling Ocean Waves
    _drawRollingWave(
      canvas: canvas,
      size: size,
      baseY: 286 * s,
      amplitude: 5 * s,
      wavelength: 45 * s,
      speedPhase: progress * 6.28,
      color: const Color(0xFF00D4FF),
    );

    _drawRollingWave(
      canvas: canvas,
      size: size,
      baseY: 314 * s,
      amplitude: 4.5 * s,
      wavelength: 40 * s,
      speedPhase: progress * 4.5,
      color: const Color(0xFF0099CC),
    );

    _drawRollingWave(
      canvas: canvas,
      size: size,
      baseY: 342 * s,
      amplitude: 4 * s,
      wavelength: 35 * s,
      speedPhase: progress * 3.0,
      color: const Color(0xFF163E4C),
    );

    // Outer White Circle Rim
    canvas.restore();
    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    canvas.drawCircle(center, radius - 2, borderPaint);
  }

  void _drawRollingWave({
    required Canvas canvas,
    required Size size,
    required double baseY,
    required double amplitude,
    required double wavelength,
    required double speedPhase,
    required Color color,
  }) {
    final wavePaint = Paint()..color = color;
    final path = Path()..moveTo(0, size.height);

    for (double x = 0; x <= size.width; x += 4) {
      final y = baseY + math.sin((x / wavelength) + speedPhase) * amplitude;
      if (x == 0) {
        path.lineTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    path.lineTo(size.width, size.height);
    path.close();
    canvas.drawPath(path, wavePaint);
  }

  @override
  bool shouldRepaint(covariant MaubanTourismLogoPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
