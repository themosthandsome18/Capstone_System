// The Mobile App Content page: its address, who may open it, and its tabs. One rule, used by the route guard, the
// sidebar and the page itself. Only the system admin (ROLE_ADMIN in backend/api/models.py): the server refuses
// everyone else (admin_required on the content endpoints and on the emergency contacts), so the UI must not
// offer it to them.
export const MOBILE_CONTENT_PATH = "/mobile-content";
export const MOBILE_CONTENT_ROLES = ["admin"];

export function canManageMobileContent(role) {
  return MOBILE_CONTENT_ROLES.includes(role);
}

// The five tabs, in order. `ready` is false for a tab whose editor has not been built yet: it shows a message and
// asks the server for nothing.
export const MOBILE_CONTENT_TABS = [
  { key: "welcome", label: "Welcome", ready: true },
  { key: "why-visit", label: "Why Visit", ready: true },
  { key: "travel-guide", label: "Travel Guide & Tips", ready: false },
  { key: "port-guide", label: "Port & Boat Guide", ready: false },
  { key: "hotlines", label: "Emergency Hotlines", ready: true },
];

// The tab that opens when the address names none. It is the only one that works, so it is the one the admin lands
// on; when the first real tab is built, this moves to "welcome" (a decision of the owner).
export const DEFAULT_MOBILE_CONTENT_TAB = "hotlines";

export const tabPath = (key) => `${MOBILE_CONTENT_PATH}?tab=${key}`;

// The tab named by ?tab=..., or null when the value is not one of the five.
export function knownTab(value) {
  return MOBILE_CONTENT_TABS.some((tab) => tab.key === value) ? value : null;
}
