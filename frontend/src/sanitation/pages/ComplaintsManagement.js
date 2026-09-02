import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiFilter,
  FiMapPin,
  FiPrinter,
  FiSearch,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { useSanitationData } from "../context/SanitationDataContext";
import { API_BASE_URL } from "../../shared/apiClient";

export const REPORT_LIMIT_MAX = 5;

export function getDailyReportCount() {
  try {
    const todayKey = `mauban_sanitation_report_count_${new Date().toISOString().slice(0, 10)}`;
    const val = parseInt(localStorage.getItem(todayKey) || "0", 10);
    return isNaN(val) ? 0 : val;
  } catch {
    return 0;
  }
}

export function incrementDailyReportCount() {
  try {
    const todayKey = `mauban_sanitation_report_count_${new Date().toISOString().slice(0, 10)}`;
    const current = getDailyReportCount();
    localStorage.setItem(todayKey, String(current + 1));
    return current + 1;
  } catch {
    return 1;
  }
}

export const CATEGORY_DEFINITIONS = [
  {
    category: "Contaminated Water Source",
    group: "Urgent (24–48h SLA)",
    priority: "high",
    maxDays: 1, // Today or Tomorrow
    iconTone: "urgent",
    hint: "Critical water safety & disease outbreak risk",
  },
  {
    category: "Hazardous / Medical Waste",
    group: "Urgent (24–48h SLA)",
    priority: "high",
    maxDays: 1,
    iconTone: "urgent",
    hint: "Toxic chemical, biological, or hospital waste",
  },
  {
    category: "Severe Sewage Overflow",
    group: "Urgent (24–48h SLA)",
    priority: "high",
    maxDays: 1,
    iconTone: "urgent",
    hint: "Open sewer leak / immediate community biohazard",
  },
  {
    category: "Food Establishment Hygiene",
    group: "Standard (3–5 Days)",
    priority: "medium",
    maxDays: 5,
    iconTone: "standard",
    hint: "Food sanitation / food handling violations",
  },
  {
    category: "Public Market Sanitation",
    group: "Standard (3–5 Days)",
    priority: "medium",
    maxDays: 5,
    iconTone: "standard",
    hint: "Market stall waste, meat section, odor",
  },
  {
    category: "Public Restroom Maintenance",
    group: "Standard (3–5 Days)",
    priority: "medium",
    maxDays: 5,
    iconTone: "standard",
    hint: "Public toilet unhygienic / broken plumbing",
  },
  {
    category: "Pest & Rodents Infestation",
    group: "Standard (3–5 Days)",
    priority: "medium",
    maxDays: 5,
    iconTone: "standard",
    hint: "Disease vectors (rats, flies, mosquitoes)",
  },
  {
    category: "Garbage Collection Delay",
    group: "Routine (7–14 Days)",
    priority: "low",
    maxDays: 14,
    iconTone: "routine",
    hint: "Uncollected neighborhood garbage pile",
  },
  {
    category: "General Cleanliness / Other",
    group: "Routine (7–14 Days)",
    priority: "low",
    maxDays: 14,
    iconTone: "routine",
    hint: "Minor inquiries or general sanitation concerns",
  },
];

export function getCategoryInfo(categoryName) {
  if (!categoryName) return CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];
  const found = CATEGORY_DEFINITIONS.find(
    (c) => c.category.toLowerCase() === categoryName.toLowerCase()
  );
  if (found) return found;

  const lower = categoryName.toLowerCase();
  if (
    lower.includes("water") ||
    lower.includes("sewage") ||
    lower.includes("hazard") ||
    lower.includes("urgent")
  ) {
    return CATEGORY_DEFINITIONS[0]; // Contaminated Water Source
  }
  if (
    lower.includes("food") ||
    lower.includes("market") ||
    lower.includes("restroom") ||
    lower.includes("pest")
  ) {
    return CATEGORY_DEFINITIONS[3]; // Food Establishment
  }
  return CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1]; // General Cleanliness / Other
}

