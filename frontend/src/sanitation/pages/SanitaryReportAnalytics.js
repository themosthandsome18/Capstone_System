import {
  FiAlertTriangle,
  FiCalendar,
  FiDownload,
  FiFileText,
  FiPrinter,
  FiShield,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

function SanitaryReportAnalytics() {
  const { reportData, establishments, loading, error } = useSanitationData();

  const summary = reportData?.summary || buildLocalSummary(establishments);
  const byType = reportData?.byType || buildLocalByType(establishments);
  const questionAnswers = reportData?.questionAnswers || [];
  const complaintSummary = reportData?.complaints?.summary || {};
  const complaintCategories = reportData?.complaints?.byCategory || [];
  const requirementTracker = reportData?.requirementTracker || [];
  const riskHotspots = reportData?.riskHotspots || [];
  const renewalAlerts = reportData?.renewalAlerts || {};
  const needsAttention = reportData?.needsAttention || [];

  const totalSp = byType.reduce((total, item) => total + (item.sp || 0), 0);
  const totalLarge = byType.reduce((total, item) => total + (item.large || 0), 0);

  const maxTotal = Math.max(...byType.map((item) => item.total || 0), 1);

  function handlePrint() {
    window.print();
  }

  function handleExport() {
    const headers = [
      "Business Type",
      "Inspection Frequency",
      "Total",
      "With Permit",
      "Without Permit",
      "SP",
      "Large",
      "Good Standing",
      "Upcoming",
      "For Completion",
      "Violators",
      "No Permit",
    ];

    const csvRows = byType.map((item) => [
      item.name,
      item.inspection_frequency,
      item.total,
      item.withPermit,
      item.withoutPermit,
      item.sp,
      item.large,
      item.goodStanding,
      item.upcoming,
      item.forCompletion,
      item.violators,
      item.noPermit,
    ]);

    const csvContent = [headers, ...csvRows]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "sanitary-business-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="sanitary-report-page">Loading sanitation reports...</div>;
  }

  return (
    <div className="sanitary-report-page">
      <div className="sanitary-report-header">
        <div>
          <h1>Business Report & Analytics</h1>
          <p>Business permit and sanitary compliance analytics</p>
        </div>

        <div className="sanitary-report-actions">
          <button type="button" className="report-print-btn" onClick={handlePrint}>
            <FiPrinter />
            Print
          </button>

          <button type="button" className="report-export-btn" onClick={handleExport}>
            <FiDownload />
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="sanitary-report-stat-grid">
        <ReportStat
          label="Total Establishments"
          value={summary.totalEstablishments || 0}
          color="blue"
        />
        <ReportStat
          label="Good Standing"
          value={summary.goodStanding || 0}
          color="green"
        />
        <ReportStat
          label="For Completion"
          value={summary.forCompletion || 0}
          color="orange"
        />
        <ReportStat
          label="Upcoming"
          value={summary.upcoming || 0}
          color="yellow"
        />
        <ReportStat
          label="Violators"
          value={summary.violators || 0}
          color="red"
        />
      </div>

      <div className="sanitary-report-chart-grid">
        <section className="sanitary-report-card establishment-chart-card">
          <h3>Establishments per Type</h3>

          <div className="bar-chart-mock">
            {byType.map((item) => {
              const totalHeight = getBarHeight(item.total, maxTotal);
              const violatorHeight = getBarHeight(item.violators, maxTotal);

              return (
                <div className="bar-group" key={item.id || item.name}>
                  <div className="bar-stack">
                    <span
                      className="bar-total"
                      style={{ height: `${totalHeight}px` }}
                      title={`Total: ${item.total}`}
                    />

                    {(item.violators || 0) > 0 ? (
                      <span
                        className="bar-violator"
                        style={{ height: `${violatorHeight}px` }}
                        title={`Violators: ${item.violators}`}
                      />
                    ) : null}
                  </div>

                  <small>{shortenLabel(item.name)}</small>
                </div>
              );
            })}
          </div>

          <div className="chart-legend">
            <span className="total">■ Total</span>
            <span className="violator">■ Violators</span>
          </div>
        </section>

        <section className="sanitary-report-card pie-chart-card">
          <h3>Permit Size Distribution</h3>

          <div className="permit-pie-mock">
            <div
              className="pie-circle"
              style={{
                background: buildPermitPieGradient(totalSp, totalLarge),
              }}
            />

            <span className="pie-label top">{totalLarge}</span>
            <span className="pie-label bottom">{totalSp}</span>
          </div>

          <div className="chart-legend center">
            <span className="large">■ Large</span>
            <span className="small">■ SP</span>
          </div>
        </section>
      </div>

      <section className="sanitary-question-card">
        <div className="summary-title">
          <FiFileText />

          <div>
            <h3>Questions Answered by the System</h3>
            <p>Computed from establishment status, permits, and inspection records</p>
          </div>
        </div>

        <div className="sanitary-question-grid">
          {questionAnswers.length ? (
            questionAnswers.map((item, index) => (
              <article key={item.id || item.question} className="sanitary-question-item">
                <span>Q{index + 1}</span>
                <h4>{item.question}</h4>
                <p>{item.answer}</p>
              </article>
            ))
          ) : (
            <p className="submission-empty">No question answers available.</p>
          )}
        </div>
      </section>

      <section className="sanitary-insight-card">
        <h3>Top Establishments Needing Attention</h3>
        <div className="attention-ranking">
          {needsAttention.length ? (
            needsAttention.map((item, index) => (
              <div className="attention-row" key={item.id}>
                <strong>{index + 1}</strong>
                <div>
                  <h4>{item.business_name}</h4>
                  <p>
                    {item.business_type_name} • {item.barangay}
                  </p>
                  <span>{(item.reasons || []).join(", ")}</span>
                </div>
                <b className={riskClass(item.riskLevel)}>{item.riskScore}</b>
              </div>
            ))
          ) : (
            <p className="submission-empty">No priority establishments found.</p>
          )}
        </div>
      </section>

      <div className="sanitary-insight-grid">
        <section className="sanitary-insight-card">
          <h3>Requirement Compliance Tracker</h3>
          <InsightBars rows={requirementTracker} />
        </section>

        <section className="sanitary-insight-card">
          <h3>Complaint Status</h3>
          <div className="complaint-mini-status">
            <MiniSummary label="Pending" value={complaintSummary.pending || 0} color="yellow" icon={<FiAlertTriangle />} />
            <MiniSummary label="Investigating" value={complaintSummary.investigating || 0} color="orange" icon={<FiFileText />} />
            <MiniSummary label="Resolved" value={complaintSummary.resolved || 0} color="green" icon={<FiShield />} />
            <MiniSummary label="High Priority" value={complaintSummary.highPriority || 0} color="red" icon={<FiAlertTriangle />} />
          </div>
        </section>
      </div>

      <div className="sanitary-insight-grid">
        <section className="sanitary-insight-card">
          <h3>Common Complaint Categories</h3>
          <InsightBars rows={complaintCategories} />
        </section>

        <section className="sanitary-insight-card">
          <h3>Barangay Hotspots</h3>
          <div className="hotspot-list">
            {riskHotspots.length ? (
              riskHotspots.map((item) => (
                <div className="hotspot-row" key={item.barangay}>
                  <span>{item.barangay}</span>
                  <strong>{item.riskScore}</strong>
                  <small>
                    {item.sanitationConcerns} concerns, {item.complaints} complaints
                  </small>
                </div>
              ))
            ) : (
              <p className="submission-empty">No hotspot data yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="sanitary-insight-card">
        <h3>Renewal Alerts</h3>
        <div className="renewal-alert-columns">
          <RenewalAlertList title="Expiring Soon" rows={renewalAlerts.expiringSoon || []} />
          <RenewalAlertList title="Expired" rows={renewalAlerts.expired || []} />
          <RenewalAlertList title="Payment Pending" rows={renewalAlerts.paymentPending || []} />
        </div>
      </section>

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
            <h2>{summary.complianceRate || 0}%</h2>
          </div>
        </div>

        <div className="summary-report-body">
          <div className="summary-left">
            <div
              className="summary-progress-bar"
              style={{
                gridTemplateColumns: buildProgressColumns(summary),
              }}
            >
              <span className="green" />
              <span className="yellow" />
              <span className="orange" />
              <span className="red" />
            </div>

            <div className="summary-mini-grid">
              <MiniSummary
                label="Good Standing"
                value={summary.goodStanding || 0}
                color="green"
                icon={<FiShield />}
              />

              <MiniSummary
                label="Upcoming"
                value={summary.upcoming || 0}
                color="yellow"
                icon={<FiCalendar />}
              />

              <MiniSummary
                label="For Completion"
                value={summary.forCompletion || 0}
                color="orange"
                icon={<FiFileText />}
              />

              <MiniSummary
                label="Violators"
                value={summary.violators || 0}
                color="red"
                icon={<FiAlertTriangle />}
              />
            </div>
          </div>

          <div className="generated-brief-box">
            <h3>Generated Brief</h3>

            <p>
              Out of{" "}
              <strong>{summary.totalEstablishments || 0}</strong> monitored
              establishments,{" "}
              <span className="green-text">{summary.goodStanding || 0}</span>{" "}
              are in good standing, while{" "}
              <span className="red-text">{summary.violators || 0}</span>{" "}
              require enforcement attention.
            </p>

            <div className="brief-mini-grid">
              <div>
                <p>Next inspection queue</p>
                <h2>{summary.upcoming || 0}</h2>
              </div>

              <div>
                <p>Pending requirements</p>
                <h2>{summary.forCompletion || 0}</h2>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-report-card">
        <div className="summary-report-top">
          <div className="summary-title">
            <FiFileText />

            <div>
              <h3>Report Breakdown by Business Type</h3>
              <p>Total, permit coverage, permit size, and compliance status</p>
            </div>
          </div>
        </div>

        <div className="sanitary-report-table-wrap">
          <table className="sanitary-report-table">
            <thead>
              <tr>
                <th>Business Type</th>
                <th>Total</th>
                <th>With Permit</th>
                <th>No Permit</th>
                <th>SP</th>
                <th>Large</th>
                <th>Good</th>
                <th>For Completion</th>
                <th>Violators</th>
              </tr>
            </thead>

            <tbody>
              {byType.length ? (
                byType.map((item) => (
                  <tr key={item.id || item.name}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{formatFrequency(item.inspection_frequency)}</small>
                    </td>
                    <td>{item.total || 0}</td>
                    <td>{item.withPermit || 0}</td>
                    <td>{item.withoutPermit || item.noPermit || 0}</td>
                    <td>{item.sp || 0}</td>
                    <td>{item.large || 0}</td>
                    <td>{item.goodStanding || 0}</td>
                    <td>{item.forCompletion || 0}</td>
                    <td>{item.violators || 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="submission-empty">
                    No report data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReportStat({ label, value, color }) {
  return (
    <div className="sanitary-report-stat-card">
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
      </div>

      <FiFileText className={`report-stat-icon ${color}`} />
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

function InsightBars({ rows }) {
  const max = Math.max(...rows.map((item) => item.total || 0), 1);

  return (
    <div className="insight-bars">
      {rows.length ? (
        rows.slice(0, 8).map((item) => (
          <div className="insight-bar-row" key={item.name}>
            <span>{formatStatusName(item.name)}</span>
            <div>
              <b style={{ width: `${Math.max(8, ((item.total || 0) / max) * 100)}%` }} />
            </div>
            <strong>{item.total || 0}</strong>
          </div>
        ))
      ) : (
        <p className="submission-empty">No data available.</p>
      )}
    </div>
  );
}

function RenewalAlertList({ title, rows }) {
  return (
    <div className="renewal-alert-list">
      <h4>{title}</h4>
      {rows.length ? (
        rows.slice(0, 5).map((item) => (
          <div key={item.id}>
            <strong>{item.establishment_name}</strong>
            <span>{item.stage_label} • {item.expiration_date}</span>
          </div>
        ))
      ) : (
        <p>No records.</p>
      )}
    </div>
  );
}

function buildLocalSummary(establishments) {
  const total = establishments.length;
  const goodStanding = establishments.filter(
    (item) => item.compliance_status === "good_standing"
  ).length;

  return {
    totalEstablishments: total,
    goodStanding,
    upcoming: establishments.filter(
      (item) => item.compliance_status === "upcoming"
    ).length,
    forCompletion: establishments.filter(
      (item) => item.compliance_status === "for_completion"
    ).length,
    violators: establishments.filter(
      (item) => item.compliance_status === "violation"
    ).length,
    noPermit: establishments.filter(
      (item) => item.compliance_status === "no_permit"
    ).length,
    complianceRate: total ? Math.round((goodStanding / total) * 100) : 0,
  };
}

function buildLocalByType(establishments) {
  const grouped = {};

  establishments.forEach((item) => {
    const key = item.business_type_name || "Uncategorized";

    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        name: key,
        inspection_frequency: item.inspection_frequency,
        total: 0,
        withPermit: 0,
        withoutPermit: 0,
        sp: 0,
        large: 0,
        goodStanding: 0,
        upcoming: 0,
        forCompletion: 0,
        violators: 0,
        noPermit: 0,
      };
    }

    grouped[key].total += 1;

    if (item.has_permit) {
      grouped[key].withPermit += 1;
    } else {
      grouped[key].withoutPermit += 1;
    }

    if (item.permit_size === "sp") {
      grouped[key].sp += 1;
    }

    if (item.permit_size === "large") {
      grouped[key].large += 1;
    }

    if (item.compliance_status === "good_standing") {
      grouped[key].goodStanding += 1;
    }

    if (item.compliance_status === "upcoming") {
      grouped[key].upcoming += 1;
    }

    if (item.compliance_status === "for_completion") {
      grouped[key].forCompletion += 1;
    }

    if (item.compliance_status === "violation") {
      grouped[key].violators += 1;
    }

    if (item.compliance_status === "no_permit") {
      grouped[key].noPermit += 1;
    }
  });

  return Object.values(grouped);
}

function getBarHeight(value, maxTotal) {
  if (!value) return 0;
  return Math.max(18, Math.round((value / maxTotal) * 210));
}

function buildPermitPieGradient(sp, large) {
  const total = sp + large;

  if (!total) {
    return "conic-gradient(#36a87a 0 50%, #1f7655 50% 100%)";
  }

  const largePercent = Math.round((large / total) * 100);

  return `conic-gradient(#1f7655 0 ${largePercent}%, #36a87a ${largePercent}% 100%)`;
}

function buildProgressColumns(summary) {
  const total = summary.totalEstablishments || 0;

  if (!total) {
    return "1fr 1fr 1fr 1fr";
  }

  const good = Math.max(summary.goodStanding || 0, 0.1);
  const upcoming = Math.max(summary.upcoming || 0, 0.1);
  const completion = Math.max(summary.forCompletion || 0, 0.1);
  const violators = Math.max(summary.violators || 0, 0.1);

  return `${good}fr ${upcoming}fr ${completion}fr ${violators}fr`;
}

function shortenLabel(label = "") {
  if (label.length <= 14) return label;
  return `${label.slice(0, 12)}...`;
}

function formatFrequency(value = "") {
  if (value === "monthly") return "Monthly";
  if (value === "quarterly") return "Quarterly";
  return value || "Not Set";
}

function formatStatusName(value = "") {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function riskClass(value = "") {
  if (value.toLowerCase().includes("high")) return "high";
  if (value.toLowerCase().includes("medium")) return "medium";
  return "low";
}

export default SanitaryReportAnalytics;
