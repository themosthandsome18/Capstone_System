import { useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { FiDownload, FiPrinter } from "react-icons/fi";
import { useTourismData } from "../context/TourismDataContext";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

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

  return "Visitors by Resorts";
}

function getReportSubtitle(type) {
  if (type === "daily") {
    return "Daily visitor totals based on arrived tourist records";
  }

  if (type === "monthly") {
    return "Monthly visitor totals based on arrived tourist records";
  }

  return "Top performing destination based on arrived tourist records";
}

function getFirstColumnLabel(type) {
  if (type === "daily") {
    return "Date";
  }

  if (type === "monthly") {
    return "Month";
  }

  return "Resort Name";
}

function AnalyticsAndReport() {
  const { referenceTables, reportData, refreshReportData } = useTourismData();

  const [reportType, setReportType] = useState("resort");
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    resort_id: "",
  });

  const rows = reportData.rows || [];
  const totalVisitors = reportData.totals?.visitors || 0;
  const totalRevenue = reportData.totals?.revenue || 0;

  const chartData = {
    labels: rows.map((item) => item.name),
    datasets: [
      {
        data: rows.map((item) => item.visitors),
        backgroundColor: "#2f9c9c",
        borderRadius: 8,
        barThickness: reportType === "resort" ? 80 : 55,
      },
    ],
  };

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function changeReportType(type) {
    setReportType(type);

    await refreshReportData({
      ...filters,
      type,
    });
  }

  async function handleApplyFilters() {
    await refreshReportData({
      ...filters,
      type: reportType,
    });
  }

  function handlePrint() {
    window.print();
  }

  function handleExportPDF() {
    window.print();
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>General, preview, and export tourism reports</p>
        </div>

        <div className="reports-actions">
          <button type="button" onClick={handlePrint}>
            <FiPrinter />
            Print
          </button>

          <button type="button" className="green" onClick={handleExportPDF}>
            <FiDownload />
            Export PDF
          </button>
        </div>
      </div>

      <div className="report-tabs">
        <button
          type="button"
          className={reportType === "daily" ? "active" : ""}
          onClick={() => changeReportType("daily")}
        >
          Daily Report
        </button>

        <button
          type="button"
          className={reportType === "monthly" ? "active" : ""}
          onClick={() => changeReportType("monthly")}
        >
          Monthly Report
        </button>

        <button
          type="button"
          className={reportType === "resort" ? "active" : ""}
          onClick={() => changeReportType("resort")}
        >
          Resort Report
        </button>
      </div>

      <div className="report-filter-card">
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

        <button type="button" onClick={handleApplyFilters}>
          Apply Filters
        </button>
      </div>

      <div className="report-print-area">
        <div className="report-chart-card">
          <div className="report-card-title">
            <h3>{getReportTitle(reportType)}</h3>
            <p>{getReportSubtitle(reportType)}</p>
          </div>

          <div className="report-chart-area">
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
                    ticks: {
                      color: "#5f6f6b",
                      font: { size: 16 },
                    },
                    grid: {
                      color: "rgba(148, 163, 184, 0.25)",
                      borderDash: [4, 4],
                    },
                  },
                  x: {
                    ticks: {
                      color: "#5f6f6b",
                      font: { size: 15 },
                    },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="report-table-card">
          <table>
            <thead>
              <tr>
                <th>{getFirstColumnLabel(reportType)}</th>
                <th>Total Visitors</th>
                <th>Total Revenue</th>
                <th>Avg / Visitor</th>
              </tr>
            </thead>

            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id || row.resort_id || row.name}>
                    <td>{row.name}</td>
                    <td>{Number(row.visitors || 0).toLocaleString()}</td>
                    <td>{formatCurrency(row.revenue)}</td>
                    <td>{formatCurrency(row.avg)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" style={{ textAlign: "center" }}>
                    No report data found.
                  </td>
                </tr>
              )}

              <tr className="total-row">
                <td>Total</td>
                <td>{Number(totalVisitors || 0).toLocaleString()}</td>
                <td>{formatCurrency(totalRevenue)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsAndReport;