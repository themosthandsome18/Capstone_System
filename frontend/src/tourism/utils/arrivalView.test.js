import {
  VIEW_DAY,
  VIEW_MONTH,
  VIEW_YEAR,
  arrivalExportRows,
  arrivalRequestParams,
  exportDateSlug,
  monthLabel,
  monthRange,
  viewFromFilters,
} from "./arrivalView";

const TODAY = "2026-10-04";

describe("monthRange", () => {
  it("runs from the first to the last day of the month", () => {
    expect(monthRange("2026", "09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2026", "10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2026", "12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("knows February and leap years", () => {
    expect(monthRange("2026", "02").to).toBe("2026-02-28");
    expect(monthRange("2028", "02").to).toBe("2028-02-29");
  });
});

describe("arrivalRequestParams", () => {
  it("sends a day by its date", () => {
    expect(
      arrivalRequestParams({ view: VIEW_DAY, date: "2026-09-22", month: "01", year: "2025", resortId: "all" })
    ).toEqual({ year: "2026", date: "2026-09-22", resort_id: "all" });
  });

  it("sends a month as its first and last day, with the same year", () => {
    const params = arrivalRequestParams({
      view: VIEW_MONTH,
      date: TODAY,
      month: "09",
      year: "2026",
      resortId: "7",
    });

    expect(params).toEqual({ year: "2026", from: "2026-09-01", to: "2026-09-30", resort_id: "7" });
    expect(params.from.slice(0, 4)).toBe(params.year);
    expect(params.to.slice(0, 4)).toBe(params.year);
  });

  it("sends a year as date=all", () => {
    expect(
      arrivalRequestParams({ view: VIEW_YEAR, date: TODAY, month: "09", year: "2025", resortId: "all" })
    ).toEqual({ year: "2025", date: "all", resort_id: "all" });
  });
});

describe("viewFromFilters", () => {
  it("restores a year view", () => {
    expect(viewFromFilters({ year: "2025", date: "all", from: "", to: "" }, TODAY)).toMatchObject({
      view: VIEW_YEAR,
      year: "2025",
    });
  });

  it("restores a month view from the range", () => {
    expect(
      viewFromFilters({ year: "2026", date: "", from: "2026-09-01", to: "2026-09-30" }, TODAY)
    ).toMatchObject({ view: VIEW_MONTH, month: "09", year: "2026" });
  });

  it("restores a day view, and falls back to today", () => {
    expect(viewFromFilters({ year: "2026", date: "2026-09-22", from: "", to: "" }, TODAY)).toMatchObject({
      view: VIEW_DAY,
      date: "2026-09-22",
    });
    expect(viewFromFilters({}, TODAY)).toMatchObject({ view: VIEW_DAY, date: TODAY });
  });
});

describe("export naming and rows", () => {
  it("names each view", () => {
    expect(exportDateSlug({ view: VIEW_DAY, date: "2026-09-22", month: "09", year: "2026" })).toBe("2026-09-22");
    expect(exportDateSlug({ view: VIEW_MONTH, date: TODAY, month: "09", year: "2026" })).toBe("month-2026-09");
    expect(exportDateSlug({ view: VIEW_YEAR, date: TODAY, month: "09", year: "2026" })).toBe("all-dates-2026");
  });

  it("labels a month", () => {
    expect(monthLabel("2026", "09")).toBe("September 2026");
  });

  it("keeps every row", () => {
    const rows = Array.from({ length: 350 }, (_, index) => ({ date: "2026-09-01", group: `G${index}` }));
    expect(arrivalExportRows(rows)).toHaveLength(350);
  });
});
