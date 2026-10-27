// The Why Visit tab and the three small repairs of the editor (Commit 5d).
//   1. the editor of the block why_visit: title, subtitle (one line each) and the text (six rows, Enter works), with the placeholders the SERVER allows
//   2. the four pillars: a list to read, one GET, nothing that writes
//   3. the placeholder buttons are not inside the <label>
//   4. Enter in the title and in the subtitle is the same as pressing Save (when Save is open), and never starts a new line
//   5. what was filled in has a soft tint, not an underline that looks like a link
// The REAL tourismApi builds the requests; a fake server answers. Every test with a fixture asserts, inside the test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import MobileContentBlockEditor, { SAVED_NOTICE } from "./MobileContentBlockEditor";
import MobileContentPillars, { PILLARS_EMPTY, PILLARS_HEADING, PILLARS_NOTICE, SWITCHED_OFF } from "./MobileContentPillars";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const FEE = ["fee_regular", "fee_discounted", "fee_office"];
const LIMITS = {
  welcome: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true } },
  why_visit: {
    title: { kind: "line", max: 160, required: true },
    subtitle: { kind: "line", max: 300, required: true },
    body: { kind: "text", max: 600, required: true },
  },
};
// what the server says each field may hold: the Welcome may name the visitor, the Why Visit may not (backend/api/views/mobile_content.py)
const ALLOWED = {
  welcome: { title: [...FEE, "name"], subtitle: [...FEE, "name"] },
  why_visit: { title: FEE, subtitle: FEE, body: FEE },
};
const PILLARS = [
  { id: 11, section: "why_visit", icon: "beach", title: "Cagbalete Island", short_text: "Pristine Sandbars", full_text: "", style: "tile", display_order: 10, is_active: true, tappable: false },
  { id: 12, section: "why_visit", icon: "craft", title: "Buntal Weaving", short_text: "Artisan Hats & Crafts", full_text: "", style: "tile", display_order: 20, is_active: true, tappable: false },
  { id: 13, section: "why_visit", icon: "waterfall", title: "Forest Cascades", short_text: "Dahican & Alitap Falls", full_text: "", style: "tile", display_order: 30, is_active: false, tappable: false },
  { id: 14, section: "why_visit", icon: "food", title: "Quezon Flavors", short_text: "Habhab & Fresh Seafood", full_text: "", style: "tile", display_order: 40, is_active: true, tappable: false },
];

let state;
let requests;

function reply(status, body) {
  return Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}
const block = (key) => ({
  key,
  name: key,
  ...state.blocks[key],
  fields: Object.keys(LIMITS[key]),
  limits: LIMITS[key],
  allowed_placeholders: state.allowed[key],
});
const oneLine = (text) => text.split(/\s+/).filter(Boolean).join(" ");

beforeEach(() => {
  requests = [];
  state = {
    blocks: {
      welcome: { title: "Mabuhay, {name}!", subtitle: "Welcome.", body: "" },
      why_visit: { title: "Why Visit Mauban?", subtitle: "The coast", body: "One\n\nTwo" },
    },
    allowed: JSON.parse(JSON.stringify(ALLOWED)),
    items: PILLARS,
    itemsFail: null,
    confirmNeeded: null,
  };
  router.__setSearch("");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const route = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path: route, body });
    if (method === "GET" && route === "/mobile-content/blocks/") {
      return reply(200, { blocks: Object.keys(state.blocks).map(block), fee: { regular: 80, discounted: 64 }, placeholders: { name: "The visitor's name." } });
    }
    if (method === "GET" && route === "/mobile-content/items/?section=why_visit") {
      return state.itemsFail ? reply(state.itemsFail, { detail: "The pillars are not available." }) : reply(200, state.items);
    }
    const patch = route.match(/^\/mobile-content\/blocks\/([a-z_]+)\/$/);
    if (method === "PATCH" && patch) {
      if (state.confirmNeeded && !body.confirm_dropped) {
        return reply(409, { detail: "This change needs a confirmation.", code: "confirm_required", dropped: state.confirmNeeded });
      }
      Object.entries(body).forEach(([field, value]) => {
        if (field !== "confirm_dropped") state.blocks[patch[1]][field] = LIMITS[patch[1]][field].kind === "text" ? value.trim() : oneLine(value);
      });
      return reply(200, { ...block(patch[1]), warnings: [] });
    }
    return reply(404, { detail: "no such route" });
  });
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function open(key = "why_visit", props = {}) {
  const view = render(<MobileContentBlockEditor blockKey={key} heading={key === "why_visit" ? "Why Visit page" : "Welcome banner"} {...props} />);
  await screen.findByLabelText("Title");
  return view;
}
const field = (name) => screen.getByLabelText(name);
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const save = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const writes = () => requests.filter((r) => r.method !== "GET");
const group = (name) => screen.getByRole("group", { name: `Placeholders for the ${name}` });
const buttonsOf = (name) => within(group(name)).getAllByRole("button").map((button) => button.textContent);

