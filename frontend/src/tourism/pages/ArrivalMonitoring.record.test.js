/**
 * Arrival Monitoring: the name of a row opens the modal of that arrival. The table itself (its columns, its numbers, its totals) is as it was.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import { join } from "path";
import ArrivalMonitoring from "./ArrivalMonitoring";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";
import { normalised, expectedNorm, rule } from "../testing/cssRules";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../services/tourismApi", () => ({
  tourismApi: { getArrivalMonitoringExport: jest.fn(), getTouristRecord: jest.fn() },
}));
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn((name) => `${name}.csv`) }));

const ROWS = [
  { survey_id: "SURV-1", date: "2026-09-22", group: "Ana Reyes", male: 2, female: 4, itinerary: "2 Nights", overnight: 12, sameDay: 18, resort: "Aquazul", feePaid: 480 },
  { survey_id: "SURV-2", date: "2026-09-22", group: "Ben Cruz", male: 1, female: 0, itinerary: "Same Day", overnight: 0, sameDay: 1, resort: "Tent Place", feePaid: 80 },
  { survey_id: "SURV-3", date: "2026-09-22", group: "", male: 0, female: 2, itinerary: "", overnight: 0, sameDay: 2, resort: "", feePaid: 160 },
];

const RECORD = {
  survey_id: "SURV-1",
  full_name: "Ana Reyes",
  first_name: "Ana",
  last_name: "Reyes",
  total_visitors: 6,
  total_male: 2,
  total_female: 4,
  arrival_date: "2026-09-22",
  status: "arrived",
  resort_id: 9,
  computed: {
    overnight: { male: 111, female: 222, total: 333 },
    sameDay: { male: 444, female: 555, total: 999 },
    fee: { total: 5555, regularCount: 3, regularRate: 80, regularTotal: 240, discountedCount: 3, discountedRate: 64, discountedTotal: 192 },
  },
};

function setup(rows = ROWS) {
  useTourismData.mockReturnValue({
    arrivalMonitoring: {
      filters: { year: "2026", date: "2026-09-22", resort_id: "all", from: "", to: "" },
      summary: { totalArrivals: 9, totalMale: 3, totalFemale: 6, overnight: 12, sameDay: 21, feesCollected: 720 },
      rows,
      rowCount: rows.length,
      dailyTotals: { male: 3, female: 6, overnight: 12, sameDay: 21, feesCollected: 720 },
    },
    referenceTables: { resorts: [{ resort_id: 9, resort_name: "Aquazul", location: "Cagbalete", access: "Boat" }], countries: [], regions: [], provinces: [], itineraries: [], travelModes: [], boatTypes: [], visitPurposes: [] },
    reportingYears: ["2026"],
    loading: false,
    error: "",
    refreshArrivalMonitoring: jest.fn().mockResolvedValue({}),
    refreshArrivalMonitoringIfStale: jest.fn().mockResolvedValue(false),
    isComputedDataStale: () => false,
  });
  return render(<ArrivalMonitoring />);
}

const table = () => document.querySelector(".arrival-table-card table");
const cells = (tr) => Array.from(tr.children).map((c) => c.textContent);

beforeEach(() => {
  mockNavigate.mockClear();
  tourismApi.getTouristRecord.mockReset();
  tourismApi.getTouristRecord.mockResolvedValue(RECORD);
});

describe("the name of a row", () => {
  it("is a real button, with the class the stylesheet aims at", () => {
    setup();
    const buttons = within(table()).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Ana Reyes", "Ben Cruz", "SURV-3"]); // a row with no name shows its survey id
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.className).toBe("arrival-record-link");
      expect(button.closest("td").className).toBe("guest-name");
    }
  });

  it("opens the modal and asks the server for that record: the right endpoint, once", async () => {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Reyes" }));
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-1");
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 }).textContent).toBe("Ana Reyes");
  });

  it("another row asks for its own record", async () => {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ben Cruz" }));
    });
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-2");
  });

  it("pressed twice at once it still asks only once", async () => {
    let finish;
    tourismApi.getTouristRecord.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup();
    const button = screen.getByRole("button", { name: "Ana Reyes" });

    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);

    await act(async () => finish(RECORD));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("the modal shows the server's `computed` figures, nothing the page worked out", async () => {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Reyes" }));
    });
    const dialog = screen.getByRole("dialog");
    // the row says 12 and 18; the record from the server says 333 and 999: it is the server's that the modal writes
    expect(dialog.textContent).toContain("333 person-nights");
    expect(dialog.textContent).toContain("999 person-days");
    expect(dialog.textContent).toContain("111 male · 222 female");
    expect(dialog.textContent).toContain("444 male · 555 female");
    expect(dialog.textContent).toContain("₱5,555");
    expect(dialog.textContent).toContain("3 × ₱80 = ₱240");
    expect(dialog.textContent).toContain("3 × ₱64 = ₱192");
  });

  it("when the server fails, no modal opens and the page says so, and the button works again", async () => {
    tourismApi.getTouristRecord.mockRejectedValueOnce(new Error("Server is down"));
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Reyes" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Server is down");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Reyes" }));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(2);
  });

  it("a record that is all blank and null opens without a crash and without undefined, null or NaN", async () => {
    tourismApi.getTouristRecord.mockResolvedValue({ survey_id: "SURV-3", computed: null, full_name: null, total_male: null });
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SURV-3" }));
    });
    expect(screen.getByRole("dialog").textContent).not.toMatch(/undefined|null|NaN/);
  });
});

describe("the whole row opens it, not only the name", () => {
  const firstRow = () => table().querySelector("tbody tr.arrival-row");

  // the cells of a row, by what they are: date, name, male, female, length of stay, overnight, same day, resort, fee, the chevron
  it.each([
    ["the date", 0],
    ["the male count", 2],
    ["the length of stay", 4],
    ["the resort", 7],
    ["the fee", 8],
    ["the chevron", 9],
  ])("pressing %s opens the modal of that row, asking the server once", async (_label, column) => {
    setup();

    await act(async () => {
      fireEvent.click(firstRow().children[column]);
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-1");
  });

  it("another row's cell asks for that row's record", async () => {
    setup();
    const second = table().querySelectorAll("tbody tr.arrival-row")[1];

    await act(async () => {
      fireEvent.click(second.children[7]);
    });

    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-2");
  });

  it("pressing the name itself asks for the record exactly once, not twice (the press does not go on up to the row)", async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Reyes" }));
    });

    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("the press of the name is stopped there: it does not go on up to the row", () => {
    setup();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = jest.spyOn(event, "stopPropagation");

    screen.getByRole("button", { name: "Ana Reyes" }).dispatchEvent(event);

    expect(stop).toHaveBeenCalled();
    stop.mockRestore();
  });

  it("the Enter key on the name opens it, with the keyboard alone", async () => {
    setup();
    const button = screen.getByRole("button", { name: "Ana Reyes" });
    button.focus();

    await act(async () => {
      userEvent.keyboard("{enter}");
    });

    expect(button.tagName).toBe("BUTTON");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-1");
  });

  it("the Space key on the name opens it too", async () => {
    setup();
    screen.getByRole("button", { name: "Ben Cruz" }).focus();

    await act(async () => {
      userEvent.keyboard("{space}");
    });

    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-2");
  });

  it("the name is still a real button, and it is the only thing in the row that can take the focus", () => {
    setup();
    const row = firstRow();
    const focusable = row.querySelectorAll('button, a[href], input, select, textarea, [tabindex]');
    expect(Array.from(focusable).map((el) => el.tagName)).toEqual(["BUTTON"]);
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(screen.getByRole("button", { name: "Ana Reyes" }).tagName).toBe("BUTTON");
  });

  it("after a press on another part of the row, closing it gives the focus to the name", async () => {
    setup();
    await act(async () => {
      fireEvent.click(firstRow().children[7]);
    });

    fireEvent.click(document.querySelector(".arm-footer button")); // the Close of the footer

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ana Reyes" }));
  });

  it("a second row pressed while the first is still being asked for is ignored: one request at a time", async () => {
    let finish;
    tourismApi.getTouristRecord.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup();
    const rows = table().querySelectorAll("tbody tr.arrival-row");

    await act(async () => {
      fireEvent.click(rows[0].children[0]);
      fireEvent.click(rows[1].children[0]);
    });

    expect(tourismApi.getTouristRecord).toHaveBeenCalledTimes(1);
    expect(tourismApi.getTouristRecord).toHaveBeenCalledWith("SURV-1");
    await act(async () => finish(RECORD));
  });

  it("the TOTAL row does not open anything: no request, no modal, whichever cell is pressed", async () => {
    setup();
    const total = table().querySelector("tr.daily-total");
    expect(total.classList.contains("arrival-row")).toBe(false);

    for (const cell of Array.from(total.children)) {
      await act(async () => {
        fireEvent.click(cell);
      });
    }
    await act(async () => {
      fireEvent.click(total);
    });

    expect(tourismApi.getTouristRecord).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the message row of an empty table does not open anything either", async () => {
    setup([]);
    const message = table().querySelector("tbody td[colspan]").parentElement;

    await act(async () => {
      fireEvent.click(message);
      fireEvent.click(message.firstElementChild);
    });

    expect(tourismApi.getTouristRecord).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the pointer is the whole row's: the stylesheet gives tr.arrival-row cursor: pointer, and not the total row", () => {
    setup();
    expect(rule("tr.arrival-row").cursor).toBe("pointer");
    expect(table().querySelectorAll("tr.arrival-row")).toHaveLength(3);
    expect(table().querySelector("tr.daily-total").matches("tr.arrival-row")).toBe(false);
    expect(table().querySelector("thead tr").matches("tr.arrival-row")).toBe(false);
  });
});

describe("closing", () => {
  async function open() {
    setup();
    const button = screen.getByRole("button", { name: "Ana Reyes" });
    await act(async () => {
      fireEvent.click(button);
    });
    return button;
  }

  it("Close closes it, and the focus returns to the name that was pressed", async () => {
    const button = await open();
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Close" })[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Escape closes it", async () => {
    await open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Open destination goes to the destinations page with the id of the resort, and closes the modal", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Open destination" }));
    expect(mockNavigate).toHaveBeenCalledWith("/destinations", { state: { openResortId: 9 } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the table is as it was", () => {
  it("the nine columns of before come first, in their order, and the new one is last and empty", () => {
    setup();
    const headers = Array.from(table().querySelectorAll("thead th"));
    expect(headers.map((h) => h.textContent)).toEqual([
      "Date", "Group/Guest", "Male", "Female", "Length of Stay", "Overnight", "Same Day", "Resort", "Fee Paid", "",
    ]);
    expect(headers[9].getAttribute("aria-hidden")).toBe("true");
    expect(headers[9].className).toBe("arrival-chevron-col");
  });

  it("the cells of a row are what they were; the name is the same text, now in a button", () => {
    setup();
    const rows = Array.from(table().querySelectorAll("tbody tr.arrival-row"));
    expect(rows).toHaveLength(3);
    expect(cells(rows[0]).slice(0, 9)).toEqual(["Sep 22, 2026", "Ana Reyes", "2", "4", "2 Nights", "12", "18", "Aquazul", "₱480"]);
    expect(cells(rows[1]).slice(0, 9)).toEqual(["Sep 22, 2026", "Ben Cruz", "1", "0", "Same Day", "--", "1", "Tent Place", "₱80"]);
  });

  it("the last cell of each row is a › that a screen reader does not read", () => {
    setup();
    for (const row of table().querySelectorAll("tbody tr.arrival-row")) {
      const last = row.lastElementChild;
      expect(last.textContent).toBe("›");
      expect(last.getAttribute("aria-hidden")).toBe("true");
      expect(last.className).toBe("arrival-chevron");
    }
  });

  it("the totals row and the figures above are as they were (the totals row only gains an empty last cell)", () => {
    setup();
    const total = table().querySelector("tr.daily-total");
    expect(cells(total)).toEqual(["DAILY TOTAL", "", "3", "6", "", "12", "21", "", "₱720", ""]);
    expect(total.children).toHaveLength(10);
    expect(document.body.textContent).toContain("9 total visitor(s) across 3 arrived booking group(s)");
    const stat = (title) => screen.getByText(title, { selector: ".arrival-stat-card p" }).parentElement.querySelector("h2").textContent;
    expect([stat("Total Arrivals"), stat("Overnight"), stat("Same Day")]).toEqual(["9", "12", "21"]);
  });

  it("with no rows the message still spans the whole table, the new column too", () => {
    setup([]);
    const empty = table().querySelector("tbody td[colspan]");
    expect(empty.getAttribute("colspan")).toBe("10");
    expect(table().querySelectorAll("thead th")).toHaveLength(10);
  });
});

describe("the stylesheet's selectors find the page's markup", () => {
  it("the link, the row and the chevron column are what the CSS aims at, and the CSS has rules for them", () => {
    setup();
    for (const selector of [".arrival-record-link", "tr.arrival-row", "tr.arrival-row > td", ".arrival-chevron", ".arrival-chevron-col"]) {
      expect({ selector, found: document.querySelectorAll(selector).length > 0 }).toEqual({ selector, found: true });
    }
    expect(normalised(".arrival-record-link")).toMatchObject(expectedNorm({ "font-weight": "700" }));
    expect(normalised("tr.arrival-row:hover > td")).toMatchObject(expectedNorm({ background: "#FDF5EC" }));
  });

  it("Destination Management opens the Details of the resort the arrival came from (its side of Open destination)", () => {
    const page = readFileSync(join(__dirname, "DestinationManagement.js"), "utf8");
    expect(page).toMatch(/location\.state\?\.openResortId/);
  });
});
