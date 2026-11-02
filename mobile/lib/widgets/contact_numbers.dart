import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';

/// What a hotline's number is when it is dialled, or null when the text is not a number.
///
/// Spaces, hyphens and parentheses are taken out ("(042) 784-0123" -> "0427840123"); a leading "+" is kept. Whatever is left must be digits only: text such as
/// "Local 101" is not turned into a number by dropping its letters, it simply is not dialable.
String? dialableNumber(String text) {
  final cleaned = text.replaceAll(RegExp(r'[\s\-()]'), '');
  return RegExp(r'^\+?\d+$').hasMatch(cleaned) ? cleaned : null;
}

/// Opens a `tel:` address; true when something took it. A test gives its own.
typedef DialLauncher = Future<bool> Function(Uri uri);

Future<bool> _launchDialer(Uri uri) => launchUrl(uri, mode: LaunchMode.externalApplication);

/// Opens the phone's dialer with [number] already in it. Never throws: when there is no dialer, or it cannot be opened, nothing happens and this answers false.
Future<bool> openDialer(String number, {DialLauncher? launcher}) async {
  final cleaned = dialableNumber(number);
  if (cleaned == null) return false;
  try {
    return await (launcher ?? _launchDialer)(Uri(scheme: 'tel', path: cleaned));
  } catch (_) {
    return false;
  }
}

/// A hotline's numbers, drawn exactly as the admin wrote them (one text, several numbers separated by a slash), but with each number tappable on its own.
/// The look is the plain text's: the same [style], no underline, the slashes between the numbers where they were. The email is not part of this.
class ContactNumbers extends StatefulWidget {
  const ContactNumbers({
    super.key,
    required this.numbers,
    required this.style,
    this.launcher,
  });

  final String numbers;
  final TextStyle style;

  /// Where a tap goes; the phone's dialer when null.
  final DialLauncher? launcher;

  @override
  State<ContactNumbers> createState() => _ContactNumbersState();
}

class _ContactNumbersState extends State<ContactNumbers> {
  final List<TapGestureRecognizer> _recognizers = [];
  late TextSpan _span;

  @override
  void initState() {
    super.initState();
    _span = _build();
  }

  @override
  void didUpdateWidget(ContactNumbers old) {
    super.didUpdateWidget(old);
    if (old.numbers != widget.numbers) {
      _release();
      _span = _build();
    }
  }

  @override
  void dispose() {
    _release();
    super.dispose();
  }

  void _release() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    _recognizers.clear();
  }

  TextSpan _build() {
    final children = <InlineSpan>[];
    final parts = widget.numbers.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) children.add(const TextSpan(text: '/'));
      final match = RegExp(r'^(\s*)(.*?)(\s*)$', dotAll: true).firstMatch(parts[i])!;
      final lead = match.group(1)!;
      final core = match.group(2)!;
      final trail = match.group(3)!;
      if (lead.isNotEmpty) children.add(TextSpan(text: lead));
      if (core.isNotEmpty) {
        if (dialableNumber(core) == null) {
          children.add(TextSpan(text: core));
        } else {
          final recognizer = TapGestureRecognizer()..onTap = () => openDialer(core, launcher: widget.launcher);
          _recognizers.add(recognizer);
          children.add(TextSpan(text: core, recognizer: recognizer));
        }
      }
      if (trail.isNotEmpty) children.add(TextSpan(text: trail));
    }
    return TextSpan(children: children);
  }

  @override
  Widget build(BuildContext context) => Text.rich(_span, style: widget.style);
}
