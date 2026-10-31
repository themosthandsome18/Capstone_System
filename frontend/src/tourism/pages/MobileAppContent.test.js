// The Mobile App Content page (Commit 4c; the Welcome tab since 5b): five tabs, the tab in the address, the tabs that are not built yet, who may
// open it. The Emergency Hotlines inside it are held to the golden of the old page in EmergencyHotlines.golden.test.js.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MobileAppContent, { NOT_READY_NOTICE } from "./MobileAppContent";
import { createServer } from "./hotlinesGolden.helpers";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const LABELS = ["Welcome", "Why Visit", "Travel Guide & Tips", "Port & Boat Guide", "Emergency Hotlines"];
const NOT_BUILT = []; // (all five tabs are built: the Welcome since 5b, the Why Visit since 5d, the Travel Guide since 7a, the Port & Boat Guide since 8b)
const KEYS = ["welcome", "why-visit", "travel-guide", "port-guide", "hotlines"];

// The Welcome tab asks for the blocks; a fake answers it, and the Hotlines are answered by their own fake, as before.
const BLOCKS_LIST = {
  blocks: [
    {
      key: "welcome", name: "Welcome banner", title: "Mabuhay, {name}!", subtitle: "Welcome.", body: "", fields: ["title", "subtitle"],
      limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true } },
      allowed_placeholders: { title: ["name"], subtitle: ["name"] },
    },
  ],
  fee: { regular: 80, discounted: 64 },
  placeholders: {},
};
// (5d) the Why Visit tab asks for its block too, and for its four pillars: this page-level file only needs the page to find them
BLOCKS_LIST.blocks.push({
  key: "why_visit", name: "Why Visit", title: "Why Visit", subtitle: "Sub", body: "Body", fields: ["title", "subtitle", "body"],
  limits: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true }, body: { kind: "text", max: 600, required: true } },
  allowed_placeholders: { title: ["fee_regular"], subtitle: ["fee_regular"], body: ["fee_regular"] },
});
const PILLARS = [{ id: 1, section: "why_visit", title: "One", short_text: "First", is_active: true }];
let blockRequests;
let server;
beforeEach(() => {
  router.__setSearch("");
  useAuth.mockReturnValue({ role: "admin" });
  server = createServer();
  blockRequests = [];
  global.fetch = jest.fn((url, options = {}) => {
    if (url.includes("/mobile-content/items/")) {
      return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(PILLARS), json: async () => JSON.parse(JSON.stringify(PILLARS)) });
    }
    if (url.includes("/mobile-content/blocks/")) {
      blockRequests.push(`${(options.method || "GET").toUpperCase()} ${url.replace(/^.*\/api/, "")}`);
      return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(BLOCKS_LIST), json: async () => JSON.parse(JSON.stringify(BLOCKS_LIST)) });
    }
    return server.fetch(url, options);
  });
});

// a page that was opened on the Hotlines has asked for the contacts: let the answer arrive inside act()
const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

const tab = (label) => screen.getByRole("tab", { name: new RegExp(`^${label.replace(/[&]/g, "\\$&")}`) });
const selected = () => screen.getAllByRole("tab").filter((item) => item.getAttribute("aria-selected") === "true");
const labelOf = (item) => item.textContent.replace("Coming soon", "");
const requests = () => server.requests;

describe("the page", () => {
  it("has one heading, and five tabs in this order", async () => {
    render(<MobileAppContent />);
    await settled();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Mobile App Content"]);
    expect(screen.getAllByRole("tab").map(labelOf)).toEqual(LABELS);
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("Mobile app content");
  });

  it("opens on the Welcome when the address names no tab, and does NOT ask for the contacts until the Hotlines tab is opened", async () => {
    render(<MobileAppContent />);
    expect(selected().map(labelOf)).toEqual(["Welcome"]);
    await screen.findByLabelText("Greeting");
    await settled();
    expect(blockRequests).toEqual(["GET /mobile-content/blocks/"]); // the Welcome asked for its block
    expect(requests()).toEqual([]); // the fixture: the fake of the contacts has seen nothing
    expect(global.fetch.mock.calls.some(([url]) => url.includes("emergency-contacts"))).toBe(false);
    expect(router.__changes()).toEqual([]); // nothing was written into the address just by opening
    fireEvent.click(tab("Emergency Hotlines"));
    await screen.findByRole("list");
    expect(requests().map((r) => `${r.method} ${r.path}`)).toEqual(["GET /emergency-contacts/"]); // now, and once
  });

  it("marks no tab with Coming soon: all five are built", async () => {
    render(<MobileAppContent />);
    await settled();
    expect(NOT_BUILT).toHaveLength(0);
    LABELS.forEach((label) => expect(tab(label).textContent).not.toContain("Coming soon"));
    expect(tab("Emergency Hotlines").textContent).not.toContain("Coming soon");
    expect(tab("Welcome").textContent).not.toContain("Coming soon");
    expect(tab("Why Visit").textContent).not.toContain("Coming soon");
  });
});

