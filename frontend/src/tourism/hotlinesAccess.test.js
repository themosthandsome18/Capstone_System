import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import Sidebar from "./components/layout/Sidebar";
import { pageInfo } from "./components/layout/AppShell";
import { tourismRoutes } from "./tourismRoutes";
import { HOTLINES_PATH, HOTLINES_ROLES, canManageHotlines } from "./hotlinesAccess";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({
    Navigate: ({ to }) => <div data-testid="redirect" data-to={to} />,
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

describe("Emergency Hotlines access", () => {
  test("only the system admin may manage the hotlines", () => {
    expect(HOTLINES_PATH).toBe("/hotlines");
    expect(HOTLINES_ROLES).toEqual(["admin"]);
    expect(canManageHotlines("admin")).toBe(true);
    ["tourism", "sanitation", "tourist", "", undefined].forEach((role) => expect(canManageHotlines(role)).toBe(false));
  });

  test("the page is in the route list, declared admin-only", () => {
    const route = tourismRoutes.find((item) => item.path === HOTLINES_PATH);
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin"]);
    expect(route.element).toBeTruthy();
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

  test("the admin sees the link under Administration", () => {
    useAuth.mockReturnValue({ role: "admin" });
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Emergency Hotlines" });
    expect(link.getAttribute("href")).toBe("/hotlines");
    expect(screen.getByText("Administration")).toBeTruthy();
  });

  test("the top bar knows the page: without an entry it would say Dashboard Overview", () => {
    expect(pageInfo[HOTLINES_PATH]).toBeDefined();
    expect(pageInfo[HOTLINES_PATH].title).toBe("Emergency Hotlines");
    // and so does every other route of the module
    tourismRoutes
      .filter((route) => route.path && route.path !== "*")
      .forEach((route) => expect(pageInfo[route.path]).toBeDefined());
  });

  test("a tourism user does not see the link", () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<Sidebar />);
    expect(screen.queryByRole("link", { name: "Emergency Hotlines" })).toBeNull();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });
});
