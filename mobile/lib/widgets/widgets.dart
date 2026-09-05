part of '../main.dart';

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
        leading: const CircleAvatar(
          backgroundColor: Color(0xffe9f8ef),
          child: Icon(Icons.my_location_outlined, color: AppColors.green),
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
        border: Border.all(color: const Color(0xFFCCFBF1), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F766E).withValues(alpha: 0.08),
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
            decoration: const BoxDecoration(
              color: Color(0xFFF0FDFA),
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              children: [
                const Icon(Icons.confirmation_number_outlined, size: 16, color: Color(0xFF0F766E)),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'MAUBAN TOURIST ENTRY PASS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF0F766E),
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                StatusPill(text: receipt.displayStatus),
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
                      border: Border.all(color: const Color(0xFF0F766E), width: 1.5),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF0F766E).withValues(alpha: 0.12),
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
                        const Text(
                          'TAP TO ZOOM',
                          style: TextStyle(
                            fontSize: 7.5,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF0F766E),
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

/// Modal dialog displaying the exact Tourist QR Entry Pass from Screenshot 1
class TouristDigitalPassModal extends StatelessWidget {
  const TouristDigitalPassModal({super.key, required this.receipt});

  final MobileVisitReceipt receipt;

  @override
  Widget build(BuildContext context) {
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
                color: const Color(0xFFE8F5E9),
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
                  Container(
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
                            decoration: const BoxDecoration(
                              color: Color(0xFF14532D),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'LGU MAUBAN • TOURIST ENTRY PASS',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1,
                                    color: Color(0xFF86EFAC),
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
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFDCFCE7),
                                        borderRadius: BorderRadius.circular(999),
                                        border: Border.all(color: const Color(0xFF86EFAC)),
                                      ),
                                      child: Text(
                                        receipt.displayStatus,
                                        style: const TextStyle(
                                          color: Color(0xFF166534),
                                          fontWeight: FontWeight.w800,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Save QR to device Button
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Row(
                              children: [
                                const Icon(Icons.download_done, color: Colors.white),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text('QR Pass for ${receipt.reference} saved to device! Ready for offline check-in.'),
                                ),
                              ],
                            ),
                            backgroundColor: const Color(0xFF14532D),
                            behavior: SnackBarBehavior.floating,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        );
                      },
                      icon: const Icon(Icons.download),
                      label: const Text('Save QR to device', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF14532D),
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
            decoration: const BoxDecoration(
              color: Color(0xFFE8F5E9),
              shape: BoxShape.circle,
            ),
          ),
        ),
        Positioned(
          right: -10,
          child: Container(
            width: 20,
            height: 20,
            decoration: const BoxDecoration(
              color: Color(0xFFE8F5E9),
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
            SizedBox(
              height: 220,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: FlutterMap(
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
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'mauban_sanitation_mobile',
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
          backgroundColor: const Color(0xffdcfce7),
          child: Icon(icon, color: AppColors.green),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
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
              Icon(icon, color: AppColors.green),
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
            border: Border.all(color: AppColors.green.withValues(alpha: 0.35), width: 1.5),
          ),
          child: ClipOval(
            child: Image.asset('assets/tourism_logo.jpg', width: 34, height: 34, fit: BoxFit.cover),
          ),
        ),
        const SizedBox(width: 10),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'MUNICIPALITY OF MAUBAN',
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: AppColors.deepGreen,
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
                      destination.rating.toStringAsFixed(1),
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
                  const SizedBox(height: 8),
                  VisitorPill(destination: destination, dark: true),
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
  });

  final Destination destination;
  final double? height;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      imageAssetFor(destination.imageKey),
      height: height,
      width: width ?? double.infinity,
      fit: BoxFit.cover,
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
                  color: AppColors.green.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: AppColors.green),
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
                        destination.rating.toStringAsFixed(1),
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
                    const SizedBox(height: 6),
                    VisitorPill(destination: destination, dark: true),
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
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      destination.location,
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      destination.visitorsLabel,
                      style: const TextStyle(
                        color: AppColors.deepGreen,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        RatingPill(rating: destination.rating),
                        const SizedBox(width: 8),
                        Expanded(child: StatusPill(text: destination.type)),
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
  const RatingPill({super.key, required this.rating});

  final double rating;

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
            rating.toStringAsFixed(1),
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
    final hasVisits = destination.monthlyArrivals > 0;
    final text = hasVisits
        ? '${formatCount(destination.monthlyArrivals)} visits'
        : destination.type.isNotEmpty
            ? destination.type
            : 'Featured Spot';
    final icon = hasVisits ? Icons.groups_outlined : Icons.place_outlined;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: dark
            ? Colors.white.withValues(alpha: 0.22)
            : const Color(0xffecfdf3),
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
            color: dark ? Colors.white : AppColors.green,
          ),
          const SizedBox(width: 4),
          Text(
            text,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10.5,
              color: dark ? Colors.white : AppColors.deepGreen,
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

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xffdcfce7),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 11,
          color: AppColors.green,
          fontWeight: FontWeight.w900,
        ),
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
  });

  final IconData icon;
  final String title;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
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
          Icon(icon, color: AppColors.green),
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
        ],
      ),
        ),
      ),
      ),
    );
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
            color: warning ? const Color(0xfffff3bd).withValues(alpha: 0.6) : const Color(0xffecfdf3).withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: warning ? const Color(0xffffd267).withValues(alpha: 0.5) : const Color(0xffb7e8c6).withValues(alpha: 0.5),
            ),
          ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green),
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

class MapPin extends StatelessWidget {
  const MapPin({super.key, this.color});

  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color ?? AppColors.green,
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
        Icon(icon, color: AppColors.green),
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

class LocationCard extends StatelessWidget {
  const LocationCard({super.key, required this.destination});

  final Destination destination;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Color(0xffdcfce7),
          child: Icon(Icons.navigation_outlined, color: AppColors.green),
        ),
        title: const Text(
          'View on map',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text('${destination.latitude}, ${destination.longitude}'),
        trailing: const Icon(Icons.chevron_right),
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green, size: 20),
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
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }
}

class AmenityChip extends StatelessWidget {
  const AmenityChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      backgroundColor: const Color(0xffe9f8ef),
      side: BorderSide.none,
    );
  }
}

class FormPageScaffold extends StatelessWidget {
  const FormPageScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
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
  });

  final TextEditingController controller;
  final String label;
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

class DropdownTile<T> extends StatelessWidget {
  const DropdownTile({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.itemLabel,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<T> items;
  final String Function(T item) itemLabel;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final choices = items.isEmpty ? [value] : items;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<T>(
        isExpanded: true,
        initialValue: value,
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
              Icon(icon, color: AppColors.green),
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
