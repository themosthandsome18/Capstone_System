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
import {
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function Dashboard() {
  const { dashboardData, loading } = useTourismData();
  const metrics = dashboardData.metrics;
  const classification = dashboardData.classification;
  const gender = dashboardData.gender;
  const stayType = dashboardData.stayType;
  const validation = dashboardData.validation;

  const dailyVisitorData = {
    labels: dashboardData.trends.labels,
    datasets: [
      {
        data: dashboardData.trends.arrivals,
        borderColor: "#6abdc0",
        backgroundColor: "rgba(106, 189, 192, 0.15)",
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#6abdc0",
      },
    ],
  };

  const touristClassificationData = {
    labels: ["Filipino", "Maubanin", "Foreign"],
    datasets: [
      {
        data: [
          classification.filipino,
          classification.maubanin,
          classification.foreign,
        ],
        backgroundColor: ["#60b8b5", "#8fdcda", "#ffc978"],
        borderWidth: 0,
        cutout: "62%",
      },
    ],
  };

  const genderData = {
    labels: ["Male", "Female"],
    datasets: [
      {
        data: [gender.male, gender.female],
        backgroundColor: ["#147c79", "#21b8c3"],
        borderRadius: 8,
        barThickness: 80,
      },
    ],
  };

  const stayTypeData = {
    labels: ["Day Tour", "Overnight"],
    datasets: [
      {
        data: [stayType.dayTour, stayType.overnight],
        backgroundColor: ["#359e9b", "#4698f2"],
        borderWidth: 0,
        cutout: "62%",
      },
    ],
  };

  const lineOptions = {
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
          color: "#a1aaa6",
        },
        grid: {
          color: "rgba(190, 205, 198, 0.35)",
        },
      },
      x: {
        ticks: {
          color: "#a1aaa6",
        },
        grid: {
          display: false,
        },
      },
    },
  };

  const barOptions = {
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
          color: "#6b7470",
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#4f5a55",
        },
      },
    },
  };

  const doughnutOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard data...</div>;
  }

  return (
    <div className="figma-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p>Real-time tourism metrics for Mauban, Quezon</p>
        </div>

        <div className="dashboard-actions">
          <button type="button" className="outline-action">
            <FiDownload size={15} />
            Export
          </button>

          <button type="button" className="primary-action">
            + Generate Report
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard
          title="Today’s Arrivals"
          value={formatNumber(metrics.todayArrivals)}
          icon={<FiUsers />}
        />

        <MetricCard
          title="This Week’s Arrivals"
          value={formatNumber(metrics.weekArrivals)}
          icon={<FiCalendar />}
        />

        <MetricCard
          title="This Month’s Arrivals"
          value={formatNumber(metrics.monthArrivals)}
          icon={<FiCalendar />}
        />

        <MetricCard
          title="Total Revenue Collected"
          value={formatCurrency(metrics.totalRevenueCollected)}
          icon={<FiBriefcase />}
        />
      </div>

      <div className="dashboard-row-large">
        <section className="dashboard-card visitor-card">
          <CardTitle title="Daily Visitor Trends" subtitle="Last 7 days" />

          <div className="line-chart-area">
            <Line data={dailyVisitorData} options={lineOptions} />
          </div>
        </section>

        <section className="dashboard-card classification-card">
          <CardTitle title="Tourist Classification" subtitle="Origin breakdown" />

          <div className="classification-content">
            <div className="classification-chart">
              <Doughnut
                data={touristClassificationData}
                options={doughnutOptions}
              />
            </div>

            <LegendRow color="#60b8b5" label="Filipino" value={classification.filipino} />
            <LegendRow color="#8fdcda" label="Maubanin" value={classification.maubanin} />
            <LegendRow color="#ffc978" label="Foreign" value={classification.foreign} />
          </div>
        </section>
      </div>

      <div className="dashboard-row-medium">
        <section className="dashboard-card gender-card">
          <CardTitle title="Gender Distribution" subtitle="Active tourists this month" />

          <div className="bar-chart-area">
            <Bar data={genderData} options={barOptions} />
          </div>
        </section>

        <section className="dashboard-card stay-card">
          <CardTitle title="Stay Type Distribution" subtitle="Day Tour vs Overnight" />

          <div className="stay-content">
            <div className="stay-chart">
              <Doughnut data={stayTypeData} options={doughnutOptions} />
            </div>

            <div className="stay-summary">
              <StayBox
                color="#359e9b"
                title="Day Tour"
                value={formatNumber(stayType.dayTour)}
                percentage="Backend computed"
              />
              <StayBox
                color="#4698f2"
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