import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RegistrationOptions from "./RegistrationOptions";
import { NO_ACTIVE_WARNING, RENAME_NOTE, renameQuestion } from "./BoatCapacityFarePanel";
import { REFERENCE_RENAME_EFFECT } from "./RegistrationOptions";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

// The fifth tab of Registration Options: the Boat Capacity and Fare tiers.
// A small fake of the server sits behind a fake fetch, so that the REAL
// tourismApi / apiRequest build the requests. Each test looks at what the person
// SEES and at what was SENT.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const NINE = [
  "1-2 pax (One-Way P1500, Two-way P2000)",
  "3-4 pax (One-Way P2000, Two-way P2,500)",
  "5-6 pax (One-Way P2,500, Two-way P3,000)",
  "7-8 pax (One-Way P3,000, Two-way P3,500)",
  "9-10 pax (One-Way P3,500, Two-way P4,000)",
  "11-12 pax (One-Way P4,000, Two-way P4,500)",
  "13-14 pax (One-Way P4,500, Two-way P5,000)",
  "15-17 pax (One-Way P5,000, Two-way P5,500)",
  "18-20 pax (One-Way P5,500, Two-way P6,000)",
];
const FARE_TAB = "Boat Capacity and Fare";

let fares;
let lists;
let requests;
let refreshReferenceTables;
let failNext;
let answerWith;

const tier = (id, name, display_order, record_count, extra = {}) => ({
  id, name, display_order, is_active: true, record_count, ...extra,
});

// NOT the built-in nine: different texts, ids that run against the order, one
// retired, and counts that differ so that no two rows can be swapped unseen.
function freshFares() {
  return [
    tier(12, "Mike 1-2 pax (One-Way P1000, Two-way P1400)", 10, 3),
    tier(5, "Tango 3-4 pax (One-Way P2000, Two-way P2400)", 20, 0),
    tier(41, "Romeo 5-6 pax (One-Way P3000, Two-way P3400)", 30, 2, { is_active: false }),
    tier(7, "Sierra 7-8 pax (One-Way P4000, Two-way P4400)", 40, 1),
  ];
}

const row = (id, name, extra = {}) => ({ id, name, is_active: true, record_count: 0, rename_protected: false, ...extra });
function freshLists() {
  return {
    itinerary: [row(1, "Overnight", { stay_nights: 1, record_count: 3 }), row(2, "Same Day", { stay_nights: 0, record_count: 5 })],
    "travel-mode": [row(1, "Private Vehicle", { record_count: 10 }), row(3, "Public Bus", { record_count: 6 })],
    "boat-type": [row(1, "Tourist Boat", { record_count: 11, requires_capacity_fare: true }), row(2, "Passenger Boat", { record_count: 7, requires_capacity_fare: false })],
    "visit-purpose": [row(1, "Leisure", { record_count: 4 }), row(2, "Vacation", { record_count: 9, is_active: false })],
  };
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

const ordered = () => [...fares].sort((a, b) => a.display_order - b.display_order || a.id - b.id);

function fakeFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^.*\/api/, "");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });

  if (failNext) {
    const failure = failNext;
    failNext = null;
    return reply(failure.status, failure.body);
  }
  if (answerWith && answerWith.match(method, path)) {
    const answer = answerWith;
    answerWith = null;
    return reply(answer.status || 200, answer.body);
  }

  const refs = path.match(/^\/reference-options\/([a-z-]+)\/$/);
  if (refs) return lists[refs[1]] ? reply(200, lists[refs[1]]) : reply(404, { detail: "unknown kind" });
  const refAction = path.match(/^\/reference-options\/([a-z-]+)\/(\d+)\/(deactivate|reactivate)\/$/);
  if (refAction) {
    const option = (lists[refAction[1]] || []).find((o) => o.id === Number(refAction[2]));
    if (!option) return reply(404, { detail: "no such option" });
    option.is_active = refAction[3] === "reactivate";
    return reply(200, option);
  }

  const m = path.match(/^\/boat-capacity-fares\/(?:(\d+)\/|(reorder)\/)?(deactivate\/|reactivate\/)?$/);
  if (!m) return reply(404, { detail: "no such route" });
  const [, idText, reorder, action] = m;

  if (reorder) {
    body.ids.forEach((id, position) => {
      fares.find((f) => f.id === id).display_order = (position + 1) * 10;
    });
    return reply(200, ordered());
  }
  if (!idText) {
    if (method === "GET") return reply(200, ordered());
    if (method === "POST") {
      const created = tier(Math.max(...fares.map((f) => f.id)) + 1, body.name.trim(), Math.max(...fares.map((f) => f.display_order)) + 10, 0);
      fares.push(created);
      return reply(201, created);
    }
    return reply(405, { detail: "method not allowed" });
  }
  const found = fares.find((f) => f.id === Number(idText));
  if (!found) return reply(404, { detail: "no such tier" });
  if (action === "deactivate/") {
    found.is_active = false;
    return reply(200, found);
  }
  if (action === "reactivate/") {
    found.is_active = true;
    return reply(200, found);
  }
  if (method === "PATCH") {
    if (found.record_count > 0 && body.confirm_affected_records !== found.record_count) {
      return reply(409, {
        detail: `The text of this tier is saved on ${found.record_count} record(s). Renaming the tier does not change them. To go on, send confirm_affected_records: ${found.record_count}.`,
        code: "confirm_required",
        record_count: found.record_count,
      });
    }
    found.name = body.name.trim();
    found.record_count = 0; // nobody holds the new text; the records stay on the old one
    return reply(200, found);
  }
  return reply(405, { detail: "method not allowed" });
}

