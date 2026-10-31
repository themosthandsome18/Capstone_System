// The live preview of the Why Visit tab and the place of the pillars (Commit 5g): two mocks (the tile grid, and the page that opens), drawn from the
// pillars the page reads ONCE; the pillars in the left column; the notices moved. Looks only: one test counts the requests to prove none was added or lost.
// The CSS is read from the file. Every test with a fixture asserts, inside the test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import { PILLARS_HEADING } from "./MobileContentPillars";
import { LOAD_ERROR, MOCK_SUBTITLE, MOCK_TITLE, NO_DETAIL_AT_ALL, NO_FULL_TEXT, footLine } from "./MobileContentWhyVisitMocks";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const FEE = ["fee_regular", "fee_discounted", "fee_office"];
const BLOCKS = {
  blocks: [
    {
      key: "why_visit", name: "Why Visit", title: "Why Visit Mauban, Quezon?", subtitle: "The historic coastal sanctuary", body: "Nestled along the coast of Lamon Bay, Mauban boasts white sandbars, ancestral trees, cascading pools and a proud culture shaped by palm artisans.",
      fields: ["title", "subtitle", "body"],
      limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true }, body: { kind: "text", max: 600, required: true } },
      allowed_placeholders: { title: FEE, subtitle: FEE, body: FEE },
    },
  ],
  fee: { regular: 80, discounted: 64 },
  placeholders: {},
};
const item = (id, icon, title, short_text, full_text, extra = {}) => ({
  id, section: "why_visit", icon, title, short_text, full_text, style: "tile", display_order: id * 10, is_active: true, tappable: Boolean(full_text), ...extra,
});
const FIXTURE = () => [
  item(1, "beach", "Cagbalete Island", "Pristine Sandbars", "Cagbalete is an island of white sandbars.\nTake a boat from the port."),
  item(2, "craft", "Buntal Weaving", "Artisan Hats & Crafts", ""),
  item(3, "waterfall", "Forest Cascades", "Dahican & Alitap Falls", "Walk through the forest to the falls."),
  item(4, "food", "Quezon Flavors", "Habhab & Fresh Seafood", ""),
];

let items;
let itemsStatus;
let holdItems; // a function that the test calls to let the answer of the boxes arrive
let requests;
const reply = (status, body) => Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
beforeEach(() => {
  requests = [];
  items = FIXTURE();
  itemsStatus = 200;
  holdItems = null;
  router.__setSearch("?tab=why-visit");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const route = url.replace(/^.*\/api/, "");
    requests.push(`${(options.method || "GET").toUpperCase()} ${route}`);
    if (route === "/mobile-content/blocks/") return reply(200, BLOCKS);
    if (route === "/mobile-content/items/?section=why_visit" && holdItems === "wait") return new Promise((resolve) => (holdItems = () => resolve(reply(200, items))));
    if (route === "/mobile-content/items/?section=why_visit") return itemsStatus === 200 ? reply(200, items) : reply(itemsStatus, { detail: "The boxes are not available." });
    return reply(404, {});
  });
});
const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function open() {
  const view = render(<MobileAppContent />);
  await screen.findByLabelText("Paragraph");
  await settled();
  return view;
}
const card = () => screen.getByLabelText("What the app will show");
const frames = () => [...card().querySelectorAll(".mobile-content-phone")];
const tiles = () => [...card().querySelectorAll(".mobile-content-tile")];
const nameOf = (tile) => tile.querySelector('[data-part="name"]').textContent;
const chevrons = () => tiles().filter((tile) => tile.querySelector('[data-part="chevron"]')).map(nameOf);

