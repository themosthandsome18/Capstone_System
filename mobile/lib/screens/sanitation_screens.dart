part of '../main.dart';

class HouseholdSurveyPage extends StatefulWidget {
  const HouseholdSurveyPage({
    super.key,
    required this.api,
    required this.barangays,
    this.household,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;
  final HouseholdSanitationItem? household;

  @override
  State<HouseholdSurveyPage> createState() => _HouseholdSurveyPageState();
}

class _HouseholdSurveyPageState extends State<HouseholdSurveyPage> {
  final TextEditingController _head = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _waterSource = TextEditingController();
  final TextEditingController _remarks = TextEditingController();
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  late String _barangay;
  String _toiletType = 'water_sealed';
  String _waterLevel = 'level_3';
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
    _barangay = widget.household?.barangay ?? widget.barangays.firstOrNull?.name ?? 'Poblacion';
    if (widget.household != null) {
      _head.text = widget.household!.householdHead;
      if (widget.household!.hasCoordinates) {
        _latitude.text = widget.household!.latitude.toString();
        _longitude.text = widget.household!.longitude.toString();
      }
    }
  }

  @override
  void dispose() {
    _head.dispose();
    _address.dispose();
    _waterSource.dispose();
    _remarks.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormPageScaffold(
      title: 'Household Survey',
      subtitle: 'Submit household sanitation profile',
      children: [
        AppTextField(controller: _head, label: 'Household head'),
        DropdownTile<String>(
          label: 'Barangay',
          value: _barangay,
          items: widget.barangays.map((item) => item.name).toList(),
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        AppTextField(controller: _address, label: 'Address'),
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
          onChanged: (item) => setState(() => _toiletType = item),
        ),
        DropdownTile<String>(
          label: 'Water access level',
          value: _waterLevel,
          items: const ['level_1', 'level_2', 'level_3'],
          itemLabel: householdWaterLabel,
          onChanged: (item) => setState(() => _waterLevel = item),
        ),
        AppTextField(controller: _waterSource, label: 'Water source'),
        DropdownTile<String>(
          label: 'Waste disposal',
          value: _wasteDisposal,
          items: const ['collected', 'composted', 'burned', 'dumped'],
          itemLabel: householdWasteLabel,
          onChanged: (item) => setState(() => _wasteDisposal = item),
        ),
        AppTextField(controller: _remarks, label: 'Remarks', maxLines: 3),
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
      final response = await widget.api.submitHouseholdSurvey(
        householdCode: widget.household?.householdCode,
        householdHead: _head.text.trim(),
        barangay: _barangay,
        address: _address.text.trim(),
        maleCount: _male,
        femaleCount: _female,
        toiletType: _toiletType,
        waterLevel: _waterLevel,
        waterSource: _waterSource.text.trim(),
        wasteDisposal: _wasteDisposal,
        remarks: _remarks.text.trim(),
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
        if (mounted) Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (mounted) showAppMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
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
        _locationConfirmed = false;
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
      _locationConfirmed = false;
    });
  }
}

class SanitationReportPage extends StatefulWidget {
  const SanitationReportPage({
    super.key,
    required this.api,
    required this.barangays,
    this.initialDraft,
  });

  final TourismApi api;
  final List<BarangayItem> barangays;
  final SanitationReportDraft? initialDraft;

  @override
  State<SanitationReportPage> createState() => _SanitationReportPageState();
}

const sanitationReportCategories = [
  'Public restroom',
  'Public market',
  'Household surroundings',
  'Water source',
  'Garbage/Waste',
  'Pest/Rodents',
  'Other sanitation concern',
];

const sanitationReportPriorities = ['low', 'medium', 'high'];

class _SanitationReportPageState extends State<SanitationReportPage> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _latitude = TextEditingController();
  final TextEditingController _longitude = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  List<XFile> _photos = [];
  String _category = sanitationReportCategories.first;
  String _priority = 'medium';
  late String _barangay;
  bool _submitting = false;
  bool _locating = false;
  bool _locationConfirmed = false;
  bool _consentConfirmed = false;
  bool _anonymous = false;

  @override
  void initState() {
    super.initState();
    final draft = widget.initialDraft;
    _barangay =
        draft?.barangay ?? widget.barangays.firstOrNull?.name ?? 'Poblacion';
    if (draft != null) {
      _name.text = draft.name;
      _contact.text = draft.contactNumber;
      _category = draft.category;
      _priority = draft.priority;
      _description.text = draft.description;
      _latitude.text = draft.latitude;
      _longitude.text = draft.longitude;
      _anonymous = draft.isAnonymous;
      _locationConfirmed =
          latLngFromText(draft.latitude, draft.longitude) != null;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _description.dispose();
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categoryItems = [
      if (!sanitationReportCategories.contains(_category)) _category,
      ...sanitationReportCategories,
    ];
    final priorityItems = [
      if (!sanitationReportPriorities.contains(_priority)) _priority,
      ...sanitationReportPriorities,
    ];

    return FormPageScaffold(
      title: 'Community Report',
      subtitle: 'Household and public-area sanitation concern',
      children: [
        const DataSourceBanner(
          icon: Icons.home_work_outlined,
          title: 'Household-linked community report',
          text:
              'Use this for public or household-area concerns. Establishment compliance stays under inspections and permits.',
        ),
        const SizedBox(height: 12),
        CheckboxListTile(
          value: _anonymous,
          onChanged: (value) {
            setState(() => _anonymous = value ?? false);
          },
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('Submit without name'),
          subtitle: const Text(
            'Contact number is optional, but needed if you want follow-up updates.',
          ),
        ),
        if (!_anonymous) AppTextField(controller: _name, label: 'Your name'),
        AppTextField(
          controller: _contact,
          label: _anonymous
              ? 'Contact number (optional)'
              : 'Contact number for status tracking',
        ),
        DropdownTile<String>(
          label: 'Category',
          value: _category,
          items: categoryItems,
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _category = item),
        ),
        DropdownTile<String>(
          label: 'Urgency',
          value: _priority,
          items: priorityItems,
          itemLabel: sanitationPriorityLabel,
          onChanged: (item) => setState(() => _priority = item),
        ),
        DropdownTile<String>(
          label: 'Barangay',
          value: _barangay,
          items: widget.barangays.map((item) => item.name).toList(),
          itemLabel: (item) => item,
          onChanged: (item) => setState(() => _barangay = item),
        ),
        AppTextField(
          controller: _description,
          label: 'Description',
          maxLines: 4,
        ),
        PhotoPickerPanel(
          photoName: _photos.isEmpty
              ? null
              : _photos.length == 1
                  ? _photos.first.name
                  : '${_photos.length} photos selected',
          onCamera: () => _pickPhoto(ImageSource.camera),
          onGallery: () => _pickPhoto(ImageSource.gallery),
          onClear: _photos.isEmpty ? null : () => setState(() => _photos.clear()),
        ),
        LocationCapturePanel(
          latitude: _latitude.text,
          longitude: _longitude.text,
          locating: _locating,
          onCapture: _captureLocation,
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
        OutlinedButton.icon(
          onPressed: _submitting ? null : _saveDraft,
          icon: const Icon(Icons.save_outlined),
          label: const Text('Save Draft'),
        ),
        const SizedBox(height: 10),
        SubmitButton(
          label: 'Submit Community Report',
          loading: _submitting,
          onPressed: _submit,
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final contact = _contact.text.trim();

    if (!_anonymous && contact.isEmpty) {
      showAppMessage(
        context,
        'Contact number is required for status tracking.',
      );
      return;
    }
    if (_description.text.trim().isEmpty) {
      showAppMessage(context, 'Description is required.');
      return;
    }
    if (latLngFromText(_latitude.text, _longitude.text) == null) {
      showAppMessage(context, 'Capture or tap the report map location.');
      return;
    }
    if (!_locationConfirmed) {
      showAppMessage(
        context,
        'Confirm the community report GIS pin before submitting.',
      );
      return;
    }
    if (!_consentConfirmed) {
      showAppMessage(context, 'Privacy consent is required before submitting.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitSanitationReport(
        name: _anonymous ? '' : _name.text.trim(),
        contactNumber: contact,
        category: _category,
        priority: _priority,
        barangay: _barangay,
        description: _description.text.trim(),
        photos: _photos,
        latitude: _latitude.text.trim(),
        longitude: _longitude.text.trim(),
      );

      if (mounted) {
        final receipt = MobileSanitationReceipt.fromResponse(
          response,
          category: _category,
          barangay: _barangay,
        );
        await showSubmissionDialog(
          context,
          title: 'Report submitted',
          referenceLabel: 'Complaint ID',
          referenceValue: receipt.reference,
          message: 'Saved to Sanitation Web System.',
          details: [
            'Category: ${receipt.category}',
            'Urgency: ${receipt.priorityLabel}',
            'Barangay: ${receipt.barangay}',
            if (contact.isEmpty)
              'Keep the complaint ID to track this anonymous report.',
          ],
        );
        if (widget.initialDraft != null) {
          await SanitationDraftStore.removeReport(widget.initialDraft!.id);
        }
        if (mounted) Navigator.of(context).pop(receipt);
      }
    } catch (error) {
      await SanitationDraftStore.upsertReport(_buildDraft());
      if (mounted) {
        showAppMessage(
          context,
          'Submission failed. Draft saved for pending sync.',
        );
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
          maxWidth: 1600,
        );
        if (picked.isNotEmpty) {
          setState(() {
            _photos.addAll(picked);
            if (_photos.length > 5) {
              _photos = _photos.sublist(0, 5);
              showAppMessage(context, 'Maximum of 5 photos allowed.');
            }
          });
        }
      } else {
        final picked = await _imagePicker.pickImage(
          source: source,
          imageQuality: 80,
          maxWidth: 1600,
        );
        if (picked != null) {
          setState(() {
            _photos.add(picked);
            if (_photos.length > 5) {
              _photos = _photos.sublist(0, 5);
              showAppMessage(context, 'Maximum of 5 photos allowed.');
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
        _locationConfirmed = false;
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
      _locationConfirmed = false;
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
      category: _category,
      priority: _priority,
      barangay: _barangay,
      description: _description.text.trim(),
      latitude: _latitude.text.trim(),
      longitude: _longitude.text.trim(),
      isAnonymous: _anonymous,
      createdAt:
          widget.initialDraft?.createdAt ?? DateTime.now().toIso8601String(),
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
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final Future<SanitationBootstrap> Function() onRefresh;
  final VoidCallback? onLogout;

  @override
  State<SanitationMobileShell> createState() => _SanitationMobileShellState();
}

class _SanitationMobileShellState extends State<SanitationMobileShell> {
  final List<MobileSanitationReceipt> _reports = [];
  final List<MobileSanitationInspectionReceipt> _inspections = [];
  List<SanitationReportDraft> _drafts = [];
  late SanitationBootstrap _bootstrap;
  int _index = 0;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _bootstrap = widget.bootstrap;
    _loadDrafts();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      SanitationDashboardPage(
        bootstrap: _bootstrap,
        reports: _reports,
        inspections: _inspections,
        onOpenInspection: _openInspection,
        onOpenReport: _openReport,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onOpenPermits: _openPermits,
        onOpenTab: (index) => setState(() => _index = index),
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationEstablishmentsPage(
        establishments: _bootstrap.establishments,
        onOpenInspection: _openInspection,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationMapPage(
        establishments: _bootstrap.establishments,
        householdRecords: _bootstrap.householdRecords,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
        onEditHousehold: _openHouseholdSurvey,
      ),
      SanitationReportsPage(
        reports: _reports,
        drafts: _drafts,
        complaints: _bootstrap.complaints,
        householdRecords: _bootstrap.householdRecords,
        onOpenReport: _openReport,
        onOpenReportTracker: _openReportTracker,
        onEditDraft: _editReportDraft,
        onRetryDraft: _retryReportDraft,
        onDeleteDraft: _deleteReportDraft,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
      SanitationActionsPage(
        bootstrap: _bootstrap,
        inspections: _inspections,
        onOpenInspection: _openInspection,
        onOpenPermits: _openPermits,
        onOpenPermitVerification: _openPermitVerification,
        onOpenReportTracker: _openReportTracker,
        onOpenHouseholdSurvey: _openHouseholdSurvey,
        onOpenNotifications: _openNotifications,
        onLogout: widget.onLogout,
        onRefresh: _refreshBootstrap,
        refreshing: _refreshing,
      ),
    ];

    return Scaffold(
      body: SafeArea(
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
            label: 'Establish',
          ),
          NavigationDestination(icon: Icon(Icons.map_outlined), label: 'Map'),
          NavigationDestination(
            icon: Icon(Icons.flag_outlined),
            label: 'Community',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Future<void> _openReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
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
    if ((!draft.isAnonymous && draft.contactNumber.trim().isEmpty) ||
        draft.description.trim().isEmpty) {
      showAppMessage(context, 'Edit the draft before retrying.');
      return;
    }

    if (latLngFromText(draft.latitude, draft.longitude) == null) {
      showAppMessage(context, 'Edit the draft and confirm a GIS pin first.');
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
            builder: (context) => SanitationInspectionPage(
              api: widget.api,
              bootstrap: _bootstrap,
              initialEstablishment: establishment,
            ),
          ),
        );

    if (receipt != null) {
      setState(() => _inspections.insert(0, receipt));
      await _refreshBootstrap(silent: true);
    }
  }

  Future<void> _openHouseholdSurvey([HouseholdSanitationItem? household]) async {
    final submitted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => HouseholdSurveyPage(
          api: widget.api,
          barangays: _bootstrap.barangays,
          household: household,
        ),
      ),
    );

    if (submitted == true) {
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

  Future<void> _openPermitVerification() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => PermitVerificationPage(api: widget.api),
      ),
    );
  }

  Future<void> _openReportTracker() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ReportTrackerPage(api: widget.api),
      ),
    );
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) =>
            NotificationPage(notifications: _bootstrap.notifications),
      ),
    );
  }

  Future<void> _refreshBootstrap({bool silent = false}) async {
    if (_refreshing) return;
    setState(() => _refreshing = true);

    final updated = await widget.onRefresh();
    if (!mounted) return;

    setState(() {
      _bootstrap = updated;
      _refreshing = false;
    });

    if (!silent) {
      showAppMessage(
        context,
        updated.isOffline
            ? 'Cannot reach Sanitary Web System.'
            : 'Sanitation records refreshed.',
      );
    }
  }

  Future<void> _loadDrafts() async {
    final drafts = await SanitationDraftStore.loadReports();
    if (mounted) setState(() => _drafts = drafts);
  }
}

class SanitationDashboardPage extends StatelessWidget {
  const SanitationDashboardPage({
    super.key,
    required this.bootstrap,
    required this.reports,
    required this.inspections,
    required this.onOpenInspection,
    required this.onOpenReport,
    required this.onOpenHouseholdSurvey,
    required this.onOpenPermits,
    required this.onOpenTab,
    required this.onRefresh,
    required this.refreshing,
  });

  final SanitationBootstrap bootstrap;
  final List<MobileSanitationReceipt> reports;
  final List<MobileSanitationInspectionReceipt> inspections;
  final ValueChanged<SanitationEstablishment?> onOpenInspection;
  final VoidCallback onOpenReport;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback onOpenPermits;
  final ValueChanged<int> onOpenTab;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    final violationCount = bootstrap.establishments
        .where((item) => item.complianceStatus == 'violation')
        .length;
    final pendingPermitCount = bootstrap.establishments
        .where((item) => item.permitStatus != 'active')
        .length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Dashboard',
          onRefresh: onRefresh,
          refreshing: refreshing,
          onNotifications: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) =>
                    NotificationPage(notifications: bootstrap.notifications),
              ),
            );
          },
        ),
        Text(
          'Welcome, Sanitary Inspector',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
        ),
        Text(
          shortDate(DateTime.now()),
          style: const TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 14),
        DataSourceBanner(
          icon: bootstrap.isOffline
              ? Icons.cloud_off_outlined
              : Icons.cloud_done_outlined,
          title: bootstrap.isOffline
              ? 'Cannot reach Sanitary Web System'
              : 'Connected to Sanitary Web System',
          text: bootstrap.isOffline
              ? bootstrap.offlineMessage
              : '${bootstrap.establishments.length} establishment records loaded.',
          warning: bootstrap.isOffline,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Establishments',
                value: '${bootstrap.establishments.length}',
                icon: Icons.apartment_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Inspections',
                value: '${bootstrap.inspections.length + inspections.length}',
                icon: Icons.fact_check_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Violations',
                value: '$violationCount',
                icon: Icons.warning_amber_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Permit Follow-up',
                value: '$pendingPermitCount',
                icon: Icons.badge_outlined,
              ),
            ),
          ],
        ),
        SectionHeader(title: 'Quick Actions'),
        Row(
          children: [
            QuickAction(
              icon: Icons.add_task_outlined,
              label: 'Inspection',
              onTap: () => onOpenInspection(null),
            ),
            QuickAction(
              icon: Icons.flag_outlined,
              label: 'Community',
              onTap: onOpenReport,
            ),
            QuickAction(
              icon: Icons.assignment_outlined,
              label: 'Household',
              onTap: onOpenHouseholdSurvey,
            ),
            QuickAction(
              icon: Icons.map_outlined,
              label: 'GIS Map',
              onTap: () => onOpenTab(2),
            ),
          ],
        ),
        SectionHeader(title: 'Urgent Alerts'),
        ...bootstrap.establishments
            .where(
              (item) =>
                  item.complianceStatus == 'violation' ||
                  item.permitStatus != 'active',
            )
            .take(3)
            .map(
              (item) => SanitationAlertCard(
                title: item.businessName,
                subtitle: '${item.barangay} - ${item.statusLabel}',
                status: item.complianceStatus,
              ),
            ),
        SectionHeader(title: 'Recent Activity'),
        if (inspections.isEmpty && reports.isEmpty)
          const EmptyState(
            icon: Icons.history_outlined,
            title: 'No mobile activity yet',
          )
        else ...[
          ...inspections
              .take(2)
              .map(
                (item) => ReceiptCard(
                  icon: Icons.fact_check_outlined,
                  title: item.establishmentName,
                  reference: item.reference,
                  lines: [
                    'Inspector: ${item.inspectorName}',
                    'Status: ${sanitationStatusLabel(item.status)}',
                  ],
                ),
              ),
          ...reports
              .take(2)
              .map((report) => SanitationReceiptCard(receipt: report)),
        ],
      ],
    );
  }
}