let boatTypes;
beforeEach(() => {
  fares = freshFares();
  lists = freshLists();
  requests = [];
  failNext = null;
  answerWith = null;
  boatTypes = [
    { id: 1, name: "Tourist Boat", requires_capacity_fare: true, is_active: true },
    { id: 2, name: "Passenger Boat", requires_capacity_fare: false, is_active: true },
  ];
  refreshReferenceTables = jest.fn();
  useAuth.mockReturnValue({ role: "admin" });
  useTourismData.mockImplementation(() => ({ refreshReferenceTables, referenceTables: { boatTypes } }));
  global.fetch = jest.fn(fakeFetch);
});

const fareGets = () => requests.filter((r) => r.method === "GET" && r.path === "/boat-capacity-fares/");
const fareWrites = () => requests.filter((r) => r.path.startsWith("/boat-capacity-fares/") && r.method !== "GET");
const rowOf = (id) => screen.getByTestId(`fare-row-${id}`);
const shownOrder = () =>
  screen.getAllByTestId(/^fare-row-/).map((r) => Number(r.getAttribute("data-testid").replace("fare-row-", "")));

async function openFareTab() {
  render(<RegistrationOptions />);
  await screen.findByRole("table"); // the first tab
  fireEvent.click(screen.getByRole("tab", { name: FARE_TAB }));
  await waitFor(() => expect(screen.getByRole("tab", { name: FARE_TAB }).getAttribute("aria-selected")).toBe("true"));
  await screen.findByTestId("fare-row-12");
}

describe("the tab and what it lists", () => {
  it("is the fifth tab of the same page, and asks the server for the tiers once, when it is opened", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getAllByRole("tab")[4].textContent).toBe(FARE_TAB);
    expect(fareGets()).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: FARE_TAB }));
    await screen.findByTestId("fare-row-12");
    expect(fareGets()).toHaveLength(1);
  });

  it("a) shows THE SERVER's list: its order, its extra and retired tiers, not the built-in nine", async () => {
    await openFareTab();
    expect(shownOrder()).toEqual([12, 5, 41, 7]); // by display_order, against the ids
    expect(within(rowOf(12)).getByText("Mike 1-2 pax (One-Way P1000, Two-way P1400)")).toBeTruthy();
    expect(within(rowOf(12)).getByText("10")).toBeTruthy();
    expect(within(rowOf(12)).getByText("3 records")).toBeTruthy();
    expect(within(rowOf(5)).getByText("0 records")).toBeTruthy();
    expect(within(rowOf(41)).getByText("2 records")).toBeTruthy();
    expect(within(rowOf(7)).getByText("1 record")).toBeTruthy();
    expect(within(rowOf(12)).getByText("Active")).toBeTruthy();
    expect(within(rowOf(41)).getByText("Inactive")).toBeTruthy();
    NINE.forEach((text) => expect(screen.queryByText(text)).toBeNull());
    expect(rowOf(41).className).toContain("options-row-inactive");
  });

  it("has NO yellow box of notices: neither the 'saved as text' paragraph nor the 'older version of the app' paragraph is on the tab", async () => {
    await openFareTab();
    expect(document.querySelector(".hotlines-notices")).toBeNull();
    expect(screen.queryByRole("note", { name: /about the boat capacity and fare tiers/i })).toBeNull();
    expect(screen.queryByText(/saved as text on each record/i)).toBeNull();
    expect(screen.queryByText(/older version of the app/i)).toBeNull();
    // the tab itself did load: the fixture reached the table
    expect(screen.getByTestId("fare-row-12")).toBeTruthy();
  });

  it("has NO reminder line either: nothing about a tier being deactivated or never deleted", async () => {
    await openFareTab();
    expect(screen.getByTestId("fare-row-12")).toBeTruthy(); // the fixture: the tab is drawn
    expect(document.querySelector(".options-intro")).toBeNull();
    expect(screen.queryByText(/no longer offered/i)).toBeNull();
    expect(screen.queryByText(/never deleted/i)).toBeNull();
    // and no blank band: the place for a message is empty, so the stylesheet draws nothing for it
    expect(document.querySelector(".boat-fare-panel .options-message-area").matches(":empty")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Tango/ }));
    await within(rowOf(5)).findByText("Inactive");
    expect(screen.queryByText(/never deleted/i)).toBeNull();
    expect(document.querySelector(".hotlines-notices")).toBeNull();
  });

  it("this tab has exactly ONE 'Add option' button, in the page header, and it is the fare tab's own: it opens the TIER form, not the shell's option form", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    expect(screen.getAllByRole("button", { name: /add option/i })).toHaveLength(1); // the fixture: the first tab has its own
    fireEvent.click(screen.getByRole("tab", { name: FARE_TAB }));
    await screen.findByTestId("fare-row-12");
    expect(screen.getAllByRole("button", { name: /add option/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.getByLabelText("New tier text")).toBeTruthy();
    expect(screen.queryByLabelText("New option name")).toBeNull();
  });
});

