// The page of ONE tile (Commit 6b): /mobile-content/tile?id=12 to edit, ?section=why_visit to add. A fake of the server sits behind a fake fetch, so the
// REAL tourismApi / apiRequest build the requests; a test looks at what the person sees AND at the requests that were sent. Every test with a fixture
// asserts, inside the test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileContentTileEditor, {
  ADDED_NOTICE,
  BADGE_EMPTY,
  BADGE_FILLED,
  BANNER_NOTE,
  BAD_ADDRESS,
  FULL_HINT,
  NOT_FOUND,
  SAVED_NOTICE,
  SHORT_HINT,
} from "./MobileContentTileEditor";
import { ICON_TONES, PILLAR_ICONS } from "./MobileContentPillars";
import { HARD_LIMITS, ICON_NAMES, ORDER_MAX, ORDER_MIN, ORDER_STEP } from "../utils/mobileContentTileRules";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const FEE_NOTES = { fee_regular: "The regular amount.", fee_discounted: "The discounted amount.", fee_office: "The place where the fee is paid." };
const item = (id, section, title, extra = {}) => ({
  id, section, icon: "beach", title, short_text: `${title} line`, full_text: "", style: "tile", display_order: id * 10, is_active: true, tappable: false, ...extra,
});
const FIXTURE = () => [
  item(12, "why_visit", "Cagbalete Island", { short_text: "Pristine Sandbars", display_order: 10 }),
  item(13, "why_visit", "Buntal Weaving", { icon: "craft", full_text: "Long text.", tappable: true, display_order: 20 }),
  item(21, "travel_guide", "Boat Guide", { icon: "boat", full_text: "How to go.", tappable: true, display_order: 10 }),
  item(22, "travel_guide", "Upcoming Fiesta", { icon: "event", style: "banner", display_order: 20 }),
];

let items;
let requests;
let state; // what the test asks the fake server to do
function reply(status, body) {
  return Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}
const oneLine = (text) => text.split(/\s+/).filter(Boolean).join(" ");

beforeEach(() => {
  requests = [];
  items = FIXTURE();
  state = { failNext: null, confirmNeeded: null, warn: null, nextId: 100 };
  router.__setSearch("?id=12");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const route = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path: route, body });
    if (method === "GET" && route === "/mobile-content/blocks/") return reply(200, { blocks: [], fee: { regular: 80, discounted: 64 }, placeholders: FEE_NOTES });
    if (method === "GET" && route === "/mobile-content/items/") return reply(200, items);
    const listed = route.match(/^\/mobile-content\/items\/\?section=(\w+)$/);
    if (method === "GET" && listed) return reply(200, items.filter((candidate) => candidate.section === listed[1]));
    if (state.failNext && (method === "PATCH" || method === "POST")) {
      const failure = state.failNext;
      state.failNext = null;
      return reply(failure.status, failure.body);
    }
    const patch = route.match(/^\/mobile-content\/items\/(\d+)\/$/);
    if (method === "PATCH" && patch) {
      if (state.confirmNeeded && !body.confirm_dropped) {
        return reply(409, { detail: "This change takes the place where the fee is paid out of the text, so visitors will no longer be told it here. It needs a confirmation.", code: "confirm_required", dropped: state.confirmNeeded });
      }
      const found = items.find((candidate) => candidate.id === Number(patch[1]));
      Object.entries(body).forEach(([field, value]) => {
        if (field === "confirm_dropped") return;
        found[field] = field === "full_text" || field === "icon" || field === "display_order" ? value : oneLine(value);
      });
      found.tappable = Boolean(found.full_text);
      return reply(200, { ...found, warnings: state.warn ? [state.warn] : [] });
    }
    if (method === "POST" && route === "/mobile-content/items/") {
      const made = { id: state.nextId++, style: "tile", is_active: true, full_text: "", display_order: 50, icon: "info", ...body };
      made.tappable = Boolean(made.full_text);
      items.push(made);
      return reply(201, { ...made, warnings: state.warn ? [state.warn] : [] });
    }
    return reply(404, { detail: "no such route" });
  });
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function open(search = "?id=12") {
  router.__setSearch(search);
  const view = render(<MobileContentTileEditor />);
  await screen.findByLabelText("Title");
  return view;
}
// (a box is found by its role and name: the <section> that holds it is named by the same heading, so a search by label would find both)
const field = (name) => (name === "Order" ? screen.getByRole("spinbutton", { name }) : screen.getByRole("textbox", { name }));
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const save = () => screen.getByRole("button", { name: /^(Save changes|Saving\.\.\.)$/ });
const writes = () => requests.filter((r) => r.method !== "GET");
const group = (word) => screen.getByRole("group", { name: `Placeholders for the ${word}` });
const SHORT = "Maikling linya";
const FULL = "Buong teksto";

