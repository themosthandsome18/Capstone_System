import { useEffect, useRef, useState, useMemo, memo } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Pie } from "react-chartjs-2";
import { FiClock, FiDownload, FiPrinter } from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";
import { buildReportingYearOptions } from "../utils/reportingYears";
import { watchPrint } from "../utils/printCharts";
import {
  CHART_PALETTE_DEFAULTS,
  seriesColors,
  useTourismChartPalette,
} from "../theme/chartPalette";

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getReportTitle(type) {
  if (type === "daily") {
    return "Daily Tourist Arrival Report";
  }

  if (type === "monthly") {
    return "Monthly Tourist Arrival Report";
  }

  if (type === "yearly") {
    return "Yearly Tourist Arrival Report";
  }

  if (type === "origin") {
    return "Visitor Origin Report";
  }

  if (type === "purpose") {
    return "Purpose of Travel Report";
  }

  if (type === "transport") {
    return "Vehicle Classification Report";
  }

  if (type === "boat") {
    return "Boat Classification Report";
  }

  if (type === "no_show") {
    return "No-show Booking Report";
  }

  return "Visitors by Resorts";
}

function getReportSubtitle(type) {
  if (type === "daily") {
    return "Daily visitor totals from arrived and pending bookings (no-shows excluded)";
  }

  if (type === "monthly") {
    return "Monthly visitor totals from arrived and pending bookings (no-shows excluded)";
  }

  if (type === "yearly") {
    return "Yearly visitor totals from arrived and pending bookings (no-shows excluded)";
  }

  if (type === "origin") {
    return "Visitor totals grouped by province of residence, or by country for foreign visitors";
  }

  if (type === "purpose") {
    return "Visitor totals grouped by declared purpose of travel";
  }

  if (type === "transport") {
    return "Visitor totals grouped by vehicle classification";
  }

  if (type === "boat") {
    return "Visitor totals by boat type from arrived and pending bookings (no-shows excluded)";
  }

  if (type === "no_show") {
    return "No-show bookings grouped by resort";
  }

  return "Visitor totals by resort from arrived and pending bookings (no-shows excluded)";
}

function getFirstColumnLabel(type) {
  if (type === "daily") {
    return "Date";
  }

  if (type === "monthly") {
    return "Month";
  }

  if (type === "yearly") {
    return "Year";
  }

  if (type === "origin") {
    return "Province / Country";
  }

  if (type === "purpose") {
    return "Purpose";
  }

  if (type === "transport") {
    return "Vehicle";
  }

  if (type === "boat") {
    return "Boat Type";
  }

  if (type === "no_show") {
    return "Resort Name";
  }

  return "Resort Name";
}

const currentReportingYear = String(new Date().getFullYear());

const tourismTitleMap = {
  top_resort: "Top Tourist Destination",
  month_compare: "Month-over-Month Arrivals",
  peak_month: "Peak Season Analysis",
  classification: "Visitor Demographics",
  stay_type: "Same Day vs. Overnight Stays",
  overnight_resort: "Top Destination for Overnight Stays",
  average_stay: "Average Length of Stay",
  top_origin: "Top Visitor Origins",
  visit_purpose: "Primary Purpose of Travel",
  high_demand: "Destinations with Growing Demand",
  validation: "Data Quality & Validation",
};




// Chart colours come from the theme (chartPalette.js); grid lines stay fixed.
const buildMainReportChartOptions = (palette) => ({
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        color: palette.tick,
        font: { size: 16 },
      },
      grid: {
        color: "rgba(148, 163, 184, 0.25)",
        borderDash: [4, 4],
      },
    },
    x: {
      ticks: {
        color: palette.tick,
        font: { size: 15 },
      },
      grid: { display: false },
    },
  },
});

// Data Quality & Validation is a STATUS chart (Pending, No-show, Duplicates,
// Incomplete): its slices stay fixed and never follow the theme. Follow-up:
// move them to the status tokens (THEME_TOKENS.md section 7).
const VALIDATION_SLICE_COLORS = ["#147c79", "#359e9b", "#ffc978", "#ff8b21"];

// Daily, Monthly and Yearly rows are dates: the name is a label ("Sep 05,
// 2026", "September 2026", "2026") and the id sorts by date: the ISO date
// ("2026-09-05", "2026-09") or the year as a number (2026). Those tabs start
// in date order, earliest first; every other tab starts with the most
// visitors first.
const DATE_ROW_TYPES = ["daily", "monthly", "yearly"];

function defaultSortFor(type) {
  return DATE_ROW_TYPES.includes(type)
    ? { key: "name", direction: "asc" }
    : { key: "visitors", direction: "desc" };
}

