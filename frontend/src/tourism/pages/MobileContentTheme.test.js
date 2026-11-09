// Mobile App Content and Resort Accounts follow the colour the admin chose in Appearance, like Registration Options: the brown of the paper is gone from the
// page, and it lives only INSIDE the phones, which are pictures of the mobile app (the app is brown and does not change with the admin's theme).
// The CSS is not loaded by Jest, so it is read from the file.
import fs from "fs";
import path from "path";

const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
const START = CSS.lastIndexOf("/*", CSS.indexOf("MOBILE APP CONTENT: THE DESIGN (Commit 5e)")); // (the start of the comment that opens the block)
const BLOCK = CSS.slice(START);
const MASKED = BLOCK.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

// the inside of a phone: the phone, the banner, the sheet, the tiles, the foot of the app, the home and guide pictures, the port frame, the notification
// phone and its screen, and the phone of the limit panel
const PHONE = /mobile-content-(phone|banner|sheet|tile\[|tile span|foot|detail-body|mock-label|home-|detail-dashed|guide-|port-|notice-phone|notice-screen|notice-statusbar|notice-app|staff-phone|staff-screen)/;
// what is a STATUS or a lock, which this change does not touch
const KEPT = /mobile-content-(locked|card-tag\[data-kind="(order|detail|locked|banner)"\]|tag\[data-detail)|mobile-content-card-(status|dot)/;

const rules = [...MASKED.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].split(/\s+/).join(" ").trim(),
  body: MASKED.slice(match.index + match[1].length + 1, match.index + match[1].length + 1 + match[2].length),
}));
const declarationsOf = (rule) => rule.body.split(";").map((line) => line.trim()).filter(Boolean);
const phoneRules = rules.filter((rule) => PHONE.test(rule.selector));
const pageRules = rules.filter((rule) => !PHONE.test(rule.selector) && !KEPT.test(rule.selector) && rule.selector !== ".mobile-content-page"); // (the page itself defines the colours of the app)

const BROWN_HEX = [
  "#efe1d1", "#f2e7dc", "#f0e4d6", "#fffcf8", "#fbf3ea", "#f2eae1", "#e0cdb7", "#453931", "#7a6450", "#8a7664", "#8a6e55", "#65564a", "#fffdfb",
  "#fbf4ec", "#f2e8db", "#e8dbcb", "#cdb295", "#fbf7f2", "#d8c8b5", "#6e5c4c", "#fff8f0", "#f8e9d8", "#f0d7be",
];

describe("the fixtures: the rules were found", () => {
  it("the block, the phone rules and the page rules are all there", () => {
    expect(START).toBeGreaterThan(-1);
    expect(rules.length).toBeGreaterThan(200);
    expect(phoneRules.length).toBeGreaterThan(40);
    expect(pageRules.length).toBeGreaterThan(150);
  });
});

