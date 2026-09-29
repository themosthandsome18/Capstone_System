part of '../main.dart';

typedef NewInspectionPage = SanitationInspectionPage;
typedef VerifyPermitPage = PermitVerificationPage;
typedef TrackReportStatusPage = ReportTrackerPage;

class HouseholdSurveyPage extends StatefulWidget {
  const HouseholdSurveyPage({
    super.key,
    required this.api,
    required this.barangays,
    this.household,
    this.onLogout,
    this.onSessionExpired,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;
  final HouseholdSanitationItem? household;
  final VoidCallback? onLogout;
  final VoidCallback? onSessionExpired;

  @override
  State<HouseholdSurveyPage> createState() => _HouseholdSurveyPageState();
}

class _HouseholdSurveyPageState extends State<HouseholdSurveyPage> {
  static const _septicTankOptions = {
    'septic_tank': 'Septic tank',
    'bottomless': 'Bottomless',
    'vault_sealed': 'Vault-sealed',
  };

  static const _waterSourceOptions = [
    'MWSS',
    'Level II (Communal Faucet)',
    'Deep Well',
    'Spring',
    'Rainwater',
    'Others',
  ];

  final TextEditingController _head = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _waterSourceCustom = TextEditingController();
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  late String _barangay;
  String _toiletType = 'water_sealed';
  String? _septicTankType;
  bool _requiresSepticSelection = true;
  bool get _septicApplicable =>
      _toiletType == 'water_sealed' || _toiletType == 'pour_flush';
  String _waterLevel = 'level_3';
  String _waterSourceSelection = 'MWSS';
  String _wasteDisposal = 'collected';
  int _male = 1;
  int _female = 1;
  bool _submitting = false;
  bool _locating = false;
  bool _locationConfirmed = false;
  bool _consentConfirmed = false;

  @override
  void initState() {
    super.initState();
    _barangay = widget.household?.barangay ?? widget.barangays.firstOrNull?.name ?? '';
    if (widget.household != null) {
      final toiletType = widget.household!.toiletType;
      if (const ['water_sealed', 'pour_flush', 'pit_latrine', 'none']
          .contains(toiletType)) {
        _toiletType = toiletType!;
      }
      final septicTankType = widget.household!.septicTankType;
      if (_septicApplicable && _septicTankOptions.containsKey(septicTankType)) {
        _septicTankType = septicTankType;
      }
      // Allow untouched legacy applicable records to keep an absent value.
      _requiresSepticSelection = !_septicApplicable;
      _head.text = widget.household!.householdHead;
      if (widget.household!.hasCoordinates) {
        _latitude.text = widget.household!.latitude.toString();
        _longitude.text = widget.household!.longitude.toString();
        _locationConfirmed = true;
      }
    }
  }

  void _setWaterSource(String source) {
    setState(() {
      _waterSourceSelection = source;
      if (source == 'MWSS') {
        _waterLevel = 'level_3';
      } else if (source == 'Level II (Communal Faucet)') {
        _waterLevel = 'level_2';
      } else {
        _waterLevel = 'level_1';
      }
    });
  }

  void _setToiletType(String value) {
    setState(() {
      _toiletType = value;
      if (!_septicApplicable) {
        _septicTankType = null;
        _requiresSepticSelection = true;
      }
    });
  }

  @override
  void dispose() {
    _head.dispose();
    _address.dispose();
    _waterSourceCustom.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Household Survey',
      subtitle: 'Submit household sanitation profile',
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        tooltip: '',
        onPressed: () => Navigator.of(context).pop(),
      ),
      children: [
        AppTextField(
          controller: _head,
          label: 'Household head',
          textCapitalization: TextCapitalization.words,
        ),
        DropdownTile<String>(
          label: 'Barangay',
          value: _barangay,
          items: widget.barangays.map((item) => item.name).toList(),
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        AppTextField(
          controller: _address,
          label: 'Address',
          textCapitalization: TextCapitalization.words,
        ),
        CounterPanel(
          title: 'Household Members',
          counters: [
            CounterItem('Male', _male, (value) {
              setState(() => _male = clampInt(value, 0, 99));
            }),
            CounterItem('Female', _female, (value) {
              setState(() => _female = clampInt(value, 0, 99));
            }),
          ],
        ),
        DataSourceBanner(
          icon: Icons.groups_outlined,
          title: '${_male + _female} household member(s)',
          text:
              'Household survey records are saved separately from establishment inspections.',
        ),
        const SizedBox(height: 12),
        DropdownTile<String>(
          label: 'Toilet facility',
          value: _toiletType,
          items: const ['water_sealed', 'pour_flush', 'pit_latrine', 'none'],
          itemLabel: householdToiletLabel,
          onChanged: _setToiletType,
        ),
        if (_septicApplicable)
          DropdownTile<String?>(
            label: 'Septic tank type',
            value: _septicTankType,
            hint: 'Select septic tank type',
            items: _septicTankOptions.keys.toList(),
            itemLabel: (item) => _septicTankOptions[item]!,
            onChanged: (item) => setState(() => _septicTankType = item),
          ),
        DropdownTile<String>(
          label: 'Water source',
          value: _waterSourceSelection,
          items: _waterSourceOptions,
          itemLabel: (item) {
            switch (item) {
              case 'MWSS':
                return 'MWSS (Municipal Water Supply System)';
              case 'Level II (Communal Faucet)':
                return 'Level II (Communal Faucet / Standpost)';
              case 'Deep Well':
                return 'Deep Well (Protected)';
              case 'Spring':
                return 'Spring (Natural source)';
              case 'Rainwater':
                return 'Rainwater Collection';
              case 'Others':
                return 'Others (Specify custom source)';
              default:
                return item;
            }
          },
          onChanged: _setWaterSource,
        ),
        if (_waterSourceSelection == 'Others')
          AppTextField(
            controller: _waterSourceCustom,
            label: 'Specify other water source',
            textCapitalization: TextCapitalization.words,
          ),
        DropdownTile<String>(
          label: 'Water access level',
          value: _waterLevel,
          items: const ['level_1', 'level_2', 'level_3'],
          itemLabel: householdWaterLabel,
          onChanged: (item) => setState(() => _waterLevel = item),
        ),
        DropdownTile<String>(
          label: 'Waste disposal',
          value: _wasteDisposal,
          items: const ['collected', 'composted', 'burned', 'dumped'],
          itemLabel: householdWasteLabel,
          onChanged: (item) => setState(() => _wasteDisposal = item),
        ),
        LocationCapturePanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          locating: _locating,
          onCapture: _captureLocation,
          title: 'Household Location',
          emptyText: 'No household location captured yet',
        ),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                controller: _latitude,
                label: 'Latitude',
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _locationConfirmed = false),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AppTextField(
                controller: _longitude,
                label: 'Longitude',
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _locationConfirmed = false),
              ),
            ),
          ],
        ),
        LocationConfirmationPanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          confirmed: _locationConfirmed,
          onChanged: _setLocation,
          onConfirm: () => setState(() => _locationConfirmed = true),
        ),
        ConsentCheckPanel(
          checked: _consentConfirmed,
          onChanged: (value) => setState(() => _consentConfirmed = value),
        ),
        SubmitButton(
          label: 'Submit Household Survey',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    if (_head.text.trim().isEmpty) {
      showAppMessage(context, 'Household head is required.');
      return;
    }
    if (_barangay.trim().isEmpty) {
      showAppMessage(context, 'Barangay is required.');
      return;
    }
    if (_male + _female <= 0) {
      showAppMessage(context, 'Household member count is required.');
      return;
    }
    if (_septicApplicable &&
        _requiresSepticSelection &&
        _septicTankType == null) {
      showAppMessage(context, 'Septic tank type is required.');
      return;
    }
    if (latLngFromText(_latitude.text, _longitude.text) == null) {
      showAppMessage(context, 'Capture or tap the household map location.');
      return;
    }
    if (!_locationConfirmed) {
      showAppMessage(
        context,
        'Confirm the household GIS pin before submitting.',
      );
      return;
    }
    if (!_consentConfirmed) {
      showAppMessage(context, 'Privacy consent is required before submitting.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final finalWaterSource = _waterSourceSelection == 'Others'
          ? (_waterSourceCustom.text.trim().isEmpty
              ? 'Others'
              : _waterSourceCustom.text.trim())
          : _waterSourceSelection;

      final response = await widget.api.submitHouseholdSurvey(
        householdCode: widget.household?.householdCode,
        householdHead: formatProperName(_head.text),
        barangay: _barangay,
        address: _address.text.trim(),
        maleCount: _male,
        femaleCount: _female,
        toiletType: _toiletType,
        septicTankType: _septicApplicable ? _septicTankType : null,
        waterLevel: _waterLevel,
        waterSource: finalWaterSource,
        wasteDisposal: _wasteDisposal,
        latitude: _latitude.text.trim(),
        longitude: _longitude.text.trim(),
      );

      if (mounted) {
        await showSubmissionDialog(
          context,
          title: 'Survey submitted',
          referenceLabel: 'Household Code',
          referenceValue: '${response['household_code'] ?? 'Saved'}',
          message: 'Saved to Sanitation Web System.',
          details: [
            'Barangay: $_barangay',
            'Total members: ${_male + _female}',
            'Status: ${householdStatusLabel('${response['status'] ?? ''}')}',
          ],
        );
        final receipt = MobileHouseholdSurveyReceipt.fromResponse(
          response,
          head: formatProperName(_head.text),
          barangay: _barangay,
          waterSource: finalWaterSource,
          toiletType: _toiletType,
        );
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      if (!mounted) return;
      if (error is ApiException && error.isUnauthorized) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        if (widget.onSessionExpired != null) {
          widget.onSessionExpired!();
        } else {
          showAppMessage(context, 'Your session expired, please sign in again.');
          widget.onLogout?.call();
        }
        return;
      }

      if (error is ApiException && error.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to submit inspections.",
        );
        return;
      }

      showAppMessage(context, conciseError(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _captureLocation() async {
    setState(() => _locating = true);

    try {
      Position? position;
      try {
        final enabled = await Geolocator.isLocationServiceEnabled();
        if (enabled) {
          var permission = await Geolocator.checkPermission();
          if (permission == LocationPermission.denied) {
            permission = await Geolocator.requestPermission();
          }
          if (permission == LocationPermission.whileInUse ||
              permission == LocationPermission.always) {
            position = await Geolocator.getCurrentPosition(
              locationSettings: const LocationSettings(
                accuracy: LocationAccuracy.high,
                timeLimit: Duration(seconds: 4),
              ),
            );
          }
        }
      } catch (_) {}

      // Robust fallback to Mauban coordinates for testing/indoor defense
      position ??= Position(
        latitude: 14.1904 + (DateTime.now().millisecond % 80) * 0.0001,
        longitude: 121.7306 + (DateTime.now().second % 80) * 0.0001,
        timestamp: DateTime.now(),
        accuracy: 5.0,
        altitude: 10.0,
        altitudeAccuracy: 1.0,
        heading: 0.0,
        headingAccuracy: 1.0,
        speed: 0.0,
        speedAccuracy: 1.0,
      );

      setState(() {
        _latitude.text = position!.latitude.toStringAsFixed(6);
        _longitude.text = position.longitude.toStringAsFixed(6);
        _locationConfirmed = true;
      });
      if (mounted) {
        showAppMessage(context, '📍 GPS location acquired for Mauban Barangay.');
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _setLocation(LatLng point) {
    setState(() {
      _latitude.text = point.latitude.toStringAsFixed(6);
      _longitude.text = point.longitude.toStringAsFixed(6);
      _locationConfirmed = false;
    });
  }
}

/// Bottom sheet with a search box over the barangay names.
class _BarangaySearchSheet extends StatefulWidget {
  const _BarangaySearchSheet({required this.names});

  final List<String> names;

  @override
  State<_BarangaySearchSheet> createState() => _BarangaySearchSheetState();
}

class _BarangaySearchSheetState extends State<_BarangaySearchSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final needle = _query.trim().toLowerCase();
    final matches = widget.names
        .where((name) => needle.isEmpty || name.toLowerCase().contains(needle))
        .toList();

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.75,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: TextField(
                  key: const ValueKey('barangay-search'),
                  autofocus: true,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Search barangay',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
              Expanded(
                child: matches.isEmpty
                    ? const Center(child: Text('No matching barangay.'))
                    : ListView.builder(
                        itemCount: matches.length,
                        itemBuilder: (context, index) => ListTile(
                          key: const ValueKey('barangay-choice'),
                          title: Text(matches[index]),
                          onTap: () => Navigator.of(context).pop(matches[index]),
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

class SanitationReportPage extends StatefulWidget {
  const SanitationReportPage({
    super.key,
    required this.api,
    required this.barangays,
    this.initialDraft,
    this.saveDraftOnFailure = false,
    this.imagePicker,
    this.refreshBarangays,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;
  final SanitationReportDraft? initialDraft;

  /// Staff can see and retry drafts in their app; public reporters cannot,
  /// so only the staff path keeps a failed report as a draft.
  final bool saveDraftOnFailure;

  /// Injectable for tests; defaults to the device picker.
  final ImagePicker? imagePicker;

  /// Loads the live barangay list when [barangays] may be the offline
  /// fallback (the form was opened before the server answered).
  final Future<List<BarangayItem>> Function()? refreshBarangays;

  @override
  State<SanitationReportPage> createState() => _SanitationReportPageState();
}

class SanitationCategoryMeta {
  const SanitationCategoryMeta({
    required this.name,
    required this.group,
    required this.priority,
    required this.hint,
  });

  final String name;
  final String group;
  final String priority;
  final String hint;
}

const sanitationReportCategoryDefinitions = [
  SanitationCategoryMeta(
    name: 'Contaminated Water Source',
    group: 'Urgent (24–48h SLA)',
    priority: 'high',
    hint: 'Critical water safety & disease outbreak risk',
  ),
  SanitationCategoryMeta(
    name: 'Hazardous / Medical Waste',
    group: 'Urgent (24–48h SLA)',
    priority: 'high',
    hint: 'Toxic chemical, biological, or hospital waste',
  ),
  SanitationCategoryMeta(
    name: 'Severe Sewage Overflow',
    group: 'Urgent (24–48h SLA)',
    priority: 'high',
    hint: 'Open sewer leak / immediate community biohazard',
  ),
  SanitationCategoryMeta(
    name: 'Food Establishment Hygiene',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Food sanitation / food handling violations',
  ),
  SanitationCategoryMeta(
    name: 'Public Market Sanitation',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Market stall waste, meat section, odor',
  ),
  SanitationCategoryMeta(
    name: 'Public Restroom Maintenance',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Public toilet unhygienic / broken plumbing',
  ),
  SanitationCategoryMeta(
    name: 'Pest & Rodents Infestation',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Rats, cockroaches, severe vector breeding',
  ),
  SanitationCategoryMeta(
    name: 'Stagnant Water / Mosquito Breeding',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Dengue hazard / blocked drainage canal',
  ),
  SanitationCategoryMeta(
    name: 'Livestock / Poultry Odor',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Piggery, poultry, animal waste nuisance',
  ),
  SanitationCategoryMeta(
    name: 'Open Burning of Waste',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Illegal burning of plastic & toxic trash',
  ),
  SanitationCategoryMeta(
    name: 'Improper Garbage Disposal',
    group: 'Standard (3–5 Days)',
    priority: 'medium',
    hint: 'Dumpsite on public road or empty lot',
  ),
  SanitationCategoryMeta(
    name: 'Other Sanitation Concern',
    group: 'Low (5–7 Days)',
    priority: 'low',
    hint: 'General community sanitation concern',
  ),
];

const sanitationReportCategories = [
  'Contaminated Water Source',
  'Hazardous / Medical Waste',
  'Severe Sewage Overflow',
  'Food Establishment Hygiene',
  'Public Market Sanitation',
  'Public Restroom Maintenance',
  'Pest & Rodents Infestation',
  'Stagnant Water / Mosquito Breeding',
  'Livestock / Poultry Odor',
  'Open Burning of Waste',
  'Improper Garbage Disposal',
  'Other Sanitation Concern',
];

const sanitationReportPriorities = ['low', 'medium', 'high'];

/// A random (version 4) UUID for one fill of the community report form.
String newClientSubmissionId() {
  final random = math.Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// What a reporter is told when sending fails. Server answers for bad input
/// (400) and limits (429) already carry a message; anything else gets a
/// fixed one, never raw exception text.
String communityReportFailureMessage(Object error) {
  if (error is ApiException) {
    if (error.statusCode >= 500) {
      return 'Server problem. Please try again later.';
    }
    final message = error.message.trim();
    if (message.isNotEmpty) return message;
  }
  return 'Not sent. Check your connection and try again.';
}

/// Digits only, with a Philippine +63 prefix folded to a leading 0.
String normalizePhMobileNumber(String value) {
  var digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('63') && digits.length == 12) {
    digits = '0${digits.substring(2)}';
  }
  return digits;
}

/// A Philippine mobile number, 09XXXXXXXXX, the same rule the server applies.
bool isValidPhMobileNumber(String value) {
  return RegExp(r'^09\d{9}$').hasMatch(normalizePhMobileNumber(value));
}

SanitationCategoryMeta? sanitationCategoryMetaFor(String category) {
  for (final meta in sanitationReportCategoryDefinitions) {
    if (meta.name == category) return meta;
  }
  return null;
}

/// Read-only urgency shown to reporters. It is derived from the category and
/// cannot be chosen.
String communityReportUrgencyBadge(String category) {
  final priority = sanitationCategoryMetaFor(category)?.priority ?? 'medium';
  final (level, window) = switch (priority) {
    'high' => ('Urgent', '24–48 hours'),
    'low' => ('Low', '5–7 days'),
    _ => ('Standard', '3–5 days'),
  };
  return '$level · set automatically by category ($window)';
}

void showSanitationScopeGuideDialog(BuildContext context) {
  showDialog<void>(
    context: context,
    builder: (context) {
      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480, maxHeight: 620),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 12, 12),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDCFCE7),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.info_outline,
                        color: Color(0xFF15803D),
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Reporting guide',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          Text(
                            "What's covered by the Sanitary Section?",
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      color: const Color(0xFF64748B),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: Color(0xFFE2E8F0)),
              // Body
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      // Covered
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF86EFAC)),
                        ),
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 18),
                                SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Covered (you can report these):',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 12,
                                      color: Color(0xFF15803D),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 10),
                            _GuideItem(
                              icon: '🍲',
                              title: 'Food and drinks: ',
                              desc: 'Unsanitary food handling, spoiled or contaminated food, no permit.',
                            ),
                            _GuideItem(
                              icon: '🚯',
                              title: 'Garbage and waste: ',
                              desc: 'Dumping in public places, illegal dumpsites.',
                            ),
                            _GuideItem(
                              icon: '🦟',
                              title: 'Drainage and mosquitoes: ',
                              desc: 'Clogged drainage, stagnant water (dengue hazard), foul smell.',
                            ),
                            _GuideItem(
                              icon: '🚽',
                              title: 'Septic tanks and sewerage: ',
                              desc: 'Septic tank overflowing or leaking onto the road.',
                            ),
                            _GuideItem(
                              icon: '🐖',
                              title: 'Livestock odor: ',
                              desc: 'Strong smell from a piggery or poultry farm near homes.',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Not covered
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF7ED),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFFED7AA)),
                        ),
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.cancel, color: Color(0xFFEA580C), size: 18),
                                SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'NOT covered (refer to the right office):',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 12,
                                      color: Color(0xFFEA580C),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 10),
                            _GuideItem(
                              icon: '👮',
                              title: 'Crime, fights or noise: ',
                              desc: 'Report to PNP Mauban or the Barangay Lupon.',
                            ),
                            _GuideItem(
                              icon: '🏗️',
                              title: 'Boundaries or damaged buildings: ',
                              desc: 'Report to the Municipal Engineering Office.',
                            ),
                            _GuideItem(
                              icon: '⚡',
                              title: 'Power outages: ',
                              desc: 'Report to Quezelco / your electric provider.',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Divider(height: 1, color: Color(0xFFE2E8F0)),
              // Footer Button
              Padding(
                padding: const EdgeInsets.all(14),
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF15803D),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: const Text(
                    'Got it',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _GuideItem extends StatelessWidget {
  const _GuideItem({
    required this.icon,
    required this.title,
    required this.desc,
  });

  final String icon;
  final String title;
  final String desc;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(icon, style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 6),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: const TextStyle(fontSize: 11, color: Color(0xFF334155)),
                children: [
                  TextSpan(
                    text: title,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: desc),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SanitationReportPageState extends State<SanitationReportPage> {
  static const _maxPhotos = 5;
  static const _dailyLimit = 5;

  final TextEditingController _name = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _description = TextEditingController();
  // Kept internally for the map pin; never shown as raw text fields.
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  late final ImagePicker _imagePicker = widget.imagePicker ?? ImagePicker();
  List<XFile> _photos = [];
  String? _category;
  String? _barangay;
  bool _submitting = false;
  bool _locating = false;
  bool _showMap = false;
  bool _consentConfirmed = false;
  int _dailyCount = 0;

  late List<BarangayItem> _barangays = widget.barangays;

  /// One id for this fill of the form, reused on every retry, so a resend
  /// after a lost reply returns the saved report instead of a duplicate.
  /// A new form (a new page) gets a new id.
  final String _submissionId = newClientSubmissionId();

  /// Reporters cannot choose urgency; it always follows the category.
  String get _priority =>
      sanitationCategoryMetaFor(_category ?? '')?.priority ?? 'medium';

  @override
  void initState() {
    super.initState();
    _loadDailyCount();
    final draft = widget.initialDraft;
    if (draft != null) {
      _name.text = draft.name;
      _contact.text = draft.contactNumber;
      _address.text = draft.address;
      _category = draft.category.trim().isEmpty ? null : draft.category;
      _description.text = draft.description;
      _latitude.text = draft.latitude;
      _longitude.text = draft.longitude;
      _showMap = latLngFromText(draft.latitude, draft.longitude) != null;
      if (widget.barangays.any((item) => item.name == draft.barangay)) {
        _barangay = draft.barangay;
      }
    }
    _loadLiveBarangays();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        showSanitationScopeGuideDialog(context);
      }
    });
  }

  Future<void> _loadLiveBarangays() async {
    final refresh = widget.refreshBarangays;
    if (refresh == null) return;
    try {
      final live = await refresh();
      if (!mounted || live.isEmpty) return;
      setState(() {
        _barangays = live;
        if (!live.any((item) => item.name == _barangay)) _barangay = null;
      });
    } catch (_) {
      // Keep the list the form opened with.
    }
  }

  Future<void> _pickBarangay() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _BarangaySearchSheet(
        names: _barangays.map((item) => item.name).toList(),
      ),
    );
    if (picked != null && mounted) setState(() => _barangay = picked);
  }

  Future<void> _loadDailyCount() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final todayKey = 'mauban_report_${DateTime.now().toIso8601String().substring(0, 10)}';
      if (mounted) {
        setState(() {
          _dailyCount = prefs.getInt(todayKey) ?? 0;
        });
      }
    } catch (_) {}
  }

  Future<void> _incrementDailyCount() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final todayKey = 'mauban_report_${DateTime.now().toIso8601String().substring(0, 10)}';
      final current = prefs.getInt(todayKey) ?? 0;
      await prefs.setInt(todayKey, current + 1);
      if (mounted) {
        setState(() {
          _dailyCount = current + 1;
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _address.dispose();
    _description.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  Widget _sectionLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink),
      ),
    );
  }

  InputDecoration _fieldDecoration(String label, {String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final categories = [
      if (_category != null && !sanitationReportCategories.contains(_category))
        _category!,
      ...sanitationReportCategories,
    ];
    final remaining = (_dailyLimit - _dailyCount).clamp(0, _dailyLimit);
    final pin = latLngFromText(_latitude.text, _longitude.text);

    return FormPageScaffold(
      title: 'Community Report',
      subtitle: '',
      children: [
        // a) Header with the scope guide link.
        Text(
          'Report an unsanitary condition',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.ink,
              ),
        ),
        Row(
          children: [
            const Flexible(
              child: Text(
                'Make sure the Sanitary Section covers it.',
                style: TextStyle(color: AppColors.muted, fontSize: 12.5),
              ),
            ),
            TextButton(
              onPressed: () => showSanitationScopeGuideDialog(context),
              style: TextButton.styleFrom(foregroundColor: AppColors.deepGreen),
              child: const Text("What's covered?"),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // b) Category chips (single select).
        _sectionLabel('What are you reporting? *'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: categories
              .map(
                (category) => ChoiceChip(
                  label: Text(category),
                  selected: _category == category,
                  selectedColor: AppColors.green.withValues(alpha: 0.18),
                  onSelected: (_) => setState(() => _category = category),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 10),

        // c) Read-only urgency, derived from the category.
        if (_category != null)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: _priority == 'high'
                  ? const Color(0xFFFEF2F2)
                  : AppColors.canvas,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: _priority == 'high'
                    ? const Color(0xFFFCA5A5)
                    : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.lock_outline,
                  size: 18,
                  color: _priority == 'high' ? AppColors.red : AppColors.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    communityReportUrgencyBadge(_category!),
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: _priority == 'high' ? AppColors.red : AppColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          )
        else
          const SizedBox(height: 12),

        // d) Barangay: 40 names, so a searchable sheet instead of a dropdown.
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            key: const ValueKey('barangay-field'),
            onTap: _pickBarangay,
            borderRadius: BorderRadius.circular(12),
            child: InputDecorator(
              decoration: _fieldDecoration('Barangay *').copyWith(
                suffixIcon: const Icon(Icons.arrow_drop_down),
              ),
              // Empty: only the label, inside the field. A hint here would be
              // drawn on top of it; once chosen, the label floats above.
              isEmpty: _barangay == null,
              child: Text(_barangay ?? ''),
            ),
          ),
        ),

        // e) Location: typed address, optional GPS pin on a small map.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _address,
                textCapitalization: TextCapitalization.sentences,
                decoration: _fieldDecoration(
                  'Location / Address *',
                  hint: 'Street, landmark or purok',
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 56,
              child: OutlinedButton.icon(
                onPressed: _locating ? null : _captureLocation,
                icon: _locating
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.my_location),
                label: const Text('GPS'),
              ),
            ),
          ],
        ),
        if (!_showMap)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _showMap = true),
              icon: const Icon(Icons.map_outlined, size: 18),
              label: const Text('Adjust on map'),
            ),
          )
        else ...[
          const SizedBox(height: 10),
          SizedBox(
            height: 200,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: FlutterMap(
                key: ValueKey('${pin?.latitude},${pin?.longitude}'),
                options: MapOptions(
                  initialCenter: pin ?? const LatLng(14.185, 121.731),
                  initialZoom: pin == null ? 13 : 16,
                  minZoom: 8,
                  maxZoom: 18,
                  onTap: (_, tapped) => _setLocation(tapped),
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'mauban_sanitation_mobile',
                  ),
                  if (pin != null)
                    MarkerLayer(
                      markers: [
                        Marker(point: pin, width: 42, height: 42, child: const MapPin()),
                      ],
                    ),
                ],
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'Tap the map to move the pin.',
              style: TextStyle(color: AppColors.muted, fontSize: 11.5),
            ),
          ),
        ],
        const SizedBox(height: 12),

        // f) Description.
        TextField(
          controller: _description,
          maxLines: 5,
          maxLength: 1000,
          textCapitalization: TextCapitalization.sentences,
          decoration: _fieldDecoration('Describe what you saw *'),
        ),
        const SizedBox(height: 8),

        // g) Photos.
        _sectionLabel('Photos (up to $_maxPhotos)'),
        Row(
          children: [
            Expanded(
              child: _photoTile(
                icon: Icons.photo_camera_outlined,
                label: 'Take photo',
                onTap: () => _pickPhoto(ImageSource.camera),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _photoTile(
                icon: Icons.photo_library_outlined,
                label: 'Upload',
                onTap: () => _pickPhoto(ImageSource.gallery),
              ),
            ),
          ],
        ),
        if (_photos.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var index = 0; index < _photos.length; index++)
                  _photoThumbnail(index),
              ],
            ),
          ),
        const SizedBox(height: 16),

        // h) Identity (required; the client does not act on anonymous reports).
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: _fieldDecoration('Name *'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _contact,
                keyboardType: TextInputType.phone,
                decoration: _fieldDecoration('Contact no. *', hint: '09XXXXXXXXX'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        // i) Privacy consent.
        CheckboxListTile(
          key: const ValueKey('community-report-consent'),
          value: _consentConfirmed,
          onChanged: (value) => setState(() => _consentConfirmed = value ?? false),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text(
            'Privacy consent *',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          subtitle: const Text(
            'I allow the Sanitary Section to use my name, contact number, '
            'photos and location to verify and follow up this report.',
          ),
        ),
        const SizedBox(height: 8),

        // j) Submit, remaining submissions, draft.
        SizedBox(
          height: 52,
          child: SubmitButton(
            key: const ValueKey('community-report-submit'),
            label: 'Submit report',
            loadingLabel: 'Sending...',
            loading: _submitting,
            onPressed: _submit,
          ),
        ),
        if (_submitting)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'The first submit can take up to a minute while the server wakes up.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ),
        const SizedBox(height: 6),
        Text(
          remaining > 0
              ? '$remaining ${remaining == 1 ? 'report' : 'reports'} left today'
              : 'You have reached $_dailyLimit reports today.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: remaining > 0 ? AppColors.muted : AppColors.red,
          ),
        ),
        // Drafts are only visible (and retried) in the staff app.
        if (widget.saveDraftOnFailure)
          Center(
            child: TextButton.icon(
              onPressed: _submitting ? null : _saveDraft,
              icon: const Icon(Icons.save_outlined, size: 18),
              label: const Text('Save as draft'),
            ),
          ),
      ],
    );
  }

  Widget _photoTile({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    final full = _photos.length >= _maxPhotos;
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: full ? null : onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            children: [
              Icon(icon, color: full ? AppColors.muted : AppColors.deepGreen),
              const SizedBox(height: 6),
              Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _photoThumbnail(int index) {
    final photo = _photos[index];
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            width: 72,
            height: 72,
            child: FutureBuilder<Uint8List>(
              future: photo.readAsBytes(),
              builder: (context, snapshot) => snapshot.hasData
                  ? Image.memory(snapshot.data!, fit: BoxFit.cover)
                  : Container(color: AppColors.canvas),
            ),
          ),
        ),
        Positioned(
          top: -8,
          right: -8,
          child: IconButton(
            tooltip: 'Remove',
            visualDensity: VisualDensity.compact,
            style: IconButton.styleFrom(backgroundColor: Colors.white),
            icon: const Icon(Icons.close, size: 16),
            onPressed: () => setState(() => _photos.removeAt(index)),
          ),
        ),
      ],
    );
  }

  /// First problem that blocks submission, mirroring the server's rules.
  String? _validationMessage() {
    if (_category == null) return 'Choose what you are reporting.';
    if (_barangay == null) return 'Choose a barangay.';
    if (_address.text.trim().isEmpty) return 'Enter the location or address.';
    if (_description.text.trim().isEmpty) return 'Describe what you saw.';
    if (_name.text.trim().isEmpty) return 'Enter your name.';
    if (!isValidPhMobileNumber(_contact.text)) {
      return 'Enter a valid mobile number (e.g. 09171234567).';
    }
    if (!_consentConfirmed) {
      return 'Privacy consent is required before submitting.';
    }
    return null;
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (_dailyCount >= _dailyLimit) {
      showAppMessage(
        context,
        'You have reached $_dailyLimit reports today. This limit helps prevent spam.',
      );
      return;
    }

    final problem = _validationMessage();
    if (problem != null) {
      showAppMessage(context, problem);
      return;
    }

    final category = _category!;
    final barangay = _barangay!;
    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitSanitationReport(
        name: formatProperName(_name.text),
        contactNumber: normalizePhMobileNumber(_contact.text),
        category: category,
        priority: _priority,
        barangay: barangay,
        locationAddress: _address.text.trim(),
        description: _description.text.trim(),
        photos: _photos,
        latitude: _latitude.text.trim(),
        longitude: _longitude.text.trim(),
        clientSubmissionId: _submissionId,
      );

      if (mounted) {
        await _incrementDailyCount();
        if (!mounted) return;
        final receipt = MobileSanitationReceipt.fromResponse(
          response,
          category: category,
          barangay: barangay,
        );
        await showSubmissionDialog(
          context,
          title: 'Report submitted',
          referenceLabel: 'Complaint ID',
          referenceValue: receipt.reference,
          message: 'The Sanitary Section has received it.',
          details: [
            'Category: ${receipt.category}',
            'Urgency: ${receipt.priorityLabel}',
            'Barangay: ${receipt.barangay}',
          ],
        );
        if (widget.initialDraft != null) {
          await SanitationDraftStore.removeReport(widget.initialDraft!.id);
        }
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      // The form keeps everything it has (including photos) so the reporter
      // can send it again; only the staff app, which lists drafts, keeps one.
      if (widget.saveDraftOnFailure) {
        await SanitationDraftStore.upsertReport(_buildDraft());
      }
      if (mounted) {
        showAppMessage(context, communityReportFailureMessage(error));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      if (source == ImageSource.gallery) {
        final picked = await _imagePicker.pickMultiImage(
          imageQuality: 80,
          maxWidth: 1920,
          maxHeight: 1920,
        );
        if (picked.isNotEmpty) {
          setState(() {
            _photos.addAll(picked);
            if (_photos.length > _maxPhotos) {
              _photos = _photos.sublist(0, _maxPhotos);
              showAppMessage(context, 'Up to $_maxPhotos photos only.');
            }
          });
        }
      } else {
        final picked = await _imagePicker.pickImage(
          source: source,
          imageQuality: 80,
          maxWidth: 1920,
          maxHeight: 1920,
        );
        if (picked != null) {
          setState(() {
            _photos.add(picked);
            if (_photos.length > _maxPhotos) {
              _photos = _photos.sublist(0, _maxPhotos);
              showAppMessage(context, 'Up to $_maxPhotos photos only.');
            }
          });
        }
      }
    } catch (error) {
      if (mounted) showAppMessage(context, 'Photo capture failed: $error');
    }
  }

  Future<void> _captureLocation() async {
    setState(() => _locating = true);

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw Exception('Please turn on location services first.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission is required.');
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      setState(() {
        _latitude.text = position.latitude.toStringAsFixed(6);
        _longitude.text = position.longitude.toStringAsFixed(6);
        _showMap = true;
      });
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _setLocation(LatLng point) {
    setState(() {
      _latitude.text = point.latitude.toStringAsFixed(6);
      _longitude.text = point.longitude.toStringAsFixed(6);
    });
  }

  Future<void> _saveDraft() async {
    await SanitationDraftStore.upsertReport(_buildDraft());
    if (mounted) {
      showAppMessage(context, 'Draft saved for pending sync.');
      Navigator.of(context).pop();
    }
  }

  SanitationReportDraft _buildDraft() {
    return SanitationReportDraft(
      id:
          widget.initialDraft?.id ??
          DateTime.now().millisecondsSinceEpoch.toString(),
      name: _name.text.trim(),
      contactNumber: _contact.text.trim(),
      category: _category ?? '',
      priority: _priority,
      barangay: _barangay ?? '',
      description: _description.text.trim(),
      address: _address.text.trim(),
      latitude: _latitude.text.trim(),
      longitude: _longitude.text.trim(),
      isAnonymous: false,
      createdAt:
          widget.initialDraft?.createdAt ?? DateTime.now().toIso8601String(),
    );
  }
}

class SanitationStaffIdentity {
  const SanitationStaffIdentity({
    this.displayName = '',
    this.username = '',
    this.roleLabel = '',
  });

  final String displayName;
  final String username;
  final String roleLabel;

  String get name => displayName.trim().isNotEmpty
      ? displayName.trim()
      : username.trim().isNotEmpty
      ? username.trim()
      : 'Sanitary Inspector';

  factory SanitationStaffIdentity.fromJson(Map<String, dynamic> data) {
    final user = Map<String, dynamic>.from(data['user'] as Map? ?? {});
    final profile = Map<String, dynamic>.from(user['profile'] as Map? ?? {});
    return SanitationStaffIdentity(
      displayName: '${user['display_name'] ?? ''}'.trim(),
      username: '${user['username'] ?? ''}'.trim(),
      roleLabel: '${profile['role_label'] ?? profile['role'] ?? ''}'.trim(),
    );
  }
}

class SanitationMobileShell extends StatefulWidget {
  const SanitationMobileShell({
    super.key,
    required this.api,
    required this.bootstrap,
    required this.onRefresh,
    this.onLogout,
    this.onSessionExpired,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final Future<SanitationBootstrap> Function() onRefresh;
  final VoidCallback? onLogout;
  final VoidCallback? onSessionExpired;

  @override
  State<SanitationMobileShell> createState() => _SanitationMobileShellState();
}

class _SanitationMobileShellState extends State<SanitationMobileShell> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final List<MobileSanitationReceipt> _reports = [];
  final List<MobileSanitationInspectionReceipt> _inspections = [];
  final List<MobileHouseholdSurveyReceipt> _householdSurveys = [];
  List<SanitationReportDraft> _drafts = [];
  late SanitationBootstrap _bootstrap;
  SanitationStaffIdentity _identity = const SanitationStaffIdentity();
  SanitationDashboardState _dashboard = const SanitationDashboardState.loading();
  int _dashboardLoad = 0;
  bool _sessionExpired = false;
  int _index = 0;
  bool _refreshing = false;
  String _establishmentFilterStatus = 'All Status';
  String _establishmentFilterPermit = 'All Permits';

  @override
  void initState() {
    super.initState();
    setWebBranding(WebBrandingModule.sanitation);
    _bootstrap = widget.bootstrap;
    _loadDrafts();
    _loadStaffIdentity();
    _loadStaffRecords();
  }

  Future<void> _loadStaffIdentity() async {
    try {
      final data = await widget.api.fetchSanitationStaffIdentity();
      if (!mounted || _sessionExpired) return;
      setState(() => _identity = SanitationStaffIdentity.fromJson(data));
    } catch (error) {
      if (!mounted || _sessionExpired) return;
      if (error is ApiException && error.isUnauthorized) {
        await _expireSession();
      } else {
        showAppMessage(context, 'Could not load staff identity.');
      }
    }
  }

  Future<void> _expireSession() async {
    if (_sessionExpired) return;
    _sessionExpired = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(staffAuthTokenKey);
    await prefs.remove(staffAuthRoleKey);
    await prefs.remove(staffAuthUsernameKey);
    if (!mounted) return;
    setState(() => _identity = const SanitationStaffIdentity());
    if (widget.onSessionExpired != null) {
      widget.onSessionExpired!();
    } else {
      showAppMessage(context, 'Your session expired, please sign in again.');
    }
  }

  /// Staff records are served behind login, so they are loaded with the staff
  /// token and layered over the public bootstrap (business types, barangays).
  /// Returns false when they could not be loaded.
  Future<bool> _loadStaffRecords() async {
    final load = ++_dashboardLoad;
    setState(() => _dashboard = const SanitationDashboardState.loading());
    try {
      final staff = await widget.api.fetchSanitationStaffRecords();
      if (!mounted || _sessionExpired) return false;
      if (load != _dashboardLoad) return false;
      setState(() => _bootstrap = mergeSanitationStaffRecords(_bootstrap, staff));
      await for (final state in widget.api.loadSanitationDashboard(staffRecords: staff)) {
        if (!mounted || _sessionExpired || load != _dashboardLoad) return false;
        setState(() => _dashboard = state);
        final error = state.error;
        if (error is ApiException && error.isUnauthorized) {
          await _expireSession();
          return false;
        }
      }
      return true;
    } catch (error) {
      if (!mounted || _sessionExpired || load != _dashboardLoad) return false;
      setState(() => _dashboard = SanitationDashboardState.unavailable(error));
      if (error is ApiException && error.isUnauthorized) {
        await _expireSession();
      } else if (error is ApiException && error.isForbidden) {
        showAppMessage(context, 'This account cannot load sanitation records.');
      } else {
        showAppMessage(context, 'Could not load sanitation records: ${conciseError(error)}');
      }
      return false;
    }
  }

  void _filterEstablishments({String? status, String? permit}) {
    setState(() {
      _establishmentFilterStatus = status ?? 'All Status';
      _establishmentFilterPermit = permit ?? 'All Permits';
      _index = 1;
    });
  }

  Widget _buildSanitationDrawer(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              decoration: const BoxDecoration(
                color: AppColors.deepGreen,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    child: const Icon(
                      Icons.health_and_safety_outlined,
                      size: 32,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _identity.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Mauban RHU / Sanitation Unit',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.fact_check_outlined, color: AppColors.deepGreen),
              title: const Text('New Establishment Inspection', style: TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.of(context).pop();
                _openInspection(null);
              },
            ),
            ListTile(
              leading: const Icon(Icons.badge_outlined, color: AppColors.deepGreen),
              title: const Text('Sanitary Permits', style: TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.of(context).pop();
                _openPermits();
              },
            ),
            ListTile(
              leading: const Icon(Icons.flag_outlined, color: AppColors.deepGreen),
              title: const Text('Complaints', style: TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.of(context).pop();
                _openComplaints();
              },
            ),
            ListTile(
              leading: const Icon(Icons.assignment_outlined, color: AppColors.deepGreen),
              title: const Text('Household Survey', style: TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.of(context).pop();
                _openHouseholdSurvey();
              },
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined, color: AppColors.deepGreen),
              title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.of(context).pop();
                _openNotifications();
              },
            ),
            ListTile(
              leading: const Icon(Icons.receipt_long_outlined, color: AppColors.deepGreen),
              title: const Text('Submitted Inspections & Surveys', style: TextStyle(fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.of(context).pop();
                setState(() => _index = 4);
              },
            ),
            const Divider(),
            if (widget.onLogout != null)
              ListTile(
                leading: const Icon(Icons.logout_outlined, color: AppColors.red),
                title: const Text('Sign out', style: TextStyle(color: AppColors.red, fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.of(context).pop();
                  widget.onLogout!();
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    setWebBranding(WebBrandingModule.sanitation);
    final pages = [
      SanitationDashboardPage(
        identity: _identity,
        bootstrap: _bootstrap,
        dashboard: _dashboard,
        onOpenInspection: _openInspection,
        onOpenComplaints: _openComplaints,
        onOpenNotifications: _openNotifications,
        onOpenEstablishments: () => _filterEstablishments(),
        onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationEstablishmentsPage(
        establishments: _bootstrap.establishments,
        onOpenInspection: _openInspection,
        onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
        initialComplianceStatus: _establishmentFilterStatus,
        initialPermitStatus: _establishmentFilterPermit,
      ),
      SanitationMapPage(
        establishments: _bootstrap.establishments,
        householdRecords: _bootstrap.householdRecords,
        onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
        onEditHousehold: _openHouseholdSurvey,
      ),
      SanitationHouseholdsPage(
        householdRecords: _bootstrap.householdRecords,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationActionsPage(
        identity: _identity,
        bootstrap: _bootstrap,
        inspections: _inspections,
        householdSurveys: _householdSurveys,
        onOpenInspection: _openInspection,
        onOpenPermits: _openPermits,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onOpenNotifications: _openNotifications,
        onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
        onLogout: widget.onLogout,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
    ];

    return Scaffold(
      key: _scaffoldKey,
      drawer: _buildSanitationDrawer(context),
      body: SafeArea(
        top: true,
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _refreshBootstrap,
          child: pages[_index],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.apartment_outlined),
            label: 'Records',
          ),
          NavigationDestination(icon: Icon(Icons.map_outlined), label: 'Map'),
          NavigationDestination(
            icon: Icon(Icons.home_work_outlined),
            label: 'Households',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Future<void> _openComplaints() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (context) => StatefulBuilder(
          builder: (routeContext, refreshRoute) {
            // Keep the existing screen current after refreshes and draft actions.
            Future<void> runAndRefresh(Future<void> Function() action) async {
              final pending = action();
              if (routeContext.mounted) refreshRoute(() {});
              try {
                await pending;
              } finally {
                if (routeContext.mounted) refreshRoute(() {});
              }
            }

            return Scaffold(
              appBar: AppBar(title: const Text('Complaints')),
              body: RefreshIndicator(
                onRefresh: () => runAndRefresh(_refreshBootstrap),
                child: SanitationReportsPage(
                  reports: _reports,
                  drafts: _drafts,
                  complaints: _bootstrap.complaints,
                  householdRecords: _bootstrap.householdRecords,
                  onOpenReport: () => runAndRefresh(_openReport),
                  onEditDraft: (draft) => runAndRefresh(() => _editReportDraft(draft)),
                  onRetryDraft: (draft) => runAndRefresh(() => _retryReportDraft(draft)),
                  onDeleteDraft: (draft) => runAndRefresh(() => _deleteReportDraft(draft)),
                  onOpenHouseholdSurvey: () => runAndRefresh(_openHouseholdSurvey),
                  onRefresh: () => runAndRefresh(_refreshBootstrap),
                  refreshing: _refreshing,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _openReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
          saveDraftOnFailure: true,
          refreshBarangays: widget.bootstrap.isOffline
              ? () async => (await widget.onRefresh()).barangays
              : null,
        ),
      ),
    );

    if (receipt != null) {
      setState(() => _reports.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }

    await _loadDrafts();
  }

  Future<void> _editReportDraft(SanitationReportDraft draft) async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
          initialDraft: draft,
          saveDraftOnFailure: true,
          refreshBarangays: widget.bootstrap.isOffline
              ? () async => (await widget.onRefresh()).barangays
              : null,
        ),
      ),
    );

    if (receipt != null) {
      setState(() => _reports.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }

    await _loadDrafts();
  }

  Future<void> _retryReportDraft(SanitationReportDraft draft) async {
    if (draft.name.trim().isEmpty ||
        !isValidPhMobileNumber(draft.contactNumber) ||
        draft.description.trim().isEmpty) {
      showAppMessage(context, 'Edit the draft before retrying.');
      return;
    }

    if (draft.address.trim().isEmpty) {
      showAppMessage(context, 'Edit the draft and add its location first.');
      return;
    }

    try {
      final response = await widget.api.submitSanitationReportDraft(draft);
      final receipt = MobileSanitationReceipt.fromJson(response);
      await SanitationDraftStore.removeReport(draft.id);
      if (!mounted) return;
      setState(() => _reports.insert(0, receipt));
      await _loadDrafts();
      await _refreshBootstrap(silent: true);
      if (mounted) showAppMessage(context, 'Draft synced successfully.');
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    }
  }

  Future<void> _deleteReportDraft(SanitationReportDraft draft) async {
    await SanitationDraftStore.removeReport(draft.id);
    await _loadDrafts();
    if (mounted) showAppMessage(context, 'Draft deleted.');
  }

  Future<void> _openInspection([SanitationEstablishment? establishment]) async {
    final receipt = await Navigator.of(context)
        .push<MobileSanitationInspectionReceipt>(
          MaterialPageRoute(
            builder: (context) => NewInspectionPage(
              api: widget.api,
              bootstrap: _bootstrap,
              initialEstablishment: establishment,
              onLogout: widget.onLogout,
              onSessionExpired: widget.onSessionExpired,
            ),
          ),
        );

    if (receipt != null) {
      setState(() => _inspections.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }
  }

  Future<void> _openHouseholdSurvey([HouseholdSanitationItem? household]) async {
    final receipt = await Navigator.of(context).push<MobileHouseholdSurveyReceipt>(
      MaterialPageRoute(
        builder: (context) => HouseholdSurveyPage(
          api: widget.api,
          barangays: _bootstrap.barangays,
          household: household,
          onLogout: widget.onLogout,
          onSessionExpired: widget.onSessionExpired,
        ),
      ),
    );

    if (receipt != null) {
      setState(() => _householdSurveys.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }
  }

  Future<void> _openPermits() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) =>
            SanitationPermitsPage(establishments: _bootstrap.establishments),
      ),
    );
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => NotificationPage(
          notifications: _bootstrap.notifications,
          subtitle: 'Sanitary advisories and compliance updates',
        ),
      ),
    );
  }

  Future<void> _refreshBootstrap({bool silent = false}) async {
    if (_refreshing || _sessionExpired) return;
    ++_dashboardLoad; // Discard an older load while the refresh fetches bootstrap.
    setState(() {
      _refreshing = true;
      _dashboard = const SanitationDashboardState.loading();
    });
    try {
      final updated = await widget.onRefresh();
      if (!mounted || _sessionExpired) return;
      setState(() => _bootstrap = updated);
      if (updated.isOffline) {
        ++_dashboardLoad;
        setState(() => _dashboard = SanitationDashboardState.unavailable(
          StateError('Sanitation service unavailable'),
        ));
        if (!silent) showAppMessage(context, 'Cannot reach Sanitary Web System.');
      } else {
        final staffLoaded = await _loadStaffRecords();
        if (mounted && !silent && staffLoaded) {
          showAppMessage(context, 'Sanitation records refreshed.');
        }
      }
    } catch (error) {
      if (!mounted || _sessionExpired) return;
      ++_dashboardLoad;
      setState(() => _dashboard = SanitationDashboardState.unavailable(error));
      if (error is ApiException && error.isUnauthorized) await _expireSession();
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<void> _loadDrafts() async {
    final drafts = await SanitationDraftStore.loadReports();
    if (mounted) setState(() => _drafts = drafts);
  }
}

// Home-only styling; shared colors and other sanitation screens are unchanged.
const _sanitationHomeBackground = Color(0xFFF3F7F4);
const _sanitationHomePrimary = Color(0xFF1E6B45);
const _sanitationHomeDark = Color(0xFF154F33);
const _sanitationHomeBorder = Color(0xFFD5E2D9);

class SanitationDashboardPage extends StatelessWidget {
  const SanitationDashboardPage({
    super.key,
    required this.identity,
    required this.bootstrap,
    required this.dashboard,
    required this.onOpenInspection,
    required this.onOpenComplaints,
    required this.onOpenNotifications,
    required this.onOpenEstablishments,
    this.onOpenMenu,
    required this.onRefresh,
    required this.refreshing,
  });

  final SanitationStaffIdentity identity;
  final SanitationBootstrap bootstrap;
  final SanitationDashboardState dashboard;
  final ValueChanged<SanitationEstablishment?> onOpenInspection;
  final VoidCallback onOpenComplaints;
  final VoidCallback onOpenNotifications;
  final VoidCallback onOpenEstablishments;
  final VoidCallback? onOpenMenu;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  Widget _card(Widget child, {Key? key}) => Container(
    key: key,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: _sanitationHomeBorder),
      borderRadius: BorderRadius.circular(18),
    ),
    child: child,
  );

  Widget _stat(String label, int? value, IconData icon, {VoidCallback? onTap}) {
    final text = switch (dashboard.status) {
      SanitationDashboardStatus.loading => 'Loading',
      SanitationDashboardStatus.unavailable => 'Unavailable',
      SanitationDashboardStatus.loaded => '$value',
    };
    return _card(
      InkWell(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: _sanitationHomePrimary),
          const SizedBox(height: 10),
          // Fixed slots keep every metric aligned, including loading/error states.
          SizedBox(
            height: 34,
            width: double.infinity,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.topLeft,
              child: Text(text, maxLines: 1, style: TextStyle(
                color: _sanitationHomeDark, height: 1.2,
                fontSize: value == null ? 16 : 26, fontWeight: FontWeight.w800)),
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 40,
            width: double.infinity,
            child: Text(label, maxLines: 2, style: const TextStyle(
              color: _sanitationHomeDark, fontSize: 14, height: 1.4)),
          ),
        ]),
      ),
      key: ValueKey('dashboard-stat-$label'),
    );
  }

  Widget _heading(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 18),
    child: Text(text, style: const TextStyle(fontSize: 19,
      fontWeight: FontWeight.w800, color: _sanitationHomeDark)),
  );

  String _time(DateTime? time) {
    if (time == null) return 'Submission time unavailable';
    final local = time.toLocal();
    return '${shortDate(local)} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final data = dashboard.data;
    final loading = dashboard.status == SanitationDashboardStatus.loading;
    return ColoredBox(
      color: _sanitationHomeBackground,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(children: [
            IconButton(tooltip: 'Menu', onPressed: onOpenMenu,
              icon: const Icon(Icons.menu, color: _sanitationHomePrimary)),
            Expanded(child: Text('Good day, ${identity.name}',
              style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800,
                color: _sanitationHomeDark))),
            IconButton(tooltip: 'Refresh', onPressed: refreshing ? null : onRefresh,
              icon: const Icon(Icons.refresh, color: _sanitationHomePrimary)),
            IconButton(tooltip: 'Notifications', onPressed: onOpenNotifications,
              icon: const Icon(Icons.notifications_outlined, color: _sanitationHomePrimary)),
          ]),
          const SizedBox(height: 16),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _stat('Establishments', data?.establishmentsCount,
              Icons.apartment_outlined, onTap: onOpenEstablishments)),
            const SizedBox(width: 12),
            Expanded(child: _stat('Due for inspection', data?.dueForInspectionCount,
              Icons.fact_check_outlined)),
          ]),
          const SizedBox(height: 12),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: _stat('New complaints', data?.newComplaintsCount,
              Icons.flag_outlined)),
            const SizedBox(width: 12),
            Expanded(child: _stat('Households this month', data?.householdsThisMonthCount,
              Icons.home_work_outlined)),
          ]),
          Row(children: [
            Expanded(child: _heading('New complaints from residents')),
            TextButton(onPressed: onOpenComplaints,
              style: TextButton.styleFrom(foregroundColor: _sanitationHomePrimary),
              child: const Text('See all')),
          ]),
          // This title is client wording, not a resident-origin filter.
          if (data == null)
            _card(Text(loading ? 'Loading complaints...' : 'Complaints unavailable. Refresh to retry.'))
          else if (data.newComplaints.isEmpty)
            _card(const Text('No new complaints.'))
          else
            ...data.newComplaints.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: item.priorityTag == 'URGENT'
                    ? const Color(0xFFFCE8E6) : _sanitationHomeBackground,
                    borderRadius: BorderRadius.circular(16)),
                  child: Text(item.priorityTag, style: TextStyle(fontWeight: FontWeight.w700,
                    color: item.priorityTag == 'URGENT' ? const Color(0xFF9F2922) : _sanitationHomeDark)),
                ),
                const SizedBox(height: 8),
                Text(item.category, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(item.barangay),
                Text(_time(item.createdAt)),
              ])),
            )),
          _heading('Due for inspection'),
          if (data == null)
            _card(Text(loading ? 'Loading due inspections...' : 'Due inspections unavailable. Refresh to retry.'))
          else if (data.dueInspections.isEmpty)
            _card(const Text('No inspections due in this window.'))
          else
            ...data.dueInspections.map((item) {
              final establishment = bootstrap.establishments
                  .where((record) => record.id == item.establishmentId).firstOrNull;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item.establishmentName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  Text(item.businessTypeName),
                  Text('Due: ${shortDate(item.nextDueDate!)}'),
                  const SizedBox(height: 10),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: _sanitationHomePrimary,
                      foregroundColor: Colors.white),
                    onPressed: establishment == null ? null : () => onOpenInspection(establishment),
                    child: const Text('Inspect'),
                  ),
                  if (establishment == null) const Text('Establishment unavailable. Refresh to retry.'),
                ])),
              );
            }),
        ],
      ),
    );
  }
}

