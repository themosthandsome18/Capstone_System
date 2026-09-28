// Derives the tourism --th-* palette from one base colour.
//
// The rules were MEASURED from the :root defaults in Tourism_index.css against
// the original green #2FA34A, so deriveTourismTheme("#2FA34A") reproduces the
// current palette exactly (see deriveTourismTheme.test.js). For each token:
//   - hue      = base hue + the measured hue offset
//   - saturation = the measured saturation scaled by (base S / green S)
//   - lightness  = the measured lightness, kept ABSOLUTE, so pale surfaces stay
//                  pale and ink stays dark whatever colour is chosen.
//                  Only the primary's own hover/active states move relative to
//                  the base (they are darker versions of it).
// Additive lightness deltas were rejected: on #EF7C1F they push every tint to
// pure white and drop ink-on-tint to 4.15:1.
//
// Tokens NOT derived here stay fixed on :root: every status token, white
// surfaces, --th-text-main/-muted, --th-border/-strong, --th-surface-alt,
// --th-scrim, --th-info*, --th-text-inverse, --th-page-bg.

export const DEFAULT_PRIMARY_COLOR = "#2FA34A";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const GREEN_HSL = [133.96552, 0.55238, 0.41176];
const AA = 4.5;

// [hue offset, saturation, lightness] measured from :root against #2FA34A.
const ABSOLUTE_RULES = {
  "--th-primary-deep": [18.08, 0.6875, 0.251],
  "--th-primary-ink": [8.819, 0.6423, 0.2412],
  "--th-primary-ink-strong": [6.489, 0.5946, 0.1451],
  "--th-primary-selected": [15.303, 0.8039, 0.9],
  "--th-primary-tint": [4.496, 0.7647, 0.9667],
  "--th-primary-tint-strong": [-3.966, 0.3913, 0.9098],
  "--th-primary-border": [7.034, 0.7895, 0.851],
  "--th-page-grad-1": [18.342, 0.4483, 0.9431],
  "--th-page-grad-2": [21.489, 0.3929, 0.8902],
  "--th-page-grad-3": [26.034, 0.2842, 0.8137],
  "--th-surface-tinted": [1.034, 0.5455, 0.9569],
  "--th-surface-tinted-strong": [21.034, 0.2667, 0.8235],
  "--th-border-tinted": [13.034, 0.3333, 0.8824],
  "--th-border-tinted-strong": [8.534, 0.1429, 0.7804],
  "--th-border-tinted-control": [16.034, 0.2857, 0.7804],
  "--th-text-tinted-strong": [23.534, 0.2, 0.0784],
  "--th-text-tinted": [18.342, 0.1057, 0.2412],
  "--th-text-tinted-muted": [16.034, 0.0642, 0.4275],
  "--th-chart-1": [44.304, 0.7222, 0.2824],
};

// [hue offset, saturation, lightness DELTA]: darker states of the base itself.
const RELATIVE_RULES = {
  "--th-primary-hover": [8.464, 0.7181, 0.2922 - GREEN_HSL[2]],
  "--th-primary-active": [0.409, 0.6076, 0.3098 - GREEN_HSL[2]],
};

// Chart 2-5 are spread in LIGHTNESS (and a little hue, -20..+44 degrees
// around the base) so slices stay distinguishable: the closest pair is at
// least deltaE 27 on every base tested. Saturation is capped so orange and
// other vivid bases do not turn neon.
const CHART_RULES = {
  "--th-chart-2": [-20, 0.6, 0.36],
  "--th-chart-3": [36, 0.6, 0.6],
  "--th-chart-4": [-20, 0.55, 0.68],
  "--th-chart-5": [44, 0.5, 0.84],
};
const CHART_SATURATION_CAP = 0.7;

const SHADOW_RULE = [19.192, 0.3585, 0.2078];
const CHART_WASH_RULE = [48.128, 0.4057, 0.5843, 0.15];
const ALPHAS = { "--th-primary-alpha-10": 0.1, "--th-primary-alpha-20": 0.2, "--th-primary-alpha-30": 0.3 };

