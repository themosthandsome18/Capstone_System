// The details of one staff member (a modal opened from the row) and the panel of the limit, on the Resort Accounts page. A small fake of the server sits
// behind a fake fetch, so the REAL tourismApi builds the requests. Synthetic data only: no real person, username or password.
import fs from "fs";
import path from "path";
import { fireEvent, render, screen, within, act } from "@testing-library/react";
import ResortAccounts from "./ResortAccounts";
import { LIMIT_CANNOT } from "./ResortStaffLimit";
import { dateText, firstNameOf } from "./ResortStaffDetail";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const RESORTS = [
  { resort_id: 1, resort_name: "Alpha Beach Resort", is_active: true },
  { resort_id: 2, resort_name: "Bravo Cove", is_active: true },
];

const ANA = {
  id: 11,
  username: "ana.r",
  name: "Ana Maria Reyes",
  resort: { id: 1, name: "Alpha Beach Resort" },
  is_active: true,
  date_joined: "2026-09-02T09:00:00Z",
  last_login: "2026-11-03T09:00:00Z",
  created_by: "office.one",
  scan_count: 7,
  visitor_count: 31,
  scan_count_month: 1,
  visitor_count_month: 4,
  last_scan_at: "2026-11-05T09:00:00Z",
};
const BEN = {
  id: 12,
  username: "ben.c",
  name: "Ben Cruz",
  resort: { id: 2, name: "Bravo Cove" },
  is_active: true,
  date_joined: "2026-10-01T09:00:00Z",
  last_login: null,
  created_by: null,
  scan_count: 0,
  visitor_count: 0,
  scan_count_month: 0,
  visitor_count_month: 0,
  last_scan_at: null,
};

function reply(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}

let server;
function makeServer(list) {
  const state = { list: list.map((item) => ({ ...item })), requests: [], failNext: null };
  state.fetch = (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const route = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    state.requests.push({ method, route, body });
    if (state.failNext) {
      const failure = state.failNext;
      state.failNext = null;
      return reply(failure.status, { detail: failure.detail });
    }
    if (method === "GET" && route === "/resort-staff/") return reply(200, state.list);
    const patch = /^\/resort-staff\/(\d+)\/$/.exec(route);
    if (method === "PATCH" && patch) {
      const found = state.list.find((item) => item.id === Number(patch[1]));
      if (body.is_active !== undefined) found.is_active = body.is_active;
      return reply(200, found);
    }
    return reply(404, { detail: "Not found." });
  };
  return state;
}

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function open(list = [ANA, BEN]) {
  server = makeServer(list);
  global.fetch = jest.fn((url, options) => server.fetch(url, options));
  useAuth.mockReturnValue({ role: "tourism" });
  useTourismData.mockReturnValue({ referenceTables: { resorts: RESORTS } });
  const view = render(<ResortAccounts />);
  await settled();
  return view;
}

afterEach(settled);

const rowOf = (name) => screen.getAllByTestId("staff-row").find((row) => within(row).queryByText(name));
const patches = () => server.requests.filter((request) => request.method === "PATCH");
const dialog = () => screen.getByRole("dialog");
async function openDetail(name = "Ana Maria Reyes") {
  fireEvent.click(rowOf(name));
  await settled();
  return dialog();
}
const fact = (label) => within(dialog()).getByText(label, { selector: "dt" }).closest("div").querySelector("dd").textContent;
const newPassword = () => within(dialog()).getByLabelText("New password", { selector: "input" });
const repeat = () => within(dialog()).getByLabelText("Repeat password", { selector: "input" });
const eyeOf = (box) => box.closest(".mobile-content-staff-secret").querySelector("button");
function typePasswords(first, second) {
  fireEvent.change(newPassword(), { target: { value: first } });
  fireEvent.change(repeat(), { target: { value: second } });
}
const send = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Change password" }));

