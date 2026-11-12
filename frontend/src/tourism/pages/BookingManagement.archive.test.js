import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";

// A tourist record is never deleted in Record Management: it is ARCHIVED, which takes it off the table (and only the table) and can be
// undone. The three cards, and every other number, still count it.

let mockRole = "admin";
jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: "/tourist-data", state: null }),
    useNavigate: () => jest.fn(),
    useOutletContext: () => ({}),
  }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ role: mockRole }) }));
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
  boatTypes: [{ id: 31, name: "Banca", requires_capacity_fare: false, is_active: true }],
  visitPurposes: [{ id: 41, name: "Holiday Break", is_active: true }],
};

function row(surveyId, extra = {}) {
  return {
    survey_id: surveyId,
    first_name: "Alma",
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

// the cards come from the server's summary (all records), not from the rows on the page
const SUMMARY = { verifiedEntries: 12, pending: 4, arrived: 5, noShow: 3 };

let archiveRecord;
let unarchiveRecord;
let refreshBookingManagement;

function show({ rows, archivedCount = 0, archived = "active" }) {
  useTourismData.mockReturnValue({
    referenceTables: REFERENCE,
    bookingManagement: {
      filters: { year: "all", archived },
      summary: SUMMARY,
      archivedCount,
      pagination: { page: 1, totalPages: 1, total: rows.length, pageSize: 10 },
      rows,
    },
    reportingYears: ["2099"],
    createRecord: jest.fn(),
    updateRecord: jest.fn().mockResolvedValue({}),
    archiveRecord,
    unarchiveRecord,
    previewOnlineBookingImport: jest.fn(),
    importOnlineBookingFile: jest.fn(),
    refreshBookingManagement,
  });
}

beforeEach(() => {
  mockRole = "admin";
  archiveRecord = jest.fn().mockResolvedValue({ is_archived: true });
  unarchiveRecord = jest.fn().mockResolvedValue({ is_archived: false });
  refreshBookingManagement = jest.fn().mockResolvedValue({ pagination: { page: 1 } });
});

const rowOf = (surveyId) => screen.getByText(surveyId).closest("tr");
const card = (label) => screen.getByText(label, { selector: ".booking-status-card p" }).closest(".booking-status-card");
const viewSelect = () => screen.getByLabelText("Records shown");

describe("there is no way to delete a record on the screen", () => {
  it.each(["admin", "tourism"])("no Delete button and no delete confirmation, for the %s", async (role) => {
    mockRole = role;
    show({ rows: [row("SV-1"), row("SV-2")] });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByLabelText(/delete/i)).toBeNull();
    expect(screen.queryByTitle(/delete/i)).toBeNull();
    expect(document.querySelector(".booking-icon-btn.delete")).toBeNull();
    expect(screen.queryByText(/are you sure you want to delete/i)).toBeNull();
    expect(document.querySelector(".delete-record-confirm")).toBeNull();
  });

  it("the page, the context and the api no longer have the delete code", () => {
    const src = join(__dirname, "..");
    const text = ["pages/BookingManagement.js", "context/TourismDataContext.js", "services/tourismApi.js"]
      .map((file) => readFileSync(join(src, file), "utf8"))
      .join("\n");
    expect(text).not.toMatch(/deleteRecord|deleteTouristRecord|FiTrash2|confirmDeleteRecord|delete-record-confirm/);
  });
});

describe("the archive button of a row", () => {
  it("archives the record (the table is not read again: see BookingManagement.instant.test.js)", async () => {
    show({ rows: [row("SV-1"), row("SV-2")] });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    fireEvent.click(within(rowOf("SV-1")).getByRole("button", { name: "Archive record" }));
    await waitFor(() => expect(archiveRecord).toHaveBeenCalledWith("SV-1"));
    expect(unarchiveRecord).not.toHaveBeenCalled();
  });

  it("is a button to bring it back once the record is archived", async () => {
    show({ rows: [row("SV-1", { is_archived: true, archived_at: "2099-01-01T00:00:00Z" })], archived: "all" });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(within(rowOf("SV-1")).queryByRole("button", { name: "Archive record" })).toBeNull();
    fireEvent.click(within(rowOf("SV-1")).getByRole("button", { name: "Unarchive record" }));
    await waitFor(() => expect(unarchiveRecord).toHaveBeenCalledWith("SV-1"));
    expect(archiveRecord).not.toHaveBeenCalled();
  });

  it("an error from the server is shown and nothing else happens", async () => {
    archiveRecord.mockRejectedValue(new Error("Could not archive."));
    show({ rows: [row("SV-1")] });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    fireEvent.click(within(rowOf("SV-1")).getByRole("button", { name: "Archive record" }));
    await screen.findByText(/Could not archive/);
  });
});

describe("an archived row, when it is shown, is plainly marked", () => {
  it("has the Archived mark and the row class; a record that is not archived has neither", async () => {
    show({
      rows: [row("SV-1", { is_archived: true, archived_at: "2099-01-01T00:00:00Z" }), row("SV-2")],
      archivedCount: 1,
      archived: "all",
    });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(within(rowOf("SV-1")).getByText("Archived", { selector: ".booking-archived-mark" })).toBeTruthy();
    expect(rowOf("SV-1").classList.contains("booking-row-archived")).toBe(true);
    expect(within(rowOf("SV-2")).queryByText("Archived")).toBeNull();
    expect(rowOf("SV-2").classList.contains("booking-row-archived")).toBe(false);
  });
});

describe("the three views of the table", () => {
  it("are Active, Archived and All, and Active is the one chosen at first", async () => {
    show({ rows: [row("SV-1")] });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(Array.from(viewSelect().options).map((o) => [o.value, o.textContent])).toEqual([
      ["active", "Active"],
      ["archived", "Archived"],
      ["all", "All"],
    ]);
    expect(viewSelect().value).toBe("active");
  });

  it.each([["archived"], ["all"], ["active"]])("choosing %s asks the server for that view, from the first page", async (view) => {
    show({ rows: [row("SV-1")] });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    // the first request is skipped by the page; choose another view than the one shown to make a change
    fireEvent.change(viewSelect(), { target: { value: view === "active" ? "all" : view } });
    if (view === "active") fireEvent.change(viewSelect(), { target: { value: "active" } });
    await waitFor(() => expect(refreshBookingManagement).toHaveBeenCalledWith(expect.objectContaining({ archived: view, page: 1 })));
  });

  it("the default view sent to the server is active", async () => {
    show({ rows: [row("SV-1")] });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    fireEvent.change(screen.getByDisplayValue("All Status"), { target: { value: "pending" } });
    await waitFor(() => expect(refreshBookingManagement).toHaveBeenCalledWith(expect.objectContaining({ archived: "active", status: "pending" })));
  });
});

describe("the line that says how many are archived", () => {
  it("says '2 archived' when two are", async () => {
    show({ rows: [row("SV-1")], archivedCount: 2 });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(screen.getByText("2 archived")).toBeTruthy();
  });

  it("says '1 archived' for one", async () => {
    show({ rows: [row("SV-1")], archivedCount: 1 });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(screen.getByText("1 archived")).toBeTruthy();
  });

  it("is not there when there are none", async () => {
    show({ rows: [row("SV-1")], archivedCount: 0 });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(screen.queryByText(/archived$/)).toBeNull();
    expect(document.querySelector(".booking-archived-count")).toBeNull();
  });

  it("is not there when the server sends no count at all", async () => {
    show({ rows: [row("SV-1")] });
    useTourismData.mockReturnValue({ ...useTourismData(), bookingManagement: { ...useTourismData().bookingManagement, archivedCount: undefined } });
    render(<BookingManagement />);
    await screen.findByText("SV-1");
    expect(document.querySelector(".booking-archived-count")).toBeNull();
  });
});

describe("the three cards at the top are not touched by the archive", () => {
  it.each([[0, "active"], [3, "active"], [3, "archived"], [3, "all"]])(
    "with %i archived and the %s view open, they show the server's figures for ALL records",
    async (archivedCount, view) => {
      const rows = view === "archived" ? [row("SV-1", { is_archived: true })] : [row("SV-1")];
      show({ rows, archivedCount, archived: view });
      render(<BookingManagement />);
      await screen.findByText("SV-1");
      expect(within(card("Verified Entries")).getByRole("heading").textContent).toBe("12");
      expect(within(card("Arrived")).getByRole("heading").textContent).toBe("5");
      expect(within(card("Cancelled")).getByRole("heading").textContent).toBe("3");
    }
  );

  it("the cards read only the summary: no figure on the page is worked out from the rows or the archive", () => {
    const source = readFileSync(join(__dirname, "BookingManagement.js"), "utf8");
    expect(source).toMatch(/verifiedEntries: bookingSummary\.verifiedEntries/);
    expect(source).not.toMatch(/rows\.filter\([^)]*is_archived/);
    expect(source).not.toMatch(/summary[^\n]*archivedCount|archivedCount[^\n]*summary\./);
  });
});
