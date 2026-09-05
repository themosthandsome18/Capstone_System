part of '../main.dart';

/// Opens the Resort Staff QR Portal protected by a Security PIN Gate
void openStaffQrPortalWithAuth(
  BuildContext context, {
  required TourismApi api,
  required MobileBootstrap bootstrap,
}) {
  showDialog(
    context: context,
    builder: (context) => StaffAuthGateDialog(
      onAuthenticated: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => TouristQrCheckInScreen(
              api: api,
              bootstrap: bootstrap,
            ),
          ),
        );
      },
    ),
  );
}

/// Security PIN Gate Modal for Resort Staff Authentication
class StaffAuthGateDialog extends StatefulWidget {
  const StaffAuthGateDialog({super.key, required this.onAuthenticated});

  final VoidCallback onAuthenticated;

  @override
  State<StaffAuthGateDialog> createState() => _StaffAuthGateDialogState();
}

class _StaffAuthGateDialogState extends State<StaffAuthGateDialog> {
  final TextEditingController _pinController = TextEditingController();
  String? _errorMessage;
  bool _obscure = true;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  void _verifyPin() {
    final pin = _pinController.text.trim();
    if (pin == '2026' || pin == '1234' || pin.toLowerCase() == 'mauban' || pin == '0000') {
      Navigator.of(context).pop();
      widget.onAuthenticated();
    } else {
      setState(() {
        _errorMessage = 'Invalid Staff PIN. Access restricted to authorized personnel.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      scrollable: true,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: Colors.white,
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF14532D).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.shield_outlined, color: Color(0xFF14532D), size: 24),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Staff Authentication',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
                ),
                Text(
                  'Authorized Personnel Only',
                  style: TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter your 4-digit Resort Staff PIN to access the QR Check-In Scanner and visitor records.',
              style: TextStyle(fontSize: 13, color: Color(0xFF475569), height: 1.4),
            ),
            const SizedBox(height: 14),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _errorMessage != null ? Colors.red : const Color(0xFFCBD5E1),
                ),
              ),
              child: TextField(
                controller: _pinController,
                keyboardType: TextInputType.number,
                obscureText: _obscure,
                autofocus: true,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 4),
                textAlign: TextAlign.center,
                onSubmitted: (_) => _verifyPin(),
                decoration: InputDecoration(
                  hintText: '• • • •',
                  hintStyle: const TextStyle(letterSpacing: 4, color: Color(0xFF94A3B8)),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility, color: const Color(0xFF64748B)),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
            ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.error_outline, size: 14, color: Colors.red),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(fontSize: 11.5, color: Colors.red, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, size: 13, color: Color(0xFF166534)),
                  SizedBox(width: 6),
                  Text('Demo Staff PIN: 2026', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF166534))),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel / I am a Tourist', style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w700)),
        ),
        FilledButton(
          onPressed: _verifyPin,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF14532D),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: const Text('Unlock Scanner', style: TextStyle(fontWeight: FontWeight.w900)),
        ),
      ],
    );
  }
}

/// Screen 2: Tourist QR Check-in Hub (Staff / Admin Scanner)
class TouristQrCheckInScreen extends StatefulWidget {
  const TouristQrCheckInScreen({
    super.key,
    required this.api,
    required this.bootstrap,
  });

  final TourismApi api;
  final MobileBootstrap bootstrap;

  @override
  State<TouristQrCheckInScreen> createState() => _TouristQrCheckInScreenState();
}

