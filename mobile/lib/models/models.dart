part of '../main.dart';

class MobileBootstrap {
  const MobileBootstrap({
    required this.destinations,
    required this.featuredDestinations,
    required this.countries,
    required this.regions,
    required this.provinces,
    required this.itineraries,
    required this.travelModes,
    required this.boatTypes,
    required this.visitPurposes,
    required this.barangays,
    required this.notifications,
    this.isOffline = false,
  });

  final List<Destination> destinations;
  final List<Destination> featuredDestinations;
  final List<RefItem> countries;
  final List<RefItem> regions;
  final List<RefItem> provinces;
  final List<RefItem> itineraries;
  final List<RefItem> travelModes;
  final List<RefItem> boatTypes;
  final List<RefItem> visitPurposes;
  final List<BarangayItem> barangays;
  final List<AppNotification> notifications;
  final bool isOffline;

  factory MobileBootstrap.fromJson(Map<String, dynamic> json) {
    final refs = json['referenceTables'] as Map<String, dynamic>? ?? {};
    return MobileBootstrap(
      destinations: parseList(json['destinations'], Destination.fromJson),
      featuredDestinations: parseList(
        json['featuredDestinations'],
        Destination.fromJson,
      ),
      countries: parseList(refs['countries'], RefItem.fromJson),
      regions: parseList(refs['regions'], RefItem.fromJson),
      provinces: parseList(refs['provinces'], RefItem.fromJson),
      itineraries: parseList(refs['itineraries'], RefItem.fromJson),
      travelModes: parseList(refs['travelModes'], RefItem.fromJson),
      boatTypes: parseList(refs['boatTypes'], RefItem.fromJson),
      visitPurposes: parseList(refs['visitPurposes'], RefItem.fromJson),
      barangays: parseList(json['barangays'], BarangayItem.fromJson),
      notifications: parseList(json['notifications'], AppNotification.fromJson),
      isOffline: false,
    );
  }

  factory MobileBootstrap.fallback() {
    return MobileBootstrap(
      destinations: const [],
      featuredDestinations: const [],
      countries: const [RefItem(id: 1, name: 'Philippines')],
      regions: const [RefItem(id: 4, name: 'CALABARZON Region')],
      provinces: const [RefItem(id: 1, name: 'Quezon')],
      itineraries: const [
        RefItem(id: 2, name: 'Same Day'),
        RefItem(id: 1, name: 'Overnight'),
        RefItem(id: 3, name: '2 Nights'),
      ],
      travelModes: const [
        RefItem(id: 1, name: 'Private Vehicle'),
        RefItem(id: 2, name: 'Public Utility Vehicle'),
      ],
      boatTypes: const [
        RefItem(id: 1, name: 'Public Boat'),
        RefItem(id: 2, name: 'Private Boat'),
      ],
      visitPurposes: const [
        RefItem(id: 1, name: 'Leisure'),
        RefItem(id: 3, name: 'Business'),
      ],
      barangays: const [
        BarangayItem(id: 1, name: 'Poblacion'),
        BarangayItem(id: 2, name: 'San Isidro'),
        BarangayItem(id: 3, name: 'Cagsiay'),
      ],
      notifications: AppNotification.fallback(),
      isOffline: true,
    );
  }
}

/// Staff records from `/mobile/sanitation/staff-bootstrap/` layered over the
/// public bootstrap, which keeps supplying business types and barangays.
SanitationBootstrap mergeSanitationStaffRecords(
  SanitationBootstrap base,
  Map<String, dynamic> staff,
) {
  return SanitationBootstrap(
    businessTypes: base.businessTypes,
    establishments: parseList(
      staff['establishments'],
      SanitationEstablishment.fromJson,
    ),
    inspections: parseList(
      staff['inspections'],
      SanitationInspectionItem.fromJson,
    ),
    complaints: parseList(
      (staff['complaintData'] as Map<String, dynamic>?)?['rows'],
      SanitationComplaintItem.fromJson,
    ),
    householdRecords: parseList(
      staff['householdRecords'],
      HouseholdSanitationItem.fromJson,
    ),
    barangays: base.barangays,
    notifications: parseList(staff['notifications'], AppNotification.fromJson),
    offlineMessage: base.offlineMessage,
    isOffline: base.isOffline,
  );
}

/// The 40 official Mauban barangays, spelled as in api_barangay and in its
/// display_order (backend/api/seed_data.py MAUBAN_BARANGAYS). Used only when
/// the server has not answered yet; ids are positions, not database ids.
const sanitationBarangayFallback = [
  BarangayItem(id: 1, name: 'Abo-abo'),
  BarangayItem(id: 2, name: 'Alitap'),
  BarangayItem(id: 3, name: 'Baao'),
  BarangayItem(id: 4, name: 'Bagong Bayan'),
  BarangayItem(id: 5, name: 'Balaybalay'),
  BarangayItem(id: 6, name: 'Bato'),
  BarangayItem(id: 7, name: 'Cagbalete I'),
  BarangayItem(id: 8, name: 'Cagbalete II'),
  BarangayItem(id: 9, name: 'Cagsiay I'),
  BarangayItem(id: 10, name: 'Cagsiay II'),
  BarangayItem(id: 11, name: 'Cagsiay III'),
  BarangayItem(id: 12, name: 'Concepcion'),
  BarangayItem(id: 13, name: 'Daungan'),
  BarangayItem(id: 14, name: 'Liwayway'),
  BarangayItem(id: 15, name: 'Lual'),
  BarangayItem(id: 16, name: 'Lual Rural'),
  BarangayItem(id: 17, name: 'Lucutan'),
  BarangayItem(id: 18, name: 'Luya-luya'),
  BarangayItem(id: 19, name: 'Mabato'),
  BarangayItem(id: 20, name: 'Macasin'),
  BarangayItem(id: 21, name: 'Polo'),
  BarangayItem(id: 22, name: 'Remedios I'),
  BarangayItem(id: 23, name: 'Remedios II'),
  BarangayItem(id: 24, name: 'Rizaliana'),
  BarangayItem(id: 25, name: 'Rosario'),
  BarangayItem(id: 26, name: 'Sadsaran'),
  BarangayItem(id: 27, name: 'San Gabriel'),
  BarangayItem(id: 28, name: 'San Isidro'),
  BarangayItem(id: 29, name: 'San Jose'),
  BarangayItem(id: 30, name: 'San Lorenzo'),
  BarangayItem(id: 31, name: 'San Miguel'),
  BarangayItem(id: 32, name: 'San Rafael'),
  BarangayItem(id: 33, name: 'San Roque'),
  BarangayItem(id: 34, name: 'San Vicente'),
  BarangayItem(id: 35, name: 'Santa Lucia'),
  BarangayItem(id: 36, name: 'Santo Angel'),
  BarangayItem(id: 37, name: 'Santo Niño'),
  BarangayItem(id: 38, name: 'Santol'),
  BarangayItem(id: 39, name: 'Soledad'),
  BarangayItem(id: 40, name: 'Tapucan'),
];

