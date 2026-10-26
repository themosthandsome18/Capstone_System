// The golden: the Emergency Hotlines page as it was on origin/main (552c048), BEFORE it was split into a panel and moved
// into the Mobile App Content page (Commit 4). Since 4c the screen is held to the golden THROUGH THE NEW PAGE, opened on its
// Hotlines tab. golden/emergency-hotlines-before-split-552c048.json holds, for 15 scenarios, the
// outer HTML of what is on the screen after each step (notices, messages, form, list, and the page header) and every
// request that was sent (method, path, body). It was taken from the old page before a line of the split was written,
// and two runs gave the same record.
import { configure, render } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import { SCENARIO_NAMES, runScenarios } from "./hotlinesGolden.helpers";
import golden from "./golden/emergency-hotlines-before-split-552c048.json";
import { useAuth } from "../../auth/AuthContext";

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

// These tests replay a whole list of scenarios in one test; under the load of the whole suite that takes longer than the defaults.
configure({ asyncUtilTimeout: 5000 });
const LONG = 120000;

beforeEach(() => useAuth.mockReturnValue({ role: "admin" }));

describe("the Emergency Hotlines, as a tab of Mobile App Content, against the golden of the old page", () => {
  it("has the scenarios it was taken with, each with something recorded", () => {
    expect(golden.map((scenario) => scenario.name)).toEqual(SCENARIO_NAMES);
    expect(golden.length).toBe(15);
    golden.forEach((scenario) => {
      expect(scenario.snaps.length).toBeGreaterThan(0);
      expect(scenario.requests.length).toBeGreaterThan(0);
    });
    expect(golden.reduce((sum, scenario) => sum + scenario.snaps.length, 0)).toBe(29);
  });

  // THE WRITTEN LIST OF DIFFERENCES between the old page and the Hotlines tab (Commit 4). Nothing else may differ.
  //  1. The header of the page is the header of Mobile App Content (the old h1 and subtitle, and the actions, are gone).
  //  2. The Add contact button is the same button, now at the top of the panel, in a row of its own.
  const parse = (markup) => {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder;
  };
  const goldenButton = (chrome) => parse(chrome).querySelector(".reports-actions button").outerHTML;
  const NEW_HEADER =
    '<div class="reports-header"><div><p class="mobile-content-eyebrow">Mauban Tourism App</p><h1>Mobile App Content</h1><p class="mobile-content-lead">Everything a visitor reads inside the app. Change it here, and it reaches the app in its next version.</p></div></div>';

  it("shows exactly the same screen and sends exactly the same requests, step by step, except for the two written differences", async () => {
    const record = await runScenarios(() => render(<MobileAppContent />));
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
        // difference 1: the header is the page's
        expect({ where, header: now.chrome }).toEqual({ where, header: NEW_HEADER });
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
