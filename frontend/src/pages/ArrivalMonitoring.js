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
import { Bar, Line } from "react-chartjs-2";
import { useState } from "react";
import { FiBarChart2, FiGlobe, FiMapPin, FiUsers } from "react-icons/fi";
import ChartCard from "../components/ui/ChartCard";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";
import { formatNumber } from "../utils/format";

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

const tabs = ["Daily", "Weekly", "Monthly", "Yearly"];

function ArrivalMonitoring() {
  const { analytics } = useTourismData();
  const [activeTab, setActiveTab] = useState("Monthly");

  const seriesKey = activeTab.toLowerCase();
  const series = analytics.trendSeries[seriesKey];
  const current = series[series.length - 1] || { arrivals: 0, local: 0, foreign: 0 };

  const lineData = {
    labels: series.map((item) => item.label || item.month),
    datasets: [
      {
        label: "Foreign",
        data: series.map((item) => item.foreign),
        borderColor: "#6994ff",
        backgroundColor: "rgba(105,148,255,0.08)",
        tension: 0.35,
        pointRadius: 2.5,
      },
      {
        label: "Local",
        data: series.map((item) => item.local),
        borderColor: "#2e9a93",
        backgroundColor: "rgba(46,154,147,0.10)",
        tension: 0.35,
        pointRadius: 2.5,
      },
    ],
  };

  const ageData = {
    labels: ["0-7", "8-17", "18-35", "36-59", "60+"],
    datasets: [
      {
        label: "Female",
        data: [22, 90, 420, 250, 55],
        backgroundColor: "#2e9a93",
        borderRadius: 6,
      },
      {
        label: "Male",
        data: [18, 82, 365, 220, 45],
        backgroundColor: "#f2a52a",
        borderRadius: 6,
      },
    ],
  };

  const summaryCards = [
    {
      title: "Peak Month",
      value: "April 2026",
      subtitle: `${formatNumber(current.arrivals)} total arrivals`,
    },
    {
      title: "Most Popular Origin",
      value: "CALABARZON",
      subtitle: "62% of local tourists",
    },
    {
      title: "Growth Rate",
      value: "+12.5%",
      subtitle: "Year over year",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Arrival Monitoring"
        description=""
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-xs font-medium transition ${
              activeTab === tab
                ? "bg-[#0d8b97] text-white"
                : "border border-[#c7dce1] bg-[#eef6f7] text-slate-600"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Total Arrivals</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatNumber(current.arrivals)}
              </p>
            </div>
            <FiUsers className="text-sky-400" size={16} />
          </div>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Local Tourists</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatNumber(current.local)}
              </p>
            </div>
            <FiMapPin className="text-sky-500" size={16} />
          </div>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Foreign Tourists</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatNumber(current.foreign)}
              </p>
            </div>
            <FiGlobe className="text-emerald-500" size={16} />
          </div>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Avg Daily</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatNumber(Math.round(current.arrivals / 4 || 0))}
              </p>
            </div>
            <FiBarChart2 className="text-fuchsia-500" size={16} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
        <ChartCard title="Arrival Trend (Monthly)" className="!p-3">
          <Line
            data={lineData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { usePointStyle: true, boxWidth: 8 },
                },
              },
              scales: {
                y: { grid: { color: "rgba(193,221,227,0.9)" } },
                x: { grid: { color: "rgba(234,244,246,0.9)" } },
              },
            }}
          />
        </ChartCard>

        <ChartCard title="Gender + Age Distribution" className="!p-3">
          <Bar
            data={ageData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { usePointStyle: true, boxWidth: 8 },
                },
              },
              scales: {
                y: { grid: { color: "rgba(193,221,227,0.9)" } },
                x: { grid: { display: false } },
              },
            }}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <div key={card.title} className="panel px-5 py-4">
            <p className="text-[11px] text-slate-500">{card.title}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.subtitle}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArrivalMonitoring;