class SanitationBootstrap {
  const SanitationBootstrap({
    required this.businessTypes,
    required this.establishments,
    required this.inspections,
    required this.complaints,
    required this.householdRecords,
    required this.barangays,
    required this.notifications,
    this.offlineMessage = 'Only submitted reports in this session are visible.',
    this.isOffline = false,
  });

  final List<SanitationBusinessType> businessTypes;
  final List<SanitationEstablishment> establishments;
  final List<SanitationInspectionItem> inspections;
  final List<SanitationComplaintItem> complaints;
  final List<HouseholdSanitationItem> householdRecords;
  final List<BarangayItem> barangays;
  final List<AppNotification> notifications;
  final String offlineMessage;
  final bool isOffline;

  factory SanitationBootstrap.fromJson(Map<String, dynamic> json) {
    return SanitationBootstrap(
      businessTypes: parseList(
        json['businessTypes'],
        SanitationBusinessType.fromJson,
      ),
      establishments: parseList(
        json['establishments'],
        SanitationEstablishment.fromJson,
      ),
      inspections: parseList(
        json['inspections'],
        SanitationInspectionItem.fromJson,
      ),
      complaints: parseList(
        (json['complaintData'] as Map<String, dynamic>?)?['rows'],
        SanitationComplaintItem.fromJson,
      ),
      householdRecords: parseList(
        json['householdRecords'],
        HouseholdSanitationItem.fromJson,
      ),
      barangays: parseList(json['barangays'], BarangayItem.fromJson),
      notifications: parseList(json['notifications'], AppNotification.fromJson),
      isOffline: false,
    );
  }

  factory SanitationBootstrap.fallback({String? message}) {
    return SanitationBootstrap(
      businessTypes: const [],
      establishments: const [],
      inspections: const [],
      complaints: const [],
      householdRecords: const [],
      barangays: sanitationBarangayFallback,
      notifications: const [
        AppNotification(
          id: 'offline-sanitation',
          title: 'Cannot reach Sanitary Web System',
          message: 'Connect the backend API to load establishment records.',
          type: 'sanitation',
        ),
      ],
      offlineMessage:
          message ?? 'Only submitted reports in this session are visible.',
      isOffline: true,
    );
  }
}

enum SanitationDashboardStatus { loading, loaded, unavailable }

class SanitationDashboardState {
  const SanitationDashboardState.loading()
    : status = SanitationDashboardStatus.loading, data = null, error = null;
  const SanitationDashboardState.loaded(this.data)
    : status = SanitationDashboardStatus.loaded, error = null;
  const SanitationDashboardState.unavailable(this.error)
    : status = SanitationDashboardStatus.unavailable, data = null;

  final SanitationDashboardStatus status;
  final SanitationDashboardData? data;
  final Object? error;
}

/// Only complete, successfully loaded staff data becomes a dashboard snapshot.
class SanitationDashboardData {
  const SanitationDashboardData({
    required this.establishmentsCount,
    required this.newComplaintsCount,
    required this.newComplaints,
    required this.householdsThisMonthCount,
    required this.dueInspections,
  });

  final int establishmentsCount;
  final int newComplaintsCount;
  final List<SanitationComplaintItem> newComplaints;
  final int householdsThisMonthCount;
  final List<SanitationDueInspection> dueInspections;
  int get dueForInspectionCount => dueInspections.length;

