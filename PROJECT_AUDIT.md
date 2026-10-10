# PROJECT AUDIT: Mauban LGU Tourism & Sanitary Compliance Portal

## Household Coordinate Provenance - Slice 2 (2026-10-04; evidence updated 2026-10-08; integrated locally, unpublished)
- Original implementation was based on published Slice 1 main `87e86a11c0255b72d271cb4144949fec691a3df9`, on `sanitation/household-coordinate-provenance-mobile`. Slice 1 is closed; earlier unpublished Slice 1 notes below are historical. This change is mobile household only and preserves the published backend/web behavior.
- `_captureLocation()` no longer constructs a fabricated Position or time-derived Mauban coordinates. A household-local adapter provides deterministic service/permission/position tests while production retains Geolocator high accuracy and the four-second timeout. Each failure reports service-off, denied, permanently denied, timeout or generic retry guidance; only actual acquisition reaches `GPS location acquired.`. All failures retain text and leave location unconfirmed; callbacks after disposal are ignored.
- Manual fields and map taps still clear confirmation; Confirm Pin deliberately confirms the existing valid pair under unchanged validation. New surveys require a confirmed location. Compatible mapped records retain exact initialization and differential PATCH without recapture. Failed recapture preserves coordinates and requires reconfirmation. Historical NULL/unmapped records remain safely blocked from mobile editing; no invented coordinates bypass the block.
- Actual pre-fix red evidence: 16 location tests, 7 passed / 9 failed, exit 1. All five acquisition-failure scenarios generated and populated coordinates, marked confirmed, showed success and reached a mocked POST. Service-off example: `14.191600,121.734400`. Failed mapped recapture replaced stored latitude `14.192345678` with `14.196800`. Remaining failures covered two old success-message variants and setState after disposal.
- Original focused verification: location, edit-preservation, septic, final and remarks suites passed 95/95 (exit 0), including 16 new location cases and two new preservation cases. Tests exercise the real form/API method with mocked HTTP: deliberate GPS/manual/map values reach POST and unrelated mapped edits produce address-only PATCH. No real local backend/SQLite server was run at that implementation stage; this is automated payload evidence, separate from the later phone acceptance.
- Original implementation verification: full Flutter passed 237/237, `flutter analyze` reported no issues, and `git diff --check` passed (all exit 0). At that review the changes were uncommitted, with APK build and phone acceptance pending; the completed evidence below supersedes those statuses.
- Commit history: original Slice 2 commit `e6cd4d32151707d4ebe2c4fcbb72185e41681509`; integrated implementation commit `ef62c4d74d5227c23b52087e5372f42be105ec22`; previous evidence documentation commit `b8d29a3f31b451649d76b6c79ee62fcc7ed73a0d` on `sanitation/household-coordinate-provenance-mobile-integrated`, based on audited `origin/main` `a7efafbc948e458844b7c0139a8935955a1f5c53`. All 23 upstream commits and tourism audit sections were preserved; the mobile source/tests are byte-identical to the original Slice 2 implementation.
- Original APK built and verified from `e6cd4d32151707d4ebe2c4fcbb72185e41681509`: package `com.mauban.sanitation`, versionName `1.0.4`, versionCode `5`; APK SHA-256 `2d1ebdc698d141890a0b251e0bcd2b6b79fb389302bbe06d2e96ce50edec4bca`; signing certificate SHA-256 `98214ff2f499cbb6bd5f18938e6a50dac789a26143dd3ca39011e8e44c01c86b`.
- Integrated sanitation APK build passed (exit 0): package `com.mauban.sanitation`, version `1.0.4+5`, size 79,494,495 bytes, SHA-256 `2d1ebdc698d141890a0b251e0bcd2b6b79fb389302bbe06d2e96ce50edec4bca`; signing certificate subject `CN=Android Debug` and SHA-256 `98214ff2f499cbb6bd5f18938e6a50dac789a26143dd3ca39011e8e44c01c86b`. Manifest and signature verification passed. Its checksum matches the original accepted APK.
- Real-phone acceptance occurred in two separate user-reported sessions: the original APK passed 10/10 scenarios; the integrated APK passed 7/7 smoke checks on a real Android phone. Each result applies to the APK tested in that session.
- Combined-tree regression at `ef62c4d74d5227c23b52087e5372f42be105ec22`: focused Flutter 95/95, full Flutter 237/237, analyzer zero issues; focused backend 42/42, full backend 402/402, Django check passed, migration consistency reported no changes, and `git diff --check` passed (all exit 0). Backend verification used isolated in-memory SQLite with `.env` loading disabled and outbound socket connections blocked; no production API/DB access. Non-failing notices: missing local `backend/staticfiles/` and Flutter OSM tile usage.
- Current status: the integration and evidence documentation commits exist locally on the unpublished integrated branch. A fresh final publication preflight and the merge/push to `main` remain pending; no production deployment is claimed. Slice 2 did not modify backend/web, community-report location, tourism/shared auth, dependencies/Android permissions or `tatus`. GPS-photo/EXIF remains outstanding and unimplemented.

## Household Coordinate Provenance - Slice 1 (2026-10-04; local branch, unpublished)
- Approved contract: web-created households without real coordinates remain valid unmapped records with NULL latitude/longitude. `HouseholdSanitationRecord.save()` no longer invokes the shared barangay coordinate resolver; the resolver and establishment synthesis are unchanged. Unrelated saves preserve historical NULLs and valid coordinates, and deliberate coordinate edits persist exactly. Existing serializer acceptance of zero/near-zero inputs remains intact; no new boundary/accuracy validation, schema, nullability change, or migration was introduced.
- GIS: household mode disables the deterministic barangay-center fallback after the existing stored-coordinate usability checks. Unmapped households are omitted from markers while remaining in Household Records and the backend list/details. Valid household marker positions remain exact. Establishment/community-report fallback positions, filters, source aggregates, boundaries, controls and tile-provider behavior are unchanged; no unmapped-count UI.
- Local integration: authenticated real loopback HTTP requests against a fresh SQLite database verified successful coordinate-omitting creation, refreshed API and SQL NULL/NULL, unrelated PATCH retaining NULL/NULL, deliberate coordinate PATCH, subsequent unrelated PATCH preserving exact coordinates, and independent valid-coordinate creation/readback. Household/staff bootstraps and dashboard handled a remaining unmapped row. No production API/DB was accessed; the local server was stopped.
- Local manual browser acceptance: **PASSED**, as reported by the user for the original Slice 1 commit. The null-coordinate household remained visible and editable in Household Records; an unrelated edit preserved NULL/NULL after save and refresh. GIS omitted that household without an approximate/barangay-center marker; the valid-coordinate household rendered at its stored location. Establishment markers and map controls remained functional with no visual/runtime error observed. React component tests also verify these behaviors. This local acceptance does not establish deployed-browser acceptance.
- Red -> green evidence: corrected pre-implementation backend red run had 9 tests, 6 failing methods and 8 failures including subtests (exit 1); corrected GIS red run had 8 failures and 3 passes (exit 1), including a NULL household plotted at `[14.187157,121.733225]`. After the fixes, backend coordinate/septic/readback/remarks passed 38/38 (9 new coordinate tests); frontend GIS/household suites passed 48/48 (11 GIS tests, 4 suites); full frontend passed 362/362 (21 suites), all exit 0. Two existing household tests initially timed out at 5 seconds; focused/full green runs used a 30-second timeout. Django check and migration dry run both exited 0, with no issues/no changes respectively.
- Full backend validation passed 306/306 using isolated SQLite (exit 0). Production frontend build compiled successfully and `git diff --check` passed (both exit 0); neither establishes deployed acceptance.
- Slice 2 remains open: mobile geolocation fallback and mobile editing behavior were not modified. GPS-photo/EXIF work remains separate and unimplemented. Scope is sanitation in `Capstone_System`, based on current code at `f9d2ef67fcd198ea46eb9a0231fc904fb49b47c8`; tourism/shared auth and `tatus` were untouched. Local branch work is unpublished, with no merge or push. Local browser acceptance passed; deployment acceptance remains pending.

## Standing Notes
- **Print changes:**
  - Proven in a real browser print of the real built app, through its own `window.print()`, with animation on (see "Reports Print: Charts Drawn on Paper" below). A headless pass alone is not accepted.
  - Page count measured with and without the print-time chart redraw, and the two must match (see "Reports Print Layout: Phase 4").
- **Renaming a value that code matches by name.** Render runs `build.sh`, including `migrate`, while the OLD instance is still serving. So a data migration goes live BEFORE the code that expects it. For any future rename, ship code that accepts both the old and new name first, then migrate in a later deploy. The "Day Tour" -> "Same Day" rename (below) did it in one deploy: the gap was a few minutes and no import ran, so nothing split, but that was luck.

## Year Filters From the Data; Unknown Report Type Rejected (2026-10-05; `tourism/theme-tokens`)
- **The hardcoded year list is gone.** The backend accepted only `TOURISM_REPORTING_YEAR_CHOICES = ("2024", "2025", "2026")` and the Reports, Dashboard, Arrival Monitoring and Booking Management pages each hardcoded the same three years in their dropdown. Any other year silently became `DEFAULT_TOURISM_REPORTING_YEAR`, which was fixed when the server process started, in UTC.
- **Why it mattered: 2027-01-01.** The browser asks for "2027", which was not in the list, so the backend answered with its start-up year. If the process had started in 2026 (still running, or restarted before 08:00 Manila time, which is still 2026 in UTC), every page showed 2026 data while asking for 2027, and Arrival Monitoring's Month view went empty (its 2027 date range filtered inside year 2026). If the process started in 2027, the data was 2027 but every dropdown displayed "2026", since "2027" was not an option. No error either way. Today, asking for 2027 returned 2026 data.
- **Now:** `get_reporting_years()` returns every year with a tourist record plus the current year, newest first (one query, sent once in the bootstrap as `reportingYears`), and `utils/reportingYears.js` builds every year dropdown from it (plus All Years, and the selected year so the dropdown always shows the year the data is for). Live: 2027, 2026, All Years; selecting 2027 returns SURV-2026-011 alone (4 visitors, PHP 304) on every visitor tab. The current year is read on every call in local time (`timezone.localdate()`). A year with records added after the app loaded appears at the next reload; the current year is always there.
- **A bad year is rejected, not replaced.** No year means the current year (the bootstrap relies on it). "all" means all years. Any well-formed four-digit year is honoured, empty if it has no records. Anything else ("2027x", "abcd", "20", full-width digits) is a 400 ("Unknown year ...") on Reports, Dashboard, Arrival Monitoring, its export and Booking Management (`ReportParameterError`, answered by `report_response` in the views). Rejected rather than All Years, because All Years would also be another year's data under a filter the user did not choose; the dropdowns only send listed years, so only a hand-made URL hits this.
- **Unknown report type rejected.** `build_reports_payload` fell through to the Resort branch for any unknown `type`; now it is a 400 listing the valid types. No type still means Resort (the bootstrap asks that way); no caller sent an unknown type.
- **Subtitle copy.** Daily, Monthly, Yearly and Resort said "based on arrived tourist records" but count arrived and pending bookings. Now: "Daily / Monthly / Yearly visitor totals from arrived and pending bookings (no-shows excluded)" and "Visitor totals by resort from arrived and pending bookings (no-shows excluded)". Not changed, same issue in milder words: the titles ("Daily Tourist Arrival Report" and so on) and the Key Insights questions ("tourist arrivals"), whose answers also count pending.
- **Query counts.** Every report tab unchanged (1, Resort 2); the bootstrap gains one query (`dates("arrival_date", "year")`), once per app load.
- **Tests.** Backend `ReportingYearTests` (8): years from the data (one query), the current year with no records, the bootstrap field, no year means the current year, junk years 400 on all five endpoints and all 8 tabs, an unknown type 400, no type is Resort; plus 2027 on every tab. Frontend: the dropdown comes from the data, the helper (3), the subtitles. Breaking each (no current year, a hardcoded list in the backend or the dropdown, the old 2024-2026 rule, junk falling back to the current year, an unknown type answered with resorts, the old subtitle) failed its test; restored byte-identical, all passed. Full suites: backend 384, frontend 443 (29 suites).
- The Excel import's fixed year window, an open item when this section was written, is fixed in the next section.

## Peak Season Analysis Percentage (2026-10-06; `tourism/theme-tokens`)
- **The bug.** "Peak Season Analysis" divided the peak month by itself, in both the sentence (`format_top_answer(peak_month, peak_month["total"])`) and the gauge (`build_share_visual(..., peak_month["total"])`), so both always read 100% ("September 2026 leads with 19 visitors, equal to 100.0% of the selected total" when the selected total was 36). The frontend ring also turned a 0 or missing percentage into 100% (`visual.percentage || 100`).
- **The fix.** Both now divide by the selected total (`total_visitors`, the same visitors the other shares use: everything except no-shows, within the year and dates chosen), so the sentence and the ring always state the same figure: the peak month's share of the selected total. A ring of share-of-the-largest would read 100% for the top month every time. The ring now defaults to 0% (`?? 0`).
- **Other percentages checked.** Top Tourist Destination, Top Visitor Origins and Primary Purpose already divided by `total_visitors`; no other Key Insights sentence states a percentage; the pie and doughnut legends show each slice's share of their own slices, as labelled.
- **Live (read-only).** 2026: September 19 + October 17 = 36; "September 2026 leads with 19 visitors, equal to 52.8% of the selected total", gauge 19/36 = 52.8% (was 100.0%). 2027: only September (4), so 4/4 = 100.0%, which is correct. All Years: 19/40 = 47.5% (was 100.0%). Top resort / origin / purpose unchanged and confirmed: 2026 10/36 = 27.8%, 17/36 = 47.2%, 19/36 = 52.8%; All Years 10/40 = 25.0%, 21/40 = 52.5%, 23/40 = 57.5%. The other 10 answers are byte-identical to before for 2026, 2027 and All Years.
- **Tests.** Backend `PeakSeasonShareTests` (4): the peak month's share on three months of different sizes (August 12 of 20 = 60.0%, with a no-show excluded); the gauge equals the sentence for 2026, All Years and an August-September range (80.0%); top resort, origin and purpose are each 13 of 20 = 65.0% (the fixture gives each a second group, so dividing by the leader itself would show); no data is 0%. Frontend (2): the ring shows the stated 52.8%, and 0% (not 100%) with no data. Breaking each (the peak dividing by itself, the gauge out of step, origin or purpose dividing by itself, the ring's 100% default) failed its test; restored byte-identical, all passed. Full suites: backend 400, frontend 450 (29 suites).

## Reports Print: Charts Drawn on Paper, Name Labels Level (2026-10-11; `tourism/theme-tokens`)
- **Found in real Edge prints of live 861107b:**
  - "Print all reports" printed all nine report charts blank: correct boxes and tables, no bars.
  - "Print report" on the Resort tab printed rotated, crowded resort names.
- **Cause of the blank charts: Chart.js's opening animation.** No chart config sets `animation`, so every chart animates on creation or update (Chart.js default, about 1 s).
  - The all-reports block creates its nine charts and calls `window.print()` in the same task.
  - The print-time redraw (`utils/printCharts.js`) resizes each chart. While an animation is running, Chart.js leaves the redraw to its next animation frame, and no frame runs while the browser prepares the print, so the canvas is printed empty.
  - Ruled out in the real print pipeline:

    | Variant | Report charts |
    |---|---|
    | Mounted on-page instead of off-screen | still blank |
    | Without the redraw | still blank |
    | Same 300px rule, animation off | drawn |
    | Printed 1.5 s later | drawn |
    | Redraw with `chart.stop()`, then `update("none")` | drawn |

- **This bug predated Phase 4; Phase 4 only exposed it.**
  - "Print report" pressed within about a second of a tab switch or Apply Filters printed whatever frame the chart's update animation had reached, as a low-resolution image.
  - Measured on 861107b, real print, Origin tab, Print pressed 358 ms after the tab click: a stale screen image with no axis text and wrong figures (Quezon about 24 instead of 21, Bataan about 20 instead of 6, Japan missing, bars floating above zero).
  - Phase 4 created nine charts immediately before printing, which made it total.
- **Why the headless harness could not see it.** It set `Chart.defaults.animation = false` and built every chart when the page loaded, seconds before printing. Both hid an animation still running at print time.
  - Its layout, pagination and text-size measurements remain valid for charts that had finished drawing before printing (the loaded report, Key Insights). The real-pipeline re-run below matches them.
  - It never tested a chart created or updated within about a second of printing.
- **Fix A.**
  - The redraw stops any running animation and draws the final state at once: `chart.stop()`, `chart.resize(w, h)`, `chart.update("none")`. The same on restore.
  - The nine all-reports charts are also built with `animation: false` and their own options object, so they do not depend on the redraw.
- **Fix B, name labels level on paper.**
  - Report chart boxes carry `data-print-labels`: "wrap" for Resort, Origin, Purpose, Vehicle, Boat and No-show; "rotate" for Daily, Monthly and Yearly.
  - For "wrap", the print redraw sets the x labels on up to four lines with no rotation and no skipping. A line holds what fits one column at the 15px tick font: (chart width - 60px) / columns / 8px a character.
  - Columns narrower than 8 characters keep Chart.js's rotation and skipping, as dates always do.
  - Labels, rotation and skipping are restored after printing.
  - **Resort, real print:**

    | | Plotting area | Labels |
    |---|---|---|
    | Before | 463px (A4) / 485px (Letter) | rotated 21.8 / 20.6 degrees, on 8-9 staggered lines |
    | After | 598px (A4) / 617-620px (Letter) | level on 4 lines, e.g. "Dona / Choleng / Camping / Resort" |

  - The 7 names need 1,012px laid flat at 15px (the longest 208px).
  - Chart.js rotates 7 labels once a label passes about 80px (11 characters), and 15-character labels from 6 columns.
  - The 300px rule did not change this: the redrawn chart was 630x300 with 21.7 degree labels from Phase 2 on.
  - The 45 degree, overlapping labels reported from the field were not reproduced here (21 degrees in real Edge).
- **Proof method: the real-browser pipeline. It is REQUIRED for any future print change; a headless pass alone is not accepted.**
  - **What it runs:**
    - the real built app, built with `REACT_APP_API_BASE_URL` pointing at a local stand-in server, driven by its own buttons through its own `window.print()`;
    - Edge (or Chrome) with `--kiosk-printing` and "Save as PDF" preselected, in a throwaway profile, so the real print pipeline writes the PDF;
    - animation left on.
  - **Data:** the stand-in replays responses generated read-only from the live database with the backend's own builders. No live login, no live request.
  - **Scenarios:** print one report; print immediately after a tab switch; print Key Insights; print all reports. Both papers.
  - **Checks, per chart:**
    - drawn bars and real axis text; bars without text are flagged as a stale image;
    - page counts with and without the redraw;
    - every earlier layout and text measurement, on the real PDFs, with the layout recorded at the print-media change.
  - **Paper:** kiosk printing ignores the saved paper size (Save as PDF defaults to Letter on this machine). The paper is therefore applied with an injected test-only `@page { size: A4 }` / `letter`. The app's own `@page` margins still apply.
  - **Where it lives:** the scripts are in the session's scratch folder (`realapp/`: `gen_responses.py`, `stub_server.py`, `drive.py`, `recorder.js`, `check_pdf.py`), not yet in the repository.
- **Results, real Edge print, fixed build, A4 and Letter:**

  | Print | Pages (A4 / Letter) | Charts drawn | Same page count without the redraw |
  |---|---|---|---|
  | Print report (Resort) | 2 / 2 | 1/1 | yes |
  | Print right after a tab switch (Origin, Print 358 ms after the tab click) | 2 / 2 | 1/1, correct values | yes |
  | Print Key Insights | 4 / 4 | 11/11 | yes |
  | Print all reports | 13 / 14 | 9/9 report charts and 11/11 Key Insights | yes |

  - Production 861107b in the same pipeline: all reports 0/9 report charts; the tab-switch print a stale image (0/1).
  - Phase 1-4 checks on the real PDFs, both papers:
    - nothing shrunk (scale 0.995); 0 of 11 cards split; screen heading absent;
    - every report starts its own page;
    - table rows 58px (Total 57.5px), every row accounted for, 0 glyphs crossing a column edge;
    - chart cards 394px and inside their page, canvas 629-630x300 (A4) / 651x300 (Letter), dead band 0;
    - 0 chart pixels in the column gap or outside any box;
    - report-chart text 15.0px (x) / 16.0px (y): Daily's dates rotated about 19 degrees as designed, every other report's labels level;
    - Key Insights cards 421.4px, 0 spread; smallest Key Insights chart text 10.8px; chart-to-answer gap 14.3-14.4px (measured after the redraw); Peak Season 29.0px and Average Length of Stay 34.0px;
    - gauge sweep 180.0 / 180.2 degrees at the page's 50.0% (expected 180.0).
- **Tests.**
  - `printCharts.test.js`:
    - (a) the redraw calls stop, resize, update("none") in that order, and again on restore;
    - (b) name labels wrap level ("Dona / Choleng / Camping / Resort", "Rio Del / Sol Beach / Resort") while date labels are untouched, and 20 narrow columns keep rotation;
    - (c) labels, rotation and skipping are restored after printing;
    - plus the four-line cap.
  - Page test: the nine printed reports carry rotate x3, then wrap x6.
  - Breaking each one failed its test, then passed after a byte-identical restore:
    - (a) no `stop()`: the "stop" call missing. In the real pipeline, a build without `stop()` printed the tab-switch chart as a stale image again;
    - (b) wrapping applied to every chart;
    - (c) no restore.
  - Full suites: frontend 475 (30 suites), backend 402. No backend change, no data change, no migration. CSS unchanged (`main.18ee4372.css`).

## Reports Print Layout: Phase 4, All Reports in One Document (2026-10-10; `tourism/theme-tokens`)
- **Standing verification rule for any change that affects print:** measure the page count both with and without the print-time chart redraw (`utils/printCharts.js`), and require the two to match.
  - **Why:** Chrome fixes the page count before the redraw, so a redrawn chart that is taller than the layout reserved can push content past the counted pages, and it silently disappears.
  - **History:** this was latent in Phase 2 and Phase 3 (main chart 216 to 300px) and was only caught in Phase 4, when nine charts grew at once and Letter lost its last page. Our checks looked for clipping and split cards, never for a missing page.
- **The requirement:** "pwedeng i export lahat ng sama sama": one document with all nine reports, each from a new page, and one CSV with all the tables.
- **The controls: four buttons in the action bar.**
  - Print report (green), **Print all reports**, Export CSV, **Export all CSV**.
  - **Why four visible buttons, not a menu:** a hidden menu becomes a feature nobody finds; four visible buttons are read once and understood.
  - Both new buttons are named for what they do. "Print all reports" opens the print dialog, and its tooltip says Save as PDF is there: it is not a generated file.
  - While either works, its label shows "Preparing N of 9…" and both are disabled.
  - **No timing display was added** (no "Prepared in X s"): the progress counter is the measurement the user watches.
- **Data.** The nine reports are fetched one at a time, never in parallel (the live backend is one worker with 4 threads on a free tier).
  - Order is the tab order: Daily, Monthly, Yearly, Resort, Origin, Purpose, Vehicle, Boat, No-show.
  - Each request carries the applied filters and `include_questions=false`.
  - They go straight to `tourismApi.getReportsData`, so the report loaded on screen and the shared data store are never touched.
  - No new endpoint, no backend change.
- **If a request fails:**
  - nothing after it is fetched;
  - nothing is mounted and `window.print()` is never called (for the CSV, nothing is exported);
  - an alert names the report, e.g. "Could not load Purpose of Travel Report: Server error. Nothing was printed."

  A half-built document cannot reach the print dialog.
- **Rendering the nine charts.**
  - **Where:** a `report-print-all` block inside the Reports page, mounted only after all nine arrive, before Key Insights.
  - **On screen:** it is laid out off-screen (`left: -10000px`) at the report card's width, so every chart gets a real size. Then the print dialog opens with scope "all".
  - **In print:** the block takes the loaded report's place, and each report (`PrintedReport`: title, subtitle, chart, table, in the report's default order) starts a new page. The heading line reads "All reports".
  - **Unmounted on `afterprint`,** which destroys the nine charts.
  - It uses the same card and table markup as the loaded report, so every print rule applies. The Phase 2 redraw resizes all nine to paper and skips the hidden loaded chart.
  - **Cost, measured in headless Chrome, 9 bar charts created and destroyed:**

    | | This machine | CPU throttled 4x |
    |---|---|---|
    | Create, live-size data | 18-25 ms | 104-150 ms |
    | Create, worst case (365-day Daily twice) | 31-40 ms | 154-244 ms |
    | Destroy | under 10 ms | under 10 ms |

    Canvas memory: 11.6 MB at 100% display scaling, 18.1 MB at 125%, 46.3 MB at 200%. It is held only until printing ends.
- **Key Insights once, at the end.** They depend on year, from and to only (`build_tourism_question_answers`), not on the report type or resort, so the already-loaded set is reused, not fetched nine times.
- **Export all CSV.** One file, `tourism-all-reports-<date>.csv`: the nine tables stacked in tab order, each in its default order with its own Total row.
  - The columns are those of the single CSV, with the name column headed "Name", since it holds dates, resorts, origins and so on.
  - "Report Type" labels every row with the report's title.
  - The single-report CSV is unchanged and now shares the row builder.
- **Found and fixed: Chrome dropped the last printed page.**
  - Chrome settles the page count before the print-time chart redraw. The redraw made each report chart's box grow (screen shape 630x213 to 630x300), and content pushed past the last counted page was dropped.
  - With nine reports on Letter it removed the last Key Insights page every time: 13 pages, three cards missing (4 of 4 runs). Without the redraw, all 11 cards were present.
  - The same mechanism applied to the single report (216 to 300px).
  - **Fix:** in print, every report chart box is 300px, the redraw's height (`PRINT_MAIN_CHART_HEIGHT`; the CSS and the constant must stay equal), and the canvas fills it with `object-fit: contain`. The layout is now identical with and without the redraw: same positions, same page count.
  - A chart that was not redrawn (no print events) now sits in proportion in its 300px box, with blank bands above and below, instead of the box shrinking to it.
- **Print proof** (PDF at scale 1, live data All Years, real helper, Public Sans loaded):
  - **Print all reports:** A4 13 pages, Letter 14.
    - A4: p1-2 Daily (chart, table continued), p3 Monthly, p4 Yearly, p5 Resort, p6 Origin, p7 Purpose, p8 Vehicle, p9 Boat, p10 No-show, p11-13 Key Insights (4, 4, 3 cards).
    - Letter: the same, with the Resort table continuing on p6 (header and Total), so No-show is p11 and Key Insights p12-14.
    - With the stress row: A4 14 pages, Letter 14.
    - The same page counts with and without the redraw.
  - **Every report:** title and subtitle printed, chart card 394px and inside its page, canvas 630x300 (A4) / 651x300 (Letter), dead band 0.
    - Table rows per page add up to the layout's row count for all nine. Rows 58px (Total 57.5px), 0 glyphs crossing a column edge.
    - Axis text: rotated x labels 15.0px, level labels 15.0 and 16.0px, so the smallest report-chart text is 15.0px.
  - **Key Insights:** exactly once, 11 cards at 421.4px with 0 spread. Smallest chart text 10.9px (A4; 11.0 in Phase 3, a reference-digit difference) / 10.8px (Letter). Chart-to-answer gap 13.8-14.0 / 14.3-14.4px.
  - **Whole document:** 0 chart pixels in the column gap and 0 outside every box on all pages; 0 of 11 cards split; scale 0.995. Visual check: no chart clipped, pie and doughnut legends below their charts, none overlapping.
  - **Phase 1-3 re-run with the fixed boxes:** Print report 2 pages (stress 2), Key Insights 4, no scope 5, on both papers. Main chart y-axis 16.2px; Key Insights 11.0 / 10.8px; table and card checks as before; layout identical with and without the redraw.
- **Time from the click to the print dialog: an ESTIMATE, not a measurement.**
  - The real path is behind a login, which is not used.
  - Server work for the nine reports, computed by the backend code against the live database from this laptop (read-only): 3.07 s. That is about 300 ms per query from here; most reports take one.
  - An unauthenticated round trip to Render from here: 0.24-0.39 s warm, 1.9 s cold.
  - Chart build: 0.02-0.25 s.
  - Rough total: 3-7 s, depending on how far Render is from the database, which is unknown.
- **Screen** (production 5ed111b against Phase 4, Public Sans loaded, charts drawn, gradient flattened):
  - **1366px:** all four buttons on one line; page height unchanged (3926px). Differing pixels only in the button bar (x 686-1283, y 30-70). The screen heading's text block narrows from 726.8 to 372px at the same height (no wrap). 0 other elements moved.
  - **760px:** the bar wraps to two rows, Print report and Print all reports, then Export CSV and Export all CSV. The header grows 52px, and everything below it moves down exactly 52px (no other size change).
- **Tests.** Frontend `Reports: all nine reports` (7). The print rules are loaded as a plain stylesheet, as in Phase 3.
  - Covered:
    - all nine titles in tab order, each from a new page (`break-before: page`), with its own rows, and the loaded report hidden;
    - nine sequential requests (at most 1 in flight), each `include_questions=false` with the applied year;
    - Key Insights exactly once, after the last report;
    - a failure at Purpose: no print, no block, six requests, the alert text, the button usable again;
    - the block is removed on `afterprint`;
    - the all-tables CSV: headers, every row the right width, 2-10 rows per report (rows plus Total), the nine Totals;
    - Print report and Print Key Insights: scopes "report" and "insights", no fetching.
  - Breaking each one failed its test:
    - (a) no page break between reports;
    - (b) Key Insights hidden in the all scope (0 headings);
    - (c) a failed report skipped instead of stopping (no alert, printed);
    - (d) every CSV row labelled with the loaded report;
    - (e) Print report printing everything ("all" for "report").

    Each was restored byte-identical and passed.
  - Full suites: frontend 472 (30 suites), backend 402. No backend change, no data change, no migration.

## Reports Print Layout: Phase 3, Print One Report (2026-10-10; `tourism/theme-tokens`)
- **The requirement.** Each report must be exportable on its own. Before this change:
  - "Print" printed the loaded report plus all 11 Key Insights cards;
  - "Export PDF" was the same `window.print()` as "Print": two buttons, one behaviour;
  - "Export CSV" already exported the loaded tab's table only.
- **The control now:**
  - **Print report** is green, in the page's action bar. It replaces Print and Export PDF and prints the loaded report only: the print heading, its chart and its table. Its tooltip says it opens the print dialog and that "Save as PDF" there keeps a PDF.
  - **Export CSV** is unchanged.
  - **Print Key Insights** sits in the Key Insights heading row, next to what it prints, and prints the 11 cards only.
- **Why Export PDF was collapsed.** It never made a file: it opened the same print dialog as Print. A print-to-PDF is the browser's dialog, not a generated document, so one honestly named button replaces the two.
- **How the scope works.**
  - `printPart("report" | "insights")` sets `data-print-scope` on `.reports-page` just before `window.print()`. An `afterprint` listener removes it.
  - The rules that act on it are all inside `@media print`, so the screen never depends on it.
  - Key Insights is wrapped in `<section class="report-insights">`, which report scope hides. Insights scope hides `.report-print-area` (chart and table) and the report title in the heading line, which then reads "Key Insights | dates | Year". Printed alone, Key Insights starts under the heading, with no page break.
  - The browser's own print menu, with no scope set, prints the whole page as before: report, then Key Insights from a new page.
  - **Phase 4** ("all reports") is a third scope value with its own button beside Print report. Nothing here needs redesigning for it.
- **With the Phase 2 redraw.** Both use print events, and they do not interfere.
  - The scope is set before `window.print()`, so the print layout is computed with it in place.
  - Phase 2 redraws on the print media change. The hidden part's chart boxes measure 0 wide, so they are skipped: they are neither resized nor recorded, so there is nothing to restore.
  - Measured in report scope: the main chart is redrawn at 630x300, and the 10 hidden Key Insights charts stay at their screen size. In insights scope the reverse holds.
  - Both listeners act on `afterprint` independently.
- **Baseline from 2026-10-10** (live, read-only; replaces the 2026-10-06 figures). SURV-2026-014, arriving 2026-10-07, became a no-show:

  | Year | Visitor tabs (all 8 agree): visitors / male / female / Total Fee | No-show tab |
  |---|---|---|
  | 2026 | 34 / 18 / 16 / PHP 2,576 | 14 / 6 / 8 |
  | 2027 | 4 / 4 / 0 / PHP 304 | 0 |
  | All Years | 38 / 22 / 16 / PHP 2,880 | 14 / 6 / 8 |

  Records: 16 (8 arrived, 6 no-show, 2 pending).
- **Print proof** (PDF at scale 1, A4 and Letter, real helper, live markup; the harness now waits for Public Sans, see below):
  - **Print report: 2 pages.** Page 1 is the heading, the main chart and the table header with 5 rows (A4) or 4 (Letter). Page 2 is the repeated header with 2 (A4) or 3 (Letter) rows and Total.
    - With the stress row: 5+3 rows (A4), 4+4 (Letter), still 2 pages.
    - Key Insights card titles in the PDF: 0. "Key Insights": 0. "Table Data Breakdown": 1.
    - The report's name, "Visitors by Resorts", appears twice: in the heading line and as the chart card's title. That is one report, named as before.
  - **Print Key Insights: 4 pages** (2, 4, 4, 1 cards). Page 1 is the heading, the Key Insights heading and one row; a second row would overrun by 45.8px (A4) or 112.3px (Letter), so it is left as is. All 11 card titles print; "Table Data Breakdown" 0; "Visitors by Resorts" 0.
  - **No scope (browser menu): 5 pages,** as in the previous entry.
  - **Measurements, both papers:**
    - main chart x-axis text 15.0px and y-axis text 16.2px, drawn at 630x300 (A4) / 651x300 (Letter), dead band 0;
    - smallest chart text 11.0px (A4), 10.8px (Letter);
    - chart-to-answer gap, each of 9 chart cards: 13.8-14.0px (A4), 14.3-14.4px (Letter);
    - 0 chart pixels in the column gap or outside any card;
    - cards split across pages: 0 of 11, cards 421.4px with 0px spread;
    - nothing shrunk: scale 0.995;
    - table rows 58px (Total 57.5px), 0 glyphs crossing a column edge, stress row included, header repeated on page 2.
  - **Gauge and centred cards:** the gauge sweeps 180.05 degrees at the page's 50.0% and 190.05 degrees at 52.8%. Centred cards, ink to answer box: Peak Season 106/103px, Average Length of Stay 113/110px (A4) and 124/121px (Letter).
  - **Without the print events:** report 2 pages, Key Insights 4 pages, 0 split, 0 pixels outside.
- **Screen.** Production markup and CSS against the new ones, with charts drawn, the page gradient flattened and Public Sans loaded:
  - **At 1366px:** the page height is unchanged (3926px). All differing pixels are in two places: the action buttons (x 934-1336, y 30-70) and the new button at the right of the Key Insights heading (x 1154-1336). Everything between and below is pixel-identical.
    - Moved elements: only the screen heading's text block, which is wider because the action bar is narrower (619.7 to 726.8px, same height), and the buttons.
    - The bar now shows two buttons, a green "Print report" and an outlined "Export CSV" (it showed "Print", "Export CSV" and a green "Export PDF"). "Print Key Insights" is an outlined button at the right end of the Key Insights heading row.
  - **At 760px:** the action bar still fits on one row. In the Key Insights heading, "Print Key Insights" wraps under the subtitle, so the section and everything after it moves down 52px. Nothing else moved.
  - With all three buttons in the action bar, as first built, they needed 489px of the 440px header at 760px and wrapped there. Moving Print Key Insights to its section avoids that.
- **Tests.** Frontend `Reports printing one part` (5). jsdom does not apply `@media print`, so the tests load the real tourism print rules as a plain stylesheet and read visibility from computed styles:
  - (a) Print report: scope "report", one report section ("Visitors by Resorts"), one table, no Key Insights titles or heading, heading line names the report;
  - (b) the scope is cleared on `afterprint`;
  - (c) the CSV is unchanged: the existing columns/order/rows test, plus a check that the file is identical before and after both scoped prints;
  - (d) Print Key Insights: 11 cards, its heading, no report chart or table, heading line "Key Insights";
  - plus the buttons: Print report and Export CSV in the bar, no Export PDF, Print Key Insights in the Key Insights heading.
  - Breaking each one failed its test: (a) report scope no longer hiding Key Insights showed all 11 titles; (b) the listener on another event left "report" set; (c) Male and Female swapped in the CSV header; (d) insights scope no longer hiding the report printed "Visitors by Resorts". Each was restored byte-identical and passed.
  - Full suites: frontend 465 (30 suites), backend 402. No backend change, no data change, no migration.
- **Harness notes.** The stylesheet loads Public Sans from Google Fonts. One print run (and one screen run) had used a fallback font before it loaded: Segoe UI Black for the heading, heading CSS width 241.8 instead of 232.8px, table digits 10.18 instead of 10.26px. The print and screen harnesses now refuse to measure until Public Sans has loaded, and every figure above was taken that way.
- **Open item, NOT fixed (queued):** the no-show sweep (`services/no_show.py`) uses a bulk `UPDATE`, which does not touch `TouristRecord.updated_at` (`auto_now` only fires on `save()`), so nothing records when a booking became a no-show.
  - SURV-2026-014 flipped between 2026-10-08 00:00 and 2026-10-10 20:01 Manila time, and still shows `updated_at` 2026-10-04 14:23:48.
  - A bulk update that leaves `updated_at` alone is also how we know the sweep did it and not a staff edit.

