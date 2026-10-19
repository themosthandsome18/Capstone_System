// The golden: the Emergency Hotlines page as it was on origin/main (552c048), BEFORE it was split into a panel and a
// page (Mobile App Content, Commit 4). golden/emergency-hotlines-before-split-552c048.json holds, for 15 scenarios, the
// outer HTML of what is on the screen after each step (notices, messages, form, list, and the page header) and every
// request that was sent (method, path, body). It was taken from the old page before a line of the split was written,
// and two runs gave the same record.
import { render } from "@testing-library/react";
import EmergencyHotlines from "./EmergencyHotlines";
import { SCENARIO_NAMES, runScenarios } from "./hotlinesGolden.helpers";
import golden from "./golden/emergency-hotlines-before-split-552c048.json";
import { useAuth } from "../../auth/AuthContext";

jest.mock("react-router-dom", () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

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

  it("shows exactly the same screen and sends exactly the same requests, step by step", async () => {
    const record = await runScenarios(() => render(<EmergencyHotlines />));
    golden.forEach((scenario, index) => {
      expect(record[index].name).toBe(scenario.name);
      expect(record[index].requests).toEqual(scenario.requests); // the requests of one scenario, in order
      expect(record[index].snaps).toEqual(scenario.snaps); // the screen after each step
    });
    expect(record).toEqual(golden);
  });
});