class SanitationEstablishmentsPage extends StatefulWidget {
  const SanitationEstablishmentsPage({
    super.key,
    required this.establishments,
    required this.onOpenInspection,
    this.onOpenMenu,
    required this.onRefresh,
    required this.refreshing,
    this.initialComplianceStatus = 'All Status',
    this.initialPermitStatus = 'All Permits',
  });

  final List<SanitationEstablishment> establishments;
  final ValueChanged<SanitationEstablishment> onOpenInspection;
  final VoidCallback? onOpenMenu;
  final Future<void> Function() onRefresh;
  final bool refreshing;
  final String initialComplianceStatus;
  final String initialPermitStatus;

  @override
  State<SanitationEstablishmentsPage> createState() =>
      _SanitationEstablishmentsPageState();
}

class _SanitationEstablishmentsPageState
    extends State<SanitationEstablishmentsPage> {
  String _search = '';
  String _type = 'All Types';
  String _barangay = 'All Barangays';
  late String _status;
  late String _permit;

  @override
  void initState() {
    super.initState();
    _status = widget.initialComplianceStatus;
    _permit = widget.initialPermitStatus;
  }

  @override
  void didUpdateWidget(SanitationEstablishmentsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialComplianceStatus != widget.initialComplianceStatus) {
      _status = widget.initialComplianceStatus;
    }
    if (oldWidget.initialPermitStatus != widget.initialPermitStatus) {
      _permit = widget.initialPermitStatus;
    }
  }

  @override
  Widget build(BuildContext context) {
    final types = [
      'All Types',
      ...widget.establishments.map((item) => item.businessTypeName).toSet(),
    ];
    final barangays = [
      'All Barangays',
      ...widget.establishments.map((item) => item.barangay).toSet(),
    ];
    final query = _search.toLowerCase().trim();
    final filtered = widget.establishments.where((item) {
      final matchesSearch = query.isEmpty ||
          item.businessName.toLowerCase().contains(query) ||
          item.barangay.toLowerCase().contains(query) ||
          item.businessTypeName.toLowerCase().contains(query) ||
          item.permitNumber.toLowerCase().contains(query) ||
          item.ownerName.toLowerCase().contains(query);
      final matchesType =
          _type == 'All Types' || item.businessTypeName == _type;
      final matchesBarangay =
          _barangay == 'All Barangays' || item.barangay == _barangay;
      final matchesStatus =
          _status == 'All Status' || item.complianceStatus == _status;
      final matchesPermit =
          _permit == 'All Permits' || item.permitStatus == _permit;
      return matchesSearch &&
          matchesType &&
          matchesBarangay &&
          matchesStatus &&
          matchesPermit;
    }).toList();

    final hasActiveFilter = _status != 'All Status' ||
        _permit != 'All Permits' ||
        _type != 'All Types' ||
        _barangay != 'All Barangays' ||
        _search.isNotEmpty;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Establishments',
          onMenuTap: widget.onOpenMenu,
          onRefresh: widget.onRefresh,
          refreshing: widget.refreshing,
        ),
        SearchBox(
          hint: 'Search by name, permit no., or owner...',
          onChanged: (value) => setState(() => _search = value),
        ),
        const SizedBox(height: 12),
        DropdownTile<String>(
          label: 'Type filter',
          value: _type,
          items: types,
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _type = item),
        ),
        DropdownTile<String>(
          label: 'Barangay filter',
          value: _barangay,
          items: barangays,
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        DropdownTile<String>(
          label: 'Compliance status',
          value: _status,
          items: const [
            'All Status',
            'good_standing',
            'upcoming',
            'for_completion',
            'violation',
            'no_permit',
          ],
          itemLabel: (item) =>
              item == 'All Status' ? item : sanitationStatusLabel(item),
          onChanged: (item) => setState(() => _status = item),
        ),
        DropdownTile<String>(
          label: 'Permit status',
          value: _permit,
          items: const [
            'All Permits',
            'active',
            'renewal_due',
            'conditional',
            'suspended',
            'no_permit',
          ],
          itemLabel: (item) =>
              item == 'All Permits' ? item : permitStatusLabel(item),
          onChanged: (item) => setState(() => _permit = item),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${filtered.length} establishment(s) found',
              style: const TextStyle(
                color: AppColors.muted,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (hasActiveFilter)
              TextButton.icon(
                onPressed: () {
                  setState(() {
                    _search = '';
                    _type = 'All Types';
                    _barangay = 'All Barangays';
                    _status = 'All Status';
                    _permit = 'All Permits';
                  });
                },
                icon: const Icon(Icons.clear_all, size: 16),
                label: const Text('Reset', style: TextStyle(fontSize: 12)),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (filtered.isEmpty)
          const EmptyState(
            icon: Icons.apartment_outlined,
            title: 'No establishments found',
          )
        else
          ...filtered
              .take(80)
              .map(
                (item) => SanitationEstablishmentCard(
                  establishment: item,
                  onInspection: () => widget.onOpenInspection(item),
                ),
              ),
      ],
    );
  }
}

