/**
 * The sizes and colours of the arrival modal and of the table's new parts, read from Tourism_index.css itself (not written into the tests):
 * jsdom does not apply a stylesheet, so each rule is read from the file and its declarations compared with the design's.
 */
import { expectedNorm, normalised, norm, rule, tourismCss } from "../testing/cssRules";

// toMatchObject on the rule's own declarations, each side normalised
const has = (selector, expected) => expect(normalised(selector)).toMatchObject(expectedNorm(expected));

describe("the container of the modal", () => {
  it("is 560px wide, #FFFDFB, radius 16, with the soft shadow, and overflow hidden", () => {
    has(".arm-modal", {
      width: "560px",
      background: "#FFFDFB",
      "border-radius": "16px",
      "box-shadow": "0 10px 30px rgba(90,60,35,.16)",
      overflow: "hidden",
    });
  });

  it("is a column whose body scrolls while the band and the footer stay (so the long modal fits the screen)", () => {
    has(".arm-modal", { display: "flex", "flex-direction": "column" });
    has(".arm-body", { "overflow-y": "auto", flex: "1 1 auto" });
    has(".arm-band", { flex: "none" });
    has(".arm-footer", { flex: "none" });
  });
});

describe("the band at the top", () => {
  it("is 96px, #6E5A46, with the gradient from rgba(0,0,0,.22) to nothing at 60%", () => {
    has(".arm-band", {
      height: "96px",
      "background-color": "#6E5A46",
      "background-image": "linear-gradient(180deg, rgba(0,0,0,.22) 0%, rgba(0,0,0,0) 60%)",
    });
  });

  it("the chips sit at top 12px, left 14px, 7px apart", () => {
    has(".arm-chips", { position: "absolute", top: "12px", left: "14px", gap: "7px" });
  });

  it("a chip is padding 5px 11px, a pill, 12px weight 700, white at .94 with #3F3A35", () => {
    has(".arm-chip", {
      padding: "5px 11px",
      "border-radius": "999px",
      "font-size": "12px",
      "font-weight": "700",
      background: "rgba(255,255,255,.94)",
      color: "#3F3A35",
    });
  });

  it("the status chip is #1C7A42 with white text", () => {
    has(".arm-chip.status", { background: "#1C7A42", color: "#FFFFFF" });
  });

  it("the close is 32x32, a circle, rgba(20,16,12,.72), white, at top 12px, right 14px", () => {
    has(".arm-close", {
      position: "absolute",
      top: "12px",
      right: "14px",
      width: "32px",
      height: "32px",
      "border-radius": "999px",
      background: "rgba(20,16,12,.72)",
      color: "#FFFFFF",
    });
  });
});

describe("the body", () => {
  it("has padding 18px 22px 22px", () => {
    has(".arm-body", { padding: "18px 22px 22px" });
  });

  it("the name is 22px weight 800, letter-spacing -.01em, margin 0 0 6px", () => {
    has(".arm-name", { "font-size": "22px", "font-weight": "800", "letter-spacing": "-.01em", margin: "0 0 6px" });
  });

  it("the subline is 13.5px #7A6755, margin 0 0 16px", () => {
    has(".arm-sub", { "font-size": "13.5px", color: "#7A6755", margin: "0 0 16px" });
  });

  it("the buttons are 8px apart; each is 13px weight 600, min-height 38, padding 0 14px, radius 9", () => {
    has(".arm-actions", { display: "flex", gap: "8px" });
    has(".arm-btn", { "font-size": "13px", "font-weight": "600", "min-height": "38px", padding: "0 14px", "border-radius": "9px" });
  });

  it("Print record is white with a 1px #E0CDB7 border and #453931", () => {
    has(".arm-btn", { background: "#FFFFFF", border: "1px solid #E0CDB7", color: "#453931" });
  });

  it("Open destination is #E0701A with a #E0701A border and white, and #BE5B11 on hover", () => {
    has(".arm-btn.primary", { background: "#E0701A", "border-color": "#E0701A", color: "#FFFFFF" });
    has(".arm-btn.primary:hover:not(:disabled)", { background: "#BE5B11" });
  });
});