describe("opening the details", () => {
  it("there is no details before a row is pressed", async () => {
    await open();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pressing a row opens the details of THAT staff member, whichever row it is", async () => {
    await open();
    await openDetail("Ben Cruz");
    expect(within(dialog()).getByRole("heading", { level: 2 }).textContent).toBe("Ben Cruz");
    expect(fact("Username")).toBe("ben.c");
    fireEvent.keyDown(document, { key: "Escape" });
    await openDetail("Ana Maria Reyes");
    expect(within(dialog()).getByRole("heading", { level: 2 }).textContent).toBe("Ana Maria Reyes");
    expect(fact("Username")).toBe("ana.r");
  });

  it("the row can also be opened with Enter", async () => {
    await open();
    fireEvent.keyDown(rowOf("Ben Cruz"), { key: "Enter" });
    expect(within(dialog()).getByRole("heading", { level: 2 }).textContent).toBe("Ben Cruz");
  });

  it("Escape closes it, and so does a press outside; a press inside does not", async () => {
    await open();
    await openDetail();
    fireEvent.click(within(dialog()).getByRole("heading", { level: 2 }));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await openDetail();
    fireEvent.click(dialog().parentElement); // the backdrop
    expect(screen.queryByRole("dialog")).toBeNull();
    await openDetail();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opening it asks the server for nothing more", async () => {
    await open();
    const before = server.requests.length;
    await openDetail();
    expect(server.requests.length).toBe(before);
  });
});

describe("what the details say", () => {
  it("the head: the initial, the name, the resort, and the three chips", async () => {
    await open();
    await openDetail();
    expect(screen.getByTestId("staff-initial").textContent).toBe("A");
    expect(within(dialog()).getByText("Alpha Beach Resort", { selector: "p" })).toBeTruthy();
    const chips = [...dialog().querySelectorAll(".mobile-content-staff-chips-row > span")].map((chip) => chip.textContent);
    expect(chips).toEqual(["Open", "Resort staff", "ana.r"]);
    expect(within(dialog()).getByText("Open", { selector: ".mobile-content-staff-tag" }).getAttribute("data-status")).toBe("open"); // (the same rule as the list)
  });

  it("the two boxes of numbers come from the server", async () => {
    await open();
    await openDetail();
    const all = within(screen.getByTestId("number-all"));
    expect(all.getByText("Visitors taken in")).toBeTruthy();
    expect(all.getByText("31")).toBeTruthy();
    expect(all.getByText("in 7 scans")).toBeTruthy();
    const month = within(screen.getByTestId("number-month"));
    expect(month.getByText("This month")).toBeTruthy();
    expect(month.getByText("4")).toBeTruthy();
    expect(month.getByText("in 1 scan")).toBeTruthy();
  });

  it("the account: the dates and names come from the server", async () => {
    await open();
    await openDetail();
    expect(fact("Username")).toBe("ana.r");
    expect(fact("Resort")).toBe("Alpha Beach Resort");
    expect(fact("Created on")).toBe(dateText(ANA.date_joined));
    expect(fact("Created by")).toBe("office.one");
    expect(fact("Last signed in")).toBe(dateText(ANA.last_login));
    expect(fact("Last scan")).toBe(dateText(ANA.last_scan_at));
    expect(fact("Created on")).toMatch(/2026/);
    expect(fact("Last scan")).not.toBe("Not yet");
  });

  it("a value that is not there says Not yet", async () => {
    await open();
    await openDetail("Ben Cruz");
    expect(fact("Created by")).toBe("Not yet");
    expect(fact("Last signed in")).toBe("Not yet");
    expect(fact("Last scan")).toBe("Not yet");
    expect(within(screen.getByTestId("number-all")).getByText("in 0 scans")).toBeTruthy();
  });
});

