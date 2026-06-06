import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiEdit2,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

const emptyForm = {
  establishment: "",
  complainant_name: "",
  contact_number: "",
  category: "Food handling concern",
  barangay: "",
  reported_date: new Date().toISOString().slice(0, 10),
  status: "pending",
  priority: "medium",
  description: "",
  action_taken: "",
  resolved_date: "",
};

function ComplaintsManagement() {
  const {
    complaintData,
    establishments,
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");

  const rows = complaintData?.rows || [];
  const summary = complaintData?.summary || {};
  const barangays = complaintData?.barangays || buildBarangays(establishments);
  const byCategory = complaintData?.byCategory || [];
  const maxCategory = Math.max(...byCategory.map((item) => item.total || 0), 1);

  useEffect(() => {
    let mounted = true;

    if (!complaintData) {
      refreshComplaintData(filters).catch((requestError) => {
        if (mounted) {
          setPageError(
            requestError.message || "Unable to load complaint records."
          );
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [complaintData, filters, refreshComplaintData]);

  const establishmentOptions = useMemo(
    () =>
      [...establishments].sort((a, b) =>
        a.business_name.localeCompare(b.business_name)
      ),
    [establishments]
  );

  async function applyFilters(nextFilters) {
    setFilters(nextFilters);
    setPageError("");

    try {
      await refreshComplaintData(nextFilters);
    } catch (requestError) {
      setPageError(requestError.message || "Unable to filter complaint records.");
    }
  }

  function openCreateModal() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(item) {
    setEditing(item);
    setForm({
      establishment: item.establishment || "",
      complainant_name: item.complainant_name || "",
      contact_number: item.contact_number || "",
      category: item.category || "Food handling concern",
      barangay: item.barangay || "",
      reported_date: item.reported_date || emptyForm.reported_date,
      status: item.status || "pending",
      priority: item.priority || "medium",
      description: item.description || "",
      action_taken: item.action_taken || "",
      resolved_date: item.resolved_date || "",
    });
    setModalOpen(true);
  }

  function updateField(field, value) {
    const selectedEstablishment =
      field === "establishment"
        ? establishments.find((item) => String(item.id) === String(value))
        : null;

    setForm((current) => ({
      ...current,
      [field]: value,
      barangay: selectedEstablishment
        ? selectedEstablishment.barangay
        : current.barangay,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      establishment: form.establishment || null,
      resolved_date: form.resolved_date || null,
    };

    try {
      if (editing) {
        await updateComplaint(editing.id, payload);
      } else {
        await createComplaint(payload);
      }

      setModalOpen(false);
      setPageError("");
    } catch (requestError) {
      setPageError(requestError.message || "Unable to save complaint record.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    const confirmed = window.confirm(
      `Delete complaint ${item.complaint_id}?`
    );

    if (confirmed) {
      try {
        await deleteComplaint(item.id);
        setPageError("");
      } catch (requestError) {
        setPageError(requestError.message || "Unable to delete complaint record.");
      }
    }
  }

  function handlePrintReport(item) {
    setSelectedReport(item);
    setTimeout(() => window.print(), 50);
  }

  if (loading) {
    return <div className="complaints-page">Loading complaints...</div>;
  }

  return (
    <div className="complaints-page">
      <div className="complaints-header">
        <div>
          <h1>Complaint Management</h1>
          <p>Track sanitation complaints, investigation status, and actions taken</p>
        </div>

        <button type="button" className="complaint-primary-btn" onClick={openCreateModal}>
          <FiPlus />
          New Complaint
        </button>
      </div>

      {error || pageError ? (
        <p className="sanitation-error-text">{pageError || error}</p>
      ) : null}

      <div className="complaint-stat-grid">
        <ComplaintStat label="Total Complaints" value={summary.total || 0} />
        <ComplaintStat label="Pending" value={summary.pending || 0} color="orange" />
        <ComplaintStat
          label="Under Investigation"
          value={summary.investigating || 0}
          color="blue"
        />
        <ComplaintStat label="Resolved" value={summary.resolved || 0} color="green" />
        <ComplaintStat
          label="High Priority"
          value={summary.highPriority || 0}
          color="red"
        />
      </div>

      <section className="complaints-visual-grid">
        <div className="complaints-panel">
          <h2>Complaint Categories</h2>
          <div className="complaint-category-bars">
            {byCategory.length ? (
              byCategory.slice(0, 8).map((item) => (
                <div className="complaint-bar-row" key={item.name}>
                  <span>{item.name}</span>
                  <div>
                    <b style={{ width: `${Math.max(8, (item.total / maxCategory) * 100)}%` }} />
                  </div>
                  <strong>{item.total}</strong>
                </div>
              ))
            ) : (
              <p className="submission-empty">No complaint categories yet.</p>
            )}
          </div>
        </div>

        <div className="complaints-panel">
          <h2>Status Workflow</h2>
          <div className="complaint-status-flow">
            <StatusStep label="Pending" value={summary.pending || 0} />
            <StatusStep label="Investigating" value={summary.investigating || 0} />
            <StatusStep label="Resolved" value={summary.resolved || 0} />
            <StatusStep label="Rejected" value={summary.rejected || 0} />
          </div>
        </div>
      </section>

      <section className="complaints-table-card">
        <div className="complaints-toolbar">
          <label className="complaint-search">
            <FiSearch />
            <input
              value={filters.search}
              onChange={(event) =>
                applyFilters({ ...filters, search: event.target.value })
              }
              placeholder="Search complaint, establishment, barangay"
            />
          </label>

          <select
            value={filters.status}
            onChange={(event) => applyFilters({ ...filters, status: event.target.value })}
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="investigating">Under Investigation</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={filters.priority}
            onChange={(event) => applyFilters({ ...filters, priority: event.target.value })}
          >
            <option value="all">All priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={filters.barangay}
            onChange={(event) => applyFilters({ ...filters, barangay: event.target.value })}
          >
            <option value="all">All barangays</option>
            {barangays.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>

        <div className="complaints-table-wrap">
          <table className="complaints-table">
            <thead>
              <tr>
                <th>Complaint</th>
                <th>Establishment</th>
                <th>Category</th>
                <th>Barangay</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Reported</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.length ? (
                rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.complaint_id}</strong>
                      <small>{item.complainant_name || "Anonymous"}</small>
                    </td>
                    <td>
                      <strong>{item.establishment_name || "Unlinked"}</strong>
                      <small>{item.business_type_name || "Barangay complaint"}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.barangay}</td>
                    <td>
                      <span className={`complaint-pill ${item.status}`}>
                        {item.status_label}
                      </span>
                    </td>
                    <td>
                      <span className={`complaint-priority ${item.priority}`}>
                        {item.priority_label}
                      </span>
                    </td>
                    <td>{item.reported_date}</td>
                    <td>
                      <div className="complaint-row-actions">
                        <button type="button" onClick={() => openEditModal(item)}>
                          <FiEdit2 />
                        </button>
                        <button type="button" onClick={() => handlePrintReport(item)}>
                          <FiPrinter />
                        </button>
                        <button type="button" onClick={() => handleDelete(item)}>
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="submission-empty">
                    No complaints found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="complaint-modal-backdrop">
          <form className="complaint-modal" onSubmit={handleSubmit}>
            <div className="complaint-modal-title">
              <div>
                <h2>{editing ? "Update Complaint" : "File New Complaint"}</h2>
                <p>Record the report, status, priority, and action taken.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)}>
                x
              </button>
            </div>

            <div className="complaint-form-grid">
              <label>
                Establishment
                <select
                  value={form.establishment}
                  onChange={(event) => updateField("establishment", event.target.value)}
                >
                  <option value="">Unlinked complaint</option>
                  {establishmentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.business_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Category
                <select
                  value={form.category}
                  onChange={(event) => updateField("category", event.target.value)}
                >
                  <option>Food handling concern</option>
                  <option>Improper waste disposal</option>
                  <option>Expired sanitary permit</option>
                  <option>Water potability concern</option>
                  <option>Unclean preparation area</option>
                  <option>Pest control concern</option>
                </select>
              </label>

              <label>
                Complainant
                <input
                  value={form.complainant_name}
                  onChange={(event) => updateField("complainant_name", event.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label>
                Contact Number
                <input
                  value={form.contact_number}
                  onChange={(event) => updateField("contact_number", event.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label>
                Barangay
                <input
                  value={form.barangay}
                  onChange={(event) => updateField("barangay", event.target.value)}
                  required
                />
              </label>

              <label>
                Reported Date
                <input
                  type="date"
                  value={form.reported_date}
                  onChange={(event) => updateField("reported_date", event.target.value)}
                  required
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="investigating">Under Investigation</option>
                  <option value="resolved">Resolved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>

              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={(event) => updateField("priority", event.target.value)}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>

            <label className="complaint-wide-field">
              Description
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                required
                placeholder="Describe the sanitation complaint..."
              />
            </label>

            <label className="complaint-wide-field">
              Action Taken
              <textarea
                value={form.action_taken}
                onChange={(event) => updateField("action_taken", event.target.value)}
                placeholder="Inspection notes, reminders, or correction issued..."
              />
            </label>

            <div className="complaint-modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save Changes" : "File Complaint"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedReport ? (
        <section className="complaint-print-report">
          <h1>Sanitation Complaint Report</h1>
          <div className="complaint-report-grid">
            <p><strong>Complaint ID:</strong> {selectedReport.complaint_id}</p>
            <p><strong>Establishment:</strong> {selectedReport.establishment_name || "Unlinked"}</p>
            <p><strong>Barangay:</strong> {selectedReport.barangay}</p>
            <p><strong>Category:</strong> {selectedReport.category}</p>
            <p><strong>Status:</strong> {selectedReport.status_label}</p>
            <p><strong>Priority:</strong> {selectedReport.priority_label}</p>
            <p><strong>Reported:</strong> {selectedReport.reported_date}</p>
            <p><strong>Resolved:</strong> {selectedReport.resolved_date || "Not yet resolved"}</p>
          </div>
          <h2>Timeline</h2>
          <ol className="complaint-timeline">
            <li><strong>Filed</strong><span>{selectedReport.reported_date}</span></li>
            <li><strong>Status Updated</strong><span>{selectedReport.status_label}</span></li>
            <li><strong>Action Taken</strong><span>{selectedReport.action_taken || "For sanitary follow-up"}</span></li>
            <li><strong>Resolution</strong><span>{selectedReport.resolved_date || "Pending"}</span></li>
          </ol>
          <h2>Description</h2>
          <p>{selectedReport.description}</p>
        </section>
      ) : null}
    </div>
  );
}

function ComplaintStat({ label, value, color = "green" }) {
  return (
    <div className={`complaint-stat-card ${color}`}>
      <p>{label}</p>
      <h2>{value}</h2>
      {color === "green" ? <FiCheckCircle /> : <FiAlertTriangle />}
    </div>
  );
}

function StatusStep({ label, value }) {
  return (
    <div className="complaint-status-step">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function buildBarangays(establishments) {
  return [...new Set(establishments.map((item) => item.barangay).filter(Boolean))].sort();
}

export default ComplaintsManagement;
