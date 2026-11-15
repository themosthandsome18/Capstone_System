import { createContext, useContext } from "react";

// Chart.js draws on a <canvas>, which cannot resolve var(--th-*). The chart
// colours are therefore READ BACK from the tourism shell element with
// getComputedStyle after useTourismTheme has set them there: the derivation in
// deriveTourismTheme.js stays the one source of truth.

const SERIES_TOKENS = ["--th-chart-1", "--th-chart-2", "--th-chart-3", "--th-chart-4", "--th-chart-5"];
const WASH_TOKEN = "--th-chart-wash";
const TICK_TOKEN = "--th-text-muted";
// The grid lines of the Dashboard's charts: the tinted line colour of the theme, as the translucent line they have always been.
const GRID_TOKEN = "--th-border-tinted-strong";
const GRID_ALPHA = 0.35;

// The green :root defaults (Tourism_index.css), used for any slot that cannot
// be read. chartPalette.test.js pins these to :root so they cannot drift.
export const CHART_PALETTE_DEFAULTS = Object.freeze({
  series: Object.freeze(["#27a544", "#36c962", "#65d279", "#90daa9", "#b9e4c4"]),
  wash: "rgba(106, 192, 126, 0.15)",
  tick: "#64748b",
  grid: "rgba(191, 207, 197, 0.35)",
});

// "#RRGGBB" as the translucent line a chart draws a grid with (a canvas cannot resolve var(), and a hex has no alpha). Anything else: null.
function translucent(hex, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(match[1].slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Reads the chart colours from the themed shell element. Never throws: a
 * missing element, a missing getComputedStyle or an empty value falls back to
 * the green default for that slot.
 */
export function readChartPalette(element) {
  let style = null;
  try {
    if (element && typeof window !== "undefined" && window.getComputedStyle) {
      style = window.getComputedStyle(element);
    }
  } catch {
    style = null;
  }
  const read = (name, fallback) => {
    const value = style ? String(style.getPropertyValue(name) || "").trim() : "";
    return value || fallback;
  };
  return {
    series: SERIES_TOKENS.map((name, i) => read(name, CHART_PALETTE_DEFAULTS.series[i])),
    wash: read(WASH_TOKEN, CHART_PALETTE_DEFAULTS.wash),
    tick: read(TICK_TOKEN, CHART_PALETTE_DEFAULTS.tick),
    grid: translucent(read(GRID_TOKEN, ""), GRID_ALPHA) || CHART_PALETTE_DEFAULTS.grid,
  };
}

/**
 * Series colours for a chart with `count` series or slices.
 * Two-slice charts use chart-1 and chart-4: chart-1 and chart-2 are too close
 * to tell apart side by side (deltaE 13.6 on green, against 37.9 for 1 and 4).
 * Three or more take the palette in order, repeating after five.
 * See THEME_TOKENS.md, "Charts".
 */
export function seriesColors(palette, count) {
  const series = palette.series;
  if (count === 2) return [series[0], series[3]];
  return Array.from({ length: Math.max(count, 1) }, (_, i) => series[i % series.length]);
}

// Provided by AppShell. Outside the shell (no provider) charts get the green
// defaults; inside it the value is null until the shell's colours have been
// read, and charts wait for it rather than drawing in the wrong colours.
export const TourismChartPaletteContext = createContext(CHART_PALETTE_DEFAULTS);

export function useTourismChartPalette() {
  return useContext(TourismChartPaletteContext);
}
