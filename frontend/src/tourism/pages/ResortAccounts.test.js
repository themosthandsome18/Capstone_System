// The Resort Accounts page: the staff of the resorts, in groups, and the form that adds one. A small fake of the server sits behind a fake fetch, so the REAL
// tourismApi builds the requests. Synthetic data only: no real person, username or password.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import ResortAccounts from "./ResortAccounts";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { EXCLUDED_DESTINATION_NAMES } from "../utils/resortAccounts";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const resort = (id, name, extra = {}) => ({ resort_id: id, resort_name: name, is_active: true, ...extra });
const RESORTS = [
  resort(1, "Alpha Beach Resort"),
  resort(2, "Bravo Cove"),
  resort(3, "Charlie Springs"),
  resort(4, "Delta Closed Resort", { is_active: false }),
  resort(5, "Others / Private Residence"),
  resort(6, "Kwebang Lampas"),
  resort(7, "Day tour"),
];

let nextId;
const person = (extra) => ({
  id: nextId++,
  username: `user${nextId}`,
  name: `Staff ${nextId}`,
  resort: { id: 1, name: "Alpha Beach Resort" },
  is_active: true,
  last_login: null,
  ...extra,
});

function reply(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}

let server;
function makeServer(list) {
  const state = { list, requests: [], failNext: null };
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
    if (method === "POST" && route === "/resort-staff/") {
      const found = RESORTS.find((item) => item.resort_id === body.resort_id);
      const created = person({ name: body.name, username: body.username, resort: { id: found.resort_id, name: found.resort_name } });
      state.list = [...state.list, created];
      return reply(201, created);
    }
    return reply(404, { detail: "Not found." });
  };
  return state;
}

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function open(list, role = "tourism") {
  server = makeServer(list);
  global.fetch = jest.fn((url, options) => server.fetch(url, options));
  useAuth.mockReturnValue({ role });
  useTourismData.mockReturnValue({ referenceTables: { resorts: RESORTS } });
  const view = render(<ResortAccounts />);
  await settled();
  return view;
}

beforeEach(() => {
  nextId = 100;
  router.__setSearch("");
});
afterEach(settled);

const groups = () => screen.queryAllByTestId("staff-group");
const groupNamed = (name) => groups().find((group) => group.getAttribute("aria-label") === name);
const field = (label) => screen.getByLabelText(label);
const posts = () => server.requests.filter((request) => request.method === "POST");

