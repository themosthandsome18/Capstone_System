import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { SanitationDataProvider, useSanitationData } from "./SanitationDataContext";
import * as api from "../services/sanitationApi";
jest.mock("../services/sanitationApi");
const EMPTY = { barangays: [], householdRecords: [], householdDashboardData: { summary: { total_households: 0 } } };
const DATA = { barangays: [{ name: "Daungan" }], householdRecords: [{ id: 4, household_head: "Synthetic" }], householdDashboardData: { summary: { total_households: 1 } } };
let context, renders;
function Probe() {
  context = useSanitationData();
  renders.push({ status: context.householdStatus, ready: context.householdReady });
  return null;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.resetAllMocks(); renders = [];
  api.fetchSanitationBootstrap.mockResolvedValue({ establishments: [{ id: 1 }] });
  api.fetchHouseholdBootstrap.mockResolvedValue(EMPTY);
  api.fetchSanitationReports.mockResolvedValue({ marker: "reports" });
});
function mount() { return render(<SanitationDataProvider><Probe /></SanitationDataProvider>); }

test("initializing and pending households are distinguishable from successful empty after core is ready", async () => {
  const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
  mount();
  expect(renders[0]).toEqual({ status: "idle", ready: false });
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.error).toBe(""); expect(context.householdRecords).toEqual([]);
  expect(context.householdStatus).toBe("loading"); expect(context.householdReady).toBe(false);
  expect(context.householdHasData).toBe(false);
  await act(async () => { pending.resolve(EMPTY); });
  expect(context.householdStatus).toBe("success"); expect(context.householdReady).toBe(true);
  expect(context.householdHasData).toBe(true); expect(context.householdRecords).toEqual([]);
});

test("failed first load is unavailable, with an error rather than successful empty, and retry succeeds", async () => {
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Households offline"));
  mount();
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.householdStatus).toBe("error"); expect(context.householdReady).toBe(false);
  expect(context.householdError).toMatch(/Households offline/); expect(context.householdHasData).toBe(false);
  expect(context.error).toBe("");
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA);
  await act(async () => { await context.reloadHouseholds(); });
  expect(context.householdStatus).toBe("success"); expect(context.householdReady).toBe(true);
  expect(context.householdError).toBe(""); expect(context.householdRecords).toEqual(DATA.householdRecords);
  expect(context.barangays).toEqual(DATA.barangays); expect(context.householdDashboardData).toEqual(DATA.householdDashboardData);
});

test("refresh blocks readiness and retains the last complete snapshot on failure", async () => {
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA); mount();
  await waitFor(() => expect(context.householdReady).toBe(true));
  const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
  let request;
  act(() => { request = context.reloadHouseholds(); });
  expect(context.householdStatus).toBe("loading"); expect(context.householdReady).toBe(false);
  expect(context.householdHasData).toBe(true); expect(context.householdRecords).toEqual(DATA.householdRecords);
  await act(async () => { pending.reject(new Error("Refresh offline")); await request; });
  expect(context.householdStatus).toBe("error"); expect(context.householdReady).toBe(false);
  expect(context.householdHasData).toBe(true); expect(context.householdRecords).toEqual(DATA.householdRecords);
  expect(context.barangays).toEqual(DATA.barangays); expect(context.householdDashboardData).toEqual(DATA.householdDashboardData);
});

test.each(["resolve", "reject"])("older %s cannot overwrite a newer successful retry", async completion => {
  const old = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(old.promise); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA);
  await act(async () => { await context.reloadHouseholds(); });
  await act(async () => { completion === "resolve" ? old.resolve(EMPTY) : old.reject(new Error("Old failure")); });
  expect(context.householdStatus).toBe("success"); expect(context.householdReady).toBe(true);
  expect(context.householdError).toBe(""); expect(context.householdRecords).toEqual(DATA.householdRecords);
});

test("older success cannot erase a newer failure or release readiness", async () => {
  const old = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(old.promise); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Newest failed"));
  await act(async () => { await context.reloadHouseholds(); });
  await act(async () => { old.resolve(DATA); });
  expect(context.householdStatus).toBe("error"); expect(context.householdReady).toBe(false);
  expect(context.householdError).toMatch(/Newest failed/); expect(context.householdHasData).toBe(false);
  expect(context.householdRecords).toEqual([]);
});

test.each([null, {}, { ...EMPTY, householdRecords: null }, { ...EMPTY, householdDashboardData: null }])("malformed response %p never becomes successful empty", async payload => {
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(payload); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.householdStatus).toBe("error"); expect(context.householdReady).toBe(false);
  expect(context.householdError).toMatch(/Incomplete household/); expect(context.householdHasData).toBe(false);
});

test("core failure does not discard independently completed household data", async () => {
  api.fetchSanitationBootstrap.mockRejectedValueOnce(new Error("Core offline"));
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.error).toBe("Core offline"); expect(context.householdReady).toBe(true);
  expect(context.householdRecords).toEqual(DATA.householdRecords);
});

