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

function Dashboard() {
  const { touristRecords, loading } = useTourismData();

  const totalArrivals = touristRecords.reduce(
    (total, record) => total + record.total_visitors,
    0
  );

  const localTourists = touristRecords.reduce(
    (total, record) => total + record.filipino_count,
    0
  );

  const maubaninTourists = touristRecords.reduce(
    (total, record) => total + record.maubanin_count,
    0
  );

  const foreignTourists = touristRecords.reduce(
    (total, record) => total + record.foreigner_count,
    0
  );

  const maleTourists = touristRecords.reduce(
    (total, record) => total + record.total_male,
    0
  );

  const femaleTourists = touristRecords.reduce(
    (total, record) => total + record.total_female,
    0
  );

  const dailyVisitorData = {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    datasets: [
      {
        data: [90, 100, 90, 170, 230, 330, 290],
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
        data: [localTourists, maubaninTourists, foreignTourists],
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
        data: [maleTourists, femaleTourists],
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
        data: [678, 314],
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
          value="248"
          note="↑ 12% vs yesterday"
          icon={<FiUsers />}
        />

        <MetricCard
          title="This Week’s Arrivals"
          value="1,504"
          note="↑ +8.4% vs last week"
          icon={<FiCalendar />}
        />

        <MetricCard
          title="This Month’s Arrivals"
          value={formatNumber(totalArrivals)}
          note="↑ +18% vs last month"
          icon={<FiCalendar />}
        />

        <MetricCard
          title="Total Revenue Collected"
          value="₱412,580"
          note="↑ +24% this month"
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

            <LegendRow color="#60b8b5" label="Filipino" value={localTourists} />
            <LegendRow color="#8fdcda" label="Maubanin" value={maubaninTourists} />
            <LegendRow color="#ffc978" label="Foreign" value={foreignTourists} />
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
              <StayBox color="#359e9b" title="Day Tour" value="678" percentage="68.3%" />
              <StayBox color="#4698f2" title="Overnight" value="314" percentage="31.7%" />
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
            value="1,428"
            note="All required fields complete & validated"
          />

          <ValidationBox
            type="danger"
            icon={<FiXCircle />}
            title="Invalid Entries"
            value="23"
            note="Missing required information — needs review"
          />

          <ValidationBox
            type="warning"
            icon={<FiFileText />}
            title="Duplicate Entries"
            value="12"
            note="Auto-flagged by system, awaiting merge"
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