class SanitationEstablishmentsPage extends StatefulWidget {
  const SanitationEstablishmentsPage({
    super.key,
    required this.establishments,
    required this.onOpenInspection,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<SanitationEstablishment> establishments;
  final ValueChanged<SanitationEstablishment> onOpenInspection;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  State<SanitationEstablishmentsPage> createState() =>
      _SanitationEstablishmentsPageState();
}

class _SanitationEstablishmentsPageState
    extends State<SanitationEstablishmentsPage> {
  String _search = '';
  String _type = 'All Types';
  String _barangay = 'All Barangays';
  String _status = 'All Status';
  String _permit = 'All Permits';

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
      final matchesSearch =
          item.businessName.toLowerCase().contains(query) ||
          item.barangay.toLowerCase().contains(query) ||
          item.businessTypeName.toLowerCase().contains(query);
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

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Establishments',
          onRefresh: widget.onRefresh,
          refreshing: widget.refreshing,
        ),
        SearchBox(
          hint: 'Search establishments...',
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
        Text(
          '${filtered.length} establishment(s) found',
          style: const TextStyle(color: AppColors.muted),
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
    required this.onRefresh,
    required this.refreshing,
    this.onEditHousehold,
  });

  final List<SanitationEstablishment> establishments;
  final List<HouseholdSanitationItem> householdRecords;
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
                  markers:
                      (_showHouseholds
                              ? <Marker>[]
                              : establishmentPins.map(
                                  (item) => Marker(
                                    point: LatLng(
                                      item.latitude,
                                      item.longitude,
                                    ),
                                    width: 42,
                                    height: 42,
                                    child: const MapPin(),
                                  ),
                                ))
                          .toList(),
                ),
              ],
            ),
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
}

