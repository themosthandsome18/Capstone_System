# Mobile App Content: no save on live while a live-after is being measured

Written 2026-10-26. A rule of the owner, kept in its own file (PROGRESS.md and PROJECT_AUDIT.md are not touched by this branch).

## The rule

**From the moment the "before" capture of a live measurement is taken until the "after" capture is finished, NOBODY saves anything in the
Mobile App Content page on live.** That is: no Save in the Welcome or Why Visit tabs, no Add, Edit, Deactivate, Reactivate or arrow in the
Emergency Hotlines tab, and no write to the content endpoints by any other means. The owner confirms, before the "before" capture, that no
editing session is open, and tells whoever else has the page open.

**The first real edit of the content on live is a SEPARATE step**, with its own "before" and its own "after". It is never done as part of the
live-after of a deploy, and a live-after never starts while an edit is being planned for "just after".

## Why

The editor changes DATA, and the data is in the public bootstrap:

- `appContent` is built from the two content tables at the moment of the request, so the first save changes its bytes. The numbers pinned for
  the seed texts (3,359 bytes, sha256 `5f3007cfb24065d17d1dadad24ae997706bc9a605b3aae8695cbb1ff46c9cfd5`, and the whole bootstrap of
  31,076 bytes, `f821f965973ee685fac33ac2862efd6133e6bdd2e9da7ad14130f8d8891de24d`) stop being true from that save on. A save during a
  live-after would make a correct deploy look like a difference, or hide a real one.
- Every saved block writes one line to the ActivityLog (217 today), so the count moves too.
- Hotlines edits change the key `emergencyContacts` and the ActivityLog in the same way.

A measurement is only worth anything if it can tell the code apart from the data. While a save may happen, it cannot.

## The first real edit, as its own step

1. **Before** (read only): the capture of the tourism bootstrap (bytes, sha256, and each of the eight keys), `appContent` (bytes, sha256),
   the ActivityLog count, the row counts of the two content tables, `django_migrations` (count, latest), the six figures, the 99 values.
2. **The edit**: the owner (or whoever the owner names) saves ONE block, one field if it can be, and writes down which field and the text.
3. **After** (read only), the same list, and the expectation written BEFORE the edit, not after:
   - the seven legacy keys are the same, key by key (except what the calendar moves; see the CORRECTION entry in PROJECT_AUDIT.md);
   - `appContent` differs ONLY in the edited field(s); `check_live_appcontent.py` is ALL OK on the new content (shape, no leftover braces, under
     the 60 KB canary), and its per-key list shows no old key moved;
   - the ActivityLog is one line more per saved block, and the new line names the block and the field, not the text;
   - `django_migrations` and the content table row counts are unchanged.
4. **Putting it back** is also a save, so it is another step with its own capture. "Use the app's built-in text" and Save puts the seed text
   back; the `appContent` of the seed texts then has its pinned bytes again, but the ActivityLog keeps the two lines.

## What this rule does not cover

Nothing in the mobile app reads `appContent` yet, so a saved text reaches no visitor today. That does not make a save harmless to a
measurement: the bootstrap that every installed app downloads already carries the saved text.

## Measuring: never run the heavy suites at the same time

Added 2026-10-26, at the owner's instruction. **The heavy suites (backend, frontend, Dart) are run ONE AT A TIME, never together, and nothing else heavy
runs beside them** (a build, a mutation run, a second suite). Reason: in this project the conditions of a measurement have differed from the conditions of
the real run six times (a golden that passed alone and not in the whole suite, a test that passed alone and exceeded its five seconds beside another
suite, the same on a sanitation test of the colleague, and others). A suite run beside another one measures the load, not the code. If a test fails
under load, it is run alone AND the whole suite is run again with nothing beside it, and the report says both, with what was running.

### What was measured about the frontend suite on this machine (2026-10-26, Commit 5b)

The whole frontend suite, with the default number of workers (15 on the 16 logical CPUs of this machine) and the developer's own servers running beside it
(`react-scripts start` and two `manage.py runserver`, none of them started by Claude), fails ONE test of the colleague's, `HouseholdRecords.final.test.js`,
"new Bottomless POST uses independent selected source and level without total", by the default 5 seconds (it takes about 1.5 s alone; the file takes 28 s inside
the suite). This happened 5 times out of 5 with the editor test of Commit 5b in the suite; the same suite without that one file passed, the suite of the previous
commit passed, and the test passes alone. With `--maxWorkers=6` all 1,014 tests pass in 35 seconds. So it is load: too many workers on a machine that is also running
other things. On this machine run the frontend suite as `CI=true npx react-scripts test --watchAll=false --maxWorkers=6`, and say so in the report; a test of the
colleague's that needs more than its 5 seconds under load is the colleague's to change (a timeout), not ours. Nothing of the colleague's was changed.
