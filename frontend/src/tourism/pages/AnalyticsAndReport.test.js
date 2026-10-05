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
  "Yearly Report",
  "Resort Report",
  "Origin Report",
  "Purpose Report",
  "Vehicle Report",
  "Boat Report",
  "No-show Report",
];

// Rows in the backend's order: by visitors this sorts to Alpha, Charlie, Bravo.
const RESORT_REPORT = {
  type: "resort",
  filters: { year: "2026", type: "resort", from: "", to: "", resort_id: "" },
  rows: [
    { id: 2, name: "Bravo", male: 4, female: 6, visitors: 10, revenue: 800, avg: 80 },
    { id: 1, name: "Alpha", male: 18, female: 12, visitors: 30, revenue: 2400, avg: 80 },
    { id: 3, name: "Charlie", male: 11, female: 9, visitors: 20, revenue: 1600, avg: 80 },
  ],
  totals: { visitors: 60, male: 33, female: 27, revenue: 4800, avg: 80 },
  questionAnswers: [
    { id: "top_resort", question: "Which resort?", answer: "Alpha leads.", visual: { type: "ranking", items: [] } },
  ],
};

// Alphabetically the labels run Aug, Oct, Sep; by date Aug, Sep, Oct. The most
// visitors are on Oct 01, so neither order is the visitors order either.
const DAILY_REPORT = {
  type: "daily",
  filters: { year: "2026", type: "daily", from: "", to: "", resort_id: "" },
  rows: [
    { id: "2026-09-05", name: "Sep 05, 2026", male: 2, female: 3, visitors: 5, revenue: 400, avg: 80 },
    { id: "2026-10-01", name: "Oct 01, 2026", male: 5, female: 4, visitors: 9, revenue: 720, avg: 80 },
    { id: "2026-08-20", name: "Aug 20, 2026", male: 1, female: 1, visitors: 2, revenue: 160, avg: 80 },
  ],
  totals: { visitors: 16, male: 8, female: 8, revenue: 1280, avg: 80 },
  questionAnswers: [],
};

const MONTHLY_REPORT = {
  type: "monthly",
  filters: { year: "2026", type: "monthly", from: "", to: "", resort_id: "" },
  rows: [
    { id: "2026-09", name: "September 2026", male: 2, female: 3, visitors: 5, revenue: 400, avg: 80 },
    { id: "2026-10", name: "October 2026", male: 5, female: 4, visitors: 9, revenue: 720, avg: 80 },
    { id: "2026-08", name: "August 2026", male: 1, female: 1, visitors: 2, revenue: 160, avg: 80 },
  ],
  totals: { visitors: 16, male: 8, female: 8, revenue: 1280, avg: 80 },
  questionAnswers: [],
};

// The backend sends years in order; here they arrive out of order, and the
// most visitors are in 2026, so neither the visitors order nor the given order
// is year order.
const YEARLY_REPORT = {
  type: "yearly",
  filters: { year: "all", type: "yearly", from: "", to: "", resort_id: "" },
  rows: [
    { id: 2027, name: "2027", male: 2, female: 2, visitors: 4, revenue: 304, avg: 76 },
    { id: 2025, name: "2025", male: 3, female: 3, visitors: 6, revenue: 480, avg: 80 },
    { id: 2026, name: "2026", male: 19, female: 17, visitors: 36, revenue: 2736, avg: 76 },
  ],
  totals: { visitors: 46, male: 24, female: 22, revenue: 3520, avg: 77 },
  questionAnswers: [],
};

function setup({ stale = false, refresh, reportData = RESORT_REPORT, reportingYears = ["2026", "2025", "2024"] } = {}) {
  const refreshReportData = refresh || jest.fn().mockResolvedValue({});
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [] },
    reportData,
    refreshReportData,
    isComputedDataStale: () => stale,
    reportingYears,
  });
  render(<AnalyticsAndReport />);
  return { refreshReportData };
}

function tab(name) {
  return screen.getByRole("button", { name });
}

function breakdownTable() {
  return screen.getByText("Table Data Breakdown").closest(".report-table-card").querySelector("table");
}

function headerLabels() {
  // Each header is its label followed by the sort arrow.
  return [...breakdownTable().querySelectorAll("thead th")].map((th) =>
    th.firstChild.textContent.trim()
  );
}

function bodyNames() {
  return [...breakdownTable().querySelectorAll("tbody tr:not(.total-row) td:first-child")].map((td) =>
    td.firstChild.textContent
  );
}

