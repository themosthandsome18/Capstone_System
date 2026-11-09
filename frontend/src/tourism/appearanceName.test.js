/**
 * The tourism page that was called Settings is called Appearance (it is only about the colour). Only the name changed: the address is
 * still /settings and the same roles open it. Sanitation has no such page and is not touched.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import Sidebar from "./components/layout/Sidebar";
import { pageInfo } from "./components/layout/AppShell";
import useDocumentBranding from "../shared/useDocumentBranding";
import { tourismRoutes } from "./tourismRoutes";
import { SETTINGS_PATH, SETTINGS_ROLES } from "./settingsAccess";

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

describe("the sidebar", () => {
  test.each(["admin", "tourism"])("says Appearance, not Settings, to the %s role, and it still goes to /settings", (role) => {
    useAuth.mockReturnValue({ role });
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Appearance" }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });
});

describe("the title at the top and in the tab of the browser", () => {
  test("the top bar's title for the address is Appearance", () => {
    expect(pageInfo["/settings"].title).toBe("Appearance");
  });

  test("the title of the browser tab is Appearance, with the tourism suffix, and has no Settings in it", () => {
    function Probe() {
      useDocumentBranding({ module: "tourism", pageTitle: pageInfo["/settings"].title });
      return null;
    }
    render(<Probe />);

    expect(document.title).toBe("Appearance | Mauban Tourism");
    expect(document.title).not.toMatch(/Settings/);
  });

  test("no title of the top bar, for any address of the tourism module, says Settings", () => {
    for (const [path, info] of Object.entries(pageInfo)) {
      expect({ path, title: info.title }).not.toEqual({ path, title: "Settings" });
      expect(info.title).not.toMatch(/\bSettings\b/);
    }
  });
});

describe("the address and who may open it are as they were", () => {
  test("/settings is still the address, and its route still lets the Tourism Office and the admin in", () => {
    expect(SETTINGS_PATH).toBe("/settings");
    const route = tourismRoutes.find((item) => item.path === "/settings");
    expect(route).toBeDefined();
    expect(route.allowedRoles).toEqual(["admin", "tourism"]);
    expect(SETTINGS_ROLES).toEqual(["admin", "tourism"]);
  });

  test.each(["admin", "tourism"])("the route guard lets the %s role through", (role) => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role });
    render(<ProtectedRoute allowedRoles={SETTINGS_ROLES} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  test.each(["tourist", "sanitation", "auditor"])("and still sends the %s role away", (role) => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role });
    render(<ProtectedRoute allowedRoles={SETTINGS_ROLES} />);
    if (role === "sanitation") {
      expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/sanitation"); // it goes to its own home
    } else {
      expect(screen.queryByTestId("redirect")).toBeNull(); // a role that reaches no page is refused where it stands
      expect(screen.getByRole("alert").textContent).toContain("for the mobile app only");
    }
    expect(screen.queryByTestId("outlet")).toBeNull();
  });
});

describe("Sanitation", () => {
  test("has no Appearance in its source: it was not touched", () => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(js|css)$/.test(name) && !/\.test\.js$/.test(name)) files.push(path);
      }
    };
    walk(join(__dirname, "..", "sanitation"));

    expect(files.length).toBeGreaterThan(20);
    const named = files.filter((file) => /\bAppearance\b/.test(readFileSync(file, "utf8")));
    expect(named).toEqual([]);
  });
});