describe("the placeholders of the Why Visit are the ones the server lists", () => {
  it("there is no {name} button in the title, the subtitle or the text of the Why Visit", async () => {
    expect(ALLOWED.why_visit.title).not.toContain("name"); // the fixture: the server's list for the Why Visit has no name, in any of its fields
    expect(Object.values(state.allowed.why_visit).some((names) => names.includes("name"))).toBe(false);
    await open("why_visit");
    for (const name of ["title", "subtitle", "text"]) {
      expect(buttonsOf(name)).toEqual(["{fee_regular}", "{fee_discounted}", "{fee_office}"]);
      expect(within(group(name)).queryByRole("button", { name: /\{name\}/ })).toBeNull();
    }
    expect(screen.queryByText("{name}")).toBeNull();
  });

  it("there is a {name} button in the title and the subtitle of the Welcome", async () => {
    expect(ALLOWED.welcome.title).toContain("name"); // the fixture
    expect(ALLOWED.welcome.subtitle).toContain("name");
    await open("welcome");
    expect(buttonsOf("title")).toEqual(["{fee_regular}", "{fee_discounted}", "{fee_office}", "{name}"]);
    expect(buttonsOf("subtitle")).toContain("{name}");
  });

  it("is not a list written into the page: when the server says otherwise, the buttons follow", async () => {
    state.allowed.why_visit.title = [...FEE, "name"]; // the fixture: the server now allows {name} in the title of the Why Visit...
    state.allowed.welcome.title = FEE; // ...and no longer in the title of the Welcome
    expect(state.allowed.why_visit.title).toContain("name");
    expect(state.allowed.welcome.title).not.toContain("name");
    const view = await open("why_visit");
    expect(buttonsOf("title")).toContain("{name}");
    expect(buttonsOf("subtitle")).not.toContain("{name}"); // only the field the server named
    view.unmount();
    await open("welcome");
    expect(buttonsOf("title")).not.toContain("{name}");
    expect(buttonsOf("subtitle")).toContain("{name}");
  });

  it("a {name} typed by hand in the Why Visit is not on the list: the page warns, and Save still goes to the server (which decides)", async () => {
    await open("why_visit");
    type("Title", "Hello {name}");
    expect(screen.getByTestId("warning-title").textContent).toMatch(/\{name\} is not one of the placeholders listed above/);
    expect(save().disabled).toBe(false); // a warning, not a refusal
  });
});

describe("the text of the Why Visit has six rows and Enter works in it", () => {
  it("is a textarea of six rows; Enter is NOT cancelled there, and the new lines are sent as they were typed", async () => {
    await open("why_visit");
    expect(state.blocks.why_visit.body).toContain("\n"); // the fixture: the stored text already has paragraphs
    const box = field("Text");
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.rows).toBe(6);
    expect(box.className).not.toContain("mobile-content-line");
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true); // true: nobody cancelled it
    type("Text", "First\n\nSecond\nThird");
    expect(field("Text").value).toBe("First\n\nSecond\nThird"); // the new lines stay in the box
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ body: "First\n\nSecond\nThird" }]);
  });

  it("Enter in the text saves nothing by itself", async () => {
    await open("why_visit");
    type("Text", "Changed");
    expect(save().disabled).toBe(false); // the fixture: Save is open, so an Enter that saved would show
    fireEvent.keyDown(field("Text"), { key: "Enter" });
    await settled();
    expect(writes()).toEqual([]);
  });

  it("the title and the subtitle of the Why Visit stay one row, and Enter in them does not start a new line", async () => {
    await open("why_visit");
    for (const name of ["Title", "Subtitle"]) {
      expect(field(name).rows).toBe(1);
      expect(fireEvent.keyDown(field(name), { key: "Enter" })).toBe(false); // false: it was cancelled, so no new line
      expect(field(name).value).not.toContain("\n");
    }
  });
});

