import { readFileSync } from "fs";
import { join } from "path";
import { ADMINISTRATION_ROLES } from "./administrationAccess";
import { tourismRoutes } from "./tourismRoutes";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock("react-router-dom", () => ({ Navigate: () => null, Outlet: () => null, NavLink: () => null, useLocation: () => ({}), useNavigate: () => jest.fn(), useOutletContext: () => ({}), useParams: () => ({}) }), { virtual: true });
jest.mock("../auth/AuthContext", () => ({ useAuth: jest.fn(), getDefaultRouteForRole: () => "/" }));
jest.mock("react-leaflet", () => ({}));
jest.mock("leaflet", () => ({ __esModule: true, default: { DivIcon: class {} }, DivIcon: class {} }));
jest.mock("react-chartjs-2", () => ({ Bar: () => null, Doughnut: () => null, Line: () => null, Pie: () => null }));

describe("the web and the server say the same", () => {
  test("administrationAccess.js has the roles of ADMINISTRATION_ROLES in backend/api/permissions.py, no more, no fewer", () => {
    const python = readFileSync(join(__dirname, "..", "..", "..", "backend", "api", "permissions.py"), "utf8");
    const line = python.match(/ADMINISTRATION_ROLES\s*=\s*frozenset\(\{([^}]*)\}\)/);
    expect(line).not.toBeNull();
    const constants = line[1].split(",").map((name) => name.trim()).filter(Boolean);
    const models = readFileSync(join(__dirname, "..", "..", "..", "backend", "api", "models.py"), "utf8");
    const values = constants.map((name) => models.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))[1]);
    expect([...values].sort()).toEqual([...ADMINISTRATION_ROLES].sort());
  });

  test("every route of the three pages is declared for exactly those roles", () => {
    for (const path of ["/settings", "/options", "/mobile-content", "/mobile-content/tile", "/hotlines"]) {
      const route = tourismRoutes.find((item) => item.path === path);
      expect(route && route.allowedRoles).toEqual(ADMINISTRATION_ROLES);
    }
  });
});
