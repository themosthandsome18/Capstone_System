import { apiRequest } from "../../shared/apiClient";

export async function fetchPublicReportOptions() {
  const data = await apiRequest("/mobile/sanitation/bootstrap/", { auth: false, credentials: "omit" });
  const categories = data?.reportCategories;
  const barangays = data?.barangays;
  if (!Array.isArray(categories) || !categories.length ||
      categories.some((name) => typeof name !== "string" || !name.trim()) ||
      !Array.isArray(barangays) || !barangays.length ||
      barangays.some((item) => typeof item?.name !== "string" || !item.name.trim())) {
    throw new Error("Report options are unavailable.");
  }
  return { categories: [...new Set(categories)], barangays: [...new Set(barangays.map((item) => item.name))] };
}

export function createPublicReportId() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `web-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function submitPublicReport(payload) {
  const data = await apiRequest("/mobile/sanitation/reports/", {
    auth: false, credentials: "omit", method: "POST", body: JSON.stringify(payload),
  });
  if (typeof data?.complaint_id !== "string" || !data.complaint_id.trim() ||
      data.complaint_id.length > 40 || data.status !== "pending" ||
      typeof data.created_at !== "string" || !Number.isFinite(Date.parse(data.created_at)) ||
      !["high", "medium", "low"].includes(data.priority)) {
    throw new Error("Submission acknowledgement could not be confirmed.");
  }
  // Project approved fields, even if a server accidentally returns extra data.
  return { complaint_id: data.complaint_id, status: data.status,
    created_at: data.created_at, priority: data.priority };
}
