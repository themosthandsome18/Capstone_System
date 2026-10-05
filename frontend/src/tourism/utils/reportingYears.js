// The years a year filter offers: every year with tourist records (sent by
// the backend in the bootstrap, newest first) and the current year, then All
// Years. The selected year is always kept as an option, so the dropdown shows
// the year the data is for even when that year has no records.
export function currentReportingYear() {
  return String(new Date().getFullYear());
}

export function buildReportingYearOptions(reportingYears, selectedYear) {
  const years = new Set((reportingYears || []).map(String));
  years.add(currentReportingYear());
  if (selectedYear && selectedYear !== "all") {
    years.add(String(selectedYear));
  }

  return [
    ...[...years]
      .sort((a, b) => Number(b) - Number(a))
      .map((year) => ({ value: year, label: year })),
    { value: "all", label: "All Years" },
  ];
}
