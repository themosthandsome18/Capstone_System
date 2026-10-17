import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import Sidebar from "./components/layout/Sidebar";
import { tourismRoutes } from "./tourismRoutes";
import { OPTIONS_PATH, OPTIONS_ROLES, canManageOptions } from "./optionsAccess";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({
    Navigate: ({ to }) => <div data-testid="redirect" data-to={to} />,
    Outlet: () => <div data-testid="outlet" />,
    NavLink: ({ to, children }) => <a href={to}>{children}</a>,
    useLocation: () => ({ pathname: "/options" }),
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

describe("Registration Options access", () => {
  test("only the system admin may manage the options", () => {
    expect(OPTIONS_PATH).toBe("/options");
    expect(OPTIONS_ROLES).toEqual(["admin"]);
    expect(canManageOptions("admin")).toBe(true);
    ["tourism", "sanitation", "", undefined].forEach((role) => expect(canManageOptions(role)).toBe(false));
  });

  test("the page is in the route list, declared admin-only", () => {
    const route = tourismRoutes.find((item) => item.path === OPTIONS_PATH);
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin"]);
    expect(route.element).toBeTruthy();
  });

  test("the route guard sends a tourism user away from the page", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "tourism" });
    render(<ProtectedRoute allowedRoles={OPTIONS_ROLES} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  test("the route guard lets the admin through", () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "admin" });
    render(<ProtectedRoute allowedRoles={OPTIONS_ROLES} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  test("the admin sees the link under Administration, next to Settings", () => {
    useAuth.mockReturnValue({ role: "admin" });
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Registration Options" });
    expect(link.getAttribute("href")).toBe("/options");
    expect(screen.getByText("Administration")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  test("a tourism user sees neither the link nor the Administration heading", () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<Sidebar />);
    expect(screen.queryByRole("link", { name: "Registration Options" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Administration")).toBeNull();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy(); // the rest of the menu is there
  });
});
