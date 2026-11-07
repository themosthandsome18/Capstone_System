import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";

// The Add Record / Edit wizard ties the Boat Capacity and Fare tier to the head
// count (Filipino + foreigner) through the tier's own min_pax and max_pax:
//   - the count changes  -> the tier whose range holds it is chosen;
//   - a tier is chosen that does not hold the count -> a warning, the count is NOT
//     changed and saving is NOT stopped;
//   - a tier with no range (null) is skipped by both.

const T = {
  A: "1-2 pax (One-Way P1500, Two-way P2000)",
  B: "3-4 pax (One-Way P2000, Two-way P2,500)",
  C: "5-6 pax (One-Way P2,500, Two-way P3,000)",
  D: "7-8 pax (One-Way P3,000, Two-way P3,500)",
  OPEN: "Open charter (price on request)",
};
const PLACEHOLDER = "Select capacity and fare";

const TIERS = [
  { id: 1, name: T.A, display_order: 10, is_active: true, min_pax: 1, max_pax: 2 },
  { id: 2, name: T.B, display_order: 20, is_active: true, min_pax: 3, max_pax: 4 },
  { id: 3, name: T.C, display_order: 30, is_active: true, min_pax: 5, max_pax: 6 },
  { id: 4, name: T.D, display_order: 40, is_active: true, min_pax: 7, max_pax: 8 },
  { id: 5, name: T.OPEN, display_order: 50, is_active: true, min_pax: null, max_pax: null },
];

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

// A record of `people` Filipino visitors, balanced everywhere so that it can be saved.
function record(surveyId, { boat = 31, fare = "", people = 2, foreigners = 0 } = {}) {
  const total = people + foreigners;
  const male = Math.ceil(total / 2);
  return {
    survey_id: surveyId,
    first_name: "Alma",
    last_name: "Reyes",
    email: "alma@example.test",
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
    filipino_count: people,
    foreigner_count: foreigners,
    maubanin_count: 0,
    total_visitors: total,
    total_male: male,
    total_female: total - male,
    special_group_count: 0,
    age_0_7: 0,
    age_8_59: total,
    age_60_above: 0,
    discounted_count: 0,
    status: "pending",
  };
}

let updateRecord;

