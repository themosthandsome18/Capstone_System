import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { INACTIVE_MARK, choicesFor } from "../utils/optionChoices";
import { useTourismData } from "../context/TourismDataContext";

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

// Every option has its own id and name (no two lists look alike), and each
// inactive option belongs to a different record.
const option = (id, name, extra = {}) => ({ id, name, is_active: true, ...extra });
const REFERENCE = {
  countries: [{ id: 1, name: "Philippines", type: "local" }],
  regions: [{ id: 4, name: "CALABARZON" }],
  provinces: [{ id: 7, name: "Quezon", region_id: 4 }],
  resorts: [{ resort_id: 3, resort_name: "Sample Beach" }],
  itineraries: [
    option(11, "Weekend Trail"),
    option(12, "Lantern Circuit", { is_active: false }),
    option(13, "Sunset Run"),
    option(14, "Harbour Walk", { is_active: false }),
  ],
  travelModes: [
    option(21, "Jeepney Ride"),
    option(22, "Horse Cart", { is_active: false }),
    option(23, "Pedicab"),
  ],
  boatTypes: [
    option(31, "Banca", { requires_capacity_fare: false }),
    option(32, "Old Outrigger", { requires_capacity_fare: false, is_active: false }),
    option(33, "Ferry", { requires_capacity_fare: false }),
  ],
  visitPurposes: [
    option(41, "Holiday Break"),
    option(42, "Pilgrimage", { is_active: false }),
    option(43, "Retreat"),
    option(44, "Old Errand", { is_active: false }),
  ],
};

