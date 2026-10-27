// The tab "Travel Guide & Tips" (Commit 7a): one list of cards (tiles and banners), a count and a filter, the doors to the page of a tile, the switch, and the
// preview with its banners on top, the title of the section and the tiles. A fake of the server sits behind a fake fetch, so the REAL tourismApi builds the
// requests. Every test with a fixture asserts, inside the test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import {
  ADD_CARD,
  AMOUNT_LOCKED,
  CARDS_FULL,
  FILTERS,
  LIST_HINT,
  LOCKED_LINE,
  NO_MATCH,
  NOTHING_SHOWN,
  SECTION_TITLE_FALLBACK,
  WHERE_BOTTOM,
  WHERE_MIDDLE,
  applyFilter,
  isAmountLocked,
  previewNotes,
  previewPlan,
} from "./MobileContentCardsTab";
import { previewContext } from "../utils/mobileContentPreview";
import { ICON_TONES, PILLAR_ICONS } from "../utils/mobileContentIcons";
import { MAX_ITEMS_PER_SECTION } from "../utils/mobileContentTileRules";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const OFFICE = "Tourism Office, 2nd Floor, Mauban Municipal Hall";
const TITLE = "📖 Mauban Travel Guide & Local Tips";
const card = (id, icon, title, short_text, extra = {}) => ({
  id, section: "travel_guide", icon, title, short_text, full_text: "", style: "tile", display_order: id * 10, is_active: true, tappable: false, ...extra,
});
const FIXTURE = () => [
  card(1, "boat", "Boat Guide", `Pay at {fee_office}. Boats leave daily.`, { full_text: "How to go to the island.", tappable: true }),
  card(2, "festival", "Buntal Festival (May)", "A week of woven hats."),
  card(3, "receipt", "Environmental Fee", "Regular {fee_regular}, discounted {fee_discounted}."),
  card(4, "waste", "Leave No Trace", "Take your trash back.", { is_active: false }),
  card(5, "event", "Upcoming: Fiesta", "Celebrate the feast.", { style: "banner" }),
  card(6, "eco", "Clean Coast", "Please dispose of trash.", { style: "banner" }),
];

let items;
let requests;
let state;
const reply = (status, body) => Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });

beforeEach(() => {
  requests = [];
  items = FIXTURE();
  state = { office: OFFICE, title: TITLE, noFee: false, failNext: null, warnOff: null };
  router.__setSearch("?tab=travel-guide");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const route = url.replace(/^.*\/api/, "");
    requests.push({ method, path: route });
    if (method === "GET" && route === "/mobile-content/blocks/") {
      const blocks = [
        {
          key: "welcome", name: "Welcome banner", title: "Mabuhay!", subtitle: "Welcome.", body: "", fields: ["title", "subtitle"],
          limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true } },
          allowed_placeholders: { title: ["name"], subtitle: ["name"] },
        },
      ];
      if (state.title !== null) blocks.push({ key: "travel_guide", title: state.title, subtitle: "", body: "" });
      if (state.office) blocks.push({ key: "fee_office", title: "", subtitle: "", body: state.office });
      return reply(200, { blocks, ...(state.noFee ? {} : { fee: { regular: 80, discounted: 64 } }), placeholders: {} });
    }
    if (method === "GET" && route === "/mobile-content/items/?section=travel_guide") return reply(200, items);
    if (state.failNext && method === "POST") {
      const failure = state.failNext;
      state.failNext = null;
      return reply(failure.status, failure.body);
    }
    const toggle = route.match(/^\/mobile-content\/items\/(\d+)\/(deactivate|reactivate)\/$/);
    if (method === "POST" && toggle) {
      const found = items.find((candidate) => candidate.id === Number(toggle[1]));
      found.is_active = toggle[2] === "reactivate";
      return reply(200, { ...found, warnings: state.warnOff && toggle[2] === "deactivate" ? [state.warnOff] : [] });
    }
    return reply(404, { detail: "no such route" });
  });
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function open(search = "?tab=travel-guide") {
  router.__setSearch(search);
  const view = render(<MobileAppContent />);
  await screen.findByRole("list", { name: "Cards" });
  await settled();
  return view;
}
const rows = () => screen.getAllByTestId("card-row");
const rowOf = (title) => rows().find((row) => row.querySelector('[data-part="title"]').textContent === title);
const frame = () => screen.getByTestId("guide-frame");
const count = () => screen.getByTestId("cards-count").textContent;
const choose = (label) => fireEvent.change(screen.getByRole("combobox", { name: "Show" }), { target: { value: FILTERS.find(([, name]) => name === label)[0] } });

