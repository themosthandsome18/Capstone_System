import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SanitaryGISMap from "./SanitaryGISMap";
import { fetchHouseholdRecords } from "../services/sanitationApi";
import HouseholdRecords from "./HouseholdRecords";

const mockMap = { stop: jest.fn(), flyTo: jest.fn(), fitBounds: jest.fn(), setView: jest.fn() };
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
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  GeoJSON: (props) => { mockGeoJSON = props; return null; },
  Popup: ({ children }) => <div>{children}</div>,
  Marker: ({ position, icon, title, children }) => (
    <div data-testid="map-marker" data-position={JSON.stringify(position)} data-icon={icon.options.html} title={title}>{children}</div>
  ),
  useMap: () => mockMap,
}));
jest.mock("../services/sanitationApi", () => ({ fetchHouseholdRecords: jest.fn() }));
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
  fetchHouseholdRecords.mockReset();
  fetchHouseholdRecords.mockImplementation(async () => mockHouseholds);
  Object.values(mockMap).forEach(fn => fn.mockClear());
  mockLoading = false;
  mockError = null;
});

async function renderHouseholdMap() {
  render(<SanitaryGISMap />);
  fireEvent.click(screen.getByRole("button", { name: "Households" }));
  await screen.findByText("Total Households");
}

test.each([
  ["null", null, null], ["missing", undefined, undefined],
  ["invalid text", "invalid", "invalid"], ["zero", 0, 0],
  ["partial", 14.19, null], ["outside geographic range", 91, 181],
])("household with %s coordinates has no fallback marker", async (_label, latitude, longitude) => {
  mockHouseholds = [{ ...mockHousehold, latitude, longitude }];
  await renderHouseholdMap();
  expect(screen.queryAllByTestId("map-marker")).toHaveLength(0);
});

test("valid household marker retains exact stored position alongside unmapped records", async () => {
  mockHouseholds.push({ ...mockHousehold, id: 12, household_code: "HH-VALID",
    household_head: "Mapped household", latitude: 14.192345678, longitude: 121.734567891 });
  await renderHouseholdMap();
  const markers = screen.getAllByTestId("map-marker");
  expect(markers).toHaveLength(1);
  expect(markers[0]).toHaveAttribute("data-position", "[14.192345678,121.734567891]");
});

