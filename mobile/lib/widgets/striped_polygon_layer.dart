part of '../main.dart';

class StripedPolygonLayer extends StatelessWidget {
  final List<List<LatLng>> polygons;
  final double redPct;
  final double yellowPct;
  final double greenPct;

  const StripedPolygonLayer({
    super.key,
    required this.polygons,
    required this.redPct,
    required this.yellowPct,
    required this.greenPct,
  });

  @override
  Widget build(BuildContext context) {
    final camera = MapCamera.of(context);
    return IgnorePointer(
      child: CustomPaint(
        size: camera.size,
        painter: _StripedPainter(camera, polygons, redPct, yellowPct, greenPct),
      ),
    );
  }
}

class _StripedPainter extends CustomPainter {
  final MapCamera camera;
  final List<List<LatLng>> polygons;
  final double redPct;
  final double yellowPct;
  final double greenPct;

  _StripedPainter(this.camera, this.polygons, this.redPct, this.yellowPct, this.greenPct);

  @override
  void paint(Canvas canvas, Size size) {
    if (polygons.isEmpty) return;

    final path = Path();
    for (var ring in polygons) {
      if (ring.isEmpty) continue;
      bool first = true;
      for (var pt in ring) {
        // Use MapCamera's getOffsetFromOrigin
        final pos = camera.getOffsetFromOrigin(pt);
        if (first) {
          path.moveTo(pos.dx, pos.dy);
          first = false;
        } else {
          path.lineTo(pos.dx, pos.dy);
        }
      }
      path.close();
    }

    final bounds = path.getBounds();
    final redEnd = redPct;
    final yellowEnd = redEnd + yellowPct;

    final gradient = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      stops: [0.0, redEnd, redEnd, yellowEnd, yellowEnd, 1.0],
      colors: const [
        Color(0xFFEF4444), // red
        Color(0xFFEF4444),
        Color(0xFFEAB308), // yellow
        Color(0xFFEAB308),
        Color(0xFF22C55E), // green
        Color(0xFF22C55E),
      ],
    );

    final paint = Paint()
      ..style = PaintingStyle.fill
      ..shader = gradient.createShader(bounds);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _StripedPainter oldDelegate) {
    return camera != oldDelegate.camera || 
           redPct != oldDelegate.redPct || 
           yellowPct != oldDelegate.yellowPct || 
           greenPct != oldDelegate.greenPct;
  }
}
