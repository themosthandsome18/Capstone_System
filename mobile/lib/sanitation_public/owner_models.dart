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