  factory SanitationDashboardData.fromSources({
    required Map<String, dynamic> staff,
    required Map<String, dynamic> complaints,
    required List<Map<String, dynamic>> inspections,
    required DateTime now,
  }) {
    final establishments = sanitationDashboardRows(staff['establishments']);
    final households = sanitationDashboardRows(staff['householdRecords']);
    final summary = complaints['summary'];
    final pending = summary is Map ? summary['pending'] : null;
    if (pending is! int || pending < 0) {
      throw const FormatException('Pending complaint summary is unavailable.');
    }
    final pendingRows = sanitationDashboardRows(complaints['rows'])
        .where((row) => row['status'] == 'pending')
        .map(SanitationComplaintItem.fromJson).toList();
    pendingRows.sort((a, b) {
      if (a.createdAt == null && b.createdAt != null) return 1;
      if (b.createdAt == null && a.createdAt != null) return -1;
      final byTime = a.createdAt == null ? 0 : b.createdAt!.compareTo(a.createdAt!);
      return byTime != 0 ? byTime : a.reference.compareTo(b.reference);
    });

    final localNow = now.toLocal();
    final today = DateTime(localNow.year, localNow.month, localNow.day);
    final end = DateTime(today.year, today.month, today.day + 7);
    final latestSurveys = <String, DateTime>{};
    for (final row in households) {
      final date = sanitationDashboardDate(row['last_survey_date']);
      if (date == null) continue;
      final key = '${row['id'] ?? row['household_code'] ?? ''}';
      if (key.isEmpty) throw const FormatException('Household identifier is missing.');
      if (latestSurveys[key] == null || date.isAfter(latestSurveys[key]!)) {
        latestSurveys[key] = date;
      }
    }

    final latest = <int, SanitationDueInspection>{};
    for (final row in inspections) {
      if (row['is_draft'] == true) continue;
      if (row['is_draft'] != false) {
        throw const FormatException('Inspection finalization state is missing.');
      }
      final item = SanitationDueInspection.fromJson(row);
      final previous = latest[item.establishmentId];
      if (previous == null || item.inspectionDate.isAfter(previous.inspectionDate) ||
          (item.inspectionDate == previous.inspectionDate && item.inspectionId > previous.inspectionId)) {
        latest[item.establishmentId] = item;
      }
    }
    // Select latest finalized first, then evaluate its schedule. Never revive an older due date.
    final due = latest.values.where((item) =>
        item.nextDueDate != null && !item.nextDueDate!.isAfter(end)).toList();
    due.sort((a, b) {
      final byDate = a.nextDueDate!.compareTo(b.nextDueDate!);
      return byDate != 0 ? byDate : a.establishmentId.compareTo(b.establishmentId);
    });
    return SanitationDashboardData(
      establishmentsCount: establishments.length,
      newComplaintsCount: pending,
      newComplaints: List.unmodifiable(pendingRows),
      householdsThisMonthCount: latestSurveys.values.where((date) =>
          date.year == today.year && date.month == today.month).length,
      dueInspections: List.unmodifiable(due),
    );
  }
}

class SanitationDueInspection {
  const SanitationDueInspection({required this.inspectionId, required this.establishmentId,
    required this.establishmentName, required this.businessTypeName,
    required this.inspectionDate, required this.nextDueDate});
  final int inspectionId;
  final int establishmentId;
  final String establishmentName;
  final String businessTypeName;
  final DateTime inspectionDate;
  final DateTime? nextDueDate;

  factory SanitationDueInspection.fromJson(Map<String, dynamic> row) {
    final date = sanitationDashboardDate(row['inspection_date']);
    if (row['id'] is! int || row['establishment'] is! int || date == null) {
      throw const FormatException('Inspection identity/date is missing.');
    }
    return SanitationDueInspection(
      inspectionId: row['id'] as int, establishmentId: row['establishment'] as int,
      establishmentName: '${row['establishment_name'] ?? ''}',
      businessTypeName: '${row['business_type_name'] ?? ''}',
      inspectionDate: date, nextDueDate: sanitationDashboardDate(row['next_due_date']),
    );
  }
}

List<Map<String, dynamic>> sanitationDashboardRows(Object? value) {
  if (value is! List || value.any((row) => row is! Map<String, dynamic>)) {
    throw const FormatException('Expected a complete sanitation record list.');
  }
  return value.cast<Map<String, dynamic>>();
}

DateTime? sanitationDashboardDate(Object? value) {
  if (value == null || value == '') return null;
  final text = '$value';
  final parsed = DateTime.tryParse(text);
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text) || parsed == null ||
      parsed.year != int.parse(text.substring(0, 4)) ||
      parsed.month != int.parse(text.substring(5, 7)) ||
      parsed.day != int.parse(text.substring(8, 10))) {
    throw const FormatException('Invalid sanitation calendar date.');
  }
  return DateTime(parsed.year, parsed.month, parsed.day);
}

class SanitationBusinessType {
  const SanitationBusinessType({
    required this.id,
    required this.name,
    required this.inspectionFrequency,
    required this.requirements,
  });

  final int id;
  final String name;
  final String inspectionFrequency;
  final List<SanitationRequirement> requirements;

  factory SanitationBusinessType.fromJson(Map<String, dynamic> json) {
    return SanitationBusinessType(
      id: jsonInt(json['id']),
      name: '${json['name'] ?? ''}',
      inspectionFrequency: '${json['inspection_frequency'] ?? 'monthly'}',
      requirements: parseList(
        json['requirements'],
        SanitationRequirement.fromJson,
      ),
    );
  }
}

class SanitationRequirement {
  const SanitationRequirement({required this.requirementName});

  final String requirementName;

  factory SanitationRequirement.fromJson(Map<String, dynamic> json) {
    return SanitationRequirement(
      requirementName: '${json['requirement_name'] ?? ''}',
    );
  }
}

class SanitationEstablishment {
  const SanitationEstablishment({
    required this.id,
    required this.businessName,
    required this.ownerName,
    required this.businessTypeId,
    required this.businessTypeName,
    required this.inspectionFrequency,
    required this.barangay,
    required this.address,
    required this.permitNumber,
    required this.permitExpiryDate,
    required this.complianceStatus,
    required this.statusLabel,
    required this.permitStatus,
    required this.permitStatusLabel,
    required this.latitude,
    required this.longitude,
    this.contactNumber = '',
  });

