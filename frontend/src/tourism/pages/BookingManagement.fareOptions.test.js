import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";

// This test PINS the nine "Boat Capacity and Fare" tiers as the record form
// offers them today: the nine texts and their ORDER. They are written out below
// on purpose (a golden list), and the real source files are read too, so that a
// change to the list, or a drift between the web and the mobile app, fails here
// before anything else is built on it.
//
// The commas are as they are: "P1500" and "P2000" have none. Records already hold
// exactly this text.
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
const PLACEHOLDER = "Select capacity and fare";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: "/tourist-data", state: null }),
    useNavigate: () => jest.fn(),
    useOutletContext: () => ({}),
  }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));
jest.mock("../context/TourismDataContext", () => ({
  useTourismData: jest.fn(),
  useBookingListPolling: jest.fn(),
}));
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn() }));

const REFERENCE = {
  countries: [{ id: 1, name: "Philippines", type: "local" }],
  regions: [{ id: 4, name: "CALABARZON" }],
  provinces: [{ id: 7, name: "Quezon", region_id: 4 }],
  resorts: [{ resort_id: 3, resort_name: "Sample Beach" }],
  itineraries: [{ id: 11, name: "Weekend Trail", is_active: true }],
  travelModes: [{ id: 21, name: "Jeepney Ride", is_active: true }],
  boatTypes: [
    { id: 31, name: "Banca With Fare", requires_capacity_fare: true, is_active: true },
    { id: 32, name: "Plain Ferry", requires_capacity_fare: false, is_active: true },
  ],
  visitPurposes: [{ id: 41, name: "Holiday Break", is_active: true }],
};

function record(surveyId, first, last, boat, fare) {
  return {
    survey_id: surveyId,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase()}@example.test`,
    contact_number: "+639171234567",
    country_id: 1,
    region_id: 4,
    province_id: 7,
    resort_id: 3,
    itinerary_id: 11,
    travel_mode_id: 21,
    boat_type_id: boat,
    boat_capacity_fare: fare,
    visit_purpose_id: 41,
    arrival_date: "2099-06-01",
    filipino_count: 2,
    foreigner_count: 0,
    maubanin_count: 0,
    total_visitors: 2,
    total_male: 1,
    total_female: 1,
    special_group_count: 0,
    age_0_7: 0,
    age_8_59: 2,
    age_60_above: 0,
    discounted_count: 0,
    status: "pending",
  };
}

// A takes a fare and holds the third tier; C takes a fare and holds none; B is on a boat that takes none.
const RECORD_A = record("SV-A", "Alma", "Reyes", 31, NINE[2]);
const RECORD_B = record("SV-B", "Berto", "Cruz", 32, "");
const RECORD_C = record("SV-C", "Carla", "Dela Paz", 31, "");

let updateRecord;

beforeEach(() => {
  updateRecord = jest.fn().mockResolvedValue({});
  useTourismData.mockReturnValue({
    referenceTables: REFERENCE,
    bookingManagement: {
      rows: [RECORD_A, RECORD_B, RECORD_C],
      summary: {},
      pagination: { page: 1, totalPages: 1, total: 3 },
    },
    reportingYears: ["2099"],
    createRecord: jest.fn().mockResolvedValue({}),
    updateRecord,
    deleteRecord: jest.fn(),
    previewOnlineBookingImport: jest.fn(),
    importOnlineBookingFile: jest.fn(),
    refreshBookingManagement: jest.fn().mockResolvedValue({ pagination: { page: 1 } }),
  });
});

const rowOf = (surveyId) => screen.getByText(surveyId).closest("tr");

async function openEdit(surveyId) {
  render(<BookingManagement />);
  const row = await waitFor(() => rowOf(surveyId));
  fireEvent.click(row.querySelector(".booking-icon-btn.view"));
  await screen.findByText("Tourist Record Details & Edit");
  fireEvent.click(screen.getByText("Travel Details", { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));
}

const fareSelect = () => screen.getByText(PLACEHOLDER, { selector: "option" }).closest("select");
const labelsOf = (select) => Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
const valuesOf = (select) => Array.from(select.querySelectorAll("option")).map((o) => o.value);
const shown = (select) => select.options[select.selectedIndex]?.textContent;

describe("the Boat Capacity and Fare dropdown of the record form", () => {
  it("offers the placeholder and then the nine tiers, in this order", async () => {
    await openEdit("SV-A");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, ...NINE]);
  });

  it("saves the text itself: each option's value is its own text, and the placeholder is empty", async () => {
    await openEdit("SV-A");
    expect(valuesOf(fareSelect())).toEqual(["", ...NINE]);
  });

  it("selects the tier the record holds", async () => {
    await openEdit("SV-A");
    expect(shown(fareSelect())).toBe(NINE[2]);
    expect(fareSelect().disabled).toBe(false);
  });

  it("shows the placeholder for a record that holds none, and the same nine to choose from", async () => {
    await openEdit("SV-C");
    expect(shown(fareSelect())).toBe(PLACEHOLDER);
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, ...NINE]);
  });

  it("is switched off for a boat that takes no fare", async () => {
    await openEdit("SV-B");
    expect(fareSelect().disabled).toBe(true);
  });

  it("sends the tier back unchanged when the record is saved without touching it", async () => {
    await openEdit("SV-A");
    fireEvent.click(screen.getByText("Review", { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));
    fireEvent.click(await screen.findByRole("button", { name: /Update Record/ }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalled());
    const [, payload] = updateRecord.mock.calls[updateRecord.mock.calls.length - 1];
    expect(payload.boat_capacity_fare).toBe(NINE[2]);
  });

  it("sends the tier that was chosen, exactly as written", async () => {
    await openEdit("SV-C");
    fireEvent.change(fareSelect(), { target: { value: NINE[0] } });
    fireEvent.click(screen.getByText("Review", { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));
    fireEvent.click(await screen.findByRole("button", { name: /Update Record/ }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalled());
    const [, payload] = updateRecord.mock.calls[updateRecord.mock.calls.length - 1];
    expect(payload.boat_capacity_fare).toBe("1-2 pax (One-Way P1500, Two-way P2000)");
  });
});

describe("the source files the tiers live in", () => {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "..", "..", "..");

  it("BookingManagement.js holds exactly these nine, in this order, each with an id equal to its text", () => {
    const source = fs.readFileSync(path.join(__dirname, "BookingManagement.js"), "utf8");
    const start = source.indexOf("const boatCapacityFareOptions = [");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("];", start));
    const pairs = [...block.matchAll(/\{ id: "([^"]*)", name: "([^"]*)" \}/g)].map((m) => [m[1], m[2]]);
    expect(pairs.map(([id]) => id)).toEqual(NINE);
    expect(pairs.map(([, name]) => name)).toEqual(NINE);
  });

  it("mobile/lib/utils/helpers.dart holds the same nine in the same order (after its empty first choice)", () => {
    const source = fs.readFileSync(path.join(root, "mobile", "lib", "utils", "helpers.dart"), "utf8");
    const start = source.indexOf("const boatCapacityFareOptions = [");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("];", start));
    const items = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(items[0]).toBe("");
    expect(items.slice(1)).toEqual(NINE);
  });

  it("the backend seed migration holds the same nine, in the same order", () => {
    const source = fs.readFileSync(
      path.join(root, "backend", "api", "migrations", "0056_seed_boat_capacity_fares.py"),
      "utf8"
    );
    const block = source.slice(source.indexOf("TIERS = ["), source.indexOf("]", source.indexOf("TIERS = [")));
    const items = [...block.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    expect(items).toEqual(NINE);
  });
});