describe("the placeholder buttons are not inside the label", () => {
  it("the label holds the name of the box and nothing else; each box is named through it", async () => {
    await open("welcome");
    expect(document.querySelectorAll(".mobile-content-insert button").length).toBeGreaterThan(0); // the fixture: there are buttons on the page
    document.querySelectorAll("label").forEach((label) => {
      expect(label.querySelector("button")).toBeNull();
      expect(label.querySelector("textarea")).toBeNull();
    });
    for (const name of ["Title", "Subtitle"]) {
      const box = screen.getByRole("textbox", { name });
      const label = document.querySelector(`label[for="${box.id}"]`);
      expect(box.id).not.toBe("");
      expect(label.textContent).toBe(name); // no button text in it
    }
    for (const button of document.querySelectorAll(".mobile-content-insert button")) expect(button.closest("label")).toBeNull();
  });

  it("two editors on one page do not share an id", async () => {
    render(
      <>
        <MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" />
        <MobileContentBlockEditor blockKey="why_visit" heading="Why Visit page" />
      </>
    );
    await waitFor(() => expect(screen.getAllByLabelText("Title")).toHaveLength(2));
    const ids = [...document.querySelectorAll("textarea")].map((box) => box.id);
    expect(ids.length).toBeGreaterThan(2); // the fixture: five boxes
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pressing a button still puts the placeholder into the right box", async () => {
    await open("why_visit");
    type("Subtitle", "Only ");
    fireEvent.click(within(group("subtitle")).getByRole("button", { name: /fee_regular/ }));
    expect(field("Subtitle").value).toBe("Only {fee_regular}");
    expect(field("Title").value).toBe(state.blocks.why_visit.title); // the other box did not move
  });
});

