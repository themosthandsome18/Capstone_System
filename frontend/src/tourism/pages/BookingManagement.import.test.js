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

  it("the page does not look at the role at all", async () => {
    mockRole = "tourism";
    render(<BookingManagement />);
    await screen.findByText("Export CSV");
    expect(mockUseAuth).not.toHaveBeenCalled();
  });
});
