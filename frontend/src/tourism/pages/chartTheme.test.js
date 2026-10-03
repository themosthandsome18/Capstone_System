import { act, render } from "@testing-library/react";
import Dashboard from "./Dashboard";
import AnalyticsAndReport from "./AnalyticsAndReport";
import useTourismTheme from "../theme/useTourismTheme";
import { CHART_PALETTE_DEFAULTS, TourismChartPaletteContext } from "../theme/chartPalette";
import { deriveTourismTheme } from "../theme/deriveTourismTheme";
import { useTourismData } from "../context/TourismDataContext";

// Record the props each chart is given instead of drawing on a canvas.
const mockCharts = [];
jest.mock("react-chartjs-2", () => {
  const make = (type) => (props) => {
    mockCharts.push({ type, ...props });
    return null;
  };
  return { Bar: make("bar"), Line: make("line"), Doughnut: make("doughnut"), Pie: make("pie") };
});
// react-router-dom v7 is ESM that CRA's Jest cannot load; stub it as the other page tests do.
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const dashboardData = {
  filters: { year: "2026" },
  reportingDate: "2026-10-03",
  metrics: {},
  classification: { filipino: 3, foreign: 1 },
  gender: { male: 2, female: 2 },
  stayType: { dayTour: 1, overnight: 3 },
  validation: {},
  trends: { labels: ["Mon", "Tue"], arrivals: [4, 5] },
};

const reportData = {
  rows: [{ name: "Resort A", visitors: 10, revenue: 100 }],
  totals: { visitors: 10, revenue: 100 },
  questionAnswers: [
    { id: "peak_month", question: "q", answer: "a", visual: { type: "share", percentage: 40, value: 4, label: "October" } },
    { id: "top_resort", question: "q", answer: "a", visual: { type: "ranking", items: [{ label: "A", value: 3 }] } },
    { id: "month_compare", question: "q", answer: "a", visual: { type: "comparison", items: [{ label: "Sep", value: 1 }, { label: "Oct", value: 2 }] } },
    { id: "stay_type", question: "q", answer: "a", visual: { type: "split", items: [{ label: "Same-day", value: 1 }, { label: "Overnight", value: 2 }] } },
    {
      id: "validation",
      question: "q",
      answer: "a",
      visual: {
        type: "stack",
        items: [
          { label: "Pending", value: 1 },
          { label: "No-show", value: 1 },
          { label: "Duplicates", value: 1 },
          { label: "Incomplete", value: 1 },
        ],
      },
    },
  ],
};

beforeEach(() => {
  mockCharts.length = 0;
  useTourismData.mockReturnValue({
    dashboardData,
    loading: false,
    error: null,
    refreshDashboardData: jest.fn(),
    refreshDashboardIfStale: jest.fn(() => Promise.resolve()),
    isComputedDataStale: () => false,
    referenceTables: { resorts: [] },
    reportData,
    refreshReportData: jest.fn(() => Promise.resolve()),
  });
});

// Mirrors AppShell: the theme goes on the shell and the palette read back from it.
function ThemedShell({ color, children }) {
  const { shellRef, chartPalette } = useTourismTheme({ primary_color: color });
  return (
    <div className="tourism-layout" ref={shellRef}>
      <TourismChartPaletteContext.Provider value={chartPalette}>{children}</TourismChartPaletteContext.Provider>
    </div>
  );
}

async function renderIn(color, page) {
  let result;
  await act(async () => {
    result = render(
      <>
        <ThemedShell color={color}>{page}</ThemedShell>
      </>
    );
  });
  return result;
}

const latest = (type, predicate = () => true) => mockCharts.filter((c) => c.type === type && predicate(c)).pop();
const chartColours = (hex) => {
  const vars = deriveTourismTheme(hex);
  return { s: [1, 2, 3, 4, 5].map((n) => vars[`--th-chart-${n}`]), wash: vars["--th-chart-wash"] };
};
const TICK = CHART_PALETTE_DEFAULTS.tick;
const VALIDATION_FIXED = ["#147c79", "#359e9b", "#ffc978", "#ff8b21"];

