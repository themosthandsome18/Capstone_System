// The Emergency Hotlines scenarios behind the golden file (Mobile App Content, Commit 4).
//
// Each scenario mounts the page, drives it the way a person does (through the real tourismApi and a fake
// fetch), and records two things: what is ON THE SCREEN (the outer HTML of the notices, the message area,
// the form and the list) and every REQUEST that was sent (method, path, body). The golden file was taken from
// the old page (origin/main, 552c048) BEFORE the page was split into a panel and a page, and the same scenarios were run on
// the new code, which had to give the same record except for a short, written list of differences. The four places were
// RE-RECORDED once, on 2026-10-31, when PR #23 changed the page on purpose (see EmergencyHotlines.golden.test.js); the helper
// has no record mode of its own: the golden file is written from what runScenarios returns, and the header (`chrome`) of
// the old page stays as it was taken.
//
// This is a helper, not a test: it needs the Jest globals (jest, expect) of the test that calls it.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const contact = (id, name, icon, order, extra = {}) => ({
  id,
  name,
  contact_numbers: `0${id}00-111-${id}${id}${id}${id}`,
  email: "",
  description: "",
  icon,
  display_order: order,
  is_active: true,
  ...extra,
});

export const freshContacts = () => [
  contact(4, "Zulu Rescue Base", "rescue", 10),
  contact(9, "Mike Police Post", "police", 20, { email: "mike@example.com" }),
  contact(2, "Echo Coast Guard", "coast_guard", 30, { description: "Boats and sea rescue", is_active: false }),
  contact(7, "Tango Help Desk", "help_desk", 40),
];

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

// A small fake of the server behind a fake fetch: the REAL tourismApi / apiRequest build the requests.
export function createServer(start = freshContacts()) {
  const server = { contacts: start, requests: [], failNext: null };
  const ordered = () => [...server.contacts].sort((a, b) => a.display_order - b.display_order || a.id - b.id);

  server.fetch = (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const path = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    if (!options.__released) server.requests.push({ method, path, body });
    if (server.hold && method !== "GET") {
      // a write that has not been answered yet: the page is "working" until server.release() is called
      const hold = server.hold;
      server.hold = null;
      return new Promise((resolve) => {
        server.release = () => resolve(server.fetch(url, { ...options, __released: true }) );
        hold();
      });
    }
    if (server.failNext) {
      const failure = server.failNext;
      server.failNext = null;
      return reply(failure.status, failure.body);
    }
    const match = path.match(/^\/emergency-contacts\/(?:(\d+)\/|(reorder)\/)?(deactivate\/|reactivate\/)?$/);
    if (!match) return reply(404, { detail: "no such route" });
    const [, idText, reorderPart, action] = match;
    if (reorderPart) {
      body.ids.forEach((id, position) => {
        server.contacts.find((c) => c.id === id).display_order = (position + 1) * 10;
      });
      return reply(200, ordered());
    }
    if (!idText) {
      if (method === "GET") return reply(200, ordered());
      if (method === "POST") {
        const created = contact(Math.max(...server.contacts.map((c) => c.id)) + 1, body.name.trim(), body.icon, 50, {
          contact_numbers: body.contact_numbers,
          email: body.email,
          description: body.description,
        });
        server.contacts.push(created);
        return reply(201, created);
      }
      return reply(405, { detail: "method not allowed" });
    }
    const found = server.contacts.find((c) => c.id === Number(idText));
    if (!found) return reply(404, { detail: "no such contact" });
    if (action === "deactivate/") {
      found.is_active = false;
      return reply(200, found);
    }
    if (action === "reactivate/") {
      found.is_active = true;
      return reply(200, found);
    }
    if (method === "PATCH") {
      Object.assign(found, body);
      return reply(200, found);
    }
    return reply(405, { detail: "method not allowed" });
  };
  return server;
}

const html = (element) => (element ? element.outerHTML : null);

// What is on the screen, in the four places the panel owns, plus the page chrome around them (recorded so that
// the difference between the old page and the new panel is written down, not assumed).
export function capture(container) {
  return {
    notices: html(container.querySelector(".hotlines-notices")),
    messages: html(container.querySelector(".options-message-area")),
    form: html(container.querySelector("form")),
    section: html(container.querySelector('section[aria-label="Emergency contacts"]')),
    chrome: html(container.querySelector(".reports-header")),
    // Not in the golden (the old page had no panel): the first thing in the panel, where the Add button now is.
    addRow: html(container.querySelector(".mobile-content-panel > :first-child")),
  };
}

const rowOf = (id) => screen.getByTestId(`hotline-row-${id}`);
const list = () => screen.findByRole("list");
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name) => fireEvent.click(screen.getByRole("button", { name }));
const submit = (name) => fireEvent.click(screen.getByRole("button", { name }));
const iconButtons = () => within(screen.getByRole("group", { name: "Icon" })).getAllByRole("button");

