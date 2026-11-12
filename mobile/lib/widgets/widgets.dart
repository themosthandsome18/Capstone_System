part of '../main.dart';

const sanitationOsmTileUrl =
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const sanitationOsmUserAgentPackageName = 'mauban_sanitation_mobile';

class SanitationOsmMapFrame extends StatelessWidget {
  const SanitationOsmMapFrame({
    super.key,
    required this.mapHeight,
    required this.borderRadius,
    required this.map,
  });

  final double mapHeight;
  final double borderRadius;
  final Widget map;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(height: mapHeight, child: map),
          const SizedBox(
            height: 24,
            child: ColoredBox(
              color: Color(0xFFF8FAFC),
              child: Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    '© OpenStreetMap contributors',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Color(0xFF475569),
                      fontSize: 10.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PhotoPickerPanel extends StatelessWidget {
  const PhotoPickerPanel({
    super.key,
    required this.photoName,
    required this.onCamera,
    required this.onGallery,
    this.onClear,
  });

  final String? photoName;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Supporting Photo',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Text(
              photoName ?? 'No photo selected',
              style: const TextStyle(color: AppColors.muted),
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonalIcon(
                  onPressed: onCamera,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Camera'),
                ),
                OutlinedButton.icon(
                  onPressed: onGallery,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Gallery'),
                ),
                if (onClear != null)
                  IconButton.filledTonal(
                    onPressed: onClear,
                    icon: const Icon(Icons.close),
                    tooltip: 'Remove photo',
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class LocationCapturePanel extends StatelessWidget {
  const LocationCapturePanel({
    super.key,
    required this.latitude,
    required this.longitude,
    required this.locating,
    required this.onCapture,
    this.title = 'Report Location',
    this.emptyText = 'No location captured yet',
  });

  final String latitude;
  final String longitude;
  final bool locating;
  final VoidCallback onCapture;
  final String title;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    final hasLocation = latitude.isNotEmpty && longitude.isNotEmpty;

    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: context.brand.tint,
          child: Icon(Icons.my_location_outlined, color: context.brand.primary),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(
          hasLocation ? '$latitude, $longitude' : emptyText,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: FilledButton.tonalIcon(
          onPressed: locating ? null : onCapture,
          icon: locating
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.gps_fixed),
          label: Text(locating ? 'Getting' : 'Use GPS'),
        ),
      ),
    );
  }
}

class VisitReceiptCard extends StatelessWidget {
  const VisitReceiptCard({super.key, required this.receipt});

  final MobileVisitReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.brand.border, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: context.brand.deep.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          // Header Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: context.brand.light,
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              children: [
                Icon(Icons.confirmation_number_outlined, size: 16, color: context.brand.deep),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'MAUBAN TOURIST ENTRY PASS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: context.brand.deep,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                BookingStatusPill(status: receipt.status),
              ],
            ),
          ),
          // Main Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        receipt.destination.name,
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(Icons.calendar_today_outlined, size: 13, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text(shortDate(receipt.arrivalDate), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.people_outline, size: 13, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Text('${receipt.totalVisitors} visitor(s)', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'PASS REF: ${receipt.reference}',
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            fontFamily: 'monospace',
                            color: Color(0xFF334155),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                // Stylized QR Pass Card
                GestureDetector(
                  onTap: () => showDialog(
                    context: context,
                    builder: (context) => TouristDigitalPassModal(receipt: receipt),
                  ),
                  child: Container(
                    width: 84,
                    height: 84,
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.brand.deep, width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: context.brand.deep.withValues(alpha: 0.12),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Expanded(
                          child: QrImageView(
                            data: receipt.reference,
                            version: QrVersions.auto,
                            eyeStyle: const QrEyeStyle(
                              eyeShape: QrEyeShape.square,
                              color: Color(0xFF14532D),
                            ),
                            dataModuleStyle: const QrDataModuleStyle(
                              dataModuleShape: QrDataModuleShape.square,
                              color: Color(0xFF14532D),
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'TAP TO ZOOM',
                          style: TextStyle(
                            fontSize: 7.5,
                            fontWeight: FontWeight.w900,
                            color: context.brand.deep,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Puts the picture of the QR Pass in the gallery of the phone. The bytes are the PNG, [fileName] is `mauban_qr_<SURVEY_ID>.png`. Anything that goes
/// wrong is thrown (a [GalException] for the gallery's own reasons), never swallowed: the pass says so on the screen.
typedef QrPassSaver = Future<void> Function(Uint8List bytes, String fileName);

/// The real saver, with the gallery of the phone (Android and iOS only: gal has no web, where the pass is downloaded instead).
Future<void> saveQrPassToGallery(Uint8List bytes, String fileName) async {
  // Gal.putImageBytes asks for the access itself, but it does not look at the answer; so it is asked here, and a "no" is said as what it is.
  final allowed = await Gal.hasAccess() || await Gal.requestAccess();
  if (!allowed) {
    throw GalException(
      type: GalExceptionType.accessDenied,
      platformException: PlatformException(code: GalExceptionType.accessDenied.code),
      stackTrace: StackTrace.current,
    );
  }
  // gal puts the extension itself (from the bytes): the name is given without it, and the file is `mauban_qr_<SURVEY_ID>.png`.
  final dot = fileName.lastIndexOf('.');
  await Gal.putImageBytes(bytes, name: dot > 0 ? fileName.substring(0, dot) : fileName);
}

/// What the person is told when saving the QR Pass fails: one clear sentence for each reason the gallery gives, and for anything else.
String qrPassSaveErrorMessage(Object error) {
  if (error is GalException) {
    return switch (error.type) {
      GalExceptionType.accessDenied =>
        'Could not save the QR Pass: this app is not allowed to save to the gallery. Allow it in your phone settings and try again.',
      GalExceptionType.notEnoughSpace => 'Could not save the QR Pass: there is not enough storage space on your phone.',
      GalExceptionType.notSupportedFormat => 'Could not save the QR Pass: the image format is not supported.',
      GalExceptionType.unexpected => 'Could not save the QR Pass: an unexpected error happened. Please try again.',
    };
  }
  return 'Could not save the QR Pass: ${conciseError(error)}';
}

/// Modal dialog displaying the exact Tourist QR Entry Pass from Screenshot 1
class TouristDigitalPassModal extends StatefulWidget {
  const TouristDigitalPassModal({super.key, required this.receipt, this.saver = saveQrPassToGallery});

  final MobileVisitReceipt receipt;

  /// Where the picture goes on the phone. A test hands its own, so that it never touches a real gallery.
  final QrPassSaver saver;

  @override
  State<TouristDigitalPassModal> createState() => _TouristDigitalPassModalState();
}

class _TouristDigitalPassModalState extends State<TouristDigitalPassModal> {
  final GlobalKey _passKey = GlobalKey();
  bool _saving = false;

  Future<void> _handleSaveQrPass() async {
    if (_saving) return;
    setState(() => _saving = true);

    try {
      // Ensure layout and painting is complete
      await Future<void>.delayed(const Duration(milliseconds: 50));

      final boundary = _passKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null || !boundary.hasSize) {
        throw Exception('Pass card is not ready for export.');
      }

      final image = await boundary.toImage(pixelRatio: 3.0);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) {
        throw Exception('Failed to encode pass image to PNG.');
      }

      final pngBytes = byteData.buffer.asUint8List();
      final cleanRef = widget.receipt.reference.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
      final fileName = 'mauban_qr_$cleanRef.png';

      if (kIsWeb) {
        // The web has no gallery (gal does not run there): the picture is downloaded by the browser, as it always was.
        await exportAndShareBytes(
          bytes: pngBytes,
          fileName: fileName,
          mimeType: 'image/png',
          subject: 'Mauban Tourist Entry Pass - ${widget.receipt.reference}',
          text: 'Official Tourist Entry Pass for ${widget.receipt.fullName.isNotEmpty ? widget.receipt.fullName : "Tourist"} (${widget.receipt.reference}) at ${widget.receipt.destination.name}.',
        );
        if (!mounted) return;
        setState(() => _saving = false);
        _showPassMessage('QR Pass for ${widget.receipt.reference} downloaded successfully!', error: false);
        return;
      }

      // The phone: straight to the gallery, no share sheet.
      await widget.saver(pngBytes, fileName);
      if (!mounted) return;
      setState(() => _saving = false);
      _showPassMessage('Saved to Gallery', error: false);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showPassMessage(qrPassSaveErrorMessage(e), error: true);
    }
  }

  void _showPassMessage(String message, {required bool error}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(error ? Icons.error_outline : Icons.check_circle, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: error ? const Color(0xFFDC2626) : const Color(0xFF14532D),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final receipt = widget.receipt;
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Close button top right
            Align(
              alignment: Alignment.topRight,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
              decoration: BoxDecoration(
                color: context.brand.light,
                borderRadius: BorderRadius.circular(28),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Top Status Circle
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: const Color(0xFFC8E6C9),
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFFA5D6A7), width: 2),
                    ),
                    child: const Icon(Icons.check, color: Color(0xFF1B5E20), size: 30),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Visit Registered',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF0F172A),
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      'Present this pass to the resort staff on arrival. They will scan it to record your visit.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: Color(0xFF475569),
                        height: 1.4,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Main Ticket Pass Box
                  RepaintBoundary(
                    key: _passKey,
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 16,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: Column(
                          children: [
                            // Ticket Header Green Bar
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                              decoration: BoxDecoration(
                                color: context.brand.dark,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'LGU MAUBAN • TOURIST ENTRY PASS',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 1,
                                      color: context.brand.onDark,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    receipt.fullName.isNotEmpty
                                        ? formatProperName(receipt.fullName)
                                        : 'Registered Tourist',
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            // QR Code Container
                            Padding(
                              padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                              child: Column(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(color: const Color(0xFFCBD5E1), width: 1.5),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withValues(alpha: 0.04),
                                          blurRadius: 8,
                                        ),
                                      ],
                                    ),
                                    child: QrImageView(
                                      data: receipt.reference,
                                      version: QrVersions.auto,
                                      size: 190,
                                      eyeStyle: const QrEyeStyle(
                                        eyeShape: QrEyeShape.square,
                                        color: Color(0xFF14532D),
                                      ),
                                      dataModuleStyle: const QrDataModuleStyle(
                                        dataModuleShape: QrDataModuleShape.square,
                                        color: Color(0xFF14532D),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  const Text(
                                    'SURVEY ID',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 1,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    receipt.reference,
                                    style: const TextStyle(
                                      fontSize: 19,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.5,
                                      fontFamily: 'monospace',
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            // Ticket Perforation Dashed Line with Notches
                            const _DashedTicketDivider(),

                            // Ticket Metadata Details Table
                            Padding(
                              padding: const EdgeInsets.all(18),
                              child: Column(
                                children: [
                                  _buildDetailRow(
                                    icon: Icons.location_on_outlined,
                                    label: 'Destination',
                                    value: receipt.destination.name,
                                  ),
                                  const SizedBox(height: 12),
                                  _buildDetailRow(
                                    icon: Icons.people_outline,
                                    label: 'Visitors',
                                    value: '${receipt.totalVisitors}',
                                  ),
                                  const SizedBox(height: 12),
                                  _buildDetailRow(
                                    icon: Icons.calendar_today_outlined,
                                    label: 'Arrival date',
                                    value: shortDate(receipt.arrivalDate),
                                  ),
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      const Icon(Icons.access_time_outlined, size: 18, color: Color(0xFF64748B)),
                                      const SizedBox(width: 8),
                                      const Text('Status', style: TextStyle(color: Color(0xFF64748B), fontSize: 13)),
                                      const Spacer(),
                                      BookingStatusPill(status: receipt.status),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Save QR Pass Button
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _handleSaveQrPass,
                      icon: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.save_alt),
                      label: Text(
                        _saving ? 'Saving QR Pass...' : 'Save QR Pass',
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
                      ),
                      style: FilledButton.styleFrom(
                        backgroundColor: context.brand.dark,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF64748B)),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(color: Color(0xFF64748B), fontSize: 13)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: Color(0xFF0F172A)),
          ),
        ),
      ],
    );
  }
}

class _DashedTicketDivider extends StatelessWidget {
  const _DashedTicketDivider();

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Row(
          children: List.generate(
            30,
            (index) => Expanded(
              child: Container(
                color: index % 2 == 0 ? Colors.transparent : const Color(0xFFCBD5E1),
                height: 1.5,
              ),
            ),
          ),
        ),
        Positioned(
          left: -10,
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: context.brand.light,
              shape: BoxShape.circle,
            ),
          ),
        ),
        Positioned(
          right: -10,
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: context.brand.light,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ],
    );
  }
}

class FeedbackReceiptCard extends StatelessWidget {
  const FeedbackReceiptCard({super.key, required this.receipt});

  final MobileFeedbackReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return ReceiptCard(
      icon: Icons.star_outline,
      title: receipt.destination.name,
      reference: receipt.reference,
      lines: ['Rating: ${receipt.rating}/5', 'Reviewer: ${receipt.reviewer}'],
    );
  }
}

class SanitationReceiptCard extends StatelessWidget {
  const SanitationReceiptCard({super.key, required this.receipt});

  final MobileSanitationReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final lines = [
      'Barangay: ${receipt.barangay}',
      'Urgency: ${receipt.priorityLabel}',
      'Status: ${receipt.statusLabel}',
      if (receipt.actionTaken.trim().isNotEmpty)
        'Action: ${receipt.actionTaken.trim()}',
      if (receipt.reportedDate.trim().isNotEmpty)
        'Reported: ${receipt.reportedDate}',
    ];

    return ReceiptCard(
      icon: Icons.health_and_safety_outlined,
      title: receipt.category,
      reference: receipt.reference,
      lines: lines,
    );
  }
}

class LocationConfirmationPanel extends StatelessWidget {
  const LocationConfirmationPanel({
    super.key,
    required this.latitude,
    required this.longitude,
    required this.confirmed,
    required this.onChanged,
    required this.onConfirm,
  });

  final String latitude;
  final String longitude;
  final bool confirmed;
  final ValueChanged<LatLng> onChanged;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final point = latLngFromText(latitude, longitude);
    final center = point ?? const LatLng(14.185, 121.731);

    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Confirm GIS Pin',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                StatusPill(text: confirmed ? 'Confirmed' : 'Needs Review'),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Tap the map to adjust the exact location before saving.',
              style: TextStyle(color: AppColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            SanitationOsmMapFrame(
              mapHeight: 220,
              borderRadius: 14,
              map: FlutterMap(
                  key: ValueKey('${center.latitude},${center.longitude}'),
                  options: MapOptions(
                    initialCenter: center,
                    initialZoom: point == null ? 12 : 16,
                    minZoom: 8,
                    maxZoom: 18,
                    onTap: (_, tappedPoint) => onChanged(tappedPoint),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: sanitationOsmTileUrl,
                      userAgentPackageName: sanitationOsmUserAgentPackageName,
                    ),
                    if (point != null)
                      MarkerLayer(
                        markers: [
                          Marker(
                            point: point,
                            width: 42,
                            height: 42,
                            child: const MapPin(),
                          ),
                        ],
                      ),
                  ],
                ),
            ),
            const SizedBox(height: 10),
            FilledButton.tonalIcon(
              onPressed: point == null ? null : onConfirm,
              icon: const Icon(Icons.check_circle_outline),
              label: Text(confirmed ? 'Location Confirmed' : 'Confirm Pin'),
            ),
          ],
        ),
      ),
    );
  }
}

