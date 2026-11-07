import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RegistrationOptions from "./RegistrationOptions";
import { NO_RANGE_LABEL, NO_RANGE_NOTE, paxRangeProblem } from "./BoatCapacityFarePanel";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

// The Min pax and Max pax of a Boat Capacity and Fare tier: required in the form
// (the database keeps them nullable on purpose), the rules, the sign on a tier that
// has none yet, and that what is saved reaches the server and shows afterwards.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const NINE = [
  ["1-2 pax (One-Way P1500, Two-way P2000)", 1, 2],
  ["3-4 pax (One-Way P2000, Two-way P2,500)", 3, 4],
  ["5-6 pax (One-Way P2,500, Two-way P3,000)", 5, 6],
  ["7-8 pax (One-Way P3,000, Two-way P3,500)", 7, 8],
  ["9-10 pax (One-Way P3,500, Two-way P4,000)", 9, 10],
  ["11-12 pax (One-Way P4,000, Two-way P4,500)", 11, 12],
  ["13-14 pax (One-Way P4,500, Two-way P5,000)", 13, 14],
  ["15-17 pax (One-Way P5,000, Two-way P5,500)", 15, 17],
  ["18-20 pax (One-Way P5,500, Two-way P6,000)", 18, 20],
];

let fares;
let requests;

const tier = (id, name, order, min, max) => ({
  id, name, display_order: order, is_active: true, record_count: 0, min_pax: min, max_pax: max,
});

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

function fakeFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^.*\/api/, "");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });

  if (/^\/reference-options\/[a-z-]+\/$/.test(path)) {
    return reply(200, [{ id: 1, name: "Overnight", is_active: true, record_count: 0, rename_protected: false, stay_nights: 1 }]);
  }
  const m = path.match(/^\/boat-capacity-fares\/(?:(\d+)\/)?$/);
  if (!m) return reply(404, { detail: "no such route" });
  if (!m[1]) {
    if (method === "GET") return reply(200, fares);
    const created = tier(
      Math.max(...fares.map((f) => f.id)) + 1,
      body.name.trim(),
      Math.max(...fares.map((f) => f.display_order)) + 10,
      body.min_pax,
      body.max_pax
    );
    fares.push(created);
    return reply(201, created);
  }
  const found = fares.find((f) => f.id === Number(m[1]));
  if (method === "PATCH") {
    found.name = body.name.trim();
    found.min_pax = body.min_pax;
    found.max_pax = body.max_pax;
    return reply(200, found);
  }
  return reply(405, { detail: "method not allowed" });
}

beforeEach(() => {
  fares = [tier(1, "Alpha 1-2 pax", 10, 1, 2), tier(2, "Bravo odd tier", 20, null, null)];
  requests = [];
  useAuth.mockReturnValue({ role: "admin" });
  useTourismData.mockImplementation(() => ({
    refreshReferenceTables: jest.fn(),
    referenceTables: { boatTypes: [{ id: 1, name: "Tourist Boat", requires_capacity_fare: true, is_active: true }] },
  }));
  global.fetch = jest.fn(fakeFetch);
});

const writes = () => requests.filter((r) => r.path.startsWith("/boat-capacity-fares/") && r.method !== "GET");
const rowOf = (id) => screen.getByTestId(`fare-row-${id}`);

async function openFareTab(firstRow = 1) {
  render(<RegistrationOptions />);
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("tab", { name: "Boat Capacity and Fare" }));
  await screen.findByTestId(`fare-row-${firstRow}`);
}

function openAdd() {
  fireEvent.click(screen.getByRole("button", { name: /Add option/ }));
}

function fillAdd({ text = "Charlie 3-4 pax", min = "", max = "" } = {}) {
  fireEvent.change(screen.getByLabelText("New tier text"), { target: { value: text } });
  fireEvent.change(screen.getByLabelText("New tier min pax"), { target: { value: min } });
  fireEvent.change(screen.getByLabelText("New tier max pax"), { target: { value: max } });
}

describe("the rules, as one sentence each", () => {
  it.each([
    ["", "", "Min pax is required."],
    ["3", "", "Max pax is required."],
    ["", "4", "Min pax is required."],
    ["0", "4", "Min pax must be 1 or more."],
    ["5", "4", "Max pax cannot be less than Min pax."],
    ["1.5", "4", "Min pax must be a whole number, digits only."],
    ["1", "x", "Max pax must be a whole number, digits only."],
    ["3", "4", ""],
    ["4", "4", ""],
  ])("min %p max %p -> %p", (min, max, expected) => {
    expect(paxRangeProblem(min, max)).toBe(expected);
  });
});

