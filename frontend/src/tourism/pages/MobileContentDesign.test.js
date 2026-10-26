// The design of the Mobile App Content page (Commit 5e): what is written on it, how the boxes are named and drawn, the preview as the banner of the app,
// the pillars as small boxes. It is LOOKS: no test here changes what a request is, and one test counts the requests to prove that none was added or lost.
// The CSS is not loaded by Jest, so the rules are read from the file and held to the values of the design. Every test with a fixture asserts, inside the
// test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import { BANNER_NAME_NOTE, NAME_NOTE } from "./MobileContentBlockEditor";
import { ICON_TONES, PILLAR_ICONS, PILLARS_DESIGN_NOTE, PILLARS_HEADING, TAG_DETAIL, TAG_NO_DETAIL } from "./MobileContentPillars";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

// ---- the words of the design (written here once, as the owner gave them) ----
const LEAD = "Everything a visitor reads inside the app. Change it here, and it reaches the app in its next version.";
const GREETING_HINT = "Ang {name} ay papalitan ng app ng pangalan ng bisita. Kung aalisin ninyo ito, pare-pareho ang makikita ng lahat.";
const WELCOME_NOTE = "Ito ang unang nakikita ng bisita pagbukas ng app. Panatilihing maikli — ang mahabang talata ay nagtutulak pababa sa mga mahalagang tile.";
const FEE = ["fee_regular", "fee_discounted", "fee_office"];

const BLOCKS = {
  blocks: [
    {
      key: "welcome", name: "Welcome banner", title: "Mabuhay, {name}!", subtitle: "Welcome to Mauban.", body: "", fields: ["title", "subtitle"],
      limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true } },
      allowed_placeholders: { title: [...FEE, "name"], subtitle: [...FEE, "name"] },
    },
    {
      key: "why_visit", name: "Why Visit", title: "Why Visit Mauban, Quezon?", subtitle: "The coast", body: "One\n\nTwo", fields: ["title", "subtitle", "body"],
      limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true }, body: { kind: "text", max: 600, required: true } },
      allowed_placeholders: { title: FEE, subtitle: FEE, body: FEE },
    },
  ],
  fee: { regular: 80, discounted: 64 },
  placeholders: { name: "The visitor's name." },
};
const PILLARS = [
  { id: 1, section: "why_visit", icon: "beach", title: "Cagbalete Island", short_text: "Pristine Sandbars", full_text: "Long text.", style: "tile", display_order: 10, is_active: true, tappable: true },
  { id: 2, section: "why_visit", icon: "craft", title: "Buntal Weaving", short_text: "Artisan Hats & Crafts", full_text: "", style: "tile", display_order: 20, is_active: true, tappable: false },
  { id: 3, section: "why_visit", icon: "waterfall", title: "Forest Cascades", short_text: "Dahican & Alitap Falls", full_text: "More text.", style: "tile", display_order: 30, is_active: true, tappable: true },
  { id: 4, section: "why_visit", icon: "not-an-icon-the-app-knows", title: "Quezon Flavors", short_text: "Habhab & Fresh Seafood", full_text: "", style: "tile", display_order: 40, is_active: true, tappable: false },
];

let requests;
function reply(body) {
  return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}
beforeEach(() => {
  requests = [];
  router.__setSearch("");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const route = url.replace(/^.*\/api/, "");
    requests.push(`${(options.method || "GET").toUpperCase()} ${route}`);
    if (route === "/mobile-content/blocks/") return reply(BLOCKS);
    if (route === "/mobile-content/items/?section=why_visit") return reply(PILLARS);
    return Promise.resolve({ ok: false, status: 404, text: async () => "{}", json: async () => ({}) });
  });
});
const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function openTab(key, ready) {
  router.__setSearch(`?tab=${key}`);
  const view = render(<MobileAppContent />);
  await screen.findByLabelText(ready);
  return view;
}