function expectDashboard(hex) {
  const { s, wash } = chartColours(hex);
  const line = latest("line");
  expect(line.data.datasets[0].borderColor).toBe(s[0]);
  expect(line.data.datasets[0].pointBackgroundColor).toBe(s[0]);
  expect(line.data.datasets[0].backgroundColor).toBe(wash);
  expect(line.options.scales.y.ticks.color).toBe(TICK);
  expect(line.options.scales.x.ticks.color).toBe(TICK);
  expect(line.options.scales.y.grid.color).toBe("rgba(190, 205, 198, 0.35)");

  const bar = latest("bar");
  expect(bar.data.datasets[0].backgroundColor).toEqual([s[0], s[3]]);
  expect(bar.options.scales.y.ticks.color).toBe(TICK);
  expect(bar.options.scales.x.ticks.color).toBe(TICK);

  const doughnuts = mockCharts.filter((c) => c.type === "doughnut").slice(-2);
  doughnuts.forEach((d) => expect(d.data.datasets[0].backgroundColor).toEqual([s[0], s[3]]));
}

describe("Dashboard charts follow the shell theme", () => {
  test("a green shell gives the green palette", async () => {
    await renderIn("#2FA34A", <Dashboard />);
    expectDashboard("#2FA34A");
  });

  test("an orange shell gives the orange palette, legend swatches included", async () => {
    const { container } = await renderIn("#EF7C1F", <Dashboard />);
    expectDashboard("#EF7C1F");
    const swatches = Array.from(container.querySelectorAll("span[style]")).map((el) => el.style.backgroundColor);
    // jsdom reports rgb(); chart-1 #B65E16 and chart-4 #EFBA7B
    expect(swatches).toEqual(expect.arrayContaining(["rgb(182, 94, 22)", "rgb(239, 186, 123)"]));
  });

  test("charts redraw in the new colours when the theme changes", async () => {
    const { rerender } = await renderIn("#2FA34A", <Dashboard />);
    await act(async () => {
      rerender(
        <>
          <ThemedShell color="#EF7C1F">
            <Dashboard />
          </ThemedShell>
        </>
      );
    });
    expectDashboard("#EF7C1F");
  });

  test("outside a themed shell the charts use the green defaults without throwing", async () => {
    await act(async () => {
      render(
        <>
          <Dashboard />
        </>
      );
    });
    expect(latest("line").data.datasets[0].borderColor).toBe(CHART_PALETTE_DEFAULTS.series[0]);
    expect(latest("bar").data.datasets[0].backgroundColor).toEqual([
      CHART_PALETTE_DEFAULTS.series[0],
      CHART_PALETTE_DEFAULTS.series[3],
    ]);
  });

  test("no chart is drawn before the shell colours have been read", async () => {
    await act(async () => {
      render(
        <>
          <TourismChartPaletteContext.Provider value={null}>
            <Dashboard />
          </TourismChartPaletteContext.Provider>
        </>
      );
    });
    expect(mockCharts).toHaveLength(0);
  });
});

describe("Analytics & Reports charts follow the shell theme", () => {
  test.each(["#2FA34A", "#EF7C1F"])("charts for %s; the validation doughnut stays fixed", async (hex) => {
    const { container } = await renderIn(hex, <AnalyticsAndReport />);
    const { s } = chartColours(hex);

    const main = latest("bar", (c) => c.options.scales?.y?.ticks?.font?.size === 16);
    expect(main.data.datasets[0].backgroundColor).toBe(s[0]);
    expect(main.options.scales.y.ticks.color).toBe(TICK);

    const ranking = latest("bar", (c) => c.options.indexAxis === "y");
    expect(ranking.data.datasets[0].backgroundColor).toBe(s[0]);
    expect(ranking.options.scales.x.ticks.color).toBe(TICK);

    const comparison = latest("bar", (c) => c.options.scales?.y?.ticks?.font?.size === 11 && !c.options.indexAxis);
    expect(comparison.data.datasets[0].backgroundColor).toEqual([s[0], s[3]]);

    expect(latest("pie").data.datasets[0].backgroundColor).toEqual([s[0], s[3]]);
    expect(latest("doughnut").data.datasets[0].backgroundColor).toEqual(VALIDATION_FIXED);

    // Peak Season progress ring: themed arc, fixed grey track
    const strokes = Array.from(container.querySelectorAll("circle")).map((c) => c.getAttribute("stroke"));
    expect(strokes).toEqual(["#f1f5f9", s[0]]);
  });
});