class ConsentCheckPanel extends StatelessWidget {
  const ConsentCheckPanel({
    super.key,
    required this.checked,
    required this.onChanged,
  });

  final bool checked;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: CheckboxListTile(
        value: checked,
        onChanged: (value) => onChanged(value ?? false),
        title: const Text(
          'Privacy and consent',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: const Text(
          'I confirm that the submitted name, contact number, photo, and GPS location may be used by the Sanitary Section for validation and follow-up.',
        ),
        controlAffinity: ListTileControlAffinity.leading,
      ),
    );
  }
}

class ReceiptCard extends StatelessWidget {
  const ReceiptCard({
    super.key,
    required this.icon,
    required this.title,
    required this.reference,
    required this.lines,
  });

  final IconData icon;
  final String title;
  final String reference;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: context.brand.tint,
          child: Icon(icon, color: context.brand.primary),
        ),
        title: Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(['Ref: $reference', ...lines].join('\n')),
        ),
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cardContent = Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: context.brand.primary),
              if (onTap != null)
                const Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 13,
                  color: AppColors.muted,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
          ),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.muted,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );

    if (onTap != null) {
      return Card(
        elevation: 0,
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: cardContent,
        ),
      );
    }

    return Card(
      elevation: 0,
      color: Colors.white,
      child: cardContent,
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          children: [
            Icon(icon, size: 34, color: AppColors.muted),
            const SizedBox(height: 10),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}

class AppHeader extends StatelessWidget {
  const AppHeader({
    super.key,
    required this.onOpenNotifications,
    this.hasUnread = false,
  });

  final VoidCallback onOpenNotifications;
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: context.brand.primary.withValues(alpha: 0.35), width: 1.5),
          ),
          child: ClipOval(
            child: Image.asset('assets/tourism_logo.png', width: 34, height: 34, fit: BoxFit.cover),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'MUNICIPALITY OF MAUBAN',
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: context.brand.deep,
                  letterSpacing: 0.6,
                ),
              ),
              Text(
                'Tourism Guide',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.ink),
              ),
            ],
          ),
        ),
        Stack(
          children: [
            IconButton(
              onPressed: onOpenNotifications,
              icon: const Icon(Icons.notifications_outlined),
              style: IconButton.styleFrom(
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: const BorderSide(color: AppColors.border),
                ),
              ),
            ),
            if (hasUnread)
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// The small red dot that says "there is something new here": the one on the bell of the Home, and on the My Visit tab. No number.
class NewsDot extends StatelessWidget {
  const NewsDot({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 9,
      height: 9,
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 1.5),
      ),
    );
  }
}

