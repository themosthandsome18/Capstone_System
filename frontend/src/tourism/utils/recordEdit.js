// Editing a tourist record from the view modal of Record Management. Only three kinds of thing may change: the head count, the Length of Stay and the
// resort. Everything else is the tourist's own and stays locked. The server says the same (TOURIST_RECORD_EDITABLE_FIELDS in backend/api/serializers.py,
// which also takes the status, a PATCH of its own that the Arrived / Cancelled buttons send) and refuses any other field with a 400, so the 13 below are
// ALL a PATCH from this screen may carry.
import { entranceFeeBreakdown } from "./entranceFee";
import { formatNumber } from "./format";

export const RECORD_EDIT_FIELDS = [
  "foreigner_count",
  "filipino_count",
  "maubanin_count",
  "total_visitors",
  "total_male",
  "total_female",
  "age_0_7",
  "age_8_59",
  "age_60_above",
  "special_group_count",
  "discounted_count",
  "itinerary_id",
  "resort_id",
];

// Who may edit: the system admin and the Tourism Office, equal (the server's MODULE_ROLES["tourism"]). A resort account never sees the button.
export const RECORD_EDIT_ROLES = ["admin", "tourism"];

export function canEditRecords(role) {
  return RECORD_EDIT_ROLES.includes(role);
}

function toCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

// The 13 values to send, from the form of the wizard (strings) or from a record (numbers): the same shape, so "before" and "after" compare.
export function recordEditPayload(source) {
  const filipino = toCount(source.filipino_count);
  const foreigner = toCount(source.foreigner_count);
  return {
    foreigner_count: foreigner,
    filipino_count: filipino,
    maubanin_count: filipino > 0 ? toCount(source.maubanin_count) : 0,
    total_visitors: filipino + foreigner,
    total_male: toCount(source.total_male),
    total_female: toCount(source.total_female),
    age_0_7: toCount(source.age_0_7),
    age_8_59: toCount(source.age_8_59),
    age_60_above: toCount(source.age_60_above),
    special_group_count: toCount(source.special_group_count),
    discounted_count: toCount(source.discounted_count),
    itinerary_id: Number(source.itinerary_id),
    resort_id: Number(source.resort_id),
  };
}

// What the screen cannot say with a number: a blank box, or a choice not made. (The balance of the head count is checked by validateTotals of the page.)
export function recordEditBlankProblem(form) {
  if (!String(form.resort_id ?? "").trim()) return "Resort is required.";
  if (!String(form.itinerary_id ?? "").trim()) return "Length of Stay is required.";
  if (String(form.discounted_count ?? "").trim() === "") {
    return "Discounted is required. Write 0 if nobody pays the discounted fee: it is not filled in for you, because the fee follows it.";
  }
  return "";
}

const COUNT_LABELS = [
  ["foreigner_count", "foreigners"],
  ["filipino_count", "Filipinos"],
  ["maubanin_count", "Maubanin"],
  ["total_male", "male"],
  ["total_female", "female"],
  ["age_0_7", "age 0-7"],
  ["age_8_59", "age 8-59"],
  ["age_60_above", "age 60+"],
  ["special_group_count", "special needs"],
  ["discounted_count", "discounted"],
];

export function peso(amount) {
  return `₱${formatNumber(amount)}`;
}

// Only what changed, each as { key, label, from, to }, in the order the Tourism Office cares about: pax, length of stay, resort, the new fee, then the
// rest of the head count. `names` turns the two ids into the words a person reads: { itinerary(id), resort(id) }.
export function recordEditChanges(before, after, names) {
  const changes = [];
  const add = (key, label, from, to) => {
    if (from !== to) changes.push({ key, label, from: String(from), to: String(to) });
  };

  add("total_visitors", "Pax", before.total_visitors, after.total_visitors);
  if (before.itinerary_id !== after.itinerary_id) {
    add("itinerary_id", "Length of stay", names.itinerary(before.itinerary_id), names.itinerary(after.itinerary_id));
  }
  if (before.resort_id !== after.resort_id) {
    add("resort_id", "Resort", names.resort(before.resort_id), names.resort(after.resort_id));
  }
  const feeBefore = entranceFeeBreakdown(before.total_visitors, before.discounted_count).total;
  const feeAfter = entranceFeeBreakdown(after.total_visitors, after.discounted_count).total;
  add("fee", "Environmental Fee", peso(feeBefore), peso(feeAfter));
  for (const [key, label] of COUNT_LABELS) {
    add(key, label.charAt(0).toUpperCase() + label.slice(1), before[key], after[key]);
  }
  return changes;
}

// The server's refusal, whole, as lines a person can read. The server answers with one message for each field it refuses to change, and each of those
// carries the same list of what a record MAY change. Here the refused fields are named together on one line, and that list is written ONCE, at the end;
// any other message (the one about the discounted count, a refusal of the role) is kept as the server wrote it. Nothing is swapped for a general
// "something went wrong". The shape of the server's answer is not touched.
const REFUSED_FIELD = /^(.*?)\s*A record may only change: (.*)$/;

export function serverErrorLines(error) {
  const details = error && error.details;
  if (details && typeof details === "object") {
    if (details.detail) return [String(details.detail)];
    const lines = [];
    const refused = [];
    let allowed = "";
    for (const [field, messages] of Object.entries(details)) {
      const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
      const match = text.match(REFUSED_FIELD);
      if (match) {
        refused.push(field);
        allowed = allowed || match[2];
      } else {
        lines.push(`${field}: ${text}`);
      }
    }
    if (refused.length) {
      lines.push(`These fields cannot be changed here: ${refused.join(", ")}.`);
      lines.push(`A record may only change: ${allowed}`);
    }
    if (lines.length) return lines;
  }
  return [(error && error.message) || "The server did not accept the change, and sent no reason."];
}
