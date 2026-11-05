part of '../main.dart';

/// Authorized report locations only; never holds reporter names/contact/body/photos.
class SanitationReportsMap extends StatefulWidget {
  const SanitationReportsMap({super.key, required this.api});
  final TourismApi api;
  @override
  State<SanitationReportsMap> createState() => _SanitationReportsMapState();
}

class _SanitationReportsMapState extends State<SanitationReportsMap> {
  SharedPreferences? _prefs;
  String? _token;
  int _request = 0;
  bool _loading = true;
  String? _error;
  List<SanitationMapReport> _reports = const [];
  int? _selected;

  @override
  void initState() {
    super.initState();
    staffSessionRevision.addListener(_invalidateSession);
    reload();
  }

  void _invalidateSession() {
    if (!mounted) return;
    ++_request;
    setState(() {
      _reports = const [];
      _selected = null;
      _loading = false;
      _token = null;
      _error =
          'Staff session changed. Reload reports under the current account.';
    });
  }

  bool _sameSession() {
    if (_token == null || _prefs?.getString(staffAuthTokenKey) != _token) {
      _invalidateSession();
      return false;
    }
    return true;
  }

  Future<void> reload() async {
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      _reports = const [];
      _selected = null;
    });
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!mounted || request != _request) return;
      _prefs = prefs;
      _token = prefs.getString(staffAuthTokenKey);
      if (_token == null || _token!.isEmpty) {
        throw const ApiException(
          statusCode: 401,
          message: 'Authentication required.',
        );
      }
      final reports = await widget.api.fetchSanitationMapReports(
        expectedSessionToken: _token!,
      );
      if (!mounted || request != _request || !_sameSession()) return;
      setState(() {
        _reports = reports;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || request != _request) return;
      if (_token != null && !_sameSession()) return;
      setState(() {
        _loading = false;
        _reports = const [];
        _selected = null;
        _error = error is FormatException
            ? 'Report data contract unavailable. Reload or check backend compatibility.'
            : error is ApiException
            ? 'Reports unavailable (HTTP ${error.statusCode}).'
            : 'Reports unavailable. Check the connection and retry.';
      });
    }
  }

  @override
  void dispose() {
    ++_request;
    staffSessionRevision.removeListener(_invalidateSession);
    _reports = const [];
    _selected = null;
    super.dispose();
  }

  Color _color(SanitationMapReport report) => switch (report.status) {
    'pending' => AppColors.amber,
    'investigating' => Colors.blue,
    'resolved' => AppColors.green,
    'rejected' => AppColors.muted,
    _ => AppColors.muted,
  };

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Text('Loading reports...'),
      );
    }
    if (_error != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_error!),
          TextButton(onPressed: reload, child: const Text('Retry reports')),
        ],
      );
    }
    final pins = _reports.where((report) => report.canMap).toList();
    final selected = pins.firstWhereOrNull((report) => report.id == _selected);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${_reports.length} reports · ${pins.length} mapped · ${_reports.length - pins.length} unmapped',
        ),
        const Text(
          'Reported locations are not independently GPS-verified. Unknown and approximate locations are not mapped.',
        ),
        TextButton(onPressed: reload, child: const Text('Refresh reports')),
        if (_reports.isEmpty)
          const Text('No community reports found.')
        else ...[
          if (pins.isEmpty) const Text('No eligible report locations.'),
          SanitationOsmMapFrame(
            mapHeight: 360,
            borderRadius: 18,
            map: FlutterMap(
              options: const MapOptions(
                initialCenter: LatLng(14.185, 121.731),
                initialZoom: 12,
                minZoom: 8,
                maxZoom: 18,
              ),
              children: [
                TileLayer(
                  urlTemplate: sanitationOsmTileUrl,
                  userAgentPackageName: sanitationOsmUserAgentPackageName,
                ),
                MarkerLayer(
                  markers: pins
                      .map(
                        (report) => Marker(
                          point: LatLng(report.latitude!, report.longitude!),
                          width: 42,
                          height: 42,
                          child: Semantics(
                            button: true,
                            label: 'Report ${report.reference}',
                            child: GestureDetector(
                              key: ValueKey('report-map-pin-${report.id}'),
                              onTap: () {
                                if (_sameSession()) {
                                  setState(() => _selected = report.id);
                                }
                              },
                              child: MapPin(color: _color(report)),
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ],
        if (selected != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Report: ${selected.reference}'),
                  Text(
                    'Category: ${selected.category.isEmpty ? 'Unavailable' : selected.category}',
                  ),
                  Text('Status: ${selected.statusLabel}'),
                  Text(selected.provenanceLabel),
                  const Text('Location is not independently GPS-verified.'),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
