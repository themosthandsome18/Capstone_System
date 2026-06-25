import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiClock, FiFileText, FiSearch } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

const permitStatusOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "renewal_due", label: "Renewal Due" },
  { value: "conditional", label: "Conditional" },
  { value: "suspended", label: "Suspended" },
  { value: "no_permit", label: "No Permit" },
];

function PermitMonitoring() {
  const navigate = useNavigate();
  const { establishments, inspections, permitData, loading, error } =
    useSanitationData();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const alertRows = rows.filter(
    (row) =>
      row.permit_status === "suspended" ||
      row.permit_status === "conditional" ||
      row.permit_status === "no_permit"
  );

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
          icon={<FiFileText />}
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
          icon={<FiFileText />}
          color="orange"
        />
        <PermitStat
          title="Suspended"
          value={summary.suspended || 0}
          icon={<FiFileText />}
          color="red"
        />
      </div>

      <div className="permit-alert-grid">
        {alertRows.length ? (
          alertRows.slice(0, 4).map((row) => (
            <PermitAlert
              key={row.id}
              title={row.business_name}
              desc={`${row.business_type_name} | ${row.permit_size_label}`}
              permitNumber={row.permit_number}
              status={row.permit_status_label}
              onClick={() => navigate("/sanitation/establishments?search=" + encodeURIComponent(row.business_name))}
            />
          ))
        ) : (
          <div className="permit-alert-card permit-alert-good">
            <FiFileText />
            <div>
              <h3>No critical permit alerts</h3>
              <p>All monitored permits are currently in acceptable condition.</p>
              <strong>Good standing</strong>
            </div>
          </div>
        )}
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

function PermitAlert({ title, desc, status, permitNumber, onClick }) {
  return (
    <div className="permit-alert-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <FiAlertTriangle />

      <div>
        <h3>{title}</h3>
        <p>{permitNumber ? `Permit #: ${permitNumber} | ` : ""}{desc}</p>
        <strong>{status}</strong>
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
