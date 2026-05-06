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

  const recentActivity =
    dashboardData?.recentActivity?.length
      ? dashboardData.recentActivity
      : establishments.slice(0, 6);

  const maxTypeTotal = Math.max(...byType.map((item) => item.total || 0), 1);

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
        <h1>Sanitary Monitoring Command Center</h1>
        <p>Real-time overview of sanitation compliance across Mauban, Quezon</p>
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
              ■ For Completion ({distribution.forCompletion || 0})
            </span>
            <span className="good">
              ■ Good Standing ({distribution.goodStanding || 0})
            </span>
            <span className="upcoming">
              ■ Upcoming ({distribution.upcoming || 0})
            </span>
            <span className="violation">
              ■ Violation ({distribution.violation || 0})
            </span>
          </div>
        </section>

        <section className="sanitation-card">
          <div className="sanitation-card-title">
            <h3>Establishment Types</h3>
          </div>

          <div className="establishment-bar-chart">
            {byType.length ? (
              byType.map((item) => (
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
            <span className="large">■ Large</span>
            <span className="sp">■ SP</span>
          </div>
        </section>
      </div>

      <section className="recent-activity-card">
        <div className="recent-activity-header">
          <h3>Recent Activity</h3>
          <Link to="/sanitation/establishments">View all →</Link>
        </div>

        {recentActivity.length ? (
          recentActivity.map((item) => (
            <RecentActivity
              key={item.id}
              initials={getInitials(item.business_name)}
              name={item.business_name}
              detail={`${item.business_type_name} • ${item.permit_size_label} • ${item.barangay}`}
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

      <span className={`activity-status ${type}`}>● {status}</span>
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