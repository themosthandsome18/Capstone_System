import { useEffect, useState, useMemo, memo } from "react";
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

const currentReportingYear = String(new Date().getFullYear());

const reportingYearOptions = [
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "all", label: "All Years" },
];

const tourismTitleMap = {
  top_resort: "Top Tourist Destination",
  month_compare: "Month-over-Month Arrivals",
  peak_month: "Peak Season Analysis",
  classification: "Visitor Demographics",
  stay_type: "Same-Day vs. Overnight Stays",
  overnight_resort: "Top Destination for Overnight Stays",
  average_stay: "Average Length of Stay",
  top_origin: "Top Visitor Origins",
  visit_purpose: "Primary Purpose of Travel",
  high_demand: "Destinations with Growing Demand",
  validation: "Data Quality & Validation",
};




const mainReportChartOptions = {
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
};

function AnalyticsAndReport() {
  const { referenceTables, reportData, refreshReportData } = useTourismData();

  const [reportType, setReportType] = useState("resort");
  const [filters, setFilters] = useState({
    year: currentReportingYear,
    from: "",
    to: "",
    resort_id: "",
  });
  const [loadingReport, setLoadingReport] = useState(false);
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

  const chartData = useMemo(() => ({
    labels: rows.map((item) => item.name),
    datasets: [
      {
        data: rows.map((item) => item.visitors),
        backgroundColor: "#2f9c9c",
        borderRadius: 8,
        barThickness: reportType === "resort" ? 80 : 55,
      },
    ],
  }), [rows, reportType]);

  useEffect(() => {
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
    // Load once on page entry; explicit filter controls handle later refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function changeReportType(type) {
    setReportType(type);
    setLoadingReport(true);
    setReportError("");

    try {
      await refreshReportData({
        ...filters,
        type,
        include_questions: true,
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
      "Reporting Year",
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
      filters.year === "all" ? "All Years" : filters.year,
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
      filters.year === "all" ? "All Years" : filters.year,
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
          {filters.to || "All dates"} | Year:{" "}
          {filters.year === "all" ? "All Years" : filters.year}
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

      <div className="analytics-question-title-row" style={{ marginTop: "12px", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#111" }}>Key Insights & Analysis</h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Computed from tourist records, selected filters, and arrival status</p>
      </div>

      <div className="analytics-question-grid" style={{ marginTop: 0 }}>
        {questionAnswers.length ? (
          questionAnswers.map((item, index) => (
            <article
              key={item.id || item.question}
              className="analytics-question-item"
              style={{
                boxShadow: "0 10px 25px rgba(34, 72, 55, 0.12)",
                background: "#ffffff",
                border: "1px solid #d7e5e1",
              }}
            >
              <div className="analytics-question-top" style={{ justifyContent: "flex-end" }}>
                <small>{getVisualLabel(item.visual?.type, item.id)}</small>
              </div>
              <h4>{tourismTitleMap[item.id] || item.question}</h4>
              <VisualAnswer visual={item.visual} questionId={item.id} />
              <p>{item.answer}</p>
            </article>
          ))
        ) : (
          <p className="analytics-question-empty">No insights available.</p>
        )}
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
              options={mainReportChartOptions}
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

const VisualAnswer = memo(function VisualAnswer({ visual, questionId }) {
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
          backgroundColor: isPie 
            ? ["#147c79", "#ffc978"]
            : ["#147c79", "#359e9b", "#ffc978", "#ff8b21"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "180px", position: "relative", margin: "10px 0" }}>
        {isPie ? (
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
    const percentage = visual.percentage || 100;
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
            stroke="#147c79"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <strong style={{ fontSize: "24px", fontWeight: "900", color: "#147c79", lineHeight: 1.1 }}>{percentage}%</strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginTop: "4px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {label}
          </span>
          <small style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
            {Number(value).toLocaleString()} visitors
          </small>
        </div>
      </div>
    );
  }

  if (questionId === "average_stay") {
    const value = visual.value || "0";
    
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "20px 0" }}>
        <div style={{
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          background: "#e6f4f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#147c79",
          fontSize: "26px",
          flexShrink: 0,
        }}>
          <FiClock />
        </div>
        <div>
          <strong style={{ fontSize: "32px", fontWeight: "900", color: "#147c79", lineHeight: 1 }}>
            {value}
          </strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#64748b", display: "block", marginTop: "2px" }}>
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
            stroke="#147c79"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <strong style={{ fontSize: "24px", fontWeight: "900", color: "#147c79", lineHeight: 1.1 }}>{percentage}%</strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginTop: "4px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {label}
          </span>
          <small style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
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
          backgroundColor: ["#32a19b", "#2f9c9c", "#6abdc0", "#8fdcda"],
          borderRadius: 4,
          maxBarThickness: 35,
        },
      ],
    };

    return (
      <div style={{ height: "180px", position: "relative", margin: "10px 0" }}>
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
                ticks: { font: { size: 11 }, color: "#64748b" },
                grid: { color: "rgba(148, 163, 184, 0.1)" },
              },
              x: {
                ticks: { font: { size: 11 }, color: "#64748b" },
                grid: { display: false },
              },
            },
          }}
        />
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
      <div style={{ height: "180px", position: "relative", margin: "10px 0" }}>
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
          backgroundColor: "#147c79",
          borderRadius: 4,
          maxBarThickness: 16,
        },
      ],
    };

    return (
      <div style={{ height: `${Math.max(150, (visual.items || []).length * 36)}px`, position: "relative", margin: "10px 0" }}>
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
                ticks: { font: { size: 11 }, color: "#64748b" },
                grid: { color: "rgba(148, 163, 184, 0.1)" },
              },
              y: {
                ticks: { font: { size: 11 }, color: "#64748b" },
                grid: { display: false },
              },
            },
          }}
        />
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

function getVisualLabel(type, questionId) {
  if (questionId === "top_resort" || questionId === "stay_type" || questionId === "overnight_resort") return "Pie Chart";
  if (questionId === "classification" || questionId === "top_origin" || questionId === "validation") return "Doughnut Chart";
  if (questionId === "visit_purpose") return "Polar Area";
  if (questionId === "peak_month") return "Gauge Ring";
  if (questionId === "average_stay") return "Metric Info";
  if (type === "comparison") return "Comparison Chart";
  if (type === "stack") return "Distribution";
  if (type === "split") return "Split Chart";
  if (type === "metric") return "Metric";
  return "Share";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export default AnalyticsAndReport;