class PageTitle extends StatelessWidget {
  const PageTitle({super.key, required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              color: AppColors.muted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class SearchBox extends StatelessWidget {
  const SearchBox({super.key, required this.hint, this.onChanged});

  final String hint;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
      ),
    );
  }
}

class HeroCard extends StatelessWidget {
  const HeroCard({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          children: [
            DestinationImage(destination: destination, height: 185),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.2, 0.65, 1.0],
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.35),
                      Colors.black.withValues(alpha: 0.88),
                    ],
                  ),
                ),
              ),
            ),
            // Rating pill on top right
            Positioned(
              top: 14,
              right: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.star, size: 14, color: Color(0xFFFFD700)),
                    const SizedBox(width: 4),
                    Text(
                      destination.ratingLabel,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    destination.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      shadows: [
                        Shadow(color: Colors.black54, blurRadius: 6, offset: Offset(0, 2)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      const Icon(Icons.place_outlined, size: 14, color: Colors.white70),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          destination.location,
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  // no count: no pill and no gap above it (measured in test/card_visitor_gap_test.dart)
                  if (destination.hasVisitors) ...[
                    const SizedBox(height: 8),
                    VisitorPill(destination: destination, dark: true),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DestinationImage extends StatelessWidget {
  const DestinationImage({
    super.key,
    required this.destination,
    this.height,
    this.width,
    this.useUpload = true,
  });

  final Destination destination;
  final double? height;
  final double? width;

  /// false: the built-in photo only. The slideshow shows the uploads itself, and when one fails it falls back to THIS, so that it does not
  /// ask again for the photo that just failed.
  final bool useUpload;

  @override
  Widget build(BuildContext context) {
    // The photo that was uploaded, when there is one; the built-in one (by the image key, else the logo) when there is none, while the
    // upload loads, and when it cannot be loaded.
    final builtIn = Image.asset(
      imageAssetFor(destination.imageKey),
      height: height,
      width: width ?? double.infinity,
      fit: BoxFit.cover,
    );
    final uploaded = useUpload ? uploadedImageUrl(destination) : null;
    if (uploaded == null) return builtIn;
    return Image.network(
      uploaded,
      height: height,
      width: width ?? double.infinity,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) => progress == null ? child : builtIn,
      errorBuilder: (context, error, stackTrace) => builtIn,
    );
  }
}

class QuickAction extends StatelessWidget {
  const QuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: AnimatedScaleButton(
        onTap: onTap,
        child: InkWell(
          onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: context.brand.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: context.brand.primary),
              ),
              const SizedBox(height: 7),
              Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.action,
    this.onTap,
  });

  final String title;
  final String? action;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
          ),
          if (action != null)
            TextButton(onPressed: onTap, child: Text(action!)),
        ],
      ),
    );
  }
}