function exported() {
  fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
  return exportCsv.mock.calls.at(-1);
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

describe("Reports table columns", () => {
  it("shows Name, Male, Female, Total Visitors, Total Fee, with no Avg column or sort dropdown", () => {
    setup();

    expect(headerLabels()).toEqual(["Resort Name", "Male", "Female", "Total Visitors", "Total Fee"]);
    expect(screen.queryByText(/Revenue/)).toBeNull();
    expect(screen.queryByTitle(/Revenue/)).toBeNull();
    expect(screen.getByTitle("Click to sort by Total Fee")).toBeTruthy();
    expect(screen.queryByText(/Expected Entrance Fee/)).toBeNull();
    expect(screen.queryByTitle(/Expected Entrance Fee/)).toBeNull();
    expect(screen.queryByText(/Avg/)).toBeNull();
    expect(screen.queryByText(/Sort Table/)).toBeNull();
    expect(breakdownTable().closest(".report-table-card").querySelector("select, button")).toBeNull();

    const alpha = [...breakdownTable().querySelectorAll("tbody tr")].find((tr) =>
      tr.textContent.startsWith("Alpha")
    );
    expect([...alpha.cells].map((td) => td.textContent)).toEqual(["Alpha", "18", "12", "30", "₱2,400"]);

    const total = breakdownTable().querySelector("tr.total-row");
    expect([...total.cells].map((td) => td.textContent)).toEqual(["Total", "33", "27", "60", "₱4,800"]);
  });

  it("exports the same columns in the same order, rows and Total", () => {
    setup();

    const [, headers, rows] = exported();

    expect(headers).toEqual([
      "Report Type",
      "Reporting Year",
      "Date From",
      "Date To",
      "Resort Filter",
      "Resort Name",
      "Male",
      "Female",
      "Total Visitors",
      "Total Fee",
    ]);
    expect(rows.map((row) => row.slice(5))).toEqual([
      ["Alpha", 18, 12, 30, 2400],
      ["Charlie", 11, 9, 20, 1600],
      ["Bravo", 4, 6, 10, 800],
      ["Total", 33, 27, 60, 4800],
    ]);
    rows.forEach((row) => expect(row).toHaveLength(headers.length));
  });

  it("sorts by Male from its header", () => {
    setup();

    fireEvent.click(screen.getByTitle("Click to sort by Male"));

    expect(bodyNames()).toEqual(["Alpha", "Charlie", "Bravo"]);
    fireEvent.click(screen.getByTitle("Click to sort by Male"));
    expect(bodyNames()).toEqual(["Bravo", "Charlie", "Alpha"]);
  });
});

// Backend order: most visitors first.
const BOAT_REPORT = {
  type: "boat",
  filters: { year: "2026", type: "boat", from: "", to: "", resort_id: "" },
  rows: [
    { id: "Passenger Boat", name: "Passenger Boat", male: 12, female: 8, visitors: 20, revenue: 1536, avg: 77 },
    { id: "Tourist Boat", name: "Tourist Boat", male: 7, female: 9, visitors: 16, revenue: 1200, avg: 75 },
  ],
  totals: { visitors: 36, male: 19, female: 17, revenue: 2736, avg: 76 },
  questionAnswers: [],
};

const VEHICLE_REPORT = {
  type: "transport",
  filters: { year: "2026", type: "transport", from: "", to: "", resort_id: "" },
  rows: [
    { id: "Private Vehicle", name: "Private Vehicle", male: 10, female: 10, visitors: 20, revenue: 1600, avg: 80 },
    { id: "Public Bus", name: "Public Bus", male: 9, female: 7, visitors: 16, revenue: 1136, avg: 71 },
  ],
  totals: { visitors: 36, male: 19, female: 17, revenue: 2736, avg: 76 },
  questionAnswers: [],
};

describe("Reports Boat tab", () => {
  it("sits right after Vehicle Report", () => {
    setup();

    const tabs = [...document.querySelectorAll(".report-tabs button")].map((button) => button.textContent);
    expect(tabs).toEqual(TAB_NAMES);
    expect(tabs.indexOf("Boat Report")).toBe(tabs.indexOf("Vehicle Report") + 1);
  });

  it("shows Boat Type, Male, Female, Total Visitors, Total Fee, most visitors first, and exports the same", () => {
    setup({ reportData: BOAT_REPORT });

    expect(headerLabels()).toEqual(["Boat Type", "Male", "Female", "Total Visitors", "Total Fee"]);
    expect(screen.getByRole("heading", { level: 3, name: "Boat Classification Report" })).toBeTruthy();
    expect(document.querySelector(".report-card-title p").textContent).toBe(
      "Visitor totals by boat type from arrived and pending bookings (no-shows excluded)"
    );
    expect(bodyNames()).toEqual(["Passenger Boat", "Tourist Boat"]);

    const [name, headers, rows] = exported();
    expect(name).toBe("tourism-boat-report.csv");
    expect(headers.slice(5)).toEqual(["Boat Type", "Male", "Female", "Total Visitors", "Total Fee"]);
    expect(rows.map((row) => row.slice(5))).toEqual([
      ["Passenger Boat", 12, 8, 20, 1536],
      ["Tourist Boat", 7, 9, 16, 1200],
      ["Total", 19, 17, 36, 2736],
    ]);
    expect(rows[0][0]).toBe("Boat Classification Report");
  });

  it("applies the imbalance guard", () => {
    const rows = BOAT_REPORT.rows.map((row) => (row.id === "Tourist Boat" ? { ...row, female: 8 } : row));
    setup({ reportData: { ...BOAT_REPORT, rows, totals: { ...BOAT_REPORT.totals, female: 16 } } });

    expect(screen.getByRole("note").textContent).toBe(
      "1 row: Male + Female does not equal Total Visitors; check these records."
    );
  });

  it("leaves the Vehicle tab as it was", () => {
    setup({ reportData: VEHICLE_REPORT });

    expect(headerLabels()).toEqual(["Vehicle", "Male", "Female", "Total Visitors", "Total Fee"]);
    expect(screen.getByRole("heading", { level: 3, name: "Vehicle Classification Report" })).toBeTruthy();
    expect(document.querySelector(".report-card-title p").textContent).toBe(
      "Visitor totals grouped by vehicle classification"
    );
    expect(bodyNames()).toEqual(["Private Vehicle", "Public Bus"]);
    const [name] = exported();
    expect(name).toBe("tourism-transport-report.csv");
  });
});

describe("Reports Yearly tab", () => {
  it("sits next to Monthly Report", () => {
    setup();

    const tabs = [...document.querySelectorAll(".report-tabs button")].map((button) => button.textContent);
    expect(tabs).toEqual(TAB_NAMES);
  });

  it("shows Year, Male, Female, Total Visitors, Total Fee, and exports the same", () => {
    setup({ reportData: YEARLY_REPORT });

    expect(headerLabels()).toEqual(["Year", "Male", "Female", "Total Visitors", "Total Fee"]);
    expect(screen.queryByText(/Avg/)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Yearly Tourist Arrival Report" })).toBeTruthy();
    const total = breakdownTable().querySelector("tr.total-row");
    expect([...total.cells].map((td) => td.textContent)).toEqual(["Total", "24", "22", "46", "₱3,520"]);

    const [name, headers, rows] = exported();
    expect(name).toBe("tourism-yearly-report.csv");
    expect(headers.slice(5)).toEqual(["Year", "Male", "Female", "Total Visitors", "Total Fee"]);
    expect(rows.map((row) => row.slice(5))).toEqual([
      ["2025", 3, 3, 6, 480],
      ["2026", 19, 17, 36, 2736],
      ["2027", 2, 2, 4, 304],
      ["Total", 24, 22, 46, 3520],
    ]);
    expect(rows[0][0]).toBe("Yearly Tourist Arrival Report");
  });

  it("opens in year order, earliest first, and the first column sorts by year", () => {
    setup({ reportData: YEARLY_REPORT });

    expect(bodyNames()).toEqual(["2025", "2026", "2027"]);

    fireEvent.click(screen.getByTitle("Click to sort by Name"));
    expect(bodyNames()).toEqual(["2027", "2026", "2025"]);

    fireEvent.click(screen.getByTitle("Click to sort by Name"));
    expect(bodyNames()).toEqual(["2025", "2026", "2027"]);
  });

  it("sorts the year as a number, not as text", () => {
    // Text order would put "10000" before "2025"; no real year does that, so
    // this pins the comparator's numeric path directly.
    const rows = [
      { id: 10000, name: "10000", male: 1, female: 0, visitors: 1, revenue: 80, avg: 80 },
      ...YEARLY_REPORT.rows,
    ];
    setup({ reportData: { ...YEARLY_REPORT, rows } });

    expect(bodyNames()).toEqual(["2025", "2026", "2027", "10000"]);
  });

  it("applies the imbalance guard", () => {
    const rows = YEARLY_REPORT.rows.map((row) => (row.id === 2027 ? { ...row, female: 1 } : row));
    setup({ reportData: { ...YEARLY_REPORT, rows, totals: { ...YEARLY_REPORT.totals, female: 21 } } });

    expect(screen.getByRole("note").textContent).toBe(
      "1 row: Male + Female does not equal Total Visitors; check these records."
    );
  });
});

describe("Reports year filter", () => {
  function yearOptions() {
    return [...screen.getByDisplayValue("2026").options].map((option) => option.value);
  }

  it("offers the years the backend found in the data, newest first, then All Years", () => {
    setup({ reportingYears: ["2027", "2026"] });

    expect(yearOptions()).toEqual(["2027", "2026", "all"]);
  });

  it("does not offer years that have no records", () => {
    setup({ reportingYears: ["2027", "2026"] });

    expect(yearOptions()).not.toContain("2024");
    expect(yearOptions()).not.toContain("2025");
  });
});

describe("Reports when the server rejects the year", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows the server's message, not a raw response or a blank page", async () => {
    const detail = 'Unknown year "2027x". Use a four-digit year such as 2026, or "all".';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ detail }),
    });
    // The real request path: fetch, apiClient, tourismApi, then the page.
    const { tourismApi } = jest.requireActual("../services/tourismApi");
    setup({ refresh: (filters) => tourismApi.getReportsData(filters) });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply Filters/ }));
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(screen.getByText(detail).className).toBe("tourist-record-error");
    expect(screen.queryByText(/\{"detail"/)).toBeNull();
    expect(screen.getByText("Table Data Breakdown")).toBeTruthy();
  });
});

