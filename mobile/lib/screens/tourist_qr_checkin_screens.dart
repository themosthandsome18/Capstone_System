part of '../main.dart';

/// The words of the screen of one's own scans (the log is what THIS account took in, not a list of the resort).
const myCheckInsTitle = 'My Check-ins';
const myCheckInsSearchHint = 'Search by Survey ID or name';
const myCheckInsEmpty = 'No check-ins yet.';
const myCheckInsEmptyHint = 'Visitors you take in will appear here.';
const myCheckInsNoMatch = 'No matching check-ins';
const myCheckInsNoMatchHint = 'Try searching with a different Survey ID or name.';

String myCheckInsCount(int count) => count == 1 ? '1 check-in' : '$count check-ins';

/// Who may use the staff QR scanner. A resort's own staff (role `resort`) now come in beside the tourism office and the admin; every other role is
/// refused at the door. This is the door only: WHICH records a role can reach is decided by the server.
const staffScannerRoles = {'admin', 'tourism', 'resort'};

bool staffMayScan(String? role) => role != null && staffScannerRoles.contains(role);

/// The two refusals of the server that a resort's staff can meet, said as they are: not as a general error.
const notYourResortMessage = 'This booking is not for your resort.';
const notLinkedMessage = 'This account is not linked to a resort.';
const notLinkedHint = 'Ask the tourism office to link your account.';

