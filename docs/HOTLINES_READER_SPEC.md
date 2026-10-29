# Hotlines reader: the app reads `emergencyContacts`

Status: written 2026-10-29 from `origin/main` at `77988f2` (read with `git show`), then **corrected by the owner's five decisions (D1 to D5, below)** and implemented
on the branch `mobile/hotlines-reader` (not committed, not pushed). The live site was not touched and no live data is in this document: the four hotlines quoted by
name are the ones written in the app's code and in the seed (`0054_seed_emergency_contacts.py`).

The goal: the four hotlines the Profile page shows today are written in the Dart code. The server already stores them (`EmergencyContact`), an admin already
edits them (the Emergency Hotlines page), and the public bootstrap already sends them (`emergencyContacts`). The app ignored that key. This step makes the app
read it, keeping the four written ones as the fallback, exactly as `appContent` was done (Commits 9a to 9c).

## The owner's five decisions (they correct the first version of this spec)

| | Decision | Effect on this spec |
|---|---|---|
| **D1** | The server's list **replaces** the written four; it never adds to them. If one contact is active, the visitor sees one. The written four are only what is shown when there is nothing to show: the server failed, the key is missing, the list is empty, or every entry is broken. | B |
| **D2** | **Show `description`.** The card grows to hold it under the number, smaller and paler than the number. An empty description draws nothing and leaves no gap. | A, card |
| **D3** | **The email is its own field and its own line.** It is not joined to the number. In the defaults the desk's number and email are two fields, as the server sends them. An empty email draws nothing. | A, E, card |
| **D4** | **A slash ` / ` separates several numbers**, not a comma (the first brief said comma; that was wrong). The app does not split them yet: it shows the text whole, as today. The slash is recorded here as the right separator. | D |
| **D5** | **Measure the contrast** of all twelve colours on white. Any below 4.5:1 gets a darker colour **for the text only**; the icon colour never changes. | C |

## What exists (the facts this spec stands on)

| Part | Fact | Where |
|---|---|---|
| Model | `EmergencyContact`: `name` (160), `contact_numbers` (300, one text), `email` (254, may be empty), `description` (text, may be empty), `icon` (one of 12 names, default `other`), `display_order`, `is_active` | `backend/api/models.py:1419` |
| Public JSON | six keys per entry: `id` (int), `name`, `contact_numbers`, `email`, `description`, `icon` (all strings). Only ACTIVE contacts, already in order | `backend/api/serializers.py:1279`, `backend/api/views/mobile.py:205` |
| Admin API | GET, POST, PATCH, deactivate, reactivate, reorder. **No DELETE** (405, tested) | `backend/api/views/emergency_contacts.py`, `backend/api/tests.py:7391` |
| Web page | `/hotlines`, admin only. Its hint tells the admin to separate several numbers **with a slash** | `frontend/src/tourism/pages/EmergencyHotlines.js` |
| The app before this step | did not read the key; four literal `_EmergencyContactCard`s | `mobile/lib/screens/tourism_screens.dart:2540-2566` |

## A. The model in Dart (`mobile/lib/models/app_contacts.dart`, modelled on `app_content.dart`)

- **`AppContact`**: `int id`, `String name`, `String numbers`, `String email` (`''` when none), `String description` (`''` when none), `String icon` (the name as written, or
  `'other'`). `static AppContact? tryParse(Object?)` returns `null` for a broken entry and never throws. There is **no joined "line"**: the email is not part of the number (D3).
- **`AppContacts`**: `final List<AppContact> items`; `static const none = AppContacts()`; `factory AppContacts.fromJson(Object?)`: not a list is `none`; every entry through
  `tryParse`, the broken ones left out, a repeated `id` left out (the later one), the server's order kept, an all-broken list is `none`; all inside a `try`/`catch` that returns `none`.
- `MobileBootstrap.emergencyContacts` (default `AppContacts.none`), and `TourismBootstrapState.emergencyContacts` (`data?.emergencyContacts ?? AppContacts.none`).

## B. The resolver: the server's list, or the written four

`AppContacts.resolve(List<AppContact> fromCode)` returns `items` when it is not empty and `fromCode` (`AppContentDefaults.hotlines`) otherwise. It never throws. **The visitor
never has a blank section** while the code has four.

