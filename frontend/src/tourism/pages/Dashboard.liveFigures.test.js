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

function data(extra = {}, arrivals = [4, 5, 0, 1, 2, 3, 6]) {
  return {
    filters: { year: "2026" },
    reportingDate: "2026-11-11",
    currentYearOnly: false,
    currentYear: "2026",
    metrics: {
      todayArrivals: 6, weekArrivals: 21, monthArrivals: 77, totalRevenueCollected: 1000,
      pendingForReportingDate: 4, noShowRate: 5, topResortThisMonth: "Anchor Resort", topOriginThisMonth: "Quezon",
    },
    classification: { filipino: 3, foreign: 1 },
    gender: { male: 2, female: 2 },
    stayType: { dayTour: 24, overnight: 18 },
    trends: { labels: ["a", "b", "c", "d", "e", "f", "g"], arrivals },
    ...extra,
  };
}

function mockData(dashboardData) {
  useTourismData.mockReturnValue({
    dashboardData,
    loading: false,
    error: null,
    refreshDashboardData: jest.fn(),
    refreshDashboardIfStale: jest.fn(() => Promise.resolve()),
    isComputedDataStale: () => false,
    referenceTables: { resorts: [] },
  });
}

async function show() {
  await act(async () => {
    render(
      <TourismChartPaletteContext.Provider value={CHART_PALETTE_DEFAULTS}>
        <Dashboard />
      </TourismChartPaletteContext.Provider>
    );
  });
}

const card = (title) =>
  Array.from(document.querySelectorAll(".metric-card")).find((c) => c.querySelector("p").textContent === title);
const lineChart = () => mockCharts.filter((c) => c.type === "line").pop();

beforeEach(() => {
  mockCharts.length = 0;
});

describe("Daily Visitor Trends axis fits the data", () => {
  it.each([
    [0, 10, 2],
    [3, 10, 2],
    [8, 10, 2],
    [45, 100, 20],
    [320, 500, 100],
  ])("busiest day %i gives a top of %i, a step of %i, from 0", async (busiest, max, step) => {
    mockData(data({}, [1, busiest, 0, 0, 2, 0, 0]));
    await show();

    const y = lineChart().options.scales.y;
    expect(y.max).toBe(max);
    expect(y.min).toBe(0);
    expect(y.beginAtZero).toBe(true);
    expect(y.ticks.stepSize).toBe(step);
    expect(y.ticks.precision).toBe(0);
    expect(Number.isInteger(y.ticks.stepSize)).toBe(true);
  });

  it("no longer holds the peg of 400", async () => {
    mockData(data({}, [3, 2, 1, 0, 0, 0, 0]));
    await show();
    expect(lineChart().options.scales.y.max).not.toBe(400);
  });
});

describe("Dashboard figures anchored to today", () => {
  it("calls the card Pending Today and does not put a date under it", async () => {
    mockData(data());
    await show();

    expect(card("Pending on Report Date")).toBeUndefined();
    const pending = card("Pending Today");
    expect(pending.querySelector("h2").textContent).toBe("4");
    expect(pending.querySelector("span").textContent).toBe("");
    expect(document.body.textContent).not.toContain("2026-11-11");
  });

  it("current year: the three live cards and the chart show their numbers", async () => {
    mockData(data());
    await show();

    expect(card("Today's Arrivals").querySelector("h2").textContent).toBe("6");
    expect(card("This Week's Arrivals").querySelector("h2").textContent).toBe("21");
    expect(card("This Month's Arrivals").querySelector("h2").textContent).toBe("77");
    expect(document.body.textContent).not.toContain("Current year only");
    expect(lineChart()).toBeDefined();
  });

  it("a past year: a dash and Current year only under all six live cards, a line of text instead of the chart", async () => {
    mockData(data({ currentYearOnly: true, filters: { year: "2025" }, metrics: { todayArrivals: 0, weekArrivals: 0, monthArrivals: 0, totalRevenueCollected: 1000, pendingForReportingDate: 0, noShowRate: 5, topResortThisMonth: "No arrivals yet", topOriginThisMonth: "No arrivals yet" } }));
    await show();

    for (const title of ["Today's Arrivals", "This Week's Arrivals", "This Month's Arrivals", "Pending Today", "Top Resort This Month", "Top Origin This Month"]) {
      expect(card(title).querySelector("h2").textContent).toBe("—");
      expect(card(title).querySelector("span").textContent).toBe("Current year only");
    }
    expect(lineChart()).toBeUndefined();
    expect(document.querySelector(".line-chart-area").textContent).toBe("Current year only — switch to 2026 to see this.");
  });

  it("current year: the six live cards show their own values", async () => {
    mockData(data());
    await show();

    expect(card("Pending Today").querySelector("h2").textContent).toBe("4");
    expect(card("Top Resort This Month").querySelector("h2").textContent).toBe("Anchor Resort");
    expect(card("Top Origin This Month").querySelector("h2").textContent).toBe("Quezon");
    expect(document.body.textContent).not.toContain("Current year only");
  });

  it("a past year: the totals still follow the selected year", async () => {
    mockData(data({ currentYearOnly: true }));
    await show();

    expect(card("Total Revenue Collected").querySelector("h2").textContent).toContain("1,000");
    expect(card("No-show Rate").querySelector("h2").textContent).toBe("5%");
    expect(card("Total Revenue Collected").querySelector("span").textContent).not.toBe("Current year only");
    expect(card("No-show Rate").querySelector("span").textContent).not.toBe("Current year only");
    // the classification doughnut and the others are still drawn
    expect(mockCharts.some((c) => c.type === "doughnut")).toBe(true);
  });
});
