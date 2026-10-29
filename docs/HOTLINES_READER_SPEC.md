# Hotlines reader: the app reads `emergencyContacts`

Status: written 2026-10-29 from `origin/main` at `77988f2` (read with `git show`), then **corrected by the owner's five decisions (D1 to D5, below)**, implemented
on the branch `mobile/hotlines-reader` (commit `f2dd2e7`, not pushed), and then **the look of the card was changed to follow the design (decision A, "the artboard")**: that
change is not committed yet. Where the two disagree, section F and the contrast section below are the current ones. The live site was not touched and no live data is in this document: the four hotlines quoted by
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
| **D5** | **Measure the contrast** of all twelve colours on white. (First answer: any below 4.5:1 got a darker colour for the text only. **Superseded by decision A below:** the text is neutral, so there is no darker text colour; the picture's colour needs 3:1, and it was measured.) | C |
| **A** | **Follow the design.** The number and the email are small neutral boxes (not coloured lines); the description is a grey line under them; the picture and its box keep their original colour. The twelve original colours are back and the six darker text colours are gone. | C, F |

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

## C. The twelve icons and their colour (decision A; contrast measured)

`appContactIcons` / `appContactIconFor(Object?)` like `appContentIcons`: an unknown name, or a non-string, is `other`. `AppContactIcon(icon, color)`: `color` is the picture's colour and its
box's; `null` means the theme's `context.brand.deep` (only `help_desk`). **One colour per name, and it is used for the picture only.** The twelve are the original colours, in
`docs/MOBILE_CONTACT_ICONS.md`; the app is the measure for the four that existed.

The picture is a graphical object, so the rule is **3:1** (WCAG 1.4.11), measured **against its own box** (its colour at 10% over white), which is what it is really drawn on. The full table of the twelve (colour,
ratio on its box, ratio on white) is in `docs/MOBILE_CONTACT_ICONS.md`. Result: nine passed as they were; `fire` (`#F97316`, 2.53 on its box), `power` (`#CA8A04`, 2.67) and `port` (`#65A30D`, 2.80) were made darker with
the same hue to `#E86306`, `#BC8104` and `#619C0C` (3.01 each). **All twelve reach 3:1; there is no list of exceptions.** The web page uses the same three. The text needs no colour from the picture: the number and the email
(`#3C4C55`) on their box (`#EFF5F7`) are 8.09:1, the description (`#5E6F77`) on white 5.23:1.

`docs/MOBILE_CONTACT_ICONS.md` is the table the app must match; a Dart test (`mobile/test/app_contacts_test.dart`) fails if the app's map differs from that table, from
`EmergencyContact.ICON_CHOICES` in the backend, or from the web module (names, order, and the web's colour tokens).

## D. Several numbers (D4)

**A slash ` / ` separates several numbers.** (The web hint says so, and two of the four seeded rows use one; none uses a comma.) **The app does not split the text in this step**: it shows `contact_numbers`
whole, as written. A text with no separator is shown as it is; a blank text makes the entry broken (B), so no blank number is ever drawn. If the app ever splits the text (to make each number tappable), it splits on the slash.

## E. The defaults: the four written, one copy (D3)

`AppContentDefaults.hotlines` in `app_content_defaults.dart`: four `AppContact`s in today's order, **moved** out of `tourism_screens.dart`, not copied, with negative ids (never a server id).
The desk's `numbers` and `email` are two fields (D3). The heading `'Emergency Hotlines & Helpdesk'` stays in the screen. Tests: each text is in `lib/` once; the four equal the seed
(`0054_seed_emergency_contacts.py`) field by field (name, numbers, email, icon); their icons and colours are the four the screen had.

## F. The card (decision A, from the design "Edit hotline", "How it will look in the app")

`_EmergencyContactCard`: the picture in its colour inside its 10% box (radius 8) at the top left; the name (bold 12.5); 6 px under it, a `Wrap` (6 px between boxes and between lines) of small boxes:
the **number** (ONE box, even with several numbers separated by a slash) and, **only if not empty, the email**. A box: background `#EFF5F7`, text `#3C4C55`, 11 px, semi-bold, radius 7, padding 3 px 8 px; it goes to the
next line when it does not fit. Then, **only if not empty**, the **description**: 11.5 px, `#5E6F77`, 7 px below the boxes. An empty email has no box; an empty description has no line and no gap. Nothing on the card but the picture and its box
takes the picture's colour.

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
- Any change to the admin API, the model, the serializer or a migration.
- Making the app list the written four in addition to the server's list (D1).
- Verifying that the four seeded numbers are correct. They come from the app's old code; nobody confirmed them with the LGU in this work.
- The Hotlines tab of PR #17 (open, unmerged), and anything in Sanitation.
- A new APK. The app changes only when one is built and installed (with the usual `libapp.so` check).

## Mga bagay na hindi ko tiyak

Decisions D1 to D5 settled what was uncertain in the first version (replace or add; show the description; the email apart; slash or comma; the contrast). What is left:

1. **The artboard file was not opened.** `EditHotline.dc.html` could not be found on this computer. Every value of the card (colours, sizes, radius, padding, 6 px, 7 px) is the one the owner wrote in the instruction, not one read from the design.
2. **What the instruction did not say, I chose:** the gap between the name and the first box (6 px); that the description is regular weight with the default line height; that the picture's box stays at the top of the card.
3. **An entry with a blank number is left out** (the server requires it). If a contact with only an email should be shown, the rule changes.
4. **`fire`, `power` and `port` were made darker** (same hue) to reach 3:1 on their own box; the new hexes were chosen by calculation, not by eye, and have not been seen on a phone. The web page was changed to the same values.
5. **`help_desk` for other themes.** I measured the app's own green; the other colours an admin can choose rely on the theme code darkening `deep`.
6. **The web page was brought to the app's look** (neutral boxes for the number and the email, the description shown, the three darker colours) in a later step on the same branch. The up/down arrows are still there: the design's Order box needs the reorder endpoint, which is separate work.
7. **Where the new code lives.** A new `app_contacts.dart`, and the list in the existing `app_content_defaults.dart`. Other splits would also work.
8. **Order.** The app keeps the server's order and does not sort. There is no limit on the number of contacts drawn (200 are read in a test; the page length with so many was not looked at).
9. **The saved copy.** A phone with no good answer for up to 7 days shows the contacts of its last good answer; the quiet refresh updates it at the next return to the app after 5 minutes. For emergency numbers, a 7-day-old copy may be wrong. No special rule was added.
10. **Reading the seed from a Dart test.** `app_contacts_test.dart` reads `backend/api/migrations/0054_seed_emergency_contacts.py` and the doc, the backend models and the web files from the repository folders, like `app_content_test.dart` already reads `models.py`. It ties the folders together; the alternative is a fixture file.
11. **The hotlines' correctness** (are these still the right numbers and email?) is not known to me and not part of this work.
12. **Accessibility** (large text, a spoken label for the icon) and the look on a phone with 1, 5 or 0 contacts were not examined; widget tests only.