| # | Situation | The visitor sees |
|---|---|---|
| 1 | **The server failed** (and no saved copy) | the written four |
| 1b | the server failed but a **saved copy** is on screen | the copy's contacts (as of the last good answer), or the written four if it had none |
| 2 | **The key is missing** (an older server, an older copy) | the written four |
| 3 | **The key is there but the list is empty** | the written four (this is what the server's docstring promises) |
| 4 | **An entry is broken** | the good entries, in the server's order; if all are broken, the written four |
| 5 | (D1) **The server has contacts** | exactly those; **one active contact is one card**; none of the written four is added |

A broken entry: not a map; `id` not a whole number; `name` or `contact_numbers` not a string or blank after trimming; a repeated `id`. NOT broken: a missing, odd or blank
`email`, `description` or `icon` (an unknown icon is drawn as `other`). The text is shown as written; no `{...}` is looked for.

## C. The twelve icons, and the contrast of their text (D5)

`appContactIcons` / `appContactIconFor(Object?)` like `appContentIcons`: an unknown name, or a non-string, is `other`. `AppContactIcon(icon, color, [textColor])`: `color` is the
picture's colour (and its box); `null` means the theme's `context.brand.deep` (only `help_desk`). `textColor` is the colour of the number and the email, `null` meaning the same as `color`.
**The app is the measure for the four that existed**: their icon colours are unchanged.

Measured 2026-10-29 (WCAG 2.x, on `#FFFFFF`). The rule is 4.5:1 for the text at 11.5 px. A colour below it gets a text colour with the same hue and saturation and a lower lightness (steps of half a percent)
until it reaches 4.5:1.

| name | `IconData` | icon colour | ratio | text colour | ratio |
|---|---|---|---|---|---|
| `rescue` | `Icons.local_hospital_outlined` | `#EF4444` | 3.76 **fails** | `#EB1515` | 4.52 |
| `police` | `Icons.local_police_outlined` | `#2563EB` | 5.17 | same | 5.17 |
| `coast_guard` | `Icons.directions_boat_outlined` | `#0D9488` | 3.74 **fails** | `#0C8479` | 4.57 |
| `fire` | `Icons.local_fire_department_outlined` | `#F97316` | 2.80 **fails** | `#C55405` | 4.52 |
| `hospital` | `Icons.medical_services_outlined` | `#DB2777` | 4.60 | same | 4.60 |
| `ambulance` | `Icons.emergency_outlined` | `#7C3AED` | 5.70 | same | 5.70 |
| `help_desk` | `Icons.support_agent_outlined` | the theme's deep (the app's own green `#0C6B3F`) | 6.58 | same | 6.58 |
| `lgu_office` | `Icons.account_balance_outlined` | `#4F46E5` | 6.29 | same | 6.29 |
| `power` | `Icons.bolt_outlined` | `#CA8A04` | 2.94 **fails** | `#9F6D03` | 4.50 |
| `water` | `Icons.water_drop_outlined` | `#0891B2` | 3.68 **fails** | `#07819E` | 4.52 |
| `port` | `Icons.anchor_outlined` | `#65A30D` | 3.09 **fails** | `#52840B` | 4.50 |
| `other` | `Icons.phone_outlined` | `#64748B` | 4.76 | same | 4.76 |

Six names failed (`rescue`, `coast_guard`, `fire`, `power`, `water`, `port`). Two of them, `rescue` and `coast_guard`, are among the four the app has today: their number text was already below 4.5:1, and
is now the darker colour; their icons and boxes keep the colour they had. `help_desk` follows the theme, whose deep colour is already darkened to 4.5:1 on white by the theme code
(`_darkenToContrast`). The description line is `AppColors.muted` (`#6B7280`): 4.83:1. The pale box behind the icon is the icon colour at 10%, not the text colour.