function show(rec, tiers = TIERS) {
  useTourismData.mockReturnValue({
    referenceTables: { ...BASE_REFERENCE, boatCapacityFares: tiers },
    bookingManagement: { rows: [rec], summary: {}, pagination: { page: 1, totalPages: 1, total: 1 } },
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
});

const step = (label) =>
  fireEvent.click(screen.getByText(label, { selector: ".wizard-step-label strong" }).closest(".wizard-step-item"));

async function open(rec, tiers) {
  show(rec, tiers);
  render(<BookingManagement />);
  const row = await waitFor(() => screen.getByText(rec.survey_id).closest("tr"));
  fireEvent.click(row.querySelector(".booking-icon-btn.view"));
  await screen.findByText("Tourist Record Details & Edit");
}

const fareSelect = () => screen.getByText(PLACEHOLDER, { selector: "option" }).closest("select");
const fieldInput = (label) => screen.getByText(label).closest(".wizard-field").querySelector("input");
const shown = (select) => select.options[select.selectedIndex]?.textContent;
const warning = () => screen.queryByRole("status");

// set a count on the Head Count step, then go and look at the tier on the Travel Details step
function setCount(label, value) {
  step("Head Count");
  fireEvent.change(fieldInput(label), { target: { value: String(value) } });
}
function lookAtTier() {
  step("Travel Details");
  return fareSelect();
}

describe("the count chooses the tier", () => {
  it("5 visitors -> 5-6 pax", async () => {
    await open(record("SV-1", { people: 2, fare: "" }));
    setCount("Filipino Count", 5);
    expect(shown(lookAtTier())).toBe(T.C);
    expect(lookAtTier().value).toBe(T.C);
  });

  it("2 visitors -> 1-2 pax", async () => {
    await open(record("SV-2", { people: 5, fare: "" }));
    setCount("Filipino Count", 2);
    expect(lookAtTier().value).toBe(T.A);
  });

  it("the count goes from 2 to 5 -> the tier moves from 1-2 to 5-6", async () => {
    await open(record("SV-3", { people: 2, fare: T.A }));
    expect(lookAtTier().value).toBe(T.A);
    setCount("Filipino Count", 5);
    expect(lookAtTier().value).toBe(T.C);
  });

  it("the foreigner count counts too: 3 Filipino + 2 foreigners = 5 -> 5-6 pax", async () => {
    await open(record("SV-4", { people: 3, fare: "" }));
    setCount("Foreigner Count", 2);
    expect(lookAtTier().value).toBe(T.C);
  });

  it("a tier that already holds the count is kept", async () => {
    await open(record("SV-5", { people: 2, fare: T.A }));
    setCount("Filipino Count", 1);
    expect(lookAtTier().value).toBe(T.A);
  });

  it("no tier holds the count (9 visitors) -> the tier is left as it was", async () => {
    await open(record("SV-6", { people: 2, fare: T.A }));
    setCount("Filipino Count", 9);
    expect(lookAtTier().value).toBe(T.A);
  });

  it("a boat that takes no fare is left alone", async () => {
    await open(record("SV-7", { boat: 32, people: 2, fare: "" }));
    setCount("Filipino Count", 5);
    step("Travel Details");
    expect(fareSelect().disabled).toBe(true);
    expect(fareSelect().value).toBe("");
  });

  it("a tier with no range is never chosen: when it is the only one, nothing changes", async () => {
    await open(record("SV-8", { people: 2, fare: "" }), [TIERS[4]]);
    setCount("Filipino Count", 5);
    expect(lookAtTier().value).toBe("");
  });
});

describe("a tier that does not hold the count: a warning, nothing blocked", () => {
  it("choosing 3-4 pax while 5 are coming warns with the real number and the real range, and the counts do not move", async () => {
    await open(record("SV-9", { people: 5, fare: T.C }));
    lookAtTier();
    expect(warning()).toBeNull();
    fireEvent.change(fareSelect(), { target: { value: T.B } });
    expect(warning().textContent).toBe("5 visitors do not fit 3-4 pax.");
    // the tier was chosen by hand: it stays, and the head count is untouched
    expect(fareSelect().value).toBe(T.B);
    step("Head Count");
    expect(fieldInput("Filipino Count").value).toBe("5");
    expect(fieldInput("Foreigner Count").value).toBe("0");
  });

  it("one visitor reads as one", async () => {
    await open(record("SV-10", { people: 1, fare: T.A }));
    lookAtTier();
    fireEvent.change(fareSelect(), { target: { value: T.D } });
    expect(warning().textContent).toBe("1 visitor does not fit 7-8 pax.");
  });

  it("a tier that holds the count has no warning", async () => {
    await open(record("SV-11", { people: 5, fare: T.B }));
    lookAtTier();
    expect(warning()).not.toBeNull(); // 5 in 3-4: the record opens with the warning
    fireEvent.change(fareSelect(), { target: { value: T.C } });
    expect(warning()).toBeNull();
  });

  it("a tier with no range has no warning, whatever the count", async () => {
    await open(record("SV-12", { people: 5, fare: T.C }));
    lookAtTier();
    fireEvent.change(fareSelect(), { target: { value: T.OPEN } });
    expect(warning()).toBeNull();
  });

  it("the warning does not stop the record from being saved", async () => {
    await open(record("SV-13", { people: 5, fare: T.B }));
    lookAtTier();
    expect(warning().textContent).toBe("5 visitors do not fit 3-4 pax.");
    step("Review");
    fireEvent.click(await screen.findByRole("button", { name: /Update Record/ }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalled());
    const [, payload] = updateRecord.mock.calls[0];
    expect(payload.boat_capacity_fare).toBe(T.B);
    expect(payload.filipino_count).toBe(5);
    expect(payload.total_visitors).toBe(5);
  });
});
