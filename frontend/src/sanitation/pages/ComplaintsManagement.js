import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiFilter,
  FiImage,
  FiMapPin,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

const reportCategories = [
  "Public Restroom",
  "Public Market",
  "Food Establishment",
  "Water Source",
  "Garbage/Waste",
  "Pest/Rodents",
  "Other",
];

const emptyForm = {
  complainant_name: "",
  contact_number: "",
  category: "Public Restroom",
  barangay: "",
  reported_date: new Date().toISOString().slice(0, 10),
  status: "pending",
  priority: "medium",
  description: "",
  action_taken: "",
  resolved_date: "",
};

const emptySchedule = {
  inspector: "Insp. J. Cruz",
  date: new Date().toISOString().slice(0, 10),
  time: "09:00",
  priority: "medium",
  note: "",
  notify: true,
};

function ComplaintsManagement() {
  const {
    complaintData,
    loading,
    error,
    refreshComplaintData,
    createComplaint,
    updateComplaint,
    deleteComplaint,
  } = useSanitationData();

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    priority: "all",
    barangay: "all",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");

  const rows = useMemo(() => complaintData?.rows || [], [complaintData]);
  const summary = complaintData?.summary || {};
  const calendarEvents = useMemo(() => buildCalendarEvents(rows), [rows]);

  const visibleRows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();

    return rows.filter((item) => {
      const statusMatch = filters.status === "all" || item.status === filters.status;
      const priorityMatch =
        filters.priority === "all" || item.priority === filters.priority;
      const barangayMatch =
        filters.barangay === "all" || item.barangay === filters.barangay;
      const searchMatch =
        !needle ||
        [
          item.complaint_id,
          item.category,
          item.barangay,
          item.description,
          item.complainant_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);

      return statusMatch && priorityMatch && barangayMatch && searchMatch;
    });
  }, [filters, rows]);

  useEffect(() => {
    let mounted = true;

    if (!complaintData) {
      refreshComplaintData().catch((requestError) => {
        if (mounted) {
          setPageError(
            requestError.message || "Unable to load community report records."
          );
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [complaintData, refreshComplaintData]);

  useEffect(() => {
    if (!selectedReport && visibleRows.length) {
      setSelectedReport(visibleRows[0]);
      return;
    }

    if (selectedReport) {
      const updated = visibleRows.find((item) => item.id === selectedReport.id);
      if (updated && updated !== selectedReport) {
        setSelectedReport(updated);
      }
    }
  }, [selectedReport, visibleRows]);

  function openPublicForm() {
    setForm(emptyForm);
    setAnonymous(false);
    setFormOpen(true);
  }

  async function handleSubmitReport(event) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      establishment: null,
      complainant_name: anonymous ? "" : form.complainant_name,
      contact_number: anonymous ? "" : form.contact_number,
      status: "pending",
      resolved_date: null,
    };

    try {
      const created = await createComplaint(payload);
      setSelectedReport(created);
      setFormOpen(false);
      setPageError("");
    } catch (requestError) {
      setPageError(requestError.message || "Unable to submit community report.");
    } finally {
      setSaving(false);
    }
  }

  async function updateReportStatus(report, status, actionTaken = "") {
    setSaving(true);

    try {
      const updated = await updateComplaint(report.id, {
        status,
        action_taken: actionTaken || report.action_taken || "",
        resolved_date:
          status === "resolved" ? new Date().toISOString().slice(0, 10) : null,
      });
      setSelectedReport(updated);
      setPageError("");
    } catch (requestError) {
      setPageError(requestError.message || "Unable to update community report.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(report) {
    const confirmed = window.confirm(
      `Delete community report ${report.complaint_id}?`
    );

    if (!confirmed) return;

    try {
      await deleteComplaint(report.id);
      setSelectedReport(visibleRows.find((item) => item.id !== report.id) || null);
      setPageError("");
    } catch (requestError) {
      setPageError(requestError.message || "Unable to delete community report.");
    }
  }

  function openSchedule(report) {
    setSelectedReport(report);
    setSchedule({
      ...emptySchedule,
      inspector: report.assigned_inspector || emptySchedule.inspector,
      date: report.inspection_scheduled_date || emptySchedule.date,
      time:
        (report.inspection_scheduled_time || emptySchedule.time).slice(0, 5),
      priority: report.priority || "medium",
      note: report.inspection_schedule_note || report.action_taken || "",
      notify:
        report.inspection_notify_reporter === undefined
          ? true
          : Boolean(report.inspection_notify_reporter),
    });
    setScheduleOpen(true);
  }

  async function handleScheduleInspection(event) {
    event.preventDefault();

    if (!selectedReport) return;

    const note = [
      `Inspection scheduled on ${schedule.date} at ${schedule.time}.`,
      `Assigned inspector: ${schedule.inspector}.`,
      schedule.note ? `Inspection note: ${schedule.note}` : "",
      schedule.notify ? "Reporter notification requested." : "",
    ]
      .filter(Boolean)
      .join(" ");

    setSaving(true);

    try {
      const updated = await updateComplaint(selectedReport.id, {
        status: "investigating",
        priority: schedule.priority,
        assigned_inspector: schedule.inspector,
        inspection_scheduled_date: schedule.date,
        inspection_scheduled_time: schedule.time,
        inspection_schedule_note: schedule.note,
        inspection_notify_reporter: schedule.notify,
        action_taken: note,
      });
      setSelectedReport(updated);
      setScheduleOpen(false);
      setPageError("");
    } catch (requestError) {
      setPageError(requestError.message || "Unable to schedule inspection.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="community-report-page">Loading community reports...</div>;
  }

  return (
    <div className="community-report-page">
      <header className="community-report-header">
        <div>
          <h1>Sanitary Community Report</h1>
          <p>Track reports from residents, public areas, and household sanitation concerns.</p>
        </div>

        <button type="button" className="community-primary-btn" onClick={openPublicForm}>
          View Public Form
        </button>
      </header>

      {error || pageError ? (
        <p className="sanitation-error-text">{pageError || error}</p>
      ) : null}

      <section className="community-stat-grid">
        <CommunityStat label="Total Reports" value={summary.total || 0} tone="blue" />
        <CommunityStat label="New" value={summary.pending || 0} tone="blue" />
        <CommunityStat label="Urgent" value={summary.highPriority || 0} tone="red" />
        <CommunityStat label="Resolved" value={summary.resolved || 0} tone="green" />
      </section>

      <section className="community-toolbar">
        <label className="community-search">
          <FiSearch />
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Search by location, description, ref no..."
          />
        </label>

        <span className="community-filter-icon">
          <FiFilter />
          Filter
        </span>

        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">All Status</option>
          <option value="pending">New</option>
          <option value="investigating">In Review</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Dismissed</option>
        </select>

        <select
          value={filters.priority}
          onChange={(event) =>
            setFilters((current) => ({ ...current, priority: event.target.value }))
          }
        >
          <option value="all">All Severity</option>
          <option value="high">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </section>

      <CommunityCalendar
        month={calendarMonth}
        events={calendarEvents}
        onMonthChange={setCalendarMonth}
        onSelectReport={(reportId) => {
          const report = rows.find((item) => item.id === reportId);
          if (report) setSelectedReport(report);
        }}
      />

      <main className="community-report-grid">
        <section className="community-report-list" aria-label="Community reports">
          {visibleRows.length ? (
            visibleRows.map((item) => (
              <ReportListCard
                key={item.id}
                item={item}
                active={selectedReport?.id === item.id}
                onSelect={() => setSelectedReport(item)}
              />
            ))
          ) : (
            <div className="community-empty">No community reports found.</div>
          )}
        </section>

        <section className="community-detail-panel">
          {selectedReport ? (
            <ReportDetail
              report={selectedReport}
              saving={saving}
              onDelete={() => handleDelete(selectedReport)}
              onStatus={(status, actionTaken) =>
                updateReportStatus(selectedReport, status, actionTaken)
              }
              onSchedule={() => openSchedule(selectedReport)}
            />
          ) : (
            <div className="community-empty">Select a community report.</div>
          )}
        </section>
      </main>

      {formOpen ? (
        <PublicReportModal
          form={form}
          anonymous={anonymous}
          saving={saving}
          onAnonymousChange={setAnonymous}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmitReport}
          onChange={(field, value) =>
            setForm((current) => ({ ...current, [field]: value }))
          }
        />
      ) : null}

      {scheduleOpen && selectedReport ? (
        <ScheduleInspectionModal
          report={selectedReport}
          schedule={schedule}
          saving={saving}
          onClose={() => setScheduleOpen(false)}
          onSubmit={handleScheduleInspection}
          onChange={(field, value) =>
            setSchedule((current) => ({ ...current, [field]: value }))
          }
        />
      ) : null}
    </div>
  );
}

function CommunityStat({ label, value, tone }) {
  return (
    <div className={`community-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CommunityCalendar({ month, events, onMonthChange, onSelectReport }) {
  const days = buildCalendarDays(month);
  const eventMap = events.reduce((map, event) => {
    map[event.date] = [...(map[event.date] || []), event];
    return map;
  }, {});

  return (
    <section className="community-calendar-card">
      <div className="community-calendar-header">
        <div>
          <h2>Inspection Calendar</h2>
          <p>Community report filing dates and scheduled inspection visits.</p>
        </div>
        <div className="community-calendar-actions">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
          >
            Prev
          </button>
          <strong>{formatMonth(month)}</strong>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="community-calendar-legend">
        <span className="report">Report Filed</span>
        <span className="inspection">Inspection</span>
      </div>

      <div className="community-calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="community-calendar-weekday">
            {day}
          </div>
        ))}

        {days.map((day) => {
          const key = toDateKey(day);
          const dayEvents = eventMap[key] || [];
          const isCurrentMonth = day.getMonth() === month.getMonth();

          return (
            <div
              key={key}
              className={`community-calendar-day ${
                isCurrentMonth ? "" : "muted"
              }`}
            >
              <span>{day.getDate()}</span>
              <div className="community-calendar-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={`${event.type}-${event.reportId}-${event.date}`}
                    type="button"
                    className={event.type}
                    onClick={() => onSelectReport(event.reportId)}
                    title={`${event.label}: ${event.title}`}
                  >
                    <strong>{event.label}</strong>
                    <small>{event.title}</small>
                  </button>
                ))}
                {dayEvents.length > 3 ? (
                  <em>+{dayEvents.length - 3} more</em>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReportListCard({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className={`community-report-card ${active ? "active" : ""}`}
      onClick={onSelect}
    >
      <div className="community-card-top">
        <span className={`community-category ${categoryClass(item.category)}`}>
          {item.category}
        </span>
        <span className={`community-status ${statusClass(item.status)}`}>
          {displayStatus(item.status, item.status_label)}
        </span>
      </div>
      <strong>{reportTitle(item)}</strong>
      <p>{item.description || "No description provided."}</p>
      <div className="community-card-meta">
        <small>{item.complaint_id}</small>
        <small>{relativeReportDate(item.reported_date)}</small>
      </div>
    </button>
  );
}

function ReportDetail({ report, saving, onDelete, onStatus, onSchedule }) {
  return (
    <div className="community-detail-card">
      <div className="community-detail-title">
        <div>
          <small>{report.complaint_id}</small>
          <h2>{reportTitle(report)}</h2>
        </div>
        <button type="button" className="community-icon-btn" onClick={onDelete}>
          <FiTrash2 />
        </button>
      </div>

      <section className="community-detail-section">
        <h3>Description</h3>
        <p>{report.description || "No description provided."}</p>
      </section>

      <section className="community-detail-section">
        <h3>Photo Evidence</h3>
        <div className="community-photo-grid">
          {report.photo_documentation ? (
            <div className="community-photo-note">
              <FiImage />
              <span>{report.photo_documentation}</span>
            </div>
          ) : (
            <div className="community-photo-empty">None</div>
          )}
        </div>
      </section>

      <div className="community-info-grid">
        <div>
          <span>Reporter</span>
          <strong>{report.complainant_name || "Anonymous"}</strong>
          <small>{report.contact_number || "No contact number"}</small>
        </div>
        <div>
          <span>Location</span>
          <strong>{report.barangay || "Unspecified"}</strong>
          <small>{reportTitle(report)}</small>
        </div>
      </div>

      <section className="community-detail-section">
        <h3>Update Status</h3>
        <div className="community-status-row">
          <button
            type="button"
            className={report.status === "pending" ? "active" : ""}
            disabled={saving}
            onClick={() => onStatus("pending")}
          >
            New
          </button>
          <button
            type="button"
            className={report.status === "investigating" ? "active" : ""}
            disabled={saving}
            onClick={() => onStatus("investigating")}
          >
            In Review
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onStatus("investigating", "Inspection scheduled.")}
          >
            Inspection Scheduled
          </button>
          <button
            type="button"
            className={report.status === "resolved" ? "active" : ""}
            disabled={saving}
            onClick={() => onStatus("resolved", "Marked resolved by Sanitary Section.")}
          >
            Resolved
          </button>
          <button
            type="button"
            className={report.status === "rejected" ? "active" : ""}
            disabled={saving}
            onClick={() => onStatus("rejected", "Dismissed after review.")}
          >
            Dismissed
          </button>
        </div>
      </section>

      {report.inspection_scheduled_date ? (
        <section className="community-detail-section community-schedule-summary">
          <h3>Scheduled Inspection</h3>
          <p>
            {report.inspection_scheduled_date}
            {report.inspection_scheduled_time
              ? ` at ${report.inspection_scheduled_time.slice(0, 5)}`
              : ""}
          </p>
          <small>
            {report.assigned_inspector || "Unassigned inspector"}
            {report.inspection_schedule_note
              ? ` - ${report.inspection_schedule_note}`
              : ""}
          </small>
        </section>
      ) : null}

      {report.action_taken ? (
        <section className="community-detail-section">
          <h3>Action Taken</h3>
          <p>{report.action_taken}</p>
        </section>
      ) : null}

      <div className="community-detail-actions">
        <button type="button" className="community-primary-btn" onClick={onSchedule}>
          Schedule Inspection
        </button>
        <button
          type="button"
          className="community-secondary-btn"
          disabled={saving}
          onClick={() => onStatus("resolved", "Marked resolved by Sanitary Section.")}
        >
          Mark Resolved
        </button>
      </div>
    </div>
  );
}

function PublicReportModal({
  form,
  anonymous,
  saving,
  onAnonymousChange,
  onClose,
  onSubmit,
  onChange,
}) {
  return (
    <div className="community-modal-backdrop">
      <form className="community-public-modal" onSubmit={onSubmit}>
        <button type="button" className="community-back-btn" onClick={onClose}>
          &larr; Back
        </button>

        <h2>Report Unsanitary Conditions</h2>
        <p>Saw something concerning? Tell the Sanitary Section so they can inspect.</p>

        <label className="community-field-label">What are you reporting?</label>
        <div className="community-chip-row">
          {reportCategories.map((category) => (
            <button
              key={category}
              type="button"
              className={form.category === category ? "active" : ""}
              onClick={() => onChange("category", category)}
            >
              {category}
            </button>
          ))}
        </div>

        <label className="community-field-label">How urgent is it?</label>
        <div className="community-segment-row">
          {[
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "Urgent"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={form.priority === value ? "active" : ""}
              onClick={() => onChange("priority", value)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="community-field-label" htmlFor="community-location">
          Location / Address
        </label>
        <div className="community-location-row">
          <input
            id="community-location"
            value={form.barangay}
            onChange={(event) => onChange("barangay", event.target.value)}
            placeholder="e.g. Public Restroom, Mauban Public Market"
            required
          />
          <button type="button">
            <FiMapPin />
            GPS
          </button>
        </div>

        <label className="community-field-label" htmlFor="community-description">
          Describe what you saw
        </label>
        <textarea
          id="community-description"
          value={form.description}
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="e.g. The public restroom is overflowing, no running water, strong odor..."
          required
        />

        <label className="community-field-label">Photo Evidence</label>
        <div className="community-upload-box">
          <FiImage />
          <span>Upload</span>
        </div>

        <div className="community-anonymous-box">
          <label>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => onAnonymousChange(event.target.checked)}
            />
            Submit anonymously
          </label>

          {!anonymous ? (
            <div className="community-reporter-grid">
              <label>
                Your Name
                <input
                  value={form.complainant_name}
                  onChange={(event) =>
                    onChange("complainant_name", event.target.value)
                  }
                  placeholder="Juan Dela Cruz"
                />
              </label>
              <label>
                Contact Number
                <input
                  value={form.contact_number}
                  onChange={(event) =>
                    onChange("contact_number", event.target.value)
                  }
                  placeholder="09XXXXXXXXX"
                />
              </label>
            </div>
          ) : null}
        </div>

        <button type="submit" className="community-submit-btn" disabled={saving}>
          {saving ? "Submitting..." : "Submit Report"}
        </button>
      </form>
    </div>
  );
}

function ScheduleInspectionModal({
  report,
  schedule,
  saving,
  onClose,
  onSubmit,
  onChange,
}) {
  return (
    <div className="community-modal-backdrop">
      <form className="community-schedule-modal" onSubmit={onSubmit}>
        <button type="button" className="community-back-btn" onClick={onClose}>
          &larr; Back
        </button>

        <h2>Schedule Inspection</h2>
        <p>
          Assign an inspector and set a visit date for this community report. No
          business report requirement needed.
        </p>

        <div className="community-linked-report">
          <small>Linked Community Report</small>
          <strong>Reference: {report.complaint_id}</strong>
          <span>Category: {report.category}</span>
          <span>
            <FiMapPin />
            {reportTitle(report)}
          </span>
        </div>

        <div className="community-schedule-grid">
          <label>
            Location to Inspect
            <input value={reportTitle(report)} readOnly />
          </label>
          <label>
            Category
            <input value={report.category} readOnly />
          </label>
          <label>
            Assigned Inspector
            <select
              value={schedule.inspector}
              onChange={(event) => onChange("inspector", event.target.value)}
            >
              <option>Insp. J. Cruz</option>
              <option>Insp. M. Santos</option>
              <option>Insp. R. Dela Pena</option>
            </select>
          </label>
          <label>
            Inspection Date
            <input
              type="date"
              value={schedule.date}
              onChange={(event) => onChange("date", event.target.value)}
              required
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={schedule.time}
              onChange={(event) => onChange("time", event.target.value)}
              required
            />
          </label>
        </div>

        <label className="community-field-label">Priority</label>
        <div className="community-priority-row">
          {[
            ["low", "Routine", "Within 7 days"],
            ["medium", "Standard", "Within 48 hours"],
            ["high", "Urgent", "Within 24 hours"],
          ].map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              className={schedule.priority === value ? "active" : ""}
              onClick={() => onChange("priority", value)}
            >
              <strong>{label}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>

        <label className="community-field-label" htmlFor="inspection-note">
          Inspection Note
        </label>
        <textarea
          id="inspection-note"
          value={schedule.note}
          onChange={(event) => onChange("note", event.target.value)}
          placeholder="What to look for, equipment to bring, hazards to expect..."
        />

        <label className="community-notify-row">
          <input
            type="checkbox"
            checked={schedule.notify}
            onChange={(event) => onChange("notify", event.target.checked)}
          />
          Notify the reporter once the inspection is scheduled.
        </label>

        <div className="community-urgent-note">
          <FiAlertTriangle />
          Urgent priority - coordinate with Mauban Health Office supervisor before dispatch.
        </div>

        <div className="community-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Scheduling..." : "Schedule Inspection"}
          </button>
        </div>
      </form>
    </div>
  );
}

function reportTitle(item) {
  return item.establishment_name || item.barangay || "Community location";
}

function buildCalendarEvents(rows) {
  return rows.flatMap((item) => {
    const events = [];

    if (item.reported_date) {
      events.push({
        date: item.reported_date,
        type: "report",
        label: "Report",
        title: reportTitle(item),
        reportId: item.id,
      });
    }

    if (item.inspection_scheduled_date) {
      events.push({
        date: item.inspection_scheduled_date,
        type: "inspection",
        label: "Inspection",
        title: `${reportTitle(item)}${
          item.inspection_scheduled_time
            ? ` - ${item.inspection_scheduled_time.slice(0, 5)}`
            : ""
        }`,
        reportId: item.id,
      });
    }

    return events;
  });
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function formatMonth(date) {
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function buildCalendarDays(month) {
  const firstDay = startOfMonth(month);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayStatus(status, label) {
  if (status === "pending") return "New";
  if (status === "investigating") return "In Review";
  if (status === "rejected") return "Dismissed";
  return label || status;
}

function statusClass(status) {
  if (status === "pending") return "new";
  if (status === "resolved") return "resolved";
  if (status === "rejected") return "dismissed";
  return "review";
}

function categoryClass(category = "") {
  if (category.toLowerCase().includes("market")) return "market";
  if (category.toLowerCase().includes("water")) return "water";
  if (category.toLowerCase().includes("waste")) return "waste";
  if (category.toLowerCase().includes("pest")) return "pest";
  return "default";
}

function relativeReportDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const days = Math.max(0, Math.round(diff / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export default ComplaintsManagement;
