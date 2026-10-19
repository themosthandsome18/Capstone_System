// The Mobile App Content page (Commit 4c): five tabs, the tab in the address, the four tabs that are not built yet, who may
// open it. The Emergency Hotlines inside it are held to the golden of the old page in EmergencyHotlines.golden.test.js.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileAppContent, { NOT_READY_NOTICE } from "./MobileAppContent";
import { createServer } from "./hotlinesGolden.helpers";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const LABELS = ["Welcome", "Why Visit", "Travel Guide & Tips", "Port & Boat Guide", "Emergency Hotlines"];
const NOT_BUILT = ["Welcome", "Why Visit", "Travel Guide & Tips", "Port & Boat Guide"];
const KEYS = ["welcome", "why-visit", "travel-guide", "port-guide", "hotlines"];

let server;
beforeEach(() => {
  router.__setSearch("");
  useAuth.mockReturnValue({ role: "admin" });
  server = createServer();
  global.fetch = jest.fn(server.fetch);
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

  it("opens on the Emergency Hotlines when the address names no tab, and asks for the contacts once", async () => {
    render(<MobileAppContent />);
    expect(selected().map(labelOf)).toEqual(["Emergency Hotlines"]);
    await screen.findByRole("list");
    expect(requests().map((r) => `${r.method} ${r.path}`)).toEqual(["GET /emergency-contacts/"]);
    expect(router.__changes()).toEqual([]); // nothing was written into the address just by opening
  });

  it("marks the four tabs that are not built with Coming soon, and not the Hotlines", async () => {
    render(<MobileAppContent />);
    await settled();
    NOT_BUILT.forEach((label) => expect(tab(label).textContent).toContain("Coming soon"));
    expect(tab("Emergency Hotlines").textContent).not.toContain("Coming soon");
  });
});

describe("the tab is in the address", () => {
  it("opens the tab the address names", async () => {
    for (const [index, key] of KEYS.entries()) {
      router.__setSearch(`?tab=${key}`);
      const { unmount } = render(<MobileAppContent />);
      expect(selected().map(labelOf)).toEqual([LABELS[index]]);
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
  });

  it("stays on the tab after a refresh (the page opened again with the address it had)", () => {
    const first = render(<MobileAppContent />);
    fireEvent.click(tab("Why Visit"));
    const address = `?${router.__changes().at(-1).search}`;
    expect(address).toBe("?tab=why-visit");
    first.unmount();
    router.__setSearch(address);
    render(<MobileAppContent />);
    expect(selected().map(labelOf)).toEqual(["Why Visit"]);
  });

  it("puts right an address that names a tab that does not exist: shows the Hotlines and corrects it in place", async () => {
    for (const bad of ["?tab=nope", "?tab=", "?tab=Hotlines", "?tab=welcome%20"]) {
      router.__setSearch(bad);
      const { unmount } = render(<MobileAppContent />);
      expect(selected().map(labelOf)).toEqual(["Emergency Hotlines"]);
      await waitFor(() => expect(router.__changes()).toEqual([{ search: "tab=hotlines", options: { replace: true } }]));
      unmount();
    }
  });

  it("does not touch the address when the tab is a good one", () => {
    router.__setSearch("?tab=welcome");
    render(<MobileAppContent />);
    expect(router.__changes()).toEqual([]);
  });
});

describe("the four tabs that are not built", () => {
  it("say it is not available yet, without the word commit, and ask the server for NOTHING", async () => {
    render(<MobileAppContent />);
    await screen.findByRole("list");
    const before = requests().length;
    expect(before).toBe(1); // the fixture: the Hotlines did ask once
    for (const label of NOT_BUILT) {
      fireEvent.click(tab(label));
      const panel = screen.getByRole("tabpanel");
      expect(within(panel).getByRole("note").textContent).toBe(NOT_READY_NOTICE);
    }
    expect(NOT_READY_NOTICE).not.toMatch(/commit/i);
    expect(NOT_READY_NOTICE).toMatch(/coming in an upcoming update/);
    expect(requests().length).toBe(before); // not one request from them
  });

  it("send no request at all when the page is opened on one of them", async () => {
    for (const key of ["welcome", "why-visit", "travel-guide", "port-guide"]) {
      router.__setSearch(`?tab=${key}`);
      server.requests.length = 0;
      const { unmount } = render(<MobileAppContent />);
      expect(within(screen.getByRole("tabpanel")).getByRole("note").textContent).toBe(NOT_READY_NOTICE);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.queryByRole("list")).toBeNull(); // no hotlines panel mounted
      unmount();
    }
  });
});

describe("the tabs keep what they show", () => {
  it("the Hotlines are not asked for again, and a form that was open is still open with what was typed", async () => {
    render(<MobileAppContent />);
    await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: /Add contact/ }));
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Half typed" } });
    fireEvent.click(tab("Welcome"));
    expect(screen.getByLabelText("Contact name").closest('[role="tabpanel"]').hidden).toBe(true); // still there, but hidden
    fireEvent.click(tab("Emergency Hotlines"));
    expect(screen.getByLabelText("Contact name").value).toBe("Half typed");
    expect(requests().filter((r) => r.method === "GET")).toHaveLength(1);
  });

  it("only the shown tab is a tabpanel you can reach; the others are hidden", async () => {
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
    const view = render(<MobileAppContent />);
    await screen.findByRole("list");
    useAuth.mockReturnValue({ role: "tourism" });
    view.rerender(<MobileAppContent />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
