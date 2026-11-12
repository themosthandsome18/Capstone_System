part of '../main.dart';

LatLng? sanitationCoordinatePair(String latitude, String longitude) {
  final lat = double.tryParse(latitude.trim());
  final lng = double.tryParse(longitude.trim());
  if (lat == null ||
      lng == null ||
      !lat.isFinite ||
      !lng.isFinite ||
      lat.abs() > 90 ||
      lng.abs() > 180) {
    return null;
  }
  return LatLng(lat, lng);
}

class SanitationLocationDetails {
  const SanitationLocationDetails({
    this.source = 'unknown',
    this.accuracy,
    this.capturedAt,
    this.reportedMock,
  });
  final String source;
  final double? accuracy;
  final DateTime? capturedAt;
  final bool? reportedMock;

  factory SanitationLocationDetails.fromJson(Map<String, dynamic> json) =>
      SanitationLocationDetails(
        source: '${json['location_source'] ?? 'unknown'}',
        accuracy: json['location_accuracy_m'] is num
            ? (json['location_accuracy_m'] as num).toDouble()
            : null,
        capturedAt: DateTime.tryParse('${json['location_captured_at'] ?? ''}'),
        reportedMock: json['location_reported_mock'] is bool
            ? json['location_reported_mock'] as bool
            : null,
      );

  factory SanitationLocationDetails.fromPosition(Position position) {
    if (sanitationCoordinatePair(
              '${position.latitude}',
              '${position.longitude}',
            ) ==
            null ||
        !position.accuracy.isFinite ||
        position.accuracy < 0) {
      throw const FormatException(
        'The device returned an unusable location fix.',
      );
    }
    return SanitationLocationDetails(
      source: 'device_reported',
      accuracy: position.accuracy,
      capturedAt: position.timestamp.toUtc(),
      reportedMock: position.isMocked,
    );
  }

  Map<String, dynamic> get capture => source == 'device_reported'
      ? {
          'method': source,
          'accuracy_m': accuracy,
          'captured_at': capturedAt!.toUtc().toIso8601String(),
          'reported_mock': reportedMock,
        }
      : {'method': 'manual'};

  String get description {
    final label = switch (source) {
      'device_reported' => 'Device-reported location',
      'manual' => 'Manual location',
      _ => 'Location source unknown',
    };
    return [
      label,
      if (source == 'device_reported' && accuracy != null)
        'Reported accuracy ${accuracy!} m',
      if (source == 'device_reported' && capturedAt != null)
        'Captured ${capturedAt!.toUtc().toIso8601String()} (UTC)',
      if (source == 'device_reported')
        switch (reportedMock) {
          true => 'Device reports a mocked location',
          false => 'Device reports mock location false',
          null => 'Mock-location status unavailable',
        },
    ].join('\n');
  }
}

class SanitationLocationException implements Exception {
  const SanitationLocationException(this.message);
  final String message;
  @override
  String toString() => message;
}

Future<Position> captureSanitationPosition(
  HouseholdLocationAdapter adapter,
) async {
  if (!await adapter.isLocationServiceEnabled()) {
    throw const SanitationLocationException(
      'Location services are off. Turn them on, then tap Use GPS again.',
    );
  }
  var permission = await adapter.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await adapter.requestPermission();
  }
  if (permission == LocationPermission.deniedForever) {
    throw const SanitationLocationException(
      'Location permission is blocked. Enable it in app settings, then tap Use GPS again.',
    );
  }
  if (permission == LocationPermission.denied) {
    throw const SanitationLocationException(
      'Location permission was denied. Allow location access, then tap Use GPS again.',
    );
  }
  if (permission != LocationPermission.always &&
      permission != LocationPermission.whileInUse) {
    throw const SanitationLocationException(
      'Could not get your GPS location. Check location services and try again.',
    );
  }
  return adapter.getCurrentPosition();
}

class SanitationSitioChoice {
  const SanitationSitioChoice(this.id, this.name, this.barangayId);
  final int id;
  final String name;
  final int barangayId;
}

