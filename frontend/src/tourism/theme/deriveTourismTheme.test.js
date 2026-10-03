import {
  contrastRatio,
  deriveTourismTheme,
  DEFAULT_PRIMARY_COLOR,
  hexToRgb,
} from "./deriveTourismTheme";

const fs = require("fs");
const path = require("path");

// ---- helpers --------------------------------------------------------------

function readRootDefaults() {
  const css = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8");
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const out = {};
  for (const match of block.matchAll(/(--th-[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

// value -> { rgb: [r, g, b], alpha }
function parseColour(value) {
  let m = value.match(/^#([0-9a-f]{6})$/i);
  if (m) return { rgb: hexToRgb(value), alpha: 1 };
  m = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], alpha: +m[4] };
  m = value.match(/^(\d+),\s*(\d+),\s*(\d+)$/);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], alpha: null };
  throw new Error(`cannot parse colour ${value}`);
}

function lab(rgb) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(lin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

const DERIVED = [
  "--th-primary", "--th-primary-hover", "--th-primary-active", "--th-primary-deep",
  "--th-primary-ink", "--th-primary-ink-strong", "--th-primary-selected",
  "--th-primary-tint", "--th-primary-tint-strong", "--th-primary-border",
  "--th-primary-alpha-10", "--th-primary-alpha-20", "--th-primary-alpha-30",
  "--th-page-grad-1", "--th-page-grad-2", "--th-page-grad-3",
  "--th-surface-tinted", "--th-surface-tinted-strong",
  "--th-border-tinted", "--th-border-tinted-strong", "--th-border-tinted-control",
  "--th-text-tinted-strong", "--th-text-tinted", "--th-text-tinted-muted",
  "--th-shadow-rgb",
  "--th-chart-1", "--th-chart-2", "--th-chart-3", "--th-chart-4", "--th-chart-5", "--th-chart-wash",
];
const COMPUTED = ["--th-primary-contrast"];
const FIXED = [
  "--th-page-bg", "--th-surface", "--th-surface-alt", "--th-border", "--th-border-strong",
  "--th-text-main", "--th-text-muted", "--th-text-inverse", "--th-scrim",
  "--th-success", "--th-success-bg", "--th-success-text",
  "--th-warning", "--th-warning-bg", "--th-warning-text",
  "--th-danger", "--th-danger-bg", "--th-danger-text",
  "--th-info", "--th-info-bg", "--th-info-border",
];

// ---- tests ----------------------------------------------------------------

describe("deriveTourismTheme", () => {
  const root = readRootDefaults();
  const green = deriveTourismTheme(DEFAULT_PRIMARY_COLOR);

  test("every :root token is classified exactly once", () => {
    expect([...DERIVED, ...COMPUTED, ...FIXED].sort()).toEqual(Object.keys(root).sort());
  });

  test("emits exactly the derived and computed tokens, never a fixed one", () => {
    expect(Object.keys(green).sort()).toEqual([...DERIVED, ...COMPUTED].sort());
    FIXED.forEach((name) => expect(green).not.toHaveProperty(name));
  });

  test("reproduces every current :root default from #2FA34A within deltaE 0.5", () => {
    DERIVED.forEach((name) => {
      const expected = parseColour(root[name]);
      const actual = parseColour(green[name]);
      expect({ name, alpha: actual.alpha }).toEqual({ name, alpha: expected.alpha });
      const d = deltaE(actual.rgb, expected.rgb);
      if (d > 0.5) throw new Error(`${name}: derived ${green[name]} vs :root ${root[name]} (deltaE ${d.toFixed(2)})`);
    });
  });

  test("a known orange produces the expected family", () => {
    const orange = deriveTourismTheme("#ef7c1f");
    expect(orange["--th-primary"]).toBe("#EF7C1F");
    expect(orange["--th-primary-hover"]).toBe("#D17B00");
    expect(orange["--th-primary-active"]).toBe("#D56305");
    expect(orange["--th-primary-deep"]).toBe("#803900");
    expect(orange["--th-primary-ink"]).toBe("#7B4900");
    expect(orange["--th-primary-ink-strong"]).toBe("#482902");
    expect(orange["--th-primary-tint"]).toBe("#FFF7EE");
    expect(orange["--th-primary-tint-strong"]).toBe("#F6E5DA");
    expect(orange["--th-primary-selected"]).toBe("#FFE3CC");
    expect(orange["--th-primary-border"]).toBe("#FFDEB3");
    expect(orange["--th-surface-tinted"]).toBe("#FDF3EB");
    expect(orange["--th-primary-alpha-20"]).toBe("rgba(239, 124, 31, 0.2)");
    expect(orange["--th-shadow-rgb"]).toBe("83, 50, 23");
    // tints stay pale (additive deltas would have turned them white)
    ["--th-primary-tint", "--th-primary-tint-strong", "--th-surface-tinted"].forEach((name) =>
      expect(orange[name]).not.toBe("#FFFFFF")
    );
  });

  test.each(["#2FA34A", "#EF7C1F", "#FFD84D"])("readable pairs stay at AA or better for %s", (base) => {
    const v = deriveTourismTheme(base);
    expect(contrastRatio("#FFFFFF", v["--th-primary-deep"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--th-primary-ink"], v["--th-primary-tint"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--th-primary-ink"], v["--th-primary-tint-strong"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--th-primary-ink-strong"], v["--th-primary-tint"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--th-text-tinted"], v["--th-surface-tinted"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--th-text-tinted-muted"], v["--th-surface-tinted"])).toBeGreaterThanOrEqual(4.5);
  });

  test("the contrast colour stays white, as the owner decided, for green and orange", () => {
    // Below AA (3.25:1 and 2.77:1) but above the 2.5:1 floor: an accepted condition.
    expect(green["--th-primary-contrast"]).toBe("#FFFFFF");
    expect(green["--th-primary-contrast"]).toBe(root["--th-primary-contrast"].toUpperCase());
    expect(deriveTourismTheme("#EF7C1F")["--th-primary-contrast"]).toBe("#FFFFFF");
    expect(deriveTourismTheme("#1E40AF")["--th-primary-contrast"]).toBe("#FFFFFF");
  });

  test("a colour where white falls below 2.5:1 falls back to a dark ink that reaches AA", () => {
    expect(contrastRatio("#FFFFFF", "#FFD84D")).toBeLessThan(2.5);
    const contrast = deriveTourismTheme("#FFD84D")["--th-primary-contrast"];
    expect(contrast).toBe("#4A4200");
    expect(contrastRatio(contrast, "#FFD84D")).toBeGreaterThanOrEqual(4.5);
  });

  test.each(["#2FA34A", "#EF7C1F", "#FFD84D", "#1E40AF", "#DB2777"])(
    "chart colours stay distinguishable for %s (min pairwise deltaE >= 8)",
    (base) => {
      const v = deriveTourismTheme(base);
      const charts = [1, 2, 3, 4, 5].map((n) => hexToRgb(v[`--th-chart-${n}`]));
      let min = Infinity;
      for (let i = 0; i < charts.length; i += 1)
        for (let j = i + 1; j < charts.length; j += 1) min = Math.min(min, deltaE(charts[i], charts[j]));
      expect(min).toBeGreaterThanOrEqual(8);
    }
  );

  test.each([
    ["missing", undefined],
    ["null", null],
    ["malformed name", "orange"],
    ["short hex", "#12345"],
    ["no hash", "2FA34A"],
    ["number", 123],
    ["object", { primary_color: "#EF7C1F" }],
  ])("falls back to the green defaults for a %s value", (_label, value) => {
    expect(deriveTourismTheme(value)).toEqual(green);
  });
});
