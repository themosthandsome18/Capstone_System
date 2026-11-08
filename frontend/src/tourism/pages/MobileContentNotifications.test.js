// The Notifications tab of Mobile App Content: it lists, sends and switches off the TOURISM notices only, through the endpoint that already exists
// (notifications/public/), and never deletes. A small fake of the server sits behind a fake fetch, so the REAL tourismApi builds the requests.
// Synthetic data only: no real notice, person or contact.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileContentNotifications, { EXPIRED_NOTE, FORM_HEADING, HIDDEN_HEADING, NOW_HEADING, SENT_NOTICE } from "./MobileContentNotifications";
import { MOBILE_CONTENT_TABS } from "../mobileContentAccess";
import { MESSAGE_MAX, TITLE_MAX } from "../utils/mobileContentNotifications";

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

let nextId;
const advisory = (extra) => ({
  id: nextId++,
  title: "Sample title",
  message: "Sample message",
  notification_type: "public_advisory",
  severity: "info",
  module: "tourism",
  action_url: "",
  is_active: true,
  created_at: iso(-1),
  expires_at: null,
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
    const path = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    state.requests.push({ method, path, body });
    if (state.failNext) {
      const failure = state.failNext;
      state.failNext = null;
      return reply(failure.status, { detail: failure.detail });
    }
    if (method === "GET" && path === "/notifications/public/") return reply(200, { results: state.list });
    if (method === "POST" && path === "/notifications/public/") {
      const created = advisory({ ...body, is_active: true, created_at: new Date().toISOString(), expires_at: body.expires_at || null });
      state.list = [created, ...state.list];
      return reply(201, created);
    }
    const patch = /^\/notifications\/public\/(\d+)\/$/.exec(path);
    if (method === "PATCH" && patch) {
      const found = state.list.find((item) => item.id === Number(patch[1]));
      Object.assign(found, body);
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

async function open(list) {
  server = makeServer(list);
  global.fetch = jest.fn((url, options) => server.fetch(url, options));
  render(<MobileContentNotifications />);
  await screen.findByRole("form", { name: FORM_HEADING });
  await settled();
}

const card = (name) => screen.getByRole("region", { name });
const nowRows = () => within(card(NOW_HEADING)).queryAllByTestId("now-row");
const hiddenRows = () => within(card(HIDDEN_HEADING)).queryAllByTestId("hidden-row");
const rowTitles = (rows) => rows.map((row) => row.querySelector("strong").textContent);
const writes = () => server.requests.filter((request) => request.method !== "GET");
const typeTitle = (value) => fireEvent.change(screen.getByLabelText("Pamagat"), { target: { value } });
const typeMessage = (value) => fireEvent.change(screen.getByLabelText("Mensahe"), { target: { value } });
const send = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Ipadala sa app" }));
  await settled();
};
const dateText = (daysAhead) => {
  const day = new Date();
  day.setDate(day.getDate() + daysAhead);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};

beforeEach(() => {
  nextId = 1;
});

describe("the tab is the sixth, and last", () => {
  it("is Notifications, built, after Emergency Hotlines", () => {
    const last = MOBILE_CONTENT_TABS[MOBILE_CONTENT_TABS.length - 1];
    expect(MOBILE_CONTENT_TABS).toHaveLength(6);
    expect([last.key, last.label, last.ready]).toEqual(["notifications", "Notifications", true]);
    expect(MOBILE_CONTENT_TABS[MOBILE_CONTENT_TABS.length - 2].key).toBe("hotlines");
  });
});

describe("what it lists", () => {
  const mixed = () => [
    advisory({ title: "Tourism live", module: "tourism" }),
    advisory({ title: "Sanitation live", module: "sanitation" }),
    advisory({ title: "General live", module: "general" }),
    advisory({ title: "Tourism off", module: "tourism", is_active: false }),
    advisory({ title: "Sanitation off", module: "sanitation", is_active: false }),
    advisory({ title: "Tourism expired", module: "tourism", expires_at: iso(-2) }),
  ];

  it("asks once, with a GET of notifications/public/", async () => {
    await open(mixed());
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /notifications/public/"]);
  });

  it("shows only the tourism notices: the sanitation and the general ones are nowhere, even when the server sent them all", async () => {
    await open(mixed());
    expect(server.list.some((item) => item.module === "sanitation")).toBe(true); // the fixture: the server did send them
    expect(server.list.some((item) => item.module === "general")).toBe(true);
    expect(screen.queryByText("Sanitation live")).toBeNull();
    expect(screen.queryByText("Sanitation off")).toBeNull();
    expect(screen.queryByText("General live")).toBeNull();
    expect(rowTitles(nowRows())).toEqual(["Tourism live"]);
    expect(rowTitles(hiddenRows()).sort()).toEqual(["Tourism expired", "Tourism off"]);
  });

  it("an expired notice is in the second list, not the first, and says when it ended", async () => {
    await open(mixed());
    expect(rowTitles(nowRows())).not.toContain("Tourism expired");
    const row = hiddenRows().find((item) => item.textContent.includes("Tourism expired"));
    expect(row.textContent).toMatch(/Lumipas noong/);
  });

  it("an expired notice has no button to bring it back (it would still be over); it says why", async () => {
    await open(mixed());
    const expired = hiddenRows().find((item) => item.textContent.includes("Tourism expired"));
    expect(within(expired).queryByRole("button", { name: "Ibalik sa app" })).toBeNull();
    expect(within(expired).getByText(EXPIRED_NOTE)).toBeTruthy();
    const off = hiddenRows().find((item) => item.textContent.includes("Tourism off"));
    expect(within(off).getByRole("button", { name: "Ibalik sa app" })).toBeTruthy();
  });

  it("a row shows the title, the message, the weight, the day it was sent and the days left", async () => {
    await open([advisory({ title: "Storm", message: "Heavy rain", severity: "critical", expires_at: iso(4.5) })]);
    const row = nowRows()[0];
    expect(row.textContent).toContain("Storm");
    expect(row.textContent).toContain("Heavy rain");
    expect(row.textContent).toContain("Mahalaga");
    expect(row.textContent).toContain("Ipinadala noong");
    expect(row.textContent).toMatch(/5 araw pa/);
  });

  it("with no end it says so", async () => {
    await open([advisory({ expires_at: null })]);
    expect(nowRows()[0].textContent).toContain("Walang hangga");
  });

  it("tells when a list is empty", async () => {
    await open([]);
    expect(nowRows()).toHaveLength(0);
    expect(within(card(NOW_HEADING)).getByText(/Wala pang abiso/)).toBeTruthy();
  });
});

describe("sending", () => {
  const fill = () => {
    typeTitle("  Sea advisory  ");
    typeMessage("  Boats may be delayed.  ");
  };

  it("POSTs the tourism module, the public audience, the weight info by default, and no end date", async () => {
    await open([]);
    fill();
    await send();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].method).toBe("POST");
    expect(writes()[0].path).toBe("/notifications/public/");
    expect(writes()[0].body).toEqual({ title: "Sea advisory", message: "Boats may be delayed.", severity: "info", module: "tourism", audience_type: "public" });
    expect(writes()[0].body).not.toHaveProperty("expires_at");
  });

  it.each([
    ["Impormasyon", "info"],
    ["Babala", "warning"],
    ["Mahalaga", "critical"],
  ])("the weight %s sends %s", async (label, value) => {
    await open([]);
    fill();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    await send();
    expect(writes()[0].body.severity).toBe(value);
  });

  it("only one weight is chosen at a time, and info to start with", async () => {
    await open([]);
    const pressed = () => ["Impormasyon", "Babala", "Mahalaga"].filter((name) => screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true");
    expect(pressed()).toEqual(["Impormasyon"]);
    fireEvent.click(screen.getByRole("button", { name: "Mahalaga" }));
    expect(pressed()).toEqual(["Mahalaga"]);
  });

  it("Walang hangga sends no expires_at", async () => {
    await open([]);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "1 linggo" }));
    fireEvent.click(screen.getByRole("button", { name: "Walang hangga" }));
    expect(screen.getByLabelText("Petsa ng hangganan").value).toBe("");
    await send();
    expect(writes()[0].body).not.toHaveProperty("expires_at");
  });

  it.each([
    ["3 araw", 3],
    ["1 linggo", 7],
  ])("%s puts the date %d days from today in the box and sends the end of that day", async (label, days) => {
    await open([]);
    fill();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByLabelText("Petsa ng hangganan").value).toBe(dateText(days));
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    await send();
    const end = new Date(writes()[0].body.expires_at);
    expect(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`).toBe(dateText(days));
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
  });

  it("a date typed in the box is sent as the end of that day", async () => {
    await open([]);
    fill();
    fireEvent.change(screen.getByLabelText("Petsa ng hangganan"), { target: { value: dateText(10) } });
    await send();
    expect(new Date(writes()[0].body.expires_at).getDate()).toBe(Number(dateText(10).slice(-2)));
  });

  it("a date already past is refused with a sentence, and nothing is sent", async () => {
    await open([]);
    fill();
    fireEvent.change(screen.getByLabelText("Petsa ng hangganan"), { target: { value: dateText(-3) } });
    await send();
    expect(screen.getByTestId("draft-problem").textContent).toMatch(/lumipas na/);
    expect(writes()).toHaveLength(0);
  });

  it("with no title it says so clearly, and sends nothing", async () => {
    await open([]);
    typeMessage("Only a message");
    await send();
    expect(screen.getByRole("alert").textContent).toMatch(/pamagat/i);
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Ipadala sa app" }).disabled).toBe(false); // the button is not disabled without a word
  });

  it("with no message it says so clearly, and sends nothing", async () => {
    await open([]);
    typeTitle("Only a title");
    await send();
    expect(screen.getByRole("alert").textContent).toMatch(/mensahe/i);
    expect(writes()).toHaveLength(0);
  });

  it("with neither, and with only spaces, it sends nothing", async () => {
    await open([]);
    await send();
    expect(screen.getByTestId("draft-problem")).toBeTruthy();
    typeTitle("   ");
    typeMessage("   ");
    await send();
    expect(screen.getByTestId("draft-problem")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it("typing again takes the complaint away", async () => {
    await open([]);
    await send();
    expect(screen.getByTestId("draft-problem")).toBeTruthy();
    typeTitle("x");
    expect(screen.queryByTestId("draft-problem")).toBeNull();
  });

  it("after sending, the notice is in the first list, the form is empty, and the person is told", async () => {
    await open([]);
    fill();
    await send();
    expect(screen.getByText(SENT_NOTICE)).toBeTruthy();
    expect(rowTitles(nowRows())).toEqual(["Sea advisory"]);
    expect(screen.getByLabelText("Pamagat").value).toBe("");
    expect(screen.getByLabelText("Mensahe").value).toBe("");
  });

  it("when the server refuses, the words of the server are shown and what was written stays", async () => {
    await open([]);
    fill();
    server.failNext = { status: 403, detail: "You can only publish advisories for your own section." };
    await send();
    expect(screen.getByRole("alert").textContent).toContain("You can only publish advisories for your own section.");
    expect(screen.getByLabelText("Pamagat").value).toBe("  Sea advisory  ");
    expect(rowTitles(nowRows())).toEqual([]);
  });

  it("Burahin ang nasulat empties the form and sends nothing", async () => {
    await open([]);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Burahin ang nasulat" }));
    expect(screen.getByLabelText("Pamagat").value).toBe("");
    expect(screen.getByLabelText("Mensahe").value).toBe("");
    expect(server.requests).toHaveLength(1); // only the first GET
  });
});

describe("the limits", () => {
  it("counts the characters of both boxes and stops at the limits (120 and 400)", async () => {
    await open([]);
    expect([TITLE_MAX, MESSAGE_MAX]).toEqual([120, 400]);
    expect(screen.getByTestId("title-count").textContent).toBe(`0/${TITLE_MAX}`);
    typeTitle("abcde");
    typeMessage("abc");
    expect(screen.getByTestId("title-count").textContent).toBe("5/120");
    expect(screen.getByTestId("message-count").textContent).toBe("3/400");
    expect(screen.getByLabelText("Pamagat").getAttribute("maxLength")).toBe("120");
    expect(screen.getByLabelText("Mensahe").getAttribute("maxLength")).toBe("400");
  });
});

describe("switching off and on, and never deleting", () => {
  it("Tanggalin sa app PATCHes is_active false and moves the notice to the second list", async () => {
    await open([advisory({ title: "Going" })]);
    fireEvent.click(within(nowRows()[0]).getByRole("button", { name: "Tanggalin sa app" }));
    await settled();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toEqual({ method: "PATCH", path: "/notifications/public/1/", body: { is_active: false } });
    expect(nowRows()).toHaveLength(0);
    expect(rowTitles(hiddenRows())).toEqual(["Going"]);
  });

  it("Ibalik sa app PATCHes is_active true and moves it back", async () => {
    await open([advisory({ title: "Coming back", is_active: false })]);
    fireEvent.click(within(hiddenRows()[0]).getByRole("button", { name: "Ibalik sa app" }));
    await settled();
    expect(writes()[0]).toEqual({ method: "PATCH", path: "/notifications/public/1/", body: { is_active: true } });
    expect(rowTitles(nowRows())).toEqual(["Coming back"]);
    expect(hiddenRows()).toHaveLength(0);
  });

  it("there is no DELETE anywhere in the tab, and no button that deletes", async () => {
    await open([advisory({ title: "A" }), advisory({ title: "B", is_active: false })]);
    fireEvent.click(within(nowRows()[0]).getByRole("button", { name: "Tanggalin sa app" }));
    await settled();
    fireEvent.click(within(hiddenRows()[0]).getByRole("button", { name: "Ibalik sa app" }));
    await settled();
    typeTitle("t");
    typeMessage("m");
    await send();
    expect(server.requests.map((request) => request.method)).not.toContain("DELETE");
    expect(new Set(server.requests.map((request) => request.method))).toEqual(new Set(["GET", "PATCH", "POST"]));
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    names.forEach((name) => expect(name).not.toMatch(/delete|alisin|\bbura\b/i));
  });

  it("a failed switch tells the person and leaves the notice where it was", async () => {
    await open([advisory({ title: "Stays" })]);
    server.failNext = { status: 500, detail: "Something went wrong." };
    fireEvent.click(within(nowRows()[0]).getByRole("button", { name: "Tanggalin sa app" }));
    await settled();
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong.");
    expect(rowTitles(nowRows())).toEqual(["Stays"]);
  });
});

describe("the live preview", () => {
  const preview = () => screen.getByTestId("mock-notifications");

  it("has the title Notifications and the subtitle of the Tourism Office", async () => {
    await open([]);
    expect(screen.getByRole("heading", { level: 2, name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("Mga abiso mula sa Tourism Office")).toBeTruthy();
  });

  it("shows what is being written, as it is typed", async () => {
    await open([]);
    expect(within(preview()).queryByTestId("preview-draft")).toBeNull();
    typeTitle("Road closed");
    expect(within(preview()).getByTestId("preview-draft").textContent).toContain("Road closed");
    typeMessage("Use the other road.");
    expect(within(preview()).getByTestId("preview-draft").textContent).toContain("Use the other road.");
    typeTitle("Road reopened");
    expect(within(preview()).getByTestId("preview-draft").textContent).toContain("Road reopened");
    expect(within(preview()).getByTestId("preview-draft").textContent).not.toContain("Road closed");
  });

  it("follows the weight chosen (the weight is on the element; the colour of each weight is in the CSS, below)", async () => {
    await open([]);
    typeTitle("x");
    const weight = () => within(preview()).getByTestId("preview-draft").getAttribute("data-severity");
    expect(weight()).toBe("info");
    fireEvent.click(screen.getByRole("button", { name: "Babala" }));
    expect(weight()).toBe("warning");
    fireEvent.click(screen.getByRole("button", { name: "Mahalaga" }));
    expect(weight()).toBe("critical");
  });

  it("then lists what is in the app now, and only that: not the switched off, not the expired, not another module", async () => {
    await open([
      advisory({ title: "In the app" }),
      advisory({ title: "Switched off", is_active: false }),
      advisory({ title: "Over", expires_at: iso(-1) }),
      advisory({ title: "Of sanitation", module: "sanitation" }),
    ]);
    typeTitle("Draft first");
    const shown = within(preview()).getAllByTestId(/^preview-/).map((node) => node.querySelector("strong").textContent);
    expect(shown).toEqual(["Draft first", "In the app"]);
  });

  it("after Burahin ang nasulat the draft leaves the preview", async () => {
    await open([]);
    typeTitle("Gone soon");
    expect(within(preview()).getByTestId("preview-draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Burahin ang nasulat" }));
    expect(within(preview()).queryByTestId("preview-draft")).toBeNull();
  });

  it("a notice switched off leaves the preview, and one brought back returns", async () => {
    await open([advisory({ title: "Toggle me" })]);
    expect(within(preview()).getAllByTestId("preview-notice")).toHaveLength(1);
    fireEvent.click(within(nowRows()[0]).getByRole("button", { name: "Tanggalin sa app" }));
    await settled();
    expect(within(preview()).queryAllByTestId("preview-notice")).toHaveLength(0);
    fireEvent.click(within(hiddenRows()[0]).getByRole("button", { name: "Ibalik sa app" }));
    await settled();
    expect(within(preview()).getAllByTestId("preview-notice")).toHaveLength(1);
  });
});

describe("a load that fails", () => {
  it("says so and offers to try again", async () => {
    server = makeServer([]);
    server.failNext = { status: 500, detail: "The server is down." };
    global.fetch = jest.fn((url, options) => server.fetch(url, options));
    render(<MobileContentNotifications />);
    await settled();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The server is down."));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the colours, read from the CSS (it is not loaded by Jest)", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const start = CSS.indexOf("MOBILE APP CONTENT: the Notifications tab");
  const block = CSS.slice(start);
  const rule = (selector) => {
    const at = block.indexOf(`\n${selector} {`);
    expect(at).toBeGreaterThan(-1); // the rule is in the file
    return block.slice(at, block.indexOf("\n}", at));
  };
  const decl = (selector, property) => {
    const found = rule(selector).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
    expect(found).not.toBeNull();
    return found[1];
  };
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

  it("the tab's CSS is at the END of the file, inside the part the design tests read", () => {
    expect(start).toBeGreaterThan(CSS.indexOf("MOBILE APP CONTENT: THE DESIGN (Commit 5e)"));
  });

  it.each([
    ["info", "var(--th-info)", "var(--th-info-bg)", "var(--th-text-main)"],
    ["warning", "var(--th-warning)", "var(--th-warning-bg)", "var(--th-text-main)"],
    ["critical", "var(--th-danger)", "var(--th-danger-bg)", "var(--th-text-main)"],
  ])("the weight %s is the status colour, not a hex and not the theme", (weight, color, bg, ink) => {
    const selector = `.mobile-content-notice-panel [data-severity="${weight}"]`;
    expect(decl(selector, "--mobile-content-notice-color")).toBe(color);
    expect(decl(selector, "--mobile-content-notice-bg")).toBe(bg);
    expect(decl(selector, "--mobile-content-notice-ink")).toBe(ink);
  });

  it("the TEXT of the three tags is --th-text-main, the same for all, and no token is borrowed from another part of the admin", () => {
    const inks = ["info", "warning", "critical"].map((weight) => decl(`.mobile-content-notice-panel [data-severity="${weight}"]`, "--mobile-content-notice-ink"));
    expect(inks).toEqual(["var(--th-text-main)", "var(--th-text-main)", "var(--th-text-main)"]);
    expect(decl(".mobile-content-notice-tag", "color")).toBe("var(--mobile-content-notice-ink)");
    expect(block).not.toMatch(/--th-contact/); // (the colours of the hotline icons are not for a notice)
    expect(block).not.toMatch(/--th-(info|warning|danger)-text/); // ("-text" of a status is not the text of the tags any more)
  });

  it("what follows the theme is a --th-primary token", () => {
    expect(decl(".mobile-content-notice-field textarea:focus", "border-color")).toBe("var(--th-primary)");
    expect(decl(".mobile-content-notice-field textarea:focus", "box-shadow")).toBe("0 0 0 3px var(--th-primary-alpha-20)");
    expect(decl('.mobile-content-notice-duration[aria-pressed="true"]', "border-color")).toBe("var(--th-primary)");
    expect(decl('.mobile-content-notice-duration[aria-pressed="true"]', "background")).toBe("var(--th-primary-tint)");
    expect(decl('.mobile-content-notice-duration[aria-pressed="true"]', "color")).toBe("var(--th-primary-ink)");
    expect(decl(".mobile-content-notice-btn.is-send", "background")).toBe("linear-gradient(180deg, var(--th-primary) 0%, var(--th-primary-hover) 100%)");
    expect(decl(".mobile-content-notice-btn.is-send", "color")).toBe("var(--th-text-inverse)");
    expect(decl(".mobile-content-notice-btn.is-restore", "border-color")).toBe("var(--th-primary)");
    expect(decl(".mobile-content-notice-card.is-compose::before", "background")).toBe("linear-gradient(90deg, var(--th-primary) 0%, var(--th-primary-deep) 100%)");
  });

  it("no colour of the tab is the old teal or brown, and no script of the tab writes a colour at all", () => {
    expect(block).not.toMatch(/#2e7d74|#8a5a33/i);
    ["pages/MobileContentNotifications.js", "utils/mobileContentNotifications.js"].forEach((file) => {
      expect(read(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  });
});
