// A source scan: no string literal in the app's code may use a name or a place
// for the fee that the LGU has retired.
//
// Unlike the widget tests, which look at the few screens they render, this one
// reads every .dart file under lib/ (except the sanitation app's own files),
// so a NEW file or a NEW string is looked at without anyone remembering to add
// it to a list.
//
// What counts: a STRING LITERAL. Comments are not read (a comment may say
// "entrance fee"; it is not shown to anyone). Adjacent literals that Dart
// joins ('tourism ' 'desk') are joined here too, so a phrase cannot be hidden
// by splitting it.
//
// HOW TO ADD A PATTERN (colours, another retired word, ...):
//   1. Add a ForbiddenPattern to [forbiddenPatterns] with a name, a RegExp
//      and the reason, in a sentence a stranger can follow.
//   2. Run the test. Every hit is either wrong (fix the string) or right (add
//      an AllowedUse with the file, the pattern and WHY it is right). A new
//      hit that nobody classified fails the build: that is the point.
//   3. An AllowedUse that no longer matches anything fails too, so the list
//      cannot rot.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// One retired phrase (or kind of phrase), and why it is retired.
class ForbiddenPattern {
  const ForbiddenPattern(this.name, this.pattern, this.reason);

  final String name;
  final String pattern; // a RegExp source, matched ignoring case
  final String reason;

  RegExp get regExp => RegExp(pattern, caseSensitive: false);
}

/// A literal that contains a forbidden pattern and is right anyway.
class AllowedUse {
  const AllowedUse(this.file, this.patternName, this.reason);

  final String file; // path under mobile/, forward slashes
  final String patternName;
  final String reason; // required: why this one is right
}

const forbiddenPatterns = <ForbiddenPattern>[
  ForbiddenPattern(
    'Environmental & Tourism Fee',
    r'environmental\s*&\s*tourism\s+fee',
    'The fee has one name, "Environmental Fee" (the LGU, 2026-10-13).',
  ),
  ForbiddenPattern(
    'Tourism Port & Environmental Fee',
    r'tourism\s+port\s*&\s*environmental\s+fee',
    'The fee has one name, "Environmental Fee" (the LGU, 2026-10-13).',
  ),
  ForbiddenPattern(
    'Entrance fee',
    r'entrance\s+fee',
    'The fee has one name, "Environmental Fee" (the LGU, 2026-10-13).',
  ),
  ForbiddenPattern(
    'tourism desk',
    r'tourism\s+desk',
    'It is paid at the Tourism Office, 2nd Floor, Mauban Municipal Hall; '
        '"tourism desk" is not a place the LGU named.',
  ),
  ForbiddenPattern(
    'passenger terminal',
    r'passenger\s+terminal',
    'It is not paid at a terminal; it is paid at the Tourism Office.',
  ),
  ForbiddenPattern(
    'collect fees',
    r'collect\s+fees',
    'Resort staff collect no fee; the QR scan is to check the visitor\'s '
        'details (the LGU, 2026-10-13).',
  ),
  ForbiddenPattern(
    'Tourism Information Center',
    r'tourism\s+information\s+cent(er|re)',
    'It is the same place as the Tourism Office, 2nd Floor, Mauban Municipal '
        'Hall: one place, one name (the LGU, 2026-10-13).',
  ),
];

/// Literals that hold a forbidden pattern and are right. Empty on purpose:
/// every entry must say why.
const allowedUses = <AllowedUse>[];

/// Files that are not looked at: the sanitation app's own entry and screens.
const skippedFiles = <String>{
  'lib/screens/sanitation_screens.dart',
  'lib/main_sanitation.dart',
};

// ---- the scanner ------------------------------------------------------------

class Literal {
  const Literal(this.text, this.line);

  final String text;
  final int line;
}

bool _isIdentChar(String c) => RegExp(r'[A-Za-z0-9_$]').hasMatch(c);