describe("the address", () => {
  it("opens the tile of ?id with two GETs, the items and the blocks, and nothing else", async () => {
    await open("?id=12");
    await settled();
    expect(requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/items/"]);
    expect(requests.some((r) => r.path.includes("emergency-contacts"))).toBe(false);
    expect(field("Title").value).toBe("Cagbalete Island"); // the fixture reached the case: the tile of id 12 is on the page
  });

  it("opens a new tile of ?section with two GETs: the items of that section and the blocks", async () => {
    await open("?section=why_visit");
    await settled();
    expect(requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual(["GET /mobile-content/blocks/", "GET /mobile-content/items/?section=why_visit"]);
    expect(field("Title").value).toBe(""); // the fixture: a new tile is blank
  });

  it("reads again from the server on a refresh (the page is opened again with the same address): the same tile, two GETs again", async () => {
    const first = await open("?id=13");
    expect(field("Title").value).toBe("Buntal Weaving");
    first.unmount();
    items[1].title = "Buntal Weaving (changed elsewhere)";
    await open("?id=13");
    expect(field("Title").value).toBe("Buntal Weaving (changed elsewhere)"); // read again, not remembered
    expect(requests.filter((r) => r.method === "GET")).toHaveLength(4);
  });

  it("says so, and asks for nothing, when the address names neither a tile nor a section, or names a bad one", async () => {
    for (const search of ["", "?foo=1", "?id=abc", "?id=0", "?id=-3", "?id=12abc", "?id=", "?section=nope", "?section=", "?id=12/deactivate"]) {
      router.__setSearch(search);
      const { unmount } = render(<MobileContentTileEditor />);
      expect(screen.getByText(BAD_ADDRESS)).toBeTruthy();
      expect(screen.queryByLabelText("Title")).toBeNull();
      unmount();
    }
    await settled();
    expect(requests).toEqual([]); // the fixture: ten bad addresses, not one request
  });

  it("says that the tile does not exist when the id is a number that no tile has", async () => {
    router.__setSearch("?id=999");
    render(<MobileContentTileEditor />);
    expect(await screen.findByText(NOT_FOUND)).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(); // trying again would not make it exist
    expect(requests.filter((r) => r.method === "GET")).toHaveLength(2);
  });

  it("shows the error with Try again when the server cannot be reached, and reads again on Try again", async () => {
    const real = global.fetch;
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    router.__setSearch("?id=12");
    render(<MobileContentTileEditor />);
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByLabelText("Title")).toBeNull(); // the fixture: no form
    global.fetch = real;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("Title");
  });

  it("sends anyone but the admin away, and asks the server for nothing", async () => {
    for (const role of ["tourism", "sanitation", "", undefined]) {
      useAuth.mockReturnValue({ role });
      router.__setSearch("?id=12");
      const { unmount } = render(<MobileContentTileEditor />);
      expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
      expect(screen.getByTestId("redirect").getAttribute("data-replace")).toBe("true");
      expect(screen.queryByLabelText("Title")).toBeNull();
      unmount();
    }
    await settled();
    expect(requests).toEqual([]);
  });
});

describe("the top of the page", () => {
  it("has the back link, the eyebrow and the title of the tile as the heading", async () => {
    await open("?id=12");
    expect(screen.getByText("Editing a tile").className).toContain("mobile-content-eyebrow");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Cagbalete Island");
    const back = screen.getByRole("link", { name: /Back to Why Visit/ });
    expect(back.getAttribute("href")).toBe("/mobile-content?tab=why-visit");
    expect(back.className).toContain("mobile-content-back");
    const chevron = back.querySelector("svg");
    expect(chevron.getAttribute("width")).toBe("15");
    expect(chevron.getAttribute("height")).toBe("15");
    expect(chevron.getAttribute("stroke")).toBe("#8A5A33");
    expect(chevron.getAttribute("stroke-width")).toBe("2.4");
  });

  it("says Adding a tile for a new one", async () => {
    await open("?section=travel_guide");
    expect(screen.getByText("Adding a tile")).toBeTruthy();
    expect(screen.queryByText("Editing a tile")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("New tile");
    expect(screen.getByRole("link", { name: /Back to Travel Guide/ }).getAttribute("href")).toBe("/mobile-content?tab=travel-guide");
  });

  it("goes back to the tab of the SECTION of the tile, not to where the browser came from", async () => {
    await open("?id=21");
    expect(items[2].section).toBe("travel_guide"); // the fixture: a tile of the Travel Guide
    fireEvent.click(screen.getByRole("link", { name: /Back to Travel Guide/ }));
    const redirect = screen.getByTestId("redirect");
    expect(redirect.getAttribute("data-to")).toBe("/mobile-content?tab=travel-guide");
    expect(redirect.getAttribute("data-replace")).toBe("false"); // a step forward; the browser's Back leaves the page too
  });

  it("Cancel goes back to the tab in place (replace)", async () => {
    await open("?id=12");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const redirect = screen.getByTestId("redirect");
    expect(redirect.getAttribute("data-to")).toBe("/mobile-content?tab=why-visit");
    expect(redirect.getAttribute("data-replace")).toBe("true");
    expect(writes()).toEqual([]); // and nothing is sent
  });
});

describe("the first box: the title and the icon", () => {
  it("has the title in a box that wraps and stays one line, and no hint about an icon that becomes general", async () => {
    await open();
    expect(field("Title").tagName).toBe("TEXTAREA");
    expect(field("Title").rows).toBe(1);
    expect(field("Title").className).toBe("mobile-content-line");
    expect(field("Title").hasAttribute("maxlength")).toBe(false);
    expect(document.body.textContent).not.toMatch(/pangkalahatan|nagiging pangkalahatan|luma ang bersyon/i);
  });

  it("offers all the icons of the server, as a group of buttons, and the tile's own icon is the one chosen", async () => {
    await open("?id=12");
    const radios = within(screen.getByRole("radiogroup")).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([...ICON_NAMES]);
    expect(radios).toHaveLength(11);
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true").map((radio) => radio.getAttribute("aria-label"))).toEqual(["beach"]);
    expect(radios.find((radio) => radio.getAttribute("aria-label") === "beach").getAttribute("data-selected")).toBe("true");
  });

  it("draws each icon with the drawing of the pillars (the same paths, the same colours)", async () => {
    await open();
    for (const radio of within(screen.getByRole("radiogroup")).getAllByRole("radio")) {
      const name = radio.getAttribute("aria-label");
      const drawing = radio.querySelector("svg");
      expect(drawing).not.toBeNull();
      expect([...drawing.querySelectorAll("path")].map((node) => node.getAttribute("d"))).toEqual(PILLAR_ICONS[name].paths);
      expect(drawing.getAttribute("stroke")).toBe(ICON_TONES[PILLAR_ICONS[name].tone].stroke);
      expect(radio.textContent).toBe(""); // a drawing, not a letter and not an emoji
    }
  });

  it("choosing another icon moves the mark, and saving sends the icon and nothing else", async () => {
    await open("?id=12");
    fireEvent.click(screen.getByRole("radio", { name: "waste" }));
    expect(screen.getByRole("radio", { name: "waste" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "beach" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ icon: "waste" }]);
  });
});

describe("the second and the third box", () => {
  it("the short line has its eyebrow, its heading and its hint, in a box of one line", async () => {
    await open();
    expect(screen.getByText("Nasa tile").className).toContain("mobile-content-eyebrow");
    expect(screen.getByRole("heading", { level: 2, name: SHORT })).toBeTruthy();
    expect(screen.getByText(SHORT_HINT)).toBeTruthy();
    expect(SHORT_HINT).toBe("Ito ang nakikita agad sa Home. Panatilihing maikli — pinuputol ito ng app kapag masyadong mahaba.");
    expect(field(SHORT).tagName).toBe("TEXTAREA");
    expect(field(SHORT).rows).toBe(1);
    expect(field(SHORT).className).toBe("mobile-content-line");
    expect(field(SHORT).value).toBe("Pristine Sandbars");
  });

  it("the full text has its eyebrow, a badge, its heading, eight rows and its hint", async () => {
    await open();
    expect(screen.getByText(/Kapag pinindot/).className).toContain("mobile-content-eyebrow");
    expect(screen.getByRole("heading", { level: 2, name: FULL })).toBeTruthy();
    expect(field(FULL).tagName).toBe("TEXTAREA");
    expect(field(FULL).rows).toBe(8);
    expect(field(FULL).className).not.toContain("mobile-content-line");
    expect(screen.getByText(FULL_HINT)).toBeTruthy();
    expect(FULL_HINT).toBe("Kapag blangko ito, hindi napipindot ang tile — teksto lang, gaya ng dati. Lumalabas lang ang arrow kapag may laman.");
    expect(screen.getByTestId("full-badge").className).toBe("mobile-content-tag");
    expect(screen.getByTestId("full-badge").getAttribute("data-detail")).toBe("yes"); // the green one
  });

  it("the badge says whether the full text has anything (a text of only spaces has nothing)", async () => {
    await open("?id=12");
    expect(items[0].full_text).toBe(""); // the fixture: this tile has no full text
    expect(screen.getByTestId("full-badge").textContent).toBe(BADGE_EMPTY);
    type(FULL, "   \n  ");
    expect(screen.getByTestId("full-badge").textContent).toBe(BADGE_EMPTY);
    type(FULL, "Now it has a text.");
    expect(screen.getByTestId("full-badge").textContent).toBe(BADGE_FILLED);
    expect(screen.getByTestId("full-badge").getAttribute("data-state")).toBe("filled");
    type(FULL, "");
    expect(screen.getByTestId("full-badge").getAttribute("data-state")).toBe("empty");
  });

  it("a banner has no full text: the box is closed, says why, and is never sent", async () => {
    await open("?id=22");
    expect(items[3].style).toBe("banner"); // the fixture reached the case
    expect(field(FULL).disabled).toBe(true);
    expect(screen.getByTestId("banner-note").textContent).toBe(BANNER_NOTE);
    expect(within(document.body).queryByRole("group", { name: "Placeholders for the full text" })).toBeNull();
    type("Title", "Upcoming Fiesta 2");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "Upcoming Fiesta 2" }]);
  });
});

