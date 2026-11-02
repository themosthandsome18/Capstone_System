import { act, render, screen } from "@testing-library/react";
import Dashboard from "./Dashboard";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("react-chartjs-2", () => {
  const empty = () => null;
  return { Bar: empty, Line: empty, Doughnut: empty, Pie: empty };
});
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const dashboardData = {
  filters: { year: "2026" },
  reportingDate: "2026-10-03",
  metrics: {},
  classification: { filipino: 3, foreign: 1 },
  gender: { male: 2, female: 2 },
  // 3 nights x 6 people: 18 nights, 24 days
  stayType: { dayTour: 24, overnight: 18 },
  validation: {},
  trends: { labels: ["Mon", "Tue"], arrivals: [4, 5] },
};

beforeEach(() => {
  useTourismData.mockReturnValue({
    dashboardData,
    loading: false,
    error: null,
    refreshDashboardData: jest.fn(),
    refreshDashboardIfStale: jest.fn(() => Promise.resolve()),
    isComputedDataStale: () => false,
    referenceTables: { resorts: [] },
  });
});

describe("Dashboard stay figures", () => {
  it("says days and nights counted per person, not a count of tourists", async () => {
    await act(async () => {
      render(<Dashboard />);
    });

    const sameDay = screen.getByText("Same Day", { selector: ".stay-label" }).closest(".stay-box");
    const overnight = screen.getByText("Overnight", { selector: ".stay-label" }).closest(".stay-box");

    expect(sameDay.textContent).toContain("24");
    expect(sameDay.querySelector("p").textContent).toBe("Days counted per person");
    expect(overnight.textContent).toContain("18");
    expect(overnight.querySelector("p").textContent).toBe("Nights counted per person");
    expect(screen.queryByText(/of tourists/)).toBeNull();
    expect(screen.queryByText(/Backend computed/)).toBeNull();
  });
});