function fill(values = {}) {
  const all = { resort: "1", name: "Maria Santos", username: "maria.s", password: "first-pass-1", again: "first-pass-1", ...values };
  fireEvent.change(field("Resort"), { target: { value: all.resort } });
  fireEvent.change(field("Staff name"), { target: { value: all.name } });
  fireEvent.change(field("Username"), { target: { value: all.username } });
  fireEvent.change(field("First password"), { target: { value: all.password } });
  fireEvent.change(field("Repeat password"), { target: { value: all.again } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create account" }));

describe("the heading of the page", () => {
  it("says what the page is and who an account is for", async () => {
    await open([]);
    expect(screen.getByText("Administration").className).toContain("mobile-content-eyebrow");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Resort Accounts");
    expect(screen.getByText(/^One account per staff member, not per resort\./)).toBeTruthy();
  });

  it("is refused to a role that may not open it, and asks the server for nothing", async () => {
    await open([], "sanitation");
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(server.requests).toEqual([]);
  });
});

describe("the staff, in groups", () => {
  it("shows the staff grouped by resort, each with its count and the name, username and last visit", async () => {
    await open([
      person({ name: "Ana Reyes", username: "ana.r", last_login: "2026-10-03T08:00:00Z" }),
      person({ name: "Ben Cruz", username: "ben.c" }),
      person({ name: "Cora Lim", username: "cora.l", resort: { id: 2, name: "Bravo Cove" } }),
    ]);
    expect(groups().map((group) => group.getAttribute("aria-label"))).toEqual(["Alpha Beach Resort", "Bravo Cove"]);
    const alpha = groupNamed("Alpha Beach Resort");
    expect(within(alpha).getByText("2 staff")).toBeTruthy();
    expect(within(groupNamed("Bravo Cove")).getByText("1 staff")).toBeTruthy();
    expect(within(alpha).getAllByTestId("staff-row")).toHaveLength(2);
    expect(within(alpha).getByText(/^ana\.r · last signed in .*2026/)).toBeTruthy();
    expect(within(alpha).getByText("ben.c · has not signed in yet")).toBeTruthy();
    expect(within(alpha).getAllByText("Open")).toHaveLength(2);
  });

  it("a closed account says Closed and stays in its group; the counts of the card count it", async () => {
    await open([person({ name: "Ana Reyes", is_active: false }), person({ name: "Ben Cruz" }), person({ name: "Cora Lim", resort: { id: 2, name: "Bravo Cove" } })]);
    const alpha = groupNamed("Alpha Beach Resort");
    expect(within(alpha).getAllByTestId("staff-row")).toHaveLength(2);
    const row = within(alpha).getByText("Ana Reyes").closest("[data-testid='staff-row']");
    expect(within(row).getByText("Closed")).toBeTruthy();
    expect(within(alpha).getByText("2 staff")).toBeTruthy();
    expect(screen.getByTestId("staff-count").textContent).toBe("2 open · 1 closed");
  });

  it("a staff row has no button in it, and nothing on the page deletes", async () => {
    await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", is_active: false })]);
    const rows = screen.getAllByTestId("staff-row");
    expect(rows).toHaveLength(2); // the fixture: the rows were drawn
    rows.forEach((row) => {
      expect(within(row).queryAllByRole("button")).toHaveLength(0);
      expect(row.querySelector("button, a, input, [role='button']")).toBeNull();
      expect(row.textContent).toContain("›");
    });
    const words = screen.getAllByRole("button").map((button) => button.textContent.toLowerCase());
    expect(words.length).toBeGreaterThan(0);
    words.forEach((text) => expect(text).not.toMatch(/delete|burahin ang (account|staff)|alisin|tanggalin/));
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("the only buttons of the page are the form's two, the two eyes and one Add for each group, none of them inside a row", async () => {
    const { container } = await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } })]);
    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") || button.textContent);
    expect(names.sort()).toEqual(["Add", "Add", "Clear", "Create account", "Show password", "Show password"].sort());
    screen.getAllByRole("button").forEach((button) => expect(button.closest("li")).toBeNull());
    expect(container.querySelectorAll("li.mobile-content-staff-row button, li.mobile-content-staff-row a, li.mobile-content-staff-row [tabindex]")).toHaveLength(0);
  });

  it("clicking a row does nothing yet: no request, no change", async () => {
    await open([person({ name: "Ana Reyes" })]);
    const before = server.requests.length;
    fireEvent.click(screen.getByText("Ana Reyes"));
    expect(server.requests.length).toBe(before);
  });

  it("never asks for a DELETE, however the page is used", async () => {
    await open([person({ name: "Ana Reyes" })]);
    fill();
    submit();
    await settled();
    expect(server.requests.some((request) => request.method === "DELETE")).toBe(false);
  });
});