describe("Enter", () => {
  it("in the title and in the short line is the same as Save: one PATCH, and never a new line", async () => {
    await open();
    for (const [name, value, key] of [["Title", "A new title", "title"], [SHORT, "A new line", "short_text"]]) {
      type(name, value);
      expect(save().disabled).toBe(false); // the fixture: Save is open
      expect(fireEvent.keyDown(field(name), { key: "Enter" })).toBe(false); // cancelled: no new line
      await waitFor(() => expect(writes().length).toBeGreaterThan(0));
      await screen.findByText(SAVED_NOTICE);
      expect(field(name).value).not.toContain("\n");
      expect(writes().at(-1).body).toEqual({ [key]: value });
    }
    expect(writes()).toHaveLength(2);
  });

  it("sends nothing when Save is closed (nothing changed, too long, or empty)", async () => {
    await open();
    expect(save().disabled).toBe(true); // the fixture: nothing changed
    expect(fireEvent.keyDown(field("Title"), { key: "Enter" })).toBe(false);
    type("Title", "x".repeat(61));
    expect(save().disabled).toBe(true); // too long for a title of Why Visit (60)
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    type("Title", "   ");
    expect(save().disabled).toBe(true); // empty
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    await settled();
    expect(writes()).toEqual([]);
  });

  it("does nothing while a letter is being composed", async () => {
    await open();
    type("Title", "Composing");
    expect(save().disabled).toBe(false);
    expect(fireEvent.keyDown(field("Title"), { key: "Enter", isComposing: true })).toBe(true);
    await settled();
    expect(writes()).toEqual([]);
  });

  it("in the full text is a new line: it is not cancelled and it saves nothing", async () => {
    await open();
    type(FULL, "First\n\nSecond");
    expect(save().disabled).toBe(false);
    expect(fireEvent.keyDown(field(FULL), { key: "Enter" })).toBe(true);
    await settled();
    expect(writes()).toEqual([]);
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()[0].body).toEqual({ full_text: "First\n\nSecond" }); // the paragraphs go as they were typed
  });

  it("a new line that is pasted into a line becomes a space", async () => {
    await open();
    type("Title", "one\ntwo\r\nthree");
    expect(field("Title").value).toBe("one two three");
  });
});

