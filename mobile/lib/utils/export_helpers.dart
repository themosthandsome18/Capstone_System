part of '../main.dart';

/// Standard CSV string builder following RFC 4180 rules.
/// Escapes fields containing commas, double quotes, or newlines.
String buildCsv(List<String> headers, List<List<String>> rows) {
  String escapeCell(String value) {
    if (value.contains('"') ||
        value.contains(',') ||
        value.contains('\n') ||
        value.contains('\r')) {
      return '"${value.replaceAll('"', '""')}"';
    }
    return value;
  }

  final buffer = StringBuffer();

  // Header row
  buffer.writeln(headers.map(escapeCell).join(','));

  // Data rows
  for (final row in rows) {
    buffer.writeln(row.map(escapeCell).join(','));
  }

  return buffer.toString();
}

/// Writes a UTF-8 string to a file inside the system temporary directory.
Future<File> saveStringToTempFile(String content, String fileName) async {
  final tempDir = await getTemporaryDirectory();
  final file = File('${tempDir.path}/$fileName');
  return file.writeAsString(content, flush: true);
}

/// Writes raw binary bytes to a file inside the system temporary directory.
Future<File> saveBytesToTempFile(List<int> bytes, String fileName) async {
  final tempDir = await getTemporaryDirectory();
  final file = File('${tempDir.path}/$fileName');
  return file.writeAsBytes(bytes, flush: true);
}

/// Shares a file via the OS-native share sheet using share_plus.
/// Returns the [ShareResult] so callers can check if the user completed or dismissed.
Future<ShareResult> shareFile({
  required File file,
  String? subject,
  String? text,
}) async {
  final xFile = XFile(file.path);
  return Share.shareXFiles(
    [xFile],
    subject: subject,
    text: text,
  );
}

/// Builds a standard CSV string for tourist arrival records.
String buildTouristArrivalsCsv(List<Map<String, dynamic>> records) {
  final headers = [
    'survey_id',
    'full_name',
    'contact_number',
    'resort_name',
    'arrival_date',
    'status',
    'total_visitors',
    'filipino_count',
    'foreigner_count',
  ];

  final rows = records.map((r) {
    return [
      (r['survey_id'] ?? '').toString(),
      (r['full_name'] ?? '').toString(),
      (r['contact_number'] ?? '').toString(),
      (r['resort_name'] ?? '').toString(),
      (r['arrival_date'] ?? '').toString(),
      (r['status'] ?? '').toString(),
      (r['total_visitors'] ?? '').toString(),
      (r['filipino_count'] ?? '').toString(),
      (r['foreigner_count'] ?? '').toString(),
    ];
  }).toList();

  return buildCsv(headers, rows);
}