class DestinationTile extends StatelessWidget {
  const DestinationTile({
    super.key,
    required this.destination,
    required this.onTap,
  });

  final Destination destination;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 175,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            fit: StackFit.expand,
            children: [
              DestinationImage(destination: destination),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.25, 0.65, 1.0],
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.35),
                      Colors.black.withValues(alpha: 0.88),
                    ],
                  ),
                ),
              ),
              // Rating Badge on top right
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star, size: 12, color: Color(0xFFFFD700)),
                      const SizedBox(width: 3),
                      Text(
                        destination.ratingLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      destination.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 13.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      destination.type,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 11,
                      ),
                    ),
                    // no count: no pill and no gap above it (measured in test/card_visitor_gap_test.dart)
                    if (destination.hasVisitors) ...[
                      const SizedBox(height: 6),
                      VisitorPill(destination: destination, dark: true),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DestinationListCard extends StatelessWidget {
  const DestinationListCard({
    super.key,
    required this.destination,
    required this.onTap,
  });

  final Destination destination;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: DestinationImage(
                  destination: destination,
                  width: 86,
                  height: 72,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      destination.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      destination.location,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      destination.visitorsLabel,
                      style: TextStyle(
                        color: context.brand.deep,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        RatingPill(destination: destination),
                        const SizedBox(width: 8),
                        Expanded(child: StatusPill.label(text: destination.type)),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

class RatingPill extends StatelessWidget {
  const RatingPill({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xfffff3bd),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star, size: 14, color: Color(0xffe6a100)),
          const SizedBox(width: 3),
          Text(
            destination.ratingLabel,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class VisitorPill extends StatelessWidget {
  const VisitorPill({super.key, required this.destination, this.dark = false});

  final Destination destination;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    // The people who arrived this year. With none there is no pill at all: the type of the resort is not put in its place (the card
    // already has its own pill for the type, so it would be there twice).
    if (!destination.hasVisitors) return const SizedBox.shrink();
    final text = destination.visitorCountLabel;
    const icon = Icons.person_outline;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: dark
            ? Colors.white.withValues(alpha: 0.22)
            : context.brand.tint,
        borderRadius: BorderRadius.circular(999),
        border: dark
            ? Border.all(color: Colors.white.withValues(alpha: 0.15))
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 13,
            color: dark ? Colors.white : context.brand.primary,
          ),
          const SizedBox(width: 4),
          Text(
            text,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10.5,
              color: dark ? Colors.white : context.brand.deep,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class PermitPill extends StatelessWidget {
  const PermitPill({super.key, required this.verified});

  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: verified ? const Color(0xffdcfce7) : const Color(0xfffff3bd),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            verified ? Icons.verified_outlined : Icons.info_outline,
            size: 14,
            color: verified ? AppColors.green : const Color(0xff9a6700),
          ),
          const SizedBox(width: 4),
          Text(
            verified ? 'Permit verified' : 'Permit not verified',
            style: TextStyle(
              fontSize: 11,
              color: verified ? AppColors.green : const Color(0xff9a6700),
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

/// A small green pill. `StatusPill(text:)` states a status ("Confirmed",
/// "Needs Review", a booking or sanitation status): its colour is fixed and
/// never follows the theme. `StatusPill.label(text:)` is a type label (a
/// destination's type): it takes the app's brand colour. The fixed one is the
/// default so that a pill that is forgotten stays what it was.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.text}) : followsBrand = false;

  const StatusPill.label({super.key, required this.text}) : followsBrand = true;

  final String text;

  /// True for a type label, false for a status.
  final bool followsBrand;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: followsBrand ? context.brand.tint : const Color(0xffdcfce7),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 11,
          color: followsBrand ? context.brand.primary : AppColors.green,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

/// The pill that states a TOURISM BOOKING's status on a pass: Pending is amber, Arrived is green, Cancelled is red. It was green whatever the status
/// was, which said "done" of a tourist who had not come yet.
///
/// The colours are not decided here: they are [touristStatusChip]'s, the same three the staff see on the chips of the QR check-in History, so the app
/// has ONE set of colours for these three statuses. A status the app does not know gets a neutral grey pill and its own words, never a status colour.
class BookingStatusPill extends StatelessWidget {
  const BookingStatusPill({super.key, required this.status});

  /// pending, arrived or no_show (as the server says it).
  final String? status;

  /// The grey of a status that is none of the three.
  static const Color unknownBackground = Color(0xFFF1F5F9);
  static const Color unknownForeground = Color(0xFF475569);

  @override
  Widget build(BuildContext context) {
    final chip = touristStatusChip(status?.trim().toLowerCase());
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: chip?.background ?? unknownBackground,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        chip?.label ?? statusLabel(status ?? ''),
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 11,
          color: chip?.foreground ?? unknownForeground,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

/// The small "3 / 5" pill that says which photo of a set is on screen: the one the destination's slideshow has had, now a widget, so the photo viewer
/// of a review shows exactly the same thing.
class PhotoCounterPill extends StatelessWidget {
  const PhotoCounterPill({super.key, required this.current, required this.total});

  /// The photo on screen, counting from 1.
  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.photo_library_outlined, size: 12, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            '$current / $total',
            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

/// Opens the photos of a review full screen, on the one that was pressed. Just looking: there is no download and no share.
Future<void> showReviewPhotoViewer(BuildContext context, List<String> urls, {int initialIndex = 0}) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (context) => ReviewPhotoViewer(urls: urls, initialIndex: initialIndex),
    ),
  );
}

/// The photos of a review, one at a time, full screen, on black. It closes with its Close button and with the phone's Back. With more than one photo
/// they can be swiped (with the mouse too, on the web) and the pill says which one it is ("2 / 3", like the slideshow of a destination). A photo that
/// is still coming shows a spinner; one that could not be loaded says so, instead of an empty black page.
class ReviewPhotoViewer extends StatefulWidget {
  const ReviewPhotoViewer({super.key, required this.urls, this.initialIndex = 0});

  /// Whole addresses, as the review card shows them.
  final List<String> urls;
  final int initialIndex;

  @override
  State<ReviewPhotoViewer> createState() => _ReviewPhotoViewerState();
}

class _ReviewPhotoViewerState extends State<ReviewPhotoViewer> {
  late final PageController _controller;
  late int _current;

  @override
  void initState() {
    super.initState();
    _current = widget.urls.isEmpty ? 0 : widget.initialIndex.clamp(0, widget.urls.length - 1);
    _controller = PageController(initialPage: _current);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _photo(String url, int index) {
    return Center(
      child: Image.network(
        url,
        key: ValueKey('photo-viewer-image-$index'),
        fit: BoxFit.contain,
        semanticLabel: 'Photo ${index + 1} of ${widget.urls.length}',
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (frame == null && !wasSynchronouslyLoaded) {
            return Center(
              key: ValueKey('photo-viewer-loading-$index'),
              child: const CircularProgressIndicator(color: Colors.white),
            );
          }
          return child;
        },
        errorBuilder: (context, error, stackTrace) => Center(
          key: ValueKey('photo-viewer-error-$index'),
          child: const Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.broken_image_outlined, color: Colors.white70, size: 56),
                SizedBox(height: 12),
                Text(
                  'This photo could not be loaded.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 15),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.urls.length;
    return Scaffold(
      key: const ValueKey('photo-viewer'),
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          ScrollConfiguration(
            behavior: ScrollConfiguration.of(context).copyWith(dragDevices: PointerDeviceKind.values.toSet()),
            child: PageView.builder(
              key: const ValueKey('photo-viewer-pages'),
              controller: _controller,
              itemCount: total,
              onPageChanged: (index) => setState(() => _current = index),
              itemBuilder: (context, index) => _photo(widget.urls[index], index),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  IconButton(
                    key: const ValueKey('photo-viewer-close'),
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).maybePop(),
                    style: IconButton.styleFrom(backgroundColor: Colors.black54, foregroundColor: Colors.white),
                    icon: const Icon(Icons.close),
                  ),
                  const Spacer(),
                  if (total > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 10, right: 6),
                      child: KeyedSubtree(
                        key: const ValueKey('photo-viewer-counter'),
                        child: PhotoCounterPill(current: _current + 1, total: total),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String text;
  final Color color;

  /// Set only for a banner that has a full text to open: then it is tappable and ends with a quiet sign. Null: the banner is exactly what it has always been.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      margin: const EdgeInsets.only(top: 10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
      child: Row(
        children: [
          Icon(icon, color: context.brand.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          // the quiet sign that it opens; nothing at all when it does not
          if (onTap != null) Icon(Icons.chevron_right_rounded, color: AppColors.muted.withValues(alpha: 0.8), size: 16),
        ],
      ),
        ),
      ),
      ),
    );
    return onTap == null ? card : _Tappable(onTap: onTap!, child: card);
  }
}

class DataSourceBanner extends StatelessWidget {
  const DataSourceBanner({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
    this.warning = false,
  });

  final IconData icon;
  final String title;
  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: warning ? const Color(0xfffff3bd).withValues(alpha: 0.6) : context.brand.tint.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: warning ? const Color(0xffffd267).withValues(alpha: 0.5) : context.brand.border.withValues(alpha: 0.5),
            ),
          ),
      child: Row(
        children: [
          Icon(icon, color: context.brand.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
        ),
      ),
    );
  }
}

/// What the tourist is told about a review BEFORE they write it, and again under the form. This is the ONE source of the words: the pop-up that opens
/// when Review is pressed ([showReviewNoticeDialog]) and the notice under the form ([PublicVisibilityNotice]) both draw it with [ReviewNoticeContent],
/// so they cannot differ. Every statement was checked against the code: what the public sees (PublicFeedbackSerializer: the initials, the rating, the
/// comment, the photos, the date, and only the five latest reviews of a place), what the Tourism Office sees (the name that was typed, in full), that
/// the web's "Add to Resort" puts a review photo into the place's gallery for everyone, and that hiding or removing a review does not delete the
/// photo file (nothing in the server deletes a file) and does not take the photo out of the gallery.
const reviewNoticeTitle = 'Before you write a review';

/// One paragraph of the notice. [stressed] is for the one that is the reason for the pop-up: it is drawn bolder than the rest.
class ReviewNoticeParagraph {
  const ReviewNoticeParagraph(this.text, {this.stressed = false});

  final String text;
  final bool stressed;
}

const reviewNoticeParagraphs = <ReviewNoticeParagraph>[
  ReviewNoticeParagraph(
    'Your review is public. Anyone who opens this place in the app can see the '
    'initials of your name (for example, J.D.C.), your rating, your comment, any '
    'photos you attach, and the date. Your cleanliness rating is added to the end '
    'of your comment.',
  ),
  ReviewNoticeParagraph(
    "Only the five most recent reviews are shown on a place's page. Older ones "
    'stop showing, but each photo keeps its own web address, so anyone who has '
    'the link can still open it outside the app.',
  ),
  ReviewNoticeParagraph(
    'The Mauban Tourism Office sees the name you type here. The public sees only '
    'your initials. Leave the name blank to appear as "Mobile Tourist".',
  ),
  ReviewNoticeParagraph(
    "The Tourism Office may add your photos to the place's photo gallery in the "
    'app, where they are shown to everyone as pictures of the place. If they do, '
    'your photos stay there even if your review is later hidden or removed.',
    stressed: true,
  ),
  ReviewNoticeParagraph(
    'Once sent, you cannot change or remove your review yourself. The Tourism '
    'Office can hide or remove it, but hiding does not delete the photo file.',
  ),
];

/// The whole notice as plain text: the title, then the paragraphs, a blank line between.
String get publicReviewNoticeText => [reviewNoticeTitle, ...reviewNoticeParagraphs.map((paragraph) => paragraph.text)].join('\n\n');

/// The words of the notice, drawn. Used by the pop-up and by the notice under the form, and by nothing else: the two show the same words because
/// they are the same widget over the same constants.
class ReviewNoticeContent extends StatelessWidget {
  const ReviewNoticeContent({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          reviewNoticeTitle,
          key: ValueKey('review-notice-title'),
          style: TextStyle(color: AppColors.ink, fontSize: 16, fontWeight: FontWeight.w900),
        ),
        for (var index = 0; index < reviewNoticeParagraphs.length; index++)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: reviewNoticeParagraphs[index].stressed
                ? Container(
                    key: const ValueKey('review-notice-stressed'),
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: context.brand.tint,
                      borderRadius: BorderRadius.circular(10),
                      border: Border(left: BorderSide(color: context.brand.primary, width: 4)),
                    ),
                    child: Text(
                      reviewNoticeParagraphs[index].text,
                      key: ValueKey('review-notice-paragraph-$index'),
                      style: TextStyle(color: context.brand.deep, fontSize: 13, height: 1.4, fontWeight: FontWeight.w800),
                    ),
                  )
                : Text(
                    reviewNoticeParagraphs[index].text,
                    key: ValueKey('review-notice-paragraph-$index'),
                    style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4),
                  ),
          ),
      ],
    );
  }
}

/// The pop-up shown the moment Review is pressed, BEFORE the form. True only when the tourist presses "I understand"; "Cancel" (and tapping outside
/// it, and the back button) is false, and the form is not opened. It is shown EVERY time: nothing is remembered.
///
/// The words scroll and the two buttons do not: on a small screen, or with large text, the notice can be longer than the screen, and the buttons are
/// outside the scrolling part so they can always be reached.
Future<bool> showReviewNoticeDialog(BuildContext context) async {
  final understood = await showDialog<bool>(
    context: context,
    builder: (context) => const _ReviewNoticeDialog(),
  );
  return understood == true;
}

class _ReviewNoticeDialog extends StatelessWidget {
  const _ReviewNoticeDialog();

  @override
  Widget build(BuildContext context) {
    return Dialog(
      key: const ValueKey('review-notice-dialog'),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Flexible(
              child: SingleChildScrollView(
                key: const ValueKey('review-notice-scroll'),
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                child: const ReviewNoticeContent(),
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    key: const ValueKey('review-notice-cancel'),
                    onPressed: () => Navigator.of(context).pop(false),
                    child: const Text('Cancel'),
                  ),
                  FilledButton(
                    key: const ValueKey('review-notice-understand'),
                    onPressed: () => Navigator.of(context).pop(true),
                    child: const Text('I understand'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The notice under the review form: the same words as the pop-up (see [ReviewNoticeContent]).
///
/// It is its own widget and not a [DataSourceBanner] on purpose: that one says
/// where the data you are looking at comes from (live, or the saved copy), and
/// this one says who will see what you are about to send. Two meanings, two
/// widgets, as with [StatusPill] (a status) and [StatusPill.label] (a type).
/// Neutral colours: it is not a status and not the brand.
class PublicVisibilityNotice extends StatelessWidget {
  const PublicVisibilityNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.public, size: 20, color: AppColors.muted),
            SizedBox(width: 10),
            Expanded(child: ReviewNoticeContent()),
          ],
        ),
      ),
    );
  }
}

class MapPin extends StatelessWidget {
  const MapPin({super.key, this.color});

  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color ?? context.brand.primary,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 8,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: const Icon(Icons.location_on, color: Colors.white, size: 24),
    );
  }
}

class TripSummaryCard extends StatelessWidget {
  const TripSummaryCard({super.key, required this.destination});

  final Destination? destination;

  @override
  Widget build(BuildContext context) {
    final item = destination;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Your Trip',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
            ),
            const SizedBox(height: 12),
            if (item == null)
              const EmptyState(
                icon: Icons.travel_explore_outlined,
                title: 'No trip destination loaded yet',
              )
            else
              DestinationListCard(destination: item, onTap: () {}),
            const Divider(),
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                MiniTripStat(
                  icon: Icons.group_outlined,
                  label: 'Tourists',
                  value: '1',
                ),
                MiniTripStat(
                  icon: Icons.calendar_month_outlined,
                  label: 'Visit',
                  value: 'Soon',
                ),
                MiniTripStat(
                  icon: Icons.place_outlined,
                  label: 'Status',
                  value: 'Planning',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MiniTripStat extends StatelessWidget {
  const MiniTripStat({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: context.brand.primary),
        const SizedBox(height: 5),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
        Text(
          label,
          style: const TextStyle(color: AppColors.muted, fontSize: 11),
        ),
      ],
    );
  }
}

class PlanVisitForm extends StatefulWidget {
  const PlanVisitForm({super.key, required this.destinations});

  final List<Destination> destinations;

  @override
  State<PlanVisitForm> createState() => _PlanVisitFormState();
}

class _PlanVisitFormState extends State<PlanVisitForm> {
  late Destination _destination;
  DateTime? _date;
  final TextEditingController _activities = TextEditingController();
  final List<String> _itinerary = [];

  @override
  void initState() {
    super.initState();
    _destination = widget.destinations.firstOrNull ?? Destination.placeholder();
  }

  @override
  void dispose() {
    _activities.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.destinations.isEmpty) {
      return const Card(
        elevation: 0,
        color: Colors.white,
        child: Padding(
          padding: EdgeInsets.all(14),
          child: EmptyState(
            icon: Icons.travel_explore_outlined,
            title: 'No destinations available for planning yet',
          ),
        ),
      );
    }

    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownTile<Destination>(
              label: 'Destination',
              value: _destination,
              items: widget.destinations,
              itemLabel: (item) => item.name,
              onChanged: (item) => setState(() => _destination = item),
            ),
            PickerTile(
              icon: Icons.calendar_month_outlined,
              label: 'Date',
              value: _date == null ? 'Pick a date' : shortDate(_date!),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) setState(() => _date = picked);
              },
            ),
            AppTextField(
              controller: _activities,
              label: 'Activities',
              maxLines: 3,
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () {
                setState(() {
                  _itinerary.add(
                    '${_destination.name} - ${_activities.text.trim().isEmpty ? 'Visit and explore' : _activities.text.trim()}',
                  );
                  _activities.clear();
                });
              },
              icon: const Icon(Icons.add),
              label: const Text('Add to itinerary'),
            ),
            const SizedBox(height: 12),
            const Text(
              'Your Itinerary',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            if (_itinerary.isEmpty)
              const Text(
                'No stops yet. Add your first stop above.',
                style: TextStyle(color: AppColors.muted),
              )
            else
              ..._itinerary.map(
                (item) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.check_circle_outline),
                  title: Text(item),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// "View on map" on Destination Details. A real button (a ListTile with onTap: reached by the keyboard, activated by Enter and Space, and
/// announced as a button) when the destination HAS a place on the map and a way to show it; otherwise it is not a button at all and says
/// why, so it is never something that looks pressable and does nothing.
class LocationCard extends StatelessWidget {
  const LocationCard({super.key, required this.destination, this.onViewOnMap});

  final Destination destination;

  /// What pressing does. null: nothing to press (the card only shows where the destination is).
  final VoidCallback? onViewOnMap;

  @override
  Widget build(BuildContext context) {
    final pressable = onViewOnMap != null && destination.hasCoordinates;
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Semantics(
        button: pressable,
        enabled: pressable,
        label: pressable ? 'View ${destination.name} on the map' : null,
        onTap: pressable ? onViewOnMap : null,
        excludeSemantics: pressable,
        child: ListTile(
          enabled: pressable,
          onTap: pressable ? onViewOnMap : null,
          leading: CircleAvatar(
            backgroundColor: context.brand.tint,
            child: Icon(Icons.navigation_outlined, color: context.brand.primary),
          ),
          title: Text(
            destination.hasCoordinates ? 'View on map' : 'Not on the map yet',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          subtitle: Text(
            destination.hasCoordinates
                ? '${destination.latitude}, ${destination.longitude}'
                : 'This destination has no map location yet.',
          ),
          trailing: pressable ? const Icon(Icons.chevron_right) : null,
        ),
      ),
    );
  }
}

class DestinationFactsPanel extends StatelessWidget {
  const DestinationFactsPanel({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            FactRow(
              icon: Icons.groups_outlined,
              label: 'Visitor arrivals',
              value: destination.visitorsLabel,
            ),
            FactRow(
              icon: Icons.category_outlined,
              label: 'Category',
              value: destination.type,
            ),
            FactRow(
              icon: Icons.verified_outlined,
              label: 'Permit status',
              value: destination.permitLabel,
            ),
            FactRow(
              icon: Icons.route_outlined,
              label: 'Access',
              value: destination.access.isEmpty
                  ? 'Not specified'
                  : destination.access,
            ),
          ],
        ),
      ),
    );
  }
}