// ---- the CSS, read from the file ----
const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
function body(selector) {
  const start = CSS.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1); // the rule is in the file
  return CSS.slice(start, CSS.indexOf("\n}", start));
}
const variables = {};
body(".mobile-content-page")
  .split("\n")
  .forEach((line) => {
    const found = line.match(/^\s*(--mc-[a-z-]+):\s*(.+);$/);
    if (found) variables[found[1]] = found[2];
  });
// the value of a property of a rule, with the page's own variables (--mc-*) put in; a theme token stays as written
function decl(selector, property) {
  const found = body(selector).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
  expect(found).not.toBeNull();
  return found[1].replace(/var\((--mc-[a-z-]+)\)/g, (_, name) => variables[name]).toLowerCase();
}

describe("the header of the page", () => {
  it("has the eyebrow, the title and the explanation of the design, and no Cancel or Save changes", async () => {
    await openTab("welcome", "Greeting");
    const header = document.querySelector(".reports-header");
    expect(header).not.toBeNull(); // the fixture reached the case: the header is on the page
    expect(within(header).getByText("Mauban Tourism App").className).toContain("mobile-content-eyebrow");
    expect(within(header).getByRole("heading", { level: 1 }).textContent).toBe("Mobile App Content");
    expect(within(header).getByText(LEAD)).toBeTruthy();
    expect(header.textContent).not.toMatch(/without a new app version/i);
    expect(within(header).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /cancel|save changes/i })).toBeNull();
  });
  it("the tab bar carries the class of the design; the five tabs are the same", async () => {
    await openTab("welcome", "Greeting");
    const bar = screen.getByRole("tablist");
    expect(bar.className).toContain("mobile-content-tabs");
    expect(screen.getAllByRole("tab")).toHaveLength(5); // the fixture
  });
});

