/**
 * Activity Logs in the tourism shell: the brand green follows the theme. Read from the stylesheets themselves (jsdom applies none).
 * The page is shared with Sanitation, so the tourism rules are scoped to .tourism-layout and the shared file is left as it was.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { rule, tourismCss } from "../testing/cssRules";

const sharedCss = readFileSync(join(__dirname, "..", "..", "shared", "pages", "ActivityLogsPage.css"), "utf8").replace(/\r\n/g, "\n");

// every rule of the tourism stylesheet that is about the activity page, as [selector, body]
const tourismActivityRules = Array.from(tourismCss.matchAll(/\n(\.tourism-layout \.activity-[^{]*)\{([^}]*)\}/g)).map((m) => [m[1].trim(), m[2]]);

const GREEN_LITERAL = /#(?:0f6b42|16a34a|15803d|dcfce7|2fa34a|eef7f2)\b|rgba\(\s*15\s*,\s*57\s*,\s*38/i;

describe("the places that were a fixed green now read the theme", () => {
  it("Refresh is the primary colour, the one the main buttons of the other pages use", () => {
    expect(rule(".tourism-layout .activity-refresh").background).toBe("var(--th-primary)");
    expect(rule(".add-entry-btn").background).toBe("var(--th-primary)"); // the same token as the main button of the other pages
  });

  it("the Recent Activity title (and its icon, which takes its colour) is the brand ink on white", () => {
    expect(rule(".tourism-layout .activity-title").color).toBe("var(--th-primary-ink)");
  });

  it("the table header is the pale brand tint, and the two cards' shadows take the theme's shadow channels", () => {
    expect(rule(".tourism-layout .activity-table-card th").background).toBe("var(--th-primary-tint)");
    expect(rule(".tourism-layout .activity-summary-card")["box-shadow"]).toBe("0 10px 20px rgba(var(--th-shadow-rgb), 0.12)");
    expect(rule(".tourism-layout .activity-table-card")["box-shadow"]).toBe("0 8px 18px rgba(var(--th-shadow-rgb), 0.12)");
  });

  it("no tourism rule of the page keeps a green literal", () => {
    expect(tourismActivityRules.length).toBeGreaterThanOrEqual(5);
    for (const [selector, body] of tourismActivityRules) {
      expect({ selector, green: GREEN_LITERAL.test(body) }).toEqual({ selector, green: false });
    }
  });

  it("every one of them is scoped to the tourism shell, so Sanitation does not take them", () => {
    for (const [selector] of tourismActivityRules) expect(selector.startsWith(".tourism-layout ")).toBe(true);
  });
});

describe("what was not changed", () => {
  it("the shared file still has Sanitation's own green on the same places", () => {
    expect(rule(".activity-refresh", sharedCss).background).toBe("#0f6b42");
    expect(rule(".activity-title", sharedCss).color).toBe("#0f6b42");
  });

  it("Created is still green, Updated blue and Deleted red: the colours that mean something", () => {
    expect(rule(".activity-summary-card.create", sharedCss)["border-left"]).toBe("5px solid #16a34a");
    expect(rule(".activity-summary-card.update", sharedCss)["border-left"]).toBe("5px solid #2563eb");
    expect(rule(".activity-summary-card.delete", sharedCss)["border-left"]).toBe("5px solid #dc2626");
    expect(rule(".activity-action.create", sharedCss)).toMatchObject({ background: "#dcfce7", color: "#15803d" });
    expect(rule(".activity-action.update", sharedCss)).toMatchObject({ background: "#dbeafe", color: "#1d4ed8" });
    expect(rule(".activity-action.delete", sharedCss)).toMatchObject({ background: "#fee2e2", color: "#b91c1c" });
  });

  it("no tourism rule touches the Created, Updated or Deleted tones", () => {
    for (const [selector] of tourismActivityRules) expect(selector).not.toMatch(/\.(create|update|delete)\b/);
  });

  it("the rules come before the Mobile App Content section, whose own tests read the end of the file", () => {
    expect(tourismCss.indexOf(".tourism-layout .activity-refresh")).toBeGreaterThan(0);
    expect(tourismCss.indexOf(".tourism-layout .activity-refresh")).toBeLessThan(tourismCss.indexOf(".mobile-content"));
  });
});
