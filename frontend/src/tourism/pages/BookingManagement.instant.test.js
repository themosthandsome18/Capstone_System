import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { TourismDataProvider } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";

// The Record Management buttons (archive, unarchive, mark as arrived, mark as cancelled) change the screen AT ONCE, before the server answers,
// settle on the server's answer, and put everything back (with a plain error) when the server refuses. The real provider and the real page
// are used; only the network (tourismApi) is faked, and each answer is held until the test lets it go.

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
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn() }));
jest.mock("../services/tourismApi", () => ({
  tourismApi: {
    getBootstrapData: jest.fn(),
    getBookingManagementData: jest.fn(),
    archiveTouristRecord: jest.fn(),
    unarchiveTouristRecord: jest.fn(),
    updateTouristRecord: jest.fn(),
  },
}));

const REFERENCE = {
  countries: [{ id: 1, name: "Philippines", type: "local" }],
  regions: [{ id: 4, name: "CALABARZON" }],
  provinces: [{ id: 7, name: "Quezon", region_id: 4 }],
  resorts: [{ resort_id: 3, resort_name: "Sample Beach" }],
  itineraries: [{ id: 11, name: "Weekend Trail", is_active: true }],
  travelModes: [{ id: 21, name: "Jeepney Ride", is_active: true }],
  boatTypes: [{ id: 31, name: "Banca", requires_capacity_fare: false, is_active: true }],
  visitPurposes: [{ id: 41, name: "Holiday Break", is_active: true }],
  boatCapacityFares: [],
};

function row(surveyId, extra = {}) {
  return {
    survey_id: surveyId,
    first_name: `F-${surveyId}`,
    last_name: "Reyes",
    contact_number: "+639171234567",
    country_id: 1,
    region_id: 4,
    province_id: 7,
    resort_id: 3,
    itinerary_id: 11,
    travel_mode_id: 21,
    boat_type_id: 31,
    visit_purpose_id: 41,
    arrival_date: "2099-06-01",
    total_visitors: 2,
    status: "pending",
    is_archived: false,
    archived_at: null,
    ...extra,
  };
}

const SUMMARY = { verifiedEntries: 12, pending: 4, arrived: 5, noShow: 3 };

function table({ rows, archivedCount = 0, archived = "active", summary = SUMMARY }) {
  return {
    filters: { year: "all", archived, status: "" },
    summary: { ...summary },
    archivedCount,
    pagination: { page: 1, pageSize: 10, total: rows.length, totalPages: 1, hasPrevious: false, hasNext: false, showingStart: 1, showingEnd: rows.length },
    rows,
  };
}

