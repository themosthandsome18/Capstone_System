import { FiDownload, FiFileText, FiMapPin, FiPrinter } from "react-icons/fi";

const barangays = ["Poblacion", "San Isidro", "Malabanan", "San Roque", "Bagong Pook", "Bagong Bayan"];

function HouseholdReportAnalytics() {
  return (
    <div className="household-report-page">
      <div className="household-report-header">
        <div>
          <h1>Report & Analytics</h1>
          <p>Comprehensive sanitation analytics and reporting dashboard</p>
        </div>

        <div className="household-report-actions">
          <button type="button" className="report-print-btn">
            <FiPrinter /> Print
          </button>
          <button type="button" className="report-export-btn">
            <FiDownload /> Export PDF
          </button>
        </div>
      </div>

      <div className="household-report-stat-grid">
        <StatCard title="Total Households" value="60" color="blue" />
        <StatCard title="Compliant" value="25" color="green" />
        <StatCard title="For Completion" value="10" color="orange" />
        <StatCard title="At- Risk" value="20" color="red" />
      </div>

      <div className="household-report-chart-grid">
        <section className="household-report-card">
          <h3>Households per Barangay</h3>

          <div className="household-bar-chart">
            {barangays.slice(0, 5).map((name) => (
              <div className="household-bar-group" key={name}>
                <div className="household-bars">
                  <span className="compliant" />
                  <span className="atrisk" />
                </div>
                <small>{name}</small>
              </div>
            ))}
          </div>

          <div className="household-chart-legend">
            <span className="red">■ AtRisk</span>
            <span className="green">■ Compliant</span>
          </div>
        </section>

        <section className="household-report-card">
          <h3>Waste Disposal Methods</h3>

          <div className="waste-donut-wrap">
            <div className="waste-donut" />
            <span className="waste-label top-left">15</span>
            <span className="waste-label top-right">15</span>
            <span className="waste-label bottom-left">15</span>
            <span className="waste-label bottom-right">15</span>
          </div>

          <div className="household-chart-legend">
            <span className="yellow">■ Burned</span>
            <span className="green">■ Collected</span>
            <span className="teal">■ Composted</span>
            <span className="red">■ Dumped</span>
          </div>
        </section>
      </div>

      <section className="infra-card">
        <div className="infra-card-header">
          <div className="infra-title">
            <FiMapPin />
            <div>
              <h3>Sanitation Infrastructure by Barangay</h3>
              <p>Access to safe toilets, piped water and proper waste disposal</p>
            </div>
          </div>

          <div className="infra-legend">
            <span>🚽 Safe Toilet</span>
            <span>💧 Piped Water</span>
            <span>🗑️ Proper Waste</span>
          </div>
        </div>

        <table className="infra-table">
          <thead>
            <tr>
              <th>Barangay</th>
              <th>HSS</th>
              <th>🚽 Safe Toilet</th>
              <th>💧 Piped Water</th>
              <th>🗑️ Proper Waste</th>
              <th>Risk Flags</th>
            </tr>
          </thead>

          <tbody>
            {barangays.map((name) => (
              <tr key={name}>
                <td>{name}</td>
                <td>12</td>
                <td>
                  <Progress color="green" value="6 (50%)" />
                </td>
                <td>
                  <Progress color="orange" value="4 (33%)" />
                </td>
                <td>
                  <Progress color="red" value="6 (50%)" />
                </td>
                <td>
                  <span className="risk-flag">ⓘ 3 no toilet</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatCard({ title, value, color }) {
  return (
    <div className="household-report-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      <FiFileText className={color} />
    </div>
  );
}

function Progress({ color, value }) {
  return (
    <div className="infra-progress-wrap">
      <div className="infra-progress">
        <span className={color} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

export default HouseholdReportAnalytics;