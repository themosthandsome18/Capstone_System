import { buildReportingYearOptions, currentReportingYear } from "./reportingYears";

describe("buildReportingYearOptions", () => {
  it("offers the years with records, newest first, then All Years", () => {
    const options = buildReportingYearOptions(["2027", "2024"], "2027");

    expect(options.map((option) => option.value)).toEqual(
      [...new Set(["2027", "2024", currentReportingYear()])]
        .sort((a, b) => Number(b) - Number(a))
        .concat("all")
    );
    expect(options.at(-1)).toEqual({ value: "all", label: "All Years" });
  });

  it("always offers the current year, even with no records", () => {
    expect(buildReportingYearOptions([], "all").map((option) => option.value)).toEqual([
      currentReportingYear(),
      "all",
    ]);
    expect(buildReportingYearOptions(undefined, undefined).map((option) => option.value)).toEqual([
      currentReportingYear(),
      "all",
    ]);
  });

  it("keeps the selected year as an option so the dropdown never shows another year", () => {
    const values = buildReportingYearOptions([currentReportingYear()], "2019").map((option) => option.value);

    expect(values).toContain("2019");
  });
});