describe("adding a tier", () => {
  it("is refused without a min or a max, with the reason, and nothing is sent", async () => {
    await openFareTab();
    openAdd();
    fillAdd({ min: "", max: "" });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Min pax is required.");
    expect(writes()).toHaveLength(0);

    fillAdd({ min: "3", max: "" });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Max pax is required.");
    expect(writes()).toHaveLength(0);
  });

  it("is refused when Max pax is smaller than Min pax", async () => {
    await openFareTab();
    openAdd();
    fillAdd({ min: "5", max: "4" });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Max pax cannot be less than Min pax.");
    expect(writes()).toHaveLength(0);
  });

  it("is refused when Min pax is 0", async () => {
    await openFareTab();
    openAdd();
    fillAdd({ min: "0", max: "4" });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Min pax must be 1 or more.");
    expect(writes()).toHaveLength(0);
  });

  it("does not let letters or symbols into the boxes", async () => {
    await openFareTab();
    openAdd();
    fireEvent.change(screen.getByLabelText("New tier min pax"), { target: { value: "a1b-2.c" } });
    fireEvent.change(screen.getByLabelText("New tier max pax"), { target: { value: "e+9x" } });
    expect(screen.getByLabelText("New tier min pax").value).toBe("12");
    expect(screen.getByLabelText("New tier max pax").value).toBe("9");
  });

  it("sends the numbers, and the row the server made shows them afterwards", async () => {
    await openFareTab();
    openAdd();
    fillAdd({ text: "Charlie 3-4 pax", min: "3", max: "4" });
    fireEvent.click(screen.getByRole("button", { name: "Save new tier" }));
    await screen.findByText("The tier was added.");
    expect(writes()).toEqual([
      { method: "POST", path: "/boat-capacity-fares/", body: { name: "Charlie 3-4 pax", min_pax: 3, max_pax: 4 } },
    ]);
    expect(within(rowOf(3)).getByText("3-4")).toBeTruthy();
    expect(within(rowOf(3)).queryByText(NO_RANGE_LABEL)).toBeNull();
  });
});

describe("editing a tier", () => {
  it("a changed range reaches the server and shows afterwards", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit Alpha 1-2 pax" }));
    expect(screen.getByLabelText("Tier min pax").value).toBe("1");
    expect(screen.getByLabelText("Tier max pax").value).toBe("2");
    fireEvent.change(screen.getByLabelText("Tier min pax"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Tier max pax"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("The tier was saved.");
    expect(writes()).toEqual([
      { method: "PATCH", path: "/boat-capacity-fares/1/", body: { name: "Alpha 1-2 pax", min_pax: 2, max_pax: 3 } },
    ]);
    expect(within(rowOf(1)).getByText("2-3")).toBeTruthy();
  });

  it("a blank box on save is refused too, and a max below the min", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit Alpha 1-2 pax" }));
    fireEvent.change(screen.getByLabelText("Tier min pax"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Tier max pax"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Min pax is required.");
    fireEvent.change(screen.getByLabelText("Tier min pax"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Tier max pax"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Max pax cannot be less than Min pax.");
    expect(writes()).toHaveLength(0);
  });

  it("a tier with no range cannot be saved, even for a new name, until it has one", async () => {
    await openFareTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit Bravo odd tier" }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Bravo renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Min pax is required.");
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Tier min pax"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Tier max pax"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await within(rowOf(2)).findByText("5-6");
    expect(within(rowOf(2)).queryByText(NO_RANGE_LABEL)).toBeNull();
  });
});

describe("the sign on a tier with no range", () => {
  it("a tier whose range is null says so, and says what does not work", async () => {
    await openFareTab();
    expect(within(rowOf(2)).getByText(NO_RANGE_LABEL)).toBeTruthy();
    expect(within(rowOf(2)).getByText(NO_RANGE_NOTE)).toBeTruthy();
    expect(within(rowOf(1)).queryByText(NO_RANGE_LABEL)).toBeNull();
    expect(within(rowOf(1)).getByText("1-2")).toBeTruthy();
  });

  it("the nine tiers that have a range carry no sign", async () => {
    fares = NINE.map(([name, min, max], index) => tier(index + 1, name, (index + 1) * 10, min, max));
    await openFareTab();
    expect(screen.queryByText(NO_RANGE_LABEL)).toBeNull();
    expect(screen.queryByText(NO_RANGE_NOTE)).toBeNull();
    NINE.forEach(([, min, max], index) => {
      expect(within(rowOf(index + 1)).getByText(`${min}-${max}`)).toBeTruthy();
    });
  });
});