test("stored nested coordinate representation remains supported", async () => {
  mockHouseholds = [{ ...mockHousehold, coordinates: { lat: 14.19, lng: 121.73 } }];
  await renderHouseholdMap();
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

const householdStatuses = [
  ["good_standing", "Good Standing", "#16a34a"],
  ["for_completion", "For Compliance", "#f59e0b"],
  ["violation", "Needs Assistance", "#dc2626"],
];
function householdFixtures() {
  return ["Daungan", "Lual"].flatMap((barangay, b) => householdStatuses.map(([status], i) => ({
    ...mockHousehold, id: 100 + b * 10 + i, household_code: `HH-${b}-${i}`,
    household_head: `${barangay}-${status}`, barangay, status,
    latitude: 14.18 + i / 1000, longitude: 121.73 + b / 1000,
  }))).concat(
    {...mockHousehold, id:199, household_head:"Unmapped violation", status:"violation"},
    {...mockHousehold, id:200, household_head:"Outside former rectangle", latitude:14.51, longitude:121.73},
  );
}
test.each(["All Barangays", "Daungan", "Lual", "Alitap"].flatMap(b => ["all", ...householdStatuses.map(s => s[0])].map(s => [b, s])))("household AND matrix: %s + %s", async (barangay, status) => {
  mockHouseholds = householdFixtures(); await renderHouseholdMap();
  fireEvent.change(screen.getByLabelText("Barangay:"), {target:{value:barangay}});
  fireEvent.change(screen.getByLabelText("Status:"), {target:{value:status}});
  const expected = mockHouseholds.filter(i => (barangay === "All Barangays" || i.barangay === barangay) && (status === "all" || i.status === status));
  const mapped = expected.filter(i => i.latitude !== null);
  expect(summary("Total Households")).toBe(String(expected.length));
  expect(summary("Mapped")).toBe(String(mapped.length));
  expect(summary("Missing or unusable coordinates")).toBe(String(expected.length - mapped.length));
  expect(document.querySelectorAll(".gis-list .gis-item")).toHaveLength(expected.length);
  const markers = screen.queryAllByTestId("map-marker"); expect(markers).toHaveLength(mapped.length);
  mapped.forEach(i => {
    const marker = markers.find(el => el.title.startsWith(`${i.household_head}:`));
    expect(marker).toHaveAttribute("data-position", JSON.stringify([i.latitude, i.longitude]));
    expect(marker.getAttribute("data-icon")).toContain(householdStatuses.find(s => s[0] === i.status)[2]);
  });
});
test.each([[14.51,121.73], [14.18,122.01], [13.89,121.73], [0.0001,0.0001], [0,121.73]])("household stored coordinates %s/%s survive arbitrary locality bounds", async (latitude, longitude) => {
  mockHouseholds = [{...mockHousehold,latitude,longitude}]; await renderHouseholdMap();
  expect(screen.getByTestId("map-marker")).toHaveAttribute("data-position",JSON.stringify([latitude,longitude]));
});
test.each([
  ["boolean",true,true], ["blank"," "," "], ["infinite",Infinity,121.73],
  ["array",[],121.73], ["out of range",14.18,181],
])("unusable household %s coordinates stay listed and unmapped", async (_label,latitude,longitude) => {
  mockHouseholds = [{...mockHousehold,latitude,longitude}]; await renderHouseholdMap();
  expect(summary("Total Households")).toBe("1"); expect(summary("Mapped")).toBe("0");
  expect(screen.getByText(/Matching records have missing or unusable coordinates/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:/Unmapped household/})).toHaveTextContent("not mapped");
});
test("partial flat household coordinates never combine with nested coordinates", async () => {
  mockHouseholds = [{...mockHousehold, latitude:14.19, longitude:null, coordinates:{lat:14.2,lng:121.8}}];
  await renderHouseholdMap(); expect(summary("Mapped")).toBe("0");
});
test("flat household coordinates take precedence over conflicting nested pair", async () => {
  mockHouseholds = [{...mockHousehold, latitude:"14.192345678", longitude:"121.734567891", coordinates:{lat:14.2,lng:121.8}}];
  await renderHouseholdMap(); expect(screen.getByTestId("map-marker")).toHaveAttribute("data-position","[14.192345678,121.734567891]");
});
test("household filtering fits actual stored positions even outside selected barangay polygon", async () => {
  mockHouseholds=householdFixtures(); await renderHouseholdMap();
  fireEvent.click(screen.getByRole("button",{name:/Outside former rectangle/}));
  fireEvent.change(screen.getByLabelText("Barangay:"),{target:{value:"Daungan"}});
  fireEvent.change(screen.getByLabelText("Status:"),{target:{value:"good_standing"}});
  await waitFor(() => expect(mockMap.fitBounds).toHaveBeenLastCalledWith(expect.arrayContaining([[14.51,121.73],[14.18,121.73]]),{padding:[36,36],maxZoom:16,animate:false}));
  fireEvent.click(screen.getByRole("button",{name:/Reset View/}));
  expect(summary("Total Households")).toBe("8");
  fireEvent.change(screen.getByLabelText("Barangay:"),{target:{value:"Lual"}});
  expect(summary("Mapped")).toBe("3");
});
test("household tooltip counts active filters and all three exact backend statuses", async () => {
  mockHouseholds=householdFixtures(); await renderHouseholdMap();
  const tooltip = () => { const layer={bindTooltip:jest.fn(),on:jest.fn()}; mockGeoJSON.onEachFeature({properties:{NAME_3:"Daungan"}},layer); return layer.bindTooltip.mock.calls[0][0]; };
  expect(tooltip()).toContain("Good Standing: 2"); expect(tooltip()).toContain("Needs Assistance: 2");
  fireEvent.change(screen.getByLabelText("Status:"),{target:{value:"for_completion"}});
  expect(tooltip()).toContain("Total Records: 1"); expect(tooltip()).toContain("For Compliance: 1"); expect(tooltip()).toContain("Good Standing: 0");
});
test("unknown household status is neutral and never called Good Standing", async () => {
  mockHouseholds=[{...mockHousehold,status:"not_yet_inspected",latitude:14.18,longitude:121.73}]; await renderHouseholdMap();
  expect(summary("Unknown status")).toBe("1"); expect(summary("Good Standing")).toBe("0");
  expect(screen.getByTestId("map-marker").getAttribute("data-icon")).toContain("#64748b");
  expect(screen.queryByRole("option",{name:"Not Yet Inspected"})).not.toBeInTheDocument();
});
test("household request loading is distinct from a successful empty response", async () => {
  let resolve; fetchHouseholdRecords.mockReturnValue(new Promise(done => {resolve=done;}));
  render(<SanitaryGISMap/>); fireEvent.click(screen.getByRole("button",{name:"Households"}));
  expect(screen.getByRole("status")).toHaveTextContent("Loading household GIS records");
  expect(screen.queryByText(/No records match the current/)).not.toBeInTheDocument();
  await act(async () => resolve([]));
  expect(screen.getByRole("status")).toHaveTextContent("No records match the current");
});
test("household request failure and retry never show stale or false empty records", async () => {
  fetchHouseholdRecords.mockRejectedValueOnce(new Error("Synthetic household failure"));
  render(<SanitaryGISMap/>); fireEvent.click(screen.getByRole("button",{name:"Households"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic household failure");
  expect(screen.queryByText(/No records match the current/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Retry household GIS"}));
  await screen.findByText("Total Households"); expect(summary("Total Households")).toBe("1");
});
test("malformed household response is an error rather than an empty result", async () => {
  fetchHouseholdRecords.mockResolvedValue({results:[]});
  render(<SanitaryGISMap/>); fireEvent.click(screen.getByRole("button",{name:"Households"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unexpected household records response");
});
test("household marker positions survive map layer toggles and establishment mode remains intact", async () => {
  mockEstablishments=fixtures(); mockHouseholds=householdFixtures(); await renderHouseholdMap();
  const positions=screen.getAllByTestId("map-marker").map(el=>el.getAttribute("data-position"));
  fireEvent.click(screen.getByRole("button",{name:"Satellite",exact:true}));
  expect(screen.getAllByTestId("map-marker").map(el=>el.getAttribute("data-position"))).toEqual(positions);
  fireEvent.click(screen.getByRole("button",{name:"Establishments",exact:true}));
  expect(summary("Total Establishments")).toBe("13"); expect(summary("Mapped")).toBe("12");
});

test("household loading, failure and retry preserve the mounted map", async () => {
  fetchHouseholdRecords.mockRejectedValueOnce(new Error("Synthetic failure"));
  render(<SanitaryGISMap/>);
  const mapElement=screen.getByTestId("map-container");
  fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  expect(screen.getByRole("status")).toHaveTextContent("Loading household GIS records");
  expect(screen.getByTestId("map-container")).toBe(mapElement);
  await screen.findByRole("alert");
  expect(screen.getByTestId("map-container")).toBe(mapElement);
  fireEvent.click(screen.getByRole("button",{name:"Retry household GIS"}));
  await screen.findByText("Total Households");
  expect(screen.getByTestId("map-container")).toBe(mapElement);
});

test("reentering household mode clears previous rows until its new request succeeds", async () => {
  mockHouseholds=householdFixtures(); await renderHouseholdMap();
  expect(summary("Mapped")).toBe("7");
  fireEvent.click(screen.getByRole("button",{name:"Establishments",exact:true}));
  let resolve;
  fetchHouseholdRecords.mockReturnValueOnce(new Promise(done => {resolve=done;}));
  fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  expect(screen.getByRole("status")).toHaveTextContent("Loading household GIS records");
  expect(screen.queryByText("Total Households")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("map-marker")).toHaveLength(0);
  await act(async () => resolve([mockHouseholds.find(row => row.id===199)]));
  expect(summary("Total Households")).toBe("1"); expect(summary("Mapped")).toBe("0");
});

test.each([false, true])("repeated active household tab preserves loaded markers and filters (filtered=%s)", async (filtered) => {
  mockHouseholds=householdFixtures(); await renderHouseholdMap();
  if (filtered) {
    fireEvent.change(screen.getByLabelText("Barangay:"),{target:{value:"Daungan"}});
    fireEvent.change(screen.getByLabelText("Status:"),{target:{value:"good_standing"}});
  }
  const positions=screen.getAllByTestId("map-marker").map(marker=>marker.getAttribute("data-position"));
  for (let click=0;click<3;click++) fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  expect(screen.queryAllByTestId("map-marker").map(marker=>marker.getAttribute("data-position"))).toEqual(positions);
  expect(summary("Mapped")).toBe(filtered ? "2" : "7");
  expect(screen.getByLabelText("Barangay:")).toHaveValue(filtered ? "Daungan" : "All Barangays");
  expect(screen.getByLabelText("Status:")).toHaveValue(filtered ? "good_standing" : "all");
  expect(screen.queryByText("Loading household GIS records...")).not.toBeInTheDocument();
  expect(fetchHouseholdRecords).toHaveBeenCalledTimes(1);
});
test("repeated active household tab preserves a pending request without duplicating it", async () => {
  let resolve;
  fetchHouseholdRecords.mockReturnValue(new Promise(done=>{resolve=done;}));
  render(<SanitaryGISMap/>); fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  for (let click=0;click<3;click++) fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  expect(screen.getByRole("status")).toHaveTextContent("Loading household GIS records");
  expect(fetchHouseholdRecords).toHaveBeenCalledTimes(1);
  await act(async()=>resolve(householdFixtures()));
  expect(summary("Mapped")).toBe("7");
});
test("repeated active household tab preserves request failure and explicit retry", async () => {
  fetchHouseholdRecords.mockRejectedValueOnce(new Error("Synthetic retry failure"));
  render(<SanitaryGISMap/>); fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button",{name:"Households",exact:true}));
  expect(screen.getByRole("alert")).toHaveTextContent("Synthetic retry failure");
  expect(fetchHouseholdRecords).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button",{name:"Retry household GIS",exact:true}));
  await screen.findByText("Total Households");
  expect(fetchHouseholdRecords).toHaveBeenCalledTimes(2);
});
