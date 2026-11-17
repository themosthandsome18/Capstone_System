import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";

// The import of online booking Excel files is the Tourism Office's work, and the system admin passes through to the same page: both see the
// Import Excel button, and the page decides nothing by the role.

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
// Whatever role is logged in, the page must not read it: the mock hands out the role, and the test checks nobody asked.
const mockUseAuth = jest.fn();
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../context/TourismDataContext", () => ({
  useTourismData: jest.fn(),
  useBookingListPolling: jest.fn(),
}));
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn() }));

let previewOnlineBookingImport;

beforeEach(() => {
  mockRole = "admin";
  mockUseAuth.mockReset();
  mockUseAuth.mockImplementation(() => ({ role: mockRole }));
  previewOnlineBookingImport = jest.fn().mockResolvedValue({ valid_count: 1, skipped_count: 0, duplicate_count: 0, new_resort_count: 0 });
  useTourismData.mockReturnValue({
    referenceTables: { countries: [], regions: [], provinces: [], resorts: [], itineraries: [], travelModes: [], boatTypes: [], visitPurposes: [] },
    bookingManagement: {
      filters: { year: "all", archived: "active" },
      summary: {},
      archivedCount: 0,
      pagination: { page: 1, totalPages: 1, total: 0, pageSize: 10 },
      rows: [],
    },
    reportingYears: ["2099"],
    createRecord: jest.fn(),
    updateRecord: jest.fn(),
    archiveRecord: jest.fn(),
    unarchiveRecord: jest.fn(),
    setRecordStatus: jest.fn(),
    previewOnlineBookingImport,
    importOnlineBookingFile: jest.fn(),
    refreshBookingManagement: jest.fn().mockResolvedValue({ pagination: { page: 1 } }),
  });
});

const importLabel = () => screen.queryByText("Import Excel", { selector: "label" });

describe("the Import Excel button", () => {
  it.each(["tourism", "admin"])("is there for the %s", async (role) => {
    mockRole = role;
    render(<BookingManagement />);
    await screen.findByText("Export CSV");
    const label = importLabel();
    expect(label).not.toBeNull();
    const input = label.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input.getAttribute("accept")).toBe(".xlsx,.xls");
    expect(label.classList.contains("booking-import-btn")).toBe(true);
  });

  it("works the same for the tourism officer: choosing a file asks the server for a preview", async () => {
    mockRole = "tourism";
    render(<BookingManagement />);
    await screen.findByText("Export CSV");
    const file = new File(["x"], "bookings.xlsx", { type: "application/vnd.ms-excel" });
    fireEvent.change(importLabel().querySelector("input"), { target: { files: [file] } });
    await waitFor(() => expect(previewOnlineBookingImport).toHaveBeenCalledWith(file));
  });

  it("is the same two buttons next to it for both roles (Add Record, Export CSV, Import Excel)", async () => {
    const seen = {};
    for (const role of ["tourism", "admin"]) {
      mockRole = role;
      const { unmount } = render(<BookingManagement />);
      await screen.findByText("Export CSV");
      seen[role] = Array.from(document.querySelectorAll(".booking-actions button, .booking-actions label")).map((el) => el.textContent.trim());
      unmount();
    }
    expect(seen.tourism).toEqual(seen.admin);
    expect(seen.tourism).toEqual(expect.arrayContaining(["Export CSV", "Import Excel"]));
  });

  it("the page does not decide the Import Excel button by the role: it reads the role only for Edit, and every role is given the same buttons", async () => {
    for (const role of ["tourism", "admin", "resort", ""]) {
      mockRole = role;
      const { unmount } = render(<BookingManagement />);
      await screen.findByText("Export CSV");
      expect(importLabel()).not.toBeNull();
      unmount();
    }
  });
});

describe("the preview says which rows go to the fallback resort, before anything is imported", () => {
  const PREVIEW = {
    valid_count: 5, imported_count: 0, updated_count: 0, skipped_count: 0, duplicate_count: 0, new_resort_count: 0,
    valid_samples: [], error_samples: [], duplicate_samples: [], new_resort_samples: [],
    fallback_count: 3, fallback_resort: "Others / Private Residence",
    fallback_samples: [{ name: "Villa Unknown", rows: 2 }, { name: "Casa Nowhere", rows: 1 }], fallback_notice: "",
  };
  const choose = async (preview) => {
    mockRole = "tourism";
    previewOnlineBookingImport.mockResolvedValue(preview);
    render(<BookingManagement />);
    await screen.findByText("Export CSV");
    fireEvent.change(importLabel().querySelector("input"), { target: { files: [new File(["x"], "bookings.xlsx")] } });
    await screen.findByText("Duplicates", { selector: "span" }); // the preview itself has come, not only its frame
  };
  const section = () => screen.getByRole("heading", { name: /^Rows Going to/ }).closest("section");

  it("shows how many rows go there, which names they carry, and where they go", async () => {
    await choose(PREVIEW);
    const stat = screen.getByText("To fallback resort").closest("div");
    expect(stat.textContent).toContain("3");
    expect(screen.getByRole("heading", { name: "Rows Going to Others / Private Residence" })).toBeTruthy();
    expect(section().textContent).toContain("Villa Unknown — 2 rows");
    expect(section().textContent).toContain("Casa Nowhere — 1 row");
    expect(section().textContent).toContain("fix the name in the file, or add the resort, before importing");
  });

  it("says so when no row goes there", async () => {
    await choose({ ...PREVIEW, fallback_count: 0, fallback_samples: [] });
    expect(section().textContent).toContain("None: every row names a resort we know.");
  });

  it("shows the notice when more than one resort is marked as the fallback", async () => {
    await choose({ ...PREVIEW, fallback_notice: "2 resorts are marked as the fallback (ids 4, 9); the one with the smallest id, 4, is used. Only one should be marked." });
    expect(section().textContent).toContain("2 resorts are marked as the fallback (ids 4, 9)");
  });

  it("an older server (no fallback keys) shows nothing about it", async () => {
    const { fallback_count, fallback_resort, fallback_samples, fallback_notice, ...older } = PREVIEW;
    await choose(older);
    expect(screen.queryByText("To fallback resort")).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Rows Going to/ })).toBeNull();
  });
});
