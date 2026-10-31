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
  { key: "travel-guide", label: "Travel Guide & Tips", ready: true },
  { key: "port-guide", label: "Port & Boat Guide", ready: true },
  { key: "hotlines", label: "Emergency Hotlines", ready: true },
];

// The tab that opens when the address names none: the Welcome, the first of the five (a decision of the owner, 5f). Nothing that has
// to open the Hotlines relies on this: the old address /hotlines is sent to ?tab=hotlines (tabPath("hotlines")), tab named.
export const DEFAULT_MOBILE_CONTENT_TAB = "welcome";

export const tabPath = (key) => `${MOBILE_CONTENT_PATH}?tab=${key}`;

// The tab named by ?tab=..., or null when the value is not one of the five.
export function knownTab(value) {
  return MOBILE_CONTENT_TABS.some((tab) => tab.key === value) ? value : null;
}

// The page of ONE tile (a pillar of Why Visit, a card of the Travel Guide): /mobile-content/tile?id=12 to edit it, /mobile-content/tile?section=why_visit
// to add one. The address names the tile or the section, never the tab: the tab to go back to is the tab of the section of the tile, so that it is
// right after a refresh and when the page is opened from a link. Admin only, like the page of the tabs.
export const TILE_PATH = "/mobile-content/tile";
export const SECTION_TABS = { why_visit: "why-visit", travel_guide: "travel-guide" };
export const tileEditPath = (id) => `${TILE_PATH}?id=${id}`;
export const tileNewPath = (section) => `${TILE_PATH}?section=${section}`;
export const sectionTabPath = (section) => tabPath(SECTION_TABS[section] || DEFAULT_MOBILE_CONTENT_TAB);