## Key Insights: Badges Removed, Demographics Drawn, Clean Page, True Gauge (2026-10-06; `tourism/theme-tokens`)
- **Chart-type badges removed** from all 11 Key Insights cards, together with `getVisualLabel` and the `.analytics-question-top` CSS that only they used.
  - **Why.** The badge named something the reader can already see and carried no data. Because `getVisualLabel` keyed on the card's id rather than on what is drawn, it had drifted wrong on 4 of 11 cards on a printed report:
    - "Pie Chart" on Top Tourist Destination, which draws a horizontal bar chart;
    - "Pie Chart" on Top Destination for Overnight Stays, which draws a horizontal bar chart;
    - "Doughnut Chart" on Top Visitor Origins, which draws a horizontal bar chart;
    - "Polar Area" on Primary Purpose of Travel, which draws a horizontal bar chart.
  - Two more labels were vague ("Comparison Chart" on vertical bar charts).
  - The badge row took 42.5px of every card: a 28.5px badge plus the 14px gap.
- **Visitor Demographics drew nothing.**
  - **Cause.** The backend sent `{"type": "split", "left": {...}, "right": {...}}` (`services/tourism.py`), while the frontend doughnut reads `visual.items`. It got an empty list.
  - **Fix, in the backend.** It now sends `items`: Domestic (Filipino), then Foreign (International). That is the shape the Same Day card already uses, so there is still one shape.
  - Nothing read `left`/`right`: not the web app, not the mobile app, not any test. The other 10 cards already sent the shape the frontend reads.
  - **Live, read-only:**

    | Year | Answer | Doughnut slices |
    |---|---|---|
    | 2026 | Domestic 28, Foreign 8 | 28 / 8 |
    | 2027 | Domestic 3, Foreign 1 | 3 / 1 |
    | All Years | Domestic 31, Foreign 9 | 31 / 9 |

  - The other 10 answers and visuals are byte-identical before and after, for all three years.
- **Key Insights starts on a new page in print** (`break-before: page` on the section heading). Its 36px screen top margin is 0 in print. Kept, that margin pushed the second row off a Letter page: the heading plus two rows came to 992.8px against 980.4px of page.
  - The chart boxes keep Phase 2's 210px minimum, so the cards shrink by the badge row: 463.9px to 421.4px.
  - **Why 210px, not 252px.** Giving the badge's 42.5px to the chart boxes (252px) produced no measurable gain. The smallest chart text stayed 11px either way, because Chart.js does not scale text with the box. And it cost a whole page: 6 pages on A4 and Letter, against 5.
- **Peak Season gauge.**
  - The arc has flat line ends. Round ends painted half the stroke width past each end of the dash, 6.03 degrees at each end. At 52.8% the ring swept 202.2 degrees instead of 190.1, about 56%.
  - Measured on the component's own SVG: 190.05 degrees at 52.8%. On the page's All Years figure, 47.5%, it is 171.15 degrees against 171.0. The share fallback gauge uses the same ring and was fixed the same way.
  - **Print only:** the Peak Season and Average Length of Stay figures are centred between title and answer, instead of the whole space falling between figure and answer.
- **Print proof** (PDF at scale 1, A4 and Letter, real helper, live markup):

  | Page | A4 | Letter |
  |---|---|---|
  | 1 | main chart, table header and 5 rows | main chart, table header and 4 rows |
  | 2 | header, 2 rows and Total | header, 3 rows and Total |
  | 3 | Key Insights heading and cards 1-4 | Key Insights heading and cards 1-4 |
  | 4 | cards 5-8 | cards 5-8 |
  | 5 | cards 9-11 | cards 9-11 |

  - 5 pages on both papers. With the stress row, page 2 holds 3 (A4) or 4 (Letter) rows.
  - Space left under the second row on page 3: 90.6px (A4), 24.0px (Letter).
  - Main chart x-axis text 15.0px and y-axis text 16.2px.
  - Smallest chart text: 11.0px (A4), 10.8px (Letter).
  - Chart-to-answer gap, each of the 9 chart cards: 13.8-14.0px (A4), 14.3-14.4px (Letter).
  - Chart pixels in the column gap, and outside every card: 0.
  - Cards split across pages: 0 of 11. Card heights 421.4px, 0px spread per page.
  - Nothing shrunk: scale 0.995 (16.41pt). Screen heading absent.
  - Table rows 58px (Total 57.5px). 0 glyphs cross a column edge, including the stress row, whose longest name stays on 1 line. The header repeats on page 2.
  - Main chart dead band: 0.
  - Centred cards, ink to answer box: Peak Season 105px above, 103px below. Average Length of Stay 114/109px (A4) and 123/121px (Letter). Before, Average Length of Stay was 41px above and 180px below.
  - **Without the print events:** still 5 pages, 0 cards split, 0 pixels in the gap or outside a card.
- **Screen.**
  - The page is 255px shorter (6 rows x 42.5px), with 22 fewer elements (11 badge rows and their badges).
  - Everything above the first Key Insights card is pixel-identical, and 0 of its 128 elements moved.
  - Inside Key Insights nothing moved sideways. Each card is 42.5px shorter, and its contents sit 42.5px higher in it. Card tops move up 0 to 212.5px, row by row.
  - The gauge ends are now flat. The centring is print only.
  - Measured with the page background gradient flattened in both runs. The gradient spans the page height, so a shorter page shifts the background colour behind every glyph.
- **Tests.** Each one failed when broken, then passed after a byte-identical restore:
  - (a) no chart-type badge on any card: re-adding one failed;
  - (b) Demographics slices equal its answer's numbers: restoring `left`/`right` failed in the backend, and reading another field failed in the frontend;
  - (c) gauge sweep computed from the arc's attributes is 190.08 degrees at 52.8%: round ends failed (202.14);
  - (d) the other 10 cards unchanged: a changed Same Day label failed in the backend, and vertical ranking bars failed in the frontend.
  - Frontend: 460 tests, 30 suites, all passed. Backend: 402 tests, all passed, on a clean checkout (see "Backend suite and stray local scripts" below).
- **Open items, NOT fixed:**
  1. **Sanitation's gauge** (`sanitation/components/SanitaryVisualAnswer.js`) has the same round line ends (`strokeLinecap="round"`), so its ring overstates its own percentage, by about 6 degrees at each end on our ring's proportions. Sanitation is out of scope for Tourism; noted so its owner can be told.
- **Backend suite and stray local scripts.** In the development checkout the full backend run had one failure: `CommunityReportConcurrentSubmitTests.test_concurrent_duplicates_create_exactly_one_row` (Sanitation). It passes alone.
  - In the failing run its two threads got a 500, `no such table: api_sanitarycomplaint`: they posted through their own database connections and saw an empty in-memory SQLite test database.
  - It is NOT pre-existing on `main`, and our tests did NOT expose it. A clean worktree of `510273a` (no changed files, no new tests) passes in full: "Ran 400 tests ... OK".
  - The same clean checkout fails once two untracked, git-ignored scripts from the development checkout are added: `backend/test_func2.py` and `backend/test_reports.py`. Their names match the test runner's `test*.py` discovery. Both call `django.setup()` and query the database when imported, during discovery, before the test database exists. Result: "Ran 400 tests ... FAILED (failures=1)", the same test.
  - This change in a clean worktree: "Ran 402 tests ... OK".
  - The two scripts are local, not in git. They were renamed to `backend/scratch_func2.py` and `backend/scratch_reports.py`, so discovery no longer imports them. The development checkout then gives the same result as the clean one: "Ran 402 tests ... OK".
  - There is no known failing test.
- **Test gate:** both suites fully green.
- **Correction to the Phase 2 screen check.** The screen-diff harness built its Chart.js path with "/" from a Windows path, so the charts never loaded and the earlier screen comparisons, Phase 2's included, ran without charts. Re-run with the charts drawn, Phase 2 against production: 0 differing pixels, 0 of 218 element boxes moved, at 1366px and 760px. The Phase 2 result stands.

## Reports Print Layout: Phase 2, Charts Drawn for Paper (2026-10-06; `tourism/theme-tokens`)
- **Print events (measured, Chrome 154 and Edge 154).** `beforeprint` fires while the page still has its screen layout (main chart box 991x340). The `matchMedia('print')` change to true fires after it, with the page laid out for paper (A4: main card 630px wide, Key Insights card 327x464). `afterprint` and the change back to false follow. So the redraw runs on the print media change, and `afterprint` (or the change back) restores. `beforeprint` is not used for sizing. Firefox is not installed here: untested.
- **Fix (`utils/printCharts.js`, wired once in `AnalyticsAndReport.js`).** While printing, every chart on the Reports page is redrawn at its printed box size: the main chart at its card width x 300px, and each Key Insights chart at its box. Pie and doughnut legends (Same Day vs. Overnight: pie; Visitor Demographics and Data Quality: doughnuts) move below the chart. A fixed bar thickness is lifted, so the resort chart's 80px bars fit 7 resorts at 630px. Long labels on the horizontal ranking charts wrap to two lines: at 277px, Chart.js gives the label axis about half the width, which cut "Dona Choleng Camping Resort" to "Choleng Camping Resort". Everything is put back after printing (measured: 991x340 and 456.5x150-216, legends right again). The four Key Insights chart boxes now carry `className="insight-chart-box"`, replacing the `div[style*="height"]` print selector. In print they fill their card (`flex: 1 1 210px`, min 210px, no bottom margin). At 210px the tallest card is 464px, so two rows (946px) fit Letter (979px) and A4 (1047px). The Phase 1 `canvas` scale-down stays as the safety net.
- **No extra pixel ratio.** Chrome and Edge print a canvas redrawn during print as vector shapes and text. Printing at `devicePixelRatio` 2 and 1 gave the same PDF objects, apart from sub-pixel edges, so no ratio setting was added.
- **Proof (PDF at scale 1, A4 and Letter, real helper, live markup).** All values are measured from the PDF:
  - Main chart: x ticks 15.0px (rotated; font size relative to the table's 14px text); y ticks 16.2px; drawn at 630x300 (A4) and 651x300 (Letter); dead band 0.
  - Smallest Key Insights chart text: 11.0px (A4) and 10.8px (Letter); configured 11px.
  - Chart-to-answer white space for each of the 9 chart cards: 13.8-14.0px (A4) and 14.3-14.4px (Letter), i.e. the card's 14px gap (before: 113.7-156.5px).
  - Chart pixels in the column gap: 0. Outside every card: 0.
  - No label clipped, checked visually.
  - Phase 1 and 1b re-run: scale 0.995 (16.41pt); 0 of 11 cards split; screen heading absent; card heights 463.9px with 0px spread per page; 5 pages on both papers; table rows 58px (spread 0.5px); 0 cell glyphs crossing a column edge; the stress row's longest name on 1 line; the table header repeats on page 2.
- **Non-chart cards (reported, not changed).** Peak Season's gauge leaves 160.8px above its answer. Average Length of Stay's figure leaves 174.9px (A4) and 195.8px (Letter).
- **If the print events do not fire.** Charts print at their screen size, scaled down by the Phase 1 rule. Key Insights text goes from 11px to about 6.7px, main ticks from 15px to about 9.5px, legends stay on the right, and the chart-to-answer space is 113.7-156.5px. Layout still holds: 0 pixels in the gap or outside any card, 0 cards split.
- **Screen unchanged.** Production markup and CSS against Phase 2 markup, CSS and helper: 0 differing pixels and 0 of 218 element boxes moved, at 1366px and 760px.
- **Tests.** `printCharts.test.js` (6) covers:
  - redraw at box size, and only charts inside the page;
  - pie legend below;
  - restore on `afterprint`;
  - bar thickness and label wrap applied and restored;
  - wrapping only past one line;
  - nothing on screen.
  Raising the wrap limit failed 2 tests; restored byte-identical, all passed. Full frontend suite: 456 tests, 30 suites. No backend file and no data touched.
- **Still owed.** Wrong chart-type labels ("Pie Chart" on bar charts, "Doughnut Chart" on the origins bar, "Polar Area" on the purpose bar), and Visitor Demographics drawing nothing although its answer gives Domestic and Foreign counts. Phases 3 and 4 as listed below.

## Reports Print Layout: Phase 1, CSS (2026-10-06; `tourism/theme-tokens`)
- **Cause (audited).** Chart.js 4.5.1 resizes charts only through a ResizeObserver; printing does not trigger it and nothing on the page listens for `beforeprint`, so every chart keeps its on-screen pixel width when printed (975px main chart, 448.5px Key Insights charts at a 1366px window). Under print layout at A4 width that is a 991px chart in a 656px card and 457px charts in 319px cards. Depending on the browser and its print scale this either clips the charts (the main chart then shows about 5 of its 7 bars) or makes the browser shrink the whole page (measured 0.69-0.71 in Chrome). The overflowing Same Day pie, whose legend is drawn inside its canvas, painted over its right-hand neighbour. No `break-inside` rule existed, so cards split across pages. Print and Export PDF both call `window.print()` and print the loaded report plus all 11 Key Insights cards; the CSV is the loaded tab's table only.
- **Phase 1 fix (print-only CSS, scoped to `.reports-page`, in `Tourism_index.css`'s print block):** the screen heading is hidden (the print heading stays); the chart card and every Key Insights card get `break-inside: avoid` and `overflow: hidden`; the table header repeats (`thead { display: table-header-group }`) and rows stay whole; `canvas { max-width: 100% !important; height: auto !important }` scales an unresized chart into its box; the Key Insights grid gets `grid-auto-rows: 1fr`, and every chart box (the card's children with an inline height) gets one height, 180px. No markup change: a print rule with `!important` beats the inline heights.
- **Proof (measured from PDFs printed at scale 1, A4 and Letter, charts frozen at their 1366px screen size as a real print leaves them).** Heading "Tourism Office Report" prints at 0.995 of its CSS width, 16.41pt (expected 16.5pt), so nothing is shrunk; before the fix it printed at 0.69 (A4) / 0.71 (Letter), 11.4-11.7pt. Cards whose title and answer land on different pages: 0 of 11 on both (before: 3 of 11 on Letter). Chart images outside their card: 0 (before: 1). Chart-coloured pixels in the 19px column gap: 0; outside every card: 0 (before: 137 / 42,331). Key Insights card heights per page: 442-443px, 0px spread. Screen heading in the PDF: absent (before: present). The live Resort table continues from page 1 to page 2 on both papers and its header repeats on page 2. The main chart prints 630px (A4) / 651px (Letter) wide, so its tick labels shrink from 15/16px to about 9.5-10.0 / 10.2-10.7px.
- **Screen unchanged.** Same markup and charts with the old and new stylesheet in screen media: 0 differing pixels and 0 of 218 element boxes moved, at 1366px and 760px.
- **Margins** come from Sanitation's global `@page { margin: 10mm; size: auto }` (`Sanitation_index.css`), not changed.
- **Not verifiable headless:** an interactive print from a user's own browser and print-scale setting (headless printing resized or shrank where a real print clipped); that check remains for the user.
- **Phase 1b (print-only CSS, same block).** Printing at true scale exposed two side effects, now fixed. (1) The table's screen column widths (110 / 110 / 156 / 130 = 506px) left the name about 124px on A4, so "Villa Escaparde Camping and Beach Resort" wrapped to 4 lines and rows were 79 or 121px tall. Measured at the print font (14px): the name needs 291.7px; Male, Female and "Visitors" 33.8 / 48.7 / 52.8px in bold; a nine-digit fee 93.7px. On paper the sort arrows are hidden, cells get 8px of side padding, headers may wrap (sortable headers are `nowrap` on screen, which first let "Total Visitors" run into the Total Fee header; the column-edge check caught it), and the figure columns are 58 / 66 / 70 / 112px = 306px, leaving the name 323px on A4 and 344px on Letter; the print `min-width` is 614px (306 + 308). (2) The 340px chart area now takes the printed chart's height (216px A4, 223px Letter): the dead band under the main chart went from 123.5px to 0.
- **Phase 1b proof (PDF at scale 1, A4 and Letter, live markup plus a static layout-stress row with the longest name, five-digit counts and a PHP 123,456,789 fee).** The longest name occupies 1 line (before: 4); every table row is 58px, spread 0px (before: 79-121px, spread 42px); cell text crossing a column edge: 0; dead band: 0. The seven Phase 1 checks re-run and still pass (scale 0.995 / 16.41pt, 0 of 11 cards split, screen heading absent, card heights 442-443px with 0px spread per page, 0 chart images outside their card, 0 chart pixels in the gap or outside every card, table header repeated on page 2). On screen: 0 differing pixels, 0 of 218 element boxes moved, at 1366px and 760px.
- **Still owed.** Phase 2: redraw charts at the paper size on `beforeprint`/`afterprint` (sharp, readable ticks), legends below pies and doughnuts in print, and a real className on the four Key Insights chart boxes in place of the `div[style*="height"]` selector (keying print layout on inline style text would break silently). Phase 3: print only the loaded report, and an honest label for Export PDF (identical to Print today). Phase 4: Export All (9 reports, each on its own page, Key Insights once at the end) and an all-tables CSV. Noted separately: wrong chart-type labels (Pie Chart / Doughnut Chart / Polar Area on bar charts) and the empty Visitor Demographics chart.

## Reports Money Column: "Total Fee" (2026-10-06; `tourism/theme-tokens`)
- **Renamed from "Expected Entrance Fee" to "Total Fee"**: the table header, its sort tooltip and the CSV header on the Reports page. Display only: the `revenue` field is unchanged in the API payload, the row objects and the backend; the Dashboard's "Total Revenue Collected" is a separate open item and unchanged. The subtitles still say the figures come from arrived and pending bookings (no-shows excluded), which is where the column's honesty now lives.
- **Widths.** "Total Fee" needs 107px with the bold header and sort arrow; the widest figure, a nine-digit fee (PHP 123,456,789), needs 118px. The column goes from 200px (sized for "Expected Entrance Fee", 198px) to 130px, and the table's minimum width from 900px to 830px (506px of fixed columns plus 324px for the longest resort name).

## Public Mobile Tourism Privacy: Phase 1 and 1b (2026-10-06; `tourism/theme-tokens`)
- **The finding.** `/api/mobile/tourism/bootstrap/` is public (`AllowAny`; the app loads it at start-up, before login, with no credential). Its `notifications` carried the full name, survey ID and resort of the 4 most recent arrived visitors to anyone, and the app showed them to every user. `?reference=` (exact, case-insensitive survey ID) or `?contact=` (partial match, one digit was enough) returned any arrived visitor's name, survey ID and resort, so the list could be enumerated. Confirmed live on 2026-10-05.
- **Phase 1, removed.** `build_mobile_notifications` no longer reads any tourist record and no longer takes the request: the `?reference=` block, the `?contact=` block and the 4-most-recent block are deleted, and the parameters are no longer read at all (not merely ignored). Public advisories and the trending-destination item are unchanged. Any parameter combination returns the same body.
- **Why deleted, not hardened.** No version of the mobile app ever sent `contact` or `reference` (checked through git history), and the web app never calls this endpoint, so no client used the lookup. Hardening it to an exact survey ID plus an exact contact number would still allow targeted confirmation: survey IDs are sequential (`SURV-2026-001`, `-002`, ...), so anyone holding a person's number could try every ID and learn whether, where and when that person booked; and returning the name tells the real visitor nothing they do not know.
- **Phase 1b.** The public destination detail's `recentFeedback` shows the reviewer's initials ("Juan Dela Cruz" -> "J.D.C."); a name with no letters, and the app's own anonymous default, show "Mobile Tourist". Photos are kept. Staff still see the typed name through `/api/feedback/` (login required).
- **Installed apps.** No APK change needed: the app parses `notifications` with `parseList` (a missing key or non-list is `[]`; an empty list shows "No new advisories"), and `reviewer` is a plain string byline. The Notifications page now shows advisories and the trending item only. The LGU web app is unchanged (it never calls these endpoints).
- **Tests.** Backend `PublicMobileTourismPrivacyTests` (5): no survey ID or tourist name in the public bootstrap; `?contact=9`, a full real number, an upper- and lowercase `?reference=` and both together give a body identical to no parameters; `notifications` is always a list with no approval items; review bylines are initials and the no-letters cases are "Mobile Tourist"; `/api/feedback/` (login required) keeps the full name. Putting back the recent-visitor list, a partial contact lookup, a non-list `notifications`, the typed name in the helper or the endpoint, and initials on the staff endpoint each failed its test; restored byte-identical, all passed. A temporary Flutter check (not committed) rendered the Notifications page with only the trending item and with a missing or empty key, and parsed an initials byline with photos. Full suites: backend 396, frontend 448 (29 suites), Flutter 219.
- **Verified against live data (read-only, local code).** No parameters, `?contact=9` and `?reference=SURV-2026-001` return identical bodies with one notification (the trending destination), no `SURV-` and none of the visitors' names; destination 4's reviews read "K." and "T.A." with their photos. Records unchanged.
- **Open items, NOT fixed:** (1) Phase 2: the review form should tell reviewers that their initials and photos are public (needs an APK); (2) review moderation: `FeedbackEntry.status` is a sentiment, not a moderation state, so there is no way to hold a review back; (3) an authenticated "your registration was approved" history for tourist accounts, if wanted, built on the logged-in tourist endpoints rather than a public lookup.

## Deployed: Reports Batch (main `2b5527b`, 2026-10-06)
- **One deploy window.** `main` fast-forwarded from `9a252b3` to `2b5527b` and pushed once (00:07:41). Four commits: `f377197` Yearly Report tab; `29bae74` year filters from the data on Reports, Dashboard, Arrival Monitoring and Booking Management, malformed years and unknown report types rejected with a 400, subtitles say "arrived and pending bookings (no-shows excluded)"; `abe6dea` the booking import's fixed 2024-2026 window replaced by a window relative to today (10 years back, 2 ahead), `import_tourism_excel --year` required; `2b5527b` Boat Report tab. No migration (latest still `0049`).
- **Verified from outside.** The live frontend bundle changed from `main.1f1e5e26.js` to `main.2573b93c.js` (00:08:46); it contains "Yearly Report", "Boat Report", the new subtitles and the data-driven year list, and no hardcoded 2024/2025 options or "based on arrived tourist records". `/api/reports/` and `/api/bootstrap/` return 401 without a login; `/api/health/` 200 throughout. `/api/bootstrap/` needs a login, so its `reportingYears` could not be read from outside: the backend switch is to be confirmed by a logged-in check that the year dropdown offers 2027 (not done here; no login).
- **Final live figures (deployed code, read-only).** Years offered: 2027, 2026, All Years. Visitors / male / female / Expected Entrance Fee, the same on all 8 visitor tabs (Daily, Monthly, Yearly, Resort, Origin, Purpose, Vehicle, Boat): 2026 36 / 19 / 17 / PHP 2,736; 2027 4 / 4 / 0 / PHP 304; All Years 40 / 23 / 17 / PHP 3,040. No-show tab: 2026 12 / 5 / 7; 2027 0; All Years 12 / 5 / 7. Boat totals equal Daily totals for every year. The 16 records were identical before and after the deploy.

## Reports: Boat Report Tab (2026-10-05; `tourism/theme-tokens`)
- **A 9th tab, "Boat Report", right after Vehicle Report.** It groups by boat type name (live: Tourist Boat, Passenger Boat) in one grouped query, exactly like the Vehicle tab, counts the same records as every visitor tab (everything except no-show), and has the same columns: Boat Type · Male · Female · Total Visitors · Expected Entrance Fee, plus the Total row; the CSV matches. Default sort: most visitors first. Subtitle: "Visitor totals by boat type from arrived and pending bookings (no-shows excluded)". The Vehicle tab is unchanged.
- **No boat type.** `TouristRecord.boat_type` is a required foreign key (NOT NULL in the database, required on the web form, the mobile app and the Excel import), and no live record lacks one, so every record has a boat type and the Boat Report's total always equals the other visitor tabs' total for the same filter. The tab still labels a missing boat type "Not specified" rather than dropping it, should the field ever become optional.
- **Live (read-only).** 2026: Passenger Boat 20 visitors (12 male, 8 female), PHP 1,520; Tourist Boat 16 (7, 9), PHP 1,216; total 36 / 19 / 17 / PHP 2,736, equal to the Daily tab. 2027: Tourist Boat 4 (4, 0), PHP 304. All Years: Passenger Boat 20, PHP 1,520; Tourist Boat 20, PHP 1,520; total 40 / PHP 3,040. One query. The 8 existing tabs' payloads for 2026, 2027 and All Years are byte-identical to before.
- **Tab bar with 9 tabs (measured, not changed).** The buttons need about 1,397px for one row. With the 260px sidebar and 30px content padding that is a viewport of about 1,735px or wider; below it the bar wraps to two rows: at 1,280px "Daily…Origin" / "Purpose…No-show", at 1,366px "Daily…Purpose" / "Vehicle, Boat, No-show", at 1,440-1,536px only "Boat, No-show" on row two, at 1,600-1,720px only "No-show". Nothing is clipped or unreachable at any width and the page does not scroll sideways. Whether to group the tabs is a separate decision.
- **Tests.** Backend: one row per boat type with its fee, the boat total equals the daily total for 2026, 2027 and All Years, the query count (1), and the Vehicle tab unchanged (the fixture now gives one travel mode two boat types, so a Vehicle grouping that split by boat would fail). Frontend (4): placement after Vehicle, the columns, subtitle and CSV, the imbalance guard, and the Vehicle tab unchanged. Breaking each failed its test; restored byte-identical, all passed. Full suites: backend 391, frontend 448 (29 suites).
- **Open item, NOT fixed:** `ResortMonthlyArrival.year` defaults to 2025 (`models.py`). No writer relies on it today (the monitoring import always passes `--year`, now required), but a wrong default is a latent data bug: any future code that creates a row without a year would file it under 2025. Changing it needs a migration.

## Hardcoded Year Range Gone Everywhere (2026-10-05; `tourism/theme-tokens`)
- **Where a fixed year range or list was, and what happened to each.** Real constraints, now fixed: (1) `TOURISM_REPORTING_YEAR_CHOICES` and `DEFAULT_TOURISM_REPORTING_YEAR` in `services/tourism.py` and the four `reportingYearOptions` dropdowns (Reports, Dashboard, Arrival Monitoring, Booking Management), fixed in the previous section; (2) the Excel booking import's `ONLINE_BOOKING_ARRIVAL_YEARS = {2024, 2025, 2026}` (`services/online_booking.py`), which from 2027-01-01 would have rejected every 2027 booking (and already rejects SURV-2026-011's arrival year today); (3) `import_tourism_excel --year`, which defaulted to 2025, so running it without `--year` on another year's monitoring workbook would have filed it as 2025.
- **The import window is now relative to today.** An imported arrival date must fall from 10 years before to 2 years after the current year (2016 to 2028 today), computed on every import from `timezone.localdate()`; no year is written down. The bound only catches typo years (1926, 2206); it allows old registrations and advance bookings (the app books up to a year ahead). Message on a rejected row, before: "arrival_date: Must be a 2024, 2025, or 2026 online booking arrival date." After (today): "arrival_date: Must be an arrival date from 2016 to 2028." A date that cannot be read at all is still reported as a missing arrival date, unchanged. `import_tourism_excel` now requires `--year`.
- **Left alone, not constraints:** the sanitary permit import's 2025 file paths and its 2025-12-31 expiry (a one-off import of the 2025 permit files; the expiry is a fact of those files); `ResortMonthlyArrival.year` default 2025 (its only writer, the monitoring import, always passes the year, and changing a model default needs a migration); `normalize_arrival_date_year` (a typo rule: 1-999 becomes 20xx, 29xx becomes 20xx; correct until 2100); ID prefixes and placeholders ("SURV-2026-", "SP-2026-001", "TR-2026...", mobile display fallbacks such as '2026-08-20'); the dead `frontend/src/tourism/data/mockTourismData.js` (nothing imports it); `backend/mock_scripts/` (manual seeding scripts); seed data and migration data (historical records); `tzdata==2026.2` (a package version); and test fixtures. Every date picker and form bound already moves with today (mobile arrival picker today to +365 days, web booking form from today, complaint scheduling, sanitation inspection dates). Survey IDs take the current year (`generate_survey_id`) and imported IDs the arrival year.
- **A rejected year reads as a message, not a blank page.** The five report endpoints answer a malformed year with 400 `{"detail": ...}`; `shared/apiClient.js` turns `detail` into the error message, and each page shows it in its error line (Reports, Dashboard and Arrival Monitoring via `error.message`, Booking Management via its `getErrorMessage`, which reads `details.detail`). A test drives the real request path (fetch, apiClient, tourismApi, the page) and checks the message text, not the raw JSON. The dropdowns only send listed years, so a user only meets this from a hand-made URL.
- **Tests.** Backend (4): a 2027 import row is accepted and saved; 10 years back and 2 ahead are accepted and the same years are rejected once today moves 20 years on; an absurd year (11 back, 3 ahead, 1926, 2206) is rejected with the exact message; the monitoring import refuses to run without `--year`. Frontend (1): the readable 400. Breaking each (the old year set, no bound, a literal year in the window, a 2025 default, an API client that drops `detail`) failed its test; restored byte-identical, all passed. Full suites: backend 388, frontend 444 (29 suites). Live figures unchanged: 2026 is 36 / 19 / 17 / PHP 2,736, 2027 is 4 / 4 / 0 / PHP 304, All Years 40 / 23 / 17 / PHP 3,040.

## Reports: Yearly Report Tab (2026-10-05; `tourism/theme-tokens`)
- **An 8th tab, "Yearly Report", next to Monthly Report.** It groups by the year of `arrival_date` (row label "2026"), counts the same records as every visitor tab (everything except no-show, so pending is included), and has the same columns: Year · Male · Female · Total Visitors · Expected Entrance Fee, plus the Total row. One grouped query (`ExtractYear`), like Daily; query count 1. Before this, `type=yearly` fell through to the Resort branch (2 queries, resort rows).
- **The year filter applies unchanged.** All Years gives one row per year present; a single year gives one row. Only the selectable years (2024, 2025, 2026: `TOURISM_REPORTING_YEAR_CHOICES`) filter; any other value falls back to the current year, as on every tab, so 2027 records appear only under All Years.
- **Date order.** "yearly" joined `DATE_ROW_TYPES`: the tab opens earliest year first and the first column sorts by the row id. The backend sends the year as a number, so it is compared as a number, never as text.
- **Live (read-only), All Years:** 2026 is 19 male, 17 female, 36 visitors, PHP 2,736; 2027 is SURV-2026-011 alone: 4 male, 0 female, 4 visitors (1 discounted), PHP 304. Total 40 visitors, PHP 3,040. With 2026 selected: one row, 36 visitors, PHP 2,736. The 7 existing tab payloads are identical to before for 2026 and All Years.
- **Layout.** No CSS change: every header fits on one line, no cell overflows, all rows 58px, on all 8 tabs. The tab bar (`.report-tabs`, wrapping flex) now needs about 1,185px for one row instead of 1,044px; at a typical laptop width it already wrapped to two rows with 7 tabs and still does.
- **Tests.** Backend: the yearly tab's rows per year with a second-year pending booking (fee and discount included) and a balanced Total; the year filter; the query count (yearly joined the per-tab count, balance and male/female tests). Frontend (5): the tab sits next to Monthly, the columns and CSV, year order and header sorting, numeric (not text) sorting, and the imbalance guard. Breaking each (arrived-only, an extra query, ignoring the filter, the wrong first-column label, Yearly left out of date order, the year compared as text) failed its test; restored byte-identical, all passed. Full suites: backend 375, frontend 437 (28 suites).
- **Open item, NOT fixed:** the subtitles of Daily, Monthly, Yearly and Resort say "based on arrived tourist records", but those tabs also count pending bookings.

