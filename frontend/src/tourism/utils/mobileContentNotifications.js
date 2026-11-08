// The Notifications tab of the Mobile App Content page: what is sent, how long it lasts, and which advisories are "in the app" and which are not.
// Pure functions, so that the tab and its tests share one definition. The server is the authority (notifications/public/); this only mirrors what it
// accepts and how it reads an advisory.

// The model allows 200 characters in a title and has no limit for a message; the tab asks for less: a title that fits a line of the app, a message of a
// few lines. The smaller of the model's and the tab's.
export const TITLE_MAX = 120;
export const MESSAGE_MAX = 400;

export const MODULE = "tourism"; // this tab writes and shows tourism advisories only
export const AUDIENCE = "public";

// The three weights the server knows (severity: info, warning, critical). Their COLOURS are not here: they are status colours (--th-info, --th-warning,
// --th-danger), set in the CSS from the data-severity of the element, so that nothing in the script writes a colour.
export const SEVERITIES = [
  { value: "info", label: "Impormasyon" },
  { value: "warning", label: "Babala" },
  { value: "critical", label: "Mahalaga" },
];
export const DEFAULT_SEVERITY = "info";
export const severityOf = (value) => SEVERITIES.find((item) => item.value === value) || SEVERITIES[0];

// How long it stays: the three quick buttons. `days: null` = no end.
export const DURATIONS = [
  { key: "3-days", label: "3 araw", days: 3 },
  { key: "1-week", label: "1 linggo", days: 7 },
  { key: "no-end", label: "Walang hangga", days: null },
];

const pad = (number) => String(number).padStart(2, "0");

// "YYYY-MM-DD" of a date in the person's own calendar (not UTC).
export function dateText(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The day `days` after today, as "YYYY-MM-DD".
export function dateInDays(now, days) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return dateText(day);
}

// The last moment of a day ("YYYY-MM-DD") in the person's calendar, as the ISO text the server reads; null for no day.
export function endOfDayIso(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || "");
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59).toISOString();
}

export const isToday = (dateString, now) => dateString === dateText(now);
export const isPast = (dateString, now) => Boolean(dateString) && dateString < dateText(now);

// What is wrong with a draft, as a sentence for the person; null when it can be sent. Asked when they press the button, not before.
export function problemWith(draft, now) {
  if (!draft.title.trim()) return "Isulat muna ang pamagat ng abiso.";
  if (!draft.message.trim()) return "Isulat muna ang mensahe ng abiso.";
  if (draft.until && isPast(draft.until, now)) return "Ang petsa ng hangganan ay lumipas na. Pumili ng petsa mula ngayon.";
  return null;
}

// The body of the POST.
export function payloadOf(draft) {
  const payload = {
    title: draft.title.trim(),
    message: draft.message.trim(),
    severity: draft.severity,
    module: MODULE,
    audience_type: AUDIENCE,
  };
  const expires = endOfDayIso(draft.until);
  if (expires) payload.expires_at = expires;
  return payload;
}

const expiresAt = (advisory) => (advisory.expires_at ? new Date(advisory.expires_at) : null);

export const hasExpired = (advisory, now) => {
  const end = expiresAt(advisory);
  return end !== null && end.getTime() < now.getTime();
};

// In the app right now: switched on, and its end (if it has one) not passed. The same rule as the bootstrap's.
export const isInTheApp = (advisory, now) => advisory.is_active === true && !hasExpired(advisory, now);

// Whole days left, counting today (the last day still says 1); null when there is no end.
export function daysLeft(advisory, now) {
  const end = expiresAt(advisory);
  if (end === null) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

export function daysLeftText(advisory, now) {
  const days = daysLeft(advisory, now);
  if (days === null) return "Walang hangga";
  if (days <= 1) return "Hanggang ngayong araw";
  return `${days} araw pa`;
}

const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id;

// The advisories of THIS tab (tourism only, whoever is logged in: the admin is sent the others too and they are not shown here), split in two.
export function sortAdvisories(results, now) {
  const own = (Array.isArray(results) ? results : []).filter((advisory) => advisory && advisory.module === MODULE);
  return {
    inTheApp: own.filter((advisory) => isInTheApp(advisory, now)).sort(newestFirst),
    hidden: own.filter((advisory) => !isInTheApp(advisory, now)).sort(newestFirst),
  };
}

export function sentOn(advisory) {
  const date = new Date(advisory.created_at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function endedOn(advisory) {
  const end = expiresAt(advisory);
  if (end === null || Number.isNaN(end.getTime())) return "";
  return end.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}
