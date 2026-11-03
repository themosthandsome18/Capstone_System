// Who may open the tourism Settings page. One rule, used by the route guard,
// the sidebar and the page itself. The Tourism Office and the system admin
// (administrationAccess.js) may write the theme; the server refuses everyone
// else, so the UI must not offer it to them.
import { ADMINISTRATION_ROLES } from "./administrationAccess";

export const SETTINGS_PATH = "/settings";
export const SETTINGS_ROLES = ADMINISTRATION_ROLES;

export function canOpenSettings(role) {
  return SETTINGS_ROLES.includes(role);
}