describe("the live preview of the Why Visit", () => {
  it("has the eyebrow, the title Pagpindot sa kahon and the line Buod → buong impormasyon, and two frames", async () => {
    await open();
    expect(within(card()).getByText("Live preview").className).toContain("mobile-content-eyebrow");
    expect(within(card()).getByRole("heading", { level: 2 }).textContent).toBe("Pagpindot sa kahon");
    expect(within(card()).getByText("Buod → buong impormasyon")).toBeTruthy();
    expect(MOCK_TITLE).toBe("Pagpindot sa kahon");
    expect(MOCK_SUBTITLE).toBe("Buod → buong impormasyon");
    expect(frames()).toHaveLength(2);
    expect(card().parentElement.className).toContain("mobile-content-side");
    expect(card().parentElement.children).toHaveLength(1); // the right column is the preview and nothing else
  });

  it("the first mock: the typed title and paragraph (the paragraph is cut short by the style), and a tile for each box that is switched on", async () => {
    items.push(item(5, "boat", "A box that is switched off", "Not shown", "Some text", { is_active: false }));
    await open();
    expect(items).toHaveLength(5); // the fixture: five boxes, one of them switched off
    const [first] = frames();
    const sheet = first.querySelector(".mobile-content-sheet");
    expect(sheet).not.toBeNull();
    expect(within(sheet).getByTestId("preview-title").querySelector("p").textContent).toBe("Why Visit Mauban, Quezon?");
    expect(within(sheet).getByTestId("preview-body").querySelector("p").textContent).toBe(BLOCKS.blocks[0].body); // the whole text is in the page; the style cuts it
    expect(within(sheet).getByTestId("preview-body").className).toContain("mobile-content-sheet-body");
    expect(tiles().map(nameOf)).toEqual(["Cagbalete Island", "Buntal Weaving", "Forest Cascades", "Quezon Flavors"]); // not the one that is switched off
    expect(tiles().map((tile) => tile.querySelector('[data-part="sub"]').textContent)).toEqual([
      "Pristine Sandbars",
      "Artisan Hats & Crafts",
      "Dahican & Alitap Falls",
      "Habhab & Fresh Seafood",
    ]);
    expect(tiles().map((tile) => tile.getAttribute("data-tone"))).toEqual(["blue", "amber", "green", "red"]);
  });

  it("what is typed in the editor is what the mock shows, with the placeholders filled in", async () => {
    await open();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Entrance {fee_regular}" } });
    const shown = within(frames()[0]).getByTestId("preview-title");
    expect(shown.textContent).toContain("Entrance ₱80");
    expect(shown.querySelector(".mobile-content-filled").getAttribute("title")).toBe("{fee_regular}"); // the fixture reached the case: something was filled in
  });
});

describe("the arrow on a tile follows the server's tappable", () => {
  it("has a chevron on the tiles that have detail and none on the others", async () => {
    await open();
    expect(items.map((box) => box.tappable)).toEqual([true, false, true, false]); // the fixture
    expect(chevrons()).toEqual(["Cagbalete Island", "Forest Cascades"]);
    const mark = tiles()[0].querySelector('[data-part="chevron"]');
    expect(mark.getAttribute("width")).toBe("12");
    expect(mark.getAttribute("height")).toBe("12");
    expect(mark.getAttribute("stroke-width")).toBe("3");
    expect(mark.getAttribute("stroke")).toBe("currentColor"); // the colour of the text of the tile
    expect(tiles()[1].querySelector("svg")).toBeNull();
  });

  it("is not written in the page: when the data says otherwise, the arrows move", async () => {
    items = [item(1, "beach", "One", "a", "text", { tappable: false }), item(2, "craft", "Two", "b", "", { tappable: true }), item(3, "food", "Three", "c", "", { tappable: false })];
    await open();
    expect(items.map((box) => box.tappable)).toEqual([false, true, false]); // the fixture: the server says so, whatever the full text says
    expect(chevrons()).toEqual(["Two"]);
  });

  it("when the server does not say, the full text decides", async () => {
    items = [{ ...item(1, "beach", "With text", "a", "Some text"), tappable: undefined }, { ...item(2, "craft", "Without", "b", ""), tappable: undefined }];
    await open();
    expect(items.every((box) => box.tappable === undefined)).toBe(true); // the fixture
    expect(chevrons()).toEqual(["With text"]);
  });

  it("no tile has one when none has detail, and all have one when all do", async () => {
    items = FIXTURE().map((box) => ({ ...box, full_text: "", tappable: false }));
    const first = await open();
    expect(chevrons()).toEqual([]);
    expect(tiles()).toHaveLength(4); // the fixture reached the case
    first.unmount();
    items = FIXTURE().map((box) => ({ ...box, full_text: "text", tappable: true }));
    await open();
    expect(chevrons()).toHaveLength(4);
  });
});