describe("the new password", () => {
  it("the two boxes are one above the other in one stack, each with its own eye, hidden to begin with", async () => {
    await open();
    await openDetail();
    const stack = newPassword().closest(".mobile-content-staff-stack");
    expect(stack).not.toBeNull();
    expect(repeat().closest(".mobile-content-staff-stack")).toBe(stack);
    expect(newPassword().compareDocumentPosition(repeat()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...stack.children]).toHaveLength(2); // two fields, one under the other
    expect(newPassword().getAttribute("type")).toBe("password");
    expect(repeat().getAttribute("type")).toBe("password");
    expect(eyeOf(newPassword())).not.toBe(eyeOf(repeat()));
    expect(within(dialog()).getAllByRole("button", { name: "Show password" })).toHaveLength(2);
  });

  it("the two eyes are apart: one shows only its own box", async () => {
    await open();
    await openDetail();
    fireEvent.click(eyeOf(newPassword()));
    expect(newPassword().getAttribute("type")).toBe("text");
    expect(repeat().getAttribute("type")).toBe("password");
    expect(eyeOf(newPassword()).getAttribute("aria-label")).toBe("Hide password");
    expect(eyeOf(repeat()).getAttribute("aria-label")).toBe("Show password");
  });

  it("the notes are there", async () => {
    await open();
    await openDetail();
    const text = dialog().textContent;
    [
      "The password cannot be shown. Give the new one to them in person.",
      "The two must match. Eight characters or more.",
      "They will be signed out of the app and will need to sign in again with the new one.",
    ].forEach((words) => expect(text).toContain(words));
  });

  it("two passwords that differ: a message, and NO PATCH", async () => {
    await open();
    await openDetail();
    typePasswords("first-pass-1", "first-pass-2");
    send();
    await settled();
    expect(screen.getByTestId("detail-problem").textContent).toBe("The two passwords do not match. Please type them again.");
    expect(patches()).toHaveLength(0);
  });

  it.each([
    ["the second box left empty", "brand-new-pass-9", ""],
    ["a difference only in the capitals", "brand-new-pass-9", "Brand-new-pass-9"],
    ["the second one longer by a space", "brand-new-pass-9", "brand-new-pass-9 "],
  ])("%s: the mismatch message, and NO PATCH", async (_label, first, second) => {
    await open();
    await openDetail();
    typePasswords(first, second);
    send();
    await settled();
    expect(screen.getByTestId("detail-problem").textContent).toBe("The two passwords do not match. Please type them again.");
    expect(patches()).toHaveLength(0);
  });

  it.each([
    ["both short and equal", "short", "short"],
    ["short and the other empty", "short", ""],
    ["seven characters", "1234567", "1234567"],
  ])("%s: a message, and NO PATCH", async (_label, first, second) => {
    await open();
    await openDetail();
    typePasswords(first, second);
    send();
    await settled();
    expect(screen.getByTestId("detail-problem").textContent).toBe("The password must be at least eight characters.");
    expect(patches()).toHaveLength(0);
  });

  it("a good change: exactly one PATCH of the password to that account, a message that it was done, and the boxes emptied", async () => {
    await open();
    await openDetail();
    typePasswords("brand-new-pass-9", "brand-new-pass-9");
    send();
    await settled();
    expect(patches()).toHaveLength(1);
    expect(patches()[0].route).toBe("/resort-staff/11/");
    expect(patches()[0].body).toEqual({ password: "brand-new-pass-9" });
    expect(screen.getByRole("status").textContent).toBe("Password changed for Ana.");
    expect(newPassword().value).toBe("");
    expect(repeat().value).toBe("");
  });

  it("the password is in no message", async () => {
    const { container } = await open();
    await openDetail();
    typePasswords("brand-new-pass-9", "other-new-pass-8");
    send();
    typePasswords("brand-new-pass-9", "brand-new-pass-9");
    send();
    await settled();
    expect(container.textContent).not.toContain("brand-new-pass-9");
    expect(container.textContent).not.toContain("other-new-pass-8");
  });

  it("an old answer goes when something is typed, and when it is sent again", async () => {
    await open();
    await openDetail();
    typePasswords("brand-new-pass-9", "brand-new-pass-9");
    send();
    await settled();
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.change(newPassword(), { target: { value: "x" } });
    expect(screen.queryByRole("status")).toBeNull();
    typePasswords("brand-new-pass-9", "brand-new-pass-9");
    send();
    await settled();
    send(); // the boxes are empty: the old "done" must not stay beside the new message
    await settled();
    expect(screen.queryByRole("status")).toBeNull();
    expect([...document.querySelectorAll("[role='alert'], [role='status']")]).toHaveLength(1);
  });
});

