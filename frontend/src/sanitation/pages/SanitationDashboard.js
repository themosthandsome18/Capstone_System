import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClipboard,
  FiHome,
} from "react-icons/fi";

function SanitationDashboard() {
  return (
    <div className="sanitation-dashboard">
      <div className="sanitation-dashboard-header">
        <h1>Sanitary Monitoring Command Center</h1>
        <p>Real-time overview of sanitation compliance across Mauban Quezon</p>
      </div>

      <div className="sanitation-stat-grid">
        <StatCard title="Total Establishments" value="10" note="+3 this month" icon={<FiHome />} />
        <StatCard title="Good Standing" value="6" note="50% compliant" icon={<FiClipboard />} />
        <StatCard title="For Completion" value="2" note="Pending requirements" icon={<FiCheckCircle />} />
        <StatCard title="Violators" value="2" note="Action needed" icon={<FiAlertTriangle />} />
      </div>

      <div className="sanitation-dashboard-grid">
        <section className="sanitation-card">
          <div className="sanitation-card-title">
            <h3>Compliance Distribution</h3>
          </div>

          <div className="compliance-donut-wrap">
            <div className="compliance-donut" />
          </div>

          <div className="compliance-legend">
            <span className="completion">■ For Completion</span>
            <span className="good">■ Good Standing</span>
            <span className="upcoming">■ Upcoming</span>
            <span className="violation">■ Violation</span>
          </div>
        </section>

        <section className="sanitation-card">
          <div className="sanitation-card-title">
            <h3>Establishment Types</h3>
          </div>

          <div className="establishment-bar-chart">
            <Bar label="Water" sp={1} large={1} />
            <Bar label="Poultry" sp={1} large={1} />
            <Bar label="Gasoline" sp={0} large={2} />
            <Bar label="Restaurant" sp={2} large={1} />
            <Bar label="Barbershop" sp={2} large={0} />
            <Bar label="Public" sp={1} large={0} />
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
          <a href="/">View all →</a>
        </div>

        <RecentActivity
          initials="AQ"
          name="AquaPure Refilling"
          detail="Water Refilling Station • SP • Brgy. San Isidro"
          status="Good Standing"
          type="good"
        />

        <RecentActivity
          initials="GO"
          name="Golden Egg Poultry"
          detail="Poultry Farm • Large • Brgy. Malabanan"
          status="Violation"
          type="violation"
        />

        <RecentActivity
          initials="PE"
          name="Petron Highway"
          detail="Gasoline Station • Large • Brgy. Poblacion"
          status="Good Standing"
          type="good"
        />

        <RecentActivity
          initials="LO"
          name="Lola Nena’s Eatery"
          detail="Restaurant / Food Service • SP • Brgy. Poblacion"
          status="Upcoming"
          type="upcoming"
        />

        <RecentActivity
          initials="SU"
          name="Sunrise Bistro"
          detail="Restaurant / Food Service • Large • Brgy. San Roque"
          status="For Completion"
          type="completion"
        />
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

function Bar({ label, sp, large }) {
  return (
    <div className="establishment-bar-item">
      <div className="establishment-bar-stack">
        {sp > 0 && (
          <span
            className="sp"
            style={{ height: `${sp * 58}px` }}
          />
        )}

        {large > 0 && (
          <span
            className="large"
            style={{ height: `${large * 58}px` }}
          />
        )}
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

export default SanitationDashboard;