describe("the fare tab's 'Add option' is the same button as the other tabs' 'Add option' and 'Add contact': in the header, to the right of the title", () => {
  const fs = require("fs");
  const path = require("path");

  it("is a direct child of .reports-actions inside .reports-header, with the class and the icon of 'Add option', and not inside the panel", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    const optionButton = screen.getByRole("button", { name: /add option/i });
    fireEvent.click(screen.getByRole("tab", { name: FARE_TAB }));
    await screen.findByTestId("fare-row-12");

    const button = screen.getByRole("button", { name: /add option/i });
    expect(button.parentElement.className).toBe("reports-actions");
    expect(button.parentElement.parentElement.className).toBe("reports-header");
    expect(button.className).toBe("green");
    expect(optionButton.className).toBe("green"); // the fixture: the class is that of the button of the other tabs
    expect(button.querySelector("svg")).not.toBeNull(); // the + icon
    expect(button.closest(".boat-fare-panel")).toBeNull();
    expect(document.querySelector(".boat-fare-panel").querySelectorAll(".options-form-actions")).toHaveLength(0);

    // to the right of the title: the header holds the title block first, then the actions
    const header = button.closest(".reports-header");
    expect([...header.children].map((el) => el.className || el.tagName.toLowerCase())).toEqual(["div", "reports-actions"]);
    expect(within(header.firstElementChild).getByRole("heading", { name: "Registration Options" })).toBeTruthy();
  });

  it("comes before the table in the page, and nothing is drawn over it", async () => {
    await openFareTab();
    const button = screen.getByRole("button", { name: /add option/i });
    const table = screen.getByRole("table");
    expect(button.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.contains(button)).toBe(false);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("matches the Add contact button of Emergency Hotlines (now at the top of its panel): the same button class and icon (read from that file's source)", () => {
    const hotlines = fs.readFileSync(path.join(__dirname, "EmergencyHotlines.js"), "utf8");
    expect(hotlines).toMatch(/<div className="options-form-actions">\s*<div className="reports-actions">\s*<button type="button" className="green"[^>]*>\s*<FiPlus \/>\s*Add contact/);
    const options = fs.readFileSync(path.join(__dirname, "RegistrationOptions.js"), "utf8");
    expect(options).toMatch(/<div className="reports-actions">[\s\S]*?<button type="button" className="green" onClick=\{\(\) => fareRef\.current\?\.toggleAdd\(\)\} disabled=\{fareWorking\}>\s*<FiPlus \/>\s*Add option/);
  });

  it("opens and closes the add form (a second click closes it), and the form is not the button's job", async () => {
    await openFareTab();
    expect(screen.queryByLabelText("New tier text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.getByLabelText("New tier text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.queryByLabelText("New tier text")).toBeNull();
  });

  it("closes an edit form that is open: only one form at a time", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Edit Sierra/ }));
    expect(screen.getByRole("form", { name: /^Edit Sierra/ })).toBeTruthy(); // the fixture: the edit form is open
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.queryByRole("form", { name: /^Edit Sierra/ })).toBeNull();
    expect(screen.getByLabelText("New tier text")).toBeTruthy();
  });

  it("is disabled while a write is in flight, and enabled again after the answer", async () => {
    await openFareTab();
    const button = screen.getByRole("button", { name: /add option/i });
    expect(button.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Tango/ }));
    await waitFor(() => expect(button.disabled).toBe(true));
    await within(rowOf(5)).findByText("Inactive");
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("on the other tabs the 'Add option' button is the shell's own: one button, and it opens the option form, not the tier form", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("tab", { name: "Visit Purpose" }));
    await screen.findByLabelText("Filter by status");
    expect(screen.getAllByRole("button", { name: /add option/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.getByLabelText("New option name")).toBeTruthy();
    expect(screen.queryByLabelText("New tier text")).toBeNull();
  });
});