describe("the position (Order)", () => {
  it("is a number box from 1 to 9999 in steps of 10, 160 wide, with the tile's own number", async () => {
    await open("?id=13");
    const order = field("Order");
    expect(order.tagName).toBe("INPUT");
    expect(order.type).toBe("number");
    expect([order.min, order.max, order.step]).toEqual([String(ORDER_MIN), String(ORDER_MAX), String(ORDER_STEP)]);
    expect([order.min, order.max, order.step]).toEqual(["1", "9999", "10"]);
    expect(order.value).toBe("20"); // the fixture: the tile's own position
    expect(document.querySelector("form").noValidate).toBe(true); // the browser does not judge the steps (they start at 1, and 10 is a good number)
  });

  it("does not accept 0, or a number over 9999, or a fraction, or a negative one: it says so and keeps Save closed", async () => {
    await open("?id=13");
    for (const bad of ["0", "10000", "1.5", "-5", "99999"]) {
      type("Order", bad);
      expect(screen.getByText(`The position must be a whole number from ${ORDER_MIN} to ${ORDER_MAX}.`)).toBeTruthy();
      expect(save().disabled).toBe(true);
      fireEvent.keyDown(field("Title"), { key: "Enter" });
    }
    await settled();
    expect(writes()).toEqual([]);
  });

  it("accepts the smallest and the biggest number", async () => {
    await open("?id=13");
    for (const good of ["1", "9999", "25"]) {
      type("Order", good);
      expect(screen.queryByText(/The position must be a whole number/)).toBeNull();
      expect(save().disabled).toBe(false);
    }
  });

  it("an edit needs a number; a new tile may leave it empty (the server puts it at the end)", async () => {
    await open("?id=13");
    type("Order", "");
    expect(screen.getByText(/The position must be a whole number/)).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it("sends the number as a number, and only when it changed", async () => {
    await open("?id=13");
    type("Order", "35");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ display_order: 35 }]);
  });

  it("when another tile holds the number, shows the server's words under the box: who holds it and what is free", async () => {
    const words = "Position 20 is already used by 'Buntal Weaving'. Free positions next to it: 15 (just before it) and 25 (just after it).";
    state.failNext = { status: 400, body: { detail: words, display_order: [words] } };
    await open("?id=12");
    type("Order", "20");
    fireEvent.click(save());
    expect((await screen.findByTestId("error-display_order")).textContent).toBe(words);
    expect(field("Order").value).toBe("20"); // what was typed is still there
    expect(writes()).toHaveLength(1);
  });
});