describe("the tab is in the address", () => {
  it("opens the tab the address names", async () => {
    for (const [index, key] of KEYS.entries()) {
      router.__setSearch(`?tab=${key}`);
      const { unmount } = render(<MobileAppContent />);
      expect(selected().map(labelOf)).toEqual([LABELS[index]]);
      await settled();
      unmount();
    }
  });

  it("choosing a tab writes it into the address IN PLACE (replace), never as a new history entry", async () => {
    render(<MobileAppContent />);
    await settled();
    KEYS.forEach((key, index) => {
      fireEvent.click(tab(LABELS[index]));
      const last = router.__changes().at(-1);
      expect(last).toEqual({ search: `tab=${key}`, options: { replace: true } });
      expect(selected().map(labelOf)).toEqual([LABELS[index]]);
    });
    expect(router.__changes()).toHaveLength(5);
    expect(router.__changes().every((change) => change.options.replace === true)).toBe(true);
    await settled();
  });

  it("stays on the tab after a refresh (the page opened again with the address it had)", () => {
    const first = render(<MobileAppContent />);
    fireEvent.click(tab("Port & Boat Guide")); // (a tab that asks for nothing; was the Why Visit before 5d)
    const address = `?${router.__changes().at(-1).search}`;
    expect(address).toBe("?tab=port-guide");
    first.unmount();
    router.__setSearch(address);
    render(<MobileAppContent />);
    expect(selected().map(labelOf)).toEqual(["Port & Boat Guide"]);
  });

  it("puts right an address that names a tab that does not exist: shows the Welcome and corrects it in place", async () => {
    for (const bad of ["?tab=nope", "?tab=", "?tab=Hotlines", "?tab=welcome%20"]) {
      router.__setSearch(bad);
      const { unmount } = render(<MobileAppContent />);
      expect(selected().map(labelOf)).toEqual(["Welcome"]);
      await waitFor(() => expect(router.__changes()).toEqual([{ search: "tab=welcome", options: { replace: true } }]));
      await screen.findByLabelText("Greeting");
      unmount();
    }
  });

  it("does not touch the address when the tab is a good one", async () => {
    router.__setSearch("?tab=welcome");
    render(<MobileAppContent />);
    await settled();
    expect(router.__changes()).toEqual([]);
  });
});

describe("no tab says it is not available yet (all five are built since 8b)", () => {
  it("none of the five tabs shows the notice of a tab that is not built", async () => {
    router.__setSearch("?tab=hotlines"); // (5f, stage 1: the mount only; the page is opened on the Hotlines on purpose, not by default)
    render(<MobileAppContent />);
    await screen.findByRole("list");
    expect(NOT_READY_NOTICE).not.toMatch(/commit/i); // (the words of the notice are kept for a tab that may one day not be built)
    expect(NOT_READY_NOTICE).toMatch(/coming in an upcoming update/);
    for (const label of LABELS) {
      fireEvent.click(tab(label));
      expect(screen.queryByText(NOT_READY_NOTICE)).toBeNull();
    }
    await settled();
  });
});

