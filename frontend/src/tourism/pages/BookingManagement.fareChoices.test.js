import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";

// The Boat Capacity and Fare dropdown of the record form, now fed by the server's
// list (referenceTables.boatCapacityFares) with the built-in nine as the fallback.
// Each test looks at what the person SEES (the options, the one selected) and at
// what is SENT when the record is saved.

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
const TENTH = "21-25 pax (One-Way P6,000, Two-way P6,500)";

// A server list that is NOT the built-in nine: a tenth tier FIRST, the first two
// swapped in order, and the fourth retired.
const SERVER_LIST = [
  { id: 90, name: TENTH, display_order: 5, is_active: true },
  { id: 91, name: NINE[1], display_order: 10, is_active: true },
  { id: 92, name: NINE[0], display_order: 20, is_active: true },
  { id: 93, name: NINE[2], display_order: 30, is_active: true },
  { id: 94, name: NINE[3], display_order: 40, is_active: false },
  { id: 95, name: NINE[4], display_order: 50, is_active: true },
  { id: 96, name: NINE[5], display_order: 60, is_active: true },
  { id: 97, name: NINE[6], display_order: 70, is_active: true },
  { id: 98, name: NINE[7], display_order: 80, is_active: true },
  { id: 99, name: NINE[8], display_order: 90, is_active: true },
];
const SERVER_ACTIVE_IN_ORDER = [TENTH, NINE[1], NINE[0], NINE[2], NINE[4], NINE[5], NINE[6], NINE[7], NINE[8]];

// from the Excel import: a text that was never a tier
const UNLISTED = "1-2 pax (One-way P1,500 / two-way P2,000)";
// a stored text with spaces at both ends and inside, close to a tier but not equal to it
const ODD = "  3-4 pax  (One-Way P2000, Two-way P2,500)  ";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
let mockRouterState = null;
jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: "/tourist-data", state: mockRouterState }),
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

const BASE_REFERENCE = {
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

const RECORDS = {
  "SV-ACTIVE": record("SV-ACTIVE", "Alma", "Reyes", 31, NINE[0]), // holds an active tier
  "SV-RETIRED": record("SV-RETIRED", "Berto", "Cruz", 31, NINE[3]), // holds the retired tier
  "SV-UNLISTED": record("SV-UNLISTED", "Carla", "Dela Paz", 31, UNLISTED), // holds a text from an import
  "SV-ODD": record("SV-ODD", "Dino", "Evangelista", 31, ODD), // holds a text with stray spaces
  "SV-NONE": record("SV-NONE", "Elena", "Flores", 31, ""), // holds nothing
  "SV-NOFARE": record("SV-NOFARE", "Felix", "Garcia", 32, NINE[0]), // a boat that takes no fare, with a stored fare
};

let updateRecord;

function useReference(extra) {
  useTourismData.mockReturnValue({
    referenceTables: { ...BASE_REFERENCE, ...extra },
    bookingManagement: {
      rows: Object.values(RECORDS),
      summary: {},
      pagination: { page: 1, totalPages: 1, total: Object.keys(RECORDS).length },
    },
    reportingYears: ["2099"],
    createRecord: jest.fn().mockResolvedValue({}),
    updateRecord,
    deleteRecord: jest.fn(),
    previewOnlineBookingImport: jest.fn(),
    importOnlineBookingFile: jest.fn(),
    refreshBookingManagement: jest.fn().mockResolvedValue({ pagination: { page: 1 } }),
  });
}

beforeEach(() => {
  mockRouterState = null;
  updateRecord = jest.fn().mockResolvedValue({});
  useReference({ boatCapacityFares: SERVER_LIST });
});

const rowOf = (surveyId) => screen.getByText(surveyId).closest("tr");
const step = (label) =>
  fireEvent.click(screen.getByText(label, { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));

async function openEdit(surveyId) {
  render(<BookingManagement />);
  const row = await waitFor(() => rowOf(surveyId));
  fireEvent.click(row.querySelector(".booking-icon-btn.view"));
  await screen.findByText("Tourist Record Details & Edit");
  step("Travel Details");
}

const fareSelect = () => screen.getByText(PLACEHOLDER, { selector: "option" }).closest("select");
const labelsOf = (select) => Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
const valuesOf = (select) => Array.from(select.querySelectorAll("option")).map((o) => o.value);
const shown = (select) => select.options[select.selectedIndex]?.textContent;

// what is SENT when the record is saved without touching the fare
async function savedFare() {
  step("Review");
  fireEvent.click(await screen.findByRole("button", { name: /Update Record/ }));
  await waitFor(() => expect(updateRecord).toHaveBeenCalled());
  const [, payload] = updateRecord.mock.calls[updateRecord.mock.calls.length - 1];
  return payload.boat_capacity_fare;
}

describe("the server's list wins", () => {
  it("offers the server's list, not the built-in nine: a tenth first, the new order, the retired one left out", async () => {
    await openEdit("SV-NONE");
    const labels = labelsOf(fareSelect());
    expect(labels).toEqual([PLACEHOLDER, ...SERVER_ACTIVE_IN_ORDER]);
    expect(labels).not.toEqual([PLACEHOLDER, ...NINE]); // it is NOT the built-in list
    expect(labels).toContain(TENTH);
    expect(labels).not.toContain(NINE[3]);
    expect(labels.indexOf(NINE[1])).toBeLessThan(labels.indexOf(NINE[0])); // the order the server gave
    expect(valuesOf(fareSelect())).toEqual(["", ...SERVER_ACTIVE_IN_ORDER]);
  });

  it("follows the server when the list changes", async () => {
    useReference({ boatCapacityFares: [{ id: 1, name: "Only this one", display_order: 1, is_active: true }] });
    await openEdit("SV-NONE");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, "Only this one"]);
  });
});

