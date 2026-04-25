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

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function AnalyticsAndReport() {
  const { referenceTables } = useTourismData();

  const resorts = [
    {
      name: "Cagbalete Sands Resort",
      visitors: 1842,
      revenue: 184200,
      avg: 100,
    },
    {
      name: "Pansacola Beach Resort",
      visitors: 1456,
      revenue: 145600,
      avg: 100,
    },
    {
      name: "MVT Sto. Nino Beach",
      visitors: 982,
      revenue: 98200,
      avg: 100,
    },
    {
      name: "Villa Cleofas",
      visitors: 648,
      revenue: 64800,
      avg: 100,
    },
    {
      name: "Pansacola Cove",
      visitors: 512,
      revenue: 51200,
      avg: 100,
    },
    {
      name: "Sea Breeze Cottages",
      visitors: 384,
      revenue: 38400,
      avg: 100,
    },
  ];

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

  const totalVisitors = resorts.reduce((sum, item) => sum + item.visitors, 0);
  const totalRevenue = resorts.reduce((sum, item) => sum + item.revenue, 0);

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>General, preview, and export tourism reports</p>
        </div>

        <div className="reports-actions">
          <button type="button">
            <FiPrinter />
            Print
          </button>
          <button type="button" className="green">
            <FiDownload />
            Export PDF
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
          <input type="date" />
        </label>

        <label>
          <span>TO</span>
          <input type="date" />
        </label>

        <label>
          <span>RESORT</span>
          <select>
            <option>All Resorts</option>
            {referenceTables.resorts.map((resort) => (
              <option key={resort.resort_id}>{resort.resort_name}</option>
            ))}
          </select>
        </label>

        <button type="button">Apply Filters</button>
      </div>

      <div className="report-chart-card">
        <div className="report-card-title">
          <h3>Visitors by Resorts</h3>
          <p>Top performing destination this month</p>
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
                  max: 2000,
                  ticks: {
                    stepSize: 500,
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
              <tr key={resort.name}>
                <td>{resort.name}</td>
                <td>{resort.visitors.toLocaleString()}</td>
                <td>₱{resort.revenue.toLocaleString()}</td>
                <td>₱{resort.avg}</td>
              </tr>
            ))}

            <tr className="total-row">
              <td>Total</td>
              <td>{totalVisitors.toLocaleString()}</td>
              <td>₱{totalRevenue.toLocaleString()}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AnalyticsAndReport;