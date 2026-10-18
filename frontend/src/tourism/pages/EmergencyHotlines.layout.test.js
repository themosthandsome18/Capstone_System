import { fireEvent, render, screen } from "@testing-library/react";
import EmergencyHotlines from "./EmergencyHotlines";
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
    render(<EmergencyHotlines />);
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
    render(<EmergencyHotlines />);
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

  it("lets the CHIP LIST wrap, so a whole chip moves to the next line", async () => {
    await openWithChips();
    const lists = [...document.querySelectorAll(".hotline-chips")];
    expect(lists).toHaveLength(3);
    lists.forEach((list) => {
      expect(css(list, "display")).toBe("flex");
      expect(css(list, "flex-wrap")).toBe("wrap");
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