describe("the fallback and the empty list", () => {
  it("with no list in the payload, offers exactly the built-in nine, in order", async () => {
    useReference({ boatCapacityFares: undefined });
    await openEdit("SV-NONE");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, ...NINE]);
    expect(valuesOf(fareSelect())).toEqual(["", ...NINE]);
  });

  it("a null in the payload is also 'no list': the built-in nine", async () => {
    useReference({ boatCapacityFares: null });
    await openEdit("SV-NONE");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, ...NINE]);
  });

  it("with an EMPTY list, the dropdown is empty (only the placeholder): it does not fall back", async () => {
    useReference({ boatCapacityFares: [] });
    await openEdit("SV-NONE");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER]);
    expect(shown(fareSelect())).toBe(PLACEHOLDER);
  });

  it("with an empty list, a record that holds a fare still shows it (not blank), and sends it unchanged", async () => {
    useReference({ boatCapacityFares: [] });
    await openEdit("SV-ACTIVE");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, `${NINE[0]} (not in the list)`]);
    expect(shown(fareSelect())).toBe(`${NINE[0]} (not in the list)`);
    expect(fareSelect().value).toBe(NINE[0]);
    expect(await savedFare()).toBe(NINE[0]);
  });
});

describe("what the staff sees when the server holds exactly the seeded nine (as on live today)", () => {
  // The payload as the server sends it right after the seed: the nine, in order 10..90, all active.
  const SEEDED = NINE.map((name, i) => ({ id: 100 + i, name, display_order: (i + 1) * 10, is_active: true }));
  const HOLDING = {
    "SV-T1": record("SV-T1", "Gina", "Hilario", 31, NINE[0]),
    "SV-T2": record("SV-T2", "Hugo", "Ibarra", 31, NINE[1]),
    "SV-T3": record("SV-T3", "Ines", "Jacinto", 31, NINE[2]),
  };

  async function openWith(extra, surveyId) {
    useTourismData.mockReturnValue({
      ...useTourismData(),
      referenceTables: { ...BASE_REFERENCE, ...extra },
      bookingManagement: { rows: Object.values(HOLDING), summary: {}, pagination: { page: 1, totalPages: 1, total: 3 } },
    });
    await openEdit(surveyId);
  }

  it("the seeded nine from the server look EXACTLY like the built-in nine: same options, same order, same values", async () => {
    await openWith({ boatCapacityFares: SEEDED }, "SV-T1");
    const fromServer = { labels: labelsOf(fareSelect()), values: valuesOf(fareSelect()) };
    expect(fromServer.labels).toEqual([PLACEHOLDER, ...NINE]);

    document.body.innerHTML = "";
    await openWith({ boatCapacityFares: undefined }, "SV-T1");
    const builtIn = { labels: labelsOf(fareSelect()), values: valuesOf(fareSelect()) };
    expect(fromServer).toEqual(builtIn);
  });

  it.each([["SV-T1", 0], ["SV-T2", 1], ["SV-T3", 2]])(
    "%s: the record's tier (number %i + 1) is still the one selected, with no mark, and is sent unchanged",
    async (surveyId, index) => {
      await openWith({ boatCapacityFares: SEEDED }, surveyId);
      expect(shown(fareSelect())).toBe(NINE[index]);
      expect(fareSelect().value).toBe(NINE[index]);
      expect(labelsOf(fareSelect())).toHaveLength(10); // placeholder + nine: nothing added
      expect(await savedFare()).toBe(NINE[index]);
    }
  );
});