`docs/MOBILE_CONTACT_ICONS.md` is the table the app must match; a Dart test (`mobile/test/app_contacts_test.dart`) fails if the app's map differs from that table, from
`EmergencyContact.ICON_CHOICES` in the backend, or from the web module (names, order, and the web's colour tokens).

## D. Several numbers (D4)

**A slash ` / ` separates several numbers.** (The web hint says so, and two of the four seeded rows use one; none uses a comma.) **The app does not split the text in this step**: it shows `contact_numbers`
whole, as written. A text with no separator is shown as it is; a blank text makes the entry broken (B), so no blank number is ever drawn. If the app ever splits the text (to make each number tappable), it splits on the slash.

## E. The defaults: the four written, one copy (D3)

`AppContentDefaults.hotlines` in `app_content_defaults.dart`: four `AppContact`s in today's order, **moved** out of `tourism_screens.dart`, not copied, with negative ids (never a server id).
The desk's `numbers` and `email` are two fields (D3). The heading `'Emergency Hotlines & Helpdesk'` stays in the screen. Tests: each text is in `lib/` once; the four equal the seed
(`0054_seed_emergency_contacts.py`) field by field (name, numbers, email, icon); their icons and colours are the four the screen had.

## F. The card (D2, D3)

`_EmergencyContactCard`: the name (bold 12.5), the number (11.5, w600, **text colour**), then **only if not empty**: the email on its own line (same style as the number), and the description
(10.5, `AppColors.muted`, line height 1.35, 3 px under). An empty one draws nothing and leaves no gap (a card with neither is exactly as tall as the old card). With an email or a description
the icon box sits at the top of the card; without, it stays centred, as it was.

## G. The existing tests that had to change, and why

No test was deleted and none weakened.

- `mobile/test/tourism_bootstrap_new_keys_test.dart` said the app ignores `emergencyContacts`. Header rewritten (it reads it, and ignores the keys it does not know); `emergencyContacts` added to
  `whatTheAppReads`; "the answer is exactly the same with the new keys as without them" would have kept passing only because the contacts were not listed, so it now says the new keys change **only** what
  the app reads of them (the contacts), and everything else is equal; the odd-shape test also asserts the contacts are read as nothing and the written four are shown. Line 110 (`payload.containsKey`) is unchanged.
  Still 5 tests.
- `backend/api/tests.py` `EmergencyContactTests.test_it_matches_the_dart_source_on_disk` read the four `_EmergencyContactCard`s in `tourism_screens.dart`. They moved, so it now reads
  `app_content_defaults.dart`. **The assertion is kept** (the four titles and lines equal `EMERGENCY_FOUR`; the desk's line is composed from its two fields in the test, as the seed's is) and **a second one is
  added** (the four icons). Comments naming the old place were updated. A test file only: no runtime code, no migration.
- `docs/MOBILE_CONTACT_ICONS.md`: a text-colour column and the contrast table, the slash rule, the card description, and rule 4 (the server's list replaces the written four).
  The web test `contactIcons.test.js` reads this file (it needs every name in backticks and "unknown name is `other`"); both are still there.

## H. Not in this work

- Calling a number (`tel:`), copying it, or tapping the email. The card is a read-only box.
- Splitting the numbers (D).
- Any change to the web page (it still draws the number in the icon colour, not the darker text colour), the admin API, the model, the serializer or a migration.
- Making the app list the written four in addition to the server's list (D1).
- Verifying that the four seeded numbers are correct. They come from the app's old code; nobody confirmed them with the LGU in this work.
- The Hotlines tab of PR #17 (open, unmerged), and anything in Sanitation.
- A new APK. The app changes only when one is built and installed (with the usual `libapp.so` check).

## Mga bagay na hindi ko tiyak

Decisions D1 to D5 settled what was uncertain in the first version (replace or add; show the description; the email apart; slash or comma; the contrast). What is left:

1. **The email's look.** D3 says it is its own line. How it looks was not specified. I gave it the number's style (11.5, w600, the text colour). The web preview does not show the email at all.
2. **The description's look.** "Smaller and paler than the number": I chose 10.5 px, `AppColors.muted` (`#6B7280`, 4.83:1), line height 1.35, 3 px under the number. Not seen on a phone.
3. **An entry with a blank number is left out** (the server requires it). If a contact with only an email should be shown, the rule changes.
4. **The icon box position.** With an email or description it moves to the top of the card; without, it stays centred. A matter of taste; one layout for all would also work.
5. **The darker text colours.** They keep the hue and saturation and lower the lightness; they were chosen by calculation, not by eye. `#EB1515` (a stronger red than `#EF4444`) and `#9F6D03` (a brown, for `power`) in particular have not been seen. The web page still uses the icon colour for its number text, so the web and the app now differ for six names.
6. **`help_desk` text colour for other themes.** I rely on the theme code darkening `deep` to 4.5:1 on white (`_darkenToContrast`). I measured the app's own green (6.58) but not the other colours an admin can choose.
7. **Where the new code lives.** A new `app_contacts.dart`, and the list in the existing `app_content_defaults.dart`. Other splits would also work.
8. **Order.** The app keeps the server's order and does not sort. There is no limit on the number of contacts drawn (200 are read in a test; the page length with so many was not looked at).
9. **The saved copy.** A phone with no good answer for up to 7 days shows the contacts of its last good answer; the quiet refresh updates it at the next return to the app after 5 minutes. For emergency numbers, a 7-day-old copy may be wrong. No special rule was added.
10. **Reading the seed from a Dart test.** `app_contacts_test.dart` reads `backend/api/migrations/0054_seed_emergency_contacts.py` and the doc, the backend models and the web files from the repository folders, like `app_content_test.dart` already reads `models.py`. It ties the folders together; the alternative is a fixture file.
11. **The hotlines' correctness** (are these still the right numbers and email?) is not known to me and not part of this work.
12. **Accessibility** (large text, a spoken label for the icon) and the look on a phone with 1, 5 or 0 contacts were not examined; widget tests only.
