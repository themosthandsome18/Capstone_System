import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import PublicCommunityReport from "./PublicCommunityReport";
import { createPublicReportId, fetchPublicReportOptions, submitPublicReport } from "../services/publicReportingApi";
import { RECOVERY_KEY, RECOVERY_TTL } from "../services/publicReportRecovery";

jest.mock("../services/publicReportingApi", () => ({
  createPublicReportId: jest.fn(), fetchPublicReportOptions: jest.fn(), submitPublicReport: jest.fn(),
}));
const serverOptions = { categories: ["Server concern", "Another server concern"], barangays: ["Server barangay"] };
const receipt = { complaint_id: "CMP-SYNTHETIC-1", status: "pending", created_at: "2026-10-19T00:00:00Z", priority: "high" };
beforeEach(() => {
  localStorage.clear();
  jest.resetAllMocks();
  createPublicReportId.mockReturnValueOnce("web-first").mockReturnValue("web-next");
  fetchPublicReportOptions.mockResolvedValue(serverOptions);
  submitPublicReport.mockResolvedValue(receipt);
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());
async function openForm() {
  render(<PublicCommunityReport />);
  await screen.findByRole("option", { name: "Server concern" });
}
function fill() {
  for (const [label, value] of [
    ["Resident name", " Synthetic Resident "], ["Philippine mobile number", "+63 917 123 4567"],
    ["Concern category", "Server concern"], ["Barangay", "Server barangay"],
    ["Location / address", " Purok   3 "], ["Description", " Synthetic report "],
  ]) fireEvent.change(screen.getByLabelText(new RegExp(`^${label.replace("/", "\\/")}`)), { target: { value } });
  fireEvent.click(screen.getByRole("checkbox"));
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "Submit report" })); }

test("lost acknowledgement survives reload and retries the saved report rather than creating another", async () => {
  const saved = new Map();
  submitPublicReport.mockImplementation(async (payload) => {
    if (saved.has(payload.client_submission_id)) return receipt;
    saved.set(payload.client_submission_id, payload);
    throw new Error("Acknowledgement lost after server saved report");
  });
  const { unmount } = render(<PublicCommunityReport />);
  await screen.findByRole("option", { name: "Server concern" });
  fill(); submit();
  await screen.findByRole("button", { name: "Retry this report" });
  unmount();
  await openForm();
  expect(await screen.findByText(/Unfinished submission recovered/)).toBeInTheDocument();
  expect(submitPublicReport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByText(receipt.complaint_id);
  expect(submitPublicReport.mock.calls[1]).toEqual(submitPublicReport.mock.calls[0]);
  expect(saved.size).toBe(1);
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
});

function savedAttempt(overrides = {}) {
  const createdAt = Date.now();
  return { version: 1, id: "web-reopened", createdAt, expiresAt: createdAt + RECOVERY_TTL,
    payload: { complainant_name: "Recovered Resident", contact_number: "09171234567", category: "Server concern",
      barangay: "Server barangay", location_address: "Original address", description: "Original description" }, ...overrides };
}

test("a reopened tab restores locked original details, never sends automatically, and requires discard confirmation for edits", async () => {
  const record = savedAttempt(); localStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
  await openForm();
  expect(screen.getByText(/Unfinished submission recovered/)).toBeInTheDocument();
  expect(screen.getByLabelText(/^Description/)).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "Changed" } });
  expect(submitPublicReport).not.toHaveBeenCalled();
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Discard pending submission" }));
  expect(localStorage.getItem(RECOVERY_KEY)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByText(receipt.complaint_id);
  expect(submitPublicReport).toHaveBeenCalledWith({ ...record.payload, client_submission_id: record.id });
  expect(createPublicReportId).not.toHaveBeenCalled();
});

test("confirmed discard removes recovery before allowing a new report and ID", async () => {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(savedAttempt())); await openForm();
  fireEvent.click(screen.getByRole("button", { name: "Discard pending submission" }));
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  expect(screen.getByLabelText(/^Description/)).toHaveValue("");
  fill(); submit(); await screen.findByText(receipt.complaint_id);
  expect(submitPublicReport.mock.calls[0][0].client_submission_id).not.toBe("web-reopened");
});

