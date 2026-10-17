# Emergency contact icons — the list the mobile app must match

An emergency contact (Emergency Hotlines page, `EmergencyContact` in
`backend/api/models.py`) has an `icon`: the **name** of one of twelve icons. The
server stores and sends only the name. The picture and the colour belong to the
app and to the admin web page, and **both must draw the same thing for the same
name**.

The web side is one module, `frontend/src/tourism/utils/contactIcons.js`
(colours: `--th-contact-*` tokens, see `frontend/src/tourism/THEME_TOKENS.md`
section 9). A test (`contactIcons.test.js`) checks this file, the web module and
the backend list against each other.

## The twelve names

| `icon` name | Material icon (Dart) | Colour | Where the colour comes from |
|---|---|---|---|
| `rescue` | `Icons.local_hospital_outlined` | `#EF4444` (`0xFFEF4444`) | the app's existing red |
| `police` | `Icons.local_police_outlined` | `#2563EB` (`0xFF2563EB`) | the app's existing blue |
| `coast_guard` | `Icons.directions_boat_outlined` | `#0D9488` (`0xFF0D9488`) | the app's existing teal |
| `fire` | `Icons.local_fire_department_outlined` | `#F97316` (`0xFFF97316`) | new |
| `hospital` | `Icons.medical_services_outlined` | `#DB2777` (`0xFFDB2777`) | new |
| `ambulance` | `Icons.emergency_outlined` | `#7C3AED` (`0xFF7C3AED`) | new |
| `help_desk` | `Icons.support_agent_outlined` | the theme's deep colour (`context.brand.deep`) | the app's existing help-desk colour; follows the system colour |
| `lgu_office` | `Icons.account_balance_outlined` | `#4F46E5` (`0xFF4F46E5`) | new |
| `power` | `Icons.bolt_outlined` | `#CA8A04` (`0xFFCA8A04`) | new |
| `water` | `Icons.water_drop_outlined` | `#0891B2` (`0xFF0891B2`) | new |
| `port` | `Icons.anchor_outlined` | `#65A30D` (`0xFF65A30D`) | new |
| `other` | `Icons.phone_outlined` | `#64748B` (`0xFF64748B`) | new; the fallback |

## How an icon is drawn (the same on the web and in the app)

As `_EmergencyContactCard` already does: the icon in its colour, inside a box
whose background is that colour at 10% opacity (radius 8); the number line under
the name is in the same colour.

## Rules for the app

1. **An unknown name is `other`.** If the server sends a name that is not in the
   table above (a newer one, a typo, an empty string, nothing), the app draws
   `other`. It must never draw a blank, crash or hide the contact.
2. Names are lower-case with underscores, exactly as written above. `Rescue` or
   `help desk` are *not* names; they are unknown and fall back to `other`.
3. The twelve are fixed in the app's code. A thirteenth needs a new release of
   the app **and** a new entry here, in the backend choices
   (`EmergencyContact.ICON_CHOICES`) and in the web module, in the same change.
4. The written list of four hotlines in the app (`_EmergencyContactCard` x4)
   stays as the fallback when the server's list is empty or unreachable. Their
   icons are `rescue`, `police`, `coast_guard` and `help_desk`.
