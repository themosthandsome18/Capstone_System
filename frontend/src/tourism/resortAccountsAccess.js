// The Resort Accounts page: its address and who may open it. One rule, used by the route guard, the sidebar and the page itself, the same as
// mobileContentAccess.js: the Tourism Office and the system admin (administrationAccess.js). The server refuses everyone else (/resort-staff/ is
// admin_required), so the UI must not offer it to them.
import { ADMINISTRATION_ROLES } from "./administrationAccess";

export const RESORT_ACCOUNTS_PATH = "/resort-accounts";
export const RESORT_ACCOUNTS_ROLES = ADMINISTRATION_ROLES;

export function canManageResortAccounts(role) {
  return RESORT_ACCOUNTS_ROLES.includes(role);
}