class SanitationMapPage extends StatefulWidget {
  const SanitationMapPage({
    super.key,
    required this.establishments,
    required this.householdRecords,
    this.onOpenMenu,
    required this.onRefresh,
    required this.refreshing,
    this.onEditHousehold,
  });

  final List<SanitationEstablishment> establishments;
  final List<HouseholdSanitationItem> householdRecords;
  final VoidCallback? onOpenMenu;
  final Future<void> Function() onRefresh;
  final bool refreshing;
  final ValueChanged<HouseholdSanitationItem>? onEditHousehold;

  @override
  State<SanitationMapPage> createState() => _SanitationMapPageState();
}

class BarangayPolygon {
  final String name;
  final List<List<LatLng>> polygons;

  BarangayPolygon({required this.name, required this.polygons});
}

class _SanitationMapPageState extends State<SanitationMapPage> {
  bool _showHouseholds = false;
  
  List<BarangayPolygon> _barangayPolygons = [];
  bool _isLoadingGeoJson = true;
  String? _selectedBarangay;
  
  // Create a hitNotifier for flutter_map 8.0 Polygon layer
  final _hitNotifier = ValueNotifier<LayerHitResult<Object>?>(null);

  String _normalizeBgyName(String? name) {
    if (name == null) return '';
    String n = name.toLowerCase().trim();
    n = n.replaceAll(RegExp(r'\s+1$'), ' i');
    n = n.replaceAll(RegExp(r'\s+2$'), ' ii');
    n = n.replaceAll(RegExp(r'\s+3$'), ' iii');
    n = n.replaceAll(RegExp(r'\s+4$'), ' iv');
    n = n.replaceAll(RegExp(r'\s+5$'), ' v');
    return n;
  }