describe("the resorts with no staff", () => {
  it("a resort with no staff is in the third card, as a chip; a resort with staff is not", async () => {
    await open([person({ name: "Ana Reyes" })]);
    const card = screen.getByRole("region", { name: "No one can scan" });
    const chips = within(card).getAllByTestId("no-staff-chip").map((chip) => chip.textContent);
    expect(chips).toEqual(["Bravo Cove", "Charlie Springs"]);
    expect(within(card).getByText("2 resorts")).toBeTruthy();
    expect(within(card).getByText("Choose the resort above to add someone.")).toBeTruthy();
    expect(within(card).queryByTestId("staff-row")).toBeNull();
  });

  it("a resort with three staff who are ALL closed is in the card: nobody there can scan", async () => {
    await open([
      person({ name: "Ana Reyes", is_active: false }),
      person({ name: "Ben Cruz", is_active: false }),
      person({ name: "Cora Lim", is_active: false }),
    ]);
    expect(within(groupNamed("Alpha Beach Resort")).getAllByTestId("staff-row")).toHaveLength(3); // the fixture: it has three staff
    const card = screen.getByRole("region", { name: "No one can scan" });
    expect(within(card).getAllByTestId("no-staff-chip").map((chip) => chip.textContent)).toEqual(["Alpha Beach Resort", "Bravo Cove", "Charlie Springs"]);
    expect(within(card).getByText("3 resorts")).toBeTruthy();
    expect(within(card).getByText("These resorts have no open account")).toBeTruthy();
  });

  it("ONE open account is enough to leave the card, whatever the others are", async () => {
    await open([person({ name: "Ana Reyes", is_active: false }), person({ name: "Ben Cruz" }), person({ name: "Cora Lim", is_active: false })]);
    const chips = screen.getAllByTestId("no-staff-chip").map((chip) => chip.textContent);
    expect(chips).toEqual(["Bravo Cove", "Charlie Springs"]);
  });

  it("the card stays while any resort has only closed accounts, even if every resort has staff", async () => {
    await open([
      person({ name: "Ana Reyes" }),
      person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } }),
      person({ name: "Cora Lim", resort: { id: 3, name: "Charlie Springs" }, is_active: false }),
    ]);
    expect(screen.getAllByTestId("no-staff-chip").map((chip) => chip.textContent)).toEqual(["Charlie Springs"]);
  });

  it("the card disappears when every resort has an OPEN staff member", async () => {
    await open([
      person({ name: "Ana Reyes" }),
      person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } }),
      person({ name: "Cora Lim", resort: { id: 3, name: "Charlie Springs" } }),
    ]);
    expect(screen.queryByRole("region", { name: "No one can scan" })).toBeNull();
    expect(screen.queryByTestId("no-staff-chip")).toBeNull();
    expect(groups()).toHaveLength(3); // the fixture: the staff were drawn
  });

  it("it never lists a closed or excluded destination", async () => {
    await open([]);
    const chips = screen.getAllByTestId("no-staff-chip").map((chip) => chip.textContent);
    expect(chips).toEqual(["Alpha Beach Resort", "Bravo Cove", "Charlie Springs"]);
  });

  it("after a staff member is added to the last resort, the card is gone", async () => {
    await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } })]);
    expect(screen.getAllByTestId("no-staff-chip")).toHaveLength(1);
    fill({ resort: "3" });
    submit();
    await settled();
    expect(screen.queryByRole("region", { name: "No one can scan" })).toBeNull();
  });
});