function sortValue(row, key, type) {
  if (key === "name" && DATE_ROW_TYPES.includes(type)) {
    return row.id ?? "";
  }
  return row[key] ?? 0;
}

function sortReportRows(rows, type, key, direction) {
  const list = [...rows];
  list.sort((a, b) => {
    const valA = sortValue(a, key, type);
    const valB = sortValue(b, key, type);
    if (typeof valA === "string") {
      const cmp = valA.localeCompare(valB);
      return direction === "asc" ? cmp : -cmp;
    }
    return direction === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
  });
  return list;
}

function buildReportChartData(rows, type, palette) {
  return {
    labels: rows.map((item) => item.name),
    datasets: [
      {
        data: rows.map((item) => item.visitors),
        backgroundColor: palette.series[0],
        borderRadius: 8,
        barThickness: type === "resort" ? 80 : 55,
      },
    ],
  };
}

// The nine reports, in tab order, for "Print all reports" and "Export all CSV".
const ALL_REPORT_TYPES = ["daily", "monthly", "yearly", "resort", "origin", "purpose", "transport", "boat", "no_show"];

const CSV_HEADERS = ["Report Type", "Reporting Year", "Date From", "Date To", "Resort Filter"];
const CSV_FIGURE_HEADERS = ["Male", "Female", "Total Visitors", "Total Fee"];

// One report's CSV rows: its rows in the order given, then its Total row.
function buildReportCsvRows(type, rows, totals, filterCells) {
  const label = getReportTitle(type);
  const csvRows = rows.map((row) => [
    label,
    ...filterCells,
    row.name,
    row.male ?? "",
    row.female ?? "",
    row.visitors,
    row.revenue,
  ]);
  csvRows.push([
    label,
    ...filterCells,
    "Total",
    totals?.male ?? "",
    totals?.female ?? "",
    totals?.visitors || 0,
    totals?.revenue || 0,
  ]);
  return csvRows;
}

// Male + Female should equal Total Visitors. A row that does not is shown as
// stored, never adjusted, and marked. A row without the two figures (an older
// backend during a deploy) is not judged.
function isUnbalanced(row) {
  if (row.male == null || row.female == null) {
    return false;
  }
  return Number(row.male) + Number(row.female) !== Number(row.visitors || 0);
}

function formatCount(value) {
  return value == null ? "—" : Number(value).toLocaleString();
}

