// The golden: the Emergency Hotlines page as it was on origin/main (552c048), BEFORE it was split into a panel and a
// page (Mobile App Content, Commit 4). golden/emergency-hotlines-before-split-552c048.json holds, for 15 scenarios, the
// outer HTML of what is on the screen after each step (notices, messages, form, list, and the page header) and every
// request that was sent (method, path, body). It was taken from the old page before a line of the split was written,
// and two runs gave the same record.
import { configure, render } from "@testing-library/react";
import EmergencyHotlines from "./EmergencyHotlines";
import { SCENARIO_NAMES, runScenarios } from "./hotlinesGolden.helpers";
import golden from "./golden/emergency-hotlines-before-split-552c048.json";
import { useAuth } from "../../auth/AuthContext";

jest.mock("react-router-dom", () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

// These tests replay a whole list of scenarios in one test; under the load of the whole suite that takes longer than the defaults.
configure({ asyncUtilTimeout: 5000 });
const LONG = 120000;

beforeEach(() => useAuth.mockReturnValue({ role: "admin" }));

describe("the Emergency Hotlines page against its golden", () => {
  it("has the scenarios it was taken with, each with something recorded", () => {
    expect(golden.map((scenario) => scenario.name)).toEqual(SCENARIO_NAMES);
    expect(golden.length).toBe(15);
    golden.forEach((scenario) => {
      expect(scenario.snaps.length).toBeGreaterThan(0);
      expect(scenario.requests.length).toBeGreaterThan(0);
    });
    expect(golden.reduce((sum, scenario) => sum + scenario.snaps.length, 0)).toBe(29);
  });

  // THE WRITTEN LIST OF DIFFERENCES between the old page and the page made of the panel (Commit 4b). Nothing else may differ.
  //  1. The page header has no .reports-actions any more (the h1 and the subtitle are what they were).
  //  2. The Add contact button is the same button, now at the top of the panel, in a row of its own.
  const parse = (markup) => {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder;
  };
  const goldenButton = (chrome) => parse(chrome).querySelector(".reports-actions button").outerHTML;
  const goldenHeaderWithoutActions = (chrome) => {
    const holder = parse(chrome);
    holder.querySelector(".reports-actions").remove();
    return holder.firstElementChild.outerHTML;
  };

  it("shows exactly the same screen and sends exactly the same requests, step by step, except for the two written differences", async () => {
    const record = await runScenarios(() => render(<EmergencyHotlines />));
    let compared = 0;
    golden.forEach((scenario, index) => {
      expect(record[index].name).toBe(scenario.name);
      expect(record[index].requests).toEqual(scenario.requests); // the requests of one scenario, in order
      expect(record[index].snaps).toHaveLength(scenario.snaps.length);
      scenario.snaps.forEach((before, step) => {
        const now = record[index].snaps[step];
        const where = `${scenario.name} / ${before.label}`;
        expect({ where, label: now.label }).toEqual({ where, label: before.label });
        // the four places of the panel: identical, character for character
        expect({ where, ...pick(now) }).toEqual({ where, ...pick(before) });
        // difference 1: the header, without its actions
        expect({ where, header: now.chrome }).toEqual({ where, header: goldenHeaderWithoutActions(before.chrome) });
        // difference 2: the same button (disabled or not, as it was at this step), first in the panel
        expect({ where, row: now.addRow }).toEqual({
          where,
          row: `<div class="options-form-actions"><div class="reports-actions">${goldenButton(before.chrome)}</div></div>`,
        });
        compared += 1;
      });
    });
    expect(compared).toBe(29);
  }, LONG);
});

const pick = ({ notices, messages, form, section }) => ({ notices, messages, form, section });
