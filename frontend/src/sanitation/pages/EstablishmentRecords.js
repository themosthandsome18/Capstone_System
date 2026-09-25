import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFileText,
  FiPlus,
  FiPrinter,
  FiRotateCcw,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import LocationPicker from "../../shared/LocationPicker";
import { useSanitationData } from "../context/SanitationDataContext";
import {
  CLIENT_BUSINESS_TYPE_CATEGORIES,
  businessTypeDisplayLabel,
} from "../utils/businessTypeLabels";
import { QRCodeSVG } from "qrcode.react";

export const OFFICIAL_MAUBAN_BARANGAYS = [
  "Abo-abo",
  "Alitap",
  "Baao",
  "Bagong Bayan",
  "Balaybalay",
  "Bato",
  "Cagbalete I",
  "Cagbalete II",
  "Cagsiay I",
  "Cagsiay II",
  "Cagsiay III",
  "Concepcion",
  "Daungan",
  "Liwayway",
  "Lual",
  "Lual Rural",
  "Lucutan",
  "Luya-luya",
  "Mabato",
  "Macasin",
  "Polo",
  "Remedios I",
  "Remedios II",
  "Rizaliana",
  "Rosario",
  "Sadsaran",
  "San Gabriel",
  "San Isidro",
  "San Jose",
  "San Lorenzo",
  "San Miguel",
  "San Rafael",
  "San Roque",
  "San Vicente",
  "Santa Lucia",
  "Santo Angel",
  "Santo Niño",
  "Santol",
  "Soledad",
  "Tapucan",
];

/**
 * Upper-cases the first letter of each word.
 *
 * An apostrophe is part of the word, not a separator, so "perly's" becomes
 * "Perly's" and not "Perly'S". Hyphens and spaces still separate words, so
 * "sari-sari store" becomes "Sari-Sari Store".
 */
function toTitleCase(str) {
  if (!str) return "";
  return str.replace(
    /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
    (_match, separator, letter) => separator + letter.toUpperCase()
  );
}