  final int id;
  final String businessName;
  final String ownerName;
  final int businessTypeId;
  final String businessTypeName;
  final String inspectionFrequency;
  final String barangay;
  final String address;
  final String permitNumber;
  final String permitExpiryDate;
  final String complianceStatus;
  final String statusLabel;
  final String permitStatus;
  final String permitStatusLabel;
  final double latitude;
  final double longitude;
  final String contactNumber;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;
  bool get hasPermit =>
      permitNumber.trim().isNotEmpty &&
      !permitNumber.toLowerCase().contains('unissued') &&
      permitStatus.toLowerCase() != 'unissued';

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'business_name': businessName,
      'owner_name': ownerName,
      'business_type': businessTypeId,
      'business_type_name': businessTypeName,
      'inspection_frequency': inspectionFrequency,
      'barangay': barangay,
      'address': address,
      'permit_number': permitNumber,
      'permit_expiry_date': permitExpiryDate,
      'compliance_status': complianceStatus,
      'compliance_status_label': statusLabel,
      'permit_status': permitStatus,
      'permit_status_label': permitStatusLabel,
      'latitude': latitude,
      'longitude': longitude,
      'contact_number': contactNumber,
    };
  }

  factory SanitationEstablishment.fromJson(Map<String, dynamic> json) {
    return SanitationEstablishment(
      id: jsonInt(json['id']),
      businessName: '${json['business_name'] ?? 'Establishment'}',
      ownerName: '${json['owner_name'] ?? ''}',
      businessTypeId: jsonInt(json['business_type']),
      businessTypeName: '${json['business_type_name'] ?? 'Establishment'}',
      inspectionFrequency: '${json['inspection_frequency'] ?? 'monthly'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      address: '${json['address'] ?? ''}',
      permitNumber: '${json['permit_number'] ?? ''}',
      permitExpiryDate: '${json['permit_expiry_date'] ?? ''}',
      complianceStatus: '${json['compliance_status'] ?? 'upcoming'}',
      statusLabel: '${json['compliance_status_label'] ?? 'Upcoming'}',
      permitStatus: '${json['permit_status'] ?? 'renewal_due'}',
      permitStatusLabel: '${json['permit_status_label'] ?? 'Renewal Due'}',
      latitude: jsonDouble(json['latitude']),
      longitude: jsonDouble(json['longitude']),
      contactNumber: '${json['contact_number'] ?? ''}',
    );
  }

  static SanitationEstablishment placeholder() {
    return const SanitationEstablishment(
      id: 0,
      businessName: 'No establishment loaded',
      ownerName: '',
      businessTypeId: 0,
      businessTypeName: 'Establishment',
      inspectionFrequency: 'monthly',
      barangay: 'Unspecified',
      address: '',
      permitNumber: '',
      permitExpiryDate: '',
      complianceStatus: 'upcoming',
      statusLabel: 'Upcoming',
      permitStatus: 'renewal_due',
      permitStatusLabel: 'Renewal Due',
      latitude: 0,
      longitude: 0,
      contactNumber: '',
    );
  }
}

class SanitationInspectionItem {
  const SanitationInspectionItem({
    required this.id,
    required this.establishmentName,
    required this.inspectorName,
    required this.inspectionDate,
    required this.status,
  });

  final int id;
  final String establishmentName;
  final String inspectorName;
  final String inspectionDate;
  final String status;

  factory SanitationInspectionItem.fromJson(Map<String, dynamic> json) {
    return SanitationInspectionItem(
      id: jsonInt(json['id']),
      establishmentName: '${json['establishment_name'] ?? 'Establishment'}',
      inspectorName: '${json['inspector_name'] ?? ''}',
      inspectionDate: '${json['inspection_date'] ?? ''}',
      status: '${json['status_after_inspection'] ?? 'upcoming'}',
    );
  }
}

/// "Barangay · typed location" for staff lists; just the barangay when the
/// report has no typed location (older reports).
String complaintLocationLine(SanitationComplaintItem item) {
  final address = item.locationAddress.trim();
  return address.isEmpty ? item.barangay : '${item.barangay} · $address';
}

class SanitationComplaintItem {
  const SanitationComplaintItem({
    required this.reference,
    required this.category,
    required this.barangay,
    required this.description,
    required this.status,
    required this.statusLabel,
    required this.priority,
    required this.actionTaken,
    this.locationAddress = '',
    this.createdAt,
  });

  final String reference;
  final String category;
  final String barangay;
  final String locationAddress;
  final String description;
  final String status;
  final String statusLabel;
  final String priority;
  final String actionTaken;
  final DateTime? createdAt;

  String get priorityTag => priority == 'high' ? 'URGENT' : 'STANDARD';

  factory SanitationComplaintItem.fromJson(Map<String, dynamic> json) {
    return SanitationComplaintItem(
      reference: '${json['complaint_id'] ?? json['id'] ?? ''}',
      category: '${json['category'] ?? 'Sanitation concern'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      locationAddress: '${json['location_address'] ?? ''}',
      description: '${json['description'] ?? ''}',
      status: '${json['status'] ?? 'pending'}',
      statusLabel:
          '${json['status_label'] ?? sanitationStatusLabel('${json['status'] ?? 'pending'}')}',
      priority: '${json['priority'] ?? 'medium'}',
      actionTaken: '${json['action_taken'] ?? ''}',
      createdAt: DateTime.tryParse('${json['created_at'] ?? ''}'),
    );
  }
}

class HouseholdSanitationItem {
  const HouseholdSanitationItem({
    required this.householdCode,
    required this.householdHead,
    required this.barangay,
    required this.status,
    required this.latitude,
    required this.longitude,
    this.surveyDate = '',
    this.waterAccessLevel = 'Level I',
    this.sanitaryToiletType = 'Pour Flush',
    this.toiletType,
    this.septicTankType,
    this.surveyValues,
  });

  final String householdCode;
  final String householdHead;
  final String barangay;
  final String status;
  final double latitude;
  final double longitude;
  final String surveyDate;
  final String waterAccessLevel;
  final String sanitaryToiletType;
  final String? toiletType;
  final String? septicTankType;

