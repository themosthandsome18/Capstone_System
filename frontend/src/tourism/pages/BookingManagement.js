import { useEffect, useMemo, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiFilter,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiX,
} from "react-icons/fi";
import { useOutletContext } from "react-router-dom";
import { useTourismData } from "../context/TourismDataContext";

const pageSize = 10;

const initialForm = {
  full_name: "",
  email: "",
  contact_number: "",
  country_id: "",
  region_id: "",
  province_id: "",
  resort_id: "",
  itinerary_id: "",
  travel_mode_id: "",
  boat_type_id: "",
  visit_purpose_id: "",
  arrival_date: "",
  filipino_count: "0",
  foreigner_count: "0",
  total_male: "0",
  total_female: "0",
  age_0_7: "0",
  age_8_59: "0",
  age_60_above: "0",
};

const statusLabels = {
  pending: "Pending",
  arrived: "Arrived",
  no_show: "No-show",
};

const statusClassNames = {
  pending: "pending",
  arrived: "arrived",
  no_show: "noshow",
};

function BookingManagement() {
  const {
    touristRecords,
    referenceTables,
    createRecord,
    updateRecord,
    deleteRecord,
  } = useTourismData();

  const { addEntryRequestId } = useOutletContext() || {};

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tableError, setTableError] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState("");

  useEffect(() => {
    if (addEntryRequestId) {
      openAddRecord();
    }
  }, [addEntryRequestId]);

  function resolveLabel(collection = [], id, key = "id", valueKey = "name") {
    return (
      collection.find((item) => String(item[key]) === String(id))?.[valueKey] ||
      "--"
    );
  }

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return touristRecords.filter((record) => {
      const searchText = [
        record.survey_id,
        record.full_name,
        record.contact_number,
        resolveLabel(referenceTables.countries, record.country_id),
        resolveLabel(
          referenceTables.resorts,
          record.resort_id,
          "resort_id",
          "resort_name"
        ),
        statusLabels[record.status],
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedSearch);
    });
  }, [referenceTables, search, touristRecords]);

  const summary = useMemo(() => {
    return touristRecords.reduce(
      (totals, record) => ({
        verifiedEntries: totals.verifiedEntries + 1,
        arrived: totals.arrived + (record.status === "arrived" ? 1 : 0),
        noShow: totals.noShow + (record.status === "no_show" ? 1 : 0),
      }),
      { verifiedEntries: 0, arrived: 0, noShow: 0 }
    );
  }, [touristRecords]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  function openAddRecord() {
    setEditingRecord(null);
    setForm(initialForm);
    setFormError("");
    setIsAddOpen(true);
  }

  function openEditRecord(record) {
    setEditingRecord(record);

    setForm({
      full_name: record.full_name || "",
      email: record.email || "",
      contact_number: record.contact_number || "",
      country_id: String(record.country_id || ""),
      region_id: String(record.region_id || ""),
      province_id: String(record.province_id || ""),
      resort_id: String(record.resort_id || ""),
      itinerary_id: String(record.itinerary_id || ""),
      travel_mode_id: String(record.travel_mode_id || ""),
      boat_type_id: String(record.boat_type_id || ""),
      visit_purpose_id: String(record.visit_purpose_id || ""),
      arrival_date: record.arrival_date || "",
      filipino_count: String(record.filipino_count || 0),
      foreigner_count: String(record.foreigner_count || 0),
      total_male: String(record.total_male || 0),
      total_female: String(record.total_female || 0),
      age_0_7: String(record.age_0_7 || 0),
      age_8_59: String(record.age_8_59 || 0),
      age_60_above: String(record.age_60_above || 0),
    });

    setFormError("");
    setIsAddOpen(true);
  }

  function closeForm() {
    setIsAddOpen(false);
    setEditingRecord(null);
    setForm(initialForm);
    setFormError("");
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function buildPayload() {
    const filipinoCount = toInteger(form.filipino_count);
    const foreignerCount = toInteger(form.foreigner_count);
    const maubaninCount = 0;
    const totalVisitors = filipinoCount + foreignerCount + maubaninCount;

    return {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      contact_number: form.contact_number.trim(),
      country_id: Number(form.country_id),
      region_id: Number(form.region_id),
      province_id: Number(form.province_id),
      resort_id: Number(form.resort_id),
      itinerary_id: Number(form.itinerary_id),
      travel_mode_id: Number(form.travel_mode_id),
      boat_type_id: Number(form.boat_type_id),
      visit_purpose_id: Number(form.visit_purpose_id),
      arrival_date: form.arrival_date,
      filipino_count: filipinoCount,
      foreigner_count: foreignerCount,
      maubanin_count: maubaninCount,
      total_visitors: totalVisitors,
      total_male: toInteger(form.total_male),
      total_female: toInteger(form.total_female),
      special_group_count: 0,
      age_0_7: toInteger(form.age_0_7),
      age_8_59: toInteger(form.age_8_59),
      age_60_above: toInteger(form.age_60_above),
      status: editingRecord?.status || "pending",
    };
  }

  function validateTotals(payload) {
    const genderTotal = payload.total_male + payload.total_female;
    const ageTotal = payload.age_0_7 + payload.age_8_59 + payload.age_60_above;

    if (payload.total_visitors !== genderTotal) {
      return "Filipino + foreigner count must equal total male + total female.";
    }

    if (payload.total_visitors !== ageTotal) {
      return "Filipino + foreigner count must equal age 0-7 + age 8-59 + age 60+.";
    }

    return "";
  }

  function getErrorMessage(error) {
    if (error?.details?.detail) {
      return error.details.detail;
    }

    if (error?.details && typeof error.details === "object") {
      return Object.entries(error.details)
        .map(([field, messages]) => {
          const text = Array.isArray(messages) ? messages.join(" ") : messages;
          return `${field}: ${text}`;
        })
        .join(" ");
    }

    return error?.message || "Unable to save tourist record.";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = buildPayload();
    const totalsError = validateTotals(payload);

    if (totalsError) {
      setFormError(totalsError);
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editingRecord) {
        await updateRecord(editingRecord.survey_id, payload);
      } else {
        await createRecord(payload);
      }

      closeForm();
      setPage(1);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function updateBookingStatus(record, nextStatus) {
    setTableError("");
    setUpdatingStatus(`${record.survey_id}:${nextStatus}`);

    try {
      await updateRecord(record.survey_id, { status: nextStatus });
    } catch (error) {
      setTableError(getErrorMessage(error));
    } finally {
      setUpdatingStatus("");
    }
  }

  async function confirmDeleteRecord() {
    if (!deleteTarget) {
      return;
    }

    setSaving(true);
    setDeleteError("");

    try {
      await deleteRecord(deleteTarget.survey_id);
      setDeleteTarget(null);
      setPage(1);
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function formatDate(value) {
    if (!value) {
      return "--";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function handleExport() {
    const headers = [
      "Survey ID",
      "Guest",
      "Contact",
      "Country",
      "Pax",
      "Arrival",
      "Resort",
      "Status",
    ];

    const rows = filteredRows.map((record) => [
      record.survey_id,
      record.full_name,
      record.contact_number,
      resolveLabel(referenceTables.countries, record.country_id),
      record.total_visitors,
      record.arrival_date,
      resolveLabel(
        referenceTables.resorts,
        record.resort_id,
        "resort_id",
        "resort_name"
      ),
      statusLabels[record.status] || "Pending",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "booking-management.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="booking-page">
      <div className="booking-header">
        <div>
          <h1>Booking Management</h1>
          <p>Replace manual Google Forms with automated booking tracking</p>
        </div>

        <div className="booking-actions">
          <button type="button" className="outline-action" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>

      <div className="booking-status-grid">
        <div className="booking-status-card verified">
          <p>Verified Entries</p>
          <h2>{summary.verifiedEntries}</h2>
        </div>

        <div className="booking-status-card arrived">
          <p>Arrived</p>
          <h2>{summary.arrived}</h2>
        </div>

        <div className="booking-status-card noshow">
          <p>No-show</p>
          <h2>{summary.noShow}</h2>
        </div>
      </div>

      {tableError ? <p className="tourist-record-error">{tableError}</p> : null}

      <div className="booking-toolbar">
        <div className="booking-search">
          <FiSearch />
          <input
            type="search"
            placeholder="Search by name, contact, or booking ID..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <button type="button" className="btn-secondary">
          <FiFilter />
          Filter
        </button>
      </div>

      <div className="booking-table-card">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {[
                  "Guest",
                  "Contact",
                  "Country",
                  "Pax",
                  "Arrival",
                  "Nights",
                  "Resort",
                  "Status",
                  "Actions",
                ].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {paginatedRows.length ? (
                paginatedRows.map((row) => {
                  const status = row.status || "pending";
                  const statusLabel = statusLabels[status] || "Pending";

                  return (
                    <tr key={row.survey_id}>
                      <td>
                        <p className="booking-guest-name">{row.full_name}</p>
                        <p className="booking-id">{row.survey_id}</p>
                      </td>

                      <td>{row.contact_number}</td>

                      <td>
                        <strong>
                          {resolveLabel(referenceTables.countries, row.country_id)}
                        </strong>
                      </td>

                      <td>{row.total_visitors}</td>
                      <td>{formatDate(row.arrival_date)}</td>
                      <td>{row.total_visitors >= 5 ? 0 : 1}</td>

                      <td>
                        {resolveLabel(
                          referenceTables.resorts,
                          row.resort_id,
                          "resort_id",
                          "resort_name"
                        )}
                      </td>

                      <td>
                        <span
                          className={`booking-badge ${
                            statusClassNames[status] || "pending"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      <td>
                        <div className="booking-row-actions compact-actions">
                          <button
                            type="button"
                            className="booking-icon-btn edit"
                            disabled={Boolean(updatingStatus)}
                            onClick={() => openEditRecord(row)}
                            title="Edit record"
                            aria-label="Edit record"
                          >
                            <FiEdit2/>
                          </button>

                          <button
                            type="button"
                            className="booking-icon-btn delete"
                            disabled={Boolean(updatingStatus)}
                            onClick={() => {
                              setDeleteTarget(row);
                              setDeleteError("");
                            }}
                            title="Delete record"
                            aria-label="Delete record"
                          >
                            <FiTrash2/>
                          </button>

                          <button
                            type="button"
                            className="booking-icon-btn arrived"
                            disabled={status === "arrived" || Boolean(updatingStatus)}
                            onClick={() => updateBookingStatus(row, "arrived")}
                            title="Mark as arrived"
                            aria-label="Mark as arrived"
                          >
                            <FiCheck/>
                          </button>

                          <button
                            type="button"
                            className="booking-icon-btn noshow"
                            disabled={status === "no_show" || Boolean(updatingStatus)}
                            onClick={() => updateBookingStatus(row, "no_show")}
                            title="Mark as no-show"
                            aria-label="Mark as no-show"
                          >
                            <FiX/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: "center" }}>
                    No booking records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="booking-pagination">
        <p>
          Showing <strong>{paginatedRows.length}</strong> of{" "}
          <strong>{filteredRows.length}</strong> total records
        </p>

        <div className="pagination-actions">
          <button
            type="button"
            className={`booking-page-btn prev ${page === 1 ? "disabled" : ""}`}
            disabled={page === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <FiChevronLeft />
          </button>

          <button
            type="button"
            className={`booking-page-btn next ${
              page === totalPages ? "disabled" : ""
            }`}
            disabled={page === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            <FiChevronRight />
          </button>
        </div>
      </div>

      {isAddOpen ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <form
            className="tourist-record-form w-full max-w-[560px]"
            onSubmit={handleSubmit}
          >
            <h2 className="mb-6 text-xl font-extrabold text-black">
              {editingRecord ? "Edit Tourist Record" : "Add Tourist Record"}
            </h2>

            <div className="tourist-record-grid">
              <TextField
                label="Full Name"
                value={form.full_name}
                onChange={(value) => updateField("full_name", value)}
                required
              />

              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => updateField("email", value)}
              />

              <TextField
                label="Contact Number"
                type="tel"
                placeholder="+63..."
                value={form.contact_number}
                onChange={(value) => updateField("contact_number", value)}
                required
              />

              <SelectField
                label="Country"
                value={form.country_id}
                placeholder="Select country"
                options={referenceTables.countries}
                onChange={(value) => updateField("country_id", value)}
                required
              />

              <SelectField
                label="Region"
                value={form.region_id}
                placeholder="Select region"
                options={referenceTables.regions}
                onChange={(value) => updateField("region_id", value)}
                required
              />

              <SelectField
                label="Province"
                value={form.province_id}
                placeholder="Select province"
                options={referenceTables.provinces}
                onChange={(value) => updateField("province_id", value)}
                required
              />

              <SelectField
                label="Resort"
                value={form.resort_id}
                placeholder="Select resort"
                options={referenceTables.resorts}
                optionKey="resort_id"
                optionLabel="resort_name"
                onChange={(value) => updateField("resort_id", value)}
                required
              />

              <SelectField
                label="Itinerary"
                value={form.itinerary_id}
                placeholder="Select itinerary"
                options={referenceTables.itineraries}
                onChange={(value) => updateField("itinerary_id", value)}
                required
              />

              <SelectField
                label="Travel Mode"
                value={form.travel_mode_id}
                placeholder="Select mode"
                options={referenceTables.travelModes}
                onChange={(value) => updateField("travel_mode_id", value)}
                required
              />

              <SelectField
                label="Boat Type"
                value={form.boat_type_id}
                placeholder="Select boat"
                options={referenceTables.boatTypes}
                onChange={(value) => updateField("boat_type_id", value)}
                required
              />

              <SelectField
                label="Visit Purpose"
                value={form.visit_purpose_id}
                placeholder="Select purpose"
                options={referenceTables.visitPurposes}
                onChange={(value) => updateField("visit_purpose_id", value)}
                required
              />

              <TextField
                label="Arrival Date"
                type="date"
                value={form.arrival_date}
                onChange={(value) => updateField("arrival_date", value)}
                required
              />

              <NumberField
                label="Filipino Count"
                value={form.filipino_count}
                onChange={(value) => updateField("filipino_count", value)}
              />

              <NumberField
                label="Foreigner Count"
                value={form.foreigner_count}
                onChange={(value) => updateField("foreigner_count", value)}
              />

              <NumberField
                label="Total Male"
                value={form.total_male}
                onChange={(value) => updateField("total_male", value)}
              />

              <NumberField
                label="Total Female"
                value={form.total_female}
                onChange={(value) => updateField("total_female", value)}
              />

              <NumberField
                label="Age 0-7"
                value={form.age_0_7}
                onChange={(value) => updateField("age_0_7", value)}
              />

              <NumberField
                label="Age 8-59"
                value={form.age_8_59}
                onChange={(value) => updateField("age_8_59", value)}
              />

              <NumberField
                label="Age 60+"
                value={form.age_60_above}
                onChange={(value) => updateField("age_60_above", value)}
              />
            </div>

            {formError ? (
              <p className="tourist-record-error">{formError}</p>
            ) : null}

            <div className="tourist-record-actions">
              <button
                type="button"
                className="tourist-record-cancel"
                disabled={saving}
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="tourist-record-save"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingRecord
                  ? "Update Record"
                  : "Save Record"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <div className="delete-record-confirm w-full max-w-[420px]">
            <p>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.full_name}</strong>?
            </p>

            <p className="mt-2 text-xs text-slate-500">
              This will remove the tourist record from the backend.
            </p>

            {deleteError ? (
              <p className="tourist-record-error">{deleteError}</p>
            ) : null}

            <div className="delete-record-actions">
              <button
                type="button"
                className="tourist-record-cancel"
                disabled={saving}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-record-confirm-btn"
                disabled={saving}
                onClick={confirmDeleteRecord}
              >
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  min,
}) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder || label}
        required={required}
        min={min}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={onChange}
      required
      min="0"
    />
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options = [],
  optionKey = "id",
  optionLabel = "name",
  onChange,
  required = false,
}) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <select
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option[optionKey]} value={option[optionKey]}>
            {option[optionLabel]}
          </option>
        ))}
      </select>
    </label>
  );
}

export default BookingManagement;