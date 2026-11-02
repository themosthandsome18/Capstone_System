import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { SanitationDataProvider, useSanitationData } from "./SanitationDataContext";
import * as api from "../services/sanitationApi";
jest.mock("../services/sanitationApi");
let context;
function Probe() {
  context = useSanitationData();
  return <div>{context.loading ? "loading" : "ready"}:{context.actionLoading ? "overlay" : "local"}:{context.error}</div>;
}
beforeEach(() => {
  jest.resetAllMocks();
  api.fetchSanitationBootstrap.mockResolvedValue({ establishments: [{ id: 1, business_name: "Synthetic" }] });
  api.fetchHouseholdBootstrap.mockResolvedValue({ barangays: [], householdRecords: [], householdDashboardData: {} });
  api.fetchSanitationReports.mockResolvedValue({});
});
test.each(["create", "update"])("%s stays local throughout mutation and bootstrap refresh", async (operation) => {
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(screen.getByText("ready:local:")).toBeTruthy());
  let finishMutation, finishRefresh;
  const mutation = operation === "create" ? api.createSanitationEstablishment : api.updateSanitationEstablishment;
  mutation.mockImplementationOnce(() => new Promise((resolve) => { finishMutation = resolve; }));
  api.fetchSanitationBootstrap.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
  let pending;
  act(() => { pending = operation === "create" ? context.createEstablishment({}) : context.updateEstablishment(1, {}); });
  expect(context.loading).toBe(false);
  expect(context.actionLoading).toBe(false);
  await act(async () => { finishMutation({ id: operation === "create" ? 2 : 1, business_name: "Saved" }); });
  expect(screen.getByText("ready:local:")).toBeTruthy();
  expect(context.establishments.find((item) => item.business_name === "Saved")).toBeTruthy();
  await act(async () => { finishRefresh({ establishments: context.establishments }); await pending; });
  expect(screen.getByText("ready:local:")).toBeTruthy();
});
test("a genuine mutation error is returned to the form without clearing loaded records", async () => {
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(screen.getByText("ready:local:")).toBeTruthy());
  api.createSanitationEstablishment.mockRejectedValue(new Error("Offline"));
  await expect(context.createEstablishment({})).rejects.toThrow("Offline");
  expect(context.establishments).toHaveLength(1);
  expect(screen.getByText("ready:local:")).toBeTruthy();
});
test("a failed post-save refresh preserves the saved record and reports the connection error", async () => {
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(screen.getByText("ready:local:")).toBeTruthy());
  api.createSanitationEstablishment.mockResolvedValue({ id: 2, business_name: "Saved" });
  api.fetchSanitationBootstrap.mockRejectedValue(new Error("Refresh offline"));
  await act(async () => { await context.createEstablishment({}); });
  expect(context.establishments).toHaveLength(2);
  expect(context.error).toBe("Establishment saved, but related data could not be refreshed. Refresh offline");
  expect(context.loading).toBe(false);
});

test("core bootstrap releases independently, then deferred household data and analytics merge intact", async () => {
  let finishCore, finishHouseholds;
  api.fetchSanitationBootstrap.mockImplementationOnce(() => new Promise(resolve => { finishCore = resolve; }));
  api.fetchHouseholdBootstrap.mockImplementationOnce(() => new Promise(resolve => { finishHouseholds = resolve; }));
  api.fetchSanitationReports.mockResolvedValue({ marker: "analytics" });
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  expect(context.loading).toBe(true);
  await act(async () => { finishCore({
    establishments: [{ id: 1 }], businessTypes: [{ id: 11 }], inspections: [{ id: 7 }],
    dashboardData: { marker: "dashboard" }, permitData: { marker: "permits" },
    renewalData: { marker: "renewals" }, complaintData: { marker: "complaints" },
    submissionData: { marker: "submissions" }, reportData: { marker: "bootstrap reports" },
  }); });
  expect(context.loading).toBe(false);
  expect(context.householdRecords).toEqual([]);
  expect(context.dashboardData).toEqual({ marker: "dashboard" });
  expect(context.permitData).toEqual({ marker: "permits" });
  expect(context.renewalData).toEqual({ marker: "renewals" });
  expect(context.complaintData).toEqual({ marker: "complaints" });
  expect(context.submissionData).toEqual({ marker: "submissions" });
  expect(context.inspections).toEqual([{ id: 7 }]);
  expect(context.businessTypes).toEqual([{ id: 11 }]);
  expect(context.reportData).toEqual({ marker: "analytics" });
  await act(async () => { finishHouseholds({ barangays: ["Daungan"], householdRecords: [{ id: 4 }], householdDashboardData: { total: 1 } }); });
  expect(context.householdRecords).toEqual([{ id: 4 }]);
  expect(context.barangays).toEqual(["Daungan"]);
  expect(context.householdDashboardData).toEqual({ total: 1 });
  expect(context.establishments).toEqual([{ id: 1 }]);
});

