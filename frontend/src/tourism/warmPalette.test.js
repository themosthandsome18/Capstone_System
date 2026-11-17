/**
 * The Destinations modals and the Arrival Monitoring row and record modal (the stretch of Tourism_index.css from "Destinations: the Edit modal..." to the
 * Mobile App Content page) were drawn from the warm orange palette and written as literals, so they stayed brown on any other theme. Now they use the theme's
 * tokens. This holds that: none of those twenty colours is written as a literal again, every token the stretch reads exists, and what they resolve to FOLLOWS
 * the colour the admin chose (green and a far-away purple give different answers).
 */
import { tourismCss } from "./testing/cssRules";
import { deriveTourismTheme } from "./theme/deriveTourismTheme";

const START = "/* Destinations: the Edit modal, the Details modal and the Length of Stay chips.";
const END = "/* ================= MOBILE APP CONTENT (Commit 4) =================";
const stretch = tourismCss.slice(tourismCss.indexOf(START), tourismCss.indexOf(END));

// the twenty colours that were written here as literals (the lower-case hex or the exact rgba), and which are not to come back
const WARM_LITERALS = [
  "#241e1a", "#e0701a", "#8a6e55", "#efe2d3", "#e0cdb7", "#87705c", "#7a6755", "#453931", "#8a4310", "#6b5949",
  "#fdf0e2", "#be5b11", "#e8dbcb", "#fbf1e4", "#f4e7d8", "#fdf5ec", "#c2ae98", "#6e5a46", "rgba(90, 60, 35, 0.14)", "rgba(90, 60, 35, 0.16)",
];

// what the stretch still writes as a literal, on purpose: the green "Active" chip (a status colour), white, and the dark overlays of the buttons on a photo
const KEPT_ON_PURPOSE = new Set(["#1c7a42", "#3f3a35", "#fffdfb", "#ffffff", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.22)", "rgba(20, 16, 12, 0.72)", "rgba(255, 255, 255, 0.94)"]);

const rootBlock = tourismCss.slice(tourismCss.indexOf(":root {"), tourismCss.indexOf("}", tourismCss.indexOf(":root {")));
const rootTokens = Object.fromEntries(Array.from(rootBlock.matchAll(/(--th-[a-z0-9-]+):\s*([^;]+);/g)).map((m) => [m[1], m[2].trim()]));

describe("the stretch is found", () => {
  it("it starts at the Destinations comment and ends before Mobile App Content, and holds the rules this is about", () => {
    expect(stretch.length).toBeGreaterThan(5000);
    for (const selector of [".dest-chip.selected", ".dest-seg", ".dest-readonly", ".arrival-record-link", ".arm-btn.primary", ".arm-band", ".arm-label"]) {
      expect({ selector, found: stretch.includes(`\n${selector} {`) }).toEqual({ selector, found: true });
    }
  });
});

describe("no warm literal is written in it", () => {
  it.each(WARM_LITERALS)("%s is not in the stretch", (literal) => {
    expect(stretch.toLowerCase()).not.toContain(literal);
  });

  it("every literal colour that is left is one that is kept on purpose", () => {
    const left = Array.from(stretch.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g))
      .map((m) => m[0].toLowerCase())
      .filter((value) => !value.includes("var("));
    expect(Array.from(new Set(left)).filter((value) => !KEPT_ON_PURPOSE.has(value))).toEqual([]);
  });

  it("the two rules that only repeated an earlier one are gone, not recoloured", () => {
    expect(stretch).not.toContain(".dest-btn-orange {");
    expect(stretch).not.toContain("tr.arrival-row:hover > td {");
  });
});

describe("the tokens it reads", () => {
  const used = Array.from(new Set(Array.from(stretch.matchAll(/var\((--th-[a-z0-9-]+)\)/g)).map((m) => m[1]))).sort();

  it("there are some, and each one exists (in :root or derived from the colour)", () => {
    expect(used.length).toBeGreaterThanOrEqual(12);
    const known = new Set([...Object.keys(rootTokens), ...Object.keys(deriveTourismTheme("#2FA34A"))]);
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });

  it("the shadow reads its channels from the theme", () => {
    expect(stretch).toContain("rgba(var(--th-shadow-rgb), 0.16)");
    expect(stretch).toContain("rgba(var(--th-shadow-rgb), 0.14)");
    expect(Object.keys(deriveTourismTheme("#2FA34A"))).toContain("--th-shadow-rgb");
  });

  it("they FOLLOW the colour: a purple theme gives a different answer from green for every one the theme derives", () => {
    const green = deriveTourismTheme("#2FA34A");
    const purple = deriveTourismTheme("#7C3AED");
    const derived = used.filter((name) => name in green);
    expect(derived.length).toBeGreaterThanOrEqual(10);
    const same = derived.filter((name) => green[name] === purple[name]);
    expect(same).toEqual([]);
    // and none of what they resolve to on purple is the old orange/brown
    const resolved = derived.map((name) => purple[name].toLowerCase());
    for (const literal of WARM_LITERALS.filter((value) => value.startsWith("#"))) {
      expect(resolved).not.toContain(literal);
    }
  });
});
