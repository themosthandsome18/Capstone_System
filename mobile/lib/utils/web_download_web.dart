import 'dart:convert';
import 'dart:js_interop';

@JS('downloadBlob')
external void _downloadBlob(
  JSString base64Data,
  JSString fileName,
  JSString mimeType,
);

void downloadBytesWeb(
  List<int> bytes,
  String fileName, {
  String mimeType = 'application/octet-stream',
}) {
  try {
    final base64Str = base64Encode(bytes);
    _downloadBlob(base64Str.toJS, fileName.toJS, mimeType.toJS);
  } catch (_) {}
}

void downloadStringWeb(
  String content,
  String fileName, {
  String mimeType = 'text/plain;charset=utf-8',
}) {
  try {
    final bytes = utf8.encode(content);
    downloadBytesWeb(bytes, fileName, mimeType: mimeType);
  } catch (_) {}
}
