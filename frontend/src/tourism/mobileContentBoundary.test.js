/**
 * The BOUNDARY of Mobile App Content: what follows the admin's theme, and what does not.
 *
 *   FOLLOWS the theme: the admin's own page: the locked-fee note beside the Port guide, the "locked" tag of a card, and the padlock of the note.
 *   DOES NOT follow it: everything that is the MOBILE APP drawn on the page. The phones (their screens, the notice and the staff phones), the
 *   banner of the preview (it sits inside a phone, and its brown IS the app's brand brown), the --mc-app-* colours, and the tone of an icon (a colour
 *   the admin CHOOSES for the app's tile, so the choice would mean nothing if it followed the theme).
 *
 * The browns outside are easy to take for "the browns to fix" by somebody reading the file for leftovers. These tests are for that person: they say
 * which browns are meant, and why, and they fail if one of them is turned into a theme token.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { ICON_TONES } from "./utils/mobileContentIcons";
import { deriveTourismTheme } from "./theme/deriveTourismTheme";
import { rule, tourismCss } from "./testing/cssRules";

const BLOCK_EDITOR = readFileSync(join(__dirname, "pages", "MobileContentBlockEditor.js"), "utf8");
const PORT_TAB = readFileSync(join(__dirname, "pages", "MobileContentPortTab.js"), "utf8");

const usesTheTheme = (value) => /var\(--th-/.test(value);
// the file's comments out of the way (one of them sits in the rule of the page and has a colon in it)
const CSS_NO_COMMENTS = tourismCss.replace(/\/\*[\s\S]*?\*\//g, "");
const pageRule = () => rule(".mobile-content-page", CSS_NO_COMMENTS);
const lower = (value) => String(value).trim().toLowerCase();

describe("what FOLLOWS the theme: the admin's own page", () => {
  const FOLLOWS = [
    [".mobile-content-locked", "background", "var(--th-surface-tinted)"],
    [".mobile-content-locked", "border", "1px solid var(--th-border-tinted)"],
    [".mobile-content-locked-head h2", "color", "var(--th-text-tinted-strong)"],
    [".mobile-content-locked-head svg", "color", "var(--th-primary-ink)"],
    [".mobile-content-locked-price", "border", "1px solid var(--th-border-tinted)"],
    [".mobile-content-locked-label", "color", "var(--th-text-tinted-muted)"],
    [".mobile-content-locked p", "color", "var(--th-text-tinted)"],
    ['.mobile-content-card-tag[data-kind="locked"]', "background", "var(--th-primary-tint-strong)"],
    ['.mobile-content-card-tag[data-kind="locked"]', "color", "var(--th-primary-ink)"],
  ];

  it.each(FOLLOWS)("%s { %s } is %s", (selector, property, expected) => {
    expect(rule(selector)[property]).toBe(expected);
  });

  it("the padlock draws in currentColor, so it takes the colour of the head (no brown is written in the component)", () => {
    expect(PORT_TAB).toMatch(/function Padlock\(\)[\s\S]*?stroke="currentColor"/);
    expect(PORT_TAB).not.toMatch(/function Padlock\(\)[\s\S]*?stroke="#/);
  });

  it("every tinted token it reads exists and gives a different colour on a purple theme than on green", () => {
    const green = deriveTourismTheme("#2FA34A");
    const purple = deriveTourismTheme("#7C3AED");
    for (const token of ["--th-surface-tinted", "--th-border-tinted", "--th-text-tinted-strong", "--th-text-tinted", "--th-text-tinted-muted", "--th-primary-tint-strong", "--th-primary-ink"]) {
      expect(green[token]).toBeTruthy();
      expect(purple[token]).not.toBe(green[token]);
    }
  });

  it("none of the brown it had is written in these rules any more", () => {
    const rules = [".mobile-content-locked", ".mobile-content-locked-head h2", ".mobile-content-locked-price", ".mobile-content-locked-label", ".mobile-content-locked p", '.mobile-content-card-tag[data-kind="locked"]'];
    const text = rules.map((selector) => JSON.stringify(rule(selector))).join(" ").toLowerCase();
    for (const brown of ["#ebd3b6", "#fdf0e2", "#6f3e11", "#9b7349", "#6b4f32", "#fbeadb", "#8a4f16"]) {
      expect(text).not.toContain(brown);
    }
  });
});

describe("what does NOT follow the theme: the app, drawn on the page", () => {
  it("the banner of the preview is inside a phone, which is why it is the app's brown", () => {
    expect(BLOCK_EDITOR).toMatch(/<div className="mobile-content-phone">\s*<div className="mobile-content-banner">/);
    expect((BLOCK_EDITOR.match(/mobile-content-banner/g) || []).length).toBe(1); // nowhere else: no banner of the page's own
  });

  it("the banner is the app's brand brown, in a literal, and not a theme token", () => {
    const brand = lower(pageRule()["--mc-app-brand"]);
    expect(brand).toBe("#6b3410");
    expect(lower(rule(".mobile-content-banner").background)).toBe(brand);
    for (const selector of [".mobile-content-banner", ".mobile-content-banner .mobile-content-banner-subtitle p", ".mobile-content-banner .mobile-content-muted", ".mobile-content-banner .options-hint"]) {
      for (const [property, value] of Object.entries(rule(selector))) {
        expect({ selector, property, themed: usesTheTheme(value) }).toEqual({ selector, property, themed: false });
      }
    }
    expect(lower(rule(".mobile-content-banner .mobile-content-banner-subtitle p").color)).toBe("#f3d8be");
    expect(lower(rule(".mobile-content-banner .mobile-content-muted").color)).toBe("#f3d8be");
    expect(lower(rule(".mobile-content-banner .options-hint").color)).toBe("#f3d8be");
  });

  it("the --mc-app-* colours are literals, the app's own", () => {
    const page = pageRule();
    const mc = Object.entries(page).filter(([name]) => name.startsWith("--mc-app-"));
    expect(Object.fromEntries(mc.map(([name, value]) => [name, lower(value)]))).toEqual({
      "--mc-app-line": "#efe1d1",
      "--mc-app-hint": "#8a7664",
      "--mc-app-tab": "#65564a",
      "--mc-app-ink": "#241e1a",
      "--mc-app-brand": "#6b3410",
    });
    mc.forEach(([name, value]) => expect({ name, themed: usesTheTheme(value) }).toEqual({ name, themed: false }));
  });

  it("the phones keep their own browns", () => {
    const PHONES = [
      [".mobile-content-notice-phone", "background", "#1d1713"],
      [".mobile-content-notice-screen", "background", "#fdf6ee"],
      [".mobile-content-staff-phone", "background", "#1d1713"],
      [".mobile-content-staff-screen", "background", "#fdf6ee"],
    ];
    for (const [selector, property, brown] of PHONES) {
      expect({ selector, value: lower(rule(selector)[property]) }).toEqual({ selector, value: brown });
    }
  });

  it("the tone of an icon, and the amber tile that shows it, are a colour the admin CHOOSES for the app: they keep their own", () => {
    expect(ICON_TONES.amber).toEqual({ stroke: "#B4690E", background: "#FBEBD4" });
    expect(ICON_TONES.neutral).toEqual({ stroke: "#65564A", background: "#F2E8DB" });
    const amber = rule('.mobile-content-tile[data-tone="amber"]');
    expect({ background: lower(amber.background), color: lower(amber.color) }).toEqual({ background: "#fbf0dd", color: "#a5620d" });
  });

  it("the file still says why: the browns of the app live inside the phones", () => {
    expect(tourismCss).toContain("the browns of the mobile app live only inside the phones (--mc-app-*)");
    expect(tourismCss).toContain("The colours of the MOBILE APP, for the inside of the phones only: the app is brown and does not change with the admin's theme.");
  });
});
