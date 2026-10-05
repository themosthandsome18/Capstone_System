import {
  FiBriefcase,
  FiCalendar,
  FiDownload,
  FiMoon,
  FiSun,
  FiUsers,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useTourismData } from "../context/TourismDataContext";
import { buildReportingYearOptions } from "../utils/reportingYears";
import { tourismApi } from "../services/tourismApi";
import {
  ARRIVAL_EXPORT_HEADERS,
  VIEW_DAY,
  VIEW_MONTH,
  VIEW_YEAR,
  arrivalExportRows,
  arrivalRequestParams,
  exportDateSlug,
  monthLabel,
  viewFromFilters,
} from "../utils/arrivalView";
import { formatNumber } from "../utils/format";
import { useCallback, useEffect, useMemo, useState } from "react";

const currentReportingYear = String(new Date().getFullYear());

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) {
    return "No arrivals";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function displayCount(value) {
  return value ? formatNumber(value) : "--";
}

function ArrivalMonitoring() {
  const {
    arrivalMonitoring,
    referenceTables,
    loading,
    error,
    refreshArrivalMonitoring,
    refreshArrivalMonitoringIfStale,
    isComputedDataStale,
    reportingYears,
  } = useTourismData();

  const todayStr = useMemo(() => getTodayDateString(), []);
  // Reopen on the view the stored data was requested for. The backend echoes
  // its filters back: date "all" was a year, a "from" was a month, a date a day.
  const initialView = viewFromFilters(arrivalMonitoring.filters || {}, todayStr);

  const [view, setView] = useState(initialView.view); // VIEW_DAY, VIEW_MONTH or VIEW_YEAR
  const [selectedDate, setSelectedDate] = useState(initialView.date);
  const [selectedMonth, setSelectedMonth] = useState(initialView.month); // "01".."12"
  const [selectedResort, setSelectedResort] = useState(
    arrivalMonitoring.filters?.resort_id || "all"
  );
  const [selectedYear, setSelectedYear] = useState(initialView.year || currentReportingYear);
  const reportingYearOptions = buildReportingYearOptions(reportingYears, selectedYear);
  const [exporting, setExporting] = useState(false);
  const [arrivalError, setArrivalError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // A record changed since arrival data was last loaded: refetch on open, never show stale.
  const [staleLoading, setStaleLoading] = useState(() =>
    isComputedDataStale("arrivalMonitoring")
  );

  useEffect(() => {
    let active = true;

    if (!isComputedDataStale("arrivalMonitoring")) {
      setStaleLoading(false);
      return undefined;
    }

    setStaleLoading(true);
    refreshArrivalMonitoringIfStale()
      .catch((requestError) => {
        if (active) {
          setArrivalError(requestError.message || "Unable to load arrival data.");
        }
      })
      .finally(() => {
        if (active) {
          setStaleLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isComputedDataStale, refreshArrivalMonitoringIfStale]);

  const summary = arrivalMonitoring.summary || {};
  const rows = arrivalMonitoring.rows || [];
  const dailyTotals = arrivalMonitoring.dailyTotals || {};
  const resorts = useMemo(
    () => referenceTables?.resorts || [],
    [referenceTables?.resorts]
  );

  // What the data on screen is for: the filters of the loaded response, not
  // the controls' pending selection. Every label is built from this, so the
  // labels and the numbers change together, and a failed request leaves both
  // on the previous view.
  const loadedFilters = arrivalMonitoring.filters || {};
  const loadedView = viewFromFilters(loadedFilters, todayStr);
  const loadedResort = loadedFilters.resort_id || "all";

  const activeResortName = useMemo(() => {
    if (!loadedResort || loadedResort === "all") return "All Resorts";
    const match = resorts.find(
      (r) => String(r.resort_id) === String(loadedResort)
    );
    return match ? match.resort_name : "Selected Resort";
  }, [resorts, loadedResort]);

  // The current view, with any of its parts overridden.
  const currentView = useCallback(
    (overrides = {}) => ({
      view,
      date: selectedDate,
      month: selectedMonth,
      year: selectedYear,
      resortId: selectedResort,
      ...overrides,
    }),
    [selectedDate, selectedMonth, selectedResort, selectedYear, view]
  );

  const loadData = useCallback(
    async (overrides = {}) => {
      setArrivalError("");
      setRefreshing(true);

      try {
        await refreshArrivalMonitoring(arrivalRequestParams(currentView(overrides)));
      } catch (requestError) {
        setArrivalError(requestError.message || "Unable to load arrival data.");
      } finally {
        setRefreshing(false);
      }
    },
    [currentView, refreshArrivalMonitoring]
  );

  // A month needs a real year; "All Years" falls back to the current one.
  function monthYear(year) {
    return year === "all" ? currentReportingYear : year;
  }

  async function handleViewChange(nextView) {
    if (nextView === view) return;
    const year = nextView === VIEW_MONTH ? monthYear(selectedYear) : selectedYear;
    setView(nextView);
    setSelectedYear(year);
    await loadData({ view: nextView, year });
  }

  async function handleDateChange(event) {
    const date = event.target.value;
    if (!date) return;
    setSelectedDate(date);
    setView(VIEW_DAY);
    await loadData({ view: VIEW_DAY, date });
  }

  async function handleQuickToday() {
    setSelectedDate(todayStr);
    setView(VIEW_DAY);
    await loadData({ view: VIEW_DAY, date: todayStr });
  }

  async function handleMonthChange(event) {
    const month = event.target.value;
    setSelectedMonth(month);
    await loadData({ month });
  }

  async function handleResortChange(event) {
    const resortId = event.target.value;
    setSelectedResort(resortId);
    await loadData({ resortId });
  }

  async function handleYearChange(event) {
    const year = event.target.value;
    setSelectedYear(year);
    await loadData({ year });
  }

  // Exports every row in the current view, in date order. The on-screen table
  // is capped, so this asks the export endpoint rather than reusing `rows`.
  async function handleExport() {
    // The view on screen (the loaded one), which a failed request leaves in place.
    const viewNow = { ...loadedView, resortId: loadedResort };
    setArrivalError("");
    setExporting(true);

    try {
      const exported = await tourismApi.getArrivalMonitoringExport(arrivalRequestParams(viewNow));
      const resortSlug = loadedResort === "all" ? "all-resorts" : `resort-${loadedResort}`;
      exportCsv(
        datedCsvFilename(`arrival-monitoring-${exportDateSlug(viewNow)}-${resortSlug}`),
        ARRIVAL_EXPORT_HEADERS,
        arrivalExportRows(exported.rows)
      );
    } catch (requestError) {
      setArrivalError(requestError.message || "Unable to export arrival data.");
    } finally {
      setExporting(false);
    }
  }

  if (loading || staleLoading) {
    return <div className="panel p-10 text-center">Loading arrival data...</div>;
  }

  if (error) {
    return <div className="panel p-10 text-center">{error}</div>;
  }

  const isFilteredForToday = view === VIEW_DAY && selectedDate === todayStr;
  // Every arrived record in the view; the table shows at most `rows.length`.
  const rowCount = arrivalMonitoring.rowCount ?? rows.length;
  const yearOptions =
    view === VIEW_MONTH
      ? reportingYearOptions.filter((option) => option.value !== "all")
      : reportingYearOptions;
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return { value, label: monthLabel(2000, value).replace(" 2000", "") };
  });
  // Labels describe the loaded data (loadedView), never the pending selection.
  const viewDescription =
    loadedView.view === VIEW_MONTH
      ? monthLabel(loadedView.year, loadedView.month)
      : loadedView.view === VIEW_YEAR
        ? loadedView.year === "all"
          ? "All Years"
          : `Year ${loadedView.year}`
        : formatDate(loadedView.date);

  return (
    <div className="arrival-page">
      <div className="arrival-header">
        <div>
          <h1>Arrival Monitoring</h1>
          <p>Real-time tourist arrivals & daily reset tracking from booking data</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="arrival-filters-bar">
        {/* View: Day / Month / Year */}
        <div className="arrival-filter-group" role="group" aria-label="Arrival view">
          {[
            [VIEW_DAY, "Day"],
            [VIEW_MONTH, "Month"],
            [VIEW_YEAR, "Year"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`arrival-pill-btn ${view === value ? "active" : ""}`}
              aria-pressed={view === value}
              disabled={refreshing}
              onClick={() => handleViewChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Day: date picker and Today */}
        {view === VIEW_DAY && (
          <div className="arrival-filter-group">
            <label className="arrival-filter-label" htmlFor="arrival-date-input">Date:</label>
            <div className="arrival-date-picker-wrap">
              <FiCalendar className="arrival-date-picker-icon" size={16} />
              <input
                id="arrival-date-input"
                type="date"
                className="arrival-date-input"
                value={selectedDate}
                disabled={refreshing}
                onChange={handleDateChange}
                title="Select arrival date"
              />
            </div>

            <button
              type="button"
              className={`arrival-pill-btn ${isFilteredForToday ? "active" : ""}`}
              disabled={refreshing}
              onClick={handleQuickToday}
              title="Filter arrivals for Today"
            >
              Today
            </button>
          </div>
        )}

        {/* Month: month picker (the year picker follows) */}
        {view === VIEW_MONTH && (
          <div className="arrival-filter-group">
            <label className="arrival-filter-label" htmlFor="arrival-month-select">Month:</label>
            <select
              id="arrival-month-select"
              className="dashboard-year-select"
              aria-label="Arrival month"
              value={selectedMonth}
              disabled={refreshing}
              onChange={handleMonthChange}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Resort Dropdown */}
        <div className="arrival-filter-group">
          <label className="arrival-filter-label" htmlFor="arrival-resort-select">Resort:</label>
          <select
            id="arrival-resort-select"
            className="arrival-resort-select"
            value={selectedResort}
            disabled={refreshing}
            onChange={handleResortChange}
            aria-label="Filter by resort"
          >
            <option value="all">All Resorts ({resorts.length})</option>
            {resorts.map((resort) => (
              <option key={resort.resort_id} value={resort.resort_id}>
                {resort.resort_name}
              </option>
            ))}
          </select>
        </div>

        {/* Year select (Month and Year views; a month has no "All Years") */}
        {view !== VIEW_DAY && (
          <div className="arrival-filter-group">
            <label className="arrival-filter-label" htmlFor="arrival-year-select">Year:</label>
            <select
              id="arrival-year-select"
              className="dashboard-year-select"
              aria-label="Arrival reporting year"
              value={selectedYear}
              disabled={refreshing}
              onChange={handleYearChange}
            >
              {yearOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Export CSV */}
        <div className="arrival-filter-group">
          <button
            type="button"
            className="arrival-export-btn"
            onClick={handleExport}
            disabled={refreshing || exporting || !rows.length}
          >
            <FiDownload size={15} />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Active Filter Info Badge */}
      <div className="arrival-filter-summary-chip">
        <div>
          <span>
            Showing {loadedView.view === VIEW_DAY ? "daily arrivals on " : "all recorded arrivals for "}
            <strong>{viewDescription}</strong>
            {" "}at <strong>{activeResortName}</strong>
          </span>
          <div className="chip-sub">
            {summary.totalArrivals} total visitor(s) across {rowCount} arrived booking group(s)
            {loadedView.view === VIEW_DAY ? " • Resets daily at 00:00" : ""}
          </div>
        </div>

        {refreshing ? <span>Refreshing arrival data...</span> : null}
      </div>

      {arrivalError ? (
        <p className="tourist-record-error">{arrivalError}</p>
      ) : null}

      {/* Stats Cards */}
      <div className="arrival-stats">
        <StatCard
          title="Total Arrivals"
          value={formatNumber(summary.totalArrivals || 0)}
          icon={<FiUsers />}
        />
        <StatCard
          title="Male"
          value={formatNumber(summary.totalMale || 0)}
          icon="M"
        />
        <StatCard
          title="Female"
          value={formatNumber(summary.totalFemale || 0)}
          icon="F"
          pink
        />
        <StatCard
          title="Overnight"
          value={formatNumber(summary.overnight || 0)}
          icon={<FiMoon />}
          dark
        />
        <StatCard
          title="Same Day"
          value={formatNumber(summary.sameDay || 0)}
          icon={<FiSun />}
          yellow
        />
        <StatCard
          title="Fees Collected"
          value={formatCurrency(summary.feesCollected || 0)}
          icon={<FiBriefcase />}
        />
      </div>

      <div className="arrival-note">
        {loadedView.view === VIEW_DAY
          ? `Daily Monitoring: Counts reset each day for real-time tracking. All totals are calculated from records marked Arrived.`
          : loadedView.view === VIEW_MONTH
            ? `Month View: Displaying aggregate arrivals for ${monthLabel(loadedView.year, loadedView.month)}.`
            : `Year View: Displaying aggregate arrivals for ${loadedView.year === "all" ? "all years" : loadedView.year}.`}
      </div>

      {rowCount > rows.length ? (
        <div className="arrival-note" role="status">
          Showing the {formatNumber(rows.length)} most recently updated of {formatNumber(rowCount)} arrivals.
          The totals above and Export CSV include all {formatNumber(rowCount)}.
        </div>
      ) : null}

      {/* Table */}
      <div className="arrival-table-card">
        <div className="table-responsive overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Group/Guest</th>
                <th>Male</th>
                <th>Female</th>
                <th>Travel Itinerary</th>
                <th>Overnight</th>
                <th>Same Day</th>
                <th>Resort</th>
                <th>Fee Paid</th>
              </tr>
            </thead>

            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.survey_id}>
                    <td>{formatDate(row.date)}</td>
                    <td className="guest-name">{row.group}</td>
                    <td>{row.male}</td>
                    <td>{row.female}</td>
                    <td>{row.itinerary || "--"}</td>
                    <td>{displayCount(row.overnight)}</td>
                    <td>{displayCount(row.sameDay)}</td>
                    <td>{row.resort}</td>
                    <td className="fee">{formatCurrency(row.feePaid)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center" style={{ padding: "32px" }}>
                    {loadedView.view === VIEW_DAY
                      ? `No arrivals recorded for ${formatDate(loadedView.date)} at ${activeResortName}.`
                      : `No arrived tourist records found for ${viewDescription} at ${activeResortName}.`}
                  </td>
                </tr>
              )}

              <tr className="daily-total">
                <td>
                  {loadedView.view === VIEW_YEAR
                    ? "TOTAL ARRIVALS"
                    : loadedView.view === VIEW_MONTH
                      ? "MONTH TOTAL"
                      : "DAILY TOTAL"}
                </td>
                <td />
                <td>{dailyTotals.male || 0}</td>
                <td>{dailyTotals.female || 0}</td>
                <td />
                <td>{dailyTotals.overnight || 0}</td>
                <td>{dailyTotals.sameDay || 0}</td>
                <td />
                <td className="fee">{formatCurrency(dailyTotals.feesCollected || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, pink, dark, yellow }) {
  return (
    <section className="arrival-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>

      <div
        className={`arrival-stat-icon ${pink ? "pink" : ""} ${
          dark ? "dark" : ""
        } ${yellow ? "yellow" : ""}`}
      >
        {icon}
      </div>
    </section>
  );
}

export default ArrivalMonitoring;