describe("the counters and the limits", () => {
  it("count letters the way the server does (an emoji is one), and allow the most the section allows", async () => {
    await open("?id=12");
    const wave = "\u{1F30A}";
    type("Title", wave.repeat(HARD_LIMITS.why_visit.title));
    expect(field("Title").value.length).toBe(HARD_LIMITS.why_visit.title * 2); // the fixture: .length counts it twice
    expect(screen.getByTestId("count-title").textContent).toBe("60 / 60");
    expect(screen.queryByText(/Too long/)).toBeNull();
    expect(save().disabled).toBe(false);
    type("Title", wave.repeat(HARD_LIMITS.why_visit.title + 1));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(save().disabled).toBe(true);
    expect(field("Title").hasAttribute("maxlength")).toBe(false);
  });

  it("the limit is the one of the SECTION of the tile: a title of the Travel Guide may be 160", async () => {
    await open("?id=21");
    expect(items[2].section).toBe("travel_guide"); // the fixture
    type("Title", "a".repeat(160));
    expect(screen.getByTestId("count-title").textContent).toBe("160 / 160");
    expect(save().disabled).toBe(false);
    type("Title", "a".repeat(161));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(save().disabled).toBe(true);
    expect(screen.getByTestId("count-short_text").textContent).toMatch(/ \/ 400$/);
    expect(screen.getByTestId("count-full_text").textContent).toMatch(/ \/ 5000$/);
  });

  it("the short line is counted to 80 for the Why Visit, and the full text to 5000", async () => {
    await open("?id=12");
    expect(screen.getByTestId("count-short_text").textContent).toBe("17 / 80");
    type(SHORT, "s".repeat(81));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    type(SHORT, "s");
    type(FULL, "f".repeat(5001));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it("a required text that is empty says so, and keeps Save closed", async () => {
    await open("?id=12");
    type(SHORT, "   ");
    expect(screen.getByText("The short line is required.")).toBeTruthy();
    expect(save().disabled).toBe(true);
    type("Title", "");
    expect(screen.getByText("The title is required.")).toBeTruthy();
  });

  it("the full text may be empty", async () => {
    await open("?id=13");
    expect(items[1].full_text).not.toBe(""); // the fixture: it had a text
    type(FULL, "");
    expect(screen.queryByText(/The full text is required/)).toBeNull();
    expect(save().disabled).toBe(false);
  });
});

describe("the placeholders", () => {
  it("the title, the short line and the full text each have the three buttons of the fee, and never {name}", async () => {
    await open("?id=13");
    for (const word of ["title", "short line", "full text"]) {
      const names = within(group(word)).getAllByRole("button").map((button) => button.textContent);
      expect(names).toEqual(["{fee_regular}", "{fee_discounted}", "{fee_office}"]);
      expect(within(group(word)).queryByRole("button", { name: /\{name\}/ })).toBeNull();
    }
    expect(screen.queryByText("{name}")).toBeNull();
  });

  it("each button has the explanation of the server as its tooltip, and puts the placeholder where the caret is", async () => {
    await open("?id=12");
    const button = within(group("title")).getByRole("button", { name: "Put in {fee_office} in the title" });
    expect(button.title).toBe(FEE_NOTES.fee_office); // from the blocks, read once
    type("Title", "Pay at ");
    fireEvent.click(button);
    expect(field("Title").value).toBe("Pay at {fee_office}");
    fireEvent.click(within(group("full text")).getByRole("button", { name: /fee_regular/ }));
    expect(field(FULL).value).toBe("{fee_regular}");
    expect(field("Title").value).toBe("Pay at {fee_office}"); // the other box did not move
  });

  it("warns of a placeholder that is not on the list (the server will refuse it), and of a bracket without a partner", async () => {
    await open("?id=12");
    type(SHORT, "Hello {name}");
    expect(screen.getByTestId("warning-short_text").textContent).toMatch(/\{name\} is not one of the placeholders listed above/);
    expect(save().disabled).toBe(false); // a warning, not a refusal: the server decides
    type(FULL, "an open { bracket");
    expect(screen.getByTestId("warning-full_text").textContent).toMatch(/curly bracket/);
  });
});

describe("saving an edit", () => {
  it("sends ONE PATCH with only what changed, to the address of that tile, and no other request", async () => {
    await open("?id=12");
    const before = requests.length;
    type("Title", "Cagbalete");
    type(FULL, "A text.");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(requests.slice(before)).toEqual([{ method: "PATCH", path: "/mobile-content/items/12/", body: { title: "Cagbalete", full_text: "A text." } }]);
    expect(requests.some((r) => r.path.includes("emergency-contacts"))).toBe(false);
  });

  it("then shows what the server holds, the new heading, a closed Save, and the advice (the warnings) the server gave", async () => {
    state.warn = "The title is longer than about 24 letters, so the app may cut it off with “…”.";
    await open("?id=12");
    type("Title", "A title that is somewhat longer");
    fireEvent.click(save());
    expect(await screen.findByText(state.warn)).toBeTruthy();
    expect(screen.getByText(SAVED_NOTICE)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A title that is somewhat longer");
    expect(save().disabled).toBe(true);
    expect(screen.getByTestId("full-badge").textContent).toBe(BADGE_EMPTY);
  });

  it("sends nothing at all when nothing changed", async () => {
    await open();
    fireEvent.submit(document.querySelector("form"));
    await settled();
    expect(save().disabled).toBe(true); // the fixture
    expect(writes()).toEqual([]);
  });

  it("does not send a second request while the first is on its way", async () => {
    await open();
    type("Title", "Slow");
    let release;
    const real = global.fetch;
    global.fetch = jest.fn((url, options = {}) => {
      if (options.method === "PATCH") return new Promise((resolve) => (release = () => resolve(real(url, options))));
      return real(url, options);
    });
    fireEvent.click(save());
    await settled();
    expect(save().textContent).toBe("Saving...");
    expect(field("Title").disabled).toBe(true);
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    fireEvent.submit(document.querySelector("form"));
    release();
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
  });
});

describe("what is sent is the text as the server will clean it", () => {
  it("a line loses its extra spaces, a text loses the spaces at the end of its lines and its blank lines beyond one", async () => {
    await open("?id=12");
    type("Title", "  spaced    title  ");
    type(SHORT, "a\t\tline   here ");
    type(FULL, "first   \n\n\n\n\nsecond  \n  ");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "spaced title", short_text: "a line here", full_text: "first\n\nsecond" }]);
    expect(requests.length).toBe(3); // the fixture: the two GETs and this one PATCH
  });

  it("a text that only differs by spaces from the one the server holds is not a change", async () => {
    await open("?id=13");
    expect(items[1].full_text).toBe("Long text."); // the fixture
    type(FULL, "Long text.   \n\n\n");
    type("Title", "  Buntal    Weaving ");
    expect(save().disabled).toBe(true);
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    await settled();
    expect(writes()).toEqual([]);
  });

  it("a banner whose stored full text is not in the cleaned form still never has it sent", async () => {
    items[3].full_text = "Old   text  \n\n\n\nhere";
    await open("?id=22");
    expect(items[3].style).toBe("banner"); // the fixture: a banner that holds a text
    expect(field(FULL).disabled).toBe(true);
    type("Title", "Upcoming Fiesta 3");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "Upcoming Fiesta 3" }]);
  });
});