describe("each action: what is shown afterwards AND what was sent", () => {
  it("add: sends only the text, then shows the row the server made, last", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: "  Whiskey 9-10 pax (One-Way P5000)  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    await screen.findByText("Whiskey 9-10 pax (One-Way P5000)");

    expect(fareWrites()).toEqual([{ method: "POST", path: "/boat-capacity-fares/", body: { name: "  Whiskey 9-10 pax (One-Way P5000)  " } }]);
    expect(shownOrder()).toEqual([12, 5, 41, 7, 42]); // the server gave id 42 and order 50
    expect(within(screen.getByTestId("fare-row-42")).getByText("50")).toBeTruthy();
    expect(refreshReferenceTables).toHaveBeenCalledTimes(1);
  });

  it("add: what is shown is the SERVER's answer, not what was typed", async () => {
    await openFareTab();
    answerWith = {
      match: (method, path) => method === "POST" && path === "/boat-capacity-fares/",
      status: 201,
      body: tier(60, "Name As The Server Kept It", 5, 4),
    };
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: "typed text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    await screen.findByText("Name As The Server Kept It");
    expect(screen.queryByText("typed text")).toBeNull();
    expect(shownOrder()).toEqual([60, 12, 5, 41, 7]); // order 5 puts it first
    expect(within(screen.getByTestId("fare-row-60")).getByText("4 records")).toBeTruthy();
  });

  it("rename of an unused tier: sends only the name, then shows the server's answer", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Edit Tango/ }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Tango renamed 3-4 pax" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await within(rowOf(5)).findByText("Tango renamed 3-4 pax");

    expect(fareWrites()).toEqual([{ method: "PATCH", path: "/boat-capacity-fares/5/", body: { name: "Tango renamed 3-4 pax" } }]);
    expect(shownOrder()).toEqual([12, 5, 41, 7]);
    expect(refreshReferenceTables).toHaveBeenCalledTimes(1);
  });

  it("rename: what is shown is the server's version of the name", async () => {
    await openFareTab();
    answerWith = {
      match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/5/",
      body: tier(5, "The Server Tidied This Name", 20, 0),
    };
    fireEvent.click(screen.getByRole("button", { name: /^Edit Tango/ }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "  messy   name " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await within(rowOf(5)).findByText("The Server Tidied This Name");
    expect(screen.queryByText("messy name")).toBeNull();
  });

  it("deactivate: sends one POST and the row becomes Inactive from the answer", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("Inactive");
    expect(fareWrites()).toEqual([{ method: "POST", path: "/boat-capacity-fares/12/deactivate/", body: null }]);
    expect(within(rowOf(12)).getByText("3 records")).toBeTruthy(); // the records are untouched
    expect(screen.getByRole("button", { name: /^Reactivate Mike/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Deactivate Mike/ })).toBeNull();
  });

  it("reactivate: sends one POST and the row becomes Active from the answer", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Reactivate Romeo/ }));
    await within(rowOf(41)).findByText("Active");
    expect(fareWrites()).toEqual([{ method: "POST", path: "/boat-capacity-fares/41/reactivate/", body: null }]);
    expect(rowOf(41).className).not.toContain("options-row-inactive");
  });

  it("move up: sends the WHOLE list of ids with the two swapped, and the screen follows", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Move Tango .* up$/ }));
    await waitFor(() => expect(shownOrder()).toEqual([5, 12, 41, 7]));
    expect(fareWrites()).toEqual([{ method: "POST", path: "/boat-capacity-fares/reorder/", body: { ids: [5, 12, 41, 7] } }]);
  });

  it("move down: the whole list again, the inactive tier included", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Move Mike .* down$/ }));
    await waitFor(() => expect(shownOrder()).toEqual([5, 12, 41, 7]));
    const [write] = fareWrites();
    expect(write.body.ids).toEqual([5, 12, 41, 7]);
    expect(write.body.ids).toHaveLength(4); // all four, the retired one too
    expect(write.body.ids).toContain(41);
  });

  it("move: the order shown is the order the SERVER answered, not the one asked for", async () => {
    await openFareTab();
    answerWith = {
      match: (method, path) => path === "/boat-capacity-fares/reorder/",
      body: [tier(7, "Sierra 7-8 pax (One-Way P4000, Two-way P4400)", 10, 1), tier(12, "Mike 1-2 pax (One-Way P1000, Two-way P1400)", 20, 3),
             tier(41, "Romeo 5-6 pax (One-Way P3000, Two-way P3400)", 30, 2, { is_active: false }), tier(5, "Tango 3-4 pax (One-Way P2000, Two-way P2400)", 40, 0)],
    };
    fireEvent.click(screen.getByRole("button", { name: /^Move Tango .* up$/ }));
    await waitFor(() => expect(shownOrder()).toEqual([7, 12, 41, 5]));
  });
});

