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
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
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

  if (type === "origin") {
    return "Visitor Origin Report";
  }

  if (type === "purpose") {
    return "Purpose of Travel Report";
  }

  if (type === "transport") {
    return "Vehicle Classification Report";
  }

  if (type === "no_show") {
    return "No-show Booking Report";
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

  if (type === "origin") {
    return "Visitor totals grouped by province of residence";
  }

  if (type === "purpose") {
    return "Visitor totals grouped by declared purpose of travel";
  }

  if (type === "transport") {
    return "Visitor totals grouped by vehicle classification";
  }

  if (type === "no_show") {
    return "No-show bookings grouped by resort";
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

  if (type === "origin") {
    return "Province";
  }

  if (type === "purpose") {
    return "Purpose";
  }

  if (type === "transport") {
    return "Vehicle";
  }

  if (type === "no_show") {
    return "Resort Name";
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
  const questionAnswers = (reportData.questionAnswers || []).map((item) => ({
    ...item,
    visual: item.visual || buildFallbackVisual(item),
  }));
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

  function handleExportCsv() {
    const selectedResort =
      referenceTables.resorts.find(
        (resort) => String(resort.resort_id) === String(filters.resort_id)
      )?.resort_name || "All Resorts";
    const headers = [
      "Report Type",
      "Date From",
      "Date To",
      "Resort Filter",
      getFirstColumnLabel(reportType),
      "Total Visitors",
      "Total Revenue",
      "Average Per Visitor",
    ];
    const csvRows = rows.map((row) => [
      getReportTitle(reportType),
      filters.from || "All",
      filters.to || "All",
      selectedResort,
      row.name,
      row.visitors,
      row.revenue,
      row.avg,
    ]);

    csvRows.push([
      getReportTitle(reportType),
      filters.from || "All",
      filters.to || "All",
      selectedResort,
      "Total",
      totalVisitors,
      totalRevenue,
      "",
    ]);
    exportCsv(datedCsvFilename(`tourism-${reportType}-report`), headers, csvRows);
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

          <button type="button" onClick={handleExportCsv}>
            <FiDownload />
            Export CSV
          </button>

          <button type="button" className="green" onClick={handleExportPDF}>
            <FiDownload />
            Export PDF
          </button>
        </div>
      </div>

      <div className="report-print-heading">
        <strong>Municipality of Mauban</strong>
        <h2>Tourism Office Report</h2>
        <p>
          {getReportTitle(reportType)} | {filters.from || "All dates"} to{" "}
          {filters.to || "All dates"}
        </p>
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

        <button
          type="button"
          className={reportType === "origin" ? "active" : ""}
          onClick={() => changeReportType("origin")}
        >
          Origin Report
        </button>

        <button
          type="button"
          className={reportType === "purpose" ? "active" : ""}
          onClick={() => changeReportType("purpose")}
        >
          Purpose Report
        </button>

        <button
          type="button"
          className={reportType === "transport" ? "active" : ""}
          onClick={() => changeReportType("transport")}
        >
          Vehicle Report
        </button>

        <button
          type="button"
          className={reportType === "no_show" ? "active" : ""}
          onClick={() => changeReportType("no_show")}
        >
          No-show Report
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

      <section className="analytics-question-card">
        <div className="report-card-title">
          <h3>Questions Answered by the System</h3>
          <p>Computed from tourist records, selected filters, and arrival status</p>
        </div>

        <div className="analytics-question-grid">
          {questionAnswers.length ? (
            questionAnswers.map((item, index) => (
              <article
                key={item.id || item.question}
                className="analytics-question-item"
              >
                <div className="analytics-question-top">
                  <span>Q{index + 1}</span>
                  <small>{getVisualLabel(item.visual?.type)}</small>
                </div>
                <h4>{item.question}</h4>
                <VisualAnswer visual={item.visual} />
                <p>{item.answer}</p>
              </article>
            ))
          ) : (
            <p className="analytics-question-empty">No question answers available.</p>
          )}
        </div>
      </section>

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

function VisualAnswer({ visual }) {
  if (!visual) {
    return null;
  }

  if (visual.type === "share") {
    return (
      <div className="insight-share">
        <div className="insight-share-main">
          <strong>{Number(visual.value || 0).toLocaleString()}</strong>
          <span>{visual.label}</span>
        </div>
        <div className="insight-track">
          <b style={{ width: `${clampPercent(visual.percentage)}%` }} />
        </div>
        <small>
          {visual.percentage || 0}% of {Number(visual.total || 0).toLocaleString()} visitors
        </small>
      </div>
    );
  }

  if (visual.type === "comparison") {
    const max = Math.max(...(visual.items || []).map((item) => item.value || 0), 1);

    return (
      <div className="insight-bars">
        {(visual.items || []).map((item) => (
          <div className="insight-bar-row" key={item.label}>
            <span>{item.label}</span>
            <div>
              <b style={{ width: `${clampPercent(((item.value || 0) / max) * 100)}%` }} />
            </div>
            <strong>{Number(item.value || 0).toLocaleString()}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (visual.type === "stack" || visual.type === "split") {
    const total = (visual.items || []).reduce(
      (sum, item) => sum + Number(item.value || 0),
      0
    );

    return (
      <div className="insight-stack-wrap">
        <div className={`insight-stack ${visual.type}`}>
          {(visual.items || []).map((item, index) => (
            <span
              key={item.label}
              className={`tone-${index + 1}`}
              style={{
                width: `${total ? ((item.value || 0) / total) * 100 : 0}%`,
              }}
              title={`${item.label}: ${item.value}`}
            />
          ))}
        </div>
        <div className="insight-legend">
          {(visual.items || []).map((item, index) => (
            <span key={item.label}>
              <i className={`tone-${index + 1}`} />
              {item.label}: {Number(item.value || 0).toLocaleString()}
            </span>
          ))}
        </div>
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

  return null;
}

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
        { label: "Same-day", value: numbers[0] || 0 },
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

function getVisualLabel(type) {
  if (type === "comparison") return "Comparison";
  if (type === "stack") return "Distribution";
  if (type === "split") return "Split";
  if (type === "metric") return "Metric";
  return "Share";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export default AnalyticsAndReport;