describe("Reports subtitles", () => {
  it("say the visitor tabs count arrived and pending bookings, not only arrived ones", () => {
    const expected = {
      daily: "Daily visitor totals from arrived and pending bookings (no-shows excluded)",
      monthly: "Monthly visitor totals from arrived and pending bookings (no-shows excluded)",
      yearly: "Yearly visitor totals from arrived and pending bookings (no-shows excluded)",
      resort: "Visitor totals by resort from arrived and pending bookings (no-shows excluded)",
    };
    Object.entries(expected).forEach(([type, wanted]) => {
      useTourismData.mockReturnValue({
        referenceTables: { resorts: [] },
        reportData: { ...RESORT_REPORT, type, filters: { ...RESORT_REPORT.filters, type } },
        refreshReportData: jest.fn(),
        isComputedDataStale: () => false,
        reportingYears: ["2026"],
      });
      const view = render(<AnalyticsAndReport />);
      const subtitle = view.container.querySelector(".report-card-title p").textContent;
      expect(subtitle).toBe(wanted);
      expect(subtitle).not.toMatch(/based on arrived/);
      view.unmount();
    });
  });
});

describe("Reports date order", () => {
  it("starts the Daily tab in date order and sorts its first column by date, not alphabetically", () => {
    setup({ reportData: DAILY_REPORT });

    expect(bodyNames()).toEqual(["Aug 20, 2026", "Sep 05, 2026", "Oct 01, 2026"]);

    fireEvent.click(screen.getByTitle("Click to sort by Name"));
    expect(bodyNames()).toEqual(["Oct 01, 2026", "Sep 05, 2026", "Aug 20, 2026"]);

    fireEvent.click(screen.getByTitle("Click to sort by Name"));
    expect(bodyNames()).toEqual(["Aug 20, 2026", "Sep 05, 2026", "Oct 01, 2026"]);

    const [, , rows] = exported();
    expect(rows.map((row) => row[5])).toEqual(["Aug 20, 2026", "Sep 05, 2026", "Oct 01, 2026", "Total"]);
  });

  it("starts the Monthly tab in date order", () => {
    setup({ reportData: MONTHLY_REPORT });

    expect(bodyNames()).toEqual(["August 2026", "September 2026", "October 2026"]);
  });

  it("keeps most visitors first on the other tabs", () => {
    setup();

    expect(bodyNames()).toEqual(["Alpha", "Charlie", "Bravo"]);
  });
});

