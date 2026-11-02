import { useEffect, useMemo, useState } from "react";
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
import LoadingOverlay from "../../shared/LoadingOverlay";

function getNextStageLabel(currentStage) {
  // The current backend still has a legacy intermediate stage. Request one
  // transition without presenting payment as an action the applicant must take.
  if (currentStage === "inspection_scheduled") return "Advance to next recorded stage";
  const idx = stageOptions.findIndex((s) => s.value === currentStage);
  if (idx >= 0 && idx < stageOptions.length - 2) {
    return `Proceed to: ${stageOptions[idx + 1].label}`;
  }
  return "Advance to Next Stage";
}

const stageOptions = [
  { value: "notice_sent", label: "Notice Sent" },
  { value: "application_filed", label: "Application Filed" },
  { value: "requirements_review", label: "Requirements Review" },
  { value: "inspection_scheduled", label: "Inspection Scheduled" },
  { value: "payment_pending", label: "Payment Pending (legacy workflow)" },
  { value: "approved", label: "Approved" },
  { value: "released", label: "Released" },
  { value: "lapsed", label: "Lapsed" },
];

function getStageLabel(stage, recordedLabel) {
  if (stage === "payment_pending") return "Payment Pending (legacy workflow)";
  return recordedLabel || stageOptions.find((item) => item.value === stage)?.label || stage;
}

