// Who may open the Emergency Hotlines page. One rule, used by the route guard,
// the sidebar and the page itself. Only the system admin (ROLE_ADMIN in
// backend/api/models.py); the server refuses everyone else, so the UI must not
// offer it to them.
export const HOTLINES_PATH = "/hotlines";
export const HOTLINES_ROLES = ["admin"];

export function canManageHotlines(role) {
  return HOTLINES_ROLES.includes(role);
}
