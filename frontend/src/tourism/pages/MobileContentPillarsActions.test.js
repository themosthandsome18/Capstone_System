// The doors to the page of a tile, in the list of pillars of the Why Visit (Commit 6d): an "Edit" on every box and a "+ Add pillar" in the header. They
// are links (<a href>) with a route, so a new tab and the Back of the browser work; they ask the server for nothing. A full section (the 40) is said, not
// refused afterwards. Every test with a fixture asserts, inside the test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import { ADD_LABEL, PILLARS_FULL, PILLARS_HEADING, PILLARS_NOTICE } from "./MobileContentPillars";
import { MAX_ITEMS_PER_SECTION } from "../utils/mobileContentTileRules";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const BLOCKS = {
  blocks: [
    {
      key: "why_visit", name: "Why Visit", title: "Why Visit Mauban, Quezon?", subtitle: "The coast", body: "One", fields: ["title", "subtitle", "body"],
      limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true }, body: { kind: "text", max: 600, required: true } },
      allowed_placeholders: { title: [], subtitle: [], body: [] },
    },
  ],
  fee: { regular: 80, discounted: 64 },
  placeholders: {},
};
const item = (id, title, extra = {}) => ({
  id, section: "why_visit", icon: "beach", title, short_text: `${title} line`, full_text: "", style: "tile", display_order: id * 10, is_active: true, tappable: false, ...extra,
});
const FOUR = () => [item(11, "Cagbalete Island"), item(12, "Buntal Weaving", { icon: "craft", full_text: "Text", tappable: true }), item(13, "Forest Cascades", { icon: "waterfall", is_active: false }), item(14, "Quezon Flavors", { icon: "food" })];

let items;
let requests;
const reply = (body) => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
beforeEach(() => {
  requests = [];
  items = FOUR();
  router.__setSearch("?tab=why-visit");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const route = url.replace(/^.*\/api/, "");
    requests.push(`${(options.method || "GET").toUpperCase()} ${route}`);
    if (route === "/mobile-content/blocks/") return reply(BLOCKS);
    if (route === "/mobile-content/items/?section=why_visit") return reply(items);
    return Promise.resolve({ ok: false, status: 404, text: async () => "{}", json: async () => ({}) });
  });
});
const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function open() {
  const view = render(<MobileAppContent />);
  await screen.findByRole("list", { name: PILLARS_HEADING });
  await settled();
  return view;
}
const card = () => screen.getByLabelText(PILLARS_HEADING, { selector: "section" });
const rowOf = (title) => within(card()).getAllByRole("listitem").find((row) => row.querySelector('[data-part="title"]').textContent === title);

describe("Edit on every box", () => {
  it("is a link to the page of THAT tile, by its own id, in every box (the one that is switched off too)", async () => {
    await open();
    expect(items.map((box) => box.id)).toEqual([11, 12, 13, 14]); // the fixture: four boxes with four different ids
    const expected = { "Cagbalete Island": 11, "Buntal Weaving": 12, "Forest Cascades": 13, "Quezon Flavors": 14 };
    for (const [title, id] of Object.entries(expected)) {
      const link = within(rowOf(title)).getByRole("link", { name: `Edit ${title}` });
      expect(link.getAttribute("href")).toBe(`/mobile-content/tile?id=${id}`);
      expect(link.textContent).toBe("Edit");
      expect(link.className).toBe("mobile-content-pillar-edit");
    }
    expect(within(card()).getAllByRole("link", { name: /^Edit / })).toHaveLength(4);
  });

  it("is on the right of the box, after the icon and the text (and the tag)", async () => {
    await open();
    const row = rowOf("Cagbalete Island");
    expect([...row.children].map((child) => child.className)).toEqual(["mobile-content-pillar-icon", "mobile-content-pillar-body", "mobile-content-pillar-edit"]);
    expect(row.querySelector(".mobile-content-pillar-body .mobile-content-tag")).not.toBeNull(); // the tag is in the body, before the link
  });

  it("goes to the page with a step of the router (a click is a link, not a request)", async () => {
    await open();
    fireEvent.click(within(rowOf("Buntal Weaving")).getByRole("link", { name: "Edit Buntal Weaving" }));
    expect(router.__clicks()).toEqual([{ to: "/mobile-content/tile?id=12", replace: false }]); // a step forward: the Back of the browser comes back to the tab
    await settled();
    expect(requests.every((line) => line.startsWith("GET "))).toBe(true);
  });

  it("is a real address: it can be copied and opened in a new tab (an <a> with an href)", async () => {
    await open();
    for (const link of within(card()).getAllByRole("link", { name: /^Edit / })) {
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toMatch(/^\/mobile-content\/tile\?id=\d+$/);
      expect(link.getAttribute("target")).toBeNull();
      expect(link.getAttribute("onclick")).toBeNull();
    }
  });
});