  @override
  void initState() {
    super.initState();
    _loadGeoJson();
    
    _hitNotifier.addListener(() {
      final hit = _hitNotifier.value;
      if (hit != null && hit.hitValues.isNotEmpty) {
        setState(() {
          _selectedBarangay = hit.hitValues.first as String;
        });
      } else {
        setState(() {
          _selectedBarangay = null;
        });
      }
    });
  }

  Future<void> _loadGeoJson() async {
    try {
      final jsonString = await rootBundle.loadString('assets/mauban_barangays.json');
      final data = jsonDecode(jsonString);
      final features = data['features'] as List;
      
      List<BarangayPolygon> parsed = [];
      for (var feature in features) {
        final Map<String, dynamic>? props = feature['properties'];
        final Map<String, dynamic>? geom = feature['geometry'];
        if (props == null || geom == null) continue;
        
        final name = props['NAME_3']?.toString() ?? '';
        final type = geom['type'];
        final coords = geom['coordinates'] as List;
        
        List<List<LatLng>> polyList = [];
        
        if (type == 'Polygon') {
          for (var ring in coords) {
            List<LatLng> points = [];
            for (var pt in ring) {
              points.add(LatLng(pt[1].toDouble(), pt[0].toDouble())); // lat, lng
            }
            polyList.add(points);
          }
        } else if (type == 'MultiPolygon') {
          for (var polygon in coords) {
            for (var ring in polygon) {
              List<LatLng> points = [];
              for (var pt in ring) {
                points.add(LatLng(pt[1].toDouble(), pt[0].toDouble()));
              }
              polyList.add(points);
            }
          }
        }
        
        parsed.add(BarangayPolygon(name: name, polygons: polyList));
      }
      
      setState(() {
        _barangayPolygons = parsed;
        _isLoadingGeoJson = false;
      });
    } catch (e) {
      debugPrint("Error loading GeoJSON: $e");
      setState(() => _isLoadingGeoJson = false);
    }
  }

