import { useMemo, useState } from "react";
import {
  FiBell,
  FiCalendar,
  FiCamera,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiDownload,
  FiPrinter,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useSanitationData } from "../context/SanitationDataContext";

const statusOptions = [
  { value: "good_standing", label: "Good Standing" },
  { value: "upcoming", label: "Upcoming" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
];

function InspectionManagement() {
  const {
    establishments,
    inspections,
    businessTypes,
    loading,
    error,
    createInspection,
  } = useSanitationData();

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [selectedEstablishment, setSelectedEstablishment] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const rows = useMemo(() => {
    return establishments.map((establishment) => {
      const relatedInspections = inspections
        .filter((inspection) => inspection.establishment === establishment.id)
        .sort(
          (a, b) =>
            new Date(b.inspection_date || 0) - new Date(a.inspection_date || 0)
        );

      const latestInspection = relatedInspections[0] || null;
      const nextDueDate = latestInspection?.next_due_date || "";
      const lastInspectionDate = latestInspection?.inspection_date || "";

      return {
        ...establishment,
        latestInspection,
        lastInspectionDate,
        nextDueDate,
        dueText: getDueText(nextDueDate),
      };
    });
  }, [establishments, inspections]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.toLowerCase().trim();

    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        row.business_name?.toLowerCase().includes(keyword) ||
        row.address?.toLowerCase().includes(keyword) ||
        row.barangay?.toLowerCase().includes(keyword) ||
        row.business_type_name?.toLowerCase().includes(keyword) ||
        row.compliance_status_label?.toLowerCase().includes(keyword)
      );
    });
  }, [rows, searchTerm]);

  const dueWithinSevenDays = rows.filter((row) => {
    if (!row.nextDueDate) return false;

    const diff = getDayDifference(row.nextDueDate);
    return diff >= 0 && diff <= 7;
  }).length;

  const overdueCount = rows.filter((row) => {
    if (!row.nextDueDate) return false;
    return getDayDifference(row.nextDueDate) < 0;
  }).length;

  const calendarCells = useMemo(() => {
    return buildCalendarCells(rows);
  }, [rows]);

  function openForm(row) {
    setSelectedEstablishment(row);
    setShowForm(true);
  }

  function handleExport() {
    const headers = [
      "Establishment",
      "Business Type",
      "Barangay",
      "Address",
      "Inspection Frequency",
      "Last Inspection",
      "Next Due",
      "Due Status",
      "Compliance Status",
      "Latest Inspector",
      "Latest Findings",
      "Latest Remarks",
    ];
    const exportRows = filteredRows.map((row) => [
      row.business_name,
      row.business_type_name,
      row.barangay,
      row.address,
      formatFrequency(row.inspection_frequency),
      row.lastInspectionDate,
      row.nextDueDate,
      row.dueText,
      row.compliance_status_label,
      row.latestInspection?.inspector_name || "",
      row.latestInspection?.findings || "",
      row.latestInspection?.remarks || "",
    ]);

    exportCsv(datedCsvFilename("sanitary-inspections"), headers, exportRows);
  }

  function printInspectionReport(row) {
    const report = [
      "SANITARY INSPECTION REPORT",
      "",
      `Establishment: ${row.business_name}`,
      `Business Type: ${row.business_type_name}`,
      `Barangay: ${row.barangay}`,
      `Compliance Status: ${row.compliance_status_label}`,
      `Last Inspection: ${formatDate(row.lastInspectionDate) || "No record"}`,
      `Next Due: ${formatDate(row.nextDueDate) || "Not set"}`,
      `Inspector: ${row.latestInspection?.inspector_name || "Not assigned"}`,
      "",
      "Findings:",
      row.latestInspection?.findings || "No findings recorded.",
      "",
      "Remarks:",
      row.latestInspection?.remarks || "No remarks recorded.",
    ].join("\n");

    const printWindow = window.open("", "_blank", "width=720,height=820");
    printWindow.document.write(`<pre style="font:14px Arial;white-space:pre-wrap;line-height:1.6">${report}</pre>`);
    printWindow.document.close();
    printWindow.print();
  }

  if (loading) {
    return <div className="inspection-page">Loading inspection records...</div>;
  }

  return (
    <div className="inspection-page">
      <div className="inspection-header sanitation-split-header">
        <div>
          <h1>Inspection Management</h1>
          <p>Track and manage sanitary inspections</p>
        </div>

        <button
          type="button"
          className="sanitation-export-btn"
          onClick={handleExport}
        >
          <FiDownload /> Export CSV
        </button>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="inspection-alert">
        <FiBell />
        <div>
          <h3>Inspection Alerts</h3>
          <p>
            <span>{dueWithinSevenDays}</span> establishment(s) due within 7 days
            • <strong>{overdueCount}</strong> overdue
          </p>
        </div>
      </div>

      <div className="inspection-view-row">
        <div className="inspection-view-toggle">
          <button
            type="button"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            List View
          </button>

          <button
            type="button"
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            Calendar View
          </button>
        </div>

        <div className="inspection-legend">
          <span className="good">● Good Standing</span>
          <span className="upcoming">● Upcoming</span>
          <span className="completion">● For Completion</span>
          <span className="violation">● Violation</span>
        </div>
      </div>

      {view === "list" ? (
        <section className="inspection-table-card">
          <div className="inspection-table-tools">
            <div className="inspection-search">
              <FiSearch />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div className="inspection-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Establishment</th>
                  <th>Type</th>
                  <th>Last Inspection</th>
                  <th>Next Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length ? (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.business_name}</strong>
                        <small>{row.barangay || row.address}</small>
                      </td>

                      <td>
                        {row.business_type_name} (
                        {formatFrequency(row.inspection_frequency)})
                      </td>

                      <td>{formatDate(row.lastInspectionDate) || "No record"}</td>

                      <td>
                        <strong>{formatDate(row.nextDueDate) || "Not set"}</strong>
                        <small
                          className={
                            row.dueText.includes("overdue") ? "overdue" : ""
                          }
                        >
                          {row.dueText}
                        </small>
                      </td>

                      <td>
                        <span
                          className={`inspection-status ${statusClass(
                            row.compliance_status_label
                          )}`}
                        >
                          ● {row.compliance_status_label}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="conduct-btn secondary"
                          onClick={() => printInspectionReport(row)}
                        >
                          <FiPrinter />
                          Print
                        </button>
                        <button
                          type="button"
                          className="conduct-btn"
                          onClick={() => openForm(row)}
                        >
                          <FiClipboard />
                          Conduct
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="inspection-empty">
                      No inspection records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="inspection-pagination">
            <p>
              Showing {filteredRows.length} of {rows.length}
            </p>

            <div>
              <button type="button">
                <FiChevronLeft />
              </button>

              <button type="button">
                <FiChevronRight />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="inspection-calendar-card">
          <h3>
            <FiCalendar />
            Upcoming Inspections - Next 4 Weeks
          </h3>

          <div className="calendar-weekdays">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="inspection-calendar-grid">
            {calendarCells.map((cell, index) => (
              <div key={`${cell.day}-${index}`} className="calendar-cell">
                <span>{cell.day}</span>

                {cell.events.map((event, eventIndex) => (
                  <div
                    key={`${event.title}-${eventIndex}`}
                    className={`calendar-event ${event.status}`}
                  >
                    {event.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {showForm && selectedEstablishment ? (
        <InspectionFormModal
          establishment={selectedEstablishment}
          businessTypes={businessTypes}
          createInspection={createInspection}
          onClose={() => setShowForm(false)}
        />
      ) : null}
    </div>
  );
}

function InspectionFormModal({
  establishment,
  businessTypes,
  createInspection,
  onClose,
}) {
  const selectedType = businessTypes.find(
    (type) => String(type.id) === String(establishment.business_type)
  );

  const defaultRequirements = (selectedType?.requirements || []).filter(
    (requirement) => requirement.permit_size === establishment.permit_size
  );

  const [inspectorName, setInspectorName] = useState("Insp. J. Cruz");
  const [inspectionDate, setInspectionDate] = useState(getTodayDate());
  const [nextDueDate, setNextDueDate] = useState(
    getSuggestedNextDueDate(
      getTodayDate(),
      establishment.inspection_frequency || "monthly"
    )
  );
  const [findings, setFindings] = useState("");
  const [remarks, setRemarks] = useState("");
  const [statusAfterInspection, setStatusAfterInspection] =
    useState("good_standing");
  const [checks, setChecks] = useState(() =>
    defaultRequirements.map((requirement) => ({
      requirement_name: requirement.requirement_name,
      is_complied: true,
      notes: "",
    }))
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const completedCount = checks.filter((item) => item.is_complied).length;
  const totalCount = checks.length || 1;
  const percentage = Math.round((completedCount / totalCount) * 100);

  function handleCheck(index) {
    setChecks((current) => {
      const updated = current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, is_complied: !item.is_complied }
          : item
      );

      const hasMissing = updated.some((item) => !item.is_complied);

      if (hasMissing) {
        setStatusAfterInspection("for_completion");
      } else {
        setStatusAfterInspection("good_standing");
      }

      return updated;
    });
  }

  function getErrorMessage(requestError) {
    if (requestError?.details?.detail) {
      return requestError.details.detail;
    }

    if (requestError?.details && typeof requestError.details === "object") {
      return Object.entries(requestError.details)
        .map(([field, messages]) => {
          const text = Array.isArray(messages) ? messages.join(" ") : messages;
          return `${field}: ${text}`;
        })
        .join(" ");
    }

    return requestError?.message || "Unable to submit inspection.";
  }

  async function handleSubmit(isDraft = false) {
    if (!inspectorName.trim()) {
      setFormError("Inspector name is required.");
      return;
    }

    if (!inspectionDate) {
      setFormError("Inspection date is required.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      await createInspection({
        establishment: establishment.id,
        inspector_name: inspectorName.trim(),
        inspection_date: inspectionDate,
        next_due_date: nextDueDate || null,
        findings: findings.trim(),
        remarks: remarks.trim(),
        status_after_inspection: isDraft ? "upcoming" : statusAfterInspection,
        photo_documentation: "",
        is_draft: isDraft,
        checklist_items: checks,
      });

      onClose();
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inspection-modal-backdrop">
      <div className="inspection-modal">
        <button type="button" className="inspection-close-btn" onClick={onClose}>
          <FiX />
        </button>

        <div className="inspection-form-title">
          <h2>
            Inspection Form : <strong>{establishment.business_name}</strong>
          </h2>
          <p>
            {establishment.business_type_name} (
            {formatFrequency(establishment.inspection_frequency)}) •{" "}
            {establishment.barangay || establishment.address}
          </p>
        </div>

        <div className="inspection-form-grid">
          <label>
            <span>Inspector Name</span>
            <input
              type="text"
              placeholder="Insp. J. Cruz"
              value={inspectorName}
              onChange={(event) => setInspectorName(event.target.value)}
            />
          </label>

          <label>
            <span>Date of Inspection</span>
            <div className="date-input">
              <input
                type="date"
                value={inspectionDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setInspectionDate(value);
                  setNextDueDate(
                    getSuggestedNextDueDate(
                      value,
                      establishment.inspection_frequency || "monthly"
                    )
                  );
                }}
              />
              <FiCalendar />
            </div>
          </label>
        </div>

        <div className="inspection-form-grid inspection-second-grid">
          <label>
            <span>Next Due Date</span>
            <input
              type="date"
              value={nextDueDate}
              onChange={(event) => setNextDueDate(event.target.value)}
            />
          </label>

          <label>
            <span>Status After Inspection</span>
            <select
              value={statusAfterInspection}
              onChange={(event) => setStatusAfterInspection(event.target.value)}
            >
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="inspection-checklist-box">
          <div className="inspection-checklist-title">
            <h3>Requirements Checklist</h3>
            <span>{percentage}% complete</span>
          </div>

          {checks.length ? (
            checks.map((item, index) => (
              <label
                key={`${item.requirement_name}-${index}`}
                className={`check-row ${item.is_complied ? "checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={item.is_complied}
                  onChange={() => handleCheck(index)}
                />
                <span>{item.requirement_name}</span>
              </label>
            ))
          ) : (
            <p className="inspection-empty">
              No requirements found for this establishment type.
            </p>
          )}
        </div>

        <label className="inspection-textarea">
          <span>Remarks / Findings</span>
          <textarea
            placeholder="Notes on observed conditions, violations, or follow-up actions..."
            value={findings}
            onChange={(event) => setFindings(event.target.value)}
          />
        </label>

        <label className="inspection-textarea inspection-remarks-field">
          <span>Follow-up Remarks</span>
          <textarea
            placeholder="Optional follow-up remarks..."
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </label>

        <div className="photo-upload-title">
          <FiCamera />
          <span>Photo Documentation (optional)</span>
        </div>

        <div className="photo-upload-box">
          Drag & drop photos here, or click to upload
        </div>

        <div className="inspection-warning">
          ⚠ Status will be auto-set to <strong>For Completion</strong> if any
          requirement is unchecked. You may manually change the final status
          before submitting.
        </div>

        {formError ? <p className="sanitation-error-text">{formError}</p> : null}

        <div className="inspection-form-actions">
          <button
            type="button"
            className="draft-btn"
            disabled={saving}
            onClick={() => handleSubmit(true)}
          >
            Save Draft
          </button>

          <button
            type="button"
            className="submit-inspection-btn"
            disabled={saving}
            onClick={() => handleSubmit(false)}
          >
            {saving ? "Submitting..." : "Submit Inspection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getSuggestedNextDueDate(dateValue, frequency) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (frequency === "quarterly") {
    date.setMonth(date.getMonth() + 3);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return date.toISOString().slice(0, 10);
}

function getDayDifference(dateValue) {
  const today = new Date();
  const target = new Date(dateValue);

  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getDueText(dateValue) {
  if (!dateValue) {
    return "No schedule";
  }

  const diff = getDayDifference(dateValue);

  if (diff < 0) {
    return `${Math.abs(diff)}d overdue`;
  }

  if (diff === 0) {
    return "Due today";
  }

  return `in ${diff}d`;
}

function buildCalendarCells(rows) {
  const today = new Date();
  const cells = [];

  for (let index = 0; index < 28; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    const isoDate = date.toISOString().slice(0, 10);

    const events = rows
      .filter((row) => row.nextDueDate === isoDate)
      .map((row) => ({
        title: row.business_name,
        status: calendarStatusClass(row.compliance_status_label),
      }));

    cells.push({
      day: String(date.getDate()),
      events,
    });
  }

  return cells;
}

function calendarStatusClass(status = "") {
  const normalized = status.toLowerCase();

  if (normalized.includes("good")) return "good";
  if (normalized.includes("upcoming")) return "upcoming";
  if (normalized.includes("completion")) return "completion";
  if (normalized.includes("violation")) return "violation";

  return "upcoming";
}

function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function formatFrequency(value = "") {
  if (value === "monthly") return "Monthly";
  if (value === "quarterly") return "Quarterly";
  return value || "Not Set";
}

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default InspectionManagement;