test("foreground reload still owns loading and reports core failures", async () => {
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(context.loading).toBe(false));
  let failCore;
  api.fetchSanitationBootstrap.mockImplementationOnce(() => new Promise((resolve, reject) => { failCore = reject; }));
  let pending;
  act(() => { pending = context.reload({ includeHouseholds: false }); });
  expect(context.loading).toBe(true);
  await act(async () => { failCore(new Error("Core unavailable")); await pending; });
  expect(context.loading).toBe(false);
  expect(context.error).toBe("Core unavailable");
  expect(context.establishments).toHaveLength(1);
});

test.each(["create", "update"])("%s returns saved data despite refresh failure and keeps household state", async operation => {
  api.fetchHouseholdBootstrap.mockResolvedValue({ barangays: ["Daungan"], householdRecords: [{ id: 4 }], householdDashboardData: { total: 1 } });
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(context.householdRecords).toHaveLength(1));
  const saved = { id: operation === "create" ? 2 : 1, business_name: "Saved", address: "Stored address" };
  const mutation = operation === "create" ? api.createSanitationEstablishment : api.updateSanitationEstablishment;
  mutation.mockResolvedValue(saved);
  api.fetchSanitationBootstrap.mockRejectedValueOnce(new Error("Refresh unavailable"));
  let result;
  await act(async () => { result = await (operation === "create" ? context.createEstablishment({}) : context.updateEstablishment(1, {})); });
  expect(result).toEqual(saved);
  expect(context.establishments.find(item => item.id === saved.id)).toMatchObject(saved);
  expect(context.error).toBe("Establishment saved, but related data could not be refreshed. Refresh unavailable");
  expect(context.householdRecords).toEqual([{ id: 4 }]);
  expect(context.barangays).toEqual(["Daungan"]);
  expect(context.householdDashboardData).toEqual({ total: 1 });
  expect(api.fetchHouseholdBootstrap).toHaveBeenCalledTimes(1);
});

test.each([false, true])("background refresh failure=%s cannot clear a concurrent household loading state", async refreshFails => {
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(context.loading).toBe(false));
  let finishHouseholds;
  api.fetchHouseholdBootstrap.mockImplementationOnce(() => new Promise(resolve => { finishHouseholds = resolve; }));
  api.updateHouseholdRecord.mockResolvedValue({ id: 4 });
  let householdPending;
  await act(async () => { householdPending = context.updateHousehold(4, {}); });
  expect(context.loading).toBe(true);
  expect(context.actionLoading).toBe(true);
  api.createSanitationEstablishment.mockResolvedValue({ id: 2 });
  if (refreshFails) api.fetchSanitationBootstrap.mockRejectedValueOnce(new Error("Refresh unavailable"));
  await act(async () => { await context.createEstablishment({}); });
  expect(context.loading).toBe(true);
  expect(context.actionLoading).toBe(true);
  await act(async () => { finishHouseholds({ householdRecords: [{ id: 4 }], barangays: ["Daungan"], householdDashboardData: { total: 1 } }); await householdPending; });
  expect(context.loading).toBe(false);
  expect(context.actionLoading).toBe(false);
  expect(context.householdRecords).toEqual([{ id: 4 }]);
});

test("deferred household failure is explicit without changing core readiness", async () => {
  api.fetchHouseholdBootstrap.mockRejectedValueOnce(new Error("Households offline"));
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.error).toBe("");
  expect(context.householdStatus).toBe("error");
  expect(context.householdReady).toBe(false);
  expect(context.householdError).toBe("Households offline");
  expect(context.householdRecords).toEqual([]);
  expect(context.householdDashboardData).toBeNull();
  expect(context.establishments).toHaveLength(1);
});

test("optional analytics prefetch failure does not convert a successful bootstrap into a connection error", async () => {
  api.fetchSanitationBootstrap.mockResolvedValueOnce({ establishments: [{ id: 1 }], reportData: { marker: "bootstrap report" } });
  api.fetchSanitationReports.mockRejectedValueOnce(new Error("Optional reports offline"));
  render(<SanitationDataProvider><Probe /></SanitationDataProvider>);
  await waitFor(() => expect(context.loading).toBe(false));
  expect(context.reportData).toEqual({ marker: "bootstrap report" });
  expect(context.error).toBe("");
});
