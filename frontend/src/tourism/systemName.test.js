/**
 * Two different things used to share one name. The OFFICE is the Mauban Tourism Office: real, it sends the advisories, reads the reviews and takes
 * the fee. The SYSTEM covers Cagbalete Island only, and it is called "Cagbalete Island Visitor Monitoring". The system's name is in the sidebar and
 * in the browser tab; the office's name stays wherever it is the office that speaks.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import Sidebar from "./components/layout/Sidebar";
import { useAuth } from "../auth/AuthContext";
import { useDocumentBranding, MODULE_CONFIG } from "../shared/useDocumentBranding";
import { norm, rule, tourismCss } from "./testing/cssRules";

jest.mock(
  "react-router-dom",
  () => ({
    NavLink: ({ to, className, children }) => (
      <a href={to} className={typeof className === "function" ? className({ isActive: false }) : className}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);
jest.mock("../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const SYSTEM = "Cagbalete Island Visitor Monitoring";
const source = (...parts) => readFileSync(join(__dirname, ...parts), "utf8");

describe("the sidebar names the system, not the office", () => {
  beforeEach(() => useAuth.mockReturnValue({ role: "tourism" }));

  test("says Cagbalete Island Visitor Monitoring, on the page and in the logo's alt", () => {
    const { container } = render(<Sidebar />);

    expect(container.querySelector(".sidebar-brand-text").textContent).toBe(SYSTEM); // two lines, one name
    expect(container.querySelector(".sidebar-brand img").getAttribute("alt")).toBe(SYSTEM);
  });

  test("no longer says Mauban Tourism Office anywhere in the sidebar", () => {
    const { container } = render(<Sidebar />);

    expect(container.textContent).not.toContain("Mauban Tourism Office");
    expect(container.innerHTML).not.toContain("Mauban Tourism Office");
    expect(screen.queryByText("Mauban Tourism Office")).toBeNull();
  });
});

describe("the name is on two lines, and neither is cut", () => {
  beforeEach(() => useAuth.mockReturnValue({ role: "tourism" }));

  test("the place is the first line and what the system does is the second, in that order", () => {
    const { container } = render(<Sidebar />);
    const lines = Array.from(container.querySelectorAll(".sidebar-brand-text > span"));

    expect(lines.map((line) => line.textContent)).toEqual(["Cagbalete Island", "Visitor Monitoring"]);
    expect(lines.map((line) => line.className)).toEqual(["sidebar-brand-name", "sidebar-brand-sub"]);
  });

  test("the first line is larger and stronger, the second smaller and quieter (read from the stylesheet itself)", () => {
    const name = rule(".sidebar-brand-text .sidebar-brand-name");
    const sub = rule(".sidebar-brand-text .sidebar-brand-sub");

    expect([name["font-size"], name["font-weight"]]).toEqual(["16px", "800"]);
    expect([sub["font-size"], sub["font-weight"]]).toEqual(["12px", "600"]);
    expect(parseFloat(name["font-size"])).toBeGreaterThan(parseFloat(sub["font-size"]));
    expect(Number(name["font-weight"])).toBeGreaterThan(Number(sub["font-weight"]));
    expect(name.color).toBe("var(--th-text-tinted-strong)"); // as the nav links
    expect(sub.color).toBe("var(--th-text-tinted-muted)"); // as the nav heading
  });

  test("each line stays on one line, and each is its own block", () => {
    expect(norm(rule(".sidebar-brand-text span")["white-space"])).toBe("nowrap");
    expect(rule(".sidebar-brand-text span").display).toBe("block");
    expect(rule(".sidebar-brand-text")["min-width"]).toBe("0");
  });

  // MEASURED in Chrome (headless), with the rules above taken from the stylesheet itself, in a sidebar as wide as this one:
  //   Public Sans (the app's font): "Cagbalete Island" 115.1px, "Visitor Monitoring" 96.3px
  //   Arial (a font wider than the app's own): 147.8px and 102.5px; the monospace worst case: 140.8px and 118.8px
  // jsdom has no layout, so the widths are written here as measured, and the room the stylesheet leaves them is worked out from the stylesheet.
  const WIDEST_LINE_MEASURED = 147.8;

  test("the room the sidebar leaves the text (its width, less its padding, the logo and the gap) is more than the widest line measured", () => {
    const sidebar = rule(".tourism-sidebar");
    const brand = rule(".sidebar-brand");
    const logo = rule(".sidebar-logo");
    const padding = sidebar.padding.split(/\s+/); // "58px 22px 0": the sides are the second value
    const side = parseFloat(padding[1]);
    const room = parseFloat(sidebar.width) - 2 * side - parseFloat(logo.width) - parseFloat(brand.gap);

    expect(room).toBe(158);
    expect(room).toBeGreaterThan(WIDEST_LINE_MEASURED);
  });

  test("the sidebar is the same width at every screen: no rule narrows it, except the one that hides it when printing", () => {
    const mentions = Array.from(tourismCss.matchAll(/\.tourism-sidebar/g)).map((match) => match.index);

    expect(mentions).toHaveLength(2); // its own rule, and the print rule
    expect(mentions[1]).toBeGreaterThan(tourismCss.indexOf("@media print"));
    expect(rule(".tourism-sidebar").width).toBe("260px");
  });

  test("the toggle takes the whole sidebar away: there is no narrow, icons-only sidebar to fit the name into", () => {
    const shell = source("components", "layout", "AppShell.js");

    expect(shell).toContain("{sidebarOpen && <Sidebar />}");
    expect(shell).not.toMatch(/sidebar-collapsed|collapsedSidebar|isCollapsed/);
  });
});

describe("the browser tab names the system", () => {
  function Probe(props) {
    useDocumentBranding(props);
    return null;
  }

  test("a page of the tourism module is 'Page | Cagbalete Island Visitor Monitoring'", () => {
    render(<Probe module="tourism" pageTitle="Dashboard" />);

    expect(document.title).toBe(`Dashboard | ${SYSTEM}`);
    expect(document.title).not.toContain("Mauban Tourism");
  });

  test("with no page title, the title is the system's name", () => {
    render(<Probe module="tourism" />);

    expect(document.title).toBe(SYSTEM);
    expect(MODULE_CONFIG.tourism.suffix).toBe(`| ${SYSTEM}`);
    expect(MODULE_CONFIG.tourism.defaultTitle).toBe(SYSTEM);
  });

  test("the sanitation module keeps its own name: this is not its system", () => {
    expect(MODULE_CONFIG.sanitation.suffix).toBe("| Mauban Sanitation");
    expect(MODULE_CONFIG.sanitation.defaultTitle).toBe("Mauban Sanitation & Health Portal");
  });
});

describe("the web admin is Visitor Monitoring and the phone is the Guide: they do not swap", () => {
  const mobile = (...parts) => readFileSync(join(__dirname, "..", "..", "..", "mobile", ...parts), "utf8");

  test("the web's sidebar and tab never say Guide", () => {
    expect(source("components", "layout", "Sidebar.js")).not.toContain("Cagbalete Island Guide");
    expect(source("..", "shared", "useDocumentBranding.js")).not.toContain("Cagbalete Island Guide");
  });

  test("the phone's header, tab and app switcher say Guide and never Visitor Monitoring", () => {
    for (const file of [["lib", "widgets", "widgets.dart"], ["lib", "main.dart"], ["lib", "utils", "web_branding.dart"], ["web", "index.html"]]) {
      expect(mobile(...file)).not.toContain("Visitor Monitoring");
    }
    expect(mobile("web", "index.html")).toContain("<title>Cagbalete Island Guide</title>");
  });
});

describe("the office keeps its name where it is the office that speaks", () => {
  test("the module picker still says Tourism Office", () => {
    expect(source("..", "auth", "ModuleSelectionPage.js")).toContain('title: "Tourism Office"');
  });

  test("the printed report is still the Municipality of Mauban's Tourism Office Report", () => {
    const page = source("pages", "AnalyticsAndReport.js");
    expect(page).toContain("<strong>Municipality of Mauban</strong>");
    expect(page).toContain("<h2>Tourism Office Report</h2>");
  });

  test("the reply of a review is still the Tourism Office's", () => {
    expect(source("pages", "DestinationManagement.js")).toContain("Tourism Office Reply:");
  });

  test("the notifications preview still comes from the Tourism Office", () => {
    expect(source("pages", "MobileContentNotifications.js")).toContain('"Mga abiso mula sa Tourism Office"');
  });

  test("the role is still called Tourism Office on the server (and in its migrations)", () => {
    const backend = join(__dirname, "..", "..", "..", "backend", "api");
    expect(readFileSync(join(backend, "models.py"), "utf8")).toContain('(ROLE_TOURISM, "Tourism Office")');
    expect(readFileSync(join(backend, "migrations", "0067_resort_staff_role.py"), "utf8")).toContain("('tourism', 'Tourism Office')");
  });

  test("the 403 messages still say Only the Tourism Office and the system admin", () => {
    const views = join(__dirname, "..", "..", "..", "backend", "api", "views");
    for (const file of ["resort_staff.py", "reference_options.py", "emergency_contacts.py", "boat_capacity_fares.py", "mobile_content.py"]) {
      expect(readFileSync(join(views, file), "utf8")).toContain("Only the Tourism Office and the system admin");
    }
  });

  test("the Mobile App Content page says Cagbalete Island App, and the other eyebrows are not touched", () => {
    expect(source("pages", "MobileAppContent.js")).toContain('mobile-content-eyebrow">Cagbalete Island App</p>');
    expect(source("pages", "MobileAppContent.js")).not.toContain("Mauban Tourism App");
  });
});
