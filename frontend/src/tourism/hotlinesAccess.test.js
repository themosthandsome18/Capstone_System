import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import Sidebar from "./components/layout/Sidebar";
import { pageInfo } from "./components/layout/AppShell";
import { tourismRoutes } from "./tourismRoutes";
import { HOTLINES_PATH, HOTLINES_ROLES } from "./hotlinesAccess";
import { MOBILE_CONTENT_PATH, MOBILE_CONTENT_ROLES } from "./mobileContentAccess";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({
    Navigate: ({ to, replace }) => <div data-testid="redirect" data-to={to} data-replace={String(Boolean(replace))} />,
    Outlet: () => <div data-testid="outlet" />,
    NavLink: ({ to, children }) => <a href={to}>{children}</a>,
    useLocation: () => ({ pathname: "/hotlines" }),
    useNavigate: () => jest.fn(),
    useOutletContext: () => ({}),
    useParams: () => ({}),
  }),
  { virtual: true }
);
jest.mock("../auth/AuthContext", () => ({
  useAuth: jest.fn(),
  getDefaultRouteForRole: (role) => (role === "admin" ? "/module-selection" : role === "sanitation" ? "/sanitation" : "/"),
}));
jest.mock("react-leaflet", () => ({}));
jest.mock("leaflet", () => ({ __esModule: true, default: { DivIcon: class {} }, DivIcon: class {} }));
jest.mock("react-chartjs-2", () => ({ Bar: () => null, Doughnut: () => null, Line: () => null, Pie: () => null }));

describe("Emergency Hotlines access (the old address, now a redirect to a tab of Mobile App Content)", () => {
  test("the old address keeps the admin-only rule", () => {
    expect(HOTLINES_PATH).toBe("/hotlines");
    expect(HOTLINES_ROLES).toEqual(["admin"]);
    expect(HOTLINES_ROLES).toEqual(MOBILE_CONTENT_ROLES);
  });

  test("the old address is still in the route list, declared admin-only, and it redirects in place to its tab", () => {
    const route = tourismRoutes.find((item) => item.path === HOTLINES_PATH);
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin"]);
    expect(route.element).toBeTruthy();
    render(route.element);
    const redirect = screen.getByTestId("redirect");
    expect(redirect.getAttribute("data-to")).toBe("/mobile-content?tab=hotlines");
    expect(redirect.getAttribute("data-replace")).toBe("true");
  });

  test("the route guard sends a tourism user away from the page", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "tourism" });
    render(<ProtectedRoute allowedRoles={HOTLINES_ROLES} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  test("the route guard lets the admin through", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "admin" });
    render(<ProtectedRoute allowedRoles={HOTLINES_ROLES} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  test("the admin sees ONE link under Administration, to Mobile App Content, and no Emergency Hotlines link", () => {
    useAuth.mockReturnValue({ role: "admin" });
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Mobile App Content" });
    expect(link.getAttribute("href")).toBe(MOBILE_CONTENT_PATH);
    expect(screen.getByText("Administration")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Emergency Hotlines" })).toBeNull();
    expect(screen.queryAllByRole("link").filter((item) => /hotlines/i.test(item.getAttribute("href")))).toHaveLength(0);
  });

  test("the top bar knows the page: without an entry it would say Dashboard Overview", () => {
    expect(pageInfo[MOBILE_CONTENT_PATH]).toBeDefined();
    expect(pageInfo[MOBILE_CONTENT_PATH].title).toBe("Mobile App Content");
    expect(pageInfo[HOTLINES_PATH].title).toBe("Mobile App Content"); // the old address, while it redirects
    // and so does every other route of the module
    tourismRoutes
      .filter((route) => route.path && route.path !== "*")
      .forEach((route) => expect(pageInfo[route.path]).toBeDefined());
  });

  test("a tourism user does not see the link", () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<Sidebar />);
    expect(screen.queryByRole("link", { name: "Mobile App Content" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Emergency Hotlines" })).toBeNull();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });
});