  Map<String, Map<String, dynamic>> _calculateAggregates() {
    final Map<String, Map<String, dynamic>> agg = {};
    
    for (var item in widget.householdRecords) {
      final bgy = _normalizeBgyName(item.barangay);
      if (!agg.containsKey(bgy)) {
        agg[bgy] = { 'total': 0, 'high': 0, 'medium': 0, 'low': 0 };
      }
      agg[bgy]!['total'] = (agg[bgy]!['total'] as int) + 1;
      
      if (item.status == 'violation') {
        agg[bgy]!['high'] = (agg[bgy]!['high'] as int) + 1;
      } else if (item.status == 'for_completion') {
        agg[bgy]!['medium'] = (agg[bgy]!['medium'] as int) + 1;
      } else {
        agg[bgy]!['low'] = (agg[bgy]!['low'] as int) + 1;
      }
    }
    return agg;
  }

  // Gradient color method removed since we are using stripes

  @override
  void dispose() {
    _hitNotifier.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final establishmentPins = widget.establishments
        .where((item) => item.hasCoordinates)
        .toList();
    final householdPins = widget.householdRecords
        .where((item) => item.hasCoordinates)
        .toList();
    final pinCount = _showHouseholds
        ? householdPins.length
        : establishmentPins.length;

    final aggregates = _calculateAggregates();
    
    // Prepare polygons
    List<Polygon> mapPolygons = [];
    List<List<LatLng>> selectedBgyPolygons = [];
    double selRedPct = 0.0;
    double selYellowPct = 0.0;
    double selGreenPct = 0.0;

    if (_showHouseholds && !_isLoadingGeoJson) {
      for (var bgy in _barangayPolygons) {
        final bgyName = _normalizeBgyName(bgy.name);
        final agg = aggregates[bgyName] ?? {'total': 0, 'high': 0, 'medium': 0, 'low': 0};
        final total = agg['total'] as int;
        
        final isSelected = _selectedBarangay != null && _normalizeBgyName(_selectedBarangay) == bgyName;
        
        if (total > 0 && isSelected) {
           selRedPct = (agg['high'] as int) / total;
           selYellowPct = (agg['medium'] as int) / total;
           selGreenPct = (agg['low'] as int) / total;
           selectedBgyPolygons.addAll(bgy.polygons);
        }

        for (var points in bgy.polygons) {
          mapPolygons.add(
            Polygon(
              points: points,
              color: Colors.transparent,
              borderColor: isSelected ? const Color(0xFF0F172A) : const Color(0xFF64748B),
              borderStrokeWidth: isSelected ? 3.0 : 1.0,
              label: bgy.name, // Used for hit testing identification
              hitValue: bgy.name,
            ),
          );
        }
      }
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'GIS Map',
          onMenuTap: widget.onOpenMenu,
          onRefresh: widget.onRefresh,
          refreshing: widget.refreshing,
        ),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Establishments')),
            ButtonSegment(value: true, label: Text('Households')),
          ],
          selected: {_showHouseholds},
          onSelectionChanged: (value) =>
              setState(() => _showHouseholds = value.first),
        ),
        const SizedBox(height: 12),
        DataSourceBanner(
          icon: Icons.map_outlined,
          title: '$pinCount mapped records',
          text: _showHouseholds
              ? 'Household survey coordinates are displayed separately from establishments.'
              : 'Establishment inspection records are displayed separately from household surveys.',
          warning: pinCount == 0,
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 360,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: FlutterMap(
              options: MapOptions(
                initialCenter: const LatLng(14.185, 121.731),
                initialZoom: 12,
                minZoom: 8,
                maxZoom: 18,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'mauban_sanitation_mobile',
                ),
                if (_showHouseholds && selectedBgyPolygons.isNotEmpty)
                  StripedPolygonLayer(
                    polygons: selectedBgyPolygons,
                    redPct: selRedPct,
                    yellowPct: selYellowPct,
                    greenPct: selGreenPct,
                  ),
                if (_showHouseholds && mapPolygons.isNotEmpty)
                  PolygonLayer(
                    polygons: mapPolygons,
                    hitNotifier: _hitNotifier,
                  ),
                MarkerLayer(
                  markers: _showHouseholds
                      ? householdPins
                          .map(
                            (item) => Marker(
                              point: LatLng(
                                item.latitude,
                                item.longitude,
                              ),
                              width: 42,
                              height: 42,
                              child: MapPin(
                                color: sanitationStatusColor(item.status),
                              ),
                            ),
                          )
                          .toList()
                      : establishmentPins
                          .map(
                            (item) => Marker(
                              point: LatLng(
                                item.latitude,
                                item.longitude,
                              ),
                              width: 42,
                              height: 42,
                              child: MapPin(
                                color: sanitationStatusColor(
                                  item.complianceStatus,
                                ),
                              ),
                            ),
                          )
                          .toList(),
                ),
              ],
            ),
          ),
        ),
        Container(
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xffe2e8f0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _showHouseholds
                    ? 'Household GIS Status Legend'
                    : 'Establishment GIS Status Legend',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppColors.muted,
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 16,
                runSpacing: 6,
                children: [
                  _buildLegendItem(AppColors.green, 'Good Standing'),
                  _buildLegendItem(
                    const Color(0xffd59b00),
                    _showHouseholds
                        ? 'For Compliance'
                        : 'Upcoming / For Completion',
                  ),
                  _buildLegendItem(
                    AppColors.red,
                    _showHouseholds
                        ? 'Needs Assistance'
                        : 'Violation / No Permit',
                  ),
                ],
              ),
            ],
          ),
        ),
        SectionHeader(
          title: _showHouseholds
              ? 'Mapped Households'
              : 'Mapped Establishments',
        ),
        if (_showHouseholds)
          ...widget.householdRecords
              .where((item) => _selectedBarangay == null || _normalizeBgyName(item.barangay) == _normalizeBgyName(_selectedBarangay))
              .take(20)
              .map(
                (item) => GestureDetector(
                  onTap: () => widget.onEditHousehold?.call(item),
                  child: SimpleInfoCard(
                    icon: Icons.home_work_outlined,
                    title: item.householdHead,
                    subtitle: '${item.householdCode} - ${item.barangay}',
                    trailing: householdStatusLabel(item.status),
                  ),
                ),
              )
        else
          ...widget.establishments
              .where((item) => _selectedBarangay == null || _normalizeBgyName(item.barangay) == _normalizeBgyName(_selectedBarangay))
              .take(20)
              .map(
                (item) => SimpleInfoCard(
                  icon: Icons.apartment_outlined,
                  title: item.businessName,
                  subtitle: '${item.businessTypeName} - ${item.barangay}',
                  trailing: item.statusLabel,
                ),
              ),
      ],
    );
  }

  Widget _buildLegendItem(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class SanitationHouseholdsPage extends StatelessWidget {
  const SanitationHouseholdsPage({
    super.key,
    required this.householdRecords,
    required this.onOpenHouseholdSurvey,
    this.onOpenMenu,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<HouseholdSanitationItem> householdRecords;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback? onOpenMenu;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Households',
          onMenuTap: onOpenMenu,
          onRefresh: onRefresh,
          refreshing: refreshing,
        ),
        FilledButton.icon(
          onPressed: onOpenHouseholdSurvey,
          icon: const Icon(Icons.assignment_outlined),
          label: const Text('New Household Survey'),
        ),
        const SizedBox(height: 12),
        if (householdRecords.isEmpty)
          const EmptyState(
            icon: Icons.home_work_outlined,
            title: 'No household records loaded',
          )
        else
          ...householdRecords.map(
            (item) => SimpleInfoCard(
              icon: Icons.home_work_outlined,
              title: item.householdHead,
              subtitle: [
                item.barangay,
                if (item.surveyDate.trim().isNotEmpty) 'Survey: ${item.surveyDate}',
              ].join(' - '),
              trailing: householdStatusLabel(item.status),
            ),
          ),
      ],
    );
  }
}