class SanitationReportsPage extends StatelessWidget {
  const SanitationReportsPage({
    super.key,
    required this.reports,
    required this.drafts,
    required this.complaints,
    required this.householdRecords,
    required this.onOpenReport,
    required this.onOpenReportTracker,
    required this.onEditDraft,
    required this.onRetryDraft,
    required this.onDeleteDraft,
    required this.onOpenHouseholdSurvey,
    required this.onRefresh,
    required this.refreshing,
  });

  final List<MobileSanitationReceipt> reports;
  final List<SanitationReportDraft> drafts;
  final List<SanitationComplaintItem> complaints;
  final List<HouseholdSanitationItem> householdRecords;
  final VoidCallback onOpenReport;
  final VoidCallback onOpenReportTracker;
  final ValueChanged<SanitationReportDraft> onEditDraft;
  final ValueChanged<SanitationReportDraft> onRetryDraft;
  final ValueChanged<SanitationReportDraft> onDeleteDraft;
  final VoidCallback onOpenHouseholdSurvey;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Community Reports',
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
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: onOpenReportTracker,
          icon: const Icon(Icons.manage_search_outlined),
          label: const Text('Track Report Status'),
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
                  subtitle: '${item.barangay} - ${item.description}',
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
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        '${draft.barangay} - ${sanitationPriorityLabel(draft.priority)} - Pending sync',
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
      children: [
        DataSourceBanner(
          icon: Icons.manage_search_outlined,
          title: 'Report Status Tracking',
          text:
              'Use the contact number used during submission or the complaint ID from the receipt.',
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
            title: 'Enter contact or complaint ID',
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
    if (_contact.text.trim().isEmpty && _reference.text.trim().isEmpty) {
      showAppMessage(context, 'Enter a contact number or complaint ID.');
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
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        establishment.businessTypeName,
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
              icon: Icons.health_and_safety_outlined,
              label: 'Compliance Status',
              value: result.complianceStatusLabel,
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
    required this.bootstrap,
    required this.inspections,
    required this.onOpenInspection,
    required this.onOpenPermits,
    required this.onOpenPermitVerification,
    required this.onOpenReportTracker,
    required this.onOpenHouseholdSurvey,
    required this.onOpenNotifications,
    this.onLogout,
    required this.onRefresh,
    required this.refreshing,
  });

  final SanitationBootstrap bootstrap;
  final List<MobileSanitationInspectionReceipt> inspections;
  final ValueChanged<SanitationEstablishment?> onOpenInspection;
  final VoidCallback onOpenPermits;
  final VoidCallback onOpenPermitVerification;
  final VoidCallback onOpenReportTracker;
  final VoidCallback onOpenHouseholdSurvey;
  final VoidCallback onOpenNotifications;
  final VoidCallback? onLogout;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
      children: [
        SanitationTopBar(
          title: 'Sanitary Monitor',
          onRefresh: onRefresh,
          refreshing: refreshing,
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
          icon: Icons.qr_code_scanner_outlined,
          label: 'Verify QR Permit',
          onTap: onOpenPermitVerification,
        ),
        ProfileLink(
          icon: Icons.manage_search_outlined,
          label: 'Track Community Report',
          onTap: onOpenReportTracker,
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
        SectionHeader(title: 'Submitted Inspections'),
        if (inspections.isEmpty)
          const EmptyState(
            icon: Icons.fact_check_outlined,
            title: 'No mobile inspections submitted yet',
          )
        else
          ...inspections.map(
            (item) => ReceiptCard(
              icon: Icons.fact_check_outlined,
              title: item.establishmentName,
              reference: item.reference,
              lines: [
                'Inspector: ${item.inspectorName}',
                'Date: ${item.inspectionDate}',
                'Status: ${sanitationStatusLabel(item.status)}',
              ],
            ),
          ),
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
  });

  final String title;
  final Future<void> Function()? onRefresh;
  final bool refreshing;
  final VoidCallback? onNotifications;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          const Icon(Icons.menu, color: AppColors.deepGreen),
          const SizedBox(width: 10),
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
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: sanitationStatusColor(
            establishment.complianceStatus,
          ).withValues(alpha: 0.14),
          child: Icon(
            Icons.apartment_outlined,
            color: sanitationStatusColor(establishment.complianceStatus),
          ),
        ),
        title: Text(
          establishment.businessName,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(
          '${establishment.businessTypeName}\n${establishment.barangay} - ${establishment.ownerName}',
        ),
        isThreeLine: true,
        trailing: FilledButton.tonal(
          onPressed: onInspection,
          child: const Text('Inspect'),
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
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
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

class SanitationInspectionPage extends StatefulWidget {
  const SanitationInspectionPage({
    super.key,
    required this.api,
    required this.bootstrap,
    this.initialEstablishment,
  });

  final TourismApi api;
  final SanitationBootstrap bootstrap;
  final SanitationEstablishment? initialEstablishment;

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
  String _status = 'good_standing';
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
              _findings.clear();
              _status = 'good_standing';
            });
          },
        ),
        AppTextField(controller: _inspector, label: 'Inspector name'),
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
        DropdownTile<String>(
          label: 'Inspection status',
          value: _status,
          items: const [
            'good_standing',
            'upcoming',
            'for_completion',
            'violation',
          ],
          itemLabel: sanitationStatusLabel,
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
    final businessType = widget.bootstrap.businessTypes.firstWhereOrNull(
      (item) => item.id == establishment.businessTypeId,
    );
    final requirements = businessType?.requirements ?? const [];

    if (requirements.isEmpty) {
      return const [
        InspectionChecklistDraft('Proper waste disposal system', true),
        InspectionChecklistDraft('Clean water supply available', true),
        InspectionChecklistDraft('Functional toilet facilities', true),
        InspectionChecklistDraft('Food handling area is clean', true),
        InspectionChecklistDraft('Valid sanitary permit displayed', true),
      ];
    }

    return requirements
        .map((item) => InspectionChecklistDraft(item.requirementName, true))
        .toList();
  }

  DateTime _suggestedDueDate(
    DateTime date,
    SanitationEstablishment establishment,
  ) {
    final months = establishment.inspectionFrequency == 'quarterly' ? 3 : 1;
    return DateTime(date.year, date.month + months, date.day);
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
      if (_checks.any((item) => !item.isComplied)) {
        _status = 'for_completion';
        if (_findings.text.trim().isEmpty) {
          _findings.text = 'Some checklist items need correction.';
        }
      } else {
        _status = 'good_standing';
        if (_findings.text.trim() == 'Some checklist items need correction.') {
          _findings.clear();
        }
      }
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
    if (_checks.isEmpty) {
      showAppMessage(context, 'Inspection checklist is required.');
      return;
    }
    if (_checks.any((item) => !item.isComplied) && _status == 'good_standing') {
      showAppMessage(context, 'Update the status for unchecked items.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await widget.api.submitSanitationInspection(
        establishmentId: _establishment.id,
        inspectorName: _inspector.text.trim(),
        inspectionDate: isoDate(_inspectionDate),
        nextDueDate: isoDate(_nextDueDate),
        findings: _findings.text.trim(),
        remarks: _remarks.text.trim(),
        statusAfterInspection: _status,
        checklistItems: _checks,
      );

      if (mounted) {
        final receipt = MobileSanitationInspectionReceipt.fromResponse(
          response,
          establishment: _establishment,
          inspectorName: _inspector.text.trim(),
          status: _status,
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
      if (mounted) showAppMessage(context, error.toString());
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
                    'Sanitation Checklist',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                Text('$completed/${checks.length}'),
              ],
            ),
            const SizedBox(height: 8),
            ...checks.asMap().entries.map(
              (entry) => CheckboxListTile(
                value: entry.value.isComplied,
                onChanged: (_) => onToggle(entry.key),
                contentPadding: EdgeInsets.zero,
                title: Text(entry.value.requirementName),
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
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mauban Sanitation & Community',
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
    _bootstrapFuture = _api.fetchSanitationBootstrap();
  }

  @override
  Widget build(BuildContext context) {
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
  bool _signedIn = false;
  bool _signingIn = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_signedIn) {
      return SanitationMobileShell(
        api: widget.api,
        bootstrap: widget.bootstrap,
        onRefresh: widget.onRefresh,
        onLogout: _signOut,
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 12,
                    ),
                    decoration: const BoxDecoration(
                      color: AppColors.green,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(18),
                      ),
                    ),
                    child: const Text(
                      'Login Page',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
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
                              'assets/tourism_logo.jpg',
                              width: 76,
                              height: 76,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Sanitation Section',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          const Text(
                            'Sign in to continue',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppColors.muted,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 18),
                          _GatewaySection(
                            icon: Icons.admin_panel_settings_outlined,
                            title: 'Admin Login',
                            children: [
                              TextField(
                                controller: _email,
                                keyboardType: TextInputType.emailAddress,
                                decoration: const InputDecoration(
                                  labelText: 'Email',
                                  hintText: 'admin@example.com',
                                ),
                              ),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _password,
                                obscureText: true,
                                decoration: const InputDecoration(
                                  labelText: 'Password',
                                  hintText: 'Password',
                                ),
                              ),
                              const SizedBox(height: 12),
                              FilledButton(
                                onPressed: _signingIn ? null : _signIn,
                                child: Text(
                                  _signingIn
                                      ? 'Signing in...'
                                      : 'Sign in as Admin',
                                ),
                              ),
                            ],
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Row(
                              children: [
                                Expanded(child: Divider()),
                                Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 12),
                                  child: Text(
                                    'OR',
                                    style: TextStyle(
                                      color: AppColors.muted,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                Expanded(child: Divider()),
                              ],
                            ),
                          ),
                          _GatewaySection(
                            icon: Icons.flag_outlined,
                            title: 'Community Concern',
                            text:
                                'No account needed. Report unsanitary conditions right away.',
                            children: [
                              OutlinedButton(
                                onPressed: _openCommunityReport,
                                child: const Text('Continue as Guest'),
                              ),
                            ],
                          ),
                          // Removed offline warning banner as requested for the presentation
                          // if (widget.bootstrap.isOffline) ...[
                          //   const SizedBox(height: 14),
                          //   DataSourceBanner(
                          //     icon: Icons.cloud_off_outlined,
                          //     title: 'Backend not reachable',
                          //     text: widget.bootstrap.offlineMessage,
                          //     warning: true,
                          //   ),
                          // ],
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
    );
  }

  Future<void> _signIn() async {
    if (_email.text.trim().isEmpty || _password.text.trim().isEmpty) {
      showAppMessage(context, 'Enter admin email and password.');
      return;
    }

    setState(() => _signingIn = true);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    setState(() {
      _signingIn = false;
      _signedIn = true;
    });
    showAppMessage(context, 'Signed in to sanitation staff mode.');
  }

  void _signOut() {
    setState(() {
      _signedIn = false;
      _password.clear();
    });
  }

  Future<void> _openCommunityReport() async {
    final receipt = await Navigator.of(context).push<MobileSanitationReceipt>(
      MaterialPageRoute(
        builder: (context) => SanitationReportPage(
          api: widget.api,
          barangays: widget.bootstrap.barangays,
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
    this.text,
    required this.children,
  });

  final IconData icon;
  final String title;
  final String? text;
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    if (text != null)
                      Text(
                        text!,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                        ),
                      ),
                  ],
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
