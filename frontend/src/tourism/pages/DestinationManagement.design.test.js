/**
 * The sizes and colours of the Edit and Details modals of a destination, held against the CSS file itself:
 * jsdom does not apply a stylesheet, so the rules are read from the file and their declarations compared.
 */
import { readFileSync } from "fs";
import { join } from "path";

const css = readFileSync(join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");

// The declarations of the one rule `selector { ... }`, as {property: value}.
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // every rule that names this selector alone or last in a list: their declarations are added up, the later winning, as the cascade does
  const found = Array.from(css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g")));
  if (!found.length) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    found
      .map((match) => match[1])
      .join(";")
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
}

describe("the chip of the Length of Stay in Edit", () => {
  it("not picked: white, a 1px border #E0CDB7, text #453931, padding 7px 13px, a pill, 12.5px w600", () => {
    expect(rule(".dest-chip")).toMatchObject({
      "border-radius": "999px",
      "font-size": "12.5px",
      "font-weight": "600",
      background: "#ffffff",
      border: "1px solid #e0cdb7",
      color: "#453931",
      padding: "7px 13px",
    });
  });

  it("picked: background #FDF0E2, a 2px border #E0701A, text #8A4310, padding 6px 12px: NOT a solid orange", () => {
    const picked = rule(".dest-chip.selected");
    expect(picked).toMatchObject({
      background: "#fdf0e2",
      border: "2px solid #e0701a",
      color: "#8a4310",
      padding: "6px 12px",
    });
    expect(picked.background).not.toBe("#e0701a");
  });

  it("picked and not picked are the same size: a 1px border and 7px, or a 2px border and 6px", () => {
    const edge = (r) => Number(r.border.match(/^(\d+)px/)[1]) + Number(r.padding.split(" ")[0].replace("px", ""));
    expect(edge(rule(".dest-chip"))).toBe(edge(rule(".dest-chip.selected")));
  });

  it("in Details the chip is background #FDF0E2, text #8A4310", () => {
    expect(rule(".dest-chip-static")).toMatchObject({ background: "#fdf0e2", color: "#8a4310", "border-radius": "999px" });
  });
});

describe("the Status control", () => {
  it("the holder is #F4E7D8, radius 10, padding 4px", () => {
    expect(rule(".dest-seg")).toMatchObject({ background: "#f4e7d8", "border-radius": "10px", padding: "4px" });
  });

  it("a button is 13px w700, min-height 34, padding 0 16px, radius 7, no border, #6B5949", () => {
    expect(rule(".dest-seg-btn")).toMatchObject({
      "font-size": "13px",
      "font-weight": "700",
      "min-height": "34px",
      padding: "0 16px",
      "border-radius": "7px",
      border: "0",
      color: "#6b5949",
    });
  });

  it("the picked one is white, #241E1A, with the soft shadow", () => {
    expect(rule(".dest-seg-btn.selected")).toMatchObject({
      background: "#ffffff",
      color: "#241e1a",
      "box-shadow": "0 1px 2px rgba(90, 60, 35, 0.14)",
    });
  });
});

describe("the Edit modal", () => {
  it("the title is 18px w800; the name under it 13px #7A6755; a line under the header 1px #EFE2D3", () => {
    expect(rule(".dest-edit-header h2")).toMatchObject({ "font-size": "18px", "font-weight": "800" });
    expect(rule(".dest-edit-header p")).toMatchObject({ "font-size": "13px", color: "#7a6755" });
    expect(rule(".dest-edit-header")["border-bottom"]).toBe("1px solid #efe2d3");
  });

  it("the close X is 32x32, radius 8, a border #E8DBCB, white", () => {
    expect(rule(".dest-edit-close")).toMatchObject({
      width: "32px",
      height: "32px",
      "border-radius": "8px",
      border: "1px solid #e8dbcb",
      background: "#ffffff",
    });
  });

  it("the read-only box is #FBF1E4, radius 11, padding 13px 15px, two columns", () => {
    expect(rule(".dest-readonly")).toMatchObject({ background: "#fbf1e4", "border-radius": "11px", padding: "13px 15px" });
    expect(rule(".dest-readonly-facts")["grid-template-columns"]).toBe("repeat(2, minmax(0, 1fr))");
  });

  it("its value is 17px w800", () => {
    expect(rule(".dest-readonly-value")).toMatchObject({ "font-size": "17px", "font-weight": "800" });
  });

  it("a label is 11px uppercase, letter-spacing .07em, #8A6E55, w700; a hint 12px #87705C", () => {
    expect(rule(".dest-label")).toMatchObject({
      "font-size": "11px",
      "text-transform": "uppercase",
      "letter-spacing": "0.07em",
      color: "#8a6e55",
      "font-weight": "700",
    });
    expect(rule(".dest-hint")).toMatchObject({ "font-size": "12px", color: "#87705c" });
  });

  it("a group has a 1px #EFE2D3 line above, 18px padding and 18px margin; its title 13px w800 and subtitle 12.5px #87705C", () => {
    expect(rule(".dest-group")).toMatchObject({ "border-top": "1px solid #efe2d3", "padding-top": "18px", "margin-top": "18px" });
    expect(rule(".dest-group h3")).toMatchObject({ "font-size": "13px", "font-weight": "800" });
    expect(rule(".dest-group-sub")).toMatchObject({ "font-size": "12.5px", color: "#87705c" });
  });

  it("the footer is stuck at the foot: a 1px #EFE2D3 line, padding 14px 22px, buttons on the right", () => {
    expect(rule(".dest-edit-footer")).toMatchObject({
      "border-top": "1px solid #efe2d3",
      padding: "14px 22px",
      "justify-content": "flex-end",
      flex: "none",
    });
  });

  it("the body scrolls and the header and footer do not", () => {
    expect(rule(".dest-edit-body")["overflow-y"]).toBe("auto");
    expect(rule(".dest-edit")).toMatchObject({ display: "flex", "flex-direction": "column", overflow: "hidden" });
  });
});

describe("the Details modal", () => {
  it("the status chip is #1C7A42 with white text; the category chip rgba(255,255,255,.94) with #3F3A35; both at the top left", () => {
    expect(rule(".dest-chip-status")).toMatchObject({ background: "#1c7a42", color: "#ffffff" });
    expect(rule(".dest-chip-category")).toMatchObject({ background: "rgba(255, 255, 255, 0.94)", color: "#3f3a35" });
    expect(rule(".dest-hero-chips")).toMatchObject({ top: "12px", left: "12px" });
  });

  it("the close is a circle, rgba(20,16,12,.72), at the top right", () => {
    expect(rule(".dest-close-round")).toMatchObject({
      "border-radius": "50%",
      background: "rgba(20, 16, 12, 0.72)",
      top: "12px",
      right: "12px",
    });
  });

  it("the name is 22px w800; the line under it 13.5px #7A6755", () => {
    expect(rule(".dest-details-name")).toMatchObject({ "font-size": "22px", "font-weight": "800" });
    expect(rule(".dest-details-sub")).toMatchObject({ "font-size": "13.5px", color: "#7a6755" });
  });

  it("the Google Maps button is orange", () => {
    expect(rule(".dest-btn-orange")).toMatchObject({ background: "#e0701a", color: "#ffffff" });
  });

  it("a group has a 1px #EFE2D3 line above, 16px padding and 16px margin; its title 13px w800", () => {
    expect(rule(".dest-detail-group")).toMatchObject({ "border-top": "1px solid #efe2d3", "padding-top": "16px", "margin-top": "16px" });
    expect(rule(".dest-detail-group h3")).toMatchObject({ "font-size": "13px", "font-weight": "800" });
  });

  it("a value is 14px w600; the paragraph 14px with line-height 1.65; the coordinates 12.5px #87705C", () => {
    expect(rule(".dest-value")).toMatchObject({ "font-size": "14px", "font-weight": "600" });
    expect(rule(".dest-about")).toMatchObject({ "font-size": "14px", "line-height": "1.65" });
    expect(rule(".dest-coords")).toMatchObject({ "font-size": "12.5px", color: "#87705c" });
  });
});