describe("+ Add pillar", () => {
  it("is in the header of the box, on the right of the heading, and goes to a new tile of the Why Visit", async () => {
    await open();
    const link = within(card()).getByRole("link", { name: ADD_LABEL });
    expect(ADD_LABEL).toBe("+ Add pillar");
    expect(link.getAttribute("href")).toBe("/mobile-content/tile?section=why_visit");
    expect(link.className).toBe("mobile-content-add");
    const head = card().querySelector(".mobile-content-pillars-head");
    expect(head.contains(link)).toBe(true);
    expect(head.firstElementChild.querySelector("h2").textContent).toBe("Pillars"); // the heading first, the link after it
    expect(head.lastElementChild).toBe(link);
    fireEvent.click(link);
    expect(router.__clicks().at(-1)).toEqual({ to: "/mobile-content/tile?section=why_visit", replace: false });
  });

  it("is a link while there is room: with 39 tiles (the 40th can still be added)", async () => {
    items = Array.from({ length: MAX_ITEMS_PER_SECTION - 1 }, (_, index) => item(100 + index, `Tile ${index}`));
    await open();
    expect(items).toHaveLength(39); // the fixture: one less than the most
    expect(within(card()).getByRole("link", { name: ADD_LABEL })).toBeTruthy();
    expect(screen.queryByTestId("pillars-full")).toBeNull();
  });

  it("with the most a section can hold (40) it is a closed button, and the box says why, in words", async () => {
    items = Array.from({ length: MAX_ITEMS_PER_SECTION }, (_, index) => item(100 + index, `Tile ${index}`));
    await open();
    expect(items).toHaveLength(40); // the fixture
    expect(within(card()).queryByRole("link", { name: ADD_LABEL })).toBeNull();
    const button = within(card()).getByRole("button", { name: ADD_LABEL });
    expect(button.disabled).toBe(true);
    const why = screen.getByTestId("pillars-full");
    expect(why.textContent).toBe(PILLARS_FULL);
    expect(PILLARS_FULL).toMatch(/40 tiles/);
    expect(PILLARS_FULL).toMatch(/deactivated are counted/);
    expect(button.getAttribute("aria-describedby")).toBe(why.id);
    fireEvent.click(button);
    expect(router.__clicks()).toEqual([]);
  });

  it("counts the tiles that are switched off: 38 on and 2 off is 40", async () => {
    items = [...Array.from({ length: 38 }, (_, index) => item(100 + index, `Tile ${index}`)), item(200, "Off 1", { is_active: false }), item(201, "Off 2", { is_active: false })];
    await open();
    expect(items.filter((box) => !box.is_active)).toHaveLength(2); // the fixture
    expect(within(card()).getByRole("button", { name: ADD_LABEL }).disabled).toBe(true);
    expect(screen.getByTestId("pillars-full")).toBeTruthy();
    // and every Edit is still there: the tiles that fill the list can be edited
    expect(within(card()).getAllByRole("link", { name: /^Edit / })).toHaveLength(40);
  });

  it("is there while the list is not known yet, and when it cannot be read (the server decides)", async () => {
    global.fetch = jest.fn((url) => {
      const route = url.replace(/^.*\/api/, "");
      if (route === "/mobile-content/blocks/") return reply(BLOCKS);
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    render(<MobileAppContent />);
    await screen.findByRole("button", { name: "Try again" });
    expect(within(card()).getByRole("link", { name: ADD_LABEL })).toBeTruthy();
    expect(within(card()).queryAllByRole("link", { name: /^Edit / })).toHaveLength(0); // nothing to edit when nothing was read
  });
});

describe("the hint", () => {
  it("is the one of the design, and nothing says that it cannot be edited", async () => {
    await open();
    expect(within(card()).getByRole("note").textContent).toBe("Ang Edit ang kinalalagyan ng buong impormasyong lumalabas kapag pinindot.");
    expect(PILLARS_NOTICE).toBe("Ang Edit ang kinalalagyan ng buong impormasyong lumalabas kapag pinindot.");
    expect(document.body.textContent).not.toMatch(/cannot be edited|coming in an upcoming update|hindi pa nae-edit/i);
  });
});

describe("no request is added", () => {
  it("the list asks for the same two things as before (the blocks and the pillars, once each), however many buttons it has", async () => {
    await open();
    expect(within(card()).getAllByRole("link")).toHaveLength(5); // the fixture: four Edit and one Add
    expect([...requests].sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/items/?section=why_visit"]);
    for (const link of within(card()).getAllByRole("link")) fireEvent.click(link);
    await settled();
    expect(requests).toHaveLength(2); // five clicks, no request
    expect(requests.some((line) => line.includes("emergency-contacts"))).toBe(false);
  });

  it("the list is still read-only: no form, no field, no Save, no Delete", async () => {
    await open();
    expect(card().querySelectorAll("form, input, textarea, select, [contenteditable]")).toHaveLength(0);
    expect(within(card()).queryByText(/^(Save|Delete|Remove|Switch off)/)).toBeNull();
    expect(within(card()).queryByRole("button", { name: /save|delete|remove/i })).toBeNull();
  });
});

describe("one word for the switch (7b)", () => {
  it("the list of pillars says Deactivated for a pillar that is off, and nothing says switched off", async () => {
    await open();
    expect(items.some((box) => !box.is_active)).toBe(true); // the fixture: one pillar is off
    expect(within(rowOf("Forest Cascades")).getByText("Deactivated: the app does not show it")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/switch(ed|ing)? off|bring (it )?back|brought back|Bring back/i);
  });
});

describe("the CSS of the doors", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const part = CSS.slice(CSS.indexOf("the doors to the page of a tile, and switching a tile off (Commit 6d)"));
  const decl = (selector, property) => {
    const start = part.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const found = part.slice(start, part.indexOf("\n}", start)).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
    expect(found).not.toBeNull();
    return found[1].toLowerCase();
  };

  it("the small Edit button has the values of the design", () => {
    const edit = ".mobile-content-pillar-edit";
    expect(decl(edit, "min-height")).toBe("32px");
    expect(decl(edit, "padding")).toBe("0 12px");
    expect(decl(edit, "font-size")).toBe("12px");
    expect(decl(edit, "border-radius")).toBe("9px");
    expect(decl(edit, "background")).toBe("var(--th-surface)");
    expect(decl(edit, "border")).toBe("1px solid #e0cdb7");
    expect(decl(edit, "color")).toBe("#453931");
  });

  it("the Add pillar button is the size of the other main buttons", () => {
    const add = ".mobile-content-page .mobile-content-add";
    expect(decl(add, "min-height")).toBe("38px");
    expect(decl(add, "background")).toBe("var(--th-primary-deep)");
    expect(decl(add, "color")).toBe("#ffffff");
    expect(decl(add, "border-radius")).toBe("9px");
    expect(decl(".mobile-content-page .mobile-content-pillars-head", "justify-content")).toBe("space-between");
  });

  it("every rule of the doors starts with a class of its own", () => {
    const selectors = part.split("\n").filter((line) => /^[.\[a-z].*[,{]$/.test(line) && !line.startsWith(" "));
    expect(selectors.length).toBeGreaterThan(8); // the fixture
    selectors.forEach((line) => expect(line).toMatch(/^\.mobile-content-/));
  });
});
