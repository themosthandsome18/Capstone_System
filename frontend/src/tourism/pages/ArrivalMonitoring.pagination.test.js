/**
 * Arrival Monitoring pages its table in the browser, over the rows it received. The cards, the TOTAL row and Export CSV are the server's
 * figures for every arrival of the view, so none of them may follow the page or the number of rows per page.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArrivalMonitoring from "./ArrivalMonitoring";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";
import { exportCsv } from "../../shared/csvExport";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../services/tourismApi", () => ({
  tourismApi: { getArrivalMonitoringExport: jest.fn(), getTouristRecord: jest.fn() },
}));
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn((name) => `${name}.csv`) }));

const makeRows = (count) =>
  Array.from({ length: count }, (_, i) => ({
    survey_id: `SURV-${i + 1}`, date: "2026-09-22", group: `Group ${i + 1}`, male: 1, female: 1, itinerary: "Same Day",
    overnight: 0, sameDay: 2, resort: "Aquazul", feePaid: 160,
  }));

// The figures of the server are NOT what the rows add up to (they are of every arrival of the view): any number worked out from the page
// would show as another one.
const SUMMARY = { totalArrivals: 777, totalMale: 301, totalFemale: 402, overnight: 55, sameDay: 66, feesCollected: 12345 };
const DAILY = { male: 301, female: 402, overnight: 55, sameDay: 66, feesCollected: 12345 };

let data;

function setup(rows, filters = {}) {
  data = {
    arrivalMonitoring: {
      filters: { year: "2026", date: "2026-09-22", resort_id: "all", from: "", to: "", ...filters },
      summary: SUMMARY, rows, rowCount: rows.length, dailyTotals: DAILY,
    },
    referenceTables: { resorts: [{ resort_id: 9, resort_name: "Aquazul" }], countries: [], regions: [], provinces: [], itineraries: [], travelModes: [], boatTypes: [], visitPurposes: [] },
    reportingYears: ["2026", "2025"], loading: false, error: "",
    refreshArrivalMonitoring: jest.fn().mockResolvedValue({}), refreshArrivalMonitoringIfStale: jest.fn().mockResolvedValue(false),
    isComputedDataStale: () => false,
  };
  useTourismData.mockReturnValue(data);
  return render(<ArrivalMonitoring />);
}

// what the server sends next (other filters, other rows), shown by rendering the page again
function receive(view, change) {
  data = { ...data, arrivalMonitoring: { ...data.arrivalMonitoring, ...change(data.arrivalMonitoring) } };
  useTourismData.mockReturnValue(data);
  view.rerender(<ArrivalMonitoring />);
}

const names = () => Array.from(document.querySelectorAll(".arrival-table-card .arrival-record-link")).map((b) => b.textContent);
const showing = () => document.querySelector(".booking-pagination p").textContent.replace(/\s+/g, " ").trim();
const cards = () => Array.from(document.querySelectorAll(".arrival-stat-card h2")).map((h) => h.textContent);
const totalRow = () => Array.from(document.querySelector("tr.daily-total").children).map((c) => c.textContent);
const next = () => screen.getByRole("button", { name: "Next page" });
const prev = () => screen.getByRole("button", { name: "Previous page" });
const sizeSelect = () => screen.getByLabelText("Rows per page");

beforeEach(() => exportCsv.mockClear());

describe("the table", () => {
  it("25 rows at 10 a page: 10 are shown and it says Showing 1-10 of 25 filtered records", () => {
    setup(makeRows(25));

    expect(names()).toHaveLength(10);
    expect(names()[0]).toBe("Group 1");
    expect(names()[9]).toBe("Group 10");
    expect(showing()).toBe("Showing 1-10 of 25 filtered records");
  });

  it("the next page has the next ten and the last has the five that remain", () => {
    setup(makeRows(25));

    fireEvent.click(next());
    expect(showing()).toBe("Showing 11-20 of 25 filtered records");
    expect(names()[0]).toBe("Group 11");

    fireEvent.click(next());
    expect(showing()).toBe("Showing 21-25 of 25 filtered records");
    expect(names()).toHaveLength(5);
    expect(next().disabled).toBe(true);

    fireEvent.click(prev());
    expect(showing()).toBe("Showing 11-20 of 25 filtered records");
  });

  it("starts at 10 a page and offers 10, 25, 50 and 100", () => {
    setup(makeRows(25));

    expect(sizeSelect().value).toBe("10");
    expect(Array.from(sizeSelect().options).map((o) => o.value)).toEqual(["10", "25", "50", "100"]);
  });

  it("100 a page with only 13 rows: no page buttons, but Showing 1-13 of 13 filtered records", () => {
    setup(makeRows(13));
    userEvent.selectOptions(sizeSelect(), "100");

    expect(names()).toHaveLength(13);
    expect(showing()).toBe("Showing 1-13 of 13 filtered records");
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous page" })).toBeNull();
  });

  it("a single page at the default size has no buttons either, only the Showing line", () => {
    setup(makeRows(7));

    expect(showing()).toBe("Showing 1-7 of 7 filtered records");
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  });

  it("an empty view says Showing 0-0 of 0 and the table's message is still there", () => {
    setup([]);

    expect(showing()).toBe("Showing 0-0 of 0 filtered records");
    expect(document.querySelector(".arrival-table-card").textContent).toContain("No arrivals recorded");
  });
});

describe("the totals do not follow the page", () => {
  it("the six cards are the server's exact numbers", () => {
    setup(makeRows(25));

    expect(cards()).toEqual(["777", "301", "402", "55", "66", "₱12,345"]);
  });

  it("the TOTAL row is the server's exact numbers", () => {
    setup(makeRows(25));

    expect(totalRow().slice(2, 3)).toEqual(["301"]);
    expect(totalRow().slice(3, 4)).toEqual(["402"]);
    expect(totalRow().slice(5, 7)).toEqual(["55", "66"]);
    expect(totalRow()[8]).toBe("₱12,345");
  });

  it("the cards and the TOTAL row are the same on every page and at every size", () => {
    setup(makeRows(25));
    const first = { cards: cards(), total: totalRow() };

    fireEvent.click(next());
    expect({ cards: cards(), total: totalRow() }).toEqual(first);
    fireEvent.click(next());
    expect({ cards: cards(), total: totalRow() }).toEqual(first);
    userEvent.selectOptions(sizeSelect(), "50");
    expect({ cards: cards(), total: totalRow() }).toEqual(first);
    userEvent.selectOptions(sizeSelect(), "10");
    expect({ cards: cards(), total: totalRow() }).toEqual(first);
  });
});

describe("Export CSV", () => {
  it("writes every row of the view (the 25 the server sends), not the ten on the page", async () => {
    setup(makeRows(25));
    tourismApi.getArrivalMonitoringExport.mockResolvedValue({ rowCount: 25, rows: makeRows(25) });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    });

    expect(exportCsv).toHaveBeenCalledTimes(1);
    expect(exportCsv.mock.calls[0][2]).toHaveLength(25);
  });

  it("writes every row the server sends from page 2 too, however many more than were on screen", async () => {
    setup(makeRows(25));
    fireEvent.click(next());
    tourismApi.getArrivalMonitoringExport.mockResolvedValue({ rowCount: 400, rows: makeRows(400) });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    });

    expect(exportCsv.mock.calls[0][2]).toHaveLength(400);
  });
});

describe("going back to the first page", () => {
  it("when a filter of the loaded data changes (the year, the resort, the date)", () => {
    const view = setup(makeRows(25));
    const filters = (change) => receive(view, (current) => ({ filters: { ...current.filters, ...change } }));

    fireEvent.click(next());
    expect(showing()).toBe("Showing 11-20 of 25 filtered records");

    filters({ year: "2025" });
    expect(showing()).toBe("Showing 1-10 of 25 filtered records");

    fireEvent.click(next());
    filters({ resort_id: "9" });
    expect(showing()).toBe("Showing 1-10 of 25 filtered records");

    fireEvent.click(next());
    filters({ date: "2026-09-23" });
    expect(showing()).toBe("Showing 1-10 of 25 filtered records");
  });

  it("when the number of rows per page changes", () => {
    setup(makeRows(60));
    fireEvent.click(next());
    fireEvent.click(next());
    expect(showing()).toBe("Showing 21-30 of 60 filtered records");

    userEvent.selectOptions(sizeSelect(), "25");
    expect(showing()).toBe("Showing 1-25 of 60 filtered records");
  });

  it("a page past the last (the rows became fewer) is the last", () => {
    const view = setup(makeRows(25));
    fireEvent.click(next());
    fireEvent.click(next());
    expect(showing()).toBe("Showing 21-25 of 25 filtered records");

    receive(view, () => ({ rows: makeRows(12), rowCount: 12 }));

    expect(showing()).toBe("Showing 11-12 of 12 filtered records");
  });
});

describe("with the keyboard", () => {
  it("the choice has a real label and can be reached and changed from the keyboard", () => {
    setup(makeRows(25));
    const select = sizeSelect();

    expect(document.querySelector(`label[for="${select.id}"]`).textContent).toBe("Rows per page");
    select.focus();
    expect(document.activeElement).toBe(select);
    fireEvent.change(select, { target: { value: "25" } }); // what choosing an option with the arrow keys does
    expect(showing()).toBe("Showing 1-25 of 25 filtered records");
  });

  it("the Tab key goes from the choice to the Next button (Previous is disabled on page 1), and Enter presses it", () => {
    setup(makeRows(25));
    sizeSelect().focus();

    userEvent.tab();
    expect(document.activeElement).toBe(next());
    userEvent.keyboard("{enter}");
    expect(showing()).toBe("Showing 11-20 of 25 filtered records");
  });
});
