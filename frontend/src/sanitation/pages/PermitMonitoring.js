import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiAlertOctagon,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiSearch,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

const permitStatusOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "renewal_due", label: "Renewal Due" },
  { value: "conditional", label: "Conditional" },
  { value: "suspended", label: "Suspended" },
  { value: "no_permit", label: "No Permit" },
];

const SEVERITY_CONFIG = {
  suspended: {
    rank: 1,
    level: "critical",
    badgeLabel: "Critical • Suspended",
    desc: "Major sanitary violation or official MHO closure order.",
  },
  no_permit: {
    rank: 2,
    level: "high",
    badgeLabel: "Urgent • No Permit",
    desc: "Operating without permit. Subject to immediate sanitary inspection.",
  },
  conditional: {
    rank: 3,
    level: "medium",
    badgeLabel: "Moderate • Conditional",
    desc: "Permit issued with pending sanitary requirements to complete.",
  },
  renewal_due: {
    rank: 4,
    level: "low",
    badgeLabel: "Notice • Renewal Due",
    desc: "Permit expiring soon within standard 30-day period.",
  },
};

function PermitMonitoring() {
  const navigate = useNavigate();
  const { establishments, inspections, permitData, loading, error } =
    useSanitationData();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");

  const rows = useMemo(() => {
    return establishments.map((establishment) => {
      const relatedInspections = inspections
        .filter((inspection) => inspection.establishment === establishment.id)
        .sort(
          (a, b) =>
            new Date(b.inspection_date || 0) - new Date(a.inspection_date || 0)
        );

      const latestInspection = relatedInspections[0] || null;

      return {
        ...establishment,
        lastInspection: latestInspection?.inspection_date || "",
      };
    });
  }, [establishments, inspections]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.toLowerCase().trim();

    return rows.filter((row) => {
      const searchText = [
        row.business_name,
        row.owner_name,
        row.business_type_name,
        row.permit_size_label,
        row.permit_number,
        row.barangay,
        row.permit_status_label,
        row.compliance_status_label,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchText.includes(keyword);
      const matchesStatus =
        statusFilter === "all" || row.permit_status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, searchTerm, statusFilter]);

  const summary = permitData?.summary || {
    active: rows.filter((row) => row.permit_status === "active").length,
    renewalDue: rows.filter((row) => row.permit_status === "renewal_due").length,
    conditional: rows.filter((row) => row.permit_status === "conditional").length,
    suspended: rows.filter((row) => row.permit_status === "suspended").length,
    noPermit: rows.filter((row) => row.permit_status === "no_permit").length,
  };

  const allAlertRows = useMemo(() => {
    return rows
      .filter(
        (row) =>
          row.permit_status === "suspended" ||
          row.permit_status === "no_permit" ||
          row.permit_status === "conditional" ||
          row.permit_status === "renewal_due"
      )
      .sort((a, b) => {
        const rankA = SEVERITY_CONFIG[a.permit_status]?.rank ?? 99;
        const rankB = SEVERITY_CONFIG[b.permit_status]?.rank ?? 99;
        return rankA - rankB;
      });
  }, [rows]);

  const filteredAlertRows = useMemo(() => {
    if (alertFilter === "all") return allAlertRows;
    return allAlertRows.filter((r) => r.permit_status === alertFilter);
  }, [allAlertRows, alertFilter]);

  if (loading) {
    return <div className="permit-page">Loading permit records...</div>;
  }

  return (
    <div className="permit-page">
      <div className="permit-header">
        <h1>Sanitary Permit Monitoring</h1>
        <p>Track and manage sanitary permits for all registered establishments</p>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="permit-stat-grid">
        <PermitStat
          title="Active Permits"
          value={summary.active || 0}
          icon={<FiCheckCircle />}
          color="green"
        />
        <PermitStat
          title="Renewal Due"
          value={summary.renewalDue || 0}
          icon={<FiClock />}
          color="yellow"
        />
        <PermitStat
          title="Conditional"
          value={summary.conditional || 0}
          icon={<FiAlertCircle />}
          color="orange"
        />
        <PermitStat
          title="Suspended"
          value={summary.suspended || 0}
          icon={<FiAlertOctagon />}
          color="red"
        />
        <PermitStat
          title="No Permit"
          value={summary.noPermit || 0}
          icon={<FiAlertTriangle />}
          color="rose"
        />
      </div>

      <div className="permit-alert-section">
        <div className="permit-alert-section-header">
          <div>
            <h2>Permit Warnings & Action Alerts</h2>
            <p>
              Categorized by severity: Malalang kaso (Suspended &amp; No Permit) hanggang sa katamtamang babala (Conditional &amp; Renewal)
            </p>
          </div>

          <div className="permit-alert-filter-bar">
            <button
              type="button"
              className={`permit-alert-filter-btn ${
                alertFilter === "all" ? "active" : ""
              }`}
              onClick={() => setAlertFilter("all")}
            >
              All Warnings ({allAlertRows.length})
            </button>
            <button
              type="button"
              className={`permit-alert-filter-btn filter--critical ${
                alertFilter === "suspended" ? "active" : ""
              }`}
              onClick={() => setAlertFilter("suspended")}
            >
              🔴 Suspended ({summary.suspended || 0})
            </button>
            <button
              type="button"
              className={`permit-alert-filter-btn filter--high ${
                alertFilter === "no_permit" ? "active" : ""
              }`}
              onClick={() => setAlertFilter("no_permit")}
            >
              🟣 No Permit ({summary.noPermit || 0})
            </button>
            <button
              type="button"
              className={`permit-alert-filter-btn filter--medium ${
                alertFilter === "conditional" ? "active" : ""
              }`}
              onClick={() => setAlertFilter("conditional")}
            >
              🟠 Conditional ({summary.conditional || 0})
            </button>
            <button
              type="button"
              className={`permit-alert-filter-btn filter--low ${
                alertFilter === "renewal_due" ? "active" : ""
              }`}
              onClick={() => setAlertFilter("renewal_due")}
            >
              🟡 Renewal Due ({summary.renewalDue || 0})
            </button>
          </div>
        </div>

        <div className="permit-alert-grid">
          {filteredAlertRows.length ? (
            filteredAlertRows.slice(0, 6).map((row) => (
              <PermitAlert
                key={row.id}
                establishment={row}
                onClick={() =>
                  navigate(
                    "/sanitation/establishments?search=" +
                      encodeURIComponent(row.business_name)
                  )
                }
              />
            ))
          ) : (
            <div className="permit-alert-card permit-alert-good">
              <FiCheckCircle />
              <div>
                <h3>No warnings found</h3>
                <p>
                  All monitored establishments in this category are in good compliance standing.
                </p>
                <strong>Good standing</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="permit-table-card">
        <div className="permit-table-top">
          <div>
            <h2>Permit Status - Auto-generated from Inspection Results</h2>
            <p>Violations are integrated; no separate violations module needed.</p>
          </div>

          <div className="permit-tools">
            <div className="permit-search">
              <FiSearch />
              <input
                type="text"
                placeholder="Search by name, owner, type..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {permitStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="permit-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Type / Size</th>
                <th>Last Inspection</th>
                <th>Permit Status</th>
                <th>Compliance</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.id} onClick={() => navigate("/sanitation/establishments?search=" + encodeURIComponent(row.business_name))} style={{ cursor: "pointer" }}>
                    <td>
                      <strong>{row.business_name}</strong>
                      <small>{row.owner_name}</small>
                    </td>

                    <td>
                      {row.business_type_name} | {row.permit_size_label}
                    </td>

                    <td>{formatDate(row.lastInspection) || "No inspection"}</td>

                    <td>
                      <span
                        className={`permit-status ${permitClass(
                          row.permit_status_label
                        )}`}
                      >
                        {row.permit_status_label}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`permit-compliance ${complianceClass(
                          row.compliance_status_label
                        )}`}
                      >
                        {row.compliance_status_label}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="permit-empty">
                    No permit records found.
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

function PermitStat({ title, value, icon, color }) {
  return (
    <div className="permit-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>

      <div className={`permit-stat-icon ${color}`}>{icon}</div>
    </div>
  );
}

function PermitAlert({ establishment, onClick }) {
  const statusKey = establishment.permit_status || "conditional";
  const config = SEVERITY_CONFIG[statusKey] || SEVERITY_CONFIG.conditional;

  return (
    <div
      className={`permit-alert-card permit-alert--${config.level}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
      title="Click to view establishment record"
    >
      <div className={`permit-alert-icon permit-alert-icon--${config.level}`}>
        {config.level === "critical" && <FiAlertOctagon />}
        {config.level === "high" && <FiAlertTriangle />}
        {config.level === "medium" && <FiAlertCircle />}
        {config.level === "low" && <FiClock />}
      </div>

      <div className="permit-alert-content">
        <div className="permit-alert-header">
          <h3>{establishment.business_name}</h3>
          <span className={`permit-severity-tag tag--${config.level}`}>
            {config.badgeLabel}
          </span>
        </div>

        <p className="permit-alert-meta">
          {establishment.permit_number ? (
            <span>Permit #: <strong>{establishment.permit_number}</strong> • </span>
          ) : null}
          <span>{establishment.business_type_name || "Commercial"}</span>
          <span> | {establishment.permit_size_label || establishment.permit_size || "SP"}</span>
          <span> | Brgy. {establishment.barangay}</span>
        </p>

        <div className="permit-alert-footer">
          <span className={`permit-status-badge badge--${config.level}`}>
            ● {establishment.permit_status_label || establishment.permit_status}
          </span>
          <span className="permit-alert-desc-note">{config.desc}</span>
        </div>
      </div>
    </div>
  );
}

function permitClass(status = "") {
  return status
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[()]/g, "");
}

function complianceClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default PermitMonitoring;
