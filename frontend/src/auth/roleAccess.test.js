// The rule of the door of the admin: an account whose role reaches no page is not let in. It is a rule over the groups the routes use, not a list of names.
import fs from "fs";
import path from "path";
import {
  AccountRefusedError,
  MODULE_SELECTION_ROLES,
  MOBILE_ONLY_MESSAGE,
  SANITATION_ROLES,
  TOURISM_ROLES,
  canReachAnyPage,
} from "./roleAccess";

const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
const ROLE_WORDS = ["resort", "tourist", "establishment", "admin", "tourism", "sanitation", "sanitary", "staff"];

describe("which roles reach a page", () => {
  it.each(["admin", "tourism", "sanitation"])("%s reaches a page", (role) => {
    expect(canReachAnyPage(role)).toBe(true);
  });

  it.each([["resort"], ["tourist"], ["establishment"], ["some-role-nobody-has-made-yet"], [""], [undefined], [null], [42], [{}], ["Admin"], ["ADMIN"], [" admin"]])(
    "%p reaches nothing",
    (role) => {
      expect(canReachAnyPage(role)).toBe(false);
    }
  );

  it("the groups are the ones the routes of App.js use, written once", () => {
    expect(MODULE_SELECTION_ROLES).toEqual(["admin"]);
    expect(TOURISM_ROLES).toEqual(["admin", "tourism"]);
    expect(SANITATION_ROLES).toEqual(["admin", "sanitation"]);
    expect(APP).toContain("allowedRoles={MODULE_SELECTION_ROLES}");
    expect(APP).toContain("allowedRoles={TOURISM_ROLES}");
    expect(APP).toContain("allowedRoles={SANITATION_ROLES}");
    expect(APP).not.toMatch(/allowedRoles=\{\[/); // (no list of names written beside the groups)
  });

  it("it is a rule over the groups: a role put in one of them is let in, with nothing else changed", () => {
    TOURISM_ROLES.push("new-role");
    try {
      expect(canReachAnyPage("new-role")).toBe(true);
    } finally {
      TOURISM_ROLES.pop();
    }
    expect(canReachAnyPage("new-role")).toBe(false);
  });
});

describe("what a refused account is told", () => {
  it("is the one sentence, and names no role, no app and no screen", () => {
    expect(MOBILE_ONLY_MESSAGE).toBe("This account is for the mobile app only.");
    const lower = MOBILE_ONLY_MESSAGE.toLowerCase();
    ROLE_WORDS.forEach((word) => expect(lower).not.toContain(word));
    ["scanner", "check-in", "qr", "mauban", "tourism app", "unlock"].forEach((word) => expect(lower).not.toContain(word));
  });

  it("the refusal is an error with that message and a code", () => {
    const error = new AccountRefusedError();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(MOBILE_ONLY_MESSAGE);
    expect(error.code).toBe("account_refused");
  });
});
