import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import HouseholdRecords from "./HouseholdRecords";
import { SanitationDataProvider, useSanitationData } from "../context/SanitationDataContext";
import * as api from "../services/sanitationApi";

// Exercise the real page and provider. Only API timing/data and unused routing are controlled.
jest.mock("../services/sanitationApi");
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });

const STORED = {
  id: 11, household_code: "SYN-READINESS", household_head: "Santos, Ana", barangay: "Abo-abo",
  address: "001", house_number: "01", sitio: "Legacy sitio", male_count: 4, female_count: 6,
  total_members: 10, toilet_type: "pour_flush", septic_tank_type: "vault_sealed",
  water_source: "  Deep Well, Private pump  ", water_level: "level_2", waste_disposal: "composted",
  status: "good_standing", remarks: "001", latitude: null, longitude: null, last_survey_date: "2025-07-04",
};
function snapshot(records) {
  return { barangays: [{ name: "Abo-abo" }, { name: "Alitap" }], householdRecords: records,
    householdDashboardData: { summary: { totalHouseholds: records.length }, riskByBarangay: [] } };
}
const DATA = snapshot([STORED]);
const EMPTY = snapshot([]);
const FRESH = snapshot([{ ...STORED, id: 22, household_code: "SYN-FRESH", household_head: "Fresh, Bea" }]);
let context, mounted;
function Probe() { context = useSanitationData(); return null; }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.resetAllMocks();
  api.fetchSanitationBootstrap.mockResolvedValue({});
  api.fetchSanitationReports.mockResolvedValue({});
  api.fetchHouseholdBootstrap.mockResolvedValue(DATA);
  api.createHouseholdRecord.mockResolvedValue({ ...STORED, id: 33 });
  api.updateHouseholdRecord.mockResolvedValue(STORED);
});
function mount() {
  mounted = render(<SanitationDataProvider><Probe /><HouseholdRecords /></SanitationDataProvider>);
}
const page = () => mounted.container.querySelector(".household-page");
function observe(label) {
  console.info("HOUSEHOLD_READINESS_OBSERVATION", JSON.stringify({
    test: expect.getState().currentTestName, label,
    provider: { status: context.householdStatus, ready: context.householdReady,
      hasData: context.householdHasData, error: context.householdError,
      coreLoading: context.loading, coreError: context.error, recordIds: context.householdRecords.map(r => r.id) },
    visibleEmpty: !!within(page()).queryByText("No household records found."),
    visibleAlerts: [...page().querySelectorAll('[role="alert"]')].map(el => el.textContent),
    visibleRows: [...page().querySelectorAll("tbody tr")].map(el => el.textContent),
    addDisabled: within(page()).queryByRole("button", { name: "Add Household", exact: true })?.disabled,
    writes: { create: api.createHouseholdRecord.mock.calls.length, update: api.updateHouseholdRecord.mock.calls.length },
  }));
}
async function ready() {
  mount(); await waitFor(() => expect(context.householdReady).toBe(true));
  await waitFor(() => expect(context.loading).toBe(false));
}
async function failRefresh() {
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Synthetic refresh offline"));
  await act(async () => { await context.reloadHouseholds(); });
  expect(context.householdStatus).toBe("error");
  expect(context.householdReady).toBe(false);
  expect(context.householdHasData).toBe(true);
}
function alerts() { return within(page()).getAllByRole("alert").map(el => el.textContent).join(" "); }