describe("the Welcome tab", () => {
  it("is a box with the eyebrow Pambungad and the title Welcome banner, with two boxes named Greeting and Paragraph and no third", async () => {
    await openTab("welcome", "Greeting");
    const form = screen.getByRole("form", { name: "Welcome banner" });
    expect(form.className).toContain("mobile-content-card");
    expect(within(form).getByText("Pambungad").className).toContain("mobile-content-eyebrow");
    expect(within(form).getByRole("heading", { level: 2 }).textContent).toBe("Welcome banner");
    const boxes = within(form).getAllByRole("textbox");
    expect(boxes.map((box) => box.labels[0].textContent)).toEqual(["Greeting", "Paragraph"]);
    expect(boxes).toHaveLength(2);
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.queryByLabelText("Subtitle")).toBeNull();
  });

  it("has the hint of the design under the Greeting, and the note under the box", async () => {
    await openTab("welcome", "Greeting");
    const greeting = screen.getByLabelText("Greeting").closest(".settings-field");
    expect(within(greeting).getByText(GREETING_HINT)).toBeTruthy();
    const note = screen.getByText(WELCOME_NOTE);
    expect(note.closest(".mobile-content-note")).not.toBeNull();
    expect(note.closest(".mobile-content-note").querySelector("svg")).not.toBeNull(); // the icon on its left
    expect(note.closest("form")).toBeNull(); // under the box, not in it
    expect(screen.getByRole("form", { name: "Welcome banner" }).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the Save inside the box, and the server's words for an error follow the new names", async () => {
    await openTab("welcome", "Greeting");
    const form = screen.getByRole("form", { name: "Welcome banner" });
    expect(within(form).getAllByRole("button", { name: /^Save$/ })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Greeting"), { target: { value: "   " } });
    expect(within(form).getByText("The greeting is required.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Paragraph"), { target: { value: "" } });
    expect(within(form).getByText("The paragraph is required.")).toBeTruthy();
  });

  it("shows the preview as the banner of the app: Live preview, How it will look in the app, a frame, the brown banner, the greeting and the paragraph", async () => {
    await openTab("welcome", "Greeting");
    const preview = screen.getByLabelText("What the app will show");
    expect(within(preview).getByText("Live preview").className).toContain("mobile-content-eyebrow");
    expect(within(preview).getByRole("heading", { level: 2 }).textContent).toBe("How it will look in the app");
    const banner = preview.querySelector(".mobile-content-phone > .mobile-content-banner");
    expect(banner).not.toBeNull();
    const greeting = within(banner).getByTestId("preview-title");
    const paragraph = within(banner).getByTestId("preview-subtitle");
    expect(greeting.className).toContain("mobile-content-banner-title");
    expect(paragraph.className).toContain("mobile-content-banner-subtitle");
    expect(greeting.querySelector("p").textContent).toBe("Mabuhay, Explorer!"); // {name} is the guest's name in the preview
    expect(paragraph.querySelector("p").textContent).toBe("Welcome to Mauban.");
    expect(within(banner).getAllByText(/^(Greeting|Paragraph)$/).every((label) => label.className === "mobile-content-sr")).toBe(true); // names for a screen reader only
    expect(within(preview).getByText(BANNER_NAME_NOTE)).toBeTruthy();
    expect(within(preview).queryByText(NAME_NOTE)).toBeNull(); // the old line is not in the preview (and the built-in column is gone)
  });

  it("has no pill that says Municipality of Mauban, anywhere", async () => {
    await openTab("welcome", "Greeting");
    expect(screen.getByTestId("preview-title")).toBeTruthy(); // the fixture reached the case: the preview is drawn
    expect(document.body.textContent).not.toMatch(/Municipality of Mauban/);
  });

  it("has no box of the app's built-in text; the right column is the live preview and nothing else", async () => {
    await openTab("welcome", "Greeting");
    expect(screen.getByTestId("preview-title")).toBeTruthy(); // the fixture: the preview is drawn
    expect(screen.queryByLabelText("What the app shows now (built-in text)")).toBeNull();
    expect(screen.queryByText(/What the app shows now/)).toBeNull();
    const side = document.querySelector(".mobile-content-side");
    expect(side.children).toHaveLength(1);
    expect(side.firstElementChild.getAttribute("aria-label")).toBe("What the app will show");
    expect(document.body.textContent).not.toContain(NAME_NOTE); // the line about Explorer was in that box; the preview has the line of the design
  });

  it("keeps the button, inside the box of the editor, as Ibalik ang orihinal na teksto, with its note", async () => {
    await openTab("welcome", "Greeting");
    const form = screen.getByRole("form", { name: "Welcome banner" });
    expect(within(form).getByRole("button", { name: "Ibalik ang orihinal na teksto" })).toBeTruthy();
    expect(within(form).getByText("This only fills the form. Press Save to keep it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use the app's built-in text" })).toBeNull();
  });
});

