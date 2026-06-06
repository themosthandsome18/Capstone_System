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
import { useState } from "react";

const currentReportingYear = String(new Date().getFullYear());

const reportingYearOptions = [
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "all", label: "All Years" },
];

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
  const { arrivalMonitoring, loading, error, refreshArrivalMonitoring } =
    useTourismData();
  const [selectedYear, setSelectedYear] = useState(
    arrivalMonitoring.filters?.year || currentReportingYear
  );
  const [arrivalError, setArrivalError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const summary = arrivalMonitoring.summary;
  const rows = arrivalMonitoring.rows;
  const dailyTotals = arrivalMonitoring.dailyTotals;

  async function handleYearChange(event) {
    const year = event.target.value;
    setSelectedYear(year);
    setArrivalError("");
    setRefreshing(true);

    try {
      await refreshArrivalMonitoring({ year });
    } catch (requestError) {
      setArrivalError(requestError.message || "Unable to load arrival data.");
    } finally {
      setRefreshing(false);
    }
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

    exportCsv(datedCsvFilename("arrival-monitoring"), headers, csvRows);
  }

  if (loading) {
    return <div className="panel p-10 text-center">Loading arrival data...</div>;
  }

  if (error) {
    return <div className="panel p-10 text-center">{error}</div>;
  }

  return (
    <div className="arrival-page">
      <div className="arrival-header">
        <div>
          <h1>Arrival Monitoring</h1>
          <p>Real-time tourist arrivals from backend booking data</p>
        </div>

        <div className="arrival-actions">
          <select
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

          <button type="button" className="arrival-date-btn">
            <FiCalendar size={15} />
            {formatDate(arrivalMonitoring.reportDate)}
          </button>

          <button
            type="button"
            className="arrival-export-btn"
            onClick={handleExport}
          >
            <FiDownload size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {arrivalError ? (
        <p className="tourist-record-error">{arrivalError}</p>
      ) : null}

      <div className="arrival-stats">
        <StatCard
          title="Total Arrivals"
          value={formatNumber(summary.totalArrivals)}
          icon={<FiUsers />}
        />
        <StatCard title="Male" value={formatNumber(summary.totalMale)} icon="M" />
        <StatCard
          title="Female"
          value={formatNumber(summary.totalFemale)}
          icon="F"
          pink
        />
        <StatCard
          title="Overnight"
          value={formatNumber(summary.overnight)}
          icon={<FiMoon />}
          dark
        />
        <StatCard
          title="Same Day"
          value={formatNumber(summary.sameDay)}
          icon={<FiSun />}
          yellow
        />
        <StatCard
          title="Fees Collected"
          value={formatCurrency(summary.feesCollected)}
          icon={<FiBriefcase />}
        />
      </div>

      <div className="arrival-note">
        All totals are calculated by the backend from records marked Arrived.
      </div>

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
                <td colSpan="9" className="text-center">
                  No arrived tourist records yet.
                </td>
              </tr>
            )}

            <tr className="daily-total">
              <td>DAILY TOTAL</td>
              <td />
              <td>{dailyTotals.male}</td>
              <td>{dailyTotals.female}</td>
              <td />
              <td>{dailyTotals.overnight}</td>
              <td>{dailyTotals.sameDay}</td>
              <td />
              <td className="fee">{formatCurrency(dailyTotals.feesCollected)}</td>
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