const SCENARIOS = [
  ["loading, then the list", async (s) => {
    s.snap("loading");
    await list();
    s.snap("list");
  }],
  ["filter: active, then inactive, then all", async (s) => {
    await list();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "active" } });
    s.snap("active");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "inactive" } });
    s.snap("inactive");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "all" } });
    s.snap("all");
  }],
  ["add: open, type, choose an icon, save", async (s) => {
    await list();
    press(/Add contact/);
    s.snap("blank form");
    type("Contact name", "  Delta Fire Station ");
    type("Contact numbers", "0999-111-2222 / 0999-333-4444");
    type("Contact email", "fire@example.com");
    type("Contact description", "Day and night");
    fireEvent.click(iconButtons()[3]);
    s.snap("typed, icon chosen");
    submit("Save new contact");
    await screen.findByText("The contact was added.");
    s.snap("saved");
  }],
  ["add: the server refuses", async (s) => {
    await list();
    press(/Add contact/);
    type("Contact name", "Zulu Rescue Base");
    type("Contact numbers", "1");
    s.server.failNext = { status: 400, body: { detail: "A contact with that name already exists." } };
    submit("Save new contact");
    await screen.findByText("A contact with that name already exists.");
    s.snap("refused");
  }],
  ["add: open twice closes the form; cancel", async (s) => {
    await list();
    press(/Add contact/);
    press(/Add contact/);
    s.snap("closed by the second press");
    press(/Add contact/);
    press("Cancel");
    s.snap("closed by Cancel");
  }],
  ["edit: open, change the numbers, save", async (s) => {
    await list();
    press("Edit Mike Police Post");
    s.snap("edit form");
    type("Contact numbers", "0911-222-3333");
    s.snap("changed");
    submit("Save changes");
    await screen.findByText("The change was saved.");
    s.snap("saved");
  }],
  ["edit: change the icon only", async (s) => {
    await list();
    press("Edit Tango Help Desk");
    fireEvent.click(iconButtons()[1]);
    submit("Save changes");
    await screen.findByText("The change was saved.");
    s.snap("saved");
  }],
  ["edit: the server refuses", async (s) => {
    await list();
    press("Edit Zulu Rescue Base");
    type("Contact name", "Mike Police Post");
    s.server.failNext = { status: 400, body: { detail: "That name is taken." } };
    submit("Save changes");
    await screen.findByText("That name is taken.");
    s.snap("refused");
  }],
  ["deactivate, then reactivate", async (s) => {
    await list();
    press("Deactivate Zulu Rescue Base");
    await screen.findByText("Zulu Rescue Base was deactivated.");
    s.snap("deactivated");
    press("Reactivate Zulu Rescue Base");
    await screen.findByText("Zulu Rescue Base was reactivated.");
    s.snap("reactivated");
  }],
  ["deactivate: the server refuses", async (s) => {
    await list();
    s.server.failNext = { status: 403, body: { detail: "Administrator privileges are required." } };
    press("Deactivate Zulu Rescue Base");
    await screen.findByText("Administrator privileges are required.");
    s.snap("refused");
  }],
  ["a write is on its way: nothing can be pressed, the list stays on screen", async (s) => {
    await list();
    let started;
    const begun = new Promise((resolve) => {
      started = resolve;
    });
    s.server.hold = started;
    press("Deactivate Zulu Rescue Base");
    await begun;
    await waitFor(() => expect(screen.getByRole("button", { name: /Add contact/ }).disabled).toBe(true));
    s.snap("while the write is on its way");
    s.server.release();
    await screen.findByText("Zulu Rescue Base was deactivated.");
    s.snap("answered");
  }],
  ["move: down, up, and a refusal", async (s) => {
    await list();
    press("Move Zulu Rescue Base down");
    await screen.findByText("The order was changed.");
    s.snap("moved down");
    press("Move Zulu Rescue Base up");
    await waitFor(() => expect(s.server.requests.filter((r) => r.path === "/emergency-contacts/reorder/")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Tango Help Desk up" }).disabled).toBe(false)); // the write has been answered
    s.snap("moved up");
    s.server.failNext = { status: 400, body: { detail: "The list changed. Reload and try again." } };
    press("Move Tango Help Desk up");
    await screen.findByText("The list changed. Reload and try again.");
    s.snap("refused");
  }],
  ["the list cannot be loaded, then it can", async (s) => {
    await screen.findByText(/The server is down\./);
    s.snap("load error");
    press("Try again");
    await list();
    s.snap("after Try again");
  }],
  ["an icon the page does not know", async (s) => {
    await list();
    s.snap("unknown icon shown as other");
    press("Edit Zulu Rescue Base");
    s.snap("edit form of it");
  }],
  ["no contacts at all", async (s) => {
    await screen.findByText(/No contacts to show/);
    s.snap("empty");
  }],
];

// What has to be true of the server BEFORE the page is mounted (it asks for the list as soon as it opens).
const SETUP = {
  "the list cannot be loaded, then it can": (server) => {
    server.failNext = { status: 500, body: { detail: "The server is down." } };
  },
  "an icon the page does not know": (server) => {
    server.contacts[0].icon = "zzz_unknown";
  },
  "no contacts at all": (server) => {
    server.contacts.length = 0;
  },
};

export const SCENARIO_NAMES = SCENARIOS.map(([name]) => name);

// mount() -> { container, unmount }. Returns [{ name, snaps: [{ label, ...capture }], requests }].
export async function runScenarios(mount) {
  const record = [];
  for (const [name, run] of SCENARIOS) {
    const server = createServer();
    if (SETUP[name]) SETUP[name](server);
    global.fetch = jest.fn(server.fetch);
    const snaps = [];
    const view = mount();
    await run({ server, snap: (label) => snaps.push({ label, ...capture(view.container) }) });
    record.push({ name, snaps, requests: server.requests.map((r) => ({ ...r })) });
    view.unmount();
  }
  return record;
}
