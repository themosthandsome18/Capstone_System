import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFileText,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import LocationPicker from "../../shared/LocationPicker";
import { useSanitationData } from "../context/SanitationDataContext";
import { QRCodeSVG } from "qrcode.react";

const initialForm = {
  business_name: "",
  owner_name: "",
  business_type: "",
  permit_size: "sp",
  barangay: "",
  address: "",
  contact_number: "",
  has_permit: true,
  permit_number: "",
  permit_issued_date: "",
  permit_expiry_date: "",
  compliance_status: "good_standing",
  permit_status: "active",
  latitude: "",
  longitude: "",
  remarks: "",
};

const statusOptions = [
  { value: "good_standing", label: "Good Standing" },
  { value: "upcoming", label: "Upcoming" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
  { value: "no_permit", label: "No Permit" },
];

const permitStatusOptions = [
  { value: "active", label: "Active" },
  { value: "renewal_due", label: "Active - Renewal Due" },
  { value: "conditional", label: "Conditional" },
  { value: "suspended", label: "Suspended" },
  { value: "no_permit", label: "No Permit" },
];

function EstablishmentRecords() {
  const {
    establishments,
    businessTypes,
    inspections,
    complaintData,
    renewalData,
    loading,
    error,
    createEstablishment,
    updateEstablishment,
    deleteEstablishment,
  } = useSanitationData();

  const [showModal, setShowModal] = useState(false);
  const [editingEstablishment, setEditingEstablishment] = useState(null);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("all");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("all");
  const [permitFilter, setPermitFilter] = useState("all");
  const [selectedEstablishment, setSelectedEstablishment] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const complaintRows = useMemo(() => complaintData?.rows || [], [complaintData]);
  const renewalRows = useMemo(() => renewalData?.rows || [], [renewalData]);
  const barangayOptions = useMemo(
    () =>
      [...new Set(establishments.map((item) => item.barangay).filter(Boolean))].sort(),
    [establishments]
  );
  const selectedTimeline = useMemo(() => {
    if (!selectedEstablishment) {
      return [];
    }

    return buildEstablishmentTimeline(
      selectedEstablishment,
      inspections,
      complaintRows,
      renewalRows
    );
  }, [complaintRows, inspections, renewalRows, selectedEstablishment]);

  const filteredEstablishments = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return establishments.filter((item) => {
      const searchText = [
        item.business_name,
        item.owner_name,
        item.business_type_name,
        item.barangay,
        item.address,
        item.permit_number,
        item.compliance_status_label,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchText.includes(keyword);
      const matchesStatus =
        statusFilter === "all" || item.compliance_status === statusFilter;
      const matchesBarangay =
        barangayFilter === "all" || item.barangay === barangayFilter;
      const matchesType =
        businessTypeFilter === "all" ||
        String(item.business_type) === String(businessTypeFilter);
      const matchesPermit =
        permitFilter === "all" || item.permit_status === permitFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesBarangay &&
        matchesType &&
        matchesPermit
      );
    });
  }, [
    barangayFilter,
    businessTypeFilter,
    establishments,
    permitFilter,
    search,
    statusFilter,
  ]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openModal() {
    setEditingEstablishment(null);
    setForm(initialForm);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(establishment) {
    setEditingEstablishment(establishment);

    setForm({
      business_name: establishment.business_name || "",
      owner_name: establishment.owner_name || "",
      business_type: establishment.business_type || "",
      permit_size: establishment.permit_size || "sp",
      barangay: establishment.barangay || "",
      address: establishment.address || "",
      contact_number: establishment.contact_number || "",
      has_permit: Boolean(establishment.has_permit),
      permit_number: establishment.permit_number || "",
      permit_issued_date: establishment.permit_issued_date || "",
      permit_expiry_date: establishment.permit_expiry_date || "",
      compliance_status: establishment.compliance_status || "good_standing",
      permit_status: establishment.permit_status || "active",
      latitude: establishment.latitude ?? "",
      longitude: establishment.longitude ?? "",
      remarks: establishment.remarks || "",
    });

    setFormError("");
    setShowModal(true);
  }

  function openDetailModal(establishment) {
    setSelectedEstablishment(establishment);
  }

  function closeDetailModal() {
    setSelectedEstablishment(null);
  }

  function editSelectedEstablishment() {
    const target = selectedEstablishment;

    setSelectedEstablishment(null);

    if (target) {
      openEditModal(target);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingEstablishment(null);
    setForm(initialForm);
    setFormError("");
  }

  function getSelectedBusinessType() {
    return businessTypes.find(
      (type) => String(type.id) === String(form.business_type)
    );
  }

  function getAutoRequirements() {
    const selectedType = getSelectedBusinessType();

    if (!selectedType) {
      return [];
    }

    return (selectedType.requirements || []).filter(
      (requirement) => requirement.permit_size === form.permit_size
    );
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

    return requestError?.message || "Unable to save establishment.";
  }

  function buildPayload() {
    const hasPermit = Boolean(form.has_permit);

    return {
      business_name: form.business_name.trim(),
      owner_name: form.owner_name.trim(),
      business_type: Number(form.business_type),
      permit_size: form.permit_size,
      barangay: form.barangay.trim(),
      address: form.address.trim(),
      contact_number: form.contact_number.trim(),
      has_permit: hasPermit,
      permit_number: hasPermit ? form.permit_number.trim() : "",
      permit_issued_date:
        hasPermit && form.permit_issued_date ? form.permit_issued_date : null,
      permit_expiry_date:
        hasPermit && form.permit_expiry_date ? form.permit_expiry_date : null,
      compliance_status: hasPermit ? form.compliance_status : "no_permit",
      permit_status: hasPermit ? form.permit_status : "no_permit",
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      remarks: form.remarks.trim(),
    };
  }

  function validatePayload(payload) {
    if (!payload.business_name) {
      return "Business name is required.";
    }

    if (!payload.owner_name) {
      return "Owner / proprietor is required.";
    }

    if (!payload.business_type) {
      return "Business type is required.";
    }

    if (!payload.barangay) {
      return "Barangay is required.";
    }

    if (!payload.address) {
      return "Address is required.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = buildPayload();
    const validationError = validatePayload(payload);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editingEstablishment) {
        await updateEstablishment(editingEstablishment.id, payload);
      } else {
        await createEstablishment(payload);
      }

      closeModal();
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(establishment) {
    const confirmed = window.confirm(
      `Delete ${establishment.business_name}? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteEstablishment(establishment.id);
      if (selectedEstablishment?.id === establishment.id) {
        setSelectedEstablishment(null);
      }
    } catch (requestError) {
      alert(getErrorMessage(requestError));
    }
  }

  function handleExport() {
    const headers = [
      "Business Name",
      "Owner",
      "Business Type",
      "Permit Size",
      "Permit Number",
      "Barangay",
      "Address",
      "Contact Number",
      "Permit Status",
      "Compliance Status",
      "Remarks",
    ];
    const rows = filteredEstablishments.map((item) => [
      item.business_name,
      item.owner_name,
      item.business_type_name,
      item.permit_size_label || item.permit_size?.toUpperCase(),
      item.permit_number,
      item.barangay,
      item.address,
      item.contact_number,
      item.permit_status_label,
      item.compliance_status_label,
      item.remarks,
    ]);

    exportCsv(datedCsvFilename("sanitary-establishments"), headers, rows);
  }

  if (loading) {
    return <div className="establishment-page">Loading establishments...</div>;
  }

  return (
    <div className="establishment-page">
      <div className="establishment-header">
        <div>
          <h1>Establishment Records</h1>
          <p>Manage and monitor all registered establishments</p>
        </div>

        <div className="sanitation-header-actions">
          <button
            type="button"
            className="sanitation-export-btn"
            onClick={handleExport}
          >
            <FiDownload /> Export CSV
          </button>

          <button
            type="button"
            className="add-establishment-btn"
            onClick={openModal}
          >
            <FiPlus /> Add Establishment
          </button>
        </div>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <section className="establishment-table-card">
        <div className="establishment-tools">
          <div className="establishment-search">
            <FiSearch />
            <input
              type="text"
              placeholder="Search by name, owner, type, or barangay..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
          >
            <option value="all">All Barangays</option>
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>

          <select
            value={businessTypeFilter}
            onChange={(event) => setBusinessTypeFilter(event.target.value)}
          >
            <option value="all">All Business Types</option>
            {businessTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>

          <select
            value={permitFilter}
            onChange={(event) => setPermitFilter(event.target.value)}
          >
            <option value="all">All Permit Statuses</option>
            {permitStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Business Name</th>
              <th>Owner</th>
              <th>Type</th>
              <th>Permit</th>
              <th>Address</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredEstablishments.length ? (
              filteredEstablishments.map((item) => (
                <tr key={item.id}>
                  <td>{item.business_name}</td>
                  <td>{item.owner_name}</td>
                  <td>{item.business_type_name}</td>
                  <td>
                    <span className="permit-badge">
                      {item.permit_size_label || item.permit_size?.toUpperCase()}
                    </span>
                  </td>
                  <td>{item.address}</td>
                  <td>
                    <span
                      className={`status-pill ${statusClass(
                        item.compliance_status_label
                      )}`}
                    >
                      {item.compliance_status_label}
                    </span>
                  </td>
                  <td>
                    <div className="establishment-action-buttons">
                      <button
                        type="button"
                        className="establishment-icon-btn view"
                        title="View establishment timeline"
                        onClick={() => openDetailModal(item)}
                      >
                        <FiEye />
                      </button>

                      <button
                        type="button"
                        className="establishment-icon-btn edit"
                        title="Edit establishment"
                        onClick={() => openEditModal(item)}
                      >
                        <FiEdit2 />
                      </button>

                      <button
                        type="button"
                        className="establishment-icon-btn delete"
                        title="Delete establishment"
                        onClick={() => handleDelete(item)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="establishment-empty">
                  No establishment records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="establishment-pagination">
          <p>
            Showing {filteredEstablishments.length} of {establishments.length}{" "}
            Establishments
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

      {showModal ? (
        <RegisterEstablishmentModal
          form={form}
          businessTypes={businessTypes}
          barangayOptions={barangayOptions}
          saving={saving}
          formError={formError}
          autoRequirements={getAutoRequirements()}
          selectedBusinessType={getSelectedBusinessType()}
          editingEstablishment={editingEstablishment}
          onChange={updateField}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      ) : null}

      {selectedEstablishment ? (
        <EstablishmentDetailModal
          establishment={selectedEstablishment}
          timeline={selectedTimeline}
          onClose={closeDetailModal}
          onEdit={editSelectedEstablishment}
        />
      ) : null}
    </div>
  );
}

function EstablishmentDetailModal({
  establishment,
  timeline,
  onClose,
  onEdit,
}) {
  const coordinateText =
    establishment.latitude && establishment.longitude
      ? `${establishment.latitude}, ${establishment.longitude}`
      : "Not encoded";

  return (
    <div className="establishment-modal-backdrop">
      <section
        className="establishment-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${establishment.business_name} establishment details`}
      >
        <button type="button" className="modal-close-btn" onClick={onClose}>
          <FiX />
        </button>

        <div className="establishment-detail-header">
          <div>
            <span>Official Establishment Record</span>
            <h2>{establishment.business_name}</h2>
            <p>
              {establishment.business_type_name} | {establishment.barangay}
            </p>
          </div>

          <div className="establishment-detail-actions">
            <button
              type="button"
              className="sanitation-export-btn"
              onClick={() => printEstablishmentReport(establishment, timeline)}
            >
              <FiPrinter /> Print
            </button>
            <button type="button" className="add-establishment-btn" onClick={onEdit}>
              <FiEdit2 /> Edit
            </button>
          </div>
        </div>

        <div className="establishment-detail-grid">
          <InfoTile label="Owner / Proprietor" value={establishment.owner_name} />
          <InfoTile label="Contact Number" value={establishment.contact_number} />
          <InfoTile label="Complete Address" value={establishment.address} />
          <InfoTile
            label="Permit Size"
            value={establishment.permit_size_label || establishment.permit_size}
          />
          <InfoTile
            label="Permit Number"
            value={establishment.permit_number || "No permit number"}
          />
          <InfoTile
            label="Permit Status"
            value={establishment.permit_status_label || establishment.permit_status}
          />
          <InfoTile
            label="Compliance Status"
            value={establishment.compliance_status_label}
          />
          <InfoTile label="Map Coordinates" value={coordinateText} />
        </div>

        <div className="establishment-detail-note">
          <FiFileText />
          <div>
            <strong>Remarks</strong>
            <p>{establishment.remarks || "No remarks recorded."}</p>
          </div>
        </div>

        {establishment.has_permit && (
          <div className="establishment-detail-note" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', backgroundColor: '#f8fafc' }}>
            <QRCodeSVG 
              value={`${window.location.origin}/verify-permit/${establishment.id}`} 
              size={120} 
              level="H"
              includeMargin={true}
            />
            <div>
              <strong style={{ display: 'block', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Official Permit QR Code</strong>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                Tourists and inspectors can scan this code using the Mauban Mobile App or any smartphone camera to instantly verify the compliance status of this establishment.
              </p>
              <a 
                href={`/verify-permit/${establishment.id}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ display: 'inline-block', marginTop: '0.75rem', fontWeight: 600, color: '#2563eb' }}
              >
                Test Verification Page &rarr;
              </a>
            </div>
          </div>
        )}

        <div className="establishment-timeline-panel">
          <div className="establishment-timeline-title">
            <FiFileText />
            <h3>Record Timeline</h3>
          </div>

          {timeline.length ? (
            <div className="establishment-timeline-list">
              {timeline.map((item) => (
                <div
                  className={`establishment-timeline-row ${item.tone}`}
                  key={item.id}
                >
                  <span className="timeline-dot" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>{formatDisplayDate(item.date)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="establishment-timeline-empty">
              No inspection, complaint, or renewal activity recorded yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="establishment-info-tile">
      <span>{label}</span>
      <strong>{value || "Not recorded"}</strong>
    </div>
  );
}

function RegisterEstablishmentModal({
  form,
  businessTypes,
  barangayOptions,
  saving,
  formError,
  autoRequirements,
  selectedBusinessType,
  editingEstablishment,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <div className="establishment-modal-backdrop">
      <form className="establishment-modal" onSubmit={onSubmit}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          <FiX />
        </button>

        <h2>
          {editingEstablishment
            ? "Edit Establishment"
            : "Register New Establishment"}
        </h2>

        <label className="modal-field full">
          <span>Business Name</span>
          <input
            type="text"
            placeholder="e.g. IOT MOTO"
            value={form.business_name}
            onChange={(event) => onChange("business_name", event.target.value)}
          />
        </label>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Owner / Proprietor</span>
            <input
              type="text"
              placeholder="Full Name"
              value={form.owner_name}
              onChange={(event) => onChange("owner_name", event.target.value)}
            />
          </label>

          <label className="modal-field">
            <span>Barangay</span>
            <input
              list="establishment-barangay-options"
              type="text"
              placeholder="Select or type barangay"
              value={form.barangay}
              onChange={(event) => onChange("barangay", event.target.value)}
            />
            <datalist id="establishment-barangay-options">
              {barangayOptions.map((barangay) => (
                <option key={barangay} value={barangay} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="modal-field full">
          <span>Complete Address</span>
          <input
            type="text"
            placeholder="Complete business address"
            value={form.address}
            onChange={(event) => onChange("address", event.target.value)}
          />
        </label>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Contact Number</span>
            <input
              type="text"
              placeholder="0917..."
              value={form.contact_number}
              onChange={(event) => onChange("contact_number", event.target.value)}
            />
          </label>

          <label className="modal-field">
            <span>Business Type</span>
            <select
              value={form.business_type}
              onChange={(event) => onChange("business_type", event.target.value)}
            >
              <option value="">Select business type</option>
              {businessTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Permit Size</span>
            <select
              value={form.permit_size}
              onChange={(event) => onChange("permit_size", event.target.value)}
            >
              <option value="sp">SP</option>
              <option value="large">Large</option>
            </select>
          </label>

          <label className="modal-field">
            <span>Has Permit?</span>
            <select
              value={form.has_permit ? "yes" : "no"}
              onChange={(event) => {
                const hasPermit = event.target.value === "yes";
                onChange("has_permit", hasPermit);

                if (!hasPermit) {
                  onChange("compliance_status", "no_permit");
                  onChange("permit_status", "no_permit");
                  onChange("permit_number", "");
                  onChange("permit_issued_date", "");
                  onChange("permit_expiry_date", "");
                }
              }}
            >
              <option value="yes">With Permit</option>
              <option value="no">No Permit</option>
            </select>
          </label>
        </div>

        <label className="modal-field full">
          <span>Permit Number</span>
          <input
            type="text"
            placeholder="SP-2026-000"
            value={form.permit_number}
            disabled={!form.has_permit}
            onChange={(event) => onChange("permit_number", event.target.value)}
          />
        </label>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Compliance Status</span>
            <select
              value={form.compliance_status}
              disabled={!form.has_permit}
              onChange={(event) =>
                onChange("compliance_status", event.target.value)
              }
            >
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="modal-field">
            <span>Permit Status</span>
            <select
              value={form.permit_status}
              disabled={!form.has_permit}
              onChange={(event) => onChange("permit_status", event.target.value)}
            >
              {permitStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Permit Issued Date</span>
            <input
              type="date"
              value={form.permit_issued_date}
              disabled={!form.has_permit}
              onChange={(event) =>
                onChange("permit_issued_date", event.target.value)
              }
            />
          </label>

          <label className="modal-field">
            <span>Permit Expiry Date</span>
            <input
              type="date"
              value={form.permit_expiry_date}
              disabled={!form.has_permit}
              onChange={(event) =>
                onChange("permit_expiry_date", event.target.value)
              }
            />
          </label>
        </div>

        <div className="modal-two-grid">
          <label className="modal-field">
            <span>Latitude</span>
            <input
              type="number"
              step="any"
              placeholder="14.18"
              value={form.latitude}
              onChange={(event) => onChange("latitude", event.target.value)}
            />
          </label>

          <label className="modal-field">
            <span>Longitude</span>
            <input
              type="number"
              step="any"
              placeholder="121.73"
              value={form.longitude}
              onChange={(event) => onChange("longitude", event.target.value)}
            />
          </label>
        </div>

        <LocationPicker
          label="Establishment Map Pin"
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={onChange}
        />

        <label className="modal-field full">
          <span>Remarks</span>
          <input
            type="text"
            placeholder="Optional remarks"
            value={form.remarks}
            onChange={(event) => onChange("remarks", event.target.value)}
          />
        </label>

        <div className="auto-requirements-box">
          <h3>
            AUTO-LOADED REQUIREMENTS{" "}
            {selectedBusinessType
              ? `(${form.permit_size.toUpperCase()}) - ${selectedBusinessType.inspection_frequency?.toUpperCase()} INSPECTION`
              : ""}
          </h3>

          <div className="auto-req-grid">
            {autoRequirements.length ? (
              autoRequirements.map((requirement) => (
                <span key={requirement.id}>
                  <FiCheckCircle />
                  {requirement.requirement_name}
                </span>
              ))
            ) : (
              <span>Select a business type to load requirements.</span>
            )}
          </div>
        </div>

        {formError ? <p className="sanitation-error-text">{formError}</p> : null}

        <div className="modal-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button type="submit" className="save-btn" disabled={saving}>
            {saving
              ? "Saving..."
              : editingEstablishment
              ? "Save Changes"
              : "Save & Register"}
          </button>
        </div>
      </form>
    </div>
  );
}

function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function buildEstablishmentTimeline(
  establishment,
  inspections = [],
  complaints = [],
  renewals = []
) {
  const establishmentId = String(establishment.id);
  const rows = [
    {
      id: `establishment-${establishmentId}`,
      title: "Establishment record encoded",
      detail: `${establishment.business_type_name || "Business"} in ${
        establishment.barangay || "unassigned barangay"
      }`,
      date:
        establishment.updated_at ||
        establishment.created_at ||
        establishment.permit_issued_date,
      tone: "good",
    },
  ];

  if (establishment.has_permit && establishment.permit_number) {
    rows.push({
      id: `permit-${establishmentId}`,
      title: "Sanitary permit recorded",
      detail: `${establishment.permit_number} | expires ${formatDisplayDate(
        establishment.permit_expiry_date
      )}`,
      date: establishment.permit_issued_date || establishment.created_at,
      tone:
        establishment.permit_status === "suspended" ||
        establishment.permit_status === "no_permit"
          ? "danger"
          : "good",
    });
  }

  inspections
    .filter((item) => String(item.establishment) === establishmentId)
    .forEach((item) => {
      const status =
        item.status_after_inspection_label || item.status_after_inspection;

      rows.push({
        id: `inspection-${item.id}`,
        title: item.is_draft ? "Inspection draft saved" : "Inspection conducted",
        detail: [
          item.inspector_name || "Inspector not assigned",
          status || "No status",
          item.findings || item.remarks || "No findings recorded",
        ]
          .filter(Boolean)
          .join(" | "),
        date: item.inspection_date || item.updated_at,
        tone: timelineTone(status),
      });
    });

  complaints
    .filter((item) => String(item.establishment) === establishmentId)
    .forEach((item) => {
      rows.push({
        id: `complaint-${item.id}`,
        title: "Complaint follow-up",
        detail: [
          item.category,
          item.status_label || item.status,
          item.action_taken || item.description,
        ]
          .filter(Boolean)
          .join(" | "),
        date: item.reported_date || item.updated_at,
        tone: item.priority === "high" ? "danger" : "warning",
      });
    });

  renewals
    .filter((item) => String(item.establishment) === establishmentId)
    .forEach((item) => {
      rows.push({
        id: `renewal-${item.id}`,
        title: "Permit renewal activity",
        detail: [
          item.renewal_id,
          item.stage_label || item.stage,
          `payment ${item.payment_status_label || item.payment_status}`,
        ]
          .filter(Boolean)
          .join(" | "),
        date: item.updated_at || item.expiration_date,
        tone: item.stage === "lapsed" ? "danger" : "warning",
      });
    });

  return rows.sort((a, b) => toSortableDate(b.date) - toSortableDate(a.date));
}

function timelineTone(status = "") {
  const normalized = String(status).toLowerCase();

  if (normalized.includes("violation") || normalized.includes("suspended")) {
    return "danger";
  }

  if (
    normalized.includes("completion") ||
    normalized.includes("upcoming") ||
    normalized.includes("pending") ||
    normalized.includes("renewal")
  ) {
    return "warning";
  }

  return "good";
}

function toSortableDate(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDisplayDate(value) {
  if (!value) {
    return "No date recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function printEstablishmentReport(establishment, timeline) {
  const printedAt = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(new Date());

  const timelineRows = timeline.length
    ? timeline
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(formatDisplayDate(item.date))}</td>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.detail)}</td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="3">No inspection, complaint, or renewal activity recorded yet.</td></tr>`;

  const printWindow = window.open("", "_blank", "width=860,height=900");

  if (!printWindow) {
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Sanitary Establishment Record</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          .office { text-align: center; border-bottom: 2px solid #0f6b3f; padding-bottom: 14px; margin-bottom: 22px; }
          .office h1 { margin: 6px 0 2px; font-size: 20px; text-transform: uppercase; }
          .office p { margin: 2px 0; font-size: 12px; }
          h2 { margin: 0 0 14px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
          th, td { border: 1px solid #cbd5d1; padding: 9px 10px; font-size: 12px; vertical-align: top; }
          th { background: #edf7f1; text-align: left; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
          .box { border: 1px solid #cbd5d1; padding: 10px; min-height: 48px; }
          .box span { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .box strong { display: block; margin-top: 5px; font-size: 13px; }
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

        <h2>Sanitary Establishment Record</h2>

        <div class="grid">
          <div class="box"><span>Business Name</span><strong>${escapeHtml(
            establishment.business_name
          )}</strong></div>
          <div class="box"><span>Owner / Proprietor</span><strong>${escapeHtml(
            establishment.owner_name
          )}</strong></div>
          <div class="box"><span>Business Type</span><strong>${escapeHtml(
            establishment.business_type_name
          )}</strong></div>
          <div class="box"><span>Barangay</span><strong>${escapeHtml(
            establishment.barangay
          )}</strong></div>
          <div class="box"><span>Permit Number</span><strong>${escapeHtml(
            establishment.permit_number || "No permit number"
          )}</strong></div>
          <div class="box"><span>Permit Status</span><strong>${escapeHtml(
            establishment.permit_status_label || establishment.permit_status
          )}</strong></div>
          <div class="box"><span>Compliance Status</span><strong>${escapeHtml(
            establishment.compliance_status_label
          )}</strong></div>
          <div class="box"><span>Contact Number</span><strong>${escapeHtml(
            establishment.contact_number || "Not recorded"
          )}</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 24%">Date</th>
              <th style="width: 28%">Activity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>${timelineRows}</tbody>
        </table>

        <p><strong>Address:</strong> ${escapeHtml(establishment.address)}</p>
        <p><strong>Remarks:</strong> ${escapeHtml(
          establishment.remarks || "No remarks recorded."
        )}</p>

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

export default EstablishmentRecords;
