import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AnalyticsAndReport from "./AnalyticsAndReport";
import { useTourismData } from "../context/TourismDataContext";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";

jest.mock("react-chartjs-2", () => ({ Bar: () => null, Doughnut: () => null, Line: () => null, Pie: () => null }));
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../../shared/csvExport", () => ({
  exportCsv: jest.fn(),
  datedCsvFilename: jest.fn(),
}));

const TAB_NAMES = [
  "Daily Report",
  "Monthly Report",
  "Resort Report",
  "Origin Report",
  "Purpose Report",
  "Vehicle Report",
  "No-show Report",
];

// Rows in the backend's order: by visitors this sorts to Alpha, Charlie, Bravo.
const RESORT_REPORT = {
  type: "resort",
  filters: { year: "2026", type: "resort", from: "", to: "", resort_id: "" },
  rows: [
    { id: 2, name: "Bravo", visitors: 10, revenue: 800, avg: 80 },
    { id: 1, name: "Alpha", visitors: 30, revenue: 2400, avg: 80 },
    { id: 3, name: "Charlie", visitors: 20, revenue: 1600, avg: 80 },
  ],
  totals: { visitors: 60, revenue: 4800, avg: 80 },
  questionAnswers: [
    { id: "top_resort", question: "Which resort?", answer: "Alpha leads.", visual: { type: "ranking", items: [] } },
  ],
};

function setup({ stale = false, refresh } = {}) {
  const refreshReportData = refresh || jest.fn().mockResolvedValue({});
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [] },
    reportData: RESORT_REPORT,
    refreshReportData,
    isComputedDataStale: () => stale,
  });
  render(<AnalyticsAndReport />);
  return { refreshReportData };
}

function tab(name) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  // CRA resets mock implementations before each test.
  datedCsvFilename.mockImplementation((name) => `${name}.csv`);
});

describe("Reports requests", () => {
  it("reuses the loaded report and answers on open instead of requesting them again", () => {
    const { refreshReportData } = setup();

    expect(refreshReportData).not.toHaveBeenCalled();
    screen.getByText("Alpha leads.");
  });

  it("refetches the report and answers on open when the data is stale", () => {
    const { refreshReportData } = setup({ stale: true });

    expect(refreshReportData).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resort", include_questions: true })
    );
  });

  it("a tab switch requests the report only, with the applied filters", async () => {
    const { refreshReportData } = setup();
    fireEvent.change(screen.getByDisplayValue("2026"), { target: { value: "2025" } });

    await act(async () => {
      fireEvent.click(tab("Daily Report"));
    });

    expect(refreshReportData).toHaveBeenCalledTimes(1);
    expect(refreshReportData).toHaveBeenCalledWith({
      year: "2026",
      from: "",
      to: "",
      resort_id: "",
      type: "daily",
      include_questions: false,
    });
  });

  it("Apply Filters refetches the report and the answers", async () => {
    const { refreshReportData } = setup();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply Filters/ }));
    });

    expect(refreshReportData).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resort", include_questions: true })
    );
  });
});

describe("Reports tabs while loading", () => {
  it("disables every tab until the report arrives, and keeps the loaded title", async () => {
    let finish;
    setup({ refresh: jest.fn(() => new Promise((resolve) => { finish = resolve; })) });

    await act(async () => {
      fireEvent.click(tab("Daily Report"));
    });

    TAB_NAMES.forEach((name) => expect(tab(name).disabled).toBe(true));
    expect(screen.getByRole("heading", { level: 3, name: "Visitors by Resorts" })).toBeTruthy();

    await act(async () => {
      finish({});
    });
    await waitFor(() => expect(tab("Monthly Report").disabled).toBe(false));
  });
});

describe("Reports CSV", () => {
  function exported() {
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    return exportCsv.mock.calls.at(-1);
  }

  it("exports the rows in the order the table shows them", () => {
    setup();

    let [, , rows] = exported();
    expect(rows.map((row) => row[5])).toEqual(["Alpha", "Charlie", "Bravo", "Total"]);

    fireEvent.click(screen.getByTitle("Click to sort by Name"));
    [, , rows] = exported();
    expect(rows.map((row) => row[5])).toEqual(["Alpha", "Bravo", "Charlie", "Total"]);
  });

  it("names the file and first column for the loaded report", () => {
    setup();

    const [name, headers] = exported();

    expect(name).toBe("tourism-resort-report.csv");
    expect(headers[0]).toBe("Report Type");
  });
});