describe("a: a listed, active tier", () => {
  it("is an ordinary option, selected, with no mark, and is sent unchanged", async () => {
    await openEdit("SV-ACTIVE");
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, ...SERVER_ACTIVE_IN_ORDER]); // no extra option
    expect(shown(fareSelect())).toBe(NINE[0]);
    expect(fareSelect().value).toBe(NINE[0]);
    expect(await savedFare()).toBe(NINE[0]);
  });
});

describe("b: a retired tier the record holds", () => {
  it("stays in its place by display_order, marked '(inactive)', and is the one selected", async () => {
    await openEdit("SV-RETIRED");
    const labels = labelsOf(fareSelect());
    // order 40 falls after order 30 (NINE[2]) and before order 50 (NINE[4])
    expect(labels).toEqual([
      PLACEHOLDER,
      TENTH, NINE[1], NINE[0], NINE[2],
      `${NINE[3]} (inactive)`,
      NINE[4], NINE[5], NINE[6], NINE[7], NINE[8],
    ]);
    expect(shown(fareSelect())).toBe(`${NINE[3]} (inactive)`); // not blank, not the placeholder
    expect(fareSelect().selectedIndex).toBeGreaterThan(0);
    expect(fareSelect().value).toBe(NINE[3]); // the value is the text itself
  });

  it("sends exactly the text it holds when the record is saved without touching the fare", async () => {
    await openEdit("SV-RETIRED");
    expect(await savedFare()).toBe(NINE[3]);
  });

  it("is not offered to a record that does not hold it", async () => {
    await openEdit("SV-ACTIVE");
    expect(valuesOf(fareSelect())).not.toContain(NINE[3]);
  });
});

describe("c: a text that is in no tier", () => {
  it("is added at the END, marked '(not in the list)', and is the one selected", async () => {
    await openEdit("SV-UNLISTED");
    const labels = labelsOf(fareSelect());
    expect(labels).toEqual([PLACEHOLDER, ...SERVER_ACTIVE_IN_ORDER, `${UNLISTED} (not in the list)`]);
    expect(shown(fareSelect())).toBe(`${UNLISTED} (not in the list)`);
    expect(fareSelect().selectedIndex).toBeGreaterThan(0);
    expect(fareSelect().value).toBe(UNLISTED);
  });

  it("sends exactly the text it holds when the record is saved without touching the fare", async () => {
    await openEdit("SV-UNLISTED");
    expect(await savedFare()).toBe(UNLISTED);
  });

  it("keeps a text with spaces at both ends and inside byte for byte: shown, selected and sent", async () => {
    await openEdit("SV-ODD");
    expect(ODD).not.toBe(NINE[1]); // close to a tier, not equal to it
    expect(valuesOf(fareSelect()).filter((v) => v === ODD)).toHaveLength(1);
    expect(fareSelect().value).toBe(ODD); // not trimmed, not collapsed
    expect(shown(fareSelect())).toBe(`${ODD} (not in the list)`);
    const sent = await savedFare();
    expect(sent).toBe(ODD);
    expect(sent.length).toBe(ODD.length);
  });

  it("is not carried over to another record: it belongs to the record that holds it", async () => {
    await openEdit("SV-NONE");
    expect(valuesOf(fareSelect())).not.toContain(UNLISTED);
    expect(valuesOf(fareSelect())).not.toContain(ODD);
  });
});