describe("Enter in the title and the subtitle is the same as Save", () => {
  it("sends ONE PATCH with what changed, and adds no new line", async () => {
    await open("why_visit");
    type("Title", "A new title");
    expect(save().disabled).toBe(false); // the fixture: Save is open
    expect(fireEvent.keyDown(field("Title"), { key: "Enter" })).toBe(false);
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toEqual({ method: "PATCH", path: "/mobile-content/blocks/why_visit/", body: { title: "A new title" } });
    expect(field("Title").value).toBe("A new title");
    expect(field("Title").value).not.toContain("\n");
  });

  it("works in the subtitle too", async () => {
    await open("welcome");
    type("Subtitle", "Another welcome.");
    fireEvent.keyDown(field("Subtitle"), { key: "Enter" });
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ subtitle: "Another welcome." }]);
  });

  it("sends nothing when Save is closed because nothing changed", async () => {
    await open("why_visit");
    expect(save().disabled).toBe(true); // the fixture: Save is closed
    expect(fireEvent.keyDown(field("Title"), { key: "Enter" })).toBe(false); // still no new line
    await settled();
    expect(writes()).toEqual([]);
  });

  it("sends nothing when Save is closed because a text is too long", async () => {
    await open("why_visit");
    type("Title", "x".repeat(161));
    expect(save().disabled).toBe(true); // the fixture: closed, because 161 > 160
    expect(screen.getByText(/Too long by 1 letter/)).toBeTruthy();
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    await settled();
    expect(writes()).toEqual([]);
  });

  it("sends nothing when Save is closed because a required text was emptied", async () => {
    await open("why_visit");
    type("Subtitle", "   ");
    expect(save().disabled).toBe(true); // the fixture: closed, because the subtitle is required
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    await settled();
    expect(writes()).toEqual([]);
  });

  it("sends nothing while a letter is still being composed (that Enter belongs to the keyboard)", async () => {
    await open("why_visit");
    type("Title", "Composing");
    expect(save().disabled).toBe(false); // the fixture
    expect(fireEvent.keyDown(field("Title"), { key: "Enter", isComposing: true })).toBe(true); // not cancelled, not used
    await settled();
    expect(writes()).toEqual([]);
  });

  it("other keys do nothing", async () => {
    await open("why_visit");
    type("Title", "Typing");
    expect(save().disabled).toBe(false); // the fixture
    for (const key of ["a", "Tab", " ", "Escape"]) expect(fireEvent.keyDown(field("Title"), { key })).toBe(true);
    await settled();
    expect(writes()).toEqual([]);
  });

  it("does not go round the question of the server: while it asks for a confirmation, Enter sends nothing", async () => {
    state.confirmNeeded = ["fee_office"];
    await open("why_visit");
    type("Title", "Asked");
    fireEvent.click(save());
    await screen.findByRole("alertdialog", { name: "Confirm the change" });
    expect(writes()).toHaveLength(1); // the fixture: the first PATCH was refused with 409, and the question is on the screen
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    await settled();
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole("alertdialog", { name: "Confirm the change" })).toBeTruthy();
  });

  it("a submit of the form with Save closed sends nothing (nothing changed), and none while the server's question is on the screen", async () => {
    state.confirmNeeded = ["fee_office"];
    await open("why_visit");
    const form = screen.getByRole("form", { name: "Why Visit page" });
    expect(save().disabled).toBe(true); // the fixture: Save is closed
    fireEvent.submit(form);
    await settled();
    expect(writes()).toEqual([]);
    type("Title", "Asked");
    fireEvent.click(save());
    await screen.findByRole("alertdialog", { name: "Confirm the change" });
    expect(writes()).toHaveLength(1); // the fixture: the question is on the screen, and what was typed is still a change
    fireEvent.submit(form);
    await settled();
    expect(writes()).toHaveLength(1);
  });

  it("the Save button and Enter send the same request", async () => {
    await open("why_visit");
    type("Title", "Same");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    const byButton = writes()[0];
    type("Title", "Same again");
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1].method).toBe(byButton.method);
    expect(writes()[1].path).toBe(byButton.path);
    expect(Object.keys(writes()[1].body)).toEqual(Object.keys(byButton.body));
  });
});

describe("what was filled in has a tint, not an underline that looks like a link", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8");
  const rule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("the style of a filled part has a background and no underline of any kind", () => {
    const filled = rule(".mobile-content-filled");
    expect(filled).toMatch(/background:\s*var\(--th-primary-tint-strong\)/);
    expect(filled).not.toMatch(/underline|text-decoration|border-bottom/);
    expect(rule(".mobile-content-missing")).toMatch(/underline wavy/); // what is wrong is still marked (not changed by 5d)
  });

  it("is still marked in the preview, and its tooltip still names the placeholder", async () => {
    state.blocks.why_visit.title = "Entrance {fee_regular}";
    await open("why_visit");
    const filled = within(screen.getByTestId("preview-title")).getByText("₱80");
    expect(filled.className).toBe("mobile-content-filled"); // the fixture reached the case: an amount was filled in
    expect(filled.getAttribute("title")).toBe("{fee_regular}");
    expect(filled.getAttribute("data-kind")).toBe("filled");
    expect(filled.tagName).toBe("SPAN"); // not a link, not a button
    expect(filled.closest("a, button")).toBeNull();
  });
});