describe("the Why Visit tab", () => {
  it("is a box with the eyebrow Pambungad and the title of the page, and the boxes Title, Subtitle and Paragraph", async () => {
    await openTab("why-visit", "Paragraph");
    const form = screen.getByRole("form", { name: "Why Visit Mauban, Quezon?" });
    expect(within(form).getByText("Pambungad").className).toContain("mobile-content-eyebrow");
    expect(within(form).getByRole("heading", { level: 2 }).textContent).toBe("Why Visit Mauban, Quezon?");
    expect(within(form).getAllByRole("textbox").map((box) => box.labels[0].textContent)).toEqual(["Title", "Subtitle", "Paragraph"]);
    expect(screen.getByLabelText("Paragraph").rows).toBe(6);
  });

  it("has the pillars as small boxes: eyebrow, title, a grid, an icon, a tag and the two texts, and the note of the design", async () => {
    await openTab("why-visit", "Paragraph");
    const card = screen.getByLabelText(PILLARS_HEADING, { selector: "section" });
    await within(card).findByRole("list", { name: PILLARS_HEADING });
    expect(within(card).getByText("Apat na kahon sa ilalim").className).toContain("mobile-content-eyebrow");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("Pillars");
    const boxes = within(card).getAllByRole("listitem");
    expect(boxes).toHaveLength(4); // the fixture: four pillars
    expect(boxes.map((box) => box.querySelector('[data-part="tag"]').textContent)).toEqual([TAG_DETAIL, TAG_NO_DETAIL, TAG_DETAIL, TAG_NO_DETAIL]);
    expect(TAG_DETAIL).toBe("Has detail");
    expect(TAG_NO_DETAIL).toBe("No detail yet");
    const drawing = (box) => box.querySelector(".mobile-content-pillar-icon svg");
    const paths = (box) => [...drawing(box).querySelectorAll("path")].map((path) => path.getAttribute("d"));
    boxes.forEach((box) => {
      expect(box.querySelector(".mobile-content-pillar-icon").textContent).toBe(""); // a drawing, not a letter and not an emoji
      expect(drawing(box).getAttribute("width")).toBe("16");
      expect(drawing(box).getAttribute("height")).toBe("16");
      expect(drawing(box).getAttribute("fill")).toBe("none");
      expect(drawing(box).getAttribute("stroke")).toMatch(/^#[0-9A-F]{6}$/);
    });
    // the four pillars of the database: beach, craft, waterfall, food (the fourth is a name the page does not know, so it is drawn as the neutral info)
    expect(boxes.map((box) => box.querySelector(".mobile-content-pillar-icon").getAttribute("data-icon"))).toEqual(["beach", "craft", "waterfall", "not-an-icon-the-app-knows"]);
    expect(paths(boxes[0])).toEqual(PILLAR_ICONS.beach.paths);
    expect(drawing(boxes[0]).getAttribute("stroke")).toBe("#0A6AA3");
    expect(boxes[0].querySelector(".mobile-content-pillar-icon").style.background).toBe("rgb(220, 237, 248)"); // #DCEDF8
    expect(drawing(boxes[1]).getAttribute("stroke")).toBe("#B4690E");
    expect(drawing(boxes[2]).getAttribute("stroke")).toBe("#14784C");
    expect(paths(boxes[3])).toEqual(PILLAR_ICONS.info.paths); // not blank, not an emoji: the neutral drawing
    expect(paths(boxes[3]).length).toBeGreaterThan(0);
    expect(drawing(boxes[3]).getAttribute("stroke")).toBe(ICON_TONES.neutral.stroke);
    expect(boxes[0].querySelector('[data-part="title"]').textContent).toBe("Cagbalete Island");
    expect(boxes[0].querySelector('[data-part="text"]').textContent).toBe("Pristine Sandbars");
    expect(within(card).getByText(PILLARS_DESIGN_NOTE).closest(".mobile-content-note").querySelector("svg")).not.toBeNull();
    expect(PILLARS_DESIGN_NOTE).toBe("Ang nakikita sa apat na kahon ay buod lamang. Ang buong impormasyon ay lumalabas kapag pinindot — at ang kahong walang laman ay hindi napipindot.");
  });

  it("is still a list to read: nothing to type in, no Edit, no Add pillar, no Save in it", async () => {
    await openTab("why-visit", "Paragraph");
    const card = screen.getByLabelText(PILLARS_HEADING, { selector: "section" });
    await within(card).findByRole("list", { name: PILLARS_HEADING });
    expect(within(card).getAllByRole("listitem")).toHaveLength(4); // the fixture reached the case
    expect(card.querySelectorAll("form, input, textarea, select, button, a")).toHaveLength(0);
    expect(within(card).queryByText(/^(Edit|Add pillar|Save)/)).toBeNull();
  });

  it("the four pairs of colours are the design's (line / box), and the four pillars of the database take one each", () => {
    expect(ICON_TONES).toEqual({
      blue: { stroke: "#0A6AA3", background: "#DCEDF8" },
      amber: { stroke: "#B4690E", background: "#FBEBD4" },
      green: { stroke: "#14784C", background: "#DDF0E6" },
      red: { stroke: "#C32F2F", background: "#FBE0E0" },
      neutral: { stroke: "#65564A", background: "#F2E8DB" },
    });
    expect(["beach", "craft", "waterfall", "food"].map((name) => PILLAR_ICONS[name].tone)).toEqual(["blue", "amber", "green", "red"]); // the fixture: the four names
    expect(PILLAR_ICONS.info.tone).toBe("neutral");
  });

  it("every icon name the server knows has a picture and a colour here", () => {
    const models = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "backend", "api", "models.py"), "utf8");
    const listed = models.match(/ICON_NAMES = \[([^\]]+)\]/)[1].match(/"([a-z_]+)"/g).map((text) => text.replace(/"/g, ""));
    expect(listed.length).toBeGreaterThanOrEqual(11); // the fixture: the list in the model was found, with its names
    expect(listed).toContain("info");
    listed.forEach((name) => {
      expect(PILLAR_ICONS[name]).toBeTruthy();
      expect(PILLAR_ICONS[name].paths.length).toBeGreaterThan(0);
      PILLAR_ICONS[name].paths.forEach((d) => expect(d).toMatch(/^[MmLlHhVvCcSsAaZz0-9 .,-]+$/)); // a drawing, nothing else (no text, no emoji)
      expect(ICON_TONES[PILLAR_ICONS[name].tone]).toBeTruthy();
    });
    expect(Object.keys(PILLAR_ICONS).sort()).toEqual([...listed].sort()); // and nothing here that the server does not know
  });
});