const initialForm = {
  establishment: "",
  permit_type: "Sanitary Permit",
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
    refreshRenewalData,
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
  });
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");

  const formRequirementOptions = useMemo(
    () =>
      getEstablishmentRequirements(
        form.establishment,
        establishments,
        businessTypes
      ),
    [businessTypes, establishments, form.establishment]
  );

  useEffect(() => {
    if (!renewalData) {
      refreshRenewalData(filters);
    }
  }, [filters, refreshRenewalData, renewalData]);

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
        (filters.barangay === "all" || row.barangay === filters.barangay)
      );
    });
  }, [establishments, filters, rows]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "establishment") {
        next.submitted_requirements = [];
      }

      return next;
    });
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

  async function handleAdvance(row) {
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateRenewal(row.id, { action: "advance_stage" });
      if (updated) {
        setDetail((current) => (current && current.id === row.id ? { ...current, ...updated } : updated));
      }
      await refreshRenewalData(filters);
    } catch (requestError) {
      setActionError(requestError.message || "Unable to advance renewal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRelease(row) {
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateRenewal(row.id, { action: "mark_released" });
      if (updated) {
        setDetail((current) =>
          current && current.id === row.id
            ? { ...current, ...updated, stage: "released", stage_label: "Released" }
            : updated
        );
      }
      await refreshRenewalData(filters);
    } catch (requestError) {
      setActionError(requestError.message || "Unable to release renewal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolveOverdue(row) {
    setSaving(true);
    try {
      const updated = await updateRenewal(row.id, { action: "resolve_overdue" });
      if (updated) {
        setDetail((current) =>
          current && current.id === row.id ? { ...current, ...updated } : updated
        );
      }
      await refreshRenewalData(filters);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRequirementInDetail(row, requirement) {
    const currentSubmitted = row.submitted_requirements || [];
    const exists = currentSubmitted.includes(requirement);
    const nextSubmitted = exists
      ? currentSubmitted.filter((r) => r !== requirement)
      : [...currentSubmitted, requirement];

    setDetail((current) => ({
      ...current,
      submitted_requirements: nextSubmitted,
    }));

    try {
      await updateRenewal(row.id, {
        submitted_requirements: nextSubmitted,
      });
      await refreshRenewalData(filters);
    } catch {
      setDetail((current) => ({
        ...current,
        submitted_requirements: currentSubmitted,
      }));
    }
  }

  if (loading) {
    return <div className="renewal-page">Loading renewal records...</div>;
  }

  return (
    <div className="renewal-page">
      <LoadingOverlay visible={saving && isNewOpen} message="Filing permit renewal, please wait..." />
      <div className="renewal-header">
        <div>
          <h1>Sanitary Permit Renewal</h1>
          <p>Track permit renewals, review requirements, follow inspection stages, and release renewed permits.</p>
        </div>

        <button type="button" className="renewal-new-btn" onClick={() => setIsNewOpen(true)}>
          <FiRefreshCw />
          New Renewal
        </button>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}
      {actionError && !detail ? <p role="alert" className="sanitation-error-text">{actionError}</p> : null}

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
              <span>{getStageLabel(item.stage, item.label)}</span>
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
                  <td><span className={`renewal-stage-pill ${row.stage}`}>{getStageLabel(row.stage, row.stage_label)}</span></td>
                  <td>
                    <div className="renewal-progress"><b style={{ width: `${row.progress || 0}%` }} /></div>
                    <small>{row.progress || 0}%</small>
                  </td>
                  <td>
                    <div className="renewal-actions">
                      <button type="button" onClick={() => { setActionError(""); setDetail(row); }} title="View Full Details" disabled={saving}><FiEye /></button>
                      <button type="button" onClick={() => handleAdvance(row)} title={getNextStageLabel(row.stage)} disabled={saving}><FiSend /></button>
                      <button type="button" onClick={() => handleRelease(row)} title="Mark as Released" disabled={saving}><FiPackage /></button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" className="renewal-empty">No renewal records found.</td>
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
            </div>

            <div className="renewal-checklist">
              <span>Requirements Checklist</span>
              <div>
                {formRequirementOptions.length ? (
                  formRequirementOptions.map((requirement) => (
                    <label key={requirement}>
                      <input
                        type="checkbox"
                        checked={form.submitted_requirements.includes(requirement)}
                        onChange={() => toggleRequirement(requirement)}
                      />
                      {requirement}
                    </label>
                  ))
                ) : (
                  <label>
                    {form.establishment
                      ? "No requirements configured yet."
                      : "Select an establishment to load requirements."}
                  </label>
                )}
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
          establishments={establishments}
          businessTypes={businessTypes}
          onClose={() => setDetail(null)}
          onAdvance={() => handleAdvance(detail)}
          onRelease={() => handleRelease(detail)}
          onResolveOverdue={(r) => handleResolveOverdue(r)}
          onToggleRequirement={(r, req) => handleToggleRequirementInDetail(r, req)}
          saving={saving}
          actionError={actionError}
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

function RenewalDetailModal({
  row,
  establishments,
  businessTypes,
  onClose,
  onAdvance,
  onRelease,
  onResolveOverdue,
  onToggleRequirement,
  saving,
  actionError,
}) {
  const daysLeft = getDaysLeft(row.expiration_date);
  const isOverdue = daysLeft < 0 || row.stage === "lapsed";

  const submitted = row.submitted_requirements || [];
  const baseRequirements = getEstablishmentRequirements(
    row,
    establishments,
    businessTypes
  );

  // Union of baseRequirements and submitted (no requirement is ever omitted or mismatched)
  const allRequirements = Array.from(
    new Set([...baseRequirements, ...submitted])
  );

  const compliedCount = allRequirements.filter((r) => submitted.includes(r)).length;
  const progressPercent = allRequirements.length
    ? Math.round((compliedCount / allRequirements.length) * 100)
    : 100;

  return (
    <div className="renewal-modal-backdrop" onClick={onClose}>
      <div className="renewal-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="renewal-detail-title">
          <div>
            <h2>{row.establishment_name}</h2>
            <p>
              {row.renewal_id} • Permit #{row.permit_number} • {row.business_type_name}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <FiX />
          </button>
        </div>

        {/* OVERDUE ALERT BANNER */}
        {isOverdue && (
          <div className="renewal-overdue-banner">
            <div className="renewal-overdue-info">
              <FiAlertTriangle />
              <div>
                <strong>Overdue Application Warning</strong>
                <p>
                  Permit expired on {formatDate(row.expiration_date)} ({Math.abs(daysLeft)} days overdue).
                </p>
              </div>
            </div>
            <button
              type="button"
              className="renewal-overdue-btn"
              onClick={() => onResolveOverdue(row)}
              disabled={saving}
              title="Reset expiration to next year and restore good standing"
            >
              <FiRefreshCw /> ⚡ Clear Overdue &amp; Extend +1 Yr
            </button>
          </div>
        )}

        {/* DETAILS INFO GRID */}
        <div className="renewal-detail-info">
          <Info label="Establishment" value={row.establishment_name} />
          <Info label="Owner" value={row.owner_name} />
          <Info label="Barangay" value={row.barangay} />
          <Info
            label="Business Type"
            value={`${row.business_type_name} (${row.permit_size_label || "SP"})`}
          />
          <Info label="Expiration" value={formatDate(row.expiration_date)} />
          <Info
            label="Days Remaining"
            value={
              isOverdue ? (
                <span style={{ color: "#e11d48", fontWeight: "800" }}>
                  {Math.abs(daysLeft)}d overdue
                </span>
              ) : (
                <span style={{ color: "#059669", fontWeight: "700" }}>
                  {daysLeft}d left
                </span>
              )
            }
          />
        </div>

        {/* TIMELINE */}
        {row.stage === "payment_pending" ? (
          <p role="note">
            Recorded stage: Payment Pending (legacy workflow). No payment entry or
            confirmation is required here. Advance once to request the next stage
            from the server.
          </p>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            margin: "16px 0 8px",
          }}
        >
          <h3 style={{ margin: 0 }}>Renewal Pipeline Timeline</h3>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#047857" }}>
            Stage {stageOptions.findIndex((s) => s.value === row.stage) + 1} of{" "}
            {stageOptions.length - 1}
          </span>
        </div>
        <ol className="renewal-timeline">
          {stageOptions.map((stage, index) => {
            const currentIndex = stageOptions.findIndex(
              (item) => item.value === row.stage
            );
            return (
              <li
                key={stage.value}
                className={index <= currentIndex ? "done" : ""}
              >
                <span>{index + 1}</span>
                {stage.label}
              </li>
            );
          })}
        </ol>

        {/* REQUIREMENTS CHECKLIST REDESIGNED */}
        <div className="renewal-req-header-row">
          <h3>📋 Documentary Requirements Checklist</h3>
          <span
            className={`renewal-req-progress-badge ${
              compliedCount === allRequirements.length ? "" : "incomplete"
            }`}
          >
            {compliedCount} of {allRequirements.length} Completed ({progressPercent}%)
          </span>
        </div>
        <div className="renewal-req-progress-bar">
          <div
            className="renewal-req-progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="renewal-detail-requirements">
          {allRequirements.length === 0 ? (
            <p className="renewal-req-empty">No requirements configured yet.</p>
          ) : null}
          {allRequirements.map((requirement) => {
            const isComplied = submitted.includes(requirement);
            return (
              <div
                key={requirement}
                className={`renewal-req-item ${isComplied ? "complied" : ""}`}
                onClick={() => onToggleRequirement(row, requirement)}
                title="Click to toggle requirement status"
              >
                <div className="renewal-req-item-left">
                  <input
                    type="checkbox"
                    className="renewal-req-checkbox"
                    checked={isComplied}
                    onChange={() => onToggleRequirement(row, requirement)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="renewal-req-name">{requirement}</span>
                </div>
                <span
                  className={`renewal-req-status-pill ${
                    isComplied ? "submitted" : "pending"
                  }`}
                >
                  {isComplied ? "✅ Complied" : "⏳ Pending"}
                </span>
              </div>
            );
          })}
        </div>

        {/* REMARKS */}
        {row.remarks ? (
          <label className="renewal-field full" style={{ marginTop: "14px" }}>
            <span>Remarks &amp; Audit Log</span>
            <textarea value={row.remarks} readOnly style={{ minHeight: "58px" }} />
          </label>
        ) : null}

        {/* MODAL FOOTER ACTIONS */}
        {actionError ? <p role="alert" className="sanitation-error-text">{actionError}</p> : null}
        <div className="renewal-modal-actions" style={{ marginTop: "20px" }}>
          <button type="button" className="renewal-cancel" onClick={onClose}>
            Close
          </button>
          {row.stage !== "released" && row.stage !== "lapsed" ? (
            <button
              type="button"
              className="renewal-advance-btn"
              onClick={onAdvance}
              disabled={saving}
            >
              <FiSend /> {saving ? "Advancing..." : getNextStageLabel(row.stage)}
            </button>
          ) : null}
          {row.stage !== "released" && (
            <button
              type="button"
              className="renewal-submit"
              onClick={onRelease}
              disabled={saving}
            >
              <FiPackage /> Mark as Released
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function getEstablishmentRequirements(
  establishmentIdOrRow,
  establishments = [],
  businessTypes = []
) {
  let establishment = null;
  let businessTypeId = null;
  let permitSize = "sp";

  if (typeof establishmentIdOrRow === "object" && establishmentIdOrRow !== null) {
    const row = establishmentIdOrRow;
    establishment = establishments.find(
      (item) => String(item.id) === String(row.establishment)
    );
    businessTypeId =
      row.business_type_id ||
      establishment?.business_type ||
      row.establishment_business_type;
    permitSize = String(
      row.permit_size || establishment?.permit_size || "sp"
    ).toLowerCase();
  } else {
    establishment = establishments.find(
      (item) => String(item.id) === String(establishmentIdOrRow)
    );
    businessTypeId = establishment?.business_type;
    permitSize = String(establishment?.permit_size || "sp").toLowerCase();
  }

  const businessType = businessTypes.find(
    (item) =>
      String(item.id) === String(businessTypeId) ||
      (establishment?.business_type_name &&
        item.name?.toLowerCase() === establishment.business_type_name.toLowerCase())
  );

  const matched = (businessType?.requirements || [])
    .filter((req) => {
      const reqSize = String(req.permit_size || "sp").toLowerCase();
      if (permitSize === "large" || permitSize === "bp") {
        return reqSize === "large" || reqSize === "bp";
      }
      return reqSize === "sp" || reqSize === "small";
    })
    .map((req) => req.requirement_name);

  if (matched.length > 0) {
    return matched;
  }

  if (businessType?.requirements?.length) {
    return businessType.requirements.map((req) => req.requirement_name);
  }

  // No requirements configured for this type (or no establishment selected).
  // Never substitute a generic list: the official requirements for such a type
  // (e.g. Ambulant Food Vendor) have not been provided yet.
  return [];
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

export default PermitRenewal;