test.each([409, 429])("recovered %s keeps immutable durable data and never generates a fresh ID", async (status) => {
  const record = savedAttempt(); localStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
  submitPublicReport.mockRejectedValue(Object.assign(new Error("PRIVATE"), { status }));
  await openForm(); fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByText(status === 409 ? /could not be safely reused/ : /Too many reports/);
  expect(JSON.parse(localStorage.getItem(RECOVERY_KEY))).toEqual(record);
  expect(screen.getByLabelText(/^Description/)).toBeDisabled();
  expect(createPublicReportId).not.toHaveBeenCalled();
  expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
});

test("expired recovery clears device data, warns of unknown outcome and blocks sending until deliberate new-report confirmation", async () => {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(savedAttempt({ createdAt: Date.now() - RECOVERY_TTL - 1, expiresAt: Date.now() - 1 })));
  await openForm();
  expect(screen.getByRole("alert")).toHaveTextContent(/Submission status may still be unknown/);
  expect(screen.getByRole("alert")).toHaveTextContent(/could duplicate/);
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  expect(submitPublicReport).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Retry this report" })).not.toBeInTheDocument();
  window.confirm.mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Start a new report" }));
  expect(createPublicReportId).not.toHaveBeenCalled();
});

test("Strict Mode preserves the expiry warning after removing expired sensitive data", async () => {
  const createdAt = Date.now() - RECOVERY_TTL - 1000;
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(savedAttempt({ createdAt, expiresAt: createdAt + RECOVERY_TTL })));
  render(<React.StrictMode><PublicCommunityReport /></React.StrictMode>);
  await screen.findByRole("option", { name: "Server concern" });
  expect(screen.getByRole("alert")).toHaveTextContent(/Submission status may still be unknown/);
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  expect(submitPublicReport).not.toHaveBeenCalled();
});

test("unavailable storage blocks POST, retains in-memory identity, and retries that identity after storage returns", async () => {
  await openForm(); fill();
  const broken = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  submit();
  expect(screen.getByRole("alert")).toHaveTextContent(/could not be saved safely/);
  expect(submitPublicReport).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/^Description/)).toBeDisabled();
  broken.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByText(receipt.complaint_id);
  expect(createPublicReportId).toHaveBeenCalledTimes(1);
  expect(submitPublicReport.mock.calls[0][0].client_submission_id).toBe("web-first");
});

test("uncertain in-memory payload survives later storage failure without another ID", async () => {
  submitPublicReport.mockRejectedValueOnce(new Error("Lost"));
  await openForm(); fill(); submit(); await screen.findByRole("button", { name: "Retry this report" });
  const broken = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  expect(submitPublicReport).toHaveBeenCalledTimes(1);
  broken.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByText(receipt.complaint_id);
  expect(submitPublicReport.mock.calls[1]).toEqual(submitPublicReport.mock.calls[0]);
});

test("corrupt storage fails closed until confirmed discard", async () => {
  localStorage.setItem(RECOVERY_KEY, "corrupt"); await openForm();
  expect(screen.getByRole("alert")).toHaveTextContent(/unavailable or damaged/);
  expect(screen.queryByRole("button", { name: "Submit report" })).not.toBeInTheDocument();
  expect(localStorage.getItem(RECOVERY_KEY)).toBe("corrupt");
  fireEvent.click(screen.getByRole("button", { name: "Discard pending submission" }));
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
});

test("success remains visible on cleanup failure and stored confirmed receipt contains no pending payload", async () => {
  await openForm(); fill();
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Blocked"); });
  submit(); await screen.findByText(receipt.complaint_id);
  expect(screen.getByRole("alert")).toHaveTextContent(/could not be fully cleared/);
  expect(localStorage.getItem(RECOVERY_KEY)).not.toMatch(/Synthetic Resident|0917|payload/);
  expect(screen.queryByRole("button", { name: "Retry this report" })).not.toBeInTheDocument();
});

test("the exact immutable recovery snapshot exists before POST starts", async () => {
  submitPublicReport.mockImplementation(async (payload) => {
    const stored = JSON.parse(localStorage.getItem(RECOVERY_KEY));
    const { client_submission_id, ...submitted } = payload;
    expect(stored).toMatchObject({ id: client_submission_id, payload: submitted });
    expect(stored.expiresAt - stored.createdAt).toBe(RECOVERY_TTL);
    return receipt;
  });
  await openForm(); fill(); submit(); await screen.findByText(receipt.complaint_id);
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
});

