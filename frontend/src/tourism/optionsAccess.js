// Who may open the Registration Options page. One rule, used by the route
// guard, the sidebar and the page itself. Only the system admin (ROLE_ADMIN
// in backend/api/models.py): these choices decide what the reports count, and
// the server refuses everyone else, so the UI must not offer it to them.
export const OPTIONS_PATH = "/options";
export const OPTIONS_ROLES = ["admin"];

export function canManageOptions(role) {
  return OPTIONS_ROLES.includes(role);
}