// ---- colour maths ---------------------------------------------------------

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function isHexColor(value) {
  return typeof value === "string" && HEX_RE.test(value);
}

export function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function rgbToHsl([r, g, b]) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => (v + m) * 255);
}

function channelToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const [hi, lo] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- derivation -----------------------------------------------------------

function fromRule(baseHsl, [dH, s, l], { relative = false, saturationCap = 1 } = {}) {
  const ratio = GREEN_HSL[1] ? baseHsl[1] / GREEN_HSL[1] : 0;
  const saturation = Math.min(clamp01(s * ratio), saturationCap);
  const lightness = clamp01(relative ? baseHsl[2] + l : l);
  return rgbToHex(hslToRgb(baseHsl[0] + dH, saturation, lightness));
}

// Darken a colour (same hue and saturation) until it reaches AA against `against`.
// Never changes a colour that already passes, so green is untouched.
function darkenToContrast(hex, against, target = AA) {
  if (contrastRatio(hex, against) >= target) return hex;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  for (let next = l - 0.01; next >= 0; next -= 0.01) {
    const candidate = rgbToHex(hslToRgb(h, s, next));
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return "#000000";
}

// Text colour for content sitting on the primary fill: white when white
// reaches AA (4.5:1) against it, otherwise a dark ink of the same hue.
export function deriveContrastColor(primaryHex, inkStrongHex) {
  if (contrastRatio("#FFFFFF", primaryHex) >= AA) return "#FFFFFF";
  return darkenToContrast(inkStrongHex, primaryHex);
}

function rgbaString(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns { "--th-…": value } for every derived token. Anything that is not a
 * #RRGGBB string (missing, null, malformed) falls back to the original green:
 * a colour setting must never be able to break the app.
 */
export function deriveTourismTheme(primaryColor) {
  const base = isHexColor(primaryColor) ? primaryColor.toUpperCase() : DEFAULT_PRIMARY_COLOR;
  const baseHsl = rgbToHsl(hexToRgb(base));
  const vars = { "--th-primary": base };

  Object.entries(ABSOLUTE_RULES).forEach(([name, rule]) => {
    vars[name] = fromRule(baseHsl, rule);
  });
  Object.entries(RELATIVE_RULES).forEach(([name, rule]) => {
    vars[name] = fromRule(baseHsl, rule, { relative: true });
  });
  Object.entries(CHART_RULES).forEach(([name, rule]) => {
    vars[name] = fromRule(baseHsl, rule, { saturationCap: CHART_SATURATION_CAP });
  });

  // Readability floors (no effect on green, which already passes all of them).
  vars["--th-primary-deep"] = darkenToContrast(vars["--th-primary-deep"], "#FFFFFF");
  vars["--th-primary-ink"] = darkenToContrast(vars["--th-primary-ink"], vars["--th-primary-tint-strong"]);
  vars["--th-primary-ink-strong"] = darkenToContrast(vars["--th-primary-ink-strong"], vars["--th-primary-tint"]);
  vars["--th-text-tinted"] = darkenToContrast(vars["--th-text-tinted"], vars["--th-surface-tinted"]);
  vars["--th-text-tinted-muted"] = darkenToContrast(vars["--th-text-tinted-muted"], vars["--th-surface-tinted"]);

  Object.entries(ALPHAS).forEach(([name, alpha]) => {
    vars[name] = rgbaString(base, alpha);
  });

  const shadow = hexToRgb(fromRule(baseHsl, SHADOW_RULE));
  vars["--th-shadow-rgb"] = shadow.join(", ");

  const [wh, ws, wl, walpha] = CHART_WASH_RULE;
  vars["--th-chart-wash"] = rgbaString(fromRule(baseHsl, [wh, ws, wl]), walpha);

  vars["--th-primary-contrast"] = deriveContrastColor(base, vars["--th-primary-ink-strong"]);
  return vars;
}