describe("no second fetch, no Loading... after the first open", () => {
  it("c) counts the calls: exactly ONE GET of the tiers however many successful actions follow", async () => {
    await openFareTab();
    expect(fareGets()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("Inactive");
    fireEvent.click(screen.getByRole("button", { name: /^Reactivate Mike/ }));
    await waitFor(() => expect(within(rowOf(12)).getByText("Active")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^Move Tango .* up$/ }));
    await waitFor(() => expect(shownOrder()).toEqual([5, 12, 41, 7]));
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: "One more" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    await screen.findByText("One more");
    fireEvent.click(screen.getByRole("button", { name: /^Edit Sierra/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fareWrites()).toHaveLength(4);
    expect(fareGets()).toHaveLength(1); // still one
    expect(requests.filter((r) => r.method === "GET" && r.path.startsWith("/boat-capacity-fares/"))).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("does not show Loading... straight after a click, before the answer comes", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Tango/ }));
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(shownOrder()).toEqual([12, 5, 41, 7]);
    await within(rowOf(5)).findByText("Inactive");
  });

  it("coming back to the tab after another tab shows the list as it was: no new GET, no Loading", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("Inactive");

    fireEvent.click(screen.getByRole("tab", { name: "Visit Purpose" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Visit Purpose" }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(screen.getByRole("tab", { name: FARE_TAB }));
    await waitFor(() => expect(screen.getByRole("tab", { name: FARE_TAB }).getAttribute("aria-selected")).toBe("true"));

    expect(within(rowOf(12)).getByText("Inactive")).toBeTruthy(); // what the server said earlier
    expect(fareGets()).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("refreshes the record form's tables in the background after a success, and not after a refusal", async () => {
    await openFareTab();
    failNext = { status: 500, body: { detail: "The database is busy." } };
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await screen.findByText("The database is busy.");
    expect(refreshReferenceTables).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("Inactive");
    expect(refreshReferenceTables).toHaveBeenCalledTimes(1);
  });
});

describe("a failed write", () => {
  it("changes nothing in the list and shows the server's words", async () => {
    await openFareTab();
    failNext = { status: 400, body: { detail: "Another tier already has this name (capitals and spaces do not count)." } };
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: "Mike 1-2 pax (One-Way P1000, Two-way P1400)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    expect(await screen.findByText(/already has this name/)).toBeTruthy();
    expect(shownOrder()).toEqual([12, 5, 41, 7]);
    expect(screen.getByLabelText("New tier text").value).toBe("Mike 1-2 pax (One-Way P1000, Two-way P1400)"); // nothing typed is lost
    expect(fareWrites()).toHaveLength(1);
  });
});

const patches = () => requests.filter((r) => r.method === "PATCH");
const editFormOf = (name) => screen.getByRole("form", { name: `Edit ${name}` });
const openEdit = async (namePattern) => {
  fireEvent.click(screen.getByRole("button", { name: namePattern }));
};

describe("C) renaming a tier that records hold: the server's number, asked, confirmed", () => {
  const MIKE = "Mike 1-2 pax (One-Way P1000, Two-way P1400)";

  it("c) nobody holds the text: it goes straight through, with nothing asked and no confirmation sent", async () => {
    await openFareTab();
    await openEdit(/^Edit Tango/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Tango renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await within(rowOf(5)).findByText("Tango renamed");
    expect(patches()).toEqual([{ method: "PATCH", path: "/boat-capacity-fares/5/", body: { name: "Tango renamed" } }]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(patches()[0].body).not.toHaveProperty("confirm_affected_records");
  });

  it("the first try carries NO confirmation, even though the table says records hold the text", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alertdialog");
    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toEqual({ name: "Mike renamed" });
  });

  it("asks the question with the SERVER's number, in the words given, and changes nothing yet", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "3 record(s) hold the old text. They will keep it, and it will show as (not in the list). The tier itself will be renamed. Continue?"
    );
    expect(renameQuestion(3)).toBe(
      "3 record(s) hold the old text. They will keep it, and it will show as (not in the list). The tier itself will be renamed. Continue?"
    );
    expect(within(rowOf(12)).getByText(MIKE)).toBeTruthy(); // not renamed yet
    expect(document.body.textContent).not.toContain("confirm_required");
    expect(refreshReferenceTables).not.toHaveBeenCalled();
  });

  it("a) THE SERVER'S NUMBER WINS: the screen says 3, the server says 5, and 5 is what is confirmed", async () => {
    await openFareTab();
    expect(within(rowOf(12)).getByText("3 records")).toBeTruthy(); // what the page shows
    answerWith = {
      match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/12/",
      status: 409,
      body: { detail: "Held.", code: "confirm_required", record_count: 5 },
    };
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("5 record(s) hold the old text");
    expect(dialog.textContent).not.toContain("3 record(s)");

    answerWith = {
      match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/12/",
      body: tier(12, "Mike renamed", 10, 0),
    };
    fireEvent.click(screen.getByRole("button", { name: "Yes, rename" }));
    await within(rowOf(12)).findByText("Mike renamed");
    expect(patches()).toHaveLength(2);
    expect(patches()[1].body).toEqual({ name: "Mike renamed", confirm_affected_records: 5 }); // NOT 3
    expect(patches()[1].body.confirm_affected_records).not.toBe(3);
  });

  it("what is confirmed is the number the admin was ASKED about, even if the row changes while the question is open", async () => {
    await openFareTab();
    answerWith = {
      match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/12/",
      status: 409,
      body: { detail: "Held.", code: "confirm_required", record_count: 5 },
    };
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alertdialog")).textContent).toContain("5 record(s) hold the old text");

    // While the question is open, another action replaces the row with a newer answer that says 7.
    answerWith = {
      match: (method, path) => method === "POST" && path === "/boat-capacity-fares/12/deactivate/",
      body: tier(12, "Mike 1-2 pax (One-Way P1000, Two-way P1400)", 10, 7, { is_active: false }),
    };
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("7 records");

    // The question still says what the admin was asked: 5. Not the 7 the table now shows.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("5 record(s) hold the old text");
    expect(dialog.textContent).not.toContain("7 record(s)");

    answerWith = { match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/12/", body: tier(12, "Mike renamed", 10, 0, { is_active: false }) };
    fireEvent.click(screen.getByRole("button", { name: "Yes, rename" }));
    await within(rowOf(12)).findByText("Mike renamed");
    expect(patches()[1].body).toEqual({ name: "Mike renamed", confirm_affected_records: 5 }); // the number asked, not 7
  });

  it("b) refused twice: 3 and then 4. The question is asked again with 4, and the third try sends 4, not 3", async () => {
    await openFareTab();
    const refusal = (n) => ({
      match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/12/",
      status: 409,
      body: { detail: "Held.", code: "confirm_required", record_count: n },
    });
    answerWith = refusal(3);
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alertdialog")).textContent).toContain("3 record(s) hold the old text");

    answerWith = refusal(4); // a booking came in meanwhile: the server now says 4
    fireEvent.click(screen.getByRole("button", { name: "Yes, rename" }));
    await waitFor(() => expect(screen.getByRole("alertdialog").textContent).toContain("4 record(s) hold the old text"));
    expect(screen.getByRole("alertdialog").textContent).not.toContain("3 record(s)");
    expect(patches()).toHaveLength(2); // asked again, NOT resent on its own
    expect(patches()[1].body).toEqual({ name: "Mike renamed", confirm_affected_records: 3 });
    expect(within(rowOf(12)).getByText("4 records")).toBeTruthy(); // the row takes the server's new number too

    answerWith = { match: (method, path) => method === "PATCH" && path === "/boat-capacity-fares/12/", body: tier(12, "Mike renamed", 10, 0) };
    fireEvent.click(screen.getByRole("button", { name: "Yes, rename" }));
    await within(rowOf(12)).findByText("Mike renamed");
    expect(patches()).toHaveLength(3);
    expect(patches()[2].body).toEqual({ name: "Mike renamed", confirm_affected_records: 4 }); // the NEW number
  });

  it("the whole way with the real count: the answer replaces the row, which then shows 0 records, and the form closes", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Yes, rename" }));
    await within(rowOf(12)).findByText("Mike renamed");

    expect(patches().map((p) => p.body)).toEqual([
      { name: "Mike renamed" },
      { name: "Mike renamed", confirm_affected_records: 3 },
    ]);
    expect(within(rowOf(12)).getByText("0 records")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("form", { name: /^Edit / })).toBeNull();
    expect(screen.getByText("The tier was renamed.")).toBeTruthy();
    expect(refreshReferenceTables).toHaveBeenCalledTimes(1);
    expect(fareGets()).toHaveLength(1); // no refetch
  });

  it("'Back' withdraws the question and sends nothing more", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(patches()).toHaveLength(1);
    expect(within(rowOf(12)).getByText(MIKE)).toBeTruthy();
  });

  it("an error that is not a confirmation request shows its words, in the form, and no question", async () => {
    await openFareTab();
    failNext = { status: 400, body: { detail: "Another tier already has this name (capitals and spaces do not count)." } };
    await openEdit(/^Edit Tango/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike 1-2 pax (One-Way P1000, Two-way P1400)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/already has this name/)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(editFormOf("Tango 3-4 pax (One-Way P2000, Two-way P2400)").textContent).toContain("already has this name");
  });
});

describe("e) the note in the edit form says what is true now", () => {
  it("says records keep the old text and that a confirmation will be asked: it no longer says 'cannot be renamed'", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    expect(screen.getByText(RENAME_NOTE)).toBeTruthy();
    expect(RENAME_NOTE).toMatch(/keep it/);
    expect(RENAME_NOTE).toMatch(/confirm/);
    expect(RENAME_NOTE).not.toMatch(/cannot be renamed/i);
    expect(document.body.textContent).not.toMatch(/cannot be renamed/i);
    expect(document.body.textContent).not.toMatch(/hold this exact text/);
  });

  it("does not show that note for a tier nobody holds", async () => {
    await openFareTab();
    await openEdit(/^Edit Tango/);
    expect(screen.queryByText(RENAME_NOTE)).toBeNull();
  });
});

describe("d) ONE message, in the form", () => {
  it("a refused save shows its words once, inside the form, with nothing at the top of the page", async () => {
    await openFareTab();
    failNext = { status: 500, body: { detail: "The database is busy. Try again." } };
    await openEdit(/^Edit Tango/);
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Tango other" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("The database is busy. Try again.");
    expect(screen.getAllByText("The database is busy. Try again.")).toHaveLength(1);
    const form = editFormOf("Tango 3-4 pax (One-Way P2000, Two-way P2400)");
    expect(form.contains(screen.getByText("The database is busy. Try again."))).toBe(true);
    expect(document.querySelector(".options-message-area .settings-status.error")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("in the form there is only ever one of: the note, the question, the refusal", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    const form = () => editFormOf(MIKE_NAME);
    const MIKE_NAME = "Mike 1-2 pax (One-Way P1000, Two-way P1400)";
    const boxes = () => form().querySelectorAll('[role="note"], [role="alert"], [role="alertdialog"]');
    expect(boxes()).toHaveLength(1); // the note
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alertdialog");
    expect(boxes()).toHaveLength(1); // the question replaced the note
    expect(screen.queryByText(RENAME_NOTE)).toBeNull();
    failNext = { status: 500, body: { detail: "The database is busy. Try again." } };
    fireEvent.click(screen.getByRole("button", { name: "Yes, rename" }));
    await screen.findByText("The database is busy. Try again.");
    expect(boxes()).toHaveLength(1); // the refusal replaced the question
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a refused ADD shows its words once, inside the add form", async () => {
    await openFareTab();
    failNext = { status: 400, body: { detail: "Another tier already has this name (capitals and spaces do not count)." } };
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    await screen.findByText(/already has this name/);
    expect(screen.getAllByText(/already has this name/)).toHaveLength(1);
    expect(screen.getByRole("form", { name: "Add a tier" }).textContent).toContain("already has this name");
    expect(document.querySelector(".options-message-area .settings-status.error")).toBeNull();
  });

  it("an action outside a form (deactivate) still shows its refusal at the top", async () => {
    await openFareTab();
    failNext = { status: 500, body: { detail: "The database is busy. Try again." } };
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await screen.findByText("The database is busy. Try again.");
    expect(document.querySelector(".options-message-area .settings-status.error")).not.toBeNull();
  });
});

describe("the edit form is at the TOP, and the cursor is in it", () => {
  let scrolled;
  beforeEach(() => {
    scrolled = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrolled;
  });
  afterEach(() => {
    delete window.HTMLElement.prototype.scrollIntoView;
  });

  it("comes before the table in the page, is scrolled into view, and has the cursor in the name field", async () => {
    await openFareTab();
    await openEdit(/^Edit Sierra/);
    const form = editFormOf("Sierra 7-8 pax (One-Way P4000, Two-way P4400)");
    const table = screen.getByRole("table");
    expect(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the form first
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.instances[0]).toBe(form);
    expect(document.activeElement).toBe(screen.getByLabelText("Tier text"));
  });

  it("does the same each time Edit is pressed, on another row too", async () => {
    await openFareTab();
    await openEdit(/^Edit Mike/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openEdit(/^Edit Tango/);
    expect(scrolled).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByLabelText("Tier text"));
    expect(screen.getByLabelText("Tier text").value).toBe("Tango 3-4 pax (One-Way P2000, Two-way P2400)");
  });
});

describe("D) the words differ between the fare tab and the four other tabs", () => {
  it("the fare question says the records KEEP the old text; the four tabs say the records show the NEW name", () => {
    const fareText = renameQuestion(3);
    expect(fareText).toMatch(/keep it/);
    expect(fareText).toMatch(/not in the list/);
    expect(fareText).not.toContain(REFERENCE_RENAME_EFFECT);
    expect(REFERENCE_RENAME_EFFECT).toBe("all records using this option will now show the new name");
    expect(REFERENCE_RENAME_EFFECT).not.toMatch(/keep/);
    expect(fareText).not.toBe(REFERENCE_RENAME_EFFECT);
  });
});

describe("g) the ends of the list", () => {
  it("the first tier's Up and the last tier's Down are disabled, the others are not", async () => {
    await openFareTab();
    const button = (name) => screen.getByRole("button", { name });
    expect(button(/^Move Mike .* up$/).disabled).toBe(true);
    expect(button(/^Move Mike .* down$/).disabled).toBe(false);
    expect(button(/^Move Sierra .* up$/).disabled).toBe(false);
    expect(button(/^Move Sierra .* down$/).disabled).toBe(true);
    expect(button(/^Move Tango .* up$/).disabled).toBe(false);
    expect(button(/^Move Romeo .* down$/).disabled).toBe(false);
  });

  it("the buttons follow the new order", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Move Tango .* up$/ }));
    await waitFor(() => expect(shownOrder()).toEqual([5, 12, 41, 7]));
    expect(screen.getByRole("button", { name: /^Move Tango .* up$/ }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /^Move Mike .* up$/ }).disabled).toBe(false);
  });

  it("while the list is filtered, the arrows are disabled and the page says why", async () => {
    await openFareTab();
    fireEvent.change(screen.getByLabelText("Filter tiers by status"), { target: { value: "active" } });
    expect(shownOrder()).toEqual([12, 5, 7]);
    screen.getAllByRole("button", { name: /^Move .* (up|down)$/ }).forEach((b) => expect(b.disabled).toBe(true));
    expect(screen.getByText(/only be changed while all tiers are shown/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter tiers by status"), { target: { value: "inactive" } });
    expect(shownOrder()).toEqual([41]);
    expect(fareGets()).toHaveLength(1); // filtering is on the screen only
  });
});