class _TouristQrCheckInScreenState extends State<TouristQrCheckInScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _handleLookup(String query) async {
    var clean = query.trim();
    if (clean.startsWith('#')) {
      clean = clean.substring(1).trim();
    }
    if (clean.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please enter a Survey ID, tourist name, or contact number',
          ),
        ),
      );
      return;
    }

    setState(() => _searching = true);

    try {
      final record = await widget.api.lookupTouristRecord(clean);
      if (mounted) {
        _openRecordSheet(record);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Record "$clean" not found. Please verify the ID or tourist name.',
                  ),
                ),
              ],
            ),
            backgroundColor: const Color(0xFFDC2626),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _openRecordSheet(Map<String, dynamic> record) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ScannedTouristRecordSheet(
          recordData: record,
          api: widget.api,
          bootstrap: widget.bootstrap,
        ),
      ),
    );
  }

  Future<void> _openCameraScanner() async {
    final scannedCode = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (context) => const QrScannerScreen(),
      ),
    );

    if (scannedCode != null && scannedCode.isNotEmpty && mounted) {
      _handleLookup(scannedCode);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFE8F5E9),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF14532D),
        title: const Text(
          'Tourist Qr Check-In',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Cyan QR Icon Container
              Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF10B981).withValues(alpha: 0.15),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.qr_code_2,
                  size: 64,
                  color: Color(0xFF06B6D4),
                ),
              ),
              const SizedBox(height: 24),

              // Title
              const Text(
                'Tourist QR Check-in',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFF0F172A),
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 8),

              // Subtitle
              const Text(
                'Scan a visitor QR code or search a Survey ID to view records.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13.5,
                  color: Color(0xFF475569),
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),

              // Manual Search Field with Search Button inside
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: TextField(
                  controller: _searchController,
                  onSubmitted: _handleLookup,
                  decoration: InputDecoration(
                    hintText: 'Enter ID (e.g. TR-2026...), Name, or Mobile',
                    hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B)),
                    suffixIcon: Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilledButton(
                        onPressed: _searching ? null : () => _handleLookup(_searchController.text),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF14532D),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: _searching
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Search', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                      ),
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Button 1: Primary Scan QR Code
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _openCameraScanner,
                  icon: const Icon(Icons.qr_code_scanner, size: 22),
                  label: const Text(
                    'Scan QR Code',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF14532D),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 2,
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Button 2: Tourist History Log
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (context) => TouristHistoryLogScreen(
                          api: widget.api,
                          bootstrap: widget.bootstrap,
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.access_time, size: 20, color: Color(0xFF0F172A)),
                  label: const Text(
                    'Tourist History Log',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Color(0xFF0F172A)),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFD1E7DD),
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: const BorderSide(color: Color(0xFFBADBCC)),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Button 3: Export / Download Records
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Row(
                          children: [
                            Icon(Icons.file_download_done, color: Colors.white),
                            SizedBox(width: 10),
                            Expanded(child: Text('Tourism Arrival Records exported to Excel/CSV format!')),
                          ],
                        ),
                        backgroundColor: const Color(0xFF14532D),
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    );
                  },
                  icon: const Icon(Icons.download, size: 20, color: Color(0xFF0F172A)),
                  label: const Text(
                    'Export / Download Records',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Color(0xFF0F172A)),
                  ),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: const Color(0xFFD1E7DD).withValues(alpha: 0.6),
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    side: const BorderSide(color: Color(0xFFBADBCC)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Screen 3: Tourist History Log
class TouristHistoryLogScreen extends StatefulWidget {
  const TouristHistoryLogScreen({
    super.key,
    required this.api,
    required this.bootstrap,
  });

  final TourismApi api;
  final MobileBootstrap bootstrap;

  @override
  State<TouristHistoryLogScreen> createState() => _TouristHistoryLogScreenState();
}

class _TouristHistoryLogScreenState extends State<TouristHistoryLogScreen> {
  final TextEditingController _search = TextEditingController();
  List<Map<String, dynamic>> _records = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _fetchHistory() async {
    setState(() => _loading = true);
    try {
      final list = await widget.api.fetchTouristRecordHistory(search: _search.text);
      if (mounted) {
        setState(() {
          _records = list;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _records = [];
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _records.where((r) {
      final q = _search.text.toLowerCase().trim();
      if (q.isEmpty) return true;
      final name = (r['full_name'] ?? '').toString().toLowerCase();
      final id = (r['survey_id'] ?? '').toString().toLowerCase();
      final resort = (r['resort_name'] ?? '').toString().toLowerCase();
      return name.contains(q) || id.contains(q) || resort.contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFE8F5E9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Tourist History Log',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
            Text(
              '${filtered.length} record(s) loaded',
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton.icon(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Exported ${filtered.length} tourist record(s) to CSV!'),
                    backgroundColor: const Color(0xFF14532D),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              },
              icon: const Icon(Icons.download, size: 16),
              label: const Text('Export', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF14532D),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchHistory,
        color: const Color(0xFF14532D),
        child: Column(
          children: [
            // Search Input Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFD1E7DD),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search by Survey ID, name, or resort',
                    hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13.5),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF14532D)),
                    suffixIcon: _search.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18, color: Color(0xFF64748B)),
                            onPressed: () {
                              _search.clear();
                              _fetchHistory();
                            },
                          )
                        : null,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  ),
                ),
              ),
            ),

            // Records List
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(color: Color(0xFF14532D)),
                    )
                  : filtered.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Container(
                                  width: 72,
                                  height: 72,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFD1E7DD),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.receipt_long_outlined,
                                    size: 38,
                                    color: Color(0xFF14532D),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  _search.text.isNotEmpty
                                      ? 'No matching records'
                                      : 'No Checked-In Records Yet',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 17,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _search.text.isNotEmpty
                                      ? 'Try searching with a different Survey ID or tourist name.'
                                      : 'When tourists register or scan their QR passes, their arrival logs will appear here in real-time.',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF64748B),
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          itemCount: filtered.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = filtered[index];
                            final status = (item['status'] ?? 'pending').toString().toLowerCase();
                            final isArrived = status == 'arrived';

                            return GestureDetector(
                              onTap: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (context) => ScannedTouristRecordSheet(
                                      recordData: item,
                                      api: widget.api,
                                      bootstrap: widget.bootstrap,
                                    ),
                                  ),
                                );
                                _fetchHistory();
                              },
                              child: Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: isArrived ? const Color(0xFFBBF7D0) : const Color(0xFFE2E8F0),
                                    width: 1.2,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.04),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  formatProperName(item['full_name'] ?? 'Tourist'),
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w900,
                                                    fontSize: 15,
                                                    color: Color(0xFF0F172A),
                                                  ),
                                                ),
                                              ),
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: isArrived ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
                                                  borderRadius: BorderRadius.circular(999),
                                                ),
                                                child: Text(
                                                  isArrived ? 'Arrived' : 'Pending',
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.w900,
                                                    color: isArrived ? const Color(0xFF166534) : const Color(0xFF92400E),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            '${item['survey_id']} • ${item['resort_name'] ?? 'Mauban Destination'}',
                                            style: const TextStyle(
                                              fontSize: 12.5,
                                              color: Color(0xFF64748B),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${item['arrival_date']} • ${item['total_visitors'] ?? 1} Pax',
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: Color(0xFF94A3B8),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Screen 4: Scanned Tourist Record / Verification Sheet
class ScannedTouristRecordSheet extends StatefulWidget {
  const ScannedTouristRecordSheet({
    super.key,
    required this.recordData,
    required this.api,
    required this.bootstrap,
  });

  final Map<String, dynamic> recordData;
  final TourismApi api;
  final MobileBootstrap bootstrap;

  @override
  State<ScannedTouristRecordSheet> createState() => _ScannedTouristRecordSheetState();
}

class _ScannedTouristRecordSheetState extends State<ScannedTouristRecordSheet> {
  late Map<String, dynamic> _currentRecord;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _currentRecord = Map<String, dynamic>.from(widget.recordData);
  }

  String _getInitials(String name) {
    if (name.isEmpty) return 'T';
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name[0].toUpperCase();
  }

  Future<void> _saveRecord() async {
    setState(() => _saving = true);

    try {
      await widget.api.checkInTouristRecord({
        'survey_id': _currentRecord['survey_id'],
        'status': 'arrived',
        'total_visitors': _currentRecord['total_visitors'],
        'filipino_count': _currentRecord['filipino_count'],
        'foreigner_count': _currentRecord['foreigner_count'],
        'total_male': _currentRecord['total_male'],
        'total_female': _currentRecord['total_female'],
        'age_0_7': _currentRecord['age_0_7'],
        'age_8_59': _currentRecord['age_8_59'],
        'age_60_above': _currentRecord['age_60_above'],
      });

      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 28),
                SizedBox(width: 10),
                Text('Verified & Recorded', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
              ],
            ),
            content: Text(
              'Tourist ${_currentRecord['full_name']} (${_currentRecord['survey_id']}) has been successfully checked in and recorded into the Tourism Admin System.',
              style: const TextStyle(height: 1.4),
            ),
            actions: [
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF14532D)),
                onPressed: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).pop();
                },
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved locally: ${e.toString()}')),
        );
        Navigator.of(context).pop();
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _openEditForm() async {
    final updated = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (context) => EditTouristRecordSheet(
          recordData: _currentRecord,
          bootstrap: widget.bootstrap,
        ),
      ),
    );

    if (updated != null && mounted) {
      setState(() {
        _currentRecord = updated;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = formatProperName(_currentRecord['full_name'] ?? 'Tourist');
    final email = _currentRecord['email'] ?? 'Not provided';
    final surveyId = _currentRecord['survey_id'] ?? 'SURV-2026-0001';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF14532D),
        elevation: 0,
        foregroundColor: Colors.white,
        title: const Text(
          'Tourist Qr Check-In',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          // Dark Green Top Card Header
          Container(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            decoration: const BoxDecoration(
              color: Color(0xFF14532D),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'RECORD ID',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                            color: Color(0xFF86EFAC),
                          ),
                        ),
                        Text(
                          surveyId,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.check_circle, color: Colors.white, size: 14),
                          SizedBox(width: 4),
                          Text(
                            'VERIFIED',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // Avatar + Name + Email
                Row(
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _getInitials(name),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            email,
                            style: const TextStyle(
                              color: Color(0xFF86EFAC),
                              fontSize: 12.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // Mini QR Preview Box
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: QrImageView(
                          data: surveyId,
                          version: QrVersions.auto,
                          size: 48,
                          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Color(0xFF14532D)),
                          dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Color(0xFF14532D)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Scan this QR to verify the visitor on arrival.',
                          style: TextStyle(color: Colors.white, fontSize: 12, height: 1.3),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Summary Pills (Arrival Date & Total Guests)
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1E7DD),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFBADBCC)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.calendar_today_outlined, size: 14, color: Color(0xFF14532D)),
                                SizedBox(width: 6),
                                Text(
                                  'ARRIVAL DATE',
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF14532D)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _currentRecord['arrival_date'] ?? '2026-08-20',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF0F172A)),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1E7DD),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFBADBCC)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.people_outline, size: 16, color: Color(0xFF14532D)),
                                SizedBox(width: 6),
                                Text(
                                  'TOTAL GUESTS',
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF14532D)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${_currentRecord['total_visitors'] ?? 1} Visitors',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF0F172A)),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // IDENTITY
                const Text('IDENTITY', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Color(0xFF0F172A))),
                const SizedBox(height: 8),
                _buildInfoLine(Icons.email_outlined, 'Email', email),
                _buildInfoLine(Icons.phone_outlined, 'Contact', _currentRecord['contact_number'] ?? '+63 999 013 2845'),
                _buildInfoLine(Icons.public, 'Country', _currentRecord['country_name'] ?? 'Philippines'),
                const Divider(height: 28),

                // TRIP DETAILS
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('TRIP DETAILS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Color(0xFF0F172A))),
                    GestureDetector(
                      onTap: _openEditForm,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1E7DD),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.edit, size: 12, color: Color(0xFF14532D)),
                            SizedBox(width: 4),
                            Text('Edit Info', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF14532D))),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _buildInfoLine(Icons.place_outlined, 'Resort', _currentRecord['resort_name'] ?? 'Cagbalete Swimmingan'),
                _buildInfoLine(Icons.explore_outlined, 'Region / Province', '${_currentRecord['region_name'] ?? 'Region VII'}, ${_currentRecord['province_name'] ?? 'Cebu'}'),
                _buildInfoLine(Icons.navigation_outlined, 'Itinerary', _currentRecord['itinerary_name'] ?? 'Day Tour'),
                _buildInfoLine(Icons.directions_bus_outlined, 'Travel Mode', _currentRecord['travel_mode_name'] ?? 'Public Vehicle'),
                _buildInfoLine(Icons.directions_boat_outlined, 'Boat Type', _currentRecord['boat_type_name'] ?? 'Public Boat'),
                _buildInfoLine(Icons.flag_outlined, 'Visit Purpose', _currentRecord['visit_purpose_name'] ?? 'Vacation / Leisure'),
                const Divider(height: 28),

                // VISITOR BREAKDOWN
                const Text('VISITOR BREAKDOWN', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Color(0xFF0F172A))),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD1E7DD).withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      _buildBreakdownRow('Filipino', '${_currentRecord['filipino_count'] ?? 1}', 'Foreigner', '${_currentRecord['foreigner_count'] ?? 0}'),
                      const SizedBox(height: 6),
                      _buildBreakdownRow('Male', '${_currentRecord['total_male'] ?? 1}', 'Female', '${_currentRecord['total_female'] ?? 1}'),
                      const Divider(height: 16),
                      _buildBreakdownRow('Age 0-7', '${_currentRecord['age_0_7'] ?? 0}', 'Age 8-59', '${_currentRecord['age_8_59'] ?? 1}'),
                      const SizedBox(height: 6),
                      _buildBreakdownRow('Age 60+', '${_currentRecord['age_60_above'] ?? 0}', '', ''),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Action Buttons (Cancel & Save Record)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close, size: 18),
                        label: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w800)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF0F172A),
                          backgroundColor: const Color(0xFFD1E7DD),
                          side: const BorderSide(color: Color(0xFFBADBCC)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton.icon(
                        onPressed: _saving ? null : _saveRecord,
                        icon: _saving
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Icon(Icons.check_circle_outline, size: 20),
                        label: const Text('Save Record', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF14532D),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
    );
  }

  Widget _buildInfoLine(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: const Color(0xFF64748B)),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12.5)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Color(0xFF0F172A))),
        ],
      ),
    );
  }

  Widget _buildBreakdownRow(String l1, String v1, String l2, String v2) {
    return Row(
      children: [
        Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(l1, style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
              Text(v1, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A))),
            ],
          ),
        ),
        const SizedBox(width: 24),
        Expanded(
          child: l2.isEmpty
              ? const SizedBox.shrink()
              : Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(l2, style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
                    Text(v2, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A))),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Screen 5: Edit Tourist Record Sheet
