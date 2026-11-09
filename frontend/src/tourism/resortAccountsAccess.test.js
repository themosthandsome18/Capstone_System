// Who may open Resort Accounts: the same people as Mobile App Content, by the same rule, and nobody else. The sidebar, the route and the rule agree.
import { render, screen } from "@testing-library/react";
import Sidebar from "./components/layout/Sidebar";
import { useAuth } from "../auth/AuthContext";
import { ADMINISTRATION_ROLES } from "./administrationAccess";
import { MOBILE_CONTENT_ROLES } from "./mobileContentAccess";
import { RESORT_ACCOUNTS_PATH, RESORT_ACCOUNTS_ROLES, canManageResortAccounts } from "./resortAccountsAccess";
import fs from "fs";
import path from "path";

jest.mock(
  "react-router-dom",
  () => ({
    Navigate: () => null,
    NavLink: ({ to, className, children }) => (
      <a href={to} className={typeof className === "function" ? className({ isActive: false }) : className}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);
jest.mock("../auth/AuthContext", () => ({ useAuth: jest.fn() }));

describe("who may open Resort Accounts", () => {
  it.each(["admin", "tourism"])("%s may", (role) => {
    expect(canManageResortAccounts(role)).toBe(true);
  });

  it.each(["sanitation", "resort", "tourist", "establishment", "auditor", "", undefined, null, "Admin"])("%p may not", (role) => {
    expect(canManageResortAccounts(role)).toBe(false);
  });

  it("is the same group as Mobile App Content", () => {
    expect(RESORT_ACCOUNTS_ROLES).toBe(ADMINISTRATION_ROLES);
    expect(RESORT_ACCOUNTS_ROLES).toEqual(MOBILE_CONTENT_ROLES);
  });

  it("the route is guarded by those roles", () => {
    // (the routes file pulls in the map library, which Jest cannot load: it is read, as the other access tests do)
    const routes = fs.readFileSync(path.join(__dirname, "tourismRoutes.js"), "utf8");
    expect(routes).toMatch(/path: RESORT_ACCOUNTS_PATH,\s+allowedRoles: RESORT_ACCOUNTS_ROLES,/);
    expect(RESORT_ACCOUNTS_PATH).toBe("/resort-accounts");
  });
});

describe("the item in the Administration menu", () => {
  const names = () => [...document.querySelectorAll(".sidebar-nav-link")].map((link) => link.textContent);

  it.each(["admin", "tourism"])("is shown to %s, right after Mobile App Content", (role) => {
    useAuth.mockReturnValue({ role });
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Resort Accounts" });
    expect(link.getAttribute("href")).toBe("/resort-accounts");
    const list = names();
    expect(list.indexOf("Resort Accounts")).toBe(list.indexOf("Mobile App Content") + 1);
    expect(list.indexOf("Mobile App Content")).toBeGreaterThan(-1);
  });

  it.each(["sanitation", "resort", "tourist", "establishment", ""])("is not shown to %p", (role) => {
    useAuth.mockReturnValue({ role });
    render(<Sidebar />);
    expect(screen.queryByRole("link", { name: "Resort Accounts" })).toBeNull();
  });
});