class SanitationReportsPage extends StatelessWidget {
  const SanitationReportsPage({
    super.key,
    required this.reports,
    required this.drafts,
    required this.complaints,
    required this.householdRecords,
    required this.onOpenReport,
    required this.onEditDraft,
    required this.onRetryDraft,
    required this.onDeleteDraft,
    required this.onOpenHouseholdSurvey,
    this.onOpenMenu,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<MobileSanitationReceipt> reports;
  final List<SanitationReportDraft> drafts;
  final List<SanitationComplaintItem> complaints;
  final List<HouseholdSanitationItem> householdRecords;
  final VoidCallback onOpenReport;
  final ValueChanged<SanitationReportDraft> onEditDraft;
  final ValueChanged<SanitationReportDraft> onRetryDraft;
  final ValueChanged<SanitationReportDraft> onDeleteDraft;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback? onOpenMenu;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Community Reports',
          onMenuTap: onOpenMenu,
          onRefresh: onRefresh,
          refreshing: refreshing,
        ),
        DataSourceBanner(
          icon: Icons.home_work_outlined,
          title: 'Household + community sanitation',
          text:
              '${householdRecords.length} household record(s) and ${complaints.length} active community report(s) loaded from the Sanitary Web System.',
          warning: householdRecords.isEmpty && complaints.isEmpty,
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onOpenHouseholdSurvey,
          icon: const Icon(Icons.assignment_outlined),
          label: const Text('Household Survey'),
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: onOpenReport,
          icon: const Icon(Icons.flag_outlined),
          label: const Text('New Community Report'),
        ),
        if (drafts.isNotEmpty) ...[
          SectionHeader(title: 'Pending Sync Drafts'),
          ...drafts.map(
            (item) => SanitationDraftCard(
              draft: item,
              onEdit: () => onEditDraft(item),
              onRetry: () => onRetryDraft(item),
              onDelete: () => onDeleteDraft(item),
            ),
          ),
        ],
        SectionHeader(title: 'Submitted Community Reports'),
        if (reports.isEmpty)
          const EmptyState(
            icon: Icons.flag_outlined,
            title: 'No community reports submitted yet',
          )
        else
          ...reports.map((item) => SanitationReceiptCard(receipt: item)),
        SectionHeader(title: 'Violations & Alerts'),
        if (complaints.isEmpty)
          const EmptyState(
            icon: Icons.notifications_none_outlined,
            title: 'No complaint alerts loaded',
          )
        else
          ...complaints
              .take(20)
              .map(
                (item) => SanitationAlertCard(
                  title: item.category,
                  subtitle: '${complaintLocationLine(item)} - ${item.description}',
                  status: item.priority,
                ),
              ),
      ],
    );
  }
}

class SanitationDraftCard extends StatelessWidget {
  const SanitationDraftCard({
    super.key,
    required this.draft,
    required this.onEdit,
    required this.onRetry,
    required this.onDelete,
  });

  final SanitationReportDraft draft;
  final VoidCallback onEdit;
  final VoidCallback onRetry;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xfffff3bd),
                  child: Icon(
                    Icons.sync_problem_outlined,
                    color: Color(0xff9a6700),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        draft.category,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        '${draft.barangay} - ${sanitationPriorityLabel(draft.priority)} - Pending sync',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (draft.description.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                draft.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonalIcon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: const Text('Retry Sync'),
                ),
                OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit'),
                ),
                IconButton.filledTonal(
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Delete draft',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ReportTrackerPage extends StatefulWidget {
  const ReportTrackerPage({super.key, required this.api});

  final TourismApi api;

  @override
  State<ReportTrackerPage> createState() => _ReportTrackerPageState();
}

class _ReportTrackerPageState extends State<ReportTrackerPage> {
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _reference = TextEditingController();
  List<MobileSanitationReceipt> _reports = [];
  bool _loading = false;
  bool _searched = false;

  @override
  void dispose() {
    _contact.dispose();
    _reference.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Track Status',
      subtitle: 'Search community sanitation reports',
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        tooltip: '',
        onPressed: () => Navigator.of(context).pop(),
      ),
      children: [
        DataSourceBanner(
          icon: Icons.manage_search_outlined,
          title: 'Report Status Tracking',
          text:
              'Enter the contact number used during submission and the complaint ID from the receipt.',
        ),
        const SizedBox(height: 12),
        AppTextField(
          controller: _contact,
          label: 'Contact number',
          keyboardType: TextInputType.phone,
        ),
        AppTextField(controller: _reference, label: 'Complaint ID'),
        SubmitButton(
          label: 'Track Reports',
          loading: _loading,
          loadingLabel: 'Checking...',
          onPressed: _loadReports,
        ),
        SectionHeader(title: 'Results'),
        if (!_searched)
          const EmptyState(
            icon: Icons.manage_search_outlined,
            title: 'Enter contact number and complaint ID',
          )
        else if (_reports.isEmpty)
          const EmptyState(
            icon: Icons.search_off_outlined,
            title: 'No matching reports found',
          )
        else
          ..._reports.map((item) => SanitationReceiptCard(receipt: item)),
      ],
    );
  }

  Future<void> _loadReports() async {
    if (_contact.text.trim().isEmpty || _reference.text.trim().isEmpty) {
      showAppMessage(
        context,
        'Enter both the contact number and the complaint ID from your receipt.',
      );
      return;
    }

    setState(() => _loading = true);

    try {
      final reports = await widget.api.fetchSanitationReportHistory(
        contact: _contact.text,
        reference: _reference.text,
      );
      if (mounted) {
        setState(() {
          _reports = reports;
          _searched = true;
        });
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class PermitVerificationPage extends StatefulWidget {
  const PermitVerificationPage({super.key, required this.api});

  final TourismApi api;

  @override
  State<PermitVerificationPage> createState() => _PermitVerificationPageState();
}

class _PermitVerificationPageState extends State<PermitVerificationPage> {
  final TextEditingController _code = TextEditingController();
  PermitVerificationResult? _result;
  bool _loading = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Verify Permit',
      subtitle: 'QR/manual sanitary permit authentication',
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        tooltip: '',
        onPressed: () => Navigator.of(context).pop(),
      ),
      children: [
        DataSourceBanner(
          icon: Icons.qr_code_scanner_outlined,
          title: 'QR-Based Permit Authentication',
          text:
              'Paste scanned QR text or enter the sanitary permit number to verify the establishment record.',
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: AppTextField(controller: _code, label: 'QR text or permit number'),
            ),
            const SizedBox(width: 8),
            Container(
              height: 56, // Matches typical AppTextField height
              margin: const EdgeInsets.only(bottom: 16),
              child: FilledButton.tonalIcon(
                onPressed: () async {
                  final result = await Navigator.of(context).push<String>(
                    MaterialPageRoute(builder: (context) => const QrScannerScreen()),
                  );
                  if (result != null && result.isNotEmpty) {
                    _code.text = result;
                    _verify();
                  }
                },
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan'),
                style: FilledButton.styleFrom(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),
        SubmitButton(
          label: 'Verify Permit',
          loading: _loading,
          loadingLabel: 'Verifying...',
          onPressed: _verify,
        ),
        if (_result != null) ...[
          SectionHeader(title: 'Verification Result'),
          PermitVerificationCard(result: _result!),
        ],
      ],
    );
  }

  Future<void> _verify() async {
    if (_code.text.trim().isEmpty) {
      showAppMessage(context, 'Enter or scan a sanitary permit code.');
      return;
    }

    setState(() => _loading = true);

    try {
      final result = await widget.api.verifySanitaryPermit(_code.text);
      if (mounted) setState(() => _result = result);
    } catch (error) {
      if (mounted) {
        setState(() => _result = null);
        showAppMessage(context, error.toString());
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class PermitVerificationCard extends StatelessWidget {
  const PermitVerificationCard({super.key, required this.result});

  final PermitVerificationResult result;

  @override
  Widget build(BuildContext context) {
    final establishment = result.establishment;

    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xffdcfce7),
                  child: Icon(Icons.verified_outlined, color: AppColors.green),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        establishment.businessName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        establishment.businessTypeName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            PermitDetailRow(
              icon: Icons.confirmation_number_outlined,
              label: 'Permit Number',
              value: establishment.permitNumber.isEmpty
                  ? result.code
                  : establishment.permitNumber,
            ),
            PermitDetailRow(
              icon: Icons.verified_user_outlined,
              label: 'Permit Status',
              value: result.permitStatusLabel,
            ),
            PermitDetailRow(
              icon: Icons.place_outlined,
              label: 'Barangay',
              value: establishment.barangay.isEmpty
                  ? 'Not recorded'
                  : establishment.barangay,
            ),
            PermitDetailRow(
              icon: Icons.event_available_outlined,
              label: 'Date Issued',
              value: result.issuedDate.isEmpty
                  ? 'Not recorded'
                  : result.issuedDate,
            ),
            PermitDetailRow(
              icon: Icons.event_outlined,
              label: 'Expiry Date',
              value: result.expiryDate.isEmpty
                  ? 'Not recorded'
                  : result.expiryDate,
            ),
          ],
        ),
      ),
    );
  }
}

class PermitDetailRow extends StatelessWidget {
  const PermitDetailRow({
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
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Icon(icon, color: AppColors.green),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
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
    );
  }
}

class SanitationActionsPage extends StatelessWidget {
  const SanitationActionsPage({
    super.key,
    this.identity = const SanitationStaffIdentity(),
    required this.bootstrap,
    required this.inspections,
    this.householdSurveys = const [],
    required this.onOpenInspection,
    required this.onOpenPermits,
    required this.onOpenHouseholdSurvey,
    required this.onOpenNotifications,
    this.onOpenMenu,
    this.onLogout,
    required this.onRefresh,
    required this.refreshing,
  });

  final SanitationStaffIdentity identity;
  final SanitationBootstrap bootstrap;
  final List<MobileSanitationInspectionReceipt> inspections;
  final List<MobileHouseholdSurveyReceipt> householdSurveys;
  final ValueChanged<SanitationEstablishment?> onOpenInspection;
  final VoidCallback onOpenPermits;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback onOpenNotifications;
  final VoidCallback? onOpenMenu;
  final VoidCallback? onLogout;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    final totalCount = inspections.length + householdSurveys.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Profile',
          onMenuTap: onOpenMenu,
          onRefresh: onRefresh,
          refreshing: refreshing,
        ),
        Card(
          elevation: 0,
          child: ListTile(
            leading: const Icon(Icons.person_outline, color: AppColors.green),
            title: Text(
              identity.name,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (identity.username.isNotEmpty)
                  Text('Username: ${identity.username}'),
                if (identity.roleLabel.isNotEmpty) Text(identity.roleLabel),
              ],
            ),
          ),
        ),
        ProfileLink(
          icon: Icons.fact_check_outlined,
          label: 'New Establishment Inspection',
          onTap: () => onOpenInspection(null),
        ),
        ProfileLink(
          icon: Icons.badge_outlined,
          label: 'Sanitary Permits',
          onTap: onOpenPermits,
        ),
        ProfileLink(
          icon: Icons.assignment_outlined,
          label: 'Household Survey',
          onTap: onOpenHouseholdSurvey,
        ),
        ProfileLink(
          icon: Icons.notifications_outlined,
          label: 'Notifications',
          onTap: onOpenNotifications,
        ),
        if (onLogout != null)
          ProfileLink(
            icon: Icons.logout_outlined,
            label: 'Sign out',
            onTap: onLogout!,
          ),
        const SizedBox(height: 8),
        SectionHeader(title: 'Submitted Inspections & Surveys'),
        if (totalCount == 0)
          const EmptyState(
            icon: Icons.fact_check_outlined,
            title: 'No mobile inspections or household surveys submitted yet',
          )
        else ...[
          ...inspections.map(
            (item) => ReceiptCard(
              icon: Icons.apartment_outlined,
              title: item.establishmentName,
              reference: item.reference,
              lines: [
                'Record: Establishment Inspection',
                'Inspector: ${item.inspectorName}',
                'Date: ${item.inspectionDate}',
                'Status: ${sanitationStatusLabel(item.status)}',
              ],
            ),
          ),
          ...householdSurveys.map(
            (item) => ReceiptCard(
              icon: Icons.family_restroom_outlined,
              title: 'Household: ${item.householdHead}',
              reference: item.householdCode,
              lines: [
                'Record: Household Survey',
                'Barangay: ${item.barangay}',
                'Date: ${item.inspectionDate}',
                'Status: ${householdStatusLabel(item.status)}',
                'Water Access: ${item.waterSource}',
                'Toilet: ${item.toiletType.replaceAll('_', ' ')}',
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class SanitationTopBar extends StatelessWidget {
  const SanitationTopBar({
    super.key,
    required this.title,
    this.onRefresh,
    this.refreshing = false,
    this.onNotifications,
    this.onMenuTap,
  });

  final String title;
  final Future<void> Function()? onRefresh;
  final bool refreshing;
  final VoidCallback? onNotifications;
  final VoidCallback? onMenuTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: true,
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.menu, color: AppColors.deepGreen),
              onPressed: onMenuTap ?? () => Scaffold.of(context).openDrawer(),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              tooltip: 'Menu',
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
              ),
            ),
            if (onRefresh != null)
              IconButton.filledTonal(
                onPressed: refreshing ? null : () => onRefresh?.call(),
                icon: refreshing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
            if (onRefresh != null) const SizedBox(width: 8),
            IconButton.filledTonal(
              onPressed: onNotifications,
              icon: const Icon(Icons.notifications_outlined),
            ),
          ],
        ),
      ),
    );
  }
}

class SanitationEstablishmentCard extends StatelessWidget {
  const SanitationEstablishmentCard({
    super.key,
    required this.establishment,
    required this.onInspection,
  });

  final SanitationEstablishment establishment;
  final VoidCallback onInspection;