## Reports: Table Data Breakdown (2026-10-05; `tourism/theme-tokens`)
- **Avg / Visitor is gone** from the table (header, cells, Total row) and from the CSV (header, rows, Total row). The backend still sends `avg` on each row and in `totals`; nothing displays it.
- **The Sort Table dropdown and the Desc toggle are gone**, with their `.tourism-layout .report-sort-*` rules (Sanitation's own unscoped copies are untouched). Sorting is by the column headers, which always used the same state. A sort picked in a header now belongs to the report type it was picked on; a newly loaded type starts on its own default.
- **Male and Female are reported before Total Visitors**, so a row reads as a sum: Name · Male · Female · Total Visitors · Total Revenue, in the table and in the CSV. Every tab (Daily, Monthly, Resort, Origin, Purpose, Vehicle, No-show) sums `total_male` and `total_female` in the query that already sums the visitors, so the query count is unchanged (1 per tab, 2 for Resort; pinned by a test). The Total row shows the backend totals in the same order.
- **Imbalance guard.** On live data (16 records) every record has Male + Female = Total Visitors; the rule is enforced on every write path (serializer, Excel import, model `clean()`) but not by the database. If a row ever does not add up, the page shows the stored numbers unchanged, marks the row, and adds a note under the table ("N rows: Male + Female does not equal Total Visitors; check these records."). It never adjusts or hides a figure.
- **Daily and Monthly default to date order**, earliest first, and their first column sorts by the ISO date in the row id, not alphabetically by the label ("Aug", "Oct", "Sep"). Every other tab still starts with the most visitors first. The CSV follows the table.
- **Layout.** The card is padded like the chart card (20px); the title row moved from inline styles to `.report-table-header` with the same colours; only the table scrolls sideways (`.report-table-scroll`). Fixed figure widths measured from the bold headers (Male / Female 110px, Total Visitors 156px, Total Revenue 170px), the name takes the rest, and `min-width: 870px` keeps the longest live name ("Villa Escaparde Camping and Beach Resort") on one line, so every row is the same 58px. Centring and bold are set by class (`.num`, `.money`), not `nth-child`. Print: the scroll wrapper is `overflow: visible` and the table has no minimum width on paper.
- **Renamed (done, `d4bb55b`): the Reports money column is now "Expected Entrance Fee"**, previously "Total Revenue": the table header, its sort tooltip and the CSV header. Display only: the `revenue` field is unchanged in the API payload, the row objects and the backend. Its column widened from 170px to 200px (the header needs 198px) and the table's minimum width from 870px to 900px.
- **Why "expected", not "collected".** The figure is computed from head counts (80 per visitor, 64 per discounted visitor); no payment is ever stored. On the six visitor tabs it counts arrived AND pending records (every status except no-show); the No-show tab shows 0. Live: 2026 is PHP 2,336 arrived (31 visitors, 9 discounted) + PHP 400 pending = PHP 2,736 for 36 visitors; all years PHP 2,336 + PHP 704 = PHP 3,040 for 40. All 3 pending bookings are in the future (2026-10-07, 2026-10-28, 2027-09-21), so the figure includes money for people who have not arrived yet.
- **Open items, NOT fixed:**
  - **"Arrived" with a future arrival date.** A record can be marked arrived before its arrival date: SURV-2026-015 (arrives 2026-10-21) and SURV-2026-013 (arrives 2026-10-27) were both marked arrived on 2026-10-04, and the Expected Entrance Fee counts them as people who came. No validation prevents this. Needs a decision: block the status, warn, or leave it to the LGU staff.
  - **SURV-2026-011 arrives 2027-09-21.** Created 2026-09-22, never updated, pending, 4 visitors (1 discounted), PHP 304 of the all-years Expected Entrance Fee and 4 of its visitors (it is outside 2026). Flagged for the client; not a confirmed typo, and not changed.
  - **The Dashboard still says "Total Revenue Collected"** and has the same honesty problem the Reports column had: it is computed from head counts, not payments. Not in scope yet.
- **Tests.** Backend `ReportsMaleFemaleTests` (3): male and female per row and in totals for all 7 tabs, the balance per row and total, and the query count per tab; the two existing exact-`totals` assertions gained the two keys. Frontend (8 more in `AnalyticsAndReport.test.js`): the column order with no Avg column or dropdown, the CSV in the same order, sorting by Male, Daily and Monthly in date order, other tabs by visitors, and the imbalance note present and absent. Breaking each guarded rule failed its test; restored byte-identical, all passed. Full suites: backend 373, frontend 432 (28 suites).

## Reports Page Speed (2026-10-05; `tourism/theme-tokens`)
- **A tab switch went from 28 queries to 1.** Measured locally against the live database (warm connection, before and after runs interleaved, an unsteady network): a tab switch took roughly 15-37 seconds before and about 0.3 seconds after. Apply Filters went from 29 queries to 19 (about 14-66 seconds before against 6-30 seconds after on the same unsteady runs; an earlier steadier baseline was 10-13 seconds before).
- **The question answers are fetched once and reused.** `build_tourism_question_answers` reads only the year, `from` and `to`, never the report type (nor the resort filter, left as is). A tab switch now requests the report only (`include_questions: false`) and the context keeps the answers already loaded; they are refetched only if a record changed since (`isComputedDataStale("reportData")`). Opening the page reuses the report and answers loaded at app start instead of requesting them again. Apply Filters still refetches both.
- **The question answers went from 27 queries to 17.** 7 duplicate queries were removed by computing the demand answer and its chart from one set of queries (`get_recent_demand`) and the validation answer and its chart from one set of 4 counts (`get_validation`); 3 doubled groupings were removed by taking each leader (top resort, origin, purpose) as the first of its top 6 (`leader_and_top_groups`), which holds on a tie because both ordered by total, then name.
- **Answers unchanged.** The old and new answers were compared against live data in a read-only transaction across 4 filter sets (2026, all years, September 2026, October-December 2026; 11 answers each) and were identical. Backend `QuestionAnswersDeduplicationTests` (4) compares the new output with a copy of the old code (no records, mixed records over 4 filter sets, a tie) and pins the count at 17.
- **Tabs and CSV.** All 7 tabs are disabled while a report loads, as on Arrival Monitoring, so a slow response can no longer overwrite a later one. The title, subtitle, first column, chart, print heading and CSV describe the loaded report. Export CSV follows the on-screen sort.
- **Two behaviour changes.** A tab switch uses the last APPLIED filters, not edits made in the filter boxes without pressing Apply Filters. The active-tab highlight moves as soon as a tab is clicked, before the titles do; the titles change with the data when it arrives.
- **Tests.** Frontend `AnalyticsAndReport.test.js` (7) and `TourismDataContext.reports.test.js` (2). Breaking each rule (a tab switch refetching the answers, Apply Filters without them, tabs left enabled, the CSV in server order, the context wiping the loaded answers, the wrong leader, swapped demand chart values, an extra query) failed the matching tests; restored, all passed. Full suites: backend 370, frontend 424 (28 suites).

## No-show Sweep Once a Day; Arrival Monitoring Labels Follow the Data (2026-10-04; `tourism/theme-tokens`, uncommitted)
- **The sweep no longer writes on every GET.** `auto_update_no_show_bookings` (pending bookings whose arrival date is before today become no-shows) ran an UPDATE on every request to six GET views: bootstrap, arrival monitoring, its export, booking management, dashboard and reports. It is now `api/services/no_show.py` `sweep_no_shows` (the views import it under the old name). It sweeps on the first request of the day and records that in the cache under a key naming the day (`tourism_no_show_sweep:YYYY-MM-DD`), expiring at local midnight (Asia/Manila); later requests that day skip it.
- **Behaviour is unchanged for users.** A booking that becomes past-dated at midnight flips on the first request of the new day (new key). Because a booking saved today with a past arrival date used to flip on the very next request, any tourist record write clears today's marker: a `post_save` receiver on `TouristRecord` (web, mobile, admin) and an explicit call after the Excel import's `bulk_create`, which sends no signal. The next GET then sweeps again.
- **Fails toward sweeping.** A cache miss, restart, eviction or cleared cache sweeps. If the cache raises on read, it sweeps; if it raises on write, the marker is not stored and every request sweeps (the old behaviour). The cache is the per-process `LocMemCache`, so each server process sweeps once a day; the UPDATE is idempotent, so concurrent sweeps are harmless. Limit: if clearing the marker after a write ever failed, a past-dated booking saved that day would wait for the next day; with `LocMemCache` that call cannot fail.
- **Interim fix.** A scheduled daily task (for example a Render cron job running a management command just after midnight) would be the better long-term home: no write on any read path and no cache marker. The once-a-day cache is the interim fix until then.
- **Labels follow the loaded data.** On Arrival Monitoring the month name, the note under the cards, the summary chip, the empty-table message, the totals row label and the resort name are built from the filters of the loaded response (`viewFromFilters(arrivalMonitoring.filters)`), not from the controls' pending selection. The controls still show what the user picked; labels and numbers change together when the response arrives. After a failed request both still describe the previous view, with the error shown. Export CSV likewise exports the view on screen.
- **Tests.** Backend `NoShowSweepTests` (8): past-dated pending flips while today, future and arrived bookings do not; the first sweep of a day runs and a second runs no query; a new day sweeps again; a record saved today and an Excel import each make the next request sweep; a cache failure sweeps; the marker expires at midnight; a second GET of the Dashboard runs no UPDATE. Frontend, 4 more page tests: labels stay on the loaded month while another loads, change with the numbers when the response arrives, still describe the previous view after a failed request, and the export uses the view on screen. Breaking each rule (sweep every request, a key without the date, missing recently past bookings, skipping on a cache failure, no marker clear on save, labels from the selection) failed the matching tests; restored, all passed.

## Arrival Monitoring: Day / Month / Year and a Complete Export (2026-10-04; `tourism/theme-tokens`, uncommitted)
- **Three views.** The two-way "All Dates (Year) / Single Day View" toggle is replaced by Day, Month and Year. Day shows the date picker and Today; Month shows a month picker and the year picker; Year shows the year picker. The resort filter stays in all three. View logic is in `utils/arrivalView.js`.
- **Month requests use the existing range parameters** (`from`/`to`, no new backend parameter). From and to are built from the same year that is sent as `year`, so the backend's year filter on a range can never exclude it; the Month view's year picker has no "All Years" (switching to Month from All Years uses the current year).
- **Reopening restores the view.** The page used to read only `filters.date`, so a range (`date: ""`) reopened as today's Day view while showing a month's data. `viewFromFilters` now reads the filters the backend echoes back: `date=all` is Year, a `from` is Month, a date is Day.
- **Month wording** in the note under the cards ("Month View: Displaying aggregate arrivals for September 2026"), the summary chip, the empty-table message, and a "MONTH TOTAL" totals row.
- **The export is complete.** The on-screen table still shows at most 300 rows (`ARRIVAL_MONITORING_TABLE_LIMIT`, most recently updated first) while the cards count every record. Export CSV no longer reuses those rows: it calls a new endpoint, `GET /api/arrival-monitoring/export/`, which takes the same parameters, uses the same filtering (`filter_arrival_records`) and row builder (`arrival_row`) as the table, and returns every row in date order (`arrival_date`, then `survey_id`). The table payload gains `rowCount`; when the table is capped, a line above it reads "Showing the 300 most recently updated of N arrivals. The totals above and Export CSV include all N." The summary chip's booking-group count now uses `rowCount`, not the capped row count. Export filenames: `<date>`, `month-YYYY-MM`, or `all-dates-YYYY`.
- **Tests.** `arrivalView.test.js` (11), the page's first test file `ArrivalMonitoring.test.js` (12, counts corrected after commit `107153e`, which said 13 and 10: each view's request, the reopened view for all three, the capped-table line, each filename, a 350-row export), and backend `ArrivalMonitoringViewsTests` (5: the cap and `rowCount`, the complete date-ordered export, a month range, a mismatched year returning nothing, the endpoint and its login requirement). Breaking the month range by one day, the year matching, and the export cap (frontend and backend) each failed; restored, all passed.
- **Live check** (read-only, real code): September 2026 as a month gives 19 visitors, 11 male, 8 female, 14 overnight, 5 same day, PHP 1,440, 5 rows (export in date order); October 2026 gives 0.

## Special Needs Label and Suggestion (2026-10-04; `tourism/theme-tokens`, two commits, not deployed)
- **Label.** The `special_group_count` field reads "Special Needs" instead of "Senior / PWD / 7 below" in the web wizard, its summary line and its validation message, with the helper text "PWD, pregnant, or other special needs". The mobile counter ("Senior / PWD / Pregnant / 7 below"), its panel title and its validation message follow (code only; no APK). Only visible text changed; the column and API field stay `special_group_count`, and no export or review step showed it.
- **Suggestion.** The suggested discounted count is now `min(age_0_7 + age_60_above + special_group_count, total_visitors)` (`utils/entranceFee.js`). The follow / stop-after-edit / resume-when-cleared behaviour and the live fee breakdown are unchanged. The helper text under Discounted now reads "Suggested from Age 0-7 + Age 60+ + Special Needs. Lower it if one person is counted twice (for example a senior with special needs); raise it if someone else qualifies."
- **Migration `0049_discounted_count_includes_special_needs`** moves records still holding the age-only value from 0048 to the new suggestion; a count set by hand is left alone. In production it changes only SURV-2026-011 (pending, 2027; 0 -> 1); no record had a manual override, and the 2026 Dashboard revenue stays 1,440. The reverse returns records holding the new suggestion to the age-only value (a hand-set count that happens to equal the new suggestion would be reverted too).
- **Tests.** `entranceFee.test.js` (11, rewritten) and `DiscountedCountSpecialNeedsMigrationTests` (2). Removing the cap and dropping Special Needs each failed both the frontend tests and the migration test; restored, all passed.
- **Open item, NOT fixed:** the suggestion can exceed the real number of discounted people when one person is both a senior (or child) and special needs. The cap only stops it exceeding the visitor total. Staff must lower it in that case. Records from the mobile app and the Excel import still get 0.
- **Discounted helper text removed** (2026-10-04). The line under the Discounted field ("Suggested from Age 0-7 + Age 60+ + Special Needs. Lower it if one person is counted twice ...; raise it if someone else qualifies.") is gone, so the double-count rule is no longer documented in the UI: when one person is both a senior or child AND special needs, the suggested discounted count is one too high and staff must lower it by hand, with nothing on screen to tell them. The auto-fill, the "Entrance fee:" line, the Balance buttons and the Special Needs helper line are unchanged.

## Discounted Entrance Fee (2026-10-04; `tourism/theme-tokens`, uncommitted, not deployed)
- **The rule.** Regular PHP 80, discounted PHP 64. `TouristRecord.discounted_count` (non-negative, default 0) is how many people in a booking pay the discounted rate; one person counts once. fee = (total_visitors - discounted_count) x 80 + discounted_count x 64. `special_group_count` keeps its meaning and has nothing to do with money.
- **Migration `0048_touristrecord_discounted_count`** adds the column with `db_default=0`, so the database keeps `DEFAULT 0` and the old instance, which still serves while Render runs `migrate`, can keep inserting records (they get 0). It backfills every existing record with `age_0_7 + age_60_above`; in production that sets SURV-2026-002 to 1, SURV-2026-003 to 3 and SURV-2026-006 to 1, and the 2026 Dashboard revenue goes from 1,520 to 1,440. Reversing drops the column.
- **Validation.** `discounted_count` cannot exceed `total_visitors` ("Discounted count cannot be greater than the total number of visitors."). It is not part of the nationality, gender or age balances.
- **One fee helper.** `entrance_fee(visitors, discounted)` in `services/tourism.py` replaces `ARRIVAL_FEE_PER_VISITOR`. Arrival Monitoring applies it per record. The Dashboard and the daily, monthly, origin, purpose, transport and resort reports sum `discounted_count` in the same grouping as `total_visitors`; the fee is linear, so the group fee equals the sum of its records' fees. `feePerVisitor` in the API responses is kept and now carries the regular rate, 80.
- **Web form.** Head Count has "Discounted (PHP 64)", suggested from Age 0-7 + Age 60+. It follows the ages until staff type a value, keeps theirs after that, and resumes following when cleared (the cleared box shows the suggestion as its placeholder, and the suggestion is what is saved). An existing record follows the ages only while its stored count equals the suggestion. Special Group carries the line "PWD, pregnant, special needs". The summary panel shows the live breakdown (regular x 80, discounted x 64, total). Logic in `utils/entranceFee.js`.
- **Other writers.** The mobile endpoint and the Excel import send no `discounted_count`, so new records from them get 0, not the age suggestion. A re-import does not overwrite a stored discounted count (it is not in the import's update fields).
- **Tests.** `DiscountedEntranceFeeTests` (12) and `entranceFee.test.js` (9). Each rule was broken in turn and caught: the discounted rate, the helper ignoring discounts, the validation cap, the Dashboard, Arrival Monitoring, the daily/purpose reports, monthly, the resort report using the year's discounted total, a required serializer field (today's APK), the backfill, and in the form the follow / stop-after-edit / resume-when-cleared rule. Backend `Ran 342 tests` / `OK`; frontend 372 passed (23 suites); build `Compiled successfully.`
- **Open items, NOT fixed:**
  - **The mobile app does not collect `discounted_count`.** Registrations from the installed APK are charged entirely at the regular rate until the APK batch adds the field.
  - Records created by the old instance during the deploy window, and by the Excel import, get 0 rather than the age suggestion.
  - The origin and transport reports share the daily/purpose code path but have no test of their own.
  - The rates live in two places, `services/tourism.py` and `frontend/src/tourism/utils/entranceFee.js`; a rate change must update both.

## Entrance Fee Rate: PHP 300 -> PHP 80 per Visitor (2026-10-04; `tourism/theme-tokens`, uncommitted)
- **No fee is stored anywhere.** `api_touristrecord` has no fee, paid or amount column, the web wizard and mobile app never collect one, and the Excel import has no fee column. Every fee and revenue figure is computed from the head count: `total_visitors x ARRIVAL_FEE_PER_VISITOR` (`services/tourism.py`).
- **The rate was 300 and is now 80.** It feeds Arrival Monitoring "Fee Paid" per row and "Fees Collected", Dashboard "Total Revenue Collected", every Reports revenue and average per visitor (daily, monthly, origin, purpose, transport, resort; no-show reports revenue 0), and the `feePerVisitor` value sent with those payloads. The frontend placeholder `feePerVisitor` (shown only until the API answers) is 80 too.
- **Live effect for 2026** (read-only, real code): Dashboard Total Revenue Collected 5,700 -> 1,520 and Arrival Monitoring Fees Collected 5,700 -> 1,520 (5 arrived records, 19 visitors).
- **Tests.** `EntranceFeeRateTests` (4) pin Arrival Monitoring Fee Paid and Fees Collected, Dashboard Total Revenue Collected, and the daily report's revenue and average per visitor on a fixed set of records. With the rate set back to 300 all 4 failed; restored to 80, all 4 passed.
- **Open items, NOT fixed:**
  - The mobile port guide still tells tourists "Environmental & Tourism Fee: PHP 50 per tourist" (`mobile/lib/screens/tourism_screens.dart`). Not touched: it is not yet known whether that is the same fee.
  - No discount rate exists. The intended PHP 64 rate for children, senior citizens and PWDs is a separate decision with the client. `special_group_count` ("Senior / PWD / 7 below" on the web, "Senior / PWD / Pregnant / 7 below" on mobile) does not reconcile with the age counts in the existing data.

## Foreign Origin, Phase 1: Backend and Web (2026-10-04; `tourism/theme-tokens`; mobile unchanged)
- **The problem.** Region and Province were required for every tourist record, so a foreign tourist had to pick a Philippine region and province. Every origin figure grouped by province alone, so that record counted toward a Philippine province. In production, SURV-2026-013 (United States, 4 visitors, pending) stores Region VI / Guimaras and counts as 4 visitors from Guimaras in Reports and Analytics.
- **Region and province are optional for foreign countries.** Migration `0046_touristrecord_optional_region_province` makes `region_id` and `province_id` nullable (`country_id` stays required). Its reverse will fail once any record has an empty region or province. `country_requires_location()` (`models.py`) reads `Country.type`: both stay required unless the country is typed "foreign", so an unknown or untyped country fails the old way. The serializer accepts null for both.
- **Origin figures fall back to the country name.** Dashboard "Top Origin This Month", Reports "origin", and Analytics top origin and top 6 group on `with_origin()` (`services/tourism.py`): the province name, or the country name when there is no province. The dead province -> region -> country fallback (`first_non_empty`) is removed. The Dashboard no longer returns a raw `None`.
- **The silent Philippine defaults are removed** from the mobile endpoint (`normalize_mobile_visit_payload`) and the Excel import (`resolve_location`). Both still fill CALABARZON / Quezon (and the mobile country of origin "Philippines") for a Philippine record, but leave a foreign record's empty region and province empty. The import now types a country it creates "foreign" unless it is the Philippines.
- **Web form** (`BookingManagement.js`, `utils/countryLocation.js`): Region and Province are hidden and not required when the selected country is foreign, cleared when the country changes to a foreign one, and sent as `null` when empty. The Reports origin table reads "Province / Country" and "grouped by province of residence, or by country for foreign visitors".
- **Mobile is unchanged (no APK).** The installed app always sends a region and province, pre-set to CALABARZON / Quezon, for every country. Those payloads save exactly as before, so foreign registrations from the app still carry CALABARZON / Quezon and still count under Quezon until the phase 2 rebuild.
- **Tests.** `ForeignOriginTests` (11) and `countryLocation.test.js` (4). Each rule was broken in turn and the matching tests failed: Philippine still required, foreign saves empty, each of the three origin figures, the import, the mobile defaults, and the frontend rule by name. Every file was restored byte-identical. Backend `Ran 319 tests` / `OK`; frontend 363 passed (22 suites); build `Compiled successfully.`
- **SURV-2026-013 corrected** by migration `0047_clear_surv_2026_013_origin`: region id 9 "Region VI - Western Visayas" and province id 42 "Guimaras" cleared to NULL (country id 2 United States and its 4 visitors unchanged), because the form used to force a Philippine region and the record counted as 4 visitors from Guimaras. The reverse restores ids 9 and 42.
- **Open items, NOT fixed:**
  - `Country.type` still defaults to "local", so a country added through Django admin without setting its type will wrongly require a Philippine region and province. The Excel import now types new countries correctly, so this only affects manual additions.
  - Editing an existing foreign record that already stores a region and province keeps and re-sends them. Only changing the country clears them.
  - Domestic vs foreign still comes from the typed `filipino_count` / `foreigner_count`, not the country, so SURV-2026-013 (entered as 4 Filipino) counts as domestic.

## Boat Classification: Rename, Consolidation and a Data-Driven Fare Rule (2026-10-03; deploy 1 = commit `447970a`, merged to `main`; deploy 2 = the rename commit, held on `tourism/theme-tokens`)
- **The bug this removes.** `BookingManagement.js` decided the Boat Capacity and Fare rule by matching the name prefix "public boat". Renaming that row would have disabled the field for every boat and, on save, sent an empty fare, wiping the stored fare of any public-boat record that was edited. No test covered it.
- **The rule now lives on the row.** `BoatType.requires_capacity_fare` (boolean, default False), added by migration `0044_boattype_requires_capacity_fare`, which sets it True for id 1 only. `BoatTypeSerializer` sends it in `referenceTables.boatTypes`. The web form uses `tourism/utils/boatCapacityFare.js`. `requiresCapacityFare` is true only when the row is found and the flag is `true`, so the field is disabled whenever the rule is unknown. `capacityFareForBoatType` clears the fare only when the row is found and the flag is explicitly `false`. If the row did not load or has no flag, the stored fare is kept, never wiped.
- **Rename and consolidation**, migration `0045_consolidate_boat_types`:
  - id 1 "Public Boat" becomes "Tourist Boat".
  - id 2 "Private Boat (Rates depend on the capacity)" becomes "Passenger Boat".
  - Records on id 7 "Passenger Boat" move to id 2. In production that is one record, SURV-2026-002 (arrived, 4 visitors), and it keeps its fare "1-2 pax (One-Way P1500, Two-way P2000)".
  - Ids 3 "Boat Provided by Resort", 4 "2.0", 5 "Motorized Banca", 6 "Speedboat" and 7 are deleted.
  - Every step matches on the id and the current name, so it is a no-op when already done. A row that still has records is kept, with a warning, rather than failing the deploy.
  - The reverse restores both names and recreates rows 3-7 empty. It cannot restore which records were on id 7; they stay on id 2.
  - Migration numbers were checked after `git fetch`: origin/main and this branch both ended at 0043.
- **Two commits so they can ship in two deploys** (see Standing Notes). Deploy 1, commit `447970a`: 0044, the model and serializer, the web form and its helper, the import mapping and their tests. Deploy 2, the rename commit: 0045, the seed, the mobile labels, the 0045 tests and this section. Until deploy 2, the seed still holds the old names and no flag, so a freshly seeded database (tests only; production is not reseeded) has the fare field disabled for every boat. In one deploy, 0045 would rename id 1 while the old frontend (including tabs left open, which keep the old JS until reloaded) still matched "public boat", reopening the fare-wiping bug.
- **Excel import.** `normalize_boat_type` now returns a row id, not a name, so it works before and after the rename:
  - "public boat…", "tourist boat…" and an empty cell go to id 1.
  - "private boat…", "passenger boat…" and "boat provided…" go to id 2. A resort-provided boat is a private trip with no public fare.
  - `ReferenceResolver.by_id` finds the row; no new row is created for any of these.
- **Seed.** Only ids 1 and 2 remain, with the new names and flags. The 5 seed tourist records on id 3 now use id 2, otherwise seeding a fresh database would fail on the foreign key.
- **Mobile** (code only, no APK): the offline fallback list and the display fallbacks read "Tourist Boat" / "Passenger Boat". The app sends `boat_type_id`, and its dropdown comes from the server.
- **Tests.** `boatCapacityFare.test.js` (8 tests). Against the old name-prefix rule 4 failed; against a version that reads the flag but clears the fare whenever it is not `true`, the 2 never-wipe tests failed; restored, 8/8. Backend: `BoatCapacityFareFlagTests` (4, deploy 1: the 0044 flag, the import mapping against the stored old names, unrecognised text, the payload) and `BoatTypeConsolidationTests` (8, deploy 2: 0045 forwards, re-run, kept and mismatched rows, reverse, the import after the rename, the seed) replace the 0033 test that pinned the old seed and import names. Backend `Ran 308 tests` / `OK`; frontend 359 passed (21 suites); build `Compiled successfully.`; `dart analyze` on the three changed files: no issues.
- **Open items, NOT fixed:**
  - The mobile app does not enforce the capacity-fare rule. Its form always shows Boat Capacity & Fare, whatever boat is chosen, and the backend accepts a fare for any boat type. A passenger-boat booking from the app can still carry a fare.
  - "2.0" (id 4) was junk created by the Excel import: openpyxl returns a numeric cell as a float, `clean_text` turns `2` into `"2.0"`, and the resolver makes a row of it. This is the same cause as "Que" in the itinerary table. Unrecognised boat text still creates a new row; only the known old and new names are mapped.
  - `frontend/src/tourism/data/mockTourismData.js` is imported nowhere and still lists the old boat names.
  - SURV-2026-002 is on boat type id 7 "Passenger Boat" with `boat_capacity_fare` = `1-2 pax (One-Way P1500, Two-way P2000)` (read before 0045 on 2026-10-04). 0045 moves it to id 2, which is flagged as not requiring a fare, so a future web edit of this record will clear the fare.

## Stay Type Rename: "Day Tour" -> "Same Day" (2026-10-03; committed as `8a1fc39`, merged to `main` as `f9d2ef6`, deployed)
- **Deployed and verified.** Migration 0043 was applied at 23:25 local (15:25:19 UTC, per `django_migrations`) by Render's `build.sh` during the deploy. The new frontend bundle (`main.81a5de8d.js`, containing "Same Day vs Overnight") was being served by 23:26. Render's logs were not readable from here, and the backend has no public version signal (`/api/health/` returned 200). Post-deploy read-only checks against production: row 2 reads "Same Day"; per-itinerary records/visitors match the baseline (id 1 = 2/7, id 2 = 3/8, id 3 = 4/14, id 5 = 1/2, id 12 = 1/4), and the 3 records on id 2 are unchanged; `api_itinerary` still has 12 rows (no row 13); a `ReferenceResolver(commit=False)` dry run resolves "day tour", "Day Tour", "DAYTOUR", "same day" and "Day trip" to the existing id 2.
- **What is stored.** A tourist record stores `api_touristrecord.itinerary_id` (an integer FK). The text lives only in `api_itinerary.name` for `id = 2`. Before the change, production held 3 records / 8 visitors on id 2 (1 arrived, 2 no-show). No tourist record changes; they point at the id.
- **Data migration `0043_rename_day_tour_itinerary`** (`RunPython`, reversible): renames `id = 2` only where the current name is `"Day Tour"` (case-insensitive), and back in reverse. A missing or already-renamed row is a no-op. Number checked after `git fetch`: origin/main and this branch both end at `0042_merge_20261003_1821`; no 0043 on any branch or in `django_migrations`.
- **Writers kept in step with the data.** `seed_data.py` id 2 is now "Same Day", so `seeders.py`'s `update_or_create(id=2, ...)` cannot rename it back. `normalize_itinerary` (Excel import) now returns "Same Day" for any cell containing "day". The resolver matches by `lower(name)`, so after the migration a "day tour" cell resolves to row 2. **Order matters:** a read-only dry run of `ReferenceResolver(commit=False)` against the un-migrated data resolved "day tour" to a new unsaved row 13. The code must not run imports before 0043 is applied. The reverse gap also exists: `build.sh` applies the migration while the old code is still serving, so an import in that window would have created a duplicate "Day Tour" row (see Standing Notes). The web wizard and the mobile app send `itinerary_id`, so neither needed a change to write correctly; no APK rebuild.
- **Labels unified to "Same Day":** Dashboard (chart legend, CSV export row, card subtitle "Same Day vs Overnight", card title), Analytics (title "Same Day vs. Overnight Stays", the split legend from `tourism.py` `build_tourism_question_answers` plus the frontend fallback in `buildFallbackVisual`), Arrival Monitoring table header (was "Sameday"), `mockTourismData.js`, and the mobile display fallbacks in `models.dart` and `tourist_qr_checkin_screens.dart` (code only; no APK built).
- **Left as they are, on purpose:** the resort named "Day tour" excluded in `views/mobile.py`, "day tours" in resort descriptions, the promo card "Day Tour (Town Proper)" in `tourism_screens.dart`, the CSS comment, and the internal `dayTour` / `day_tour` / `sameDay` API keys. The Analytics question and answer prose ("same-day visitors ... overnight or multi-day visitors") keeps the hyphenated adjective, and the "Same-day" fixture in `chartTheme.test.js` is test data.
- **Open items, NOT fixed:**
  - "Beach and Resort Day Tour" (`api_itinerary` id 10) is counted as same-day, because every stay classifier in `services/tourism.py` uses `"day" in name or "same" in name`. No records use it yet.
  - `mobile/lib/screens/tourism_screens.dart:3848` falls back to `RefItem(id: 1, name: 'Day Tour')`, but id 1 is Overnight. It is used only when the bootstrap has no itineraries; a registration made then would be saved as Overnight while showing "Day Tour".
  - `api_itinerary` id 8 is a junk row named "Que" (no records use it).

