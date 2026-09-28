# Tourism theme tokens (`--th-*`)

This file governs `Tourism_index.css` and `pages/BookingManagement.wizard.css`.
**Read section 5 before you edit either file.** It describes rules that also
style Sanitation pages.

Every fact below was checked against the code at commit `3d1e2fd`. Line
numbers are given as "at `3d1e2fd`" and will drift, so find rules by selector.

---

## 1. What this is

The tourism web UI is being made re-themeable. The LGU colour follows the
sitting mayor, so an admin will be able to switch the tourism system from
green to another colour, such as orange.

Phase 1 replaced the hard-coded green literals in tourism CSS and JS with
CSS custom properties (`--th-*`). Each default is the exact literal it
replaced, so **the app looks the same as before**. The token layer is the
hook Phase 3 will use to recolour it.

**Scoping rule (Plan A).**
- The green defaults live on `:root`.
- The admin-chosen colour must be applied **only on the tourism shell element**
  (`<div className="tourism-layout">` in `components/layout/AppShell.js`),
  for example through a `data-th-scope="tourism"` attribute or inline custom
  properties. **Never set theme values on `:root`.**
- `Tourism_index.css` is imported globally (see section 5). A theme on `:root`
  would repaint Sanitation.
- Plan A works for tourism because every tourism page and modal renders inside
  `.tourism-layout`: `src/` has no `createPortal`, and Leaflet popups render
  inside the map container.
- Three things fall outside the shell and so never get the scoped colour:
  - `body`
  - the full-screen `PageLoader` shown while tourism boots
  - canvas charts
- **How it is applied.** `theme/deriveTourismTheme.js` derives every
  theme-following token from the one stored `primary_color`, and
  `theme/useTourismTheme.js` sets them as inline styles on `.tourism-layout`.
  The theme arrives in the `/bootstrap/` payload. `deriveTourismTheme("#2FA34A")`
  reproduces the `:root` defaults exactly, which `deriveTourismTheme.test.js`
  checks against this file's `:root` block.

## 2. The tokens (53 at `3d1e2fd`)

All tokens are declared in the `:root` block at the top of `Tourism_index.css`.

"Uses" counts `var(--th-…)` reads in the `.js` and `.css` files under
`frontend/src`, measured at `3d1e2fd` and updated in Phase 3 (ink and `chart-1`,
after the Key Insights digits and icon moved from `chart-1` to ink).
Some of those reads sit in dead rules (section 7).

"Follows theme" records intent for Phase 3, as follows:
- Status tokens are **fixed** by decision.
- Brand, tinted, page-gradient, shadow and chart tokens are **intended** to
  follow the theme.
- For the plain neutrals, it is still an open question (section 7).

### Brand (14)
| Token | Default | Role | Uses |
|---|---|---|---|
| `--th-primary` | `#2fa34a` | Primary fills, active nav/tabs, outline-control borders, focus borders, brand icons | 53 |
| `--th-primary-hover` | `#15803d` | Hover fill of primary buttons, hover text of links and the secondary button. Chosen so white text is 5.02:1 | 5 |
| `--th-primary-active` | `#1f7f36` | Pressed state, date-field focus outline | 3 |
| `--th-primary-deep` | `#146c28` | Dark primary fills carrying white text (Save/Import buttons). White text 6.55:1 | 3 |
| `--th-primary-ink` | `#166534` | Text sitting on a primary tint, and brand accent text on white (incl. the Key Insights digits and icon) | 23 |
| `--th-primary-ink-strong` | `#0f3b1e` | Emphasis or hover text on a tint | 2 |
| `--th-primary-selected` | `#d1fadb` | Selection / strong-hover fills (wizard active step, View button hover) | 4 |
| `--th-primary-contrast` | `#ffffff` | Text on a primary fill. **Computed**: white, unless white falls below 2.5:1 against the chosen colour, then a dark ink (owner decision, section 7). No CSS reads it yet | 0 |
| `--th-primary-tint` | `#f0fdf4` | Pale brand surfaces and hovers | 19 |
| `--th-primary-tint-strong` | `#dff1e2` | Table headers, totals rows, selected items, View button fill | 10 |
| `--th-primary-border` | `#bbf7d0` | Pale brand borders | 4 |
| `--th-primary-alpha-10` | `rgba(47, 163, 74, 0.1)` | Focus glow | 2 |
| `--th-primary-alpha-20` | `rgba(47, 163, 74, 0.2)` | Focus ring | 2 |
| `--th-primary-alpha-30` | `rgba(47, 163, 74, 0.3)` | Active-tab glow | 1 |