// a promise the test lets go of (or fails) when it chooses
function held() {
  let resolve;
  let reject;
  const promise = new Promise((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}

const ROWS = () => [row("SV-1"), row("SV-2"), row("SV-3")];

async function start(booking = table({ rows: ROWS() })) {
  tourismApi.getBootstrapData.mockResolvedValue({
    referenceTables: REFERENCE,
    touristRecords: [],
    bookingManagement: booking,
    feedbackEntries: [],
    analytics: {},
    dashboardAlerts: [],
    dashboardData: { filters: {} },
    reportData: {},
    arrivalMonitoring: { filters: {}, summary: {}, rows: [] },
    reportingYears: ["2099"],
    theme: null,
  });
  tourismApi.getBookingManagementData.mockResolvedValue(booking);
  render(
    <TourismDataProvider>
      <BookingManagement />
    </TourismDataProvider>
  );
  await screen.findByText("SV-1");
}

beforeEach(() => {
  jest.clearAllMocks();
});

const ids = () => Array.from(document.querySelectorAll(".booking-id")).map((el) => el.textContent);
const rowOf = (surveyId) => screen.getByText(surveyId, { selector: ".booking-id" }).closest("tr");
const card = (label) => within(screen.getByText(label, { selector: ".booking-status-card p" }).closest(".booking-status-card")).getByRole("heading").textContent;
const cards = () => [card("Verified Entries"), card("Arrived"), card("Cancelled")];
const archivedLine = () => document.querySelector(".booking-archived-count")?.textContent || null;
const errorText = () => document.querySelector(".tourist-record-error")?.textContent || "";
const press = (surveyId, name) => fireEvent.click(within(rowOf(surveyId)).getByRole("button", { name }));
const overlayShown = () => Boolean(screen.queryByText("Please wait..."));

describe("archive", () => {
  it("the row leaves the table and '1 archived' shows BEFORE the server has answered, with no waiting screen and no list read again", async () => {
    const answer = held();
    tourismApi.archiveTouristRecord.mockReturnValue(answer.promise);
    await start();
    expect(ids()).toEqual(["SV-1", "SV-2", "SV-3"]);
    expect(archivedLine()).toBeNull();
    const cardsBefore = cards();

    press("SV-2", "Archive record");

    expect(ids()).toEqual(["SV-1", "SV-3"]); // at once; the server has not answered
    expect(archivedLine()).toBe("1 archived");
    expect(overlayShown()).toBe(false);
    expect(cards()).toEqual(cardsBefore);
    expect(tourismApi.archiveTouristRecord).toHaveBeenCalledWith("SV-2", { year: "all" });

    await act(async () => answer.resolve({ survey_id: "SV-2", is_archived: true, archived_at: "2099-01-01T00:00:00Z", archivedCount: 1 }));

    expect(ids()).toEqual(["SV-1", "SV-3"]);
    expect(archivedLine()).toBe("1 archived");
    expect(cards()).toEqual(cardsBefore);
    expect(tourismApi.getBookingManagementData).not.toHaveBeenCalled(); // the list was not read again
  });

  it("when the server refuses, the row is back where it was, the count is back, and a plain error is shown", async () => {
    const answer = held();
    tourismApi.archiveTouristRecord.mockReturnValue(answer.promise);
    await start();

    press("SV-2", "Archive record");
    expect(ids()).toEqual(["SV-1", "SV-3"]);
    expect(archivedLine()).toBe("1 archived");

    await act(async () => answer.reject(new Error("Server said no.")));

    expect(ids()).toEqual(["SV-1", "SV-2", "SV-3"]); // the same place
    expect(archivedLine()).toBeNull();
    expect(errorText()).toContain("Could not archive SV-2.");
    expect(errorText()).toContain("It is back as it was.");
    expect(errorText()).toContain("Server said no.");
    expect(within(rowOf("SV-2")).getByRole("button", { name: "Archive record" }).disabled).toBe(false);
    expect(cards()).toEqual(["12", "5", "3"]);
  });

  it("the server's word on '"+"N archived"+"' wins when it differs from what was guessed", async () => {
    tourismApi.archiveTouristRecord.mockResolvedValue({ survey_id: "SV-1", is_archived: true, archived_at: "2099-01-01T00:00:00Z", archivedCount: 5 });
    await start(table({ rows: ROWS(), archivedCount: 3 }));
    expect(archivedLine()).toBe("3 archived");

    press("SV-1", "Archive record");
    expect(archivedLine()).toBe("4 archived"); // the guess, at once

    await waitFor(() => expect(archivedLine()).toBe("5 archived")); // the server's number
    expect(ids()).toEqual(["SV-2", "SV-3"]);
  });

  it("the count is right after several archives in a row, each answered later", async () => {
    const first = held();
    const second = held();
    tourismApi.archiveTouristRecord.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await start();

    press("SV-1", "Archive record");
    press("SV-2", "Archive record"); // another row can be pressed while the first is on its way
    expect(ids()).toEqual(["SV-3"]);
    expect(archivedLine()).toBe("2 archived");

    await act(async () => first.resolve({ survey_id: "SV-1", is_archived: true, archived_at: "x", archivedCount: 1 }));
    await act(async () => second.resolve({ survey_id: "SV-2", is_archived: true, archived_at: "x", archivedCount: 2 }));
    expect(archivedLine()).toBe("2 archived");
    expect(ids()).toEqual(["SV-3"]);
  });

  it("one refused and one accepted: only the refused one comes back, and the count is exact", async () => {
    const first = held();
    const second = held();
    tourismApi.archiveTouristRecord.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await start();

    press("SV-1", "Archive record");
    press("SV-3", "Archive record");
    expect(ids()).toEqual(["SV-2"]);
    expect(archivedLine()).toBe("2 archived");

    await act(async () => first.reject(new Error("no")));
    expect(ids()).toEqual(["SV-1", "SV-2"]);
    expect(archivedLine()).toBe("1 archived");

    await act(async () => second.resolve({ survey_id: "SV-3", is_archived: true, archived_at: "x", archivedCount: 1 }));
    expect(ids()).toEqual(["SV-1", "SV-2"]);
    expect(archivedLine()).toBe("1 archived");
  });

  it("while its own change is on the way a row's buttons are held back, and the others' are not", async () => {
    const answer = held();
    tourismApi.archiveTouristRecord.mockReturnValue(answer.promise);
    await start(table({ rows: ROWS(), archived: "all" }));
    // the table is in the 'all' view only once the page asks; the guard under test does not depend on the view
    press("SV-1", "Archive record");
    await waitFor(() => expect(tourismApi.archiveTouristRecord).toHaveBeenCalled());
    const mine = within(rowOf("SV-1")).getAllByRole("button");
    mine.forEach((button) => expect(button.disabled).toBe(true));
    within(rowOf("SV-2")).getAllByRole("button").forEach((button) => expect(button.disabled).toBe(false));
    await act(async () => answer.resolve({ survey_id: "SV-1", is_archived: true, archived_at: "x", archivedCount: 1 }));
  });
});

describe("unarchive", () => {
  async function startArchivedView(archivedRows) {
    const archivedBooking = table({ rows: archivedRows, archived: "archived", archivedCount: archivedRows.length });
    await start(table({ rows: ROWS(), archivedCount: archivedRows.length }));
    tourismApi.getBookingManagementData.mockResolvedValue(archivedBooking);
    fireEvent.change(screen.getByLabelText("Records shown"), { target: { value: "archived" } });
    await waitFor(() => expect(ids()).toEqual(archivedRows.map((r) => r.survey_id)));
  }

  it("in the Archived view the row leaves at once and the count goes down at once; the server settles it", async () => {
    const answer = held();
    tourismApi.unarchiveTouristRecord.mockReturnValue(answer.promise);
    await startArchivedView([row("SV-8", { is_archived: true }), row("SV-9", { is_archived: true })]);
    expect(archivedLine()).toBe("2 archived");
    tourismApi.getBookingManagementData.mockClear();

    press("SV-8", "Unarchive record");

    expect(ids()).toEqual(["SV-9"]);
    expect(archivedLine()).toBe("1 archived");
    await act(async () => answer.resolve({ survey_id: "SV-8", is_archived: false, archived_at: null, archivedCount: 1 }));
    expect(ids()).toEqual(["SV-9"]);
    expect(archivedLine()).toBe("1 archived");
    expect(tourismApi.getBookingManagementData).not.toHaveBeenCalled();
  });

  it("the last one: the line goes away at once", async () => {
    tourismApi.unarchiveTouristRecord.mockReturnValue(held().promise);
    await startArchivedView([row("SV-8", { is_archived: true })]);
    press("SV-8", "Unarchive record");
    expect(archivedLine()).toBeNull();
    expect(ids()).toEqual([]);
  });

  it("when the server refuses, the row returns marked archived, the count is back, and an error is shown", async () => {
    const answer = held();
    tourismApi.unarchiveTouristRecord.mockReturnValue(answer.promise);
    await startArchivedView([row("SV-8", { is_archived: true }), row("SV-9", { is_archived: true })]);

    press("SV-8", "Unarchive record");
    expect(ids()).toEqual(["SV-9"]);
    await act(async () => answer.reject(new Error("Not today.")));

    expect(ids()).toEqual(["SV-8", "SV-9"]);
    expect(archivedLine()).toBe("2 archived");
    expect(within(rowOf("SV-8")).getByText("Archived", { selector: ".booking-archived-mark" })).toBeTruthy();
    expect(errorText()).toContain("Could not bring SV-8 back.");
    expect(errorText()).toContain("Not today.");
  });
});

describe("the 'All' view: the row stays and only its mark changes", () => {
  async function startAll() {
    const all = table({ rows: [row("SV-1"), row("SV-2", { is_archived: true }), row("SV-3")], archived: "all", archivedCount: 1 });
    await start(table({ rows: ROWS(), archivedCount: 1 }));
    tourismApi.getBookingManagementData.mockResolvedValue(all);
    fireEvent.change(screen.getByLabelText("Records shown"), { target: { value: "all" } });
    await waitFor(() => expect(within(rowOf("SV-2")).queryByText("Archived", { selector: ".booking-archived-mark" })).not.toBeNull());
    tourismApi.getBookingManagementData.mockClear();
  }

  it("archive marks it at once and the count follows; a refusal takes the mark off again", async () => {
    const answer = held();
    tourismApi.archiveTouristRecord.mockReturnValue(answer.promise);
    await startAll();
    expect(archivedLine()).toBe("1 archived");

    press("SV-1", "Archive record");
    expect(ids()).toEqual(["SV-1", "SV-2", "SV-3"]);
    expect(within(rowOf("SV-1")).getByText("Archived", { selector: ".booking-archived-mark" })).toBeTruthy();
    expect(archivedLine()).toBe("2 archived");

    await act(async () => answer.reject(new Error("no")));
    expect(within(rowOf("SV-1")).queryByText("Archived", { selector: ".booking-archived-mark" })).toBeNull();
    expect(archivedLine()).toBe("1 archived");
    expect(errorText()).toContain("Could not archive SV-1.");
  });
});

describe("mark as arrived and mark as cancelled", () => {
  it("arrived: the badge and the three cards change at once; the server's record settles it; no list is read again", async () => {
    const answer = held();
    tourismApi.updateTouristRecord.mockReturnValue(answer.promise);
    await start();
    expect(cards()).toEqual(["12", "5", "3"]);

    press("SV-1", "Mark as arrived");

    expect(within(rowOf("SV-1")).getByText("Arrived", { selector: ".booking-badge" })).toBeTruthy();
    expect(cards()).toEqual(["12", "6", "3"]); // Arrived +1 (pending 4 -> 3 is not a card)
    expect(overlayShown()).toBe(false);
    expect(tourismApi.updateTouristRecord).toHaveBeenCalledWith("SV-1", { status: "arrived" });

    await act(async () => answer.resolve({ survey_id: "SV-1", status: "arrived" }));
    expect(within(rowOf("SV-1")).getByText("Arrived", { selector: ".booking-badge" })).toBeTruthy();
    expect(cards()).toEqual(["12", "6", "3"]);
    expect(tourismApi.getBookingManagementData).not.toHaveBeenCalled();
  });

  it("arrived, refused: the badge and the cards are back, and an error is shown", async () => {
    const answer = held();
    tourismApi.updateTouristRecord.mockReturnValue(answer.promise);
    await start();

    press("SV-1", "Mark as arrived");
    expect(cards()).toEqual(["12", "6", "3"]);
    await act(async () => answer.reject(new Error("Refused.")));

    expect(within(rowOf("SV-1")).getByText("Pending", { selector: ".booking-badge" })).toBeTruthy();
    expect(cards()).toEqual(["12", "5", "3"]);
    expect(errorText()).toContain("Could not mark SV-1 as arrived.");
    expect(errorText()).toContain("It is back as it was.");
    expect(errorText()).toContain("Refused.");
  });

  it("cancelled: the badge and the card change at once, and a refusal puts them back", async () => {
    const answer = held();
    tourismApi.updateTouristRecord.mockReturnValue(answer.promise);
    await start();

    press("SV-3", "Mark as cancelled");
    expect(within(rowOf("SV-3")).getByText("Cancelled", { selector: ".booking-badge" })).toBeTruthy();
    expect(cards()).toEqual(["12", "5", "4"]);

    await act(async () => answer.reject(new Error("Nope.")));
    expect(within(rowOf("SV-3")).getByText("Pending", { selector: ".booking-badge" })).toBeTruthy();
    expect(cards()).toEqual(["12", "5", "3"]);
    expect(errorText()).toContain("Could not mark SV-3 as cancelled.");
  });

  it("an arrived record marked cancelled moves one card to the other, and back if refused", async () => {
    const answer = held();
    tourismApi.updateTouristRecord.mockReturnValue(answer.promise);
    await start(table({ rows: [row("SV-1", { status: "arrived" }), row("SV-2")] }));

    press("SV-1", "Mark as cancelled");
    expect(cards()).toEqual(["12", "4", "4"]);
    await act(async () => answer.reject(new Error("no")));
    expect(cards()).toEqual(["12", "5", "3"]);
  });

  it("with a status filter on, the row leaves at once and comes back in its place when refused", async () => {
    const answer = held();
    tourismApi.updateTouristRecord.mockReturnValue(answer.promise);
    const filtered = table({ rows: [row("SV-1"), row("SV-2"), row("SV-3")] });
    filtered.filters.status = "pending";
    await start(filtered);

    press("SV-2", "Mark as arrived");
    expect(ids()).toEqual(["SV-1", "SV-3"]);
    await act(async () => answer.reject(new Error("no")));
    expect(ids()).toEqual(["SV-1", "SV-2", "SV-3"]);
    expect(cards()).toEqual(["12", "5", "3"]);
  });
});
