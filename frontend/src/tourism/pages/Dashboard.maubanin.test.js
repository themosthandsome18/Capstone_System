import fs from "fs";
import path from "path";
import { act, render } from "@testing-library/react";
import Dashboard from "./Dashboard";
import { useTourismData } from "../context/TourismDataContext";
import { CHART_PALETTE_DEFAULTS, TourismChartPaletteContext } from "../theme/chartPalette";

const mockCharts = [];
jest.mock("react-chartjs-2", () => {
  const make = (type) => (props) => {
    mockCharts.push({ type, ...props });
    return null;
  };
  return { Bar: make("bar"), Line: make("line"), Doughnut: make("doughnut"), Pie: make("pie") };
});
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

function mockData(classification) {
  useTourismData.mockReturnValue({
    dashboardData: {
      filters: { year: "2026" },
      reportingDate: "2026-11-11",
      currentYearOnly: false,
      currentYear: "2026",
      metrics: {},
      classification,
      gender: { male: 2, female: 2 },
      stayType: { dayTour: 24, overnight: 18 },
      trends: { labels: ["a"], arrivals: [1] },
    },
    loading: false,
    error: null,
    refreshDashboardData: jest.fn(),
    refreshDashboardIfStale: jest.fn(() => Promise.resolve()),
    isComputedDataStale: () => false,
    referenceTables: { resorts: [] },
  });
}

async function show(classification) {
  mockData(classification);
  await act(async () => {
    render(
      <TourismChartPaletteContext.Provider value={CHART_PALETTE_DEFAULTS}>
        <Dashboard />
      </TourismChartPaletteContext.Provider>
    );
  });
}

const sub = () => document.querySelector(".classification-sub");
const classificationDonut = () =>
  mockCharts.filter((c) => c.type === "doughnut" && (c.data.labels || []).includes("Domestic (Filipino)")).pop();

beforeEach(() => {
  mockCharts.length = 0;
});

describe("Maubanin under Domestic", () => {
  it("shows the Maubanin count right under Domestic, before Foreign", async () => {
    await show({ filipino: 49, maubanin: 7, foreign: 10 });

    const line = sub();
    expect(line.querySelector(".classification-sub-label").textContent).toBe("Maubanin");
    expect(line.querySelector(".classification-sub-value").textContent).toBe("7");
    const domestic = line.previousElementSibling;
    const foreign = line.nextElementSibling;
    expect(domestic.textContent).toContain("Domestic (Filipino)");
    expect(domestic.textContent).toContain("49");
    expect(foreign.textContent).toContain("Foreign (International)");
    expect(foreign.textContent).toContain("10");
  });

  it("is not a third slice: the donut still has two slices and its total is not raised", async () => {
    await show({ filipino: 49, maubanin: 7, foreign: 10 });

    const donut = classificationDonut();
    expect(donut.data.labels).toEqual(["Domestic (Filipino)", "Foreign (International)"]);
    expect(donut.data.datasets[0].data).toEqual([49, 10]);
    expect(donut.data.datasets[0].data.reduce((a, b) => a + b, 0)).toBe(59);
    expect(JSON.stringify(donut.data)).not.toMatch(/Maubanin/);
  });

  it("never shows more than Domestic", async () => {
    await show({ filipino: 49, maubanin: 80, foreign: 10 });

    expect(sub().querySelector(".classification-sub-value").textContent).toBe("49");
  });

  it("shows 0 when there is no Maubanin, and when the server sends none", async () => {
    await show({ filipino: 49, maubanin: 0, foreign: 10 });
    expect(sub().querySelector(".classification-sub-value").textContent).toBe("0");

    document.body.innerHTML = "";
    await show({ filipino: 49, foreign: 10 });
    expect(sub().querySelector(".classification-sub-value").textContent).toBe("0");
  });

  it("is not another main row: no dot, no bold number, not a legend row", async () => {
    await show({ filipino: 49, maubanin: 7, foreign: 10 });

    const line = sub();
    expect(line.classList.contains("legend-row")).toBe(false);
    expect(line.querySelector("strong, b")).toBeNull();
    expect(line.querySelector("[style]")).toBeNull();
    expect(line.children.length).toBe(2);
  });

  it("leaves the two main rows as they were", async () => {
    await show({ filipino: 49, maubanin: 7, foreign: 10 });

    const rows = Array.from(document.querySelectorAll(".classification-content .legend-row"));
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.querySelector("strong")).not.toBeNull();
      expect(row.querySelector("span[style]")).not.toBeNull();
    }
  });
});

// jsdom does not apply the stylesheet, so the look is checked in the stylesheet itself.
describe("the look of the Maubanin line", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const bodyOf = (selector) => {
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    const open = css.indexOf("{", start);
    return css.slice(open + 1, css.indexOf("}", open));
  };
  const rulesMatching = (pattern) =>
    Array.from(css.matchAll(/([^{}]+)\{([^}]*)}/g))
      .filter(([, selector]) => pattern.test(selector))
      .map(([, , body]) => body)
      .join("\n");
  const colour = (body) => (body.match(/text-(?:slate-\d+|black|white)/) || [])[0];
  const size = (body) => Number((body.match(/text-\[(\d+)px\]/) || [])[1]);

  const originBreakdown = bodyOf(".card-title p {");
  const box = bodyOf(".classification-sub {");
  const label = bodyOf(".classification-sub-label {");
  const value = bodyOf(".classification-sub-value {");
  // The two main rows: what the stylesheet says about them, and the browser default (16px, the page text colour) where it says nothing.
  const main = rulesMatching(/\.legend-row|\.classification-content/);
  const MAIN_SIZE = size(main) || 16;
  const MAIN_COLOUR = colour(main) || "inherit";

  it("keeps the muted colour of the Origin breakdown subtitle, and not the colour of the main rows", () => {
    expect(colour(originBreakdown)).toBe("text-slate-400");
    for (const body of [box, label, value]) {
      expect(colour(body)).toBe(colour(originBreakdown));
      expect(colour(body)).not.toBe(MAIN_COLOUR);
    }
  });

  it("is 13px (the label and the number)", () => {
    for (const body of [box, label, value]) expect(size(body)).toBe(13);
  });

  it("is clearly smaller than the two main rows", () => {
    for (const body of [box, label, value]) expect(size(body)).toBeLessThan(MAIN_SIZE);
  });

  it("has a semibold number and a normal label, neither of them bold", () => {
    expect(value).toMatch(/font-semibold/);
    expect(value).not.toMatch(/font-(bold|extrabold|black|medium|normal)/);
    expect(label).toMatch(/font-normal/);
    expect(label).not.toMatch(/font-(bold|semibold|extrabold|black|medium)/);
    expect(box).not.toMatch(/font-(bold|semibold|extrabold|black|medium)/);
  });

  it("is indented", () => {
    expect(box).toMatch(/\bml-\d/);
  });
});
