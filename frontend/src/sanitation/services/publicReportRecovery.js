// This device-only record contains public form data, never staff/session data.
export const RECOVERY_KEY = "sanitation.public-report.recovery.v1";
export const RECOVERY_TTL = 24 * 60 * 60 * 1000;
const KEYS = ["complainant_name", "contact_number", "category", "barangay", "location_address", "description"];

function read() {
  const raw = window.localStorage.getItem(RECOVERY_KEY);
  if (raw === null) return null;
  const record = JSON.parse(raw);
  if (record?.version !== 1 || typeof record.id !== "string" || !/^web-[a-zA-Z0-9-]{1,60}$/.test(record.id) ||
      !Number.isFinite(record.createdAt) || record.createdAt > Date.now() ||
      record.expiresAt !== record.createdAt + RECOVERY_TTL) throw new Error("Invalid recovery record");
  if (record.confirmed) {
    const r = record.receipt;
    if (record.payload || !r || typeof r.complaint_id !== "string" || !r.complaint_id || r.complaint_id.length > 40 ||
        r.status !== "pending" || !Number.isFinite(Date.parse(r.created_at)) ||
        !["high", "medium", "low"].includes(r.priority)) throw new Error("Invalid receipt");
    // Project only approved public receipt fields, even if storage was tampered with.
    record.receipt = { complaint_id: r.complaint_id, status: r.status, created_at: r.created_at, priority: r.priority };
  } else if (!record.payload || Object.keys(record.payload).length !== KEYS.length ||
      KEYS.some((key) => typeof record.payload[key] !== "string" || !record.payload[key].trim()) ||
      !/^09\d{9}$/.test(record.payload.contact_number) || record.payload.complainant_name.length > 160 ||
      record.payload.location_address.length > 255) throw new Error("Invalid payload");
  return record;
}

export function clearRecovery(id) {
  // A known attempt must never delete another tab's different pending submission.
  if (id) {
    const current = read();
    if (current && current.id !== id) throw new Error("Different pending report");
  }
  window.localStorage.removeItem(RECOVERY_KEY);
  if (window.localStorage.getItem(RECOVERY_KEY) !== null) throw new Error("Recovery removal failed");
}

export function loadRecovery() {
  const record = read();
  if (record && record.expiresAt <= Date.now()) {
    clearRecovery(record.id);
    return { expired: true };
  }
  return record;
}

export function persistRecovery(attempt) {
  if (attempt.expiresAt <= Date.now()) throw new Error("Expired recovery");
  const existing = read();
  const record = { version: 1, ...attempt };
  if (existing && (existing.confirmed || existing.id !== attempt.id || JSON.stringify(existing.payload) !== JSON.stringify(attempt.payload))) {
    throw new Error("Another pending report exists");
  }
  const raw = JSON.stringify(record);
  window.localStorage.setItem(RECOVERY_KEY, raw);
  if (window.localStorage.getItem(RECOVERY_KEY) !== raw) throw new Error("Recovery write failed");
}

export function acknowledgeRecovery(attempt, receipt) {
  const current = read();
  if (current && current.id !== attempt.id) throw new Error("Different pending report");
  // Remove sensitive fields first. If removal fails, reopening shows a confirmed
  // public receipt rather than offering another submission of the pending data.
  const safe = { complaint_id: receipt.complaint_id, status: receipt.status, created_at: receipt.created_at, priority: receipt.priority };
  const raw = JSON.stringify({ version: 1, id: attempt.id, createdAt: attempt.createdAt,
    expiresAt: attempt.expiresAt, confirmed: true, receipt: safe });
  window.localStorage.setItem(RECOVERY_KEY, raw);
  if (window.localStorage.getItem(RECOVERY_KEY) !== raw) throw new Error("Receipt storage failed");
  clearRecovery(attempt.id);
}
