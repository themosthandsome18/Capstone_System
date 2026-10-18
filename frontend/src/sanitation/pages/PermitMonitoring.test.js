import React from "react";
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fs from "fs";
import path from "path";
import PermitMonitoring from "./PermitMonitoring";
import { issueSanitationEnforcementStage } from "../services/sanitationApi";

let mockRole = "sanitation";
const mockNavigate = jest.fn();
let mockCtx;
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ role: mockRole }) }));
jest.mock("../context/SanitationDataContext", () => ({ useSanitationData: () => mockCtx }));
jest.mock("../services/sanitationApi", () => ({ issueSanitationEnforcementStage: jest.fn() }));

const stageCases = [
  ["", "Not recorded", "neutral", "warning", "Warning"],
  ["warning", "Warning", "yellow", "nov_1", "Notice of Violation 1"],
  ["nov_1", "Notice of Violation 1", "orange", "nov_2", "Notice of Violation 2"],
  ["nov_2", "Notice of Violation 2", "orange", "nov_3", "Notice of Violation 3"],
  ["nov_3", "Notice of Violation 3", "orange", "suspension", "Suspension"],
  ["suspension", "Suspension", "red", null, null],
];
function record(stage = "") {
  return {
    id: 7, business_name: "Synthetic cafe", owner_name: "Synthetic owner",
    business_type_name: "Food Establishment", permit_size_label: "SP", barangay: "Daungan",
    permit_number: "SYNTHETIC-7", permit_status: "conditional", permit_status_label: "Conditional",
    compliance_status: "violation", compliance_status_label: "Violation", enforcement_stage: stage,
  };
}
function action(label = "Warning") {
  return screen.getByRole("button", { name: `Issue ${label} for Synthetic cafe` });
}
function tableRow() {
  return screen.getByRole("row", { name: /Synthetic cafe/ });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "sanitation";
  mockCtx = {
    establishments: [record()], inspections: [{ establishment: 7, inspection_date: "2026-10-18" }],
    loading: false, error: "", permitData: null,
    refreshEstablishments: jest.fn().mockResolvedValue([]),
    refreshPermitData: jest.fn().mockResolvedValue({}),
  };
  issueSanitationEnforcementStage.mockReset().mockResolvedValue({ changed: true });
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test.each(stageCases)("renders %s with exact label and color", (stage, label, color) => {
  mockCtx.establishments = [record(stage)];
  render(<PermitMonitoring />);
  expect(screen.getByRole("columnheader", { name: "Enforcement Stage" })).toBeInTheDocument();
  const badge = within(tableRow()).getByText(label, { selector: ".enforcement-stage" });
  expect(badge).toHaveClass(`enforcement-stage--${color}`);
});

test("badge colors use the actual dedicated stylesheet rules", () => {
  mockCtx.establishments = stageCases.map(([stage], index) => ({ ...record(stage), id: index, business_name: `Cafe ${index}` }));
  const css = fs.readFileSync(path.join(__dirname, "../Sanitation_index.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css.match(/\.enforcement-stage--[a-z]+\s*\{[^}]+\}/g).join("\n");
  document.head.appendChild(style);
  try {
    render(<PermitMonitoring />);
    const expected = ["rgb(241, 245, 249)", "rgb(254, 249, 195)", "rgb(255, 237, 213)", "rgb(255, 237, 213)", "rgb(255, 237, 213)", "rgb(254, 226, 226)"];
    screen.getAllByText(/./, { selector: ".enforcement-stage" }).forEach((badge, i) => {
      expect(getComputedStyle(badge).backgroundColor).toBe(expected[i]);
    });
  } finally { style.remove(); }
});

test("older records missing the field remain neutral and can explicitly issue Warning", async () => {
  delete mockCtx.establishments[0].enforcement_stage;
  render(<PermitMonitoring />);
  expect(within(tableRow()).getByText("Not recorded")).toHaveClass("enforcement-stage--neutral");
  fireEvent.click(action());
  await waitFor(() => expect(issueSanitationEnforcementStage).toHaveBeenCalledWith(7, "warning", ""));
  await screen.findByRole("status");
});

test.each(stageCases.slice(0, 5))("%s offers only its exact next stage with confirmation", async (stage, label, color, next, nextLabel) => {
  mockCtx.establishments = [record(stage)];
  render(<PermitMonitoring />);
  expect(within(tableRow()).getByText(`Next: ${nextLabel}`)).toBeInTheDocument();
  expect(within(tableRow()).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(action(nextLabel));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(`Current enforcement stage: ${label}\nIssue: ${nextLabel}?`));
  expect(window.confirm.mock.calls[0][0].includes("This also suspends the permit")).toBe(next === "suspension");
  await waitFor(() => expect(issueSanitationEnforcementStage).toHaveBeenCalledWith(7, next, stage));
  await screen.findByRole("status");
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("cancelling confirmation sends no request or refresh", () => {
  window.confirm.mockReturnValue(false);
  render(<PermitMonitoring />);
  fireEvent.click(action());
  expect(issueSanitationEnforcementStage).not.toHaveBeenCalled();
  expect(mockCtx.refreshEstablishments).not.toHaveBeenCalled();
});

test.each(["admin", "sanitation"])("%s sees issuance", (role) => {
  mockRole = role;
  render(<PermitMonitoring />);
  expect(action()).toBeEnabled();
  expect(issueSanitationEnforcementStage).not.toHaveBeenCalled();
});

test.each(["tourism", "tourist", "establishment", "", undefined])("%s has no issuance controls", (role) => {
  mockRole = role;
  render(<PermitMonitoring />);
  expect(screen.queryByRole("button", { name: /^Issue / })).not.toBeInTheDocument();
  expect(within(tableRow()).getByText("Not recorded")).toBeInTheDocument();
});

test.each(["suspension", "unexpected_stage"])("%s cannot skip, reverse, clear or reinstate", (stage) => {
  mockCtx.establishments = [record(stage)];
  render(<PermitMonitoring />);
  expect(within(tableRow()).queryByRole("button")).not.toBeInTheDocument();
  expect(issueSanitationEnforcementStage).not.toHaveBeenCalled();
});

test("pending requests prevent duplicate clicks and refresh after success", async () => {
  let resolve;
  issueSanitationEnforcementStage.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<PermitMonitoring />);
  const button = action();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(issueSanitationEnforcementStage).toHaveBeenCalledTimes(1);
  expect(window.confirm).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ changed: true }));
  expect(mockCtx.refreshEstablishments).toHaveBeenCalledTimes(1);
  expect(mockCtx.refreshPermitData).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("Warning issued");
});

test("a server no-op reports no change and never advances automatically", async () => {
  issueSanitationEnforcementStage.mockResolvedValue({ changed: false });
  render(<PermitMonitoring />);
  fireEvent.click(action());
  expect(await screen.findByRole("status")).toHaveTextContent("No change was needed");
  expect(issueSanitationEnforcementStage).toHaveBeenCalledTimes(1);
});

test("success refresh displays server stage and suspended permit status", async () => {
  mockCtx.establishments = [record("nov_3")];
  const view = render(<PermitMonitoring />);
  mockCtx.refreshEstablishments.mockImplementation(async () => {
    mockCtx.establishments = [{ ...record("suspension"), permit_status: "suspended", permit_status_label: "Suspended" }];
    return mockCtx.establishments;
  });
  mockCtx.refreshPermitData.mockImplementation(async () => {
    mockCtx.permitData = { summary: { suspended: 1 } };
  });
  fireEvent.click(action("Suspension"));
  await screen.findByRole("status");
  view.rerender(<PermitMonitoring />);
  expect(within(tableRow()).getByText("Suspension")).toHaveClass("enforcement-stage--red");
  expect(within(tableRow()).getByText("Suspended")).toBeInTheDocument();
  expect(within(tableRow()).queryByRole("button")).not.toBeInTheDocument();
});

test("409 refreshes, does not retry, and requires a new confirmation using current stage", async () => {
  issueSanitationEnforcementStage.mockRejectedValueOnce(Object.assign(new Error("Conflict"), { status: 409 }));
  const view = render(<PermitMonitoring />);
  mockCtx.refreshEstablishments.mockImplementation(async () => {
    mockCtx.establishments = [record("warning")];
    return mockCtx.establishments;
  });
  fireEvent.click(action());
  expect(await screen.findByRole("alert")).toHaveTextContent("Records refreshed");
  view.rerender(<PermitMonitoring />);
  expect(mockCtx.refreshEstablishments).toHaveBeenCalledTimes(1);
  expect(mockCtx.refreshPermitData).toHaveBeenCalledTimes(1);
  expect(issueSanitationEnforcementStage).toHaveBeenCalledTimes(1);
  expect(window.confirm).toHaveBeenCalledTimes(1);
  fireEvent.click(action("Notice of Violation 1"));
  await screen.findByRole("status");
  expect(window.confirm).toHaveBeenCalledTimes(2);
  expect(issueSanitationEnforcementStage).toHaveBeenLastCalledWith(7, "nov_1", "warning");
});

test("failed conflict refresh blocks issuance until a deliberate successful refresh", async () => {
  issueSanitationEnforcementStage.mockRejectedValueOnce(Object.assign(new Error("Conflict"), { status: 409 }));
  mockCtx.refreshEstablishments.mockRejectedValueOnce(new Error("Offline"));
  render(<PermitMonitoring />);
  fireEvent.click(action());
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to refresh");
  expect(action()).toBeDisabled();
  fireEvent.click(action());
  expect(issueSanitationEnforcementStage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh monitoring records" }));
  await screen.findByRole("status");
  expect(action()).toBeEnabled();
  expect(issueSanitationEnforcementStage).toHaveBeenCalledTimes(1);
});

test("server permission denial is displayed even when UI role permits issuance", async () => {
  issueSanitationEnforcementStage.mockRejectedValue(Object.assign(new Error("Denied"), { status: 403, details: { detail: "Server denied issuance." } }));
  render(<PermitMonitoring />);
  fireEvent.click(action());
  expect(await screen.findByRole("alert")).toHaveTextContent("Server denied issuance");
});

test("existing permit, compliance, renewal indicators, filters and row navigation remain", () => {
  mockCtx.establishments = [record("nov_2"), { ...record(""), id: 8, business_name: "Renewal cafe", permit_status: "renewal_due", permit_status_label: "Active - Renewal Due" }];
  render(<PermitMonitoring />);
  const row = tableRow();
  expect(within(row).getByText("Conditional")).toHaveClass("permit-status");
  expect(within(row).getByText("Violation")).toHaveClass("permit-compliance");
  expect(screen.getByText("Renewal Due", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByText("Active - Renewal Due", { selector: ".permit-status" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "conditional" } });
  expect(screen.queryByRole("row", { name: /Renewal cafe/ })).not.toBeInTheDocument();
  fireEvent.click(row);
  expect(mockNavigate).toHaveBeenCalledWith("/sanitation/establishments?search=Synthetic%20cafe");
});
