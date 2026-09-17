void downloadBytesWeb(
  List<int> bytes,
  String fileName, {
  String mimeType = 'application/octet-stream',
}) {
  // No-op on native platforms (Android, iOS)
}

void downloadStringWeb(
  String content,
  String fileName, {
  String mimeType = 'text/plain;charset=utf-8',
}) {
  // No-op on native platforms (Android, iOS)
}
