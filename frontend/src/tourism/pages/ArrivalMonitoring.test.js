import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ArrivalMonitoring from "./ArrivalMonitoring";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../services/tourismApi", () => ({
  tourismApi: { getArrivalMonitoringExport: jest.fn() },
}));
jest.mock("../../shared/csvExport", () => ({
  exportCsv: jest.fn(),
  datedCsvFilename: jest.fn((name) => `${name}.csv`),
}));

function row(index) {
  return {
    survey_id: `SURV-${index}`,
    date: "2026-09-22",
    group: `Group ${index}`,
    male: 1,
    female: 1,
    itinerary: "Overnight",
    overnight: 2,
    sameDay: 0,
    resort: "Resort",
    feePaid: 160,
  };
}

function setup(filters, extra = {}) {
  const refreshArrivalMonitoring = jest.fn().mockResolvedValue({});
  useTourismData.mockReturnValue({
    arrivalMonitoring: {
      filters: { year: "2026", date: "", resort_id: "all", from: "", to: "", ...filters },
      summary: { totalArrivals: 2 },
      rows: [row(1)],
      rowCount: 1,
      dailyTotals: {},
      ...extra,
    },
    referenceTables: { resorts: [] },
    loading: false,
    error: "",
    refreshArrivalMonitoring,
    refreshArrivalMonitoringIfStale: jest.fn().mockResolvedValue(false),
    isComputedDataStale: () => false,
  });
  render(<ArrivalMonitoring />);
  return { refreshArrivalMonitoring };
}

function pressed(name) {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed");
}

beforeEach(() => {
  // CRA resets mock implementations before each test.
  datedCsvFilename.mockImplementation((name) => `${name}.csv`);
});

describe("Arrival Monitoring views send the right request", () => {
  it("Day sends the chosen date", async () => {
    const { refreshArrivalMonitoring } = setup({ date: "2026-09-22" });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Date:"), { target: { value: "2026-09-23" } });
    });

    expect(refreshArrivalMonitoring).toHaveBeenLastCalledWith({
      year: "2026",
      date: "2026-09-23",
      resort_id: "all",
    });
  });

  it("Month sends the first and last day of the month, with a matching year", async () => {
    const { refreshArrivalMonitoring } = setup({ date: "2026-09-22" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Month" }));
    });
    expect(refreshArrivalMonitoring).toHaveBeenLastCalledWith({
      year: "2026",
      from: "2026-09-01",
      to: "2026-09-30",
      resort_id: "all",
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Arrival month"), { target: { value: "02" } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Arrival reporting year"), { target: { value: "2024" } });
    });
    expect(refreshArrivalMonitoring).toHaveBeenLastCalledWith({
      year: "2024",
      from: "2024-02-01",
      to: "2024-02-29",
      resort_id: "all",
    });
  });

  it("Month never sends All Years", async () => {
    const { refreshArrivalMonitoring } = setup({ date: "all", year: "all" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Month" }));
    });

    const params = refreshArrivalMonitoring.mock.calls.at(-1)[0];
    expect(params.year).not.toBe("all");
    expect(params.from.slice(0, 4)).toBe(params.year);
  });

  it("Year sends date=all", async () => {
    const { refreshArrivalMonitoring } = setup({ date: "2026-09-22" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Year" }));
    });

    expect(refreshArrivalMonitoring).toHaveBeenLastCalledWith({
      year: "2026",
      date: "all",
      resort_id: "all",
    });
  });
});

describe("Arrival Monitoring reopens on the view it was showing", () => {
  it("restores a day", () => {
    setup({ date: "2026-09-22" });
    expect(pressed("Day")).toBe("true");
    expect(screen.getByLabelText("Date:").value).toBe("2026-09-22");
  });

  it("restores a month", () => {
    setup({ date: "", from: "2026-09-01", to: "2026-09-30" });
    expect(pressed("Month")).toBe("true");
    expect(screen.getByLabelText("Arrival month").value).toBe("09");
    expect(screen.getByLabelText("Arrival reporting year").value).toBe("2026");
    screen.getByText(/Month View: Displaying aggregate arrivals for September 2026/);
  });

  it("restores a year", () => {
    setup({ date: "all", year: "2025" });
    expect(pressed("Year")).toBe("true");
    expect(screen.queryByLabelText("Arrival month")).toBeNull();
    expect(screen.getByLabelText("Arrival reporting year").value).toBe("2025");
  });
});

describe("Arrival Monitoring export", () => {
  async function exportView() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    });
    await waitFor(() => expect(exportCsv).toHaveBeenCalled());
    return exportCsv.mock.calls.at(-1);
  }

  it("asks for every row of the view and writes them all, beyond 300", async () => {
    const rows = Array.from({ length: 350 }, (_, index) => row(index));
    tourismApi.getArrivalMonitoringExport.mockResolvedValue({ rowCount: 350, rows });
    setup({ date: "", from: "2026-09-01", to: "2026-09-30" }, { rows: rows.slice(0, 300), rowCount: 350 });

    const [, headers, csvRows] = await exportView();

    expect(tourismApi.getArrivalMonitoringExport).toHaveBeenCalledWith({
      year: "2026",
      from: "2026-09-01",
      to: "2026-09-30",
      resort_id: "all",
    });
    expect(headers[0]).toBe("Date");
    expect(csvRows).toHaveLength(350);
  });

  it("shows how many rows the capped table holds", () => {
    const rows = Array.from({ length: 300 }, (_, index) => row(index));
    setup({ date: "all" }, { rows, rowCount: 350 });

    screen.getByText(/Showing the 300 most recently updated of 350 arrivals/);
  });

  it.each([
    [{ date: "2026-09-22" }, "arrival-monitoring-2026-09-22-all-resorts.csv"],
    [{ date: "", from: "2026-09-01", to: "2026-09-30" }, "arrival-monitoring-month-2026-09-all-resorts.csv"],
    [{ date: "all", year: "2026" }, "arrival-monitoring-all-dates-2026-all-resorts.csv"],
  ])("names the file for the view %#", async (filters, filename) => {
    tourismApi.getArrivalMonitoringExport.mockResolvedValue({ rowCount: 1, rows: [row(1)] });
    setup(filters);

    const [name] = await exportView();

    expect(name).toBe(filename);
  });
});