test("an older completion cannot release readiness while the newest request is pending", async () => {
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA); mount();
  await waitFor(() => expect(context.householdReady).toBe(true));
  const old = deferred(), latest = deferred();
  api.fetchHouseholdBootstrap.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  let first, second;
  act(() => { first = context.reloadHouseholds(); second = context.reloadHouseholds(); });
  await act(async () => { old.resolve(EMPTY); await first; });
  expect(context.householdStatus).toBe("loading"); expect(context.householdReady).toBe(false);
  expect(context.householdRecords).toEqual(DATA.householdRecords);
  await act(async () => { latest.resolve(EMPTY); await second; });
  expect(context.householdReady).toBe(true); expect(context.householdRecords).toEqual([]);
  expect(context.householdHasData).toBe(true);
});

test.each(["refreshHouseholdDashboardData", "refreshHouseholdBarangays", "refreshHouseholdRecords"])("%s uses the full snapshot coordinator, superseding initial bootstrap", async helper => {
  const old = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(old.promise); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA);
  let result;
  await act(async () => { result = await context[helper](); });
  expect(result).toEqual(helper === "refreshHouseholdDashboardData" ? DATA.householdDashboardData : helper === "refreshHouseholdBarangays" ? DATA.barangays : DATA.householdRecords);
  await act(async () => { old.resolve(EMPTY); });
  expect(context.householdReady).toBe(true); expect(context.householdRecords).toEqual(DATA.householdRecords);
});

test("a filtered records query cannot replace the complete shared report dataset", async () => {
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA); mount();
  await waitFor(() => expect(context.householdReady).toBe(true));
  const filtered = deferred(); api.fetchHouseholdRecords.mockReturnValueOnce(filtered.promise);
  const pending = context.refreshHouseholdRecords({ barangay: "Alitap" });
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(EMPTY);
  await act(async () => { await context.reloadHouseholds(); });
  let rows;
  await act(async () => { filtered.resolve(DATA.householdRecords); rows = await pending; });
  expect(rows).toEqual(DATA.householdRecords);
  expect(api.fetchHouseholdRecords).toHaveBeenCalledWith({ barangay: "Alitap" });
  expect(context.householdReady).toBe(true); expect(context.householdRecords).toEqual([]);
});

test.each(["createHousehold", "updateHousehold", "deleteHousehold"])("%s post-write refresh supersedes pending bootstrap", async mutation => {
  const old = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(old.promise); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  api.createHouseholdRecord.mockResolvedValue({ id: 4 });
  api.updateHouseholdRecord.mockResolvedValue({ id: 4 });
  api.deleteHouseholdRecord.mockResolvedValue(null);
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA);
  await act(async () => { await (mutation === "createHousehold" ? context[mutation]({}) : context[mutation](4, {})); });
  await act(async () => { old.resolve(EMPTY); });
  expect(context.householdReady).toBe(true); expect(context.householdRecords).toEqual(DATA.householdRecords);
  expect(context.actionLoading).toBe(false); expect(context.loading).toBe(false);
});

test("retry function remains stable and a failed refresh can recover to genuinely empty", async () => {
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(DATA); mount();
  await waitFor(() => expect(context.householdReady).toBe(true));
  const retry = context.reloadHouseholds;
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Unavailable"));
  await act(async () => { await retry(); });
  expect(context.householdReady).toBe(false); expect(context.householdHasData).toBe(true);
  expect(context.reloadHouseholds).toBe(retry);
  api.fetchHouseholdBootstrap.mockResolvedValueOnce(EMPTY);
  await act(async () => { await retry(); });
  expect(context.householdReady).toBe(true); expect(context.householdError).toBe("");
  expect(context.householdRecords).toEqual([]); expect(context.reloadHouseholds).toBe(retry);
});

test("StrictMode's discarded request cannot overwrite the remounted provider", async () => {
  const discarded = deferred();
  api.fetchHouseholdBootstrap.mockReturnValueOnce(discarded.promise).mockResolvedValueOnce(DATA);
  render(<React.StrictMode><SanitationDataProvider><Probe /></SanitationDataProvider></React.StrictMode>);
  await waitFor(() => expect(context.householdReady).toBe(true));
  await act(async () => { discarded.resolve(EMPTY); });
  expect(context.householdRecords).toEqual(DATA.householdRecords); expect(context.householdReady).toBe(true);
});

test("household failure remains explicit even when core failed first", async () => {
  const pending = deferred(); api.fetchHouseholdBootstrap.mockReturnValueOnce(pending.promise);
  api.fetchSanitationBootstrap.mockRejectedValueOnce(new Error("Core offline")); mount();
  await waitFor(() => expect(context.loading).toBe(false));
  await act(async () => { pending.reject(new Error("Households offline")); });
  expect(context.error).toBe("Core offline"); expect(context.householdStatus).toBe("error");
  expect(context.householdError).toBe("Households offline"); expect(context.householdReady).toBe(false);
});

test("household error is always displayable text even with structured response details", async () => {
  const error = new Error("Request unavailable"); error.details = { detail: { reason: "upstream" } };
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(error); mount();
  await waitFor(() => expect(context.householdStatus).toBe("error"));
  expect(context.householdError).toBe("Request unavailable");
});
