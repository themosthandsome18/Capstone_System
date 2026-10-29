# Emergency contact icons — the list the mobile app must match

An emergency contact (Emergency Hotlines page, `EmergencyContact` in
`backend/api/models.py`) has an `icon`: the **name** of one of twelve icons. The
server stores and sends only the name. The picture and the colour belong to the
app and to the admin web page, and **both must draw the same thing for the same
name**.

The web side is one module, `frontend/src/tourism/utils/contactIcons.js`
(colours: `--th-contact-*` tokens, see `frontend/src/tourism/THEME_TOKENS.md`
section 9). A test (`contactIcons.test.js`) checks this file, the web module and
the backend list against each other. The app side is `mobile/lib/models/app_contacts.dart`
(`appContactIcons`); a Dart test (`mobile/test/app_contacts_test.dart`) checks the app's
map against **this table**, the backend list and the web module, and fails if they differ.

## The twelve names

"Icon colour" is the colour of the picture and of its pale box. "Text colour" is the
colour of the number and the email under the name; it is the icon colour unless a
darker one is written here, because the icon colour on white would be below 4.5:1 at
11.5 px (the contrast table below). **The icon colour never changes.**

| `icon` name | Material icon (Dart) | Icon colour | Text colour | Where the colour comes from |
|---|---|---|---|---|
| `rescue` | `Icons.local_hospital_outlined` | `#EF4444` (`0xFFEF4444`) | `#EB1515` (`0xFFEB1515`) | the app's existing red |
| `police` | `Icons.local_police_outlined` | `#2563EB` (`0xFF2563EB`) | same | the app's existing blue |
| `coast_guard` | `Icons.directions_boat_outlined` | `#0D9488` (`0xFF0D9488`) | `#0C8479` (`0xFF0C8479`) | the app's existing teal |
| `fire` | `Icons.local_fire_department_outlined` | `#F97316` (`0xFFF97316`) | `#C55405` (`0xFFC55405`) | new |
| `hospital` | `Icons.medical_services_outlined` | `#DB2777` (`0xFFDB2777`) | same | new |
| `ambulance` | `Icons.emergency_outlined` | `#7C3AED` (`0xFF7C3AED`) | same | new |
| `help_desk` | `Icons.support_agent_outlined` | the theme's deep colour (`context.brand.deep`) | same | the app's existing help-desk colour; follows the system colour (the theme already darkens it to at least 4.5:1 on white) |
| `lgu_office` | `Icons.account_balance_outlined` | `#4F46E5` (`0xFF4F46E5`) | same | new |
| `power` | `Icons.bolt_outlined` | `#CA8A04` (`0xFFCA8A04`) | `#9F6D03` (`0xFF9F6D03`) | new |
| `water` | `Icons.water_drop_outlined` | `#0891B2` (`0xFF0891B2`) | `#07819E` (`0xFF07819E`) | new |
| `port` | `Icons.anchor_outlined` | `#65A30D` (`0xFF65A30D`) | `#52840B` (`0xFF52840B`) | new |
| `other` | `Icons.phone_outlined` | `#64748B` (`0xFF64748B`) | same | new; the fallback |

## Contrast of the text on white (`#FFFFFF`), WCAG 2.x

Measured 2026-10-29. The rule: the text must reach **4.5:1**. The darker text colour keeps the hue and the saturation and lowers the
lightness in steps of half a percent until it reaches 4.5:1.

| name | icon colour | ratio | text colour | ratio |
|---|---|---|---|---|
| `rescue` | `#EF4444` | 3.76 (fails) | `#EB1515` | 4.52 |
| `police` | `#2563EB` | 5.17 | same | 5.17 |
| `coast_guard` | `#0D9488` | 3.74 (fails) | `#0C8479` | 4.57 |
| `fire` | `#F97316` | 2.80 (fails) | `#C55405` | 4.52 |
| `hospital` | `#DB2777` | 4.60 | same | 4.60 |
| `ambulance` | `#7C3AED` | 5.70 | same | 5.70 |
| `help_desk` | the theme's deep (the app's own green `#0C6B3F`) | 6.58 | same | 6.58 |
| `lgu_office` | `#4F46E5` | 6.29 | same | 6.29 |
| `power` | `#CA8A04` | 2.94 (fails) | `#9F6D03` | 4.50 |
| `water` | `#0891B2` | 3.68 (fails) | `#07819E` | 4.52 |
| `port` | `#65A30D` | 3.09 (fails) | `#52840B` | 4.50 |
| `other` | `#64748B` | 4.76 | same | 4.76 |

The description line under the number is `AppColors.muted` (`#6B7280`), 4.83:1. The web page draws the number in the same text colour: the six darker ones are the `--th-contact-text-*` tokens in `frontend/src/tourism/Tourism_index.css`, and for the other six it is the icon colour. A Dart test (`mobile/test/app_contacts_test.dart`) fails if a web number colour differs from this table, and tests on both sides (`app_contacts_test.dart`, `contactIcons.test.js`) hold the text colours to 4.5:1 on white.

## How an icon is drawn (the same on the web and in the app)

As `_EmergencyContactCard` does: the icon in its **icon colour**, inside a box whose
background is that colour at 10% opacity (radius 8); the name; the number line under the name in the **text colour**.
Then, only when they are not empty: the email (a line of its own, same style as the number) and the description (smaller, 10.5 px, and paler than the number:
`AppColors.muted`). An empty email or description draws nothing and leaves no gap.

## Several numbers in one contact

`contact_numbers` is one text. **Several numbers are separated by a slash ` / `**, not by a comma (the web page says so, and the seed uses it). The app
shows the text whole, as written; it does not split it (yet). If it ever does, it splits on the slash.

## Rules for the app

1. **An unknown name is `other`.** If the server sends a name that is not in the
   table above (a newer one, a typo, an empty string, nothing), the app draws
   `other`. It must never draw a blank, crash or hide the contact.
2. Names are lower-case with underscores, exactly as written above. `Rescue` or
   `help desk` are *not* names; they are unknown and fall back to `other`.
3. The twelve are fixed in the app's code. A thirteenth needs a new release of
   the app **and** a new entry here, in the backend choices
   (`EmergencyContact.ICON_CHOICES`) and in the web module, in the same change.
4. The server's list **replaces** the four written in the app (`AppContentDefaults.hotlines`): if one contact is active, one is shown. The four written ones are what
   the app shows only when there is nothing from the server to show: the server failed, the key is missing, the list is empty, or every entry is broken. Their
   icons are `rescue`, `police`, `coast_guard` and `help_desk`.
