import { fireEvent, render, screen } from "@testing-library/react";
import { EmergencyHotlinesPanel } from "./EmergencyHotlines";
import { useAuth } from "../../auth/AuthContext";

jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const fs = require("fs");
const path = require("path");

// The real stylesheet rules of this page, loaded into the document so that
// getComputedStyle sees them. (jsdom has no layout, so the test reads what the
// rules SAY about alignment: which parts sit at the top, which in the middle.)
function loadHotlinesCss() {
  const css = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8");
  const start = css.indexOf("/* ================= EMERGENCY HOTLINES");
  const style = document.createElement("style");
  style.textContent = css.slice(start);
  document.head.appendChild(style);
  return style;
}

const contact = (id, name, extra = {}) => ({
  id, name, contact_numbers: `0${id}-100`, email: "", description: "", icon: "police",
  display_order: id * 10, is_active: true, ...extra,
});

let style;
beforeEach(() => {
  style = loadHotlinesCss();
  useAuth.mockReturnValue({ role: "admin" });
  const rows = [
    contact(1, "No Chips Here"),
    contact(2, "One Chip Here", { email: "one@example.com" }),
    contact(3, "Two Chips Here", { email: "two@example.com", description: "A long description to make a chip" }),
  ];
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(rows), json: async () => rows })
  );
});
afterEach(() => style.remove());

const css = (el, prop) => window.getComputedStyle(el).getPropertyValue(prop);
const rowOf = (id) => screen.getByTestId(`hotline-row-${id}`);

describe("the icon lines up with the first line, and does not depend on the chips", () => {
  async function open() {
    render(<EmergencyHotlinesPanel />);
    await screen.findByRole("list");
  }

  it("puts the icon and the text in one body that starts at the top, apart from the right group", async () => {
    await open();
    [1, 2, 3].forEach((id) => {
      const row = rowOf(id);
      const icon = row.querySelector(".contact-icon");
      const main = row.querySelector(".hotline-main");
      const body = icon.parentElement;
      // the icon and the text are siblings in the same body, whatever the chips
      expect(main.parentElement).toBe(body);
      expect(body.className).toContain("hotline-body");
      expect(body.parentElement).toBe(row);
      expect(css(body, "display")).toBe("flex"); // a real flex box, not dissolved into the row
      expect(css(body, "align-items")).toBe("flex-start");
      // the right group is NOT in the body: it is the row's own child, in the middle
      expect(body.contains(row.querySelector(".hotline-actions"))).toBe(false);
      expect(body.contains(row.querySelector(".options-status"))).toBe(false);
      expect(row.querySelector(".hotline-actions").parentElement).toBe(row);
      expect(row.querySelector(".options-status").parentElement).toBe(row);
    });
  });

  it("keeps the right group in the MIDDLE of the row", async () => {
    await open();
    [1, 2, 3].forEach((id) => expect(css(rowOf(id), "align-items")).toBe("center"));
  });

  it("makes the first line as tall as the icon, with the name centred in it: centre meets centre", async () => {
    await open();
    [1, 2, 3].forEach((id) => {
      const icon = rowOf(id).querySelector(".contact-icon");
      const name = rowOf(id).querySelector(".hotline-name");
      expect(css(icon, "height")).toBe("40px");
      expect(css(name, "min-height")).toBe(css(icon, "height"));
      expect(css(name, "display")).toBe("flex");
      expect(css(name, "align-items")).toBe("center");
    });
  });

  it("looks the same with no chip, one chip or two: the same classes, the same structure up to the text", async () => {
    await open();
    const shape = (row) => {
      const body = row.querySelector(".hotline-body");
      return {
        bodyChildren: [...body.children].map((el) => el.className.split(" ")[0]),
        mainFirstTwo: [...body.querySelector(".hotline-main").children].slice(0, 2).map((el) => el.className),
        rowChildren: [...row.children].map((el) => el.className.split(" ")[0]),
        bodyAlign: css(body, "align-items"),
        nameMin: css(row.querySelector(".hotline-name"), "min-height"),
      };
    };
    expect(shape(rowOf(2))).toEqual(shape(rowOf(1)));
    expect(shape(rowOf(3))).toEqual(shape(rowOf(1)));
  });

  it("aligns the preview card in the form in the same way", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const preview = screen.getByRole("group", { name: "Preview" });
    const icon = preview.querySelector(".contact-icon");
    const main = preview.querySelector(".hotline-main");
    expect(preview.className).toContain("hotline-body");
    expect(icon.parentElement).toBe(preview);
    expect(main.parentElement).toBe(preview);
    expect(css(preview, "display")).toBe("flex");
    expect(css(preview, "align-items")).toBe("flex-start");
    // the same first line as the list: as tall as the icon
    expect(css(preview.querySelector(".hotline-name"), "min-height")).toBe(css(icon, "height"));
    // and it does not take the body's 260px basis as a height inside the column form
    expect(css(preview, "flex")).toMatch(/^(0 0 auto|none)/);
  });
});