/// The string literals of Dart [source], comments excluded, adjacent literals
/// joined. Interpolations (`$x`, `${...}`) become nothing.
List<Literal> stringLiterals(String source) {
  final s = source;
  final n = s.length;
  final raw = <(String, int, int, int)>[]; // text, start, end, line
  var i = 0;
  var line = 1;

  while (i < n) {
    final c = s[i];
    if (c == '\n') {
      line++;
      i++;
      continue;
    }
    if (s.startsWith('//', i)) {
      while (i < n && s[i] != '\n') {
        i++;
      }
      continue;
    }
    if (s.startsWith('/*', i)) {
      var depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (s.startsWith('/*', i)) {
          depth++;
          i += 2;
        } else if (s.startsWith('*/', i)) {
          depth--;
          i += 2;
        } else {
          if (s[i] == '\n') line++;
          i++;
        }
      }
      continue;
    }

    var isRaw = false;
    var quoteAt = i;
    if (c == 'r' &&
        i + 1 < n &&
        (s[i + 1] == "'" || s[i + 1] == '"') &&
        (i == 0 || !_isIdentChar(s[i - 1]))) {
      isRaw = true;
      quoteAt = i + 1;
    }
    if (s[quoteAt] == "'" || s[quoteAt] == '"') {
      final q = s[quoteAt];
      final triple = s.startsWith(q * 3, quoteAt);
      final start = i;
      final startLine = line;
      var j = quoteAt + (triple ? 3 : 1);
      final buf = StringBuffer();
      while (j < n) {
        final d = s[j];
        if (triple ? s.startsWith(q * 3, j) : d == q) {
          j += triple ? 3 : 1;
          break;
        }
        if (d == '\n') {
          line++;
          if (!triple) {
            // An unterminated single-line literal: stop here.
            break;
          }
        }
        if (!isRaw && d == r'\' && j + 1 < n) {
          buf.write(s[j + 1]);
          if (s[j + 1] == '\n') line++;
          j += 2;
          continue;
        }
        if (!isRaw && d == r'$' && j + 1 < n) {
          if (s[j + 1] == '{') {
            var depth = 1;
            j += 2;
            while (j < n && depth > 0) {
              if (s[j] == '{') depth++;
              if (s[j] == '}') depth--;
              if (s[j] == '\n') line++;
              j++;
            }
            continue;
          }
          // $identifier
          j++;
          while (j < n && _isIdentChar(s[j]) && s[j] != r'$') {
            j++;
          }
          continue;
        }
        buf.write(d);
        j++;
      }
      raw.add((buf.toString(), start, j, startLine));
      i = j;
      continue;
    }
    i++;
  }

  // Join literals that are only whitespace apart (Dart joins them).
  final out = <Literal>[];
  var k = 0;
  while (k < raw.length) {
    var text = raw[k].$1;
    final firstLine = raw[k].$4;
    var end = raw[k].$3;
    while (k + 1 < raw.length &&
        s.substring(end, raw[k + 1].$2).trim().isEmpty) {
      k++;
      text += raw[k].$1;
      end = raw[k].$3;
    }
    out.add(Literal(text, firstLine));
    k++;
  }
  return out;
}

List<File> scannedFiles() {
  final files = <File>[];
  for (final entity in Directory('lib').listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) continue;
    final path = entity.path.replaceAll(r'\', '/');
    if (skippedFiles.contains(path)) continue;
    files.add(entity);
  }
  files.sort((a, b) => a.path.compareTo(b.path));
  return files;
}