describe("a text that takes a fee placeholder out needs a confirmation (409)", () => {
  it("asks, and sends the same change again with the names when the person confirms", async () => {
    items[0].full_text = "Pay at {fee_office}";
    state.confirmNeeded = ["fee_office"];
    await open("?id=12");
    expect(items[0].full_text).toContain("{fee_office}"); // the fixture reached the case
    type(FULL, "No place now.");
    fireEvent.click(save());
    const question = await screen.findByRole("alertdialog", { name: "Confirm the change" });
    expect(within(question).getByText(/takes the place where the fee is paid out of the text/)).toBeTruthy();
    expect(writes()).toHaveLength(1);
    expect(save().disabled).toBe(true); // Save is closed while the question is on the screen
    expect(field(FULL).value).toBe("No place now."); // what was typed stays
    fireEvent.click(within(question).getByRole("button", { name: "Confirm" }));
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ full_text: "No place now." }, { full_text: "No place now.", confirm_dropped: ["fee_office"] }]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Cancel in the question sends nothing and keeps what was typed; Enter does not go round the question", async () => {
    state.confirmNeeded = ["fee_office"];
    await open("?id=12");
    type("Title", "Asked");
    fireEvent.click(save());
    const question = await screen.findByRole("alertdialog", { name: "Confirm the change" });
    fireEvent.keyDown(field("Title"), { key: "Enter" });
    fireEvent.submit(document.querySelector("form"));
    await settled();
    expect(writes()).toHaveLength(1);
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(field("Title").value).toBe("Asked");
    expect(writes()).toHaveLength(1);
  });
});