describe("the tab and its requests", () => {
  it("is built: it has no Coming soon, and it opens with two GETs (the cards of the section, and the blocks) and nothing for the contacts", async () => {
    await open();
    expect(screen.getByRole("tab", { name: /^Travel Guide & Tips/ }).textContent).not.toContain("Coming soon");
    expect(screen.getByRole("tab", { name: /^Travel Guide & Tips/ }).getAttribute("aria-selected")).toBe("true"); // the fixture: this tab is the one shown
    expect(requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/items/?section=travel_guide"]);
    expect(requests.some((r) => r.path.includes("emergency-contacts"))).toBe(false);
  });

  it("asks for nothing until the tab is opened (the Welcome tab, opened first, makes no request for the cards)", async () => {
    router.__setSearch("?tab=welcome");
    render(<MobileAppContent />);
    await screen.findByLabelText("Greeting");
    await settled();
    expect(requests.some((r) => r.path.includes("section=travel_guide"))).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: /^Travel Guide & Tips/ }));
    await screen.findByRole("list", { name: "Cards" });
    expect(requests.filter((r) => r.path.includes("section=travel_guide"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: /^Welcome/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^Travel Guide & Tips/ }));
    await settled();
    expect(requests.filter((r) => r.path.includes("section=travel_guide"))).toHaveLength(1); // kept, not asked again
  });

  it("the filter, the Edit links and the Add link ask for nothing", async () => {
    await open();
    const before = requests.length;
    choose("Active only");
    choose("Inactive only");
    choose("All");
    for (const link of screen.getAllByRole("link")) fireEvent.click(link);
    await settled();
    expect(requests.length).toBe(before);
    expect(router.__clicks().length).toBeGreaterThan(5); // the fixture: the links really were pressed
  });

  it("sends anyone but the admin away, with no request", async () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<MobileAppContent />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    await settled();
    expect(requests).toEqual([]);
  });
});

describe("the + Add card button of the header", () => {
  it("is in the header of the page, on the right of the title, and goes to a new card of the Travel Guide", async () => {
    await open();
    const link = screen.getByRole("link", { name: ADD_CARD });
    expect(ADD_CARD).toBe("+ Add card");
    expect(link.getAttribute("href")).toBe("/mobile-content/tile?section=travel_guide");
    expect(link.className).toBe("mobile-content-add");
    const header = document.querySelector(".reports-header");
    expect(header.contains(link)).toBe(true);
    expect(header.firstElementChild.querySelector("h1").textContent).toBe("Mobile App Content");
    expect(header.lastElementChild).toBe(link); // after the title block
    fireEvent.click(link);
    expect(router.__clicks().at(-1)).toEqual({ to: "/mobile-content/tile?section=travel_guide", replace: false });
  });

  it("is only on this tab: the other tabs have no Add card", async () => {
    await open();
    fireEvent.click(screen.getByRole("tab", { name: /^Why Visit/ }));
    expect(screen.queryByRole("link", { name: ADD_CARD })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Welcome/ }));
    expect(screen.queryByRole("link", { name: ADD_CARD })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Travel Guide & Tips/ }));
    expect(screen.getByRole("link", { name: ADD_CARD })).toBeTruthy();
    await settled();
  });

  it("is a link with 39 cards, and a closed button with 40 (the ones deactivated counted) that says why", async () => {
    items = Array.from({ length: MAX_ITEMS_PER_SECTION - 1 }, (_, index) => card(100 + index, "info", `Card ${index}`, "x"));
    const view = await open();
    expect(items).toHaveLength(39); // the fixture
    expect(screen.getByRole("link", { name: ADD_CARD })).toBeTruthy();
    expect(screen.queryByTestId("cards-full")).toBeNull();
    view.unmount();
    items = [...Array.from({ length: 38 }, (_, index) => card(100 + index, "info", `Card ${index}`, "x")), card(200, "info", "Off 1", "x", { is_active: false }), card(201, "info", "Off 2", "x", { is_active: false })];
    await open();
    expect(items.filter((box) => !box.is_active)).toHaveLength(2); // the fixture: 38 on and 2 off is 40
    expect(screen.queryByRole("link", { name: ADD_CARD })).toBeNull();
    const button = screen.getByRole("button", { name: ADD_CARD });
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("cards-full").textContent).toBe(CARDS_FULL);
    expect(button.getAttribute("aria-describedby")).toBe("cards-full");
  });
});

