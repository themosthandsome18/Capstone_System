import { useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiEye,
  FiFileText,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiX,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

const stageOptions = [
  { value: "notice_sent", label: "Notice Sent" },
  { value: "application_filed", label: "Application Filed" },
  { value: "requirements_review", label: "Requirements Review" },
  { value: "inspection_scheduled", label: "Inspection Scheduled" },
  { value: "payment_pending", label: "Payment Pending" },
  { value: "approved", label: "Approved" },
  { value: "released", label: "Released" },
  { value: "lapsed", label: "Lapsed" },
];

const paymentOptions = [
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
];

const requirementOptions = [
  "Previous permit copy",
  "Updated health certificates",
  "Water potability test",
  "Pest Control Certificate",
  "Waste Management MOA",
  "Recent Inspection Report",
];

const initialForm = {
  establishment: "",
  permit_type: "Sanitary Permit",
  renewal_fee: "500",
  submitted_requirements: [],
  remarks: "",
  photo_documentation: "",
};

function PermitRenewal() {
  const {
    businessTypes,
    establishments,
    renewalData,
    loading,
    error,
    createRenewal,
    updateRenewal,
  } = useSanitationData();

  const rows = useMemo(() => renewalData?.rows || [], [renewalData]);
  const summary = renewalData?.summary || {};
  const stageCounts = renewalData?.stageCounts || [];
  const barangays = renewalData?.barangays || [];

  const [filters, setFilters] = useState({
    search: "",
    stage: "all",
    business_type_id: "all",
    barangay: "all",
    payment_status: "all",
  });
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const filteredRows = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      const searchText = [
        row.renewal_id,
        row.permit_number,
        row.establishment_name,
        row.owner_name,
        row.business_type_name,
        row.barangay,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchText.includes(keyword) &&
        (filters.stage === "all" || row.stage === filters.stage) &&
        (filters.business_type_id === "all" ||
          String(row.establishment_business_type) === filters.business_type_id ||
          String(
            establishments.find((item) => item.id === row.establishment)?.business_type
          ) === filters.business_type_id) &&
        (filters.barangay === "all" || row.barangay === filters.barangay) &&
        (filters.payment_status === "all" ||
          row.payment_status === filters.payment_status)
      );
    });
  }, [establishments, filters, rows]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleRequirement(requirement) {
    setForm((current) => {
      const exists = current.submitted_requirements.includes(requirement);
      return {
        ...current,
        submitted_requirements: exists
          ? current.submitted_requirements.filter((item) => item !== requirement)
          : [...current.submitted_requirements, requirement],
      };
    });
  }

  async function handleCreateRenewal(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const establishment = establishments.find(
        (item) => String(item.id) === String(form.establishment)
      );

      if (!establishment) {
        setFormError("Please select an establishment.");
        return;
      }

      await createRenewal({
        establishment: Number(form.establishment),
        permit_number: establishment.permit_number || `SP-${new Date().getFullYear()}`,
        permit_type: form.permit_type,
        expiration_date:
          establishment.permit_expiry_date || new Date().toISOString().slice(0, 10),
        stage: "application_filed",
        renewal_fee: Number(form.renewal_fee || 0),
        payment_status: "unpaid",
        submitted_requirements: form.submitted_requirements,
        remarks: form.remarks,
        photo_documentation: form.photo_documentation,
      });

      setForm(initialForm);
      setIsNewOpen(false);
    } catch (requestError) {
      setFormError(requestError.message || "Unable to file renewal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(row, action) {
    setSaving(true);

    try {
      await updateRenewal(row.id, { action });
      setDetail(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="renewal-page">Loading renewal records...</div>;
  }

  return (
    <div className="renewal-page">
      <div className="renewal-header">
        <div>
          <h1>Sanitary Permit Renewal</h1>
          <p>Track permit renewals, review requirements, schedule inspection, process payments, and release renewed permits.</p>
        </div>

        <button type="button" className="renewal-new-btn" onClick={() => setIsNewOpen(true)}>
          <FiRefreshCw />
          New Renewal
        </button>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="renewal-stat-grid">
        <RenewalStat label="Total Renewals" value={summary.totalRenewals || 0} icon={<FiFileText />} />
        <RenewalStat label="Due for Renewal" value={summary.dueForRenewal || 0} icon={<FiCalendar />} />
        <RenewalStat label="In Progress" value={summary.inProgress || 0} icon={<FiRefreshCw />} />
        <RenewalStat label="Expired" value={summary.expired || 0} icon={<FiAlertTriangle />} danger />
        <RenewalStat label="Released" value={summary.released || 0} icon={<FiCheckCircle />} />
      </div>

      <div className="renewal-filter-card">
        <div className="renewal-search">
          <FiSearch />
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search by ID, permit, establishment, owner"
          />
        </div>

        <select value={filters.stage} onChange={(event) => updateFilter("stage", event.target.value)}>
          <option value="all">All renewal stages</option>
          {stageOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>

        <select value={filters.business_type_id} onChange={(event) => updateFilter("business_type_id", event.target.value)}>
          <option value="all">All business types</option>
          {businessTypes.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>

        <select value={filters.barangay} onChange={(event) => updateFilter("barangay", event.target.value)}>
          <option value="all">All barangays</option>
          {barangays.map((barangay) => (
            <option key={barangay} value={barangay}>{barangay}</option>
          ))}
        </select>

        <select value={filters.payment_status} onChange={(event) => updateFilter("payment_status", event.target.value)}>
          <option value="all">All payment status</option>
          {paymentOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <section className="renewal-pipeline-card">
        <h2>Renewal Pipeline</h2>
        <div className="renewal-pipeline-grid">
          {stageCounts.map((item) => (
            <button
              type="button"
              key={item.stage}
              className={`renewal-stage-tile ${filters.stage === item.stage ? "active" : ""}`}
              onClick={() => updateFilter("stage", item.stage)}
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
              <small>applications</small>
            </button>
          ))}
        </div>
      </section>

      <section className="renewal-table-card">
        <table>
          <thead>
            <tr>
              <th>Renewal ID</th>
              <th>Permit No.</th>
              <th>Establishment</th>
              <th>Business Type</th>
              <th>Barangay</th>
              <th>Expiration</th>
              <th>Days Left</th>
              <th>Stage</th>
              <th>Progress</th>
              <th>Fee</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.renewal_id}</td>
                  <td>{row.permit_number}</td>
                  <td><strong>{row.establishment_name}</strong><small>{row.owner_name}</small></td>
                  <td>{row.business_type_name}</td>
                  <td>{row.barangay}</td>
                  <td>{formatDate(row.expiration_date)}</td>
                  <td className={getDaysLeft(row.expiration_date) < 0 ? "days-late" : ""}>{formatDaysLeft(row.expiration_date)}</td>
                  <td><span className={`renewal-stage-pill ${row.stage}`}>{row.stage_label}</span></td>
                  <td>
                    <div className="renewal-progress"><b style={{ width: `${row.progress || 0}%` }} /></div>
                    <small>{row.progress || 0}%</small>
                  </td>
                  <td>{formatMoney(row.renewal_fee)}</td>
                  <td><span className={`renewal-payment ${row.payment_status}`}>{row.payment_status_label}</span></td>
                  <td>
                    <div className="renewal-actions">
                      <button type="button" onClick={() => setDetail(row)} title="View"><FiEye /></button>
                      <button type="button" onClick={() => handleAction(row, "advance_stage")} title="Advance Stage"><FiSend /></button>
                      <button type="button" onClick={() => handleAction(row, "mark_released")} title="Mark Released"><FiPackage /></button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="12" className="renewal-empty">No renewal records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {isNewOpen ? (
        <div className="renewal-modal-backdrop">
          <form className="renewal-form-modal" onSubmit={handleCreateRenewal}>
            <div className="renewal-modal-title">
              <div>
                <h2>File New Renewal Application</h2>
                <p>Start a renewal for an existing sanitary permit.</p>
              </div>
              <button type="button" onClick={() => setIsNewOpen(false)}><FiX /></button>
            </div>

            <label className="renewal-field full">
              <span>Establishment</span>
              <select value={form.establishment} onChange={(event) => updateForm("establishment", event.target.value)} required>
                <option value="">Select establishment</option>
                {establishments.map((item) => (
                  <option key={item.id} value={item.id}>{item.business_name}</option>
                ))}
              </select>
            </label>

            <div className="renewal-form-grid">
              <label className="renewal-field">
                <span>Permit Type</span>
                <select value={form.permit_type} onChange={(event) => updateForm("permit_type", event.target.value)}>
                  <option>Sanitary Permit</option>
                  <option>Health Permit</option>
                </select>
              </label>
              <label className="renewal-field">
                <span>Renewal Fee (P)</span>
                <input type="number" min="0" value={form.renewal_fee} onChange={(event) => updateForm("renewal_fee", event.target.value)} />
              </label>
            </div>

            <div className="renewal-checklist">
              <span>Requirements Checklist</span>
              <div>
                {requirementOptions.map((requirement) => (
                  <label key={requirement}>
                    <input
                      type="checkbox"
                      checked={form.submitted_requirements.includes(requirement)}
                      onChange={() => toggleRequirement(requirement)}
                    />
                    {requirement}
                  </label>
                ))}
              </div>
            </div>

            <label className="renewal-field full">
              <span>Remarks</span>
              <textarea value={form.remarks} onChange={(event) => updateForm("remarks", event.target.value)} placeholder="Notes about this renewal application..." />
            </label>

            <label className="renewal-upload">
              <span><FiFileText /> Photo Documentation (optional)</span>
              <input value={form.photo_documentation} onChange={(event) => updateForm("photo_documentation", event.target.value)} placeholder="Paste photo filename or reference" />
            </label>

            {formError ? <p className="sanitation-error-text">{formError}</p> : null}

            <div className="renewal-modal-actions">
              <button type="button" className="renewal-cancel" onClick={() => setIsNewOpen(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="renewal-submit" disabled={saving}><FiSend /> {saving ? "Filing..." : "File Renewal"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {detail ? (
        <RenewalDetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onAdvance={() => handleAction(detail, "advance_stage")}
          onRelease={() => handleAction(detail, "mark_released")}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function RenewalStat({ label, value, icon, danger = false }) {
  return (
    <div className={`renewal-stat-card ${danger ? "danger" : ""}`}>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
      </div>
      {icon}
    </div>
  );
}

function RenewalDetailModal({ row, onClose, onAdvance, onRelease, saving }) {
  const submitted = row.submitted_requirements || [];

  return (
    <div className="renewal-modal-backdrop">
      <div className="renewal-detail-modal">
        <div className="renewal-detail-title">
          <div>
            <h2>{row.establishment_name}</h2>
            <p>{row.renewal_id} - Permit {row.permit_number}</p>
          </div>
          <button type="button" onClick={onClose}><FiX /></button>
        </div>

        <div className="renewal-detail-info">
          <Info label="Establishment" value={row.establishment_name} />
          <Info label="Owner" value={row.owner_name} />
          <Info label="Barangay" value={row.barangay} />
          <Info label="Business Type" value={row.business_type_name} />
          <Info label="Expiration" value={formatDate(row.expiration_date)} />
          <Info label="Days Remaining" value={formatDaysLeft(row.expiration_date)} />
        </div>

        <h3>Renewal Timeline</h3>
        <ol className="renewal-timeline">
          {stageOptions.map((stage, index) => {
            const currentIndex = stageOptions.findIndex((item) => item.value === row.stage);
            return (
              <li key={stage.value} className={index <= currentIndex ? "done" : ""}>
                <span>{index + 1}</span>
                {stage.label}
              </li>
            );
          })}
        </ol>

        <h3>Submitted Requirements</h3>
        <div className="renewal-detail-requirements">
          {requirementOptions.map((requirement) => (
            <span key={requirement} className={submitted.includes(requirement) ? "done" : ""}>
              <FiCheckCircle />
              {requirement}
            </span>
          ))}
        </div>

        <div className="renewal-detail-bottom">
          <div>
            <strong>Inspection Status</strong>
            <p>{row.inspection_status || "No inspection status yet."}</p>
          </div>
          <div>
            <strong>Payment Details</strong>
            <p>Renewal Fee: {formatMoney(row.renewal_fee)}</p>
            <p>Status: {row.payment_status_label}</p>
          </div>
        </div>

        <label className="renewal-field full">
          <span>Remarks</span>
          <textarea value={row.remarks || ""} readOnly />
        </label>

        <div className="renewal-modal-actions">
          <button type="button" className="renewal-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="renewal-cancel" onClick={onAdvance} disabled={saving}>Advance Stage</button>
          <button type="button" className="renewal-submit" onClick={onRelease} disabled={saving}><FiPackage /> Mark as Released</button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "--";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function getDaysLeft(value) {
  if (!value) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${value}T00:00:00`) - today) / 86400000);
}

function formatDaysLeft(value) {
  const days = getDaysLeft(value);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `${days}d`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default PermitRenewal;
