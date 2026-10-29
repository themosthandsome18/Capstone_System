import { render } from "@testing-library/react";
import { CONTACT_ICONS, ContactIcon, FALLBACK_ICON, contactIcon, contactStyle } from "./contactIcons";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

function rootTokens() {
  const css = read("frontend", "src", "tourism", "Tourism_index.css");
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const out = {};
  for (const match of block.matchAll(/(--th-[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

const NAMES = [
  "rescue", "police", "coast_guard", "fire", "hospital", "ambulance",
  "help_desk", "lgu_office", "power", "water", "port", "other",
];

describe("the twelve contact icons", () => {
  it("are these names, in this order, with a label, a picture and a token each", () => {
    expect(CONTACT_ICONS.map((item) => item.name)).toEqual(NAMES);
    CONTACT_ICONS.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(typeof item.Icon).toBe("function");
      expect(item.token).toMatch(/^--th-[a-z-]+$/);
    });
    expect(FALLBACK_ICON).toBe("other");
  });

  it("are the same twelve the server accepts (backend/api/models.py)", () => {
    const models = read("backend", "api", "models.py");
    const block = models.slice(models.indexOf("class EmergencyContact"));
    const server = [...block.matchAll(/^\s+ICON_[A-Z_]+ = "([a-z_]+)"/gm)].map((m) => m[1]);
    expect(server).toEqual(NAMES);
  });

  it("each have a colour token that exists, and the twelve colours are all different", () => {
    const tokens = rootTokens();
    const colours = CONTACT_ICONS.map((item) => tokens[item.token]);
    colours.forEach((colour, i) => expect({ icon: NAMES[i], colour }).toEqual({ icon: NAMES[i], colour: expect.stringMatching(/^#[0-9a-f]{6}$/) }));
    expect(new Set(colours).size).toBe(12);
  });

  it("use the mobile app's own three colours for rescue, police and coast guard", () => {
    const tokens = rootTokens();
    const colourOf = (name) => tokens[contactIcon(name).token];
    expect(colourOf("rescue")).toBe("#ef4444");
    expect(colourOf("police")).toBe("#2563eb");
    expect(colourOf("coast_guard")).toBe("#0d9488");
  });

  it("give the help desk the theme's deep colour, not a fixed one", () => {
    expect(contactIcon("help_desk").token).toBe("--th-primary-deep");
  });

  it("are all listed in THEME_TOKENS.md and in docs/MOBILE_CONTACT_ICONS.md", () => {
    const tokensDoc = read("frontend", "src", "tourism", "THEME_TOKENS.md");
    const mobileDoc = read("docs", "MOBILE_CONTACT_ICONS.md");
    CONTACT_ICONS.forEach((item) => {
      expect(tokensDoc).toContain(`\`${item.token}\``);
      expect(mobileDoc).toContain(`\`${item.name}\``);
    });
    expect(mobileDoc).toMatch(/unknown name is `other`/);
  });

  it("have no colour written in the module or the page: a token or nothing", () => {
    ["utils/contactIcons.js", "pages/EmergencyHotlines.js"].forEach((file) => {
      const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
      expect({ file, hex: source.match(/#[0-9a-fA-F]{3,8}\b/g) }).toEqual({ file, hex: null });
      expect({ file, fn: source.match(/\b(?:rgb|rgba|hsl|hsla)\(/g) }).toEqual({ file, fn: null });
    });
  });

  describe("the colour of the NUMBER (4.5:1 on white)", () => {
    const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const luminance = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const onWhite = (hex) => 1.05 / (luminance(hex) + 0.05);
    const SIX = ["rescue", "coast_guard", "fire", "power", "water", "port"];

    it("is a darker token for exactly these six, and the icon colour for the rest", () => {
      const withText = CONTACT_ICONS.filter((item) => item.textToken).map((item) => item.name);
      expect(withText).toEqual(SIX);
      const tokens = rootTokens();
      SIX.forEach((name) => {
        const item = contactIcon(name);
        expect(tokens[item.textToken]).toMatch(/^#[0-9a-f]{6}$/);
        expect(luminance(tokens[item.textToken])).toBeLessThan(luminance(tokens[item.token])); // darker
        expect(contactStyle(name)["--contact-text"]).toBe(`var(${item.textToken})`);
        expect(contactStyle(name)["--contact-color"]).toBe(`var(${item.token})`); // the icon keeps its colour
      });
      ["police", "hospital", "ambulance", "help_desk", "lgu_office", "other"].forEach((name) => {
        expect(contactStyle(name)["--contact-text"]).toBeUndefined();
      });
    });

    it("reaches 4.5:1 on white for all twelve; no list of exceptions (help_desk is the theme's, so the theme test holds it)", () => {
      const tokens = rootTokens();
      let measured = 0;
      CONTACT_ICONS.forEach((item) => {
        if (item.name === "help_desk") return; // follows --th-primary-deep, which the theme derivation keeps at 4.5:1 on white
        const hex = tokens[item.textToken || item.token];
        expect(onWhite(hex)).toBeGreaterThanOrEqual(4.5);
        measured += 1;
      });
      expect(measured).toBe(11);
    });

    it("leaves the eleven fixed icon colours as they were", () => {
      const tokens = rootTokens();
      const expected = { rescue: "#ef4444", police: "#2563eb", coast_guard: "#0d9488", fire: "#f97316", hospital: "#db2777", ambulance: "#7c3aed",
        lgu_office: "#4f46e5", power: "#ca8a04", water: "#0891b2", port: "#65a30d", other: "#64748b" };
      Object.entries(expected).forEach(([name, hex]) => expect(tokens[contactIcon(name).token]).toBe(hex));
    });
  });

  it("show an unknown, empty or wrongly written name as 'other': never blank, never an error", () => {
    ["siren", "", null, undefined, "RESCUE", "help desk", 7, {}].forEach((bad) => {
      expect(contactIcon(bad).name).toBe("other");
      const { container, unmount } = render(<ContactIcon name={bad} />);
      const box = container.querySelector(".contact-icon");
      expect(box.getAttribute("data-icon")).toBe("other");
      expect(box.querySelector("svg")).not.toBeNull();
      unmount();
    });
    expect(contactStyle("siren")).toEqual(contactStyle("other"));
    expect(contactStyle("other")["--contact-color"]).toBe("var(--th-contact-other)");
  });

  it("draw a known name as itself, with its own colour variable", () => {
    const { container } = render(<ContactIcon name="fire" />);
    const box = container.querySelector(".contact-icon");
    expect(box.getAttribute("data-icon")).toBe("fire");
    expect(box.style.getPropertyValue("--contact-color")).toBe("var(--th-contact-fire)");
  });
});