describe("the form", () => {
  it("the resort box offers only open destinations: no closed one, no placeholder, no Kwebang", async () => {
    await open([]);
    const names = [...field("Resort").querySelectorAll("option")].map((option) => option.textContent);
    expect(names).toEqual(["Choose a resort…", "Alpha Beach Resort", "Bravo Cove", "Charlie Springs"]);
    ["Delta Closed Resort", "Others / Private Residence", "Kwebang Lampas", "Day tour"].forEach((name) => expect(names).not.toContain(name));
  });

  it("two passwords that differ give a message and NO request", async () => {
    await open([]);
    fill({ again: "something-else-9" });
    submit();
    await settled();
    expect(screen.getByTestId("form-problem").textContent).toBe("The two passwords do not match. Please type them again.");
    expect(posts()).toHaveLength(0);
  });

  it.each([
    ["the second box left empty", { again: "" }],
    ["a difference only in the capitals", { password: "first-pass-1", again: "First-pass-1" }],
    ["the second one longer by a space", { password: "first-pass-1", again: "first-pass-1 " }],
  ])("%s: the mismatch message, and NO request", async (_label, values) => {
    await open([]);
    fill(values);
    submit();
    await settled();
    expect(screen.getByTestId("form-problem").textContent).toBe("The two passwords do not match. Please type them again.");
    expect(posts()).toHaveLength(0);
  });

  it.each([
    ["no resort", { resort: "" }],
    ["no name", { name: "  " }],
    ["a username with a capital", { username: "Maria" }],
    ["a password under eight", { password: "short", again: "short" }],
  ])("%s: a message, and NO request", async (_label, values) => {
    await open([]);
    fill(values);
    submit();
    await settled();
    expect(screen.getByTestId("form-problem").textContent).not.toBe("");
    expect(posts()).toHaveLength(0);
  });

  it("a good form sends exactly resort_id, name, username and password, and the new staff appears in the list", async () => {
    await open([person({ name: "Ana Reyes" })]);
    fill({ resort: "2", name: " Maria Santos ", username: "maria.s" });
    submit();
    await settled();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].route).toBe("/resort-staff/");
    expect(posts()[0].body).toEqual({ resort_id: 2, name: "Maria Santos", username: "maria.s", password: "first-pass-1" });
    const bravo = groupNamed("Bravo Cove");
    expect(within(bravo).getByText("Maria Santos")).toBeTruthy();
    expect(within(bravo).getByText("1 staff")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Account created for Maria Santos.");
  });

  it("after it is sent the form is empty and the password is nowhere on the page", async () => {
    const { container } = await open([]);
    fill();
    submit();
    await settled();
    expect(field("First password").value).toBe("");
    expect(field("Repeat password").value).toBe("");
    expect(field("Username").value).toBe("");
    expect(container.textContent).not.toContain("first-pass-1");
  });

  it("a refusal of the server is shown, and the form is kept", async () => {
    await open([]);
    fill();
    server.failNext = { status: 400, detail: "This username is already in use." };
    submit();
    await settled();
    expect(screen.getByRole("alert").textContent).toContain("This username is already in use.");
    expect(field("Username").value).toBe("maria.s");
  });

  it("Clear empties the boxes and sends nothing", async () => {
    await open([]);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(field("Staff name").value).toBe("");
    expect(field("Resort").value).toBe("");
    expect(posts()).toHaveLength(0);
  });

  it("Add in the head of a group sets the resort of the form", async () => {
    await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } })]);
    expect(field("Resort").value).toBe("");
    fireEvent.click(within(groupNamed("Bravo Cove")).getByRole("button", { name: "Add" }));
    expect(field("Resort").value).toBe("2");
    fireEvent.click(within(groupNamed("Alpha Beach Resort")).getByRole("button", { name: "Add" }));
    expect(field("Resort").value).toBe("1");
    expect(posts()).toHaveLength(0);
  });
});

