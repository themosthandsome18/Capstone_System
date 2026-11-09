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
  test("the Tourism Office and the system admin may open Settings, nobody else", () => {
    expect(SETTINGS_ROLES).toEqual(["admin", "tourism"]);
    expect(canOpenSettings("admin")).toBe(true);
    expect(canOpenSettings("tourism")).toBe(true);
    ["tourist", "sanitation", "establishment", "auditor", "", undefined, null].forEach((role) => expect(canOpenSettings(role)).toBe(false));
  });

  test("the Settings route is declared for the Tourism Office and the system admin", () => {
    const route = tourismRoutes.find((item) => item.path === SETTINGS_PATH);
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin", "tourism"]);
  });

  test.each(["tourist", "sanitation", "establishment", "auditor"])("the route guard sends the %s role away from Settings", (role) => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role });
    render(<ProtectedRoute allowedRoles={SETTINGS_ROLES} />);
    if (role === "sanitation") {
      expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/sanitation"); // it goes to its own home
    } else {
      expect(screen.queryByTestId("redirect")).toBeNull(); // a role that reaches no page is refused where it stands (not sent to "/", which it cannot reach)
      expect(screen.getByRole("alert").textContent).toContain("for the mobile app only");
    }
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  test.each(["admin", "tourism"])("the route guard lets the %s role through", (role) => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role });
    render(<ProtectedRoute allowedRoles={SETTINGS_ROLES} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });
});
