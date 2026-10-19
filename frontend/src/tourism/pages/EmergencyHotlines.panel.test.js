// The Emergency Hotlines PANEL on its own (Mobile App Content, Commit 4b): the body of the page without the page around
// it. The golden file (EmergencyHotlines.golden.test.js) holds the old page; here the panel alone is held to it.
import { configure, render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { EmergencyHotlinesPanel } from "./EmergencyHotlines";
import { createServer, runScenarios } from "./hotlinesGolden.helpers";
import golden from "./golden/emergency-hotlines-before-split-552c048.json";
import { useAuth } from "../../auth/AuthContext";

jest.mock("react-router-dom", () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

// These tests replay a whole list of scenarios in one test; under the load of the whole suite that takes longer than the defaults.
configure({ asyncUtilTimeout: 5000 });
const LONG = 120000;

const parse = (markup) => {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder;
};
const pick = ({ notices, messages, form, section }) => ({ notices, messages, form, section });

describe("the panel alone", () => {
  beforeEach(() => useAuth.mockReturnValue({ role: "admin" }));

  it("shows the same four places and sends the same requests as the old page, at every step, with no page header", async () => {
    const record = await runScenarios(() => render(<EmergencyHotlinesPanel />));
    let compared = 0;
    golden.forEach((scenario, index) => {
      expect(record[index].requests).toEqual(scenario.requests);
      scenario.snaps.forEach((before, step) => {
        const now = record[index].snaps[step];
        const where = `${scenario.name} / ${before.label}`;
        expect({ where, ...pick(now) }).toEqual({ where, ...pick(before) });
        expect({ where, header: now.chrome }).toEqual({ where, header: null }); // the header is the page's, not the panel's
        const button = parse(before.chrome).querySelector(".reports-actions button").outerHTML;
        expect({ where, row: now.addRow }).toEqual({ where, row: `<div class="options-form-actions"><div class="reports-actions">${button}</div></div>` });
        compared += 1;
      });
    });
    expect(compared).toBe(29);
  }, LONG);

  it("does not look at the role itself: the page that mounts it does", async () => {
    useAuth.mockReturnValue({ role: undefined });
    global.fetch = jest.fn(createServer().fetch);
    render(<EmergencyHotlinesPanel />);
    await screen.findByRole("list");
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(global.fetch).toHaveBeenCalled();
  });

  it("has no heading of its own, and the Add button is the first thing in it", async () => {
    global.fetch = jest.fn(createServer().fetch);
    const { container } = render(<EmergencyHotlinesPanel />);
    await screen.findByRole("list");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const panel = container.firstElementChild;
    expect(panel.className).toBe("mobile-content-panel");
    expect(panel.firstElementChild.querySelector("button").textContent).toBe("Add contact");
    expect(panel.children[1].className).toBe("hotlines-notices"); // right after the button row
  });
});

describe("the one CSS rule that was added", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8");

  it("spaces the children of a panel as .reports-page spaces the children of a page", () => {
    const reportsPage = css.match(/\.reports-page\s*\{\s*@apply ([^;]+);/)[1];
    const panel = css.match(/\.mobile-content-panel\s*\{\s*@apply ([^;]+);/);
    expect(panel).not.toBeNull();
    expect(panel[1]).toBe(reportsPage); // "flex flex-col gap-6" in both
    expect(css.match(/\.mobile-content-panel\s*\{/g)).toHaveLength(1);
  });
});
