import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiCheckCircle,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiPrinter,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";
import { getEstablishmentRequirements } from "./PermitRenewal";

const statusCards = [
  {
    label: "All Submissions",
    filterValue: "all",
    countKey: "all",
    color: "blue",
  },
  {
    label: "Good Standing",
    filterValue: "good_standing",
    countKey: "goodStanding",
    color: "green",
  },
  {
    label: "For Completion",
    filterValue: "for_completion",
    countKey: "forCompletion",
    color: "orange",
  },
  {
    label: "Upcoming",
    filterValue: "upcoming",
    countKey: "upcoming",
    color: "yellow",
  },
  {
    label: "Violators",
    filterValue: "violation",
    countKey: "violators",
    color: "red",
  },
  {
    label: "No Permit",
    filterValue: "no_permit",
    countKey: "noPermit",
    color: "gray",
  },
];

function SubmissionTracking() {
  const navigate = useNavigate();
  const { establishments, businessTypes, submissionData, loading, error } =
    useSanitationData();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedEstablishment, setSelectedEstablishment] = useState(null);

  const summary = submissionData?.summary || buildLocalSummary(establishments);

  const rows = useMemo(() => {
    const sourceRows =
      submissionData?.rows ||
      establishments.map((item) => ({
        id: item.id,
        business_name: item.business_name,
        owner_name: item.owner_name,
        business_type: item.business_type_name,
        business_type_id: item.business_type,
        permit_size: item.permit_size,
        permit_size_label: item.permit_size_label,
        barangay: item.barangay,
        address: item.address,
        contact_number: item.contact_number,
        permit_number: item.permit_number,
        date_submitted:
          item.date_submitted ||
          item.permit_issued_date ||
          item.created_at ||
          "",
        compliance_status: item.compliance_status,
        compliance_status_label: item.compliance_status_label,
        permit_status_label: item.permit_status_label,
      }));

    const keyword = search.toLowerCase().trim();

    return sourceRows.filter((item) => {
      const searchText = [
        item.id,
        item.business_name,
        item.owner_name,
        item.business_type,
        item.permit_size_label,
        item.barangay,
        item.compliance_status_label,
        item.permit_status_label,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchText.includes(keyword);
      const matchesFilter =
        filter === "all" || item.compliance_status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [submissionData, establishments, search, filter]);

  const activeCard =
    statusCards.find((item) => item.filterValue === filter)?.label ||
    "All Submissions";

  function handlePrint() {
    window.print();
  }

  function handleExport() {
    const headers = [
      "ID",
      "Business Name",
      "Owner",
      "Type",
      "Permit Size",
      "Barangay",
      "Date Submitted",
      "Compliance Status",
      "Permit Status",
    ];

    const csvRows = rows.map((row) => [
      `E-${String(row.id).padStart(3, "0")}`,
      row.business_name,
      row.owner_name,
      row.business_type,
      row.permit_size_label,
      row.barangay,
      row.date_submitted,
      row.compliance_status_label,
      row.permit_status_label,
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
    link.download = "sanitary-submission-tracking.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="submission-page">Loading submission records...</div>;
  }

  return (
    <div className="submission-page">
      <div className="submission-header">
        <div>
          <h1>Sanitary Submission Tracking</h1>
          <p>Track document requirement submissions per establishment</p>
        </div>

        <div className="submission-actions">
          <button type="button" className="btn-light" onClick={handlePrint}>
            <FiPrinter />
            Print
          </button>

          <button type="button" className="btn-primary" onClick={handleExport}>
            <FiDownload />
            Generate Report
          </button>
        </div>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="submission-kpi-grid">
        {statusCards.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            className={`kpi-card ${kpi.color} ${
              activeCard === kpi.label ? "active" : ""
            }`}
            onClick={() => setFilter(kpi.filterValue)}
          >
            <div>
              <p>{kpi.label}</p>
              <h2>{summary[kpi.countKey] || 0}</h2>
            </div>

            <FiFileText />
          </button>
        ))}
      </div>

      <section className="submission-table-card">
        <div className="table-top">
          <h3>
            {activeCard} <span>| {rows.length} record(s)</span>
          </h3>

          <div className="table-tools">
            <div className="search-box">
              <FiSearch />
              <input
                type="text"
                placeholder="Search by name, owner, type..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {statusCards.map((item) => (
                <option key={item.filterValue} value={item.filterValue}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Business Name</th>
              <th>Type</th>
              <th>Date Submitted</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>E-{String(row.id).padStart(3, "0")}</td>

                  <td>
                    <button
                      type="button"
                      className="submission-est-btn"
                      onClick={() => setSelectedEstablishment(row)}
                      title="Click to view establishment submission profile"
                    >
                      <strong>{row.business_name}</strong>
                      <small>{row.owner_name}</small>
                    </button>
                  </td>

                  <td>
                    {row.business_type}
                    {row.permit_size_label ? ` | ${row.permit_size_label}` : ""}
                  </td>

                  <td>{formatSubmittedDate(row.date_submitted)}</td>

                  <td>
                    <span
                      className={`status ${statusClass(
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
                <td colSpan="5" className="submission-empty">
                  No submission records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selectedEstablishment ? (
        <SubmissionDetailModal
          establishment={selectedEstablishment}
          allEstablishments={establishments}
          businessTypes={businessTypes}
          onClose={() => setSelectedEstablishment(null)}
          onNavigate={(path) => {
            setSelectedEstablishment(null);
            navigate(path);
          }}
        />
      ) : null}
    </div>
  );
}

function buildLocalSummary(establishments) {
  return {
    all: establishments.length,
    goodStanding: establishments.filter(
      (item) => item.compliance_status === "good_standing"
    ).length,
    forCompletion: establishments.filter(
      (item) => item.compliance_status === "for_completion"
    ).length,
    upcoming: establishments.filter(
      (item) => item.compliance_status === "upcoming"
    ).length,
    violators: establishments.filter(
      (item) => item.compliance_status === "violation"
    ).length,
    noPermit: establishments.filter(
      (item) => item.compliance_status === "no_permit"
    ).length,
  };
}

function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function formatSubmittedDate(value) {
  if (!value) {
    return <span className="submission-date-pending">Pending Application</span>;
  }
  try {
    const raw = String(value);
    const dateObj = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
    if (isNaN(dateObj.getTime())) {
      return <span className="submission-date-pending">Pending Application</span>;
    }
    return (
      <span className="submission-date-badge">
        <FiCalendar />
        {dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })}
      </span>
    );
  } catch {
    return <span className="submission-date-pending">Pending Application</span>;
  }
}

function formatSubmittedDateText(value) {
  if (!value) return "Pending Application";
  try {
    const raw = String(value);
    const d = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
    if (isNaN(d.getTime())) return "Pending Application";
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Pending Application";
  }
}

function SubmissionDetailModal({
  establishment,
  allEstablishments = [],
  businessTypes = [],
  onClose,
  onNavigate,
}) {
  if (!establishment) return null;

  const fullEst =
    allEstablishments.find((e) => String(e.id) === String(establishment.id)) ||
    establishment;

  const requirements = getEstablishmentRequirements(
    fullEst,
    allEstablishments,
    businessTypes
  );

  return (
    <div className="renewal-modal-backdrop" onClick={onClose}>
      <div
        className="renewal-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="renewal-detail-title">
          <div>
            <h2>{establishment.business_name}</h2>
            <p>
              ID: E-{String(establishment.id).padStart(3, "0")} •{" "}
              {establishment.business_type}{" "}
              {establishment.permit_size_label
                ? `(${establishment.permit_size_label})`
                : ""}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="renewal-detail-info" style={{ marginTop: "16px" }}>
          <div>
            <span>Business Name</span>
            <strong>{establishment.business_name}</strong>
          </div>
          <div>
            <span>Owner</span>
            <strong>{establishment.owner_name}</strong>
          </div>
          <div>
            <span>Barangay &amp; Address</span>
            <strong>
              Brgy. {establishment.barangay}
              {fullEst.address ? `, ${fullEst.address}` : ""}
            </strong>
          </div>
          <div>
            <span>Contact Number</span>
            <strong>{fullEst.contact_number || "Not provided"}</strong>
          </div>
          <div>
            <span>Permit Status</span>
            <strong>{establishment.permit_status_label || "No Permit"}</strong>
          </div>
          <div>
            <span>Compliance Status</span>
            <strong style={{ textTransform: "capitalize" }}>
              {establishment.compliance_status_label ||
                establishment.compliance_status}
            </strong>
          </div>
          <div>
            <span>Date Submitted / Issued</span>
            <strong>
              {formatSubmittedDateText(establishment.date_submitted)}
            </strong>
          </div>
          <div>
            <span>Permit Number</span>
            <strong>{fullEst.permit_number || "None / Pending"}</strong>
          </div>
        </div>

        <div className="renewal-req-header-row" style={{ marginTop: "20px" }}>
          <h3>📋 Required Submissions &amp; Clearances</h3>
          <span className="renewal-req-progress-badge">
            {requirements.length} Requirement(s) for this Type
          </span>
        </div>

        <div className="renewal-detail-requirements">
          {requirements.map((req) => (
            <div key={req} className="renewal-req-item complied">
              <div className="renewal-req-item-left">
                <FiCheckCircle
                  style={{
                    color: "#16a34a",
                    fontSize: "16px",
                    flexShrink: 0,
                  }}
                />
                <span className="renewal-req-name">{req}</span>
              </div>
              <span className="renewal-req-status-pill submitted">
                Required
              </span>
            </div>
          ))}
        </div>

        <div className="renewal-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="renewal-cancel" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-light"
            style={{ fontSize: "13px", height: "38px" }}
            onClick={() => onNavigate("/sanitation/establishments")}
          >
            <FiExternalLink /> Open in Establishments
          </button>
          <button
            type="button"
            className="renewal-advance-btn"
            style={{ fontSize: "13px", height: "38px" }}
            onClick={() => onNavigate("/sanitation/permit-renewal")}
          >
            <FiExternalLink /> View Permit Renewal
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmissionTracking;
