import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../constants/colors.dart';
import 'owner_models.dart';
import 'owner_formatting.dart';

const _portalCanvas = Color(0xFFF3F7F4);
const _portalGreen = Color(0xFF1E6B45);
const _portalDarkGreen = Color(0xFF154F33);
const _portalRed = Color(0xFF8A1C12);
const _portalNoticeYellow = Color(0xFFFFF4D6);

class OwnerStatusColors {
  const OwnerStatusColors(this.foreground, this.background);

  final Color foreground;
  final Color background;
}

/// Chip colours by the status the server sends; expired and suspended are red.
OwnerStatusColors ownerStatusColors(String status) {
  switch (status) {
    case 'active':
      return const OwnerStatusColors(_portalGreen, Color(0xFFE3F1E8));
    case 'renewal_due':
    case 'conditional':
      return const OwnerStatusColors(Color(0xFF8A5A00), Color(0xFFFFF1CC));
    case 'expired':
    case 'suspended':
      return const OwnerStatusColors(_portalRed, Color(0xFFFBE4E1));
    default:
      return const OwnerStatusColors(Color(0xFF4B5563), Color(0xFFEDEFF2));
  }
}

class OwnerPortalView extends StatefulWidget {
  const OwnerPortalView({
    super.key,
    required this.lookup,
    required this.formatError,
  });

  final Future<OwnerPermitStatus> Function(String code) lookup;
  final String Function(Object error) formatError;

  @override
  State<OwnerPortalView> createState() => _OwnerPortalViewState();
}

class _OwnerPortalViewState extends State<OwnerPortalView> {
  final TextEditingController _code = TextEditingController();
  bool _loading = false;
  String? _error;
  OwnerPermitStatus? _status;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    if (_loading) return;
    final code = normalizeOwnerTrackingCode(_code.text);
    FocusScope.of(context).unfocus();
    if (code.isEmpty) {
      setState(() {
        _status = null;
        _error = 'Enter the tracking code.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _status = null;
    });
    try {
      final status = await widget.lookup(code);
      if (!mounted) return;
      setState(() => _status = status);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = widget.formatError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _portalCanvas,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildHeader(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildCodeCard(),
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          _buildError(_error!),
                        ],
                        if (_status != null) ...[
                          const SizedBox(height: 14),
                          _buildResultCard(_status!),
                        ],
                        const SizedBox(height: 24),
                        const Text(
                          'Official Mauban LGU e-Service',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.muted, fontSize: 11.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 20, 24),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_portalGreen, _portalDarkGreen],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BackButton(color: Colors.white),
          Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'MUNICIPAL HEALTH OFFICE',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Check your sanitary permit status',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    height: 1.2,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'No account needed. Enter the tracking code given by the Sanitary Office.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.88),
                    fontSize: 13.5,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }

  Widget _buildCodeCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'TRACKING CODE',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: _portalDarkGreen,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 52,
            child: TextField(
              key: const ValueKey('owner-code-input'),
              controller: _code,
              enabled: !_loading,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              enableSuggestions: false,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _check(),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]')),
                TextInputFormatter.withFunction(
                  (oldValue, newValue) => newValue.copyWith(text: newValue.text.toUpperCase()),
                ),
                LengthLimitingTextInputFormatter(20),
              ],
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
                fontFamily: 'monospace',
              ),
              decoration: InputDecoration(
                hintText: 'MBN-XXXX-XXXX',
                hintStyle: const TextStyle(color: Color(0xFF9CA3AF), letterSpacing: 1.5),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                filled: true,
                fillColor: const Color(0xFFF9FBFA),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _portalGreen, width: 1.6),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 50,
            child: FilledButton(
              key: const ValueKey('owner-code-submit'),
              onPressed: _loading ? null : _check,
              style: FilledButton.styleFrom(
                backgroundColor: _portalGreen,
                disabledBackgroundColor: _portalGreen.withValues(alpha: 0.55),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                    )
                  : const Text(
                      'Check status',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                    ),
            ),
          ),
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'The first check can take up to a minute while the server wakes up.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ),
          const SizedBox(height: 12),
          const Text(
            'This is not the permit number posted in your shop. No code? Visit the Sanitary Office.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.35),
          ),
        ],
      ),
    );
  }

  Widget _buildError(String message) {
    return Container(
      key: const ValueKey('owner-portal-error'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFBE4E1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF1B8B0)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: _portalRed, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: _portalRed, fontSize: 13, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultCard(OwnerPermitStatus status) {
    final chip = ownerStatusColors(status.permitStatus);
    final subtitle = [status.businessType, status.barangay]
        .where((part) => part.isNotEmpty)
        .join(' · ');

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      status.businessName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Container(
                key: const ValueKey('owner-status-chip'),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: chip.background,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  status.permitStatusLabel,
                  style: TextStyle(
                    color: chip.foreground,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _tile('Permit no.', status.permitNumber ?? 'No permit number yet'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _tile(
                  'Expires',
                  ownerExpiryText(status.permitExpiryDate, status.daysLeft),
                ),
              ),
            ],
          ),
          if (status.renewalNotice != null) ...[
            const SizedBox(height: 12),
            _notice(status.renewalNotice!),
          ],
          for (final notice in [status.expiredNotice, status.suspendedNotice])
            if (notice != null) ...[
              const SizedBox(height: 12),
              _notice(notice, urgent: true),
            ],
          const SizedBox(height: 16),
          const Text(
            'Requirements',
            style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          const SizedBox(height: 6),
          for (final item in status.requirements) _requirementRow(item),
          if (status.requirementsNote != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                status.requirementsNote!,
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
              ),
            ),
        ],
      ),
    );
  }

  Widget _tile(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _portalCanvas,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
        ],
      ),
    );
  }

  /// The server's notice, as sent: yellow with a bell for a coming renewal,
  /// red for an expired or suspended permit.
  Widget _notice(String text, {bool urgent = false}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: urgent ? const Color(0xFFFBE4E1) : _portalNoticeYellow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            urgent ? Icons.error_outline : Icons.notifications_active_outlined,
            size: 19,
            color: urgent ? _portalRed : const Color(0xFF8A5A00),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.35,
                color: urgent ? _portalRed : const Color(0xFF5C3D00),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _requirementRow(OwnerRequirementItem item) {
    final submitted = item.submitted;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(item.name, style: const TextStyle(fontSize: 13.5, color: AppColors.ink)),
          ),
          if (submitted == true)
            const Text(
              'Submitted',
              style: TextStyle(color: _portalGreen, fontWeight: FontWeight.w800, fontSize: 12.5),
            )
          else if (submitted == false)
            const Text(
              'Missing',
              style: TextStyle(color: _portalRed, fontWeight: FontWeight.w800, fontSize: 12.5),
            ),
        ],
      ),
    );
  }
}
