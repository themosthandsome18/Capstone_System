import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import Sidebar from "./components/layout/Sidebar";
import { pageInfo } from "./components/layout/AppShell";
import { tourismRoutes } from "./tourismRoutes";
import {
  DEFAULT_MOBILE_CONTENT_TAB,
  MOBILE_CONTENT_PATH,
  MOBILE_CONTENT_ROLES,
  MOBILE_CONTENT_TABS,
  canManageMobileContent,
  knownTab,
  tabPath,
} from "./mobileContentAccess";

jest.mock("../auth/AuthContext", () => ({
  useAuth: jest.fn(),
  getDefaultRouteForRole: (role) => (role === "admin" ? "/module-selection" : role === "sanitation" ? "/sanitation" : "/"),
}));
jest.mock("react-leaflet", () => ({}));
jest.mock("leaflet", () => ({ __esModule: true, default: { DivIcon: class {} }, DivIcon: class {} }));
jest.mock("react-chartjs-2", () => ({ Bar: () => null, Doughnut: () => null, Line: () => null, Pie: () => null }));

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used (the shared stub, and what the sidebar needs besides).
jest.mock("react-router-dom", () => ({
  ...require("./testing/routerStub"),
  NavLink: ({ to, children }) => <a href={to}>{children}</a>,
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: "/mobile-content" }),
  useNavigate: () => jest.fn(),
  useOutletContext: () => ({}),
  useParams: () => ({}),
}), { virtual: true });

describe("Mobile App Content access and tabs", () => {
  test("the address, and only the system admin", () => {
    expect(MOBILE_CONTENT_PATH).toBe("/mobile-content");
    expect(MOBILE_CONTENT_ROLES).toEqual(["admin"]);
    expect(canManageMobileContent("admin")).toBe(true);
    ["tourism", "sanitation", "tourist", "", undefined, null].forEach((role) => expect(canManageMobileContent(role)).toBe(false));
  });

  test("five tabs, in this order, and only the Hotlines is built", () => {
    expect(MOBILE_CONTENT_TABS.map((tab) => [tab.key, tab.label, tab.ready])).toEqual([
      ["welcome", "Welcome", false],
      ["why-visit", "Why Visit", false],
      ["travel-guide", "Travel Guide & Tips", false],
      ["port-guide", "Port & Boat Guide", false],
      ["hotlines", "Emergency Hotlines", true],
    ]);
  });

  test("the tab that opens by itself is the Hotlines, and it is a tab that is built", () => {
    expect(DEFAULT_MOBILE_CONTENT_TAB).toBe("hotlines");
    expect(MOBILE_CONTENT_TABS.find((tab) => tab.key === DEFAULT_MOBILE_CONTENT_TAB).ready).toBe(true);
  });

  test("a tab is known only by its exact key", () => {
    MOBILE_CONTENT_TABS.forEach((tab) => expect(knownTab(tab.key)).toBe(tab.key));
    ["", "Hotlines", "HOTLINES", "hotline", "welcome ", " welcome", "nope", null, undefined].forEach((value) => expect(knownTab(value)).toBeNull());
    expect(tabPath("hotlines")).toBe("/mobile-content?tab=hotlines");
  });

  test("the page is in the route list, admin-only", () => {
    const route = tourismRoutes.find((item) => item.path === MOBILE_CONTENT_PATH);
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin"]);
    expect(route.element).toBeTruthy();
    expect(tourismRoutes.filter((item) => item.path === MOBILE_CONTENT_PATH)).toHaveLength(1);
  });

  test("the route guard sends a tourism user away, and lets the admin through", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "tourism" });
    const first = render(<ProtectedRoute allowedRoles={MOBILE_CONTENT_ROLES} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    first.unmount();
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "admin" });
    render(<ProtectedRoute allowedRoles={MOBILE_CONTENT_ROLES} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  test("the sidebar has exactly ONE item for all of this, under Administration, and it is not the old one", () => {
    useAuth.mockReturnValue({ role: "admin" });
    render(<Sidebar />);
    const links = screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links.filter(([, href]) => href === "/mobile-content")).toEqual([["Mobile App Content", "/mobile-content"]]);
    expect(links.filter(([text]) => /hotlines/i.test(text))).toEqual([]);
    expect(links.filter(([, href]) => /hotlines/.test(href))).toEqual([]);
    expect(links.map(([text]) => text).slice(-3)).toEqual(["Settings", "Registration Options", "Mobile App Content"]); // where Hotlines used to be
  });

  test("the top bar has a title for the new address and for the old one", () => {
    expect(pageInfo["/mobile-content"].title).toBe("Mobile App Content");
    expect(pageInfo["/hotlines"].title).toBe("Mobile App Content");
  });
});
