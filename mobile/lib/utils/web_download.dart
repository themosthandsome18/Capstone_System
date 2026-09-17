import 'web_download_stub.dart'
    if (dart.library.js_interop) 'web_download_web.dart'
    as platform_download;

void downloadBytesWeb(
  List<int> bytes,
  String fileName, {
  String mimeType = 'application/octet-stream',
}) {
  platform_download.downloadBytesWeb(bytes, fileName, mimeType: mimeType);
}

void downloadStringWeb(
  String content,
  String fileName, {
  String mimeType = 'text/plain;charset=utf-8',
}) {
  platform_download.downloadStringWeb(content, fileName, mimeType: mimeType);
}