export function generatePermitNumber(establishments = [], permitSize = "sp") {
  const currentYear = new Date().getFullYear();
  const prefix = (permitSize || "").toLowerCase() === "large" ? "LG" : "SP";
  const regex = new RegExp(`^${prefix}-${currentYear}-(\\d+)$`, "i");
  let maxSeq = 0;

  (establishments || []).forEach((est) => {
    const match = String(est.permit_number || "").match(regex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}-${currentYear}-${nextSeq}`;
}

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
  compliance_status: "not_yet_inspected",
  permit_status: "active",
  latitude: "",
  longitude: "",
  remarks: "",
};

const statusOptions = [
  { value: "not_yet_inspected", label: "Not Yet Inspected" },
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

/**
 * Registering an establishment does not issue a sanitary permit, so a new
 * record starts with no permit on record rather than an invented permit
 * number, invented dates or an unearned "Good Standing".
 */
const NEW_ESTABLISHMENT_PERMIT_STATE = {
  has_permit: false,
  permit_number: "",
  permit_issued_date: null,
  permit_expiry_date: null,
  compliance_status: "not_yet_inspected",
  permit_status: "no_permit",
};

function trimmedText(value) {
  return String(value ?? "").trim();
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function hasValidMaubanCoordinates(latitude, longitude) {
  const lat = optionalNumber(latitude);
  const lng = optionalNumber(longitude);

  return (
    lat !== null &&
    lng !== null &&
    lat >= 13.9 &&
    lat <= 14.4 &&
    lng >= 121.55 &&
    lng <= 122
  );
}

/**
 * Normalises form state or a stored record into the values the API stores,
 * so the two can be compared field by field.
 */
function toApiValues(values) {
  return {
    business_name: trimmedText(values.business_name),
    owner_name: trimmedText(values.owner_name),
    business_type: optionalNumber(values.business_type),
    permit_size: values.permit_size ?? "",
    barangay: trimmedText(values.barangay),
    address: trimmedText(values.address),
    contact_number: trimmedText(values.contact_number),
    has_permit: Boolean(values.has_permit),
    permit_number: trimmedText(values.permit_number),
    permit_issued_date: values.permit_issued_date || null,
    permit_expiry_date: values.permit_expiry_date || null,
    compliance_status: values.compliance_status ?? "",
    permit_status: values.permit_status ?? "",
    latitude: optionalNumber(values.latitude),
    longitude: optionalNumber(values.longitude),
    remarks: trimmedText(values.remarks),
  };
}

/** A sanitary permit is valid for one year (29 February becomes 28 February). */
export function addOneYear(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  const nextDay = month === "02" && day === "29" ? "28" : day;
  return `${Number(year) + 1}-${month}-${nextDay}`;
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The permit fields of a new record. Without a permit number nothing is
 * recorded. With one, the permit is active until it expires; an already
 * expired permit is recorded as renewal due, the same way the permit importer
 * records expired permits. Compliance stays "not yet inspected" either way,
 * because holding a permit is not an inspection result.
 */
function buildNewPermitState(values) {
  if (!values.permit_number) {
    return NEW_ESTABLISHMENT_PERMIT_STATE;
  }

  return {
    has_permit: true,
    permit_number: values.permit_number,
    permit_issued_date: values.permit_issued_date,
    permit_expiry_date: values.permit_expiry_date,
    compliance_status: "not_yet_inspected",
    permit_status:
      values.permit_expiry_date >= localToday() ? "active" : "renewal_due",
  };
}

function buildCreatePayload(values) {
  // Permit coverage (SP / Large) and remarks are not asked for at registration;
  // the backend model defaults apply ("sp" and "").
  return {
    business_name: values.business_name,
    owner_name: values.owner_name,
    business_type: values.business_type,
    barangay: values.barangay,
    address: values.address,
    contact_number: values.contact_number,
    latitude: values.latitude,
    longitude: values.longitude,
    ...buildNewPermitState(values),
  };
}

/**
 * Only the fields staff actually changed. Anything left untouched is not sent,
 * so an unrelated edit cannot overwrite permit or inspection-driven data.
 */
function buildEditPayload(formValues, establishment) {
  const next = toApiValues(formValues);
  const stored = toApiValues(establishment);

  return Object.fromEntries(
    Object.entries(next).filter(([field, value]) => value !== stored[field])
  );
}

function formFromEstablishment(establishment) {
  return {
    business_name: establishment.business_name ?? "",
    owner_name: establishment.owner_name ?? "",
    business_type: establishment.business_type ?? "",
    permit_size: establishment.permit_size ?? "",
    barangay: establishment.barangay ?? "",
    address: establishment.address ?? "",
    contact_number: establishment.contact_number ?? "",
    has_permit: Boolean(establishment.has_permit),
    permit_number: establishment.permit_number ?? "",
    permit_issued_date: establishment.permit_issued_date ?? "",
    permit_expiry_date: establishment.permit_expiry_date ?? "",
    compliance_status: establishment.compliance_status ?? "",
    permit_status: establishment.permit_status ?? "",
    latitude: establishment.latitude ?? "",
    longitude: establishment.longitude ?? "",
    remarks: establishment.remarks ?? "",
  };
}

/** Real business types grouped under the client's categories, for the form. */
function groupBusinessTypesByCategory(businessTypes = []) {
  const groups = CLIENT_BUSINESS_TYPE_CATEGORIES.map((category) => ({
    category,
    types: businessTypes.filter(
      (type) => businessTypeDisplayLabel(type.name) === category
    ),
  }));
  const unmapped = businessTypes.filter(
    (type) =>
      !CLIENT_BUSINESS_TYPE_CATEGORIES.includes(businessTypeDisplayLabel(type.name))
  );

  return { groups, unmapped };
}

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
  const navigate = useNavigate();
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

  const hasActiveFilters = Boolean(
    search ||
      statusFilter !== "all" ||
      barangayFilter !== "all" ||
      businessTypeFilter !== "all" ||
      permitFilter !== "all"
  );

  function handleClearFilters() {
    setSearch("");
    setStatusFilter("all");
    setBarangayFilter("all");
    setBusinessTypeFilter("all");
    setPermitFilter("all");
    navigate("/sanitation/establishments", { replace: true });
  }
  const barangayOptions = useMemo(
    () =>
      [...new Set(establishments.map((item) => item.barangay).filter(Boolean))].sort(),
    [establishments]
  );
  // Filters are intentionally limited to the client's approved categories.
  // Unknown underlying types remain stored and searchable by their real name,
  // but never create an unapproved client-facing filter category.
  const businessTypeFilterOptions = CLIENT_BUSINESS_TYPE_CATEGORIES;
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
        businessTypeDisplayLabel(item.business_type_name),
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
      // The filter value is a client-facing display label, which several real
      // business types can share, so match on the label the table shows.
      const matchesType =
        businessTypeFilter === "all" ||
        businessTypeDisplayLabel(item.business_type_name) === businessTypeFilter;
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

  function openEditModal(establishment, options = {}) {
    const { forceEnablePermit = false } = options;
    setEditingEstablishment(establishment);

    // Stored values load exactly as recorded; nothing is back-filled or coerced.
    const loaded = formFromEstablishment(establishment);

    // Only the explicit "Issue & Generate Permit Now" action pre-fills a new
    // permit. Staff still review these values before saving.
    if (forceEnablePermit) {
      loaded.has_permit = true;

      if (
        !loaded.permit_number.trim() ||
        loaded.permit_number.toLowerCase().includes("no permit")
      ) {
        loaded.permit_number = generatePermitNumber(
          establishments,
          loaded.permit_size || "sp"
        );
      }
      if (!loaded.permit_issued_date) {
        loaded.permit_issued_date = new Date().toISOString().slice(0, 10);
      }
      if (!loaded.permit_expiry_date) {
        loaded.permit_expiry_date = `${new Date().getFullYear()}-12-31`;
      }
      // Issuing a permit is an administrative act, not an inspection finding,
      // so it never sets a compliance status. Only an inspection does that.
      if (loaded.permit_status === "no_permit") {
        loaded.permit_status = "active";
      }
    }

    setForm(loaded);
    setFormError("");
    setShowModal(true);
  }

  function openDetailModal(establishment) {
    setSelectedEstablishment(establishment);
  }

  function closeDetailModal() {
    setSelectedEstablishment(null);
  }

  function editSelectedEstablishment(forceEnablePermit = false) {
    const target = selectedEstablishment;

    setSelectedEstablishment(null);

    if (target) {
      openEditModal(target, { forceEnablePermit });
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingEstablishment(null);
    setForm(initialForm);
    setFormError("");
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

    if (!editingEstablishment) {
      return validateNewPermit(payload);
    }

    return "";
  }

  function validateNewPermit(payload) {
    const hasDates = payload.permit_issued_date || payload.permit_expiry_date;

    if (!payload.permit_number) {
      return hasDates
        ? "Enter the sanitary permit number, or clear the permit dates."
        : "";
    }

    if (!payload.permit_issued_date) {
      return "Enter the date the sanitary permit was issued.";
    }

    if (!payload.permit_expiry_date) {
      return "Enter the sanitary permit expiry date.";
    }

    if (payload.permit_expiry_date <= payload.permit_issued_date) {
      return "The expiry date must be after the date issued.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const values = toApiValues(form);
    const validationError = validatePayload(values);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const changes = editingEstablishment
      ? buildEditPayload(form, editingEstablishment)
      : null;

    if (changes && Object.keys(changes).length === 0) {
      // Nothing was changed, so there is nothing to save.
      closeModal();
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editingEstablishment) {
        await updateEstablishment(editingEstablishment.id, changes);
      } else {
        await createEstablishment(buildCreatePayload(values));
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
      "Establishment ID",
      "Business Name",
      "Owner",
      "Business Type",
      "Permit Coverage (SP/Large)",
      "Permit Number",
      "Barangay",
      "Address",
      "Contact Number",
      "Permit Status",
      "Compliance Status",
      "Remarks",
      "Underlying Business Type",
    ];
    const rows = filteredEstablishments.map((item) => [
      item.id,
      item.business_name,
      item.owner_name,
      businessTypeDisplayLabel(item.business_type_name),
      item.permit_size_label || item.permit_size?.toUpperCase(),
      item.permit_number,
      item.barangay,
      item.address,
      item.contact_number,
      item.permit_status_label,
      item.compliance_status_label,
      item.remarks,
      item.business_type_name,
    ]);

    exportCsv(datedCsvFilename("sanitary-establishments"), headers, rows);
  }

  if (loading) {
    return (
      <div className="establishment-page">
        <div className="sanitation-loading">
          <div className="sanitation-spinner" />
          <p className="sanitation-loading-text">Loading establishments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="establishment-page">
      <div className="establishment-header">
        <div className="establishment-header-left">
          <button
            type="button"
            className="establishment-back-btn"
            onClick={() => navigate(-1)}
            title="Go back to previous page"
          >
            <FiArrowLeft /> Back
          </button>
          <div>
            <h1>Establishment Records</h1>
            <p>Manage and monitor all registered establishments</p>
          </div>
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

      {hasActiveFilters ? (
        <div className="active-filter-banner">
          <div>
            <strong>Active Filters:</strong>
            {search ? <span> Search: <em>"{search}"</em></span> : null}
            {statusFilter !== "all" ? <span> • Status: <em>{statusFilter}</em></span> : null}
            {barangayFilter !== "all" ? <span> • Barangay: <em>{barangayFilter}</em></span> : null}
            {businessTypeFilter !== "all" ? (
              <span> • Type: <em>{businessTypeFilter}</em></span>
            ) : null}
            {permitFilter !== "all" ? <span> • Permit: <em>{permitFilter}</em></span> : null}
          </div>
          <button type="button" onClick={handleClearFilters}>
            <FiRotateCcw /> Reset Filters
          </button>
        </div>
      ) : null}

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <section className="establishment-table-card establishment-records-table">
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
            {businessTypeFilterOptions.map((label) => (
              <option key={label} value={label}>
                {label}
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

        <div className="establishment-table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>ID</th>
                <th style={{ width: "22%" }}>Business Name</th>
                <th style={{ width: "16%" }}>Owner / Proprietor</th>
                <th style={{ width: "20%" }}>Business Type</th>
                <th style={{ width: "22%" }}>Address</th>
                <th style={{ width: "14%", textAlign: "center" }}>Status</th>
                <th style={{ width: "10%", textAlign: "center" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredEstablishments.length ? (
                filteredEstablishments.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>
                      <strong>{item.business_name}</strong>
                      {item.account_username ? (
                        <small
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            color: "#16a34a",
                            fontSize: "11px",
                            marginTop: "3px",
                            background: "#f0fdf4",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            border: "1px solid #bbf7d0",
                          }}
                          title={`Linked Owner Account: @${item.account_username}`}
                        >
                          📱 @{item.account_username}
                        </small>
                      ) : null}
                    </td>
                    <td>{item.owner_name}</td>
                    {/* Client-facing category; the record keeps its real business type id. */}
                    <td>{businessTypeDisplayLabel(item.business_type_name)}</td>
                    <td>{item.address || `Brgy. ${item.barangay}, Mauban`}</td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={`status-pill ${statusClass(
                          item.compliance_status_label
                        )}`}
                      >
                        {item.compliance_status_label}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="establishment-action-buttons">
                        <button
                          type="button"
                          className="establishment-icon-btn view"
                          title="View establishment"
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
        </div>

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
          establishments={establishments}
          businessTypes={businessTypes}
          barangayOptions={barangayOptions}
          saving={saving}
          formError={formError}
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
  const displayLabel = businessTypeDisplayLabel(establishment.business_type_name);
  const hasCoordinates =
    optionalNumber(establishment.latitude) !== null &&
    optionalNumber(establishment.longitude) !== null;
  // The current schema does not retain whether coordinates were selected by
  // staff or generated by the backend from the barangay. Treat every valid
  // point as a non-verified map reference, and never link invalid legacy data.
  const hasValidMapReference = hasValidMaubanCoordinates(
    establishment.latitude,
    establishment.longitude
  );
  const mapsUrl = hasValidMapReference
    ? `https://www.google.com/maps/search/?api=1&query=${establishment.latitude},${establishment.longitude}`
    : "";
  const openComplaints =
    establishment.open_complaints === null ||
    establishment.open_complaints === undefined
      ? null
      : String(establishment.open_complaints);

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
            <span>Establishment Profile</span>
            <h2>{establishment.business_name}</h2>
            <p>
              {displayLabel} | {establishment.barangay}
            </p>
            {/* Real underlying type, shown only when it differs from the label. */}
            {isSameBusinessTypeText(
              displayLabel,
              establishment.business_type_name
            ) ? null : (
              <p className="underlying-type">
                {establishment.business_type_name}
              </p>
            )}
            <p className="establishment-record-id">
              Establishment ID: {establishment.id} (internal record number, not
              a permit number)
            </p>
          </div>

          <div className="establishment-detail-actions">
            <button
              type="button"
              className="sanitation-export-btn"
              onClick={() => {
                const qrSvgEl = document.getElementById("establishment-detail-qr-svg");
                const qrSvgHtml = qrSvgEl ? qrSvgEl.outerHTML : "";
                printEstablishmentReport(establishment, timeline, qrSvgHtml);
              }}
            >
              <FiPrinter /> Print
            </button>
            <button type="button" className="add-establishment-btn" onClick={() => onEdit(false)}>
              <FiEdit2 /> Edit
            </button>
          </div>
        </div>

        <h3 className="establishment-detail-section-title">Establishment Details</h3>
        <div className="establishment-detail-grid">
          <InfoTile label="Establishment ID" value={String(establishment.id)} />
          <InfoTile label="Owner / Proprietor" value={establishment.owner_name} />
          <InfoTile label="Business Type" value={displayLabel} />
          <InfoTile label="Contact Number" value={establishment.contact_number} />
          <InfoTile
            label="Mobile Portal Account"
            value={
              establishment.account_username ? (
                <span style={{ color: "#16a34a", fontWeight: "600" }}>
                  🟢 Linked (@{establishment.account_username})
                </span>
              ) : (
                <span style={{ color: "#64748b" }}>
                  ⚪ Not Linked (Register via Mobile)
                </span>
              )
            }
          />
        </div>

        <div
          style={{
            margin: "14px 0",
            padding: "12px 16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div>
            <strong style={{ color: "#166534", display: "block" }}>
              📱 Mobile Establishment Portal
            </strong>
            <span style={{ fontSize: "13px", color: "#15803d" }}>
              {establishment.account_username
                ? `Owner account active (@${establishment.account_username}). Can log in to view live permit, checklist & request re-inspection.`
                : "Owner can register an account in the Mobile Sanitation Portal using their Permit / Business Name."}
            </span>
          </div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: "600",
              padding: "4px 10px",
              borderRadius: "9999px",
              background: establishment.account_username ? "#dcfce7" : "#f8fafc",
              color: establishment.account_username ? "#15803d" : "#475569",
              border: `1px solid ${
                establishment.account_username ? "#86efac" : "#cbd5e1"
              }`,
            }}
          >
            {establishment.account_username ? "Account Linked" : "Mobile Portal Ready"}
          </span>
        </div>

        <div className="establishment-detail-note">
          <FiFileText />
          <div>
            <strong>Remarks</strong>
            <p>{establishment.remarks || "No remarks recorded."}</p>
          </div>
        </div>

        <h3 className="establishment-detail-section-title">Location / Reference</h3>
        <div className="establishment-detail-grid">
          <InfoTile label="Barangay" value={establishment.barangay} />
          <InfoTile label="Complete Address" value={establishment.address} />
          <InfoTile
            label="Location Coordinates"
            value={
              hasCoordinates
                ? `${establishment.latitude}, ${establishment.longitude}`
                : "No location coordinates recorded"
            }
          />
          <InfoTile
            label="Map Reference"
            value={
              mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              ) : (
                hasCoordinates
                  ? "No valid map reference available"
                  : "No map reference recorded"
              )
            }
          />
        </div>

        <h3 className="establishment-detail-section-title">Sanitary Permit</h3>
        {establishment.has_permit ? null : (
          <p className="establishment-detail-empty">
            No sanitary permit is on record for this establishment.
          </p>
        )}
        <div className="establishment-detail-grid">
          <InfoTile
            label="Permit Number"
            value={establishment.permit_number || "No permit number recorded"}
          />
          <InfoTile
            label="Permit Status"
            value={establishment.permit_status_label || establishment.permit_status}
          />
          <InfoTile
            label="Permit Issued Date"
            value={formatDisplayDate(establishment.permit_issued_date)}
          />
          <InfoTile
            label="Permit Expiry Date"
            value={formatDisplayDate(establishment.permit_expiry_date)}
          />
          <InfoTile
            label="Permit Coverage (internal SP / Large)"
            value={establishment.permit_size_label || establishment.permit_size}
          />
        </div>

        <div className="establishment-detail-qr-card">
          <div className="qr-box">
            <QRCodeSVG
              id="establishment-detail-qr-svg"
              value={`${window.location.origin}/verify-permit/${establishment.id}`}
              size={130}
              level="H"
              includeMargin={true}
            />
          </div>
          <div className="qr-info">
            <div className="qr-badge-row">
              <span className="qr-badge official">Establishment Verification QR</span>
              {establishment.has_permit ? (
                <span className="qr-badge valid">
                  Permit: {establishment.permit_number || "number not recorded"}
                </span>
              ) : (
                <span className="qr-badge unissued">No permit on record</span>
              )}
            </div>
            <h4>Verification QR Code</h4>
            <p>
              This code links to Establishment ID {establishment.id}. Scanning it
              with the Mauban Mobile App or any smartphone camera opens the public
              verification page, which shows the establishment's current permit
              and compliance status.
            </p>
            <div className="qr-actions">
              <a
                href={`/verify-permit/${establishment.id}`}
                target="_blank"
                rel="noreferrer"
                className="qr-test-link"
              >
                Open Verification Page &rarr;
              </a>
              {!establishment.has_permit && (
                <button
                  type="button"
                  className="qr-issue-btn"
                  onClick={() => onEdit(true)}
                >
                  + Issue & Generate Permit Now
                </button>
              )}
            </div>
          </div>
        </div>

        <h3 className="establishment-detail-section-title">Compliance Overview</h3>
        <div className="establishment-detail-grid">
          <InfoTile
            label="Compliance Status"
            value={establishment.compliance_status_label || establishment.compliance_status}
          />
          <InfoTile label="Open Complaints" value={openComplaints} />
        </div>

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
  establishments = [],
  businessTypes,
  saving,
  formError,
  editingEstablishment,
  onChange,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(editingEstablishment);
  const { groups, unmapped } = groupBusinessTypesByCategory(businessTypes);

  // "No Permit" is hidden while a permit is held, unless the record already
  // stores it, so a stored value is never displayed as a different one.
  function selectableStatuses(options, currentValue) {
    return options.filter(
      (status) =>
        !form.has_permit ||
        status.value !== "no_permit" ||
        status.value === currentValue
    );
  }

  return (
    <div className="establishment-modal-backdrop">
      <form className="establishment-modal" onSubmit={onSubmit}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          <FiX />
        </button>

        <h2>{isEditing ? "Edit Establishment" : "Register New Establishment"}</h2>

        <section className="establishment-form-section">
          <h3>Establishment Profile</h3>

          <label className="modal-field full">
            <span>Business Name</span>
            <input
              type="text"
              placeholder="e.g. Cagbalete Bay Resort & Restaurant"
              value={form.business_name}
              onChange={(event) =>
                onChange("business_name", toTitleCase(event.target.value))
              }
            />
          </label>

          <div className="modal-two-grid">
            <label className="modal-field">
              <span>Owner / Proprietor</span>
              <input
                type="text"
                placeholder="e.g. Juan C. Dela Cruz"
                value={form.owner_name}
                onChange={(event) =>
                  onChange("owner_name", toTitleCase(event.target.value))
                }
              />
            </label>

            <label className="modal-field">
              <span>Business Type</span>
              <select
                value={form.business_type}
                onChange={(event) => onChange("business_type", event.target.value)}
              >
                <option value="">Select business type</option>
                {groups.map(({ category, types }) => (
                  <optgroup key={category} label={category}>
                    {types.length ? (
                      types.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))
                    ) : (
                      <option value={`unavailable:${category}`} disabled>
                        No business type configured yet
                      </option>
                    )}
                  </optgroup>
                ))}
                {unmapped.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="modal-two-grid">
            <label className="modal-field">
              <span>Barangay</span>
              <select
                value={form.barangay}
                onChange={(event) => onChange("barangay", event.target.value)}
              >
                <option value="">Select Barangay</option>
                {OFFICIAL_MAUBAN_BARANGAYS.map((bgy) => (
                  <option key={bgy} value={bgy}>
                    {bgy}
                  </option>
                ))}
              </select>
            </label>

            <label className="modal-field">
              <span>Contact Number</span>
              <input
                type="text"
                placeholder="0917 123 4567"
                value={form.contact_number}
                onChange={(event) => onChange("contact_number", event.target.value)}
              />
            </label>
          </div>

          <label className="modal-field full">
            <span>Complete Address</span>
            <input
              type="text"
              placeholder="e.g. Gomez St., Brgy. Daungan, Mauban, Quezon"
              value={form.address}
              onChange={(event) =>
                onChange("address", toTitleCase(event.target.value))
              }
            />
          </label>

          {isEditing ? (
            <label className="modal-field full">
              <span>Remarks</span>
              <input
                type="text"
                placeholder="Optional remarks"
                value={form.remarks}
                onChange={(event) => onChange("remarks", event.target.value)}
              />
            </label>
          ) : null}
        </section>

        <section className="establishment-form-section">
          <h3>Location / Reference</h3>
          <LocationPicker
            label="Establishment Map Pin"
            latitude={form.latitude}
            longitude={form.longitude}
            onChange={onChange}
          />
        </section>

        {isEditing ? (
          <section className="establishment-form-section permit-record">
            <h3>Sanitary Permit &amp; Compliance Record</h3>
            <p className="establishment-form-hint">
              Managed separately from the establishment profile. Only the values
              you change here are saved.
            </p>

            {!form.has_permit ? (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "14px",
                  fontSize: "12.5px",
                  color: "#92400e",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FiAlertTriangle
                  style={{ flexShrink: 0, fontSize: "16px", color: "#d97706" }}
                />
                <span>
                  This establishment will be flagged as{" "}
                  <strong>"No Permit / For Immediate Inspection"</strong> in
                  Sanitary GIS Map and Dashboard.
                </span>
              </div>
            ) : null}

            <div className="modal-two-grid">
              <label className="modal-field">
                <span>Has Permit?</span>
                <select
                  value={form.has_permit ? "yes" : "no"}
                  onChange={(event) => {
                    const hasPermit = event.target.value === "yes";
                    onChange("has_permit", hasPermit);

                    // Permit state only. Whether an establishment holds a
                    // permit is an administrative fact; its compliance status
                    // is an inspection finding and is left untouched here.
                    if (!hasPermit) {
                      onChange("permit_status", "no_permit");
                      onChange("permit_number", "");
                      onChange("permit_issued_date", "");
                      onChange("permit_expiry_date", "");
                    } else {
                      const todayStr = new Date().toISOString().slice(0, 10);
                      const endOfYearStr = `${new Date().getFullYear()}-12-31`;
                      onChange("permit_status", "active");
                      if (
                        !form.permit_number ||
                        form.permit_number.trim() === "" ||
                        form.permit_number.toLowerCase().includes("no permit")
                      ) {
                        onChange(
                          "permit_number",
                          generatePermitNumber(establishments, form.permit_size)
                        );
                      }
                      if (!form.permit_issued_date) {
                        onChange("permit_issued_date", todayStr);
                      }
                      if (!form.permit_expiry_date) {
                        onChange("permit_expiry_date", endOfYearStr);
                      }
                    }
                  }}
                >
                  <option value="yes">With Permit</option>
                  <option value="no">No Permit</option>
                </select>
              </label>

              <label className="modal-field">
                <span>Permit Status</span>
                <select
                  value={form.permit_status}
                  disabled={!form.has_permit}
                  onChange={(event) => onChange("permit_status", event.target.value)}
                >
                  {selectableStatuses(permitStatusOptions, form.permit_status).map(
                    (status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            <label className="modal-field full">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Permit Number</span>
                {form.has_permit && (
                  <button
                    type="button"
                    className="permit-gen-btn"
                    title="Generate new sequential permit number"
                    onClick={() => {
                      const newNum = generatePermitNumber(establishments, form.permit_size);
                      onChange("permit_number", newNum);
                    }}
                  >
                    ⚡ Auto-Generate
                  </button>
                )}
              </div>
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
                <span>Compliance Status</span>
                <select
                  value={form.compliance_status}
                  disabled={!form.has_permit}
                  onChange={(event) =>
                    onChange("compliance_status", event.target.value)
                  }
                >
                  {selectableStatuses(statusOptions, form.compliance_status).map(
                    (status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="modal-field">
                <span>Permit Coverage (SP / Large)</span>
                <select
                  value={form.permit_size}
                  onChange={(event) => onChange("permit_size", event.target.value)}
                >
                  {form.permit_size ? null : <option value="">Not set</option>}
                  <option value="sp">SP</option>
                  <option value="large">Large</option>
                </select>
              </label>
            </div>

            <p className="establishment-form-hint">
              Permit Coverage is an internal person-in-charge grouping for permit
              processing. It is not the physical size of the establishment.
            </p>
          </section>
        ) : (
          <section className="establishment-form-section permit-record">
            <h3>Sanitary Permit (optional)</h3>
            <p className="establishment-form-hint">
              If the establishment already holds a sanitary permit, record its
              number here. Leave it blank if it has none yet. A permit is valid
              for one year, so the expiry date defaults to one year after the
              date issued; you can change it.
            </p>

            <label className="modal-field full">
              <span>Sanitary Permit Number</span>
              <input
                type="text"
                placeholder="e.g. SP-2026-001"
                value={form.permit_number}
                onChange={(event) => onChange("permit_number", event.target.value)}
              />
            </label>

            <div className="modal-two-grid">
              <label className="modal-field">
                <span>Date Issued</span>
                <input
                  type="date"
                  value={form.permit_issued_date}
                  onChange={(event) => {
                    const issued = event.target.value;
                    const untouchedDefault =
                      !form.permit_expiry_date ||
                      form.permit_expiry_date === addOneYear(form.permit_issued_date);

                    onChange("permit_issued_date", issued);
                    if (untouchedDefault) {
                      onChange("permit_expiry_date", addOneYear(issued));
                    }
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Expiry Date</span>
                <input
                  type="date"
                  value={form.permit_expiry_date}
                  onChange={(event) =>
                    onChange("permit_expiry_date", event.target.value)
                  }
                />
              </label>
            </div>
          </section>
        )}

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
              : isEditing
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

/**
 * True when a display label and a real business type name are the same text,
 * ignoring casing and spacing, so unmapped types (and types that map to
 * themselves) are not shown twice in the detail modal header.
 */
function isSameBusinessTypeText(displayLabel, realName) {
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  return normalize(displayLabel) === normalize(realName);
}

function buildEstablishmentTimeline(
  establishment,
  inspections = [],
  complaints = [],
  renewals = []
) {
  const establishmentId = String(establishment.id);
  // Display label, matching the modal header, the table and the print report.
  const businessTypeText = businessTypeDisplayLabel(
    establishment.business_type_name
  );
  const rows = [
    {
      id: `establishment-${establishmentId}`,
      title: "Establishment record encoded",
      detail: `${businessTypeText || "Business"} in ${
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

function printEstablishmentReport(establishment, timeline, qrSvgHtml = "") {
  const printedAt = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(new Date());

  const verifyUrl = `${window.location.origin}/verify-permit/${establishment.id}`;

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
        <title>Sanitary Establishment Record - ${escapeHtml(establishment.business_name)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          .office { text-align: center; border-bottom: 2px solid #0f6b3f; padding-bottom: 14px; margin-bottom: 20px; }
          .office h1 { margin: 6px 0 2px; font-size: 20px; text-transform: uppercase; }
          .office p { margin: 2px 0; font-size: 12px; }
          h2 { margin: 0 0 14px; font-size: 18px; }
          
          .print-qr-banner {
            display: flex;
            align-items: center;
            gap: 18px;
            border: 2px solid #0f6b3f;
            border-radius: 8px;
            padding: 14px 18px;
            background: #f0fdf4;
            margin-bottom: 20px;
          }
          .print-qr-code {
            flex-shrink: 0;
            background: #ffffff;
            padding: 6px;
            border-radius: 6px;
            border: 1px solid #cbd5d1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .print-qr-code svg, .print-qr-code img {
            width: 115px;
            height: 115px;
            display: block;
          }
          .print-qr-details {
            flex: 1;
          }
          .print-qr-tag {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #065f46;
            letter-spacing: 0.5px;
          }
          .print-qr-title {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            margin: 2px 0 4px;
          }
          .print-qr-permit {
            font-size: 13px;
            color: #1e293b;
            margin-bottom: 4px;
          }
          .print-qr-details p {
            margin: 2px 0;
            font-size: 11px;
            color: #475569;
          }
          .print-qr-url {
            font-size: 10.5px;
            font-family: monospace;
            color: #0284c7;
            margin-top: 4px;
          }

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

        <div class="print-qr-banner">
          <div class="print-qr-code">
            ${
              qrSvgHtml ||
              `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encodeURIComponent(
                verifyUrl
              )}" width="115" height="115" alt="Permit QR Code" />`
            }
          </div>
          <div class="print-qr-details">
            <div class="print-qr-tag">Official Sanitary Verification QR Code</div>
            <div class="print-qr-title">${escapeHtml(establishment.business_name)}</div>
            <div class="print-qr-permit">
              Permit Number: <strong>${escapeHtml(
                establishment.permit_number ||
                  (establishment.has_permit ? "Active" : "No Permit on File")
              )}</strong>
            </div>
            <p>Scan with any mobile phone camera or the Mauban Citizen Mobile App to inspect real-time sanitary validity and official compliance records.</p>
            <div class="print-qr-url">${escapeHtml(verifyUrl)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="box"><span>Business Name</span><strong>${escapeHtml(
            establishment.business_name
          )}</strong></div>
          <div class="box"><span>Owner / Proprietor</span><strong>${escapeHtml(
            establishment.owner_name
          )}</strong></div>
          <div class="box"><span>Business Type</span><strong>${escapeHtml(
            businessTypeDisplayLabel(establishment.business_type_name)
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
