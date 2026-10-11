part of '../main.dart';

/// Opens the Resort Staff QR Portal protected by Staff Authentication
Future<void> openStaffQrPortalWithAuth(
  BuildContext context, {
  required TourismApi api,
  required MobileBootstrap bootstrap,
}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(staffAuthTokenKey);
    final role = prefs.getString(staffAuthRoleKey);
    if (token != null && token.isNotEmpty && (role == 'admin' || role == 'tourism')) {
      if (!context.mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => TouristQrCheckInScreen(
            api: api,
            bootstrap: bootstrap,
          ),
        ),
      );
      return;
    }
  } catch (_) {}

  if (!context.mounted) return;
  showDialog(
    context: context,
    builder: (context) => StaffAuthGateDialog(
      api: api,
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

/// Security Gate Modal for Resort Staff Authentication
class StaffAuthGateDialog extends StatefulWidget {
  const StaffAuthGateDialog({
    super.key,
    required this.onAuthenticated,
    this.api = const TourismApi(),
  });

  final VoidCallback onAuthenticated;
  final TourismApi api;

  @override
  State<StaffAuthGateDialog> createState() => _StaffAuthGateDialogState();
}

class _StaffAuthGateDialogState extends State<StaffAuthGateDialog> {
  final TextEditingController _usernameController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  String? _errorMessage;
  bool _obscure = true;
  bool _loading = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _verifyLogin() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    if (username.isEmpty || password.isEmpty) {
      setState(() {
        _errorMessage = 'Please enter both username and password.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final res = await widget.api.login(username: username, password: password);
      final token = res['token'] as String?;
      final userObj = res['user'] as Map<String, dynamic>? ?? {};
      final profileObj = userObj['profile'] as Map<String, dynamic>? ?? {};
      final role = profileObj['role'] as String? ?? '';
      final userDisplay = userObj['display_name'] ?? username;

      if (token == null || token.isEmpty) {
        throw Exception('No authentication token returned by server.');
      }

      if (role != 'admin' && role != 'tourism') {
        setState(() {
          _loading = false;
          _errorMessage =
              'Access restricted to Resort/Tourism Staff or Administrators only. Your account role is "$role".';
        });
        return;
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(staffAuthTokenKey, token);
      await prefs.setString(staffAuthRoleKey, role);
      await prefs.setString(staffAuthUsernameKey, username);

      if (!mounted) return;
      Navigator.of(context).pop();
      showAppMessage(context, 'Signed in as $userDisplay ($role).');
      widget.onAuthenticated();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorMessage = conciseError(e);
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
              color: context.brand.dark.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.shield_outlined, color: context.brand.dark, size: 24),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Resort Staff Authentication',
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
              'Sign in with your resort staff or clerk credentials to access the QR check-in scanner.',
              style: TextStyle(fontSize: 13, color: Color(0xFF475569), height: 1.4),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _usernameController,
              decoration: InputDecoration(
                labelText: 'Username',
                prefixIcon: const Icon(Icons.person_outline),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passwordController,
              obscureText: _obscure,
              onSubmitted: (_) => _verifyLogin(),
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility, color: const Color(0xFF64748B)),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 10),
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
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel / I am a Tourist', style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w700)),
        ),
        FilledButton(
          onPressed: _loading ? null : _verifyLogin,
          style: FilledButton.styleFrom(
            backgroundColor: context.brand.dark,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: _loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Sign In & Unlock Scanner', style: TextStyle(fontWeight: FontWeight.w900)),
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
  bool _exporting = false;

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
      if (!mounted) return;
      if (e is ApiException && e.isUnauthorized) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      if (e is ApiException && e.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to access visitor records.",
        );
        return;
      }
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

  Future<void> _handleSignOut() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Sign Out Staff', style: TextStyle(fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to sign out of the Staff QR Portal?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
    if (confirm == true) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(staffAuthTokenKey);
      await prefs.remove(staffAuthRoleKey);
      await prefs.remove(staffAuthUsernameKey);
      if (mounted) {
        Navigator.of(context).pop();
        showAppMessage(context, 'Signed out of staff mode.');
      }
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

  Future<void> _handleExportRecords() async {
    if (_exporting) return;
    setState(() => _exporting = true);

    try {
      final records = await widget.api.fetchTouristRecordHistory();
      if (!mounted) return;

      if (records.isEmpty) {
        setState(() => _exporting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.info_outline, color: Colors.white),
                SizedBox(width: 10),
                Expanded(child: Text('No tourist arrival records found to export.')),
              ],
            ),
            backgroundColor: const Color(0xFF0F172A),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        return;
      }

      final csvData = buildTouristArrivalsCsv(records);
      final dateStr = DateTime.now().toIso8601String().split('T').first;
      final result = await exportAndShareText(
        content: csvData,
        fileName: 'mauban_tourist_arrivals_$dateStr.csv',
        mimeType: 'text/csv;charset=utf-8',
        subject: 'Mauban Tourist Arrivals - $dateStr',
        text: 'Exported ${records.length} tourism arrival record(s) from LGU Mauban Tourism.',
      );

      if (!mounted) return;
      setState(() => _exporting = false);

      if (result.status == ShareResultStatus.success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(kIsWeb
                      ? 'Exported and downloaded ${records.length} arrival record(s) to CSV!'
                      : 'Exported and shared ${records.length} arrival record(s)!'),
                ),
              ],
            ),
            backgroundColor: context.brand.dark,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _exporting = false);

      if (e is ApiException && e.isUnauthorized) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      if (e is ApiException && e.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to export visitor records.",
        );
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.error_outline, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(child: Text('Failed to export records: ${conciseError(e)}')),
            ],
          ),
          backgroundColor: const Color(0xFFDC2626),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
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
      backgroundColor: context.brand.light,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: context.brand.dark,
        title: const Text(
          'Tourist Qr Check-In',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign Out Staff',
            onPressed: _handleSignOut,
          ),
        ],
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
                  color: context.brand.tint,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: context.brand.emerald.withValues(alpha: 0.15),
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
                          backgroundColor: context.brand.dark,
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
                    backgroundColor: context.brand.dark,
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
                    backgroundColor: context.brand.tintStrong,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(color: context.brand.borderAlt),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Button 3: Export / Download Records
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _exporting ? null : _handleExportRecords,
                  icon: _exporting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF0F172A),
                          ),
                        )
                      : const Icon(Icons.download, size: 20, color: Color(0xFF0F172A)),
                  label: Text(
                    _exporting ? 'Exporting Records...' : 'Export / Download Records',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: context.brand.tintStrong.withValues(alpha: 0.6),
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    side: BorderSide(color: context.brand.borderAlt),
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
/// How a booking status is shown in the history list.
class TouristStatusChip {
  const TouristStatusChip(this.label, this.background, this.foreground);

  final String label;
  final Color background;
  final Color foreground;
}

/// The chip for a booking status, or null when there is none to show. A record
/// with no status (or one the app does not know) gets no chip: staff are never
/// shown "Pending" for a record that is not known to be pending.
TouristStatusChip? touristStatusChip(String? status) {
  switch (status) {
    case 'arrived':
      return const TouristStatusChip('Arrived', Color(0xFFDCFCE7), Color(0xFF166534));
    case 'pending':
      return const TouristStatusChip('Pending', Color(0xFFFEF3C7), Color(0xFF92400E));
    case 'no_show':
      return const TouristStatusChip('No-show', Color(0xFFFEE2E2), Color(0xFF991B1B));
    default:
      return null;
  }
}

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
  bool _exporting = false;

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
    } catch (e) {
      if (!mounted) return;
      if (e is ApiException && e.isUnauthorized) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      if (e is ApiException && e.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to view tourist history.",
        );
      }
      if (mounted) {
        setState(() {
          _records = [];
          _loading = false;
        });
      }
    }
  }

  Future<void> _handleExportHistory(List<Map<String, dynamic>> recordsToExport) async {
    if (_exporting) return;

    if (recordsToExport.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.info_outline, color: Colors.white),
              SizedBox(width: 10),
              Expanded(child: Text('No records to export in the current view.')),
            ],
          ),
          backgroundColor: const Color(0xFF0F172A),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _exporting = true);

    try {
      final csvData = buildTouristArrivalsCsv(recordsToExport);
      final dateStr = DateTime.now().toIso8601String().split('T').first;
      final result = await exportAndShareText(
        content: csvData,
        fileName: 'mauban_tourist_arrivals_$dateStr.csv',
        mimeType: 'text/csv;charset=utf-8',
        subject: 'Mauban Tourist Arrivals - $dateStr',
        text: 'Exported ${recordsToExport.length} tourism arrival record(s) from LGU Mauban Tourism.',
      );

      if (!mounted) return;
      setState(() => _exporting = false);

      if (result.status == ShareResultStatus.success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(kIsWeb
                      ? 'Exported and downloaded ${recordsToExport.length} record(s) to CSV!'
                      : 'Exported and shared ${recordsToExport.length} record(s) to CSV!'),
                ),
              ],
            ),
            backgroundColor: context.brand.dark,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _exporting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.error_outline, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(child: Text('Failed to export history: ${conciseError(e)}')),
            ],
          ),
          backgroundColor: const Color(0xFFDC2626),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
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
      backgroundColor: context.brand.light,
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
              onPressed: _exporting ? null : () => _handleExportHistory(filtered),
              icon: _exporting
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.download, size: 16),
              label: Text(
                _exporting ? 'Exporting...' : 'Export',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: context.brand.dark,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchHistory,
        color: context.brand.dark,
        child: Column(
          children: [
            // Search Input Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Container(
                decoration: BoxDecoration(
                  color: context.brand.tintStrong,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search by Survey ID, name, or resort',
                    hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13.5),
                    prefixIcon: Icon(Icons.search, color: context.brand.dark),
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
                  ? Center(
                      child: CircularProgressIndicator(color: context.brand.dark),
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
                                    color: context.brand.tintStrong,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    Icons.receipt_long_outlined,
                                    size: 38,
                                    color: context.brand.dark,
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
                            final status = presentText(item['status'])?.toLowerCase();
                            final isArrived = status == 'arrived';
                            // A chip only for a status the record actually has.
                            final chip = touristStatusChip(status);

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
                                                  formatProperName(presentText(item['full_name'])),
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w900,
                                                    fontSize: 15,
                                                    color: Color(0xFF0F172A),
                                                  ),
                                                ),
                                              ),
                                              if (chip != null)
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: chip.background,
                                                  borderRadius: BorderRadius.circular(999),
                                                ),
                                                child: Text(
                                                  chip.label,
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.w900,
                                                    color: chip.foreground,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            [
                                              presentText(item['survey_id']),
                                              presentText(item['resort_name']),
                                            ].whereType<String>().join(' • '),
                                            style: const TextStyle(
                                              fontSize: 12.5,
                                              color: Color(0xFF64748B),
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            [
                                              presentText(item['arrival_date']),
                                              if (presentCount(item['total_visitors']) != null)
                                                '${presentCount(item['total_visitors'])} Pax',
                                            ].whereType<String>().join(' • '),
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
    // A count that is not in the record is never sent as a made-up number.
    final missing = [
      for (final (key, label) in touristRecordCounts)
        if (presentCount(_currentRecord[key]) == null) label,
    ];
    if (missing.isNotEmpty) {
      showAppMessage(context, missingCountsMessage(missing));
      return;
    }
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
              'Tourist ${[
                presentText(_currentRecord['full_name']),
                if (presentText(_currentRecord['survey_id']) != null)
                  '(${presentText(_currentRecord['survey_id'])})',
              ].join(' ')} has been successfully checked in and recorded into the Tourism Admin System.',
              style: const TextStyle(height: 1.4),
            ),
            actions: [
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: context.brand.dark),
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
      if (!mounted) return;
      if (e is ApiException && e.isUnauthorized) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      if (e is ApiException && e.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to check in tourists.",
        );
        return;
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: ${conciseError(e)}')),
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
    final name = formatProperName(presentText(_currentRecord['full_name']));
    // Places and trip details come from the record or are not shown: a made-up
    // region, resort or itinerary on a check-in card is worse than no line.
    final country = presentText(_currentRecord['country_name']);
    final resort = presentText(_currentRecord['resort_name']);
    final regionProvince = [
      presentText(_currentRecord['region_name']),
      presentText(_currentRecord['province_name']),
    ].whereType<String>().join(', ');
    final itinerary = presentText(_currentRecord['itinerary_name']);
    final travelMode = presentText(_currentRecord['travel_mode_name']);
    final boatType = presentText(_currentRecord['boat_type_name']);
    final visitPurpose = presentText(_currentRecord['visit_purpose_name']);
    final email = _currentRecord['email'] ?? 'Not provided';
    final surveyId = presentText(_currentRecord['survey_id']);
    final contact = presentText(_currentRecord['contact_number']);
    final arrival = presentText(_currentRecord['arrival_date']);
    final totalVisitors = presentCount(_currentRecord['total_visitors']);

    return Scaffold(
      backgroundColor: context.brand.page,
      appBar: AppBar(
        backgroundColor: context.brand.dark,
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
            decoration: BoxDecoration(
              color: context.brand.dark,
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
                        if (surveyId != null)
                        Text(
                          'RECORD ID',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                            color: context.brand.onDark,
                          ),
                        ),
                        if (surveyId != null)
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
                        color: context.brand.emerald,
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
                            style: TextStyle(
                              color: context.brand.onDark,
                              fontSize: 12.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // Mini QR Preview Box (only for a record that has an ID to encode)
                if (surveyId != null)
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
                    if (arrival != null)
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: context.brand.tintStrong,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: context.brand.borderAlt),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.calendar_today_outlined, size: 14, color: context.brand.dark),
                                SizedBox(width: 6),
                                Text(
                                  'ARRIVAL DATE',
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: context.brand.dark),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              arrival,
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Color(0xFF0F172A)),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (arrival != null && totalVisitors != null)
                    const SizedBox(width: 12),
                    if (totalVisitors != null)
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: context.brand.tintStrong,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: context.brand.borderAlt),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.people_outline, size: 16, color: context.brand.dark),
                                SizedBox(width: 6),
                                Text(
                                  'TOTAL GUESTS',
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: context.brand.dark),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$totalVisitors Visitors',
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
                if (contact != null) _buildInfoLine(Icons.phone_outlined, 'Contact', contact),
                if (country != null) _buildInfoLine(Icons.public, 'Country', country),
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
                          color: context.brand.tintStrong,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.edit, size: 12, color: context.brand.dark),
                            SizedBox(width: 4),
                            Text('Edit Info', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: context.brand.dark)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (resort != null) _buildInfoLine(Icons.place_outlined, 'Resort', resort),
                if (regionProvince.isNotEmpty) _buildInfoLine(Icons.explore_outlined, 'Region / Province', regionProvince),
                if (itinerary != null) _buildInfoLine(Icons.navigation_outlined, 'Itinerary', itinerary),
                if (travelMode != null) _buildInfoLine(Icons.directions_bus_outlined, 'Travel Mode', travelMode),
                if (boatType != null) _buildInfoLine(Icons.directions_boat_outlined, 'Boat Type', boatType),
                if (visitPurpose != null) _buildInfoLine(Icons.flag_outlined, 'Visit Purpose', visitPurpose),
                const Divider(height: 28),

                // VISITOR BREAKDOWN
                const Text('VISITOR BREAKDOWN', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Color(0xFF0F172A))),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: context.brand.tintStrong.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      _buildBreakdownRow('Filipino', presentCount(_currentRecord['filipino_count']), 'Foreigner', presentCount(_currentRecord['foreigner_count'])),
                      const SizedBox(height: 6),
                      _buildBreakdownRow('Male', presentCount(_currentRecord['total_male']), 'Female', presentCount(_currentRecord['total_female'])),
                      const Divider(height: 16),
                      _buildBreakdownRow('Age 0-7', presentCount(_currentRecord['age_0_7']), 'Age 8-59', presentCount(_currentRecord['age_8_59'])),
                      const SizedBox(height: 6),
                      _buildBreakdownRow('Age 60+', presentCount(_currentRecord['age_60_above']), '', null),
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
                          backgroundColor: context.brand.tintStrong,
                          side: BorderSide(color: context.brand.borderAlt),
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
                          backgroundColor: context.brand.dark,
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

  /// One row of two counts. A count that is not in the record is not shown
  /// (no 1, no 0, no dash); a row with neither takes no room.
  Widget _buildBreakdownRow(String l1, int? v1, String l2, int? v2) {
    final hasLeft = v1 != null;
    final hasRight = l2.isNotEmpty && v2 != null;
    if (!hasLeft && !hasRight) return const SizedBox.shrink();
    return Row(
      children: [
        Expanded(
          child: !hasLeft
              ? const SizedBox.shrink()
              : Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(l1, style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
                    Text('$v1', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A))),
                  ],
                ),
        ),
        const SizedBox(width: 24),
        Expanded(
          child: !hasRight
              ? const SizedBox.shrink()
              : Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(l2, style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
                    Text('$v2', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A))),
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
  // null = not in the record. Never defaulted: a made-up 1 could be saved
  // as the real number of visitors.
  int? _visitors;
  int? _filipino;
  int? _foreigner;
  int? _male;
  int? _female;
  int? _age07;
  int? _age859;
  int? _age60;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.recordData['full_name'] ?? '');
    _email = TextEditingController(text: widget.recordData['email'] ?? '');
    _contact = TextEditingController(text: widget.recordData['contact_number'] ?? '');
    _visitors = presentCount(widget.recordData['total_visitors']);
    _filipino = presentCount(widget.recordData['filipino_count']);
    _foreigner = presentCount(widget.recordData['foreigner_count']);
    _male = presentCount(widget.recordData['total_male']);
    _female = presentCount(widget.recordData['total_female']);
    _age07 = presentCount(widget.recordData['age_0_7']);
    _age859 = presentCount(widget.recordData['age_8_59']);
    _age60 = presentCount(widget.recordData['age_60_above']);
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _contact.dispose();
    super.dispose();
  }

  /// The counts that are still empty, by the name staff see. A required count
  /// is never saved empty (and never defaulted to 0: 0 is a real value).
  bool get _totalWasMissing => presentCount(widget.recordData['total_visitors']) == null;

  List<String> get _missingCounts => [
    if (_visitors == null) 'Total guests',
    if (_filipino == null) 'Filipino',
    if (_foreigner == null) 'Foreigner',
    if (_male == null) 'Male',
    if (_female == null) 'Female',
    if (_age07 == null) 'Age 0-7',
    if (_age859 == null) 'Age 8-59',
    if (_age60 == null) 'Age 60+',
  ];

  void _saveAndClose() {
    final missing = _missingCounts;
    if (missing.isNotEmpty) {
      showAppMessage(context, missingCountsMessage(missing));
      return;
    }
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
              if (presentText(widget.recordData['country_name']) != null)
                _buildStaticField('COUNTRY', presentText(widget.recordData['country_name'])!),
              if (presentText(widget.recordData['region_name']) != null)
                _buildStaticField('REGION', presentText(widget.recordData['region_name'])!),
              if (presentText(widget.recordData['province_name']) != null)
                _buildStaticField('PROVINCE', presentText(widget.recordData['province_name'])!),
              if (presentText(widget.recordData['resort_name']) != null)
                _buildStaticField('RESORT', presentText(widget.recordData['resort_name'])!),
            ],
          ),
          const SizedBox(height: 16),

          // Step 3: Trip Details
          _buildStepCard(
            step: '3',
            title: 'Trip details',
            children: [
              if (presentText(widget.recordData['itinerary_name']) != null)
                _buildStaticField('ITINERARY', presentText(widget.recordData['itinerary_name'])!),
              if (presentText(widget.recordData['visit_purpose_name']) != null)
                _buildStaticField('VISIT PURPOSE', presentText(widget.recordData['visit_purpose_name'])!),
              if (presentText(widget.recordData['travel_mode_name']) != null)
                _buildStaticField('TRAVEL MODE', presentText(widget.recordData['travel_mode_name'])!),
              if (presentText(widget.recordData['boat_type_name']) != null)
                _buildStaticField('BOAT TYPE', presentText(widget.recordData['boat_type_name'])!),
              if (presentText(widget.recordData['arrival_date']) != null)
                _buildStaticField('ARRIVAL DATE', presentText(widget.recordData['arrival_date'])!),
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
              // A total that is not in the record is typed in, not made up.
              if (_totalWasMissing)
                _buildCounterTile('TOTAL GUESTS', _visitors, (v) => setState(() => _visitors = v))
              else
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: context.brand.tintStrong,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('TOTAL GUESTS', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: context.brand.dark)),
                    Text(_visitors == null ? '' : '$_visitors', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: context.brand.dark)),
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
                    backgroundColor: context.brand.tintStrong,
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
                    backgroundColor: context.brand.dark,
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
                decoration: BoxDecoration(
                  color: context.brand.tintStrong,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(step, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: context.brand.dark)),
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
              color: context.brand.tintStrong.withValues(alpha: 0.5),
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
              color: context.brand.tintStrong.withValues(alpha: 0.5),
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

  Widget _buildCounterTile(String label, int? current, ValueChanged<int> onChanged) {
    final value = current ?? 0;
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: context.brand.tintStrong.withValues(alpha: 0.5),
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
              Text(current == null ? '' : '$value', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
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