describe("the line under the grid is made from the data", () => {
  it("names the boxes without an arrow, and says why", async () => {
    await open();
    const foot = within(frames()[0]).getByTestId("mock-foot").textContent;
    expect(foot).toContain("Buntal Weaving");
    expect(foot).toContain("Quezon Flavors");
    expect(foot).not.toContain("Cagbalete Island");
    expect(foot).not.toContain("Forest Cascades");
    expect(foot).toMatch(/Walang arrow/);
    expect(foot).toMatch(/wala pang buong impormasyon/);
    expect(foot).toBe(footLine(items));
  });

  it("changes with the data: one box without an arrow, none, or all", async () => {
    items = [item(1, "beach", "Only One", "a", ""), item(2, "craft", "Has Text", "b", "text")];
    const view = await open();
    expect(within(frames()[0]).getByTestId("mock-foot").textContent).toContain("Only One");
    expect(within(frames()[0]).getByTestId("mock-foot").textContent).not.toContain("Has Text");
    view.unmount();
    items = [item(1, "beach", "A", "a", "text"), item(2, "craft", "B", "b", "text")];
    expect(items.every((box) => box.tappable)).toBe(true); // the fixture
    const second = await open();
    expect(within(frames()[0]).getByTestId("mock-foot").textContent).toMatch(/^Lahat ng kahon ay may arrow/);
    second.unmount();
    items = [item(1, "beach", "A", "a", ""), item(2, "craft", "B", "b", "")];
    await open();
    expect(within(frames()[0]).getByTestId("mock-foot").textContent).toMatch(/^Walang arrow ang alinmang kahon/);
  });
});

describe("the second mock: the page that opens", () => {
  it("shows the name and the whole text of the FIRST box that has detail, with a chevron to the left", async () => {
    await open();
    const second = frames()[1];
    expect(within(second).getByTestId("mock-detail-top").textContent).toBe("Cagbalete Island");
    expect(within(second).getByTestId("mock-detail-top").querySelector(".mobile-content-chevron-left")).not.toBeNull();
    expect(within(second).getByTestId("mock-detail-body").textContent).toBe("Cagbalete is an island of white sandbars.\nTake a boat from the port.");
    expect(items[0].full_text).toContain("\n"); // the fixture: the text has two lines, kept as they are
  });

  it("skips a box that has no detail, and one that is switched off", async () => {
    items = [item(1, "craft", "No detail", "a", ""), item(2, "beach", "Off", "b", "off text", { is_active: false }), item(3, "food", "Third", "c", "the third text")];
    await open();
    expect(items.filter((box) => box.tappable && box.is_active)).toHaveLength(1); // the fixture: only the third counts
    expect(within(frames()[1]).getByTestId("mock-detail-top").textContent).toBe("Third");
    expect(within(frames()[1]).getByTestId("mock-detail-body").textContent).toBe("the third text");
  });

  it("says so, clearly, when the server says a box has detail but there is no text yet", async () => {
    items = [item(1, "beach", "Odd box", "a", "", { tappable: true })];
    await open();
    expect(items[0].full_text).toBe(""); // the fixture: tappable, and nothing written
    expect(within(frames()[1]).getByTestId("mock-detail-top").textContent).toBe("Odd box");
    expect(within(frames()[1]).getByTestId("mock-detail-body").textContent).toBe(NO_FULL_TEXT);
    expect(NO_FULL_TEXT).toBe("Wala pang nakasulat na buong teksto para sa kahong ito.");
  });

  it("is not hidden when no box has detail: a message says there is no such page yet", async () => {
    items = FIXTURE().map((box) => ({ ...box, full_text: "", tappable: false }));
    await open();
    expect(items.some((box) => box.tappable)).toBe(false); // the fixture
    expect(frames()).toHaveLength(2); // the second frame is there
    expect(within(frames()[1]).getByTestId("mock-detail-none").textContent).toBe(NO_DETAIL_AT_ALL);
    expect(within(frames()[1]).queryByTestId("mock-detail-top")).toBeNull();
  });
});