describe("closing and reopening", () => {
  it("the button carries the FIRST name only", async () => {
    await open();
    await openDetail();
    expect(firstNameOf("Ana Maria Reyes")).toBe("Ana");
    expect(within(dialog()).getByRole("button", { name: "Close Ana's account" })).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /Maria|Reyes/ })).toBeNull();
    expect(within(dialog()).getByText(/will not be able to sign in, but every scan they made stays on record/)).toBeTruthy();
  });

  it("closing sends exactly is_active false to that account, and the tag in the list behind becomes Closed", async () => {
    await open();
    const row = rowOf("Ana Maria Reyes");
    expect(within(row).getByText("Open")).toBeTruthy(); // the fixture: it is open
    await openDetail();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close Ana's account" }));
    await settled();
    expect(patches()).toHaveLength(1);
    expect(patches()[0].route).toBe("/resort-staff/11/");
    expect(patches()[0].body).toEqual({ is_active: false });
    expect(within(rowOf("Ana Maria Reyes")).getByText("Closed")).toBeTruthy();
    expect(screen.getByTestId("staff-count").textContent).toBe("1 open · 1 closed");
    expect(within(dialog()).getByRole("button", { name: "Reopen Ana's account" })).toBeTruthy();
  });

  it("the list is asked for again after a change", async () => {
    await open();
    const before = server.requests.filter((request) => request.method === "GET").length;
    await openDetail();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close Ana's account" }));
    await settled();
    expect(server.requests.filter((request) => request.method === "GET").length).toBe(before + 1);
  });

  it("a closed account says it can sign in again once reopened, and Reopen works", async () => {
    await open([{ ...ANA, is_active: false }, BEN]);
    await openDetail();
    expect(within(dialog()).getByText("They can sign in again once this is reopened.")).toBeTruthy();
    expect(within(dialog()).queryByText(/will not be able to sign in/)).toBeNull();
    expect(within(dialog()).getByText("Closed", { selector: ".mobile-content-staff-chips-row span" }).getAttribute("data-status")).toBe("closed");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Reopen Ana's account" }));
    await settled();
    expect(patches()[0].body).toEqual({ is_active: true });
    expect(within(rowOf("Ana Maria Reyes")).getByText("Open")).toBeTruthy();
    expect(within(dialog()).getByRole("button", { name: "Close Ana's account" })).toBeTruthy();
  });

  it("a refusal of the server is shown, and nothing changes behind", async () => {
    await open();
    await openDetail();
    server.failNext = { status: 400, detail: "Something went wrong." };
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close Ana's account" }));
    await settled();
    expect(within(dialog()).getByRole("alert").textContent).toBe("Something went wrong.");
    expect(within(rowOf("Ana Maria Reyes")).getByText("Open")).toBeTruthy();
  });

  it("nothing in the details deletes: no button, no DELETE", async () => {
    await open();
    await openDetail();
    const names = within(dialog()).getAllByRole("button").map((button) => button.getAttribute("aria-label") || button.textContent);
    expect(names.length).toBeGreaterThan(3);
    names.forEach((name) => expect(name).not.toMatch(/delete|remove|erase|burahin/i));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close Ana's account" }));
    await settled();
    expect(server.requests.some((request) => request.method === "DELETE")).toBe(false);
    expect(within(dialog()).getByText("There is no Delete here, as with the hotlines and the advisories.")).toBeTruthy();
  });
});

describe("the panel of the limit", () => {
  it("is at the right of the three cards, which are in the left column", async () => {
    const { container } = await open();
    const layout = container.querySelector(".mobile-content-staff-layout");
    expect(layout).not.toBeNull();
    const [left, right] = [...layout.children];
    expect(left.classList.contains("mobile-content-staff-main")).toBe(true);
    expect(within(left).getByRole("form", { name: "Add a staff member" })).toBeTruthy();
    expect(within(left).getByRole("region", { name: "Staff" })).toBeTruthy();
    expect(right.getAttribute("aria-label")).toBe("The limit");
    expect(within(right).queryByRole("form")).toBeNull();
  });

  it("says what it must: the heading, the three boxes of the phone and the note", async () => {
    await open();
    const panel = screen.getByLabelText("The limit");
    ["The limit", "This is all they can do", "A staff account in the app", "Tourist QR Check-In", "Search a Survey ID", "Scan QR Code", "Tourist History Log"].forEach((words) =>
      expect(within(panel).getByText(words)).toBeTruthy()
    );
    expect(within(panel).getByText("Only their own resort appears. A booking made with another resort is refused.")).toBeTruthy();
    expect(within(panel).getByText(/They can change the details of a visitor booked with them/)).toBeTruthy();
  });

  it("has FOUR lines under 'They cannot open', each with a cross", async () => {
    await open();
    const panel = screen.getByLabelText("The limit");
    expect(within(panel).getByText("They cannot open")).toBeTruthy();
    const lines = within(screen.getByTestId("cannot-list")).getAllByRole("listitem");
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.textContent)).toEqual(LIMIT_CANNOT.map((line) => `×${line}`));
    lines.forEach((line) => expect(line.querySelector(".mobile-content-staff-cross").textContent).toBe("×"));
    expect(LIMIT_CANNOT).toEqual([
      "The admin system on the web — any page",
      "Another resort's records",
      "Sanitation and its advisories",
      "A fellow staff member's account",
    ]);
  });

  it("does not say a staff member cannot open Export: they can, and it carries only their own check-ins", async () => {
    await open();
    const panel = screen.getByLabelText("The limit");
    expect(panel.textContent).not.toMatch(/export/i);
    expect(panel.textContent).not.toMatch(/download/i);
    LIMIT_CANNOT.forEach((line) => expect(line).not.toMatch(/export|download/i));
    expect(within(screen.getByTestId("cannot-list")).queryByText(/Export/)).toBeNull();
    // the real fence of what they can reach is still said
    expect(within(panel).getByText("Another resort's records")).toBeTruthy();
  });

  it("is a picture and a list: no button, no link, no box to type in", async () => {
    await open();
    const panel = screen.getByLabelText("The limit");
    expect(panel.querySelectorAll("button, a, input, select, textarea, [tabindex]")).toHaveLength(0);
  });
});

