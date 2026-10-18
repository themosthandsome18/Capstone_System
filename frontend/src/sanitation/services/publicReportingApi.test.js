import { API_BASE_URL, AUTH_TOKEN_KEY } from "../../shared/apiClient";
import { createPublicReportId, fetchPublicReportOptions, submitPublicReport } from "./publicReportingApi";

const receipt = { complaint_id: "CMP-SYNTHETIC", status: "pending", created_at: "2026-10-19T00:00:00Z", priority: "high" };
const options = { reportCategories: ["Synthetic concern"], barangays: [{ name: "Synthetic barangay" }] };
// This Jest/jsdom version lacks the browser Crypto API; use Node's real WebCrypto.
beforeAll(() => Object.defineProperty(window, "crypto", { value: require("crypto").webcrypto, configurable: true }));
beforeEach(() => { window.localStorage.setItem(AUTH_TOKEN_KEY, "synthetic-staff-token"); global.fetch = jest.fn(); });
afterEach(() => { window.localStorage.clear(); jest.restoreAllMocks(); });
function reply(data, status = 200) {
  global.fetch.mockResolvedValue({ ok: status < 400, status,
    json: async () => data, text: async () => JSON.stringify(data) });
}

test("loads options anonymously and projects only server categories and barangay names", async () => {
  reply({ ...options, complaintData: { rows: [{ assigned_inspector: "PRIVATE" }] } });
  await expect(fetchPublicReportOptions()).resolves.toEqual({ categories: ["Synthetic concern"], barangays: ["Synthetic barangay"] });
  expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/mobile/sanitation/bootstrap/`, expect.objectContaining({ credentials: "omit" }));
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
});

test.each([{}, { ...options, reportCategories: [] }, { ...options, barangays: [] },
  { ...options, reportCategories: [null] }])("missing or malformed server options fail closed: %j", async (data) => {
  reply(data);
  await expect(fetchPublicReportOptions()).rejects.toThrow("options are unavailable");
});

test("sends exact caller payload anonymously and strips unexpected response fields", async () => {
  const payload = { complainant_name: "Synthetic Resident", contact_number: "09171234567", category: "Synthetic concern",
    barangay: "Synthetic barangay", location_address: "Purok 3", description: "Synthetic report", client_submission_id: "web-synthetic" };
  reply({ ...receipt, assigned_inspector: "PRIVATE", action_taken: "PRIVATE" }, 201);
  await expect(submitPublicReport(payload)).resolves.toEqual(receipt);
  expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/mobile/sanitation/reports/`, expect.objectContaining({
    method: "POST", credentials: "omit", body: JSON.stringify(payload),
  }));
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
});

test.each([409, 429])("preserves HTTP %s for explicit UI handling", async (status) => {
  reply({ detail: "Synthetic error" }, status);
  await expect(submitPublicReport({})).rejects.toMatchObject({ status });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("an unconfirmed receipt is an error and is never automatically resubmitted", async () => {
  reply({ complaint_id: "CMP-SYNTHETIC", assigned_inspector: "PRIVATE" }, 201);
  await expect(submitPublicReport({})).rejects.toThrow("could not be confirmed");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("generates fresh secure IDs within the backend's 64 character limit", () => {
  const first = createPublicReportId();
  expect(first).toMatch(/^web-[a-f0-9]{32}$/);
  expect(createPublicReportId()).not.toBe(first);
});