function AnalyticsAndReport() {
  const { referenceTables, reportData, refreshReportData, isComputedDataStale, reportingYears } =
    useTourismData();

  // Start on what is already loaded (the app-start bootstrap or this page's last
  // view), so opening the page needs no request unless that data is stale.
  const loadedFilters = reportData.filters || {};
  const [reportType, setReportType] = useState(loadedFilters.type || "resort");
  const [filters, setFilters] = useState({
    year: loadedFilters.year || currentReportingYear,
    from: loadedFilters.from || "",
    to: loadedFilters.to || "",
    resort_id: loadedFilters.resort_id || "",
  });
  // Titles and the export describe the loaded report, never a pending tab.
  const loadedType = reportData.type || loadedFilters.type || reportType;
  // The filters the loaded data (and its question answers) were built with.
  const appliedFilters = {
    year: loadedFilters.year || currentReportingYear,
    from: loadedFilters.from || "",
    to: loadedFilters.to || "",
    resort_id: loadedFilters.resort_id || "",
  };
  const reportingYearOptions = buildReportingYearOptions(reportingYears, filters.year);
  const [loadingReport, setLoadingReport] = useState(false);
  const pageRef = useRef(null);

  // While printing, every chart on this page is redrawn at its printed size
  // (utils/printCharts.js); on screen nothing changes.
  useEffect(() => watchPrint(() => pageRef.current, () => Object.values(ChartJS.instances)), []);

  // "Print all reports" and "Export all CSV": the nine reports, fetched one at
  // a time (the live backend is small), each without question answers.
  // allProgress is null when idle, else { action, done }.
  const [allProgress, setAllProgress] = useState(null);
  const [allError, setAllError] = useState("");
  // Set only when all nine arrived: { reports: [{ type, data }], width }.
  const [allReports, setAllReports] = useState(null);

  // A scoped print (printPart below) is over once the browser has printed:
  // the marker goes, so a later print from the browser's own menu prints the
  // whole page again.
  useEffect(() => {
    function clearPrintScope() {
      if (pageRef.current) {
        delete pageRef.current.dataset.printScope;
      }
      // The all-reports block (and its nine charts) exists only for printing.
      setAllReports(null);
    }
    window.addEventListener("afterprint", clearPrintScope);
    return () => window.removeEventListener("afterprint", clearPrintScope);
  }, []);
  const [reportError, setReportError] = useState("");

  const rows = useMemo(() => reportData.rows || [], [reportData.rows]);
  const questionAnswers = useMemo(() => {
    return (reportData.questionAnswers || []).map((item) => ({
      ...item,
      visual: item.visual || buildFallbackVisual(item),
    }));
  }, [reportData.questionAnswers]);

  const totalVisitors = reportData.totals?.visitors || 0;
  const totalRevenue = reportData.totals?.revenue || 0;
  const totalMale = reportData.totals?.male;
  const totalFemale = reportData.totals?.female;

  // null until the shell's theme colours have been read; charts wait for it.
  const chartPalette = useTourismChartPalette();
  const palette = chartPalette || CHART_PALETTE_DEFAULTS;
  const mainReportChartOptions = useMemo(() => buildMainReportChartOptions(palette), [palette]);

  const chartData = useMemo(() => buildReportChartData(rows, loadedType, palette), [rows, loadedType, palette]);

  useEffect(() => {
    // The bootstrap (or this page's last visit) already loaded this report and
    // its question answers; refetch only if a record changed since.
    if (!isComputedDataStale("reportData")) {
      return undefined;
    }

    let active = true;

    async function loadReportInsights() {
      setLoadingReport(true);
      setReportError("");

      try {
        await refreshReportData({
          ...filters,
          type: reportType,
          include_questions: true,
        });
      } catch (error) {
        if (active) {
          setReportError(error.message || "Unable to load reports.");
        }
      } finally {
        if (active) {
          setLoadingReport(false);
        }
      }
    }

    loadReportInsights();

    return () => {
      active = false;
    };
    // Checked once on page entry; explicit controls handle later refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  // A sort picked in a column header belongs to the report type it was picked
  // on; a newly loaded type starts on its own default (date order on Daily and
  // Monthly, most visitors first elsewhere).
  const [sortChoice, setSortChoice] = useState(null);
  const sortConfig =
    sortChoice && sortChoice.type === loadedType
      ? sortChoice
      : { type: loadedType, ...defaultSortFor(loadedType) };
  const { key: sortKey, direction: sortDirection } = sortConfig;

  const sortedRows = useMemo(
    () => sortReportRows(rows, loadedType, sortKey, sortDirection),
    [rows, sortKey, sortDirection, loadedType]
  );

  function handleSort(key) {
    const next =
      sortKey === key
        ? { key, direction: sortDirection === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" ? "asc" : "desc" };
    setSortChoice({ type: loadedType, ...next });
  }

  function renderSortHeader(key, label, sortName, className) {
    return (
      <th
        className={`sortable-th ${className} ${sortKey === key ? "active-sort" : ""}`}
        onClick={() => handleSort(key)}
        title={`Click to sort by ${sortName}`}
      >
        {label}
        <span className="sort-indicator">
          {sortKey === key ? (sortDirection === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </th>
    );
  }

  // The note counts the data rows; the Total row (their sum) is only marked.
  const unbalancedCount = sortedRows.filter(isUnbalanced).length;
  const totalsUnbalanced = isUnbalanced({ male: totalMale, female: totalFemale, visitors: totalVisitors });

  // A tab switch asks for the report only, with the filters already applied:
  // the question answers depend on the filters, not the report type, so the
  // loaded ones are kept. If a record changed since, they are refetched too.
  async function changeReportType(type) {
    setReportType(type);
    setLoadingReport(true);
    setReportError("");

    try {
      await refreshReportData({
        ...appliedFilters,
        type,
        include_questions: isComputedDataStale("reportData"),
      });
    } catch (error) {
      setReportError(error.message || "Unable to load reports.");
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleApplyFilters() {
    setLoadingReport(true);
    setReportError("");

    try {
      await refreshReportData({
        ...filters,
        type: reportType,
        include_questions: true,
      });
    } catch (error) {
      setReportError(error.message || "Unable to load reports.");
    } finally {
      setLoadingReport(false);
    }
  }

  // Prints one part of the page: "report" (the loaded report: its heading,
  // chart and table) or "insights" (Key Insights). The print stylesheet hides
  // the other part while the marker is set; it is cleared after printing.
  // The marker only acts inside @media print, so the screen never changes.
  function printPart(part) {
    if (pageRef.current) {
      pageRef.current.dataset.printScope = part;
    }
    window.print();
  }

  // Exports the report on screen: its loaded type and filters, in the order the
  // table is sorted.
  function handleExportCsv() {
    const selectedResort = selectedResortName();
    const headers = [...CSV_HEADERS, getFirstColumnLabel(loadedType), ...CSV_FIGURE_HEADERS];
    const csvRows = buildReportCsvRows(loadedType, sortedRows, reportData.totals, csvFilterCells(selectedResort));
    exportCsv(datedCsvFilename(`tourism-${loadedType}-report`), headers, csvRows);
  }

  function selectedResortName() {
    return (
      referenceTables.resorts.find(
        (resort) => String(resort.resort_id) === String(appliedFilters.resort_id)
      )?.resort_name || "All Resorts"
    );
  }

  function csvFilterCells(resortName) {
    return [
      appliedFilters.year === "all" ? "All Years" : appliedFilters.year,
      appliedFilters.from || "All",
      appliedFilters.to || "All",
      resortName,
    ];
  }

  // The nine reports with the applied filters, one request at a time, straight
  // from the API: the report on screen is not touched. Resolves to all nine, or
  // rejects naming the first report that failed (nothing after it is fetched).
  async function fetchAllReports(action) {
    const reports = [];
    setAllError("");
    setAllProgress({ action, done: 0 });
    try {
      for (const type of ALL_REPORT_TYPES) {
        let data;
        try {
          data = await tourismApi.getReportsData({ ...appliedFilters, type, include_questions: false });
        } catch (error) {
          const reason = error?.message ? `: ${error.message}` : "";
          throw new Error(`Could not load ${getReportTitle(type)}${reason}. Nothing was ${action === "csv" ? "exported" : "printed"}.`);
        }
        reports.push({ type, data });
        setAllProgress({ action, done: reports.length });
      }
      return reports;
    } finally {
      setAllProgress(null);
    }
  }

  async function handlePrintAll() {
    let reports;
    try {
      reports = await fetchAllReports("print");
    } catch (error) {
      setAllError(error.message);
      return;
    }
    // The block is laid out off-screen at the report card's width, so every
    // chart gets a real size; printing starts once it has rendered (below).
    const width = pageRef.current?.querySelector(".report-print-area")?.clientWidth || undefined;
    setAllReports({ reports, width });
  }

  useEffect(() => {
    if (allReports) {
      printPart("all");
    }
    // printPart only reads the page ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReports]);

  // One file: the nine tables stacked in tab order, each with its Total row.
  // "Report Type" labels every row; the name column is headed "Name" because
  // it holds dates, resorts, origins and so on, one kind per report.
  async function handleExportAllCsv() {
    let reports;
    try {
      reports = await fetchAllReports("csv");
    } catch (error) {
      setAllError(error.message);
      return;
    }
    const filterCells = csvFilterCells(selectedResortName());
    const csvRows = reports.flatMap(({ type, data }) => {
      const { key, direction } = defaultSortFor(type);
      return buildReportCsvRows(type, sortReportRows(data.rows || [], type, key, direction), data.totals, filterCells);
    });
    exportCsv(datedCsvFilename("tourism-all-reports"), [...CSV_HEADERS, "Name", ...CSV_FIGURE_HEADERS], csvRows);
  }

  function allButtonLabel(action, idle) {
    return allProgress?.action === action
      ? `Preparing ${allProgress.done} of ${ALL_REPORT_TYPES.length}…`
      : idle;
  }

  return (
    <div className="reports-page" ref={pageRef}>
      <div className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>General, preview, and export tourism reports</p>
        </div>

        <div className="reports-actions">
          <button
            type="button"
            className="green"
            title="Opens the print dialog for this report. To keep a PDF, choose Save as PDF there."
            onClick={() => printPart("report")}
          >
            <FiPrinter />
            Print report
          </button>

          <button
            type="button"
            title="Fetches all nine reports, then opens the print dialog for them, Key Insights once at the end. To keep a PDF, choose Save as PDF there."
            disabled={Boolean(allProgress)}
            onClick={handlePrintAll}
          >
            <FiPrinter />
            {allButtonLabel("print", "Print all reports")}
          </button>

          <button type="button" onClick={handleExportCsv}>
            <FiDownload />
            Export CSV
          </button>

          <button
            type="button"
            title="One CSV file with all nine report tables, one after another."
            disabled={Boolean(allProgress)}
            onClick={handleExportAllCsv}
          >
            <FiDownload />
            {allButtonLabel("csv", "Export all CSV")}
          </button>
        </div>
      </div>

      {allError ? (
        <p className="tourist-record-error" role="alert">
          {allError}
        </p>
      ) : null}

      <div className="report-print-heading">
        <strong>Municipality of Mauban</strong>
        <h2>Tourism Office Report</h2>
        <p>
          <span className="print-part-report">{getReportTitle(loadedType)}</span>
          <span className="print-part-insights">Key Insights</span>
          <span className="print-part-all">All reports</span> | {appliedFilters.from || "All dates"} to{" "}
          {appliedFilters.to || "All dates"} | Year:{" "}
          {appliedFilters.year === "all" ? "All Years" : appliedFilters.year}
        </p>
      </div>

      <div className="report-tabs">
        <button
          type="button"
          className={reportType === "daily" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("daily")}
        >
          Daily Report
        </button>

        <button
          type="button"
          className={reportType === "monthly" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("monthly")}
        >
          Monthly Report
        </button>

        <button
          type="button"
          className={reportType === "yearly" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("yearly")}
        >
          Yearly Report
        </button>

        <button
          type="button"
          className={reportType === "resort" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("resort")}
        >
          Resort Report
        </button>

        <button
          type="button"
          className={reportType === "origin" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("origin")}
        >
          Origin Report
        </button>

        <button
          type="button"
          className={reportType === "purpose" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("purpose")}
        >
          Purpose Report
        </button>

        <button
          type="button"
          className={reportType === "transport" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("transport")}
        >
          Vehicle Report
        </button>

        <button
          type="button"
          className={reportType === "boat" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("boat")}
        >
          Boat Report
        </button>

        <button
          type="button"
          className={reportType === "no_show" ? "active" : ""}
          disabled={loadingReport}
          onClick={() => changeReportType("no_show")}
        >
          No-show Report
        </button>
      </div>

      <div className="report-filter-card">
        <label>
          <span>YEAR</span>
          <select
            value={filters.year}
            onChange={(event) => updateFilter("year", event.target.value)}
          >
            {reportingYearOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>FROM</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </label>

        <label>
          <span>TO</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </label>

        <label>
          <span>RESORT</span>
          <select
            value={filters.resort_id}
            onChange={(event) => updateFilter("resort_id", event.target.value)}
          >
            <option value="">All Resorts</option>
            {referenceTables.resorts.map((resort) => (
              <option key={resort.resort_id} value={resort.resort_id}>
                {resort.resort_name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" disabled={loadingReport} onClick={handleApplyFilters}>
          {loadingReport ? "Loading..." : "Apply Filters"}
        </button>
      </div>

      {reportError ? <p className="tourist-record-error">{reportError}</p> : null}

      {/* ── Main Report: Chart & Table (Moved to top so it's not obscured) ── */}
      <div className="report-print-area">
        <div className="report-chart-card">
          <div className="report-card-title">
            <h3>{getReportTitle(loadedType)}</h3>
            <p>{getReportSubtitle(loadedType)}</p>
          </div>

          <div className="report-chart-area">
            {chartPalette ? (
              <Bar
                data={chartData}
                options={mainReportChartOptions}
              />
            ) : null}
          </div>
        </div>

        <div className="report-table-card">
          <div className="report-table-header">
            <h4>Table Data Breakdown</h4>
          </div>

          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  {renderSortHeader("name", getFirstColumnLabel(loadedType), "Name", "report-col-name")}
                  {renderSortHeader("male", "Male", "Male", "num report-col-male")}
                  {renderSortHeader("female", "Female", "Female", "num report-col-female")}
                  {renderSortHeader("visitors", "Total Visitors", "Total Visitors", "num report-col-visitors")}
                  {renderSortHeader("revenue", "Total Fee", "Total Fee", "money report-col-revenue")}
                </tr>
              </thead>

              <tbody>
                {sortedRows.length ? (
                  sortedRows.map((row) => {
                    const unbalanced = isUnbalanced(row);
                    return (
                      <tr
                        key={row.id || row.resort_id || row.name}
                        className={unbalanced ? "report-row-unbalanced" : undefined}
                      >
                        <td className="report-col-name">
                          {row.name}
                          {unbalanced ? (
                            <span
                              className="report-unbalanced-mark"
                              title="Male + Female does not equal Total Visitors"
                            >
                              {"⚠"}
                            </span>
                          ) : null}
                        </td>
                        <td className="num">{formatCount(row.male)}</td>
                        <td className="num">{formatCount(row.female)}</td>
                        <td className="num">{Number(row.visitors || 0).toLocaleString()}</td>
                        <td className="money">{formatCurrency(row.revenue)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center" }}>
                      No report data found.
                    </td>
                  </tr>
                )}

                <tr className={totalsUnbalanced ? "total-row report-row-unbalanced" : "total-row"}>
                  <td className="report-col-name">Total</td>
                  <td className="num">{formatCount(totalMale)}</td>
                  <td className="num">{formatCount(totalFemale)}</td>
                  <td className="num">{Number(totalVisitors || 0).toLocaleString()}</td>
                  <td className="money">{formatCurrency(totalRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {unbalancedCount ? (
            <p className="report-table-note" role="note">
              {unbalancedCount} {unbalancedCount === 1 ? "row" : "rows"}: Male + Female does not
              equal Total Visitors; check these records.
            </p>
          ) : null}
        </div>
      </div>

      {allReports ? (
        <div className="report-print-all" style={{ width: allReports.width }}>
          {allReports.reports.map(({ type, data }) => (
            <PrintedReport
              key={type}
              type={type}
              data={data}
              palette={palette}
              chartOptions={mainReportChartOptions}
            />
          ))}
        </div>
      ) : null}

      {/* ── Key Insights & Analysis (Moved below main report) ── */}
      <section className="report-insights">
        <div className="analytics-question-title-row" style={{ marginTop: "36px", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#111" }}>Key Insights & Analysis</h3>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--th-text-muted)" }}>Computed from tourist records, selected filters, and arrival status</p>
          </div>
          <button
            type="button"
            className="report-insights-print"
            title="Opens the print dialog for the Key Insights cards only."
            onClick={() => printPart("insights")}
          >
            <FiPrinter />
            Print Key Insights
          </button>
        </div>

        <div className="analytics-question-grid" style={{ marginTop: 0 }}>
          {questionAnswers.length ? (
            questionAnswers.map((item, index) => (
              <article
                key={item.id || item.question}
                className="analytics-question-item"
                style={{
                  boxShadow: "0 10px 25px rgba(var(--th-shadow-rgb), 0.12)",
                  background: "#ffffff",
                  border: "1px solid var(--th-border-tinted)",
                }}
              >
                <h4>{tourismTitleMap[item.id] || item.question}</h4>
                <VisualAnswer visual={item.visual} questionId={item.id} />
                <p>{item.answer}</p>
              </article>
            ))
          ) : (
            <p className="analytics-question-empty">No insights available.</p>
          )}
        </div>
      </section>
    </div>
  );
}

// One report as printed by "Print all reports": the same chart card and table
// markup as the loaded report, so every print rule applies, in the report's
// own default order. Read-only: no sort controls.
function PrintedReport({ type, data, palette, chartOptions }) {
  const rows = data.rows || [];
  const { key, direction } = defaultSortFor(type);
  const sorted = sortReportRows(rows, type, key, direction);
  const totals = data.totals || {};
  const unbalancedCount = sorted.filter(isUnbalanced).length;
  const totalsUnbalanced = isUnbalanced({ male: totals.male, female: totals.female, visitors: totals.visitors || 0 });

  return (
    <section className="report-print-all-item" data-report-type={type}>
      <div className="report-chart-card">
        <div className="report-card-title">
          <h3>{getReportTitle(type)}</h3>
          <p>{getReportSubtitle(type)}</p>
        </div>
        <div className="report-chart-area">
          <Bar data={buildReportChartData(rows, type, palette)} options={chartOptions} />
        </div>
      </div>

      <div className="report-table-card">
        <div className="report-table-header">
          <h4>Table Data Breakdown</h4>
        </div>
        <div className="report-table-scroll">
          <table>
            <thead>
              <tr>
                <th className="report-col-name">{getFirstColumnLabel(type)}</th>
                <th className="num report-col-male">Male</th>
                <th className="num report-col-female">Female</th>
                <th className="num report-col-visitors">Total Visitors</th>
                <th className="money report-col-revenue">Total Fee</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length ? (
                sorted.map((row) => (
                  <tr
                    key={row.id || row.resort_id || row.name}
                    className={isUnbalanced(row) ? "report-row-unbalanced" : undefined}
                  >
                    <td className="report-col-name">{row.name}</td>
                    <td className="num">{formatCount(row.male)}</td>
                    <td className="num">{formatCount(row.female)}</td>
                    <td className="num">{Number(row.visitors || 0).toLocaleString()}</td>
                    <td className="money">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center" }}>
                    No report data found.
                  </td>
                </tr>
              )}
              <tr className={totalsUnbalanced ? "total-row report-row-unbalanced" : "total-row"}>
                <td className="report-col-name">Total</td>
                <td className="num">{formatCount(totals.male)}</td>
                <td className="num">{formatCount(totals.female)}</td>
                <td className="num">{Number(totals.visitors || 0).toLocaleString()}</td>
                <td className="money">{formatCurrency(totals.revenue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {unbalancedCount ? (
          <p className="report-table-note" role="note">
            {unbalancedCount} {unbalancedCount === 1 ? "row" : "rows"}: Male + Female does not
            equal Total Visitors; check these records.
          </p>
        ) : null}
      </div>
    </section>
  );
}

const VisualAnswer = memo(function VisualAnswer({ visual, questionId }) {
  // null until the shell's theme colours have been read; charts wait for it.
  const chartPalette = useTourismChartPalette();
  const palette = chartPalette || CHART_PALETTE_DEFAULTS;

  if (!visual) {
    return null;
  }



  if (questionId === "stay_type" || questionId === "classification" || questionId === "validation") {
    const isPie = questionId === "stay_type";
    const items = visual.items || [];
    const total = items.reduce((sum, item) => sum + (item.value || 0), 0);
    const chartData = {
      labels: items.map((item) => {
        const val = Number(item.value || 0);
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
        return `${item.label}: ${val.toLocaleString()} (${pct}%)`;
      }),
      datasets: [
        {
          data: items.map((item) => item.value),
          backgroundColor: questionId === "validation"
            ? VALIDATION_SLICE_COLORS
            : seriesColors(palette, items.length),
          borderWidth: 0,
        },
      ],
    };

    return (
      <div className="insight-chart-box" style={{ height: "180px", position: "relative", margin: "10px 0" }}>
        {!chartPalette ? null : isPie ? (
          <Pie
            data={chartData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "right",
                  labels: {
                    boxWidth: 10,
                    font: { size: 11, weight: "bold" },
                    color: "#475569",
                    padding: 8,
                  },
                },
                tooltip: { enabled: true },
              },
            }}
          />
        ) : (
          <Doughnut
            data={chartData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "right",
                  labels: {
                    boxWidth: 10,
                    font: { size: 11, weight: "bold" },
                    color: "#475569",
                    padding: 8,
                  },
                },
                tooltip: { enabled: true },
              },
            }}
          />
        )}
      </div>
    );
  }



  if (questionId === "peak_month") {
    // Render custom SVG Circular Progress ring
    // The backend's share of the selected total; no data is 0%, never 100%.
    const percentage = visual.percentage ?? 0;
    const value = visual.value || 0;
    const label = visual.label || "Peak Season";

    const radius = 38;
    const strokeWidth = 8;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampPercent(percentage) / 100) * circumference;

    return (
      <div className="radial-progress-widget" style={{ display: "flex", alignItems: "center", gap: "20px", margin: "15px 0" }}>
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={palette.series[0]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <strong style={{ fontSize: "24px", fontWeight: "900", color: "var(--th-primary-ink)", lineHeight: 1.1 }}>{percentage}%</strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginTop: "4px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {label}
          </span>
          <small style={{ fontSize: "11px", color: "var(--th-text-muted)", marginTop: "2px" }}>
            {Number(value).toLocaleString()} visitors
          </small>
        </div>
      </div>
    );
  }

  if (questionId === "average_stay") {
    const value = visual.value || "0";
    
    return (
      <div className="insight-stay" style={{ display: "flex", alignItems: "center", gap: "16px", margin: "20px 0" }}>
        <div style={{
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          background: "#e6f4f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--th-primary-ink)",
          fontSize: "26px",
          flexShrink: 0,
        }}>
          <FiClock />
        </div>
        <div>
          <strong style={{ fontSize: "32px", fontWeight: "900", color: "var(--th-primary-ink)", lineHeight: 1 }}>
            {value}
          </strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--th-text-muted)", display: "block", marginTop: "2px" }}>
            nights average length of stay
          </span>
        </div>
      </div>
    );
  }

  // Fallback / original types
  if (visual.type === "share") {
    const percentage = visual.percentage || 0;
    const value = visual.value || 0;
    const label = visual.label || "";

    const radius = 38;
    const strokeWidth = 8;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampPercent(percentage) / 100) * circumference;

    return (
      <div className="radial-progress-widget" style={{ display: "flex", alignItems: "center", gap: "20px", margin: "15px 0" }}>
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={palette.series[0]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <strong style={{ fontSize: "24px", fontWeight: "900", color: "var(--th-primary-ink)", lineHeight: 1.1 }}>{percentage}%</strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginTop: "4px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {label}
          </span>
          <small style={{ fontSize: "11px", color: "var(--th-text-muted)", marginTop: "2px" }}>
            {Number(value).toLocaleString()} visitors
          </small>
        </div>
      </div>
    );
  }

  if (visual.type === "comparison") {
    const chartData = {
      labels: (visual.items || []).map((item) => item.label),
      datasets: [
        {
          data: (visual.items || []).map((item) => item.value),
          backgroundColor: seriesColors(palette, (visual.items || []).length),
          borderRadius: 4,
          maxBarThickness: 35,
        },
      ],
    };

    return (
      <div className="insight-chart-box" style={{ height: "180px", position: "relative", margin: "10px 0" }}>
        {chartPalette ? (
          <Bar
            data={chartData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { font: { size: 11 }, color: palette.tick },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                x: {
                  ticks: { font: { size: 11 }, color: palette.tick },
                  grid: { display: false },
                },
              },
            }}
          />
        ) : null}
      </div>
    );
  }

  if (visual.type === "stack" || visual.type === "split") {
    const items = visual.items || [];
    const total = items.reduce((sum, item) => sum + (item.value || 0), 0);
    const chartData = {
      labels: items.map((item) => {
        const val = Number(item.value || 0);
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
        return `${item.label}: ${val.toLocaleString()} (${pct}%)`;
      }),
      datasets: [
        {
          data: items.map((item) => item.value),
          backgroundColor: ["#147c79", "#359e9b", "#ffc978", "#ff8b21"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div className="insight-chart-box" style={{ height: "180px", position: "relative", margin: "10px 0" }}>
        <Doughnut
          data={chartData}
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "right",
                labels: {
                  boxWidth: 10,
                  font: { size: 11, weight: "bold" },
                  color: "#475569",
                  padding: 8,
                },
              },
              tooltip: { enabled: true },
            },
          }}
        />
      </div>
    );
  }

  if (visual.type === "metric") {
    return (
      <div className="insight-metric">
        <strong>{visual.value}</strong>
        <span>{visual.unit}</span>
        <small>{visual.label}</small>
      </div>
    );
  }

  if (visual.type === "ranking") {
    const chartData = {
      labels: (visual.items || []).map((item) => item.label),
      datasets: [
        {
          data: (visual.items || []).map((item) => item.value),
          backgroundColor: palette.series[0],
          borderRadius: 4,
          maxBarThickness: 16,
        },
      ],
    };

    return (
      <div className="insight-chart-box" style={{ height: `${Math.max(150, (visual.items || []).length * 36)}px`, position: "relative", margin: "10px 0" }}>
        {chartPalette ? (
          <Bar
            data={chartData}
            options={{
              indexAxis: "y",
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  ticks: { font: { size: 11 }, color: palette.tick },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                y: {
                  ticks: { font: { size: 11 }, color: palette.tick },
                  grid: { display: false },
                },
              },
            }}
          />
        ) : null}
      </div>
    );
  }

  return null;
});

function buildFallbackVisual(item) {
  const answer = item.answer || "";
  const numbers = [...answer.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
    Number(match[0])
  );

  if (item.id === "month_compare" || item.id === "high_demand") {
    const currentMatch = answer.match(/has\s+(\d+(?:\.\d+)?)\s+visitors/i);
    const previousMatch = answer.match(/\((\d+(?:\.\d+)?)\)/);
    const current = currentMatch ? Number(currentMatch[1]) : numbers[0] || 0;
    const previous = previousMatch ? Number(previousMatch[1]) : numbers[numbers.length - 1] || 0;

    return {
      type: "comparison",
      items: [
        { label: "Previous", value: Math.max(previous, 0) },
        { label: "Current", value: Math.max(current, 0) },
      ],
    };
  }

  if (item.id === "classification") {
    return {
      type: "stack",
      items: [
        { label: "Filipino", value: numbers[0] || 0 },
        { label: "Foreigner", value: numbers[1] || 0 },
        { label: "Maubanin", value: numbers[2] || 0 },
      ],
    };
  }

  if (item.id === "stay_type") {
    return {
      type: "split",
      items: [
        { label: "Same Day", value: numbers[0] || 0 },
        { label: "Overnight / multi-day", value: numbers[1] || 0 },
      ],
    };
  }

  if (item.id === "validation") {
    return {
      type: "stack",
      items: [
        { label: "Pending", value: numbers[0] || 0 },
        { label: "No-show", value: numbers[1] || 0 },
        { label: "Duplicates", value: numbers[2] || 0 },
        { label: "Incomplete", value: numbers[3] || 0 },
      ],
    };
  }

  if (item.id === "average_stay") {
    return {
      type: "metric",
      label: "Average stay",
      value: numbers[0] || 0,
      unit: "night(s)",
    };
  }

  const value = numbers[0] || 0;
  const percentage =
    [...numbers].reverse().find((number) => number >= 0 && number <= 100) || 0;
  const total = percentage ? Math.round(value / (percentage / 100)) : value;

  return {
    type: "share",
    label: getFallbackLabel(answer),
    value,
    total,
    percentage,
  };
}

function getFallbackLabel(answer) {
  const leadText = answer.split(" leads with ")[0];
  const demandText = answer.split(" has the highest ")[0];

  if (leadText && leadText !== answer) {
    return leadText;
  }

  if (demandText && demandText !== answer) {
    return demandText;
  }

  return "Result";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export default AnalyticsAndReport;
