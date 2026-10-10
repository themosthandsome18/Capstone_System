# Print proof

Proves that the Reports page prints correctly by printing the real built app
through a real browser's own `window.print()`, and checking the PDFs it writes.

**This is the required proof for any change that affects printing.** A headless
print alone is not accepted (see "Why headless is not enough").

## What it proves

For each print mode, on A4 and on Letter:

| Scenario | What is pressed |
|---|---|
| `report` | "Print report", once every chart has settled |
| `tabswitch` | "Print report" 50 ms after switching to the Origin tab, while that chart is still animating |
| `insights` | "Print Key Insights" |
| `all` | "Print all reports" |

`check_pdf.py` then reports, from the PDF alone:

- **Every report chart.** It counts as DRAWN only with bars **and** real axis text. Bars without text are a STALE IMAGE: a frame printed mid-animation, which has shown wrong figures. Neither is BLANK.
- **Every Key Insights card.** Its chart is drawn.
- **Report-chart detail.** Plotting-area width, label angles, and how many label lines sit under the axis.

Running a scenario a second time with `noredraw` gives the page count without the print-time chart redraw. The two page counts must match: Chrome fixes the page count before the redraw, so content pushed further by it would silently disappear.

`drive.py` also records the print layout at the print-media change (`out/NAME.json`). With it, the layout checks used in the project audit can be run on the real PDF:

- page contents, cards split across pages, table rows and column edges;
- gaps between chart and answer, and text sizes.

## Why headless is not enough

A headless print (DevTools `Page.printToPDF` on a static copy of the page) showed every chart drawn, while real prints had blank charts and charts with wrong figures. The harness hid two things:

- **Animation.** Chart.js animates every chart for about a second after it is created or updated. A print started during that second drew nothing, or a stale frame, because the redraw waited for an animation frame that never comes while printing. The headless harness had turned animation off.
- **Charts created just before printing.** "Print all reports" builds nine charts and prints at once, and a tab switch updates the chart just before Print is pressed. The headless harness built every chart when the page loaded, seconds earlier.

This harness keeps animation on and drives the app the way a user does.

## The one departure from the real pipeline: paper size

Kiosk printing ignores the saved paper setting: "Save as PDF" falls back to the machine's default paper (Letter on the machine this was built on), whatever the profile asks for.

So `drive.py` injects a test-only `@page { size: A4 }` (or `letter`) into the page under test. It sets the paper as choosing it in the print dialog would; the app's own `@page` margins still apply. Everything else (the app, its buttons, `window.print()`, the browser's print pipeline) is real.

## Fixtures: generated locally, never committed

The stand-in server (`stub_server.py`) answers the app's API calls from `fixtures/responses.json`. That file is generated from the database the backend is configured for, normally the **live** database. It is therefore **live-derived data**:

- **Generated locally.** Anyone who clones this repository must generate their own; there are none in the repository.
- **Never committed.** `tools/print-proof/fixtures/` and `tools/print-proof/out/` are git-ignored. Check with `git check-ignore -v tools/print-proof/fixtures/responses.json`.
- **Visitor data until the generator strips it.** The generator reads the database read-only and empties the visitor-level parts: booking rows, tourist records and feedback. What remains is report aggregates, reference tables and the theme.

**The generator refuses to write fixtures that still contain visitor data.** Before writing, it checks the whole result for:
- survey IDs, email addresses and Philippine mobile numbers;
- visitor-level field names;
- any visitor name in the database.

On any match it prints what matched and in which section, exits with code 2, and writes nothing. `--keep-booking-rows` skips the stripping, only to prove that the check refuses.

`out/` holds printed reports (PDFs) and run logs, which are also live-derived. Delete it when done.

## How to run

From the repository root, on Windows with Edge installed (or set `BROWSER` to another Chromium browser). Needs Python with `websocket-client`, `pypdfium2` and `Pillow`.

1. **Generate fixtures** (read-only), with the backend's Python:

   ```
   backend/venv/Scripts/python.exe tools/print-proof/gen_fixtures.py
   ```

2. **Build the app against the local stand-in**, into a folder outside the repository. It must not overwrite `frontend/build`:

   ```
   cd frontend
   REACT_APP_API_BASE_URL=http://127.0.0.1:8765/api BUILD_PATH=<some folder> npx react-scripts build
   ```

3. **Print and check**, for example:

   ```
   python tools/print-proof/drive.py <build folder> all a4 all_a4
   python tools/print-proof/drive.py <build folder> all a4 all_a4_noredraw noredraw
   python tools/print-proof/check_pdf.py all_a4
   ```

   Each run opens a browser window briefly, in a throwaway profile that is deleted afterwards. It talks only to `127.0.0.1:8765`; no login and no live request.

4. **Clean up:** delete `tools/print-proof/out/`, and `tools/print-proof/fixtures/` when you no longer need them.

## Files

| File | Role |
|---|---|
| `gen_fixtures.py` | Builds the fixtures read-only, strips visitor data, refuses to write if any remains |
| `fixture_guard.py` | The visitor-data check (also runs on its own: `python fixture_guard.py FILE.json`) |
| `stub_server.py` | Serves the build and answers `/api/*` from the fixtures, logging each request |
| `drive.py` | Opens the app in Edge with kiosk printing, presses the buttons, collects the PDF and the print layout |
| `recorder.js` | Injected into the page: records the print layout and the gaps after the redraw |
| `check_pdf.py` | Reads a PDF: every chart drawn, stale or blank; plotting area; labels |