class FactRow extends StatelessWidget {
  const FactRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    // Two even columns. The icon and the label are in the left one; the value is in
    // the right one, aligned to ITS left edge, so every value starts at one
    // position whatever its length. A long value wraps inside its own column, and
    // the rows are aligned at the top so that a wrapped value does not push the
    // label to the middle of the row.
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: context.brand.primary, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.left,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }
}

class FormPageScaffold extends StatelessWidget {
  const FormPageScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.leading,
    this.padding = const EdgeInsets.fromLTRB(18, 8, 18, 24),
    this.titleAtStart = false,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final Widget? leading;

  /// The padding of the page (the default is what every page has had).
  final EdgeInsets padding;

  /// The bar does not centre its title (it does on iOS and macOS unless told not to): the title stays after the back arrow on every platform. Off: the
  /// platform's own way, as every page has had it.
  final bool titleAtStart;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        // The bar centres its title on iOS and macOS unless it is told not to; a page that keeps its title on the left says so here, every other page
        // keeps the platform's own way.
        centerTitle: titleAtStart ? false : null,
        leading: leading ??
            (Navigator.of(context).canPop()
                ? IconButton(
                    icon: const Icon(Icons.arrow_back),
                    tooltip: '',
                    onPressed: () => Navigator.of(context).pop(),
                  )
                : null),
      ),
      body: SafeArea(
        child: ListView(
          padding: padding,
          children: [
            Text(
              subtitle,
              style: const TextStyle(
                color: AppColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }
}

class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.controller,
    required this.label,
    this.maxLines = 1,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.onChanged,
    this.prefixText,
    this.hintText,
    this.inputFormatters,
    this.maxLength,
  });

  final TextEditingController controller;
  final String label;
  final String? prefixText;
  final String? hintText;
  final List<TextInputFormatter>? inputFormatters;
  final int? maxLength;
  final int maxLines;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        keyboardType: keyboardType,
        textCapitalization: textCapitalization,
        onChanged: onChanged,
        inputFormatters: inputFormatters,
        maxLength: maxLength,
        decoration: InputDecoration(
          labelText: label,
          prefixText: prefixText,
          // A prefix (like +63) reads as a label and a hint as a suggestion, so
          // they must not look like what the user types. Flutter makes the
          // prefix follow the hint style unless it is set on its own.
          prefixStyle: prefixText == null
              ? null
              : const TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w600,
                ),
          hintText: hintText,
          hintStyle: hintText == null
              ? null
              : const TextStyle(color: AppColors.muted),
          counterText: maxLength == null ? null : '',
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border),
          ),
        ),
      ),
    );
  }
}