### Page background (4)
| Token | Default | Role | Uses |
|---|---|---|---|
| `--th-page-grad-1` / `-2` / `-3` | `#eaf7f1` / `#d8eee5` / `#c2ddd4` | The three stops of the `.tourism-layout` page gradient | 1 each |
| `--th-page-bg` | `#e6f4ef` | Flat page colour. **Unused.** Pairs with the legacy `--page-bg` and the `body` rule, which will be migrated separately | 0 |

### Surfaces, borders and text (15)
| Token | Default | Role | Uses |
|---|---|---|---|
| `--th-surface` | `#ffffff` | Plain surface. Unused, because white was deliberately left literal | 0 |
| `--th-surface-alt` | `#f7fbf8` | Table-card and destination-card bodies | 7 |
| `--th-surface-tinted` | `#eefaf1` | **Sidebar and top-bar background** | 2 |
| `--th-surface-tinted-strong` | `#c6decc` | Add/Edit Destination form panel | 1 |
| `--th-border` | `#e5e7eb` | Neutral light border | 4 |
| `--th-border-strong` | `#d1d5db` | Neutral input/control border | 8 |
| `--th-border-tinted` | `#d7ebdc` | Green-tinted borders (sidebar edge, top-bar line, cards) | 10 |
| `--th-border-tinted-strong` | `#bfcfc5` | Top-bar divider, GIS list entries | 2 |
| `--th-border-tinted-control` | `#b7d7be` | Booking Management filter-field outlines | 1 |
| `--th-text-main` | `#111827` | Main text | 27 |
| `--th-text-muted` | `#64748b` | Muted text | 14 |
| `--th-text-tinted-strong` | `#101812` | Sidebar title and menu labels | 2 |
| `--th-text-tinted` | `#37443a` | Table headings, top-bar subtitle | 5 |
| `--th-text-tinted-muted` | `#667469` | Top-bar role line | 1 |
| `--th-text-inverse` | `#ffffff` | Text on dark non-primary surfaces. Unused | 0 |

### Elevation and overlay (2)
| Token | Default | Role | Uses |
|---|---|---|---|
| `--th-shadow-rgb` | `34, 72, 43` | **Channels only.** Use it as `rgba(var(--th-shadow-rgb), <alpha>)` so each site keeps its own opacity | 27 |
| `--th-scrim` | `rgba(2, 6, 23, 0.55)` | Modal backdrops | 4 |

### Status: fixed, never follows the theme (12)
| Token | Default | Uses |
|---|---|---|
| `--th-success` | `#16a34a` | 2 |
| `--th-success-bg` | `#dcfce7` | 1 (its only reader is a **dead** rule, see section 7) |
| `--th-success-text` | `#15803d` | 0 |
| `--th-warning` | `#eab308` | 1 |
| `--th-warning-bg` | `#fef9c3` | 0 |
| `--th-warning-text` | `#a16207` | 0 |
| `--th-danger` | `#ef4444` | 3 |
| `--th-danger-bg` | `#fee2e2` | 1 |
| `--th-danger-text` | `#dc2626` | 2 |
| `--th-info` | `#2563eb` | 0 |
| `--th-info-bg` | `#dbeafe` | 0 |
| `--th-info-border` | `#93c5fd` | 0 |

`--th-primary-hover` and `--th-success-text` share `#15803d`. They are
different roles and will diverge once a theme is applied, so **do not merge them**.

### Charts (6)
| Token | Default | Uses |
|---|---|---|
| `--th-chart-1` | `#27a544` | 0 (the Key Insights digits and icon now use ink) |
| `--th-chart-2` … `-5` | `#36c962`, `#65d279`, `#90daa9`, `#b9e4c4` | 0 |
| `--th-chart-wash` | `rgba(106, 192, 126, 0.15)` | 0 |

The chart palette is **designed, not measured** (Phase 3): the old teal palette
had no relationship to the brand green. All five sit within a few degrees of
the base hue and are separated by lightness (0.40 to 0.81), so they read as one
family with any theme (closest pair ΔE 12.2 on green, 17.6 on `#EF7C1F`).
Nothing reads `chart-1` … `-5` or `chart-wash` yet; they are ready for the chart
batch.

Total: 14 + 4 + 15 + 2 + 12 + 6 = **53**.

## 3. The rules that decided every conversion

