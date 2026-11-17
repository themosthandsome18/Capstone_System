import { act, render } from "@testing-library/react";
import Dashboard from "./Dashboard";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("react-chartjs-2", () => {
  const empty = () => null;
  return { Bar: empty, Line: empty, Doughnut: empty, Pie: empty };
});
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

beforeEach(() => {
  useTourismData.mockReturnValue({
    dashboardData: {
      filters: { year: "2026" },
      reportingDate: "2026-10-03",
      metrics: {},
      classification: { filipino: 3, foreign: 1 },
      gender: { male: 2, female: 2 },
      stayType: { dayTour: 24, overnight: 18 },
      trends: { labels: ["Mon", "Tue"], arrivals: [4, 5] },
    },
    loading: false,
    error: null,
    refreshDashboardData: jest.fn(),
    refreshDashboardIfStale: jest.fn(() => Promise.resolve()),
    isComputedDataStale: () => false,
    referenceTables: { resorts: [] },
  });
});

describe("Dashboard has no validation panel and no Export button", () => {
  it("shows none of the panel's words, boxes, button or figures", async () => {
    await act(async () => {
      render(<Dashboard />);
    });
    const text = document.body.textContent;
    for (const gone of ["Data Validation Panel", "Verified Entries", "Invalid Entries", "Duplicate Entries", "Review All"]) {
      expect(text).not.toContain(gone);
    }
    expect(document.querySelector(".validation-panel, .validation-box, .validation-grid, .review-button")).toBeNull();
    // the rest of the dashboard is still there
    expect(text).toContain("Dashboard Overview");
    expect(text).toContain("Same Day");
  });

  it("has no Export button, and keeps + Generate Report", async () => {
    await act(async () => {
      render(<Dashboard />);
    });
    const buttons = Array.from(document.querySelectorAll("button")).map((b) => b.textContent.trim());
    expect(buttons).not.toContain("Export");
    expect(buttons.some((t) => /export/i.test(t))).toBe(false);
    expect(buttons).toContain("+ Generate Report");
  });
});