function record(surveyId, first, last, ids) {
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
    itinerary_id: ids.itinerary,
    travel_mode_id: ids.mode,
    boat_type_id: ids.boat,
    boat_capacity_fare: "",
    visit_purpose_id: ids.purpose,
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

// A uses an inactive itinerary (12) and an inactive purpose (42); B uses an inactive
// vehicle (22) and an inactive boat (32); C uses only active options.
const RECORD_A = record("SV-A", "Alma", "Reyes", { itinerary: 12, mode: 21, boat: 31, purpose: 42 });
const RECORD_B = record("SV-B", "Berto", "Cruz", { itinerary: 11, mode: 22, boat: 32, purpose: 41 });
const RECORD_C = record("SV-C", "Carla", "Dela Paz", { itinerary: 13, mode: 23, boat: 33, purpose: 43 });

let updateRecord;
let createRecord;

beforeEach(() => {
  mockRouterState = null;
  updateRecord = jest.fn().mockResolvedValue({});
  createRecord = jest.fn().mockResolvedValue({});
  useTourismData.mockReturnValue({
    referenceTables: REFERENCE,
    bookingManagement: {
      rows: [RECORD_A, RECORD_B, RECORD_C],
      summary: {},
      pagination: { page: 1, totalPages: 1, total: 3 },
    },
    reportingYears: ["2099"],
    createRecord,
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
}

function goToStep(label) {
  fireEvent.click(screen.getByText(label, { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));
}

// the <select> whose first option is the placeholder with this text
function selectWith(placeholder) {
  const first = screen.getByText(placeholder, { selector: "option" });
  return first.closest("select");
}

const labelsOf = (select) => Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
const shown = (select) => select.options[select.selectedIndex]?.textContent;

const PLACEHOLDERS = {
  itinerary: "Select itinerary",
  mode: "Select mode",
  boat: "Select boat",
  purpose: "Select purpose",
};

function openTravelDetails() {
  goToStep("Travel Details");
}
function openLocation() {
  goToStep("Location");
}

async function save() {
  goToStep("Review");
  fireEvent.click(await screen.findByRole("button", { name: /Update Record/ }));
  await waitFor(() => expect(updateRecord).toHaveBeenCalled());
  return updateRecord.mock.calls[updateRecord.mock.calls.length - 1];
}

const ACTIVE = {
  itinerary: ["Weekend Trail", "Sunset Run"],
  mode: ["Jeepney Ride", "Pedicab"],
  boat: ["Banca", "Ferry"],
  purpose: ["Holiday Break", "Retreat"],
};
const INACTIVE_NAMES = ["Lantern Circuit", "Harbour Walk", "Horse Cart", "Old Outrigger", "Pilgrimage", "Old Errand"];

describe("a NEW record offers only active options", () => {
  async function openAddAtLocation() {
    mockRouterState = { openAddModal: true, ts: 12345 };
    render(<BookingManagement />);
    await screen.findByText("Data Management Add Record");
    fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Nora" } });
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Santos" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "nora@example.test" } });
    fireEvent.change(screen.getByPlaceholderText("9XXXXXXXXX"), { target: { value: "9170000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Select itinerary", { selector: "option" });
    fireEvent.change(selectWith("Select region"), { target: { value: "4" } });
    fireEvent.change(selectWith("Select province"), { target: { value: "7" } });
    fireEvent.change(selectWith("Select resort"), { target: { value: "3" } });
  }

  it("the itinerary list has the active ones only, with no mark", async () => {
    await openAddAtLocation();
    expect(labelsOf(selectWith(PLACEHOLDERS.itinerary))).toEqual(["Select itinerary", ...ACTIVE.itinerary]);
  });

  it("all four lists have the active ones only, and no inactive name appears in them", async () => {
    await openAddAtLocation();
    fireEvent.change(selectWith(PLACEHOLDERS.itinerary), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Select mode", { selector: "option" });

    expect(labelsOf(selectWith(PLACEHOLDERS.mode))).toEqual(["Select mode", ...ACTIVE.mode]);
    expect(labelsOf(selectWith(PLACEHOLDERS.boat))).toEqual(["Select boat", ...ACTIVE.boat]);
    expect(labelsOf(selectWith(PLACEHOLDERS.purpose))).toEqual(["Select purpose", ...ACTIVE.purpose]);
    INACTIVE_NAMES.forEach((name) =>
      expect(screen.queryByText(name, { exact: false, selector: "option" })).toBeNull()
    );
    expect(screen.queryByText(INACTIVE_MARK.trim(), { exact: false })).toBeNull();
  });
});

describe("EDITING an old record that uses an inactive option", () => {
  it("record A: the inactive itinerary and purpose are listed, selected and marked; the vehicle and boat are active-only", async () => {
    await openEdit("SV-A");
    openLocation();
    const itinerary = selectWith(PLACEHOLDERS.itinerary);
    expect(labelsOf(itinerary)).toEqual([
      "Select itinerary",
      "Weekend Trail",
      `Lantern Circuit${INACTIVE_MARK}`,
      "Sunset Run",
    ]);
    expect(shown(itinerary)).toBe(`Lantern Circuit${INACTIVE_MARK}`);
    // the word itself, written out: the same word as the Active / Inactive of the Registration Options page
    expect(shown(itinerary)).toBe("Lantern Circuit (inactive)");
    expect(itinerary.value).toBe("12");
    expect(screen.queryByText("Harbour Walk", { exact: false, selector: "option" })).toBeNull();

    openTravelDetails();
    expect(labelsOf(selectWith(PLACEHOLDERS.mode))).toEqual(["Select mode", ...ACTIVE.mode]);
    expect(labelsOf(selectWith(PLACEHOLDERS.boat))).toEqual(["Select boat", ...ACTIVE.boat]);
    const purpose = selectWith(PLACEHOLDERS.purpose);
    expect(labelsOf(purpose)).toEqual([
      "Select purpose",
      "Holiday Break",
      `Pilgrimage${INACTIVE_MARK}`,
      "Retreat",
    ]);
    expect(shown(purpose)).toBe(`Pilgrimage${INACTIVE_MARK}`);
    expect(screen.queryByText("Old Errand", { exact: false, selector: "option" })).toBeNull();
  });

  it("record B, a different record, shows ITS inactive options, not record A's", async () => {
    await openEdit("SV-B");
    openLocation();
    expect(labelsOf(selectWith(PLACEHOLDERS.itinerary))).toEqual(["Select itinerary", ...ACTIVE.itinerary]);
    openTravelDetails();
    const mode = selectWith(PLACEHOLDERS.mode);
    expect(labelsOf(mode)).toEqual(["Select mode", "Jeepney Ride", `Horse Cart${INACTIVE_MARK}`, "Pedicab"]);
    expect(shown(mode)).toBe(`Horse Cart${INACTIVE_MARK}`);
    expect(shown(mode)).toBe("Horse Cart (inactive)");
    const boat = selectWith(PLACEHOLDERS.boat);
    expect(labelsOf(boat)).toEqual(["Select boat", "Banca", `Old Outrigger${INACTIVE_MARK}`, "Ferry"]);
    expect(shown(boat)).toBe(`Old Outrigger${INACTIVE_MARK}`);
    expect(labelsOf(selectWith(PLACEHOLDERS.purpose))).toEqual(["Select purpose", ...ACTIVE.purpose]);
    expect(screen.queryByText("Pilgrimage", { exact: false, selector: "option" })).toBeNull();
    expect(screen.queryByText("Lantern Circuit", { exact: false, selector: "option" })).toBeNull();
  });

  it("a record with only active options sees no inactive option and no mark", async () => {
    await openEdit("SV-C");
    openLocation();
    expect(labelsOf(selectWith(PLACEHOLDERS.itinerary))).toEqual(["Select itinerary", ...ACTIVE.itinerary]);
    openTravelDetails();
    expect(labelsOf(selectWith(PLACEHOLDERS.mode))).toEqual(["Select mode", ...ACTIVE.mode]);
    expect(labelsOf(selectWith(PLACEHOLDERS.boat))).toEqual(["Select boat", ...ACTIVE.boat]);
    expect(labelsOf(selectWith(PLACEHOLDERS.purpose))).toEqual(["Select purpose", ...ACTIVE.purpose]);
    expect(screen.queryByText(INACTIVE_MARK.trim(), { exact: false })).toBeNull();
    INACTIVE_NAMES.forEach((name) =>
      expect(screen.queryByText(name, { exact: false, selector: "option" })).toBeNull()
    );
  });
});

describe("SAVING an old record without touching its inactive option", () => {
  it("record A is sent with the SAME ids it had: the inactive itinerary 12 and purpose 42", async () => {
    await openEdit("SV-A");

    const [surveyId, payload] = await save();

    expect(surveyId).toBe("SV-A");
    expect(payload.itinerary_id).toBe(12);
    expect(payload.visit_purpose_id).toBe(42);
    expect(payload.travel_mode_id).toBe(21);
    expect(payload.boat_type_id).toBe(31);
    expect(updateRecord).toHaveBeenCalledTimes(1);
  });

  it("record B is sent with ITS inactive vehicle 22 and boat 32", async () => {
    await openEdit("SV-B");

    const [surveyId, payload] = await save();

    expect(surveyId).toBe("SV-B");
    expect(payload.travel_mode_id).toBe(22);
    expect(payload.boat_type_id).toBe(32);
    expect(payload.itinerary_id).toBe(11);
    expect(payload.visit_purpose_id).toBe(41);
  });

  it("the ids stay the same even after the person looked at the lists", async () => {
    await openEdit("SV-A");
    openLocation();
    expect(selectWith(PLACEHOLDERS.itinerary).value).toBe("12");
    openTravelDetails();
    expect(selectWith(PLACEHOLDERS.purpose).value).toBe("42");

    const [, payload] = await save();

    expect(payload.itinerary_id).toBe(12);
    expect(payload.visit_purpose_id).toBe(42);
  });

  it("choosing another option on purpose is sent as that option", async () => {
    await openEdit("SV-A");
    openLocation();
    fireEvent.change(selectWith(PLACEHOLDERS.itinerary), { target: { value: "13" } });

    const [, payload] = await save();

    expect(payload.itinerary_id).toBe(13);
    expect(payload.visit_purpose_id).toBe(42); // the one not touched is still the old id
  });
});

describe("the helper", () => {
  const list = [
    { id: 1, name: "Alpha", is_active: true },
    { id: 2, name: "Bravo", is_active: false },
    { id: 3, name: "Charlie" }, // a list without the flag: all active
  ];

  it("a new record: the active ones only", () => {
    expect(choicesFor(list)).toEqual([
      { id: 1, label: "Alpha" },
      { id: 3, label: "Charlie" },
    ]);
  });

  it("an old record: its own inactive option too, marked", () => {
    expect(choicesFor(list, 2)).toEqual([
      { id: 1, label: "Alpha" },
      { id: 2, label: `Bravo${INACTIVE_MARK}` },
      { id: 3, label: "Charlie" },
    ]);
    expect(choicesFor(list, "2").map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("an old record whose option is active adds nothing", () => {
    expect(choicesFor(list, 1).map((c) => c.id)).toEqual([1, 3]);
  });

  it("an empty or missing list is an empty list", () => {
    expect(choicesFor(undefined)).toEqual([]);
    expect(choicesFor([])).toEqual([]);
  });
});