describe("the answer of the form: one, new, and beside the buttons", () => {
  const TAKEN = "This username is already in use.";
  const card = () => screen.getByRole("form", { name: "Add a staff member" });
  const everyAnswer = () => [...document.querySelectorAll("[role='alert'], [role='status']")];
  const refuse = async () => {
    fill();
    server.failNext = { status: 400, detail: TAKEN };
    submit();
    await settled();
    expect(screen.getByRole("alert").textContent).toBe(TAKEN); // the fixture: the old answer is on screen
  };

  it("an old answer of the server, then a mistake in the form: ONE message, the new one", async () => {
    await open([]);
    await refuse();
    fireEvent.change(field("First password"), { target: { value: "short" } }); // (he starts to put it right...)
    submit();
    await settled();
    const answers = everyAnswer();
    expect(answers).toHaveLength(1);
    expect(answers[0].textContent).toBe("The password must be at least eight characters.");
    expect(screen.queryByText(TAKEN)).toBeNull();
  });

  it("an old answer of 'done', then a send of a form that is wrong WITHOUT being typed in: only the new message (the old one goes first of all)", async () => {
    await open([]);
    fill();
    submit();
    await settled();
    expect(screen.getByRole("status").textContent).toBe("Account created for Maria Santos."); // the fixture: the old answer
    submit(); // the form is empty now: nothing was typed since
    await settled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(everyAnswer()).toHaveLength(1);
    expect(screen.getByTestId("form-problem").textContent).toBe("Choose a resort.");
  });

  it.each([
    ["Resort", "2"],
    ["Staff name", "Another Name"],
    ["Username", "another.user"],
    ["First password", "another-pass-2"],
    ["Repeat password", "another-pass-2"],
  ])("an old answer of the server goes the moment the %s box is changed", async (label, value) => {
    await open([]);
    await refuse();
    fireEvent.change(field(label), { target: { value } });
    expect(everyAnswer()).toHaveLength(0);
    expect(screen.queryByText(TAKEN)).toBeNull();
  });

  it("an old answer goes when a resort is chosen with Add, and when the boxes are emptied", async () => {
    await open([person({ name: "Ana Reyes" })]);
    await refuse();
    fireEvent.click(within(groupNamed("Alpha Beach Resort")).getByRole("button", { name: "Add" }));
    expect(everyAnswer()).toHaveLength(0);
    await refuse();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(everyAnswer()).toHaveLength(0);
  });

  it("the answers are INSIDE the card of the form, beside its buttons, and not in the top of the page", async () => {
    const { container } = await open([]);
    await refuse();
    const answer = screen.getByRole("alert");
    expect(answer.closest("form")).toBe(card());
    const box = answer.closest("[data-testid='form-message']");
    expect(box).not.toBeNull();
    // by position: after the boxes, before the footer with the two buttons, and the page has no message area above its cards
    expect(field("Repeat password").compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(screen.getByRole("button", { name: "Create account" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.nextElementSibling.querySelector("button")).not.toBeNull(); // the very next thing is the footer with the buttons
    expect(container.querySelector(".options-message-area")).toBeNull();
    const page = container.firstElementChild;
    const beforeTheCard = [...page.children].slice(0, [...page.children].findIndex((child) => child.contains(card())));
    beforeTheCard.forEach((child) => expect(child.querySelector("[role='alert'], [role='status']")).toBeNull());
    // the form's own message and the 'done' are in the same place
    fireEvent.change(field("First password"), { target: { value: "short" } });
    submit();
    expect(screen.getByTestId("form-problem").closest("form")).toBe(card());
  });

  it("a successful creation leaves no message but its own 'done', and no error", async () => {
    await open([]);
    await refuse();
    submit(); // the same form, sent again: the server now accepts it
    await settled();
    expect(everyAnswer().map((item) => item.getAttribute("role"))).toEqual(["status"]);
    expect(screen.queryByText(TAKEN)).toBeNull();
    expect(screen.queryByTestId("form-problem")).toBeNull();
  });

  it("the answer of the server is the sentence of the server, and says nothing of any module", async () => {
    await open([]);
    await refuse();
    const text = screen.getByRole("alert").textContent;
    expect(text).toBe(TAKEN);
    ["sanitation", "sanitary", "tourism", "module", "admin", "resort", "staff"].forEach((word) => expect(text.toLowerCase()).not.toContain(word));
  });
});

describe("English, all of it", () => {
  const TAGALOG = /kawani|resort na|walang|pindutin|piliin|gumawa|burahin|ulitin|nagawa|pumasok|pumapasok|\bbukas\b|\bsarado\b|magdagdag|isulat|hindi|ang mga|ng mga/i;

  it("no Tagalog is left in what the page builds: the page, a refusal, a wrong form, the 'done', a group of closed staff", async () => {
    const { container } = await open([
      person({ name: "Ana Reyes", is_active: false, last_login: "2026-10-03T08:00:00Z" }),
      person({ name: "Ben Cruz" }),
    ]);
    const seen = [container.textContent];
    seen.push(...[...container.querySelectorAll("[aria-label],[placeholder],[title]")].map((el) => `${el.getAttribute("aria-label")} ${el.getAttribute("placeholder")} ${el.getAttribute("title")}`));
    submit(); // empty form: the message of the form
    seen.push(container.textContent);
    fill({ again: "else-1234" });
    submit(); // the two passwords differ
    seen.push(container.textContent);
    fill();
    server.failNext = { status: 400, detail: "This username is already in use." };
    submit();
    await settled();
    seen.push(container.textContent);
    submit();
    await settled(); // the 'done'
    seen.push(container.textContent);
    expect(seen.join("\n")).toContain("Account created for"); // the fixture: the last state was reached
    expect(seen.join("\n")).toContain("do not match"); // ...and the one before
    seen.forEach((text) => expect(text).not.toMatch(TAGALOG));
  });

  it("the words of the page are the ones the owner gave", async () => {
    const { container } = await open([person({ name: "Ana Reyes", is_active: false }), person({ name: "Ben Cruz" })]);
    const text = container.textContent;
    [
      "Add a staff member",
      "Give the username and the first password to them in person. It is not sent anywhere.",
      "Staff name",
      "This is the name the check-in record will show.",
      "Eight characters or more.",
      "This account opens the scanner and nothing else.",
      "Grouped by resort",
      "1 open · 1 closed",
      "2 staff",
      "has not signed in yet",
      "Tap a name for the details: their scans, a new password, and closing the account. There is no Delete here",
      "No one can scan",
      "These resorts have no open account",
      "Choose the resort above to add someone.",
    ].forEach((words) => expect(text).toContain(words));
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
  });

  it("one resort is '1 resort', more are 'N resorts'", async () => {
    await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } })]);
    expect(screen.getByText("1 resort")).toBeTruthy();
  });
});