1. **Semantic role decides the token.** A literal takes the token that describes
   what it *does* (fill, border, text on a tint, and so on), not the nearest
   colour. If no token has the right role, leave the literal and record why.
2. **Status colours are fixed.** Success, warning, danger and info never follow
   the theme. A literal that plays two roles (for example `#16a34a`, which was
   both the wizard's primary and the success colour) is split by site:
   primary sites went to `--th-primary`, success sites to `--th-success`.
3. **Dead code is not tokenised; it is deleted later.** See the list in section 7.
4. **Sanitation-only rules are never tokenised,** even when they sit in a
   tourism file. See section 5.
5. **Tailwind classes were handled last and separately,** with verification
   done on the built CSS (sections 6 and 8).
6. **Prefer a token whose default equals the literal (ΔE 0).** Where a visible
   change was accepted, it was measured (ΔE and WCAG contrast) and approved
   first. No converted text drops below WCAG AA (4.5:1). Several conversions
   raised text that already failed AA above it.
7. **Inline JSX styles beat the stylesheet.** Tokenising a stylesheet rule does
   nothing if an inline `style={{…}}` on the same element sets that property.
   At `3d1e2fd` no such override of a tokenised property remains.
8. **A hue offset above 10° is drift, not design.** When Phase 3 derived the
   palette from the base colour, a token whose measured hue sat more than 10°
   away from `#2FA34A` was given the base hue instead (with its measured
   saturation and lightness), e.g. `--th-primary-deep` had been a blue-green
   beside a leaf green. **One deliberate exception: the three page gradient
   stops keep their measured offsets.** At around 90% lightness a hue offset is
   barely perceptible on any theme, so zeroing it would buy nothing and would
   visibly change the largest area on every page. Do not "fix" this.

## 4. Deliberate exceptions: leave these literal

| What | Where | Why |
|---|---|---|
| Top-bar **"Sanitation" module-switch button** | `.module-switch-btn` (`#0f6b42`, hover `#0b5836`) | It keeps Sanitation's own green on purpose, to signal that it leaves the tourism module. |
| **`.btn-primary`**, including `hover:bg-[#278d3f]` | `Tourism_index.css` (TI:128–129 at `3d1e2fd`) | Dead in tourism, but **live on Sanitation's Submission Tracking page** (`SubmissionTracking.js`). Its hover colour paints that page. Tokenising it would let a tourism theme repaint Sanitation. |
| **"View & Review record" 👁 button** on booking rows | `.booking-icon-btn.view` (`#0f766e` / `#99f6e4` / `#f0fdfa`) | A fixed functional action colour (Tailwind teal-700/200/50), part of the row's colour-coded actions: view teal, delete red, arrived green, no-show red. It stays fixed like status colours. |
| **Wizard auto-fill buttons** ("Balance female count", "Balance age 8-59") | `.tourist-auto-fill-row button` (`#0f766e` text, `#94d3bd` border) | The same fixed functional teal. Not part of any system that should follow the brand. |
| **Gallery toast** (appears after promoting a feedback photo) | JSX `bg-green-700` in `DestinationManagement.js` (line 604 at `3d1e2fd`, the "Toast message for gallery promotion" block) | **Status.** It announces "✓ Photo successfully added to … slideshow!", so it stays fixed like other status colours. Its other message, "Photo is already included in … images.", shares the same success styling. Changing that is a design change, not a theming one. |
| Plain white (`#ffffff`, `bg-white`) | many | White is not a theme colour. Tokenising it would be churn. |

## 5. ⚠ The Sanitation coupling (the most important warning in this file)

`frontend/src/index.js` imports **both** stylesheets globally, for every route:

```js
import "./tourism/Tourism_index.css";      // line 4
import "./sanitation/Sanitation_index.css"; // line 5
```

So **every rule in `Tourism_index.css` and `BookingManagement.wizard.css` also
applies on Sanitation pages.** Where the two files define the same selector,
Sanitation wins on equal specificity because it loads later.

**Rules found to reach Sanitation pages, all left literal:**

| Tourism rule | Sanitation page that uses it | What reaches Sanitation |
|---|---|---|
| `.btn-primary` (incl. hover) | `SubmissionTracking.js` (export button) | The hover background `#278d3f`. Sanitation defines no `.btn-primary:hover` of its own |
| `.search-box`, `.search-box input` | `SubmissionTracking.js` | Nothing visible. Sanitation overrides the colours |
| `.insight-bars`, `.insight-bar-row` and its `span` / `div` / `b` / `strong` | `SanitaryReportAnalytics.js` | Tourism's white background and `#e0eee7` border on `.insight-bars`. Sanitation doesn't override those two. **No tourism page uses these rules.** |
| The whole `.ws-*` block in `BookingManagement.wizard.css` (`.ws-multiselect*`, `.ws-dropdown`, `.ws-option*`, `.ws-water-level-display*`) | `HouseholdRecords.js` (water-source picker) | **All of it.** Sanitation has no `.ws-*` rules, so this tourism file is their only styling. No tourism page uses them. |
| `.status` (base rule) | `SubmissionTracking.js` | Layout only (`capitalize`, padding). No colour |
| `body` (`color: var(--text-main)` = `#163046`, `background: var(--page-bg)`) | every Sanitation page | The text colour, which Sanitation inherits wherever it doesn't set one |

**Rules shared by both modules, tokenised for tourism, but overridden on
Sanitation:**
- `.sortable-th:hover`, `.sortable-th.active-sort`,
  `.sortable-th.active-sort .sort-indicator`, `.report-sort-select:focus`.
  They're used by `AnalyticsAndReport.js` and `SanitaryReportAnalytics.js`.
  `Sanitation_index.css` (around lines 5886–5940 at `3d1e2fd`) redefines each
  colour property, with `!important` where tourism uses it, so the tourism
  tokens never paint Sanitation.
- `.report-sort-label`, `.report-sort-select`, `.report-sort-dir-btn` (and its
  `:hover`) are literal and identical in both files.

**Before changing any rule above, check Sanitation.** In Phase 1, six wizard
lines in the `.ws-*` block and the `.search-box` border were tokenised by
mistake and then returned to literals in `facaac5`.

## 6. Tailwind opacity limitation: 27 sites

These rules use arbitrary `var()` colours, for example
`border-[var(--th-primary)]`. Tailwind compiles those **without** its
`--tw-border-opacity` / `--tw-bg-opacity` / `--tw-text-opacity` variables.
Instead of `rgb(… / var(--tw-*-opacity, 1))` the output is a plain `var(…)`.

**Consequence:** the matching `*-opacity-*` utility has **no effect** on these
elements. A slash opacity modifier on the tokenised class (for example
`border-[var(--th-border-tinted)]/50`) is untested, so verify it before relying
on it.

Measured at `3d1e2fd`. Line numbers are in `Tourism_index.css` unless stated.

**`border-opacity-*` inert (12 sites):**
- `.panel` (TI:113)
- `.btn-secondary` (TI:133)
- `.dashboard-year-select` (TI:467)
- `.outline-action` (TI:486)
- `.booking-search input` (TI:805)
- `.arrival-date-btn, .arrival-export-btn` (TI:1401)
- `.destination-search input` (TI:1708)
- `.destination-card-stats div` (TI:2514)
- `.feedback-reply` (TI:2765)
- `.reports-actions button` (TI:2840)
- `.gis-actions button` (TI:3256)
- `.gis-location-item` (TI:3478)

**`bg-opacity-*` inert (9 sites):**
- `.primary-action` (TI:496)
- `.destination-add-btn` (TI:1702)
- `.destination-view-btn`, at rest and on `hover:` (TI:1783, 2 sites)
- `.destination-card-stats div` (TI:2514)
- `.feedback-reply` (TI:2765)
- `.reports-actions .green` (TI:2844)
- `.report-filter-card button` (TI:2882)
- `.gis-actions .active` (TI:3260)

**`text-opacity-*` inert (6 sites):**
- `.btn-secondary` on `hover:` (TI:133)
- `.metric-card span` (TI:521)
- `.arrival-note` (TI:1579). This one is also overridden by the rule's own
  `color` line.
- `.destination-view-btn` (TI:1783)
- `.feedback-reply strong` (TI:2769)
- the photo drop-zone upload icon (JSX `text-[var(--th-primary)]`,
  `DestinationManagement.js:1407`)

**Totals: 27 sites.**
- 26 of them are in `@apply` rules, on 21 rules.
- 1 is a JSX class.

By commit:
- 13 from `66c3e7b`
- 4 from `0840be5`
- 10 from `3d1e2fd`: 9 `@apply` sites and the JSX icon

**Why the trade was accepted:**
- At `3d1e2fd`, **no `*-opacity-*` utility exists anywhere in tourism code**,
  so nothing reads the dropped variables.
- The built CSS was compared rule by rule for every batch. The only differences
  were the dropped variable and the colour value. Hover variants still emit as
  their own `:hover` rules.
- The 13 earliest sites had already rendered correctly since `66c3e7b`.

The four modal backdrops use `bg-[var(--th-scrim)]` in JSX (BookingManagement.js
1607 and 1718, DestinationManagement.js 1330 and 1511). Their original
`bg-slate-950/55` already emitted a literal alpha and had no opacity variable,
so nothing was lost there.

## 7. Open items for Phase 3

- **White text on primary fills is an owner decision.**
  - White on the primary fill is **below WCAG AA (4.5:1)** for both green
    (3.25:1) and orange `#EF7C1F` (2.77:1). This is a pre-existing, app-wide
    condition, **accepted by the owner, not an oversight.**
  - `--th-primary-contrast` is therefore white, unless white falls below
    **2.5:1** against the chosen colour; then it becomes a dark ink of the same
    hue that reaches AA (e.g. `#4A4200` on pale yellow `#FFD84D`, where white is
    1.38:1). The 2.5:1 floor exists **only to prevent an unusable theme**.
  - The text on primary fills is still literal white, so no screen reads the
    token yet.
  - **The Settings screen must WARN the admin** when the chosen colour gives
    poor contrast, so the choice sits with the person picking it.
- **The contrast derivation must cover graphics, not only text.** The photo
  drop-zone upload icon (`--th-primary` on `#f8fafc`) is **3.11:1** against
  the 3:1 non-text threshold. It was 3.15:1 before Phase 1. It passes, but only
  just, and a lighter theme colour would push it under. Another pair close to
  its threshold is the top-bar role line: `--th-text-tinted-muted` on
  `--th-surface-tinted` is **4.57:1** against 4.5:1 for text.
- **Charts need a JS bridge.** A `<canvas>` cannot read `var()`, so Chart.js
  colours in `Dashboard.js` and `AnalyticsAndReport.js` must be read with
  `getComputedStyle` on the tourism shell element. The same applies to the SVG
  `stroke=` attributes of the donut rings in `AnalyticsAndReport.js`, because
  SVG attributes don't reliably resolve `var()`.
- **The Dashboard metric icons** (`.metric-icon`, `text-[#32a6b4]`) were assigned
  to the chart batch.
- **`#e6f4f3` at `AnalyticsAndReport.js:802`** (the clock-icon circle). It is
  ΔE 1.37 from `--th-chart-wash` composited over the card's white. Decide in
  the chart batch.
- **Dead gradient on the Key Insights cards.** The inline
  `background: "#ffffff"` at `AnalyticsAndReport.js:648` overrides the
  stylesheet's `.analytics-question-item` background
  (`linear-gradient(180deg, #ffffff 0%, #f4faf7 100%)`, TI:2993 at `3d1e2fd`),
  so that gradient never paints. Delete it, or restore it on purpose.
- **Green Tailwind palette classes:** the brand ones were converted in
  `3d1e2fd`. The ones still green are status and stay fixed:
  - the gallery toast (a deliberate exception, see section 4)
  - `.status.positive`
  - `.destination-status.active`
  - `.badge-success` (also dead)
- **`body` / `--page-bg` migration.** This covers the legacy `--page-bg` and
  `--text-main`, the `body` rule's green radial glows, and `--th-page-bg`.
- **Neutral tokens:** decide whether `--th-surface-alt` (`#f7fbf8`, faintly
  green) and the other neutrals are derived or fixed.
- **Unused tokens (16):** `--th-primary-contrast`, `--th-page-bg`,
  `--th-surface`, `--th-text-inverse`, `--th-success-text`, `--th-warning-bg`,
  `--th-warning-text`, `--th-info`, `--th-info-bg`, `--th-info-border`,
  `--th-chart-1` … `-5`, `--th-chart-wash`. Each has a planned consumer; do not
  prune them without deciding that.
- **Dead code to delete.** None of it has been deleted yet.
  - **JS files nothing imports:** `components/layout/Topbar.js`,
    `pages/FeedbackMonitoring.js`, and all of `components/ui/`
    (`Badge`, `ChartCard`, `DataTable`, `Modal`, `PageHeader`, `Panel`, `StatCard`).
  - **CSS selectors with no live markup:**
    - generic helpers: `.page-title`, `.page-subtitle`, `.input-base`,
      `.badge*`, `.topbar-pill`
    - booking actions: `.booking-edit-btn`, `.booking-delete-btn`,
      `.booking-arrived-btn`, `.booking-noshow-btn`, `.booking-icon-btn.edit`
    - forms and totals: `.tourist-record-error.success-message`,
      `.tourist-total-check`, `.total-check-item*`
    - Arrival Monitoring: `.arrival-actions`, the `.arrival-date-btn` half of
      its selector list
    - Destinations and Feedback: `.destination-filter-tabs*`,
      `.gmaps-modal-fallback`, `.feedback-header*`,
      `.destination-card-stats h4.negative`
    - Analytics: `.analytics-question-card`, `.insight-share*`,
      `.insight-track*`, `.insight-stack*`, `.tone-1` … `-4`, `.insight-legend*`
    - booking detail: `.booking-detail-modal`, `.booking-detail-header*`,
      `.booking-detail-grid`, `.booking-detail-item*`
    - wizard: `.wizard-grid` (in the wizard CSS)
  - **Nine dead rules currently read a token.** Deleting them lowers the "Uses"
    counts in section 2.
    - `.topbar-pill`
    - `.tourist-record-error.success-message`, the only reader of `--th-success-bg`
    - `.total-check-item` and `.total-check-item strong`
    - `.insight-share-main span`
    - `.booking-detail-header h2` / `p`
    - `.booking-detail-item span` / `strong`

## 8. How changes were verified (use the same method)

- **Invisible changes (ΔE 0), byte-exact proof:**
  1. Make a scratch copy of each edited file.
  2. In the copy, revert every token you introduced to its original literal,
     using the **verbatim original text recorded per site**. Spellings vary,
     for example `rgba(34,72,55,0.2)` and `rgba(34, 72, 55, 0.2)`.
  3. Undo any added or removed `:root` declarations in the copy.
  4. Run `git hash-object --path=<repo path> <scratch copy>` and compare the
     result with `git rev-parse <parent>:<repo path>`.
  5. The two ids must be identical. If they differ, stop.
- **Tailwind changes: compare the BUILT CSS, not the source.**
  1. Build the parent and keep `build/static/css/main.*.css`.
  2. Build again after the change.
  3. Quote each converted rule's emitted declarations before and after, and
     check the rest of the bundle is unchanged.
  4. A class change can alter emitted CSS even when the colour is the same:
     opacity variables, `--tw-shadow-colored`, variants, specificity.
- **Visible changes:** report ΔE (CIE76, Lab) for every site, and WCAG contrast
  before and after for every text or text-bearing background. Converted text
  must stay at or above 4.5:1. Then give a human check list: page, where to
  look, what to expect, largest change first.
- `CI=true npm run build` must compile for every commit.
- **Line endings.** The repo has **no `.gitattributes`**, so line endings
  depend on each developer's `core.autocrlf`. On Windows with
  `core.autocrlf=true`, files are stored as LF and checked out as CRLF. Proofs
  must therefore compare in **Git's stored form**, with `git hash-object`,
  never raw bytes of the working-tree file against `git show` output.

## 9. Commit range

Phase 1 is the 22 commits `fb0107d` … `3d1e2fd` on `tourism/theme-tokens`. That is 21 code
commits and 1 docs commit (`7f3815c`). This file was refreshed in the commit
after `3d1e2fd`.


```
fb0107d chore(tourism): add theme colour tokens (defaults only)
66c3e7b refactor(tourism): point brand green at --th-primary
781dfc8 refactor(tourism): tokenise primary tints, states and page gradient
9ecbba4 refactor(tourism): tokenise neutral text and border colours
f3f323b refactor(tourism): tokenise fixed status colours
facaac5 refactor(tourism): return sanitation-only wizard rules to literals
6016b6e refactor(tourism): unify light green tints
4221196 refactor(tourism): add deep primary token and tokenise fixed greens
8bb3377 refactor(tourism): unify wizard and accent greens
c567e9a fix(tourism): restore primary hover contrast
c831cd4 refactor(tourism): add ink and selected tokens
5d48d68 refactor(tourism): tokenise green text on tinted surfaces
3aa50c2 fix(tourism): make the arrival note readable
12163ee refactor(tourism): add tinted neutral tokens
9227688 refactor(tourism): tokenise tinted borders and surfaces
8c3c37a refactor(tourism): tokenise remaining brand accents
1f01de4 refactor(tourism): tokenise the brand shadow tint
6e09b51 fix(tourism): tokenise analytics inline styles
c09f498 refactor(tourism): tokenise brand colours in tailwind classes
0840be5 refactor(tourism): tokenise remaining tailwind borders
7f3815c docs(tourism): record the theme token contract
3d1e2fd refactor(tourism): tokenise brand palette classes
```