  // Keep raw editable values separate from display fallbacks. Missing keys
  // must never become defaults when an existing record is submitted.
  final Map<String, dynamic>? surveyValues;
  static const surveyFields = [
    'id',
    'household_code',
    'household_head',
    'barangay',
    'address',
    'male_count',
    'female_count',
    'toilet_type',
    'septic_tank_type',
    'water_source',
    'water_level',
    'waste_disposal',
    'latitude',
    'longitude',
  ];

  String? get editIncompatibility {
    final values = surveyValues;
    if (values == null) return 'stored household fields are unavailable';
    for (final key in surveyFields) {
      if (!values.containsKey(key)) return '$key is missing';
    }
    if (values['id'] is! int || (values['id'] as int) <= 0) {
      return 'id is invalid';
    }
    for (final key in [
      'household_code', 'household_head', 'barangay', 'address', 'water_source',
    ]) {
      if (values[key] is! String) return '$key is missing or invalid';
    }
    for (final key in ['household_code', 'household_head', 'barangay']) {
      if ((values[key] as String).trim().isEmpty) return '$key is empty';
    }
    for (final key in ['male_count', 'female_count']) {
      final value = values[key];
      if (value is! int || value < 0 || value > 99) {
        return '$key cannot be represented by the 0-99 counter';
      }
    }
    for (final entry in {
      'toilet_type': ['water_sealed', 'pour_flush', 'pit_latrine', 'none'],
      'water_level': ['level_1', 'level_2', 'level_3'],
      'waste_disposal': ['collected', 'composted', 'burned', 'dumped'],
    }.entries) {
      if (!entry.value.contains(values[entry.key])) {
        return '${entry.key} is not supported by this form';
      }
    }
    final septic = values['septic_tank_type'];
    if (septic != null &&
        septic != '' &&
        !['septic_tank', 'bottomless', 'vault_sealed'].contains(septic)) {
      return 'septic_tank_type is not supported by this form';
    }
    if (['pit_latrine', 'none'].contains(values['toilet_type']) && septic != null) {
      return 'septic_tank_type conflicts with the stored toilet_type';
    }
    for (final key in ['latitude', 'longitude']) {
      final value = values[key];
      final limit = key == 'latitude' ? 90 : 180;
      if (value is! num ||
          !value.isFinite ||
          value.abs() < 0.001 ||
          value.abs() > limit) {
        return '$key is missing or cannot be safely preserved';
      }
    }
    return null;
  }

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;

  factory HouseholdSanitationItem.fromJson(Map<String, dynamic> json) {
    return HouseholdSanitationItem(
      householdCode: '${json['household_code'] ?? ''}',
      householdHead: '${json['household_head'] ?? 'Household'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      status: '${json['status'] ?? 'good_standing'}',
      latitude: jsonDouble(json['latitude']),
      longitude: jsonDouble(json['longitude']),
      surveyDate: '${json['last_survey_date'] ?? ''}',
      waterAccessLevel:
          '${json['water_level'] ?? json['water_access_level'] ?? ''}',
      sanitaryToiletType:
          '${json['sanitary_toilet_type'] ?? json['toilet_type'] ?? 'Pour Flush'}',
      toiletType: json['toilet_type']?.toString(),
      septicTankType: json['septic_tank_type']?.toString(),
      surveyValues: Map<String, dynamic>.unmodifiable({
        for (final key in surveyFields)
          if (json.containsKey(key)) key: json[key],
      }),
    );
  }
}

class InspectionChecklistDraft {
  const InspectionChecklistDraft(this.requirementName, this.isComplied);

  final String requirementName;
  final bool isComplied;
}

class MobileUserProfile {
  const MobileUserProfile({
    required this.name,
    required this.email,
    required this.contactNumber,
  });

  final String name;
  final String email;
  final String contactNumber;

  factory MobileUserProfile.guest() {
    return const MobileUserProfile(name: '', email: '', contactNumber: '');
  }

  bool get isGuest => name.trim().isEmpty;

  String get displayName => isGuest ? 'Mauban Tourism' : name.trim();

  String get initials {
    if (isGuest) return 'MT';
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'MT';
    return parts
        .take(2)
        .map((part) => part.characters.first.toUpperCase())
        .join();
  }

  MobileUserProfile copyWith({
    String? name,
    String? email,
    String? contactNumber,
  }) {
    return MobileUserProfile(
      name: cleanProfileValue(name) ?? this.name,
      email: cleanProfileValue(email) ?? this.email,
      contactNumber: cleanProfileValue(contactNumber) ?? this.contactNumber,
    );
  }
}

class Destination {
  const Destination({
    required this.id,
    required this.name,
    required this.type,
    required this.location,
    required this.description,
    required this.rating,
    required this.imageKey,
    required this.monthlyArrivals,
    required this.hasMayorPermit,
    required this.access,
    required this.latitude,
    required this.longitude,
    this.images = const [],
  });

  final int id;
  final String name;
  final String type;
  final String location;
  final String description;
  final double rating;
  final String imageKey;
  final int monthlyArrivals;
  final bool hasMayorPermit;
  final String access;
  final double latitude;
  final double longitude;
  final List<String> images;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;
  String get permitLabel =>
      hasMayorPermit ? 'Mayor\'s permit verified' : 'Permit not verified';
  String get visitorsLabel =>
      '${formatCount(monthlyArrivals)} visitor arrivals';