class DropdownTile<T> extends StatelessWidget {
  const DropdownTile({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.itemLabel,
    required this.onChanged,
    this.hint,
  });

  final String label;
  final T value;
  final List<T> items;
  final String Function(T item) itemLabel;
  final ValueChanged<T> onChanged;

  /// Shown in place of a selection when [value] is null.
  final String? hint;

  @override
  Widget build(BuildContext context) {
    // With no items the field still shows the current value; a null value
    // (nothing chosen yet, see [hint]) has nothing to show.
    final choices = items.isEmpty ? [if (value != null) value] : items;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<T>(
        isExpanded: true,
        initialValue: value,
        hint: hint == null ? null : Text(hint!),
        items: choices
            .map(
              (item) => DropdownMenuItem<T>(
                value: item,
                child: Text(
                  itemLabel(item),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
            )
            .toList(),
        onChanged: (item) {
          if (item != null) onChanged(item);
        },
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border),
          ),
        ),
      ),
    );
  }
}

class PickerTile extends StatelessWidget {
  const PickerTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(icon, color: context.brand.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                    Text(
                      value,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CounterPanel extends StatelessWidget {
  const CounterPanel({super.key, required this.title, required this.counters});

  final String title;
  final List<CounterItem> counters;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            ...counters.map((item) => CounterRow(item: item)),
          ],
        ),
      ),
    );
  }
}