describe("Reports male and female balance", () => {
  it("shows no note when every row balances", () => {
    setup();

    expect(screen.queryByRole("note")).toBeNull();
    expect(breakdownTable().querySelector(".report-row-unbalanced")).toBeNull();
  });

  it("marks a row that does not balance, keeps its numbers, and adds the note", () => {
    // The backend's totals are the sums of the rows, so they are off too.
    const rows = RESORT_REPORT.rows.map((row) => (row.name === "Bravo" ? { ...row, female: 5 } : row));
    const totals = { ...RESORT_REPORT.totals, female: 26 };
    setup({ reportData: { ...RESORT_REPORT, rows, totals } });

    const note = screen.getByRole("note");
    expect(note.textContent).toBe("1 row: Male + Female does not equal Total Visitors; check these records.");

    const marked = breakdownTable().querySelectorAll("tbody tr:not(.total-row).report-row-unbalanced");
    expect(marked).toHaveLength(1);
    expect([...marked[0].cells].map((td) => td.textContent)).toEqual(["Bravo⚠", "4", "5", "10", "₱800"]);

    const total = breakdownTable().querySelector("tr.total-row");
    expect(total.classList.contains("report-row-unbalanced")).toBe(true);
    expect([...total.cells].map((td) => td.textContent)).toEqual(["Total", "33", "26", "60", "₱4,800"]);
  });
});

describe("Reports CSV", () => {
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
