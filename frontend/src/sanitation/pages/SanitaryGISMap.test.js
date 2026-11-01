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
let mockLoading;
let mockError;
let mockGeoJSON;
const mockUpdate = jest.fn();

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ state: null }), useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  GeoJSON: (props) => { mockGeoJSON = props; return null; },
  Popup: ({ children }) => <div>{children}</div>,
  Marker: ({ position, icon, title, children }) => (
    <div data-testid="map-marker" data-position={JSON.stringify(position)} data-icon={icon.options.html} title={title}>{children}</div>
  ),
  useMap: () => mockMap,
}));
jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({
    householdRecords: mockHouseholds, establishments: mockEstablishments,
    barangays: [], householdDashboardData: null, loading: mockLoading, error: mockError,
    refreshData: jest.fn(), refreshComplaintData: jest.fn(),
    createHousehold: jest.fn(), updateHousehold: mockUpdate,
  }),
}));

beforeEach(() => {
  mockHouseholds = [{ ...mockHousehold }];
  mockEstablishments = [];
  mockUpdate.mockClear();
  mockLoading = false;
  mockError = null;
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

test("establishment without coordinates is identified without a fallback marker", () => {
  mockEstablishments = [
    { id: 11, business_name: "Fallback establishment", barangay: "Daungan", compliance_status: "good_standing" },
    { id: 12, business_name: "Mapped establishment", barangay: "Daungan", compliance_status: "good_standing",
      latitude: 14.19, longitude: 121.73 },
  ];
  render(<SanitaryGISMap />);
  expect(screen.getAllByTestId("map-marker").map(marker => marker.getAttribute("data-position")))
    .toEqual(["[14.19,121.73]"]);
  expect(screen.getByText(/Missing or unusable coordinates — not mapped/)).toBeInTheDocument();
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

const statuses = [
  ["not_yet_inspected", "Not Yet Inspected", "#64748b"],
  ["good_standing", "Good Standing", "#16a34a"],
  ["upcoming", "Upcoming", "#f59e0b"],
  ["for_completion", "For Completion", "#ea580c"],
  ["violation", "Violation", "#dc2626"],
  ["no_permit", "No Permit", "#991b1b"],
];
function fixtures() {
  return ["Daungan", "Lual"].flatMap((barangay, b) => statuses.map(([status], i) => ({
    id: b * 10 + i, business_name: `${barangay}-${status}`, barangay,
    compliance_status: status, compliance_status_label: statuses[i][1],
    // Conflicting permit fields must never override authoritative compliance.
    has_permit: false, permit_status: "expired", latitude: 14.18 + i / 1000, longitude: 121.73 + b / 1000,
  }))).concat({ id: 99, business_name: "Unmapped violation", barangay: "Daungan", compliance_status: "violation", latitude: null, longitude: null });
}
function summary(label) {
  return Array.from(document.querySelectorAll(".gis-map-summary-card")).find(el => el.querySelector("span").textContent === label).querySelector("strong").textContent;
}
test.each(statuses)("%s markers use authoritative color and remain distinguishable", (status, label, color) => {
  mockEstablishments = fixtures(); render(<SanitaryGISMap />);
  fireEvent.change(screen.getByLabelText("Status:"), { target: { value: status } });
  const markers = screen.getAllByTestId("map-marker");
  expect(markers).toHaveLength(2);
  markers.forEach(marker => expect(marker.getAttribute("data-icon")).toContain(`fill="${color}"`));
  expect(summary(label)).toBe(status === "violation" ? "3" : "2");
});
test.each(["All Barangays", "Daungan", "Lual", "Alitap"].flatMap(b => ["all", ...statuses.map(s => s[0])].map(s => [b, s])))("AND matrix: %s + %s", (barangay, status) => {
  mockEstablishments = fixtures(); render(<SanitaryGISMap />);
  fireEvent.change(screen.getByLabelText("Barangay:"), { target: { value: barangay } });
  fireEvent.change(screen.getByLabelText("Status:"), { target: { value: status } });
  const expected = mockEstablishments.filter(i => (barangay === "All Barangays" || i.barangay === barangay) && (status === "all" || i.compliance_status === status));
  const mapped = expected.filter(i => i.latitude !== null);
  expect(screen.queryAllByTestId("map-marker")).toHaveLength(mapped.length);
  expect(summary("Total Establishments")).toBe(String(expected.length));
  expect(summary("Mapped")).toBe(String(mapped.length));
  expect(summary("Missing or unusable coordinates")).toBe(String(expected.length - mapped.length));
  expect(document.querySelectorAll(".gis-list .gis-item")).toHaveLength(expected.length);
  const titles = screen.queryAllByTestId("map-marker").map(el => el.title);
  mapped.forEach(i => expect(titles).toContain(`${i.business_name}: ${statuses.find(s => s[0] === i.compliance_status)[1]}`));
});
test.each([[null, null], [undefined, undefined], ["", ""], [" ", " "], [true, true], [0,0], [14.18, null], ["bad",121.73], [90,180]])("unusable establishment coordinates %s/%s never produce guessed markers", (latitude, longitude) => {
  mockEstablishments = [{...fixtures()[0], latitude, longitude}]; render(<SanitaryGISMap />);
  expect(screen.queryAllByTestId("map-marker")).toHaveLength(0);
  expect(summary("Missing or unusable coordinates")).toBe("1");
  expect(screen.getByText(/Matching records have missing or unusable coordinates/)).toBeInTheDocument();
  expect(screen.queryByText(/No records match the current/)).not.toBeInTheDocument();
});
test("changing filters, clearing them and resetting restores matching markers/counts", () => {
  mockEstablishments = fixtures(); render(<SanitaryGISMap />);
  fireEvent.change(screen.getByLabelText("Status:"), { target: {value: "violation"} });
  fireEvent.change(screen.getByLabelText("Barangay:"), { target: {value: "Lual"} });
  expect(summary("Mapped")).toBe("1");
  fireEvent.change(screen.getByLabelText("Status:"), { target: {value: "good_standing"} });
  expect(screen.getByTestId("map-marker").title).toContain("Lual-good_standing");
  fireEvent.click(screen.getByRole("button", { name: /Reset View/ }));
  expect(summary("Total Establishments")).toBe("13");
  fireEvent.change(screen.getByLabelText("Barangay:"), { target: {value: "Daungan"} });
  expect(summary("Mapped")).toBe("6");
});
test("unknown status remains unknown with a distinct marker", () => {
  mockEstablishments = [{...fixtures()[0], compliance_status: "future_status"}]; render(<SanitaryGISMap />);
  expect(summary("Unknown status")).toBe("1");
  expect(summary("Good Standing")).toBe("0");
  expect(screen.getByTestId("map-marker").getAttribute("data-icon")).toContain('#0f766e');
});
test("loading, failure and successful empty result have distinct states", () => {
  mockLoading = true; const {rerender} = render(<SanitaryGISMap />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  mockLoading = false; mockError = "Synthetic failure"; rerender(<SanitaryGISMap />);
  expect(screen.getByRole("alert")).toHaveTextContent("Synthetic failure");
  expect(screen.queryByText(/No records match the current/)).not.toBeInTheDocument();
  mockError = null; rerender(<SanitaryGISMap />);
  expect(screen.getByRole("status")).toHaveTextContent("No records match");
});

test("barangay tooltip reports exact filtered statuses without classifying uninspected records as good standing", () => {
  mockEstablishments = fixtures(); const {rerender} = render(<SanitaryGISMap />);
  function tooltip() {
    const layer = {bindTooltip: jest.fn(), on: jest.fn()};
    mockGeoJSON.onEachFeature({properties: {NAME_3: "Daungan"}}, layer);
    return layer.bindTooltip.mock.calls[0][0];
  }
  expect(tooltip()).toContain("Not Yet Inspected: 1");
  expect(tooltip()).toContain("Good Standing: 1");
  expect(tooltip()).toContain("Violation: 2");
  fireEvent.change(screen.getByLabelText("Status:"), {target:{value:"violation"}});
  expect(tooltip()).toContain("Total Records: 2");
  expect(tooltip()).toContain("Good Standing: 0");
  mockEstablishments = mockEstablishments.filter(i => i.id !== 99);
  rerender(<SanitaryGISMap />);
  expect(tooltip()).toContain("Total Records: 1");
});
test("marker color changes when an existing record receives a new authoritative status", () => {
  mockEstablishments = [fixtures()[0]]; const {rerender} = render(<SanitaryGISMap />);
  mockEstablishments = [{...mockEstablishments[0], compliance_status: "violation"}];
  rerender(<SanitaryGISMap />);
  expect(screen.getByTestId("map-marker").getAttribute("data-icon")).toContain('#dc2626');
});