test("an open recovered page expires without sending automatically", async () => {
  const record = savedAttempt({ createdAt: Date.now() - RECOVERY_TTL + 1000, expiresAt: Date.now() + 1000 });
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
  await openForm();
  await screen.findByText(/Device recovery expired/, {}, { timeout: 2000 });
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  expect(submitPublicReport).not.toHaveBeenCalled();
});

test("loads server options with accessible required labels and no photo, tracking or GPS controls", async () => {
  await openForm();
  expect(fetchPublicReportOptions).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("option", { name: "Server barangay" })).toBeInTheDocument();
  expect(screen.getByLabelText(/^Philippine mobile number/)).toHaveAttribute("type", "tel");
  expect(screen.getByLabelText(/^Resident name/)).toBeRequired();
  expect(screen.queryByLabelText(/photo|attachment/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /track|login|register/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/latitude|longitude|gps/i)).not.toBeInTheDocument();
});

test("requires fields and explicit privacy acknowledgement before any request or ID generation", async () => {
  await openForm(); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("highlighted fields");
  expect(submitPublicReport).not.toHaveBeenCalled();
  expect(createPublicReportId).not.toHaveBeenCalled();
  fill(); fireEvent.click(screen.getByRole("checkbox")); submit();
  expect(screen.getByText(/Please acknowledge the privacy notice/)).toBeInTheDocument();
  expect(submitPublicReport).not.toHaveBeenCalled();
});

test("rejects invalid Philippine mobile numbers", async () => {
  await openForm(); fill();
  fireEvent.change(screen.getByLabelText(/^Philippine mobile number/), { target: { value: "123" } });
  submit();
  expect(screen.getByText(/Enter a Philippine mobile number/)).toBeInTheDocument();
  expect(submitPublicReport).not.toHaveBeenCalled();
});

test("sends only the six normalized fields plus ID and displays only approved receipt data", async () => {
  submitPublicReport.mockResolvedValue({ ...receipt, assigned_inspector: "SECRET INSPECTOR", inspection_schedule_note: "SECRET NOTE", contact_number: "SECRET CONTACT" });
  await openForm(); fill(); submit();
  await screen.findByRole("heading", { name: "Report received" });
  expect(submitPublicReport).toHaveBeenCalledWith({
    complainant_name: "Synthetic Resident", contact_number: "09171234567", category: "Server concern",
    barangay: "Server barangay", location_address: "Purok 3", description: "Synthetic report", client_submission_id: "web-first",
  });
  expect(screen.getByText(receipt.complaint_id)).toBeInTheDocument();
  expect(screen.getByText("High")).toBeInTheDocument();
  expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Resident name/)).not.toBeInTheDocument();
});

