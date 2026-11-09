// The Resort Accounts page, without the screen: which resorts may be given a staff account, how the staff are grouped, and what is checked before a
// request is made. The server checks all of it again; this only saves a trip and says it in the words of the page.

// The names the app never shows as a destination (backend/api/views/mobile.py, MOBILE_EXCLUDED_DESTINATION_NAMES, and any "Kwebang"). The server refuses
// an account for them; a test reads that file and compares, so the two lists cannot drift apart.
export const EXCLUDED_DESTINATION_NAMES = [
  "",
  ".",
  "+",
  "0.0",
  "A",
  "Day tour",
  "No resort",
  "Private Property",
  "Residence",
  "Transient",
  "Others / Private Residence",
];

export const PASSWORD_MIN = 8;
export const USERNAME_PATTERN = /^[a-z0-9.-]{3,150}$/;

export const MESSAGES = {
  resort: "Choose a resort.",
  name: "Enter the staff name.",
  username: "Lowercase letters, numbers, dots and hyphens only, 3 to 150 characters.",
  password: "The password must be at least eight characters.",
  mismatch: "The two passwords do not match. Please type them again.",
};

// A destination that may be given staff: open to visitors and not one of the placeholders.
export function isOpenResort(resort) {
  if (!resort || !resort.is_active) return false;
  const name = String(resort.resort_name || "");
  return !EXCLUDED_DESTINATION_NAMES.includes(name) && !name.toLowerCase().includes("kwebang");
}

export function openResorts(resorts) {
  return (Array.isArray(resorts) ? resorts : []).filter(isOpenResort).sort((a, b) => a.resort_name.localeCompare(b.resort_name));
}

// The staff in groups, by resort, in the order of the resorts' names; inside a group, by name. A closed account stays in its group.
export function groupByResort(staff) {
  const groups = new Map();
  (Array.isArray(staff) ? staff : []).forEach((person) => {
    const key = person.resort ? person.resort.id : "none";
    if (!groups.has(key)) groups.set(key, { id: key, name: person.resort ? person.resort.name : "No resort", people: [] });
    groups.get(key).people.push(person);
  });
  const list = [...groups.values()];
  list.forEach((group) => group.people.sort((a, b) => String(a.name).localeCompare(String(b.name))));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function countStaff(staff) {
  const list = Array.isArray(staff) ? staff : [];
  const open = list.filter((person) => person.is_active).length;
  return { open, closed: list.length - open };
}

// The open resorts where nobody can scan: no staff at all, or staff who are all closed. One OPEN account is enough to leave this list.
export function resortsWithoutOpenStaff(resorts, staff) {
  const served = new Set((Array.isArray(staff) ? staff : []).filter((person) => person.is_active).map((person) => (person.resort ? person.resort.id : null)));
  return openResorts(resorts).filter((resort) => !served.has(resort.resort_id));
}

export function lastSeenText(person) {
  const never = `${person.username} · has not signed in yet`;
  if (!person.last_login) return never;
  const when = new Date(person.last_login);
  if (Number.isNaN(when.getTime())) return never;
  return `${person.username} · last signed in ${when.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}`;
}

// The first thing wrong with the form, as a sentence, or "" when it may be sent.
export function problemWith(form) {
  if (!String(form.resortId || "").trim()) return MESSAGES.resort;
  if (!form.name.trim()) return MESSAGES.name;
  if (!USERNAME_PATTERN.test(form.username.trim())) return MESSAGES.username;
  if (form.password.length < PASSWORD_MIN) return MESSAGES.password;
  if (form.password !== form.again) return MESSAGES.mismatch;
  return "";
}

export function payloadOf(form) {
  return { resort_id: Number(form.resortId), name: form.name.trim(), username: form.username.trim(), password: form.password };
}
