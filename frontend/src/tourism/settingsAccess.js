// Who may open the tourism Settings page. One rule, used by the route guard,
// the sidebar and the page itself. Only the system admin (ROLE_ADMIN in
// backend/api/models.py) may write the theme; the server refuses everyone
// else, so the UI must not offer it to them.
export const SETTINGS_PATH = "/settings";
export const SETTINGS_ROLES = ["admin"];

export function canOpenSettings(role) {
  return SETTINGS_ROLES.includes(role);
}
