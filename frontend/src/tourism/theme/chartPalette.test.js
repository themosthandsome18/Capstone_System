import { CHART_PALETTE_DEFAULTS, readChartPalette, seriesColors } from "./chartPalette";
import { deriveTourismTheme } from "./deriveTourismTheme";

const fs = require("fs");
const path = require("path");

function readRootDefaults() {
  const css = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8");
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const out = {};
  for (const match of block.matchAll(/(--th-[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

function themedShell(primaryColor) {
  const element = document.createElement("div");
  Object.entries(deriveTourismTheme(primaryColor)).forEach(([name, value]) => element.style.setProperty(name, value));
  return element;
}

const expectedPalette = (primaryColor) => {
  const vars = deriveTourismTheme(primaryColor);
  return {
    series: [1, 2, 3, 4, 5].map((n) => vars[`--th-chart-${n}`]),
    wash: vars["--th-chart-wash"],
    tick: CHART_PALETTE_DEFAULTS.tick, // --th-text-muted is fixed, so the shell does not carry it
  };
};

describe("chart palette", () => {
  test("the fallback defaults are the green :root values", () => {
    const root = readRootDefaults();
    expect(CHART_PALETTE_DEFAULTS.series).toEqual([1, 2, 3, 4, 5].map((n) => root[`--th-chart-${n}`]));
    expect(CHART_PALETTE_DEFAULTS.wash).toBe(root["--th-chart-wash"]);
    expect(CHART_PALETTE_DEFAULTS.tick).toBe(root["--th-text-muted"]);
  });

  test("a green shell gives the green palette", () => {
    const palette = readChartPalette(themedShell("#2FA34A"));
    expect(palette).toEqual(expectedPalette("#2FA34A"));
    expect(palette.series.map((c) => c.toLowerCase())).toEqual([...CHART_PALETTE_DEFAULTS.series]);
  });

  test("an orange shell gives the orange palette", () => {
    const palette = readChartPalette(themedShell("#EF7C1F"));
    expect(palette).toEqual(expectedPalette("#EF7C1F"));
    expect(palette.series).toEqual(["#B65E16", "#E3821C", "#E98C4E", "#EFBA7B", "#F1CDAC"]);
  });

  test("the tick colour is read from the shell when it carries one", () => {
    const element = themedShell("#EF7C1F");
    element.style.setProperty("--th-text-muted", "#123456");
    expect(readChartPalette(element).tick).toBe("#123456");
  });

  test.each([
    ["missing shell", () => null],
    ["unthemed shell", () => document.createElement("div")],
    ["non-element", () => ({})],
  ])("a %s falls back to the green defaults without throwing", (_label, make) => {
    expect(readChartPalette(make())).toEqual({
      series: [...CHART_PALETTE_DEFAULTS.series],
      wash: CHART_PALETTE_DEFAULTS.wash,
      tick: CHART_PALETTE_DEFAULTS.tick,
    });
  });

  test("a throwing getComputedStyle falls back to the green defaults", () => {
    const spy = jest.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      expect(readChartPalette(themedShell("#EF7C1F")).series).toEqual([...CHART_PALETTE_DEFAULTS.series]);
    } finally {
      spy.mockRestore();
    }
  });

  test("two-slice charts use chart-1 and chart-4; three or more go in order", () => {
    const palette = { series: ["c1", "c2", "c3", "c4", "c5"] };
    expect(seriesColors(palette, 1)).toEqual(["c1"]);
    expect(seriesColors(palette, 2)).toEqual(["c1", "c4"]);
    expect(seriesColors(palette, 3)).toEqual(["c1", "c2", "c3"]);
    expect(seriesColors(palette, 4)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(seriesColors(palette, 7)).toEqual(["c1", "c2", "c3", "c4", "c5", "c1", "c2"]);
    expect(seriesColors(palette, 0)).toEqual(["c1"]);
  });
});
