// The address of the page of a tile (Commit 6b): its route, who may open it, the name in the top bar, and the helpers that build its addresses.
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { pageInfo } from "./components/layout/AppShell";
import { tourismRoutes } from "./tourismRoutes";
import {
  DEFAULT_MOBILE_CONTENT_TAB,
  MOBILE_CONTENT_PATH,
  MOBILE_CONTENT_ROLES,
  MOBILE_CONTENT_TABS,
  SECTION_TABS,
  TILE_PATH,
  sectionTabPath,
  tabPath,
  tileEditPath,
  tileNewPath,
} from "./mobileContentAccess";
import { ITEM_SECTIONS } from "./utils/mobileContentTileRules";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({
    Navigate: ({ to, replace }) => <div data-testid="redirect" data-to={to} data-replace={String(Boolean(replace))} />,
    Outlet: () => <div data-testid="outlet" />,
    NavLink: ({ to, children }) => <a href={to}>{children}</a>,
    useLocation: () => ({ pathname: "/mobile-content/tile" }),
    useNavigate: () => jest.fn(),
    useOutletContext: () => ({}),
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(""), jest.fn()],
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

describe("the route of the page of a tile", () => {
  test("is /mobile-content/tile, one route, admin only (the same roles as the page of the tabs)", () => {
    expect(TILE_PATH).toBe("/mobile-content/tile");
    const routes = tourismRoutes.filter((route) => route.path === TILE_PATH);
    expect(routes).toHaveLength(1);
    expect(routes[0].allowedRoles).toEqual(["admin"]);
    expect(routes[0].allowedRoles).toEqual(MOBILE_CONTENT_ROLES);
    expect(routes[0].element).toBeTruthy();
    // the page of the tabs is still there, with its own address
    expect(tourismRoutes.find((route) => route.path === MOBILE_CONTENT_PATH).allowedRoles).toEqual(["admin"]);
  });

  test("the route guard sends a tourism user and a sanitation user away, and lets the admin through", () => {
    const route = tourismRoutes.find((item) => item.path === TILE_PATH);
    for (const [role, home] of [["tourism", "/"], ["sanitation", "/sanitation"]]) {
      useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role });
      const { unmount } = render(<ProtectedRoute allowedRoles={route.allowedRoles} />);
      expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe(home); // each goes to its own home, not to this page
      expect(screen.queryByTestId("outlet")).toBeNull();
      unmount();
    }
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false, role: "admin" });
    render(<ProtectedRoute allowedRoles={route.allowedRoles} />);
    expect(screen.getByTestId("outlet")).toBeTruthy();
  });

  test("the top bar knows the page, and says Mobile App Content (without an entry it would say Dashboard Overview)", () => {
    expect(pageInfo[TILE_PATH]).toBeDefined();
    expect(pageInfo[TILE_PATH].title).toBe("Mobile App Content");
    expect(pageInfo[TILE_PATH].showAdd).toBe(false);
  });
});

describe("the addresses", () => {
  test("to edit a tile and to add one", () => {
    expect(tileEditPath(12)).toBe("/mobile-content/tile?id=12");
    expect(tileNewPath("why_visit")).toBe("/mobile-content/tile?section=why_visit");
    expect(tileNewPath("travel_guide")).toBe("/mobile-content/tile?section=travel_guide");
  });

  test("the tab to go back to is the tab of the section, and it is a tab that exists", () => {
    expect(Object.keys(SECTION_TABS).sort()).toEqual(Object.keys(ITEM_SECTIONS).sort()); // the fixture: one tab for each section the server has
    expect(sectionTabPath("why_visit")).toBe("/mobile-content?tab=why-visit");
    expect(sectionTabPath("travel_guide")).toBe("/mobile-content?tab=travel-guide");
    Object.values(SECTION_TABS).forEach((key) => expect(MOBILE_CONTENT_TABS.map((tab) => tab.key)).toContain(key));
  });

  test("a section that is not known goes back to the tab that opens by itself", () => {
    expect(sectionTabPath("nope")).toBe(tabPath(DEFAULT_MOBILE_CONTENT_TAB));
    expect(sectionTabPath(undefined)).toBe(tabPath(DEFAULT_MOBILE_CONTENT_TAB));
  });
});