/// Keeps untouched legacy text/reference values out of differential PATCHes.
class SanitationSitioSelection extends ChangeNotifier {
  SanitationSitioSelection({
    required this.api,
    required this.barangays,
    required this.barangay,
    this.reference,
    this.text = '',
    this.source = 'unknown',
  });
  final TourismApi api;
  final List<BarangayItem> barangays;
  String barangay;
  int? reference;
  String text;
  String source;
  bool dirty = false;
  bool manual = false;
  bool loading = false;
  String? error;
  List<SanitationSitioChoice> choices = const [];
  int _generation = 0;
  bool _disposed = false;

  Future<void> load(String token) async {
    final generation = ++_generation;
    final matches = barangays
        .where((item) => item.name == barangay && item.id > 0)
        .toList();
    loading = true;
    error = null;
    choices = const [];
    notifyListeners();
    try {
      if (identical(barangays, sanitationBarangayFallback) ||
          matches.length != 1) {
        throw StateError(
          'Barangay reference is unavailable. Refresh records to retry.',
        );
      }
      final rows = await api.fetchSanitationSitios(
        matches.single.id,
        expectedSessionToken: token,
      );
      if (_disposed || generation != _generation) return;
      choices = rows;
    } catch (failure) {
      if (_disposed || generation != _generation) return;
      error = conciseError(failure);
    }
    if (_disposed || generation != _generation) return;
    loading = false;
    notifyListeners();
  }

  void changeBarangay(String name, String token) {
    if (name == barangay) return;
    barangay = name;
    reference = null;
    text = '';
    source = 'unknown';
    manual = false;
    dirty = true;
    unawaited(load(token));
  }

  void select(String value) {
    if (value == 'saved') return;
    manual = value == 'manual';
    reference = null;
    text = '';
    source = manual ? 'manual' : 'unknown';
    if (value.startsWith('id-')) {
      final choice = choices.singleWhere((item) => 'id-${item.id}' == value);
      reference = choice.id;
      text = choice.name;
      source = 'configured';
    }
    dirty = true;
    notifyListeners();
  }

  void enterText(String value) {
    text = value;
    reference = null;
    source = value.isEmpty ? 'unknown' : 'manual';
    dirty = true;
  }

  String? get validationError {
    if (text.length > 120) return 'Sitio must be 120 characters or fewer.';
    if (dirty &&
        reference != null &&
        (loading ||
            error != null ||
            !choices.any(
              (item) => item.id == reference && item.name == text,
            ))) {
      return 'Reload and choose a Sitio belonging to this Barangay.';
    }
    return null;
  }

  Map<String, dynamic> get changes =>
      dirty ? {'sitio_reference': reference, 'sitio': text} : const {};

  void invalidate() {
    _generation++;
    reference = null;
    text = '';
    barangay = '';
    source = 'unknown';
    choices = const [];
    manual = false;
    dirty = false;
    loading = false;
    error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}

class SanitationSitioField extends StatelessWidget {
  const SanitationSitioField({
    super.key,
    required this.selection,
    required this.onRetry,
  });
  final SanitationSitioSelection selection;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: selection,
    builder: (context, _) {
      final listed = selection.choices.any(
        (item) => item.id == selection.reference,
      );
      final saved =
          !selection.dirty &&
          (selection.reference != null || selection.text.isNotEmpty);
      final value = selection.manual
          ? 'manual'
          : listed
          ? 'id-${selection.reference}'
          : saved
          ? 'saved'
          : '';
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DropdownTile<String>(
            label: 'Sitio (optional)',
            value: value,
            items: [
              '',
              if (saved && !listed) 'saved',
              for (final choice in selection.choices) 'id-${choice.id}',
              'manual',
            ],
            itemLabel: (item) {
              if (item == '') return 'No Sitio selected';
              if (item == 'manual') return 'Sitio not listed';
              if (item == 'saved') return 'Saved Sitio - ${selection.text}';
              return selection.choices
                  .singleWhere((choice) => 'id-${choice.id}' == item)
                  .name;
            },
            onChanged: selection.select,
          ),
          if (saved && !listed)
            Text(
              'Saved Sitio retained (${selection.source})\n${selection.text}',
            ),
          if (selection.loading) const Text('Loading Sitios...'),
          if (selection.error != null) ...[
            Text('Sitios could not be loaded. ${selection.error}'),
            TextButton(onPressed: onRetry, child: const Text('Retry Sitios')),
          ],
          if (!selection.loading &&
              selection.error == null &&
              selection.choices.isEmpty)
            const Text('No Sitios configured for this Barangay'),
          if (selection.manual)
            TextFormField(
              key: ValueKey('manual-sitio-${selection.barangay}'),
              initialValue: selection.text,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Manual Sitio'),
              onChanged: selection.enterText,
            ),
        ],
      );
    },
  );
}

