part of '../main.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:8000/api',
);

const appModule = String.fromEnvironment('APP_MODULE', defaultValue: 'tourism');
const sanitationReportDraftsKey = 'sanitation_report_drafts';

String conciseError(Object error) {
  final message = error.toString().replaceFirst('Exception: ', '');
  return message.length > 160 ? '${message.substring(0, 160)}...' : message;
}

const boatCapacityFareOptions = [
  '',
  '1-2 pax (One-Way P1500, Two-way P2000)',
  '3-4 pax (One-Way P2000, Two-way P2,500)',
  '5-6 pax (One-Way P2,500, Two-way P3,000)',
  '7-8 pax (One-Way P3,000, Two-way P3,500)',
  '9-10 pax (One-Way P3,500, Two-way P4,000)',
  '11-12 pax (One-Way P4,000, Two-way P4,500)',
  '13-14 pax (One-Way P4,500, Two-way P5,000)',
  '15-17 pax (One-Way P5,000, Two-way P5,500)',
  '18-20 pax (One-Way P5,500, Two-way P6,000)',
];

extension FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;

  T? firstWhereOrNull(bool Function(T item) test) {
    for (final item in this) {
      if (test(item)) return item;
    }
    return null;
  }
}

List<T> parseList<T>(Object? value, T Function(Map<String, dynamic>) parser) {
  if (value is! List) return [];
  return value
      .whereType<Map>()
      .map((item) => parser(Map<String, dynamic>.from(item)))
      .toList();
}

int jsonInt(Object? value, [int fallback = 0]) {
  if (value is int) return value;
  return int.tryParse('$value') ?? fallback;
}

int? jsonNullableInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  return int.tryParse('$value');
}

bool jsonBool(Object? value, [bool fallback = false]) {
  if (value is bool) return value;
  final text = '$value'.toLowerCase().trim();
  if (text == 'true' || text == '1' || text == 'yes') return true;
  if (text == 'false' || text == '0' || text == 'no') return false;
  return fallback;
}

double jsonDouble(Object? value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? fallback;
}

LatLng? latLngFromText(String latitude, String longitude) {
  final lat = double.tryParse(latitude.trim());
  final lng = double.tryParse(longitude.trim());
  if (lat == null || lng == null) return null;
  if (lat.abs() < 0.001 || lng.abs() < 0.001) return null;
  return LatLng(lat, lng);
}