describe("a group and its grid", () => {
  it("a group has a 1px #EFE2D3 line above, 16px padding above its content and 16px margin above it; its title 13px weight 800", () => {
    has(".arm-group", { "border-top": "1px solid #EFE2D3", "padding-top": "16px", "margin-top": "16px" });
    has(".arm-group h3", { "font-size": "13px", "font-weight": "800" });
  });

  it("the values are a grid of two equal columns, 15px by 18px apart, aligned at the start", () => {
    const grid = rule(".arm-grid");
    expect(grid.display).toBe("grid");
    expect(norm(grid["grid-template-columns"])).toBe(norm("repeat(2, minmax(0,1fr))"));
    expect(norm(grid.gap)).toBe(norm("15px 18px"));
    expect(grid["align-items"]).toBe("start");
  });

  it("a label is 11px, uppercase, letter-spacing .07em, #8A6E55, weight 700, margin 0 0 3px", () => {
    has(".arm-label", {
      "font-size": "11px",
      "text-transform": "uppercase",
      "letter-spacing": ".07em",
      color: "#8A6E55",
      "font-weight": "700",
      margin: "0 0 3px",
    });
  });

  it("a value is 14px weight 600, #241E1A, line-height 1.4", () => {
    has(".arm-value", { "font-size": "14px", "font-weight": "600", color: "#241E1A", "line-height": "1.4" });
  });

  it("person-nights and person-days are weight 500 in #7A6755", () => {
    has(".arm-unit", { "font-weight": "500", color: "#7A6755" });
  });

  it("the note is the full width of the grid, 12.5px, #87705C", () => {
    has(".arm-note", { "grid-column": "1 / -1", "font-size": "12.5px", color: "#87705C" });
  });

  it("the footer has a 1px #EFE2D3 line above, padding 14px 22px, and its button on the right", () => {
    has(".arm-footer", { "border-top": "1px solid #EFE2D3", padding: "14px 22px", "justify-content": "flex-end" });
  });
});

describe("the table", () => {
  it("the name is a button: 14px weight 700, #241E1A, no border, no background, on the left", () => {
    has(".arrival-record-link", {
      "font-size": "14px",
      "font-weight": "700",
      color: "#241E1A",
      border: "0",
      background: "none",
      "text-align": "left",
    });
  });

  it("on hover it is #8A4310 and underlined", () => {
    has(".arrival-record-link:hover", { color: "#8A4310", "text-decoration": "underline" });
  });

  it("with the keyboard it has a 2px #E0701A outline pulled out by 3px", () => {
    has(".arrival-record-link:focus-visible", { outline: "2px solid #E0701A", "outline-offset": "3px" });
  });

  it("the row is #FDF5EC on hover (its cells too, so no cell keeps another colour)", () => {
    has("tr.arrival-row:hover > td", { background: "#FDF5EC" });
  });

  it("the last column is 34px wide, with a › in #C2AE98 that is #8A4310 when the row is hovered", () => {
    has(".arrival-chevron-col,\n.arrival-chevron".split("\n").pop(), { width: "34px" }); // the rule the two selectors share
    has(".arrival-chevron", { color: "#C2AE98" });
    has("tr.arrival-row:hover > .arrival-chevron", { color: "#8A4310" });
  });
});

describe("where the rules are", () => {
  it("they come before the Mobile App Content section, whose own tests read the end of the file", () => {
    expect(tourismCss.indexOf(".arm-modal {")).toBeGreaterThan(0);
    expect(tourismCss.indexOf(".arm-modal {")).toBeLessThan(tourismCss.indexOf(".mobile-content"));
  });

  it("printing shows the modal and hides the rest", () => {
    expect(tourismCss).toMatch(/@media print\s*\{[^@]*body \*\s*\{\s*visibility:\s*hidden/);
    expect(tourismCss).toMatch(/\.arm-modal \*\s*\{\s*visibility:\s*visible/);
  });
});