describe("the place of the password boxes", () => {
  const cells = () => [...document.querySelector(".mobile-content-staff-grid").children];
  const cellOf = (label) => cells().findIndex((cell) => cell.contains(field(label)));
  const column = (index) => index % 2; // two columns: 0 is the left one
  const row = (index) => Math.floor(index / 2);

  it("the grid has exactly the cells of the plan, in order, with one empty cell under the Username", async () => {
    await open([]);
    const names = cells().map((cell) => (cell.matches(".mobile-content-staff-spacer") ? "" : cell.querySelector("label").textContent));
    expect(names).toEqual(["Resort", "Staff name", "Username", "First password", "", "Repeat password"]);
  });

  it("Repeat password is in the same column as First password, in the row right UNDER it", async () => {
    await open([]);
    const first = cellOf("First password");
    const again = cellOf("Repeat password");
    expect(first).toBeGreaterThan(-1);
    expect(again).toBeGreaterThan(-1);
    expect(column(again)).toBe(column(first));
    expect(row(again)).toBe(row(first) + 1);
    expect(column(first)).toBe(1); // the right column
  });

  it("Username is at the LEFT of First password, in the same row", async () => {
    await open([]);
    const username = cellOf("Username");
    const first = cellOf("First password");
    expect(row(username)).toBe(row(first));
    expect(column(username)).toBe(0);
    expect(column(first)).toBe(1);
  });

  it("the empty cell is hidden on a narrow screen, so the two passwords still follow each other", () => {
    const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
    const block = CSS.slice(CSS.indexOf("RESORT ACCOUNTS: the page of the staff"));
    expect(block).toMatch(/\.mobile-content-staff-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    expect(block).toMatch(/@media \(max-width: 640px\) \{\s*\.mobile-content-staff-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
    expect(block).toMatch(/@media \(max-width: 640px\) \{\s*\.mobile-content-staff-spacer \{\s*display: none;/);
  });
});

describe("the eye of the password boxes", () => {
  const box = (label) => field(label);
  const eyeOf = (label) => box(label).closest(".mobile-content-staff-secret").querySelector("button");

  it("both are hidden to begin with, and each has its own button inside its box", async () => {
    await open([]);
    ["First password", "Repeat password"].forEach((label) => {
      expect(box(label).getAttribute("type")).toBe("password");
      const eye = eyeOf(label);
      expect(eye).not.toBeNull();
      expect(eye.getAttribute("aria-label")).toBe("Show password");
      expect(eye.getAttribute("type")).toBe("button");
      expect(eye.querySelector("svg")).not.toBeNull(); // an icon, as the other icons of the page
    });
    expect(screen.getAllByRole("button", { name: "Show password" })).toHaveLength(2);
    expect(eyeOf("First password")).not.toBe(eyeOf("Repeat password"));
  });

  it("the first eye shows only the first box, and the second eye only the second", async () => {
    await open([]);
    fireEvent.click(eyeOf("First password"));
    expect(box("First password").getAttribute("type")).toBe("text");
    expect(box("Repeat password").getAttribute("type")).toBe("password");
    expect(eyeOf("Repeat password").getAttribute("aria-label")).toBe("Show password");
    fireEvent.click(eyeOf("First password"));
    fireEvent.click(eyeOf("Repeat password"));
    expect(box("Repeat password").getAttribute("type")).toBe("text");
    expect(box("First password").getAttribute("type")).toBe("password");
    expect(eyeOf("First password").getAttribute("aria-label")).toBe("Show password");
  });

  it("the label changes when it is pressed, and changes back", async () => {
    await open([]);
    const eye = eyeOf("First password");
    fireEvent.click(eye);
    expect(eye.getAttribute("aria-label")).toBe("Hide password");
    expect(eye.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(eye);
    expect(eye.getAttribute("aria-label")).toBe("Show password");
    expect(box("First password").getAttribute("type")).toBe("password");
  });

  it("pressing an eye sends nothing and keeps what was typed", async () => {
    await open([]);
    fill();
    fireEvent.click(eyeOf("First password"));
    expect(box("First password").value).toBe("first-pass-1");
    expect(posts()).toHaveLength(0);
  });

  it("the password is in no message: not of the form, not of the server, not of the 'done'", async () => {
    const { container } = await open([]);
    fill({ password: "secret-word-77", again: "other-word-88" });
    fireEvent.click(eyeOf("First password"));
    submit();
    expect(screen.getByTestId("form-message").textContent).not.toContain("secret-word-77");
    expect(screen.getByTestId("form-message").textContent).not.toContain("other-word-88");
    fill({ password: "secret-word-77", again: "secret-word-77" });
    server.failNext = { status: 400, detail: "This username is already in use." };
    submit();
    await settled();
    expect(screen.getByTestId("form-message").textContent).not.toContain("secret-word-77");
    submit();
    await settled();
    expect(screen.getByRole("status").textContent).toBe("Account created for Maria Santos.");
    expect(container.textContent).not.toContain("secret-word-77");
    expect([...container.querySelectorAll("input")].some((input) => input.value.includes("secret-word-77"))).toBe(false);
  });
});

describe("the colours of the tags", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const block = CSS.slice(CSS.indexOf("RESORT ACCOUNTS: the page of the staff"));
  const rule = (selector) => {
    const start = block.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1); // the fixture: the rule was found
    return block.slice(start, block.indexOf("\n}", start));
  };

  it("Open is the info status with the text of the admin", () => {
    const open = rule('.mobile-content-staff-tag[data-status="open"]');
    expect(open).toContain("var(--th-info-bg)");
    expect(open).toContain("var(--th-info)");
    expect(rule(".mobile-content-staff-tag")).toContain("color: var(--th-text-main)");
  });

  it("Closed is NOT a status: no warning and no danger, the paper brown and the text of the admin", () => {
    const closed = rule('.mobile-content-staff-tag[data-status="closed"]');
    expect(closed).not.toMatch(/th-warning|th-danger|th-info/);
    expect(closed).toContain("background: #f2eae1");
    expect(closed).toContain("color: var(--th-text-main)");
    expect(block).not.toMatch(/th-warning|th-danger/); // nowhere on the page
  });

  it("the tags are drawn from data-status, so a closed account really gets the closed rule", async () => {
    await open([person({ name: "Ana Reyes", is_active: false }), person({ name: "Ben Cruz" })]);
    expect(screen.getByText("Closed").getAttribute("data-status")).toBe("closed");
    expect(screen.getByText("Open").getAttribute("data-status")).toBe("open");
  });
});

describe("the words and the backend list", () => {
  it("the excluded names are the ones the server excludes (backend/api/views/mobile.py)", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "backend", "api", "views", "mobile.py"), "utf8");
    const block = /MOBILE_EXCLUDED_DESTINATION_NAMES = \{([^}]*)\}/.exec(source);
    expect(block).not.toBeNull(); // the fixture: the list was found
    const names = [...block[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]).sort();
    expect(names.length).toBeGreaterThan(5);
    expect([...EXCLUDED_DESTINATION_NAMES].sort()).toEqual(names);
  });
});
