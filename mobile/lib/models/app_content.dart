part of '../main.dart';

// The `appContent` of the bootstrap (Mobile App Content): the texts an admin edits on the web, which the app will show in place of the texts written in its
// own code. This file is the MODEL and the RESOLVER only; no screen reads them yet (9b). Like TourismTheme.fromJson, nothing here ever throws: a part
// that is missing or of the wrong kind is just missing, and the resolver then gives back what the code has written. EVERY PART IS DECIDED ON ITS OWN: a
// block that is missing sends only that block back to the code, and an item that is broken is left out, not its whole section.

/// A `{...}` in a text. The same shape the server uses (api/services/mobile_content.py, PLACEHOLDER).
final RegExp _contentPlaceholder = RegExp(r'\{[^{}]*\}');

const String _namePlaceholder = '{name}';

/// What a visitor with no name is called in the greeting (the greeting of the Home has always said so).
const String guestVisitorName = 'Explorer';

/// The name the greeting puts in place of `{name}`: the guest is the Explorer, a visitor who is logged in is called by their name.
String visitorName({required bool isGuest, required String displayName}) =>
    isGuest || displayName.trim().isEmpty ? guestVisitorName : displayName.trim();

/// A text as the server may send it: only a string with a letter in it is a text. Anything else is "nothing".
String? _contentText(Object? value) => value is String && value.trim().isNotEmpty ? value : null;

/// [text] with `{name}` put in, or null when it cannot be shown to a visitor: a `{...}` other than `{name}` is left in it (the server fills the fee
/// placeholders; one that is still there is a text it could not finish), or it has `{name}` and there is no name to put in. The name is put in AFTER
/// the check and in one pass, so a visitor who is called `{x}` does not make the text unusable, and what is put in is never read again.
String? _finishedText(String text, String? name) {
  if (_contentPlaceholder.hasMatch(text.replaceAll(_namePlaceholder, ''))) return null;
  if (text.contains(_namePlaceholder)) {
    if (name == null) return null;
    return text.replaceAll(_namePlaceholder, name);
  }
  return text;
}

/// The text to show: [fromServer] when it is a text the app can show, and [fromCode] when it is not (missing, blank, not a string, or with a `{...}`
/// left in it). [fromCode] is the text of the code, so it may hold `{name}` too. Never throws.
String contentOr(Object? fromServer, String fromCode, {String? name}) {
  try {
    final text = _contentText(fromServer);
    final finished = text == null ? null : _finishedText(text, name);
    if (finished != null) return finished;
  } catch (_) {
    // whatever it was, the text of the code is the answer
  }
  return fromCode.replaceAll(_namePlaceholder, name ?? guestVisitorName);
}

enum AppContentStyle { tile, banner }

/// One text block (welcome, why_visit, travel_guide, port_guide). Each field is a text or null; null means "the server did not send it".
class AppContentBlock {
  const AppContentBlock({this.title, this.subtitle, this.body});

  static const empty = AppContentBlock();

  final String? title;
  final String? subtitle;
  final String? body;

  factory AppContentBlock.fromJson(Object? json) {
    if (json is! Map) return empty;
    return AppContentBlock(
      title: _contentText(json['title']),
      subtitle: _contentText(json['subtitle']),
      body: _contentText(json['body']),
    );
  }
}

/// One pillar, tile or banner of a section. [fullText] and [tappable] are READ (so that they are ready) and not used yet: the app does not open a
/// tile in this step.
class AppContentItem {
  const AppContentItem({
    required this.id,
    required this.icon,
    required this.title,
    required this.shortText,
    this.fullText = '',
    this.style = AppContentStyle.tile,
    this.tappable = false,
  });

  final int id;

  /// The name as the server wrote it. A name the app does not know is kept as it is; [appContentIconFor] draws it as the neutral "info".
  final String icon;
  final String title;
  final String shortText;
  final String fullText;
  final AppContentStyle style;
  final bool tappable;

  bool get isBanner => style == AppContentStyle.banner;

  /// The item, or null when it is broken: not a map, no whole-number id, no title or no short text. A missing or odd icon is NOT broken (it is "info").
  static AppContentItem? tryParse(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final title = _contentText(json['title']);
    final shortText = _contentText(json['short_text']);
    if (id is! int || title == null || shortText == null) return null;
    final icon = json['icon'];
    final full = json['full_text'];
    final fullText = full is String ? full : '';
    final tappable = json['tappable'];
    return AppContentItem(
      id: id,
      icon: icon is String ? icon : 'info',
      title: title,
      shortText: shortText,
      fullText: fullText,
      style: json['style'] == 'banner' ? AppContentStyle.banner : AppContentStyle.tile,
      tappable: tappable is bool ? tappable : fullText.trim().isNotEmpty,
    );
  }

  /// [name] put into the texts, or null when the item cannot be shown (a `{...}` is left in its title or short text). A full text that cannot be
  /// finished does not take the item away: the item stays, without a detail.
  AppContentItem? finished(String? name) {
    final newTitle = _finishedText(title, name);
    final newShort = _finishedText(shortText, name);
    if (newTitle == null || newShort == null) return null;
    final newFull = _finishedText(fullText, name);
    return AppContentItem(
      id: id,
      icon: icon,
      title: newTitle,
      shortText: newShort,
      fullText: newFull ?? '',
      style: style,
      tappable: newFull != null && tappable,
    );
  }
}

class AppContent {
  const AppContent({this.blocks = const {}, this.whyVisit = const [], this.travelGuide = const []});

