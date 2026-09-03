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
import { formatNumber } from "../utils/format";
import { useCallback, useMemo, useState } from "react";

const currentReportingYear = String(new Date().getFullYear());

const reportingYearOptions = [
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "all", label: "All Years" },
];

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
  } = useTourismData();

  const todayStr = useMemo(() => getTodayDateString(), []);
  const initialDate = arrivalMonitoring.filters?.date || todayStr;
  const initialMode = initialDate === "all" ? "all" : "day";

  const [selectedDate, setSelectedDate] = useState(
    initialMode === "all" ? todayStr : initialDate
  );
  const [dateMode, setDateMode] = useState(initialMode); // "day" or "all"
  const [selectedResort, setSelectedResort] = useState(
    arrivalMonitoring.filters?.resort_id || "all"
  );
  const [selectedYear, setSelectedYear] = useState(
    arrivalMonitoring.filters?.year || currentReportingYear
  );
  const [arrivalError, setArrivalError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const summary = arrivalMonitoring.summary || {};
  const rows = arrivalMonitoring.rows || [];
  const dailyTotals = arrivalMonitoring.dailyTotals || {};
  const resorts = useMemo(
    () => referenceTables?.resorts || [],
    [referenceTables?.resorts]
  );

  const activeResortName = useMemo(() => {
    if (!selectedResort || selectedResort === "all") return "All Resorts";
    const match = resorts.find(
      (r) => String(r.resort_id) === String(selectedResort)
    );
    return match ? match.resort_name : "Selected Resort";
  }, [resorts, selectedResort]);

  const loadData = useCallback(
    async (overrides = {}) => {
      const nextDateMode =
        overrides.dateMode !== undefined ? overrides.dateMode : dateMode;
      const nextDate =
        overrides.selectedDate !== undefined ? overrides.selectedDate : selectedDate;
      const nextResort =
        overrides.selectedResort !== undefined ? overrides.selectedResort : selectedResort;
      const nextYear =
        overrides.selectedYear !== undefined ? overrides.selectedYear : selectedYear;

      setArrivalError("");
      setRefreshing(true);

      try {
        await refreshArrivalMonitoring({
          year: nextYear,
          date: nextDateMode === "all" ? "all" : nextDate,
          resort_id: nextResort,
        });
      } catch (requestError) {
        setArrivalError(requestError.message || "Unable to load arrival data.");
      } finally {
        setRefreshing(false);
      }
    },
    [dateMode, refreshArrivalMonitoring, selectedDate, selectedResort, selectedYear]
  );

  async function handleDateChange(event) {
    const date = event.target.value;
    if (!date) return;
    setSelectedDate(date);
    setDateMode("day");
    await loadData({ selectedDate: date, dateMode: "day" });
  }

  async function handleQuickToday() {
    setSelectedDate(todayStr);
    setDateMode("day");
    await loadData({ selectedDate: todayStr, dateMode: "day" });
  }

  async function handleToggleAllDates() {
    const nextMode = dateMode === "all" ? "day" : "all";
    setDateMode(nextMode);
    await loadData({ dateMode: nextMode });
  }

  async function handleResortChange(event) {
    const resortId = event.target.value;
    setSelectedResort(resortId);
    await loadData({ selectedResort: resortId });
  }

  async function handleYearChange(event) {
    const year = event.target.value;
    setSelectedYear(year);
    await loadData({ selectedYear: year });
  }

  function handleExport() {
    const headers = [
      "Date",
      "Group/Guest",
      "Male",
      "Female",
      "Travel Itinerary",
      "Overnight",
      "Same Day",
      "Resort",
      "Fee Paid",
    ];
    const csvRows = rows.map((row) => [
      row.date,
      row.group,
      row.male,
      row.female,
      row.itinerary,
      row.overnight,
      row.sameDay,
      row.resort,
      row.feePaid,
    ]);

    const dateSlug = dateMode === "all" ? `all-dates-${selectedYear}` : selectedDate;
    const resortSlug = selectedResort === "all" ? "all-resorts" : `resort-${selectedResort}`;
    exportCsv(datedCsvFilename(`arrival-monitoring-${dateSlug}-${resortSlug}`), headers, csvRows);
  }

  if (loading) {
    return <div className="panel p-10 text-center">Loading arrival data...</div>;
  }

  if (error) {
    return <div className="panel p-10 text-center">{error}</div>;
  }

  const isFilteredForToday = dateMode === "day" && selectedDate === todayStr;

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
        {/* Date Filter */}
        <div className="arrival-filter-group">
          <label className="arrival-filter-label" htmlFor="arrival-date-input">Date:</label>
          <div className="arrival-date-picker-wrap">
            <FiCalendar className="arrival-date-picker-icon" size={16} />
            <input
              id="arrival-date-input"
              type="date"
              className="arrival-date-input"
              value={dateMode === "all" ? "" : selectedDate}
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

          <button
            type="button"
            className={`arrival-pill-btn ${dateMode === "all" ? "active" : ""}`}
            disabled={refreshing}
            onClick={handleToggleAllDates}
            title="View arrivals across all dates"
          >
            {dateMode === "all" ? "Single Day View" : "All Dates (Year)"}
          </button>
        </div>

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

        {/* Year Select (shown when in All Dates mode) */}
        {dateMode === "all" && (
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
              {reportingYearOptions.map((option) => (
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
            disabled={refreshing || !rows.length}
          >
            <FiDownload size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Active Filter Info Badge */}
      <div className="arrival-filter-summary-chip">
        <div>
          <span>
            Showing {dateMode === "all" ? "all recorded arrivals for " : "daily arrivals on "}
            <strong>
              {dateMode === "all"
                ? selectedYear === "all"
                  ? "All Years"
                  : `Year ${selectedYear}`
                : formatDate(selectedDate)}
            </strong>
            {" "}at <strong>{activeResortName}</strong>
          </span>
          <div className="chip-sub">
            {summary.totalArrivals} total visitor(s) across {rows.length} arrived booking group(s)
            {dateMode === "day" ? " • Resets daily at 00:00" : ""}
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
        {dateMode === "day"
          ? `Daily Monitoring: Counts reset each day for real-time tracking. All totals are calculated from records marked Arrived.`
          : `Year View: Displaying aggregate arrivals for ${selectedYear === "all" ? "all years" : selectedYear}.`}
      </div>

      {/* Table */}
      <div className="arrival-table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Group/Guest</th>
              <th>Male</th>
              <th>Female</th>
              <th>Travel Itinerary</th>
              <th>Overnight</th>
              <th>Sameday</th>
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
                  {dateMode === "day"
                    ? `No arrivals recorded for ${formatDate(selectedDate)} at ${activeResortName}.`
                    : `No arrived tourist records found for ${activeResortName}.`}
                </td>
              </tr>
            )}

            <tr className="daily-total">
              <td>{dateMode === "all" ? "TOTAL ARRIVALS" : "DAILY TOTAL"}</td>
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