describe("the dropdown is never blank while the record holds a fare", () => {
  it.each([["SV-ACTIVE"], ["SV-RETIRED"], ["SV-UNLISTED"], ["SV-ODD"]])(
    "%s: something real is selected, and its value is the record's own text",
    async (surveyId) => {
      await openEdit(surveyId);
      const select = fareSelect();
      expect(select.selectedIndex).toBeGreaterThan(0);
      expect(shown(select)).not.toBe(PLACEHOLDER);
      expect(select.value).toBe(RECORDS[surveyId].boat_capacity_fare);
    }
  );

  it("a record that holds nothing shows the placeholder, and sends nothing", async () => {
    await openEdit("SV-NONE");
    expect(shown(fareSelect())).toBe(PLACEHOLDER);
    expect(await savedFare()).toBe("");
  });
});

describe("choosing another tier", () => {
  it("sends the tier that was chosen, as the server wrote it", async () => {
    await openEdit("SV-RETIRED");
    fireEvent.change(fareSelect(), { target: { value: TENTH } });
    expect(await savedFare()).toBe(TENTH);
  });

  it("keeps the record's own text on offer after the person changes it, so it can be put back", async () => {
    await openEdit("SV-UNLISTED");
    fireEvent.change(fareSelect(), { target: { value: NINE[2] } });
    expect(valuesOf(fareSelect())).toContain(UNLISTED);
    fireEvent.change(fareSelect(), { target: { value: UNLISTED } });
    expect(await savedFare()).toBe(UNLISTED);
  });
});

describe("a NEW record", () => {
  async function openAddAtTravelDetails() {
    mockRouterState = { openAddModal: true, ts: 777 };
    render(<BookingManagement />);
    await screen.findByText("Data Management Add Record");
    fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Nora" } });
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Santos" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "nora@example.test" } });
    fireEvent.change(screen.getByPlaceholderText("9XXXXXXXXX"), { target: { value: "9170000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Select length of stay", { selector: "option" });
    const selectWith = (text) => screen.getByText(text, { selector: "option" }).closest("select");
    fireEvent.change(selectWith("Select region"), { target: { value: "4" } });
    fireEvent.change(selectWith("Select province"), { target: { value: "7" } });
    fireEvent.change(selectWith("Select resort"), { target: { value: "3" } });
    fireEvent.change(selectWith("Select length of stay"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText(PLACEHOLDER, { selector: "option" });
  }

  it("offers only the server's ACTIVE tiers, with no mark of any kind", async () => {
    await openAddAtTravelDetails();
    expect(labelsOf(fareSelect())).toEqual([PLACEHOLDER, ...SERVER_ACTIVE_IN_ORDER]);
    expect(valuesOf(fareSelect())).not.toContain(NINE[3]);
    expect(document.body.textContent).not.toContain("(inactive)");
    expect(document.body.textContent).not.toContain("(not in the list)");
  });
});

describe("KNOWN BUG, not fixed yet: a boat that takes no fare loses the stored fare on save", () => {
  // KILALANG BUG, hindi pa inaayos, tingnan ang listahan ng butas.
  // This test PINS the behaviour as it is today, so that any change to it, up or
  // down, is noticed. When a record's boat type has requires_capacity_fare=false,
  // saving the record silently clears the fare text it holds (capacityFareForBoatType
  // returns ""). One live record is affected. Do NOT "fix" this test to expect the
  // fare to survive until the bug itself is fixed on purpose.
  it("the field is switched off, still shows the stored tier, and the save sends an EMPTY fare", async () => {
    await openEdit("SV-NOFARE");
    expect(fareSelect().disabled).toBe(true);
    expect(fareSelect().value).toBe(NINE[0]); // what the person sees: the tier is still there
    expect(await savedFare()).toBe(""); // what is sent: it is wiped. This is the bug.
  });
});