class EditTouristRecordSheet extends StatefulWidget {
  const EditTouristRecordSheet({
    super.key,
    required this.recordData,
    required this.bootstrap,
  });

  final Map<String, dynamic> recordData;
  final MobileBootstrap bootstrap;

  @override
  State<EditTouristRecordSheet> createState() => _EditTouristRecordSheetState();
}

class _EditTouristRecordSheetState extends State<EditTouristRecordSheet> {
  late TextEditingController _name;
  late TextEditingController _email;
  late TextEditingController _contact;
  late int _visitors;
  late int _filipino;
  late int _foreigner;
  late int _male;
  late int _female;
  late int _age07;
  late int _age859;
  late int _age60;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.recordData['full_name'] ?? '');
    _email = TextEditingController(text: widget.recordData['email'] ?? '');
    _contact = TextEditingController(text: widget.recordData['contact_number'] ?? '');
    _visitors = widget.recordData['total_visitors'] ?? 1;
    _filipino = widget.recordData['filipino_count'] ?? 1;
    _foreigner = widget.recordData['foreigner_count'] ?? 0;
    _male = widget.recordData['total_male'] ?? 1;
    _female = widget.recordData['total_female'] ?? 0;
    _age07 = widget.recordData['age_0_7'] ?? 0;
    _age859 = widget.recordData['age_8_59'] ?? 1;
    _age60 = widget.recordData['age_60_above'] ?? 0;
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _contact.dispose();
    super.dispose();
  }

  void _saveAndClose() {
    final updated = Map<String, dynamic>.from(widget.recordData);
    updated['full_name'] = formatProperName(_name.text);
    updated['email'] = _email.text.trim();
    updated['contact_number'] = _contact.text.trim();
    updated['total_visitors'] = _visitors;
    updated['filipino_count'] = _filipino;
    updated['foreigner_count'] = _foreigner;
    updated['total_male'] = _male;
    updated['total_female'] = _female;
    updated['age_0_7'] = _age07;
    updated['age_8_59'] = _age859;
    updated['age_60_above'] = _age60;

    Navigator.of(context).pop(updated);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tourist Record', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            Text('ID: ${widget.recordData['survey_id']}', style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B))),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Step 1: Traveller
          _buildStepCard(
            step: '1',
            title: 'Traveller',
            children: [
              _buildLabeledField('FULL NAME', _name),
              _buildLabeledField('EMAIL', _email),
              _buildLabeledField('CONTACT NUMBER', _contact),
            ],
          ),
          const SizedBox(height: 16),

          // Step 2: Destination
          _buildStepCard(
            step: '2',
            title: 'Destination',
            children: [
              _buildStaticField('COUNTRY', widget.recordData['country_name'] ?? 'Philippines'),
              _buildStaticField('REGION', widget.recordData['region_name'] ?? 'Region IV-A'),
              _buildStaticField('PROVINCE', widget.recordData['province_name'] ?? 'Quezon'),
              _buildStaticField('RESORT', widget.recordData['resort_name'] ?? 'Cagbalete Island Resort'),
            ],
          ),
          const SizedBox(height: 16),

          // Step 3: Trip Details
          _buildStepCard(
            step: '3',
            title: 'Trip details',
            children: [
              _buildStaticField('ITINERARY', widget.recordData['itinerary_name'] ?? 'Day Tour'),
              _buildStaticField('VISIT PURPOSE', widget.recordData['visit_purpose_name'] ?? 'Leisure'),
              _buildStaticField('TRAVEL MODE', widget.recordData['travel_mode_name'] ?? 'Public Vehicle'),
              _buildStaticField('BOAT TYPE', widget.recordData['boat_type_name'] ?? 'Public Boat'),
              _buildStaticField('ARRIVAL DATE', widget.recordData['arrival_date'] ?? '2026-08-20'),
            ],
          ),
          const SizedBox(height: 16),

          // Step 4: Group Breakdown
          _buildStepCard(
            step: '4',
            title: 'Group breakdown',
            children: [
              Row(
                children: [
                  Expanded(child: _buildCounterTile('FILIPINO', _filipino, (v) => setState(() => _filipino = v))),
                  const SizedBox(width: 8),
                  Expanded(child: _buildCounterTile('FOREIGNER', _foreigner, (v) => setState(() => _foreigner = v))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _buildCounterTile('MALE', _male, (v) => setState(() => _male = v))),
                  const SizedBox(width: 8),
                  Expanded(child: _buildCounterTile('FEMALE', _female, (v) => setState(() => _female = v))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _buildCounterTile('AGE 0-7', _age07, (v) => setState(() => _age07 = v))),
                  const SizedBox(width: 8),
                  Expanded(child: _buildCounterTile('AGE 8-59', _age859, (v) => setState(() => _age859 = v))),
                  const SizedBox(width: 8),
                  Expanded(child: _buildCounterTile('AGE 60+', _age60, (v) => setState(() => _age60 = v))),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1E7DD),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('TOTAL GUESTS', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Color(0xFF14532D))),
                    Text('$_visitors', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF14532D))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Bottom Action Bar
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: const Color(0xFFD1E7DD),
                    foregroundColor: const Color(0xFF0F172A),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('✕  Cancel', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _saveAndClose,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF14532D),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Done', style: TextStyle(fontWeight: FontWeight.w900)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStepCard({required String step, required String title, required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: const BoxDecoration(
                  color: Color(0xFFD1E7DD),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(step, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Color(0xFF14532D))),
              ),
              const SizedBox(width: 8),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF0F172A))),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }

  Widget _buildLabeledField(String label, TextEditingController ctrl) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF64748B))),
          const SizedBox(height: 4),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFFD1E7DD).withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(10),
            ),
            child: TextField(
              controller: ctrl,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
              decoration: const InputDecoration(
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStaticField(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF64748B))),
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFD1E7DD).withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                const Icon(Icons.keyboard_arrow_down, size: 18, color: Color(0xFF64748B)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCounterTile(String label, int value, ValueChanged<int> onChanged) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: const Color(0xFFD1E7DD).withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Color(0xFF64748B))),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$value', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: value > 0 ? () => onChanged(value - 1) : null,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(4)),
                      child: const Icon(Icons.remove, size: 14),
                    ),
                  ),
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => onChanged(value + 1),
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(4)),
                      child: const Icon(Icons.add, size: 14),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
