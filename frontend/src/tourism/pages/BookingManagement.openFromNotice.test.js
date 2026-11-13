/**
 * "Open" on a notification (the bell) comes to Record Management as /tourist-data?openSurveyId=<survey ID>: the view modal of THAT record opens, once for
 * each visit. The record is read from the server by its survey ID (it need not be on the page of the table that is loaded).
 */
import { render, screen, waitFor } from "@testing-library/react";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";

let mockLocation = { pathname: "/tourist-data", search: "", key: "k0", state: null };
jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => mockLocation, useNavigate: () => jest.fn(), useOutletContext: () => ({}) }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ role: "tourism" }) }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn(), useBookingListPolling: jest.fn() }));
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn() }));
jest.mock("../services/tourismApi", () => ({ tourismApi: { getTouristRecord: jest.fn() } }));

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

const RECORD = {
  survey_id: "SV-OPEN", first_name: "Alma", last_name: "Reyes", email: "", contact_number: "09171234567", country_id: 1, region_id: 4, province_id: 7,
  resort_id: 3, itinerary_id: 11, travel_mode_id: 21, boat_type_id: 31, boat_capacity_fare: "", visit_purpose_id: 41, arrival_date: "2099-06-01",
  filipino_count: 2, foreigner_count: 0, maubanin_count: 0, total_visitors: 2, total_male: 1, total_female: 1, special_group_count: 0, age_0_7: 0,
  age_8_59: 2, age_60_above: 0, discounted_count: 0, status: "pending",
};

beforeEach(() => {
  mockLocation = { pathname: "/tourist-data", search: "", key: "k0", state: null };
  tourismApi.getTouristRecord.mockResolvedValue(RECORD);
  useTourismData.mockReturnValue({
    referenceTables: REFERENCE,
    // the table's page does NOT hold SV-OPEN: the record is read by its survey ID
    bookingManagement: { rows: [], summary: {}, pagination: { page: 1, totalPages: 1, total: 0 } },
    reportingYears: ["2099"],
    createRecord: jest.fn(), updateRecord: jest.fn(), deleteRecord: jest.fn(),
    previewOnlineBookingImport: jest.fn(), importOnlineBookingFile: jest.fn(),
    refreshBookingManagement: jest.fn().mockResolvedValue({ pagination: { page: 1 } }),
  });
});

describe("opened from a notification", () => {
  it("reads that record by its survey ID and opens its view modal", async () => {
    mockLocation = { pathname: "/tourist-data", search: "?openSurveyId=SV-OPEN", key: "n1", state: null };
    render(<BookingManagement />);

    expect(await screen.findByText("Tourist Record Details")).toBeTruthy();
    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SV-OPEN");
  });

  it("a survey ID with characters in it arrives whole", async () => {
    mockLocation = { pathname: "/tourist-data", search: `?openSurveyId=${encodeURIComponent("SV/2026 #1")}`, key: "n2", state: null };
    render(<BookingManagement />);

    await waitFor(() => expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SV/2026 #1"));
  });

  it("opens only once for a visit: drawing the page again does not read it again", async () => {
    mockLocation = { pathname: "/tourist-data", search: "?openSurveyId=SV-OPEN", key: "n3", state: null };
    const { rerender } = render(<BookingManagement />);
    await screen.findByText("Tourist Record Details");

    rerender(<BookingManagement />);

    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
  });

  it("a record that cannot be read says so, and opens nothing", async () => {
    tourismApi.getTouristRecord.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    mockLocation = { pathname: "/tourist-data", search: "?openSurveyId=SV-GONE", key: "n4", state: null };
    render(<BookingManagement />);

    expect(await screen.findByText("Record SV-GONE could not be opened.")).toBeTruthy();
    expect(screen.queryByText("Tourist Record Details")).toBeNull();
  });

  it("with no survey ID in the address, nothing is read and nothing opens: the page is as it was", async () => {
    render(<BookingManagement />);
    await waitFor(() => expect(useTourismData).toHaveBeenCalled());

    expect(tourismApi.getTouristRecord).not.toHaveBeenCalled();
    expect(screen.queryByText("Tourist Record Details")).toBeNull();
  });
});
