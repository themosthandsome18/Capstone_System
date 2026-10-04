import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SanitaryGISMap from "./SanitaryGISMap";
import HouseholdRecords from "./HouseholdRecords";

const mockMap = { flyTo: jest.fn(), fitBounds: jest.fn(), setView: jest.fn() };
const mockHousehold = {
  id: 11, household_code: "HH-UNMAPPED", household_head: "Unmapped household",
  barangay: "Daungan", status: "good_standing", latitude: null, longitude: null,
  toilet_type: "water_sealed", water_level: "level_3", waste_disposal: "collected",
  male_count: 1, female_count: 2, total_members: 3, remarks: "Original notes", address: "",
};
let mockHouseholds;
let mockEstablishments;
const mockUpdate = jest.fn();

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ state: null }), useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  GeoJSON: () => null,
  Popup: ({ children }) => <div>{children}</div>,
  Marker: ({ position, children }) => (
    <div data-testid="map-marker" data-position={JSON.stringify(position)}>{children}</div>
  ),
  useMap: () => mockMap,
}));
jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({
    householdRecords: mockHouseholds, establishments: mockEstablishments,
    barangays: [], householdDashboardData: null, loading: false, error: null,
    refreshData: jest.fn(), refreshComplaintData: jest.fn(),
    createHousehold: jest.fn(), updateHousehold: mockUpdate,
  }),
}));

beforeEach(() => {
  mockHouseholds = [{ ...mockHousehold }];
  mockEstablishments = [];
  mockUpdate.mockClear();
});

function renderHouseholdMap() {
  render(<SanitaryGISMap />);
  fireEvent.click(screen.getByRole("button", { name: "Households" }));
}

test.each([
  ["null", null, null], ["missing", undefined, undefined],
  ["invalid text", "invalid", "invalid"], ["zero", 0, 0],
  ["near zero", 0.0001, 0.0001], ["partial", 14.19, null],
  ["outside existing map bounds", 90, 180],
])("household with %s coordinates has no fallback marker", (_label, latitude, longitude) => {
  mockHouseholds = [{ ...mockHousehold, latitude, longitude }];
  renderHouseholdMap();
  expect(screen.queryAllByTestId("map-marker")).toHaveLength(0);
});

test("valid household marker retains exact stored position alongside unmapped records", () => {
  mockHouseholds.push({ ...mockHousehold, id: 12, household_code: "HH-VALID",
    household_head: "Mapped household", latitude: 14.192345678, longitude: 121.734567891 });
  renderHouseholdMap();
  const markers = screen.getAllByTestId("map-marker");
  expect(markers).toHaveLength(1);
  expect(markers[0]).toHaveAttribute("data-position", "[14.192345678,121.734567891]");
});

test("stored nested coordinate representation remains supported", () => {
  mockHouseholds = [{ ...mockHousehold, coordinates: { lat: 14.19, lng: 121.73 } }];
  renderHouseholdMap();
  expect(screen.getByTestId("map-marker")).toHaveAttribute("data-position", "[14.19,121.73]");
});

test("establishment fallback and valid markers retain their existing positions", () => {
  mockEstablishments = [
    { id: 11, business_name: "Fallback establishment", barangay: "Daungan", compliance_status: "good_standing" },
    { id: 12, business_name: "Mapped establishment", barangay: "Daungan", compliance_status: "good_standing",
      latitude: 14.19, longitude: 121.73 },
  ];
  render(<SanitaryGISMap />);
  expect(screen.getAllByTestId("map-marker").map(marker => marker.getAttribute("data-position")))
    .toEqual(["[14.187157,121.733225]", "[14.19,121.73]"]);
});

test("unmapped household remains visible and editable in Household Records", async () => {
  render(<HouseholdRecords />);
  expect(screen.getByText("Unmapped household")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle("Edit Household Record"));
  fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: "Updated notes" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument());
  expect(mockUpdate).toHaveBeenCalledWith(11, { remarks: "Updated notes" });
});
