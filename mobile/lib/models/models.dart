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
        RefItem(id: 2, name: 'Day Tour'),
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
      barangays: const [
        BarangayItem(id: 1, name: 'Poblacion'),
        BarangayItem(id: 2, name: 'San Isidro'),
        BarangayItem(id: 3, name: 'Cagsiay'),
      ],
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

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;

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
  });

  final String reference;
  final String category;
  final String barangay;
  final String description;
  final String status;
  final String statusLabel;
  final String priority;
  final String actionTaken;

  factory SanitationComplaintItem.fromJson(Map<String, dynamic> json) {
    return SanitationComplaintItem(
      reference: '${json['complaint_id'] ?? json['id'] ?? ''}',
      category: '${json['category'] ?? 'Sanitation concern'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      description: '${json['description'] ?? ''}',
      status: '${json['status'] ?? 'pending'}',
      statusLabel:
          '${json['status_label'] ?? sanitationStatusLabel('${json['status'] ?? 'pending'}')}',
      priority: '${json['priority'] ?? 'medium'}',
      actionTaken: '${json['action_taken'] ?? ''}',
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
  });

  final String householdCode;
  final String householdHead;
  final String barangay;
  final String status;
  final double latitude;
  final double longitude;

  bool get hasCoordinates => latitude.abs() > 0.001 && longitude.abs() > 0.001;

  factory HouseholdSanitationItem.fromJson(Map<String, dynamic> json) {
    return HouseholdSanitationItem(
      householdCode: '${json['household_code'] ?? ''}',
      householdHead: '${json['household_head'] ?? 'Household'}',
      barangay: '${json['barangay'] ?? 'Unspecified'}',
      status: '${json['status'] ?? 'good_standing'}',
      latitude: jsonDouble(json['latitude']),
      longitude: jsonDouble(json['longitude']),
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
    if (type == 'sanitation') return Icons.health_and_safety_outlined;
    if (type == 'tourism') return Icons.explore_outlined;
    return Icons.info_outline;
  }

  Color get color {
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
  });

  final String reference;
  final Destination destination;
  final String reviewer;
  final int rating;

  factory MobileFeedbackReceipt.fromResponse(
    Map<String, dynamic> json, {
    required Destination destination,
    required String reviewer,
    required int rating,
  }) {
    return MobileFeedbackReceipt(
      reference: '${json['id'] ?? 'Pending sync'}',
      destination: destination,
      reviewer: '${json['reviewer'] ?? reviewer}',
      rating: jsonInt(json['rating'], rating),
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
  });

  final String id;
  final String name;
  final String contactNumber;
  final String category;
  final String priority;
  final String barangay;
  final String description;
  final String latitude;
  final String longitude;
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
      barangay: '${json['barangay'] ?? 'Poblacion'}',
      description: '${json['description'] ?? ''}',
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
    required this.complianceStatusLabel,
    required this.expiryDate,
  });

  final bool verified;
  final String code;
  final SanitationEstablishment establishment;
  final String permitStatusLabel;
  final String complianceStatusLabel;
  final String expiryDate;

  factory PermitVerificationResult.fromJson(Map<String, dynamic> json) {
    final permit = Map<String, dynamic>.from(json['permit'] as Map? ?? {});
    final permitStatus = '${permit['permit_status'] ?? ''}';
    final complianceStatus = '${permit['compliance_status'] ?? ''}';
    return PermitVerificationResult(
      verified: jsonBool(json['verified']),
      code: '${json['code'] ?? ''}',
      establishment: SanitationEstablishment.fromJson(
        Map<String, dynamic>.from(json['establishment'] as Map? ?? {}),
      ),
      permitStatusLabel:
          '${permit['permit_status_label'] ?? sanitationStatusLabel(permitStatus)}',
      complianceStatusLabel:
          '${permit['compliance_status_label'] ?? sanitationStatusLabel(complianceStatus)}',
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
