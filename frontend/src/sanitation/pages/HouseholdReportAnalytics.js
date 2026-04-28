import { FiDownload, FiFileText, FiMapPin, FiPrinter } from "react-icons/fi";

const barangaysData = [
  { name: "Poblacion", hss: 14, toilet: 8, water: 6, waste: 10 },
  { name: "San Isidro", hss: 12, toilet: 6, water: 4, waste: 7 },
  { name: "Malabanan", hss: 15, toilet: 9, water: 5, waste: 8 },
  { name: "San Roque", hss: 11, toilet: 5, water: 3, waste: 6 },
  { name: "Bagong Pook", hss: 13, toilet: 7, water: 6, waste: 9 },
  { name: "Bagong Bayan", hss: 10, toilet: 4, water: 2, waste: 5 },
];

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
            <FiPrinter />
            Print
          </button>

          <button type="button" className="report-export-btn">
            <FiDownload />
            Export PDF
          </button>
        </div>
      </div>

      <div className="household-report-stat-grid">
        <StatCard title="Total Households" value="60" color="blue" />
        <StatCard title="Compliant" value="25" color="green" />
        <StatCard title="For Completion" value="10" color="orange" />
        <StatCard title="At-Risk" value="20" color="red" />
      </div>

      <div className="household-report-chart-grid">
        <section className="household-report-card">
          <h3>Households per Barangay</h3>

          <div className="hr-bar-chart">
            {barangaysData.slice(0, 5).map((item) => (
              <div className="hr-bar-group" key={item.name}>
                <div className="hr-bars">
                  <span
                    className="compliant"
                    style={{ height: `${item.toilet * 18}px` }}
                  />
                  <span
                    className="atrisk"
                    style={{ height: `${(item.hss - item.toilet) * 18}px` }}
                  />
                </div>
                <small>{item.name}</small>
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
            {barangaysData.map((item) => {
              const toiletPercent = Math.round((item.toilet / item.hss) * 100);
              const waterPercent = Math.round((item.water / item.hss) * 100);
              const wastePercent = Math.round((item.waste / item.hss) * 100);
              const noToilet = item.hss - item.toilet;

              return (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.hss}</td>

                  <td>
                    <Progress
                      color="green"
                      percent={toiletPercent}
                      value={`${item.toilet} (${toiletPercent}%)`}
                    />
                  </td>

                  <td>
                    <Progress
                      color="orange"
                      percent={waterPercent}
                      value={`${item.water} (${waterPercent}%)`}
                    />
                  </td>

                  <td>
                    <Progress
                      color="red"
                      percent={wastePercent}
                      value={`${item.waste} (${wastePercent}%)`}
                    />
                  </td>

                  <td>
                    <span className="risk-flag">ⓘ {noToilet} no toilet</span>
                  </td>
                </tr>
              );
            })}
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

function Progress({ color, value, percent }) {
  return (
    <div className="infra-progress-wrap">
      <div className="infra-progress">
        <span className={color} style={{ width: `${percent}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

export default HouseholdReportAnalytics;