## Login, Session and Connection-Pool Fixes (2026-10-03; merged to `main` as `0a1de58`)
- Commits: `32553d2` (no-show UPDATE once, bootstrap dedupe) and `ab5d063` (login message, session restore, CONN_MAX_AGE), merged to `main` as `0a1de58` and pushed. Frontend deploy verified live at 23:04 (bundle `main.7e41af92.js` -> `main.9645511b.js`, which contains the new login and session-error strings). Backend `/api/health/` returned 200 and `/api/tourism-theme/` still returned `#EF7C1F`, but the backend deploy itself was not confirmed: there is no public version signal and Render's status was not accessible. No login or login-failure testing against production.
- **Login page no longer reports server errors as bad credentials.** `LoginPage.js` used to show "Invalid username or password." whenever the error had no JSON `detail`, which included every HTML 500 (for example a database connection failure during `authenticate()`). It now says that only for a 401. A 400 shows the server's validation message; no response or a timeout shows "We couldn't reach the server. Please try again in a moment."; any other status shows "The server ran into a problem. Please try again in a moment."
- **A failed `/auth/me/` no longer discards a valid token.** `AuthContext.js` cleared the stored token on any failure during session restore, so a slow or failing database logged users out on reload. The token is now cleared only on 401 or 403, which is how DRF rejects an invalid, revoked or inactive-user token. Network errors, timeouts and 5xx keep the token, and `ProtectedRoute` shows "We couldn't confirm your session because the server could not be reached or returned an error. Please try again in a moment." with a **Try again** button.
- **`CONN_MAX_AGE` is now 0 under DEBUG (600 otherwise).** `runserver` serves each request on a new thread and Django connections are thread-local, so a persistent connection is never reused; each one held a slot in the shared Supabase session pool (Supavisor, port 5432, about 15 slots observed) until it expired. Measured locally: 4 idle sockets to the pooler before; 0 after 4 requests and while idle afterwards. Production depends on Render not setting `DEBUG=True` (Render's environment is not in this repo).
- **The no-show UPDATE ran twice per request and now runs once.** `build_booking_management_payload` repeated the pending-to-no-show UPDATE that its only two callers (`bootstrap_data`, `booking_management_data`) already run via `auto_update_no_show_bookings()`. The inline copy was removed; all five GET views still run the helper once.
- **The tourism bootstrap fired twice under StrictMode and now fires once.** `TourismDataContext.loadData` reuses an in-flight bootstrap instead of starting another, so React.StrictMode's double mount in development no longer fires two concurrent full bootstraps. The context API is unchanged. (Production builds do not double-mount, so this affects development only.)
- Verification: backend suite 297/297; frontend suite 351/351 (20 suites); production build compiled; app-code ESLint clean (the `*.test.js` files carry 140 pre-existing testing-library lint errors, unrelated). An earlier "lint clean" claim was made from standalone ESLint while the build failed on a stale `.eslintcache` entry; the code was correct, and the build is now the verification of record. The login messages and the session-error screen have not been seen in a browser.
- **Open items, NOT fixed:**
  - `/api/bootstrap/` still makes 49-57 sequential queries (57 with a cold cache, 49 warm), 31 of them for Reports and its question answers. Measured against the Sydney pooler: about 1.8-4 s to open a connection and about 0.3 s per query, so the network floor alone is roughly 18-22 s against the frontend's 30 s timeout.
  - The session-restore path and the new session-error screen have no automated tests; no existing test renders `AuthProvider` (all tests mock `useAuth`).
  - There is still no development database: local `runserver` uses the production Supabase instance, so every local save writes to production.

## Sanitation Mobile OpenStreetMap Attribution (2026-10-03; feature branch)
- Added one sanitation-local map frame that keeps `© OpenStreetMap contributors` continuously visible below the tile canvas on the community report **Adjust on map**, staff **GIS Map**, and household **Confirm GIS Pin** surfaces. Each existing map retains its 200px, 360px, or 220px canvas height; the separate 24px footer does not overlay markers, polygons, map taps, switching controls, or the household confirmation button.
- Provider/request configuration is unchanged: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and `userAgentPackageName: mauban_sanitation_mobile`. The current `flutter_map 8.3.0` native configuration path produces `User-Agent: flutter_map (mauban_sanitation_mobile)`; this is static source/configuration evidence, not packet-level proof of what OSM receives. No custom headers, caching behavior, external-link package, provider, or satellite functionality was added.
- Red -> green: four focused tests initially failed because all three maps lacked the exact visible attribution; after the correction, 4/4 passed. The suite verifies the footer is outside `FlutterMap`, exact tile URL/User-Agent configuration, existing pins, staff markers/polygons and overlay control, absence of Satellite UI, and a 360px no-overflow layout. Relevant sanitation suites passed 64/64; full Flutter suite passed 219/219; `flutter analyze` reported no issues; `git diff --check` passed.
- Scope: sanitation mobile map presentation and focused tests plus the two project documents only. No web, backend, tourism, shared-auth, map coordinate/filter behavior, provider, satellite, `pubspec.yaml`, or `pubspec.lock` changes. No production access. Real-phone acceptance remains pending.

## Household Survey A+B+C - COMPLETE and Accepted (2026-10-03)
- **CLOSED:** Household Survey correction work is complete, published and accepted. This closeout supersedes the unpublished, held-off-main and pending-acceptance statuses in the historical Household Survey entries below.
- Published main commit: `ae183ed0272d931fd2c52f8082b6712948255566`.
- Verified release results: backend full suite **276/276 passed**; Flutter full suite **215/215 passed**; frontend full suite **277/277 passed**; production frontend build **passed**.
- Sanitation APK: package `com.mauban.sanitation`; version **1.0.4**, version code **5**. Signing certificate SHA-256: `98214ff2f499cbb6bd5f18938e6a50dac789a26143dd3ca39011e8e44c01c86b`.
- Real-phone acceptance: **PASSED**. Hosted deployed-browser acceptance: **PASSED**.
- Final household contract: septic choices are **Bottomless / Vault-sealed only**; legacy `septic_tank` remains preserved/readable but unavailable for new selection. Water source is single-select with the five approved values: **Deep well, Poso-shallow well, Spring, Barangay water system, Other**. Water level remains independent. Male/Female/Total displays a live read-only Total. Web/mobile differential PATCH preservation remains intact.
- Separate outstanding work, **not part of this release**: satellite map/provider work; GPS Map Camera / front-of-house photo persistence workflow. These remain open independently of the closed Household Survey corrections.
- Documentation-only closeout records the verified release and acceptance facts supplied by the user; no tests or acceptance checks were rerun, and no production API/DB access was performed for this closeout.

## Household Survey - Slice C: Final Web UI and Water Contract (2026-10-02; uncommitted)
- Stack/preflight: verified `sanitation/household-final-mobile` at `f49aab2f48d1e2de475444c518e36f888b4e3790`, clean tracked state and only unrelated untracked `tatus`; created `sanitation/household-final-web` directly on A/B. A and B are committed but intentionally unpublished. Main/origin/main remain `3932a812860ff4dcd6861db9355f5d6572e6f268`; do not publish the backend guard separately from compatible clients.
- Septic: selectable choices are only Bottomless/`bottomless` and Vault-sealed/`vault_sealed`. Stored `septic_tank` displays as legacy/unavailable and is preserved on unrelated/no-op edits. Changing the legacy applicable toilet configuration clears the selection and requires an approved replacement. Pit/None transitions explicitly PATCH NULL; switching back requires selection. Existing NULL/blank compatibility and unknown-value blocking remain covered.
- Water: removed source splitting/rejoining, multiselect, computeWaterLevel, source-level mappings, submit-time recomputation and the derived-only display. The form retains exact raw stored source and level independently. New selectable source labels are Deep well, Poso-shallow well, Spring, Barangay water system and Other. New records require one approved source and Level 1/2/3 independently; literal Other has no description field. Existing custom/comma-separated/blank or unsupported values display as legacy and remain exact until explicitly replaced.
- UI: accessible native radio groups replace fixed-field dropdowns, with selected styles and visible focus-within outlines. Barangay remains the existing dropdown. Household-only CSS wraps choice cards, uses a narrow-screen one-column form, and keeps Male | Female | Total together. Total is a live read-only output, never part of POST/PATCH. Remarks, coordinates, status, counts, survey date, no-op and differential PATCH behavior remain preserved; new submissions retain the existing POST route and payload fields with the newly approved source/level choices.
- Red -> green: the 15 initial interaction tests failed against the pre-fix implementation (exit 1), exposing missing radio groups, legacy states, independent level and Total controls. First post-fix run had 5 passes and 10 test-harness failures from a missing jest-dom import; corrected the import. Initial W1/W2/final pass: 35/35. Added blank-source/unsupported-level preservation and new-record source/level validation; final focused suites passed 37/37 (W1 7, W2 13, final 17). Full frontend suite passed 277/277 across 12 suites, exit 0. Existing unrelated logging/act warnings remain non-failing.
- Real integration: no connected browser surfaces were available; playwright-cli was unavailable. Used the permitted real HTTP/database fallback, not mocked responses: executed the current JavaScript household API helpers/shared request client and actual production differential PATCH builder against an authenticated loopback Django server after confirming a unique throwaway django.db.backends.sqlite3 database. Both approved new POSTs returned 201 and refreshed correctly. Legacy address-only edit preserved septic and exact source; applicable transition without replacement returned 400; approved replacement persisted; source-only, level-only and count changes stayed independent; Pit/None explicitly cleared septic.
- Direct SQL: address changed only address/updated_at; rejected transition changed no column; approved transition changed toilet/septic and existing model-computed status/updated_at; source-only and level-only changed only their respective field/updated_at; counts changed only male_count/female_count/updated_at. Pit/None cleared septic; status changed only where existing scoring required it. Both new records' septic/source/level/counts matched refreshed API data. No total_members was sent. The local integration process exited 0; server stopped and disposable database/credentials were deleted.
- Verification: focused W1/W2/final React tests passed 37/37; the full frontend suite passed 12 suites / 277 tests; the final production build passed. React tests verify keyboard Space selection, focus, selected state and live totals. Actual browser-to-backend acceptance and visual narrow/desktop layout checks remain outstanding; no full browser verification is claimed.
- Scope: only the household React form, household-scoped sanitation CSS, focused household tests and these two documents. No backend/migrations, mobile, tourism, shared-auth, maps/dashboard/inspection or GPS/photo changes. Nothing staged, committed, merged or pushed; `tatus` untouched. No production systems accessed.

## Household Survey - Slice B: Final Mobile UI and Water Contract (2026-10-02; committed, held off main)
- Stack/preflight: confirmed clean tracked state, only unrelated `tatus`, and Slice A HEAD `6092afc38876e5e74a3d5a3bf0cf64e296dca93f` on `sanitation/household-septic-legacy-contract`; created `sanitation/household-final-mobile` directly from it. Slice A is committed but intentionally unpublished: main/origin/main remain `3932a812860ff4dcd6861db9355f5d6572e6f268`. Do not publish the backend guard alone; complete and verify the mobile/web client stack first.
- Mobile correction: household fixed choices now use wrapping single-select ChoiceChips; Barangay remains its existing dropdown. Septic offers only Bottomless/`bottomless` and Vault-sealed/`vault_sealed`. Stored `septic_tank` is displayed as legacy/unavailable with no selectable deprecated option, preserved on unrelated/no-op edits, and cleared from form state when toilet configuration changes so an applicable transition requires an approved replacement. Pit/None clearing and return-to-applicable reselection remain intact; unknown stored values remain blocked.
- Water: exact single-select labels are Deep well, Poso-shallow well, Spring, Barangay water system and Other. Literal Other requires no description. Any nonmatching stored value (including old spelling/case, custom, comma-separated, whitespace and blank strings) is displayed as legacy/unavailable and preserved exactly until an approved replacement is intentionally selected. Source changes never derive a water level, including for new surveys. Level 1/2/3 remain independent. The household parser reads water_level rather than falling back to water_source; survey receipts read the actual source separately.
- Members: Male | Female | Total are presented side by side. Male/Female retain 0-99 controls; Total updates immediately and is display-only. Existing API code is unchanged: new surveys use POST, edits use differential PATCH, no-op edits send no request, and total_members/remarks are omitted. Coordinates, raw unchanged fields, consent and existing compatibility guards remain preserved.
- Actual red evidence: the new 14-test file failed 14/14 against the unchanged implementation (exit 1). Examples: missing water_level parsed as Spring; six dropdowns instead of one; missing legacy messages, tap choices and total controls. The first combined green attempt passed 72/75; remaining test-finder errors used different existing toilet labels or searched lazy offscreen content before scrolling. Corrected those test assumptions without weakening assertions; 75/75 then passed. Added explicit legacy no-op, consent and receipt checks; final focused household suites pass 77/77 (exit 0).
- Real integration: actual Dart fetchSanitationStaffRecords/submitHouseholdSurvey ran against authenticated loopback Django after asserting a unique throwaway django.db.backends.sqlite3 database. Both approved new records POSTed and refreshed correctly. Legacy septic/custom source survived an address-only PATCH; an applicable toilet transition without replacement returned 400; approved replacement succeeded. Source-only and level-only edits preserved the other independent value; count edits persisted without total_members in any outgoing payload.
- Direct SQL evidence: address PATCH changed only address/updated_at; rejected transition changed no column; approved toilet/septic transition changed toilet_type/septic_tank_type/status/updated_at (existing scoring); source PATCH changed only water_source/updated_at; level PATCH changed only water_level/updated_at; count PATCH changed only male_count/female_count/updated_at. Unrelated columns, including remarks, coordinates and survey date, were identical. Local server stopped; temporary SQLite database/token credentials and scratch Dart test deleted. No production access.
- Verification: focused household suites passed 77/77 and the full Flutter suite passed 215/215 (both exit 0). Final flutter analyze reported no issues (exit 0); git diff --check passed. The local Dart integration test passed (exit 0); additional direct SQL assertions confirmed both new approved records retained their septic value, literal Other, independent level_2 and counts, matching refreshed API data. The 360px widget test scrolls through legacy messages and all fixed-choice controls without overflow exceptions. This is widget/local API verification, not real-phone acceptance; final APK/phone testing and the web client correction remain outstanding.
- Scope: only sanitation household mobile code/tests and these two documents; no backend, schema/migration, React, tourism, shared-auth, map/dashboard/inspection or GPS/photo changes. Committed as `f49aab2f48d1e2de475444c518e36f888b4e3790`, intentionally not merged or pushed; `tatus` untouched. Real-phone acceptance remains pending.

## Household Survey - Slice A: Shared Septic Legacy Contract (2026-10-01; committed, held off main)
- Preflight: fetched and confirmed main/origin/main at `3932a812860ff4dcd6861db9355f5d6572e6f268`, clean tracked state and only unrelated untracked `tatus`. Created `sanitation/household-septic-legacy-contract`; W2 is already committed, merged and pushed.
- Final client direction supersedes the historical three-choice UI contract below: selectable septic values are now only Bottomless (`bottomless`) and Vault-sealed (`vault_sealed`). Stored `septic_tank` is legacy-read-only compatibility. Future water source is single-select; literal `Other` is accepted as a new-record value. Existing custom/comma-separated source strings must remain exact unless explicitly replaced. No water/UI change is implemented in Slice A.
- Serializer correction: reject any explicitly submitted `septic_tank`; continue serializing stored legacy values. Unrelated applicable PATCH (including the same toilet value) preserves legacy septic exactly. Changing Water-sealed to/from Pour flush on a legacy record requires an explicit approved replacement; omission, NULL and blank are rejected for that transition. Pit latrine/None continues clearing septic to NULL without requiring replacement. Explicit deprecated writes are rejected even when accompanied by an inapplicable toilet. Other NULL/blank/omitted compatibility, unknown-choice validation, model choices and scoring remain unchanged.
- Tests: added nine focused legacy-contract tests, with subcases for both applicable directions, approved replacements, explicit replacement from all stored states, read/preserve/clear behavior and NULL/blank compatibility. Updated the existing creation matrix to the two approved write choices and construct the legacy fixture directly through the ORM. Actual pre-fix run: 9 tests, 12 failing assertions across 3 test methods (deprecated create, deprecated replacement and transition without approved replacement), exit 1. Green focused septic/readback suites: 27/27, exit 0.
- Real local integration: confirmed `django.db.backends.sqlite3` and a unique throwaway database before migration. Actual token-authenticated loopback Django household requests verified deprecated POST 400/no row; unrelated legacy PATCH 200 with direct SQL changing only address/updated_at; applicable transition without replacement 400 with the entire SQL row unchanged; transitions with Bottomless and Vault-sealed 200; Pit latrine and None transitions 200 with NULL septic. Both approved new-record POSTs returned 201. Refreshed GET responses and direct SQLite SELECTs matched throughout.
- Cleanup: the integration assertions passed, but the first harness exit returned 1 because Windows retained SQLite handles during temporary-directory cleanup. After the process exited, a separate cleanup removed the exact temporary database/directory and verified their absence (exit 0). The server stopped and disposable database/token credentials were deleted; no production system was accessed.
- Checks: full backend suite passed 276/276 in 391.758s (exit 0). Django system check reported no issues (exit 0); `makemigrations --check --dry-run` reported no changes (exit 0); `git diff --check` passed. Existing mocked upload-error traces and missing-staticfiles/tracking-key warnings were non-failing.
- Rollout limitation: current web/mobile UIs still offer the deprecated option and retain it across applicable toilet transitions. These explicit submissions now receive a clear 400 until the separate UI slices are updated. Existing differential unrelated edits continue preserving legacy values. Browser/phone acceptance of the final two-choice UI remains outstanding.
- Scope: only household serializer, focused septic tests and the two project documents. No model/schema/migration, Flutter, React, tourism, shared-auth, maps, dashboard or inspection modifications. Committed as `6092afc38876e5e74a3d5a3bf0cf64e296dca93f`; intentionally not merged or pushed until the compatible client corrections are ready. `tatus` untouched.

## Household Survey - Web Slice W2: Conditional Septic Selector (2026-10-01; uncommitted)
- Repository state: W2 is on `sanitation/web-household-septic` from verified base `3d1afa9219bf7b5aa62cb7d1f7ee9d47f3b1c7a2`; only `tatus` is unrelated and remains untouched.
- Backend compatibility: `HouseholdSanitationRecord.septic_tank_type` is already nullable/blank with the three approved choices, and `HouseholdSanitationRecordSerializer` already reads/writes it through authenticated household list/detail APIs. Partial PATCH preserves omitted applicable values, rejects unknown submitted values, and clears the field for Pit latrine/None. W2 requires no schema, serializer, endpoint, API-helper, or permission change.
- Web behavior: Water-Sealed and Pour Flush show a required-for-new-record selector with `septic_tank`, `bottomless`, and `vault_sealed`. Valid stored values initialize exactly. Applicable-to-applicable changes retain the selection; switching to Pit Latrine/None hides and clears it; switching back requires reselection. Existing legacy applicable NULL/blank records can receive unrelated differential edits without fabricating septic data. Unknown stored values block edits. Clearing an existing selection sends explicit JSON NULL alongside the toilet change.
- W1 interoperability: septic participates in the existing immutable-snapshot comparison without widening other PATCH payloads. Unchanged raw/custom water source, independent water level, remarks, coordinates, counts, status, and survey date remain omitted. No-op behavior and the existing new-record POST shape for inapplicable toilets remain intact.
- Test evidence: the initial W2 interaction run produced 10 expected failures and 3 existing preservation passes out of 13. Green W2 is 13/13; combined W1/W2 is 20/20; the full frontend suite is 260/260 across 11 suites; the production build compiles successfully. No source/package/signing/configuration dependency was added.
- Local HTTP/database evidence: a loopback Django server ran against a migrated throwaway SQLite database with the engine asserted as `django.db.backends.sqlite3`. Authenticated GET returned `vault_sealed` and legacy NULL exactly. Address-only PATCH changed only `address`; septic-only PATCH changed only `septic_tank_type`; an explicit Pit Latrine transition changed only toilet and septic, with septic stored as NULL; a legacy NULL record kept NULL during address-only PATCH; and an applicable POST persisted `septic_tank`. Refreshed API values matched direct database reads. Temporary credentials/database were deleted; production was not accessed.
- W3 compatibility finding: the backend fields already support the five approved source strings and independent `level_1`/`level_2`/`level_3`, so a migration is not inherently needed. The present web UI is multi-select, persists comma-separated text, and automatically derives level; the current mobile UI is single-source plus independently selected level. Converting web to single-source would change the meaning and editability of existing multi-source records. Implementation must wait for a product decision on single versus multiple water sources. After that decision, W3 can replace the approved option labels and derived level display with the chosen source control and an independent level selector, while differential PATCH preserves untouched legacy strings and blocks unsafe source conversion.

## Household Survey - Web Slice W1: Edit Preservation (2026-09-30; committed, merged, pushed, browser-tested)
- Preflight: fetched and confirmed `main == origin/main == 7281781e7d84807edfd850959854a5daad58e764`, clean tracked state and only untracked `tatus`. Created `sanitation/web-household-edit-preservation`; `tatus` remains untouched.
- Root cause: the web edit handler sent broad form state, recomputed water level from split/rejoined source values, and included server-managed status. This could change independent levels and normalize custom legacy source text during unrelated edits.
- Correction: web edits retain an immutable source snapshot, build a differential PATCH from editable fields, preserve exact unchanged source text, omit unrepresented coordinates, exclude septic/status, skip no-op writes, and block changes to unsupported legacy source tokens. New POST behavior is unchanged.
- Pre-fix red evidence: three React interaction regressions were run against the original implementation in an isolated detached worktree and all failed. Address-only editing sent broad form state, converted stored Level II to Level I and normalized the raw source; no-op editing still wrote; and unsupported legacy-source editing was not blocked. The temporary worktree was removed afterward.
- React verification: focused W1 tests pass 7/7. Actual form interactions verify address-only PATCH, no-op request suppression, remarks-only PATCH, the existing Add Household POST payload, and legacy-source blocking. Helper assertions also verify exact raw-source preservation and empty no-op payload construction. The full frontend suite passes 247/247 and the production build succeeds.
- Local backend integration: the project Python 3.14.7 virtual environment with Django 6.0.4 started a loopback WSGI server on a confirmed throwaway SQLite database. Authenticated address-only PATCH returned 200 and direct database/refreshed-response comparison found only `address` and server-managed `updated_at` changed; all unrelated household fields remained exact. Authenticated remarks-only PATCH returned 200 and changed only `remarks` plus `updated_at`. The temporary database and credentials were deleted, and no production system was accessed. W1 was subsequently committed as `3d1afa9219bf7b5aa62cb7d1f7ee9d47f3b1c7a2`, fast-forward merged, pushed, and passed manual browser-to-backend acceptance testing.

## Household Survey - Mobile Slice H2B: Edit Preservation (2026-09-30; committed, merged, pushed, phone-tested)
- Preflight: read the current tracking documents, fetched and confirmed `main == origin/main == 8d89ec62d37c138b88afc7e8d6e80d6975eee0a8`, clean tracked state and only untracked `tatus`. Created `sanitation/household-edit-preservation`; `tatus` remains untouched. H2A is now merged/pushed; the older H2A entry below records its historical pre-commit state.
- Current-contract audit: authenticated staff bootstrap supplies every required editable field plus the household ID. The mobile model discarded address, counts, raw water source/level and waste disposal; edit initialization left those at defaults, and submission posted them all. Reformatting the unchanged head/address/custom text could also normalize stored data. The existing mobile POST handler supplies defaults even for omitted fields and advances the survey date, so a differential POST is unsafe.
- Correction: retain an immutable raw editable-field snapshot separately from display fallbacks; initialize all existing controls from validated stored values. Custom/comma-separated sources reuse the existing Others text field and remain exact when unchanged, including blank strings and whitespace. On existing records, selecting a source no longer resets the independent level. New-survey choices/defaults are unchanged; H1B septic visibility, transitions/reselection and legacy applicable NULL/blank omission remain intact. Remarks is neither shown nor submitted.
- Existing form edits now pass the original record into the household API method and use the already-existing authenticated `PATCH /api/households/records/<id>/` contract, sending only genuinely changed editable fields. Unchanged coordinates compare numerically; unchanged head/address/source are not normalized or resent. No-op edits make no write. New surveys retain the existing mobile POST path; no backend/shared-auth changes or new editing route/screen were introduced.
- Safety limits: absent required keys, invalid types, counts outside the existing 0-99 counters, unsupported enums (including stored water level `none`), unavailable barangay, missing/invalid coordinates and conflicting inapplicable septic values block editing with a field-specific explanation and no submit control. Stored NULL septic is distinct from a missing septic key; legacy applicable NULL/blank is preserved. No default is invented to make an incomplete record editable. Blank/custom/comma-separated water source strings are representable and preserved; water-source options were not redesigned.
- Red evidence: all 27 initial H2B widget/API tests failed against the pre-fix implementation, demonstrating default initialization, full POST payloads, water-level coupling and absent compatibility guards. First green: 59/59 H2B plus existing septic/remarks tests. Added targeted checks for explicit level/waste/toilet/zero-count changes, no-op legacy edits and conflicting septic data; final verification results are recorded below.
- Real local integration: asserted `django.db.backends.sqlite3` before migration/startup, then used a real loopback Django server at `127.0.0.1:64975` and the actual Dart `fetchSanitationStaffRecords` / `submitHouseholdSurvey` methods. Two persisted fixtures (`HH-H2B-STORED`, `HH-H2B-LEGACY`) had male/female 7/0, Pour flush, Level II, composted waste, coordinates 14.192345678/121.73456789, survey date 2025-07-04 and existing web remarks. The first had Spring/vault_sealed; the second had exact source `  Deep Well,  Private hand pump  ` and NULL septic. Changed only Address on each; actual PATCH and subsequent staff-bootstrap refresh passed. Direct SQL `SELECT *` comparison found exactly `address` and server-managed `updated_at` changed; every other column, including remarks, survey date and status, was identical.
- Integration harness corrections: initial scratch-test attempts failed before any edit request (Dart HTTP override typing, then reuse of an HTTP client closed by the helper). Corrected only the temporary harness to create a fresh real loopback client per request. Final actual-Dart integration test passed; server stopped and temporary database/token deleted. Tokens were not printed; no production API/database access.
- Verification: final focused tests 65/65 passed (33 H2B plus 32 existing septic/remarks); full Flutter suite 203/203 passed; `flutter analyze` reported No issues found; all commands exited 0. Test commands used `--dart-define=API_BASE_URL=http://127.0.0.1:8000/api` with mocked HTTP; the separate real-Dart integration used its loopback server URL. `git diff --check` passed.
- Scope/limits: sanitation household parser/model, existing form initialization/submission, household API method, focused tests and these two documents only. No backend/migration, tourism behavior, shared authentication, maps, dashboard, inspection, GPS/photo or web-form changes. Backend-managed timestamps and status calculation remain existing behavior. H2B was subsequently committed, merged, pushed, and accepted on a real phone.

## Household Survey - Backend Slice H2A: Septic Read-back (2026-09-30; uncommitted)
- Preflight: fetched `main == origin/main == 5549a106258c3e1585703d580923fcc215cfb7ea`, clean tracked state and only untracked `tatus`. Created `sanitation/household-septic-readback`; `tatus` remains untouched. H1B is now merged/pushed and its selector passed real-phone testing per the user; the older H1B section below describes its historical feature-branch state.
- Root cause: authenticated staff bootstrap uses the hand-written `serialize_mobile_household_record`, not `HouseholdSanitationRecordSerializer`. H1A added the model/main-serializer field, but the bootstrap dictionary omitted it. Added only `"septic_tank_type": record.septic_tank_type` to that dictionary: actual stored values and legacy NULL are returned without normalization, scoring, writes or schema changes.
- Focused red evidence: 5 new endpoint tests ran before the runtime fix; both authorized-role tests failed across 5 fixtures each (10 failing subcases), solely for the missing field. The other 3 permission/public-exposure tests passed. Green: 27/27 focused tests passed (5 H2A, 15 existing household septic/remarks, 7 existing staff/public bootstrap). Coverage includes all three septic choices, legacy applicable NULL, Pit latrine NULL, exact existing household fields, unchanged stored rows, sanitation/admin access, anonymous 401, other-role 403 and no public household exposure even with a staff token.
- Real integration: explicitly asserted `django.db.backends.sqlite3` before testing, migrated a throwaway local database through existing 0041, started a real Django server on `127.0.0.1:53357`, and made token-authenticated HTTP GETs to `/api/mobile/sanitation/staff-bootstrap/`. Sanitation and admin both returned HTTP 200: `HH-H2A-WATER / water_sealed / septic_tank`; `HH-H2A-POUR / pour_flush / vault_sealed`; `HH-H2A-LEGACY / water_sealed / null`; `HH-H2A-PIT / pit_latrine / null`. All existing household response fields matched storage, and all stored household fields remained unchanged after reads.
- Real HTTP permissions: anonymous staff bootstrap 401; tourism/tourist/establishment roles 403. Public `/api/mobile/sanitation/bootstrap/` returned 200 with `householdRecords: []` for anonymous and sanitation-token requests, with no fixture household names/codes or septic field. Response contracts matched the audit except for the intended additive staff field. Temporary tokens were never printed; server stopped and fixture database/tokens deleted. Local harness blocks non-loopback connections and disables external storage; no production API/database access.
- Checks: full backend suite 267/267 passed (`Ran 267 tests in 399.825s`, `OK`, native exit 0); test database destroyed. Existing upload-failure tests intentionally log mocked storage exceptions. `manage.py check` passed; `makemigrations --check --dry-run` reported No changes detected; `git diff --check` passed.
- Scope/limits: one sanitation bootstrap serialization line, focused backend tests and these two documents. No Flutter, tourism behavior, shared authentication, scoring, migrations, maps or inspection changes. Existing mobile edit-default overwrite issues remain outside H2A. No new compatibility issue identified; H2A phone refresh/read-back acceptance remains outstanding. No staging, commit, merge, push or deployment; actual Render dashboard build command remains user verification.

## Household Survey - Mobile Slice H1B (2026-09-30; feature branch)
- Branch `sanitation/household-septic-mobile`, based on fetched main/origin/main `fddd34a75d5ba9c3b5c61a07080785f2f963ea11`. Preflight passed with no tracked changes and only untracked `tatus`; it remains untouched.
- Added a `Septic tank type` dropdown using the existing Household Survey control style. It appears only for Water-sealed/Pour flush, starts without a selection for new surveys, and maps exactly `Septic tank` -> `septic_tank`, `Bottomless` -> `bottomless`, `Vault-sealed` -> `vault_sealed`. Existing toilet facility choices are retained.
- Selecting Pit latrine/None immediately clears the local septic selection and hides the control. Switching back does not restore hidden data and requires reselection; moving between applicable toilet types retains a selected value. New applicable surveys require a selection before submitting; inapplicable surveys do not.
- Approved preservation extension: `HouseholdSanitationItem` now retains nullable raw backend `toiletType`/`septicTankType` alongside its existing display fields. Existing-record initialization loads any valid stored toilet type and its applicable septic value instead of silently resetting to Water-sealed. Unrelated edits preserve both values. Untouched legacy applicable records with no septic value remain editable without fabricating one; omission lets H1A preserve their stored absence.
- `submitHouseholdSurvey` accepts optional `septicTankType` and includes `septic_tank_type` only for applicable toilets with a selected value. It defensively omits supplied stale septic values for Pit latrine/None; H1A clears the stored field using the submitted toilet type. Household code/authentication/other payload fields are unchanged, and Remarks remains omitted.
- Red evidence: 29 focused tests against pre-fix runtime code yielded 25 expected failures / 4 passes for missing model fields, selector, validation, API argument, and incorrect existing-record initialization. A test-harness-only bounded pump avoids waiting on the submit spinner behind the open success dialog. Green: 32/32 focused tests (29 new H1B tests plus 3 existing household Remarks tests), covering both applicable toilets, both inapplicable toilets, exact dropdown choices, all 12 toilet/septic payload combinations, required new input, transitions/reselection, edit initialization/preservation, legacy absence, authentication header and unchanged request fields. Pre-fix reflective calls were made statically typed after implementation.
- Verification: full Flutter suite 170/170 passed; `flutter analyze` reported No issues found; `git diff --check` passed. Focused/full runs used `--dart-define=API_BASE_URL=http://127.0.0.1:8000/api` with mocked HTTP; no production requests. The full run includes the 29 new tests and all 141 existing tests.
- Real local integration: explicitly asserted `django.db.backends.sqlite3`, applied migrations through existing H1A 0041, then ran a scratch Flutter test calling the actual Dart `TourismApi.submitHouseholdSurvey` against a loopback Django server with a temporary sanitation staff token. HTTP 201 responses: water_sealed/septic_tank/good_standing, pour_flush/vault_sealed/good_standing, and pit_latrine/NULL/for_completion. A further same-record update from Water-sealed to Pit latrine deliberately supplied a stale Dart argument; the API method omitted it, H1A cleared storage, and existing web Remarks survived. Direct SQLite SELECT confirmed the final rows, including pour_flush/vault_sealed and both Pit latrine rows with NULL/for_completion. The scratch integration test passed (native exit 0); server stopped, temporary token and database deleted. This validates the actual mobile API method and backend persistence, not a real-device UI session.
- Scope: sanitation household model parsing, existing survey form, household API method, tests and these two documents only. No backend/schema, tourism behavior, shared auth, map/provider, dashboard, inspection Findings/Remarks, water-level redesign or GPS/photo/EXIF changes. No new editing screen, deployment or production access. Finalized as one feature-branch commit; not merged or pushed. Real-phone Household Survey testing remains outstanding.

## Household Survey - Backend Slice H1A (2026-09-30; feature branch)
- Branch `sanitation/household-septic-backend`, based on fetched main/origin/main `6900817823224ef72bfab7ce223269f1cfc7d739`. Preflight showed no tracked changes and only `?? tatus`; that file remains untouched.
- Added `HouseholdSanitationRecord.septic_tank_type`: `CharField(max_length=30, choices=[("septic_tank", "Septic tank"), ("bottomless", "Bottomless"), ("vault_sealed", "Vault-sealed")], null=True, blank=True)`, with no default. Additive migration `0041_householdsanitationrecord_septic_tank_type.py` depends on 0040; existing records receive NULL, with no invented septic data or remarks reuse.
- The household serializer exposes and persists the optional field. Unknown values fail choice validation. Water-sealed/Pour flush accept the three choices, null or blank; omission preserves stored values on PATCH/full update and remains compatible with existing clients. For Pit latrine/None, successful create/update validation forces NULL, including toilet changes and unrelated updates of stale inapplicable records.
- Approved model correction is restricted to the existing score 7-9 branch: Pit latrine returns `for_completion` instead of `good_standing`. Existing violation branches and all score thresholds remain intact; None remains `violation`. Water-sealed/Pour flush scoring and serializer risk weights/thresholds are unchanged. This is a write-time correction, not a data backfill: existing stored statuses are recalculated on normal record save.
- Red evidence before runtime/schema changes: 13 new tests ran with 20 expected assertion failures (including subcases); the None regression passed. Failures demonstrated absent field/schema, ignored invalid choices, missing persistence/clearing and high-scoring Pit latrine incorrectly reaching good standing. Green focused suite: 15/15 (13 new tests plus 2 existing household Remarks tests), including all 64 toilet/water/waste combinations, stale-value clearing, omitted/blank/null values, PATCH/full-update preservation, and a real migration of an existing 0040 row without septic data.
- Real integration used only a throwaway file with engine explicitly asserted `django.db.backends.sqlite3`; all migrations including 0041 applied. A loopback Django server required auth (unauthenticated GET 401). Token-authenticated `POST /api/households/records/` returned 201 with water_sealed/septic_tank/good_standing; unrelated PATCH returned 200 and preserved septic_tank. Changing the same record to pit_latrine returned 200 with NULL/for_completion; GET and direct SQLite SELECT confirmed persistence and preserved remarks. None returned NULL/violation; unknown septic value returned 400. Actual `POST /api/mobile/sanitation/household-surveys/` requests returned 201 for pour_flush/vault_sealed, preserved vault_sealed when omitted, then cleared it for pit_latrine/for_completion. Local server stopped and throwaway database deleted; no production API/DB access.
- Checks: `makemigrations --check` reported No changes detected; `manage.py check` reported no issues; `git diff --check` passed. Full backend suite: 262/262 passed (`Ran 262 tests in 499.319s`, `OK`), with the test database destroyed. PowerShell stderr redirection returned wrapper code 1 despite the successful Django result; simulated upload-error tracebacks are from existing mocked error-path tests.
- Scope: backend model/serializer/migration/tests and these two tracking documents only. No Flutter/mobile files, tourism, shared auth/login, map/provider, dashboard or inspection changes. Finalized as one feature-branch commit; not merged or pushed. Mobile Household Survey UI support and mobile-required validation remain pending; H1B has not started.

Comprehensive standalone codebase audit generated on September 18, 2026.

## Current Update: Staff Home Dashboard - Slice 3B UI (2026-09-29; feature branch)
- Real-phone alignment follow-up (separate feature-branch commit): client testing exposed uneven metric-card heights from wrapping labels/counts. Home metric cards now reserve consistent 34px count/state and 40px two-line label slots; long counts scale down within their slot. Approved labels, data rules and other screens are unchanged. Three new 360px alignment tests failed before the fix and pass after it, checking equal heights, count/label positions and label bounds across loading/unavailable/loaded states, including a nine-digit count. Focused UI 13/13; full Flutter suite 141/141; analyzer No issues found!; diff check passed. The adjusted layout still needs real-phone recheck; no new APK was built.
- Branch `sanitation/staff-dashboard-ui`, based on verified fetched main/origin/main `38568b2`. Home now renders the approved identity greeting/bell, four 2x2 stat tiles, pending complaints and due inspections. Only Home presentation and sanitation-shell dashboard loading changed; shared styles and Slice 3A calculations are untouched.
- The shell supplies the already-loaded authenticated staff payload to `loadSanitationDashboard`. No second identity fetch or independently derived dashboard metrics. Counts retain complete-source/authoritative-summary/date-window rules from Slice 3A. Loading and unavailable text differ from valid numeric zero; list failures never masquerade as empty results. Real created_at is formatted in device local time; missing time is labeled unavailable. URGENT/STANDARD comes from the display-only priority getter. The client residents heading is not evidence of a resident-origin filter.
- See all reuses `_openComplaints` / `SanitationReportsPage`; Inspect resolves the exact establishment ID and reuses `_openInspection` / `SanitationInspectionPage.initialEstablishment`. Unmatched establishment records disable the action with a refresh message. Notification route and signed-in identity are retained. Refresh button/pull-to-refresh reload data; stale loads are discarded and 401 retains existing expiry behavior.
- Obsolete Home stat/alerts/recent-activity widgets are removed from Home only; underlying APIs/models and Profile history remain. Public Verify/Track, Household Remarks omission, survey fields, inspection text, establishment filters, backend and tourism remain unchanged. Local styling uses the approved palette, white bordered cards and radius 18.
- Verification: pre-fix 8 expected UI failures / 1 bell pass; final 41/41 focused tests (10 UI plus data/bootstrap/identity), 138/138 full Flutter suite, analyzer No issues found!, clean diff check. Widget coverage includes exact stat states, pending order/content, existing routes/preselection, 401, refresh recovery, one identity fetch, 360px width and pull-to-refresh. Existing test doubles were extended for the two dashboard sources; no real service was queried.
- Android verification unavailable: only Windows/Chrome/Edge detected and no emulator sources. Final real-phone smoke test of sign-in, tiles, complaints/See all, due/Inspect, bell and refresh remains required. No production access; `tatus` untouched; finalized as one feature-branch commit; not merged or pushed.

## Current Update: Staff Home Dashboard - Slice 3A Data (2026-09-29; feature branch)
- Branch `sanitation/staff-dashboard-data`, based on fetched `main`/`origin/main` at `5b34db0`. Added sanitation dashboard models/helpers and an authenticated data-loading stream only; Home remains unwired and visually unchanged. No backend changes needed.
- Sources: staff-bootstrap complete establishments and householdRecords; `/api/sanitation/complaints/?status=pending` authoritative `summary.pending` plus full pending detail/`created_at`; `/api/sanitation/inspections/` complete array rather than capped bootstrap inspection rows. Dedicated sanitation array handling leaves shared response decoding unchanged. Optional supplied staff data must be a successfully loaded authenticated payload.
- Pending rows are ordered by actual timestamp descending with raw priorities retained (high -> URGENT; all other current values -> STANDARD); no provenance inference or fabricated timestamp. Household parser now reads actual `last_survey_date`, not `survey_date`/`date`; count is distinct records whose latest date is in the current device-local month, not visit history. Missing dates do not count.
- Due selection: ignore drafts; choose latest finalized by inspection_date then ID per establishment before considering due date; missing schedule is excluded; include overdue/today/next seven calendar days inclusive and order earliest first. Retain establishment ID, name, business type and selected inspection ID. Newer finalized records suppress older schedules even when the newer schedule is absent/outside the window.
- Loading/loaded/unavailable are explicit. Only a complete valid snapshot yields counts (including valid zero); request/malformed-source failure yields null data plus the original error, preserving ApiException 401 for future session handling. No silent fallback to zero or capped complaint rows.
- Tests: pre-fix 12 failures (wrong household-date field and absent new loader); post-fix 18/18 focused, 128/128 full, analyzer clean and diff check passed. Contract tests became typed after introducing the API. Coverage includes summary-vs-row counts, timestamps/priorities, local month boundaries, draft/superseded/date-window/uniqueness rules, >25 inspection array and failure-vs-zero states.
- Real integration: SQLite engine confirmed before starting a loopback-only Django server on port 59055. Authenticated staff-bootstrap, pending complaints and complete inspections each returned HTTP 200. Fixture output: 3 establishments, pending=1 with actual timestamp, 1 household surveyed 2026-09-29; bootstrap inspections=25 versus complete array=30. Draft and 26 superseded records excluded, leaving overdue 2026-09-28 and upcoming 2026-10-06; outside 2026-10-07 excluded. Server stopped and throwaway DB deleted; no production requests or credentials printed. This verifies real endpoints plus separate Flutter mock-based data tests, not a device UI smoke test.
- No Home UI, Household Survey, Inspection Findings/Remarks, establishment-filter, tourism, backend/schema or shared-login edits. `tatus` untouched; finalized as one feature-branch commit; not merged or pushed.

## Current Update: Staff Mobile Cleanup - Slice 2B (2026-09-29; feature branch)
- Branch `sanitation/staff-profile-identity`, based on fetched `main`/`origin/main` at `bf27cd4`. Sanitation staff identity now comes from existing authenticated `GET /api/auth/me/`, using the current stored token. The backend already supplies nested user display name, username and profile role label; no backend/shared-auth/schema edit was needed.
- A shell-session identity value is loaded once and passed to Home, drawer and Profile. Fallback order is trimmed display name, username, neutral `Sanitary Inspector`. Home uses `Good day, [name]` without changing dashboard tiles/lists or bell navigation. Profile clearly shows identity above existing actions and both submission receipt lists; category chips and their filter state are removed, not history data.
- Identity and staff-record 401 failures share the existing expiry path (clear staff auth preferences, call the existing gateway callback or show the existing message), guarded against duplicates and late responses. Non-auth identity errors retain the session with neutral identity and an error message. No new auth mechanism or password/identity persistence. Tab switches and record refreshes do not repeat identity requests.
- Red evidence: 9 expected failures / 2 passes against pre-fix code. Thirteen new identity tests now cover names/fallbacks, Profile/drawer, authenticated GET and single-fetch behavior, bell, logout, both 401 paths, concurrent 401, non-auth failure and both history types without chips. Focused suite 24/24; full Flutter suite 116/116; final analyzer clean after one test-only style correction; diff whitespace check passed. Existing test API fakes were updated to avoid real requests from signed-in shells, with no role/login behavior changes.
- No Android device/emulator was available (Windows/Chrome/Edge only; no emulator sources). Verification is widget/API-mock based, using a loopback API base URL; actual phone session smoke testing remains outstanding. No APK build, production API/DB access, tourism edits, dashboard redesign, survey redesign, inspection-text or establishment-filter changes. `tatus` untouched; finalized as one feature-branch commit; not merged or pushed.

## Current Update: Staff Mobile Cleanup - Slice 2A (2026-09-28; feature branch)
- Branch `sanitation/staff-households-tab`, based on fetched `main`/`origin/main` at `c816c19`. Changed only sanitation staff navigation: Home / Records / Map / Households / Profile. SanitationHouseholdsPage displays existing householdRecords from staff bootstrap (head, barangay, supplied survey date and status), an honest empty state and a button to the existing HouseholdSurveyPage. No backend or model extension required.
- Replacing Community would remove the sole staff complaints-screen entry. A new `Complaints` drawer item opens the unchanged SanitationReportsPage; a route wrapper preserves back navigation, refresh and existing report/draft/survey callbacks, rebuilding after actions to avoid stale data. Public Track Report remains public-only.
- Five pre-fix tests failed as expected. Six new tests now cover nav labels, actual household content, empty state, unchanged survey form without Remarks, complaints navigation/back behavior and complaints refresh; the existing shortcut test now selects Households. Focused suite 17/17; full Flutter suite 103/103; analyzer reports no issues; diff whitespace check passed. Prior public Verify/Track and household Remarks tests remain green.
- No backend/API changes, production API/DB access, tourism/shared-login edits, Profile/identity/dashboard redesign, survey-field changes, inspection-text changes or establishment-filter changes. Only existing bootstrap fields are displayed; a missing survey date is omitted.
- Android device verification remains outstanding: only Windows/Chrome/Edge detected and no emulator sources. Widget tests used mocks with loopback API configuration. No APK build or real-phone smoke-test claim. `tatus` untouched; finalized as one feature-branch commit; not merged or pushed.

## Current Update: Staff Mobile Cleanup - Slice 1 (2026-09-28; feature branch)
- Branch `sanitation/staff-cleanup-public-shortcuts`, based on fetched `main`/`origin/main` at `af8af1e`. Sanitation Flutter UI only: removed the entire Home Quick Actions section, drawer Verify/Track entries, Community tracker button and Profile/Actions Verify/Track links, plus their staff callback plumbing.
- Public Verify entry is unchanged. New public `Track a report` link opens the existing ReportTrackerPage. Both underlying pages and API methods remain intact. The tracker requires contact number plus complaint ID; backend exact normalized-contact matching is unchanged. No backend/API/schema change and no new lookup bypass.
- New focused tests: pre-fix 5 expected failures and 3 passes; post-fix all 8 passed in the 22-test relevant suite. Full Flutter suite 97/97; `flutter analyze` found no issues. Tests cover Home/drawer/Community/Profile/Records absence, public Verify and Track navigation, missing-input blocking and the actual mocked GET path/query for the existing tracker API.
- Real loopback Django server check with an explicitly confirmed throwaway SQLite engine: `/api/mobile/sanitation/reports/history/` returned 400 for missing contact, 200/zero rows for wrong contact, and 200/one fixture row for matching contact and reference. `/api/mobile/sanitation/permits/verify/?code=LOCAL-NOT-A-PERMIT` returned 404/`verified: false`. Initial temporary settings needed the throttle cache alias for migration; corrected outside the repo. Server stopped; temporary databases removed. No production API/DB or production settings access.
- No Android device/emulator was available (Windows/Chrome/Edge only; no emulator sources). Widget navigation and real local HTTP checks passed, but actual Android public navigation and signed-in staff smoke tests remain for the user's phone. No APK build or device-verification claim.
- No Households/nav/Profile/dashboard/household-form redesign, inspection text changes, filter changes, shared components/colors, tourism or shared-login changes. `tatus` untouched. Finalized as one feature-branch commit; not merged or pushed.

## Current Update: Mobile Household Remarks Removal (2026-09-28; feature branch)
- Branch `sanitation/remove-mobile-household-remarks`, based on fetched `main`/`origin/main` at `0fcf75d`. This update supersedes any earlier description of Remarks as a mobile household form input; backend/model/web Remarks remain supported.
- The client-confirmed household form does not include Remarks. Only the Flutter HouseholdSurveyPage input/controller and its submission argument were removed. The sanitation method `submitHouseholdSurvey` omits the JSON `remarks` key, rather than supplying an empty value. No other household field or scoring rule changed; inspection Findings/Remarks, tourism and shared login are unchanged.
- Preservation dependency: `mobile_household_survey_submit` updates an existing `household_code` using `HouseholdSanitationRecordSerializer(..., partial=True)`. An omitted key preserves existing notes, while an explicit empty string clears them. Backend `HouseholdSanitationRecord.remarks` remains `TextField(blank=True)`; a new mobile record naturally gets an empty value. Web entry, detail, printing, CSV and backend search remain intact. No backend runtime/schema change or migration.
- Red -> green: `sanitation_household_remarks_test.dart` tests actual mocked HTTP bodies for create/update and the absent form input. All 3 failed before the fix (the key was present and the widget existed), then passed. API-test invocation was adjusted for the removed required argument; expectations stayed the same. Full Flutter suite 89/89; after fixing one style info in the new test, focused tests 3/3 and `flutter analyze` reported `No issues found!`.
- `api.test_household_remarks.MobileHouseholdRemarksTests`: 2 tests prove existing nonempty notes survive an omitted key and new records use the empty default. They passed before and after the mobile fix, pinning already-correct backend behavior. Engine explicitly confirmed `django.db.backends.sqlite3`; tests ran on an isolated in-memory SQLite database that Django destroyed afterwards.
- Real local-server verification used a separate throwaway SQLite file, migrated to 0040, and a loopback-only Django server. POST `http://127.0.0.1:50824/api/mobile/sanitation/household-surveys/` omitted `remarks`, changed head/counts on `HH-REMARKS-LIVE`, and returned 201 with the original `Existing web notes must survive the mobile survey.` Direct SQLite SELECT confirmed one updated row, head `Local Survey Household`, male/female 2/3, and identical notes. No login endpoint was called; temporary authentication was never printed. Server stopped and database deleted (cleanup retried successfully after an initial Windows open-file lock).
- Finalized as one feature-branch commit. No production API/DB access, merge, push or APK build. `tatus` untouched. This change has not been tested on a phone; the user's completed APK 1.0.4 phone review preceded it.

---

## 1. Project Overview

- **Core Description**:
  - An integrated local government e-governance and operational information system built for the Local Government Unit (LGU) of the **Municipality of Mauban, Quezon Province, Philippines**.
  - Dual-core system addressing two municipal departments:
    1. **Municipal Tourism Office**: Visitor registration, digital tourist entry passes (with scannable QR codes), resort/destination directory, front-desk arrival verification, Excel booking imports, visitor demographics reporting, ratings/feedback moderation, and interactive GIS tourist maps.
    2. **Municipal Health Office / Sanitary Section**: Commercial establishment sanitary permit issuance and renewal monitoring, digital field inspection checklists, citizen sanitation complaints with GPS/photo documentation, household sanitation surveys (evaluating toilet types, water service levels, waste disposal), 40-barangay GIS spatial analysis, automated permit/inspection due-date scanning, and public health advisories.
- **Client Applications**:
  - **Backend REST API (`backend/`)**: Django / Django REST Framework API powering data persistence, business logic, background evaluation, role gating, and automated triggers.
  - **Administrative Web Portal (`frontend/`)**: Single-page desktop web application (React) featuring dedicated modules for Tourism Office staff and Sanitary Section staff, interactive dashboards, GIS maps, data tables, and CSV exports.
  - **Mobile Application (`mobile/`)**: Cross-platform Flutter application providing public tourist guides, digital entry pass sharing, front-desk QR ticket scanner, citizen sanitation reporting, public permit verification, and field inspector survey/inspection tools.
- **Target Users**:
  - **LGU System Administrators**: User provisioning, staff access control, audit log inspection, system-wide settings, data imports.
  - **Tourism Office Staff**: Visitor monitoring, online booking management, resort administration, feedback response, analytics generation.
  - **Resort Front-Desk / Tourism Check-in Staff**: Field personnel scanning tourist QR codes at entry ports and accommodations to record arrivals in real time.
  - **Sanitary Inspectors / Health Officers**: Field personnel conducting scheduled business inspections, evaluating sanitation checklists, investigating complaints, and surveying household sanitation facilities.
  - **Commercial Establishment / Resort Owners**: Business proprietors tracking sanitary permit statuses, compliance deadlines, inspection history, and renewal requirements.
  - **Tourists & General Public**: Visitors registering trips to Mauban, discovering resorts, checking in via QR passes, submitting reviews, filing community sanitation concerns, and viewing municipal advisories.

---

## 2. Tech Stack

### Backend
- **Language & Framework**: Python 3.x, **Django 6.0.4**, **Django REST Framework (DRF) 3.17.1**
- **WSGI / Production Server**: Gunicorn `>=23.0.0`, WhiteNoise `>=6.8.0` (static asset compression and delivery)
- **Database Connector**: `psycopg2-binary 2.9.12`, `dj-database-url >=2.3.0`
- **Environment & Configuration**: `python-decouple 3.8`
- **File & Spreadsheet Processing**: `openpyxl 3.1.5`, `et_xmlfile 2.0.0`
- **Cloud Storage**: `django-storages >=1.14.0`, `boto3 >=1.35.0` (Supabase S3-compatible object storage)
- **Utilities**: `asgiref 3.11.1`, `sqlparse 0.5.5`, `tzdata 2026.2`

### Frontend (Web Portal)
- **Framework & Runtime**: **React 19.2.4**, `react-dom 19.2.4`, Create React App (`react-scripts 5.0.1`)
- **Routing**: `react-router-dom 7.14.0`
- **Styling**: Tailwind CSS 3.x (`tailwindcss`, `postcss 8.4.49`, `autoprefixer 10.4.20`), custom scoped CSS files
- **Tourism theming**: tourism colours are `--th-*` CSS tokens. The contract, exceptions and verification method are in `frontend/src/tourism/THEME_TOKENS.md`; read it before editing `Tourism_index.css`.
- **Charts & Data Visualization**: `chart.js 4.5.1`, `react-chartjs-2 5.3.1`
- **GIS Mapping**: `leaflet 1.9.4`, `react-leaflet 5.0.0`, `leaflet.heat 0.2.0`
- **QR Code Generation**: `qrcode.react 4.2.0`
- **Icon Library**: `react-icons 5.6.0`
- **Performance**: `web-vitals 2.1.4`

### Mobile Application
- **Framework & SDK**: **Flutter 3.x**, **Dart SDK ^3.12.0**
- **Networking & API**: `http ^1.2.2`, `http_parser ^4.1.0`
- **GIS Mapping**: `flutter_map ^8.3.0`, `latlong2 ^0.9.1`
- **Device Hardware & Peripherals**:
  - `mobile_scanner ^7.2.0` (camera-based hardware QR code scanner)
  - `geolocator ^14.0.2` (GPS hardware location capture)
  - `image_picker ^1.2.2` (camera capture & device photo library selector)
- **Storage & State**: `shared_preferences ^2.5.5` (persistent local tokens and session metadata)
- **Export & Sharing**: `share_plus ^10.1.4`, `path_provider ^2.1.5` (native OS file share sheets for CSV reports and PNG QR tickets)
- **Typography & UI**: `google_fonts ^8.1.0`, `cupertino_icons ^1.0.8`, `qr_flutter ^4.1.0`

### Databases & Storage
- **Primary Database**: **PostgreSQL** hosted on **Supabase** (direct or pooled connection via `aws-1-ap-southeast-2.pooler.supabase.com:5432` with SSL enabled, `CONN_MAX_AGE=600`).
- **Development Fallback Database**: Local SQLite (`db.sqlite3` via `DB_ENGINE=sqlite`).
- **Cache Layer**: Django `LocMemCache` (15-minute TTL on master reference tables and active barangays).
- **Media Asset Storage**: Supabase S3-compatible Storage bucket (`media`) with fallback to local `FileSystemStorage` (`backend/media/`).

### Authentication Method
- **Token Authentication**: Django REST Framework `rest_framework.authtoken.models.Token`. Returned on `/api/auth/login/` and transmitted via HTTP header `Authorization: Token <token_key>`.
- **Session Authentication**: DRF `SessionAuthentication` enabled for Django browsable API and admin interface.
- **Webhook Authentication**: Shared secret key (`CRON_SECRET_KEY`) validated via timing-safe `hmac.compare_digest` in `X-Cron-Key` header or `Authorization: Bearer <key>`.

### Third-Party APIs & Services
| Service | Integration Purpose | Implementation Location |
| :--- | :--- | :--- |
| **Supabase PostgreSQL** | Cloud-hosted relational database | `backend/backend/settings.py` via `dj-database-url` / `psycopg2` |
| **Supabase S3 Storage** | Object storage for resort images, complaints, feedback, and inspection photos | `backend/backend/settings.py`, `backend/api/services/upload.py` via `boto3` / `storages` |
| **OpenStreetMap (OSM)** | Public tile server for tourism and sanitation GIS maps | `frontend/src/tourism/pages/GISMap.js`, `frontend/src/sanitation/pages/SanitaryGISMap.js`, `mobile/lib/screens/tourism_screens.dart` |
| **Render PaaS** | Cloud hosting environment | `backend/build.sh`, `mobile/lib/utils/helpers.dart` (default URL) |
| **External Cron / Webhook** | Automated daily permit/inspection due-date evaluation | `POST /api/notifications/evaluate-due/` via `backend/api/views/notifications.py` |

### Key Packages Actually Imported & In Use
- **Backend**: `django`, `rest_framework`, `rest_framework.authtoken`, `corsheaders`, `decouple`, `dj_database_url`, `whitenoise`, `openpyxl`, `psycopg2`, `storages`, `boto3`.
- **Frontend**: `react`, `react-dom`, `react-router-dom`, `react-icons`, `leaflet`, `react-leaflet`, `leaflet.heat`, `chart.js`, `react-chartjs-2`, `qrcode.react`.
- **Mobile**: `flutter`, `http`, `flutter_map`, `latlong2`, `mobile_scanner`, `image_picker`, `geolocator`, `shared_preferences`, `qr_flutter`, `share_plus`, `path_provider`, `google_fonts`, `http_parser`.

---

## 3. Project Structure

```text
Capstone_System/
├── PROGRESS.md                    # Historical engineering changelog & testing status
├── PROJECT_AUDIT.md               # This comprehensive codebase audit
├── backend/                       # Django backend application
│   ├── manage.py                  # Django CLI entrypoint
│   ├── requirements.txt           # Python package dependencies
│   ├── build.sh                   # Deployment script (collectstatic + migrate)
│   ├── .env                       # Local environment variables
│   ├── backend/                   # Django core project configuration
│   │   ├── settings.py            # Main application settings, DB config, storages
│   │   ├── urls.py                # Root URL dispatcher
│   │   ├── wsgi.py                # WSGI entrypoint
│   │   └── asgi.py                # ASGI entrypoint
│   ├── api/                       # Main API application package
│   │   ├── models.py              # ORM data models (18 models)
│   │   ├── serializers.py         # DRF serializers & validation logic
│   │   ├── urls.py                # API routing table (/api/...)
│   │   ├── auth_views.py          # Authentication & registration endpoints
│   │   ├── permissions.py         # Role-based access control decorators
│   │   ├── seeders.py             # Reference data & seed initializers
│   │   ├── seed_data.py           # Static datasets (barangays, requirements, resorts)
│   │   ├── tests.py               # Comprehensive unit & integration test suite (39 tests)
│   │   ├── views/                 # Modular API view controllers
│   │   │   ├── shared.py          # Health, activity logs, reference data
│   │   │   ├── tourism.py         # Tourism web endpoints (bookings, resorts, feedback)
│   │   │   ├── sanitation.py      # Sanitation web endpoints (establishments, inspections)
│   │   │   ├── mobile.py          # Mobile app endpoints (check-in, complaints, surveys)
│   │   │   └── notifications.py   # Staff & public notifications, cron webhook
│   │   ├── services/              # Business logic & domain computation layer
│   │   │   ├── activity.py        # Audit trail logger
│   │   │   ├── household.py       # Household statistics & scoring
│   │   │   ├── notifications.py   # Notification dispatch & trigger logic
│   │   │   ├── online_booking.py  # Excel parsing & resolution for bookings
│   │   │   ├── sanitation.py      # Sanitation KPI calculations & renewal pipelines
│   │   │   ├── tourism.py         # Tourism aggregations & reporting metrics
│   │   │   └── upload.py          # Image validation & S3 upload helpers
│   │   └── management/commands/   # Custom administrative Django commands
│   │       ├── create_default_users.py     # Provision standard demo user accounts
│   │       ├── evaluate_due_notifications.py# Scan expiring permits and inspections
│   │       ├── import_online_bookings.py   # CLI import for booking spreadsheets
│   │       ├── import_sanitary_permits.py  # CLI import for sanitary permit masterlists
│   │       ├── import_tourism_excel.py     # CLI import for historical arrivals
│   │       └── purge_demo_households.py    # Database cleanup utility
│   ├── mock_scripts/              # Legacy one-off utility scripts for manual data seeding
│   ├── data_backups/              # Gitignored persistent database snapshot JSON dumps
│   └── media/                     # Local fallback upload directory
├── frontend/                      # React SPA Web Portal
│   ├── package.json               # Node.js dependencies and run scripts
│   ├── tailwind.config.js         # Tailwind configuration
│   ├── postcss.config.js          # PostCSS processor configuration
│   ├── public/                    # Static assets, HTML shell, icons
│   └── src/                       # Application source code
│       ├── App.js                 # App root with providers, routing, role gating
│       ├── index.js               # React DOM render entrypoint
│       ├── auth/                  # Authentication & session components
│       │   ├── AuthContext.js     # React auth context provider & token restore
│       │   ├── LoginPage.js       # Split-pane credential login interface
│       │   ├── ModuleSelectionPage.js # Admin switcher between Tourism and Sanitation
│       │   ├── ProtectedRoute.js  # Role-gated route wrapper
│       │   └── authApi.js         # Auth HTTP client requests
│       ├── shared/                # Shared utilities & components
│       │   ├── apiClient.js       # Base Fetch API client with timeout and auth headers
│       │   ├── ErrorBoundary.js   # Component-level React error boundary
│       │   ├── csvExport.js       # Browser-side CSV file download utility
│       │   ├── LocationPicker.js  # Leaflet pin-drop coordinate selector
│       │   ├── PageLoader.js      # Minimalist loading spinner
│       │   └── pages/             # Shared pages (ActivityLogsPage)
│       ├── tourism/               # Tourism Office Web Module
│       │   ├── tourismRoutes.js   # Tourism routing table
│       │   ├── Tourism_index.css  # Tourism portal design system & styles
│       │   ├── context/           # TourismDataContext (centralized data caching)
│       │   ├── components/layout/ # AppShell, Sidebar, Header, NotificationBell
│       │   └── pages/             # Tourism pages
│       │       ├── Dashboard.js            # KPI metrics, monthly arrival charts
│       │       ├── BookingManagement.js    # Visitor records, status actions, import
│       │       ├── ArrivalMonitoring.js    # Live arrivals monitoring table
│       │       ├── DestinationManagement.js# Resort CRUD, photo gallery, ratings
│       │       ├── FeedbackMonitoring.js   # Tourist reviews & replies
│       │       ├── AnalyticsAndReport.js   # Statistical breakdowns, CSV exports
│       │       └── GISMap.js               # Leaflet map with resort markers & heatmap
│       └── sanitation/            # Sanitary Section Web Module
│           ├── sanitationRoutes.js# Sanitation routing table
│           ├── Sanitation_index.css# Sanitation portal design system & styles
│           ├── context/           # SanitationDataContext (centralized data caching)
│           ├── components/layout/ # SanitationAppShell, SanitationSidebar
│           └── pages/             # Sanitation pages
│               ├── SanitationDashboard.js     # Health compliance KPIs, alerts
│               ├── TypesAndRequirements.js    # Business classifications & rules
│               ├── EstablishmentRecords.js    # Commercial establishment directory
│               ├── InspectionManagement.js    # Inspection checklists, findings
│               ├── ComplaintsManagement.js    # Citizen concerns & dispatch schedules
│               ├── PermitMonitoring.js        # Active/expiring permit monitoring
│               ├── PermitRenewal.js           # 8-stage renewal tracking pipeline
│               ├── SubmissionTracking.js      # Document verification tracking
│               ├── SanitaryReportAnalytics.js # Compliance analytics & graphs
│               ├── HouseholdRecords.js        # Barangay household sanitary surveys
│               ├── HouseholdReportAnalytics.js# Water & toilet facility demographics
│               ├── SanitaryGISMap.js          # Spatial map of establishments & issues
│               ├── StaffManagement.js         # Sanitary inspector account management
│               └── VerifyPermit.js            # Public web permit lookup verification
└── mobile/                        # Cross-Platform Flutter Mobile Application
    ├── pubspec.yaml               # Flutter package configuration & assets
    ├── lib/                       # Mobile application source
    │   ├── main.dart              # Main entrypoint (Tourism default or auto-switch)
    │   ├── main_sanitation.dart   # Dedicated Sanitation entrypoint
    │   ├── constants/colors.dart  # AppColors color palette
    │   ├── models/models.dart     # Dart domain models with JSON deserializers
    │   ├── services/api.dart      # HTTP API client for all mobile endpoints
    │   ├── utils/                 # Mobile utilities
    │   │   ├── helpers.dart       # General formatters, parsing, storage keys
    │   │   ├── export_helpers.dart# RFC 4180 CSV builder, file saver, share handler
    │   │   ├── web_branding.dart  # Browser tab title/favicon bridge for web preview
    │   │   └── web_download.dart  # Browser blob download helper
    │   ├── widgets/               # UI components
    │   │   ├── widgets.dart       # Common buttons, cards, headers, digital pass
    │   │   ├── striped_polygon_layer.dart # Custom OSM polygon painter
    │   │   └── tourism_loading_screen.dart# Custom animated tourism loading view
    │   └── screens/               # Mobile views
    │       ├── common_screens.dart           # Onboarding, notification page, profile
    │       ├── tourism_screens.dart          # Public tourist guide, registration form
    │       ├── tourist_qr_checkin_screens.dart# Staff QR scanner, check-in, history
    │       ├── sanitation_screens.dart       # Citizen report form, inspector tools
    │       └── qr_scanner_screen.dart        # Hardware camera barcode reader screen
    └── test/widget_test.dart      # Flutter smoke test
```

---

## 4. Data Models / Schema

All models are defined in [backend/api/models.py](file:///c:/Users/THINKPAD%20T480S/Desktop/Capstone_Project/Capstone_System/backend/api/models.py).

### Core & Reference Tables
1. **`UserProfile`**
   - Extends Django's `auth.User` via a One-to-One relationship (`related_name="profile"`).
   - Key fields: `user` (OneToOneField), `role` (CharField: `admin`, `tourism`, `sanitation`, `establishment`).
2. **`ActivityLog`**
   - System-wide audit log for data mutations.
   - Key fields: `user` (FK User, nullable), `module` (`tourism`, `sanitation`), `action` (`create`, `update`, `delete`), `record_type`, `record_id`, `record_label`, `created_at`.
3. **`Barangay`**
   - The 40 administrative barangays of Mauban.
   - Key fields: `name` (unique), `municipality` (default: "Mauban"), `province` (default: "Quezon"), `display_order`, `is_active`.
4. **`NamedReference` (Abstract Base Model)**
   - Base model with `id` (PositiveIntegerField PK) and `name` (CharField).
   - Concrete derived models:
     - `Country`: `type` (`local`, `foreign`).
     - `Region`: `code`.
     - `Province`: `region` (FK `Region`, `on_delete=PROTECT`), `code`.
     - `Itinerary`: standard travel itinerary packages.
     - `TravelMode`: modes of travel (e.g., Private, Commute).
     - `BoatType`: passenger boat categories.
     - `VisitPurpose`: purpose categories (canonical: Leisure, Vacation, Business, etc.).

### Tourism Module Models
5. **`Resort`**
   - Tourism accommodations and destinations.
   - Key fields: `resort_id` (PK), `resort_name`, `with_mayors_permit` (bool), `type`, `location`, `short_description`, `tourism_rating` (float), `access`, `itinerary_ids` (JSONField), `latitude`, `longitude`, `images` (JSONField list of image URLs), `monthly_arrivals` (int), `user` (FK User, nullable).
6. **`FeedbackEntry`**
   - Tourist reviews and satisfaction scores.
   - Key fields: `destination` (FK `Resort`, `on_delete=CASCADE`), `reviewer`, `rating` (1-5), `status` (`positive`, `neutral`, `negative`), `date`, `title`, `message`, `reply` (staff response), `photos` (JSONField).
   - *Signal Trigger*: `post_save` and `post_delete` signals automatically recalculate the parent `Resort.tourism_rating` as the aggregate average.
7. **`TouristStat`**
   - Aggregated monthly tourism metrics cache (`total_arrivals`, `monthly_visits`, `top_destinations`, `satisfaction`).
8. **`TouristRecord`**
   - Primary visitor registration and arrival record.
   - Key fields: `survey_id` (PK, format: `SURV-YYYY-XXXXX`), `submitted_at`, `email`, `consent_confirmed`, `first_name`, `last_name`, `full_name`, `contact_number`, `country_of_origin`, `arrival_date`, `status` (`pending`, `arrived`, `no_show`), `boat_capacity_fare`, `parking_space`, `created_at`, `updated_at`.
   - Demographic count fields: `total_visitors`, `filipino_count`, `foreigner_count`, `maubanin_count`, `total_male`, `total_female`, `special_group_count`, `age_0_7`, `age_8_59`, `age_60_above`.
   - Foreign Keys (all `on_delete=PROTECT`): `country`, `region`, `province`, `itinerary`, `resort`, `travel_mode`, `boat_type`, `visit_purpose`.
   - *Validation*: `clean()` strictly enforces:
     - `total_visitors == foreigner_count + filipino_count`
     - `maubanin_count <= filipino_count`
     - `total_visitors == total_male + total_female`
     - `total_visitors == age_0_7 + age_8_59 + age_60_above`
     - `special_group_count <= total_visitors`
9. **`ResortMonthlyArrival`**
   - Historical monthly tourist arrival counts by destination.
   - Key fields: `resort` (FK `Resort`), `year`, `month`, `total_arrivals`. Unique together on (`resort`, `year`, `month`).

### Sanitation Module Models
10. **`SanitaryBusinessType`**
    - Commercial business categories (e.g., Food Establishment, Water Refilling Station).
    - Key fields: `name` (unique), `inspection_frequency` (`monthly`, `quarterly`, `annual`), `description`.
11. **`SanitaryRequirement`**
    - Mandatory compliance rules per business type.
    - Key fields: `business_type` (FK `SanitaryBusinessType`), `permit_size` (`sp`, `large`), `requirement_name`, `is_required`. Unique together on (`business_type`, `permit_size`, `requirement_name`).
12. **`SanitaryEstablishment`**
    - Physical business establishments monitored by the Health Office.
    - Key fields: `business_name`, `owner_name`, `business_type` (FK `SanitaryBusinessType`, `on_delete=PROTECT`), `permit_size` (`sp`, `large`), `barangay`, `address`, `contact_number`, `user` (FK User, nullable), `has_permit` (bool), `permit_number`, `permit_issued_date`, `permit_expiry_date`, `compliance_status` (`good_standing`, `upcoming`, `for_completion`, `violation`, `no_permit`), `permit_status` (`active`, `renewal_due`, `conditional`, `suspended`, `no_permit`), `latitude`, `longitude`, `remarks`.
    - *Auto Coordinates*: Automatically applies `resolve_barangay_coordinates()` if lat/long are missing.
13. **`SanitaryPermitRenewal`**
    - Multi-stage permit renewal application workflow.
    - Key fields: `renewal_id` (unique, format: `REN-YYYY-XXXXX`), `establishment` (FK `SanitaryEstablishment`, `on_delete=CASCADE`), `permit_number`, `permit_type`, `expiration_date`, `stage` (`notice_sent`, `application_filed`, `requirements_review`, `inspection_scheduled`, `payment_pending`, `approved`, `released`, `lapsed`), `progress` (int 0-100), `renewal_fee`, `payment_status` (`paid`, `unpaid`, `partial`), `submitted_requirements` (JSONField), `inspection_status`, `photo_documentation`, `remarks`, `released_at`.
14. **`SanitaryComplaint`**
    - Citizen-submitted community sanitary grievances.
    - Key fields: `complaint_id` (unique, format: `COMP-YYYY-XXXXX`), `establishment` (FK `SanitaryEstablishment`, nullable, `on_delete=SET_NULL`), `complainant_name`, `contact_number`, `category`, `barangay`, `reported_date`, `status` (`pending`, `investigating`, `resolved`, `rejected`), `priority` (`low`, `medium`, `high`), `description`, `photo_documentation` (URLs), `latitude`, `longitude`, `assigned_inspector`, `inspection_scheduled_date`, `inspection_scheduled_time`, `inspection_schedule_note`, `inspection_notify_reporter` (bool), `action_taken`, `resolved_date`.
15. **`SanitaryInspection`**
    - Scheduled or ad-hoc physical establishment inspection log.
    - Key fields: `establishment` (FK `SanitaryEstablishment`, `on_delete=CASCADE`), `inspector_name`, `inspection_date`, `next_due_date`, `findings`, `remarks`, `status_after_inspection` (`good_standing`, `upcoming`, `for_completion`, `violation`, `no_permit`), `photo_documentation`, `is_draft` (bool).
16. **`SanitaryInspectionChecklistItem`**
    - Specific checklist items evaluated during an inspection.
    - Key fields: `inspection` (FK `SanitaryInspection`, `on_delete=CASCADE`, `related_name="checklist_items"`), `requirement_name`, `is_complied` (bool), `notes`.
17. **`HouseholdSanitationRecord`**
    - Residential sanitary survey records across barangays.
    - Key fields: `household_code` (unique, format: `HH-BRGY-XXXXX`), `household_head`, `barangay`, `address`, `male_count`, `female_count`, `toilet_type` (`water_sealed`, `pour_flush`, `pit_latrine`, `none`), `water_level` (`level_1`, `level_2`, `level_3`), `water_source`, `waste_disposal` (`collected`, `composted`, `burned`, `dumped`), `status` (`good_standing`, `for_completion`, `violation`), `latitude`, `longitude`, `remarks`, `last_survey_date`.
    - *Auto Status Scoring*: Evaluates toilet score (0-3) + water score (0-3) + waste score (0-3). If toilet is `none`, water is `none`, or waste is `dumped`, status is forced to `violation`. 7-9 points = `good_standing`, 4-6 points = `for_completion`, <4 points = `violation`.

### Notification Module Models
18. **`Notification`**
    - Internal staff alerts and public advisories.
    - Key fields: `title`, `message`, `notification_type` (`permit_due`, `inspection_due`, `violation_alert`, `public_advisory`, `system`), `severity` (`info`, `warning`, `critical`), `module` (`sanitation`, `tourism`, `general`), `audience_type` (`user`, `role`, `public`), `recipient_user` (FK User, nullable, `on_delete=CASCADE`), `target_role` (`admin`, `tourism`, `sanitation`, `establishment`), `related_model`, `related_object_id`, `related_due_date`, `action_url`, `is_read` (bool), `read_at`, `is_active` (bool), `expires_at`, `created_at`.

---

## 5. User Roles & Auth Flow

### Defined Roles & Permission Matrix
Roles are defined in `UserProfile.role`:

| Role Code | Display Name | Permissions & Accessible Areas |
| :--- | :--- | :--- |
| **`admin`** | System Administrator | Unrestricted access across all Web modules (Tourism + Sanitation), Module Selection switcher (`/module-selection`), User & Inspector Management, Excel data imports, system activity audit logs, record deletion. |
| **`tourism`** | Tourism Office Staff | Web Tourism Portal (`/`), Booking Management, Arrival Monitoring, Destination Management, Feedback Moderation, Tourism Reports, Tourism GIS Map. Mobile: Staff QR Scanner and Check-In. |
| **`sanitation`** | Sanitary Section / Inspector | Web Sanitation Portal (`/sanitation`), Establishments, Inspections, Complaints, Permit Renewals, Household Records, Sanitation Reports, Sanitation GIS Map. Mobile: Field Inspections and Household Surveys. |
| **`establishment`** | Establishment Owner | Mobile Establishment Portal: Scannable permit QR, renewal notice banner, compliance checklist progress, inspection timeline history. |
| **`tourist`** | Registered Tourist | Mobile Tourism Guide, Digital Travel Pass Registration, Public Feedback. Strictly isolated from all staff administrative modules. |
| *(Unauthenticated)* | Tourist / Citizen / Guest | Mobile Tourism Guide, Digital Travel Pass Registration, Public Feedback, Public Sanitation Reporting, Report Status Tracking, Public Permit Verification, Public Advisories. |

### Authentication & Login Flow
1. **User Login (`POST /api/auth/login/`)**:
   - Accepts `username` and `password`.
   - Executes Django `authenticate()`.
   - Includes fallback retry for connection pooler timeouts (`OperationalError`).
   - Supports alias fallback between `sanitary_admin` and `sanitation_admin`.
   - Returns authentication token (`Token.key`) and serialized profile:
     ```json
     {
       "user": {
         "id": 1,
         "username": "tourism_admin",
         "role": "tourism",
         "is_staff": true,
         "is_superuser": false
       },
       "token": "4e7a8f90...",
       "establishment": null,
       "resort": null
     }
     ```
   - If user is linked to an establishment or resort, the corresponding metadata is included in the login payload.
2. **Registration Endpoints**:
   - **`POST /api/auth/register/`**: Registers tourist accounts from mobile; assigns `role="tourist"` (previously assigned staff `role="tourism"`, resolved in commit `60fdee3206d6218674ff65c9bb517b533095381b`).
   - **`POST /api/auth/register-establishment/`**: Registers business accounts; assigns `role="establishment"`. Automatically links the new user to any existing `SanitaryEstablishment` matching `permit_number` or `business_name`.
3. **Session Persistence**:
   - **Web**: Token stored in `localStorage` under `capstone_auth_token`. Restored on page reload via `GET /api/auth/me/`.
   - **Mobile**: Token stored in `SharedPreferences` under `staff_auth_token`, role in `staff_auth_role`, username in `staff_auth_username`.
4. **Post-Login Routing**:
   - Handled in `AuthContext.js` via `getDefaultRouteForRole()`:
     - `admin` $\rightarrow$ `/module-selection`
     - `sanitation` $\rightarrow$ `/sanitation`
     - `tourism` $\rightarrow$ `/` (Tourism Dashboard)
5. **Route Protection & Gating**:
   - **Web**: Handled by `ProtectedRoute.js`. Compares authenticated role against `allowedRoles`. Redirects unauthenticated users to `/login`.
   - **Backend**: Decorated with `@module_required("tourism")` or `@module_required("sanitation")` defined in `api/permissions.py`. Rejects unauthorized roles with HTTP 403 Forbidden.
   - **Session Expiration Handling**: Mobile API client catches HTTP 401, clears stored tokens, and prompts re-login; catches HTTP 403 and displays permission alerts without clearing valid credentials.

---

## 6. Key Features (as implemented)

### 1. Tourism Management & Operations (Web Portal)
- **Dashboard Overview (`Dashboard.js`)**: Real-time KPI summary (Total Arrivals, Monthly Visits, Active Destinations, Satisfaction Rating), monthly arrival bar charts, destination distribution doughnut, Philippine regions breakdown, and recent activity feed.
- **Booking & Record Management (`BookingManagement.js`)**: Searchable, filterable directory of visitor registrations. Supports manual status updates (`pending` $\rightarrow$ `arrived` / `no_show`), visitor demographic inspection, multi-step new registration wizard, and Excel file upload.
- **Online Booking Excel Importer (`online_booking.py`)**: Parses Google Form responses spreadsheets (`.xlsx`) via `openpyxl`. Validates destination names, provinces, and demographic counts. Offers dry-run validation preview and batch database commits.
- **Live Arrival Monitoring (`ArrivalMonitoring.js`)**: Operational table for port and resort staff tracking daily arrivals, boat capacity fees, and group counts. Automatically flags overdue pending bookings as `no_show`.
- **Destination & Accommodation Management (`DestinationManagement.js`)**: Full CRUD for resorts and tourist attractions. Manages GPS coordinates, Mayor's permit status, access modes, capacity, and multi-image uploads to Supabase S3.
- **Visitor Feedback Moderation (`FeedbackMonitoring.js`)**: Reviews submitted tourist ratings, categorizes sentiment (positive, neutral, negative), and allows staff to publish official responses.
- **Tourism Reports & Analytics (`AnalyticsAndReport.js`)**: Demographic visualizations (gender split, age brackets, domestic vs. foreign origin), monthly comparison charts, and CSV report export.
- **Tourism GIS Spatial Map (`GISMap.js`)**: Interactive Leaflet OpenStreetMap displaying resort locations with custom markers, popup details, and visitor density heatmaps (`leaflet.heat`).

### 2. Sanitation & Environmental Health (Web Portal)
- **Sanitary Dashboard (`SanitationDashboard.js`)**: Health compliance KPIs (total establishments, good standing %, pending inspections, active violations, expiring permits), urgent alerts banner, and recent inspection timeline.
- **Establishment Directory (`EstablishmentRecords.js`)**: Searchable masterlist across 40 barangays. Displays permit numbers, compliance statuses, inspection frequencies, and contact numbers. Supports adding/editing establishments and viewing complete compliance history.
  - *Post-audit update*: The registration/edit workflow was redesigned in Phase 1 (`703533a`). See [Section 11](#11-post-audit-updates).
- **Inspection Management (`InspectionManagement.js`)**: Digital inspection record logger. Evaluates requirement checklists (water potability, health cards, waste management, grease traps), computes next inspection due dates, records findings, and updates establishment status.
- **Complaints Management (`ComplaintsManagement.js`)**: Triages citizen community reports. Tracks statuses (`pending` $\rightarrow$ `investigating` $\rightarrow$ `resolved` / `rejected`), assigns inspectors, schedules field investigation dates/times, and stores investigation notes.
- **Permit Monitoring & Renewal Pipeline (`PermitRenewal.js`, `PermitMonitoring.js`)**: 8-stage progress pipeline (`notice_sent` $\rightarrow$ `application_filed` $\rightarrow$ `requirements_review` $\rightarrow$ `inspection_scheduled` $\rightarrow$ `payment_pending` $\rightarrow$ `approved` $\rightarrow$ `released` $\rightarrow$ `lapsed`). Tracks fees, Official Receipt (OR) numbers, payment methods, and automated permit validity extension upon release.
- **Household Sanitation Surveys (`HouseholdRecords.js`, `HouseholdReportAnalytics.js`)**: Records residential sanitary data across 40 barangays. Analyzes toilet types (Water-Sealed, Pour-Flush, Pit Latrine, None), water levels (Levels I, II, III), and waste disposal methods. Automatically calculates sanitary score and compliance status.
- **Sanitation GIS Map (`SanitaryGISMap.js`)**: OpenStreetMap displaying multi-layer spatial data: establishments (color-coded by compliance), community complaints (colored by status), and household surveys, with heatmap toggles and barangay boundary centering.
- **Inspector & Staff Management (`StaffManagement.js`)**: Admin interface for creating and managing field inspector accounts (`is_staff: True`, role `sanitation`). Supports password resets, profile edits, and account activation toggles with self-deactivation guards.

### 3. Mobile Client Application (Flutter)
- **Tourism Guide & Digital Pass (`tourism_screens.dart`)**:
  - Browse featured destinations, categories, and resort details with photo carousels.
  - Interactive OpenStreetMap with clickable destination pins.
  - Itinerary planner and packing checklist tool.
  - Public visit registration generating a scannable **QR Digital Travel Pass**.
  - **Export / Share Pass**: Rasterizes the QR entry ticket visual via Flutter `RepaintBoundary` into a high-resolution PNG and invokes the native OS share sheet (`share_plus`).
  - Public feedback submission with photo attachments.
- **Resort Staff QR Check-In Scanner (`tourist_qr_checkin_screens.dart`)**:
  - Hardware camera scanner (`mobile_scanner`) reading tourist QR codes.
  - Fuzzy/partial search fallback for damaged or manual ticket IDs.
  - Real-time visitor verification and one-tap Check-In updating backend status to `arrived`.
  - **CSV Export**: Exports filtered check-in history into RFC 4180-compliant CSV files shared via native OS share sheet.
- **Citizen Sanitation Portal (`sanitation_screens.dart`)**:
  - Submit sanitary complaints with GPS coordinates (`geolocator`) and camera photos (`image_picker`).
  - Status tracker: Look up submitted complaints by reference ID or phone number.
  - Public permit verification: Scan or enter a permit code to check authenticity and compliance status.
- **Inspector Field Tools (`sanitation_screens.dart`)**:
  - Mobile sanitary inspection form with dynamic requirement checklists and draft storage.
  - Mobile household sanitary survey form with automated scoring.
- **Establishment Owner Portal (`sanitation_screens.dart`)**:
  - Scannable digital sanitary permit QR code.
  - Expiration countdown banner (warns when permit is expiring within 60 days or expired).
  - Requirements checklist with progress indicator.
  - Vertical timeline of past inspections and inspector remarks.

### 4. Background & Cross-Cutting Systems
- **Notification Engine (`evaluate_due_notifications.py`, `backend/api/views/notifications.py`)**:
  - Daily scheduled evaluation identifying permits expiring within 30 days and inspections due within 7 days.
  - Splits severity into `warning` (due soon) and `critical` (overdue/expired).
  - Generates idempotent notifications for staff users.
  - Triggers write-time notifications when an inspection results in a `violation`.
  - Staff-authored public advisories broadcasted to mobile users.
- **Automated Webhook Endpoint (`/api/notifications/evaluate-due/`)**:
  - Allows GitHub Actions or external cron jobs to trigger daily due evaluations securely via a shared secret key without paid worker services.
- **System Activity Audit Trail (`ActivityLog`)**:
  - Records user identity, timestamp, module, action (`create`, `update`, `delete`), and target entity label for major administrative changes.

---

## 7. API Endpoints

All routes are prefixed with `/api/`.

### Shared & Authentication
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `health/` | `GET` | Health check probe | No | Anyone |
| `auth/login/` | `POST` | Authenticate user & return auth token | No | Anyone |
| `auth/register/` | `POST` | Register tourist account | No | Anyone |
| `auth/register-establishment/` | `POST` | Register/claim establishment owner account | No | Anyone |
| `auth/me/` | `GET` | Return current authenticated user profile | Yes | Any authenticated user |
| `auth/logout/` | `POST` | Invalidate/delete current auth token | Yes | Any authenticated user |
| `activity-logs/` | `GET` | List audit activity logs (module filtered) | Yes | Any authenticated user |
| `bootstrap/` | `GET` | Initial bundle for Tourism web portal | Yes | `admin`, `tourism` |
| `reference-tables/` | `GET` | Master tables (regions, provinces, purposes) | Yes | `admin`, `tourism` |

### Tourism Web Module
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `dashboard/` | `GET` | Tourism KPI cards and arrival trends | Yes | `admin`, `tourism` |
| `booking-management/` | `GET` | Filterable visitor registration records | Yes | `admin`, `tourism` |
| `arrival-monitoring/` | `GET` | Operational arrival tracking payload | Yes | `admin`, `tourism` |
| `reports/` | `GET` | Tourism analytics and demographics data | Yes | `admin`, `tourism` |
| `online-booking-import/` | `POST` | Preview or commit online booking Excel sheets | Yes | `admin` only |
| `resorts/` | `GET`, `POST` | List all resorts or create a new destination | Yes | `admin`, `tourism` |
| `resorts/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, edit, or delete a resort | Yes | `admin`, `tourism` |
| `resorts/upload-image/` | `POST` | Upload resort images to Supabase S3 | Yes | `admin`, `tourism` |
| `destinations/upload-image/` | `POST` | Alias for resort image upload | Yes | `admin`, `tourism` |
| `tourist-records/` | `GET`, `POST` | List tourist records or create registration | Yes | `admin`, `tourism` |
| `tourist-records/<survey_id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, update status, or delete record | Yes (`DELETE`: admin only) | `admin`, `tourism` |
| `feedback/` | `GET`, `POST` | List visitor reviews or submit review | Yes | `admin`, `tourism` |
| `feedback/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, reply to, or delete feedback | Yes | `admin`, `tourism` |

### Sanitation Web Module
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `sanitation/bootstrap/` | `GET` | Initial bundle for Sanitation web portal | Yes | `admin`, `sanitation` |
| `sanitation/dashboard/` | `GET` | Sanitation KPI metrics and summary | Yes | `admin`, `sanitation` |
| `sanitation/business-types/` | `GET` | List business categories & requirements | Yes | `admin`, `sanitation` |
| `sanitation/establishments/` | `GET`, `POST` | List establishments or register new | Yes | `admin`, `sanitation` |
| `sanitation/establishments/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, update, or delete establishment | Yes | `admin`, `sanitation` |
| `sanitation/inspections/` | `GET`, `POST` | List inspections or submit inspection | Yes | `admin`, `sanitation` |
| `sanitation/inspections/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, edit, or delete inspection | Yes | `admin`, `sanitation` |
| `sanitation/permits/` | `GET` | Permit monitoring data and statistics | Yes | `admin`, `sanitation` |
| `sanitation/renewals/` | `GET`, `POST` | List renewals or initiate renewal | Yes | `admin`, `sanitation` |
| `sanitation/renewals/<id>/` | `GET`, `PATCH`, `DELETE` | Update renewal stage, payment, release | Yes | `admin`, `sanitation` |
| `sanitation/complaints/` | `GET`, `POST` | List complaints or log citizen complaint | Yes | `admin`, `sanitation` |
| `sanitation/complaints/<id>/` | `GET`, `PATCH`, `DELETE` | Update status, assign inspector, resolve | Yes | `admin`, `sanitation` |
| `sanitation/submissions/` | `GET` | Document verification submissions | Yes | `admin`, `sanitation` |
| `sanitation/reports/` | `GET` | Business sanitation compliance analytics | Yes | `admin`, `sanitation` |
| `sanitation/staff/`, `v1/sanitation/staff/` | `GET`, `POST` | List staff or create sanitary inspector | Yes (`POST`: admin/staff) | `admin`, `sanitation` |
| `sanitation/staff/<id>/`, `v1/sanitation/staff/<id>/` | `GET`, `PATCH`, `PUT` | Edit inspector details or toggle status | Yes (`PATCH`: admin/staff) | `admin`, `sanitation` |

### Household Sanitation Module
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `households/bootstrap/` | `GET` | Barangay masterlist and initial survey data | Yes | `admin`, `sanitation` |
| `households/barangays/` | `GET` | List active barangays of Mauban | Yes | `admin`, `sanitation` |
| `households/dashboard/` | `GET` | Household sanitation statistics & metrics | Yes | `admin`, `sanitation` |
| `households/records/` | `GET`, `POST` | List household surveys or record survey | Yes | `admin`, `sanitation` |
| `households/records/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, edit, or delete household record | Yes | `admin`, `sanitation` |

### Notifications & Webhooks
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `notifications/` | `GET` | List notifications for authenticated user | Yes | Any authenticated user |
| `notifications/mark-all-read/` | `POST` | Mark all user notifications as read | Yes | Any authenticated user |
| `notifications/<id>/read/` | `PATCH` | Mark single notification as read | Yes | Owner of notification |
| `notifications/public/` | `GET`, `POST` | View active advisories or create advisory | GET: No / POST: Yes | POST: `admin`, `tourism`, `sanitation` |
| `notifications/public/<id>/` | `PATCH` | Update advisory text or status | Yes | `admin`, `tourism`, `sanitation` |
| `notifications/evaluate-due/` | `POST` | Cron webhook to evaluate due dates | Secret Key (`X-Cron-Key`) | Webhook Caller |

### Public & Field Mobile API
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `mobile/tourism/register/` | `POST` | Register new tourist account | No | Anyone |
| `mobile/tourism/bootstrap/` | `GET` | Bootstrap data for tourist mobile guide | No | Anyone |
| `mobile/tourism/destinations/` | `GET` | Search and filter resort destinations | No | Anyone |
| `mobile/tourism/destinations/<id>/` | `GET` | Destination details with recent reviews | No | Anyone |
| `mobile/tourism/register-visit/` | `POST` | Submit visit registration (creates pass) | No | Anyone |
| `mobile/tourism/records/lookup/` | `GET` | Front-desk lookup of tourist QR ticket | Yes | `admin`, `tourism` |
| `mobile/tourism/records/check-in/` | `POST` | Front-desk action to mark visitor arrived | Yes | `admin`, `tourism` |
| `mobile/tourism/records/history/` | `GET` | Check-in history log for staff export | Yes | `admin`, `tourism` |
| `mobile/tourism/feedback/` | `POST` | Submit visitor review with photo upload | No | Anyone |
| `mobile/sanitation/bootstrap/` | `GET` | Bootstrap data for mobile sanitation | No | Anyone |
| `mobile/sanitation/reports/` | `POST` | Submit citizen complaint with photos/GPS | No | Anyone |
| `mobile/sanitation/reports/history/` | `GET` | Query submitted reports by phone/ID | No | Anyone |
| `mobile/sanitation/permits/verify/` | `GET` | Verify commercial permit QR / code | No | Anyone |
| `mobile/sanitation/register-establishment/` | `POST` | Register/claim establishment owner account | No | Anyone |
| `mobile/sanitation/inspections/` | `POST` | Submit field inspection checklist | Yes | `admin`, `sanitation` |
| `mobile/sanitation/household-surveys/` | `POST` | Submit field household sanitary survey | Yes | `admin`, `sanitation` |

---

## 8. Known Issues / Incomplete Work

### Hardcoded Local File Paths
- **`backend/api/management/commands/import_sanitary_permits.py` (lines 24-27)**:
  Contains developer-machine hardcoded paths:
  ```python
  DEFAULT_FILES = [
      Path(r"C:\Users\This PC\Downloads\Sanitary Permit Large 2025.xlsx"),
      Path(r"C:\Users\This PC\Downloads\Sanitary Permit Sp 2025.xlsx"),
  ]
  ```
  If executed without explicit arguments on a different machine or server, it will throw a `FileNotFoundError`.

### Hardcoded Demo Credentials & Gateway Shortcuts
- **`mobile/lib/screens/sanitation_screens.dart` (lines 5244-5249)**:
  Plain-text credential disclosure banner in the Establishment portal login UI:
  ```dart
  'Default Demo Account:\nUsername: establishment_owner\nPassword: Establishment@123'
  ```
- **`mobile/lib/screens/sanitation_screens.dart` (lines 5160-5185)**:
  "Quick Demo Establishments" interactive chips that bypass password login by invoking `_accessEstablishmentByCode()` using the first 3 establishments returned in bootstrap data.
- **`frontend/src/sanitation/pages/EstablishmentRecords.js` (line 894)**:
  UI helper string hardcodes demo credentials:
  ```javascript
  "...or use demo account (establishment_owner / Establishment@123)."
  ```

### Hardcoded Production URL in Mobile Fallback
- **`mobile/lib/utils/helpers.dart` (lines 3-6)**:
  Defaults `apiBaseUrl` to a specific Render domain if `--dart-define=API_BASE_URL` is omitted:
  ```dart
  const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://capstone-backend-stzr.onrender.com/api',
  );
  ```
  Running `flutter run` locally without setting the dart-define will silently attempt to connect to the remote Render instance instead of the local server.

### Unfinished Code / Stubs / TODO Comments
- **`mobile/android/app/build.gradle.kts` (line 44)**:
  Standard Flutter signing stub:
  ```kotlin
  // TODO: Add your own signing config for the release build.
  ```
- **`frontend/src/sanitation/Sanitation_index.css` (lines 770, 841)**:
  CSS comments label chart wrappers as `/* DONUT MOCK */` and `/* ESTABLISHMENT BAR CHART MOCK */`.

### Testing Gaps
- **Frontend Test Suite Missing**: `frontend/src/` has **zero** test files. `npm test` runs into missing test suites despite testing dependencies existing in `package.json`.
- **Mobile Test Suite Minimal**: `mobile/test/widget_test.dart` contains only 1 basic widget test verifying that intro text renders.

### Standalone Migration/Mock Scripts
- **`backend/mock_scripts/`**: Contains 8 standalone Python scripts (`add_mock_data.py`, `add_more_mock_data.py`, `fix_barangay_coordinates.py`, etc.) that execute direct model manipulation outside of Django management commands or migrations.

---

## 9. Environment & Setup

### Environment Variables

#### Backend (`backend/.env`)
| Variable | Description | Example / Required Format |
| :--- | :--- | :--- |
| `SECRET_KEY` | Django cryptographic signing secret | `django-insecure-...` |
| `DEBUG` | Development debug mode toggle | `True` or `False` (defaults to `False`) |
| `USE_SEED_DATA` | Automatically populate seed data | `True` or `False` (defaults to `False`) |
| `DB_ENGINE` | Database engine | `postgresql` or `sqlite` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_USER` | PostgreSQL user | `postgres.your-project-id` |
| `DB_PASSWORD` | PostgreSQL password | Secret string |
| `DB_HOST` | Database host URL | `aws-1-ap-southeast-2.pooler.supabase.com` |
| `DB_PORT` | Database connection port | `5432` |
| `DB_SSLMODE` | PostgreSQL SSL mode | `require` |
| `DATABASE_URL` | Optional complete connection URI | `postgres://user:pass@host:5432/db` |
| `SQLITE_DB_PATH` | Optional custom SQLite file path | Defaults to `BASE_DIR / db.sqlite3` |
| `ALLOWED_HOSTS` | Comma-separated hostnames/IPs | `127.0.0.1,localhost,testserver` |
| `CORS_ALLOW_ALL_ORIGINS` | Allow all CORS origins | `False` (set `True` only in development) |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `http://localhost:3000,http://127.0.0.1:3000` |
| `CRON_SECRET_KEY` | Shared key for notification webhook | Secret string |
| `USE_S3_STORAGE` | Enable S3 cloud storage for uploads | `True` or `False` |
| `AWS_ACCESS_KEY_ID` | Supabase S3 Access Key ID | S3 API Access Key |
| `AWS_SECRET_ACCESS_KEY` | Supabase S3 Secret Access Key | S3 API Secret Key |
| `AWS_STORAGE_BUCKET_NAME`| Supabase Storage bucket name | `media` |
| `AWS_S3_ENDPOINT_URL` | Supabase S3 endpoint | `https://<ref>.supabase.co/storage/v1/s3` |
| `AWS_S3_REGION_NAME` | S3 region identifier | `ap-southeast-1` |
| `AWS_S3_CUSTOM_DOMAIN` | Optional custom CDN domain | `<ref>.supabase.co/storage/v1/object/public/media` |

#### Frontend (`frontend/.env` - optional)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `REACT_APP_API_BASE_URL` | Base URL of Django REST API | `http://<window.location.hostname>:8000/api` |

#### Mobile (Passed via `--dart-define`)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `API_BASE_URL` | API base endpoint | `https://capstone-backend-stzr.onrender.com/api` |
| `APP_MODULE` | Active mobile module (`tourism` or `sanitation`) | `tourism` |

---

### How to Run Locally

#### 1. Backend (Django)
```powershell
cd backend

# Create & activate virtual environment (Windows PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create default demo user accounts
python manage.py create_default_users

# Run local development server (Port 8000)
python manage.py runserver 0.0.0.0:8000
```

#### 2. Frontend (React Web Portal)
```powershell
cd frontend

# Install dependencies
npm install

# Run local development server (Port 3000)
npm start
```

#### 3. Mobile (Flutter)
```powershell
cd mobile

# Install dependencies
flutter pub get

# Run Tourism Mobile App on Chrome (with local backend URL)
flutter run -d chrome -t lib/main.dart --dart-define=API_BASE_URL=http://localhost:8000/api

# Run Sanitation Mobile App on Chrome
flutter run -d chrome -t lib/main_sanitation.dart --dart-define=API_BASE_URL=http://localhost:8000/api

# Run on Android Emulator (uses 10.0.2.2 loopback)
flutter run -d emulator --dart-define=API_BASE_URL=http://10.0.2.2:8000/api
```

---

### Seed & Maintenance Commands
- `python manage.py create_default_users`: Provisions fixed system accounts:
  - `system_admin` / `Admin@123` (Admin)
  - `tourism_admin` / `Tourism@123` (Tourism Staff)
  - `sanitation_admin` / `Sanitation@123` (Sanitary Section)
  - `inspector_juan` / `Inspector@123` (Sanitary Inspector)
  - `inspector_maria` / `Inspector@123` (Sanitary Inspector)
  - `establishment_owner` / `Establishment@123` (Business Owner)
  - `resort_owner` / `Resort@123` (Resort Owner)
- `python manage.py evaluate_due_notifications`: Scans expiring permits ($\le 30$ days) and inspections ($\le 7$ days) and dispatches staff alerts.
- `python manage.py import_online_bookings <file.xlsx> [--dry-run]`: Imports tourism online booking spreadsheets.
- `python manage.py import_tourism_excel <file.xlsx> --year=2025`: Imports historical resort arrival monitoring sheets.
- `python manage.py import_sanitary_permits <file1.xlsx> <file2.xlsx>`: Imports Sanitary Permit Large & SP masterlists.
- `python manage.py purge_demo_households`: Deletes sample household records from database.

---

## 10. Observations & Risks

### Security Concerns
1. **Committed/Exposed Database Credentials in Local `.env`**:
   - `backend/.env` currently contains real active Supabase pooler credentials and passwords. Although `.env` is listed in `backend/.gitignore`, developers must ensure this file is never committed, staged, or exposed in public repositories.
2. **Hardcoded Passwords and Login Bypasses in Client Code**:
   - `mobile/lib/screens/sanitation_screens.dart` (line 5244) prints `establishment_owner / Establishment@123` on screen, and lines 5160-5185 render one-click "Quick Demo Establishments" chips that permit unauthenticated portal entry.
   - `frontend/src/sanitation/pages/EstablishmentRecords.js` (line 894) exposes the same demo credentials in a helper tooltip.
   - Default users created by `create_default_users.py` have predictable passwords.
3. **Public File Uploads Without Rate Limiting**:
   - `POST /api/mobile/sanitation/reports/` (`mobile_sanitation_report_submit`) and `POST /api/mobile/tourism/feedback/` (`mobile_feedback_submit`) are `AllowAny` endpoints accepting multipart file uploads up to 5MB. While MIME types and extensions are validated in `upload.py`, there is no rate limiting, CAPTCHA, or IP throttling, making these endpoints susceptible to storage exhaustion or denial of service.
4. **Development Flags in Configuration**:
   - In `backend/.env`, `DEBUG=True` and `CORS_ALLOW_ALL_ORIGINS=True`. In production, these must be disabled to prevent detailed error stack traces and cross-origin abuse.
5. **Public Tourist Registration Privilege Escalation (RESOLVED in `60fdee3206d6218674ff65c9bb517b533095381b`)**:
   - **Root Cause**: Public tourist registration (`POST /api/auth/register/` and `POST /api/mobile/tourism/register/`) previously assigned the staff `ROLE_TOURISM` (`"tourism"`). Because backend permissions (`MODULE_ROLES["tourism"] = {ROLE_ADMIN, ROLE_TOURISM}`) and mobile staff lookup checks grant administrative access to any user with the `tourism` role, registered public tourists were inadvertently granted access to Tourism staff endpoints.
   - **Remediation**:
     - Introduced a dedicated `ROLE_TOURIST = "tourist"` constant and choice in `backend/api/models.py`.
     - Updated `tourist_register_view` in `backend/api/auth_views.py` so newly registered public tourists explicitly receive `role = "tourist"`.
     - Preserved strict Tourism staff permissions in `backend/api/permissions.py` (`MODULE_ROLES["tourism"] = {ROLE_ADMIN, ROLE_TOURISM}`), keeping tourists excluded from all staff modules.
     - Generated safe metadata-only Django migration `0032_alter_notification_target_role_and_more.py` (verified SQL no-op).
   - **Verification & Production Deployment**:
     - Local API regression tests passed in `AuthApiTests` (5/5) and across the entire backend test suite (59/59 passed).
     - Deployed to the production Render environment and live security verification passed at verified production commit `60fdee3206d6218674ff65c9bb517b533095381b`.
     - Live production security verification confirmed:
       * Newly registered public tourist received `role="tourist"` (`HTTP 201 Created`).
       * Authenticated tourist received `HTTP 403 Forbidden` attempting protected staff web booking management (`GET /api/booking-management/`).
       * Authenticated tourist received `HTTP 403 Forbidden` attempting protected mobile staff lookup (`GET /api/mobile/tourism/records/lookup/?query=...`).
       * Authorized Tourism staff account (`tourism_admin`) retained full access to staff booking management (`HTTP 200 OK`) and mobile lookup (`HTTP 404 Not Found` for nonexistent record query, proving authorization boundary passed).
   - **Production Compatibility & Data Note**: Existing production user accounts registered prior to this fix that currently hold the old `tourism` role were intentionally NOT bulk-converted as part of this release to ensure zero unexpected disruptions to active users.

### Data Integrity & Edge Cases
6. **Non-Deterministic Geographic Coordinate Jitter**:
   - In `backend/api/models.py` (`resolve_barangay_coordinates`, lines 51-55), when an establishment, complaint, or household is saved without GPS coordinates, a random offset (`random.uniform(-0.004, 0.004)`) is applied:
     ```python
     offset_lat = random.uniform(-0.004, 0.004)
     offset_lng = random.uniform(-0.004, 0.004)
     return round(base[0] + offset_lat, 6), round(base[1] + offset_lng, 6)
     ```
     Because this executes inside `save()`, every time an entity without explicit coordinates is updated and re-saved, its pin coordinates can shift slightly on the GIS map.
7. **Dual Scoring Logic Replication**:
   - The compliance scoring rules for households (0-3 points for toilet, water, waste) are implemented both in Python (`HouseholdSanitationRecord.save()` in `backend/api/models.py:1015-1051`) and in Dart (`household_status_from_payload()` in `mobile/lib/utils/helpers.dart`). Any alteration to municipal health scoring thresholds must be manually synchronized in both places.
8. **Protected Delete Cascade on Destinations**:
   - Deleting a destination via `DELETE /api/resorts/<id>/` fails with HTTP 409 Conflict if tourist records are linked to it (`tourist_records.resort` has `on_delete=PROTECT`). The system does not support archiving/deactivating resorts without deleting or reassigning existing bookings.

### Technical Debt & Code Maintainability
9. **Monolithic Mobile Files**:
   - `mobile/lib/screens/sanitation_screens.dart` is **6,876 lines** (252 KB).
   - `mobile/lib/screens/tourism_screens.dart` is **4,375 lines** (160 KB).
   - `mobile/lib/screens/tourist_qr_checkin_screens.dart` is **2,197 lines** (78 KB).
   - The Flutter codebase relies heavily on `part` / `part of` directives linked back to `main.dart`, creating a single massive compilation unit rather than modular, self-contained Dart packages.
10. **No Frontend Automated Testing**:
    - The React frontend has no unit or integration tests (`0` test files in `frontend/src/`). Any regression in API response parsing or routing can only be detected via manual browser testing.
11. **Hardcoded Absolute File Paths in Management Commands**:
    - `import_sanitary_permits.py` contains hardcoded user directory paths (`C:\Users\This PC\Downloads\...`), rendering it unusable in automated CI/CD or production containers without providing explicit CLI arguments.
12. **Tourism CSS Reaches Sanitation Pages**:
    - `frontend/src/index.js` imports `Tourism_index.css` globally, so tourism rules (for example `.btn-primary`, `.insight-bars`, and the `.ws-*` block in `BookingManagement.wizard.css`) also style Sanitation pages. The list, and the rule that theme colours must never be set on `:root`, is in `frontend/src/tourism/THEME_TOKENS.md` section 5.
13. **No Development Database: Local Commands Hit Live Data** (affects tourism and sanitation):
    - There is no separate development database. `backend/.env` points every local `manage.py` command at the live Supabase Postgres instance.
    - `manage.py flush` would empty every table of the live database. `migrate` (including `migrate api zero`) and `dbshell` also act directly on it.
    - The custom management commands (`create_default_users`, `evaluate_due_notifications`, the `import_*` commands, `purge_demo_households`) read and write live data when run locally; `purge_demo_households --confirm` deletes rows.
    - Only test runs are guarded: `backend/backend/settings.py` forces `manage.py test` and `testserver` onto an in-memory SQLite database. Nothing else is.
    - Fix, as a separate piece of work: a development database, or at minimum a second `.env` that local work points at instead of production.
14. **Known Local-Only Test Flake: `CommunityReportConcurrentSubmitTests`** (recorded October 3, 2026):
    - `test_concurrent_duplicates_create_exactly_one_row` fails in a full `manage.py test` run from the usual `backend/` working folder: two threaded requests get an HTML 500 instead of JSON, and threads log `no such table: api_sanitaryestablishment`.
    - Evidence that it is not a code regression: run alone it passes (3/3); the full suite at the same commit (`b3ca8ab`) passes 268/268 in a clean `git worktree` checkout, as do `1e8ebf7` (247/247) and `88a8d31` (268/268); no backend file changed between `88a8d31` and `b3ca8ab`. It fails only in the working folder (3/3 full runs). `DEBUG=True` alone does not reproduce it; the trigger in that folder (a `.env` value or an untracked file) was not isolated.
    - It is a threaded concurrency test, and the test guard forces an in-memory SQLite database, which locks far more readily than Postgres under concurrent writes. That is a likely cause, worth checking first by whoever chases it.

---

## 11. Post-Audit Updates

Sections 1–10 above describe the codebase as audited on September 18, 2026 and are preserved as a historical record. This section records later changes (documented September 22, 2026).

### Sanitary Establishment Records Phase 1 (`703533a`)
- **Commit**: `703533a` — `feat(sanitation): redesign establishment records workflow`.
- **Implemented Behavior**:
  - Redesigned the Sanitary Establishment Records registration/edit workflow.
  - New registrations start as **No Permit** rather than inventing permit data. Registration focuses on establishment profile, business type, address/barangay, contact, and location.
  - Existing establishment values are loaded non-destructively during edit.
  - Permit issuance/generation remains an explicit action.
  - SP/Large is presented as internal **Permit Coverage**, not physical establishment size.
  - Client-facing Business Type categories are exactly the 9 confirmed categories:
    1. Commercial / NF
    2. Food Establishment
    3. Industrial Establishment
    4. Agro-Industrial Establishment
    5. Institutional Establishment
    6. Water Refilling Station
    7. Public Transport
    8. Ambulant Food Vendor
    9. Public Places
  - Existing underlying business type IDs/names remain preserved. Known legacy/importer business types are mapped to the approved client-facing categories. Unknown underlying types do not create additional Business Type filter categories.
  - Location wording no longer implies GPS verification; valid map references are distinguished from invalid/out-of-bounds coordinates.
  - Timeline precedence remains `updated_at || created_at || permit_issued_date`.
  - Phase 1 included regression/characterization tests and frontend/backend test coverage.
- **Test/Build Verification (post-commit, all passed)**:
  - Establishment Records focused frontend tests: 101/101 passed.
  - Full frontend tests: 126/126 passed. (The "zero frontend test files" findings in Section 8 *Testing Gaps* and Section 10 item 10 reflect the original audit date and are left unchanged as historical record.)
  - Backend tests: 69/69 passed using isolated in-memory SQLite. SQLite was used intentionally so the run did not create or alter a test database on the production Postgres/Supabase environment; backend tests were not run against production Postgres.
  - Frontend production build passed.
  - `git diff --check` passed.
- **Git/Deployment**:
  - `703533a` was pushed to `origin/main` as a fast-forward from `2e14a30`.
  - `origin/main` pointed to `703533a` when the Phase 1 verification was performed. It has since advanced to `49bf302` through separate Tourism commits. Those commits do not modify the Phase 1 Sanitation source files.
  - No manual deployment was performed. No production database modification was performed as part of the Phase 1 release or its verification.
  - The later Tourism release includes migration `0033`; whether that migration has been applied in production was not verified from public read-only checks. This section makes no claim that production data is unchanged overall.
- **Initial Production Deployed-Build Verification (build from `703533a`)**:
  - Production frontend `https://capstone-frontend-ohuj.onrender.com/` returned HTTP 200 and loads the production backend API `https://capstone-backend-stzr.onrender.com/api`.
  - Backend `/api/health/` returned HTTP 200 with status ok.
  - The deployed frontend bundle was inspected: deployed `EstablishmentRecords.js` and `businessTypeLabels.js` matched the Phase 1 versions from `703533a` and differed from `2e14a30`; the CSS deployed at that time matched the Phase 1 local build byte-for-byte.
  - Phase 1 markers and all 9 approved Business Type categories were found in the deployed bundle. No `GPS` wording was present in the deployed Establishment Records build.
- **Current Production Deployed-Build Re-Verification (after `origin/main` advanced to `49bf302`)**:
  - Verified through the production frontend's publicly accessible source maps (`main.*.js.map`, `main.*.css.map`), comparing their embedded sources against the repository source using only read-only requests.
  - The current production frontend is built from `49bf302`: every application JS and CSS source file in the source maps is byte-identical to `49bf302`. No commit SHA is exposed publicly; this conclusion comes from the source comparison.
  - Production frontend returns HTTP 200 and points to the production backend API `https://capstone-backend-stzr.onrender.com/api`. Backend `/api/health/` returns HTTP 200 with `status: ok`.
  - The deployed `EstablishmentRecords.js` and `businessTypeLabels.js` remain byte-identical to the Phase 1 versions from `703533a`.
  - The Phase 1 Sanitation strings (`Permit Coverage (internal SP / Large)`, `Location Coordinates`, `Map Reference`, `Issue & Generate Permit Now`, `No Permit`) and all 9 client-facing Business Type categories remain present. `GPS` wording remains absent from the deployed Establishment Records implementation.
  - The current production CSS is **not** byte-identical to the earlier Phase 1 build. The difference is attributable to the later Tourism changes in `Tourism_index.css` and `BookingManagement.wizard.css`; `Sanitation_index.css` and all other CSS sources remain unchanged.
  - Phase 1 remains strongly evidenced in the current deployed frontend.
- **Limitation — Authenticated UI Behavior Not Verified**:
  - The verifications above establish what build is deployed; they do not establish authenticated UI behavior in production.
  - Authenticated production Establishment Records UI behavior was **not** manually verified. No staff credentials were used.
  - No production establishment was created, edited, issued a permit, or otherwise modified during verification.
  - The authenticated production workflow is therefore **not** considered fully verified.
  - *Later update*: a limited read-only authenticated inspection of the Business Type categories and Register dropdown was performed (see the Ambulant Food Vendor subsection below). The full authenticated workflow remains unverified.

### Ambulant Food Vendor Business Type (migration `0034`, deployed)
- Implementation commit: `57f1f086547b4bac84aca5e51e5964ae4437322c`, documentation commit `e7015992a2f5a50d32c1ea6efb70c133441d6896`. Both pushed; `origin/main` is at `e701599` and the Render deployment is live.
- **Authenticated Production UI Observation (read-only)**:
  - Sanitation → Establishment Records was inspected read-only with an authorized account.
  - The 9 approved client-facing Business Type categories were visible, including Ambulant Food Vendor.
  - The Register New Establishment Business Type dropdown showed "Ambulant Food Vendor — No business type configured yet": the category existed in the UI but had no underlying selectable `SanitaryBusinessType`.
  - No production record was created or modified. No Save, Submit, Update, Issue, or Renew action was performed.
- **Client Confirmation**:
  - Official business type name: Ambulant Food Vendor.
  - Inspection frequency: Monthly.
  - Standard requirements: not yet provided. Additional requirements: none yet provided. Legal basis: not yet provided.
- **Implementation**:
  - Added data migration `backend/api/migrations/0034_add_ambulant_food_vendor_business_type.py`. It creates the underlying `SanitaryBusinessType` with `name = "Ambulant Food Vendor"`, `inspection_frequency = monthly`, and no requirements; it does nothing if a type with that name (any casing) already exists, and its reverse is a no-op.
  - A data migration was used because seed data is disabled in production (`USE_SEED_DATA=False`), and adding the type to `SANITARY_BUSINESS_TYPES` would have auto-generated the standard requirements for both SP and Large.
  - The existing Phase 1 mapping in `frontend/src/sanitation/utils/businessTypeLabels.js` already maps this name to the client-facing Ambulant Food Vendor category. No UI workaround was added.
  - Corrected the stale comment in `businessTypeLabels.js` that claimed the category was already represented by imported production data.
  - No sanitary requirements, legal basis, or SP/Large-specific requirements were invented or added.
- **Verification (local)**:
  - New backend Ambulant tests: 7/7 passed. Full backend suite: 100/100 passed, run on isolated in-memory SQLite (not production Postgres).
  - Focused frontend tests (Establishment Records): 106/106 passed. Full frontend suite: 131/131 passed.
  - `makemigrations --check` passed; `0034` is the only new migration. `git diff --check` passed.
  - Frontend production build succeeded twice without errors (default build and production-API-URL build). The production-URL build's JS, CSS, `index.html`, and `asset-manifest.json` were byte-identical to the currently deployed production frontend.
  - No unrelated source, configuration, infrastructure, or mobile changes were found. Test-generated media files under `backend/media/` (gitignored) were local only.
- **Production Deployment State**:
  - Migration `0034` **is applied in production**, based on the production `Ambulant Food Vendor` row created by the Render deployment (via `migrate` in Render's build command, which does not run `backend/build.sh`). This was the intended, intentional production data change.
  - No production database modification was performed during the implementation itself or during verification; the row was created by the deployment's `migrate` step.
- **Production Verification (read-only, after deployment)**:
  - Verified through the public unauthenticated sanitation bootstrap endpoint and the deployed frontend bundle. No write requests were made, and no production records were created or edited.
  - Production has exactly one case-insensitive `Ambulant Food Vendor` type: production ID `24`, frequency `monthly`, requirement count `0`.
  - Production now has 16 business types, up from the previously recorded 15. All 15 previously known business type names remain present and unchanged.
  - Total configured requirements remain `243`; no requirements were deleted during this work.
  - No production establishment currently uses the Ambulant type.
  - The deployed frontend's 51 application source files are byte-identical to commit `e701599`.
- **Verification Limitations**:
  - Production verification could not directly confirm the authenticated production UI: no staff session was used, so the logged-in Register/Inspection/Renewal screens were not visually verified.
  - Production verification could not directly read `django_migrations`; applied status is based on the production `Ambulant Food Vendor` row, which only migration `0034` creates.
  - Production verification could not perform a complete before/after comparison of establishment records, so this section does not claim that establishment records definitely did not change.
  - Production verification could not directly confirm the backend commit SHA; the backend exposes no version or commit information.
- **Requirements Status**:
  - Ambulant Food Vendor has zero sanitary requirements by design, because the Sanitation Section has not yet provided the official requirements or legal basis. The requirement list is **not** complete.

### Web Zero-Requirement Safety Fix (Inspection Management & Permit Renewal, web only)
- Implementation commit: `57f1f086547b4bac84aca5e51e5964ae4437322c`, documentation commit `e7015992a2f5a50d32c1ea6efb70c133441d6896`. Both pushed; `origin/main` is at `e701599` and the Render deployment is live.
- **Root Cause**:
  - The existing web Inspection Management and Permit Renewal workflows substituted hard-coded generic requirements when a business type had no configured requirements.
  - Inspection Management's fallback contained 10 generic items and could save them as inspection checklist items.
  - Permit Renewal's fallback (`getEstablishmentRequirements`) contained 7 generic items and could save selected items as `submitted_requirements`.
  - This affected any zero-requirement business type, not Ambulant specifically. Ambulant would have exposed it, because migration `0034` intentionally creates that type with zero requirements.
- **Web Fix** (`frontend/src/sanitation/pages/InspectionManagement.js`, `frontend/src/sanitation/pages/PermitRenewal.js`):
  - Inspection Management no longer substitutes the 10 generic requirements; Permit Renewal no longer substitutes the 7 generic requirements.
  - Zero-requirement types now show an honest "No requirements configured yet." state.
  - Inspections submit an empty checklist and renewals submit an empty `submitted_requirements` list instead of fabricated requirements.
  - Existing configured requirements continue to behave as before. Permit Renewal's cross-size behavior (using a type's own configured requirements from the other SP/Large coverage when none match) was intentionally preserved.
- **Verification (local)**:
  - New tests: `InspectionManagement.test.js` (5) and `PermitRenewal.test.js` (9); 14/14 passed. Against the pre-fix implementation, 8/14 intentionally failed, demonstrating that the tests catch the old fallback behavior.
  - Full frontend suite: 145/145 passed across 5 suites. Production-URL frontend build compiled successfully. `git diff --check` passed.
  - Backend tests were not rerun because no backend code changed; the previous 100/100 result remains valid for the unchanged backend.
  - No production database or API was modified.
- **Scope**: Web-only safety fix. Backend, migration `0034`, seed data, mobile code, requirements architecture, and production data were not changed.
- **Mobile Limitation (addressed later, on a branch)**:
  - At the time of this web fix, the mobile Flutter app still contained a generic fallback checklist for zero-requirement business types, and those items could be submitted and saved as inspection checklist items.
  - This was subsequently fixed on branch `sanitation/mobile-zero-requirements`; see **Mobile Zero-Requirement Inspection Checklist Fix** below. It is not merged and not deployed.
- **Existing Production Impact (inference at the time; since confirmed in production)**:
  - *Stated before production verification*: which existing production business types had zero configured requirements was not verified at that point. The inference was that the 13 seeded types produce exactly 243 requirement rows, matching the `SanitaryRequirement: 243` recorded at the clean-slate cleanup, which suggested the two non-seeded production types (likely "Food Establishment" and "Commercial Non Food") had zero requirements and were already receiving the generic fallback.
  - *Confirmed afterwards by the read-only production verification*: the three zero-requirement production types are `Ambulant Food Vendor`, `Commercial Non Food`, and `Food Establishment`, and the deployed web code no longer contains the old generic fallbacks. This confirmation rests on the public bootstrap data and the deployed frontend bundle; the authenticated UI was not visually checked.
- **Production Verification (read-only, after deployment)**:
  - The deployed frontend's 51 application source files are byte-identical to commit `e701599`. The old 10-item Inspection fallback and 7-item Renewal fallback are absent from the deployed frontend, and the new honest zero-requirement state is present.
  - Production currently has three zero-requirement business types (`Ambulant Food Vendor`, `Commercial Non Food`, `Food Establishment`), which confirms the earlier inference about the two non-seeded types.
  - Production verification could not directly confirm the authenticated production UI: the logged-in Inspection and Renewal screens were not visually verified.
- **Ambulant Status**: Migration `0034` is applied in production. Ambulant Food Vendor still intentionally has zero configured requirements; no requirements or legal basis were invented.

### Mobile Zero-Requirement Inspection Checklist Fix (branch `sanitation/mobile-zero-requirements`, NOT merged, NOT deployed)
- Commits on branch: `598e850` (remove the fabrication) and `97a6d4d` (honest empty state and empty-checklist submit). Branched from `f3bd653`. `origin/main` is unchanged by this work.
- **Root Cause**:
  - `_defaultChecksFor()` in `mobile/lib/screens/sanitation_screens.dart` substituted a hard-coded five-item checklist ("Proper waste disposal system", "Clean water supply available", "Functional toilet facilities", "Food handling area is clean", "Valid sanitary permit displayed") whenever the establishment's business type had no configured requirements, or when its business type id matched none of the loaded types.
  - Those fabricated items were ticked by the inspector and submitted to `/mobile/sanitation/inspections/` as real checklist items.
  - Mobile parses only `requirement_name` from the bootstrap and carries no permit-size field, so unlike the web it performs no SP/Large filtering and needs no cross-size fallback. The fabricated list therefore appeared only for types with zero requirements in total.
- **Mobile Fix** (`mobile/lib/screens/sanitation_screens.dart`):
  - The list-building logic was extracted unchanged into a pure top-level `buildInspectionChecks(businessTypes, businessTypeId)`, and the hard-coded fallback branch was then deleted. Configured types keep their exact previous behaviour: same names, same configured order, same case-insensitive de-duplication, all starting unchecked.
  - `InspectionChecklistPanel` shows "No requirements configured yet." for an empty checklist — the same wording as the web — instead of a "0% Complete (Unchecked)" score badge and empty progress bar.
  - The `_checks.isEmpty` submit guard ("Inspection checklist is required.") was removed, so a zero-requirement establishment can be inspected and submits `checklist_items: []`.
  - The starting status for an empty checklist is `good_standing`, mirroring the web form's rule in `frontend/src/sanitation/pages/InspectionManagement.js` (`if (total === 0 || completed === total) return "good_standing";`). The inspector can still change it from the Inspection status dropdown. Non-empty checklists keep their existing status behaviour.
- **Backend**: unchanged, and no change was required. `SanitaryInspectionCreateSerializer` declares `checklist_items` as `required=False` and `create()` defaults it to `[]`; `sync_establishment_after_inspection` copies the submitted `status_after_inspection` and derives nothing from the checklist, so an empty list cannot mis-score an establishment or divide by zero.
- **Verification (local only)**:
  - New tests: `mobile/test/sanitation_inspection_checklist_test.dart` (6 tests). Three failed against the pre-fix code, demonstrating the fabrication; all pass after the fix.
  - `flutter test`: 7/7 passed across the suite. `flutter analyze`: 4 issues found, the same 4 pre-existing info-level issues as before the change — no new issues.
  - No production database, API, or production data was touched.
- **Not Verified**:
  - Not merged to `main` and not deployed. A new APK build is still required.
  - **No real-device or emulator end-to-end test was performed.** The submission path was exercised only through a fake `TourismApi` in widget tests, never against a running backend.
- **Related (fixed separately)**:
  - `_buildRequirements()` in `mobile/lib/screens/sanitation_screens.dart` was deliberately left out of this fix and addressed on its own branch. See **Establishment Portal Real Requirements** below.

### Establishment Portal Real Requirements (branch `sanitation/portal-real-requirements`, NOT merged, NOT deployed)
- Commit on branch: `5f916e7`. Branched from `87f8cd6`. `origin/main` is unchanged by this work.
- **Root Cause**:
  - `_buildRequirements()` in `mobile/lib/screens/sanitation_screens.dart` returned a hard-coded list of five compliance documents — "Barangay Business Clearance", "Employee Health Certificates", "Water Potability Test Result", "Solid Waste & Grease Trap Maintenance" and "Pest & Vermin Abatement Plan" — regardless of the establishment's business type.
  - Each carried an invented description, an invented SUBMITTED/PENDING badge and an invented timestamp, for example "Verified on Jan 15, 2026", "Updated 12/12 staff records", "Tested on Jan 22, 2026 • Daungan Lab" and "Certified valid until Dec 2026". The badges and timestamps were switched on `complianceStatus`, which records nothing about whether an owner submitted a document.
  - The card also derived filter tabs, "N of 5 requirements met" counters and a completion progress bar from those invented values, and presented the whole thing to business owners in the Establishment Portal.
- **Data Availability (investigated before changing anything)**:
  - `SanitationEstablishmentPortalPage` previously received only the establishment, so it had `businessTypeId` but no access to that type's requirements.
  - Its caller, `_SanitationAccessGatewayState`, already holds a `SanitationBootstrap` whose `businessTypes` include each type's `requirements`. The bootstrap endpoint `/mobile/sanitation/bootstrap/` is `AllowAny` and is fetched before the gateway renders, so it is populated for establishment-owner sessions as well as staff sessions.
  - The fix was therefore possible entirely client-side. **No backend, serializer, endpoint or payload change was made.**
- **Mobile Fix** (`mobile/lib/screens/sanitation_screens.dart`):
  - `SanitationEstablishmentPortalPage` takes a new required `businessTypes` argument, supplied by the gateway from `widget.bootstrap.businessTypes`.
  - `_buildRequirements()` now returns the requirement names configured for the establishment's business type, or `null` when that type cannot be resolved. Name de-duplication reuses `buildInspectionChecks`, so the portal and the inspection form treat duplicate and blank names identically rather than carrying a second copy of the logic.
  - The card renders a plain list of names: no icons implying status, no SUBMITTED/PENDING badges, no descriptions, no timestamps, no counts, no completion percentage, and nothing derived from `complianceStatus`. The filter tabs, the `_ChecklistFilter` enum, the `_RequirementItem` class and the progress bar were removed as dead code.
  - Zero configured requirements shows "No requirements configured yet."; an unresolvable business type shows "Requirements unavailable."
- **Verification (local only)**:
  - New tests: `mobile/test/sanitation_portal_requirements_test.dart` (4 tests). All four failed against the pre-fix code. They assert the configured names render, both honest empty states render, none of the five fabricated documents appear, and none of the invented evidence fragments ("Verified on", "Tested on", "Daungan Lab", "12/12", "Certified valid until") appear anywhere in the rendered page, including for an establishment with a recorded violation.
  - `flutter test`: 11/11 passed across the suite. `flutter analyze`: 4 issues found, the same 4 pre-existing info-level issues — no new issues.
  - No production database, API, or production data was touched.
- **Not Verified**:
  - Not merged to `main` and not deployed. A new APK build is still required.
  - **No real-device or emulator end-to-end test was performed.** The portal was exercised only in widget tests, never against a running backend with a real owner login.

### Explicit Inspection Status for Empty Checklists (branch `sanitation/inspection-status-explicit`, NOT merged, NOT deployed)
- Commits on branch: `56276bc` (web) and `887e574` (mobile). Branched from `65a687f`. `origin/main` is unchanged by this work.
- **Rule**: when an inspection's checklist is empty — a business type with zero configured requirements, such as Ambulant Food Vendor — neither client auto-defaults `status_after_inspection`. The inspector must choose one before submitting. Non-empty checklists behave exactly as before, including the pre-existing divergence where web sets `violation` when nothing is ticked while mobile sets `for_completion`; that divergence was deliberately left untouched.
- **Rationale**: with nothing to check there is no evidence to infer a status from. The previous default of `good_standing` recorded a compliance judgement that no inspector had actually made.
- **Backend Finding (read-only; the backend was NOT changed in this work)**:
  - `SanitaryInspection.status_after_inspection` is declared as `models.CharField(max_length=30, choices=SANITARY_STATUS_CHOICES, default=SANITARY_STATUS_GOOD)` in `backend/api/models.py`, without `blank=True`. `SANITARY_STATUS_GOOD` is `"good_standing"`.
  - `SanitaryInspectionCreateSerializer` lists the field in `Meta.fields` with no explicit override, so DRF builds a `ChoiceField` with `required=False` and `allow_blank=False`.
  - Verified directly against the serializer field: a **missing** value raises `SkipField`, so it never reaches `validated_data` and the model default `good_standing` is applied silently; a **blank** `""` is rejected with `'"" is not a valid choice.'`
  - Consequence: the backend cannot distinguish "the inspector chose Good Standing" from "the client omitted the field", and it will not accept an empty string. Both clients therefore block locally rather than sending a blank or omitted status. Tightening the backend (for example making the field explicitly required for non-draft submissions) would be a separate, independently reviewable change.
- **Web Fix** (`frontend/src/sanitation/pages/InspectionManagement.js`):
  - The initial status is `""` when the checklist is empty and no draft status exists. Previously the rule was `if (total === 0 || completed === total) return "good_standing";`; it is now split so that `total === 0` returns `""` while `completed === total` still returns `good_standing`.
  - The Status After Inspection select gains a disabled `"Select status"` placeholder option, rendered only while no status is chosen. It had no placeholder before.
  - `handleSubmit` blocks with "Select the status after inspection." and sends nothing when the status is empty. A saved draft's status is still restored ahead of this rule, unchanged.
- **Mobile Fix** (`mobile/lib/screens/sanitation_screens.dart`, `mobile/lib/widgets/widgets.dart`):
  - `_status` is now `String?` and `_statusForChecks` returns null for an empty checklist instead of `good_standing`.
  - The Inspection status dropdown becomes `DropdownTile<String?>` and shows a "Select status" hint, via a new optional `hint` parameter added to the shared `DropdownTile` widget. The parameter is optional and defaults to null, so every other `DropdownTile` in the app is unaffected.
  - `_submit` blocks with "Select the status after inspection." when no status is chosen. The existing "Update the status for unchecked items." guard is unchanged.
  - The four selectable statuses were extracted from an inline literal into a named `sanitationInspectionStatuses` constant so the tests and the dropdown share one list.
- **Verification (local only)**:
  - Web: 4 new tests in `InspectionManagement.test.js`, 2 of which failed against the pre-fix code. Full frontend suite 149/149 passed across 5 suites (145 before plus the 4 new). `npm run build` compiled successfully.
  - Mobile: 3 new or rewritten tests in `sanitation_inspection_checklist_test.dart`, all 3 of which failed against the pre-fix code. `flutter test` 13/13 passed; `flutter analyze` reported the same 4 pre-existing info-level issues — no new issues.
  - Two existing web tests and one existing mobile test submitted a zero-requirement inspection without choosing a status. They were updated to pick one, because blocking that submission is the intended behaviour change.
  - No production database, API, or production data was touched. The backend was not modified.
- **Not Verified**:
  - Not merged to `main` and not deployed. **A new APK build is still required** for the mobile half to reach users.
  - No real-device or emulator end-to-end test was performed; the mobile form was exercised only through a fake `TourismApi` in widget tests.

### Inspection Management — Phase 1 Data-Integrity Fixes (branch `sanitation/inspection-integrity`, NOT merged, NOT deployed)
- Commits: `353e922`, `db24dd4`, `8e3830c`, `24d8b99`, `dde5ef6`. Branched from `0ff406b`. `origin/main` is unchanged by this work. Each fix has its own commit and its own tests that failed against the pre-fix code.
- **1. Drafts no longer change live records** (`353e922`, `backend/api/services/sanitation.py`):
  - `sync_establishment_after_inspection` ran on every save and never checked `is_draft`. Saving a draft therefore rewrote the establishment's `compliance_status`, mapped a new `permit_status` (a draft marked Violation **suspended the permit**), and raised a violation notification — all before the inspection was finalized.
  - The function now returns early for a draft. The guard sits at the single shared choke point, so it covers the web endpoint, the mobile endpoint, and both create and update. Finalizing a draft (`is_draft` True → False) applies the result exactly once.
  - Tests: `InspectionDraftIsolationTests` (5 tests; 4 failed before the fix), covering web create, web update, mobile create, finalizing, and the unchanged non-draft path.
- **2. No same-day overwrite** (`db24dd4`, `frontend/src/sanitation/pages/InspectionManagement.js`):
  - `isDraftOrRecent` treated **any** inspection dated today as editable, so a second visit on the same day issued a `PUT` over the first inspection and the serializer deleted and recreated its checklist. The first visit's record was lost.
  - Only an unfinished draft is reopened now; a finalized inspection is never overwritten, and a second visit creates a new record. Tests: 3 (1 failed before the fix).
- **3. Real inspector attribution** (`8e3830c`, `InspectionManagement.js`, `ComplaintsManagement.js`):
  - Removed the hard-coded `"Insp. Juan Dela Cruz"` universal fallback and the `inspector_maria`/`inspector_juan` special cases from both pages, the fabricated `"Insp. J. Cruz"` default in the complaint scheduling form, and the `"Insp. Juan Dela Cruz"` fallback printed on complaint reports.
  - Inspections are attributed to the signed-in account: `display_name` (which the API computes as `get_full_name() or username`), else first+last name, else username. Never an invented person.
  - The caption "Logged-in Active Account • Verified Inspector" was replaced with "Signed-in account": nothing in the system verifies inspector status, so the original claim was not backed by data.
  - Remaining occurrences are test fixtures only (`EstablishmentRecords` owner names, the `InspectionManagement.test.js` auth mock) and a `StaffManagement` input placeholder.
  - Tests: 5, all of which failed before the fix.
- **4. Checklists start unchecked** (`24d8b99`, `InspectionManagement.js`):
  - New inspections pre-ticked items from the establishment's previous `compliance_status`: everything for `good_standing`/`upcoming`, and everything except the last item for `for_completion`. An inspector could submit a checklist they never looked at.
  - Every item now starts unchecked. A saved draft still restores the ticks and notes the inspector had already made. The stale warning text ("Status will be auto-set to For Completion…") now describes the rule the form actually applies.
  - Tests: 4 (3 failed before the fix).
- **5. One next-due-date rule everywhere** (`dde5ef6`, backend + web + mobile):
  - **Rule**: annual → +1 year, quarterly → +3 months, monthly → +1 month; an unrecognised frequency yields **no** suggestion rather than a silent +1 month, so a misconfigured business type is visible instead of quietly producing a wrong schedule.
  - **Frequency values that exist**: `monthly`, `quarterly`, `annual` — the three `SANITARY_FREQUENCY_CHOICES` in `backend/api/models.py`, and the only three values in production (7 monthly, 3 quarterly, 6 annual across 16 types, via a read-only bootstrap GET). There is no `annually` spelling anywhere in code or data.
  - **Mobile** had no annual branch at all (`frequency == 'quarterly' ? 3 : 1`), so all 6 annual types got a one-month due date from the phone. It also overflowed at month ends, turning 31 January into **3 March**; the web overflowed the same way. All three layers now clamp to the last real day of the target month.
  - **Backend**: `suggested_next_due_date` and `apply_default_next_due_date` were added to `services/sanitation.py` and wired into both endpoints. When a **final** inspection omits `next_due_date`, it is computed from `establishment.business_type.inspection_frequency`. An explicit value from the client always wins, and drafts are left without a due date. Previously the backend never computed one, so the schedule depended entirely on whichever client happened to submit.
  - Tests: 7 backend (4 red), 6 web (6 red), 5 mobile (3 red).
- **Verification (local only)**:
  - Backend: `Ran 112 tests in 103.650s` / `OK`.
  - Frontend: `Tests: 167 passed, 167 total`, `Test Suites: 5 passed, 5 total`; `npm run build` → `Compiled successfully.`
  - Mobile: `flutter test` 18/18 passed; `flutter analyze` → `4 issues found`, the same 4 pre-existing info-level issues, none new.
  - No production database, API, or production data was changed.
- **Not Verified**: not merged to `main`, not deployed, **a new APK build is still required**, and no real-device or emulator end-to-end test was performed.

### Inspection Management — Phase 2a (branch `sanitation/inspection-phase2a`, NOT merged, NOT deployed)
- Commits: `dacbdb2`, `485f1b0`, `013c954`, `1891c4b`. Branched from `cfb8524`. `origin/main` is unchanged. Mobile was not touched and is byte-identical to `main`.
- **1. Real inspector list in Complaints** (`dacbdb2`):
  - **Existing endpoint investigated and rejected**: `GET /api/sanitation/staff/` (`backend/api/urls.py`, `views/sanitation.py`) is guarded by `@module_required("sanitation")`, so a sanitation-role user may call it. It serializes `SanitaryStaffSerializer`: `id, username, first_name, last_name, full_name, email, is_active, date_joined, role, role_label`. Reusing it for a dropdown would ship staff **email addresses** and account metadata to a widget that needs neither. It also filters `profile__role=ROLE_SANITATION` only, so admin accounts are excluded, and it returns inactive accounts.
  - **New endpoint**: `GET /api/sanitation/inspectors/`, `@module_required("sanitation")`, read-only (`@api_view(["GET"])`). Returns `[{id, name}]` for `is_active=True` users whose `profile.role` is sanitation or admin, `name` being `get_full_name() or username`, ordered by name. Nothing else is exposed.
  - **Tests** (`SanitationInspectorListTests`, 7): the 200 case for a sanitation user; the exact key set `{id, name}` per row, plus assertions that neither `@test.local` nor `date_joined` appears anywhere in the response body; the username fallback for a nameless account; exclusion of an inactive account; 403 for tourism, tourist and establishment roles; 401 for anonymous (DRF's `IsAuthenticated` default runs before the decorator); 405 for POST. 6 failures and 3 errors before the endpoint existed.
  - **Web**: `ScheduleInspectionModal` takes an `inspectors` prop, supplied by the page from the new endpoint, and is exported for testing. The four invented names (`Insp. J. Cruz`, `Insp. M. Santos`, `Insp. R. Dela Pena`, `Insp. E. Alcantara`) are gone. A value already stored on an older record is prepended to the options so history stays readable; an unset value renders a disabled "Select inspector" placeholder; an empty list renders "No inspector accounts available." The stored value remains a plain string — **no migration, no schema change**. 6 web tests, all red before the change.
  - **Grep after the change**: the only remaining occurrences of `Insp. `, `R. Dela Pena` and `E. Alcantara` in `frontend/src` and `mobile/lib` are in the new `ComplaintsManagement.test.js`, where they are the regression assertions that those names are *not* offered, plus the historical-value case. No production code contains them.
- **2. Working pagination** (`485f1b0`, `InspectionManagement.js`): client-side, `ROWS_PER_PAGE = 10`, prev/next disabled at the first and last page, label "Showing N of M | Page X of Y". A `changeFilter` wrapper resets to page 1 whenever the search box or either filter changes, and `Math.min(page, pageCount)` keeps the view valid when the filtered set shrinks. Paging is presentation only: `handleExport` and the due/overdue alert counts still read `filteredRows` and `rows`, so the CSV covers every filtered row. 4 tests, 3 red before the change.
- **3. Inspection history and read-only detail** (`013c954`, `InspectionManagement.js`, `Sanitation_index.css`):
  - **No backend change was needed.** `GET /api/sanitation/inspections/` already returns every inspection, with `select_related` on the establishment and `prefetch_related("checklist_items")`, and `SanitationDataContext` already stores the full list. No filter parameter was added.
  - `InspectionHistoryModal` lists all inspections whose `establishment` matches the row, sorted by `inspection_date` descending, each showing date, inspector, status label, next due, and a "Draft" badge where `is_draft`. `InspectionDetailModal` renders the inspection read-only: inspector, status, next due, findings, remarks, and each checklist item marked "Complied" or "Not complied" with its notes. A test asserts the detail contains zero `input`, `textarea` or `select` elements and neither submit control.
  - 7 tests, all red before the change.
- **4. Completed inspections on the calendar** (`1891c4b`): `buildCalendarEventMap` now also plots finalized inspections on their `inspection_date` as an "Inspected" event (`.calendar-event.completed`), added to the legend. Drafts are skipped, as is any inspection whose establishment is not in the current filtered rows. The existing Upcoming Due and Overdue events are unchanged. The dead `calendarStatusClass` helper and its `eslint-disable no-unused-vars` suppression were deleted. 3 tests, 1 red before the change.
- **Verification (local only)**: backend `Ran 119 tests in 272.155s` / `OK`; frontend `Tests: 187 passed, 187 total`, `Test Suites: 6 passed, 6 total`; `npm run build` → `Compiled successfully.`; `flutter test` 18/18; `flutter analyze` → `4 issues found`, the same 4 pre-existing info-level issues. `git diff origin/main..HEAD -- mobile/` is empty. No production database, API, or production data was touched.
- **Not Verified**: not merged to `main`, not deployed, and the new screens were exercised only through tests — no manual or authenticated UI check was performed. A new APK build is still required for the Phase 1 mobile changes already on `main`.
- **Deliberately deferred (Phase 2b, blocked)**: web photo upload. `validate_image_file` needs magic-byte content sniffing before an upload path is opened on the web endpoint; wiring one up first would widen the attack surface. Photo captions and an inspection delete action in the UI remain missing as well.

### Never-Inspected Establishments Show "Good Standing" (READ-ONLY investigation, NOT fixed)
Investigated on branch `sanitation/inspection-followups`. No code, migration or data was changed.

- **Where the status comes from**, in order of how a record can acquire `good_standing` without ever being inspected:
  1. **Model default** — `SanitaryEstablishment.compliance_status = models.CharField(..., default=SANITARY_STATUS_GOOD)` (`backend/api/models.py:720-724`). Any row created without an explicit value, by a seeder, the permit importer, the Django admin, or a shell/script, starts as Good Standing.
  2. **The register form's base default** — `frontend/src/sanitation/pages/EstablishmentRecords.js:116` still has `compliance_status: "good_standing"` in the blank form object. It is normally overridden: `NEW_ESTABLISHMENT_PERMIT_STATE` (line ~149) sets `compliance_status: "no_permit"` for a newly registered establishment, which is the Establishment Records rule that a new record must not start with an unearned status. So registration through the current web UI is **not** the source.
  3. **"Issue & Generate Permit Now"** — `EstablishmentRecords.js:428-430`: `if (loaded.compliance_status === "no_permit") { loaded.compliance_status = "good_standing"; }`. Issuing a permit promotes the establishment straight to Good Standing even though no inspection has taken place. **This is the most likely path for a record such as "711"**, and it conflates "has a permit" with "found compliant".
  4. **Serializer** — `SanitaryEstablishmentSerializer` exposes `compliance_status` as writable and `compliance_status_label` as read-only; it applies no default of its own, so whatever the client sends, or the model default, wins.
- **What it should show**: the Establishment Records rule already adopted for permits — a new record starts with nothing fabricated. There is currently **no state meaning "never inspected"**. `SANITARY_STATUS_CHOICES` offers only `good_standing`, `upcoming`, `for_completion`, `violation`, `no_permit`; `upcoming` is the closest but means "inspection due soon", which is a schedule, not an absence of history.
- **Where it is displayed** (every one of these would show the new state):
  - Web: `EstablishmentRecords.js` (table column and detail modal), `InspectionManagement.js` (Status column and the history/detail views), `PermitMonitoring.js`, `SanitationDashboard.js`, `SanitaryReportAnalytics.js`, `SanitaryGISMap.js` (marker colour), `SubmissionTracking.js`, `VerifyPermit.js` (public permit verification).
  - Backend aggregates: `services/sanitation.py` — `get_establishment_status_counts`, `get_business_type_counts`, `build_dashboard_business_type_rows`, `build_sanitation_question_answers` (compliance rate, top violation type, barangay risk). A "never inspected" bucket must be excluded from the compliance-rate numerator and denominator rather than counted as compliant.
  - Mobile: `models.dart` (`complianceStatus`, `statusLabel`) and `sanitation_screens.dart` (status chips, the establishment portal's status card, `sanitationStatusColor` / `sanitationStatusLabel`).
- **Proposed minimal fix (NOT implemented, needs approval)**:
  1. Add one choice, `not_yet_inspected` ("Not Yet Inspected"), to `SANITARY_STATUS_CHOICES`, and change the model default from `SANITARY_STATUS_GOOD` to it. **A schema migration is required** (an `AlterField` for both `choices` and `default`); it alters no existing row.
  2. Remove the `no_permit → good_standing` promotion at `EstablishmentRecords.js:428-430` so issuing a permit no longer implies a compliance finding, and drop the stale `compliance_status: "good_standing"` from the blank form object at line 116.
  3. Map the new state in `PERMIT_STATUS_BY_COMPLIANCE`? **No** — leave it out, so a never-inspected establishment's permit status is untouched by it.
  4. Exclude it from the compliance-rate maths in `services/sanitation.py` and give it a neutral colour in the web status classes and `sanitationStatusColor`.
  5. **Existing production rows**: a data migration would be needed to reclassify establishments that have `compliance_status = good_standing` **and** zero related `SanitaryInspection` rows. This is a production data change and should be a separate, separately approved step — it cannot distinguish "never inspected" from "inspected on paper before the system existed", so the client should confirm the intent first.
- **Not investigated**: whether "711" specifically was created by the register form, the permit importer, or a seeder. That would need a production read, which was out of scope here.

### "Not Yet Inspected" Compliance Status (merged to `main` and pushed as `2426b65`; deploy not verified)
- Commits: `a314f7e` (backend), `7132faa` (web), `eb57a77` (mobile). Branched from `9a49d85`. `origin/main` is unchanged.
- Implements the proposal from the earlier read-only investigation. An establishment nobody has inspected previously defaulted to `good_standing`, so it displayed "Good Standing" it had not earned.
- **Model and migration**:
  - `SANITARY_STATUS_NOT_YET_INSPECTED = "not_yet_inspected"` ("Not Yet Inspected") is now the first entry of `SANITARY_STATUS_CHOICES` and the default for `SanitaryEstablishment.compliance_status`.
  - `backend/api/migrations/0035_add_not_yet_inspected_compliance_status.py` holds exactly one operation:
    `AlterField(model_name='sanitaryestablishment', name='compliance_status', field=models.CharField(choices=[...6 choices...], default='not_yet_inspected', max_length=30))`.
  - **Proof it changes no rows**, two ways. (1) Structural: the migration was inspected at runtime — `operations: 1`, `AlterField`, `reduces_to_sql: True`, and `data operations (RunPython/RunSQL): 0`. A field default is applied by Django when a row is created, never retroactively, and an `AlterField` on a `CharField`'s `choices`/`default` emits no `UPDATE`. (2) Empirical: `NotYetInspectedMigrationTests` is a `TransactionTestCase` that migrates to 0034, creates one establishment for each of the five pre-existing statuses, captures `{pk: compliance_status}`, migrates to 0035, and asserts the map is identical, then asserts a row created after the migration does get `not_yet_inspected`.
  - **A second AlterField was deliberately avoided.** `makemigrations` initially also widened `SanitaryInspection.status_after_inspection`, because both fields shared `SANITARY_STATUS_CHOICES` — which would have let an inspector record "Not Yet Inspected" as an inspection *result*. A separate `SANITARY_INSPECTION_RESULT_CHOICES` (the five original values) now backs that field, so its choices are unchanged and the migration touches only the establishment.
  - It is **not** added to `PERMIT_STATUS_BY_COMPLIANCE`, so it never derives a permit status.
- **Aggregates** (`services/sanitation.py`): `get_establishment_status_counts` and `get_business_type_counts` each gained a `not_yet_inspected` count, exposed as `not_yet_inspected` on the dashboard business-type rows, so it is its own bucket wherever counts are shown. `build_sanitation_question_answers` computes `inspected_total = total - not_yet_inspected` and divides the compliance rate by that, so never-inspected establishments sit on neither side of the rate.
- **Web** (`EstablishmentRecords.js`, `SanitaryGISMap.js`, `SanitaryReportAnalytics.js`, `Sanitation_index.css`):
  - Removed the `if (loaded.compliance_status === "no_permit") { loaded.compliance_status = "good_standing"; }` promotion from `openEditModal`, so "Issue & Generate Permit Now" performs an administrative act without inventing an inspection finding.
  - The blank form's `compliance_status: "good_standing"` and `NEW_ESTABLISHMENT_PERMIT_STATE`'s `"no_permit"` are both now `"not_yet_inspected"`, so a newly registered establishment records no finding.
  - **Also removed, beyond the listed scope**: the "Has Permit?" select forced `compliance_status` in both directions — `no` → `no_permit`, `yes` → `good_standing`. Both were deleted, because they are the same fabrication and would have bypassed the `openEditModal` fix entirely. Permit fields and `permit_status` still update as before. Four characterization tests documenting the old forcing were updated.
  - Label and filter option added to Establishment Records, Report Analytics and the GIS map; a neutral slate marker (`#64748b`) in `getMarkerColor`; neutral `not-yet-inspected` styles for `.status-pill`, `.establishment-status`, `.inspection-status`, `.permit-status`, `.permit-compliance`, `.activity-status` and the Report Analytics standing banner. Permit Monitoring, Dashboard, Submission Tracking and VerifyPermit render `compliance_status_label` from the API, so they display the new label without code changes.
- **Mobile** (`helpers.dart`): `sanitationStatusLabel` returns "Not Yet Inspected" and `sanitationStatusColor` returns `AppColors.muted` for it, stated explicitly rather than relying on the fallback.
- **Already-distributed APK behaviour with an unknown status: it does not crash.**
  - `String sanitationStatusLabel(String value) { switch (value) { ... default: return value.isEmpty ? 'Pending' : value; } }` — an unrecognised value is returned verbatim.
  - `Color sanitationStatusColor(String value) { switch (value) { ... default: return AppColors.muted; } }` — an unrecognised value already gets the neutral grey.
  - Better still, `SanitationEstablishment.fromJson` reads `statusLabel: '${json['compliance_status_label'] ?? 'Upcoming'}'`, and the API serializes that field from `get_compliance_status_display()`, so wherever the app shows `statusLabel` an old APK already displays "Not Yet Inspected" correctly. Only direct `sanitationStatusLabel(complianceStatus)` call sites would show `not_yet_inspected` in snake_case until a rebuild.
- **Verification (local only)**: backend `Ran 135 tests in 157.369s` / `OK`; frontend `Tests: 197 passed, 197 total`, `6 suites`; `npm run build` → `Compiled successfully.`; `flutter test` 30/30; `flutter analyze` → `4 issues found`, the same pre-existing info issues. No production database, API, or production data was touched.
- **Not Verified / open**: not merged, not deployed, **a new APK build is required**, and no manual or authenticated UI check was performed. **Existing production rows keep their stored status** — establishments already carrying `good_standing` with no inspections still read Good Standing. Reclassifying them requires a separate data migration and separate client approval, because it cannot distinguish "never inspected" from "inspected before this system existed".

### Establishment Records — Client Meeting Fixes (merged to `main` as `75c2309`; deployed, frequencies verified)
- Commits: `79098e8`, `b966a9d`, `7865f89`, `1aab64f`. Branched from `2426b65`.
- **Client meeting decisions (recorded as stated by the client, in person)**:
  - **Violation levels**: violations use three colour-coded levels. Not implemented yet.
  - **Barangay sanidad accounts**: barangay sanidad staff get individual per-person accounts, not a shared barangay account. Not implemented yet.
  - **Business type**: the business-type field itself stays as it is; only the category mapping and inspection frequencies below were corrected.
  - **Inspection frequencies**: set per the client's form (below).
  - **Sanitary permit number** is the most important field to capture when adding a record ("pinakamahalaga"); permits are valid for one year.
- **Categories**: `businessTypeLabels.js` previously mapped Drug Store and Private Laboratory & Clinic to Institutional Establishment and Massage / Physical Therapy to Commercial / NF. Corrected to Commercial / NF, Public Places and Public Places. Institutional Establishment is intentionally empty until a real schools type exists. Tests assert each client-stated mapping.
- **Frequencies (migration `0036`)**: production before → after (from the public bootstrap GET, read-only):

  | id | Business type | Before | After |
  |---|---|---|---|
  | 8 | Water Refilling Station | monthly | monthly |
  | 9 | Agro-industrial Establishment (Poultry / Piggery Farm) | quarterly | quarterly |
  | 10 | Sub-contractor | annual | **quarterly** |
  | 11 | Restaurant / Food Establishment | monthly | **quarterly** |
  | 12 | Massage / Physical Therapy | quarterly | **annual** |
  | 13 | Public Market Stall | monthly | **quarterly** |
  | 15 | Food Establishment | monthly | **quarterly** |
  | 16 | Commercial Non Food | monthly | monthly (Depends — unchanged) |
  | 17 | Drug Store | annual | annual (Depends — unchanged) |
  | 18 | Resort / Picnic Ground | quarterly | **annual** |
  | 19 | Boatman | annual | **quarterly** |
  | 20 | Funeral Parlor | annual | annual |
  | 21 | Burial Ground | annual | annual |
  | 22 | Private Laboratory & Clinic | annual | annual |
  | 23 | Karaoke / Video Bar / CSW | monthly | **annual** |
  | 24 | Ambulant Food Vendor | monthly | monthly |

  Ids are shown for reference only; the migration matches by name.
- **Permit number at registration**: optional; unique across establishments (case-insensitive, trimmed) at the serializer. The owner claim flow (`establishment_register_view`) is unchanged and still matches by `permit_number__iexact` under `select_for_update()` inside `transaction.atomic()`, returning 409 and writing nothing when any match is already linked; new tests cover a claim of a staff-recorded permit, a rejected second claim, and the row lock. Uniqueness makes the claim unambiguous (previously two records could share a number and the claim took the lowest id).
- **Security note (pre-existing, not changed)**: a claim needs only the permit number, which is printed on the permit displayed at the establishment. Recording real permit numbers therefore makes each unlinked establishment claimable by anyone who reads its permit. Consider a second factor (e.g. a staff-issued claim code) before real permit numbers are entered at scale.
- **Table text**: Establishment Records only (`.establishment-records-table`).
- **Verification**: backend 150 OK; frontend 217/217; build compiled; flutter 30/30; analyze 4 pre-existing infos. Not merged, not deployed, no browser check.

### Production Test-Data Cleanup (2026-09-26)
- Performed on **2026-09-26** by the planner in a direct Supabase SQL session, with explicit user approval, in **one transaction**, after a full JSON backup of every affected row (the backup is kept by the user, not in this repository). Not performed from this codebase or by an automated agent.
- **Deleted**:
  - Inspections 338, 339, 340, 341 and their 35 checklist items.
  - Complaints 96, 97, 104, 105.
  - Notifications 2, 3.
  - Permit renewal 423.
  - Household records 599, 600, 601, 602.
  - Establishment 447 "Moto Shop Ni Manong" (test data recorded under the wrong business type).
- **Updated**: establishments 448 "711" and 449 "Perly'S Sari-Sari Store" → `compliance_status = not_yet_inspected`.
- **Verified afterwards**: 2 establishments; 0 inspections, checklist items, complaints, permit renewals, notifications and household records; tourist records (11) and activity logs (110) untouched. Migration `0035` confirmed applied in production (`django_migrations`).
- **Still open**:
  - 6 complaint photo files remain in Supabase Storage under `media/complaints`; the user is deleting them via the Supabase dashboard.
  - Establishment 449 has `has_permit = false` but `permit_status = active`, and its stored name is "Perly'S" (title-casing artefact). To be fixed through the web UI.

### Security: Sanitation Public Data Exposure (branch `security/sanitation-public-data`, NOT merged, NOT deployed)
- Branch from `75c2309`. Sanitation only: no tourism file, tourism endpoint, tourism screen or shared login behaviour was changed. `backend/api/views/mobile.py` holds both modules; every hunk in it is inside a sanitation function (plus one import).
- Commits: `2a9e5d0` (permit verify), `1e3d4f0` (report history), `35b6749` (staff bootstrap endpoint), `b8f3446` (mobile staff merge), `79fb668` (public bootstrap reduced), `c502222` (claim rate limit). Each has an exploit test that failed against the previous code and passes after.
- **Permit verification** (`/api/mobile/sanitation/permits/verify/`): previously matched a business name or a numeric record id (so records could be enumerated) and returned owner name, contact number, address, coordinates and the permit number. Now matches the permit number only (trimmed, case-insensitive) and returns exactly: `verified`; `establishment` {business_name, business_type_name, barangay, permit_number}; `permit` {permit_number, permit_status, permit_status_label, permit_issued_date, permit_expiry_date}. Web `VerifyPermit.js` and the mobile verification card show only these (the web headline now follows the permit status). The web Establishment Records QR, "Open Verification Page" link and print view used `/verify-permit/<id>`; they now use the URL-encoded permit number, show no QR without a permit number, and printing no longer falls back to the third-party `api.qrserver.com` image service. **Any QR already printed from Establishment Records (id-based) no longer verifies.**
- **Report history** (`/api/mobile/sanitation/reports/history/`): previously either a contact number (partial `icontains`) or a reference returned up to 30 reports. Now both the complaint ID and the exact contact number (digits only, `+63` folded to `0`) are required, returning at most that one report; either missing → 400 with a clear message.
- **Staff bootstrap** (`GET /api/mobile/sanitation/staff-bootstrap/`, `IsAuthenticated` + sanitation module: admin/sanitation roles): establishments, inspections, complaintData, householdRecords and staff notifications in the existing shapes. 401 anonymous; 403 tourism, tourist and establishment roles.
- **Mobile staff app**: after sign-in and on every refresh it loads the staff bootstrap with the stored token and layers it over the public bootstrap (`mergeSanitationStaffRecords`). A 401 clears the stored token and ends the session; a 403 or other failure shows a message. Public screens still use the public bootstrap.
- **Public sanitation bootstrap** (`/api/mobile/sanitation/bootstrap/`): now `businessTypes`, `barangays`, advisory-only `notifications`, with `establishments`, `inspections`, `householdRecords` = `[]` and `complaintData` = `{"summary": {}, "rows": []}` so installed apps still parse it. `dashboardData`/`permitData` (never read by the app) removed.
- **Rate limit**: only `establishment_register_view` (both `/api/auth/register-establishment/` and `/api/mobile/sanitation/register-establishment/`), 5/hour per client, via a `ScopedRateThrottle` subclass with a fixed scope. Counts are kept in a `DatabaseCache` alias `throttle` (table `api_throttle_cache`) so all server processes share them. The table is created by migration `0037_create_throttle_cache_table` (`createcachetable` for that one table only; does nothing if it exists; no-op reverse; no rows touched), because **Render's build command is `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate` — it does not run `backend/build.sh`**. Without the table every claim request would have returned 500; a test drops the table, migrates, and checks claims return 4xx/429, never 500. The default `LocMemCache` used for bootstrap/reference caching is unchanged. `NUM_PROXIES = 1`. Login is not throttled (a test pins this).
- **What an OLD (already-installed) APK loses** after this deploys:
  - Staff app: it never calls the staff bootstrap, so the dashboard counts, establishment list, map pins (establishments and households), Sanitary Permits page, complaint/reports list and staff notifications are **empty**. The establishment inspection form has no establishment to choose, so **establishment inspections cannot be submitted from an old APK**. Household surveys, community reports and permit verification still work. Staff need the new APK.
  - Permit verification card: owner/address were never shown on mobile; the "Compliance Status" row now shows the fallback "Pending" because the server no longer sends a compliance status. Lookups by business name or record id now fail.
  - Report tracker: the old screen accepts either field, but the server now needs both; entering one shows the server's "Enter both the contact number and the complaint ID…" message.
  - Owner claim: more than 5 attempts per hour from one address get HTTP 429 (the app shows the server's throttle message).
  - Unchanged for old APKs: business types, barangays, public advisories, community reporting, the owner portal.
- **Tourism-side findings — reported to the tourism owner, not changed here**:
  - The public tourism bootstrap's notifications list the 4 most recently approved tourist registrations with full name, survey ID and resort; `?contact=` (partial match) or `?reference=` returns another visitor's name. **FIXED (2026-10-06, Phase 1; see "Public Mobile Tourism Privacy" at the top).**
  - Destination detail `recentFeedback` returns the latest 5 reviews with reviewer name and photos. **Reviewer name FIXED (Phase 1b: initials); photos kept by decision.** (Correction to the earlier audit: `FeedbackEntry.status` is a sentiment — positive/neutral/negative — not a moderation state, so there is no "approved" filter to apply; moderation would need a new field.)
  - `referenceTables.resorts` includes entries named "Private Property", "Residence" and "Others / Private Residence" with coordinates.
  - Login is not rate-limited.
- **Verification (local only)**: backend `Ran 172 tests` / `OK`; frontend `224 passed, 224 total` (7 suites); `npm run build` → `Compiled successfully.`; `flutter test` 38/38; `flutter analyze` the same 4 pre-existing info issues.
- **Not verified / open**: not merged, not deployed, **a new APK is required** for staff. `NUM_PROXIES = 1` assumes one proxy hop on Render; if Render adds another hop every client would share one bucket — check after deploy. No authenticated browser or device check was performed.

### Sanitation Public Landing & Community Report (merged to `main` as `619b09e`; sanitation APK 1.0.2 / 3 built)
- Branched from `459bce4`. Sanitation app only; no tourism file or shared login code changed. Commits: `b0f2898` (landing page), `d7067cd` (reports require identity), `cba0fde` (report form), `04f2a1f` (upload tests updated for the identity rule), then the three server-side gaps: `1213219` (server-derived urgency), `ecf1e0b` (rate limits), `f0c9ead` (location_address field).
- **Client decision: no anonymous community reports.** The Sanitary Section will not act on a report it cannot follow up, so every report needs a name and a reachable number.
- **Landing page** (`_buildChooserScreen`): top bar with the logo, "Mauban Sanitary / Municipal Health Office" and a 44px "Staff Sign In" pill (hidden on the web build, as before, because field work runs on the mobile app); heading "Ano ang kailangan mo ngayon?"; two cards — "PARA SA RESIDENTE / Community Report" and "PARA SA MAY-ARI NG NEGOSYO / Establishment Portal" (unchanged destination); all feature chips and the "Municipal Inspector Portal" card removed; an "I-verify ang nakapaskil na permit" link to the existing permit verification screen; footer "Official Mauban LGU e-Service · Sanitary Section".
- **Server rule** (`/api/mobile/sanitation/reports/`): a blank `complainant_name` → 400 "Ilagay ang iyong pangalan. / Please enter your name."; a contact that is not a Philippine mobile number → 400 "Ilagay ang wastong contact number (hal. 09171234567). / Please enter a valid mobile number (e.g. 09171234567)." **Contact rule**: keep digits only, fold a `+63`/`63` prefix (12 digits) to a leading `0`, then it must match `^09\d{9}$`. The contact is stored in that normalised form. Any `is_anonymous`/`anonymous` flag is ignored.
- **Urgency is derived on the server** (`1213219`): the public report endpoint ignores any `priority`/`urgency` the client sends and derives it from the category via `COMMUNITY_REPORT_CATEGORY_PRIORITIES` in `backend/api/services/sanitation.py`, the single server copy of the app's 12 categories — Urgent (`high`): Contaminated Water Source, Hazardous / Medical Waste, Severe Sewage Overflow; Low (`low`): Other Sanitation Concern; the other 8 Standard (`medium`). Matching ignores case and extra spaces and stores the canonical name. An unknown or missing category → 400 "Pumili ng category mula sa listahan. / Please choose a category from the list." (no default guess).
- **Server-side rate limits** (`ecf1e0b`), on top of the unchanged on-device 5/day counter: 5 saved reports per day per normalised contact number (09XXXXXXXXX) and 20 requests per hour per client address, both `ScopedRateThrottle` subclasses in `backend/api/throttles.py` using the shared `throttle` DatabaseCache (same pattern as the claim limit). The contact limit is recorded only when a report is saved, so a submission rejected for a missing field does not use up the quota. Exceeding either → 429 with a Tagalog/English message (DRF appends "Expected available in N seconds.").
- **Report form**: header with "Ano ang sakop?" link (the guide still also opens once on arrival); category chips; read-only urgency badge; required barangay; "Lokasyon / Address" with GPS and an optional map (raw latitude/longitude hidden); description max 1000 characters; camera/upload tiles and removable thumbnails; required name and contact; Filipino privacy consent; large submit button, remaining-today line, Save Draft as a text button.
- **Location address field** (`f0c9ead`): `SanitaryComplaint.location_address` (CharField, max 255, blank, default `''`), added by migration `0038_sanitarycomplaint_location_address` (one `AddField`; existing rows get `''`). The endpoint requires a non-blank value (whitespace collapsed) → 400 "Ilagay ang lokasyon o address ng nakitang problema. / Please enter the location or address of the problem." The description is stored as typed; the earlier interim "Lokasyon: …" prefix is gone. The app sends `location_address` as its own field (form and draft retry). Staff see it in the web Complaints detail, brief-summary modal and printed action slip (HTML-escaped), web search matches it, and the mobile staff reports list shows "Barangay · location".
- **Photos**: the app allows up to 5. The server accepts any number of `photo` files (no cap), so 5 is enforced by the app only.
- **What an OLD APK sees**: an old build still offers "Submit without name" and **never sends `location_address`**, so after this deploys **every report from an old APK is rejected** with 400. The old app's `_submit` catch block runs `await SanitationDraftStore.upsertReport(_buildDraft());` then `showAppMessage(context, 'Submission failed: ${conciseError(error)}. Draft saved for pending sync.')`, and `conciseError` returns the server's `detail` — e.g. "Submission failed: Ilagay ang lokasyon o address ng nakitang problema. / Please enter the location or address of the problem.. Draft saved for pending sync." (or the name / contact message, which are checked first). No crash, but the draft fails again on every retry. **The new APK is required for community reporting** once this backend is deployed.
- **Verification (local only)**: backend `Ran 189 tests` / `OK`; frontend `226 passed` (8 suites); build `Compiled successfully.`; `flutter test` 51/51; `flutter analyze` the same 4 pre-existing infos. A local `runserver` on a throwaway SQLite database confirmed: a Standard report sent with `priority: high` is stored `medium` with its `location_address`; `urgency: urgent` on a Low category is stored `low`; a blank address → 400; the 6th report from the same contact in a day → 429 while a different contact → 201.
- **Not verified**: not merged, not deployed, no new APK, no device test (camera, gallery, GPS and the map were not exercised in tests).

### Community Report Submit Errors & Idempotency (branch `sanitation/report-submit-errors`, NOT merged, NOT deployed)
- Branched from `619b09e`. Sanitation only; no tourism or shared login code changed. Commits: `99c1a6e` (idempotent submit), `ba5383e` (public form error handling), `536a5ff` (PostgreSQL savepoint test), `7c79bc2` (barangay list).
- **Goal**: a public reporter is never told a report was saved as a draft they cannot see, and a retry after a timeout never creates a duplicate report.
- **Idempotent submit (backend)**: `SanitaryComplaint.client_submission_id` (CharField 64, null, blank, unique), added by migration `0039_sanitarycomplaint_client_submission_id` (one `AddField`; existing rows get NULL, and NULLs do not collide on the unique index). The public report endpoint answers a known id with **200 and the existing report** (same body as the original 201), creates nothing, and the resend is exempt from the per-contact (5/day) and per-IP (20/hour) limits. A new id → normal 201; no id → still accepted (older apps). Two requests with the same id that both pass the check race on the insert: the save runs in its own `transaction.atomic()` block, and the loser's `IntegrityError` is answered with the winner's report instead of a 500. A threaded `TransactionTestCase` (two real requests, both past the check, inserting 0.5 s apart because SQLite's in-memory test database answers truly simultaneous writes with "table is locked") produces exactly one row, a 201 and a 200 with the same complaint_id; without the race handling it fails with `[201, 500]`. Photos uploaded by a losing duplicate request would be stored but not linked (rare; not cleaned up).
- **Public report form (mobile)**: the staff app opens the same `SanitationReportPage` (from "New Community Report" and when editing a draft), so a `saveDraftOnFailure` flag is passed as `true` from those two staff entry points only; staff keep draft-saving, the Save Draft button and their manual retry unchanged. On the public path a failed submit no longer saves a draft and the form no longer shows Save Draft (there is no drafts screen for residents): every field and the selected photos stay, the submit button works again, and the message is bilingual with no raw exception text — 400 and 429: the server's own message; 5xx: "May problema sa server. Subukan ulit mamaya. / Server problem. Please try again later."; no network or timeout: "Hindi naipadala. Tingnan ang internet at subukan ulit. / Not sent. Check your connection and try again." Each fill of the form gets one random version-4 UUID (`newClientSubmissionId`), sent as `client_submission_id` and reused on retries; a new form gets a new one. While sending, a second tap is ignored and a note says the first submit can take up to a minute while the server wakes up.
- **Old APKs** send no `client_submission_id`; they keep working exactly as before (no idempotency for them).
- **Verification (local only)**: backend `Ran 202 tests` / `OK`; frontend `226 passed` (8 suites); build `Compiled successfully.`; `flutter test` 64/64; `flutter analyze` the same 4 pre-existing infos. A local `runserver` on a throwaway SQLite database: the same `client_submission_id` sent twice → 201 then 200 with the same `CMP-2026-0001`, and one row.
- **PostgreSQL safety of the idempotent create** (`536a5ff`, test only): `ATOMIC_REQUESTS` is not set (Django default off). The create already runs in its own `with transaction.atomic():` block, which is a savepoint whenever a transaction is already open, so after a unique-id `IntegrityError` the savepoint is rolled back and the follow-up lookup works on PostgreSQL. A test runs the request inside an outer `atomic()` block with the duplicate checks forced to miss, and gets 200 with the existing report while the outer transaction stays usable. **Not run against PostgreSQL**: the local PostgreSQL 17 on port 5432 needs a password (not guessed), and Docker Desktop cannot start its engine because WSL is not installed. On SQLite a missing savepoint would not fail (SQLite does not abort the transaction), so this test is a guard for PostgreSQL behaviour, not a red→green on SQLite.
- **Barangay list bug** (`7c79bc2`, found on a phone with APK 1.0.2): the report form showed only "Poblacion / San Isidro / Cagsiay", which is `SanitationBootstrap.fallback()`. `SanitationStandaloneBootstrap` renders the gateway with `initialData: SanitationBootstrap.fallback(message: 'Loading live sanitation records...')` while the (often cold) server is still answering, and `SanitationReportPage` keeps the `barangays` it was opened with — so a form opened before the bootstrap arrived (or when it failed) used the 3-name fallback, and "Poblacion" (not a Mauban barangay) reached production. The JSON key (`barangays`) was correct. Fixes: the sanitation fallback is now the 40 official names in api_barangay spelling and `display_order` (`seed_data.MAUBAN_BARANGAYS`, identical to the web lists); a form opened from an offline/not-yet-loaded bootstrap fetches the live list; the picker is a searchable bottom sheet; drafts and the household survey no longer default to "Poblacion". Server: the public report endpoint rejects a barangay that is not an active `api_barangay` name (400 "Pumili ng barangay mula sa listahan ng Mauban. / Please choose a Mauban barangay from the list."), matching case- and space-insensitively and saving the official spelling. If `api_barangay` had no active rows, every report would be rejected (production has 40).
- **Hardcoded barangay lists** (grep of `mobile/` and `frontend/src/sanitation/`): `mobile/lib/models/models.dart` `SanitationBootstrap.fallback` (was 3 names; fixed), `SanitationReportDraft.fromJson` default `'Poblacion'` (fixed), `mobile/lib/screens/sanitation_screens.dart` household survey default `'Poblacion'` (fixed); `frontend/src/sanitation/pages/EstablishmentRecords.js` and `HouseholdRecords.js` `OFFICIAL_MAUBAN_BARANGAYS` and `SanitaryGISMap.js` `MAUBAN_BARANGAY_CENTERS` already hold the 40 official names (unchanged). **Tourism, reported only**: `mobile/lib/models/models.dart` `MobileBootstrap.fallback` has the same 3-name list ("Poblacion", "San Isidro", "Cagsiay").
- **Not verified**: not merged, not deployed (production is on `0038`); migration `0039` has not run on production; no new APK; no device test.

### Community Report 500 on Large Photos (branch `sanitation/report-500-fix`, NOT merged, NOT deployed)
- Branched from `54d2ad8`. Sanitation only; no tourism or shared login code changed. Commits: `5b9ecec` (500 fix), `ce808b0` (barangay field label).
- **Bug** (APK 1.0.3 against production, 2026-09-27 16:09 Asia/Manila): a public report with one gallery photo answered 500 ("May problema sa server…") three times; no complaint row and no Storage file were created. Render log: `Error in mobile_sanitation_report_submit: cannot pickle 'BufferedRandom' instances`, raised at `views/mobile.py` line 601 `data = request.data.copy()`.
- **Root cause**: Django keeps an upload of up to `FILE_UPLOAD_MAX_MEMORY_SIZE` (default 2.5 MB, not overridden in settings) in memory and spools a larger one to a temporary file (`TemporaryUploadedFile`, backed by a `BufferedRandom`). DRF's `request.data` for multipart holds the fields and the uploads, and `QueryDict.copy()` deep-copies every value; a temporary file cannot be deep-copied. So any report whose photo was over 2.5 MB failed before validation, before the photo upload and before the insert. The airplane-mode attempt and the retry, `client_submission_id`, the throttles, the barangay check and the storage backend were not involved (the throttles and the idempotency lookup run before line 601 and passed; the barangay check and the upload come after it). Local and production match on what matters: same Django upload limit, same 5 MB app limit, `DatabaseCache` throttle in both; storage differs (local `FileSystemStorage`, production S3/Supabase) but is reached only after the crash point. The staff inspection endpoint (`mobile_sanitation_inspection_submit`) had the same `request.data.copy()` with a photo field (the app sends inspections as JSON today).
- **Fix**: `copy_request_fields(request)` copies only the non-file fields into a new mutable `QueryDict` (JSON bodies are still copied as before); uploads are read from `request.FILES` as before. Used in the report and inspection endpoints. The report endpoint's catch-all 500 now returns the fixed bilingual message instead of the exception text.
- **Red → green**: `CommunityReportLargePhotoTests` (3 MB JPEG, 3 MB PNG, 200 KB JPEG, resend of a 3 MB photo with the same id → 200 and one upload, no exception text in a 500) and `InspectionLargePhotoTests` (3 MB inspection photo): before the fix 4 failures + 1 error, all with `cannot pickle 'BufferedRandom' instances` or the leaked text; after, 6/6 OK. Local `runserver` on a throwaway SQLite database with `USE_S3_STORAGE=False` (engine confirmed `sqlite3`), real generated images: before the fix a 3.3 MB JPEG and a 3.0 MB PNG → 500 with the same message, a 0.2 MB JPEG → 201; after, JPEG → 201, the same `client_submission_id` again → 200 with the same `CMP-2026-0002`, PNG → 201; the stored files match the originals (SHA-256). The three test uploads were deleted from `backend/media/complaints/` afterwards.
- **Barangay field**: the empty field drew the label "Barangay *" and the text "Piliin ang barangay" on top of each other. Empty, it now shows only the label; once chosen, the label floats above the name. Widget test: the empty field's only text is "Barangay *" (red before: `['Piliin ang barangay', 'Barangay *']`), and the floated label does not overlap the chosen name.
- **Verification (local only)**: backend `Ran 208 tests` / `OK`; frontend `226 passed` (8 suites); build `Compiled successfully.`; `flutter test` 66/66; `flutter analyze` the same 4 pre-existing infos.
- **Tourism, reported only**: `mobile_tourist_registration` (`views/mobile.py`) and `views/tourism.py` also call `request.data.copy()`; they would fail the same way only if a request carried a file over 2.5 MB. Not changed.
- **Not verified**: not merged, not deployed; no new APK (the fix is server-side, so APK 1.0.3 works once it is deployed); no device test.

### Owner Tracking Code & Establishment Portal (branch `sanitation/owner-tracking-code`, NOT merged, NOT deployed)
- Branched from `f88b1e3`. Sanitation only; no tourism or shared login code changed. Replaces the establishment username/password login and the earlier claim-code plan. Planned steps: (1) model + code generator + generate endpoint, (2) public status endpoint, (3) web "Print Owner's Slip", (4) mobile Establishment Portal, (5) remove the old establishment login last. Decisions: checklist from the newest unreleased renewal vs the type+size requirements (no renewal → neutral "Dalhin sa renewal"; none configured → "Wala pang naka-set na requirements"); suspended / no permit still shown with the status chip ("Walang permit number pa"; suspended adds "Makipag-ugnayan sa Sanitary Office", no reasons or notes); renewal notice at 60 days or fewer plus an "Expired" notice, and the portal shows "Expired" once the date has passed whatever the stored status (stored field unchanged); 20/hour per IP; existing accounts, tokens and the shared login left alone; the code is not remembered on the phone; no re-inspection request.
- **Step 1 — model, generator, generate endpoint** (done):
  - Migration `0040_sanitaryestablishment_tracking_code` (additive, three `AddField`s): `tracking_code_hash` (CharField 64, null, unique), `tracking_code_issued_at` (DateTime, null), `tracking_code_issued_by` (FK user, null, SET_NULL). Existing establishments get NULL = no slip issued yet; no backfill.
  - `api/services/tracking_codes.py`: codes `MBN-XXXX-XXXX` drawn with `secrets.choice` from 31 characters (2–9 and A–Z without I, L, O; no 0/1 either), about 40 bits. Only `HMAC-SHA256(TRACKING_CODE_KEY, 8-character body)` is stored; the plain code appears once, in the generate response. `normalize_tracking_code` accepts any case, spaces or dashes, with or without the `MBN` prefix. A hash collision with another establishment draws a new code (up to 5 tries).
  - `TRACKING_CODE_KEY` is read from the environment (set in the Render dashboard; not in any file). If it is missing and `DEBUG` is off, the tracking-code endpoints answer **503** "Tracking codes are not configured on the server…" and nothing is stored; the rest of the app keeps working, and a warning is logged at startup (`ApiConfig.ready`). Under `DEBUG` only, `SECRET_KEY` stands in.
  - `POST /api/sanitation/establishments/<id>/tracking-code/` (admin/sanitation only; others 401/403; GET 405; unknown id 404) returns `tracking_code`, `issued_at`, `issued_by` and the slip fields (name, permit number, business type, barangay) with `Cache-Control: no-store`. It locks the row (`select_for_update`) while replacing the hash; **if two staff print at the same moment, the last slip wins** and the other printed code does not work. Printing does not touch `updated_at`, so the records list does not reorder. An `ActivityLog` row ("Owner's tracking code issued: <name>", action update) records who and when, never the code.
  - The web establishment record now includes `tracking_code_issued_at` and `tracking_code_issued_by_name` (read-only; a PATCH cannot set them or the hash). The hash is in no response (records list/detail, web bootstrap, mobile staff and public bootstraps are checked by a test).
  - **Red → green**: `TrackingCodeFormatTests` (3) and `TrackingCodeGenerateTests` (17): before, `FAILED (failures=4, errors=14)` (no module, no fields, no route); after, `Ran 20 tests` / `OK`. Two tests passed before only vacuously (unknown id 404 and "does not reorder", since the route did not exist).
  - **Local check**: `runserver` on a throwaway SQLite database (engine confirmed `sqlite3`, migrated to `0040`), `DEBUG=False`, a throwaway local key: two staff POSTs → 200 with two different codes and `Cache-Control: no-store`; the row holds HMAC(code #2) and not HMAC(code #1), no column contains either plain code, two activity rows without the code; anonymous 401, tourism 403, GET 405, unknown id 404; the record detail shows the issue time and "Maria Santos". Restarted with no key and `DEBUG=False`: startup warning logged, POST → 503 with the message, nothing stored, other endpoints 200.
- **Step 2 — public status endpoint** (done):
  - `POST /api/mobile/sanitation/establishment-status/` with `{"code": "..."}` (JSON or form), no login (no authentication classes, so a stale token header is ignored). The code is normalized (any case; dashes, spaces and the `MBN` prefix optional), hashed with the same HMAC and found with one indexed query on `tracking_code_hash`. A malformed or empty code is hashed and looked up like any other (it can never match), so every wrong code takes the same path.
  - Answer keys, exactly: `business_name`, `business_type`, `barangay`, `permit_number` (null when blank), `permit_status`, `permit_status_label`, `permit_expiry_date`, `days_left` (server date, Asia/Manila), `is_expired`, `renewal_notice`, `expired_notice`, `suspended_notice`, `requirements` (`[{name, submitted}]`), `requirements_note`. Never owner, contact, address, coordinates, remarks, inspections, inspectors, complaints, ids or other establishments.
  - Expiry: `days_left` = expiry − today; today → 0, not expired, "ngayong araw" renewal notice; 1–60 days → renewal notice with the day count; past → `is_expired`, `permit_status` "expired" / "Expired" in the answer whatever the stored status (the stored field is not changed) and the expired notice; no date → nulls and no notices. Suspended adds only "Makipag-ugnayan sa Sanitary Office. / Please contact the Sanitary Office." No permit number → `permit_number` null (the app shows "Walang permit number pa").
  - Checklist: requirement names for the business type and permit size (the size's own list, else the whole type's, as the web renewal screen picks them), compared case-insensitively with the newest renewal that is not released (by `created_at`): `submitted` true/false, and items submitted but no longer configured are still listed as submitted. No such renewal → every item `submitted: null` and note "Dalhin sa renewal". No requirements configured (and nothing submitted) → empty list and note "Wala pang naka-set na requirements".
  - Wrong, empty, malformed or replaced code → the same 404 `{"detail": "Hindi nahanap ang tracking code. Tingnan ang code sa iyong Owner's Slip. / Tracking code not found. Check the code on your Owner's Slip."}`. Missing `TRACKING_CODE_KEY` with DEBUG off → the step 1 503 message. `OwnerStatusRateThrottle` (scope `owner_status_ip`, 20 **failed** lookups per hour per address, the database "throttle" cache; see the change below): the 21st gets 429 "Masyadong maraming pagsubok mula sa device na ito… / Too many attempts from this device…" with `Retry-After` and no English suffix. `Cache-Control: no-store` on every answer, including 404, 429, 503 and 405.
  - **Red → green**: `EstablishmentStatusTests` (25): before, `FAILED (failures=23, errors=2)`; after, `Ran 45 tests` / `OK` for the three tracking-code classes. Full backend suite `Ran 253 tests` / `OK`.
  - **Local check** (`runserver`, throwaway SQLite with engine confirmed `sqlite3`, `DEBUG=False`, a made-up local key; an establishment with an open renewal where 1 of 3 requirements is submitted, expiring in 45 days): two slips generated through the step 1 endpoint (`MBN-AV6Y-GJ4W`, then `MBN-W89Q-WTQ7`); the exact new code → 200 with the 14 keys, `days_left` 45, the renewal notice and the checklist (Health Certificate true, the other two false); `mbn w89q wtq7` → the same 200; the replaced old code, `MBN-2222-2222`, an empty code and `hello` → the identical 404; requests 7–20 → 404; the 21st (the valid code) → 429 with `Retry-After: 3597`. Every answer had `Cache-Control: no-store`.
- **Status limit counts only failed lookups** (`9431afa`): owners who share a mobile-carrier address must not lock each other out with valid checks. The throttle now only checks the history; the view records a failure when a code is not found (404). 20 failures per hour per address; once reached, every request from that address gets the 429 until the window passes, even with a correct code. Red → green: `test_successful_lookups_do_not_count` (25 successful lookups → all 200, then 20 failures → the next correct code 429) failed with `[… 200, 429, 429, 429, 429, 429]` before; `test_once_refused_every_request_from_that_address_is_refused` added; `EstablishmentStatusTests` 27/27 OK; full backend `Ran 255 tests` / `OK`.
- **Step 3 — web "Print Owner's Slip"** (`f083cff`, done):
  - `EstablishmentRecords.js`: a "Print Owner's Slip" action on each row (key icon) and in the record's detail view, shown only to admin and sanitation roles (`useAuth().role`). If a slip was already issued, a confirm dialog first: "Mag-iisyu ng bagong code. Hindi na gagana ang lumang slip na inisyu noong <date> ni <staff>. / A new code will be issued; the old slip will stop working."; Cancel makes no call.
  - The print window is opened synchronously in the click (pop-up blockers), shows "Generating…", and is filled with the slip when `POST …/tracking-code/` answers, then `print()` is called. On failure the window is closed and the page shows "Hindi nagawa ang Owner's Slip. / The Owner's Slip was not issued." plus the server's message (e.g. the 503 not-configured text). A blocked pop-up shows its own message and makes no call. The code goes from the answer straight into the window; it is not put in React state, context or storage.
  - The slip (`sanitation/utils/ownerSlip.js`): A6 page, black on white, borders only. "Mauban Municipal Health Office – Sanitary Section", "OWNER'S SLIP", establishment name, permit number (or "Walang permit number pa"), business type, barangay, the code large in a monospaced font, date issued (Asia/Manila) and issued by, the Tagalog and English instructions, the privacy note and "Nawala ang slip? Pumunta sa Sanitary Office para sa bagong code." Every field goes through `escapeSlipText`, which moved from `ComplaintsManagement.js` to `sanitation/utils/escapeSlipText.js` so both slips share it.
  - The record's "Mobile Portal Account: Linked / Not Linked" tile is now "Owner's Slip": "Wala pang Owner's Slip" or "Owner's Slip inisyu noong <date> ni <staff>", refreshed (`refreshEstablishments`) after printing. The green "Mobile Establishment Portal" banner below it still talks about owner accounts; it goes with the old login in step 5.
  - **Red → green**: `EstablishmentRecords.ownerSlip.test.js` (13): before the page change `9 failed, 4 passed` (the 4 were the slip-text tests; `ownerSlip.js` was written just before the tests); after, 13/13. The two existing Establishment Records test files now mock `useAuth`. Frontend `239 passed` (9 suites); build `Compiled successfully.`
  - **Local check**: `runserver` on a throwaway SQLite database (engine confirmed `sqlite3`), `DEBUG=False`, a made-up local key, plus the React dev server pointed at it (`Compiled successfully!`, `GET /` 200, CORS preflight allowed). **The click in a browser was not done**: no browser tool could reach these local servers in this session. Instead a Node script imported the repo's own `ownerSlip.js`, called the real generate endpoint (200, `Cache-Control: no-store`) and built the slip; the status endpoint with that code answered 200 with the establishment's status, and the record showed the new issue time and "Maria Santos". The click → window flow is covered by the jsdom tests only.
- **Step 3 checked by hand**: a real slip printed locally from Establishment Records (layout OK, one A6 page, replace-code dialog OK).
- **Step 4 — mobile Establishment Portal** (`3c50eed`, done):
  - The "Establishment Portal" card on the public landing page (the owners' card) now opens `SanitationOwnerPortalPage` instead of the old username/password screen, which is no longer reachable from the landing page (it is removed in step 5). The landing page shows this card on web builds too (it is not gated by `kIsWeb`, unlike Staff Sign In), so the portal is also on the web build.
  - Layout per the approved design: `#F3F7F4` background, green header (`#1E6B45` → `#154F33`) with a back button, "MUNICIPAL HEALTH OFFICE" pill, heading and subtext; a white card with "TRACKING CODE", a 52 px field (placeholder `MBN-XXXX-XXXX`; capitals; letters, digits and dashes only), a full-width "Tingnan ang status" button and the helper line; footer "Official Mauban LGU e-Service". The app's Inter font with weight 800 headings (no new font).
  - The code is trimmed, upper-cased and stripped of spaces before `POST /mobile/sanitation/establishment-status/`. While checking, the button is disabled and a note says the first check can take up to a minute.
  - Result card: name, "type · barangay", status chip (active green; renewal due / conditional amber; expired and suspended red `#8A1C12`; no permit grey), tiles "Permit no." (or "Walang permit number pa") and "Mag-e-expire" ("Nov 11, 2026 · 45 araw", "· ngayong araw", "· N araw nang lumipas", or "Walang petsa"), the server's renewal notice (yellow `#FFF4D6`, bell) and expired / suspended notices (red) exactly as sent, then "Requirements" with Naisumite (green) / Kulang (`#8A1C12`) / nothing when `submitted` is null, and `requirements_note` when present.
  - Errors, shown in the page: 404 and 429 → the server's message; 503 → "Hindi pa available ang serbisyong ito. Subukan ulit mamaya. / This service isn't available yet. Please try again later."; no network or timeout → the community report's "Hindi naipadala. Tingnan ang internet at subukan ulit. / …"; other 5xx → the community report's server message. A failed check clears an earlier result. Nothing is written to SharedPreferences or the draft store.
  - **Red → green**: `test/sanitation_owner_portal_test.dart` (19 tests) did not compile before the page existed (`Method not found: 'SanitationOwnerPortalPage'`, `normalizeOwnerTrackingCode`, `ownerStatusColors`); after, 19/19. The landing test "Establishment Portal card keeps its current destination" became "…opens the tracking-code portal". `flutter test` 85/85; `flutter analyze` the same 4 pre-existing infos; backend `Ran 255 tests` / `OK`.
  - **Local check**: no Android device or emulator on this laptop (no AVD images). Instead the sanitation app was built for the web (`flutter build web -t lib/main_sanitation.dart --dart-define=API_BASE_URL=http://127.0.0.1:8000/api`, into the scratch folder; the production URL is not in that build) and driven in headless Chrome at 412×915 against a local `runserver` (throwaway SQLite, engine confirmed, `DEBUG=False`, made-up key). A code from the step 1 endpoint, typed in lower case, showed the result card (200); `MBN-2222-2222` showed the 404 message. Screenshots stayed in the scratch folder; the database was deleted afterwards.
- **Step 5 — old establishment login removed** (done):
  - Backend (`5d5bc30`): `establishment_register_view`, both routes (`auth/register-establishment/`, `mobile/sanitation/register-establishment/`), `EstablishmentClaimRateThrottle` and its `establishment_claim` rate are removed, with the claim tests (10 tests: 6 in `EstablishmentClaimSecurityTests`, 2 in `EstablishmentPermitNumberTests`, 2 in the claim rate-limit class, whose two general throttle tests stay as `ThrottleSettingsTests`). `RemovedEstablishmentRegistrationTests`: both routes answer 404 and create no user (failed on the pre-removal code: `FAILED (failures=1)`), and the shared login still signs in an existing establishment account. The throttle-table migration test now probes the portal status limit (21 wrong codes → 429, never 500). Unchanged: `login_view`, `serialize_auth_payload`, the `establishment` role, `SanitaryEstablishment.user`, existing users and tokens (only now-unused imports were dropped from `auth_views.py`). Backend `Ran 247 tests` / `OK`.
  - Mobile (`ac101f6`): the establishment login screen, the registration dialog, the old `SanitationEstablishmentPortalPage` (with its invented timeline and non-working re-inspection request) and `registerEstablishment` are removed, with `test/sanitation_portal_requirements_test.dart` (it only tested the old page). On startup `establishment_data` is always removed, and when the saved role is `establishment` the saved token, role and username are removed too; the public landing page shows. An establishment account that signs in through Staff Sign In is not stored and nothing opens; the message "Hindi na ginagamit ang establishment account. Gamitin ang Establishment Portal at ang code sa iyong Owner's Slip. / Establishment accounts are no longer used. Use the Establishment Portal with the code on your Owner's Slip." is shown (the server token is left alone). `test/sanitation_establishment_account_retired_test.dart` (5): on the pre-removal code 3 failed (startup cleanup ×2, staff sign-in); after, 5/5. `flutter test` 86/86. `flutter analyze`: **No issues found** — the 4 long-standing infos were all inside the removed old portal page; `_GatewaySection` lost its now-unused `text` parameter.
  - Web (`51b4006`): the green "📱 Mobile Establishment Portal" box (register an account / account linked) and the "📱 @username" badge on each row are removed. New test: a record still linked to an old account shows none of that text. Frontend `240 passed` (9 suites); build `Compiled successfully.`
  - `git grep` for `register-establishment`, `establishment_register_view`, `EstablishmentClaimRateThrottle`, `establishment_claim`, `registerEstablishment`, `SanitationEstablishmentPortalPage`, the removed screen/dialog/sign-in names and "Mobile Establishment Portal" finds only the tests that assert their absence.
  - No tourism file changed.
- **Deploy notes**: migration `0040` (three nullable `AddField`s) runs with the Render deploy. `TRACKING_CODE_KEY` must be set on Render before the slip and portal work (reported as set; never read here); without it, printing a slip and portal lookups answer 503 and the rest works. APK 1.0.3 in the field still shows the old establishment screens; its registration now gets 404, its sign-in still works but shows the old data; a new sanitation APK is needed for the portal.
- **English only on the sanitary side** (client decision, 2026-09-28): every user-facing sanitary text is English only; the Filipino text and the "Filipino / English" pairs described in the steps above and in earlier sections are replaced. Commits: `3345aea` (backend: community report validation, report and portal rate limits, tracking-code 404/503, portal renewal/expired/suspended notices, requirement notes "Bring at renewal" / "No requirements set yet"), `d5158ae` (mobile: landing, Community Report form and scope guide, barangay picker, errors, Establishment Portal, retired-account message), `034e64f` (web: Owner's Slip and its "Generating" page, replace-code dialog, slip status on the record, pop-up/failure messages, Permit Monitoring legend), `0beebc6` (English sample report text in tests, two code comments). Agreed wording used as given (e.g. "Check your sanitary permit status", "Check status", "Expires", "N days", "Submitted", "Missing", "No permit number yet", "No date", "Please contact the Sanitary Office.", "Report an unsanitary condition", "Submit report", slip lines "Date issued", "Issued by", "Lost this slip? Visit the Sanitary Office for a new code."). Not changed: tourism files and tourism notifications, the shared login, barangay and other proper nouns (e.g. "Bagong Bayan", "Barangay Lupon", "purok"), stored data, API field names. Remaining grep hits: three tourism registration notifications in `views/mobile.py` (`build_mobile_notifications`, tourism) and two tests asserting that the old "Piliin ang barangay" hint no longer appears. Checks: backend `Ran 247 tests` / `OK`; frontend `240 passed` (9 suites), build `Compiled successfully.`; `flutter test` 86/86; `flutter analyze` No issues found.
- **Not verified**: not merged, not deployed (production is on `0039`); `TRACKING_CODE_KEY` on Render not checked (never read); the portal not run on an Android phone; no new APK.
