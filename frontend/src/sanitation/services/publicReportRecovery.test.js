import { acknowledgeRecovery, clearRecovery, loadRecovery, persistRecovery, RECOVERY_KEY, RECOVERY_TTL } from "./publicReportRecovery";

const payload = { complainant_name: "Synthetic", contact_number: "09171234567", category: "Concern", barangay: "Barangay", location_address: "Address", description: "Description" };
const receipt = { complaint_id: "CMP-TEST", status: "pending", created_at: "2026-10-19T00:00:00Z", priority: "medium" };
const attempt = () => ({ id: "web-test", payload, createdAt: Date.now(), expiresAt: Date.now() + RECOVERY_TTL });
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date("2026-10-19T01:00:00Z")); localStorage.clear(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); localStorage.clear(); });

test("stores exact public payload and identity with fixed 24-hour expiry", () => {
  const record = attempt(); persistRecovery(record);
  expect(loadRecovery()).toEqual({ version: 1, ...record });
  jest.advanceTimersByTime(1000); persistRecovery(record);
  expect(loadRecovery().expiresAt).toBe(record.expiresAt);
});
test("expires at exactly 24 hours and removes the device record", () => {
  persistRecovery(attempt()); jest.advanceTimersByTime(RECOVERY_TTL - 1);
  expect(loadRecovery().id).toBe("web-test"); jest.advanceTimersByTime(1);
  expect(loadRecovery()).toEqual({ expired: true });
  expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
});
test("cannot persist expired data", () => {
  const record = attempt(); jest.advanceTimersByTime(RECOVERY_TTL);
  expect(() => persistRecovery(record)).toThrow();
});
test.each(["not json", JSON.stringify({ version: 1 }), JSON.stringify({ version: 99 })])("fails closed on corrupt storage (%s)", (raw) => {
  localStorage.setItem(RECOVERY_KEY, raw); expect(loadRecovery).toThrow();
  expect(localStorage.getItem(RECOVERY_KEY)).toBe(raw);
  clearRecovery(); expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
});
test("rejects incomplete payloads and extra private fields on restore", () => {
  const record = { version: 1, ...attempt(), payload: { ...payload, staff_notes: "not allowed" } };
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(record)); expect(loadRecovery).toThrow();
});
test("does not overwrite or delete another pending submission", () => {
  persistRecovery(attempt());
  expect(() => persistRecovery({ ...attempt(), id: "web-other" })).toThrow();
  expect(() => clearRecovery("web-other")).toThrow();
  expect(loadRecovery().id).toBe("web-test");
});
test("receipt acknowledgement removes payload and device recovery", () => {
  const record = attempt(); persistRecovery(record); acknowledgeRecovery(record, receipt);
  expect(loadRecovery()).toBeNull();
});
test("failed removal leaves only a minimal confirmed receipt, never a retryable payload", () => {
  const record = attempt(); persistRecovery(record);
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Unavailable"); });
  expect(() => acknowledgeRecovery(record, { ...receipt, staff_notes: "PRIVATE" })).toThrow();
  expect(loadRecovery()).toMatchObject({ confirmed: true, receipt });
  expect(localStorage.getItem(RECOVERY_KEY)).not.toMatch(/Synthetic|0917|staff_notes|PRIVATE|payload/);
});
test.each(["getItem", "setItem"])("storage %s failure blocks durable preparation", (method) => {
  jest.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("Unavailable"); });
  expect(() => persistRecovery(attempt())).toThrow();
});
test("silent storage write failure is detected by read-back", () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  expect(() => persistRecovery(attempt())).toThrow();
});