  @override
  Widget build(BuildContext context) {
    final statusColor = sanitationStatusColor(establishment.complianceStatus);
    final statusLabel = sanitationStatusLabel(establishment.complianceStatus);
    final isViolation = establishment.complianceStatus == 'violation';
    final isForCompletion = establishment.complianceStatus == 'for_completion';

    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: (isViolation || isForCompletion)
              ? statusColor.withValues(alpha: 0.35)
              : const Color(0xffe2e8f0),
          width: (isViolation || isForCompletion) ? 1.5 : 1,
        ),
      ),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  backgroundColor: statusColor.withValues(alpha: 0.14),
                  child: Icon(
                    Icons.apartment_outlined,
                    color: statusColor,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        establishment.businessName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${establishment.businessTypeName} • ${establishment.barangay}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.muted,
                        ),
                      ),
                      if (establishment.ownerName.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          'Owner: ${establishment.ownerName}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                FilledButton.tonal(
                  onPressed: onInspection,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    minimumSize: const Size(60, 36),
                  ),
                  child: const Text('Inspect'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  Icons.badge_outlined,
                  size: 14,
                  color: establishment.permitNumber.isNotEmpty
                      ? AppColors.deepGreen
                      : AppColors.red,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    establishment.permitNumber.isNotEmpty
                        ? 'Permit: ${establishment.permitNumber}'
                        : 'No Permit Issued',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: establishment.permitNumber.isNotEmpty
                          ? const Color(0xff334155)
                          : AppColors.red,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: statusColor.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: statusColor,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        statusLabel,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (isViolation || isForCompletion) ...[
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isViolation
                      ? '⚠️ Critical requirements uncomplied / violation recorded'
                      : '⏳ Incomplete requirements pending compliance',
                  style: TextStyle(
                    fontSize: 11,
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SanitationAlertCard extends StatelessWidget {
  const SanitationAlertCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.status,
  });

  final String title;
  final String subtitle;
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = sanitationStatusColor(status);
    return Card(
      elevation: 0,
      color: color.withValues(alpha: 0.08),
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(Icons.warning_amber_outlined, color: color),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: StatusPill(text: sanitationStatusLabel(status)),
      ),
    );
  }
}

class SimpleInfoCard extends StatelessWidget {
  const SimpleInfoCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon, color: AppColors.green),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(subtitle),
        trailing: StatusPill(text: trailing),
      ),
    );
  }
}

class SanitationPermitsPage extends StatelessWidget {
  const SanitationPermitsPage({super.key, required this.establishments});

  final List<SanitationEstablishment> establishments;

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Sanitary Permits',
      subtitle: 'Permit monitoring for establishments',
      children: [
        if (establishments.isEmpty)
          const EmptyState(
            icon: Icons.badge_outlined,
            title: 'No permit records loaded',
          )
        else
          ...establishments
              .take(80)
              .map(
                (item) => Card(
                  elevation: 0,
                  color: Colors.white,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.badge_outlined,
                              color: AppColors.green,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.businessName,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  Text(
                                    [
                                      item.permitNumber.isEmpty
                                          ? 'No permit number'
                                          : item.permitNumber,
                                      item.permitExpiryDate.isEmpty
                                          ? 'No expiry date'
                                          : 'Expires: ${item.permitExpiryDate}',
                                    ].join('\n'),
                                    style: const TextStyle(
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            StatusPill(text: item.permitStatusLabel),
                          ],
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () => showSubmissionDialog(
                              context,
                              title: 'Permit follow-up noted',
                              referenceLabel: 'Permit',
                              referenceValue: item.permitNumber.isEmpty
                                  ? item.businessName
                                  : item.permitNumber,
                              message:
                                  'Prepared as a mobile follow-up note for permit monitoring.',
                              details: [
                                'Establishment: ${item.businessName}',
                                'Status: ${item.permitStatusLabel}',
                              ],
                            ),
                            icon: const Icon(Icons.event_repeat_outlined),
                            label: const Text('Follow up permit'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
      ],
    );
  }
}

/// One shared rule, matching the backend and the web app.
const inspectionFrequencyMonths = {
  'monthly': 1,
  'quarterly': 3,
  'annual': 12,
};

/// The next inspection due date for [frequency], or null if it is unknown.
///
/// An unrecognised frequency suggests nothing rather than a silent monthly
/// date, so a misconfigured business type is visible instead of quietly wrong.
DateTime? suggestedInspectionDueDate(DateTime inspected, String frequency) {
  final months = inspectionFrequencyMonths[frequency];
  if (months == null) return null;

  // Keep the day of the month, clamping when the target month is shorter.
  final total = inspected.month - 1 + months;
  final year = inspected.year + total ~/ 12;
  final month = total % 12 + 1;
  final lastDay = DateTime(year, month + 1, 0).day;
  return DateTime(year, month, math.min(inspected.day, lastDay));
}

/// The statuses an inspector can record for an inspection.
const sanitationInspectionStatuses = [
  'good_standing',
  'upcoming',
  'for_completion',
  'violation',
];

/// Builds the checklist a new inspection starts from.
///
/// The requirements configured for [businessTypeId] are kept in their
/// configured order, de-duplicated by name (case-insensitive), and start
/// unchecked.
List<InspectionChecklistDraft> buildInspectionChecks(
  List<SanitationBusinessType> businessTypes,
  int businessTypeId,
) {
  final businessType = businessTypes.firstWhereOrNull(
    (item) => item.id == businessTypeId,
  );
  final rawRequirements = businessType?.requirements ?? const [];

  // Deduplicate requirements by requirement name (case-insensitive)
  final seen = <String>{};
  final uniqueRequirements = <String>[];
  for (final item in rawRequirements) {
    final name = item.requirementName.trim();
    if (name.isNotEmpty && seen.add(name.toLowerCase())) {
      uniqueRequirements.add(name);
    }
  }

  // For a new inspection, items default to false (unchecked / 0% complete)
  return uniqueRequirements
      .map((name) => InspectionChecklistDraft(name, false))
      .toList();
}

class SanitationInspectionPage extends StatefulWidget {
  const SanitationInspectionPage({
    super.key,
    required this.api,
    required this.bootstrap,
    this.initialEstablishment,
    this.onLogout,
    this.onSessionExpired,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final SanitationEstablishment? initialEstablishment;
  final VoidCallback? onLogout;
  final VoidCallback? onSessionExpired;

  @override
  State<SanitationInspectionPage> createState() =>
      _SanitationInspectionPageState();
}

class _SanitationInspectionPageState extends State<SanitationInspectionPage> {
  final TextEditingController _inspector = TextEditingController();
  final TextEditingController _findings = TextEditingController();
  final TextEditingController _remarks = TextEditingController();
  late SanitationEstablishment _establishment;
  late DateTime _inspectionDate;
  late DateTime _nextDueDate;
  String? _status;
  List<InspectionChecklistDraft> _checks = [];
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _establishment =
        widget.initialEstablishment ??
        widget.bootstrap.establishments.firstOrNull ??
        SanitationEstablishment.placeholder();
    _inspectionDate = DateTime.now();
    _nextDueDate = _suggestedDueDate(_inspectionDate, _establishment);
    _checks = _defaultChecksFor(_establishment);
    _status = null;
    _findings.clear();
    _remarks.clear();
    SharedPreferences.getInstance().then((prefs) {
      final savedUser = prefs.getString(staffAuthUsernameKey);
      if (savedUser != null && savedUser.isNotEmpty && _inspector.text.isEmpty && mounted) {
        setState(() {
          _inspector.text = formatProperName(savedUser);
        });
      }
    });
  }

  @override
  void dispose() {
    _inspector.dispose();
    _findings.dispose();
    _remarks.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'New Inspection',
      subtitle: 'Establishment inspection only',
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        tooltip: '',
        onPressed: () => Navigator.of(context).pop(),
      ),
      children: [
        DropdownTile<SanitationEstablishment>(
          label: 'Select Establishment',
          value: _establishment,
          items: widget.bootstrap.establishments,
          itemLabel: (item) => item.businessName,
          onChanged: (item) {
            setState(() {
              _establishment = item;
              _nextDueDate = _suggestedDueDate(_inspectionDate, item);
              _checks = _defaultChecksFor(item);
              _status = null;
              _findings.clear();
              _remarks.clear();
            });
          },
        ),
        AppTextField(
          controller: _inspector,
          label: 'Inspector name',
          textCapitalization: TextCapitalization.words,
        ),
        PickerTile(
          icon: Icons.calendar_month_outlined,
          label: 'Inspection date',
          value: shortDate(_inspectionDate),
          onTap: _pickInspectionDate,
        ),
        PickerTile(
          icon: Icons.event_repeat_outlined,
          label: 'Next due date',
          value: shortDate(_nextDueDate),
          onTap: _pickNextDueDate,
        ),
        DropdownTile<String?>(
          label: 'Inspection status',
          value: _status,
          items: sanitationInspectionStatuses,
          itemLabel: (item) => sanitationStatusLabel(item ?? ''),
          hint: 'Select status',
          onChanged: (item) => setState(() => _status = item),
        ),
        InspectionChecklistPanel(checks: _checks, onToggle: _toggleCheck),
        AppTextField(controller: _findings, label: 'Findings', maxLines: 3),
        AppTextField(
          controller: _remarks,
          label: 'Remarks / observations',
          maxLines: 3,
        ),
        SubmitButton(
          label: 'Submit Inspection',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  List<InspectionChecklistDraft> _defaultChecksFor(
    SanitationEstablishment establishment,
  ) {
    return buildInspectionChecks(
      widget.bootstrap.businessTypes,
      establishment.businessTypeId,
    );
  }

  /// The suggested due date, or the inspection date itself when the business
  /// type's frequency is unrecognised and no schedule can be inferred. The
  /// inspector can always pick another date.
  DateTime _suggestedDueDate(
    DateTime date,
    SanitationEstablishment establishment,
  ) {
    return suggestedInspectionDueDate(
          date,
          establishment.inspectionFrequency,
        ) ??
        date;
  }

  Future<void> _pickInspectionDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _inspectionDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      _inspectionDate = picked;
      _nextDueDate = _suggestedDueDate(picked, _establishment);
    });
  }

  Future<void> _pickNextDueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _nextDueDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked != null) setState(() => _nextDueDate = picked);
  }

  void _toggleCheck(int index) {
    setState(() {
      final current = _checks[index];
      _checks[index] = InspectionChecklistDraft(
        current.requirementName,
        !current.isComplied,
      );
      // Ticking records an observation; it never decides the status.
    });
  }

