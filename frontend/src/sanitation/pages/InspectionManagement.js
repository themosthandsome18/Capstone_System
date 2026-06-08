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
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [calendarMonth, setCalendarMonth] = useState(() =>
    getMonthStart(new Date())
  );

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

    return rows.filter((row) => {
      const matchesSearch =
        row.business_name?.toLowerCase().includes(keyword) ||
        row.address?.toLowerCase().includes(keyword) ||
        row.barangay?.toLowerCase().includes(keyword) ||
        row.business_type_name?.toLowerCase().includes(keyword) ||
        row.compliance_status_label?.toLowerCase().includes(keyword);
      const matchesStatus =
        statusFilter === "all" || row.compliance_status === statusFilter;
      const matchesDue = matchesDueFilter(row.nextDueDate, dueFilter);

      return matchesSearch && matchesStatus && matchesDue;
    });
  }, [dueFilter, rows, searchTerm, statusFilter]);

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
    return buildCalendarCells(rows, calendarMonth);
  }, [calendarMonth, rows]);

  function openForm(row) {
    setSelectedEstablishment(row);
    setShowForm(true);
  }

  function moveCalendarMonth(offset) {
    setCalendarMonth((currentMonth) =>
      getMonthStart(
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
      )
    );
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
    const inspection = row.latestInspection || {};
    const printedAt = new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(new Date());
    const checklistRows = inspection.checklist_items?.length
      ? inspection.checklist_items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.requirement_name)}</td>
                <td>${item.is_complied ? "Complied" : "Needs action"}</td>
                <td>${escapeHtml(item.notes || "")}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="3">No checklist items recorded.</td></tr>`;

    const printWindow = window.open("", "_blank", "width=720,height=820");

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Sanitary Inspection Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
            .office { text-align: center; border-bottom: 2px solid #0f6b3f; padding-bottom: 14px; margin-bottom: 22px; }
            .office h1 { margin: 6px 0 2px; font-size: 20px; text-transform: uppercase; }
            .office p { margin: 2px 0; font-size: 12px; }
            h2 { margin: 0 0 14px; font-size: 18px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
            .box { border: 1px solid #cbd5d1; padding: 10px; min-height: 48px; }
            .box span { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
            .box strong { display: block; margin-top: 5px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { border: 1px solid #cbd5d1; padding: 9px 10px; font-size: 12px; vertical-align: top; }
            th { background: #edf7f1; text-align: left; }
            .narrative { border: 1px solid #cbd5d1; padding: 12px; margin-top: 12px; }
            .narrative h3 { margin: 0 0 6px; font-size: 13px; }
            .narrative p { margin: 0; font-size: 12px; line-height: 1.5; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 58px; }
            .line { border-top: 1px solid #111827; text-align: center; padding-top: 7px; font-size: 12px; }
            @media print { body { margin: 24px; } }
          </style>
        </head>
        <body>
          <div class="office">
            <p>Republic of the Philippines</p>
            <p>Province of Quezon</p>
            <h1>Mauban Municipal Health Office</h1>
            <p>Sanitary Section</p>
            <p>Generated on ${escapeHtml(printedAt)}</p>
          </div>

          <h2>Sanitary Inspection Report</h2>

          <div class="grid">
            <div class="box"><span>Establishment</span><strong>${escapeHtml(
              row.business_name
            )}</strong></div>
            <div class="box"><span>Business Type</span><strong>${escapeHtml(
              row.business_type_name
            )}</strong></div>
            <div class="box"><span>Barangay</span><strong>${escapeHtml(
              row.barangay || "Not recorded"
            )}</strong></div>
            <div class="box"><span>Compliance Status</span><strong>${escapeHtml(
              row.compliance_status_label
            )}</strong></div>
            <div class="box"><span>Last Inspection</span><strong>${escapeHtml(
              formatDate(row.lastInspectionDate) || "No record"
            )}</strong></div>
            <div class="box"><span>Next Due</span><strong>${escapeHtml(
              formatDate(row.nextDueDate) || "Not set"
            )}</strong></div>
            <div class="box"><span>Inspector</span><strong>${escapeHtml(
              inspection.inspector_name || "Not assigned"
            )}</strong></div>
            <div class="box"><span>Inspection Frequency</span><strong>${escapeHtml(
              formatFrequency(row.inspection_frequency)
            )}</strong></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${checklistRows}</tbody>
          </table>

          <div class="narrative">
            <h3>Findings</h3>
            <p>${escapeHtml(inspection.findings || "No findings recorded.")}</p>
          </div>
          <div class="narrative">
            <h3>Remarks / Action Taken</h3>
            <p>${escapeHtml(inspection.remarks || "No remarks recorded.")}</p>
          </div>

          <div class="signatures">
            <div class="line">Prepared by</div>
            <div class="line">Municipal Health Officer / Sanitary Inspector</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
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
            {" | "}
            <strong>{overdueCount}</strong> overdue
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
          <span className="good">Good Standing</span>
          <span className="upcoming">Upcoming</span>
          <span className="completion">For Completion</span>
          <span className="violation">Violation</span>
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

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>

            <select
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value)}
            >
              <option value="all">All Due Dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due Today</option>
              <option value="week">Due Within 7 Days</option>
              <option value="unscheduled">No Schedule</option>
            </select>
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
                          data-label={row.compliance_status_label}
                        >
                          {row.compliance_status_label}
                        </span>
                      </td>

                      <td className="inspection-action-cell">
                        <div className="inspection-row-actions">
                          <button
                            type="button"
                            className="inspection-icon-action print"
                            onClick={() => printInspectionReport(row)}
                            aria-label={`Print inspection report for ${row.business_name}`}
                            title="Print report"
                            data-tooltip="Print report"
                          >
                            <FiPrinter />
                          </button>
                          <button
                            type="button"
                            className="inspection-icon-action conduct"
                            onClick={() => openForm(row)}
                            aria-label={`Conduct inspection for ${row.business_name}`}
                            title="Conduct inspection"
                            data-tooltip="Conduct inspection"
                          >
                            <FiClipboard />
                          </button>
                        </div>
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
          <div className="inspection-calendar-header">
            <div>
              <h3>
                <FiCalendar />
                Inspection Calendar
              </h3>
              <p>Review completed inspections and upcoming due dates.</p>
            </div>

            <div className="inspection-calendar-actions">
              <button
                type="button"
                onClick={() => moveCalendarMonth(-1)}
                aria-label="Previous month"
              >
                <FiChevronLeft />
              </button>
              <strong>{formatMonthTitle(calendarMonth)}</strong>
              <button
                type="button"
                onClick={() => moveCalendarMonth(1)}
                aria-label="Next month"
              >
                <FiChevronRight />
              </button>
            </div>
          </div>

          <div className="inspection-calendar-key">
            <span className="completed">Inspection Date</span>
            <span className="due">Next Due</span>
          </div>

          <div className="calendar-weekdays">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="inspection-calendar-grid">
            {calendarCells.map((cell) => (
              <div
                key={cell.date}
                className={`calendar-cell ${cell.isCurrentMonth ? "" : "muted"} ${
                  cell.isToday ? "today" : ""
                }`}
              >
                <span>{cell.day}</span>

                <div className="inspection-calendar-events">
                  {cell.events.map((event) => (
                    <button
                      type="button"
                      key={event.key}
                      className={`calendar-event ${event.status}`}
                      onClick={() => openForm(event.row)}
                      title={`${event.typeLabel}: ${event.title}`}
                    >
                      <small>{event.typeLabel}</small>
                      <strong>{event.title}</strong>
                    </button>
                  ))}
                </div>
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
            {formatFrequency(establishment.inspection_frequency)}) |{" "}
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
          Warning: Status will be auto-set to <strong>For Completion</strong> if any
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
  return toIsoDate(new Date());
}

function getSuggestedNextDueDate(dateValue, frequency) {
  if (!dateValue) return "";

  const date = parseLocalDate(dateValue);

  if (!date) return "";

  if (frequency === "annual") {
    date.setFullYear(date.getFullYear() + 1);
  } else if (frequency === "quarterly") {
    date.setMonth(date.getMonth() + 3);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return toIsoDate(date);
}

function getDayDifference(dateValue) {
  const today = new Date();
  const target = parseLocalDate(dateValue);

  if (!target) return 0;

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

function matchesDueFilter(dateValue, filter) {
  if (filter === "all") {
    return true;
  }

  if (!dateValue) {
    return filter === "unscheduled";
  }

  const diff = getDayDifference(dateValue);

  if (filter === "overdue") {
    return diff < 0;
  }

  if (filter === "today") {
    return diff === 0;
  }

  if (filter === "week") {
    return diff >= 0 && diff <= 7;
  }

  return true;
}

function buildCalendarCells(rows, monthStart) {
  const todayIso = toIsoDate(new Date());
  const anchor = getMonthStart(monthStart || new Date());
  const firstVisibleDate = new Date(anchor);
  firstVisibleDate.setDate(anchor.getDate() - anchor.getDay());
  const daysInMonth = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0
  ).getDate();
  const visibleCellCount = Math.ceil((anchor.getDay() + daysInMonth) / 7) * 7;
  const eventsByDate = buildCalendarEventMap(rows);
  const cells = [];

  for (let index = 0; index < visibleCellCount; index += 1) {
    const date = new Date(firstVisibleDate);
    date.setDate(firstVisibleDate.getDate() + index);

    const isoDate = toIsoDate(date);

    cells.push({
      date: isoDate,
      day: String(date.getDate()),
      isCurrentMonth: date.getMonth() === anchor.getMonth(),
      isToday: isoDate === todayIso,
      events: eventsByDate.get(isoDate) || [],
    });
  }

  return cells;
}

function buildCalendarEventMap(rows) {
  const eventsByDate = new Map();

  function addEvent(dateValue, event) {
    if (!dateValue) return;

    const events = eventsByDate.get(dateValue) || [];
    events.push(event);
    eventsByDate.set(dateValue, events);
  }

  rows.forEach((row) => {
    addEvent(row.lastInspectionDate, {
      key: `${row.id}-inspection-${row.lastInspectionDate}`,
      row,
      title: row.business_name,
      typeLabel: "Inspection",
      status: "completed",
    });

    addEvent(row.nextDueDate, {
      key: `${row.id}-due-${row.nextDueDate}`,
      row,
      title: row.business_name,
      typeLabel: "Next Due",
      status: calendarStatusClass(row.compliance_status_label),
    });
  });

  return eventsByDate;
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
  if (value === "annual") return "Annual";
  return value || "Not Set";
}

function formatDate(value) {
  if (!value) return "";

  const date = parseLocalDate(value);

  if (!date) return "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatMonthTitle(value) {
  return value.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getMonthStart(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function parseLocalDate(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}

export default InspectionManagement;
