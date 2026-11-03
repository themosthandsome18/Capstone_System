// Who may open the Registration Options page. One rule, used by the route
// guard, the sidebar and the page itself. The Tourism Office and the system
// admin (administrationAccess.js): the Tourism Office keeps these choices in real life, and
// the server refuses everyone else, so the UI must not offer it to them.
import { ADMINISTRATION_ROLES } from "./administrationAccess";

export const OPTIONS_PATH = "/options";
export const OPTIONS_ROLES = ADMINISTRATION_ROLES;

export function canManageOptions(role) {
  return OPTIONS_ROLES.includes(role);
}