describe("the frames", () => {
  it("the line under the grid is under the white box, inside the frame; the texts come before the tiles", async () => {
    await open();
    const [first] = frames();
    const sheet = first.querySelector(".mobile-content-sheet");
    const foot = within(first).getByTestId("mock-foot");
    expect(tiles()).toHaveLength(4); // the fixture reached the case
    expect(sheet.contains(foot)).toBe(false); // not inside the white box
    expect(first.contains(foot)).toBe(true); // but inside the frame
    expect(sheet.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // after it
    const grid = within(sheet).getByTestId("mock-tiles");
    expect(within(sheet).getByTestId("preview-title").compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the title, then the grid
    expect(within(sheet).getByTestId("preview-body").compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the paragraph, then the grid
  });
});

describe("while the boxes have not arrived yet", () => {
  it("the mocks say Loading..., and nothing is claimed yet: no tile, no line about the arrows, no page", async () => {
    holdItems = "wait";
    render(<MobileAppContent />);
    await screen.findByLabelText("Paragraph"); // the blocks have come
    await settled();
    expect(typeof holdItems).toBe("function"); // the fixture reached the case: the answer of the boxes is held
    expect(within(frames()[0]).getByText("Loading...")).toBeTruthy();
    expect(within(frames()[1]).getByText("Loading...")).toBeTruthy();
    expect(tiles()).toHaveLength(0);
    expect(within(card()).queryByTestId("mock-foot")).toBeNull();
    expect(within(card()).queryByTestId("mock-detail-none")).toBeNull();
    await act(async () => {
      holdItems();
    });
    await waitFor(() => expect(tiles()).toHaveLength(4));
    expect(within(card()).getByTestId("mock-foot")).toBeTruthy();
  });
});

describe("while the boxes cannot be known", () => {
  it("says so in the mocks, and the editor and the preview of the texts still work", async () => {
    itemsStatus = 500;
    await open();
    expect(frames()).toHaveLength(2);
    expect(within(frames()[0]).getByText(LOAD_ERROR)).toBeTruthy();
    expect(within(frames()[1]).getByText(LOAD_ERROR)).toBeTruthy();
    expect(within(frames()[0]).getByTestId("preview-title").textContent).toContain("Why Visit Mauban"); // the texts are still drawn
    expect(tiles()).toHaveLength(0); // the fixture reached the case: no tile
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy(); // the list in the left column has its own way to try again
  });
});

describe("the pillars are in the left column, under the editor", () => {
  it("come after the form and its notes, in the same column, and are still a list to read", async () => {
    const { container } = await open();
    const main = container.querySelector(".mobile-content-main");
    const form = within(main).getByRole("form", { name: "Why Visit Mauban, Quezon?" });
    const list = within(main).getByLabelText(PILLARS_HEADING, { selector: "section" });
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card().parentElement.className).toContain("mobile-content-side"); // and the preview is on the other side
    expect(main.contains(card())).toBe(false);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4); // the fixture
    expect(list.querySelectorAll("form, input, textarea, select, button")).toHaveLength(0);
    expect(within(list).getAllByRole("link", { name: /^Edit / })).toHaveLength(4); // (since 6d) the door to the page of each tile
    expect(within(list).getByRole("link", { name: "+ Add pillar" })).toBeTruthy();
  });
});

describe("the notices", () => {
  it("neither of the two notes (the next version of the app, the check for another editor) is on the page, and there is no bar at the top", async () => {
    const { container } = await open();
    expect(container.querySelector(".mobile-content-main").children.length).toBeGreaterThan(1); // the fixture: the page is drawn
    expect(screen.queryByText(/Changes here reach the mobile app only when the next version/)).toBeNull();
    expect(screen.queryByText(/Before it saves, this page checks whether someone else has changed/)).toBeNull();
    expect(screen.queryByText(/the last save wins/)).toBeNull();
    expect(screen.queryByRole("note", { name: "About these changes" })).toBeNull();
    expect(container.querySelector(".mobile-content-panel").firstElementChild.className).not.toContain("hotlines-notices");
    expect(container.querySelector(".mobile-content-notices")).toBeNull();
  });

  it("there is no note box at all on the Why Visit, not even in the list of pillars (the note about the four boxes was taken away in 5j)", async () => {
    const { container } = await open();
    const list = screen.getByLabelText(PILLARS_HEADING, { selector: "section" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4); // the fixture: the list is drawn
    expect(container.querySelector(".mobile-content-note")).toBeNull();
    expect(screen.queryByText(/Ang nakikita sa apat na kahon ay buod lamang/)).toBeNull();
    expect(screen.queryByText(/Ang buong impormasyon ay lumalabas kapag pinindot/)).toBeNull();
  });
});

describe("no request was added and none was lost", () => {
  it("one GET of the blocks and one GET of the boxes, though two parts of the page draw them; nothing written; nothing for the contacts", async () => {
    await open();
    expect(tiles().length).toBeGreaterThan(0); // the fixture: the preview drew the boxes
    expect(screen.getByLabelText(PILLARS_HEADING, { selector: "section" })).toBeTruthy(); // and so did the list
    expect([...requests].sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/items/?section=why_visit"]);
    expect(requests.some((line) => line.includes("emergency-contacts"))).toBe(false);
  });
});

describe("the CSS holds the values of the design", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const body = (selector) => {
    const start = CSS.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return CSS.slice(start, CSS.indexOf("\n}", start));
  };
  const decl = (selector, property) => {
    const found = body(selector).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
    expect(found).not.toBeNull();
    return found[1].toLowerCase();
  };

  it("the first mock: the white box, the title, the paragraph that is cut with an ellipsis, the grid and the four tiles", () => {
    expect(decl(".mobile-content-sheet", "background")).toBe("var(--th-surface)");
    expect(decl(".mobile-content-sheet", "border")).toBe("1px solid #e8eff2");
    expect(decl(".mobile-content-sheet", "border-radius")).toBe("14px");
    expect(decl(".mobile-content-sheet", "padding")).toBe("14px");
    expect(decl(".mobile-content-sheet .mobile-content-sheet-title p", "font-size")).toBe("13px");
    expect(decl(".mobile-content-sheet .mobile-content-sheet-title p", "font-weight")).toBe("800");
    const text = ".mobile-content-sheet .mobile-content-sheet-body p";
    expect(decl(text, "font-size")).toBe("11px");
    expect(decl(text, "line-height")).toBe("1.7");
    expect(decl(text, "color")).toBe("#44525b");
    expect(decl(text, "overflow")).toBe("hidden");
    expect(decl(text, "text-overflow")).toBe("ellipsis");
    expect(decl(text, "-webkit-line-clamp")).toBe("3");
    expect(decl(".mobile-content-tiles", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(decl(".mobile-content-tiles", "gap")).toBe("8px");
    expect(decl(".mobile-content-tile", "border-radius")).toBe("10px");
    expect(decl(".mobile-content-tile", "padding")).toBe("10px");
    [
      ["blue", "#eaf4fb", "#0a6aa3"],
      ["amber", "#fbf0dd", "#a5620d"],
      ["green", "#e4f3ea", "#14784c"],
      ["red", "#fbe7e7", "#b52e2e"],
    ].forEach(([tone, background, color]) => {
      expect(decl(`.mobile-content-tile[data-tone="${tone}"]`, "background")).toBe(background);
      expect(decl(`.mobile-content-tile[data-tone="${tone}"]`, "color")).toBe(color);
    });
    expect(decl(".mobile-content-tile strong", "font-size")).toBe("11.5px");
    expect(decl(".mobile-content-tile strong", "font-weight")).toBe("700");
    expect(decl(".mobile-content-tile span", "font-size")).toBe("10.5px");
    expect(decl(".mobile-content-tile span", "color")).toBe("#6e7b82");
  });

  it("the line under the grid, and the second mock", () => {
    expect(decl(".mobile-content-foot", "font-size")).toBe("11px");
    expect(decl(".mobile-content-foot", "color")).toBe("#8fa0a8");
    expect(decl(".mobile-content-detail-top", "font-size")).toBe("13.5px");
    expect(decl(".mobile-content-detail-top", "font-weight")).toBe("700");
    expect(decl(".mobile-content-detail-body", "background")).toBe("var(--th-surface)");
    expect(decl(".mobile-content-detail-body", "border")).toBe("1px solid #e8eff2");
    expect(decl(".mobile-content-detail-body", "border-radius")).toBe("13px");
    expect(decl(".mobile-content-detail-body", "padding")).toBe("14px");
    expect(decl(".mobile-content-detail-body", "font-size")).toBe("11.5px");
    expect(decl(".mobile-content-detail-body", "line-height")).toBe("1.8");
    expect(decl(".mobile-content-detail-body", "color")).toBe("#44525b");
  });

  it("the pillars in the left column keep the grid of the design", () => {
    expect(decl(".mobile-content-pillars", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(248px, 100%), 1fr))");
    expect(decl(".mobile-content-pillars", "gap")).toBe("12px");
  });
});