describe("what the server refuses is shown where it belongs, and nothing typed is lost", () => {
  it("a field error is shown under its field, exactly as the server said it", async () => {
    const words = "The title is 61 letters long. The most it can have here is 60.";
    state.failNext = { status: 400, body: { detail: words, title: [words] } };
    await open("?id=12");
    type("Title", "kept");
    fireEvent.click(save());
    expect((await screen.findByTestId("error-title")).textContent).toBe(words);
    expect(field("Title").value).toBe("kept");
    expect(screen.queryByText(SAVED_NOTICE)).toBeNull();
    type("Title", "kept too");
    expect(screen.queryByTestId("error-title")).toBeNull(); // typing clears the words that were about the old text
  });

  it("the errors of the other fields: the short line, the full text and the icon", async () => {
    for (const [fieldName, testId] of [["short_text", "error-short_text"], ["full_text", "error-full_text"], ["icon", "error-icon"]]) {
      const words = `The server says no to ${fieldName}.`;
      state.failNext = { status: 400, body: { detail: words, [fieldName]: [words] } };
      const view = await open("?id=12");
      type("Title", "x");
      fireEvent.click(save());
      expect((await screen.findByTestId(testId)).textContent).toBe(words);
      view.unmount();
    }
  });

  it("an answer that names no field is shown at the top, in the server's words, and the form is as it was", async () => {
    const words = "Only the system admin can manage the content of the mobile app.";
    state.failNext = { status: 403, body: { detail: words } };
    await open("?id=12");
    type("Title", "kept");
    fireEvent.click(save());
    const alert = await screen.findByText(words);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(field("Title").value).toBe("kept");
    expect(save().disabled).toBe(false); // it can be tried again
  });
});

describe("adding a tile", () => {
  it("sends one POST with the section, the title, the short line and the icon, and nothing that was not filled", async () => {
    await open("?section=why_visit");
    const before = requests.length;
    type("Title", "Fresh Seafood");
    type(SHORT, "Habhab & more");
    expect(field("Order").value).toBe(""); // the fixture: left empty
    fireEvent.click(save());
    await screen.findByText(ADDED_NOTICE);
    expect(requests.slice(before)).toEqual([
      { method: "POST", path: "/mobile-content/items/", body: { section: "why_visit", title: "Fresh Seafood", short_text: "Habhab & more", icon: "info" } },
    ]);
  });

  it("sends the icon, the full text and the position when they are filled", async () => {
    await open("?section=travel_guide");
    type("Title", "New card");
    type(SHORT, "A card");
    fireEvent.click(screen.getByRole("radio", { name: "festival" }));
    type(FULL, "The whole text.");
    type("Order", "70");
    fireEvent.click(save());
    await screen.findByText(ADDED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([
      { section: "travel_guide", title: "New card", short_text: "A card", icon: "festival", full_text: "The whole text.", display_order: 70 },
    ]);
  });

  it("sends the texts as the server will clean them", async () => {
    await open("?section=travel_guide");
    type("Title", "  New    card  ");
    type(SHORT, " a   line\t here ");
    type(FULL, "one   \n\n\n\ntwo  ");
    fireEvent.click(save());
    await screen.findByText(ADDED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([
      { section: "travel_guide", title: "New card", short_text: "a line here", icon: "info", full_text: "one\n\ntwo" },
    ]);
  });

  it("keeps Save closed until the title and the short line are there", async () => {
    await open("?section=why_visit");
    expect(save().disabled).toBe(true);
    type("Title", "Only a title");
    expect(save().disabled).toBe(true);
    type(SHORT, "and a line");
    expect(save().disabled).toBe(false);
  });

  it("after it is added the address names the tile (in place), the page is an edit of it, and nothing is read again", async () => {
    await open("?section=why_visit");
    type("Title", "Added tile");
    type(SHORT, "A line");
    fireEvent.click(save());
    await screen.findByText(ADDED_NOTICE);
    const made = items.find((candidate) => candidate.title === "Added tile");
    expect(made).toBeDefined(); // the fixture: the fake server made it
    expect(router.__changes().at(-1)).toEqual({ search: `id=${made.id}`, options: { replace: true } });
    expect(screen.getByText("Editing a tile")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Added tile");
    await settled();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /mobile-content/items/?section=why_visit",
      "GET /mobile-content/blocks/",
      "POST /mobile-content/items/",
    ]);
  });

  it("when the section is full, shows the server's words at the top and keeps everything typed", async () => {
    const words = "“Why Visit” already has the most items it can hold (40), counting the ones that are switched off. Edit one of those instead of adding a new one.";
    state.failNext = { status: 400, body: { detail: words } };
    await open("?section=why_visit");
    type("Title", "One too many");
    type(SHORT, "A line");
    fireEvent.click(save());
    const alert = await screen.findByText(words);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(field("Title").value).toBe("One too many");
    expect(field(SHORT).value).toBe("A line");
    expect(router.__changes()).toEqual([]); // and the address did not change
    expect(writes()).toHaveLength(1);
  });

  it("when the title is taken or the position is held, the words are under the field", async () => {
    const taken = "Another item of “Why Visit” already has this title (capitals and spaces do not count).";
    state.failNext = { status: 400, body: { detail: taken, title: [taken] } };
    await open("?section=why_visit");
    type("Title", "Cagbalete Island");
    type(SHORT, "x");
    fireEvent.click(save());
    expect((await screen.findByTestId("error-title")).textContent).toBe(taken);
  });
});

describe("nothing else is asked, and nothing of the other pages is touched", () => {
  it("a whole visit (open, type, save, confirm) makes only the requests of the page", async () => {
    state.confirmNeeded = ["fee_regular"];
    items[0].short_text = "Fee {fee_regular}";
    await open("?id=12");
    type(SHORT, "No fee here");
    fireEvent.click(save());
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await screen.findByText(SAVED_NOTICE);
    await settled();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /mobile-content/items/",
      "GET /mobile-content/blocks/",
      "PATCH /mobile-content/items/12/",
      "PATCH /mobile-content/items/12/",
    ]);
    expect(requests.some((r) => /emergency-contacts|bootstrap|reference/.test(r.path))).toBe(false);
  });

  it("the page has no delete: no button to remove a tile", async () => {
    await open("?id=12");
    expect(screen.queryByRole("button", { name: /delete|remove|burahin/i })).toBeNull();
  });

  it("does not say that anything happens in the app yet (the pressing of a tile is not in the app)", async () => {
    await open("?id=13");
    const text = document.body.textContent;
    expect(text).not.toMatch(/nangyayari na|already works|sa app ngayon/i);
  });
});

