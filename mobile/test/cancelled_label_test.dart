// A booking that did not happen is SHOWN as "Cancelled" and still STORED as "no_show".
// Since 2026-11-12 people read "Cancelled" (the person who checks the system asked for it); the stored value was not renamed.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mauban_mobile_app/main.dart';

void main() {
  test('the stored value no_show is read as Cancelled by statusLabel()', () {
    expect(statusLabel('no_show'), 'Cancelled');
    expect(statusLabel('pending'), 'Pending');
    expect(statusLabel('arrived'), 'Arrived');
  });

  test('the chip for no_show says Cancelled', () {
    expect(touristStatusChip('no_show')?.label, 'Cancelled');
  });

  test('no screen file of the app writes the words No-show', () {
    final words = RegExp(r'''["'][^"'\n]*\bno[- ]show''', caseSensitive: false);
    final found = <String>[];
    for (final file in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!file.path.endsWith('.dart')) continue;
      var number = 0;
      for (final line in file.readAsLinesSync()) {
        number++;
        if (line.trimLeft().startsWith('//')) continue;
        if (words.hasMatch(line)) found.add('${file.path}:$number');
      }
    }
    expect(found, isEmpty);
  });
}
