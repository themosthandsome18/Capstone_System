// This report reads current records. It does not reconstruct earlier versions.
export const NOT_RECORDED = "Not recorded";
export function recordedText(value) {
  return typeof value === "string" && value.trim() ? value : NOT_RECORDED;
}
export function recordId(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return "";
  const id = value.trim().replace(/^0+(?=\d)/, "");
  return id === "0" ? "" : id;
}
function dateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}
export function recordedDate(value) {
  if (value == null || value === "") return NOT_RECORDED;
  return dateKey(value) || `Unrecognized recorded date: ${String(value)}`;
}
function timestampKey(value) {
  if (typeof value !== "string" || !dateKey(value.slice(0, 10)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function recordedTimestamp(value) {
  if (value == null || value === "") return NOT_RECORDED;
  return timestampKey(value) === null ? `Unrecognized recorded timestamp: ${String(value)}` : value;
}
function compareIds(a, b) { return recordId(a.id).localeCompare(recordId(b.id), "en", { numeric: true }); }
function compareDates(a, b) {
  const first = dateKey(a.inspection_date), second = dateKey(b.inspection_date);
  if (!first || !second) return first ? -1 : second ? 1 : compareIds(a, b);
  return first.localeCompare(second) || compareIds(a, b);
}
function compareCreation(a, b) {
  const first = timestampKey(a.created_at), second = timestampKey(b.created_at);
  if (first === null || second === null) return first === null && second === null ? compareIds(a, b) : first === null ? 1 : -1;
  return first - second || compareIds(a, b);
}
function assertRows(rows, name, related = false) {
  if (!Array.isArray(rows)) throw new Error(`${name}: expected a complete unpaginated list. Paginated or unsupported responses cannot be printed.`);
  const ids = new Set();
  rows.forEach((row) => {
    if (!row || typeof row !== "object" || !recordId(row.id) || ids.has(recordId(row.id)) ||
        (related && !recordId(row.establishment))) throw new Error(`${name}: incomplete record identifiers. Please reload the report.`);
    ids.add(recordId(row.id));
    if (row.checklist_items != null && (!Array.isArray(row.checklist_items) ||
        row.checklist_items.some((item) => !item || typeof item !== "object" || Array.isArray(item)))) {
      throw new Error(`${name}: unsupported checklist data. Please reload the report.`);
    }
  });
}
export function validateReportResponses(establishments, inspections, renewalResponse) {
  assertRows(establishments, "Establishments");
  assertRows(inspections, "Inspections", true);
  if (!renewalResponse || typeof renewalResponse !== "object" || Array.isArray(renewalResponse) || ["next", "previous", "results", "count"].some((key) => key in renewalResponse)) {
    throw new Error("Renewals: paginated or unsupported response. Complete report data is unavailable.");
  }
  assertRows(renewalResponse.rows, "Renewals", true);
  return { establishments, inspections, renewals: renewalResponse.rows };
}
export function buildEstablishmentReport(data, selectedId) {
  const id = recordId(selectedId);
  if (!id) return null;
  const establishment = data.establishments.find((row) => recordId(row.id) === id);
  if (!establishment) return null;
  const related = data.inspections.filter((row) => recordId(row.establishment) === id);
  return {
    establishment,
    inspections: related.filter((row) => row.is_draft === false).sort(compareDates),
    drafts: related.filter((row) => row.is_draft === true).length,
    unknownFinalization: related.filter((row) => row.is_draft !== true && row.is_draft !== false).length,
    renewals: data.renewals.filter((row) => recordId(row.establishment) === id).sort(compareCreation),
  };
}
