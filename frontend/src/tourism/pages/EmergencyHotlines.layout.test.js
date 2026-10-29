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

const WHOLE_CSS = () => fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8");
// jsdom does not resolve var() from :root for this slice, so a colour is checked in two steps:
// the rule must point at a token, and the token must hold the app's value.
const tokenValue = (name) => {
  const m = WHOLE_CSS().match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`));
  return m ? m[1].toLowerCase() : null;
};

describe("the number and the email are small neutral boxes, as in the app", () => {
  const LONG_EMAIL = `${"very.long.address.".repeat(8)}name@a-very-long-domain-name-for-a-test.example.com`;

  async function openWith(rows) {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(rows), json: async () => rows })
    );
    render(<EmergencyHotlines />);
    await screen.findByRole("list");
  }
  const boxesOf = (row) => [...row.querySelectorAll(".hotline-box")];

  it("gives the number and the email the app's box: 11px, semi-bold, radius 7, padding 3px 8px", async () => {
    await openWith([contact(1, "Plain Row"), contact(2, "Email Row", { email: "one@example.com" })]);
    const boxes = [...boxesOf(rowOf(1)), ...boxesOf(rowOf(2))];
    expect(boxes).toHaveLength(3); // number | number + email: the fixture reached both kinds
    boxes.forEach((box) => {
      expect(css(box, "font-size")).toBe("11px");
      expect(css(box, "font-weight")).toBe("600");
      expect(css(box, "border-radius")).toBe("7px");
      expect(css(box, "padding")).toBe("3px 8px");
      expect(css(box, "max-width")).toBe("100%");
    });
  });

  it("paints the boxes with the neutral tokens, whose values are the app's #EFF5F7 and #3C4C55", () => {
    const rule = WHOLE_CSS().match(/\.hotline-box \{[^}]*\}/)[0];
    expect(rule).toContain("background: var(--th-contact-box-bg)");
    expect(rule).toContain("color: var(--th-contact-box-text)");
    expect(tokenValue("--th-contact-box-bg")).toBe("#eff5f7");
    expect(tokenValue("--th-contact-box-text")).toBe("#3c4c55");
  });

  it("does not take the icon's colour for the number any more, and has no chip rule left", () => {
    const all = WHOLE_CSS();
    const hotlines = all.slice(all.indexOf("/* ================= EMERGENCY HOTLINES"));
    expect(hotlines).not.toContain("hotline-chip");
    expect(hotlines).toContain(".hotline-box {"); // the fixture: the box rule is in the slice that was read
    const numberRules = hotlines.match(/[^}]*\.hotline-number[^{]*\{[^}]*\}/g) || [];
    numberRules.forEach((r) => expect(r).not.toContain("--contact-color"));
    expect(hotlines.match(/\.hotline-box \{[^}]*\}/)[0]).not.toContain("--contact-color");
  });

  it("puts the number and the email on ONE wrapping row, 6px apart, so a whole box drops to the next line", async () => {
    await openWith([contact(4, "Both Row", { email: "two@example.com", description: "Another short note" })]);
    const meta = rowOf(4).querySelector(".hotline-meta");
    expect([...meta.children].map((el) => el.className)).toEqual(["hotline-box hotline-number", "hotline-box hotline-email"]);
    expect(css(meta, "display")).toBe("flex");
    expect(css(meta, "flex-wrap")).toBe("wrap");
    expect(css(meta, "gap")).toMatch(/^6px( 6px)?$/);
  });

  it("keeps several numbers separated by a slash in ONE box", async () => {
    await openWith([contact(5, "Slash Row", { contact_numbers: "0917-111-2222 / (042) 555-0000 / 911" })]);
    const boxes = boxesOf(rowOf(5));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].textContent).toBe("0917-111-2222 / (042) 555-0000 / 911");
    expect(boxes[0].children).toHaveLength(0);
  });

  it("does not cut a very long email: one text in one box that may break inside, never wider than the line", async () => {
    await openWith([contact(2, "Email Row", { email: LONG_EMAIL })]);
    const box = rowOf(2).querySelector(".hotline-email");
    expect(box.textContent).toBe(LONG_EMAIL);
    expect(box.childNodes).toHaveLength(1);
    expect(css(box, "overflow-wrap")).toBe("anywhere");
    expect(css(box, "max-width")).toBe("100%");
  });

  it("has NO email box when the email is an empty text", async () => {
    await openWith([contact(1, "Plain Row", { email: "" }), contact(2, "Email Row", { email: "one@example.com" })]);
    expect(rowOf(2).querySelector(".hotline-email")).not.toBeNull(); // the fixture: a row WITH an email exists
    expect(rowOf(1).querySelector(".hotline-email")).toBeNull();
    expect(boxesOf(rowOf(1))).toHaveLength(1); // the number only
    const meta = rowOf(1).querySelector(".hotline-meta");
    expect([...meta.children].map((el) => el.className)).toEqual(["hotline-box hotline-number"]);
  });

  it("has NO description line, and no gap for it, when the description is an empty text", async () => {
    await openWith([
      contact(1, "Plain Row", { description: "" }),
      contact(3, "Description Row", { description: "A short note" }),
    ]);
    expect(rowOf(3).querySelector(".hotline-note").textContent).toBe("A short note"); // the fixture
    expect(rowOf(1).querySelector(".hotline-note")).toBeNull();
    expect([...rowOf(1).querySelector(".hotline-main").children].map((el) => el.className.split(" ")[0])).toEqual([
      "hotline-name",
      "hotline-meta",
    ]);
  });

  it("shows the description under the boxes: 11.5px, 7px above, in the app's grey #5E6F77", async () => {
    await openWith([contact(4, "Both Row", { email: "two@example.com", description: "Another short note" })]);
    const main = rowOf(4).querySelector(".hotline-main");
    expect([...main.children].map((el) => el.className.split(" ")[0])).toEqual([
      "hotline-name",
      "hotline-meta",
      "hotline-note",
    ]);
    const note = main.querySelector(".hotline-note");
    expect(note.textContent).toBe("Another short note");
    expect(css(note, "font-size")).toBe("11.5px");
    expect(css(note, "margin-top")).toBe("7px");
    expect(WHOLE_CSS().match(/\.hotline-note \{[^}]*\}/)[0]).toContain("color: var(--th-contact-note-text)");
    expect(tokenValue("--th-contact-note-text")).toBe("#5e6f77");
  });

  it("keeps the other small parts of the row on one line: the status pill and the buttons", async () => {
    await openWith([contact(1, "Plain Row")]);
    const row = rowOf(1);
    expect(css(row.querySelector(".options-status"), "white-space")).toBe("nowrap");
    row.querySelectorAll(".hotline-actions button").forEach((button) => {
      expect(css(button, "white-space")).toBe("nowrap");
    });
    // the earlier rules still hold: the icon is on the first line, the right group is in the middle
    expect(css(row.querySelector(".hotline-body"), "align-items")).toBe("flex-start");
    expect(css(row, "align-items")).toBe("center");
  });

  it("shows the same boxes in the preview, with the email and description only when they are typed", async () => {
    await openWith([contact(1, "Plain Row")]);
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const preview = screen.getByRole("group", { name: "Preview" });
    expect([...preview.querySelector(".hotline-main").children].map((el) => el.className.split(" ")[0])).toEqual([
      "hotline-name",
      "hotline-meta",
    ]);
    expect(preview.querySelector(".hotline-number").classList.contains("hotline-box")).toBe(true);
    expect(preview.querySelector(".hotline-email")).toBeNull();
    expect(preview.querySelector(".hotline-note")).toBeNull();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Typed note" } });
    expect(preview.querySelector(".hotline-email").textContent).toBe("me@example.com");
    expect(preview.querySelector(".hotline-email").classList.contains("hotline-box")).toBe(true);
    expect(preview.querySelector(".hotline-note").textContent).toBe("Typed note");
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "" } });
    expect(preview.querySelector(".hotline-email")).toBeNull();
  });
});
