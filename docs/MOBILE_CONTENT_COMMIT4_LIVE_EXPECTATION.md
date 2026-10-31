# Mobile App Content, Commit 4 (the web page): what we expect on live after it is merged

Written 2026-10-26, Manila, BEFORE the merge. It is not to be changed afterwards: if the live result differs, the difference is reported
as a difference, and this file stays as it is. It lives in its own file on purpose (PROGRESS.md and PROJECT_AUDIT.md are not touched by
this commit); the result will be written into those two files later, when the owner says they are clear.

Branch `tourism/mobile-content-page`, frontend only: 20 files, all under `frontend/src/tourism/`, plus this one file. No backend file, no
mobile file, no sanitation file, no migration, no PROGRESS.md / PROJECT_AUDIT.md.

## Taken BEFORE the deploy (read only, 2026-10-26 14:57, Manila)

| What | Value |
|---|---|
| `django_migrations` | **84 rows (62 of app `api`)**, counted at 14:57:14; latest `0061_seed_mobile_content` (applied 2026-10-19 14:08:51); 0 rows applied after it |
| Front-end bundle | `main.d17d5cc7.js` |
| Tourism bootstrap | **31,076 bytes**, sha256 `f821f965973ee685fac33ac2862efd6133e6bdd2e9da7ad14130f8d8891de24d`; raw bytes identical to the captures of 2026-10-19 23:41 and 2026-10-26 14:49 |
| `appContent` | 3,359 bytes, sha256 `5f3007cfb24065d17d1dadad24ae997706bc9a605b3aae8695cbb1ff46c9cfd5`; `check_live_appcontent.py --before` (the 22:18 capture of 2026-10-19): ALL OK |
| Sanitation bootstrap | 50,461 bytes, sha256 starting `02854a8089c2b4e5` |
| The six figures | 19 records, 61 visitors, Same Day 5, Overnight 26, average stay 1.8, revenue 2,336 |
| The 99 values | 0 differences against the capture of 2026-10-26 14:49 |
| Fingerprints | record text `8897f9fb68fa678f` (3/1/2); hotlines `7acf891ac67eddc2` (4 rows, 4 active); the nine tiers, letter for letter |
| ActivityLog | **217** (4 about tiers, 0 about hotlines, 0 about content); longest label 175 |
| Content tables | 10 items, 5 blocks |
| Admin endpoints without a login | 401 |

**The count of `django_migrations` is to be taken again immediately before the merge, and again after.**

## What we expect

1. **A frontend-only deploy.** The bundle changes: it is no longer `main.d17d5cc7.js`. (A local production build of the same frontend sources
   gave `main.383eb82f.js`; the build on Render may name it differently, and a different name is not a failure. What matters is that it is
   not `main.d17d5cc7.js` any more.) The CSS file name changes too.
2. **The backend is not changed by this commit.** If Render redeploys it anyway because `main` moved, nothing in it differs: **no migration**,
   `django_migrations` stays **84 rows (62 api)** (compared as a count, before with after), latest still `0061_seed_mobile_content`.
3. **The public tourism bootstrap is the SAME, byte for byte: 31,076 bytes, sha256 `f821f965…de24d`.** `check_live_appcontent.py` says
   **ALL OK** (with `--before` the 22:18 capture of 2026-10-19), `appContent` 3,359 bytes, `5f3007cf…cfd5`, the seven old keys unchanged.
   This holds only if no record is checked in, no admin edits the data and the month does not turn between the capture and the deploy; if the
   whole sha256 differs, compare per key (see the CORRECTION entry in PROJECT_AUDIT.md): `appContent`, `barangays`, `theme` and
   `emergencyContacts` must be unchanged, and the check "only keys that move with the calendar differ" must be OK.
4. **No number moves:** the six figures, the 99 values (0 differences), the fingerprints, the nine tiers.
5. **ActivityLog stays 217**, the content tables stay 10 items and 5 blocks, the hotlines stay 4 rows with 0 log lines: this deploy writes
   nothing, and looking at the page writes nothing.
6. **The sanitation bootstrap is the same** (50,461 bytes) and the admin endpoints still answer **401** without a login.
7. **`/hotlines` goes to `/mobile-content?tab=hotlines`** (the address bar shows it; in place, so Back does not return to `/hotlines`). An
   anonymous visitor is sent to the login first, and comes back to the page. A tourism-role user who opens `/hotlines` or `/mobile-content`
   is sent to `/`.
8. **ONE item in the sidebar, under Administration: "Mobile App Content"**, after Settings and Registration Options. No "Emergency Hotlines"
   item any more. The top bar and the browser tab say "Mobile App Content".
9. **The page opens on the Emergency Hotlines tab**, with five tabs in this order: Welcome, Why Visit, Travel Guide & Tips, Port & Boat Guide,
   Emergency Hotlines. The four that are not built carry a "Coming soon" tag. Choosing a tab changes `?tab=` in the address, and a refresh stays
   on the tab.
10. **The four blank tabs show the message** "Not available yet. The editor for this tab is coming in an upcoming update. The mobile app still
    shows its built-in text." (no word "commit"), and **make ZERO requests** (browser network panel: no call to `/api/emergency-contacts/` or
    `/api/mobile-content/` from them).
11. **The Emergency Hotlines tab works as it did**: same notices, same form (above the list), same preview, same icon grid, same arrows, same
    filter, same messages, same requests. The ONLY visible difference: the **Add contact** button is at the top of the panel instead of in the
    page header.

## What failure would look like

- The build fails: the old frontend keeps serving; the bundle is still `main.d17d5cc7.js`.
- A blank page, or the "Mobile App Content" fallback of the error boundary, when opening `/mobile-content`.
- `/hotlines` shows a blank page, or lands on `/` for the admin, or does not change the address.
- The sidebar has two items, or still says "Emergency Hotlines", or the new item is shown to a tourism-role user.
- A tab click does nothing, the address does not change, Back walks through the tabs, or a refresh returns to another tab.
- A blank tab makes a request, or says "commit".
- The Hotlines tab differs from before: the list does not load, the form is missing or below the list, the arrows are gone, or a request differs.
- ANY difference in 2 to 6 above: that would be a backend change, which this commit does not contain.

## What we cannot see

- How the real router behaves in a browser: the tests use a stand-in for `react-router-dom` (the real one cannot be loaded by the test
  runner), and the source of v7.14.0 was read. The owner opens `/hotlines` after the deploy and looks at the address bar.
- The exact look (spacing, wrapping): the tests read the stylesheet rules but jsdom has no layout. One rule was added for the panel
  (`.mobile-content-panel`, the same spacing as a page) and one for the "Coming soon" tag.
- The Render build and deploy logs, and other browsers and phones.
- Nothing in the mobile app reads `appContent` yet, so no visitor sees any difference from this commit.
