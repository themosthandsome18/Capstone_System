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
import { useTourismData } from "../../context/TourismDataContext";
import { formatNumber } from "../../utils/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function AnalyticsAndReport() {
  const { referenceTables, reportData, refreshReportData } = useTourismData();
  const [filters, setFilters] = useState({
    from: reportData.filters?.from || "",
    to: reportData.filters?.to || "",
    resortId: reportData.filters?.resort_id || "",
  });
  const [applying, setApplying] = useState(false);

  const resorts = reportData.rows || [];
  const totals = reportData.totals || { visitors: 0, revenue: 0, avg: 0 };
  const maxVisitors = Math.max(...resorts.map((item) => item.visitors), 100);

  const chartData = {
    labels: resorts.map((item) => item.name),
    datasets: [
      {
        data: resorts.map((item) => item.visitors),
        backgroundColor: "#2f9c9c",
        borderRadius: 8,
        barThickness: 80,
      },
    ],
  };

  async function applyFilters() {
    setApplying(true);
    try {
      await refreshReportData(filters);
    } finally {
      setApplying(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Resort Name", "Total Visitors", "Total Revenue", "Avg / Visitor"],
      ...resorts.map((resort) => [
        resort.name,
        resort.visitors,
        resort.revenue,
        resort.avg,
      ]),
      ["Total", totals.visitors, totals.revenue, totals.avg],
    ];

    downloadCsv("resort-report.csv", rows);
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>General, preview, and export tourism reports</p>
        </div>

        <div className="reports-actions">
          <button type="button" onClick={() => window.print()}>
            <FiPrinter />
            Print
          </button>
          <button type="button" className="green" onClick={exportCsv}>
            <FiDownload />
            Export CSV
          </button>
        </div>
      </div>

      <div className="report-tabs">
        <button type="button">Daily Report</button>
        <button type="button">Monthly Report</button>
        <button type="button" className="active">
          Resort Report
        </button>
      </div>

      <div className="report-filter-card">
        <label>
          <span>FROM</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
          />
        </label>

        <label>
          <span>TO</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters((current) => ({ ...current, to: event.target.value }))
            }
          />
        </label>

        <label>
          <span>RESORT</span>
          <select
            value={filters.resortId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                resortId: event.target.value,
              }))
            }
          >
            <option value="">All Resorts</option>
            {referenceTables.resorts.map((resort) => (
              <option key={resort.resort_id} value={resort.resort_id}>
                {resort.resort_name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={applyFilters} disabled={applying}>
          {applying ? "Applying..." : "Apply Filters"}
        </button>
      </div>

      <div className="report-chart-card">
        <div className="report-card-title">
          <h3>Visitors by Resorts</h3>
          <p>Arrived visitors from the selected period</p>
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
                  suggestedMax: Math.ceil(maxVisitors / 10) * 10,
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
              <th>Resort Name</th>
              <th>Total Visitors</th>
              <th>Total Revenue</th>
              <th>Avg / Visitors</th>
            </tr>
          </thead>

          <tbody>
            {resorts.map((resort) => (
              <tr key={resort.resort_id}>
                <td>{resort.name}</td>
                <td>{formatNumber(resort.visitors)}</td>
                <td>{formatCurrency(resort.revenue)}</td>
                <td>{formatCurrency(resort.avg)}</td>
              </tr>
            ))}

            <tr className="total-row">
              <td>Total</td>
              <td>{formatNumber(totals.visitors)}</td>
              <td>{formatCurrency(totals.revenue)}</td>
              <td>{formatCurrency(totals.avg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return `PHP ${formatNumber(value)}`;
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default AnalyticsAndReport;