describe("d) there is no delete", () => {
  it("no delete or remove button anywhere in the panel, and no DELETE request after using every control", async () => {
    await openFareTab();
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("Inactive");
    fireEvent.click(screen.getByRole("button", { name: /^Edit Sierra/ }));
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    expect(requests.filter((r) => r.method === "DELETE")).toEqual([]);
    expect(new Set(requests.map((r) => r.method))).toEqual(new Set(["GET", "POST"]));
  });
});

describe("e) the warning when no tier is active", () => {
  const deactivateAll = async () => {
    for (const name of [/^Deactivate Mike/, /^Deactivate Tango/, /^Deactivate Sierra/]) {
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(screen.queryByRole("button", { name })).toBeNull());
    }
  };

  it("APPEARS when no tier is active and a boat type still asks for the field", async () => {
    await openFareTab();
    expect(screen.queryByText(NO_ACTIVE_WARNING)).toBeNull(); // three tiers are active
    await deactivateAll();
    expect(screen.getByText(NO_ACTIVE_WARNING)).toBeTruthy();
    expect(screen.getByText(NO_ACTIVE_WARNING).getAttribute("role")).toBe("alert"); // it is announced, not hidden
    expect(NO_ACTIVE_WARNING).toMatch(/empty dropdown/);
  });

  it("does NOT appear while at least one tier is active", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Mike/ }));
    await within(rowOf(12)).findByText("Inactive");
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Tango/ }));
    await within(rowOf(5)).findByText("Inactive");
    expect(screen.queryByText(NO_ACTIVE_WARNING)).toBeNull(); // Sierra is still active
  });

  it("does NOT appear when no tier is active but no boat type asks for the field", async () => {
    boatTypes = [
      { id: 1, name: "Tourist Boat", requires_capacity_fare: false, is_active: true },
      { id: 2, name: "Passenger Boat", requires_capacity_fare: false, is_active: true },
      { id: 3, name: "Retired Ferry", requires_capacity_fare: true, is_active: false },
    ];
    await openFareTab();
    await deactivateAll();
    expect(screen.queryByText(NO_ACTIVE_WARNING)).toBeNull();
  });

  it("goes away when a tier is reactivated", async () => {
    await openFareTab();
    await deactivateAll();
    expect(screen.getByText(NO_ACTIVE_WARNING)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Reactivate Romeo/ }));
    await waitFor(() => expect(screen.queryByText(NO_ACTIVE_WARNING)).toBeNull());
  });

  it("is worked out from the boat types already in the page's data: no extra request", async () => {
    await openFareTab();
    await deactivateAll();
    // nothing was asked for except the first tab's list, the tiers, and the tier writes
    const allowed = (path) => path === "/reference-options/itinerary/" || path.startsWith("/boat-capacity-fares/");
    expect(requests.filter((r) => !allowed(r.path))).toEqual([]);
  });
});