class CounterRow extends StatelessWidget {
  const CounterRow({super.key, required this.item});

  final CounterItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              item.label,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          IconButton.filledTonal(
            onPressed: item.value > 0
                ? () => item.onChanged(item.value - 1)
                : null,
            icon: const Icon(Icons.remove),
          ),
          SizedBox(
            width: 38,
            child: Center(
              child: Text(
                '${item.value}',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ),
          IconButton.filledTonal(
            onPressed: () => item.onChanged(item.value + 1),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }
}

class CounterItem {
  const CounterItem(this.label, this.value, this.onChanged);

  final String label;
  final int value;
  final ValueChanged<int> onChanged;
}

class RatingSelector extends StatelessWidget {
  const RatingSelector({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Row(
            children: List.generate(
              5,
              (index) => IconButton(
                onPressed: () => onChanged(index + 1),
                icon: Icon(
                  index < value ? Icons.star : Icons.star_border,
                  color: const Color(0xffe6a100),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.loading,
    required this.onPressed,
    this.loadingLabel = 'Submitting...',
  });

  final String label;
  final bool loading;
  final VoidCallback onPressed;
  final String loadingLabel;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: loading ? null : onPressed,
      icon: loading
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.send_outlined),
      label: Text(loading ? loadingLabel : label),
    );
  }
}

class ProfileTile extends StatelessWidget {
  const ProfileTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: Icon(icon),
        title: Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        subtitle: Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class ProfileLink extends StatelessWidget {
  const ProfileLink({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        onTap: onTap,
        leading: Icon(icon),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class AnimatedScaleButton extends StatefulWidget {
  const AnimatedScaleButton({super.key, required this.child, required this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  State<AnimatedScaleButton> createState() => _AnimatedScaleButtonState();
}

class _AnimatedScaleButtonState extends State<AnimatedScaleButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
      reverseDuration: const Duration(milliseconds: 100),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) {
        if (widget.onTap != null) _controller.forward();
      },
      onTapUp: (_) {
        if (widget.onTap != null) _controller.reverse();
      },
      onTapCancel: () {
        if (widget.onTap != null) _controller.reverse();
      },
      onTap: widget.onTap,
      child: ScaleTransition(
        scale: _scaleAnimation,
        child: widget.child,
      ),
    );
  }
}

/// Shown once loading has gone on long enough that the user may wonder.
const tourismSlowLoadingMessage =
    'Still loading. This can take a moment the first time you open the app.';
const tourismSlowLoadingDelay = Duration(seconds: 8);

/// Wraps skeleton blocks and pulses them together (one timer for the group).
class SkeletonPulse extends StatefulWidget {
  const SkeletonPulse({super.key, required this.child});

  final Widget child;

  @override
  State<SkeletonPulse> createState() => _SkeletonPulseState();
}

class _SkeletonPulseState extends State<SkeletonPulse> {
  Timer? _timer;
  bool _dim = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 800), (_) {
      if (mounted) setState(() => _dim = !_dim);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: _dim ? 0.55 : 1,
      duration: const Duration(milliseconds: 700),
      curve: Curves.easeInOut,
      child: widget.child,
    );
  }
}

class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 8,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.border,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// Same footprint as the featured carousel (225 high, 20 radius).
class FeaturedCarouselSkeleton extends StatelessWidget {
  const FeaturedCarouselSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const SkeletonPulse(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 4),
        child: SkeletonBlock(height: 225, radius: 20),
      ),
    );
  }
}