describe("no request was added and none was lost", () => {
  it("the Welcome asks for the blocks, the Why Visit for the blocks and the pillars, once each, and nobody for the contacts", async () => {
    await openTab("welcome", "Greeting");
    fireEvent.click(screen.getByRole("tab", { name: /^Why Visit/ }));
    await screen.findByRole("list", { name: PILLARS_HEADING });
    await settled();
    expect([...requests].sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/blocks/", "GET /mobile-content/items/?section=why_visit"]);
    expect(requests.every((line) => line.startsWith("GET "))).toBe(true); // the fixture: reading only; nothing written
    expect(requests.some((line) => line.includes("emergency-contacts"))).toBe(false);
  });
});

describe("the CSS holds the values of the design", () => {
  it("the page: the gradient, the radius, the font (Public Sans, the font of the whole admin)", () => {
    expect(decl(".mobile-content-page", "background")).toBe("linear-gradient(165deg, #f8e9d8, #f0d7be)");
    expect(variables["--mc-font"]).toMatch(/^"Public Sans", /);
    expect(decl(".mobile-content-page", "font-family")).toMatch(/^"public sans", /);
  });

  it("no font is added for this page (a decision of the owner): the admin loads Public Sans, and Plus Jakarta Sans is neither linked nor named", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "..", "..", "public", "index.html"), "utf8");
    expect(CSS).toMatch(/fonts\.googleapis\.com\/css2\?family=Public\+Sans/); // the fixture: the font the admin has is found
    expect(html).not.toMatch(/Plus[+ ]Jakarta/i);
    expect(CSS.match(/@import[^;]*;/g).join("")).not.toMatch(/Plus[+ ]Jakarta/i);
    expect(CSS).not.toMatch(/Plus[+ ]Jakarta/i); // not even in the font stack, where it would only confuse
  });

  it("the box (card): colour, border, radius, shadow", () => {
    const card = ".mobile-content-page .mobile-content-card";
    expect(decl(card, "background")).toBe("#fffdfb");
    expect(decl(card, "border")).toBe("1px solid #efe1d1");
    expect(decl(card, "border-radius")).toBe("16px");
    expect(decl(card, "box-shadow")).toBe("0 1px 2px rgba(90, 60, 35, 0.05)");
  });

  it("the eyebrow", () => {
    const eyebrow = ".mobile-content-page .mobile-content-eyebrow";
    expect(decl(eyebrow, "font-size")).toBe("11px");
    expect(decl(eyebrow, "text-transform")).toBe("uppercase");
    expect(decl(eyebrow, "letter-spacing")).toBe("0.1em");
    expect(decl(eyebrow, "font-weight")).toBe("700");
    expect(decl(eyebrow, "color")).toBe("#2e7d74");
  });

  it("the tab bar and the tabs", () => {
    const bar = ".mobile-content-page .mobile-content-tabs";
    expect(decl(bar, "background")).toBe("var(--th-surface)"); // white: the theme token that says white
    expect(decl(bar, "border-radius")).toBe("13px");
    expect(decl(bar, "padding")).toBe("5px");
    expect(decl(bar, "width")).toBe("fit-content");
    const tab = `${bar} button`;
    expect(decl(tab, "font-size")).toBe("13.5px");
    expect(decl(tab, "font-weight")).toBe("500");
    expect(decl(tab, "padding")).toBe("10px 16px");
    expect(decl(tab, "border-radius")).toBe("9px");
    expect(decl(tab, "color")).toBe("#65564a");
    expect(decl(`${tab}.active`, "background")).toBe("#2e7d74");
    expect(decl(`${tab}.active`, "color")).toBe("#ffffff");
    expect(decl(`${tab}.active`, "font-weight")).toBe("700");
  });

  it("the label, the box to type in, the hint", () => {
    const label = ".mobile-content-page .mobile-content-card .settings-field > label span";
    expect(decl(label, "font-size")).toBe("11px");
    expect(decl(label, "text-transform")).toBe("uppercase");
    expect(decl(label, "letter-spacing")).toBe("0.09em");
    expect(decl(label, "font-weight")).toBe("700");
    expect(decl(label, "color")).toBe("#8a6e55");
    expect(decl(label, "margin-bottom")).toBe("7px");
    const input = ".mobile-content-page .mobile-content-card .settings-field-wide textarea";
    expect(decl(input, "border-radius")).toBe("10px");
    expect(decl(input, "border")).toBe("1px solid #e0cdb7");
    expect(decl(input, "min-height")).toBe("42px");
    expect(decl(input, "padding")).toBe("10px 13px");
    expect(decl(input, "font-size")).toBe("14px");
    expect(decl(`${input}:focus`, "outline")).toBe("2px solid #2e7d74");
    const hint = ".mobile-content-page .mobile-content-card .options-hint";
    expect(decl(hint, "font-size")).toBe("12.5px");
    expect(decl(hint, "color")).toBe("#8a7664");
    expect(decl(hint, "line-height")).toBe("1.55");
  });

  it("the note and the main button", () => {
    const note = ".mobile-content-page .mobile-content-note,\n.mobile-content-page .mobile-content-notices";
    expect(CSS).toContain(`\n${note} {`);
    const rule = `.mobile-content-page .mobile-content-note,\n.mobile-content-page .mobile-content-notices`;
    expect(decl(rule, "background")).toBe("#fbf1e4");
    expect(decl(rule, "border-radius")).toBe("11px");
    expect(decl(rule, "padding")).toBe("13px 15px");
    const text = ".mobile-content-page .mobile-content-note p,\n.mobile-content-page .mobile-content-notices p";
    expect(decl(text, "font-size")).toBe("13.5px");
    expect(decl(text, "color")).toBe("#6b543e");
    const button = ".mobile-content-page .mobile-content-card .tourist-record-save";
    expect(decl(button, "background")).toBe("#8a5a33");
    expect(decl(button, "color")).toBe("#ffffff");
    expect(decl(button, "border-radius")).toBe("9px");
    expect(decl(button, "min-height")).toBe("38px");
  });

  it("the heading of the page", () => {
    const h1 = ".mobile-content-page .reports-header h1";
    expect(decl(h1, "font-size")).toBe("32px");
    expect(decl(h1, "font-weight")).toBe("800");
    expect(decl(h1, "letter-spacing")).toBe("-0.02em");
  });

  it("the live preview: the frame, the banner, the greeting and the paragraph", () => {
    expect(decl(".mobile-content-phone", "background")).toBe("#f7fafb");
    expect(decl(".mobile-content-phone", "border")).toBe("1px solid #e6eef1");
    expect(decl(".mobile-content-phone", "border-radius")).toBe("16px");
    expect(decl(".mobile-content-phone", "padding")).toBe("14px 13px");
    expect(decl(".mobile-content-banner", "background")).toBe("#6b3410");
    expect(decl(".mobile-content-banner", "border-radius")).toBe("15px");
    expect(decl(".mobile-content-banner", "padding")).toBe("17px 16px");
    const greeting = ".mobile-content-banner .mobile-content-banner-title p";
    expect(decl(greeting, "font-size")).toBe("18px");
    expect(decl(greeting, "font-weight")).toBe("800");
    expect(decl(greeting, "color")).toBe("#ffffff");
    expect(decl(greeting, "margin")).toBe("12px 0 8px");
    const paragraph = ".mobile-content-banner .mobile-content-banner-subtitle p";
    expect(decl(paragraph, "font-size")).toBe("12px");
    expect(decl(paragraph, "line-height")).toBe("1.65");
    expect(decl(paragraph, "color")).toBe("#f3d8be");
  });

  it("the pillars: the grid, the box, the icon and the two tags", () => {
    expect(decl(".mobile-content-pillars", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(248px, 100%), 1fr))");
    expect(decl(".mobile-content-pillars", "gap")).toBe("12px");
    expect(decl(".mobile-content-pillar", "border")).toBe("1px solid #efe1d1");
    expect(decl(".mobile-content-pillar", "border-radius")).toBe("13px");
    expect(decl(".mobile-content-pillar", "padding")).toBe("14px 15px");
    expect(decl(".mobile-content-pillar", "background")).toBe("var(--th-surface)");
    expect(decl(".mobile-content-pillar-icon", "width")).toBe("30px");
    expect(decl(".mobile-content-pillar-icon", "height")).toBe("30px");
    expect(decl(".mobile-content-pillar-icon", "border-radius")).toBe("8px");
    expect(decl(".mobile-content-tag", "background")).toBe("#f2e8db");
    expect(decl(".mobile-content-tag", "color")).toBe("#7a6450");
    expect(decl(".mobile-content-tag", "font-size")).toBe("11.5px");
    expect(decl(".mobile-content-tag", "font-weight")).toBe("700");
    expect(decl(".mobile-content-tag", "border-radius")).toBe("7px");
    expect(decl('.mobile-content-tag[data-detail="yes"]', "background")).toBe("#dcf0e4");
    expect(decl('.mobile-content-tag[data-detail="yes"]', "color")).toBe("#176b3b");
  });

  it("a filled part still has a tint, and on the banner a tint that can be seen on brown", () => {
    expect(decl(".mobile-content-filled", "background")).toBe("var(--th-primary-tint-strong)");
    expect(decl(".mobile-content-banner .mobile-content-filled", "background")).toBe("rgba(255, 255, 255, 0.2)");
    expect(body(".mobile-content-filled")).not.toMatch(/underline|text-decoration/);
  });

  it("nothing outside the page is restyled: every rule of the design starts with the page or with a class of its own", () => {
    const start = CSS.indexOf("MOBILE APP CONTENT: THE DESIGN (Commit 5e)");
    expect(start).toBeGreaterThan(-1);
    const rules = CSS.slice(start).split("\n").filter((line) => /^[.\[a-z].*[,{]$/.test(line) && !line.startsWith(" "));
    expect(rules.length).toBeGreaterThan(30); // the fixture: the rules of the design were found
    rules.forEach((line) => expect(line).toMatch(/^\.mobile-content-/));
  });
});
