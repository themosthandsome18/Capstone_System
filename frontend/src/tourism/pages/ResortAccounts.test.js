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
  fireEvent.change(field("Pangalan ng kawani"), { target: { value: all.name } });
  fireEvent.change(field("Username"), { target: { value: all.username } });
  fireEvent.change(field("Unang password"), { target: { value: all.password } });
  fireEvent.change(field("Ulitin ang password"), { target: { value: all.again } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Gumawa ng account" }));

describe("the heading of the page", () => {
  it("says what the page is and who an account is for", async () => {
    await open([]);
    expect(screen.getByText("Administration").className).toContain("mobile-content-eyebrow");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Resort Accounts");
    expect(screen.getByText(/Isang account bawat KAWANI, hindi bawat resort\./)).toBeTruthy();
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
    expect(within(alpha).getByText("2 kawani")).toBeTruthy();
    expect(within(groupNamed("Bravo Cove")).getByText("1 kawani")).toBeTruthy();
    expect(within(alpha).getAllByTestId("staff-row")).toHaveLength(2);
    expect(within(alpha).getByText(/^ana\.r · huling pumasok .*2026/)).toBeTruthy();
    expect(within(alpha).getByText("ben.c · hindi pa pumapasok")).toBeTruthy();
    expect(within(alpha).getAllByText("Bukas")).toHaveLength(2);
  });

  it("a closed account says Sarado and stays in its group; the counts of the card count it", async () => {
    await open([person({ name: "Ana Reyes", is_active: false }), person({ name: "Ben Cruz" }), person({ name: "Cora Lim", resort: { id: 2, name: "Bravo Cove" } })]);
    const alpha = groupNamed("Alpha Beach Resort");
    expect(within(alpha).getAllByTestId("staff-row")).toHaveLength(2);
    const row = within(alpha).getByText("Ana Reyes").closest("[data-testid='staff-row']");
    expect(within(row).getByText("Sarado")).toBeTruthy();
    expect(within(alpha).getByText("2 kawani")).toBeTruthy();
    expect(screen.getByTestId("staff-count").textContent).toBe("2 bukas · 1 sarado");
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
    words.forEach((text) => expect(text).not.toMatch(/delete|burahin ang (account|kawani)|alisin|tanggalin/));
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("the only buttons of the page are the form's two and one Magdagdag for each group, none of them inside a row", async () => {
    const { container } = await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } })]);
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(names.sort()).toEqual(["Burahin ang nasulat", "Gumawa ng account", "Magdagdag", "Magdagdag"]);
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
    const card = screen.getByRole("region", { name: "Walang makakapag-scan" });
    const chips = within(card).getAllByTestId("no-staff-chip").map((chip) => chip.textContent);
    expect(chips).toEqual(["Bravo Cove", "Charlie Springs"]);
    expect(within(card).getByText("2 resort")).toBeTruthy();
    expect(within(card).getByText("Piliin ang resort sa itaas para makapagdagdag.")).toBeTruthy();
    expect(within(card).queryByTestId("staff-row")).toBeNull();
  });

  it("a resort with three staff who are ALL closed is in the card: nobody there can scan", async () => {
    await open([
      person({ name: "Ana Reyes", is_active: false }),
      person({ name: "Ben Cruz", is_active: false }),
      person({ name: "Cora Lim", is_active: false }),
    ]);
    expect(within(groupNamed("Alpha Beach Resort")).getAllByTestId("staff-row")).toHaveLength(3); // the fixture: it has three staff
    const card = screen.getByRole("region", { name: "Walang makakapag-scan" });
    expect(within(card).getAllByTestId("no-staff-chip").map((chip) => chip.textContent)).toEqual(["Alpha Beach Resort", "Bravo Cove", "Charlie Springs"]);
    expect(within(card).getByText("3 resort")).toBeTruthy();
    expect(within(card).getByText("Walang bukas na account ang mga resort na ito")).toBeTruthy();
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
    expect(screen.queryByRole("region", { name: "Walang makakapag-scan" })).toBeNull();
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
    expect(screen.queryByRole("region", { name: "Walang makakapag-scan" })).toBeNull();
  });
});

describe("the form", () => {
  it("the resort box offers only open destinations: no closed one, no placeholder, no Kwebang", async () => {
    await open([]);
    const names = [...field("Resort").querySelectorAll("option")].map((option) => option.textContent);
    expect(names).toEqual(["Pumili ng resort", "Alpha Beach Resort", "Bravo Cove", "Charlie Springs"]);
    ["Delta Closed Resort", "Others / Private Residence", "Kwebang Lampas", "Day tour"].forEach((name) => expect(names).not.toContain(name));
  });

  it("two passwords that differ give a message and NO request", async () => {
    await open([]);
    fill({ again: "something-else-9" });
    submit();
    await settled();
    expect(screen.getByTestId("form-problem").textContent).toBe("Hindi pareho ang dalawang password. Isulat ulit.");
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
    expect(screen.getByTestId("form-problem").textContent).toBe("Hindi pareho ang dalawang password. Isulat ulit.");
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
    expect(within(bravo).getByText("1 kawani")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Nagawa na ang account ni Maria Santos.");
  });

  it("after it is sent the form is empty and the password is nowhere on the page", async () => {
    const { container } = await open([]);
    fill();
    submit();
    await settled();
    expect(field("Unang password").value).toBe("");
    expect(field("Ulitin ang password").value).toBe("");
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

  it("Burahin ang nasulat empties the boxes and sends nothing", async () => {
    await open([]);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Burahin ang nasulat" }));
    expect(field("Pangalan ng kawani").value).toBe("");
    expect(field("Resort").value).toBe("");
    expect(posts()).toHaveLength(0);
  });

  it("Magdagdag in the head of a group sets the resort of the form", async () => {
    await open([person({ name: "Ana Reyes" }), person({ name: "Ben Cruz", resort: { id: 2, name: "Bravo Cove" } })]);
    expect(field("Resort").value).toBe("");
    fireEvent.click(within(groupNamed("Bravo Cove")).getByRole("button", { name: "Magdagdag" }));
    expect(field("Resort").value).toBe("2");
    fireEvent.click(within(groupNamed("Alpha Beach Resort")).getByRole("button", { name: "Magdagdag" }));
    expect(field("Resort").value).toBe("1");
    expect(posts()).toHaveLength(0);
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

  it("Bukas is the info status with the text of the admin", () => {
    const open = rule('.mobile-content-staff-tag[data-status="open"]');
    expect(open).toContain("var(--th-info-bg)");
    expect(open).toContain("var(--th-info)");
    expect(rule(".mobile-content-staff-tag")).toContain("color: var(--th-text-main)");
  });

  it("Sarado is NOT a status: no warning and no danger, the paper brown and the text of the admin", () => {
    const closed = rule('.mobile-content-staff-tag[data-status="closed"]');
    expect(closed).not.toMatch(/th-warning|th-danger|th-info/);
    expect(closed).toContain("background: #f2eae1");
    expect(closed).toContain("color: var(--th-text-main)");
    expect(block).not.toMatch(/th-warning|th-danger/); // nowhere on the page
  });

  it("the tags are drawn from data-status, so a closed account really gets the closed rule", async () => {
    await open([person({ name: "Ana Reyes", is_active: false }), person({ name: "Ben Cruz" })]);
    expect(screen.getByText("Sarado").getAttribute("data-status")).toBe("closed");
    expect(screen.getByText("Bukas").getAttribute("data-status")).toBe("open");
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
