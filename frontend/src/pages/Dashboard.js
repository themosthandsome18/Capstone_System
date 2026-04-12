import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  FiActivity,
  FiGlobe,
  FiMapPin,
  FiStar,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import ChartCard from "../components/ui/ChartCard";
import Panel from "../components/ui/Panel";
import { useTourismData } from "../context/TourismDataContext";
import { formatDate, formatNumber } from "../utils/format";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

function Dashboard() {
  const { touristRecords, referenceTables, analytics, loading } = useTourismData();

  const totalArrivals = touristRecords.reduce(
    (total, record) => total + record.total_visitors,
    0
  );
  const totalMale = touristRecords.reduce((total, record) => total + record.total_male, 0);
  const totalFemale = touristRecords.reduce(
    (total, record) => total + record.total_female,
    0
  );
  const localCount = touristRecords.reduce(
    (total, record) => total + record.filipino_count + record.maubanin_count,
    0
  );
  const foreignCount = touristRecords.reduce(
    (total, record) => total + record.foreigner_count,
    0
  );
  const todaysArrivals = touristRecords
    .filter((record) => record.arrival_date === "2026-04-11")
    .reduce((total, record) => total + record.total_visitors, 0);

  const topDestinations = [...referenceTables.resorts]
    .sort((a, b) => b.monthly_arrivals - a.monthly_arrivals)
    .slice(0, 5);
  const recentRecords = [...touristRecords].slice(0, 5);

  const trendData = {
    labels: analytics.monthlyArrivals.map((item) => item.month),
    datasets: [
      {
        label: "Foreign",
        data: analytics.monthlyArrivals.map((item) => item.foreign),
        borderColor: "#62b8d2",
        backgroundColor: "rgba(98, 184, 210, 0.08)",
        fill: false,
        tension: 0.34,
        pointRadius: 3,
      },
      {
        label: "Local",
        data: analytics.monthlyArrivals.map((item) => item.local),
        borderColor: "#2f9c94",
        backgroundColor: "rgba(47, 156, 148, 0.12)",
        fill: true,
        tension: 0.36,
        pointRadius: 3,
      },
    ],
  };

  const monthlyBarData = {
    labels: analytics.monthlyArrivals.map((item) => item.month),
    datasets: [
      {
        label: "Foreign",
        data: analytics.monthlyArrivals.map((item) => item.foreign),
        backgroundColor: "#67a6ff",
        borderRadius: 8,
      },
      {
        label: "Local",
        data: analytics.monthlyArrivals.map((item) => item.local),
        backgroundColor: "#2f9c94",
        borderRadius: 8,
      },
    ],
  };

  const purposeData = {
    labels: analytics.purposeBreakdown.map((item) => item.label),
    datasets: [
      {
        data: analytics.purposeBreakdown.map((item) => item.value),
        backgroundColor: ["#177f86", "#5a8dee", "#f08a3c", "#ca5b8c", "#7f52c7"],
        borderWidth: 0,
      },
    ],
  };

  const dashboardStats = [
    {
      label: "Total Tourist Arrivals",
      value: formatNumber(totalArrivals),
      note: "+7% from last month",
      icon: <FiUsers size={15} />,
      tone: "text-sky-500",
    },
    {
      label: "Male Tourist",
      value: formatNumber(totalMale),
      note: "tourism registry",
      icon: <FiActivity size={15} />,
      tone: "text-cyan-500",
    },
    {
      label: "Female Tourists",
      value: formatNumber(totalFemale),
      note: "tourism registry",
      icon: <FiUsers size={15} />,
      tone: "text-fuchsia-500",
    },
    {
      label: "Local Tourists",
      value: formatNumber(localCount),
      note: "municipal and domestic",
      icon: <FiMapPin size={15} />,
      tone: "text-sky-500",
    },
    {
      label: "Foreign Tourists",
      value: formatNumber(foreignCount),
      note: "international guests",
      icon: <FiGlobe size={15} />,
      tone: "text-emerald-500",
    },
    {
      label: "Today's Arrival",
      value: formatNumber(todaysArrivals),
      note: "+3 since morning",
      icon: <FiTrendingUp size={15} />,
      tone: "text-teal-500",
    },
  ];

  if (loading) {
    return <div className="panel p-10 text-center text-slate-500">Loading dashboard data...</div>;
  }

  return (
    <div className="space-y-5 rounded-[30px] bg-[#eaf7f9] p-4 shadow-[0_12px_30px_-22px_rgba(37,99,235,0.25)] md:p-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {dashboardStats.map((item) => (
          <div
            key={item.label}
            className="rounded-[22px] border border-[#cce8ec] bg-white/95 px-4 py-3 shadow-[0_12px_22px_-20px_rgba(15,23,42,0.5)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-bold leading-none text-slate-900">
                  {item.value}
                </p>
              </div>
              <div className={`mt-1 ${item.tone}`}>{item.icon}</div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">{item.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ChartCard
          title="Tourist Arrival Trends"
          className="rounded-[24px] border border-[#cce8ec] bg-white/95 shadow-[0_14px_24px_-20px_rgba(15,23,42,0.45)]"
        >
          <Line
            data={trendData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { usePointStyle: true, boxWidth: 8, color: "#5f7b85" },
                },
              },
              scales: {
                y: {
                  grid: { color: "rgba(207,228,232,0.9)" },
                  ticks: { color: "#70909a" },
                },
                x: {
                  grid: { color: "rgba(239,247,249,0.8)" },
                  ticks: { color: "#70909a" },
                },
              },
            }}
          />
        </ChartCard>

        <Panel
          title="Monthly Arrivals"
          className="rounded-[24px] border border-[#cce8ec] bg-white/95 shadow-[0_14px_24px_-20px_rgba(15,23,42,0.45)]"
        >
          <div className="h-[320px]">
            <Bar
              data={monthlyBarData}
              options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, boxWidth: 8, color: "#5f7b85" },
                  },
                },
                scales: {
                  y: {
                    grid: { color: "rgba(207,228,232,0.9)" },
                    ticks: { color: "#70909a" },
                  },
                  x: {
                    grid: { display: false },
                    ticks: { color: "#70909a" },
                  },
                },
              }}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <Panel
          title="Visit Purpose Distribution"
          className="rounded-[24px] border border-[#cce8ec] bg-white/95 shadow-[0_14px_24px_-20px_rgba(15,23,42,0.45)]"
        >
          <div className="h-[240px]">
            <Doughnut
              data={purposeData}
              options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, boxWidth: 8, color: "#5f7b85" },
                  },
                },
              }}
            />
          </div>
        </Panel>

        <Panel
          title="Top Destinations"
          className="rounded-[24px] border border-[#cce8ec] bg-white/95 shadow-[0_14px_24px_-20px_rgba(15,23,42,0.45)]"
        >
          <div className="space-y-3">
            {topDestinations.map((destination, index) => (
              <div
                key={destination.resort_id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#f4fbfc] px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d8f0f2] text-xs font-bold text-[#227f89]">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {destination.resort_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">{destination.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  <FiStar size={12} />
                  <span className="text-xs font-semibold text-slate-600">
                    {destination.tourism_rating}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Recent Tourist Records"
          className="rounded-[24px] border border-[#cce8ec] bg-white/95 shadow-[0_14px_24px_-20px_rgba(15,23,42,0.45)]"
        >
          <div className="space-y-3">
            {recentRecords.map((record) => (
              <div
                key={record.survey_id}
                className="flex items-center justify-between gap-3 border-b border-sky-100 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {record.full_name}
                  </p>
                  <p className="text-[11px] text-slate-400">{formatDate(record.arrival_date)}</p>
                </div>
                <div className="rounded-full bg-[#dff4f5] px-2.5 py-1 text-[11px] font-semibold text-[#237e86]">
                  {record.total_visitors} visitor{record.total_visitors > 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default Dashboard;