  /// No `appContent` in the answer (or one the app cannot read): nothing is set, and everything is the text of the code.
  static const none = AppContent();

  final Map<String, AppContentBlock> blocks;
  final List<AppContentItem> whyVisit;
  final List<AppContentItem> travelGuide;

  factory AppContent.fromJson(Object? json) {
    try {
      if (json is! Map) return none;
      final blocks = <String, AppContentBlock>{};
      final sentBlocks = json['blocks'];
      if (sentBlocks is Map) {
        sentBlocks.forEach((key, value) {
          if (key is String && value is Map) blocks[key] = AppContentBlock.fromJson(value);
        });
      }
      final sections = json['sections'];
      final sent = sections is Map ? sections : const {};
      return AppContent(
        blocks: blocks,
        whyVisit: _parseItems(sent['why_visit']),
        travelGuide: _parseItems(sent['travel_guide']),
      );
    } catch (_) {
      return none;
    }
  }

  static List<AppContentItem> _parseItems(Object? sent) {
    if (sent is! List) return const [];
    final seen = <int>{};
    final items = <AppContentItem>[];
    for (final one in sent) {
      final item = AppContentItem.tryParse(one);
      if (item != null && seen.add(item.id)) items.add(item); // a second item with the same id is a broken one
    }
    return items;
  }

  AppContentBlock block(String key) => blocks[key] ?? AppContentBlock.empty;

  /// The text of one field of one block, or [fromCode]. Only this block and this field are decided.
  String text(String blockKey, String field, String fromCode, {String? name}) {
    try {
      final b = block(blockKey);
      final sent = switch (field) {
        'title' => b.title,
        'subtitle' => b.subtitle,
        'body' => b.body,
        _ => null,
      };
      return contentOr(sent, fromCode, name: name);
    } catch (_) {
      return fromCode.replaceAll(_namePlaceholder, name ?? guestVisitorName);
    }
  }

  /// The lines of a block's body (the Port & Boat Guide's four), or [fromCode]. The body is ONE part: a line that cannot be shown sends the whole body
  /// back to the code, because a guide with a line missing is not the guide.
  List<String> lines(String blockKey, List<String> fromCode, {String? name}) {
    try {
      final body = block(blockKey).body;
      if (body == null) return fromCode;
      final shown = <String>[];
      for (final raw in body.split('\n')) {
        final line = raw.trim();
        if (line.isEmpty) continue;
        final finished = _finishedText(line, name);
        if (finished == null) return fromCode;
        shown.add(finished);
      }
      // never empty here: a body with no letter in it was read as null, so at least one line has one
      return shown;
    } catch (_) {
      return fromCode;
    }
  }

  /// The items of the Why Visit: the server's, those that can be shown and in the server's order, and [fromCode] when there is not one (an empty
  /// section is "nothing published", not an LGU's wish).
  List<AppContentItem> whyVisitItems(List<AppContentItem> fromCode, {String? name}) => _itemsOr(whyVisit, fromCode, name);

  /// The same for the Travel Guide. Its tiles and banners are one list; [AppContentItem.isBanner] tells them apart.
  List<AppContentItem> travelGuideItems(List<AppContentItem> fromCode, {String? name}) => _itemsOr(travelGuide, fromCode, name);

  static List<AppContentItem> _itemsOr(List<AppContentItem> sent, List<AppContentItem> fromCode, String? name) {
    try {
      final shown = <AppContentItem>[];
      for (final item in sent) {
        final finished = item.finished(name);
        if (finished != null) shown.add(finished);
      }
      return shown.isEmpty ? fromCode : shown;
    } catch (_) {
      return fromCode;
    }
  }
}

/// The picture and the colour of an icon NAME. The names are the ones the server knows (MobileContentItem.ICON_NAMES); the pictures and colours are the
/// ones the code draws today.
class AppContentIcon {
  const AppContentIcon(this.icon, this.color);

  final IconData icon;
  final Color color;
}

const AppContentIcon appContentInfoIcon = AppContentIcon(Icons.info_outline, Color(0xFF64748B));

const Map<String, AppContentIcon> appContentIcons = {
  'beach': AppContentIcon(Icons.beach_access, Color(0xFF0284C7)),
  'craft': AppContentIcon(Icons.workspace_premium, Color(0xFFD97706)),
  'waterfall': AppContentIcon(Icons.water_drop, Color(0xFF059669)),
  'food': AppContentIcon(Icons.restaurant_menu, Color(0xFFDC2626)),
  'boat': AppContentIcon(Icons.directions_boat_outlined, Color(0xFF0284C7)),
  'festival': AppContentIcon(Icons.festival_outlined, Color(0xFFD97706)),
  'receipt': AppContentIcon(Icons.receipt_long_outlined, Color(0xFF059669)),
  'waste': AppContentIcon(Icons.delete_outline, Color(0xFF7C3AED)),
  // The two banners draw their icon in the colour of the theme, so the code has no colour of its own for these two names; they take the colour of their
  // banner's background family.
  'event': AppContentIcon(Icons.event_available_outlined, Color(0xFF0284C7)),
  'eco': AppContentIcon(Icons.eco_outlined, Color(0xFF059669)),
  'info': appContentInfoIcon,
};

/// The picture of [name]; a name the app does not know (or no name) is the neutral "info". It never throws and never takes the item away.
AppContentIcon appContentIconFor(Object? name) => name is String ? (appContentIcons[name] ?? appContentInfoIcon) : appContentInfoIcon;