export function getScheduleDateLimits(priority) {
  const today = new Date();
  const minDate = toDateKey(today);
  const max = new Date(today);

  if (priority === "high") {
    max.setDate(today.getDate() + 1); // Today or Tomorrow (within 24-48 hrs)
    return {
      minDate,
      maxDate: toDateKey(max),
      ruleHint: "Restricted to Today or Tomorrow only (Max 48h limit).",
      ruleType: "urgent",
    };
  }
  if (priority === "medium") {
    max.setDate(today.getDate() + 5);
    return {
      minDate,
      maxDate: toDateKey(max),
      ruleHint: "Must be scheduled within 5 days.",
      ruleType: "standard",
    };
  }

  max.setDate(today.getDate() + 14);
  return {
    minDate,
    maxDate: toDateKey(max),
    ruleHint: "Must be scheduled within 14 days.",
    ruleType: "routine",
  };
}

const emptySchedule = {
  inspector: "Insp. J. Cruz",
  date: new Date().toISOString().slice(0, 10),
  time: "09:00",
  priority: "high",
  note: "",
  notify: true,
};

function ComplaintsManagement() {
  const navigate = useNavigate();
  const {
    complaintData,
    loading,
    error,
    refreshComplaintData,
    updateComplaint,
    deleteComplaint,
  } = useSanitationData();

  const { user } = useAuth();
  const defaultInspectorName = useMemo(() => {
    if (!user) return "Insp. Juan Dela Cruz";
    if (user.display_name && user.display_name !== "admin") {
      return user.display_name.startsWith("Insp") ? user.display_name : `Insp. ${user.display_name}`;
    }
    if (user.username === "inspector_maria") return "Insp. Maria Santos";
    return "Insp. Juan Dela Cruz";
  }, [user]);

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    priority: "all",
    barangay: "all",
  });

  const [calFilters, setCalFilters] = useState({
    eventType: "all", // "all", "report", "inspection"
    reporterType: "all", // "all", "named", "anonymous"
    priority: "all", // "all", "high", "medium", "low"
    status: "all", // "all", "pending", "investigating", "resolved"
  });

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [dayModalData, setDayModalData] = useState(null);
  const [inspectionModalData, setInspectionModalData] = useState(null);

  const rows = useMemo(() => complaintData?.rows || [], [complaintData]);
  const summary = complaintData?.summary || {};
  const calendarEvents = useMemo(
    () => buildCalendarEvents(rows, calFilters),
    [rows, calFilters]
  );

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
            requestError.message || "Unable to load community concerns records."
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
      setPageError(requestError.message || "Unable to update community concern.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(report) {
    const confirmed = true;
    if (!confirmed) return;

    try {
      await deleteComplaint(report.id);
      setSelectedReport(visibleRows.find((item) => item.id !== report.id) || null);
      setPageError("");
    } catch (requestError) {
      setPageError(requestError.message || "Unable to delete community concern.");
    }
  }

  function openSchedule(report) {
    setSelectedReport(report);
    const effectivePriority = report.priority || "high";
    const { minDate, maxDate } = getScheduleDateLimits(effectivePriority);

    let initialDate = report.inspection_scheduled_date || minDate;
    if (initialDate < minDate) initialDate = minDate;
    if (initialDate > maxDate) initialDate = maxDate;

    setSchedule({
      ...emptySchedule,
      inspector: report.assigned_inspector || defaultInspectorName,
      date: initialDate,
      time:
        (report.inspection_scheduled_time || emptySchedule.time).slice(0, 5),
      priority: effectivePriority,
      note: report.inspection_schedule_note || report.action_taken || "",
      notify:
        report.inspection_notify_reporter === undefined
          ? true
          : Boolean(report.inspection_notify_reporter),
    });
    setScheduleOpen(true);
  }

  function handleSchedulePriorityChange(newPriority) {
    const { minDate, maxDate } = getScheduleDateLimits(newPriority);
    let clampedDate = schedule.date;
    if (clampedDate < minDate) clampedDate = minDate;
    if (clampedDate > maxDate) clampedDate = maxDate;

    setSchedule((current) => ({
      ...current,
      priority: newPriority,
      date: clampedDate,
    }));
  }

  async function handleScheduleInspection(event) {
    event.preventDefault();

    if (!selectedReport) return;

    const { minDate, maxDate, ruleHint } = getScheduleDateLimits(schedule.priority);
    if (schedule.date < minDate || schedule.date > maxDate) {
      setPageError(
        `Invalid Inspection Date: For ${schedule.priority.toUpperCase()} priority, inspection date must be between ${minDate} and ${maxDate}. (${ruleHint})`
      );
      return;
    }

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
    return <div className="community-report-page">Loading community concerns...</div>;
  }

  return (
    <div className="community-report-page">
      <header className="community-report-header">
        <div>
          <h1>Community Concerns &amp; Inspection Schedules</h1>
          <p>
            Track public sanitation concerns from residents, assess urgency SLAs, and schedule on-site inspections.
          </p>
        </div>
      </header>

      {error || pageError ? (
        <p className="sanitation-error-text">{pageError || error}</p>
      ) : null}

      <section className="community-stat-grid">
        <CommunityStat label="Total Concerns" value={summary.total || 0} tone="blue" />
        <CommunityStat label="New / Pending" value={summary.pending || 0} tone="blue" />
        <CommunityStat label="Urgent (24–48h)" value={summary.highPriority || 0} tone="red" />
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
            placeholder="Search by location, description, ref no, reporter..."
          />
        </label>

        <span className="community-filter-icon">
          <FiFilter />
          Filter List
        </span>

        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">All Status</option>
          <option value="pending">New / Pending</option>
          <option value="investigating">In Review / Scheduled</option>
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
          <option value="high">🔴 Urgent (Within 24–48h)</option>
          <option value="medium">🟡 Standard (Within 3–5d)</option>
          <option value="low">🟢 Routine (Within 7–14d)</option>
        </select>
      </section>

      <CommunityCalendar
        month={calendarMonth}
        events={calendarEvents}
        allRows={rows}
        calFilters={calFilters}
        onCalFilterChange={(field, value) =>
          setCalFilters((current) => ({ ...current, [field]: value }))
        }
        onMonthChange={setCalendarMonth}
        onSelectReport={(id) => {
          const report = rows.find((r) => r.id === id);
          if (report) setSelectedReport(report);
        }}
        onOpenDayEvents={(day, events) => setDayModalData({ day, events })}
        onOpenInspection={(id) => {
          const report = rows.find((r) => r.id === id);
          if (report) setInspectionModalData(report);
        }}
      />

      <main className="community-report-grid">
        <section className="community-report-list" aria-label="Community concerns list">
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
            <div className="community-empty">No community concerns found.</div>
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
              onLocationClick={() =>
                navigate("/sanitation/gis-map", {
                  state: { mode: "community_reports", reportId: selectedReport.id },
                })
              }
            />
          ) : (
            <div className="community-empty">Select a concern to view full details.</div>
          )}
        </section>
      </main>

      {scheduleOpen && selectedReport ? (
        <ScheduleInspectionModal
          report={selectedReport}
          schedule={schedule}
          saving={saving}
          onClose={() => setScheduleOpen(false)}
          onSubmit={handleScheduleInspection}
          onPriorityChange={handleSchedulePriorityChange}
          onChange={(field, value) =>
            setSchedule((current) => ({ ...current, [field]: value }))
          }
        />
      ) : null}

      {dayModalData ? (
        <DayEventsModal
          day={dayModalData.day}
          events={dayModalData.events}
          onClose={() => setDayModalData(null)}
          onSelectReport={(id) => {
            setSelectedReport(rows.find((r) => r.id === id));
            setDayModalData(null);
          }}
          onOpenInspection={(id) => {
            setInspectionModalData(rows.find((r) => r.id === id));
            setDayModalData(null);
          }}
        />
      ) : null}

      {inspectionModalData ? (
        <InspectionDetailsModal
          report={inspectionModalData}
          onClose={() => setInspectionModalData(null)}
          onLocationClick={() =>
            navigate("/sanitation/gis-map", {
              state: { mode: "community_reports", reportId: inspectionModalData.id },
            })
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

function CommunityCalendar({
  month,
  events,
  allRows = [],
  calFilters,
  onCalFilterChange,
  onMonthChange,
  onSelectReport,
  onOpenDayEvents,
  onOpenInspection,
}) {
  const days = buildCalendarDays(month);
  const eventMap = events.reduce((map, event) => {
    map[event.date] = [...(map[event.date] || []), event];
    return map;
  }, {});

  const totalReportsCount = allRows.filter((r) => Boolean(r.reported_date)).length;
  const totalInspectionsCount = allRows.filter(
    (r) => Boolean(r.inspection_scheduled_date)
  ).length;

  return (
    <section className="community-calendar-card">
      <div className="community-calendar-header">
        <div>
          <h2>Inspection &amp; Concern Calendar</h2>
          <p>Filtered view of community report filing dates and scheduled inspection visits.</p>
        </div>
        <div className="community-calendar-actions">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
          >
            &larr; Prev
          </button>
          <strong>{formatMonth(month)}</strong>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* ── Interactive Calendar Filter Toolbar ── */}
      <div className="calendar-filter-toolbar">
        <div className="calendar-filter-group">
          <span className="cal-filter-label">
            <FiCalendar /> View:
          </span>
          <div className="cal-filter-chips">
            <button
              type="button"
              className={calFilters.eventType === "all" ? "active" : ""}
              onClick={() => onCalFilterChange("eventType", "all")}
            >
              All Events ({events.length})
            </button>
            <button
              type="button"
              className={calFilters.eventType === "report" ? "active" : ""}
              onClick={() => onCalFilterChange("eventType", "report")}
            >
              Reports Filed ({totalReportsCount})
            </button>
            <button
              type="button"
              className={calFilters.eventType === "inspection" ? "active" : ""}
              onClick={() => onCalFilterChange("eventType", "inspection")}
            >
              Inspections ({totalInspectionsCount})
            </button>
          </div>
        </div>

        <div className="calendar-filter-dropdowns">
          <label className="cal-dropdown-item">
            <span>Reporter:</span>
            <select
              value={calFilters.reporterType}
              onChange={(e) => onCalFilterChange("reporterType", e.target.value)}
            >
              <option value="all">All (Named &amp; Anon)</option>
              <option value="named">Named Reporters Only</option>
              <option value="anonymous">Anonymous Only</option>
            </select>
          </label>

          <label className="cal-dropdown-item">
            <span>Urgency:</span>
            <select
              value={calFilters.priority}
              onChange={(e) => onCalFilterChange("priority", e.target.value)}
            >
              <option value="all">All Urgencies</option>
              <option value="high">🔴 Urgent Only (24-48h)</option>
              <option value="medium">🟡 Standard Only (3-5d)</option>
              <option value="low">🟢 Routine Only (7-14d)</option>
            </select>
          </label>

          <label className="cal-dropdown-item">
            <span>Status:</span>
            <select
              value={calFilters.status}
              onChange={(e) => onCalFilterChange("status", e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">New / Pending</option>
              <option value="investigating">In Review / Scheduled</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>
      </div>

      <div className="community-calendar-legend">
        <span className="report">Report Filed</span>
        <span className="inspection">Inspection Visit</span>
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
              } ${dayEvents.length >= 3 ? "clickable" : ""}`}
              onClick={dayEvents.length >= 3 ? () => onOpenDayEvents(day, dayEvents) : undefined}
            >
              <span>{day.getDate()}</span>
              <div className="community-calendar-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={`${event.type}-${event.reportId}-${event.date}`}
                    type="button"
                    className={event.type}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (event.type === "inspection") {
                        onOpenInspection(event.reportId);
                      } else {
                        onSelectReport(event.reportId);
                      }
                    }}
                    title={`${event.label}: ${event.title}`}
                  >
                    <strong>{event.label}</strong>
                    <small>{event.title}</small>
                  </button>
                ))}
                {dayEvents.length > 3 ? (
                  <button
                    type="button"
                    className="community-more-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDayEvents(day, dayEvents);
                    }}
                  >
                    +{dayEvents.length - 3} more
                  </button>
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
  const catInfo = getCategoryInfo(item.category);
  const isUrgent = item.priority === "high" || catInfo.priority === "high";

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
        {isUrgent ? (
          <span className="urgency-tag urgent">🔴 Urgent</span>
        ) : item.priority === "medium" ? (
          <span className="urgency-tag standard">🟡 Standard</span>
        ) : (
          <span className="urgency-tag routine">🟢 Routine</span>
        )}
        <small>{relativeReportDate(item.reported_date)} • {formatReportTime12h(item)}</small>
      </div>
    </button>
  );
}

export function printFieldworkActionSlip(report) {
  if (!report) return;

  const printedAt = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const priorityLabel =
    report.priority === "high"
      ? "🔴 URGENT (24–48h SLA)"
      : report.priority === "medium"
      ? "🟡 STANDARD (3–5 Days)"
      : "🟢 ROUTINE (7–14 Days)";

  const printWindow = window.open("", "_blank", "width=750,height=850");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Fieldwork Inspection Order - ${report.complaint_id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 30px; color: #0f172a; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px solid #047857; padding-bottom: 12px; margin-bottom: 20px; }
          .header p { margin: 2px 0; font-size: 12px; color: #475569; }
          .header h1 { margin: 6px 0 2px; font-size: 19px; text-transform: uppercase; color: #065f46; letter-spacing: 0.5px; }
          .header h2 { margin: 2px 0 0; font-size: 13px; font-weight: 700; color: #1e293b; }
          .title-strip { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
          .title-strip strong { font-size: 15px; color: #065f46; }
          .title-strip span { font-size: 12px; font-weight: 700; color: #334155; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa; }
          .box span { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
          .box strong { font-size: 13px; color: #0f172a; }
          .section { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
          .section h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
          .section p { margin: 0; font-size: 13px; white-space: pre-wrap; }
          .fieldwork-checklist { margin-top: 14px; border-top: 1px dashed #94a3b8; padding-top: 12px; }
          .fieldwork-checklist h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #065f46; }
          .notes-lines { border: 1px solid #cbd5e1; height: 110px; border-radius: 4px; margin-top: 6px; background: #fff; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
          .sig-line { border-top: 1px solid #0f172a; text-align: center; padding-top: 6px; font-size: 12px; }
          .sig-line small { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
          @media print { body { margin: 16px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <p>Republic of the Philippines • Province of Quezon</p>
          <h1>Municipality of Mauban</h1>
          <h2>Municipal Health Office — Sanitary Section</h2>
          <p style="margin-top: 4px; font-size: 11px;">Document Generated: ${printedAt}</p>
        </div>

        <div class="title-strip">
          <strong>FIELDWORK INSPECTION & ACTION ORDER SLIP</strong>
          <span>REF: ${report.complaint_id || "N/A"}</span>
        </div>

        <div class="grid">
          <div class="box">
            <span>Location / Barangay</span>
            <strong>Brgy. ${report.barangay || "Unspecified"}</strong>
          </div>
          <div class="box">
            <span>Inspection Urgency SLA</span>
            <strong>${priorityLabel}</strong>
          </div>
          <div class="box">
            <span>Category</span>
            <strong>${report.category || "General Cleanliness"}</strong>
          </div>
          <div class="box">
            <span>Assigned Sanitary Inspector</span>
            <strong>${report.assigned_inspector || "Insp. Juan Dela Cruz"}</strong>
          </div>
          <div class="box">
            <span>Scheduled Date & Time</span>
            <strong>${report.inspection_scheduled_date || "Immediate"} ${report.inspection_scheduled_time ? "at " + report.inspection_scheduled_time : ""}</strong>
          </div>
          <div class="box">
            <span>Complainant</span>
            <strong>${report.complainant_name || "Anonymous Resident"} ${report.contact_number ? "(" + report.contact_number + ")" : ""}</strong>
          </div>
        </div>

        <div class="section">
          <h3>Concern Description / Resident Statement</h3>
          <p>${report.description || "No narrative description provided."}</p>
        </div>

        <div class="section">
          <h3>Dispatcher & Triage Notes</h3>
          <p>${report.action_taken || report.inspection_schedule_note || "Conduct on-site sanitation verification, photographic evidence gathering, and issue Sanitary Notice of Violation if applicable."}</p>
        </div>

        <div class="fieldwork-checklist">
          <h4>Inspector On-Site Verification Findings & Corrective Orders:</h4>
          <div class="notes-lines"></div>
        </div>

        <div class="signatures">
          <div class="sig-line">
            <strong>${report.assigned_inspector || "Sanitary Inspector"}</strong>
            <small>Fieldwork Sanitary Inspector</small>
          </div>
          <div class="sig-line">
            <strong>Municipal Health Officer (MHO)</strong>
            <small>Approved by / Sanitary Division</small>
          </div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
}

function ReportDetail({ report, saving, onDelete, onStatus, onSchedule, onLocationClick }) {
  const catInfo = getCategoryInfo(report.category);

  return (
    <div className="community-detail-card">
      <div className="community-detail-title">
        <div>
          <small>{report.complaint_id}</small>
          <h2>{reportTitle(report)}</h2>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="community-icon-btn"
            style={{ color: "#065f46", background: "#f0fdf4", borderColor: "#a7f3d0" }}
            onClick={() => printFieldworkActionSlip(report)}
            title="Print Fieldwork Inspection Order Slip"
          >
            <FiPrinter />
          </button>
          <button
            type="button"
            className="community-icon-btn"
            onClick={onDelete}
            title="Delete report"
          >
            <FiTrash2 />
          </button>
        </div>
      </div>

      {/* ── Category & Urgency Badge ── */}
      <div className="concern-classification-banner">
        <div className="classification-item">
          <span>Category:</span>
          <strong>{report.category}</strong>
        </div>
        <div className="classification-item">
          <span>Inspection Urgency:</span>
          <span className={`urgency-pill ${report.priority || catInfo.priority}`}>
            {report.priority === "high"
              ? "🔴 Urgent (Within 24–48h)"
              : report.priority === "medium"
              ? "🟡 Standard (Within 3–5 days)"
              : "🟢 Routine (Within 7–14 days)"}
          </span>
        </div>
      </div>

      <section className="community-detail-section">
        <h3>Description</h3>
        <p>{report.description || "No description provided."}</p>
      </section>

      <section className="community-detail-section">
        <h3>Photo Evidence</h3>
        <div className="community-photo-grid">
          {report.photo_documentation ? (
            report.photo_documentation.split(",").map((photoUrl, index) => {
              const fullUrl = photoUrl.startsWith("http")
                ? photoUrl
                : `${API_BASE_URL.replace("/api", "")}${
                    photoUrl.startsWith("/") ? "" : "/"
                  }${photoUrl}`;

              return (
                <div key={index} className="community-photo-image">
                  <img
                    src={fullUrl}
                    alt={`Concern Evidence ${index + 1}`}
                    style={{
                      width: "100%",
                      maxHeight: "300px",
                      objectFit: "contain",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#f8fafc",
                    }}
                  />
                </div>
              );
            })
          ) : (
            <div className="community-photo-empty">No photo attached</div>
          )}
        </div>
      </section>

      <div className="community-info-grid">
        <div>
          <span>Reporter</span>
          <strong>{report.complainant_name || "Anonymous"}</strong>
          <small>{report.contact_number || "No contact number provided"}</small>
        </div>
        <div>
          <span>Reported Time</span>
          <strong>{formatReportTime12h(report)}</strong>
          <small>{report.reported_date || "Today"}</small>
        </div>
        <div
          onClick={onLocationClick}
          style={{ cursor: "pointer", transition: "all 0.2s" }}
          title="View exact location on GIS Map"
        >
          <span>
            Location{" "}
            <small
              style={{
                color: "#0ea5e9",
                marginLeft: "4px",
                fontWeight: "600",
                textTransform: "none",
                fontSize: "11px",
              }}
            >
              View on Map &rarr;
            </small>
          </span>
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

function ScheduleInspectionModal({
  report,
  schedule,
  saving,
  onClose,
  onSubmit,
  onPriorityChange,
  onChange,
}) {
  const effectivePriority = schedule.priority || report.priority || "high";
  const { minDate, maxDate, ruleHint, ruleType } = getScheduleDateLimits(effectivePriority);

  return (
    <div className="community-modal-backdrop">
      <form className="community-schedule-modal" onSubmit={onSubmit}>
        <button type="button" className="community-back-btn" onClick={onClose}>
          &larr; Back
        </button>

        <h2>Schedule On-Site Inspection</h2>
        <p>
          Assign a health sanitary inspector and set the visit schedule. Date is locked within required urgency bounds.
        </p>

        <div className="community-linked-report">
          <small>Linked Concern Record</small>
          <strong>Reference: {report.complaint_id}</strong>
          <span>Category: {report.category}</span>
          <span>
            <FiMapPin />
            {reportTitle(report)}
          </span>
        </div>

        {/* ── Strict Date Constraint Warning ── */}
        <div className={`schedule-sla-constraint-box ${ruleType}`}>
          <FiClock />
          <div>
            <strong>
              {effectivePriority === "high"
                ? "🔴 Urgent SLA: Inspection Restricted to Today or Tomorrow"
                : effectivePriority === "medium"
                ? "🟡 Standard SLA: Inspection within 5 Days"
                : "🟢 Routine SLA: Inspection within 14 Days"}
            </strong>
            <p>
              Allowed inspection dates: <strong>{minDate}</strong> to <strong>{maxDate}</strong>. ({ruleHint})
            </p>
          </div>
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
              <option>Insp. E. Alcantara</option>
            </select>
          </label>
          <label>
            Inspection Date (Strict Constraint)
            <input
              type="date"
              value={schedule.date}
              min={minDate}
              max={maxDate}
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

        <label className="community-field-label">Inspection Priority / SLA Window</label>
        <div className="community-priority-row">
          {[
            ["high", "Urgent", "Today or Tomorrow (48h max)"],
            ["medium", "Standard", "Within 5 days"],
            ["low", "Routine", "Within 14 days"],
          ].map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              className={schedule.priority === value ? `active ${value}` : ""}
              onClick={() => onPriorityChange(value)}
            >
              <strong>{label}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>

        <label className="community-field-label" htmlFor="inspection-note">
          Inspection Instructions &amp; Notes
        </label>
        <textarea
          id="inspection-note"
          value={schedule.note}
          onChange={(event) => onChange("note", event.target.value)}
          placeholder="What to inspect, tools/kits to bring, immediate disinfection needed..."
        />

        <label className="community-notify-row">
          <input
            type="checkbox"
            checked={schedule.notify}
            onChange={(event) => onChange("notify", event.target.checked)}
          />
          Notify the reporter with the assigned schedule and inspector name.
        </label>

        {effectivePriority === "high" ? (
          <div className="community-urgent-note">
            <FiAlertTriangle />
            Urgent priority — coordinate with Mauban Health Officer supervisor for immediate dispatch.
          </div>
        ) : null}

        <div className="community-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Scheduling..." : "Confirm Schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DayEventsModal({ day, events, onClose, onSelectReport, onOpenInspection }) {
  const formattedDate = day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="community-modal-backdrop" onClick={onClose}>
      <div className="community-day-modal" onClick={(e) => e.stopPropagation()}>
        <div className="community-day-modal-header">
          <div>
            <h2>{formattedDate}</h2>
            <p>{events.length} Scheduled Inspection(s) and Concern(s)</p>
          </div>
          <button type="button" onClick={onClose} className="community-close-btn">
            X
          </button>
        </div>
        <div className="community-day-modal-body">
          {events
            .slice()
            .sort((a, b) => (a.sortTime || a.time).localeCompare(b.sortTime || b.time))
            .map((evt, idx) => {
              const report = evt.raw;
              const isUrgent = report.priority === "high";
              const isStandard = report.priority === "medium";
              const priorityLabel = isUrgent ? "Urgent" : isStandard ? "Standard" : "Routine";
              const priorityClass = isUrgent ? "urgent" : isStandard ? "standard" : "routine";

              return (
                <div
                  key={idx}
                  className={`community-day-event-card type-${evt.type}`}
                  onClick={() => {
                    if (evt.type === "inspection" && onOpenInspection) {
                      onOpenInspection(evt.reportId);
                    } else {
                      onSelectReport(evt.reportId);
                    }
                  }}
                >
                  <div className="community-day-event-time">{evt.time}</div>
                  <div className="community-day-event-info">
                    <strong>{reportTitle(report)}</strong>
                    <small>
                      {report.category}{" "}
                      {report.assigned_inspector ? `• ${report.assigned_inspector}` : ""}
                    </small>
                  </div>
                  <div className="community-day-event-status">
                    {evt.type === "inspection" && (
                      <span className={`community-pill ${priorityClass}`}>
                        {priorityLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function InspectionDetailsModal({ report, onClose, onLocationClick }) {
  if (!report) return null;

  const dateStr = report.inspection_scheduled_date || new Date().toISOString().slice(0, 10);
  const dateObj = new Date(dateStr);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const shortMonth = dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = dateObj.getDate();

  const isUrgent = report.priority === "high";
  const isStandard = report.priority === "medium";
  const priorityLabel = isUrgent ? "Urgent (24–48h)" : isStandard ? "Standard" : "Routine";
  const priorityClass = isUrgent ? "urgent" : isStandard ? "standard" : "routine";
  const priorityBorderColor = isUrgent ? "#ef4444" : isStandard ? "#f59e0b" : "#10b981";

  return (
    <div className="community-modal-backdrop" onClick={onClose}>
      <div
        className="community-inspection-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTopColor: priorityBorderColor }}
      >
        <div className="community-inspection-modal-header">
          <div>
            <h2>{reportTitle(report)}</h2>
            <p>{report.category}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span className={`community-pill ${priorityClass}`}>
              {priorityLabel}
            </span>
            <button type="button" onClick={onClose} className="community-close-btn">
              X
            </button>
          </div>
        </div>

        <div className="community-inspection-modal-body">
          <div className="community-inspection-schedule-box">
            <div className="community-inspection-calendar-icon">
              <span>{shortMonth}</span>
              <strong>{day}</strong>
            </div>
            <div className="community-inspection-schedule-info">
              <small>SCHEDULED INSPECTION</small>
              <strong>{formattedDate}</strong>
              <span>
                <FiClock />{" "}
                {report.inspection_scheduled_time
                  ? report.inspection_scheduled_time.slice(0, 5)
                  : "TBD"}
              </span>
            </div>
          </div>

          <div className="community-inspection-grid">
            <div
              className="community-inspection-grid-item"
              onClick={onLocationClick}
              style={{ cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = "#0ea5e9")}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
              title="View exact location on GIS Map"
            >
              <small>
                <FiMapPin /> LOCATION
              </small>
              <strong>
                {report.establishment_name || report.barangay || "Community location"}
              </strong>
              <small style={{ color: "#0ea5e9", marginTop: "4px", fontWeight: "600" }}>
                View on Map &rarr;
              </small>
            </div>

            <div className="community-inspection-grid-item">
              <small>
                <FiUser /> ASSIGNED INSPECTOR
              </small>
              <strong>{report.assigned_inspector || "Unassigned"}</strong>
              <small style={{ color: "#64748b" }}>Mauban Health Office</small>
            </div>
          </div>

          {report.inspection_schedule_note ? (
            <div className="community-inspection-note-box">
              <small>INSPECTION NOTE</small>
              <p>{report.inspection_schedule_note}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function reportTitle(item) {
  return item.complainant_name || "Anonymous";
}

export function formatTime12h(timeStr) {
  if (!timeStr) return "";
  const parts = String(timeStr).split(":");
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  return timeStr;
}

export function formatReportTime(item) {
  if (item?.reported_time) {
    return item.reported_time;
  }
  if (item?.created_at) {
    try {
      const d = new Date(item.created_at);
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
    } catch {
      // ignore
    }
  }
  return "09:00";
}

export function formatReportTime12h(item) {
  if (item?.reported_time_12h) {
    return item.reported_time_12h;
  }
  if (item?.created_at) {
    try {
      const d = new Date(item.created_at);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      }
    } catch {
      // ignore
    }
  }
  return formatTime12h(item?.reported_time || "09:00");
}

function buildCalendarEvents(rows, calFilters = {}) {
  const {
    eventType = "all",
    reporterType = "all",
    priority = "all",
    status = "all",
  } = calFilters;

  return rows.flatMap((item) => {
    // Reporter filter
    const isNamed = Boolean(item.complainant_name && item.complainant_name.trim());
    if (reporterType === "named" && !isNamed) return [];
    if (reporterType === "anonymous" && isNamed) return [];

    // Priority filter
    if (priority !== "all" && item.priority !== priority) return [];

    // Status filter
    if (status !== "all" && item.status !== status) return [];

    const events = [];

    if (item.reported_date && (eventType === "all" || eventType === "report")) {
      const time24 = formatReportTime(item);
      const time12 = formatReportTime12h(item);
      events.push({
        date: item.reported_date,
        time: time12,
        sortTime: time24,
        type: "report",
        label: "Report",
        title: reportTitle(item),
        reportId: item.id,
        raw: item,
      });
    }

    if (
      item.inspection_scheduled_date &&
      (eventType === "all" || eventType === "inspection")) {
      const inspectionTime = item.inspection_scheduled_time
        ? item.inspection_scheduled_time.slice(0, 5)
        : "08:00";
      const time12 = formatTime12h(inspectionTime);
      events.push({
        date: item.inspection_scheduled_date,
        time: time12,
        sortTime: inspectionTime,
        type: "inspection",
        label: "Inspection",
        title: `${reportTitle(item)}${
          item.inspection_scheduled_time
            ? ` - ${time12}`
            : ""
        }`,
        reportId: item.id,
        raw: item,
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
  const lower = (category || "").toLowerCase();
  if (lower.includes("water") || lower.includes("hazard") || lower.includes("sewage"))
    return "water";
  if (lower.includes("market")) return "market";
  if (lower.includes("food")) return "food";
  if (lower.includes("waste") || lower.includes("garbage")) return "waste";
  if (lower.includes("pest")) return "pest";
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