  factory Destination.fromJson(Map<String, dynamic> json) {
    final name = cleanDestinationName('${json['resort_name'] ?? 'Destination'}');
    final rawKey = '${json['image_key'] ?? ''}'.trim();
    final imageKey = rawKey.isNotEmpty ? rawKey : getImageKeyFromName(name);

    return Destination(
      id: jsonInt(json['resort_id']),
      name: name,
      type: '${json['type'] ?? 'Tourism Site'}',
      location: '${json['location'] ?? 'Mauban, Quezon'}',
      description: '${json['short_description'] ?? ''}',
      rating: jsonDouble(json['tourism_rating'], 4.5),
      imageKey: imageKey,
      monthlyArrivals: jsonInt(json['monthly_arrivals']),
      hasMayorPermit: jsonBool(json['with_mayors_permit']),
      access: '${json['access'] ?? ''}',
      latitude: jsonDouble(json['latitude'], 14.18),
      longitude: jsonDouble(json['longitude'], 121.73),
      images: json['images'] is List
          ? (json['images'] as List)
              .map((e) => '$e'.trim())
              .where((e) => e.isNotEmpty)
              .toList()
          : const [],
    );
  }

  static Destination placeholder() {
    return const Destination(
      id: 0,
      name: 'No destination loaded',
      type: 'Tourism Site',
      location: 'Mauban, Quezon',
      description: 'Connect to the web system to load ranked destinations.',
      rating: 0,
      imageKey: '',
      monthlyArrivals: 0,
      hasMayorPermit: false,
      access: '',
      latitude: 14.185,
      longitude: 121.731,
      images: [],
    );
  }
}

class RefItem {
  const RefItem({
    required this.id,
    required this.name,
    this.regionId,
    this.code = '',
  });

  final int id;
  final String name;
  final int? regionId;
  final String code;

  factory RefItem.fromJson(Map<String, dynamic> json) {
    return RefItem(
      id: jsonInt(json['id']),
      name: '${json['name'] ?? ''}',
      regionId: jsonNullableInt(json['region_id']),
      code: '${json['code'] ?? ''}',
    );
  }

  @override
  bool operator ==(Object other) {
    return other is RefItem &&
        other.id == id &&
        other.regionId == regionId &&
        other.name == name;
  }

  @override
  int get hashCode => Object.hash(id, regionId, name);
}

class BarangayItem {
  const BarangayItem({required this.id, required this.name});

  final int id;
  final String name;

  factory BarangayItem.fromJson(Map<String, dynamic> json) {
    return BarangayItem(id: jsonInt(json['id']), name: '${json['name'] ?? ''}');
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
  });

  final String id;
  final String title;
  final String message;
  final String type;

  IconData get icon {
    if (type == 'approval') return Icons.verified_outlined;
    if (type == 'sanitation') return Icons.health_and_safety_outlined;
    if (type == 'tourism') return Icons.explore_outlined;
    return Icons.info_outline;
  }

  Color get color {
    if (type == 'approval') return const Color(0xFF10B981);
    if (type == 'sanitation') return Colors.orange;
    if (type == 'tourism') return AppColors.green;
    return Colors.blue;
  }

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: '${json['id'] ?? ''}',
      title: '${json['title'] ?? 'Notification'}',
      message: '${json['message'] ?? ''}',
      type: '${json['type'] ?? 'info'}',
    );
  }

  static List<AppNotification> fallback() {
    return const [
      AppNotification(
        id: 'welcome',
        title: 'Welcome to Mauban',
        message:
            'Explore destinations, guides, maps, and registration services.',
        type: 'tourism',
      ),
      AppNotification(
        id: 'report',
        title: 'Community Report Available',
        message: 'Residents can submit sanitation concerns to the LGU.',
        type: 'sanitation',
      ),
    ];
  }
}

class MobileVisitReceipt {
  const MobileVisitReceipt({
    required this.reference,
    required this.destination,
    required this.arrivalDate,
    required this.totalVisitors,
    required this.status,
    required this.fullName,
    required this.contactNumber,
    required this.email,
  });

  final String reference;
  final Destination destination;
  final DateTime arrivalDate;
  final int totalVisitors;
  final String status;
  final String fullName;
  final String contactNumber;
  final String email;
  String get displayStatus => statusLabel(status);

  factory MobileVisitReceipt.fromResponse(
    Map<String, dynamic> json, {
    required Destination destination,
    required DateTime arrivalDate,
    required int totalVisitors,
  }) {
    return MobileVisitReceipt(
      reference: '${json['survey_id'] ?? 'Pending sync'}',
      destination: destination,
      arrivalDate: arrivalDate,
      totalVisitors: jsonInt(json['total_visitors'], totalVisitors),
      status: '${json['status'] ?? 'pending'}',
      fullName: '${json['full_name'] ?? ''}',
      contactNumber: '${json['contact_number'] ?? ''}',
      email: '${json['email'] ?? ''}',
    );
  }
}

class MobileFeedbackReceipt {
  const MobileFeedbackReceipt({
    required this.reference,
    required this.destination,
    required this.reviewer,
    required this.rating,
    required this.message,
    required this.reply,
    required this.date,
    this.photos = const [],
  });

  final String reference;
  final Destination destination;
  final String reviewer;
  final int rating;
  final String message;
  final String reply;
  final String date;
  final List<String> photos;

  factory MobileFeedbackReceipt.fromResponse(
    Map<String, dynamic> json, {
    required Destination destination,
    required String reviewer,
    required int rating,
  }) {
    final rawPhotos = json['photos'];
    final List<String> photos = rawPhotos is List
        ? rawPhotos.map((e) => '$e'.trim()).where((e) => e.isNotEmpty).toList()
        : const [];

    return MobileFeedbackReceipt(
      reference: '${json['id'] ?? 'Pending sync'}',
      destination: destination,
      reviewer: '${json['reviewer'] ?? reviewer}',
      rating: jsonInt(json['rating'], rating),
      message: '${json['message'] ?? ''}',
      reply: '${json['reply'] ?? ''}',
      date: '${json['date'] ?? ''}',
      photos: photos,
    );
  }
}

