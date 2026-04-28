import {
  FiAlertTriangle,
  FiCalendar,
  FiDownload,
  FiFileText,
  FiPrinter,
  FiShield,
} from "react-icons/fi";

const stats = [
  { label: "Total Establishments", value: "12", color: "blue" },
  { label: "Good Standing", value: "6", color: "green" },
  { label: "For Completion", value: "2", color: "orange" },
  { label: "Upcoming", value: "2", color: "yellow" },
  { label: "Violators", value: "2", color: "red" },
];

const establishmentBars = [
  { label: "Water Refili...", total: 2, violators: 0 },
  { label: "Poultry Farm", total: 2, violators: 1 },
  { label: "Gasoline Sta...", total: 2, violators: 0 },
  { label: "Restaurant /...", total: 3, violators: 0 },
  { label: "Barbershop /...", total: 2, violators: 0 },
  { label: "Public Marke...", total: 1, violators: 1 },
];

function SanitaryReportAnalytics() {
  return (
    <div className="sanitary-report-page">
      <div className="sanitary-report-header">
        <div>
          <h1>Report & Analytics</h1>
          <p>Comprehensive sanitation analytics and reporting dashboard</p>
        </div>

        <div className="sanitary-report-actions">
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

      <div className="sanitary-report-stat-grid">
        {stats.map((item) => (
          <div key={item.label} className="sanitary-report-stat-card">
            <div>
              <p>{item.label}</p>
              <h2>{item.value}</h2>
            </div>

            <FiFileText className={`report-stat-icon ${item.color}`} />
          </div>
        ))}
      </div>

      <div className="sanitary-report-chart-grid">
        <section className="sanitary-report-card establishment-chart-card">
          <h3>Establishments per Type</h3>

          <div className="bar-chart-mock">
            {establishmentBars.map((item) => (
              <div className="bar-group" key={item.label}>
                <div className="bar-stack">
                  <span
                    className="bar-total"
                    style={{ height: `${item.total * 58}px` }}
                  />

                  {item.violators > 0 && (
                    <span
                      className="bar-violator"
                      style={{ height: `${item.violators * 58}px` }}
                    />
                  )}
                </div>

                <small>{item.label}</small>
              </div>
            ))}
          </div>

          <div className="chart-legend">
            <span className="total">■ Total</span>
            <span className="violator">■ Violators</span>
          </div>
        </section>

        <section className="sanitary-report-card pie-chart-card">
          <h3>Permit Size Distribution</h3>

          <div className="permit-pie-mock">
            <div className="pie-circle" />

            <span className="pie-label top">7</span>
            <span className="pie-label bottom">5</span>
          </div>

          <div className="chart-legend center">
            <span className="large">■ Large</span>
            <span className="small">■ SP (Small)</span>
          </div>
        </section>
      </div>

      <section className="summary-report-card">
        <div className="summary-report-top">
          <div className="summary-title">
            <FiFileText />

            <div>
              <h3>Summary Report</h3>
              <p>Business permit and sanitary compliance snapshot</p>
            </div>
          </div>

          <div className="compliance-rate-box">
            <p>Compliance Rate</p>
            <h2>50%</h2>
          </div>
        </div>

        <div className="summary-report-body">
          <div className="summary-left">
            <div className="summary-progress-bar">
              <span className="green" />
              <span className="yellow" />
              <span className="orange" />
              <span className="red" />
            </div>

            <div className="summary-mini-grid">
              <MiniSummary
                label="Good Standing"
                value="6"
                color="green"
                icon={<FiShield />}
              />

              <MiniSummary
                label="Upcoming"
                value="2"
                color="yellow"
                icon={<FiCalendar />}
              />

              <MiniSummary
                label="For Completion"
                value="2"
                color="orange"
                icon={<FiFileText />}
              />

              <MiniSummary
                label="Violators"
                value="2"
                color="red"
                icon={<FiAlertTriangle />}
              />
            </div>
          </div>

          <div className="generated-brief-box">
            <h3>Generated Brief</h3>

            <p>
              Out of <strong>12</strong> monitored establishments,{" "}
              <span className="green-text">6</span> are in good standing, while{" "}
              <span className="red-text">2</span> require enforcement attention.
            </p>

            <div className="brief-mini-grid">
              <div>
                <p>Next inspection queue</p>
                <h2>2</h2>
              </div>

              <div>
                <p>Pending requirements</p>
                <h2>2</h2>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniSummary({ label, value, color, icon }) {
  return (
    <div className={`mini-summary-card ${color}`}>
      <p>
        {label}
        {icon}
      </p>

      <h2>{value}</h2>
    </div>
  );
}

export default SanitaryReportAnalytics;