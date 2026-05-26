import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClipboard,
  FiHome,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { useSanitationData } from "../context/SanitationDataContext";

function SanitationDashboard() {
  const { dashboardData, establishments, loading, error } = useSanitationData();

  const summary = dashboardData?.summary || buildLocalSummary(establishments);
  const distribution =
    dashboardData?.distribution || buildLocalDistribution(establishments);
  const byType = dashboardData?.byType || buildLocalByType(establishments);
  const chartTypes = buildDashboardTypeChart(byType);
  const lastUpdated = dashboardData?.generatedAt
    ? formatDateTime(dashboardData.generatedAt)
    : "Waiting for live data";

  const recentActivity =
    dashboardData?.recentActivity?.length
      ? dashboardData.recentActivity
      : establishments.slice(0, 6);
  const alerts = dashboardData?.alerts || {};
  const barangaySummary = buildBarangaySummary(establishments);
  const actionSummary = buildDashboardActionSummary(
    summary,
    alerts,
    barangaySummary
  );

  const maxTypeTotal = Math.max(...chartTypes.map((item) => item.total || 0), 1);

  if (loading) {
    return (
      <div className="sanitation-dashboard">
        Loading sanitation dashboard...
      </div>
    );
  }

  return (
    <div className="sanitation-dashboard">
      <div className="sanitation-dashboard-header">
        <div>
          <h1>Sanitary Monitoring Command Center</h1>
          <p>Real-time overview of sanitation compliance across Mauban, Quezon</p>
        </div>
        <span className="sanitation-dashboard-updated">
          Last updated: {lastUpdated}
        </span>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="sanitation-stat-grid">
        <StatCard
          title="Total Establishments"
          value={summary.totalEstablishments || 0}
          note={`${summary.noPermit || 0} without permit`}
          icon={<FiHome />}
        />

        <StatCard
          title="Good Standing"
          value={summary.goodStanding || 0}
          note={`${summary.complianceRate || 0}% compliant`}
          icon={<FiClipboard />}
        />

        <StatCard
          title="For Completion"
          value={summary.forCompletion || 0}
          note="Pending requirements"
          icon={<FiCheckCircle />}
        />

        <StatCard
          title="Violators"
          value={summary.violators || 0}
          note="Action needed"
          icon={<FiAlertTriangle />}
        />
      </div>

      <div className="dashboard-action-strip">
        {actionSummary.map((item) => (
          <section className={`dashboard-action-card ${item.tone}`} key={item.label}>
            <span className="dashboard-action-icon">{item.icon}</span>
            <div>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </div>
          </section>
        ))}
      </div>

      <section className="dashboard-barangay-card">
        <div className="dashboard-barangay-header">
          <div>
            <h3>Barangay Priority Watch</h3>
            <p>Areas with permit, compliance, or inspection follow-up signals</p>
          </div>
          <Link to="/sanitation/establishments">Open records</Link>
        </div>

        <div className="dashboard-barangay-list">
          {barangaySummary.length ? (
            barangaySummary.map((item, index) => (
              <div className="dashboard-barangay-row" key={item.barangay}>
                <div className="dashboard-barangay-name">
                  <strong>
                    {index + 1}. {item.barangay}
                  </strong>
                  <span>
                    {item.total} registered | {item.goodStanding} good standing
                  </span>
                </div>

                <div className="dashboard-barangay-metrics">
                  {item.violators ? (
                    <span className="danger">{item.violators} violation</span>
                  ) : null}
                  {item.forCompletion ? (
                    <span className="warning">
                      {item.forCompletion} for completion
                    </span>
                  ) : null}
                  {item.noPermit ? (
                    <span className="neutral">{item.noPermit} no permit</span>
                  ) : null}
                  {!item.riskScore ? <span className="good">clear</span> : null}
                </div>

                <div className="dashboard-risk-bar" aria-label="Barangay risk score">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(6, item.riskScore))}%`,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="dashboard-barangay-empty">
              No barangay records available yet.
            </p>
          )}
        </div>
      </section>

      <div className="sanitation-dashboard-grid">
        <section className="sanitation-card">
          <div className="sanitation-card-title">
            <h3>Compliance Distribution</h3>
          </div>

          <div className="compliance-donut-wrap">
            <div
              className="compliance-donut"
              style={{
                background: buildComplianceGradient(distribution),
              }}
            />
          </div>

          <div className="compliance-legend">
            <span className="completion">
              For Completion ({distribution.forCompletion || 0})
            </span>
            <span className="good">
              Good Standing ({distribution.goodStanding || 0})
            </span>
            <span className="upcoming">
              Upcoming ({distribution.upcoming || 0})
            </span>
            <span className="violation">
              Violation ({distribution.violation || 0})
            </span>
          </div>
        </section>

        <section className="sanitation-card">
          <div className="sanitation-card-title">
            <h3>Establishment Types</h3>
          </div>

          <div className="establishment-bar-chart">
            {chartTypes.length ? (
              chartTypes.map((item) => (
                <Bar
                  key={item.id || item.name}
                  label={shortenTypeLabel(item.name)}
                  sp={item.sp || 0}
                  large={item.large || 0}
                  maxTotal={maxTypeTotal}
                />
              ))
            ) : (
              <p className="sanitation-empty-chart">
                No establishment data found.
              </p>
            )}
          </div>

          <div className="establishment-chart-legend">
            <span className="large">Large</span>
            <span className="sp">SP</span>
          </div>
        </section>
      </div>

      <div className="sanitation-alert-grid">
        <AlertPanel
          title="Renewal Alerts"
          link="/sanitation/renewals"
          items={(alerts.renewals || []).map((item) => ({
            id: item.id,
            title: item.establishment_name,
            meta: `${item.stage_label} | expires ${item.expiration_date}`,
            tone: item.stage === "lapsed" ? "danger" : "warning",
          }))}
          empty="No urgent renewal alerts."
        />

        <AlertPanel
          title="Complaint Follow-ups"
          link="/sanitation/complaints"
          items={(alerts.complaints || []).map((item) => ({
            id: item.id,
            title: item.establishment_name || item.barangay,
            meta: `${item.category} | ${item.status_label}`,
            tone: item.priority === "high" ? "danger" : "warning",
          }))}
          empty="No open complaints."
        />

        <AlertPanel
          title="Inspection Schedule"
          link="/sanitation/inspections"
          items={(alerts.upcomingInspections || []).map((item) => ({
            id: item.id,
            title: item.establishment_name,
            meta: `${item.inspector_name} | due ${item.next_due_date}`,
            tone: "good",
          }))}
          empty="No upcoming inspection schedule."
        />
      </div>

      <section className="recent-activity-card">
        <div className="recent-activity-header">
          <h3>Recent Activity</h3>
          <Link to="/sanitation/establishments">View all</Link>
        </div>

        {recentActivity.length ? (
          recentActivity.map((item) => (
            <RecentActivity
              key={item.id}
              initials={getInitials(item.business_name)}
              name={item.business_name}
              detail={`${item.business_type_name} | ${item.permit_size_label} | ${item.barangay}`}
              status={item.compliance_status_label}
              type={activityType(item.compliance_status_label)}
            />
          ))
        ) : (
          <div className="recent-activity-row">
            <div className="recent-activity-left">
              <div className="activity-avatar">--</div>
              <div className="activity-text">
                <h4>No recent activity</h4>
                <p>No establishment records found.</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value, note, icon }) {
  return (
    <div className="sanitation-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
        <span>{note}</span>
      </div>

      <div className="sanitation-stat-icon">{icon}</div>
    </div>
  );
}

function Bar({ label, sp, large, maxTotal }) {
  const total = sp + large;

  const totalHeight = total
    ? Math.max(24, Math.round((total / maxTotal) * 170))
    : 0;

  const spHeight = total ? Math.round((sp / total) * totalHeight) : 0;
  const largeHeight = total ? Math.round((large / total) * totalHeight) : 0;

  return (
    <div className="establishment-bar-item">
      <div className="establishment-bar-stack">
        {sp > 0 ? (
          <span className="sp" style={{ height: `${spHeight}px` }} />
        ) : null}

        {large > 0 ? (
          <span className="large" style={{ height: `${largeHeight}px` }} />
        ) : null}
      </div>

      <small>{label}</small>
    </div>
  );
}

function RecentActivity({ initials, name, detail, status, type }) {
  return (
    <div className="recent-activity-row">
      <div className="recent-activity-left">
        <div className="activity-avatar">{initials}</div>

        <div className="activity-text">
          <h4>{name}</h4>
          <p>{detail}</p>
        </div>
      </div>

      <span className={`activity-status ${type}`}>{status}</span>
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
      (item) =>
        item.compliance_status === "no_permit" ||
        item.permit_status === "no_permit" ||
        item.has_permit === false
    ).length,
    complianceRate: total ? Math.round((goodStanding / total) * 100) : 0,
  };
}

function buildBarangaySummary(establishments) {
  const grouped = {};

  establishments.forEach((item) => {
    const barangay = item.barangay || "Unspecified";

    if (!grouped[barangay]) {
      grouped[barangay] = {
        barangay,
        total: 0,
        goodStanding: 0,
        upcoming: 0,
        forCompletion: 0,
        violators: 0,
        noPermit: 0,
        riskScore: 0,
      };
    }

    const row = grouped[barangay];
    row.total += 1;

    if (item.compliance_status === "good_standing") {
      row.goodStanding += 1;
    }

    if (item.compliance_status === "upcoming") {
      row.upcoming += 1;
      row.riskScore += 8;
    }

    if (item.compliance_status === "for_completion") {
      row.forCompletion += 1;
      row.riskScore += 20;
    }

    if (item.compliance_status === "violation") {
      row.violators += 1;
      row.riskScore += 35;
    }

    if (
      item.compliance_status === "no_permit" ||
      item.permit_status === "no_permit" ||
      item.has_permit === false
    ) {
      row.noPermit += 1;
      row.riskScore += 25;
    }

    if (item.permit_status === "suspended") {
      row.riskScore += 30;
    }
  });

  return Object.values(grouped)
    .sort(
      (a, b) =>
        b.riskScore - a.riskScore ||
        b.violators - a.violators ||
        b.total - a.total ||
        a.barangay.localeCompare(b.barangay)
    )
    .slice(0, 6);
}

function buildDashboardActionSummary(summary, alerts, barangaySummary) {
  const topBarangay = barangaySummary[0];
  const renewalCount = alerts.renewals?.length || 0;
  const complaintCount = alerts.complaints?.length || 0;
  const inspectionCount = alerts.upcomingInspections?.length || 0;

  return [
    {
      label: "Immediate Action",
      value: (summary.violators || 0) + (summary.forCompletion || 0),
      note: "Violations and incomplete requirements",
      tone: "danger",
      icon: <FiAlertTriangle />,
    },
    {
      label: "Permit Follow-up",
      value: (summary.noPermit || 0) + renewalCount,
      note: "No permit or renewal alerts",
      tone: "warning",
      icon: <FiClipboard />,
    },
    {
      label: "Inspection Queue",
      value: inspectionCount,
      note: "Upcoming or scheduled inspections",
      tone: "good",
      icon: <FiCheckCircle />,
    },
    {
      label: "Top Barangay",
      value: topBarangay?.barangay || "None",
      note: topBarangay
        ? `${topBarangay.riskScore} risk score | ${complaintCount} complaint alerts`
        : "No risk hotspot",
      tone: "neutral",
      icon: <FiHome />,
    },
  ];
}

function buildLocalDistribution(establishments) {
  return {
    goodStanding: establishments.filter(
      (item) => item.compliance_status === "good_standing"
    ).length,
    upcoming: establishments.filter(
      (item) => item.compliance_status === "upcoming"
    ).length,
    forCompletion: establishments.filter(
      (item) => item.compliance_status === "for_completion"
    ).length,
    violation: establishments.filter(
      (item) => item.compliance_status === "violation"
    ).length,
    noPermit: establishments.filter(
      (item) => item.compliance_status === "no_permit"
    ).length,
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
        total: 0,
        sp: 0,
        large: 0,
      };
    }

    grouped[key].total += 1;

    if (item.permit_size === "sp") {
      grouped[key].sp += 1;
    }

    if (item.permit_size === "large") {
      grouped[key].large += 1;
    }
  });

  return Object.values(grouped);
}

function AlertPanel({ title, link, items, empty }) {
  return (
    <section className="sanitation-alert-panel">
      <div className="sanitation-alert-title">
        <h3>{title}</h3>
        <Link to={link}>View all</Link>
      </div>

      {items.length ? (
        items.slice(0, 4).map((item) => (
          <div className={`sanitation-alert-row ${item.tone}`} key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.meta}</span>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function buildDashboardTypeChart(types) {
  const sorted = [...types].sort((a, b) => (b.total || 0) - (a.total || 0));
  const visible = sorted.slice(0, 8);
  const remaining = sorted.slice(8);

  if (!remaining.length) {
    return visible;
  }

  const others = remaining.reduce(
    (summary, item) => ({
      ...summary,
      total: summary.total + (item.total || 0),
      sp: summary.sp + (item.sp || 0),
      large: summary.large + (item.large || 0),
    }),
    {
      id: "others",
      name: "Others",
      total: 0,
      sp: 0,
      large: 0,
    }
  );

  return [...visible, others];
}

function buildComplianceGradient(distribution) {
  const good = distribution.goodStanding || 0;
  const violation = distribution.violation || 0;
  const completion = distribution.forCompletion || 0;
  const upcoming = distribution.upcoming || 0;
  const noPermit = distribution.noPermit || 0;

  const total = good + violation + completion + upcoming + noPermit;

  if (!total) {
    return "conic-gradient(#d1d5db 0 100%)";
  }

  const goodEnd = (good / total) * 100;
  const violationEnd = goodEnd + (violation / total) * 100;
  const completionEnd = violationEnd + (completion / total) * 100;
  const upcomingEnd = completionEnd + (upcoming / total) * 100;

  return `conic-gradient(
    #20a957 0 ${goodEnd}%,
    #ef2222 ${goodEnd}% ${violationEnd}%,
    #ff8b21 ${violationEnd}% ${completionEnd}%,
    #f7c318 ${completionEnd}% ${upcomingEnd}%,
    #6b7280 ${upcomingEnd}% 100%
  )`;
}

function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function activityType(status = "") {
  const normalized = status.toLowerCase();

  if (normalized.includes("good")) return "good";
  if (normalized.includes("violation")) return "violation";
  if (normalized.includes("upcoming")) return "upcoming";
  if (normalized.includes("completion")) return "completion";
  if (normalized.includes("permit")) return "violation";

  return "upcoming";
}

function formatDateTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortenTypeLabel(label = "") {
  if (label.includes("Water")) return "Water";
  if (label.includes("Poultry")) return "Poultry";
  if (label.includes("Gasoline")) return "Gasoline";
  if (label.includes("Restaurant")) return "Restaurant";
  if (label.includes("Barbershop")) return "Barber";
  if (label.includes("Public")) return "Public";
  if (label.includes("Motor")) return "Motor";

  return label.length > 10 ? `${label.slice(0, 9)}...` : label;
}

export default SanitationDashboard;
