import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdReportAnalytics from "./HouseholdReportAnalytics";
import { SanitationDataProvider, useSanitationData } from "../context/SanitationDataContext";
import * as api from "../services/sanitationApi";
import records from "./householdReport.fixture.json";

jest.mock("../services/sanitationApi");
jest.mock("react-chartjs-2", () => ({
  Bar: ({ data }) => <pre data-testid="chart">{JSON.stringify(data)}</pre>,
  Doughnut: ({ data }) => <pre data-testid="chart">{JSON.stringify(data)}</pre>,
}));
const municipal = { questionAnswers: [
  { id: "household_compliance_rate", answer: "Good Standing: 1, Total: 4, Rate: 25" },
  { id: "barangay_risk", answer: "OUTSIDE MUNICIPAL ESTABLISHMENT", chart_data: [{ name: "Abo-abo", total: 999 }] },
] };
const snapshot = (rows) => ({
  barangays: ["Bagong Bayan", "Abo-abo", "Empty Barangay"].map((name) => ({ name })),
  householdRecords: rows,
  householdDashboardData: { summary: { total_households: rows.length } },
});
let context;
let exportedBlob;
function Probe() { context = useSanitationData(); return null; }
function mount() {
  render(<SanitationDataProvider><Probe /><HouseholdReportAnalytics /></SanitationDataProvider>);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const kpis = () => [...document.querySelectorAll(".household-report-stat-card h2")].map((e) => e.textContent);
const choose = (value) => fireEvent.change(screen.getByLabelText(/Filter by Barangay/), { target: { value } });
function unavailable() {
  expect(kpis()).toEqual([]);
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(screen.queryByText(/No household records available/)).toBeNull();
  expect(screen.getByRole("button", { name: "Print Report" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
}
const csvText = () => new Promise((resolve) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(exportedBlob);
});
beforeEach(() => {
  jest.resetAllMocks();
  api.fetchSanitationBootstrap.mockResolvedValue({ reportData: municipal });
  api.fetchSanitationReports.mockResolvedValue(municipal);
  api.fetchHouseholdBootstrap.mockResolvedValue(snapshot(records));
  window.print = jest.fn();
  URL.createObjectURL = jest.fn((blob) => { exportedBlob = blob; return "blob:synthetic"; });
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("core success cannot release a pending household report or its exports", async () => {
  const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
  mount();
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.householdStatus).toBe("loading");
  unavailable();
  expect(screen.getByText("Loading household data...")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Print Report" }));
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(window.print).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => { pending.resolve(snapshot(records)); });
  expect(kpis()).toEqual(["4", "1", "1", "2"]);
});

test("first-load failure shows householdError and retry releases only a successful snapshot", async () => {
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Synthetic household connection failure"));
  mount();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Synthetic household connection failure"));
  unavailable();
  const retry = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(retry.promise);
  fireEvent.click(screen.getByRole("button", { name: "Retry household data" }));
  unavailable(); expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { retry.resolve(snapshot(records)); });
  expect(kpis()).toEqual(["4", "1", "1", "2"]);
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  expect(api.fetchHouseholdBootstrap).toHaveBeenCalledTimes(2);
});

test("successful empty is a genuine exportable empty report without fabricated percentages", async () => {
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(snapshot([])); mount();
  await waitFor(() => expect(context.householdReady).toBe(true));
  expect(kpis()).toEqual(["0", "0", "0", "0"]);
  expect(screen.getByRole("status")).toHaveTextContent("No household records available");
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(document.querySelector(".household-insights-grid").textContent).not.toMatch(/%|999/);
  expect(screen.getByRole("button", { name: "Print Report" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect((await csvText()).split("\n")).toHaveLength(1);
});

test("retained data is hidden on failed refresh; retry preserves selected barangay and updates print/CSV", async () => {
  mount(); await waitFor(() => expect(context.householdReady).toBe(true)); choose("Bagong Bayan");
  expect(kpis()).toEqual(["3", "1", "1", "1"]);
  const refresh = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(refresh.promise);
  let request; act(() => { request = context.reloadHouseholds(); });
  expect(context.householdRecords).toHaveLength(4); unavailable();
  expect(screen.getByText("Coverage: Barangay Bagong Bayan")).toBeInTheDocument();
  await act(async () => { refresh.reject(new Error("Synthetic refresh failure")); await request; });
  expect(screen.getByRole("alert")).toHaveTextContent("Synthetic refresh failure"); unavailable();
  const retry = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(retry.promise);
  fireEvent.click(screen.getByRole("button", { name: "Retry household data" })); unavailable();
  await act(async () => { retry.resolve(snapshot(records.filter((r) => r.id !== 3))); });
  expect(screen.getByLabelText(/Filter by Barangay/)).toHaveValue("Bagong Bayan");
  expect(kpis()).toEqual(["2", "1", "0", "1"]);
  const charts = screen.getAllByTestId("chart").map((e) => JSON.parse(e.textContent));
  expect(charts[0].datasets[0].data).toEqual([1, 0, 1]);
  expect(charts[1].datasets[0].data).toEqual([1, 0, 1, 0]);
  expect(document.querySelector(".specific-roster").textContent).not.toMatch(/AB-1|BB-3/);
  expect(document.querySelector(".household-insights-grid").textContent).not.toMatch(/Other Barangay|OUTSIDE MUNICIPAL/);
  fireEvent.click(screen.getByRole("button", { name: /Print Brgy/ })); expect(window.print).toHaveBeenCalledTimes(1);
  expect(document.querySelector(".print-header-meta")).toHaveTextContent("Barangay Bagong Bayan");
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  const csv = await csvText(); expect(csv.split("\n")).toHaveLength(3); expect(csv).not.toMatch(/AB-1|BB-3|Abo-abo/);
  choose("all"); expect(kpis()).toEqual(["3", "1", "0", "2"]);
  // The independently cached server answer is still 1/4 (25%); the ready snapshot is now 1/3.
  expect(screen.getByText("33.3%")).toBeInTheDocument();
  expect(screen.queryByText("25%")).toBeNull();
});

test("municipal CSV aggregates all loaded barangays exactly once", async () => {
  mount(); await waitFor(() => expect(context.householdReady).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  const csv = await csvText();
  expect(csv.split("\n")).toHaveLength(3);
  expect(csv).toContain('"Abo-abo","1","0","0","0","1","0","0"');
  expect(csv).toContain('"Bagong Bayan","3","2","2","2","1","1","1"');
});