describe("the page follows the theme", () => {
  const root = rules.find((rule) => rule.selector === ".mobile-content-page");

  it("has no background, padding or rounded edge of its own: it sits on the shell like the other pages", () => {
    expect(root).toBeTruthy();
    const names = declarationsOf(root).map((line) => line.split(":")[0].trim());
    ["background", "background-image", "padding", "border-radius"].forEach((name) => expect(names).not.toContain(name));
  });

  it("no brown paper token is left: the only --mc-* it defines are the font and the colours of the app", () => {
    const defined = declarationsOf(root).map((line) => line.split(":")[0].trim()).filter((name) => name.startsWith("--mc-"));
    expect(defined.length).toBeGreaterThan(3);
    defined.forEach((name) => expect(name).toMatch(/^--mc-(font|app-[a-z]+)$/));
    ["--mc-card", "--mc-line", "--mc-input-line", "--mc-label", "--mc-hint", "--mc-tab"].forEach((name) => {
      expect(BLOCK).not.toContain(`${name}:`);
      expect(BLOCK).not.toContain(`var(${name})`);
    });
  });

  it("no rule of the page writes a brown of the paper, and no brown shadow", () => {
    const written = pageRules.map((rule) => rule.body).join("\n").toLowerCase();
    BROWN_HEX.forEach((hex) => expect(written).not.toContain(hex));
    expect(written).not.toMatch(/rgba\(\s*(90|120),\s*(60|80),\s*(35|40)/);
    expect(written).not.toContain("var(--mc-app-"); // the app's colours are for the inside of a phone only
  });

  it("the card, the lines, the labels, the hints and the tabs are the tokens of Registration Options", () => {
    const find = (selector) => rules.find((rule) => rule.selector === selector).body;
    const card = find(".mobile-content-page .mobile-content-card");
    expect(card).toContain("background: rgba(255, 255, 255, 0.8);");
    expect(card).toContain("box-shadow: 0 18px 32px rgba(var(--th-shadow-rgb), 0.16);");
    expect(find(".mobile-content-page .mobile-content-card .settings-field > label span")).toContain("color: var(--th-text-muted);");
    expect(find(".mobile-content-page .mobile-content-card .options-hint")).toContain("color: var(--th-text-muted);");
    expect(find(".mobile-content-page .mobile-content-tabs button")).toContain("color: var(--th-text-muted);");
  });

  it("what Options has not (the group, its head, a row, a chip) is the -tinted tokens of the sidebar and the cards", () => {
    const find = (selector) => rules.find((rule) => rule.selector === selector).body;
    expect(find(".mobile-content-staff-group-head")).toContain("var(--th-surface-tinted-strong)");
    expect(find(".mobile-content-staff-group")).toContain("var(--th-border-tinted)");
    expect(find(".mobile-content-staff-row")).toContain("background: var(--th-surface-tinted);");
    expect(find(".mobile-content-staff-chip")).toContain("var(--th-surface-tinted)");
  });
});

describe("the inside of a phone does NOT follow the theme", () => {
  const FOLLOWS = /var\(--th-(primary|page|shadow-rgb|chart|surface-tinted|border-tinted|text-tinted)[a-z0-9-]*\)|var\(--mc-(?!app-|font)/;

  it("no rule inside a phone uses a token that changes with the colour of the admin", () => {
    const offenders = phoneRules.filter((rule) => FOLLOWS.test(rule.body)).map((rule) => `${rule.selector}: ${rule.body.trim()}`);
    expect(offenders).toEqual([]);
  });

  it("the browns of the app are literal values, written once, on the page", () => {
    const root = rules.find((rule) => rule.selector === ".mobile-content-page").body;
    expect(root).toMatch(/--mc-app-brand: #6b3410;/);
    expect(root).toMatch(/--mc-app-line: #efe1d1;/);
    expect(root).toMatch(/--mc-app-hint: #8a7664;/);
    expect(root).toMatch(/--mc-app-tab: #65564a;/);
    expect(root).toMatch(/--mc-app-ink: #241e1a;/);
  });

  it("Scan QR Code in the phone of the limit panel is the brown of the app, not the colour of the theme", () => {
    const main = rules.find((rule) => rule.selector === ".mobile-content-staff-screen-box.is-main").body;
    expect(main).toContain("background: var(--mc-app-brand);");
    expect(main).toContain("border-color: var(--mc-app-brand);");
    expect(main).not.toMatch(/--th-/);
  });

  it("the phone of the limit panel and the phone of the notifications write their text in the ink of the app", () => {
    ["staff-screen-title", "notice-app-head"].forEach((name) => {
      const rule = rules.find((item) => item.selector.endsWith(`mobile-content-${name}`));
      expect(rule.body).toContain("var(--mc-app-ink)");
    });
    expect(rules.find((rule) => rule.selector.endsWith("mobile-content-staff-screen-box")).body).toContain("var(--mc-app-ink)");
  });
});
