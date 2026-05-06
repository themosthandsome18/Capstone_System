import { useMemo, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

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
    loading,
    error,
    createEstablishment,
    updateEstablishment,
    deleteEstablishment,
  } = useSanitationData();

  const [showModal, setShowModal] = useState(false);
  const [editingEstablishment, setEditingEstablishment] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

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

      return matchesSearch && matchesStatus;
    });
  }, [establishments, search, statusFilter]);

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
    } catch (requestError) {
      alert(getErrorMessage(requestError));
    }
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

        <button
          type="button"
          className="add-establishment-btn"
          onClick={openModal}
        >
          <FiPlus /> Add Establishment
        </button>
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
    </div>
  );
}

function RegisterEstablishmentModal({
  form,
  businessTypes,
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
              type="text"
              placeholder="Brgy. ..."
              value={form.barangay}
              onChange={(event) => onChange("barangay", event.target.value)}
            />
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
                  ✓ {requirement.requirement_name}
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

export default EstablishmentRecords;