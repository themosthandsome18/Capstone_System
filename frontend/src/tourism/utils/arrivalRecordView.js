// What the modal of one arrival says, from the record the server sent (GET /api/tourist-records/<id>/) and the web's referenceTables.
//
// Nothing is worked out here. Overnight, Same Day, the sex split and the fee all come from `record.computed`; the foreign keys come back as ids,
// and only their names are looked up. Anything that is blank, null, missing or not a number is written as the dash, never as "undefined",
// "null" or "NaN".
import { formatCurrency } from "./format";

export const DASH = "—";

const STATUS_WORDS = { arrived: "Arrived", pending: "Pending", no_show: "No-show" };

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// A text as it is written: blank or missing is the dash.
export function show(value) {
  if (value === null || value === undefined) return DASH;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : DASH;
  const text = String(value).trim();
  return text || DASH;
}

// "6 visitors", "1 visitor"; the dash when it is not a number.
export function counted(value, singular, plural = `${singular}s`) {
  if (!finite(value)) return DASH;
  return `${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`;
}

// "2 male · 4 female"; a side that is not a number is the dash, and both missing is just the dash.
export function malesAndFemales(male, female) {
  if (!finite(male) && !finite(female)) return DASH;
  return `${finite(male) ? male : DASH} male · ${finite(female) ? female : DASH} female`;
}

export function pesos(value) {
  return finite(value) ? formatCurrency(value) : DASH;
}

// "4 × ₱80 = ₱320": every number is the server's (count, rate and what the line comes to).
export function feeLine(count, rate, total) {
  if (![count, rate, total].every(finite)) return DASH;
  return `${count.toLocaleString("en-US")} × ${formatCurrency(rate)} = ${formatCurrency(total)}`;
}

// The name of the row of a table whose id is `id` (the id may arrive as a number or a text); the dash when there is none.
export function nameOf(table, id, idKey = "id", nameKey = "name") {
  if (id === null || id === undefined || id === "") return DASH;
  const found = (Array.isArray(table) ? table : []).find((item) => item && String(item[idKey]) === String(id));
  return show(found ? found[nameKey] : null);
}

export function statusLabel(status) {
  const text = show(status);
  if (text === DASH) return DASH;
  return STATUS_WORDS[text] || text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

// "Apr 2, 2026" from "2026-04-02".
export function dayText(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return DASH;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

// "Apr 2, 2026, 10:30 AM" from a time stamp.
export function whenText(value) {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const item = (label, text, sub) => (sub ? { label, text, sub } : { label, text });

// How many of the group are Maubanin: a PART of the Filipino count (never added to anything, never more than it); the dash when the record
// does not say, and a real 0 stays 0.
export function maubaninText(maubanin, filipino) {
  if (!finite(maubanin)) return DASH;
  const part = finite(filipino) ? Math.min(Math.max(maubanin, 0), filipino) : Math.max(maubanin, 0);
  return part.toLocaleString("en-US");
}
const unit = (label, value, singular, plural) => ({ label, number: finite(value) ? value.toLocaleString("en-US") : null, unit: value === 1 ? singular : plural });

export function buildArrivalRecordView(record, referenceTables = {}) {
  const r = record || {};
  const computed = r.computed || {};
  const overnight = computed.overnight || {};
  const sameDay = computed.sameDay || {};
  const fee = computed.fee || {};
  const tables = referenceTables || {};

  const resort = (Array.isArray(tables.resorts) ? tables.resorts : []).find((x) => x && String(x.resort_id) === String(r.resort_id));
  const stay = nameOf(tables.itineraries, r.itinerary_id);
  const status = statusLabel(r.status);
  const title = show(r.full_name) !== DASH ? show(r.full_name) : show(r.survey_id);

  return {
    title,
    resortId: resort ? resort.resort_id : null,
    chips: {
      status,
      isArrived: r.status === "arrived",
      stay,
      visitors: counted(r.total_visitors, "visitor"),
    },
    subline: `${show(resort ? resort.resort_name : null)} · ${status === DASH ? DASH : status.toLowerCase()} ${dayText(r.arrival_date)}`,
    groups: [
      {
        title: "What the records say",
        items: [
          unit("Overnight", overnight.total, "person-night", "person-nights"),
          unit("Same day", sameDay.total, "person-day", "person-days"),
          item("In the group", counted(r.total_visitors, "visitor"), { label: "Maubanin", text: maubaninText(r.maubanin_count, r.filipino_count) }),
          item("Fee paid", pesos(fee.total)),
        ],
      },
      {
        title: "Male and female",
        items: [
          item("In the group", malesAndFemales(r.total_male, r.total_female)),
          item("Overnight", malesAndFemales(overnight.male, overnight.female)),
          item("Same day", malesAndFemales(sameDay.male, sameDay.female)),
        ],
      },
      {
        title: "Tourist info",
        items: [
          item("First name", show(r.first_name)),
          item("Last name", show(r.last_name)),
          item("Email", show(r.email)),
          item("Contact number", show(r.contact_number)),
          item("Country", nameOf(tables.countries, r.country_id)),
        ],
      },
      {
        title: "Where they went",
        items: [
          item("Resort", show(resort ? resort.resort_name : null)),
          item("Location", show(resort ? resort.location : null)),
          item("Region", nameOf(tables.regions, r.region_id)),
          item("Province", nameOf(tables.provinces, r.province_id)),
          item("Access", show(resort ? resort.access : null)),
          item("Length of stay", stay),
        ],
      },
      {
        title: "Travel details",
        items: [
          item("Travel mode", nameOf(tables.travelModes, r.travel_mode_id)),
          item("Boat type", nameOf(tables.boatTypes, r.boat_type_id)),
          item("Visit purpose", nameOf(tables.visitPurposes, r.visit_purpose_id)),
          item("Arrival date", dayText(r.arrival_date)),
          item("Arrival status", status),
        ],
      },
      {
        title: "Entrance fee",
        items: [
          item("Total paid", pesos(fee.total)),
          item("Regular", feeLine(fee.regularCount, fee.regularRate, fee.regularTotal)),
          item("Discounted", feeLine(fee.discountedCount, fee.discountedRate, fee.discountedTotal)),
        ],
        note: "Worked out at report time from the current rates. It is not stored on the record.",
      },
      {
        title: "Registration",
        items: [
          // the time the tourist registered; a record made at the desk has none, and its created_at stands in for it
          item("Registered on", whenText(r.submitted_at) !== DASH ? whenText(r.submitted_at) : whenText(r.created_at)),
          item("Survey ID", show(r.survey_id)),
        ],
      },
    ],
  };
}
