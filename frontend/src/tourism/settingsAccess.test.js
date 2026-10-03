import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { tourismRoutes } from "./tourismRoutes";
import { SETTINGS_PATH, SETTINGS_ROLES, canOpenSettings } from "./settingsAccess";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({
    Navigate: ({ to }) => <div data-testid="redirect" data-to={to} />,
    Outlet: () => <div data-testid="outlet" />,
    NavLink: ({ to, children }) => <a href={to}>{children}</a>,
    useLocation: () => ({ pathname: "/settings" }),
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

describe("Settings access", () => {
  test("only the system admin may open Settings", () => {
    expect(SETTINGS_ROLES).toEqual(["admin"]);
    expect(canOpenSettings("admin")).toBe(true);
    ["tourism", "sanitation", "", undefined].forEach((role) => expect(canOpenSettings(role)).toBe(false));
  });

  test("the Settings route is declared admin-only", () => {
    const route = tourismRoutes.find((item) => item.path === SETTINGS_PATH);
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin"]);
  });

  test("the route guard sends a tourism user away from Settings", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "tourism" });
    render(<ProtectedRoute allowedRoles={SETTINGS_ROLES} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  test("the route guard lets the admin through", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "admin" });
    render(<ProtectedRoute allowedRoles={SETTINGS_ROLES} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });
});