class MobileSanitationReceipt {
  const MobileSanitationReceipt({
    required this.reference,
    required this.category,
    required this.barangay,
    required this.status,
    required this.statusLabel,
    required this.priority,
    required this.priorityLabel,
    required this.actionTaken,
    required this.reportedDate,
  });

  final String reference;
  final String category;
  final String barangay;
  final String status;
  final String statusLabel;
  final String priority;
  final String priorityLabel;
  final String actionTaken;
  final String reportedDate;

  factory MobileSanitationReceipt.fromResponse(
    Map<String, dynamic> json, {
    required String category,
    required String barangay,
  }) {
    return MobileSanitationReceipt.fromJson(
      json,
      fallbackCategory: category,
      fallbackBarangay: barangay,
    );
  }

  factory MobileSanitationReceipt.fromJson(
    Map<String, dynamic> json, {
    String fallbackCategory = 'Sanitation concern',
    String fallbackBarangay = 'Unspecified',
  }) {
    final status = '${json['status'] ?? 'pending'}';
    final priority = '${json['priority'] ?? 'medium'}';
    return MobileSanitationReceipt(
      reference: '${json['complaint_id'] ?? 'Pending sync'}',
      category: '${json['category'] ?? fallbackCategory}',
      barangay: '${json['barangay'] ?? fallbackBarangay}',
      status: status,
      statusLabel: '${json['status_label'] ?? sanitationStatusLabel(status)}',
      priority: priority,
      priorityLabel:
          '${json['priority_label'] ?? sanitationPriorityLabel(priority)}',
      actionTaken: '${json['action_taken'] ?? ''}',
      reportedDate: '${json['reported_date'] ?? ''}',
    );
  }
}

class SanitationReportDraft {
  const SanitationReportDraft({
    required this.id,
    required this.name,
    required this.contactNumber,
    required this.category,
    required this.priority,
    required this.barangay,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.isAnonymous,
    required this.createdAt,
    this.address = '',
  });

  final String id;
  final String name;
  final String contactNumber;
  final String category;
  final String priority;
  final String barangay;
  final String description;
  final String address;
  final String latitude;
  final String longitude;
  // Kept so drafts saved by older builds still load; new drafts are never anonymous.
  final bool isAnonymous;
  final String createdAt;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'contact_number': contactNumber,
      'category': category,
      'priority': priority,
      'barangay': barangay,
      'description': description,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
      'is_anonymous': isAnonymous,
      'created_at': createdAt,
    };
  }

  factory SanitationReportDraft.fromJson(Map<String, dynamic> json) {
    return SanitationReportDraft(
      id: '${json['id'] ?? DateTime.now().millisecondsSinceEpoch}',
      name: '${json['name'] ?? ''}',
      contactNumber: '${json['contact_number'] ?? ''}',
      category: '${json['category'] ?? sanitationReportCategories.first}',
      priority: '${json['priority'] ?? 'medium'}',
      barangay: '${json['barangay'] ?? ''}',
      description: '${json['description'] ?? ''}',
      address: '${json['address'] ?? ''}',
      latitude: '${json['latitude'] ?? ''}',
      longitude: '${json['longitude'] ?? ''}',
      isAnonymous: json['is_anonymous'] == true,
      createdAt: '${json['created_at'] ?? ''}',
    );
  }

  SanitationReportDraft copyWith({
    String? id,
    String? name,
    String? contactNumber,
    String? category,
    String? priority,
    String? barangay,
    String? description,
    String? address,
    String? latitude,
    String? longitude,
    bool? isAnonymous,
    String? createdAt,
  }) {
    return SanitationReportDraft(
      id: id ?? this.id,
      name: name ?? this.name,
      contactNumber: contactNumber ?? this.contactNumber,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      barangay: barangay ?? this.barangay,
      description: description ?? this.description,
      address: address ?? this.address,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      isAnonymous: isAnonymous ?? this.isAnonymous,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class SanitationDraftStore {
  const SanitationDraftStore._();

  static Future<List<SanitationReportDraft>> loadReports() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(sanitationReportDraftsKey) ?? [];
    return raw
        .map((item) {
          try {
            return SanitationReportDraft.fromJson(
              Map<String, dynamic>.from(jsonDecode(item) as Map),
            );
          } catch (_) {
            return null;
          }
        })
        .whereType<SanitationReportDraft>()
        .toList();
  }

  static Future<void> saveReports(List<SanitationReportDraft> drafts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      sanitationReportDraftsKey,
      drafts.map((item) => jsonEncode(item.toJson())).toList(),
    );
  }

  static Future<void> upsertReport(SanitationReportDraft draft) async {
    final drafts = await loadReports();
    final index = drafts.indexWhere((item) => item.id == draft.id);
    if (index >= 0) {
      drafts[index] = draft;
    } else {
      drafts.insert(0, draft);
    }
    await saveReports(drafts);
  }

  static Future<void> removeReport(String id) async {
    final drafts = await loadReports();
    drafts.removeWhere((item) => item.id == id);
    await saveReports(drafts);
  }
}

class PermitVerificationResult {
  const PermitVerificationResult({
    required this.verified,
    required this.code,
    required this.establishment,
    required this.permitStatusLabel,
    required this.issuedDate,
    required this.expiryDate,
  });

  final bool verified;
  final String code;
  final SanitationEstablishment establishment;
  final String permitStatusLabel;
  final String issuedDate;
  final String expiryDate;