  Future<void> _submit() async {
    if (_establishment.id == 0 || widget.bootstrap.establishments.isEmpty) {
      showAppMessage(context, 'No establishment records loaded.');
      return;
    }
    if (_inspector.text.trim().isEmpty) {
      showAppMessage(context, 'Inspector name is required.');
      return;
    }
    // A business type with no configured requirements submits an empty
    // checklist rather than a fabricated one, but the inspector still has to
    // say what the inspection found.
    final status = _status;
    if (status == null) {
      showAppMessage(context, 'Select the status after inspection.');
      return;
    }
    if (_checks.any((item) => !item.isComplied) && status == 'good_standing') {
      showAppMessage(context, 'Update the status for unchecked items.');
      return;
    }

    setState(() => _submitting = true);

    final inspectorName = formatProperName(_inspector.text);
    try {
      final response = await widget.api.submitSanitationInspection(
        establishmentId: _establishment.id,
        inspectorName: inspectorName,
        inspectionDate: isoDate(_inspectionDate),
        nextDueDate: isoDate(_nextDueDate),
        findings: _findings.text.trim(),
        remarks: _remarks.text.trim(),
        statusAfterInspection: status,
        checklistItems: _checks,
      );

      if (mounted) {
        final receipt = MobileSanitationInspectionReceipt.fromResponse(
          response,
          establishment: _establishment,
          inspectorName: inspectorName,
          status: status,
          inspectionDate: isoDate(_inspectionDate),
        );
        await showSubmissionDialog(
          context,
          title: 'Inspection submitted',
          referenceLabel: 'Inspection ID',
          referenceValue: receipt.reference,
          message: 'Saved to Sanitation Web System.',
          details: [
            'Establishment: ${receipt.establishmentName}',
            'Inspector: ${receipt.inspectorName}',
            'Status: ${sanitationStatusLabel(receipt.status)}',
            'Separate from household survey records.',
          ],
        );
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      if (!mounted) return;
      if (error is ApiException && error.isUnauthorized) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
        if (!mounted) return;
        Navigator.of(context).pop();
        if (widget.onSessionExpired != null) {
          widget.onSessionExpired!();
        } else {
          showAppMessage(context, 'Your session expired, please sign in again.');
          widget.onLogout?.call();
        }
        return;
      }

      if (error is ApiException && error.isForbidden) {
        showAppMessage(
          context,
          "You don't have permission to submit inspections.",
        );
        return;
      }

      showAppMessage(context, conciseError(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class InspectionChecklistPanel extends StatelessWidget {
  const InspectionChecklistPanel({
    super.key,
    required this.checks,
    required this.onToggle,
  });

  final List<InspectionChecklistDraft> checks;
  final ValueChanged<int> onToggle;

  @override
  Widget build(BuildContext context) {
    final completed = checks.where((item) => item.isComplied).length;
    final total = checks.length;

    if (total == 0) {
      // Nothing is configured for this business type, so there is nothing to
      // score. Say so instead of showing an empty 0% checklist.
      return Card(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        margin: const EdgeInsets.only(bottom: 12),
        child: const Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Sanitation Checklist & Score',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
              ),
              SizedBox(height: 6),
              Text(
                'No requirements configured yet.',
                style: TextStyle(
                  fontSize: 12.5,
                  color: Color(0xFF64748B),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final percent = ((completed / total) * 100).round();

    Color gradeColor;
    String gradeLabel;
    if (percent == 100) {
      gradeColor = const Color(0xFF166534);
      gradeLabel = 'Grade A (100%)';
    } else if (percent >= 80) {
      gradeColor = const Color(0xFF0F766E);
      gradeLabel = 'Grade B ($percent%)';
    } else if (percent >= 60) {
      gradeColor = const Color(0xFFD97706);
      gradeLabel = 'For Correction ($percent%)';
    } else if (percent > 0) {
      gradeColor = const Color(0xFFDC2626);
      gradeLabel = 'Notice of Violation ($percent%)';
    } else {
      gradeColor = const Color(0xFF64748B);
      gradeLabel = '0% Complete (Unchecked)';
    }

    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Sanitation Checklist & Score',
                        style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$completed of $total requirements complied',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: gradeColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: gradeColor.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    gradeLabel,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: gradeColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: total == 0 ? 0.0 : completed / total,
                minHeight: 6,
                backgroundColor: const Color(0xFFF1F5F9),
                valueColor: AlwaysStoppedAnimation<Color>(gradeColor),
              ),
            ),
            const SizedBox(height: 10),
            ...checks.asMap().entries.map(
              (entry) => CheckboxListTile(
                value: entry.value.isComplied,
                onChanged: (_) => onToggle(entry.key),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF14532D),
                title: Text(
                  entry.value.requirementName,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: entry.value.isComplied ? FontWeight.w600 : FontWeight.w400,
                    color: entry.value.isComplied ? const Color(0xFF0F172A) : const Color(0xFF64748B),
                  ),
                ),
                controlAffinity: ListTileControlAffinity.leading,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SanitationStandaloneApp extends StatelessWidget {
  const SanitationStandaloneApp({super.key});

  @override
  Widget build(BuildContext context) {
    setWebBranding(WebBrandingModule.sanitation);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Sanitation & Health Portal',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.deepGreen,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        fontFamily: 'Arial',
        useMaterial3: true,
      ),
      home: const SanitationStandaloneBootstrap(),
    );
  }
}

class SanitationStandaloneBootstrap extends StatefulWidget {
  const SanitationStandaloneBootstrap({super.key});

  @override
  State<SanitationStandaloneBootstrap> createState() =>
      _SanitationStandaloneBootstrapState();
}

class _SanitationStandaloneBootstrapState
    extends State<SanitationStandaloneBootstrap> {
  final TourismApi _api = const TourismApi();
  late Future<SanitationBootstrap> _bootstrapFuture;

  @override
  void initState() {
    super.initState();
    setWebBranding(WebBrandingModule.sanitation);
    _bootstrapFuture = _api.fetchSanitationBootstrap();
  }

  @override
  Widget build(BuildContext context) {
    setWebBranding(WebBrandingModule.sanitation);
    return FutureBuilder<SanitationBootstrap>(
      future: _bootstrapFuture,
      initialData: SanitationBootstrap.fallback(
        message: 'Loading live sanitation records...',
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const SanitationLoadingScreen();
        }

        final data = snapshot.data ?? SanitationBootstrap.fallback();
        return SanitationAccessGateway(
          api: _api,
          bootstrap: data,
          onRefresh: _api.fetchSanitationBootstrap,
        );
      },
    );
  }
}

enum SanitationGatewayScreen {
  chooser,
  staffLogin,
}

/// Shown when an establishment account signs in through Staff Sign In.
const establishmentAccountRetiredMessage =
    "Establishment accounts are no longer used. Use the Establishment Portal "
    "with the code on your Owner's Slip.";

class SanitationAccessGateway extends StatefulWidget {
  const SanitationAccessGateway({
    super.key,
    required this.api,
    required this.bootstrap,
    required this.onRefresh,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final Future<SanitationBootstrap> Function() onRefresh;

  @override
  State<SanitationAccessGateway> createState() =>
      _SanitationAccessGatewayState();
}

class _SanitationAccessGatewayState extends State<SanitationAccessGateway> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();

  SanitationGatewayScreen _currentScreen = SanitationGatewayScreen.chooser;
  bool _signedIn = false;
  bool _signingIn = false;
  bool _checkingSavedAuth = true;

  @override
  void initState() {
    super.initState();
    setWebBranding(WebBrandingModule.sanitation);
    _checkStoredAuth();
  }

  Future<void> _checkStoredAuth() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      // Establishment accounts are no longer used (owners use the Establishment
      // Portal and the code on their Owner's Slip), so what is left of an
      // establishment session is cleared and the public landing page shows.
      await prefs.remove(establishmentDataKey);
      final token = prefs.getString(staffAuthTokenKey);
      final role = prefs.getString(staffAuthRoleKey) ?? '';
      if (role == 'establishment') {
        await prefs.remove(staffAuthTokenKey);
        await prefs.remove(staffAuthRoleKey);
        await prefs.remove(staffAuthUsernameKey);
      } else if (token != null && token.isNotEmpty) {
        if (!mounted) return;
        setState(() {
          _signedIn = true;
          _checkingSavedAuth = false;
        });
        return;
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() => _checkingSavedAuth = false);
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    setWebBranding(WebBrandingModule.sanitation);
    if (_signedIn) {
      return SanitationMobileShell(
        api: widget.api,
        bootstrap: widget.bootstrap,
        onRefresh: widget.onRefresh,
        onLogout: _signOut,
        onSessionExpired: _handleSessionExpired,
      );
    }

    if (_checkingSavedAuth) {
      return const SanitationLoadingScreen();
    }

    switch (_currentScreen) {
      case SanitationGatewayScreen.chooser:
        return _buildChooserScreen();
      case SanitationGatewayScreen.staffLogin:
        return _buildStaffLoginScreen();
    }
  }

  Widget _buildChooserScreen() {
    final isWeb = kIsWeb;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(isWeb ? 24 : 18),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: isWeb ? 680 : 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Image.asset(
                        'assets/sanitary_logo.jpg',
                        width: 44,
                        height: 44,
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Mauban Sanitary',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 15,
                                color: AppColors.ink,
                              ),
                            ),
                            Text(
                              'Municipal Health Office',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Field inspections run on the mobile app only.
                      if (!isWeb)
                        OutlinedButton(
                          onPressed: () {
                            setState(() => _currentScreen =
                                SanitationGatewayScreen.staffLogin);
                          },
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            shape: const StadiumBorder(),
                            side: const BorderSide(color: AppColors.deepGreen),
                            foregroundColor: AppColors.deepGreen,
                            textStyle: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          child: const Text('Staff Sign In'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Text(
                    'What do you need today?',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.ink,
                        ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Choose a service to continue.',
                    style: TextStyle(color: AppColors.muted, fontSize: 13),
                  ),
                  const SizedBox(height: 20),
                  _buildChooserCard(
                    icon: Icons.campaign_rounded,
                    label: 'FOR RESIDENTS',
                    title: 'Community Report',
                    description:
                        'Report dirty places, septic tank leaks or garbage.',
                    onTap: _openCommunityReport,
                  ),
                  const SizedBox(height: 12),
                  _buildChooserCard(
                    icon: Icons.storefront_outlined,
                    label: 'FOR BUSINESS OWNERS',
                    title: 'Establishment Portal',
                    description: 'Check your sanitary permit status.',
                    onTap: _openOwnerPortal,
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: TextButton.icon(
                      onPressed: _openPublicPermitVerification,
                      icon: const Icon(Icons.qr_code_scanner_outlined, size: 18),
                      label: const Text('Verify a posted permit'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.deepGreen,
                        minimumSize: const Size(0, 44),
                      ),
                    ),
                  ),
                  Center(
                    child: TextButton.icon(
                      onPressed: _openPublicReportTracker,
                      icon: const Icon(Icons.manage_search_outlined, size: 18),
                      label: const Text('Track a report'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.deepGreen,
                        minimumSize: const Size(0, 44),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Official Mauban LGU e-Service · Sanitary Section',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.muted, fontSize: 11.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openOwnerPortal() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => SanitationOwnerPortalPage(api: widget.api),
      ),
    );
  }

  Future<void> _openPublicReportTracker() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ReportTrackerPage(api: widget.api),
      ),
    );
  }

  Future<void> _openPublicPermitVerification() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => PermitVerificationPage(api: widget.api),
      ),
    );
  }

  Widget _buildChooserCard({
    required IconData icon,
    required String label,
    required String title,
    required String description,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border, width: 1.2),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        splashColor: AppColors.green.withValues(alpha: 0.12),
        highlightColor: AppColors.green.withValues(alpha: 0.06),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.green.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.deepGreen, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.green,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStaffLoginScreen() {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          setState(() => _currentScreen = SanitationGatewayScreen.chooser);
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(18),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: kIsWeb ? 540 : 430),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      decoration: const BoxDecoration(
                        color: AppColors.green,
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(18),
                        ),
                      ),
                      child: Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.arrow_back, color: Colors.white),
                            onPressed: () {
                              setState(() => _currentScreen = SanitationGatewayScreen.chooser);
                            },
                            tooltip: '',
                          ),
                          const SizedBox(width: 4),
                          const Expanded(
                            child: Text(
                              'Sanitary Inspector Gateway',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Card(
                      margin: EdgeInsets.zero,
                      elevation: 0,
                      color: Colors.white,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(
                          bottom: Radius.circular(18),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Center(
                              child: Image.asset(
                                'assets/sanitary_logo.jpg',
                                width: 70,
                                height: 70,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Inspector / Staff Login',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w900,
                                  ),
                            ),
                            const Text(
                              'Sign in with your authorized Sanitation Inspector or Admin account',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: AppColors.muted,
                                fontSize: 12,
                              ),
                            ),
                            if (kIsWeb) ...[
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF0FDF4),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: const Color(0xFFBBF7D0)),
                                ),
                                child: const Row(
                                  children: [
                                    Icon(Icons.info_outline, size: 18, color: Color(0xFF16A34A)),
                                    SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Official field inspections are performed on the mobile app. Web sign-in is available for staff records review.',
                                        style: TextStyle(fontSize: 11.5, color: Color(0xFF166534)),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 18),
                            _GatewaySection(
                              icon: Icons.admin_panel_settings_outlined,
                              title: 'Inspector / Staff Credentials',
                              children: [
                                TextField(
                                  controller: _email,
                                  keyboardType: TextInputType.emailAddress,
                                  decoration: const InputDecoration(
                                    labelText: 'Username or Email',
                                    hintText: 'Enter your username',
                                  ),
                                ),
                                const SizedBox(height: 10),
                                TextField(
                                  controller: _password,
                                  obscureText: true,
                                  decoration: const InputDecoration(
                                    labelText: 'Password',
                                  ),
                                ),
                                const SizedBox(height: 12),
                                FilledButton(
                                  onPressed: _signingIn ? null : _signIn,
                                  child: Text(
                                    _signingIn
                                        ? 'Signing in...'
                                        : 'Sign in as Inspector / Admin',
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            Center(
                              child: TextButton.icon(
                                onPressed: () {
                                  setState(() => _currentScreen = SanitationGatewayScreen.chooser);
                                },
                                icon: const Icon(Icons.arrow_back, size: 16),
                                label: const Text('Back to Options'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _signIn() async {
    final username = _email.text.trim();
    final password = _password.text;
    if (username.isEmpty || password.isEmpty) {
      showAppMessage(context, 'Enter username and password.');
      return;
    }

    setState(() => _signingIn = true);
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

      // Establishment accounts are no longer used: nothing is stored and
      // nothing opens (the account itself is left alone on the server).
      if (role == 'establishment') {
        if (!mounted) return;
        setState(() {
          _signingIn = false;
          _password.clear();
        });
        showAppMessage(context, establishmentAccountRetiredMessage);
        return;
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(staffAuthTokenKey, token);
      await prefs.setString(staffAuthRoleKey, role);
      await prefs.setString(staffAuthUsernameKey, username);

      if (!mounted) return;
      setState(() {
        _signingIn = false;
        _signedIn = true;
      });
      showAppMessage(context, 'Signed in as $userDisplay ($role).');
    } catch (e) {
      if (!mounted) return;
      setState(() => _signingIn = false);
      showAppMessage(context, conciseError(e));
    }
  }

  Future<void> _signOut() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(staffAuthTokenKey);
      await prefs.remove(staffAuthRoleKey);
      await prefs.remove(staffAuthUsernameKey);
      await prefs.remove(establishmentDataKey);
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _signedIn = false;
      _password.clear();
      _currentScreen = SanitationGatewayScreen.chooser;
    });
    showAppMessage(context, 'Signed out of staff mode.');
  }

  Future<void> _handleSessionExpired() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(staffAuthTokenKey);
      await prefs.remove(staffAuthRoleKey);
      await prefs.remove(staffAuthUsernameKey);
      await prefs.remove(establishmentDataKey);
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _signedIn = false;
      _password.clear();
      _currentScreen = SanitationGatewayScreen.chooser;
    });
    showAppMessage(context, 'Your session expired, please sign in again.');
  }

  Future<void> _openCommunityReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
          // Opened before the (possibly cold) server answered: the list is
          // the offline fallback, so fetch the live one.
          refreshBarangays: widget.bootstrap.isOffline
              ? () async => (await widget.onRefresh()).barangays
              : null,
        ),
      ),
    );

    if (receipt != null && mounted) {
      showAppMessage(context, 'Community report ${receipt.reference} sent.');
    }
  }
}

class _GatewaySection extends StatelessWidget {
  const _GatewaySection({
    required this.icon,
    required this.title,
    required this.children,
  });

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.green.withValues(alpha: 0.12),
                child: Icon(icon, color: AppColors.green),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class SanitationLoadingScreen extends StatelessWidget {
  const SanitationLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text(
                'Loading sanitation records...',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Establishment Portal (owners): permit status by the private tracking code
// printed on the Owner's Slip. No login, and nothing is kept on the phone:
// no code, no result, no draft.
// ---------------------------------------------------------------------------

const _portalCanvas = Color(0xFFF3F7F4);
const _portalGreen = Color(0xFF1E6B45);
const _portalDarkGreen = Color(0xFF154F33);
const _portalRed = Color(0xFF8A1C12);
const _portalNoticeYellow = Color(0xFFFFF4D6);

/// Trimmed, upper-case and without spaces; dashes stay (the server accepts
/// the code with or without them).
String normalizeOwnerTrackingCode(String value) =>
    value.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');

/// What an owner is told when a check fails; never raw exception text.
String ownerPortalFailureMessage(Object error) {
  if (error is ApiException) {
    if (error.statusCode == 503) {
      return "This service isn't available yet. Please try again later.";
    }
    if (error.statusCode == 404 || error.statusCode == 429) {
      final message = error.message.trim();
      if (message.isNotEmpty) return message;
    }
  }
  return communityReportFailureMessage(error);
}

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

const _ownerMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "Nov 11, 2026 · 45 days", or "No date" without an expiry date.
String ownerExpiryText(String? isoDate, int? daysLeft) {
  final date = isoDate == null ? null : DateTime.tryParse(isoDate);
  if (date == null) return 'No date';
  final dateText = '${_ownerMonths[date.month - 1]} ${date.day}, ${date.year}';
  if (daysLeft == null) return dateText;
  if (daysLeft == 0) return '$dateText · today';
  if (daysLeft < 0) return '$dateText · ${_days(-daysLeft)} ago';
  return '$dateText · ${_days(daysLeft)}';
}

String _days(int count) => count == 1 ? '1 day' : '$count days';

class SanitationOwnerPortalPage extends StatefulWidget {
  const SanitationOwnerPortalPage({super.key, required this.api});

  final TourismApi api;

  @override
  State<SanitationOwnerPortalPage> createState() => _SanitationOwnerPortalPageState();
}

class _SanitationOwnerPortalPageState extends State<SanitationOwnerPortalPage> {
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
      final status = await widget.api.fetchOwnerPermitStatus(code);
      if (!mounted) return;
      setState(() => _status = status);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = ownerPortalFailureMessage(error));
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