/// A narrow PATCH editor also repairs legacy households that the full survey
/// cannot represent safely. It never resubmits survey/inspection/photo fields.
class SavedSanitationLocationPage extends StatefulWidget {
  const SavedSanitationLocationPage({
    super.key,
    required this.api,
    required this.recordId,
    required this.household,
    required this.barangays,
    this.locationAdapter = const HouseholdLocationAdapter(),
  });
  final TourismApi api;
  final int recordId;
  final bool household;
  final List<BarangayItem> barangays;
  final HouseholdLocationAdapter locationAdapter;

  @override
  State<SavedSanitationLocationPage> createState() =>
      _SavedSanitationLocationPageState();
}

class _SavedSanitationLocationPageState
    extends State<SavedSanitationLocationPage> {
  final _latitude = TextEditingController();
  final _longitude = TextEditingController();
  SharedPreferences? _prefs;
  String? _token;
  final int _revision = staffSessionRevision.value;
  bool _sessionInvalid = false;
  SanitationSitioSelection? _sitio;
  SanitationLocationDetails _details = const SanitationLocationDetails();
  Map<String, dynamic>? _record;
  String? _error;
  bool _loading = true;
  bool _saving = false;
  bool _locating = false;
  bool _changed = false;
  bool _confirmed = false;
  bool _saved = false;
  int _generation = 0;

  bool get _sessionValid =>
      !_sessionInvalid &&
      _token != null &&
      _token!.isNotEmpty &&
      _prefs?.getString(staffAuthTokenKey) == _token &&
      staffSessionRevision.value == _revision;

  @override
  void initState() {
    super.initState();
    staffSessionRevision.addListener(_sessionChanged);
    unawaited(_load());
  }

  void _sessionChanged() {
    if (mounted) {
      setState(() {
        _sessionInvalid = true;
        _generation++;
        _record = null;
        _latitude.clear();
        _longitude.clear();
        _details = const SanitationLocationDetails();
        _sitio?.invalidate();
        _confirmed = false;
        _changed = false;
        _saved = false;
        _token = null;
        _error = 'Staff session changed. Close and reopen this record.';
      });
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _prefs ??= await SharedPreferences.getInstance();
      _token ??= _prefs!.getString(staffAuthTokenKey);
      if (!_sessionValid) {
        throw StateError(
          'Staff session changed. Close and reopen this record.',
        );
      }
      final record = await widget.api.fetchSanitationLocationRecord(
        widget.recordId,
        household: widget.household,
        expectedSessionToken: _token!,
      );
      if (!mounted || !_sessionValid) return;
      if (record['id'] != widget.recordId) {
        throw const FormatException('Record ID did not match.');
      }
      _record = record;
      _details = SanitationLocationDetails.fromJson(record);
      _latitude.text = record['latitude']?.toString() ?? '';
      _longitude.text = record['longitude']?.toString() ?? '';
      _sitio?.dispose();
      _sitio = SanitationSitioSelection(
        api: widget.api,
        barangays: widget.barangays,
        barangay: '${record['barangay'] ?? ''}',
        text: '${record['sitio'] ?? ''}',
        reference: record['sitio_reference'] as int?,
        source: '${record['sitio_source'] ?? 'unknown'}',
      );
      _confirmed =
          sanitationCoordinatePair(_latitude.text, _longitude.text) != null;
      _changed = false;
      unawaited(_sitio!.load(_token!));
    } catch (error) {
      if (mounted) _error = conciseError(error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _manualChanged() => setState(() {
    _generation++;
    _changed = true;
    _confirmed = false;
    _details = const SanitationLocationDetails(source: 'manual');
  });

  Future<void> _capture() async {
    if (_locating || _saving || !_sessionValid) return;
    final generation = ++_generation;
    setState(() {
      _locating = true;
      _confirmed = false;
      _error = null;
    });
    try {
      final position = await captureSanitationPosition(widget.locationAdapter);
      final details = SanitationLocationDetails.fromPosition(position);
      if (!mounted || !_sessionValid || generation != _generation) return;
      setState(() {
        _latitude.text = position.latitude.toString();
        _longitude.text = position.longitude.toString();
        _details = details;
        _changed = true;
      });
    } catch (error) {
      if (mounted && _sessionValid && generation == _generation) {
        setState(() {
          _error = error is TimeoutException
              ? 'GPS timed out. Move to an open area and tap Use GPS again.'
              : conciseError(error);
        });
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _save() async {
    if (_saving || _locating || !_sessionValid || _record == null) return;
    final site = _sitio!;
    if (site.validationError != null) {
      setState(() => _error = site.validationError);
      return;
    }
    if (_changed &&
        (!_confirmed ||
            sanitationCoordinatePair(_latitude.text, _longitude.text) ==
                null)) {
      setState(
        () => _error = 'Confirm a complete valid location before saving.',
      );
      return;
    }
    final changes = <String, dynamic>{
      ...site.changes,
      if (site.barangay != _record!['barangay']) 'barangay': site.barangay,
      if (_changed) ...{
        'latitude': double.parse(_latitude.text),
        'longitude': double.parse(_longitude.text),
        'location_capture': _details.capture,
      },
    };
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.patchSanitationLocationRecord(
        widget.recordId,
        changes,
        household: widget.household,
        expectedSessionToken: _token!,
      );
      if (!mounted || !_sessionValid) return;
      _saved = true;
      await _load();
      if (mounted && _sessionValid && _error == null) {
        showAppMessage(context, 'Location and Sitio saved.');
      }
    } catch (error) {
      if (mounted && _sessionValid) {
        setState(() => _error = conciseError(error));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _generation++;
    staffSessionRevision.removeListener(_sessionChanged);
    _latitude.dispose();
    _longitude.dispose();
    _sitio?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _sessionInvalid
      ? Scaffold(appBar: AppBar(title: const Text('Session expired')),
          body: const Center(child: Text('Sign in and reopen the record to continue.')))
      : FormPageScaffold(
    title: widget.household ? 'Household Location' : 'Establishment Location',
    subtitle: 'Saved record ${widget.recordId}',
    leading: IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: _saving ? null : () => Navigator.of(context).pop(_saved),
    ),
    children: [
      if (_loading) const Center(child: CircularProgressIndicator()),
      if (_error != null)
        Text(_error!, key: const ValueKey('location-editor-error')),
      if (_record == null && !_loading && _sessionValid)
        TextButton(onPressed: _load, child: const Text('Retry loading record')),
      if (_record != null && _sitio != null)
        AbsorbPointer(
          absorbing: _saving || !_sessionValid,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${_record![widget.household ? 'household_head' : 'business_name'] ?? ''}',
              ),
              Text('${_record!['address'] ?? ''}'),
              DropdownTile<String>(
                label: 'Barangay',
                value: _sitio!.barangay,
                items: {
                  ...widget.barangays.map((item) => item.name),
                  _sitio!.barangay,
                }.toList(),
                itemLabel: (name) => name,
                onChanged: (name) =>
                    setState(() => _sitio!.changeBarangay(name, _token!)),
              ),
              SanitationSitioField(
                selection: _sitio!,
                onRetry: () => _sitio!.load(_token!),
              ),
              LocationCapturePanel(
                latitude: _latitude.text,
                longitude: _longitude.text,
                locating: _locating,
                onCapture: _capture,
                title: widget.household
                    ? 'Household Location'
                    : 'Establishment Location',
              ),
              Text(_details.description),
              AppTextField(
                controller: _latitude,
                label: 'Latitude',
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                  signed: true,
                ),
                onChanged: (_) => _manualChanged(),
              ),
              AppTextField(
                controller: _longitude,
                label: 'Longitude',
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                  signed: true,
                ),
                onChanged: (_) => _manualChanged(),
              ),
              LocationConfirmationPanel(
                latitude: _latitude.text,
                longitude: _longitude.text,
                useGlobalCoordinates: true,
                confirmed: _confirmed,
                onChanged: (point) {
                  _latitude.text = point.latitude.toString();
                  _longitude.text = point.longitude.toString();
                  _manualChanged();
                },
                onConfirm: () => setState(() => _confirmed = true),
              ),
              SubmitButton(
                label: 'Save Location and Sitio',
                loading: _saving,
                onPressed: _save,
              ),
            ],
          ),
        ),
    ],
  );
}