describe("the page does not touch the CSS of the pages that exist", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const part = CSS.slice(CSS.indexOf("MOBILE APP CONTENT: THE PAGE OF A TILE (Commit 6b)"));
  const rule = (selector) => {
    const start = part.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return part.slice(start, part.indexOf("\n}", start));
  };
  const decl = (selector, property) => {
    const found = rule(selector).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
    expect(found).not.toBeNull();
    return found[1].toLowerCase();
  };

  it("every rule of the page starts with a class of its own", () => {
    const selectors = part.split("\n").filter((line) => /^[.\[a-z].*[,{]$/.test(line) && !line.startsWith(" "));
    expect(selectors.length).toBeGreaterThan(15); // the fixture: the rules were found
    selectors.forEach((line) => expect(line).toMatch(/^\.mobile-content-/));
  });

  it("holds the values of the design: the heading, the back link, the icons, the boxes and the bottom", () => {
    expect(decl(".mobile-content-tile-page .reports-header h1", "font-size")).toBe("28px");
    expect(decl(".mobile-content-tile-page .reports-header h1", "font-weight")).toBe("800");
    expect(decl(".mobile-content-tile-page .reports-header h1", "letter-spacing")).toBe("-0.02em");
    expect(decl(".mobile-content-back", "font-size")).toBe("13px");
    expect(decl(".mobile-content-back", "font-weight")).toBe("600");
    expect(decl(".mobile-content-page .mobile-content-tile-card", "padding")).toBe("22px 24px");
    expect(decl(".mobile-content-icons", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(52px, 100%), 1fr))");
    expect(decl(".mobile-content-icons", "gap")).toBe("9px");
    expect(decl(".mobile-content-icons", "max-width")).toBe("460px");
    expect(decl(".mobile-content-icon-choice", "width")).toBe("100%");
    expect(decl(".mobile-content-icon-choice", "aspect-ratio")).toBe("1");
    expect(decl(".mobile-content-icon-choice", "border-radius")).toBe("11px");
    expect(decl(".mobile-content-icon-choice", "border")).toBe("1px solid #e8dbcb");
    expect(decl(".mobile-content-icon-choice", "background")).toBe("var(--th-surface)");
    expect(decl(".mobile-content-icon-choice:hover", "background")).toBe("#fbf4ec");
    expect(decl(".mobile-content-icon-choice:hover", "border-color")).toBe("#cdb295");
    expect(decl('.mobile-content-icon-choice[data-selected="true"]', "border")).toBe("2px solid var(--mc-teal)");
    expect(decl('.mobile-content-icon-choice[data-selected="true"]', "background")).toBe("#eaf3f1");
    expect(decl(".mobile-content-page .mobile-content-tile-order", "width")).toBe("160px");
    expect(decl(".mobile-content-page .mobile-content-tile-order input", "width")).toBe("160px");
  });
});