describe("the four pillars", () => {
  it("are listed as they come, with their text, and the one that is switched off says so", async () => {
    expect(state.items).toHaveLength(4); // the fixture: four pillars, one of them switched off
    expect(state.items.filter((item) => !item.is_active)).toHaveLength(1);
    render(<MobileContentPillars />);
    const list = await screen.findByRole("list", { name: PILLARS_HEADING });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("strong").textContent)).toEqual(["Cagbalete Island", "Buntal Weaving", "Forest Cascades", "Quezon Flavors"]);
    expect(rows.map((row) => row.querySelector('[data-part="text"]').textContent)).toEqual([
      "Pristine Sandbars",
      "Artisan Hats & Crafts",
      "Dahican & Alitap Falls",
      "Habhab & Fresh Seafood",
    ]);
    expect(within(rows[2]).getByText(SWITCHED_OFF)).toBeTruthy();
    [0, 1, 3].forEach((index) => expect(within(rows[index]).queryByText(SWITCHED_OFF)).toBeNull());
    expect(screen.getByRole("note").textContent).toBe(PILLARS_NOTICE);
    expect(PILLARS_NOTICE).toBe("Ang Edit ang kinalalagyan ng buong impormasyong lumalabas kapag pinindot.");
    expect(document.body.textContent).not.toMatch(/cannot be edited here yet|upcoming update/);
  });

  it("have no form, no Save and nothing to press or type in, and make one GET and nothing else", async () => {
    const { container } = render(<MobileContentPillars />);
    await screen.findByRole("list", { name: PILLARS_HEADING });
    expect(container.querySelectorAll("li")).toHaveLength(4); // the fixture reached the case
    expect(container.querySelectorAll("form, input, textarea, select, button, [contenteditable]")).toHaveLength(0);
    expect([...container.querySelectorAll("a")].every((link) => /^\/mobile-content\/tile\?/.test(link.getAttribute("href")))).toBe(true); // only the links to the page of a tile (6d)
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    await settled();
    expect(requests).toEqual([{ method: "GET", path: "/mobile-content/items/?section=why_visit", body: null }]);
  });

  it("shows a message when there is none, and a way to try again when the server fails", async () => {
    state.items = [];
    expect(state.items).toHaveLength(0); // the fixture
    const view = render(<MobileContentPillars />);
    await screen.findByText(PILLARS_EMPTY);
    view.unmount();
    state.itemsFail = 500;
    expect(state.itemsFail).toBe(500);
    render(<MobileContentPillars />);
    await screen.findByRole("alert");
    state.itemsFail = null;
    state.items = PILLARS;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("list", { name: PILLARS_HEADING });
    expect(requests.filter((r) => r.path.startsWith("/mobile-content/items/"))).toHaveLength(3);
  });
});

describe("the Why Visit tab in the page", () => {
  it("has the editor and the pillars, asks for the blocks and the pillars once each, and NEVER for the emergency contacts", async () => {
    router.__setSearch("?tab=why-visit");
    render(<MobileAppContent />);
    await screen.findByRole("list", { name: PILLARS_HEADING });
    await screen.findByLabelText("Title");
    expect(screen.getByRole("tab", { name: /^Why Visit/ }).getAttribute("aria-selected")).toBe("true"); // the fixture: this tab is the one shown
    expect(screen.getByRole("tab", { name: /^Why Visit/ }).textContent).not.toContain("Coming soon");
    expect(field("Paragraph").rows).toBe(6);
    expect(requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/items/?section=why_visit"]);
    expect(requests.some((r) => r.path.includes("emergency-contacts"))).toBe(false);
    await settled();
    expect(requests.some((r) => r.path.includes("emergency-contacts"))).toBe(false);
  });

  it("opened from another tab, it asks for the pillars once, and leaving and coming back asks for nothing more", async () => {
    router.__setSearch("?tab=welcome");
    render(<MobileAppContent />);
    await screen.findByLabelText("Greeting");
    expect(requests.filter((r) => r.path.startsWith("/mobile-content/items/"))).toHaveLength(0); // the Welcome does not ask for the pillars
    fireEvent.click(screen.getByRole("tab", { name: /^Why Visit/ }));
    await screen.findByRole("list", { name: PILLARS_HEADING });
    fireEvent.click(screen.getByRole("tab", { name: /^Welcome/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^Why Visit/ }));
    await settled();
    expect(requests.filter((r) => r.path.startsWith("/mobile-content/items/"))).toHaveLength(1);
    expect(requests.some((r) => r.path.includes("emergency-contacts"))).toBe(false);
    expect(requests.filter((r) => r.method !== "GET")).toEqual([]); // reading the pillars wrote nothing
  });

  it("the Welcome and the Why Visit keep their own text: the editor of one does not show the other", async () => {
    router.__setSearch("?tab=why-visit");
    render(<MobileAppContent />);
    await screen.findByLabelText("Paragraph");
    expect(state.blocks.welcome.title).not.toBe(state.blocks.why_visit.title); // the fixture
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByLabelText("Title").value).toBe("Why Visit Mauban?");
    expect(within(panel).queryByRole("button", { name: /\{name\}/ })).toBeNull();
  });
});