int clampInt(int value, int min, int max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

String imageAssetFor(String imageKey) {
  final cleanKey = imageKey.toLowerCase().trim();

  if (cleanKey.contains('aguho')) {
    return 'assets/destinations/Aguho Playa Beach Resort - Cagbalete.jpg';
  }
  if (cleanKey.contains('aquazul')) {
    return 'assets/destinations/Aquazul Hotel and Resort - Cagbalete.jpg';
  }
  if (cleanKey.contains('dona-choleng')) {
    return 'assets/destinations/Dona Choleng Camping Resort - Cagbalete.jpg';
  }
  if (cleanKey.contains('jovencio')) {
    return "assets/destinations/Jovencio's Resort Cagbalete.jpg";
  }
  if (cleanKey.contains('nino')) {
    return 'assets/destinations/MVT Sto. Nino Beach Resort - Cagbalete.jpg';
  }
  if (cleanKey.contains('nenita')) {
    return 'assets/destinations/Nenita Del Sol - Cagbalete.jpg';
  }
  if (cleanKey.contains('nilandingan')) {
    return 'assets/destinations/Nilandingan Cove Resort - Cagbalete.jpg';
  }
  if (cleanKey.contains('orlan')) {
    return 'assets/destinations/Orlan Beach Resort - Cagbalete.jpg';
  }
  if (cleanKey.contains('rio-del-sol')) {
    return 'assets/destinations/Rio Del Sol Beach Resort - Cagbalete.avif';
  }
  if (cleanKey.contains('tent')) {
    return 'assets/destinations/Tent Place - Cagbalete.jpg';
  }
  if (cleanKey.contains('pinay')) {
    return 'assets/destinations/Tita Pinay Beach Resort - Cagbalete.png';
  }
  if (cleanKey.contains('cleofas')) {
    return 'assets/destinations/Villa Cleofas Cagbalete.webp';
  }
  if (cleanKey.contains('escaparde')) {
    return 'assets/destinations/Villa Escaparde Camping and Beach Resort.jpg';
  }
  if (cleanKey.contains('noe-beach') || cleanKey.contains('villa-noe')) {
    return 'assets/destinations/Villa Noe Beach- Cagbalete.jpg';
  }
  if (cleanKey.contains('pilarosa')) {
    return 'assets/destinations/Villa Pilarosa Beach Resort - Cagbalete.png';
  }

  // Fallbacks for other dynamic resort names using actually existing files
  if (cleanKey.contains('beach') ||
      cleanKey.contains('resort') ||
      cleanKey.contains('cove') ||
      cleanKey.contains('island')) {
    final length = cleanKey.length;
    final fallbackAssets = [
      'assets/destinations/Dona Choleng Camping Resort - Cagbalete.jpg',
      'assets/destinations/Aquazul Hotel and Resort - Cagbalete.jpg',
      'assets/destinations/Rio Del Sol Beach Resort - Cagbalete.avif',
      'assets/destinations/Villa Escaparde Camping and Beach Resort.jpg',
    ];
    return fallbackAssets[length % fallbackAssets.length];
  }

  return 'assets/tourism_logo.jpg';
}

String isoDate(DateTime date) {
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

String shortDate(DateTime date) {
  return '${date.month}/${date.day}/${date.year}';
}

String? cleanProfileValue(String? value) {
  final trimmed = value?.trim() ?? '';
  return trimmed.isEmpty ? null : trimmed;
}

String cleanDestinationName(String value) {
  var cleaned = value.trim().replaceAll(RegExp(r'\s+'), ' ');
  while (cleaned.endsWith('(') || cleaned.endsWith('[')) {
    cleaned = cleaned.substring(0, cleaned.length - 1).trim();
  }
  return cleaned.isEmpty ? 'Unnamed Destination' : cleaned;
}

String boatCapacityFareLabel(String value) {
  return value.isEmpty ? 'Select capacity and fare' : value;
}

String statusLabel(String value) {
  switch (value) {
    case 'pending':
      return 'Pending';
    case 'arrived':
      return 'Arrived';
    case 'no_show':
      return 'No-show';
    default:
      return value.isEmpty ? 'Pending' : value;
  }
}

String sanitationPriorityLabel(String value) {
  switch (value) {
    case 'high':
      return 'Urgent';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return value.isEmpty ? 'Medium' : value;
  }
}

String sanitationStatusLabel(String value) {
  switch (value) {
    case 'good_standing':
      return 'Good Standing';
    case 'upcoming':
      return 'Upcoming';
    case 'for_completion':
      return 'For Completion';
    case 'violation':
      return 'Violation';
    case 'no_permit':
      return 'No Permit';
    case 'active':
      return 'Active';
    case 'renewal_due':
      return 'Renewal Due';
    case 'conditional':
      return 'Conditional';
    case 'suspended':
      return 'Suspended';
    case 'pending':
      return 'Pending';
    case 'investigating':
      return 'Under Investigation';
    case 'resolved':
      return 'Resolved';
    case 'rejected':
      return 'Rejected';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return value.isEmpty ? 'Pending' : value;
  }
}

String permitStatusLabel(String value) => sanitationStatusLabel(value);

String householdStatusLabel(String value) {
  switch (value) {
    case 'good_standing':
      return 'Good Standing';
    case 'for_completion':
      return 'For Completion';
    case 'violation':
      return 'Violation';
    default:
      return value.isEmpty ? 'Good Standing' : value;
  }
}

Color sanitationStatusColor(String value) {
  switch (value) {
    case 'good_standing':
    case 'active':
    case 'low':
    case 'resolved':
      return AppColors.green;
    case 'upcoming':
    case 'for_completion':
    case 'renewal_due':
    case 'conditional':
    case 'medium':
    case 'pending':
    case 'investigating':
      return const Color(0xffd59b00);
    case 'violation':
    case 'no_permit':
    case 'suspended':
    case 'high':
    case 'rejected':
      return Colors.red;
    default:
      return AppColors.muted;
  }
}

String formatCount(int value) {
  final text = value.toString();
  final buffer = StringBuffer();
  for (var index = 0; index < text.length; index += 1) {
    final remaining = text.length - index;
    buffer.write(text[index]);
    if (remaining > 1 && remaining % 3 == 1) buffer.write(',');
  }
  return buffer.toString();
}

String householdToiletLabel(String value) {
  switch (value) {
    case 'water_sealed':
      return 'Water-sealed';
    case 'pour_flush':
      return 'Pour-flush';
    case 'pit_latrine':
      return 'Pit latrine';
    case 'none':
      return 'No toilet facility';
    default:
      return value;
  }
}

String householdWaterLabel(String value) {
  switch (value) {
    case 'level_1':
      return 'Level I';
    case 'level_2':
      return 'Level II';
    case 'level_3':
      return 'Level III';
    default:
      return value;
  }
}

String householdWasteLabel(String value) {
  switch (value) {
    case 'collected':
      return 'Collected by LGU';
    case 'composted':
      return 'Composted';
    case 'burned':
      return 'Burned';
    case 'dumped':
      return 'Dumped';
    default:
      return value;
  }
}

void showAppMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message.replaceFirst('Exception: ', ''))),
  );
}

Future<void> showSubmissionDialog(
  BuildContext context, {
  required String title,
  required String referenceLabel,
  required String referenceValue,
  required String message,
  List<String> details = const [],
}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      icon: const Icon(Icons.check_circle, color: AppColors.green, size: 34),
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xffecfdf3),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xffb7e8c6)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  referenceLabel,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
                const SizedBox(height: 4),
                Text(
                  referenceValue,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
              ],
            ),
          ),
          if (details.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...details.map(
              (detail) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.check_circle_outline,
                      color: AppColors.green,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Expanded(child: Text(detail)),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Done'),
        ),
      ],
    ),
  );
}

String getImageKeyFromName(String name) {
  return name
      .toLowerCase()
      .replaceAll('mt.', 'mt')
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
}
