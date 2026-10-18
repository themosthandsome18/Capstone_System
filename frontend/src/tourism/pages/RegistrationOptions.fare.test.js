import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RegistrationOptions from "./RegistrationOptions";
import { NO_ACTIVE_WARNING, OLD_APP_NOTE, RENAME_GUIDE, TEXT_NOTE } from "./BoatCapacityFarePanel";
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
    if (found.record_count > 0) {
      return reply(409, {
        detail: `The text of this tier is saved on ${found.record_count} record(s), so it cannot be renamed: those records would keep the old text. Add a new tier with the new wording and deactivate this one.`,
        code: "text_in_use",
        record_count: found.record_count,
      });
    }
    found.name = body.name.trim();
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

  it("shows the explanations all the time, in English", async () => {
    await openFareTab();
    expect(TEXT_NOTE).toBe(
      "The chosen tier is saved as text on each record. Renaming or retiring a tier does NOT change old records — they keep the text they already hold, and that text will appear in the record's own dropdown marked (inactive) or (not in the list)."
    );
    expect(OLD_APP_NOTE).toBe(
      "Visitors using an older version of the app may still send the old wording until a new app version is released."
    );
    expect(screen.getByText(TEXT_NOTE)).toBeTruthy();
    expect(screen.getByText(OLD_APP_NOTE)).toBeTruthy();
    // and still there after an action and after a refusal
    fireEvent.click(screen.getByRole("button", { name: /^Deactivate Tango/ }));
    await within(rowOf(5)).findByText("Inactive");
    expect(screen.getByText(TEXT_NOTE)).toBeTruthy();
    expect(screen.getByText(OLD_APP_NOTE)).toBeTruthy();
  });

  it("has its own 'Add tier' button, and the shell's 'Add option' is not shown on this tab", async () => {
    render(<RegistrationOptions />);
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: /add option/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: FARE_TAB }));
    await screen.findByTestId("fare-row-12");
    expect(screen.queryByRole("button", { name: /add option/i })).toBeNull();
    expect(screen.getByRole("button", { name: /add tier/i })).toBeTruthy();
  });
});

describe("each action: what is shown afterwards AND what was sent", () => {
  it("add: sends only the text, then shows the row the server made, last", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /add tier/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /add tier/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /add tier/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /add tier/i }));
    fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: "Mike 1-2 pax (One-Way P1000, Two-way P1400)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    expect(await screen.findByText(/already has this name/)).toBeTruthy();
    expect(shownOrder()).toEqual([12, 5, 41, 7]);
    expect(screen.getByLabelText("New tier text").value).toBe("Mike 1-2 pax (One-Way P1000, Two-way P1400)"); // nothing typed is lost
    expect(fareWrites()).toHaveLength(1);
  });
});

describe("f) a refused rename (409 text_in_use)", () => {
  it("shows the server's explanation and the way out, never the bare code, and changes nothing", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Edit Mike/ }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Mike with new wording" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("cannot be renamed");
    expect(alert.textContent).toContain("3 record(s)");
    expect(alert.textContent).toMatch(/Add a new tier with the new wording and deactivate this one/);
    expect(document.body.textContent).not.toContain("text_in_use");
    expect(within(rowOf(12)).getByText("Mike 1-2 pax (One-Way P1000, Two-way P1400)")).toBeTruthy(); // not renamed
    expect(screen.queryByText("Mike with new wording", { selector: "td" })).toBeNull();
    expect(fareWrites()).toHaveLength(1);
    expect(refreshReferenceTables).not.toHaveBeenCalled();
  });

  it("adds the way out itself when the server's words do not contain it", async () => {
    await openFareTab();
    failNext = { status: 409, body: { detail: "This text is in use.", code: "text_in_use", record_count: 6 } };
    fireEvent.click(screen.getByRole("button", { name: /^Edit Tango/ }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Tango other" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This text is in use.");
    expect(alert.textContent).toContain(RENAME_GUIDE);
    expect(document.body.textContent).not.toContain("text_in_use");
  });

  it("takes the count the server named, for that row", async () => {
    await openFareTab();
    failNext = { status: 409, body: { detail: "Held.", code: "text_in_use", record_count: 9 } };
    fireEvent.click(screen.getByRole("button", { name: /^Edit Tango/ }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Tango other" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(within(rowOf(5)).getByText("9 records")).toBeTruthy();
  });

  it("says beforehand, in the edit panel, that a tier some records hold cannot be renamed", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: /^Edit Tango/ }));
    expect(screen.queryByText(/hold this exact text/)).toBeNull(); // nobody holds Tango
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /^Edit Mike/ }));
    expect(screen.getByText(/3 records hold this exact text, so it cannot be renamed/)).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /add tier/i }));
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
      expect(screen.queryByText(TEXT_NOTE)).toBeNull(); // the fare notes do not leak into the others
      expect(screen.queryByRole("button", { name: /add tier/i })).toBeNull();
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