  factory PermitVerificationResult.fromJson(Map<String, dynamic> json) {
    final permit = Map<String, dynamic>.from(json['permit'] as Map? ?? {});
    final permitStatus = '${permit['permit_status'] ?? ''}';
    return PermitVerificationResult(
      verified: jsonBool(json['verified']),
      code: '${json['code'] ?? ''}',
      establishment: SanitationEstablishment.fromJson(
        Map<String, dynamic>.from(json['establishment'] as Map? ?? {}),
      ),
      permitStatusLabel:
          '${permit['permit_status_label'] ?? sanitationStatusLabel(permitStatus)}',
      issuedDate: '${permit['permit_issued_date'] ?? ''}',
      expiryDate: '${permit['permit_expiry_date'] ?? ''}',
    );
  }
}

class MobileSanitationInspectionReceipt {
  const MobileSanitationInspectionReceipt({
    required this.reference,
    required this.establishmentName,
    required this.inspectorName,
    required this.inspectionDate,
    required this.status,
  });

  final String reference;
  final String establishmentName;
  final String inspectorName;
  final String inspectionDate;
  final String status;

  factory MobileSanitationInspectionReceipt.fromResponse(
    Map<String, dynamic> json, {
    required SanitationEstablishment establishment,
    required String inspectorName,
    required String status,
    required String inspectionDate,
  }) {
    return MobileSanitationInspectionReceipt(
      reference: '${json['id'] ?? 'Saved'}',
      establishmentName:
          '${json['establishment_name'] ?? establishment.businessName}',
      inspectorName: '${json['inspector_name'] ?? inspectorName}',
      inspectionDate: '${json['inspection_date'] ?? inspectionDate}',
      status: '${json['status_after_inspection'] ?? status}',
    );
  }
}

class MobileHouseholdSurveyReceipt {
  const MobileHouseholdSurveyReceipt({
    required this.householdCode,
    required this.householdHead,
    required this.barangay,
    required this.status,
    required this.inspectionDate,
    required this.waterSource,
    required this.toiletType,
  });

  final String householdCode;
  final String householdHead;
  final String barangay;
  final String status;
  final String inspectionDate;
  final String waterSource;
  final String toiletType;

  factory MobileHouseholdSurveyReceipt.fromResponse(
    Map<String, dynamic> json, {
    required String head,
    required String barangay,
    required String waterSource,
    required String toiletType,
  }) {
    final now = DateTime.now();
    final dateStr = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    return MobileHouseholdSurveyReceipt(
      householdCode: '${json['household_code'] ?? 'HH-SAVED'}',
      householdHead: head,
      barangay: barangay,
      status: '${json['status'] ?? 'good_standing'}',
      inspectionDate: dateStr,
      waterSource: waterSource,
      toiletType: toiletType,
    );
  }

  factory MobileHouseholdSurveyReceipt.fromRecord(HouseholdSanitationItem record) {
    return MobileHouseholdSurveyReceipt(
      householdCode: record.householdCode,
      householdHead: record.householdHead,
      barangay: record.barangay,
      status: record.status,
      inspectionDate: record.surveyDate,
      waterSource: '${record.surveyValues?['water_source'] ?? ''}',
      toiletType: record.sanitaryToiletType,
    );
  }
}

class IntroItem {
  const IntroItem({
    required this.icon,
    required this.title,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String title;
  final String text;
  final Color color;
}

/// One line of the Establishment Portal checklist. [submitted] is null when
/// there is no open renewal to judge it against.
class OwnerRequirementItem {
  const OwnerRequirementItem({required this.name, required this.submitted});

  final String name;
  final bool? submitted;

  factory OwnerRequirementItem.fromJson(Map<String, dynamic> json) {
    final submitted = json['submitted'];
    return OwnerRequirementItem(
      name: '${json['name'] ?? ''}',
      submitted: submitted is bool ? submitted : null,
    );
  }
}

/// The Establishment Portal answer (POST /mobile/sanitation/establishment-status/).
class OwnerPermitStatus {
  const OwnerPermitStatus({
    required this.businessName,
    required this.businessType,
    required this.barangay,
    required this.permitNumber,
    required this.permitStatus,
    required this.permitStatusLabel,
    required this.permitExpiryDate,
    required this.daysLeft,
    required this.isExpired,
    required this.renewalNotice,
    required this.expiredNotice,
    required this.suspendedNotice,
    required this.requirements,
    required this.requirementsNote,
  });

  final String businessName;
  final String businessType;
  final String barangay;
  final String? permitNumber;
  final String permitStatus;
  final String permitStatusLabel;
  final String? permitExpiryDate;
  final int? daysLeft;
  final bool isExpired;
  final String? renewalNotice;
  final String? expiredNotice;
  final String? suspendedNotice;
  final List<OwnerRequirementItem> requirements;
  final String? requirementsNote;

  factory OwnerPermitStatus.fromJson(Map<String, dynamic> json) {
    String? text(String key) {
      final value = json[key];
      if (value == null) return null;
      final trimmed = '$value'.trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    final days = json['days_left'];
    return OwnerPermitStatus(
      businessName: text('business_name') ?? '',
      businessType: text('business_type') ?? '',
      barangay: text('barangay') ?? '',
      permitNumber: text('permit_number'),
      permitStatus: text('permit_status') ?? '',
      permitStatusLabel: text('permit_status_label') ?? '',
      permitExpiryDate: text('permit_expiry_date'),
      daysLeft: days is int ? days : int.tryParse('${days ?? ''}'),
      isExpired: json['is_expired'] == true,
      renewalNotice: text('renewal_notice'),
      expiredNotice: text('expired_notice'),
      suspendedNotice: text('suspended_notice'),
      requirements: (json['requirements'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => OwnerRequirementItem.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      requirementsNote: text('requirements_note'),
    );
  }
}
