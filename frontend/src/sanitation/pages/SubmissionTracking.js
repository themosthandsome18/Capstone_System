import { useMemo, useState } from "react";
import { FiDownload, FiFileText, FiPrinter, FiSearch } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

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
  const { establishments, submissionData, loading, error } = useSanitationData();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const summary = submissionData?.summary || buildLocalSummary(establishments);

  const rows = useMemo(() => {
    const sourceRows =
      submissionData?.rows ||
      establishments.map((item) => ({
        id: item.id,
        business_name: item.business_name,
        owner_name: item.owner_name,
        business_type: item.business_type_name,
        permit_size_label: item.permit_size_label,
        barangay: item.barangay,
        date_submitted: item.permit_issued_date || "",
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
                    <strong>{row.business_name}</strong>
                    <small>{row.owner_name}</small>
                  </td>

                  <td>
                    {row.business_type}
                    {row.permit_size_label ? ` | ${row.permit_size_label}` : ""}
                  </td>

                  <td>{formatDate(row.date_submitted) || "No date"}</td>

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

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default SubmissionTracking;