/// The sentence to show for one of those two refusals, or null when [error] is anything else (the callers then say what they always said).
String? staffRefusalMessage(Object error) {
  if (error is! ApiException) return null;
  if (error.message.contains(notLinkedMessage)) return '$notLinkedMessage\n$notLinkedHint';
  if (error.message.contains(notYourResortMessage)) return notYourResortMessage;
  return null;
}

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
    if (token != null && token.isNotEmpty && staffMayScan(role)) {
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

      if (!staffMayScan(role)) {
        setState(() {
          _loading = false;
          _errorMessage =
              'Access restricted to Resort/Tourism Staff or Administrators only. Your account role is "$role".';
        });
        return;
      }

      final prefs = await SharedPreferences.getInstance();
      await setStaffSessionToken(prefs, token);
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
        await setStaffSessionToken(prefs, null);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      final refusal = staffRefusalMessage(e);
      if (refusal != null) {
        showAppMessage(context, refusal);
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
      await setStaffSessionToken(prefs, null);
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
        await setStaffSessionToken(prefs, null);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      final refusal = staffRefusalMessage(e);
      if (refusal != null) {
        showAppMessage(context, refusal);
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

              // Button 2: My Check-ins
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
                    myCheckInsTitle,
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

/// Screen 3: My Check-ins (the visitors THIS account took in; the whole list of arrivals is Arrival Monitoring on the web)
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
      return const TouristStatusChip('Cancelled', Color(0xFFFEE2E2), Color(0xFF991B1B));
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
        await setStaffSessionToken(prefs, null);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      final refusal = staffRefusalMessage(e);
      if (refusal != null) {
        showAppMessage(context, refusal);
      } else if (e is ApiException && e.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to view your check-ins.",
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
      return name.contains(q) || id.contains(q);
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
              myCheckInsTitle,
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
            Text(
              myCheckInsCount(filtered.length),
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
                    hintText: myCheckInsSearchHint,
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
                                  _search.text.isNotEmpty ? myCheckInsNoMatch : myCheckInsEmpty,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 17,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _search.text.isNotEmpty ? myCheckInsNoMatchHint : myCheckInsEmptyHint,
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
    setState(() => _saving = true);

    try {
      // The arrival, and nothing else: the card is read-only (the visitor paid before arriving, and the count they paid for is already in the record),
      // so no count and no other field is sent. The server sets the status and records who received the visitor.
      await widget.api.checkInTouristRecord({
        'survey_id': _currentRecord['survey_id'],
        'status': 'arrived',
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
                Expanded(child: Text('Verified & Recorded', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18))),
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
        await setStaffSessionToken(prefs, null);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        Navigator.of(context).pop();
        showAppMessage(context, 'Your session expired, please sign in again.');
        return;
      }
      final refusal = staffRefusalMessage(e);
      if (refusal != null) {
        showAppMessage(context, refusal);
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
                    Expanded(
                    child: Column(
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
                    ),
                    const SizedBox(width: 12),
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
                                Flexible(
                                  child: Text(
                                    'ARRIVAL DATE',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: context.brand.dark),
                                  ),
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
                                Flexible(
                                  child: Text(
                                    'TOTAL GUESTS',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: context.brand.dark),
                                  ),
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
                const Text('TRIP DETAILS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Color(0xFF0F172A))),
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
                      _buildBreakdownRow('Filipino', presentCount(_currentRecord['filipino_count']), 'Foreigner', presentCount(_currentRecord['foreigner_count']), subValue: _maubaninOfFilipino()),
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

                // Action Buttons (Cancel & Check in)
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
                        label: const Text('Check in', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
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

  /// One line of the record. Every label has the SAME width and every value starts at the same left edge, so the values of a group stand on one
  /// vertical line; a long value wraps down inside its own column (it is never cut, and it cannot run out of the screen).
  Widget _buildInfoLine(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 16, color: const Color(0xFF64748B)),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: recordLabelWidth,
            child: Text(label, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12.5)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.start,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Color(0xFF0F172A)),
            ),
          ),
        ],
      ),
    );
  }

  /// How many of the Filipino are Maubanin. They are a PART of the Filipino count, never added to it and never more than it; null when the record
  /// has no Filipino count or no Maubanin count (the line is then not drawn).
  int? _maubaninOfFilipino() {
    final filipino = presentCount(_currentRecord['filipino_count']);
    final maubanin = presentCount(_currentRecord['maubanin_count']);
    if (filipino == null || maubanin == null) return null;
    return math.min(math.max(maubanin, 0), filipino);
  }

  /// One row of two counts. A count that is not in the record is not shown
  /// (no 1, no 0, no dash); a row with neither takes no room. In each half the
  /// label has one width and the number starts at one left edge, so the numbers
  /// of a column stand on one vertical line.
  ///
  /// [subValue], when given, is a quiet line under the LEFT count ("Maubanin", a part of it); it is not a count of its own.
  Widget _buildBreakdownRow(String l1, int? v1, String l2, int? v2, {int? subValue}) {
    final hasLeft = v1 != null;
    final hasRight = l2.isNotEmpty && v2 != null;
    if (!hasLeft && !hasRight) return const SizedBox.shrink();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: !hasLeft
              ? const SizedBox.shrink()
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _breakdownCell(l1, v1),
                    if (subValue != null) _breakdownSubCell('Maubanin', subValue),
                  ],
                ),
        ),
        const SizedBox(width: 16),
        Expanded(child: !hasRight ? const SizedBox.shrink() : _breakdownCell(l2, v2)),
      ],
    );
  }

  /// "Maubanin 4" under "Filipino": indented, smaller, lighter and not bold, so it reads as a part of the Filipino count and not as a count beside it.
  /// Its number starts where the number of the line above starts.
  Widget _breakdownSubCell(String label, int value) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(width: breakdownSubIndent),
          SizedBox(
            width: breakdownLabelWidth - breakdownSubIndent,
            child: Text(label, style: const TextStyle(fontSize: breakdownSubLabelSize, color: breakdownSubColor)),
          ),
          Expanded(
            child: Text(
              '$value',
              key: ValueKey('count-$label'),
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: breakdownSubValueSize, color: breakdownSubColor),
            ),
          ),
        ],
      ),
    );
  }

  Widget _breakdownCell(String label, int value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: breakdownLabelWidth,
          child: Text(label, style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
        ),
        Expanded(
          child: Text(
            '$value',
            key: ValueKey('count-$label'),
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F172A)),
          ),
        ),
      ],
    );
  }
}

/// The width of the label column of the record card, and of a count label in the visitor breakdown: ONE width each, so the values stand on one line.
const double recordLabelWidth = 118;
const double breakdownLabelWidth = 72;

/// The "Maubanin" line under "Filipino": indented, smaller than a count label (12.5) and a count (13), and lighter than both.
const double breakdownSubIndent = 12;
const double breakdownSubLabelSize = 11;
const double breakdownSubValueSize = 11.5;
const Color breakdownSubColor = Color(0xFF64748B);
