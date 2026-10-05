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
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiMapPin,
  FiTrendingUp,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useTourismData } from "../context/TourismDataContext";
import { buildReportingYearOptions } from "../utils/reportingYears";
import {
  CHART_PALETTE_DEFAULTS,
  seriesColors,
  useTourismChartPalette,
} from "../theme/chartPalette";
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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

const currentReportingYear = String(new Date().getFullYear());

// Chart colours come from the theme (chartPalette.js); grid lines stay fixed.
const buildLineOptions = (palette) => ({
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 400,
      ticks: {
        stepSize: 100,
        color: palette.tick,
      },
      grid: {
        color: "rgba(190, 205, 198, 0.35)",
      },
    },
    x: {
      ticks: {
        color: palette.tick,
      },
      grid: {
        display: false,
      },
    },
  },
});

const buildBarOptions = (palette) => ({
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: "rgba(150, 180, 175, 0.35)",
      },
      ticks: {
        color: palette.tick,
      },
    },
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: palette.tick,
      },
    },
  },
});

const doughnutOptions = {
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
};

function Dashboard() {
  const navigate = useNavigate();
  const {
    dashboardData,
    loading,
    error,
    refreshDashboardData,
    refreshDashboardIfStale,
    isComputedDataStale,
    reportingYears,
  } = useTourismData();
  const [selectedYear, setSelectedYear] = useState(
    dashboardData.filters?.year || currentReportingYear
  );
  const reportingYearOptions = buildReportingYearOptions(reportingYears, selectedYear);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  // A record changed since the dashboard was last loaded: refetch on open, never show stale.
  const [staleLoading, setStaleLoading] = useState(() =>
    isComputedDataStale("dashboardData")
  );

  useEffect(() => {
    let active = true;

    if (!isComputedDataStale("dashboardData")) {
      setStaleLoading(false);
      return undefined;
    }

    setStaleLoading(true);
    refreshDashboardIfStale()
      .catch((requestError) => {
        if (active) {
          setDashboardError(requestError.message || "Unable to load dashboard data.");
        }
      })
      .finally(() => {
        if (active) {
          setStaleLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isComputedDataStale, refreshDashboardIfStale]);
  const metrics = dashboardData.metrics;
  const classification = dashboardData.classification;
  const gender = dashboardData.gender;
  const stayType = dashboardData.stayType;
  const validation = dashboardData.validation;

  // null until the shell's theme colours have been read; charts wait for it.
  const chartPalette = useTourismChartPalette();
  const palette = chartPalette || CHART_PALETTE_DEFAULTS;
  const twoSeries = useMemo(() => seriesColors(palette, 2), [palette]);
  const lineOptions = useMemo(() => buildLineOptions(palette), [palette]);
  const barOptions = useMemo(() => buildBarOptions(palette), [palette]);

  const dailyVisitorData = useMemo(() => ({
    labels: dashboardData.trends.labels,
    datasets: [
      {
        data: dashboardData.trends.arrivals,
        borderColor: palette.series[0],
        backgroundColor: palette.wash,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: palette.series[0],
      },
    ],
  }), [dashboardData.trends.labels, dashboardData.trends.arrivals, palette]);

  const touristClassificationData = useMemo(() => ({
    labels: ["Domestic (Filipino)", "Foreign (International)"],
    datasets: [
      {
        data: [
          classification.filipino || 0,
          classification.foreign || 0,
        ],
        backgroundColor: twoSeries,
        borderWidth: 0,
        cutout: "62%",
      },
    ],
  }), [classification.filipino, classification.foreign, twoSeries]);

  const genderData = useMemo(() => ({
    labels: ["Male", "Female"],
    datasets: [
      {
        data: [gender.male, gender.female],
        backgroundColor: twoSeries,
        borderRadius: 8,
        barThickness: 80,
      },
    ],
  }), [gender.male, gender.female, twoSeries]);

  const stayTypeData = useMemo(() => ({
    labels: ["Same Day", "Overnight"],
    datasets: [
      {
        data: [stayType.dayTour, stayType.overnight],
        backgroundColor: twoSeries,
        borderWidth: 0,
        cutout: "62%",
      },
    ],
  }), [stayType.dayTour, stayType.overnight, twoSeries]);



  if (loading || staleLoading) {
    return <div className="dashboard-loading">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="dashboard-loading">{error}</div>;
  }

  async function handleYearChange(event) {
    const year = event.target.value;
    setSelectedYear(year);
    setDashboardError("");
    setDashboardRefreshing(true);

    try {
      await refreshDashboardData({ year });
    } catch (requestError) {
      setDashboardError(
        requestError.message || "Unable to load dashboard data."
      );
    } finally {
      setDashboardRefreshing(false);
    }
  }

  function handleExportDashboard() {
    const rows = [
      ["Reporting Year", selectedYear === "all" ? "All Years" : selectedYear],
      ["Report Date", dashboardData.reportingDate || ""],
      ["Today's Arrivals", metrics.todayArrivals],
      ["This Week's Arrivals", metrics.weekArrivals],
      ["This Month's Arrivals", metrics.monthArrivals],
      ["Total Revenue Collected", metrics.totalRevenueCollected],
      ["Pending on Report Date", metrics.pendingForReportingDate],
      ["No-show Rate", `${metrics.noShowRate || 0}%`],
      ["Top Resort This Month", metrics.topResortThisMonth],
      ["Top Origin This Month", metrics.topOriginThisMonth],
      ["Domestic (Filipino)", classification.filipino || 0],
      ["Foreign (International)", classification.foreign || 0],
      ["Male", gender.male],
      ["Female", gender.female],
      ["Same Day", stayType.dayTour],
      ["Overnight", stayType.overnight],
      ["Verified Entries", validation.verifiedEntries],
      ["Duplicate Entries", validation.duplicateEntries],
    ];

    exportCsv(datedCsvFilename("tourism-dashboard"), ["Metric", "Value"], rows);
  }

  return (
    <div className="figma-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p>Real-time tourism metrics for Mauban, Quezon</p>
        </div>

        <div className="dashboard-actions">
          <select
            className="dashboard-year-select"
            aria-label="Reporting year"
            value={selectedYear}
            disabled={dashboardRefreshing}
            onChange={handleYearChange}
          >
            {reportingYearOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="outline-action"
            onClick={handleExportDashboard}
          >
            <FiDownload size={15} />
            Export
          </button>

          <button
            type="button"
            className="primary-action"
            onClick={() => navigate("/analytics-reports")}
          >
            + Generate Report
          </button>
        </div>
      </div>

      {dashboardError ? (
        <p className="tourist-record-error">{dashboardError}</p>
      ) : null}

      <div className="metric-grid">
        <MetricCard
          title="Today's Arrivals"
          value={formatNumber(metrics.todayArrivals)}
          icon={<FiUsers />}
        />

        <MetricCard
          title="This Week's Arrivals"
          value={formatNumber(metrics.weekArrivals)}
          icon={<FiCalendar />}
        />

        <MetricCard
          title="This Month's Arrivals"
          value={formatNumber(metrics.monthArrivals)}
          icon={<FiCalendar />}
        />

        <MetricCard
          title="Total Revenue Collected"
          value={formatCurrency(metrics.totalRevenueCollected)}
          icon={<FiBriefcase />}
        />

        <MetricCard
          title="Pending on Report Date"
          value={formatNumber(metrics.pendingForReportingDate)}
          note={dashboardData.reportingDate}
          icon={<FiFileText />}
        />

        <MetricCard
          title="No-show Rate"
          value={`${metrics.noShowRate || 0}%`}
          note="Selected year"
          icon={<FiXCircle />}
        />

        <MetricCard
          title="Top Resort This Month"
          value={metrics.topResortThisMonth}
          icon={<FiTrendingUp />}
        />

        <MetricCard
          title="Top Origin This Month"
          value={metrics.topOriginThisMonth}
          icon={<FiMapPin />}
        />
      </div>

      <div className="dashboard-row-large">
        <section className="dashboard-card visitor-card">
          <CardTitle title="Daily Visitor Trends" subtitle="Last 7 days" />

          <div className="line-chart-area">
            {chartPalette ? <Line data={dailyVisitorData} options={lineOptions} /> : null}
          </div>
        </section>

        <section className="dashboard-card classification-card">
          <CardTitle title="Tourist Classification" subtitle="Origin breakdown" />

          <div className="classification-content">
            <div className="classification-chart">
              {chartPalette ? (
                <Doughnut
                  data={touristClassificationData}
                  options={doughnutOptions}
                />
              ) : null}
            </div>

            <LegendRow color={twoSeries[0]} label="Domestic (Filipino)" value={classification.filipino || 0} />
            <LegendRow color={twoSeries[1]} label="Foreign (International)" value={classification.foreign || 0} />
          </div>
        </section>
      </div>

      <div className="dashboard-row-medium">
        <section className="dashboard-card gender-card">
          <CardTitle title="Gender Distribution" subtitle="Active tourists this month" />

          <div className="bar-chart-area">
            {chartPalette ? <Bar data={genderData} options={barOptions} /> : null}
          </div>
        </section>

        <section className="dashboard-card stay-card">
          <CardTitle title="Stay Type Distribution" subtitle="Same Day vs Overnight" />

          <div className="stay-content">
            <div className="stay-chart">
              {chartPalette ? <Doughnut data={stayTypeData} options={doughnutOptions} /> : null}
            </div>

            <div className="stay-summary">
              <StayBox
                color={twoSeries[0]}
                title="Same Day"
                value={formatNumber(stayType.dayTour)}
                percentage="Backend computed"
              />
              <StayBox
                color={twoSeries[1]}
                title="Overnight"
                value={formatNumber(stayType.overnight)}
                percentage="Backend computed"
              />
            </div>
          </div>
        </section>
      </div>

      <section className="dashboard-card validation-panel">
        <div className="validation-header">
          <CardTitle
            title="Data Validation Panel"
            subtitle="Automated quality checks on incoming submissions"
          />

          <button type="button" className="review-button">
            Review All
          </button>
        </div>

        <div className="validation-grid">
          <ValidationBox
            type="success"
            icon={<FiCheckCircle />}
            title="Verified Entries"
            value={formatNumber(validation.verifiedEntries)}
            note="All records stored in the system"
          />

          <ValidationBox
            type="danger"
            icon={<FiXCircle />}
            title="Invalid Entries"
            value={formatNumber(validation.invalidEntries)}
            note="Records with validation issues"
          />

          <ValidationBox
            type="warning"
            icon={<FiFileText />}
            title="Duplicate Entries"
            value={formatNumber(validation.duplicateEntries)}
            note="Detected by repeated contact numbers"
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value, note, icon }) {
  return (
    <section className="metric-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
        <span>{note}</span>
      </div>

      <div className="metric-icon">{icon}</div>
    </section>
  );
}

function CardTitle({ title, subtitle }) {
  return (
    <div className="card-title">
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

function LegendRow({ color, label, value }) {
  return (
    <div className="legend-row">
      <div>
        <span style={{ backgroundColor: color }} />
        {label}
      </div>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function StayBox({ color, title, value, percentage }) {
  return (
    <div className="stay-box">
      <div className="stay-label">
        <span style={{ backgroundColor: color }} />
        {title}
      </div>

      <h3>{value}</h3>
      <p>{percentage} of tourists</p>
    </div>
  );
}

function ValidationBox({ type, icon, title, value, note }) {
  return (
    <div className={`validation-box ${type}`}>
      <div className="validation-icon">{icon}</div>

      <div>
        <p>{title}</p>
        <h3>{value}</h3>
        <span>{note}</span>
      </div>
    </div>
  );
}

export default Dashboard;