describe("a chip is one line: the icon and the text side by side, never split inside", () => {
  const LONG_EMAIL = `${"very.long.address.".repeat(8)}name@a-very-long-domain-name-for-a-test.example.com`;

  async function openWithChips() {
    const rows = [
      contact(1, "Plain Row"),
      contact(2, "Email Row", { email: LONG_EMAIL }),
      contact(3, "Description Row", { description: "A description that is long enough to fill a good part of the line" }),
      contact(4, "Both Row", { email: "short@example.com", description: "Short note" }),
    ];
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(rows), json: async () => rows })
    );
    render(<EmergencyHotlinesPanel />);
    await screen.findByRole("list");
  }
  const chipsOf = () => [...document.querySelectorAll(".hotline-chip")];

  it("makes every chip a centred flex row that may not wrap inside", async () => {
    await openWithChips();
    expect(chipsOf()).toHaveLength(4); // email, description, email, description
    chipsOf().forEach((chip) => {
      expect(css(chip, "display")).toBe("inline-flex");
      expect(css(chip, "align-items")).toBe("center");
      expect(css(chip, "white-space")).toBe("nowrap");
    });
  });

  it("lets the SECOND LINE wrap, so a whole chip (or the number) moves to the next line", async () => {
    await openWithChips();
    const lines = [...document.querySelectorAll(".hotline-meta")];
    expect(lines).toHaveLength(4); // one per row
    lines.forEach((line) => {
      expect(css(line, "display")).toBe("flex");
      expect(css(line, "flex-wrap")).toBe("wrap");
      expect(css(line, "align-items")).toBe("center");
    });
    // a chip is never wider than the line
    chipsOf().forEach((chip) => expect(css(chip, "max-width")).toBe("100%"));
  });

  it("gives every chip the same height, with the icon beside its text and not above it", async () => {
    await openWithChips();
    const heights = new Set(chipsOf().map((chip) => css(chip, "min-height")));
    expect([...heights]).toEqual(["24px"]);
    const withIcon = chipsOf().filter((chip) => chip.querySelector("svg"));
    expect(withIcon).toHaveLength(2);
    withIcon.forEach((chip) => {
      // in the chip, the icon comes first and the text second, as two flex items of ONE row
      expect([...chip.children].map((el) => el.tagName.toLowerCase())).toEqual(["svg", "span"]);
      expect(css(chip.querySelector("svg"), "flex")).toMatch(/^(0 0 auto|none)/);
    });
    // the same height whether it has an icon or not
    const descriptionChip = chipsOf().find((chip) => !chip.querySelector("svg"));
    expect(css(descriptionChip, "min-height")).toBe("24px");
    expect(css(descriptionChip, "display")).toBe("inline-flex");
  });

  it("does not split a very long email in two: one text, one line, cut with an ellipsis if it cannot fit", async () => {
    await openWithChips();
    const chip = [...document.querySelectorAll(".hotline-chip")].find((c) => c.textContent.includes("a-very-long-domain"));
    const text = chip.querySelector(".hotline-chip-text");
    // the whole address is ONE text, in ONE element (nothing splits it into two lines' worth of boxes)
    expect(text.textContent).toBe(LONG_EMAIL);
    expect(text.childNodes).toHaveLength(1);
    expect(css(text, "white-space")).toBe("nowrap");
    expect(css(text, "overflow")).toBe("hidden");
    expect(css(text, "text-overflow")).toBe("ellipsis");
    expect(css(text, "min-width")).toMatch(/^0(px)?$/);
    // the person can still read all of it
    expect(chip.getAttribute("title")).toBe(LONG_EMAIL);
  });

  it("keeps the other small parts of the row on one line too: the status pill and the buttons", async () => {
    await openWithChips();
    const row = rowOf(1);
    expect(css(row.querySelector(".options-status"), "white-space")).toBe("nowrap");
    row.querySelectorAll(".hotline-actions button").forEach((button) => {
      expect(css(button, "white-space")).toBe("nowrap");
    });
  });
});

