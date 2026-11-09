// Which roles can reach a page of the admin, and the one rule that follows from it: an account whose role reaches NO page is not let in.
//
// The groups below are the ones App.js hands to its ProtectedRoutes (the module selection, the tourism module, the sanitation module), so the rule and
// the routes cannot say different things. It is a rule, not a list of names to refuse: a role that is in no group (resort staff, the tourist, the
// establishment owner, and any role that is added later) reaches nothing, and is refused at the door; a role added to a group is let in with no change here.
export const MODULE_SELECTION_ROLES = ["admin"];
export const TOURISM_ROLES = ["admin", "tourism"];
export const SANITATION_ROLES = ["admin", "sanitation"];

const REACHABLE_GROUPS = [MODULE_SELECTION_ROLES, TOURISM_ROLES, SANITATION_ROLES];

export function canReachAnyPage(role) {
  return typeof role === "string" && role !== "" && REACHABLE_GROUPS.some((group) => group.includes(role));
}

// What a refused account is told. It names no role, no app and no screen.
export const MOBILE_ONLY_MESSAGE = "This account is for the mobile app only.";

export class AccountRefusedError extends Error {
  constructor() {
    super(MOBILE_ONLY_MESSAGE);
    this.name = "AccountRefusedError";
    this.code = "account_refused";
  }
}
