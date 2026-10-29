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

The colour is **for the picture only** (the icon and the pale box behind it). The number, the email and the description do
not take it: they are in neutral boxes (see below). There is one colour per name.

| `icon` name | Material icon (Dart) | Colour of the picture | Where the colour comes from |
|---|---|---|---|
| `rescue` | `Icons.local_hospital_outlined` | `#EF4444` (`0xFFEF4444`) | the app's existing red |
| `police` | `Icons.local_police_outlined` | `#2563EB` (`0xFF2563EB`) | the app's existing blue |
| `coast_guard` | `Icons.directions_boat_outlined` | `#0D9488` (`0xFF0D9488`) | the app's existing teal |
| `fire` | `Icons.local_fire_department_outlined` | `#E86306` (`0xFFE86306`) | new; made darker (was `#F97316`) so that it reaches 3:1 on its box |
| `hospital` | `Icons.medical_services_outlined` | `#DB2777` (`0xFFDB2777`) | new |
| `ambulance` | `Icons.emergency_outlined` | `#7C3AED` (`0xFF7C3AED`) | new |
| `help_desk` | `Icons.support_agent_outlined` | the theme's deep colour (`context.brand.deep`) | the app's existing help-desk colour; follows the system colour |
| `lgu_office` | `Icons.account_balance_outlined` | `#4F46E5` (`0xFF4F46E5`) | new |
| `power` | `Icons.bolt_outlined` | `#BC8104` (`0xFFBC8104`) | new; made darker (was `#CA8A04`) so that it reaches 3:1 on its box |
| `water` | `Icons.water_drop_outlined` | `#0891B2` (`0xFF0891B2`) | new |
| `port` | `Icons.anchor_outlined` | `#619C0C` (`0xFF619C0C`) | new; made darker (was `#65A30D`) so that it reaches 3:1 on its box |
| `other` | `Icons.phone_outlined` | `#64748B` (`0xFF64748B`) | new; the fallback |

## How a card is drawn

As the design says (Edit hotline, "How it will look in the app"):

- the picture in its colour, inside a box of that colour at 10% opacity (radius 8), at the top left of the card;
- the **name** (bold, 12.5 px);
- the **number** and the **email**: small boxes (background `#EFF5F7`, text `#3C4C55`, 11 px, semi-bold, radius 7, padding 3 px 8 px), 6 px apart, on the next line when they do not fit.
  Several numbers separated by a slash are **one** box (the app does not split them yet). An empty email has no box;
- the **description**, under them: 11.5 px, `#5E6F77`, 7 px below. An empty description has no line and no gap.

The colour of the picture is not used for any text, so no text needs to reach 4.5:1 against it.

## Several numbers in one contact

`contact_numbers` is one text. **Several numbers are separated by a slash ` / `**, not by a comma (the web page says so, and the seed uses it). The app
shows the text whole, as written, in one box; it does not split it (yet). If it ever does, it splits on the slash.

## Contrast

The picture is a graphical object, so it needs **3:1** (WCAG 1.4.11), not 4.5:1. And it is measured **against its own box, not against white**: the icon is drawn on a box that is its own colour at
10% opacity over the white card, so the box is what is really behind it, and it is closer in lightness to the icon than white is.
A colour can pass on white and fail on its box (`port` did: 3.09 on white, 2.80 on its box). Measured 2026-10-29:

| name | colour | ratio on its own box | ratio on white | 3:1 on its box |
|---|---|---|---|---|
| `rescue` | `#EF4444` | 3.30 | 3.76 | pass |
| `police` | `#2563EB` | 4.50 | 5.17 | pass |
| `coast_guard` | `#0D9488` | 3.33 | 3.74 | pass |
| `fire` | `#E86306` (was `#F97316`: box 2.53, white 2.80) | 3.01 | 3.38 | pass |
| `hospital` | `#DB2777` | 3.96 | 4.60 | pass |
| `ambulance` | `#7C3AED` | 4.91 | 5.70 | pass |
| `help_desk` | the theme's deep (the app's own green `#0C6B3F`) | 5.67 | 6.58 | pass |
| `lgu_office` | `#4F46E5` | 5.41 | 6.29 | pass |
| `power` | `#BC8104` (was `#CA8A04`: box 2.67, white 2.94) | 3.01 | 3.34 | pass |
| `water` | `#0891B2` | 3.27 | 3.68 | pass |
| `port` | `#619C0C` (was `#65A30D`: box 2.80, white 3.09) | 3.01 | 3.35 | pass |
| `other` | `#64748B` | 4.21 | 4.76 | pass |

**All twelve reach 3:1 against their own box** (and against white). Three were too pale (`fire`, `power`, `port`); each was made darker with the **same hue** (the hue moved by less than 0.3 degrees,
the rounding of the hex) until it reached 3:1 on its own (new) box. The other nine were not touched. `help_desk` follows the theme, whose deep colour the theme code already darkens to 4.5:1 on white;
the table is for the app's own green. A Dart test holds all twelve to 3:1 on their box, with no list of exceptions, and fails if a colour is changed to something paler.

The web page draws the same twelve colours and the same boxes as the app (`--th-contact-*` tokens in `Tourism_index.css`); a Dart test holds every web token equal to the table above, so the doc is the one source of truth.

The text is neutral and was measured: the number and the email (`#3C4C55`) on their box (`#EFF5F7`) are 8.09:1, the description (`#5E6F77`) on white 5.23:1.

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
