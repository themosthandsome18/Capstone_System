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
  stayType: { dayTour: 24, overnight: 18 },
  // the server sends exactly these two counts; there is no invalid count
  validation: { verifiedEntries: 128, duplicateEntries: 7 },
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

async function panel() {
  await act(async () => {
    render(<Dashboard />);
  });
  return document.querySelector(".validation-panel");
}

describe("Dashboard record check panel", () => {
  it("is called Record Check and says what the counts are", async () => {
    await panel();
    expect(screen.getByText("Record Check")).toBeTruthy();
    expect(screen.getByText("Counts from the records stored for this year")).toBeTruthy();
  });

  it("shows Total Records with its figure and note", async () => {
    await panel();
    const box = screen.getByText("Total Records").closest(".validation-box");
    expect(box.classList.contains("success")).toBe(true);
    expect(box.querySelector("h3").textContent).toBe("128");
    expect(box.querySelector("span").textContent).toBe("All bookings stored for this year");
  });

  it("shows Duplicate Contact Numbers with its figure and note", async () => {
    await panel();
    const box = screen.getByText("Duplicate Contact Numbers").closest(".validation-box");
    expect(box.classList.contains("warning")).toBe(true);
    expect(box.querySelector("h3").textContent).toBe("7");
    expect(box.querySelector("span").textContent).toBe("Numbers used by more than one record");
  });

  it("has exactly two boxes", async () => {
    const p = await panel();
    expect(p.querySelectorAll(".validation-box").length).toBe(2);
  });

  it("no longer has the invalid box, the dead button or the old claims, anywhere on the page", async () => {
    await panel();
    expect(screen.queryByText(/Invalid Entries/)).toBeNull();
    expect(screen.queryByText(/Review All/)).toBeNull();
    expect(screen.queryByText(/Automated quality checks/)).toBeNull();
    expect(screen.queryByText(/Data Validation Panel/)).toBeNull();
    expect(screen.queryByText(/Verified Entries/)).toBeNull();
    expect(screen.queryByText(/Duplicate Entries/)).toBeNull();
    expect(document.querySelector(".review-button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Invalid Entries|Review All|Automated quality checks/);
  });
});