test.each([undefined, 408, 500])("uncertainty (%s) retains data, locks editing and deliberately retries the identical payload/ID", async (status) => {
  submitPublicReport.mockRejectedValueOnce(Object.assign(new Error("PRIVATE backend detail"), { status })).mockResolvedValueOnce(receipt);
  await openForm(); fill(); submit();
  await screen.findByRole("button", { name: "Retry this report" });
  expect(screen.getByLabelText(/^Resident name/)).toHaveValue(" Synthetic Resident ");
  expect(screen.getByLabelText(/^Resident name/)).toBeDisabled();
  expect(screen.queryByText("PRIVATE backend detail")).not.toBeInTheDocument();
  expect(submitPublicReport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByRole("heading", { name: "Report received" });
  expect(submitPublicReport.mock.calls[1]).toEqual(submitPublicReport.mock.calls[0]);
  expect(createPublicReportId).toHaveBeenCalledTimes(1);
});

test("prevents duplicate requests while pending, including immediate double submissions", async () => {
  let resolve;
  submitPublicReport.mockReturnValue(new Promise((done) => { resolve = done; }));
  await openForm(); fill();
  const form = screen.getByRole("form", { name: "Sanitation concern submission" });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(submitPublicReport).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("Submitting");
  await act(async () => resolve(receipt));
});

test("409 retains content and offers neither an automatic retry nor a silently new ID", async () => {
  submitPublicReport.mockRejectedValue(Object.assign(new Error("SECRET CONFLICT"), { status: 409 }));
  await openForm(); fill(); submit();
  await screen.findByText(/could not be safely reused/);
  expect(screen.getByLabelText(/^Description/)).toHaveValue(" Synthetic report ");
  expect(screen.queryByRole("button", { name: "Retry this report" })).not.toBeInTheDocument();
  expect(screen.queryByText("SECRET CONFLICT")).not.toBeInTheDocument();
  expect(createPublicReportId).toHaveBeenCalledTimes(1);
  expect(submitPublicReport).toHaveBeenCalledTimes(1);
});

test("429 preserves content and permits only a deliberate same-ID retry", async () => {
  submitPublicReport.mockRejectedValueOnce(Object.assign(new Error("Limited"), { status: 429 }));
  await openForm(); fill(); submit();
  await screen.findByText(/Too many reports/);
  expect(screen.getByLabelText(/^Description/)).toHaveValue(" Synthetic report ");
  expect(submitPublicReport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry this report" }));
  await screen.findByRole("heading", { name: "Report received" });
  expect(submitPublicReport.mock.calls[1]).toEqual(submitPublicReport.mock.calls[0]);
});

test("a changed report after definite 400 rejection uses a new ID", async () => {
  submitPublicReport.mockRejectedValueOnce(Object.assign(new Error("Validation"), { status: 400, details: { errors: { description: ["SECRET RAW MESSAGE"] } } }));
  await openForm(); fill(); submit();
  await screen.findByText(/report was not accepted/);
  expect(screen.getByLabelText(/^Description/)).toBeEnabled();
  expect(screen.queryByText("SECRET RAW MESSAGE")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "Corrected report" } });
  submit(); await screen.findByRole("heading", { name: "Report received" });
  expect(submitPublicReport.mock.calls[1][0]).toMatchObject({ description: "Corrected report", client_submission_id: "web-next" });
});

test("starting a new report is explicit and clears the old receipt and inputs", async () => {
  await openForm(); fill(); submit(); await screen.findByText(receipt.complaint_id);
  fireEvent.click(screen.getByRole("button", { name: "Start a new report" }));
  expect(screen.getByLabelText(/^Resident name/)).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.queryByText(receipt.complaint_id)).not.toBeInTheDocument();
  fill(); submit(); await screen.findByText(receipt.complaint_id);
  expect(submitPublicReport.mock.calls[1][0].client_submission_id).toBe("web-next");
});

test("cancelling an uncertain reset retains the previous attempt and safe retry", async () => {
  window.confirm.mockReturnValue(false);
  submitPublicReport.mockRejectedValueOnce(new Error("Offline"));
  await openForm(); fill(); submit(); await screen.findByRole("button", { name: "Retry this report" });
  fireEvent.click(screen.getByRole("button", { name: "Start a new report" }));
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(createPublicReportId).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/^Resident name/)).toHaveValue(" Synthetic Resident ");
});

test("option loading fails closed and supports an explicit reload", async () => {
  fetchPublicReportOptions.mockRejectedValueOnce(new Error("Unavailable"));
  render(<PublicCommunityReport />);
  await screen.findByRole("button", { name: "Reload options" });
  expect(screen.getByRole("button", { name: "Submit report" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload options" }));
  await screen.findByRole("option", { name: "Server concern" });
  expect(fetchPublicReportOptions).toHaveBeenCalledTimes(2);
});

test("scoped mobile CSS supplies a single-column 390px layout and usable touch controls", () => {
  const css = fs.readFileSync(path.join(__dirname, "PublicCommunityReport.css"), "utf8");
  expect(css).toMatch(/@media \(max-width: 480px\)/);
  expect(css).toMatch(/\.public-report-card \{ width: 100%; max-width: 640px/);
  expect(css).toMatch(/min-height: 48px/);
  expect(css).toMatch(/font: 16px/);
  expect(css).toMatch(/min-width: 0/);
  expect(css).toMatch(/overflow-wrap: anywhere/);
  // CSS contract only: jsdom cannot prove real viewport geometry.
});
