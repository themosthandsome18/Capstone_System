import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { FiClock, FiMapPin, FiTrendingUp, FiUsers } from "react-icons/fi";
import ChartCard from "../components/ui/ChartCard";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

function AnalyticsAndReport() {
  const { analytics, referenceTables } = useTourismData();

  const trendData = {
    labels: analytics.monthlyArrivals.map((item) => item.month),
    datasets: [
      {
        label: "Foreign",
        data: analytics.monthlyArrivals.map((item) => item.foreign),
        borderColor: "#6994ff",
        backgroundColor: "rgba(105,148,255,0.08)",
        tension: 0.35,
      },
      {
        label: "Local",
        data: analytics.monthlyArrivals.map((item) => item.local),
        borderColor: "#2e9a93",
        backgroundColor: "rgba(46,154,147,0.12)",
        tension: 0.35,
      },
    ],
  };

  const destinationData = {
    labels: referenceTables.resorts.map((item) => item.resort_name),
    datasets: [
      {
        data: referenceTables.resorts.map((item) => item.monthly_arrivals),
        backgroundColor: "#51b8ad",
        borderRadius: 8,
      },
    ],
  };

  const purposeData = {
    labels: analytics.purposeBreakdown.map((item) => item.label),
    datasets: [
      {
        data: analytics.purposeBreakdown.map((item) => item.value),
        backgroundColor: ["#0f8b8d", "#4d7cff", "#f6a623", "#e55757", "#8b5cf6"],
        borderWidth: 0,
      },
    ],
  };

  const travelData = {
    labels: analytics.travelModeBreakdown.map((item) => item.label),
    datasets: [
      {
        data: analytics.travelModeBreakdown.map((item) => item.value),
        backgroundColor: ["#4d7cff", "#2e9a93", "#f97316", "#e11d48"],
        borderWidth: 0,
      },
    ],
  };

  const originData = {
    labels: analytics.originBreakdown.map((item) => item.label),
    datasets: [
      {
        data: analytics.originBreakdown.map((item) => item.value * 80),
        backgroundColor: "#4d7cff",
        borderRadius: 8,
      },
    ],
  };

  const summaryRows = analytics.monthlyArrivals.map((item, index, array) => {
    const previous = array[index - 1]?.arrivals || item.arrivals;
    const growth = (((item.arrivals - previous) / Math.max(previous, 1)) * 100).toFixed(1);

    return {
      month: item.month,
      local: item.local,
      foreign: item.foreign,
      total: item.arrivals,
      growth: index === 0 ? "-" : `${growth}%`,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Analytics and Reports"
        description="Visual data analytics and performance reports."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Total Tourists (YTD)</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">5,213</p>
            </div>
            <FiUsers className="text-sky-500" size={16} />
          </div>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Growth Rate</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">+12.5</p>
            </div>
            <FiTrendingUp className="text-fuchsia-500" size={16} />
          </div>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Top Destination</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">Cagbalete</p>
            </div>
            <FiMapPin className="text-sky-500" size={16} />
          </div>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Avg. Stay Duration</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">2.3 days</p>
            </div>
            <FiClock className="text-slate-700" size={16} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <ChartCard title="Tourist Growth Trend">
          <Line
            data={trendData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { usePointStyle: true, boxWidth: 8 },
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard title="Popular Destinations">
          <Bar
            data={destinationData}
            options={{
              maintainAspectRatio: false,
              indexAxis: "y",
              plugins: { legend: { display: false } },
            }}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Visit Purpose">
          <Doughnut
            data={purposeData}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
            }}
          />
        </ChartCard>
        <ChartCard title="Travel Mode">
          <Doughnut
            data={travelData}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
            }}
          />
        </ChartCard>
        <ChartCard title="Tourist Origin">
          <Bar
            data={originData}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
            }}
          />
        </ChartCard>
      </div>

      <div className="panel overflow-hidden p-0">
        <div className="border-b border-[#d1e5e9] px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Monthly Summary</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#aecdd3]">
              <tr>
                {["Month", "Local", "Foreign", "Total", "Growth"].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-700"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7e7ea] bg-[#edf7f8]">
              {summaryRows.map((row) => (
                <tr key={row.month}>
                  <td className="px-4 py-3">{row.month}</td>
                  <td className="px-4 py-3">{row.local}</td>
                  <td className="px-4 py-3">{row.foreign}</td>
                  <td className="px-4 py-3">{row.total}</td>
                  <td
                    className={`px-4 py-3 ${
                      String(row.growth).startsWith("-")
                        ? "text-rose-500"
                        : row.growth === "-"
                        ? "text-slate-500"
                        : "text-emerald-600"
                    }`}
                  >
                    {row.growth}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsAndReport;