/// Same footprint as the Hidden Gems row (195 high, 165-wide cards).
class HiddenGemsRowSkeleton extends StatelessWidget {
  const HiddenGemsRowSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonPulse(
      child: SizedBox(
        height: 195,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: 3,
          separatorBuilder: (context, index) => const SizedBox(width: 12),
          itemBuilder: (context, index) =>
              const SkeletonBlock(width: 165, height: 195, radius: 16),
        ),
      ),
    );
  }
}

/// Same footprint as [DestinationListCard].
class DestinationListSkeleton extends StatelessWidget {
  const DestinationListSkeleton({super.key, this.count = 3});

  final int count;

  @override
  Widget build(BuildContext context) {
    return SkeletonPulse(
      child: Column(
        children: [
          for (var i = 0; i < count; i++)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Row(
                children: [
                  SkeletonBlock(width: 86, height: 72, radius: 12),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBlock(height: 16),
                        SizedBox(height: 8),
                        SkeletonBlock(width: 120, height: 12),
                        SizedBox(height: 8),
                        SkeletonBlock(width: 80, height: 12),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Nothing for the first [tourismSlowLoadingDelay], then the plain message.
class SlowLoadingNotice extends StatefulWidget {
  const SlowLoadingNotice({super.key});

  @override
  State<SlowLoadingNotice> createState() => _SlowLoadingNoticeState();
}

class _SlowLoadingNoticeState extends State<SlowLoadingNotice> {
  Timer? _timer;
  bool _show = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer(tourismSlowLoadingDelay, () {
      if (mounted) setState(() => _show = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_show) return const SizedBox.shrink();
    return const Padding(
      padding: EdgeInsets.only(top: 4, bottom: 12),
      child: Text(
        tourismSlowLoadingMessage,
        textAlign: TextAlign.center,
        style: TextStyle(color: AppColors.muted, fontSize: 12.5),
      ),
    );
  }
}

/// What the user sees when the tourism bootstrap failed. [note] says why a
/// particular screen is affected, for screens that are not just a list.
class BootstrapErrorPanel extends StatelessWidget {
  const BootstrapErrorPanel({
    super.key,
    required this.failure,
    required this.onRetry,
    this.note,
  });

  final BootstrapFailureKind failure;
  final VoidCallback onRetry;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final isServer = failure == BootstrapFailureKind.server;
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(
              isServer ? Icons.cloud_off_outlined : Icons.wifi_off_outlined,
              size: 34,
              color: AppColors.muted,
            ),
            const SizedBox(height: 10),
            Text(
              isServer
                  ? 'The server is having a problem.'
                  : "Can't reach the server.",
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              isServer
                  ? 'Please try again in a moment.'
                  : 'Check your internet connection, then try again.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
            ),
            if (note != null) ...[
              const SizedBox(height: 6),
              Text(
                note!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
              ),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

String _shortDate(DateTime when, DateTime now) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final day = '${months[when.month - 1]} ${when.day}';
  return when.year == now.year ? day : '$day, ${when.year}';
}

/// What the user is told when a saved copy is on screen and the server could
/// not be asked: small, over the data, never blocking it.
class SavedInfoNotice extends StatelessWidget {
  const SavedInfoNotice({
    super.key,
    required this.savedAt,
    required this.refreshing,
    required this.onRetry,
    this.now,
  });

  final DateTime savedAt;
  final bool refreshing;
  final VoidCallback onRetry;

  /// For tests; defaults to the current time.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final date = _shortDate(savedAt, now ?? DateTime.now());
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              refreshing
                  ? 'Showing saved info from $date. Refreshing...'
                  : "Showing saved info from $date. Couldn't refresh.",
              style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
            ),
          ),
          if (!refreshing)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'Try again',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
        ],
      ),
    );
  }
}