describe("the count and the filter", () => {
  it("counts the cards: 6 cards, and 1 card in the singular", async () => {
    await open();
    expect(items).toHaveLength(6); // the fixture
    expect(count()).toBe("6 cards");
    expect(screen.getByTestId("cards-count").className).toBe("mobile-content-cards-count");
    choose("Inactive only");
    expect(count()).toBe("1 card");
  });

  it("has the select Show with All, Active only and Inactive only, and filters what was read", async () => {
    await open();
    const select = screen.getByRole("combobox", { name: "Show" });
    expect([...select.options].map((option) => option.textContent)).toEqual(["All", "Active only", "Inactive only"]);
    expect(select.value).toBe("all");
    choose("Active only");
    expect(count()).toBe("5 cards");
    expect(rows().map((row) => row.querySelector('[data-part="title"]').textContent)).not.toContain("Leave No Trace");
    choose("Inactive only");
    expect(rows().map((row) => row.querySelector('[data-part="title"]').textContent)).toEqual(["Leave No Trace"]);
    choose("All");
    expect(rows()).toHaveLength(6);
  });

  it("says that no card matches, when the filter leaves none", async () => {
    items = items.map((box) => ({ ...box, is_active: true }));
    await open();
    choose("Inactive only");
    expect(screen.getByText(NO_MATCH)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Cards" })).toBeNull();
    expect(count()).toBe("0 cards");
  });

  it("applyFilter keeps the order of the list", () => {
    const list = FIXTURE();
    expect(applyFilter(list, "all").map((box) => box.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(applyFilter(list, "active").map((box) => box.id)).toEqual([1, 2, 3, 5, 6]);
    expect(applyFilter(list, "inactive").map((box) => box.id)).toEqual([4]);
  });
});

describe("the lines of the list", () => {
  it("one line of hint under the count, and one line under the list, in the words of the owner, and neither is a note box", async () => {
    const { container } = await open();
    const hint = screen.getByText(LIST_HINT);
    const locked = screen.getByText(LOCKED_LINE);
    expect(LIST_HINT).toBe("Parehong kard ang gabay at ang paalala, pero magkaiba ang pwesto sa Home: ang gabay ay nasa gitna (hindi ito lumalabas kapag may hinahanap o piniling kategorya ang bisita), ang paalala ay nasa ibaba. Ang pinakamaliit na Order ang nauuna sa loob ng bawat grupo. Sa preview, may arrow ang gabay na may buong teksto.");
    expect(LOCKED_LINE).toBe("Ang Amount locked sa isang kard ay nangangahulugang ang halaga doon ay galing sa iisang pinagmulan — hindi ito maisusulat nang kamay, para hindi ito maiba sa kuwenta ng ulat.");
    expect(hint.tagName).toBe("P");
    expect(locked.tagName).toBe("P");
    expect(container.querySelector(".mobile-content-note")).toBeNull();
    expect(screen.getByTestId("cards-count").compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // under the count
    expect(screen.getByRole("list", { name: "Cards" }).compareDocumentPosition(locked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // under the list
  });
});

describe("a card", () => {
  it("has its icon, its title, the tag of its order, the tag of its detail, its short line", async () => {
    await open();
    const row = rowOf("Boat Guide");
    expect(row.querySelector(".mobile-content-guide-icon").style.width).toBe("30px");
    expect(row.querySelector(".mobile-content-guide-icon").style.background).toBe("rgb(220, 237, 248)"); // boat: blue (#DCEDF8)
    expect(row.querySelector('[data-part="title"]').textContent).toBe("Boat Guide");
    expect(row.querySelector('[data-part="order"]').textContent).toBe("Order 10");
    expect(row.querySelector('[data-part="order"]').getAttribute("data-kind")).toBe("order");
    expect(row.querySelector('[data-part="detail"]').textContent).toBe("Has detail");
    expect(row.querySelector('[data-part="detail"]').getAttribute("data-kind")).toBe("detail");
    expect(row.querySelector('[data-part="line"]').textContent).toBe("Pay at {fee_office}. Boats leave daily."); // the template, as the server holds it
    expect(rowOf("Buntal Festival (May)").querySelector('[data-part="detail"]').textContent).toBe("No detail yet");
    expect(rowOf("Buntal Festival (May)").querySelector('[data-part="detail"]').getAttribute("data-kind")).toBe("no-detail");
    expect(rowOf("Buntal Festival (May)").querySelector('[data-part="order"]').textContent).toBe("Order 20");
  });

  it("the tag of the detail follows the full text the server says it has (tappable), not the position or the title", async () => {
    items[1].tappable = true;
    items[1].full_text = "Now it has a text.";
    items[0].tappable = false;
    items[0].full_text = "";
    await open();
    expect(rowOf("Buntal Festival (May)").querySelector('[data-part="detail"]').textContent).toBe("Has detail"); // the fixture: flipped
    expect(rowOf("Boat Guide").querySelector('[data-part="detail"]').textContent).toBe("No detail yet");
  });

  it("a banner says Banner, and not that it has no detail yet (it can never have a full text)", async () => {
    await open();
    const row = rowOf("Upcoming: Fiesta");
    expect(row.getAttribute("data-style")).toBe("banner");
    expect(row.querySelector('[data-part="detail"]').textContent).toBe("Banner");
    expect(row.querySelector('[data-part="detail"]').getAttribute("data-kind")).toBe("banner");
    expect(rowOf("Boat Guide").getAttribute("data-style")).toBe("tile");
  });

  it("Amount locked is on the cards that hold a placeholder of the fee in ANY of their texts, and only on those", async () => {
    await open();
    const locked = rows().filter((row) => row.querySelector('[data-part="locked"]')).map((row) => row.querySelector('[data-part="title"]').textContent);
    expect(locked).toEqual(["Boat Guide", "Environmental Fee"]); // the fixture: {fee_office} in the short line, {fee_regular} and {fee_discounted} in another
    expect(rowOf("Boat Guide").querySelector('[data-part="locked"]').textContent).toBe("Amount locked");
    expect(AMOUNT_LOCKED).toBe("Amount locked");
    expect(rowOf("Buntal Festival (May)").querySelector('[data-part="locked"]')).toBeNull();
  });

  it("Amount locked is read from the data: a placeholder in the title, in the full text, or gone, changes the tag", async () => {
    items[0].short_text = "No placeholder any more.";
    items[1].title = "Festival {fee_regular}";
    items[3].full_text = "Pay {fee_discounted}";
    await open();
    expect(rowOf("Boat Guide").querySelector('[data-part="locked"]')).toBeNull(); // taken out
    expect(rowOf("Festival {fee_regular}").querySelector('[data-part="locked"]')).not.toBeNull(); // in the title
    expect(rowOf("Leave No Trace").querySelector('[data-part="locked"]')).not.toBeNull(); // in the full text
    expect(isAmountLocked({ title: "a", short_text: "b", full_text: "" })).toBe(false);
    expect(isAmountLocked({ title: "{fee_office}", short_text: "", full_text: "" })).toBe(true);
    expect(isAmountLocked({ title: "", short_text: "{name}", full_text: "" })).toBe(false); // {name} is not a placeholder of the fee
  });

  it("says Active with a dot, or Deactivated with a different mark", async () => {
    await open();
    const on = rowOf("Boat Guide").querySelector('[data-part="status"]');
    const off = rowOf("Leave No Trace").querySelector('[data-part="status"]');
    expect(on.textContent).toBe("Active");
    expect(on.getAttribute("data-state")).toBe("on");
    expect(off.textContent).toBe("Deactivated");
    expect(off.getAttribute("data-state")).toBe("off");
    expect(rowOf("Leave No Trace").getAttribute("data-active")).toBe("false");
    expect(rowOf("Boat Guide").getAttribute("data-active")).toBe("true");
  });

  it("has an Edit that goes to the page of THAT card, by its own id", async () => {
    await open();
    const expected = { "Boat Guide": 1, "Buntal Festival (May)": 2, "Environmental Fee": 3, "Leave No Trace": 4, "Upcoming: Fiesta": 5, "Clean Coast": 6 };
    for (const [title, id] of Object.entries(expected)) {
      const link = within(rowOf(title)).getByRole("link", { name: `Edit ${title}` });
      expect(link.getAttribute("href")).toBe(`/mobile-content/tile?id=${id}`);
    }
    fireEvent.click(within(rowOf("Clean Coast")).getByRole("link", { name: "Edit Clean Coast" }));
    expect(router.__clicks().at(-1)).toEqual({ to: "/mobile-content/tile?id=6", replace: false });
  });

  it("has Deactivate on a card that is on and Reactivate on one that is off", async () => {
    await open();
    expect(within(rowOf("Boat Guide")).getByRole("button", { name: "Deactivate Boat Guide" }).textContent).toBe("Deactivate");
    expect(within(rowOf("Leave No Trace")).getByRole("button", { name: "Reactivate Leave No Trace" }).textContent).toBe("Reactivate");
    expect(within(rowOf("Leave No Trace")).queryByRole("button", { name: /^Deactivate/ })).toBeNull();
  });
});

describe("deactivating and reactivating", () => {
  it("asks first; nothing is sent until the person says yes; Cancel changes nothing", async () => {
    await open();
    const before = requests.length;
    fireEvent.click(within(rowOf("Boat Guide")).getByRole("button", { name: "Deactivate Boat Guide" }));
    const question = within(rowOf("Boat Guide")).getByRole("alertdialog", { name: "Confirm deactivating" });
    expect(question.textContent).toMatch(/Deactivate “Boat Guide”\? The app will not show it\. It stays here, and you can reactivate it\./);
    expect(requests.length).toBe(before);
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(requests.length).toBe(before);
    expect(items[0].is_active).toBe(true);
  });

  it("sends ONE POST to that card, then shows it deactivated: the mark, the count of the filter, the preview; and no GET follows", async () => {
    await open();
    const before = requests.length;
    expect(frame().textContent).toContain("Boat Guide"); // the fixture: it is in the preview
    fireEvent.click(within(rowOf("Boat Guide")).getByRole("button", { name: "Deactivate Boat Guide" }));
    fireEvent.click(within(rowOf("Boat Guide")).getByRole("button", { name: "Yes, deactivate" }));
    await screen.findByText("“Boat Guide” was deactivated.");
    expect(requests.slice(before)).toEqual([{ method: "POST", path: "/mobile-content/items/1/deactivate/" }]);
    expect(rowOf("Boat Guide").querySelector('[data-part="status"]').textContent).toBe("Deactivated");
    expect(within(rowOf("Boat Guide")).getByRole("button", { name: "Reactivate Boat Guide" })).toBeTruthy();
    expect(frame().textContent).not.toContain("Boat Guide"); // gone from the preview
    choose("Active only");
    expect(count()).toBe("4 cards");
  });

  it("shows the warning of the server when it was the last card on", async () => {
    state.warnOff = "No item of “Travel Guide & Tips” is shown now, so the app will leave that whole part out.";
    await open();
    fireEvent.click(within(rowOf("Clean Coast")).getByRole("button", { name: "Deactivate Clean Coast" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, deactivate" }));
    expect((await screen.findByText(state.warnOff)).getAttribute("role")).toBe("status");
  });

  it("reactivates a card with ONE POST and no question", async () => {
    await open();
    const before = requests.length;
    fireEvent.click(within(rowOf("Leave No Trace")).getByRole("button", { name: "Reactivate Leave No Trace" }));
    await screen.findByText("“Leave No Trace” was reactivated.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(requests.slice(before)).toEqual([{ method: "POST", path: "/mobile-content/items/4/reactivate/" }]);
    expect(rowOf("Leave No Trace").querySelector('[data-part="status"]').textContent).toBe("Active");
    expect(frame().textContent).toContain("Leave No Trace"); // and it is in the preview
  });

  it("says what the server said when it refuses, and leaves the card as it was", async () => {
    const words = "Only the system admin can manage the content of the mobile app.";
    state.failNext = { status: 403, body: { detail: words } };
    await open();
    fireEvent.click(within(rowOf("Boat Guide")).getByRole("button", { name: "Deactivate Boat Guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, deactivate" }));
    expect((await screen.findByText(words)).getAttribute("role")).toBe("alert");
    expect(rowOf("Boat Guide").querySelector('[data-part="status"]').textContent).toBe("Active");
  });
});

describe("one word for the switch: Deactivate and Reactivate (7b)", () => {
  const OLD = /switch(ed|ing)? off|bring (it )?back|brought back|Bring back/i;

  it("nothing on the tab says Switch off, Bring back or brought back, before, during or after a switch", async () => {
    await open();
    expect(document.body.textContent).not.toMatch(OLD);
    fireEvent.click(within(rowOf("Boat Guide")).getByRole("button", { name: "Deactivate Boat Guide" }));
    expect(document.body.textContent).not.toMatch(OLD);
    expect(screen.getByRole("alertdialog").textContent).toContain("you can reactivate it");
    fireEvent.click(screen.getByRole("button", { name: "Yes, deactivate" }));
    await screen.findByText("“Boat Guide” was deactivated.");
    fireEvent.click(within(rowOf("Boat Guide")).getByRole("button", { name: "Reactivate Boat Guide" }));
    await screen.findByText("“Boat Guide” was reactivated.");
    expect(document.body.textContent).not.toMatch(OLD);
    expect(items.length).toBe(6); // the fixture reached the case
  });
});

describe("the preview", () => {
  const banners = () => screen.queryAllByTestId("guide-banner");
  const tiles = () => screen.queryAllByTestId("guide-tile");
  const notes = () => screen.queryByTestId("guide-notes");

  it("has its eyebrow and its heading, in a sticky column of its own beside the list", async () => {
    const { container } = await open();
    const layout = container.querySelector(".mobile-content-tile-layout");
    const side = layout.querySelector("aside.mobile-content-tile-side");
    expect(layout.lastElementChild).toBe(side);
    expect(within(side).getByText("Preview").className).toContain("mobile-content-eyebrow");
    expect(within(side).getByRole("heading", { level: 2, name: "How it looks in the app" })).toBeTruthy();
    expect(side.getAttribute("aria-label")).toBe("What the app will show");
  });

  it("puts the title of the section and the tiles first (the middle of the Home), and the banners after them (the bottom of the Home), each part with its own label", async () => {
    await open();
    expect(banners()).toHaveLength(2); // the fixture: two banners that are on
    expect(tiles()).toHaveLength(3); // and three tiles that are on (the fourth is off)
    expect([...frame().children].map((child) => child.getAttribute("data-testid"))).toEqual([
      "guide-where-middle",
      "guide-section-title",
      "guide-tile",
      "guide-tile",
      "guide-tile",
      "guide-where-bottom",
      "guide-banner",
      "guide-banner",
    ]);
    const title = screen.getByTestId("guide-section-title");
    tiles().forEach((tile) => expect(title.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()); // each tile after the title
    banners().forEach((banner) => expect(tiles().at(-1).compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()); // each banner after the last tile
    banners().forEach((banner) => expect(banner.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()); // and the title before each banner
  });

  it("says which part of the Home each group is, and does not put them together", async () => {
    await open();
    expect(screen.getByTestId("guide-where-middle").textContent).toBe("Home — gitna: ang gabay");
    expect(screen.getByTestId("guide-where-bottom").textContent).toBe("Home — ibaba: ang paalala");
    expect(WHERE_MIDDLE).toBe("Home — gitna: ang gabay");
    expect(WHERE_BOTTOM).toBe("Home — ibaba: ang paalala");
    expect(screen.getByTestId("guide-where-bottom").getAttribute("data-where")).toBe("bottom"); // set apart by its own rule
    expect(screen.getByTestId("guide-where-bottom").compareDocumentPosition(screen.getByTestId("guide-where-middle")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("with no banner there is no label of the bottom; with no tile there is no title and no label of the middle", async () => {
    items = items.filter((box) => box.style !== "banner");
    const first = await open();
    expect(banners()).toHaveLength(0); // the fixture
    expect(screen.queryByTestId("guide-where-bottom")).toBeNull();
    expect(screen.getByTestId("guide-where-middle")).toBeTruthy();
    first.unmount();
    items = FIXTURE().filter((box) => box.style === "banner");
    await open();
    expect(tiles()).toHaveLength(0); // the fixture: only banners
    expect(screen.queryByTestId("guide-where-middle")).toBeNull();
    expect(screen.queryByTestId("guide-section-title")).toBeNull();
    expect(screen.getByTestId("guide-where-bottom")).toBeTruthy();
  });

  it("the title of the section is the one the server holds (the block), and the words of the design when there is none", async () => {
    const first = await open();
    expect(screen.getByTestId("guide-section-title").textContent).toBe(TITLE);
    first.unmount();
    state.title = null;
    await open();
    expect(screen.getByTestId("guide-section-title").textContent).toBe(SECTION_TITLE_FALLBACK);
    expect(SECTION_TITLE_FALLBACK).toBe("Mauban Travel Guide & Local Tips");
  });

  it("a banner has no arrow, a colour from its icon, and its icon, title and short line", async () => {
    await open();
    const banner = banners()[0];
    expect(banner.querySelector('[data-part="chevron"]')).toBeNull();
    expect(banner.style.background).toBe("rgb(251, 235, 212)"); // event: amber (#FBEBD4)
    expect(banner.querySelector('[data-part="icon"]').style.width).toBe("19px");
    expect(banner.querySelector('[data-part="title"]').textContent).toBe("Upcoming: Fiesta");
    expect(banner.querySelector('[data-part="line"]').textContent).toBe("Celebrate the feast.");
    expect(banners().every((node) => node.querySelector("svg path"))).toBe(true);
    expect(banners()[1].style.background).toBe("rgb(221, 240, 230)"); // eco: green (#DDF0E6)
  });

  it("a banner keeps no arrow even when the data says it has a full text", async () => {
    items[4].full_text = "A banner with a text (the server would not allow it).";
    items[4].tappable = true;
    await open();
    expect(items[4].tappable).toBe(true); // the fixture
    expect(banners()[0].querySelector('[data-part="chevron"]')).toBeNull();
  });

  it("a tile has its icon (28), its colour, its title and short line, and an arrow only when the card has a full text", async () => {
    await open();
    expect(tiles()[0].querySelector('[data-part="icon"]').style.width).toBe("28px");
    expect(tiles()[0].querySelector('[data-part="icon"]').style.borderRadius).toBe("8px");
    expect(tiles().map((tile) => tile.querySelector('[data-part="title"]').textContent)).toEqual(["Boat Guide", "Buntal Festival (May)", "Environmental Fee"]);
    expect(tiles().map((tile) => Boolean(tile.querySelector('[data-part="chevron"]')))).toEqual([true, false, false]); // only the first has a full text
    const arrow = tiles()[0].querySelector('[data-part="chevron"]');
    expect(arrow.getAttribute("width")).toBe("15");
    expect(arrow.getAttribute("height")).toBe("15");
    expect(arrow.getAttribute("stroke-width")).toBe("2.5");
    expect(arrow.getAttribute("stroke")).toBe(ICON_TONES[PILLAR_ICONS.boat.tone].stroke); // the colour of the icon
  });

  it("the arrow follows the data: the server's tappable, not the title or the place in the list", async () => {
    items[0].tappable = false;
    items[0].full_text = "";
    items[1].tappable = true;
    items[1].full_text = "A text.";
    items[2].tappable = true;
    items[2].full_text = "Another.";
    await open();
    expect(tiles().map((tile) => Boolean(tile.querySelector('[data-part="chevron"]')))).toEqual([false, true, true]); // the fixture: flipped
  });

  it("fills the placeholders of the fee in the tiles and the banners", async () => {
    items[4].short_text = "Fee {fee_regular} or {fee_discounted}";
    await open();
    expect(tiles()[0].querySelector('[data-part="line"]').textContent).toBe(`Pay at ${OFFICE}. Boats leave daily.`);
    expect(tiles()[2].querySelector('[data-part="line"]').textContent).toBe("Regular ₱80, discounted ₱64.");
    expect(banners()[0].querySelector('[data-part="line"]').textContent).toBe("Fee ₱80 or ₱64");
    expect(frame().querySelector('[data-kind="filled"]').getAttribute("title")).toMatch(/^\{fee_/); // the fixture reached the case
  });

  it("leaves out a card that is switched off", async () => {
    await open();
    expect(items[3].is_active).toBe(false); // the fixture
    expect(frame().textContent).not.toContain("Leave No Trace");
  });

  it("leaves out a card whose place of payment is not written (the server leaves it out) and says so, in words made from the data", async () => {
    state.office = "";
    await open();
    expect(tiles().map((tile) => tile.querySelector('[data-part="title"]').textContent)).toEqual(["Buntal Festival (May)", "Environmental Fee"]); // the Boat Guide holds {fee_office}
    expect(notes().textContent).toContain("Hindi lumalabas: Boat Guide — wala pang nakasulat na lugar ng bayad");
  });

  it("the line under it is made from the data: the tiles without an arrow, by name, and the banners", async () => {
    await open();
    const text = notes().textContent;
    expect(text).toContain("Walang arrow: Buntal Festival (May), Environmental Fee — wala pang buong impormasyon, kaya hindi napipindot.");
    expect(text).not.toContain("Walang arrow: Boat Guide"); // the tile with a full text is not named
    expect(text).toContain("Ang banner (Upcoming: Fiesta, Clean Coast) ay walang arrow: hindi pa napipindot ang banner.");
  });

  it("the line changes with the data: all the tiles have an arrow, or one has none", async () => {
    items[1].full_text = "t";
    items[1].tappable = true;
    items[2].full_text = "t";
    items[2].tappable = true;
    await open();
    expect(notes().textContent).toContain("Lahat ng tile ay may arrow: may buong impormasyon ang bawat isa.");
    expect(notes().textContent).not.toContain("Walang arrow:");
  });

  it("the line names OTHER tiles when the data is other: the one with a text is not named, the ones without are", async () => {
    items[0].full_text = "";
    items[0].tappable = false; // the Boat Guide has no text now
    items[1].full_text = "A text.";
    items[1].tappable = true; // and the Festival has one
    items[2].title = "Fee Card";
    await open();
    expect(notes().textContent).toContain("Walang arrow: Boat Guide, Fee Card — wala pang buong impormasyon, kaya hindi napipindot.");
    expect(notes().textContent).not.toContain("Buntal Festival (May), Environmental Fee");
    expect(notes().textContent).not.toContain("Walang arrow: Buntal Festival");
  });

  it("the names of the banners and of the cards that are left out come from the data too", async () => {
    state.office = "";
    items[4].title = "Brand New Banner";
    items.push(card(7, "boat", "Second Place Guide", "Go to {fee_office}"));
    items[0].title = "First Place Guide";
    await open();
    expect(notes().textContent).toContain("Ang banner (Brand New Banner, Clean Coast) ay walang arrow: hindi pa napipindot ang banner.");
    expect(notes().textContent).toContain("Hindi lumalabas: First Place Guide, Second Place Guide — wala pang nakasulat na lugar ng bayad (Port & Boat Guide tab).");
    expect(notes().textContent).not.toContain("Upcoming: Fiesta");
  });

  it("says that nothing can be shown when no card is on", async () => {
    items = items.map((box) => ({ ...box, is_active: false }));
    await open();
    expect(banners()).toHaveLength(0);
    expect(tiles()).toHaveLength(0);
    expect(screen.queryByTestId("guide-section-title")).toBeNull();
    expect(within(frame()).getByText(NOTHING_SHOWN)).toBeTruthy();
  });

  it("the plan and the notes, as plain functions", () => {
    const plan = previewPlan(FIXTURE(), previewContext({ fee: { regular: 80, discounted: 64 }, blocks: [{ key: "fee_office", body: OFFICE }] }));
    expect(plan.banners.map((entry) => entry.item.id)).toEqual([5, 6]);
    expect(plan.tiles.map((entry) => entry.item.id)).toEqual([1, 2, 3]);
    expect(plan.omitted).toEqual([]);
    expect(previewNotes(plan)).toHaveLength(2);
    const noOffice = previewPlan(FIXTURE(), previewContext({ fee: { regular: 80, discounted: 64 }, blocks: [] }));
    expect(noOffice.omitted.map((entry) => entry.item.id)).toEqual([1]);
    expect(previewNotes(noOffice).some((line) => line.startsWith("Hindi lumalabas: Boat Guide"))).toBe(true);
  });
});

describe("the real texts: the seed becomes the real appContent", () => {
  it("the cards of the seed, drawn in the preview, say what the real appContent says, word for word, banners apart from tiles", async () => {
    const root = path.join(__dirname, "..", "..", "..", "..");
    const seed = JSON.parse(fs.readFileSync(path.join(root, "backend", "api", "migrations", "seed_data", "mobile_content_0061.json"), "utf8"));
    const real = JSON.parse(fs.readFileSync(path.join(root, "mobile", "test", "data", "app_content_commit3.json"), "utf8"));
    state.office = seed.blocks.find((block) => block.key === "fee_office").body;
    state.title = seed.blocks.find((block) => block.key === "travel_guide").title;
    const guide = seed.items.filter((entry) => entry.section === "travel_guide");
    expect(guide).toHaveLength(6); // the fixture: the six cards of the seed
    items = guide.map((entry, index) => ({ id: 50 + index, ...entry, tappable: Boolean(entry.full_text) }));
    await open();
    const shown = real.sections.travel_guide;
    expect(shown).toHaveLength(6);
    const text = (node) => [node.querySelector('[data-part="title"]').textContent, node.querySelector('[data-part="line"]').textContent];
    expect(banners().map(text)).toEqual(shown.filter((entry) => entry.style === "banner").map((entry) => [entry.title, entry.short_text]));
    expect(tiles().map(text)).toEqual(shown.filter((entry) => entry.style !== "banner").map((entry) => [entry.title, entry.short_text]));
    expect(screen.getByTestId("guide-section-title").textContent).toBe(real.blocks.travel_guide.title);
    expect(tiles().some((tile) => tile.querySelector('[data-part="chevron"]'))).toBe(false); // none of the seeded cards has a full text yet
    function banners() {
      return screen.queryAllByTestId("guide-banner");
    }
    function tiles() {
      return screen.queryAllByTestId("guide-tile");
    }
  });
});

describe("the CSS holds the values of the design", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const part = CSS.slice(CSS.indexOf("the tab of the Travel Guide: the list of cards, and its preview (Commit 7a)"));
  const decl = (selector, property) => {
    const start = part.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const found = part.slice(start, part.indexOf("\n}", start)).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
    expect(found).not.toBeNull();
    return found[1].toLowerCase();
  };

  it("the count, the select, the two lines", () => {
    expect(decl(".mobile-content-cards-count", "font-size")).toBe("17px");
    expect(decl(".mobile-content-cards-count", "font-weight")).toBe("700");
    const select = ".mobile-content-cards-filter select";
    expect(decl(select, "min-height")).toBe("38px");
    expect(decl(select, "padding")).toBe("0 11px");
    expect(decl(select, "border-radius")).toBe("9px");
    expect(decl(select, "border")).toBe("1px solid #e0cdb7");
    expect(decl(select, "background")).toBe("var(--th-surface)");
    expect(decl(select, "font-size")).toBe("13.5px");
    expect(decl(select, "font-weight")).toBe("500");
    const lines = ".mobile-content-cards-hint,\n.mobile-content-cards-locked";
    expect(decl(lines, "font-size")).toBe("13px");
    expect(decl(lines, "color")).toBe("#8a7664");
  });

  it("the card, its tags, its short line and its status", () => {
    expect(decl(".mobile-content-page .mobile-content-card-row", "padding")).toBe("17px 19px");
    expect(decl(".mobile-content-cards", "gap")).toBe("12px");
    expect(decl(".mobile-content-card-title", "font-size")).toBe("15px");
    expect(decl(".mobile-content-card-title", "font-weight")).toBe("700");
    const tag = ".mobile-content-card-tag";
    expect(decl(tag, "padding")).toBe("4px 10px");
    expect(decl(tag, "border-radius")).toBe("7px");
    expect(decl(tag, "font-size")).toBe("12px");
    expect(decl(tag, "font-weight")).toBe("700");
    [
      ["order", "#e4edeb", "#2e6b64"],
      ["detail", "#dcf0e4", "#176b3b"],
      ["no-detail", "#f2e8db", "#7a6450"],
      ["locked", "#fbeadb", "#8a4f16"],
    ].forEach(([kind, background, color]) => {
      expect(decl(`${tag}[data-kind="${kind}"]`, "background")).toBe(background);
      expect(decl(`${tag}[data-kind="${kind}"]`, "color")).toBe(color);
    });
    expect(decl(".mobile-content-card-line", "font-size")).toBe("13px");
    expect(decl(".mobile-content-card-line", "color")).toBe("#6e5c4c");
    expect(decl(".mobile-content-card-line", "max-width")).toBe("62ch");
    expect(decl(".mobile-content-card-dot", "width")).toBe("7px");
    expect(decl(".mobile-content-card-dot", "height")).toBe("7px");
    expect(decl(".mobile-content-card-dot", "border-radius")).toBe("50%");
    expect(decl(".mobile-content-card-dot", "background")).toBe("#2e9655");
    expect(decl(".mobile-content-card-status", "font-size")).toBe("12.5px");
    expect(decl(".mobile-content-card-status", "font-weight")).toBe("600");
    expect(decl(".mobile-content-card-status", "color")).toBe("#1c6b3c");
  });

  it("the preview: the banner, the title of the section, the tile", () => {
    expect(decl(".mobile-content-guide-frame", "gap")).toBe("9px");
    expect(decl(".mobile-content-guide-frame", "flex-direction")).toBe("column");
    expect(decl(".mobile-content-guide-banner", "border-radius")).toBe("12px");
    expect(decl(".mobile-content-guide-banner", "padding")).toBe("12px");
    expect(decl(".mobile-content-guide-banner", "gap")).toBe("10px");
    expect(decl(".mobile-content-guide-tile", "border")).toBe("1px solid #e8eff2");
    expect(decl(".mobile-content-guide-tile", "border-radius")).toBe("12px");
    expect(decl(".mobile-content-guide-tile", "padding")).toBe("12px");
    expect(decl(".mobile-content-guide-tile", "background")).toBe("var(--th-surface)");
    expect(decl(".mobile-content-guide-title", "font-size")).toBe("12.5px");
    expect(decl(".mobile-content-guide-title", "font-weight")).toBe("800");
    expect(decl(".mobile-content-guide-title", "color")).toBe("#1e2b31");
    expect(decl(".mobile-content-guide-text strong", "font-size")).toBe("12px");
    expect(decl(".mobile-content-guide-text strong", "font-weight")).toBe("700");
    expect(decl(".mobile-content-guide-text span", "font-size")).toBe("11px");
    expect(decl(".mobile-content-guide-text span", "color")).toBe("#5e6f77");
  });

  it("the labels of the two parts of the Home: the same small capitals as the other labels, the bottom one set apart by a dashed line", () => {
    const where = ".mobile-content-guide-where";
    expect(decl(where, "font-size")).toBe("10.5px");
    expect(decl(where, "text-transform")).toBe("uppercase");
    expect(decl(where, "letter-spacing")).toBe("0.09em");
    expect(decl(where, "font-weight")).toBe("700");
    expect(decl(where, "color")).toBe("#8fa0a8");
    expect(decl(`${where}[data-where="bottom"]`, "border-top")).toBe("1px dashed #d5e2e8");
  });

  it("every rule of the tab starts with a class of its own", () => {
    const selectors = part.split("\n").filter((line) => /^[.\[a-z].*[,{]$/.test(line) && !line.startsWith(" "));
    expect(selectors.length).toBeGreaterThan(25); // the fixture
    selectors.forEach((line) => expect(line).toMatch(/^\.mobile-content-/));
  });
});