describe("the tabs keep what they show", () => {
  it("the Hotlines are not asked for again, and a form that was open is still open with what was typed", async () => {
    router.__setSearch("?tab=hotlines"); // (5f, stage 1: the mount only; the page is opened on the Hotlines on purpose, not by default)
    render(<MobileAppContent />);
    await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: /Add contact/ }));
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Half typed" } });
    fireEvent.click(tab("Port & Boat Guide")); // (was the Why Visit before 5d)
    expect(screen.getByLabelText("Contact name").closest('[role="tabpanel"]').hidden).toBe(true); // still there, but hidden
    fireEvent.click(tab("Emergency Hotlines"));
    expect(screen.getByLabelText("Contact name").value).toBe("Half typed");
    expect(requests().filter((r) => r.method === "GET")).toHaveLength(1);
  });

  it("only the shown tab is a tabpanel you can reach; the others are hidden", async () => {
    router.__setSearch("?tab=hotlines"); // (5f, stage 1: the mount only; the page is opened on the Hotlines on purpose, not by default)
    render(<MobileAppContent />);
    await screen.findByRole("list");
    fireEvent.click(tab("Port & Boat Guide"));
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    const hidden = document.querySelectorAll('[role="tabpanel"][hidden]');
    expect(hidden).toHaveLength(1); // the Hotlines, kept but hidden
    expect(hidden[0].id).toBe("mobile-content-panel-hotlines");
  });
});

describe("who may open it", () => {
  it("sends anyone but the admin away, mounts nothing and asks the server for nothing", () => {
    for (const role of ["tourism", "sanitation", "tourist", "", undefined]) {
      useAuth.mockReturnValue({ role });
      router.__setSearch("?tab=bogus");
      const { container, unmount } = render(<MobileAppContent />);
      const redirect = screen.getByTestId("redirect");
      expect(redirect.getAttribute("data-to")).toBe("/");
      expect(redirect.getAttribute("data-replace")).toBe("true");
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
      unmount();
    }
    expect(global.fetch).not.toHaveBeenCalled();
    expect(router.__changes()).toEqual([]); // and it does not correct an address for a person it is sending away
  });

  it("stops showing the page when the role is lost while it is open", async () => {
    router.__setSearch("?tab=hotlines"); // (5f, stage 1: the mount only; the page is opened on the Hotlines on purpose, not by default)
    const view = render(<MobileAppContent />);
    await screen.findByRole("list");
    useAuth.mockReturnValue({ role: "tourism" });
    view.rerender(<MobileAppContent />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("the Welcome tab", () => {
  it("asks for the blocks once, when it is first opened, and never for the Hotlines", async () => {
    router.__setSearch("?tab=hotlines"); // (5f, stage 1: the mount only; the page is opened on the Hotlines on purpose, not by default)
    render(<MobileAppContent />);
    await settled();
    expect(blockRequests).toEqual([]); // the page opens on the Hotlines: the Welcome has asked for nothing
    fireEvent.click(tab("Welcome"));
    await screen.findByLabelText("Greeting");
    expect(blockRequests).toEqual(["GET /mobile-content/blocks/"]);
    fireEvent.click(tab("Emergency Hotlines"));
    fireEvent.click(tab("Welcome"));
    await settled();
    expect(blockRequests).toEqual(["GET /mobile-content/blocks/"]); // kept, not asked again
    expect(requests().filter((r) => r.path.startsWith("/emergency-contacts/"))).toHaveLength(1); // the Hotlines asked once, at the start
  });

  it("opened first, makes no request to the Hotlines at all", async () => {
    router.__setSearch("?tab=welcome");
    render(<MobileAppContent />);
    await screen.findByLabelText("Greeting");
    expect(blockRequests).toEqual(["GET /mobile-content/blocks/"]);
    expect(requests()).toEqual([]);
    expect(selected().map(labelOf)).toEqual(["Welcome"]);
  });

  it("when the server cannot be reached shows the error with Try again, and no form, no column of the app's text and no restore button", async () => {
    router.__setSearch("?tab=welcome");
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<MobileAppContent />);
    await screen.findByRole("button", { name: "Try again" }); // the server has failed
    expect(screen.queryByLabelText("What the app shows now (built-in text)")).toBeNull(); // (the column was taken away in 5e)
    expect(screen.queryByRole("button", { name: "Ibalik ang orihinal na teksto" })).toBeNull(); // nothing to fill
    expect(screen.queryByLabelText("Greeting")).toBeNull(); // the fixture: the form is not there
    await settled();
  });

  it("is the tab the page opens on (since 5f), and the Hotlines tab is not", async () => {
    render(<MobileAppContent />);
    await settled();
    expect(selected().map(labelOf)).toEqual(["Welcome"]);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1); // the fixture: one tab is shown
    expect(document.querySelector("#mobile-content-panel-hotlines")).toBeNull(); // the Hotlines are not even mounted
  });
});