String normalised(File f) => f.path.replaceAll(r'\', '/');

void main() {
  group('the scanner reads string literals, not comments', () {
    test('a comment is not a literal', () {
      final found = stringLiterals("""
// 'entrance fee' in a line comment
/* "entrance fee" in a block comment */
/// 'entrance fee' in a doc comment
final a = 'shown';
""");
      expect(found.map((l) => l.text), ['shown']);
    });

    test('adjacent literals are one, so a phrase cannot be split', () {
      final found = stringLiterals("""
const t = 'Pay at the tourism '
    'desk before boarding.';
""");
      expect(found.single.text, 'Pay at the tourism desk before boarding.');
    });

    test('quotes, escapes, raw strings and interpolation', () {
      final found = stringLiterals(
        "final a = \"it's \\\"quoted\\\"\";\n"
        "final b = r'raw \\n \$x';\n"
        "final c = 'pay \${amount} at the \$place';\n"
        "final d = '''multi\nline''';\n",
      );
      expect(found.map((l) => l.text), [
        'it\'s "quoted"',
        r'raw \n $x',
        'pay  at the ',
        'multi\nline',
      ]);
    });

    test('an apostrophe in a comment does not open a string', () {
      final found = stringLiterals("""
// don't
final a = 'real';
""");
      expect(found.map((l) => l.text), ['real']);
    });

    test('line numbers', () {
      final found = stringLiterals("final a = 1;\n\nfinal b = 'x';\n");
      expect(found.single.line, 3);
    });
  });

  group('the app speaks of the fee in one name and one place', () {
    final files = scannedFiles();

    test('the scan really looks at the app (not an empty list)', () {
      final paths = files.map(normalised).toList();
      expect(paths, contains('lib/screens/tourism_screens.dart'));
      expect(paths, contains('lib/screens/common_screens.dart'));
      expect(paths, contains('lib/widgets/widgets.dart'));
      expect(paths.length, greaterThan(8));
      expect(paths, isNot(contains('lib/screens/sanitation_screens.dart')));
      expect(paths, isNot(contains('lib/main_sanitation.dart')));
    });

    test('no string literal uses a retired name or place', () {
      final problems = <String>[];
      final used = <String>{}; // "file|pattern" actually allowed
      for (final file in files) {
        final path = normalised(file);
        for (final literal in stringLiterals(file.readAsStringSync())) {
          for (final p in forbiddenPatterns) {
            if (!p.regExp.hasMatch(literal.text)) continue;
            final allowed = allowedUses.any(
              (a) => a.file == path && a.patternName == p.name,
            );
            if (allowed) {
              used.add('$path|${p.name}');
              continue;
            }
            final shown = literal.text.length > 90
                ? '${literal.text.substring(0, 90)}...'
                : literal.text;
            problems.add(
              '$path:${literal.line}  "${p.name}"  ->  "$shown"\n'
              '      why it is retired: ${p.reason}',
            );
          }
        }
      }
      expect(problems, isEmpty, reason: problems.join('\n'));

      // An allowance that matches nothing is stale: remove it.
      final stale = [
        for (final a in allowedUses)
          if (!used.contains('${a.file}|${a.patternName}')) a,
      ];
      expect(
        stale.map((a) => '${a.file} / ${a.patternName}'),
        isEmpty,
        reason: 'An AllowedUse that no longer matches a literal must go.',
      );
    });

    test('every allowance says why', () {
      for (final a in allowedUses) {
        expect(a.reason.trim().length, greaterThan(15), reason: a.file);
        expect(
          forbiddenPatterns.map((p) => p.name),
          contains(a.patternName),
          reason: 'unknown pattern in an AllowedUse: ${a.patternName}',
        );
      }
    });

    test('the pay-place is stated where the fee is stated', () {
      final literals = <Literal>[
        for (final f in files) ...stringLiterals(f.readAsStringSync()),
      ];

      Literal one(bool Function(Literal) test, String what) {
        final matches = literals.where(test).toList();
        expect(matches, hasLength(1), reason: what);
        return matches.single;
      }

      // The Port Guide card (My Visit): the fee, with its amounts.
      final portGuide = one(
        (l) => l.text.startsWith('• Environmental Fee:'),
        'the Port Guide card bullet',
      );
      expect(portGuide.text, contains('Mauban Municipal Hall'));
      expect(portGuide.text, contains('Tourism Office, 2nd Floor'));

      // The Boat Guide tile (Home).
      final boatGuide = one(
        (l) => l.text.startsWith('Passenger pumpboats depart daily'),
        'the Boat Guide tile',
      );
      expect(boatGuide.text, contains('Mauban Municipal Hall'));
      expect(boatGuide.text, contains('boat fare is separate'));

      // The guide tile that names the fee, and where to register.
      final registerTile = one(
        (l) => l.text.startsWith('All tourists register at the'),
        'the register / entry-pass tile',
      );
      expect(registerTile.text, contains('Mauban Municipal Hall'));
    });
  });
}