describe("the second line: the number and the chips side by side", () => {
  const rows = () => [
    contact(1, "Plain Row"),
    contact(2, "Email Row", { email: "one@example.com" }),
    contact(3, "Description Row", { description: "A short note" }),
    contact(4, "Both Row", { email: "two@example.com", description: "Another short note" }),
  ];
  async function open() {
    const data = rows();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data })
    );
    render(<EmergencyHotlinesPanel />);
    await screen.findByRole("list");
  }

  it("puts the number and the chips in ONE flex row, as neighbours (not one block under the other)", async () => {
    await open();
    [2, 3, 4].forEach((id) => {
      const meta = rowOf(id).querySelector(".hotline-meta");
      const number = meta.querySelector(".hotline-number");
      const chips = [...meta.querySelectorAll(".hotline-chip")];
      expect(chips.length).toBeGreaterThan(0);
      expect(css(meta, "display")).toBe("flex");
      expect(css(meta, "flex-direction") || "row").toMatch(/^row/);
      // the number and every chip are direct children of that one row
      expect(number.parentElement).toBe(meta);
      chips.forEach((chip) => expect(chip.parentElement).toBe(meta));
      // and the first chip comes right after the number, on the same line
      expect(number.nextElementSibling).toBe(chips[0]);
    });
    // the row has exactly two lines in its text part: the name, then this one
    expect(
      [...rowOf(4).querySelector(".hotline-main").children].map((el) => el.className.split(" ")[0])
    ).toEqual(["hotline-name", "hotline-meta"]);
  });

  it("gives a row with no email and no description just two lines and no chip place", async () => {
    await open();
    const main = rowOf(1).querySelector(".hotline-main");
    expect([...main.children].map((el) => el.className.split(" ")[0])).toEqual(["hotline-name", "hotline-meta"]);
    const meta = main.querySelector(".hotline-meta");
    expect([...meta.children].map((el) => el.className)).toEqual(["hotline-number"]);
    expect(main.querySelectorAll(".hotline-chip")).toHaveLength(0);
    // nothing empty is standing in for a chip
    const empties = [...main.querySelectorAll("*")].filter((el) => el.children.length === 0 && el.textContent.trim() === "" && el.tagName.toLowerCase() !== "svg" && !el.closest("svg"));
    expect(empties).toEqual([]);
  });

  it("lets two chips wrap as WHOLE chips: the number and each chip are items of one wrapping row", async () => {
    await open();
    const meta = rowOf(4).querySelector(".hotline-meta");
    expect([...meta.children].map((el) => el.className.split(" ")[0])).toEqual([
      "hotline-number",
      "hotline-chip",
      "hotline-chip",
    ]);
    expect(css(meta, "flex-wrap")).toBe("wrap");
    meta.querySelectorAll(".hotline-chip").forEach((chip) => {
      expect(css(chip, "white-space")).toBe("nowrap"); // never split inside
      expect(css(chip, "display")).toBe("inline-flex");
      expect(css(chip, "max-width")).toBe("100%");
    });
    // the earlier rules still hold: the icon is on the first line, the right group is in the middle
    const row = rowOf(4);
    expect(css(row.querySelector(".hotline-body"), "align-items")).toBe("flex-start");
    expect(css(row, "align-items")).toBe("center");
  });

  it("leaves the preview card alone: it has no chips, so it has no second-line row either", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const preview = screen.getByRole("group", { name: "Preview" });
    expect(preview.querySelector(".hotline-meta")).toBeNull();
    expect(preview.querySelector(".hotline-chip")).toBeNull();
    expect([...preview.querySelector(".hotline-main").children].map((el) => el.className.split(" ")[0])).toEqual([
      "hotline-name",
      "hotline-number",
    ]);
  });
});