describe("the look of the new parts, read from the CSS", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const block = CSS.slice(CSS.indexOf("RESORT ACCOUNTS: the page of the staff"));
  const rule = (selector) => {
    const start = block.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1); // the fixture: the rule was found
    return block.slice(start, block.indexOf("\n}", start));
  };

  it("the panel stays when the page is scrolled: it is sticky", () => {
    const panel = rule(".mobile-content-staff-limit");
    expect(panel).toContain("position: sticky;");
    expect(panel).toMatch(/top: \d+px;/);
    expect(panel).toContain("align-self: start;"); // (without it a grid cell stretches and cannot stick)
  });

  it("the page is two columns: the cards, and the panel at the right", () => {
    expect(rule(".mobile-content-staff-layout")).toMatch(/grid-template-columns: minmax\(0, 1fr\) 340px;/);
  });

  it("the details: 560 wide, the head, the initial box, the numbers", () => {
    expect(rule(".mobile-content-staff-modal")).toContain("width: 560px;");
    expect(rule(".mobile-content-staff-modal-head")).toContain("padding: 20px 22px 18px;");
    expect(rule(".mobile-content-staff-modal-head")).toContain("border-bottom: 1px solid");
    const initial = rule(".mobile-content-staff-initial");
    ["width: 56px;", "height: 56px;", "border-radius: 16px;", "background: var(--th-primary);", "color: var(--th-text-inverse);"].forEach((line) => expect(initial).toContain(line));
    expect(rule(".mobile-content-staff-modal-who h2")).toMatch(/font-size: 24px;[\s\S]*font-weight: 800;/);
    const x = rule(".mobile-content-staff-x");
    ["width: 32px;", "height: 32px;", "border-radius: 999px;"].forEach((line) => expect(x).toContain(line));
    expect(rule(".mobile-content-staff-number strong")).toMatch(/font-size: 22px;[\s\S]*font-weight: 800;/);
  });

  it("the phone: the dark frame and the cream screen", () => {
    const phone = rule(".mobile-content-staff-phone");
    expect(phone).toContain("background: #1d1713;");
    expect(phone).toContain("border-radius: 26px;");
    expect(phone).toContain("padding: 8px;");
    const screenRule = rule(".mobile-content-staff-screen");
    expect(screenRule).toContain("background: #fdf6ee;");
    expect(screenRule).toContain("border-radius: 20px;");
    expect(rule(".mobile-content-staff-screen-box.is-main")).toContain("background: var(--mc-app-brand);"); // the brown of the app, not the theme
    expect(rule(".mobile-content-staff-screen-box.is-main")).toContain("text-align: center;");
  });

  it("the close button is a red outline on white, and the crosses are red", () => {
    const danger = rule(".mobile-content-staff-btn.is-danger");
    expect(danger).toContain("border-color: var(--th-danger);");
    expect(danger).toContain("color: var(--th-danger);");
    expect(danger).toMatch(/background: #fff;/);
    expect(rule(".mobile-content-staff-cross")).toContain("color: var(--th-danger);");
  });
});