describe("h) the four existing tabs are as they were", () => {
  it("each still asks for its own list, shows its own rows and counts, and never touches the fare endpoints", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    const expected = [
      ["Travel Itinerary", "itinerary", ["Overnight", "Same Day"], ["3 records", "5 records"]],
      ["Vehicle Classification", "travel-mode", ["Private Vehicle", "Public Bus"], ["10 records", "6 records"]],
      ["Boat Classification", "boat-type", ["Tourist Boat", "Passenger Boat"], ["11 records", "7 records"]],
      ["Visit Purpose", "visit-purpose", ["Leisure", "Vacation"], ["4 records", "9 records"]],
    ];
    for (const [tab, kind, names, counts] of expected) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      await waitFor(() => expect(requests.filter((r) => r.path === `/reference-options/${kind}/`)).toHaveLength(1));
      await waitFor(() => names.forEach((name) => expect(screen.getByText(name)).toBeTruthy()));
      counts.forEach((count) => expect(screen.getByText(count)).toBeTruthy());
      expect(screen.getByRole("button", { name: /add option/i })).toBeTruthy(); // the shell's own button
      expect(screen.getByLabelText("Filter by status")).toBeTruthy();
      expect(screen.queryByText(/no longer offered|never deleted/i)).toBeNull(); // no reminder line on this tab
      expect(screen.getAllByRole("button", { name: /add option/i })).toHaveLength(1); // one, not two: the fare tab's button is not here
    }
    expect(requests.filter((r) => r.path.startsWith("/boat-capacity-fares/"))).toHaveLength(0);
  });

  it("a write on a reference tab still goes to /reference-options/ and never to the fare endpoints", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("tab", { name: "Visit Purpose" }));
    await screen.findByText("Leisure");
    fireEvent.click(screen.getByRole("button", { name: "Reactivate Vacation" }));
    await waitFor(() => expect(requests.some((r) => r.method === "POST")).toBe(true));
    expect(requests.filter((r) => r.method === "POST").map((r) => r.path)).toEqual(["/reference-options/visit-purpose/2/reactivate/"]);
    expect(requests.filter((r) => r.path.startsWith("/boat-capacity-fares/"))).toHaveLength(0);
  });

  it("switching away from the fare tab shows the reference lists again", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("tab", { name: "Travel Itinerary" }));
    await waitFor(() => expect(screen.getByText("Overnight")).toBeTruthy());
    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add option/i })).toBeTruthy();
  });
});

describe("only the admin", () => {
  it("sends anyone else away and asks the server for nothing", () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<RegistrationOptions />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("no tab of Registration Options has a reminder line", () => {
  it("not Travel Itinerary, Vehicle Classification, Boat Classification, Visit Purpose, nor Boat Capacity and Fare", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    const tabs = [
      ["Travel Itinerary", "Overnight"],
      ["Vehicle Classification", "Private Vehicle"],
      ["Boat Classification", "Tourist Boat"],
      ["Visit Purpose", "Leisure"],
      [FARE_TAB, null],
    ];
    let looked = 0;
    for (const [tab, firstRow] of tabs) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      if (firstRow) await screen.findByText(firstRow);
      else await screen.findByTestId("fare-row-12");
      expect(document.querySelector(".options-intro")).toBeNull();
      expect(screen.queryByText(/no longer offered/i)).toBeNull();
      expect(screen.queryByText(/never deleted/i)).toBeNull();
      expect(screen.queryByText(/It stays on the records/i)).toBeNull();
      looked += 1;
    }
    expect(looked).toBe(5); // the fixture: all five tabs were opened
  });
});