describe("Household Records readiness with the real provider", () => {
  test("delayed households remain loading after core completes, never successful empty", async () => {
    const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
    mount(); await waitFor(() => expect(context.loading).toBe(false));
    expect(context.householdStatus).toBe("loading"); expect(context.householdReady).toBe(false);
    observe("core ready, household request pending");
    expect(within(page()).queryByText("No household records found.")).toBeNull();
    expect(within(page()).getByText(/loading household records/i)).toBeVisible();
  });

  test("a successful zero-household snapshot is a genuine empty result", async () => {
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(EMPTY); await ready();
    expect(context.householdHasData).toBe(true); expect(context.householdStatus).toBe("success");
    observe("verified empty");
    expect(within(page()).getByText("No household records found.")).toBeVisible();
    expect(within(page()).queryByRole("alert")).toBeNull();
    expect(within(page()).getByRole("button", { name: "Add Household", exact: true })).toBeEnabled();
  });

  test("initial household failure exposes its own error rather than a false empty result", async () => {
    api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Synthetic households offline"));
    mount(); await waitFor(() => expect(context.householdStatus).toBe("error"));
    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.error).toBe(""); expect(context.householdHasData).toBe(false);
    observe("initial household failure, no core error");
    expect(alerts()).toMatch(/Synthetic households offline/);
    expect(within(page()).queryByText("No household records found.")).toBeNull();
  });

  test("page retry reloads only household data and recovers to verified records", async () => {
    api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Synthetic households offline"));
    mount(); await waitFor(() => expect(context.householdStatus).toBe("error"));
    await waitFor(() => expect(context.loading).toBe(false));
    observe("retry needed");
    fireEvent.click(within(page()).getByRole("button", { name: /retry.*household|retry/i }));
    await waitFor(() => expect(within(page()).getByText("Santos, Ana")).toBeVisible());
    expect(context.householdReady).toBe(true); expect(context.householdError).toBe("");
    expect(api.fetchHouseholdBootstrap).toHaveBeenCalledTimes(2);
    expect(api.fetchSanitationBootstrap).toHaveBeenCalledTimes(1);
    expect(api.fetchSanitationReports).toHaveBeenCalledTimes(1);
    expect(within(page()).queryByRole("alert")).toBeNull();
  });

  test("failed refresh retains source rows with an explicit stale-data warning", async () => {
    await ready(); await failRefresh();
    expect(context.householdRecords).toEqual(DATA.householdRecords);
    observe("retained source rows after failed refresh");
    expect(within(page()).getByText("Santos, Ana")).toBeVisible();
    expect(alerts()).toMatch(/Synthetic refresh offline/);
    expect(alerts()).toMatch(/stale|last (?:loaded|successful)|not current|out.of.date/i);
  });

  test("a failed refresh of a previously empty snapshot is not verified current emptiness", async () => {
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(EMPTY); await ready(); await failRefresh();
    expect(context.householdRecords).toEqual([]); expect(context.householdHasData).toBe(true);
    observe("last successful snapshot was empty, newest request failed");
    expect(within(page()).queryByText("No household records found.")).toBeNull();
    expect(alerts()).toMatch(/stale|last (?:loaded|successful)|not current|out.of.date/i);
  });

  test("refreshing a retained snapshot is explicitly unverified rather than silently current", async () => {
    await ready(); const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
    act(() => { context.reloadHouseholds(); });
    expect(context.householdStatus).toBe("loading"); expect(context.householdReady).toBe(false);
    expect(context.householdRecords).toEqual(DATA.householdRecords);
    observe("retained snapshot while newest request is pending");
    expect(within(page()).getByText(/refreshing household|loading household/i)).toBeVisible();
    const add = within(page()).queryByRole("button", { name: "Add Household", exact: true });
    if (add) expect(add).toBeDisabled();
  });

  test("successful refresh replaces the displayed snapshot and releases readiness", async () => {
    await ready(); api.fetchHouseholdBootstrap.mockResolvedValueOnce(FRESH);
    await act(async () => { await context.reloadHouseholds(); }); observe("new authoritative snapshot");
    expect(context.householdReady).toBe(true);
    expect(within(page()).queryByText("Santos, Ana")).toBeNull();
    expect(within(page()).getByText("Fresh, Bea")).toBeVisible();
    expect(within(page()).getByRole("button", { name: "Add Household", exact: true })).toBeEnabled();
  });

  test("Add cannot open against a never-verified household dataset", async () => {
    const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
    mount(); await waitFor(() => expect(context.loading).toBe(false));
    const add = within(page()).queryByRole("button", { name: "Add Household", exact: true });
    if (add) fireEvent.click(add);
    observe("attempt Add before household verification");
    expect(within(page()).queryByRole("heading", { name: "Add Household Record" })).toBeNull();
    expect(api.createHouseholdRecord).not.toHaveBeenCalled();
  });

  test("failed-refresh records cannot start an Edit from an unverified snapshot", async () => {
    await ready(); await failRefresh(); observe("stale edit control");
    const edit = within(page()).queryByTitle("Edit Household Record");
    if (edit) expect(edit).toBeDisabled();
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
  });

  test("an existing edit keeps its exact draft but cannot PATCH while readiness is lost", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    await failRefresh();
    expect(screen.getByPlaceholderText("Additional notes...")).toHaveValue(" 1 ");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
    observe("attempt save existing draft during failed refresh");
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Additional notes...")).toHaveValue(" 1 ");
  });

  test("an open Add draft survives failure but cannot POST before household data is verified again", async () => {
    await ready(); fireEvent.click(within(page()).getByRole("button", { name: "Add Household", exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Synthetic Draft" } });
    fireEvent.change(screen.getByLabelText("Barangay *"), { target: { value: "Abo-abo" } });
    fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
    fireEvent.click(screen.getByRole("radio", { name: "Level 2", exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    await failRefresh();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Household" })); });
    observe("attempt save open Add draft after household refresh failure");
    expect(api.createHouseholdRecord).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Last name")).toHaveValue("Synthetic Draft");
    expect(screen.getByPlaceholderText("Additional notes...")).toHaveValue(" 1 ");
  });

  test("a refreshed conflicting original cannot be silently overwritten by an older edit draft", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(snapshot([{ ...STORED, remarks: "New authoritative note" }]));
    await act(async () => { await context.reloadHouseholds(); });
    expect(context.householdReady).toBe(true);
    expect(context.householdRecords[0].remarks).toBe("New authoritative note");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
    observe("attempt save after refreshed original conflicts with draft");
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Additional notes...")).toHaveValue(" 1 ");
  });

  test("search and source rows survive failure and a later successful refresh", async () => {
    await ready(); fireEvent.change(screen.getByPlaceholderText("Search households..."), { target: { value: "Santos" } });
    await failRefresh(); expect(screen.getByPlaceholderText("Search households...")).toHaveValue("Santos");
    expect(context.householdRecords).toEqual(DATA.householdRecords);
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(snapshot([{ ...STORED, address: "Updated address" }]));
    await act(async () => { await context.reloadHouseholds(); });
    expect(context.householdReady).toBe(true);
    expect(screen.getByPlaceholderText("Search households...")).toHaveValue("Santos");
    expect(within(page()).getByText("Santos, Ana")).toBeVisible();
  });

  test("a verified edit preserves numeric-looking text exactly and PATCHes only its changed field", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api.updateHouseholdRecord).toHaveBeenCalledWith(11, { remarks: " 1 " }));
    expect(STORED.address).toBe("001"); expect(STORED.water_source).toBe("  Deep Well, Private pump  ");
    expect(api.createHouseholdRecord).not.toHaveBeenCalled();
  });

  test("verified data still rejects invalid member counts without coercion or a write", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByLabelText("Male"), { target: { value: "1e2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Male")).toHaveValue("1e2");
    expect(screen.getByLabelText("Male")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Enter a whole number from 0 to 2147483647/)).toBeVisible();
  });

  test("a refreshed unrelated field does not block a safe differential edit", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(snapshot([{ ...STORED, address: "New authoritative address" }]));
    await act(async () => { await context.reloadHouseholds(); });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api.updateHouseholdRecord).toHaveBeenCalledWith(11, { remarks: " 1 " }));
    expect(api.updateHouseholdRecord.mock.calls[0][1]).not.toHaveProperty("address");
  });

  test("a refreshed value already matching the draft is a no-op, not a conflict or overwrite", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(snapshot([{ ...STORED, remarks: " 1 " }]));
    await act(async () => { await context.reloadHouseholds(); });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    expect(context.householdRecords[0].remarks).toBe(" 1 ");
  });

  test("an untouched draft cannot revert a newly refreshed original value", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(snapshot([{ ...STORED, remarks: "New authoritative note" }]));
    await act(async () => { await context.reloadHouseholds(); });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    expect(context.householdRecords[0].remarks).toBe("New authoritative note");
  });

  test("a removed current record blocks save without discarding the draft", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    api.fetchHouseholdBootstrap.mockResolvedValueOnce(EMPTY);
    await act(async () => { await context.reloadHouseholds(); });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    expect(screen.getByText(/no longer in the current data.*Review/i)).toBeVisible();
    expect(screen.getByPlaceholderText("Additional notes...")).toHaveValue(" 1 ");
  });

  test("retry within an open draft restores readiness without resetting its exact fields", async () => {
    await ready(); fireEvent.click(within(page()).getByTitle("Edit Household Record"));
    fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: " 1 " } });
    await failRefresh();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(api.updateHouseholdRecord).not.toHaveBeenCalled();
    fireEvent.click(within(document.querySelector(".hh-modal-form")).getByRole("button", { name: "Retry household data" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled());
    expect(screen.getByPlaceholderText("Additional notes...")).toHaveValue(" 1 ");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api.updateHouseholdRecord).toHaveBeenCalledWith(11, { remarks: " 1 " }));
  });
});
