part of '../main.dart';

// The `emergencyContacts` of the bootstrap: the hotlines an admin edits on the web (Emergency Hotlines page), which the Profile page shows in place of the four
// written in its own code (AppContentDefaults.hotlines). Like app_content.dart: nothing here ever throws, a part that is missing or of the wrong kind is just
// missing, and EVERY ENTRY IS DECIDED ON ITS OWN: a broken entry is left out and not the whole list. The server's list REPLACES the written four; the written four
// are only what is shown when there is nothing to show (see AppContacts.resolve).

/// The text of an optional field of a contact: a string, trimmed, or '' when it is missing, not a string or blank.
String _contactOptional(Object? value) => value is String ? value.trim() : '';

/// One hotline. [numbers] is ONE text, shown whole as the admin wrote it (several numbers are separated by a slash " / "; the app does not split them yet).
/// [email] and [description] are '' when there is none, and then nothing is drawn for them.
class AppContact {
  const AppContact({
    required this.id,
    required this.name,
    required this.numbers,
    this.email = '',
    this.description = '',
    this.icon = 'other',
  });

  final int id;
  final String name;
  final String numbers;
  final String email;
  final String description;

  /// The icon NAME as the server wrote it ('other' when it sent none). A name the app does not know is drawn as 'other' ([appContactIconFor]).
  final String icon;

  /// The contact, or null when it is broken: not a map; no whole-number `id`; a `name` or `contact_numbers` that is not a string or is blank (a hotline with no
  /// number is useless, and the server requires both). A missing or odd `email`, `description` or `icon` is NOT broken. Never throws.
  static AppContact? tryParse(Object? json) {
    try {
      if (json is! Map) return null;
      final Object? id = json['id']; // typed, so that `id` is a whole number only after the check below
      final name = _contactOptional(json['name']);
      final numbers = _contactOptional(json['contact_numbers']);
      if (id is! int || name.isEmpty || numbers.isEmpty) return null;
      final icon = json['icon'];
      return AppContact(
        id: id,
        name: name,
        numbers: numbers,
        email: _contactOptional(json['email']),
        description: _contactOptional(json['description']),
        icon: icon is String && icon.isNotEmpty ? icon : 'other',
      );
    } catch (_) {
      return null;
    }
  }
}

class AppContacts {
  const AppContacts({this.items = const []});

  /// No `emergencyContacts` in the answer (or one the app cannot read): nothing is set, and the written four are shown.
  static const none = AppContacts();

  /// The good entries, in the order the server sent them (it already applies the admin's order). Only active contacts are ever sent.
  final List<AppContact> items;

  /// Anything that is not a list is [none]; every entry through [AppContact.tryParse], the broken ones left out, a repeated `id` left out (the later one). Never throws.
  factory AppContacts.fromJson(Object? json) {
    try {
      if (json is! List) return none;
      final seen = <int>{};
      final items = <AppContact>[];
      for (final one in json) {
        final contact = AppContact.tryParse(one);
        if (contact != null && seen.add(contact.id)) items.add(contact);
      }
      return items.isEmpty ? none : AppContacts(items: items);
    } catch (_) {
      return none;
    }
  }

  /// What the Profile page draws: the server's list when it has at least one good entry, and [fromCode] (the written four) when it has none: the server failed,
  /// the key is missing, the list is empty, or every entry is broken. The server's list REPLACES the written four; it is never added to them. Never throws.
  List<AppContact> resolve(List<AppContact> fromCode) => items.isEmpty ? fromCode : items;
}

/// The picture of an icon NAME and its colour (docs/MOBILE_CONTACT_ICONS.md). [color] is for the picture and its pale box ONLY: the numbers and the email are in
/// neutral boxes (see the card). `null` means "the theme's own deep colour" (only `help_desk`). Every colour reaches 3:1 against its OWN pale box (itself at 10% over
/// white), which is what the picture is really drawn on; `fire`, `power` and `port` are the original colours made darker for that, with the same hue.
class AppContactIcon {
  const AppContactIcon(this.icon, this.color);

  final IconData icon;
  final Color? color;

  Color iconColorIn(BuildContext context) => color ?? context.brand.deep;
}

const AppContactIcon appContactOtherIcon = AppContactIcon(Icons.phone_outlined, Color(0xFF64748B));

const Map<String, AppContactIcon> appContactIcons = {
  'rescue': AppContactIcon(Icons.local_hospital_outlined, Color(0xFFEF4444)),
  'police': AppContactIcon(Icons.local_police_outlined, Color(0xFF2563EB)),
  'coast_guard': AppContactIcon(Icons.directions_boat_outlined, Color(0xFF0D9488)),
  'fire': AppContactIcon(Icons.local_fire_department_outlined, Color(0xFFE86306)),
  'hospital': AppContactIcon(Icons.medical_services_outlined, Color(0xFFDB2777)),
  'ambulance': AppContactIcon(Icons.emergency_outlined, Color(0xFF7C3AED)),
  'help_desk': AppContactIcon(Icons.support_agent_outlined, null),
  'lgu_office': AppContactIcon(Icons.account_balance_outlined, Color(0xFF4F46E5)),
  'power': AppContactIcon(Icons.bolt_outlined, Color(0xFFBC8104)),
  'water': AppContactIcon(Icons.water_drop_outlined, Color(0xFF0891B2)),
  'port': AppContactIcon(Icons.anchor_outlined, Color(0xFF619C0C)),
  'other': appContactOtherIcon,
};

/// The picture of [name]; a name the app does not know (or no name, or not a string) is 'other'. It never throws and never takes the contact away.
AppContactIcon appContactIconFor(Object? name) => name is String ? (appContactIcons[name] ?? appContactOtherIcon) : appContactOtherIcon;
