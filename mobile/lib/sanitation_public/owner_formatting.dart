/// Trimmed, upper-case and without spaces; dashes stay (the server accepts
/// the code with or without them).
String normalizeOwnerTrackingCode(String value) =>
    value.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');

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
